import ConsumptionUtils from "./consumption-utils.js";
import DamageUtils from "./damage-utils.js";
import CanvasUtils from "./canvas-utils.js";
import FqConstants, {
    DEFAULT_MAX_ZEAL,
    ERROR_COLOR,
    OriginFQEffectLabel,
    OTHER_ROLL_COLOR,
    WARNING_COLOR
} from "./fq-constants.js";
import FxUtils from "./fx-utils.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";
import {socket} from "../../hook/socket-lib.js";

/**
 * Boîte à outils centrale du module : jets de dés, résolution des variables et
 * bonus d'une carte (X/Y, caractéristiques), application des effets de carte
 * (dégâts, soins, pioche, sbires, effets actifs, scripts), validations de jeu,
 * création de sbires et divers helpers (deep copy, id aléatoire, etc.).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class FQUtils {

    // TODO: A finir de dispatché pour tout ce qui n'est pas du utils genre applyCardEffect
    /**
     * Lance un jet de dés et attend le résultat, avec affichage optionnel dans le chat.
     *
     * @param {string|number} formula        - La formule de jet (convertie en chaîne).
     * @param {boolean}       [display=false] - Si true, publie le résultat dans un message de chat.
     *
     * @returns {Promise<number>} Le total du jet.
     */
    static async rollResultAsync(formula, display = false) {
        const roll = await new Roll(formula.toString()).evaluate();
        if (display === false) {
            return roll.total;
        }
        const msg = await roll.toMessage();
        if (game.dice3d && roll.isDeterministic === false) {
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }
        return roll.total;
    }

    /**
     * Génère un identifiant aléatoire alphanumérique en majuscules.
     *
     * @param {number} length - La longueur de l'identifiant à générer.
     *
     * @returns {string} L'identifiant aléatoire.
     */
    static generateRandomId(length) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters.charAt(randomIndex);
        }

        return result;
    }

    /**
     * Applique l'ensemble des effets d'une carte jouée : consommation des
     * ressources, jets de dégâts/soins, pioche, création de sbires selon les
     * emplacements choisis, exécution d'un script (`executeEval`), application des
     * formules d'effets, effets audiovisuels, application des PV aux cibles (via
     * socket MJ), affichage du résultat et journalisation.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {Card}   card        - La carte jouée.
     * @param {object} fd          - Les données du formulaire (emplacements de sbires, etc.).
     *
     * @returns {Promise<void>}
     */
    static async applyCardEffect(cardContent, card, fd) {
        let resultArray = [];

        if (cardContent) {
            ConsumptionUtils.consumeResources(cardContent, game.user?.character);
            if (cardContent.damage) {
                resultArray.push(...await DamageUtils.buildDamageDiceLauncher(game.user.character, cardContent));
            }
            if (cardContent.heal) {
                resultArray.push(...await DamageUtils.buildHealDiceLauncher(game.user.character, cardContent));
            }
            if (cardContent.draw) {
                card.parent.draw(card.source, cardContent.draw, {chatNotification: false, how: 2});
            }
            if (cardContent.minions && Array.isArray(cardContent.minions)) {
                for (const minion of cardContent.minions) {
                    if (fd.minionLeft) {
                        await FQUtils.createActor(minion, "left");
                        fd.minionLeft = false;
                    }
                    if (fd.minionUp) {
                        await FQUtils.createActor(minion, "up");
                        fd.minionUp = false;
                    }
                    if (fd.minionRight) {
                        await FQUtils.createActor(minion, "right");
                        fd.minionRight = false;
                    }
                    if (fd.minionDown) {
                        await FQUtils.createActor(minion, "down");
                        fd.minionDown = false;
                    }
                }
            }
            if (cardContent.executeEval) {
                // TODO refacto
                cardContent.executeEval = cardContent.executeEval?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");
                eval(cardContent.executeEval);
            }

            let cardMessages = FQUtils.translateMessages(cardContent.messages);
            if (cardContent.applyEffectsFormulas) {
                for (let i = 0; i < cardContent.applyEffectsFormulas.length; i++) {
                    const applyEffectsFormulas = cardContent.applyEffectsFormulas[i];
                    const message = await FQUtils.playApplyEffectsFormulas(applyEffectsFormulas, cardContent);
                    cardMessages = cardMessages.concat(message);
                }
            }

            const match = cardContent.damage.match(/\[([a-z]+)\]/i);
            await FxUtils.handleSpecialEffect(cardContent, resultArray, FqConstants.myToken, match ? match[1] : null);

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            DamageUtils.displayResult(game.user.character, resultArray, cardMessages);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent);
        } else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<div style='font-style: italic'>${game.i18n.localize("FQCARDENGINE.InfoMsgNoAddedEffect")}</div>`
            });
        }
    }


    /**
     * Construit les données d'effets actifs à partir d'un effet de carte :
     * numérise les valeurs, renseigne le nom et la durée, importe les macros
     * référencées et évalue les formules des changements (sauf bonus de
     * dégâts/soin conservés tels quels).
     *
     * @param {object}   currentEffect       - L'effet source.
     * @param {object[]} currentEffect.data  - Les données d'effet à transformer.
     *
     * @returns {Promise<object[]>} Les données d'effets actifs prêtes à être créées.
     */
    static async createEffectsFromData(currentEffect) {
        return Promise.all(currentEffect.data.map(async effect => {
            effect = await FQUtils.numerizeEffectObjValue(effect);
            if (!effect.name) {
                effect.name = effect.label;
            }
            if (effect.duration) {
                const {startTime, rounds, turns} = effect.duration;
                effect.startTime = startTime;
                effect.rounds = rounds;
                effect.origin = OriginFQEffectLabel;
                effect.turns = turns;
            }
            for (let changeKey in effect.changes) {
                if (effect.changes[changeKey].key === "macro.execute") {
                    await FxUtils.importMacroFromCompendium(effect.changes[changeKey].value);
                }
                let value = effect.changes[changeKey].value;
                // TODO constantes ?
                if (!["system.fq.bonus.damage", "system.fq.bonus.heal"].includes(effect.changes[changeKey].key)) {
                    try {
                        // TODO A factoriser?
                        const roll = await new Roll(effect.changes[changeKey].value.toString()).evaluate();
                        if (!roll) {
                            throw new Error();
                        }
                        value = Number(roll.total);
                    } catch (e) {
                        value = effect.changes[changeKey].value;
                    }
                }
                effect.changes[changeKey].value = value;
            }
            return effect;
        }));
    }

    /**
     * Réécrit les contenus (choix) d'une carte en fusionnant `newValue`, en
     * appliquant l'éventuel état `afterFirstPlay`, puis met à jour la carte et
     * la retourne pour forcer son rafraîchissement.
     *
     * @param {Card}     card         - La carte à mettre à jour.
     * @param {object[]} cardContents - Les contenus (choix) d'origine.
     * @param {object}   newValue     - Les valeurs à fusionner dans chaque choix.
     *
     * @returns {void}
     */
    static rewriteCardContent(card, cardContents, newValue) {
        //TODO pour le moment réécris chaque choix, à voir si on le fait que par choix
        cardContents = cardContents.map(content => {
            if (content.afterFirstPlay) {
                content = JSON.parse(content.afterFirstPlay);
            }
            return (FQUtils.stringifyObjValue({...content, ...newValue}));
        });
        card.update({
            "system.fq.choices": cardContents
        });
        //TODO peut mieux faire pour rafraichir le carte
        card.flip().then(() => card.flip(0));
    }

    /**
     * Convertit récursivement toutes les valeurs primitives d'un objet en chaînes
     * de caractères (les objets imbriqués sont traités récursivement).
     *
     * @param {object} cardContent - L'objet dont les valeurs sont converties.
     *
     * @returns {object} Le même objet avec ses valeurs converties en chaînes.
     */
    static stringifyObjValue(cardContent) {
        for (const key in cardContent) {
            if (cardContent.hasOwnProperty(key)) {
                if (typeof cardContent[key] === "object") {
                    cardContent[key] = FQUtils.stringifyObjValue(cardContent[key]);
                } else {
                    cardContent[key] = cardContent[key]?.toString();
                }
            }
        }
        return cardContent;
    }

    /**
     * Convertit récursivement les valeurs d'un effet : nombres numérisés, chaînes
     * commençant par « + » laissées telles quelles, autres chaînes évaluées comme
     * des jets de dés.
     *
     * @param {object} content - L'objet effet dont les valeurs sont transformées.
     *
     * @returns {Promise<object>} Le même objet avec ses valeurs numérisées/évaluées.
     */
    static async numerizeEffectObjValue(content) {
        for (const key in Object.values(content)) {
            if (content.hasOwnProperty(key)) {
                if (typeof content[key] === "object") {
                    content[key] = await FQUtils.numerizeEffectObjValue(content[key]);
                } else if (!isNaN(content[key])) {
                    content[key] = Number(content[key]);
                } else if (typeof content[key] === "string" && content[key][0] === "+") {
                    // Do nothing TODO: peut être géré dans une fonction (form()) par exemple
                } else {
                    try {
                        content[key] = await FQUtils.rollResultAsync(content[key]);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        }
        return content;
    }


    //Display damage dices and manual actions
    /**
     * Évalue la formule d'une « formule d'effets » : si le résultat du jet
     * correspond à un effet, crée les effets actifs associés (sur soi ou sur les
     * cibles via socket MJ) et publie le message de succès. Retourne les messages
     * traduits de l'effet déclenché.
     *
     * @param {object} applyEffectsFormulas - La formule d'effets (`formula`, `title`, `effects`).
     * @param {object} cardContent          - Le contenu (choix) de la carte (portée, type de cible…).
     *
     * @returns {Promise<string[]>} Les messages traduits de l'effet déclenché (vide si aucun).
     */
    static async playApplyEffectsFormulas(applyEffectsFormulas, cardContent) {
        const roll = await new Roll(applyEffectsFormulas.formula).evaluate();
        for (let i = 0; i < applyEffectsFormulas.effects.length; i++) {
            applyEffectsFormulas.effects[i].result = await FQUtils.rollResultAsync(applyEffectsFormulas.effects[i].result);
        }

        let effectMessages = null;
        let message = `<h2 style='color: ${OTHER_ROLL_COLOR}'>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulas",
            {applyEffectsFormulasTitle: applyEffectsFormulas.title})}`;
        if (applyEffectsFormulas.effects && applyEffectsFormulas.effects.map(effect => effect.result).includes(roll.total)) {
            const currentEffectData = applyEffectsFormulas.effects.find(effect => effect.result === roll.total);
            message += `: <b>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulasSuccess")}</b> `;
            effectMessages = FQUtils.translateMessages(currentEffectData.messages);
            const effects = await FQUtils.createEffectsFromData(currentEffectData);
            for (const effectsKey in effects) {
                if (!currentEffectData.self && (cardContent?.minReach || cardContent?.maxReach ||
                    cardContent.targetType === CardFqSystem.TARGET_TYPE_SKELETON)) {
                    const myTargets = FqConstants.myTargets(cardContent.targetType);
                    for (let i = 0; i < myTargets.length; i++) {
                        await socket.executeAsGM("addEffectForTarget", effects[effectsKey], myTargets[i].id);
                    }
                } else {
                    ActiveEffect.implementation.create(effects[effectsKey], {parent: game.user.character});
                }
            }
        }

        message += `</h2>`;

        const msg = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
            flavor: message
        });

        if (game.dice3d && roll.isDeterministic === false) {
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }
        return effectMessages ? effectMessages : [];
    }

    /**
     * Traduit (localise et formate) une liste de messages définis par une clé et
     * des arguments JSON optionnels.
     *
     * @param {object[]} messages       - Les messages à traduire.
     * @param {string}   messages[].key - La clé de localisation.
     * @param {string}   [messages[].arg] - Les arguments de formatage au format JSON.
     *
     * @returns {string[]} Les messages traduits.
     */
    static translateMessages(messages) {
        let translations = [];
        if (messages) {
            messages.forEach(message => {
                translations.push(game.i18n.format(message.key,
                    message?.arg ? JSON.parse(message?.arg) : {}));
            });
        }
        return translations;
    }

    /**
     * Résout par des jets de dés toutes les valeurs dynamiques d'un contenu de
     * carte : portées (avec bonus de portée de l'acteur), nombre de cibles, coûts
     * (hp, action, mana, zeal, pioche, défausse) et bonus (critique, esquive).
     * Mute `cardContent` sur place.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte à préparer.
     *
     * @returns {Promise<void>}
     */
    static async prepareDataFromCard(cardContent) {
        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            cardContent.minReach = await FQUtils.rollResultAsync(cardContent.minReach);
            cardContent.maxReach = await FQUtils.rollResultAsync(cardContent.maxReach) + Number(FqConstants.actorFQ.bonus.range);
        }
        if (cardContent?.nbTargets) {
            cardContent.nbTargets = await FQUtils.rollResultAsync(cardContent.nbTargets);
        }

        // COST HP
        if (cardContent?.hp) {
            cardContent.hp = await FQUtils.rollResultAsync(cardContent.hp);
        }

        // COST ACTION
        if (cardContent?.action) {
            cardContent.action = await FQUtils.rollResultAsync(cardContent.action);
        }

        // COST MANA
        if (cardContent?.mana) {
            cardContent.mana = await FQUtils.rollResultAsync(cardContent.mana);
        }

        // COST ZEAL
        if (cardContent?.zeal) {
            cardContent.zeal = await FQUtils.rollResultAsync(cardContent.zeal);
        }

        // COST DRAW
        if (cardContent?.draw) {
            cardContent.draw = await FQUtils.rollResultAsync(cardContent.draw);
        }
        // COST DROP
        if (cardContent?.drop) {
            cardContent.drop = await FQUtils.rollResultAsync(cardContent.drop);
        }

        // BONUSES
        if (cardContent.bonusCrit) {
            cardContent.bonusCrit = await FQUtils.rollResultAsync(cardContent.bonusCrit);
        }
        if (cardContent.bonusEva) {
            cardContent.bonusEva = await FQUtils.rollResultAsync(cardContent.bonusEva);
        }
    }

    //Display damage dices
    /**
     * Vérifie l'ensemble des conditions permettant de jouer une carte : scripts
     * d'évaluation personnalisés, règles de rejouabilité et de réactivité en
     * combat, portée vers les cibles, disponibilité de la pioche et ressources
     * suffisantes. Publie un avertissement pour chaque condition non remplie.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte, déjà préparé.
     * @param {Card}   card        - La carte concernée.
     *
     * @returns {boolean} True si la carte peut être jouée, false sinon.
     */
    static checkIfCanUseCard(cardContent, card) {

        if (cardContent.customEvals && Array.isArray(cardContent.customEvals)) {
            let iscustomEvals = true;
            cardContent.customEvals.forEach(customEval => {
                // TODO Encore necessaire après refacto?
                customEval.script = customEval.script?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");

                // Contrôle de la carte personnalisée
                if (customEval.script) {
                    try {
                        if (!eval(customEval.script)) {
                            let cardMessages = FQUtils.translateMessages(customEval.errorMessages);
                            if (cardMessages?.length) {
                                cardMessages.forEach(warningMsg => {
                                    ChatMessage.create({
                                        speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                                        content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>${warningMsg}</span>`
                                    });
                                });
                            } else {
                                ChatMessage.create({
                                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                                        ${game.i18n.localize("FQCARDENGINE.WarningMsgCardConditionNotMet")}</span>`
                                });
                            }
                            iscustomEvals = false;
                        }
                    } catch (e) {
                        console.error(e);
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                            content: `<span style='color: ${ERROR_COLOR}; font-style: italic'>
                            ${game.i18n.localize("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition")}</span>`
                        });
                    }
                }
            });
            if (!iscustomEvals) {
                return false;
            }
        }

        if (game.combat != null) {
            if (cardContent?.replayable === "passif" && cardContent?.hasBeenPlayed && cardContent?.passivePlayedRound === game.combat?.round.toString()) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                       ${game.i18n.localize("FQCARDENGINE.WarningMsgPassiveSpellAlreadyUsed")}</span>`
                });
                return false;
            }
            // S'agit t-il d'un sort réactive et peut on la jouer?
            if (cardContent && !cardContent.reactive && !ConsumptionUtils.validateUseSpellInTurn(game.user?.character)) {
                return false;
            } else if (cardContent?.reactive && (!game.combat || game.combat.combatant.actor?.id === game.user?.character?.id)) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
            ${game.i18n.localize("FQCARDENGINE.WarningMsgPlayReactiveCard")}</span>`
                });
                return false;
            }
        }

        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            if (!ConsumptionUtils.checkIfCanCardCanReachTargets(
                game.user.character,
                cardContent.nbTargets,
                cardContent.minReach,
                cardContent.maxReach,
                cardContent.targetType)
            ) {
                return false;
            }
        }

        // COST DRAW
        if (cardContent?.draw) {
            if ((card.source.cards.size - card.source.drawnCards.length) < cardContent.draw) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDraw"), game.user.character);
                return false;
            }
        }

        return ConsumptionUtils.checkResources(cardContent, game.user.character);
    }


    /**
     * Remplace récursivement les variables `XXX` et `YYY` par leurs valeurs dans
     * toutes les chaînes d'un contenu de carte. Mute `cardContent` sur place.
     *
     * @param {object}        cardContent - Le contenu (choix) de la carte.
     * @param {string|number} XXX         - La valeur de substitution pour `XXX`.
     * @param {string|number} YYY         - La valeur de substitution pour `YYY`.
     *
     * @returns {void}
     */
    static recalculatedWithWYValue(cardContent, XXX, YYY) {
        const keys = Object.keys(cardContent);
        keys.forEach(k => {
            if (cardContent[k] && typeof cardContent[k] === "object") FQUtils.recalculatedWithWYValue(cardContent[k], XXX, YYY);
            else if (typeof cardContent[k] === "string") {
                cardContent[k] = cardContent[k].replaceAll("XXX", XXX).replaceAll("YYY", YYY);
            }
        });
    }

    /**
     * Remplace récursivement, dans toutes les chaînes d'un contenu de carte, les
     * références de caractéristiques (@str, @dex…) par le modificateur de l'acteur.
     * Mute `cardContent` sur place.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {void}
     */
    static replaceCardContentAbilitiesBonus(cardContent) {
        const keys = Object.keys(cardContent);
        keys.forEach(k => {
            if (cardContent[k] && typeof cardContent[k] === "object") FQUtils.replaceCardContentAbilitiesBonus(cardContent[k]);
            else if (typeof cardContent[k] === "string") {
                cardContent[k] = FQUtils.replaceAbilitiesBonus(cardContent[k]);
            }
        });
    }

    /**
     * Remplace dans une chaîne les références de caractéristiques (@str, @dex,
     * @con, @int, @wis, @cha) par le modificateur correspondant du personnage.
     *
     * @param {string} str - La chaîne contenant d'éventuelles références.
     *
     * @returns {string} La chaîne avec les modificateurs substitués.
     */
    static replaceAbilitiesBonus(str) {
        return str.replaceAll("@str", FqConstants.actorAbi.str.mod.toString())
            .replaceAll("@dex", FqConstants.actorAbi.dex.mod.toString())
            .replaceAll("@con", FqConstants.actorAbi.con.mod.toString())
            .replaceAll("@int", FqConstants.actorAbi.int.mod.toString())
            .replaceAll("@wis", FqConstants.actorAbi.wis.mod.toString())
            .replaceAll("@cha", FqConstants.actorAbi.cha.mod.toString());
    }

    /**
     * Indique si une chaîne référence une caractéristique dont le modificateur du
     * personnage est positif (sert à décider d'afficher un indicateur de bonus).
     *
     * @param {string} str - La chaîne à inspecter.
     *
     * @returns {boolean} True si au moins une caractéristique référencée a un modificateur > 0.
     */
    static hasAbilitiesBonus(str) {
        return (str.includes("@str") && FqConstants.actorAbi.str.mod > 0) ||
         (str.includes("@dex") && FqConstants.actorAbi.dex.mod > 0) ||
         (str.includes("@con") && FqConstants.actorAbi.con.mod > 0) ||
         (str.includes("@int") && FqConstants.actorAbi.int.mod > 0) ||
         (str.includes("@wis") && FqConstants.actorAbi.wis.mod > 0) ||
         (str.includes("@cha") && FqConstants.actorAbi.cha.mod > 0);
    }

    /**
     * Valide et applique les valeurs X et Y d'une carte : résout les bornes
     * (xmax/ymax), vérifie que XXX/YYY respectent les min/max (avertit sinon),
     * puis substitue les variables — soit par les valeurs saisies, soit par des
     * valeurs calculées (cibles, portée, système du personnage).
     *
     * @param {object}  cardContent  - Le contenu (choix) de la carte.
     * @param {boolean} hasVariables - True si l'utilisateur a saisi des valeurs X/Y.
     * @param {number}  XXX          - La valeur X saisie.
     * @param {number}  YYY          - La valeur Y saisie.
     *
     * @returns {Promise<boolean>} True si les valeurs sont valides et appliquées, false sinon.
     */
    static async replaceCardContentXAndYValue(cardContent, hasVariables, XXX, YYY) {
        //Recalculate xmax and ymax before checking it and replace XXX and YYY value
        //The others value are recalculated in checkIfCanUseCardAndPrepareDataFromIt
        if (cardContent?.xmax) {
            cardContent.xmax = await FQUtils.rollResultAsync(cardContent.xmax);
        }
        if (cardContent?.ymax) {
            cardContent.ymax = await FQUtils.rollResultAsync(cardContent.ymax);
        }

        if (cardContent?.xmax) {
            if (XXX > Number(cardContent?.xmax) || XXX < 0) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgXValueSuperiorXMax", {xmax: cardContent.xmax})}</span>`
                });
                return false;
            }
        }

        if (cardContent?.xmin && XXX < Number(cardContent?.xmin)) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgXValueInferiorXMin", {xmin: cardContent.xmin})}</span>`
            });
            return false;
        }

        if (cardContent?.ymax) {
            if (YYY > Number(cardContent?.ymax) || YYY < 0) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                      ${game.i18n.format("FQCARDENGINE.WarningMsgYValueSuperiorYMax", {ymax: cardContent.ymax})}</span>`
                });
                return false;
            }
        }

        if (cardContent?.ymin && XXX < Number(cardContent?.ymin)) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgYValueInferiorYMin", {ymin: cardContent.ymin})}</span>`
            });
            return false;
        }

        if (hasVariables) {
            FQUtils.recalculatedWithWYValue(cardContent, XXX ? XXX : 0, YYY ? YYY : 0);
        } else if (cardContent && (cardContent.xvalue || cardContent.yvalue)) {
            FQUtils.recalculatedWithWYValue(cardContent, await FQUtils.getXYValue(cardContent.xvalue, FqConstants.myTargets(cardContent.targetType)),
                await FQUtils.getXYValue(cardContent.yvalue, FqConstants.myTargets(cardContent.targetType)));
        }
        return true;
    }

    /**
     * Calcule la valeur d'une variable X ou Y selon son mot-clé : nombre de
     * cibles, distance jusqu'à l'unique cible, résultat d'un script (`SCRIPT:`),
     * ou attribut du système du personnage.
     *
     * @param {string}   value     - Le mot-clé/expression décrivant la valeur à calculer.
     * @param {object[]} myTargets - Les cibles courantes.
     *
     * @returns {Promise<number>} La valeur calculée.
     */
    static async getXYValue(value, myTargets) {
        if (value === "nbTargets") {
            return myTargets.length ? myTargets.length : 0;
        } else if (myTargets.length === 1 && value === "reach") {
            const myToken = game.canvas?.scene?.tokens?.find(t => t.actorId === game.user?.character?.id);
            const target = myTargets[0].document;
            return CanvasUtils.getMinDistanceBetweenTwoToken(myToken.x, myToken.y, target.x, target.y,
                myToken.width, target.width, myToken.height, target.height);
        } else if (value.startsWith("SCRIPT:")) {
            // TODO A voir si on fait mieux et on protège
            return eval(value.substring(7));
        } else {
            // Sinon ça concerne le systeme du personnage
            return FQUtils.getNestedAttribute(game.user.character?.system, value);
        }
    }

    /**
     * Récupère une valeur imbriquée d'un objet via un chemin pointé (ex.
     * « attributes.hp.value ») puis l'évalue comme un jet de dés.
     *
     * @param {object} obj - L'objet racine (typiquement `system` du personnage).
     * @param {string} key - Le chemin pointé de l'attribut.
     *
     * @returns {Promise<number>} La valeur évaluée, ou 0 si le chemin est absent/vide.
     */
    static async getNestedAttribute(obj, key) {
        if (!key) {
            return 0;
        }
        const keys = key.split(".");
        let value = obj;
        for (const k of keys) {

            if (value.hasOwnProperty(k)) {
                value = value[k];
            } else {
                return 0;
            }
        }
        return await FQUtils.rollResultAsync(value.toString());
    }

    /**
     * Crée un sbire (minion) : s'assure de l'existence du dossier temporaire
     * (créé côté MJ si besoin), puis prépare et instancie l'acteur.
     *
     * @param {object} minion   - Les données du sbire à créer.
     * @param {string} location - La direction d'apparition adjacente (« left », « right », « up », « down »).
     *
     * @returns {Promise<void>}
     */
    static async createActor(minion, location) {
        if (!FQUtils.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        await FQUtils.createActorData(minion, location);

    }

    /**
     * Construit les données d'un sbire à partir du compendium des sbires, applique
     * les surcharges éventuelles (PV, critique, esquive, action, mana, zèle,
     * bonus, déplacement), attribue la propriété au joueur, puis délègue la
     * création de l'acteur et de son token au MJ via socket.
     *
     * @param {object} minion   - Les données du sbire (`name`, `data`…).
     * @param {string} location - La direction d'apparition adjacente.
     *
     * @returns {Promise<void>}
     */
    static async createActorData(minion, location) {
        const minionPack = await game.packs.get(FqCardEngineModule.moduleName + ".minions-fq8").getDocuments();

        let actorData = JSON.parse(JSON.stringify(minionPack.find(m => m.name === minion?.name)));

        if (actorData) {
            actorData.folder = FQUtils.getTempActorFolder().id;
            actorData.name = actorData.name + "_" + Math.floor(Math.random() * 1000000);
            if (minion.data) {
                if (minion.data.hp) {
                    actorData.system.attributes.hp.max = await FQUtils.rollResultAsync(minion.data.hp);
                    actorData.system.attributes.hp.value = await FQUtils.rollResultAsync(minion.data.hp);
                }
                if (minion.data.critical) {
                    actorData.system.fq.attributes.critical = await FQUtils.rollResultAsync(minion.data.critical);
                }
                if (minion.data.evasion) {
                    actorData.system.fq.attributes.evasion = await FQUtils.rollResultAsync(minion.data.evasion);
                }
                if (minion.data.action) {
                    actorData.system.fq.action.max = await FQUtils.rollResultAsync(minion.data.action);
                    actorData.system.fq.action.value = await FQUtils.rollResultAsync(minion.data.action);
                }
                if (minion.data.mana) {
                    actorData.system.fq.mana.max = await FQUtils.rollResultAsync(minion.data.mana);
                    actorData.system.fq.mana.value = await FQUtils.rollResultAsync(minion.data.mana);
                }
                if (minion.data.zeal) {
                    actorData.system.fq.zeal.max = DEFAULT_MAX_ZEAL;
                    actorData.system.fq.zeal.value = await FQUtils.rollResultAsync(minion.data.zeal);
                }
                if (minion.data.damageBonus) {
                    actorData.system.fq.bonus.damage = await FQUtils.rollResultAsync(minion.data.damageBonus);
                }
                if (minion.data.healBonus) {
                    actorData.system.fq.bonus.heal = await FQUtils.rollResultAsync(minion.data.healBonus);
                }
                if (minion.data.movement) {
                    actorData.system.attributes.movement.walk = await FQUtils.rollResultAsync(minion.data.movement);
                }
            }
            actorData.ownership[game.userId] = 3;

            await socket.executeAsGM("createActorFromData", actorData, game.userId, location);
        }
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés ET libres (non
     * occupés) parmi les quatre directions.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements valides sélectionnés (0 à 4).
     */
    static getNbValideMinionLocationSelected(fd) {
        return (fd.minionUp && !CanvasUtils.locationIsOccupied("up") ? 1 : 0) +
            (fd.minionDown && !CanvasUtils.locationIsOccupied("down") ? 1 : 0) +
            (fd.minionLeft && !CanvasUtils.locationIsOccupied("left") ? 1 : 0) +
            (fd.minionRight && !CanvasUtils.locationIsOccupied("right") ? 1 : 0);
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés parmi les quatre
     * directions, qu'ils soient libres ou non.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements sélectionnés (0 à 4).
     */
    static getNbMinionLocationSelected(fd) {
        return (fd.minionUp ? 1 : 0) +
            (fd.minionDown ? 1 : 0) +
            (fd.minionLeft ? 1 : 0) +
            (fd.minionRight ? 1 : 0);
    }


    /**
     * Retourne le dossier d'acteurs temporaire (nommé « Temporaire »), s'il existe.
     *
     * @returns {object|undefined} Le dossier « Temporaire », ou undefined.
     */
    static getTempActorFolder() {
        return game.folders.find(fol => fol.type === "Actor" && fol.name === "Temporaire");
    }

    /**
     * Crée le dossier d'acteurs temporaire « Temporaire ». Exécutée côté MJ via socket.
     *
     * @returns {Promise<void>}
     */
    static async createTempFold() {
        await Folder.create({
            name: "Temporaire", type: "Actor"
        });
    }

    /**
     * Effectue une copie profonde d'une valeur (objets et tableaux inclus). Les
     * primitives sont retournées telles quelles.
     *
     * @param {*} obj - La valeur à copier.
     *
     * @returns {*} Une copie profonde de la valeur.
     */
    static deepCopy(obj) {
        if (obj === null || typeof obj !== "object") return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => FQUtils.deepCopy(item));
        }

        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, FQUtils.deepCopy(value)])
        );
    }

    /**
     * MUST BE EXECUTE AS A GM
     * Retourne un chemin de fichier aléatoire depuis un dossier virtuel de Foundry
     * @param {string} folderPath - Le chemin virtuel (ex: "modules/mon-module/images")
     * @returns {Promise<string|null>}
     */
    static async getRandomFileFromFolder(folderPath) {
        try {
            const response = await foundry.applications.apps.FilePicker.implementation.browse("data", folderPath);

            if (!response.files.length) return null;

            const randomIndex = Math.floor(Math.random() * response.files.length);
            return response.files[randomIndex];
        } catch (err) {
            console.error("Erreur lors du browse :", err);
            return null;
        }
    }
}