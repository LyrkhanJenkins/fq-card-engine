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
                const selectedLocations = [];
                if (fd.minionLeft) selectedLocations.push("left");
                if (fd.minionUp) selectedLocations.push("up");
                if (fd.minionRight) selectedLocations.push("right");
                if (fd.minionDown) selectedLocations.push("down");
                for (let i = 0; i < selectedLocations.length; i++) {
                    const minion = cardContent.minions[i];
                    if (minion) {
                        await Minion.createActor(minion, selectedLocations[i]);
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

            // On attend ICI, une seule fois, que TOUTES les animations Dice So Nice
            // du jet soient terminées (les dés sont partis simultanément plus haut).
            await Promise.all(dsnAnimations);

            const match = cardContent.damage?.match(/\[([a-z]+)\]/i);
            await Fx.handleSpecialEffect(cardContent, resultArray, Constants.myToken, match ? match[1] : null);

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
     * Indique si un effet déclenché s'applique à la/les cible(s) résolue(s) plutôt qu'au
     * lanceur : vrai si l'effet n'est pas `self` ET que la carte a une portée (ou cible des
     * squelettes). Source de vérité unique partagée par l'ajout et le retrait d'effet.
     *
     * @param {object} currentEffectData - L'effet déclenché (`self`).
     * @param {object} cardContent       - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si l'effet vise la/les cible(s), false s'il vise le lanceur.
     */
    static effectAppliesToTargets(currentEffectData, cardContent) {
        return !currentEffectData.self && Boolean(cardContent?.minReach || cardContent?.maxReach ||
            cardContent.targetType === CardFqSystem.TARGET_TYPE_SKELETON);
    }

    /**
     * Retire, quand un effet d'`applyEffectsFormulas` se déclenche, l'effet actif nommé
     * `currentEffectData.removeEffectName` (nom exact, ou "@choose" pour une dialog de
     * choix), sur les destinataires déjà résolus : la/les cible(s) (`targets`, retrait
     * délégué au MJ via socket car la cible peut appartenir à un autre joueur) ou le
     * lanceur (retrait direct, il possède son acteur).
     *
     * @param {object}   currentEffectData - L'effet déclenché (`removeEffectName`).
     * @param {boolean}  toTargets         - True si le retrait vise la/les cible(s).
     * @param {object[]} targets           - Les cibles résolues (vide si `toTargets` faux).
     *
     * @returns {Promise<void>}
     */
    static async removeEffectForApplyEffect(currentEffectData, toTargets, targets) {
        const name = currentEffectData.removeEffectName;
        if (toTargets) {
            for (const target of targets) {
                const effects = target.actor?.effects?.contents ?? [];
                const effectId = effects.length ? await CardEffect.resolveEffectIdToRemove(effects, name) : undefined;
                if (effectId) {
                    await socket.executeAsGM("removeEffectForTarget", target.id, effectId);
                }
            }
        } else {
            const actor = game.user.character;
            const effects = actor?.effects?.contents ?? [];
            const effectId = effects.length ? await CardEffect.resolveEffectIdToRemove(effects, name) : undefined;
            if (effectId) {
                await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
            }
        }
    }

    /**
     * Résout l'id de l'effet à retirer parmi les effets actifs d'une cible. Deux modes :
     * nom exact (`spec` = le `name` d'un effet) → résolution pure et testable ; "@choose"
     * → ouvre une dialog de choix. La branche interactive est isolée ici (et non dans
     * `removeEffectOnTargets`) pour garder la résolution par nom testable sans DOM.
     *
     * @param {object[]} effects - Les effets actifs de la cible.
     * @param {string}   spec    - "@choose" ou le nom exact de l'effet à retirer.
     *
     * @returns {Promise<string|undefined>} L'id de l'effet à retirer, ou undefined si aucun.
     */
    static async resolveEffectIdToRemove(effects, spec) {
        if (spec !== "@choose") {
            return effects.find(effect => effect.name === spec)?.id;
        }
        const options = effects.map(effect => `<option value="${effect.id}">${effect.name}</option>`).join("");
        try {
            return await foundry.applications.api.DialogV2.prompt({
                window: {title: game.i18n.localize("FQCARDENGINE.RemoveEffectTitle")},
                content: `<select name="effect">${options}</select>`,
                ok: {callback: (event, button) => button.form.elements.effect.value}
            });
        } catch (e) {
            // Dialog fermée/annulée sans choix : aucun effet retiré.
            return undefined;
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
            if (!effect.name) {
                effect.name = effect.label;
            }
            // Foundry a renommé le champ image des ActiveEffect « icon » → « img » (v11).
            // Les données de cartes utilisent encore « icon » : sans cette normalisation,
            // l'effet est créé sans image et aucune icône n'apparaît sur le token.
            if (!effect.img && effect.icon) {
                effect.img = effect.icon;
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
        // Formule purement numérique : pas de jet, on valide directement avec ce
        // nombre comme total (aucun dé lancé, aucun message de chat posté).
        const numeric = Number(applyEffectsFormulas.formula);
        const isNumber = !isNaN(numeric);

        const roll = isNumber ? null : await new Roll(applyEffectsFormulas.formula).evaluate();
        const total = isNumber ? numeric : roll.total;
        if (roll) Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
        for (let i = 0; i < applyEffectsFormulas.effects.length; i++) {
            applyEffectsFormulas.effects[i].result = RollService.rollResultSync(applyEffectsFormulas.effects[i].result);
        }

        // On PRÉPARE ici l'effet déclenché (données + message) sans encore
        // l'appliquer aux tokens : l'application effective est repoussée après
        // l'animation des dés, plus bas.
        let effectMessages = null;
        let currentEffectData = null;
        let effects = null;
        let message = `<h2 style='color: ${OTHER_ROLL_COLOR}'>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulas",
            {applyEffectsFormulasTitle: applyEffectsFormulas.title})}`;
        if (applyEffectsFormulas.effects && applyEffectsFormulas.effects.map(effect => effect.result).includes(total)) {
            currentEffectData = applyEffectsFormulas.effects.find(effect => effect.result === total);
            message += `: <b>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulasSuccess")}</b> `;
            effectMessages = CardEffect.translateMessages(currentEffectData.messages);
            effects = await CardEffect.createEffectsFromData(currentEffectData);
        }

        message += `</h2>`;

        if (roll) {
            const msg = await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                flavor: message
            });

            if (game.dice3d && roll.isDeterministic === false) {
                await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
            }
        }

        // Application des effets actifs sur soi ou les cibles UNIQUEMENT après la
        // fin de l'animation des dés : sinon l'effet apparaît sur le token avant
        // que le jet qui le déclenche ait fini de rouler.
        // Décision cible/soi + cibles résolues : calculées UNE seule fois et partagées par
        // l'ajout et le retrait d'effet de cet effet déclenché.
        const toTargets = currentEffectData ? CardEffect.effectAppliesToTargets(currentEffectData, cardContent) : false;
        const targets = toTargets ? Constants.myTargets(cardContent.targetType) : [];

        if (effects) {
            for (const effectsKey in effects) {
                if (toTargets) {
                    for (const target of targets) {
                        await socket.executeAsGM("addEffectForTarget", effects[effectsKey], target.id);
                    }
                } else {
                    ActiveEffect.implementation.create(effects[effectsKey], {parent: game.user.character});
                }
            }
        }

        if (currentEffectData?.removeEffectName) {
            await CardEffect.removeEffectForApplyEffect(currentEffectData, toTargets, targets);
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
     * @returns {void}
     */
    static prepareDataFromCard(cardContent) {
        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            cardContent.minReach = RollService.rollResultSync(cardContent.minReach);
            cardContent.maxReach = RollService.rollResultSync(cardContent.maxReach) + Number(Constants.actorFQ.bonus.range);
        }
        if (cardContent?.nbTargets) {
            cardContent.nbTargets = RollService.rollResultSync(cardContent.nbTargets);
        }

        // COST HP
        if (cardContent?.hp) {
            cardContent.hp = RollService.rollResultSync(cardContent.hp);
        }

        // COST ACTION
        if (cardContent?.action) {
            cardContent.action = RollService.rollResultSync(cardContent.action);
        }

        // COST MANA
        if (cardContent?.mana) {
            cardContent.mana = RollService.rollResultSync(cardContent.mana);
        }

        // COST ZEAL
        if (cardContent?.zeal) {
            cardContent.zeal = RollService.rollResultSync(cardContent.zeal);
        }

        // COST DRAW
        if (cardContent?.draw) {
            cardContent.draw = RollService.rollResultSync(cardContent.draw);
        }
        // COST DROP
        if (cardContent?.drop) {
            cardContent.drop = RollService.rollResultSync(cardContent.drop);
        }

        // BONUSES
        if (cardContent.bonusCrit) {
            cardContent.bonusCrit = RollService.rollResultSync(cardContent.bonusCrit);
        }
        if (cardContent.bonusEva) {
            cardContent.bonusEva = RollService.rollResultSync(cardContent.bonusEva);
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
     * Résout les bornes `xmax`/`ymax` d'un contenu de carte (en place, comme
     * auparavant) puis juge les valeurs X/Y saisies contre `xmax`/`xmin`/`ymax`/`ymin`.
     * Ne publie AUCUN avertissement et ne lève rien : renvoie un verdict que
     * l'appelant traduit en `FormError`. Le blocage vit ainsi dans `playValidatedCard`
     * (qui garde la dialog ouverte), sur le même patron que le garde de ciblage.
     * La résolution en place de `xmax`/`ymax` reproduit l'état antérieur (la carte
     * jouée porte ses bornes résolues).
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     * @param {number} XXX         - La valeur X saisie.
     * @param {number} YYY         - La valeur Y saisie.
     *
     * @returns {{messageKey: string, format: object}|null} Le verdict de dépassement (clé i18n + args de format), ou null si les bornes sont respectées.
     */
    static evaluateXYBounds(cardContent, XXX, YYY) {
        if (cardContent?.xmax) {
            cardContent.xmax = RollService.rollResultSync(cardContent.xmax);
        }
        if (cardContent?.ymax) {
            cardContent.ymax = RollService.rollResultSync(cardContent.ymax);
        }
        if (cardContent?.xmin) {
            cardContent.xmin = RollService.rollResultSync(cardContent.xmin);
        }
        if (cardContent?.ymin) {
            cardContent.ymin = RollService.rollResultSync(cardContent.ymin);
        }

        if (cardContent?.xmax && (XXX > Number(cardContent.xmax) || XXX < 0)) {
            return {messageKey: "FQCARDENGINE.WarningMsgXValueSuperiorXMax", format: {xmax: cardContent.xmax}};
        }
        if (cardContent?.xmin && XXX < Number(cardContent.xmin)) {
            return {messageKey: "FQCARDENGINE.WarningMsgXValueInferiorXMin", format: {xmin: cardContent.xmin}};
        }
        if (cardContent?.ymax && (YYY > Number(cardContent.ymax) || YYY < 0)) {
            return {messageKey: "FQCARDENGINE.WarningMsgYValueSuperiorYMax", format: {ymax: cardContent.ymax}};
        }
        if (cardContent?.ymin && YYY < Number(cardContent.ymin)) {
            return {messageKey: "FQCARDENGINE.WarningMsgYValueInferiorYMin", format: {ymin: cardContent.ymin}};
        }
        return null;
    }

    /**
     * Substitue les variables X/Y dans un contenu de carte : soit par les valeurs
     * saisies (`hasVariables`), soit par des valeurs calculées (`xvalue`/`yvalue` via
     * `getXYValue`). Mute `cardContent` sur place. La validation des bornes est
     * assurée en amont par `evaluateXYBounds`.
     *
     * @param {object}  cardContent  - Le contenu (choix) de la carte.
     * @param {boolean} hasVariables - True si l'utilisateur a saisi des valeurs X/Y.
     * @param {number}  XXX          - La valeur X saisie.
     * @param {number}  YYY          - La valeur Y saisie.
     *
     * @returns {void}
     */
    static substituteXAndYValue(cardContent, hasVariables, XXX, YYY) {
        if (hasVariables) {
            CardEffect.recalculatedWithWYValue(cardContent, XXX ? XXX : 0, YYY ? YYY : 0);
        } else if (cardContent && (cardContent.xvalue || cardContent.yvalue)) {
            CardEffect.recalculatedWithWYValue(cardContent, CardEffect.getXYValue(cardContent.xvalue, Constants.myTargets(cardContent.targetType)),
                CardEffect.getXYValue(cardContent.yvalue, Constants.myTargets(cardContent.targetType)));
        }
    }

    /**
     * Calcule la valeur d'une variable X ou Y selon son mot-clé : nombre de
     * cibles, distance jusqu'à l'unique cible, résultat d'un script (`SCRIPT:`),
     * ou attribut du système du personnage.
     *
     * @param {string}   value     - Le mot-clé/expression décrivant la valeur à calculer.
     * @param {object[]} myTargets - Les cibles courantes.
     *
     * @returns {number} La valeur calculée.
     */
    static getXYValue(value, myTargets) {
        if (value === "nbTargets") {
            return myTargets.length ? myTargets.length : 0;
        } else if (myTargets.length === 1 && value === "reach") {
            const myToken = Constants.myToken;
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
     * @returns {number} La valeur évaluée, ou 0 si le chemin est absent/vide.
     */
    static getNestedAttribute(obj, key) {
        if (!key) {
            return 0;
        }
        const keys = key.split(".");
        let value = obj;
        for (const k of keys) {
            if (value == null || !Object.prototype.hasOwnProperty.call(value, k)) {
                return 0;
            }
            value = value[k];
        }
        if (value == null) {
            return 0;
        }
        return RollService.rollResultSync(value.toString());
    }
}
