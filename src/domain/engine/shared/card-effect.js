import ResourceHandler from "./resource-handler.js";
import Damage from "../roll/damage.js";
import RollService from "../roll/roll-service.js";
import Minion from "./minion.js";
import Geometry from "./geometry.js";
import Constants, {
    OriginFQEffectLabel,
    OTHER_ROLL_COLOR
} from "../../constants.js";
import Fx from "./fx.js";
import {createWarning} from "../../../core/utils/chat.utils.js";
import {ERROR_COLOR} from "../../../core/constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {socket} from "../../../hook/integration/socketlib.hook.js";

/**
 * Résolution et application des effets d'une carte : variables et bonus (X/Y,
 * caractéristiques), jets de dégâts/soins, pioche, sbires, effets actifs,
 * scripts, validations de jeu et calcul des valeurs dynamiques du contenu.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class CardEffect {

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
        // Collecteur local des animations Dice So Nice de ce jet de carte : créé à la
        // volée et passé aux méthodes de jet. Chaque dé y dépose sa promesse d'animation
        // sans l'attendre → tous les dés partent simultanément à l'écran.
        const dsnAnimations = [];

        if (cardContent) {
            ResourceHandler.consumeResources(cardContent, game.user?.character);
            if (cardContent.damage) {
                resultArray.push(...await Damage.buildDamageDiceLauncher(game.user.character, cardContent, dsnAnimations));
            }
            if (cardContent.heal) {
                resultArray.push(...await Damage.buildHealDiceLauncher(game.user.character, cardContent, dsnAnimations));
            }
            if (cardContent.draw) {
                card.parent.draw(card.source, cardContent.draw, {chatNotification: false, how: 2});
            }
            if (cardContent.minions && Array.isArray(cardContent.minions)) {
                for (const minion of cardContent.minions) {
                    if (fd.minionLeft) {
                        await Minion.createActor(minion, "left");
                        fd.minionLeft = false;
                    }
                    if (fd.minionUp) {
                        await Minion.createActor(minion, "up");
                        fd.minionUp = false;
                    }
                    if (fd.minionRight) {
                        await Minion.createActor(minion, "right");
                        fd.minionRight = false;
                    }
                    if (fd.minionDown) {
                        await Minion.createActor(minion, "down");
                        fd.minionDown = false;
                    }
                }
            }
            if (cardContent.executeEval) {
                cardContent.executeEval = cardContent.executeEval?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");
                eval(cardContent.executeEval);
            }

            let cardMessages = CardEffect.translateMessages(cardContent.messages);
            if (cardContent.applyEffectsFormulas) {
                for (let i = 0; i < cardContent.applyEffectsFormulas.length; i++) {
                    const applyEffectsFormulas = cardContent.applyEffectsFormulas[i];
                    const message = await CardEffect.playApplyEffectsFormulas(applyEffectsFormulas, cardContent);
                    cardMessages = cardMessages.concat(message);
                }
            }

            const match = cardContent.damage.match(/\[([a-z]+)\]/i);
            await Fx.handleSpecialEffect(cardContent, resultArray, Constants.myToken, match ? match[1] : null);

            // On attend ICI, une seule fois, que TOUTES les animations Dice So Nice
            // du jet soient terminées (les dés sont partis simultanément plus haut),
            // juste avant d'infliger les PV et d'afficher le récap → affichage cohérent.
            await Promise.all(dsnAnimations);

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            Damage.displayResult(game.user.character, resultArray, cardMessages);
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
            effect = await CardEffect.numerizeEffectObjValue(effect);
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
                    await Fx.importMacroFromCompendium(effect.changes[changeKey].value);
                }
                let value = effect.changes[changeKey].value;
                if (!["system.fq.bonus.damage", "system.fq.bonus.heal"].includes(effect.changes[changeKey].key)) {
                    try {
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
     * appliquant l'éventuel état `afterFirstPlay`, puis met à jour la carte. La
     * mise à jour de `system.fq.choices` déclenche le hook `updateCard` qui
     * rafraîchit la main.
     *
     * @param {Card}     card         - La carte à mettre à jour.
     * @param {object[]} cardContents - Les contenus (choix) d'origine.
     * @param {object}   newValue     - Les valeurs à fusionner dans chaque choix.
     *
     * @returns {void}
     */
    static rewriteCardContent(card, cardContents, newValue) {
        cardContents = cardContents.map(content => {
            if (content.afterFirstPlay) {
                content = JSON.parse(content.afterFirstPlay);
            }
            return (CardEffect.stringifyObjValue({...content, ...newValue}));
        });
        card.update({
            "system.fq.choices": cardContents
        });
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
                    cardContent[key] = CardEffect.stringifyObjValue(cardContent[key]);
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
                    content[key] = await CardEffect.numerizeEffectObjValue(content[key]);
                } else if (!isNaN(content[key])) {
                    content[key] = Number(content[key]);
                } else if (typeof content[key] === "string" && content[key][0] === "+") {
                    // Do nothing
                } else {
                    try {
                        content[key] = await RollService.rollResultAsync(content[key]);
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
        Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
        for (let i = 0; i < applyEffectsFormulas.effects.length; i++) {
            applyEffectsFormulas.effects[i].result = await RollService.rollResultAsync(applyEffectsFormulas.effects[i].result);
        }

        let effectMessages = null;
        let message = `<h2 style='color: ${OTHER_ROLL_COLOR}'>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulas",
            {applyEffectsFormulasTitle: applyEffectsFormulas.title})}`;
        if (applyEffectsFormulas.effects && applyEffectsFormulas.effects.map(effect => effect.result).includes(roll.total)) {
            const currentEffectData = applyEffectsFormulas.effects.find(effect => effect.result === roll.total);
            message += `: <b>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulasSuccess")}</b> `;
            effectMessages = CardEffect.translateMessages(currentEffectData.messages);
            const effects = await CardEffect.createEffectsFromData(currentEffectData);
            for (const effectsKey in effects) {
                if (!currentEffectData.self && (cardContent?.minReach || cardContent?.maxReach ||
                    cardContent.targetType === CardFqSystem.TARGET_TYPE_SKELETON)) {
                    const myTargets = Constants.myTargets(cardContent.targetType);
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
            cardContent.minReach = await RollService.rollResultAsync(cardContent.minReach);
            cardContent.maxReach = await RollService.rollResultAsync(cardContent.maxReach) + Number(Constants.actorFQ.bonus.range);
        }
        if (cardContent?.nbTargets) {
            cardContent.nbTargets = await RollService.rollResultAsync(cardContent.nbTargets);
        }

        // COST HP
        if (cardContent?.hp) {
            cardContent.hp = await RollService.rollResultAsync(cardContent.hp);
        }

        // COST ACTION
        if (cardContent?.action) {
            cardContent.action = await RollService.rollResultAsync(cardContent.action);
        }

        // COST MANA
        if (cardContent?.mana) {
            cardContent.mana = await RollService.rollResultAsync(cardContent.mana);
        }

        // COST ZEAL
        if (cardContent?.zeal) {
            cardContent.zeal = await RollService.rollResultAsync(cardContent.zeal);
        }

        // COST DRAW
        if (cardContent?.draw) {
            cardContent.draw = await RollService.rollResultAsync(cardContent.draw);
        }
        // COST DROP
        if (cardContent?.drop) {
            cardContent.drop = await RollService.rollResultAsync(cardContent.drop);
        }

        // BONUSES
        if (cardContent.bonusCrit) {
            cardContent.bonusCrit = await RollService.rollResultAsync(cardContent.bonusCrit);
        }
        if (cardContent.bonusEva) {
            cardContent.bonusEva = await RollService.rollResultAsync(cardContent.bonusEva);
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
                // Contrôle de la carte personnalisée
                if (customEval.script) {
                    try {
                        if (!eval(customEval.script)) {
                            let cardMessages = CardEffect.translateMessages(customEval.errorMessages);
                            if (cardMessages?.length) {
                                cardMessages.forEach(warningMsg => {
                                    createWarning(warningMsg, {actor: game.user.character});
                                });
                            } else {
                                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCardConditionNotMet"), {actor: game.user.character});
                            }
                            iscustomEvals = false;
                        }
                    } catch (e) {
                        console.error(e);
                        createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition"), {actor: game.user.character, color: ERROR_COLOR});
                    }
                }
            });
            if (!iscustomEvals) {
                return false;
            }
        }

        if (game.combat != null) {
            if (cardContent?.replayable === "passif" && cardContent?.hasBeenPlayed && cardContent?.passivePlayedRound === game.combat?.round.toString()) {
                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgPassiveSpellAlreadyUsed"), {actor: game.user.character});
                return false;
            }
            // S'agit t-il d'un sort réactive et peut on la jouer?
            if (cardContent && !cardContent.reactive && !ResourceHandler.validateUseSpellInTurn(game.user?.character)) {
                return false;
            } else if (cardContent?.reactive && (!game.combat || game.combat.combatant.actor?.id === game.user?.character?.id)) {
                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgPlayReactiveCard"), {actor: game.user.character});
                return false;
            }
        }

        // COST DRAW
        if (cardContent?.draw) {
            if ((card.source.cards.size - card.source.drawnCards.length) < cardContent.draw) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDraw"), game.user.character);
                return false;
            }
        }

        return ResourceHandler.checkResources(cardContent, game.user.character);
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
            if (cardContent[k] && typeof cardContent[k] === "object") CardEffect.recalculatedWithWYValue(cardContent[k], XXX, YYY);
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
            if (cardContent[k] && typeof cardContent[k] === "object") CardEffect.replaceCardContentAbilitiesBonus(cardContent[k]);
            else if (typeof cardContent[k] === "string") {
                cardContent[k] = RollService.replaceAbilitiesBonus(cardContent[k]);
            }
        });
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
            cardContent.xmax = await RollService.rollResultAsync(cardContent.xmax);
        }
        if (cardContent?.ymax) {
            cardContent.ymax = await RollService.rollResultAsync(cardContent.ymax);
        }

        if (cardContent?.xmax) {
            if (XXX > Number(cardContent?.xmax) || XXX < 0) {
                createWarning(game.i18n.format("FQCARDENGINE.WarningMsgXValueSuperiorXMax", {xmax: cardContent.xmax}), {actor: game.user.character});
                return false;
            }
        }

        if (cardContent?.xmin && XXX < Number(cardContent?.xmin)) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgXValueInferiorXMin", {xmin: cardContent.xmin}), {actor: game.user.character});
            return false;
        }

        if (cardContent?.ymax) {
            if (YYY > Number(cardContent?.ymax) || YYY < 0) {
                createWarning(game.i18n.format("FQCARDENGINE.WarningMsgYValueSuperiorYMax", {ymax: cardContent.ymax}), {actor: game.user.character});
                return false;
            }
        }

        if (cardContent?.ymin && YYY < Number(cardContent?.ymin)) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgYValueInferiorYMin", {ymin: cardContent.ymin}), {actor: game.user.character});
            return false;
        }

        if (hasVariables) {
            CardEffect.recalculatedWithWYValue(cardContent, XXX ? XXX : 0, YYY ? YYY : 0);
        } else if (cardContent && (cardContent.xvalue || cardContent.yvalue)) {
            CardEffect.recalculatedWithWYValue(cardContent, await CardEffect.getXYValue(cardContent.xvalue, Constants.myTargets(cardContent.targetType)),
                await CardEffect.getXYValue(cardContent.yvalue, Constants.myTargets(cardContent.targetType)));
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
            return Geometry.getMinDistanceBetweenTwoToken(myToken.x, myToken.y, target.x, target.y,
                myToken.width, target.width, myToken.height, target.height);
        } else if (value.startsWith("SCRIPT:")) {
            // Le script peut référencer un contexte absent (ex. game.combat null
            // hors combat) : on protège l'évaluation et on retombe à 0 plutôt
            // que de laisser une exception interrompre la lecture de la carte.
            try {
                const result = eval(value.substring(7));
                return Number.isFinite(result) ? result : 0;
            } catch (e) {
                console.warn("FQ Card Engine | Échec de l'évaluation du script de valeur X/Y, valeur ramenée à 0 :", value, e);
                return 0;
            }
        } else {
            // Sinon ça concerne le systeme du personnage
            return CardEffect.getNestedAttribute(game.user.character?.system, value);
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
        return await RollService.rollResultAsync(value.toString());
    }
}
