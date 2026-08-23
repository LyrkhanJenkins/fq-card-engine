import ResourceHandler from "./resource-handler.js";
import Damage from "../roll/damage.js";
import RollService from "../roll/roll-service.js";
import WeaponDamage from "../roll/weapon-damage.js";
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
import CardSelection from "../../interface/window/card-selection.js";
import CardCondition from "./card-condition.js";

import TradingCards from "../../trading/trading-cards.js";
import CombatTurn from "../combat-turn.js";

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
     * @param {Cards}  [to]        - La pile de défausse cible (récupération de carte).
     *
     * @returns {Promise<void>}
     */
    static async applyCardEffect(cardContent, card, fd, to) {
        let resultArray = [];
        // Collecteur local des animations Dice So Nice de ce jet de carte : créé à la
        // volée et passé aux méthodes de jet. Chaque dé y dépose sa promesse d'animation
        // sans l'attendre → tous les dés partent simultanément à l'écran.
        const dsnAnimations = [];

        if (cardContent) {
            ResourceHandler.consumeResources(cardContent, Constants.actorCurrent);
            // Injection des dégâts de l'arme équipée (@wpnR/@wpnM)
            WeaponDamage.substituteInDamage(cardContent, Constants.actorCurrent);
            if (cardContent.executeEval) {
                cardContent.executeEval = cardContent.executeEval?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");
                // Exécuté AVANT les jets : le script peut ajuster le contenu de la carte
                // (ex : Bouclier Divin calcule son soin depuis les derniers dégâts subis).
                // Un script défaillant ne doit pas avorter le jeu : les coûts sont payés.
                try {
                    eval(cardContent.executeEval);
                } catch (e) {
                    console.error(e);
                }
            }
            if (cardContent.damage) {
                resultArray.push(...await Damage.buildDamageDiceLauncher(Constants.actorCurrent, cardContent, dsnAnimations));
            }
            if (cardContent.heal) {
                resultArray.push(...await Damage.buildHealDiceLauncher(Constants.actorCurrent, cardContent, dsnAnimations));
            }
            if (cardContent.draw) {
                // Même chemin que la pioche de début de tour, remélange de la défausse compris.
                await CombatTurn.drawWithRecall(game.user, Constants.actorCurrent, card.parent,
                    card.source, cardContent.draw);
            }
            if (cardContent.retrieveFromDiscard?.trim()) {
                await CardEffect.retrieveCardFromDiscard(cardContent.retrieveFromDiscard, to, card);
            }
            if (cardContent.destroyFromDiscard?.trim()) {
                await CardEffect.destroyCardFromDiscard(cardContent.destroyFromDiscard, to, card);
            }
            if (CardSelection.hasCardSelection(cardContent)) {
                await CardSelection.playCardSelection(cardContent, card.parent);
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

            Damage.displayResult(Constants.actorCurrent, resultArray, cardMessages);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent, Constants.actorCurrent?.id,
                Constants.myTargetActorIds(cardContent.targetType));
        } else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: Constants.actorCurrent}),
                content: `<div style='font-style: italic'>${game.i18n.localize("FQCARDENGINE.InfoMsgNoAddedEffect")}</div>`
            });
        }
    }

    /**
     * Résout une récupération en défausse (`retrieveFromDiscard`) en deux modes :
     * `*` → mode CHOIX (`choose: true`), toute la pile est éligible et le joueur
     * choisira UNE carte ; liste de noms séparés par des virgules → mode TOUTES
     * (`choose: false`), chaque nom listé doit correspondre à une carte DISTINCTE
     * de la pile (un nom en double exige deux exemplaires), toutes seront
     * récupérées sans dialog, et les noms sans correspondance sont rapportés dans
     * `missing` (la carte est alors injouable). La carte jouée elle-même
     * (`excludeCardId`) est toujours exclue : au moment où l'effet s'applique,
     * elle vient d'arriver (ou arrive) dans la pile et ne peut pas se récupérer
     * elle-même.
     *
     * @param {string}  spec                   - La spécification (`*` ou liste de noms séparés par des virgules).
     * @param {Cards}   pile                   - La pile de défausse.
     * @param {string}  excludeCardId          - L'id de la carte jouée, à exclure.
     * @param {object}  [options]              - Les options de résolution.
     * @param {boolean} [options.generatedOnly] - True pour ne retenir que les copies générées.
     *
     * @returns {{choose: boolean, cards: Card[], missing: string[]}} Le mode, les cartes résolues et les noms manquants.
     */
    static resolveDiscardRetrieval(spec, pile, excludeCardId, {generatedOnly = false} = {}) {
        const trimmed = spec?.trim() ?? "";
        const available = (pile?.cards ?? [])
            .filter(c => c.id !== excludeCardId)
            .filter(c => !generatedOnly || CardEffect.isGeneratedCard(c));
        if (trimmed === "*") {
            return {choose: true, cards: available, missing: []};
        }
        const names = trimmed.split(",").map(name => name.trim()).filter(Boolean);
        const remaining = [...available];
        const cards = [];
        const missing = [];
        for (const name of names) {
            const index = remaining.findIndex(c => c.name === name);
            if (index === -1) {
                missing.push(name);
            } else {
                cards.push(remaining[index]);
                remaining.splice(index, 1);
            }
        }
        return {choose: false, cards, missing};
    }

    /**
     * Indique si une carte est une copie générée en cours de partie (encart 🃏,
     * runes gravées…) plutôt qu'une carte permanente du deck du joueur. Seules
     * ces copies peuvent être détruites depuis la défausse.
     *
     * @param {Card} card - La carte à qualifier.
     *
     * @returns {boolean} True si la carte porte le drapeau `generated` du module.
     */
    static isGeneratedCard(card) {
        return Boolean(card?.flags?.[FqCardEngineModule.moduleName]?.generated);
    }

    /**
     * Publie l'avertissement d'indisponibilité d'une récupération en défausse :
     * les noms manquants (mode liste, localisés) si la résolution en rapporte,
     * sinon l'avertissement générique de pile sans carte récupérable.
     *
     * @param {{cards: Card[], missing: string[]}} retrieval - La résolution (cf. {@link CardEffect.resolveDiscardRetrieval}).
     *
     * @returns {void}
     */
    static warnRetrievalUnavailable(retrieval) {
        const message = retrieval.missing.length
            ? game.i18n.format("FQCARDENGINE.WarningMsgMissingRetrievableCards",
                {names: retrieval.missing.map(name => game.i18n.localize(name)).join(", ")})
            : game.i18n.localize("FQCARDENGINE.WarningMsgNoRetrievableCard");
        ResourceHandler.createUserWarningMessage(message, Constants.actorCurrent);
    }

    /**
     * Publie l'avertissement d'indisponibilité d'une destruction en défausse :
     * les noms manquants (mode liste, localisés) si la résolution en rapporte,
     * sinon l'avertissement générique de pile sans carte générée à détruire.
     *
     * @param {{cards: Card[], missing: string[]}} destruction - La résolution (cf. {@link CardEffect.resolveDiscardRetrieval}).
     *
     * @returns {void}
     */
    static warnDestructionUnavailable(destruction) {
        const message = destruction.missing.length
            ? game.i18n.format("FQCARDENGINE.WarningMsgMissingDestroyableCards",
                {names: destruction.missing.map(name => game.i18n.localize(name)).join(", ")})
            : game.i18n.localize("FQCARDENGINE.WarningMsgNoDestroyableCard");
        ResourceHandler.createUserWarningMessage(message, Constants.actorCurrent);
    }

    /**
     * Ouvre la dialog de choix de la carte à récupérer dans la défausse : chaque
     * carte éligible est présentée face révélée (image + nom localisé), y compris
     * les cartes défaussées face cachée. Renvoie l'id de la carte choisie, ou
     * undefined si la dialog est fermée sans valider (aucune récupération).
     *
     * @param {Card[]} cards      - Les cartes éligibles de la défausse.
     * @param {string} [titleKey] - La clé i18n du titre de la dialog.
     *
     * @returns {Promise<string|undefined>} L'id de la carte choisie, ou undefined.
     */
    static async chooseDiscardCardDialog(cards, titleKey = "FQCARDENGINE.RetrieveCardTitle") {
        const options = cards.map((c, i) => {
            const img = c.faces?.[c.face ?? 0]?.img ?? c.faces?.[0]?.img ?? "";
            const name = game.i18n.localize(c.name);
            return `<label class="fq-retrieve-option">
                <input type="radio" name="cardId" value="${c.id}" ${i === 0 ? "checked" : ""}/>
                <img src="${img}" alt="${name}"/>
                <span>${name}</span>
            </label>`;
        }).join("");
        try {
            return await foundry.applications.api.DialogV2.prompt({
                window: {title: game.i18n.localize(titleKey)},
                content: `<div class="fq-retrieve-grid">${options}</div>`,
                ok: {callback: (event, button) => button.form.elements.cardId.value}
            });
        } catch (e) {
            // Dialog fermée/annulée sans choix : aucune carte récupérée.
            return undefined;
        }
    }

    /**
     * Récupère une ou plusieurs cartes de la défausse vers la main
     * (`retrieveFromDiscard`) : résout la récupération
     * (cf. {@link CardEffect.resolveDiscardRetrieval}) puis, en mode `*`, fait
     * choisir UNE carte au joueur via une dialog (choix automatique s'il n'y en a
     * qu'une éligible) ; en mode liste, récupère TOUTES les cartes listées sans
     * dialog. Les cartes sont DÉPLACÉES — contrairement aux copies générées de
     * l'encart 🃏, chacune garde son deck d'origine et sera défaussée/rappelée
     * normalement. Elles reviennent face visible (même défaussées face cachée) et
     * sont horodatées `generatedAt` pour le halo vert temporaire de la main
     * (cf. hand-board.js).
     *
     * @param {string} spec       - La spécification (`*` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile       - La pile de défausse cible du jeu de la carte.
     * @param {Card}   playedCard - La carte jouée (exclue, et dont le parent est la main).
     *
     * @returns {Promise<Card[]|null>} Les cartes déplacées, ou null si aucune récupération.
     */
    static async retrieveCardFromDiscard(spec, pile, playedCard) {
        const retrieval = CardEffect.resolveDiscardRetrieval(spec, pile, playedCard.id);
        if (retrieval.missing.length || !retrieval.cards.length) {
            // Garde de lançabilité déjà passée en amont : ce repli ne devrait servir
            // que si la pile a changé entre la validation et l'application des effets.
            CardEffect.warnRetrievalUnavailable(retrieval);
            return null;
        }
        let toRetrieve = retrieval.cards;
        if (retrieval.choose) {
            const chosenId = toRetrieve.length === 1 ? toRetrieve[0].id : await CardEffect.chooseDiscardCardDialog(toRetrieve);
            if (!chosenId) {
                return null;
            }
            toRetrieve = [toRetrieve.find(c => c.id === chosenId)];
        }
        const moduleName = FqCardEngineModule.moduleName;
        const retrieved = [];
        // Un transfert par carte : `updateData` (face à révéler) est propre à chacune.
        for (const chosen of toRetrieve) {
            const passed = await pile.pass(playedCard.parent, [chosen.id], {
                action: "pass",
                chatNotification: !CONFIG.FqCardEngine.options.hideMessages,
                updateData: {
                    face: chosen.face ?? 0,
                    flags: {[moduleName]: {generatedAt: Date.now()}}
                }
            }).catch(err => {
                ui.notifications.error(err.message);
                return null;
            });
            if (Array.isArray(passed)) {
                retrieved.push(...passed);
                // Une carte sans deck d'origine (générée) se voit estampiller par
                // Cards#pass l'origine du stack qu'elle quitte (la main lors de sa
                // défausse). De retour en main avec `origin = la main`, elle serait
                // considérée `isHome` (v14 : origin === parent) et la prochaine
                // défausse la COPIERAIT vers la pile en la laissant en main (doublon
                // d'id fatal). On ne conserve donc l'origine que si c'est un vrai deck.
                if (chosen.origin?.type !== "deck") {
                    await playedCard.parent.updateEmbeddedDocuments("Card", [{_id: chosen.id, origin: null}]);
                }
            }
        }
        return retrieved;
    }

    /**
     * Détruit définitivement une ou plusieurs cartes de la défausse
     * (`destroyFromDiscard`). Seules les **copies générées** en cours de partie
     * sont éligibles : une carte permanente du deck ne peut jamais être détruite
     * par une carte. Résolution identique à la récupération
     * (cf. {@link CardEffect.resolveDiscardRetrieval}) : `*` → le joueur choisit
     * UNE carte via une dialog (choix automatique s'il n'y en a qu'une éligible) ;
     * liste de noms → toutes les cartes listées, sans dialog. Contrairement à la
     * récupération, les cartes ne changent pas de pile : elles disparaissent, et
     * ne seront donc plus rappelées dans le deck au remélange.
     *
     * @param {string} spec       - La spécification (`*` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile       - La pile de défausse cible du jeu de la carte.
     * @param {Card}   playedCard - La carte jouée (exclue de la résolution).
     *
     * @returns {Promise<Card[]|null>} Les cartes détruites, ou null si aucune destruction.
     */
    static async destroyCardFromDiscard(spec, pile, playedCard) {
        const destruction = CardEffect.resolveDiscardRetrieval(spec, pile, playedCard.id, {generatedOnly: true});
        if (destruction.missing.length || !destruction.cards.length) {
            // Garde de lançabilité déjà passée en amont : ce repli ne devrait servir
            // que si la pile a changé entre la validation et l'application des effets.
            CardEffect.warnDestructionUnavailable(destruction);
            return null;
        }
        let toDestroy = destruction.cards;
        if (destruction.choose) {
            const chosenId = toDestroy.length === 1
                ? toDestroy[0].id
                : await CardEffect.chooseDiscardCardDialog(toDestroy, "FQCARDENGINE.DestroyCardTitle");
            if (!chosenId) {
                return null;
            }
            toDestroy = [toDestroy.find(c => c.id === chosenId)];
        }
        await pile.deleteEmbeddedDocuments("Card", toDestroy.map(c => c.id));
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: Constants.actorCurrent}),
            content: `<div style='font-style: italic'>${game.i18n.format("FQCARDENGINE.InfoMsgCardsDestroyed",
                {names: toDestroy.map(c => game.i18n.localize(c.name)).join(", ")})}</div>`
        });
        return toDestroy;
    }

    /**
     * Indique si la carte vise autrui plutôt que son lanceur : vrai si elle a une portée
     * (`minReach`/`maxReach`), cible des squelettes, une zone ou les tokens adjacents.
     * Sans portée, le sort est considéré comme se ciblant lui-même. Source de vérité
     * unique du ciblage (effets, message de chat).
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si la carte vise la/les cible(s), false si elle vise le lanceur.
     */
    static cardTargetsOthers(cardContent) {
        return Boolean(cardContent?.minReach || cardContent?.maxReach ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_SKELETON ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_ZONE ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_ADJACENT ||
            CardFqSystem.isCombatTargetType(cardContent?.targetType));
    }

    /**
     * Indique si un effet déclenché s'applique à la/les cible(s) résolue(s) plutôt qu'au
     * lanceur : vrai si l'effet n'est pas `self` ET que la carte vise autrui
     * (cf. {@link CardEffect.cardTargetsOthers}). Utilisé par l'ajout et le retrait d'effet.
     *
     * @param {object} currentEffectData - L'effet déclenché (`self`).
     * @param {object} cardContent       - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si l'effet vise la/les cible(s), false s'il vise le lanceur.
     */
    static effectAppliesToTargets(currentEffectData, cardContent) {
        return !currentEffectData.self && CardEffect.cardTargetsOthers(cardContent);
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
            const actor = Constants.actorCurrent;
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
     * Résout une composante de durée (rounds/turns) d'un effet en nombre entier.
     * Les chaînes vides/absentes valent 0 (aucune durée) sans lancer de jet ; sinon
     * la valeur est évaluée comme une formule (les @caractéristiques et X/Y ayant déjà
     * été substitués en amont). Toute erreur ou valeur non finie retombe à 0.
     *
     * @param {string|number} raw - La composante de durée à résoudre.
     *
     * @returns {number} La durée résolue (0 si vide, invalide ou non finie).
     */
    static resolveDurationComponent(raw) {
        if (raw === undefined || raw === null || raw.toString().trim() === "") {
            return 0;
        }
        try {
            const value = Number(RollService.rollResultSync(raw));
            return Number.isFinite(value) ? value : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Construit les données d'effets actifs à partir d'un effet de carte :
     * numérise les valeurs, renseigne le nom et la durée, importe les macros
     * référencées et évalue les formules des changements (sauf bonus de
     * dégâts/soin conservés tels quels).
     *
     * @param {object}   currentEffect       - L'effet source.
     *
     * @returns {Promise<object[]>} Les données d'effets actifs prêtes à être créées.
     */
    static async createEffectsFromData(currentEffect) {
        return Promise.all(currentEffect.data.map(async effect => {
            // Les données d'effet sont déjà alignées sur le schéma v14 des ActiveEffect
            // (`name`, `img`, `showIcon`, `changes`, `duration`) : aucun renommage ici.
            // `expireOnDamage` est un concept FQ (pas un champ ActiveEffect) : on le porte
            // dans les flags du module — sinon Foundry le supprimerait à la création et le
            // retrait d'effet sur dégâts ne se déclencherait jamais (cf. Damage.applyActorHpModification).
            const moduleName = FqCardEngineModule.moduleName;
            effect.flags = {
                ...effect.flags,
                [moduleName]: {...effect.flags?.[moduleName], expireOnDamage: !!effect.expireOnDamage}
            };
            delete effect.expireOnDamage;
            if (effect.duration) {
                const value = CardEffect.resolveDurationComponent(effect.duration.value);
                if (value > 0) {
                    effect.duration = {value, units: effect.duration.units};
                } else {
                    delete effect.duration;
                }
                effect.origin = OriginFQEffectLabel;
            }
            for (let changeKey in effect.changes) {
                if (effect.changes[changeKey].key === "macro.execute") {
                    await Fx.importMacroFromCompendium(effect.changes[changeKey].value);
                }
                let value = effect.changes[changeKey].value;
                if (!["system.fq.bonus.damage", "system.fq.bonus.heal"].includes(effect.changes[changeKey].key)) {
                    try {
                        value = Number(RollService.rollResultSync(effect.changes[changeKey].value));
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
     * Réécrit les contenus (choix) d'une carte en fusionnant `newValue` dans
     * chacun d'eux, puis met à jour la carte. La mise à jour de
     * `system.fq.choices` déclenche le hook `updateCard` qui rafraîchit la main.
     *
     * @param {Card}     card         - La carte à mettre à jour.
     * @param {object[]} cardContents - Les contenus (choix) d'origine.
     * @param {object}   newValue     - Les valeurs à fusionner dans chaque choix.
     *
     * @returns {void}
     */
    static rewriteCardContent(card, cardContents, newValue) {
        cardContents = cardContents.map(content => CardEffect.stringifyObjValue({...content, ...newValue}));
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
                speaker: ChatMessage.getSpeaker({actor: Constants.actorCurrent}),
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
                    ActiveEffect.implementation.create(effects[effectsKey], {parent: Constants.actorCurrent});
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
            cardContent.minReach = RollService.rollDiceSync(cardContent.minReach);
            cardContent.maxReach = RollService.rollDiceSync(cardContent.maxReach) + Number(Constants.actorFQ.bonus.range);
        }
        if (cardContent?.nbTargets) {
            cardContent.nbTargets = RollService.rollDiceSync(cardContent.nbTargets);
        }

        // COST HP
        if (cardContent?.hp) {
            cardContent.hp = RollService.rollDiceSync(cardContent.hp);
        }

        // COST ACTION
        if (cardContent?.action) {
            cardContent.action = RollService.rollDiceSync(cardContent.action);
        }

        // COST MANA
        if (cardContent?.mana) {
            cardContent.mana = RollService.rollDiceSync(cardContent.mana);
        }

        // COST ZEAL
        if (cardContent?.zeal) {
            cardContent.zeal = RollService.rollDiceSync(cardContent.zeal);
        }

        // COST DRAW
        if (cardContent?.draw) {
            cardContent.draw = RollService.rollDiceSync(cardContent.draw);
        }
        // COST DROP
        if (cardContent?.drop) {
            cardContent.drop = RollService.rollDiceSync(cardContent.drop);
        }

        // BONUSES
        if (cardContent.bonusCrit) {
            cardContent.bonusCrit = RollService.rollDiceSync(cardContent.bonusCrit);
        }
        if (cardContent.bonusEva) {
            cardContent.bonusEva = RollService.rollDiceSync(cardContent.bonusEva);
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
     * @param {Cards}  [to]        - La pile de défausse cible (garde de récupération).
     *
     * @returns {boolean} True si la carte peut être jouée, false sinon.
     */
    static checkIfCanUseCard(cardContent, card, to) {

        const conditions = CardCondition.evaluate(cardContent, card, to);
        if (!conditions.ok) {
            conditions.failures.forEach(failure => {
                if (failure.thrown) {
                    console.error(failure.thrown);
                    createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition"), {actor: Constants.actorCurrent, color: ERROR_COLOR});
                    return;
                }
                const cardMessages = CardEffect.translateMessages(failure.errorMessages);
                if (cardMessages?.length) {
                    cardMessages.forEach(warningMsg => {
                        createWarning(warningMsg, {actor: Constants.actorCurrent});
                    });
                } else {
                    createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCardConditionNotMet"), {actor: Constants.actorCurrent});
                }
            });
            return false;
        }

        if (game.combat != null) {
            if (CardFqSystem.isPlayedThisRound(cardContent)) {
                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCardAlreadyPlayedThisTurn"), {actor: Constants.actorCurrent});
                return false;
            }
            // S'agit t-il d'un sort réactive et peut on la jouer?
            if (cardContent && !cardContent.reactive && !ResourceHandler.validateUseSpellInTurn(Constants.actorCurrent)) {
                return false;
            } else if (cardContent?.reactive && (!game.combat || game.combat.combatant.actor?.id === Constants.actorCurrent?.id)) {
                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgPlayReactiveCard"), {actor: Constants.actorCurrent});
                return false;
            }
        }

        if (cardContent?.draw) {
            // La défausse compte : elle sera remélangée dans le deck au moment du
            // tirage. Seul un deck ET une défausse trop courts rendent la carte injouable.
            const available = (card.source?.cards?.size ?? 0) - (card.source?.drawnCards?.length ?? 0);
            const recallable = card.source ? TradingCards.countRecallableCards(card.source) : 0;
            if ((available + recallable) < cardContent.draw) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDraw"), Constants.actorCurrent);
                return false;
            }
        }

        if (cardContent?.retrieveFromDiscard?.trim()) {
            const retrieval = CardEffect.resolveDiscardRetrieval(cardContent.retrieveFromDiscard, to, card.id);
            if (retrieval.missing.length || !retrieval.cards.length) {
                CardEffect.warnRetrievalUnavailable(retrieval);
                return false;
            }
        }

        if (cardContent?.destroyFromDiscard?.trim()) {
            const destruction = CardEffect.resolveDiscardRetrieval(cardContent.destroyFromDiscard, to, card.id,
                {generatedOnly: true});
            if (destruction.missing.length || !destruction.cards.length) {
                CardEffect.warnDestructionUnavailable(destruction);
                return false;
            }
        }

        // ARME : une carte exigeant un type d'arme (@wpnR/@wpnM) est injouable sans
        // l'arme équipée correspondante, au même titre qu'un manque de ressources.
        const weaponWarningKey = WeaponDamage.getMissingWeaponWarningKey(cardContent, Constants.actorCurrent);
        if (weaponWarningKey) {
            ResourceHandler.createUserWarningMessage(game.i18n.localize(weaponWarningKey), Constants.actorCurrent);
            return false;
        }

        return ResourceHandler.checkResources(cardContent, Constants.actorCurrent);
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
            return CardEffect.getNestedAttribute(Constants.actorCurrent?.system, value);
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
