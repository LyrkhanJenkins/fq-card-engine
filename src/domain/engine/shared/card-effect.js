import ResourceHandler from "./resource-handler.js";
import Damage from "../roll/damage.js";
import RollReport from "../roll/roll-report.js";
import ResultChatLog from "../roll/result-chat-log.js";
import {presentResult} from "../roll/result-presenter.js";
import RollService from "../roll/roll-service.js";
import WeaponDamage from "../roll/weapon-damage.js";
import HitProfile from "../roll/hit-profile.js";
import Minion from "./minion.js";
import Geometry from "./geometry.js";
import Constants, {OriginFQEffectLabel, isGeneratedCard} from "../../constants.js";
import Facing from "./facing.js";
import Fx from "./fx.js";
import {createInfo, createWarning} from "../../../core/utils/chat.utils.js";
import {ERROR_COLOR} from "../../../core/constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {socket} from "../../../hook/integration/socketlib.hook.js";
import CardSelection from "../../interface/window/card-selection.js";
import DiscardCost from "./discard-cost.js";
import CardCondition from "./card-condition.js";
import CardGenerated from "./card-generated.js";

import TradingCards, {DECK_TYPE} from "../../trading/trading-cards.js";
import CombatTurn from "../combat-turn.js";
import TargetingPredicates from "./targeting-predicates.js";
import StatusEffects from "../../system/effects/status-effects.js";
import ObjectUtils from "../../../core/utils/object.utils.js";

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
        // Rapport local de ce jet de carte : créé à la volée et passé aux méthodes de
        // jet, il recueille le détail de chaque dé, les verdicts et les valeurs
        // appliquées. Il est ensuite montré au joueur, puis publié au chat.
        const report = new RollReport();
        report.setHeader({
            actorName: Constants.actorCurrent?.name ?? null,
            cardName: card?.name ? game.i18n.localize(card.name) : null,
            deckName: card?.origin?.name ?? null,
            cardImg: CardEffect.cardFaceImage(card)
        });

        if (cardContent) {
            report.setHeader({
                choiceName: cardContent.name ? game.i18n.localize(cardContent.name) : null,
                xValue: fd?.XXX ?? null,
                yValue: fd?.YYY ?? null,
                targets: TargetingPredicates.resolveTargetLabels(cardContent)
            });
            ResourceHandler.consumeResources(cardContent, Constants.actorCurrent);
            // Injection des dégâts de l'arme équipée (@wpnR/@wpnM)
            WeaponDamage.substituteInDamage(cardContent, Constants.actorCurrent);
            if (cardContent.executeEval) {
                cardContent.executeEval = cardContent.executeEval.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
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
                resultArray.push(...await Damage.buildDamageDiceLauncher(Constants.actorCurrent, cardContent, report));
            }
            if (cardContent.heal) {
                resultArray.push(...await Damage.buildHealDiceLauncher(Constants.actorCurrent, cardContent, report));
            }
            if (cardContent.draw) {
                // Même chemin que la pioche de début de tour, remélange de la défausse compris.
                await CombatTurn.drawWithRecall(game.user, Constants.actorCurrent, card.parent,
                    card.source, cardContent.draw);
            }
            if (cardContent.retrieveFromDiscard?.trim()) {
                await CardEffect.retrieveCardFromDiscard(cardContent.retrieveFromDiscard, to, card);
            }
            if (cardContent.retrieveFromDeck?.trim()) {
                await CardEffect.retrieveCardFromDeck(cardContent.retrieveFromDeck, card);
            }
            if (cardContent.destroyFromDiscard?.trim()) {
                await CardEffect.destroyCardFromDiscard(cardContent.destroyFromDiscard, to, card);
            }
            if (cardContent.duplicateFromHand?.trim()) {
                await CardEffect.duplicateCardFromHand(cardContent, card);
            }
            if (CardSelection.hasCardSelection(cardContent)) {
                await CardSelection.playCardSelection(cardContent, card.parent);
            }
            if (cardContent.minions && Array.isArray(cardContent.minions)) {
                // Les fantômes n'ont pas d'emplacement à recevoir : chacun naît sur la
                // case de la cible visée. Ils sont donc invoqués à part, AVANT le
                // partage des emplacements — qui ne concerne que les autres sbires.
                for (const ghost of Minion.ghostMinions(cardContent.minions)) {
                    await Minion.createActor(ghost, null);
                }
                const placedMinions = Minion.placedMinions(cardContent.minions);
                if (cardContent.minionsOnZone) {
                    // La zone posée tient lieu d'emplacement : un sbire par case couverte.
                    await Minion.createActorsOnZone(placedMinions, cardContent.zonePlacement);
                } else {
                    const selectedLocations = [];
                    if (fd.minionLeft) selectedLocations.push("left");
                    if (fd.minionUp) selectedLocations.push("up");
                    if (fd.minionRight) selectedLocations.push("right");
                    if (fd.minionDown) selectedLocations.push("down");
                    for (let i = 0; i < selectedLocations.length; i++) {
                        const minion = placedMinions[i];
                        if (minion) {
                            await Minion.createActor(minion, selectedLocations[i]);
                        }
                    }
                }
            }
            let cardMessages = CardEffect.translateMessages(cardContent.messages);
            const pendingEffects = [];
            // Les effets d'un choix à sauvegarde attendent la sauvegarde de chaque
            // cible. Une carte à dégâts l'a déjà jetée et consignée ; une carte sans
            // dégâts la jette ici.
            if (CardEffect.#isSaveChoice(cardContent) && (cardContent.applyEffectsFormulas ?? []).length > 0
                && report.hits.length === 0) {
                await Damage.rollSaves(Constants.actorCurrent, cardContent, report);
            }
            if (cardContent.applyEffectsFormulas) {
                for (let i = 0; i < cardContent.applyEffectsFormulas.length; i++) {
                    const applyEffectsFormulas = cardContent.applyEffectsFormulas[i];
                    const {messages, pending} =
                        await CardEffect.playApplyEffectsFormulas(applyEffectsFormulas, cardContent, report);
                    cardMessages = cardMessages.concat(messages);
                    pendingEffects.push(pending);
                }
            }
            report.addMessages(cardMessages);

            // Cibles FIGÉES avant l'animation, et pour la même raison que celles
            // des formules d'effets : l'orientation et les FX se jouent après
            // plusieurs secondes d'affichage, et relire la sélection à ce
            // moment-là, ce serait viser ce qu'elle est devenue entre-temps. Les
            // dégâts, eux, portent déjà leurs `targetTokenId` figés au jet.
            const frozenTargets = cardContent.forcedTargets ?? Constants.myTargets(cardContent.targetType);

            const match = cardContent.damage?.match(/\[([a-z]+)\]/i);
            const effectType = match ? match[1] : null;
            // Lancé avant l'animation, jamais attendu : la vidéo de l'effet se
            // charge pendant que les dés roulent, et démarre donc sans retard une
            // fois le résultat affiché.
            Fx.preloadEffectAssets(cardContent, effectType);

            // Le rapport est complet : on le montre, et RIEN ne change dans la
            // partie tant que le joueur ne l’a pas vu. Les effets, les points de
            // vie et les FX attendent la fin de l’animation.
            await presentResult(report);

            // Les effets « à la prochaine attaque » tombent AVANT que la carte ne
            // pose les siens : une carte qui brise la garde de sa cible ne doit pas
            // voir sa propre attaque consommer la brèche qu'elle vient d'ouvrir.
            const consumption = Damage.attackConsumption(Constants.actorCurrent, report);
            if (consumption) {
                await socket.executeAsGM("consumeAttackEffects", ...consumption);
            }

            for (const pending of pendingEffects) {
                await CardEffect.applyPendingEffects(pending);
            }

            // Orientation vers la cible, avant les FX : le lanceur regarde ce qu'il vise.
            Facing.faceTarget(Constants.myToken, frozenTargets?.[0]);

            await Fx.handleSpecialEffect(cardContent, resultArray, Constants.myToken,
                effectType, frozenTargets);

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            ResultChatLog.publish(Constants.actorCurrent, report);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent, Constants.actorCurrent?.id,
                TargetingPredicates.resolveTargetActorIds(cardContent), card?.name);
        } else {
            createInfo(game.i18n.localize("FQCARDENGINE.InfoMsgNoAddedEffect"), {actor: Constants.actorCurrent});
        }
    }

    /**
     * Résout une récupération en défausse (`retrieveFromDiscard`) en deux modes :
     * `*N` → mode CHOIX (`choose: true`, `count: N` ; `*` seul = 1), toute la pile
     * est éligible et le joueur choisira N cartes — la carte est INJOUABLE si la
     * pile n'en compte pas N (`shortfall`), au même titre qu'une liste non
     * satisfaite ; liste de noms séparés par des virgules → mode TOUTES
     * (`choose: false`), chaque nom listé doit correspondre à une carte DISTINCTE
     * de la pile (un nom en double exige deux exemplaires), toutes seront
     * récupérées sans voile, et les noms sans correspondance sont rapportés dans
     * `missing` (la carte est alors injouable). La carte jouée elle-même
     * (`excludeCardId`) est toujours exclue : au moment où l'effet s'applique,
     * elle vient d'arriver (ou arrive) dans la pile et ne peut pas se récupérer
     * elle-même.
     *
     * Le mode CHOIX rend le vivier ENTIER : c'est le voile de sélection qui en
     * retiendra N à l'application, si bien que la résolution reste pure et que le
     * garde de lançabilité peut la rejouer sans rien décider à la place du joueur.
     *
     * La résolution est indépendante de la pile fournie : la duplication en main
     * (`duplicateFromHand`) l'applique à la main, la récupération dans le deck
     * (`retrieveFromDeck`) au deck de combat.
     *
     * @param {string}  spec                   - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Cards}   pile                   - La pile inspectée (défausse, main, ou deck de combat).
     * @param {string}  excludeCardId          - L'id de la carte jouée, à exclure.
     * @param {object}  [options]              - Les options de résolution.
     * @param {boolean} [options.generatedOnly] - True pour ne retenir que les copies générées.
     * @param {boolean} [options.undrawnOnly]   - True pour ne retenir que les cartes non encore piochées.
     *
     * @returns {{choose: boolean, cards: Card[], missing: string[], count?: number,
     *          shortfall?: {wanted: number, available: number}}} Le mode, les cartes résolues,
     *          les noms manquants et, en mode CHOIX, le nombre voulu et le manque éventuel.
     */
    static resolveDiscardRetrieval(spec, pile, excludeCardId, {generatedOnly = false, undrawnOnly = false} = {}) {
        const trimmed = spec?.trim() ?? "";
        const available = (pile?.cards ?? [])
            .filter(c => c.id !== excludeCardId)
            .filter(c => !generatedOnly || isGeneratedCard(c))
            // Une carte piochée reste dans le deck, marquée `drawn` : elle est déjà
            // sortie de la pioche et n'est donc plus récupérable depuis le deck.
            .filter(c => !undrawnOnly || !c.drawn);
        if (trimmed.startsWith("*")) {
            const wanted = Math.max(1, Math.trunc(Number(trimmed.slice(1))) || 1);
            // Vivier trop court : `cards` vide, comme une liste non satisfaite, pour
            // que le garde de lançabilité refuse la carte AVANT tout prélèvement.
            // Le manque n'est chiffré que s'il reste des cartes : un vivier vide se
            // dit mieux avec l'avertissement générique de l'opération.
            const enough = available.length >= wanted;
            return {
                choose: true,
                count: wanted,
                cards: enough ? available : [],
                missing: [],
                shortfall: (enough || !available.length) ? null : {wanted, available: available.length}
            };
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
     * Descripteurs des opérations de pile (récupération en défausse ou dans le
     * deck, destruction, duplication) : clés i18n du bandeau du voile de choix et
     * des avertissements, restriction aux copies générées et aux cartes non piochées.
     * Toute la plomberie commune (résolution, garde, choix) est pilotée par cette table.
     */
    static #DISCARD_OPS = Object.freeze({
        retrieve: Object.freeze({
            titleKey: "FQCARDENGINE.RetrieveCardTitle",
            missingKey: "FQCARDENGINE.WarningMsgMissingRetrievableCards",
            emptyKey: "FQCARDENGINE.WarningMsgNoRetrievableCard",
            generatedOnly: false
        }),
        retrieveDeck: Object.freeze({
            titleKey: "FQCARDENGINE.RetrieveDeckCardTitle",
            missingKey: "FQCARDENGINE.WarningMsgMissingRetrievableDeckCards",
            emptyKey: "FQCARDENGINE.WarningMsgNoRetrievableDeckCard",
            generatedOnly: false,
            undrawnOnly: true
        }),
        destroy: Object.freeze({
            titleKey: "FQCARDENGINE.DestroyCardTitle",
            missingKey: "FQCARDENGINE.WarningMsgMissingDestroyableCards",
            emptyKey: "FQCARDENGINE.WarningMsgNoDestroyableCard",
            generatedOnly: true
        }),
        duplicate: Object.freeze({
            titleKey: "FQCARDENGINE.DuplicateCardTitle",
            missingKey: "FQCARDENGINE.WarningMsgMissingDuplicableCards",
            emptyKey: "FQCARDENGINE.WarningMsgNoDuplicableCard",
            generatedOnly: false
        }),
    });

    /**
     * Publie l'avertissement d'indisponibilité d'une opération de pile : le
     * manque chiffré (mode choix : tant de cartes voulues, tant de disponibles),
     * sinon les noms manquants (mode liste, localisés) si la résolution en
     * rapporte, sinon l'avertissement générique de l'opération.
     *
     * @param {{cards: Card[], missing: string[], shortfall?: object}} resolution - La résolution
     *        (cf. {@link CardEffect.resolveDiscardRetrieval}).
     * @param {{missingKey: string, emptyKey: string}} keys   - Les clés i18n de l'opération.
     *
     * @returns {void}
     */
    static #warnUnavailable(resolution, {missingKey, emptyKey}) {
        let message;
        if (resolution.shortfall) {
            message = game.i18n.format("FQCARDENGINE.WarningMsgNotEnoughPileCards", resolution.shortfall);
        } else if (resolution.missing.length) {
            message = game.i18n.format(missingKey,
                {names: resolution.missing.map(name => game.i18n.localize(name)).join(", ")});
        } else {
            message = game.i18n.localize(emptyKey);
        }
        ResourceHandler.createUserWarningMessage(message, Constants.actorCurrent);
    }

    /**
     * Plomberie commune des opérations de pile : résout la spécification,
     * publie l'avertissement et abandonne si la résolution est incomplète, puis
     * en mode CHOIX fait choisir N cartes dans le voile de sélection plein écran
     * (cf. {@link CardSelection.openSelectionVeil}), commun à TOUS les choix de
     * cartes du module — proposition de cartes, coût en défausse, opérations de
     * pile. Le voile est annulable : renoncer laisse la pile intacte. Un vivier
     * réduit à N cartes est retenu d'office, sans voile (aucune décision à prendre).
     *
     * @param {string} op            - L'opération (`retrieve`, `retrieveDeck`, `destroy` ou `duplicate`).
     * @param {string} spec          - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile          - La pile inspectée (défausse, main, ou deck de combat).
     * @param {string} excludeCardId - L'id de la carte jouée, à exclure.
     *
     * @returns {Promise<Card[]|null>} Les cartes retenues, ou null si l'opération est abandonnée.
     */
    static async #resolveAndPick(op, spec, pile, excludeCardId) {
        const desc = CardEffect.#DISCARD_OPS[op];
        const resolution = CardEffect.resolveDiscardRetrieval(spec, pile, excludeCardId,
            {generatedOnly: desc.generatedOnly, undrawnOnly: desc.undrawnOnly});
        if (resolution.missing.length || !resolution.cards.length) {
            // Garde de lançabilité déjà passée en amont : ce repli ne devrait servir
            // que si la pile a changé entre la validation et l'application des effets.
            CardEffect.#warnUnavailable(resolution, desc);
            return null;
        }
        let cards = resolution.cards;
        // Autant d'éligibles que de cartes à retenir : le voile n'offrirait aucune
        // décision réelle (le vivier plus court a déjà été refusé par le garde).
        if (resolution.choose && cards.length > resolution.count) {
            const chosen = await CardSelection.openSelectionVeil(cards, resolution.count,
                {title: game.i18n.localize(desc.titleKey)});
            if (!chosen?.length) {
                return null;
            }
            cards = chosen;
        }
        return cards;
    }

    /**
     * Garde de lançabilité d'une opération de pile : résout la spécification et
     * publie l'avertissement d'indisponibilité le cas échéant.
     *
     * @param {string} op            - L'opération (`retrieve`, `retrieveDeck`, `destroy` ou `duplicate`).
     * @param {string} spec          - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile          - La pile inspectée (défausse, main, ou deck de combat).
     * @param {string} excludeCardId - L'id de la carte jouée, à exclure.
     *
     * @returns {boolean} True si l'opération est réalisable.
     */
    static #checkDiscardOp(op, spec, pile, excludeCardId) {
        const desc = CardEffect.#DISCARD_OPS[op];
        const resolution = CardEffect.resolveDiscardRetrieval(spec, pile, excludeCardId,
            {generatedOnly: desc.generatedOnly, undrawnOnly: desc.undrawnOnly});
        if (resolution.missing.length || !resolution.cards.length) {
            CardEffect.#warnUnavailable(resolution, desc);
            return false;
        }
        return true;
    }

    /**
     * Récupère une ou plusieurs cartes de la défausse vers la main
     * (`retrieveFromDiscard`) : résout la récupération
     * (cf. {@link CardEffect.resolveDiscardRetrieval}) puis, en mode `*`, fait
     * choisir UNE carte au joueur dans le voile de sélection (choix automatique
     * s'il n'y en a qu'une éligible) ; en mode liste, récupère TOUTES les cartes
     * listées sans voile. Les cartes sont DÉPLACÉES — contrairement aux copies générées de
     * l'encart 🃏, chacune garde son deck d'origine et sera défaussée/rappelée
     * normalement. Elles reviennent face visible (même défaussées face cachée) et
     * sont horodatées `generatedAt` pour le halo vert temporaire de la main
     * (cf. hand-board.js).
     *
     * @param {string} spec       - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile       - La pile de défausse cible du jeu de la carte.
     * @param {Card}   playedCard - La carte jouée (exclue, et dont le parent est la main).
     *
     * @returns {Promise<Card[]|null>} Les cartes déplacées, ou null si aucune récupération.
     */
    static async retrieveCardFromDiscard(spec, pile, playedCard) {
        const toRetrieve = await CardEffect.#resolveAndPick("retrieve", spec, pile, playedCard.id);
        if (!toRetrieve) {
            return null;
        }
        const retrieved = [];
        // Un transfert par carte : `updateData` (face à révéler) est propre à chacune.
        for (const chosen of toRetrieve) {
            const passed = await CardEffect.#passChosenCardToHand(pile, playedCard, chosen, "pass");
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
     * Duplique une ou plusieurs cartes de la main (`duplicateFromHand`) : la
     * résolution est celle des piles (cf.
     * {@link CardEffect.resolveDiscardRetrieval}, appliquée à la main, la carte
     * jouée étant exclue) — `*` → le joueur choisit UNE carte dans le voile de
     * sélection (choix automatique s'il n'y en a qu'une éligible) ; liste de noms
     * → toutes les cartes listées, sans voile. Contrairement à la récupération, les
     * originaux ne bougent pas : chaque carte choisie est COPIÉE en copie générée
     * (cf. {@link CardGenerated.buildGeneratedCardData}) créée dans la main —
     * sans deck d'origine, détruite au nettoyage de combat, et arrivant épuisée
     * uniquement si l'original porte déjà un choix marqué joué. Si le choix
     * demande le jeu immédiat (`chooseCardsPlayNow`), les copies sont jouées dans
     * la foulée, comme celles de l'encart 🃏.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {Card}   playedCard  - La carte jouée (exclue, et dont le parent est la main).
     *
     * @returns {Promise<Card[]|null>} Les copies créées, ou null si aucune duplication.
     */
    static async duplicateCardFromHand(cardContent, playedCard) {
        const hand = playedCard.parent;
        const toDuplicate = await CardEffect.#resolveAndPick("duplicate", cardContent.duplicateFromHand, hand, playedCard.id);
        if (!toDuplicate) {
            return null;
        }
        const data = toDuplicate.map(chosen => CardGenerated.buildGeneratedCardData(chosen));
        const created = await hand.createEmbeddedDocuments("Card", data);
        createInfo(game.i18n.format("FQCARDENGINE.InfoMsgCardsAddedToHand",
            {names: toDuplicate.map(c => game.i18n.localize(c.name)).join(", ")}), {actor: Constants.actorCurrent});
        if (cardContent.chooseCardsPlayNow && created?.length) {
            await CardSelection.playGeneratedCards(created, hand);
        }
        return created;
    }

    /**
     * Récupère dans la MAIN une ou plusieurs cartes du DECK de combat du joueur
     * (`retrieveFromDeck`) : une pioche CHOISIE plutôt que tirée au hasard. La
     * résolution est celle des piles (cf. {@link CardEffect.resolveDiscardRetrieval},
     * appliquée au deck) — `*` → le joueur choisit UNE carte dans le voile de sélection
     * (choix automatique s'il n'y en a qu'une éligible) ; liste de noms → toutes les cartes
     * listées, sans voile. Seules les cartes ENCORE DANS LA PIOCHE sont éligibles :
     * une carte déjà piochée reste dans le deck marquée `drawn`, mais elle se trouve
     * en main ou en défausse. Le transfert emprunte le chemin de pioche normal
     * (`Cards#pass`) : la carte garde son deck d'origine, et sera défaussée puis
     * rappelée comme n'importe quelle carte piochée. Elle arrive face visible et
     * horodatée `generatedAt` pour le halo vert temporaire de la main
     * (cf. hand-board.js). Sans deck de combat, la récupération est sans effet
     * (l'avertissement est publié par {@link TradingCards.getFirstDeck}).
     *
     * @param {string} spec       - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Card}   playedCard - La carte jouée (exclue, et dont le parent est la main).
     *
     * @returns {Promise<Card[]|null>} Les cartes piochées, ou null si aucune récupération.
     */
    static async retrieveCardFromDeck(spec, playedCard) {
        const deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE);
        if (!deck) {
            return null;
        }
        const toRetrieve = await CardEffect.#resolveAndPick("retrieveDeck", spec, deck, playedCard.id);
        if (!toRetrieve) {
            return null;
        }
        const retrieved = [];
        // Un transfert par carte : `updateData` (face à révéler) est propre à chacune.
        for (const chosen of toRetrieve) {
            const passed = await CardEffect.#passChosenCardToHand(deck, playedCard, chosen, "draw");
            if (Array.isArray(passed)) {
                retrieved.push(...passed);
            }
        }
        return retrieved;
    }

    /**
     * Transfère une carte choisie (défausse ou deck) vers la main via `Cards#pass` :
     * révèle la face choisie, estampille `generatedAt` (halo vert temporaire de la
     * main, cf. hand-board.js), et avale l'erreur de transfert en notification plutôt
     * que de la laisser remonter — factorisé entre {@link CardEffect.retrieveCardFromDiscard}
     * et {@link CardEffect.retrieveCardFromDeck}, qui ne diffèrent que par la pile
     * source et l'action Foundry (`pass`/`draw`).
     *
     * @param {Cards}  source     - La pile source (défausse ou deck).
     * @param {Card}   playedCard - La carte jouée (dont le parent est la main destination).
     * @param {Card}   chosen     - La carte choisie à transférer.
     * @param {string} action     - L'action Foundry du transfert (`"pass"` ou `"draw"`).
     *
     * @returns {Promise<Card[]|null>} Les cartes transférées, ou null en cas d'échec.
     */
    static async #passChosenCardToHand(source, playedCard, chosen, action) {
        return await source.pass(playedCard.parent, [chosen.id], {
            action,
            chatNotification: !CONFIG.FqCardEngine.options.hideMessages,
            updateData: {
                face: chosen.face ?? 0,
                flags: {[FqCardEngineModule.moduleName]: {generatedAt: Date.now()}}
            }
        }).catch(err => {
            ui.notifications.error(err.message);
            return null;
        });
    }

    /**
     * Détruit définitivement une ou plusieurs cartes de la défausse
     * (`destroyFromDiscard`). Seules les **copies générées** en cours de partie
     * sont éligibles : une carte permanente du deck ne peut jamais être détruite
     * par une carte. Résolution identique à la récupération
     * (cf. {@link CardEffect.resolveDiscardRetrieval}) : `*` → le joueur choisit
     * UNE carte dans le voile de sélection (choix automatique s'il n'y en a qu'une
     * éligible) ; liste de noms → toutes les cartes listées, sans voile. Contrairement à la
     * récupération, les cartes ne changent pas de pile : elles disparaissent, et
     * ne seront donc plus rappelées dans le deck au remélange.
     *
     * @param {string} spec       - La spécification (`*N` ou liste de noms séparés par des virgules).
     * @param {Cards}  pile       - La pile de défausse cible du jeu de la carte.
     * @param {Card}   playedCard - La carte jouée (exclue de la résolution).
     *
     * @returns {Promise<Card[]|null>} Les cartes détruites, ou null si aucune destruction.
     */
    static async destroyCardFromDiscard(spec, pile, playedCard) {
        const toDestroy = await CardEffect.#resolveAndPick("destroy", spec, pile, playedCard.id);
        if (!toDestroy) {
            return null;
        }
        await pile.deleteEmbeddedDocuments("Card", toDestroy.map(c => c.id));
        createInfo(game.i18n.format("FQCARDENGINE.InfoMsgCardsDestroyed",
            {names: toDestroy.map(c => game.i18n.localize(c.name)).join(", ")}), {actor: Constants.actorCurrent});
        return toDestroy;
    }

    /**
     * Indique si la carte vise autrui plutôt que son lanceur — délègue au prédicat
     * partagé {@link TargetingPredicates.cardTargetsOthers}, source de vérité unique
     * du ciblage (accessible aussi aux modules qui ne peuvent pas importer `CardEffect`).
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si la carte vise la/les cible(s), false si elle vise le lanceur.
     */
    static cardTargetsOthers(cardContent) {
        return TargetingPredicates.cardTargetsOthers(cardContent);
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
        } catch {
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
        } catch {
            return 0;
        }
    }

    /**
     * Construit les données d'effets actifs à partir d'un effet de carte :
     * expanse d'abord chaque donnée portant une clé `status` en ses données
     * canoniques du registre (cf. {@link StatusEffects.expand} — un statut peut
     * poser PLUSIEURS effets, l'acide en empile trois), puis numérise les
     * valeurs, renseigne le nom et la durée, importe les macros référencées et
     * évalue les formules des changements (sauf bonus de dégâts/soin conservés
     * tels quels).
     *
     * @param {object}   currentEffect       - L'effet source.
     *
     * @returns {Promise<object[]>} Les données d'effets actifs prêtes à être créées.
     */
    static async createEffectsFromData(currentEffect) {
        const effectDataList = currentEffect.data.flatMap(effectData =>
            StatusEffects.expand(effectData.status, effectData) ?? [effectData]);
        return Promise.all(effectDataList.map(async effect => {
            // Champ de référence du registre, pas un champ ActiveEffect.
            delete effect.status;
            // Les données d'effet sont déjà alignées sur le schéma v14 des ActiveEffect
            // (`name`, `img`, `showIcon`, `changes`, `duration`) : aucun renommage ici.
            // `expireOnDamage` est un concept FQ (pas un champ ActiveEffect) : on le porte
            // dans les flags du module — sinon Foundry le supprimerait à la création et le
            // retrait d'effet sur dégâts ne se déclencherait jamais (cf. Damage.applyActorHpModification).
            const moduleName = FqCardEngineModule.moduleName;
            // `expireOnAttack` suit le même chemin : « made » (consommé au prochain
            // jet d'attaque du porteur) ou « received » (au prochain jet qui le
            // vise), et `expireOnSave` (consommé à la prochaine sauvegarde du
            // porteur). Ils ne sont posés que lorsqu'ils existent, pour ne rien
            // changer aux effets qui les ignorent.
            effect.flags = {
                ...effect.flags,
                [moduleName]: {
                    ...effect.flags?.[moduleName],
                    expireOnDamage: !!effect.expireOnDamage,
                    ...(effect.expireOnAttack ? {expireOnAttack: effect.expireOnAttack} : {}),
                    ...(effect.expireOnSave ? {expireOnSave: true} : {})
                }
            };
            delete effect.expireOnDamage;
            delete effect.expireOnAttack;
            delete effect.expireOnSave;
            if (effect.duration) {
                const value = CardEffect.resolveDurationComponent(effect.duration.value);
                if (value > 0) {
                    effect.duration = {value, units: effect.duration.units};
                } else {
                    delete effect.duration;
                }
                effect.origin = OriginFQEffectLabel;
            }
            for (const change of effect.changes ?? []) {
                if (change.key === "system.fq.bonus.dot") {
                    change.value = CardEffect.#signDot(change.value);
                    continue;
                }
                if (change.key === "macro.execute") {
                    await Fx.importMacroFromCompendium(change.value);
                }
                let value = change.value;
                // Pas de numérisation pour : macro.execute (une commande de macro n'est
                // jamais un nombre — un nom sans argument serait numérisé en 0) et les
                // valeurs portant encore une référence @ (les @caractéristiques du
                // lanceur ont déjà été substituées en amont : un @ restant est une
                // référence DYNAMIQUE résolue par DAE sur l'acteur porteur, ex. le
                // `@attributes.hp.value` du statut virus — la numériser la détruirait).
                if (!["system.fq.bonus.damage", "system.fq.bonus.heal", "macro.execute"].includes(change.key)
                    && !String(change.value).includes("@")) {
                    // `rollDiceSync` et non `rollResultSync` : une valeur peut porter un
                    // dé (« -1d6 » points d'action), que Foundry refuse d'évaluer en synchrone.
                    try {
                        value = Number(RollService.rollDiceSync(change.value));
                    } catch {
                        value = change.value;
                    }
                }
                change.value = value;
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
     * correspond à un effet, prépare les effets actifs associés (sur soi ou sur
     * les cibles) et rend les messages traduits de l'effet déclenché. Rien n'est
     * créé ici : voir {@link CardEffect.applyPendingEffects}.
     *
     * Pour un choix à sauvegarde (`hitType` « save »), un effet sur autrui ne vise
     * que les cibles qui ont RATÉ leur sauvegarde, d'après les jets déjà consignés
     * au rapport. Si toutes l'ont réussie, il ne se déclenche pas : ni effet, ni
     * message. Un effet sur le lanceur n'attend aucune sauvegarde.
     *
     * @param {object} applyEffectsFormulas - La formule d'effets (`formula`, `title`, `effects`).
     * @param {object} cardContent          - Le contenu (choix) de la carte (portée, type de cible…).
     * @param {RollReport} [report]         - Le rapport où consigner ce jet supplémentaire, et
     *        où lire les sauvegardes des cibles.
     *
     * @returns {Promise<{messages: string[], pending: ?object}>} Les messages traduits de l'effet
     *          déclenché (vide si aucun), et les effets à appliquer une fois le résultat montré.
     */
    static async playApplyEffectsFormulas(applyEffectsFormulas, cardContent, report = null) {
        // Formule purement numérique : pas de jet, on valide directement avec ce
        // nombre comme total (aucun dé lancé, aucun message de chat posté).
        const numeric = Number(applyEffectsFormulas.formula);
        const isNumber = !isNaN(numeric);

        const roll = isNumber ? null : await new Roll(applyEffectsFormulas.formula).evaluate();
        const total = isNumber ? numeric : roll.total;
        for (let i = 0; i < applyEffectsFormulas.effects.length; i++) {
            applyEffectsFormulas.effects[i].result = RollService.rollResultSync(applyEffectsFormulas.effects[i].result);
        }

        let currentEffectData = applyEffectsFormulas.effects?.find(effect => effect.result === total) ?? null;

        // Décision cible/soi + cibles résolues : calculées UNE seule fois et partagées par
        // l'ajout et le retrait d'effet de cet effet déclenché.
        //
        // Elles sont FIGÉES ICI, avant l'affichage du résultat, et non au moment
        // d'appliquer l'effet : l'animation dure plusieurs secondes, pendant
        // lesquelles la sélection de l'utilisateur peut avoir changé. Lire les
        // cibles après coup, ce serait lire ce qu'elles sont devenues — la panne
        // que `TargetingPredicates#targetsByActivity` documente déjà côté dnd5e.
        const toTargets = currentEffectData ? CardEffect.effectAppliesToTargets(currentEffectData, cardContent) : false;
        let targets = toTargets ? Constants.myTargets(cardContent.targetType) : [];
        if (toTargets && CardEffect.#isSaveChoice(cardContent)) {
            targets = CardEffect.#failedSaveTargets(targets, report);
            // Toutes les cibles ont sauvegardé : l'effet ne se déclenche pas, et
            // ses messages n'annoncent pas ce qui n'a pas eu lieu.
            if (targets.length === 0) {
                currentEffectData = null;
            }
        }
        if (currentEffectData && toTargets) {
            // Libellés lus AVANT la création des effets, qui consomme le champ `status`.
            report?.addEffects(targets.map(target => ({targetTokenId: target.id, targetName: Constants.tokenName(target)})),
                CardEffect.#effectLabels(currentEffectData.data));
        }

        let effectMessages = null;
        let effects = null;
        if (currentEffectData) {
            // Les messages des statuts sont lus AVANT la création des effets, qui
            // consomme le champ `status` des données libres.
            effectMessages = [
                ...CardEffect.translateMessages(currentEffectData.messages),
                ...CardEffect.#statusMessages(currentEffectData.data)
            ];
            effects = await CardEffect.createEffectsFromData(currentEffectData);
        }

        report?.addExtraRoll({
            title: applyEffectsFormulas.title,
            formula: String(applyEffectsFormulas.formula),
            dice: roll ? RollReport.diceOf(roll) : [],
            total,
            hit: !!currentEffectData
        });

        return {
            messages: effectMessages ?? [],
            pending: currentEffectData ? {effects, currentEffectData, toTargets, targets} : null
        };
    }

    /**
     * Les cibles qui n'ont PAS sauvegardé : celles dont le rapport consigne une
     * sauvegarde ratée, et celles qui n'ont rien pu opposer — aucune sauvegarde
     * consignée, faute de valeur de sauvegarde sur la cible ou de sauvegarde
     * demandée par le choix. C'est la même lecture que les dégâts, où une cible
     * sans défense consignée n'est jamais protégée.
     *
     * @param {object[]}    targets  - Les cibles résolues.
     * @param {?RollReport} [report] - Le rapport portant les jets de sauvegarde.
     *
     * @returns {object[]} Les cibles qui subissent l'effet.
     */
    static #failedSaveTargets(targets, report) {
        const saved = new Set((report?.hits ?? [])
            .filter(hit => hit.kind === "save" && hit.defended)
            .map(hit => hit.targetTokenId));
        return targets.filter(target => !saved.has(target.id));
    }

    /**
     * Le choix demande-t-il une sauvegarde à ses cibles ? Ses effets sur autrui
     * sont alors réservés à celles qui la ratent ; ses effets sur le lanceur
     * n'attendent aucune sauvegarde.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True pour un choix de type « save ».
     */
    static #isSaveChoice(cardContent) {
        return cardContent?.hitType === CardFqSystem.HIT_TYPE_SAVE;
    }

    /**
     * Les libellés des effets qu'une formule pose, pour le rapport : le nom du
     * statut dans la langue du joueur, ou le nom saisi sur la carte. Un effet
     * répété (trois « Brûlure ») n'en fait qu'un, avec son compte.
     *
     * @param {object[]} [data] - Les données d'effet de l'effet déclenché.
     *
     * @returns {{label: string, count: number}[]} Les effets, dans l'ordre de la carte.
     */
    static #effectLabels(data = []) {
        const labels = [];
        for (const entry of data) {
            const statusKey = entry?.status ? StatusEffects.STATUS_CHOICES[entry.status] : null;
            const label = statusKey ? game.i18n.localize(statusKey)
                : (entry?.name ? game.i18n.localize(entry.name) : "");
            if (!label) {
                continue;
            }
            const known = labels.find(effect => effect.label === label);
            if (known) {
                known.count++;
            } else {
                labels.push({label, count: 1});
            }
        }
        return labels;
    }

    /**
     * Applique les effets actifs préparés par `playApplyEffectsFormulas` : création
     * sur soi ou sur chaque cible via le MJ, puis retrait éventuel.
     *
     * Séparé de la résolution parce qu'il n'a pas lieu au même moment : le jet et
     * son verdict sont connus tout de suite, mais l'effet ne doit apparaître sur
     * le jeton qu'une fois le dé qui le déclenche montré au joueur.
     *
     * @param {?object} pending - Les effets préparés, ou null si le jet n'a rien déclenché.
     *
     * @returns {Promise<void>}
     */
    static async applyPendingEffects(pending) {
        if (!pending) {
            return;
        }
        const {effects, currentEffectData, toTargets, targets} = pending;
        if (effects) {
            for (const effectData of effects) {
                if (toTargets) {
                    for (const target of targets) {
                        await socket.executeAsGM("addEffectForTarget", effectData, target.id);
                    }
                } else {
                    await ActiveEffect.implementation.create(effectData, {parent: Constants.actorCurrent});
                }
            }
        }

        if (currentEffectData?.removeEffectName) {
            await CardEffect.removeEffectForApplyEffect(currentEffectData, toTargets, targets);
        }
    }

    /**
     * L'illustration à montrer pour une carte : la face exposée si la carte en a
     * une, son dos sinon. Une carte résolue est toujours révélée à son lanceur,
     * donc aucun besoin ici de la logique de face cachée du message de chat.
     *
     * @param {Card} card - La carte jouée.
     *
     * @returns {?string} Le chemin de l'image, ou null si la carte n'en a pas.
     */
    static cardFaceImage(card) {
        if (card?.face !== null && card?.face !== undefined && card?.faces?.[card.face]?.img) {
            return card.faces[card.face].img;
        }
        return card?.back?.img ?? null;
    }

    /**
     * Prépare la valeur d'un changement de dégâts par tour (`fq.bonus.dot`) :
     * les effets CONCATÈNENT ce champ texte, chaque morceau doit donc ouvrir sur
     * son signe (`+1[poison]`, `-6`) — sans quoi `1` suivi de `1` ferait `11`.
     *
     * Rien n'y est figé : la formule, types et dés compris, est lancée à chaque
     * début de tour du porteur (`Damage.damageOverTime`), et une référence `@`
     * restante se résout sur lui.
     *
     * @param {string|number} value - La valeur saisie sur la carte.
     *
     * @returns {string} La valeur prête à être concaténée.
     */
    static #signDot(value) {
        const text = String(value ?? "").trim();
        return !text || /^[+-]/.test(text) ? text : `+${text}`;
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
    /**
     * Ce que le chat dit d'un statut posé par la carte : son nom, sa durée et ce
     * qu'il fait en jeu (« À terre pendant 1 tour(s) : attaque avec désavantage… »).
     *
     * Généré par le moteur à partir du statut, et non recopié dans chaque carte :
     * toute carte qui pose une condition dnd5e, « En élan » ou « Garde brisée »
     * l'explique d'office. Les statuts FQ gardent les messages de leur carte.
     *
     * @param {object[]} [data] - Les données d'effet de l'effet déclenché.
     *
     * @returns {string[]} Les messages traduits, un par statut réglé par la carte.
     */
    static #statusMessages(data = []) {
        return data.filter(entry => StatusEffects.ruleKey(entry?.status)).map(entry => {
            const condition = game.i18n.localize(StatusEffects.STATUS_CHOICES[entry.status]);
            const rule = game.i18n.localize(StatusEffects.ruleKey(entry.status));
            const turns = CardEffect.resolveDurationComponent(entry.duration?.value);
            return turns > 0
                ? game.i18n.format("FQCARDENGINE.CardMsgConditionAppliedFor", {condition, turns, rule})
                : game.i18n.format("FQCARDENGINE.CardMsgConditionApplied", {condition, rule});
        });
    }

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
     * (hp, action, mana, zeal, pioche, défausse) et bonus (critique, esquive,
     * toucher et DD de sauvegarde). Mute `cardContent` sur place.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte à préparer.
     *
     * @returns {void}
     */
    static prepareDataFromCard(cardContent) {
        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            cardContent.minReach = RollService.rollDiceSync(cardContent.minReach);
            cardContent.maxReach = RollService.rollDiceSync(cardContent.maxReach) + Constants.rangeBonus;
        }
        // CIBLES, COÛTS (hp/action/mana/zeal/draw/drop) ET BONUS (crit/esquive/toucher)
        for (const field of ["nbTargets", "hp", "action", "mana", "zeal", "draw", "drop",
            "bonusCrit", "bonusEva", "hitBonus", "saveDc"]) {
            if (cardContent?.[field]) {
                cardContent[field] = RollService.rollDiceSync(cardContent[field]);
            }
        }
    }

    //Display damage dices
    /**
     * Vérifie l'ensemble des conditions permettant de jouer une carte : scripts
     * d'évaluation personnalisés, règles de rejouabilité et de réactivité en
     * combat, portée vers les cibles, disponibilité de la pioche, cartes en main
     * pour un éventuel coût en défausse, et ressources suffisantes. Publie un
     * avertissement pour chaque condition non remplie.
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
            } else if (CardCondition.reactiveBlockedByOwnTurn(cardContent)) {
                createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgPlayReactiveCard"), {actor: Constants.actorCurrent});
                return false;
            }
        }

        if (cardContent?.draw) {
            // La défausse compte : elle sera remélangée dans le deck au moment du
            // tirage. Seul un deck ET une défausse trop courts rendent la carte injouable.
            const available = TradingCards.countAvailableCards(card.source);
            const recallable = card.source ? TradingCards.countRecallableCards(card.source) : 0;
            if ((available + recallable) < cardContent.draw) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDraw"), Constants.actorCurrent);
                return false;
            }
        }

        if (cardContent?.retrieveFromDiscard?.trim()
            && !CardEffect.#checkDiscardOp("retrieve", cardContent.retrieveFromDiscard, to, card.id)) {
            return false;
        }

        if (cardContent?.retrieveFromDeck?.trim()) {
            const deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE);
            if (!deck || !CardEffect.#checkDiscardOp("retrieveDeck", cardContent.retrieveFromDeck, deck, card.id)) {
                return false;
            }
        }

        if (cardContent?.destroyFromDiscard?.trim()
            && !CardEffect.#checkDiscardOp("destroy", cardContent.destroyFromDiscard, to, card.id)) {
            return false;
        }

        if (cardContent?.duplicateFromHand?.trim()
            && !CardEffect.#checkDiscardOp("duplicate", cardContent.duplicateFromHand, card.parent, card.id)) {
            return false;
        }

        // ARME : une carte exigeant un type d'arme (@wpnR/@wpnM) est injouable sans
        // l'arme équipée correspondante, au même titre qu'un manque de ressources.
        // Deux exigences possibles : les DÉGÂTS de la carte, et son MODIFICATEUR
        // de toucher — une carte peut tirer l'un de l'arme sans l'autre.
        const weaponWarningKey = WeaponDamage.getMissingWeaponWarningKey(cardContent, Constants.actorCurrent)
            ?? HitProfile.missingWeaponWarningKey(cardContent, Constants.actorCurrent);
        if (weaponWarningKey) {
            ResourceHandler.createUserWarningMessage(game.i18n.localize(weaponWarningKey), Constants.actorCurrent);
            return false;
        }

        // DÉFAUSSE : la seule « ressource » qui se paie en cartes, hors des réserves
        // de l'acteur — et donc hors de `checkResources` (cf. `DiscardCost.verify`).
        if (!DiscardCost.verify(cardContent, card)) {
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
        CardEffect.#walkStringValues(cardContent, s => s.replaceAll("XXX", XXX).replaceAll("YYY", YYY));
    }

    /**
     * Applique `fn` à toutes les valeurs chaînes d'un objet, récursivement.
     * Mute l'objet sur place.
     *
     * @param {object}                   obj - L'objet à parcourir.
     * @param {function(string): string} fn  - La transformation appliquée à chaque chaîne.
     *
     * @returns {void}
     */
    static #walkStringValues(obj, fn) {
        for (const k of Object.keys(obj)) {
            if (obj[k] && typeof obj[k] === "object") CardEffect.#walkStringValues(obj[k], fn);
            else if (typeof obj[k] === "string") {
                obj[k] = fn(obj[k]);
            }
        }
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
        CardEffect.#walkStringValues(cardContent, s => RollService.replaceAbilitiesBonus(s));
    }

    /**
     * Résout une copie de travail d'un choix pour une vérification SILENCIEUSE
     * (ressources, ciblage) hors du pipeline de jeu : bonus de caractéristiques,
     * substitution X/Y si la carte en porte, puis données dérivées — les mêmes
     * étapes de résolution qu'au jeu, pour que le verdict porte sur les mêmes
     * nombres que ceux qui seront prélevés. Factorisé entre
     * {@link AutoCard.canAfford} et {@link PreparedCard.canPlayNow}.
     *
     * @param {object}  cardContent          - Le choix non résolu.
     * @param {object}  [options]
     * @param {boolean} [options.hasVariables] - True si la carte porte des variables X/Y libres (omis : la carte n'en a pas).
     * @param {number}  [options.xValue]       - La valeur X saisie, si `hasVariables`.
     * @param {number}  [options.yValue]       - La valeur Y saisie, si `hasVariables`.
     *
     * @returns {object} La copie résolue du choix.
     */
    static resolveForSilentCheck(cardContent, {hasVariables, xValue, yValue} = {}) {
        const resolved = ObjectUtils.deepCopy(cardContent);
        CardEffect.replaceCardContentAbilitiesBonus(resolved);
        if (hasVariables !== undefined) {
            CardEffect.substituteXAndYValue(resolved, hasVariables, xValue, yValue);
        }
        CardEffect.prepareDataFromCard(resolved);
        return resolved;
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
            // Une seule résolution des cibles : xvalue et yvalue voient le MÊME ensemble.
            const targets = Constants.myTargets(cardContent.targetType);
            CardEffect.recalculatedWithWYValue(cardContent,
                CardEffect.boundedXYValue(CardEffect.getXYValue(cardContent.xvalue, targets), cardContent.xmax),
                CardEffect.boundedXYValue(CardEffect.getXYValue(cardContent.yvalue, targets), cardContent.ymax));
        }
    }

    /**
     * Plafonne une valeur X/Y CALCULÉE (issue de `xvalue`/`yvalue`) par sa borne
     * `xmax`/`ymax`. Une valeur saisie par le joueur est jugée par
     * {@link CardEffect.evaluateXYBounds}, qui refuse le jeu au-delà de la borne ;
     * une valeur calculée n'a personne à qui refuser quoi que ce soit — la borne
     * s'y applique donc comme un plafond silencieux (ex. le score de squelettes
     * sacrifiés, dont une carte ne peut dépenser que `xmax` points).
     *
     * @param {number}        value - La valeur calculée.
     * @param {string|number} [bound] - La borne, déjà résolue en nombre au moment du jeu.
     *
     * @returns {number} La valeur, plafonnée si une borne exploitable est déclarée.
     */
    static boundedXYValue(value, bound) {
        const cap = Number(bound);
        return Number.isFinite(cap) && cap > 0 ? Math.min(value, cap) : value;
    }

    /**
     * Calcule la valeur d'une variable X ou Y selon son mot-clé : nombre de
     * cibles, distance jusqu'à l'unique cible, résultat d'un script (`SCRIPT:`),
     * ou attribut du système du personnage.
     *
     * @param {string}   [value]   - Le mot-clé/expression décrivant la valeur à calculer (absent : 0).
     * @param {object[]} myTargets - Les cibles courantes.
     *
     * @returns {number} La valeur calculée.
     */
    static getXYValue(value, myTargets) {
        // Un `xvalue`/`yvalue` absent vaut 0 : le schéma de carte garantit deux
        // chaînes, mais la résolution est aussi appelée depuis le ciblage sur un
        // choix non passé par le modèle, et une valeur manquante doit y rendre un
        // nombre plutôt que de rompre la pose de zone.
        if (!value) {
            return 0;
        }
        if (value === "nbTargets") {
            return myTargets.length ? myTargets.length : 0;
        } else if (myTargets.length === 1 && value === "reach") {
            const myToken = Constants.myToken;
            return Geometry.distanceBetweenTokens(myToken, myTargets[0]);
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
