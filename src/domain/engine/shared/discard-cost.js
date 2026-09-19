import Constants from "../../constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import CardSelection from "../../interface/window/card-selection.js";
import {createInfo, createWarning} from "../../../core/utils/chat.utils.js";

/**
 * Coût en défausse d'une carte (`drop`) : le nombre de cartes que son lanceur
 * doit envoyer à sa pile de défausse pour la jouer. Le coût n'est PAS un score
 * accumulé — il se paie carte par carte, au moment du jeu : le joueur choisit
 * lui-même, dans le voile de sélection, exactement les cartes exigées parmi
 * celles de sa main.
 *
 * Deux règles encadrent ce paiement :
 * - **hors combat, aucune défausse n'est jamais exigée** : le coût est ignoré ;
 * - **une main trop courte rend la carte injouable** : le verdict tombe AVANT
 *   le voile (cf. {@link DiscardCost.canPay}), pour ne pas faire choisir le
 *   joueur dans une sélection qu'il ne pourra pas compléter.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DiscardCost {

    /**
     * Le nombre de cartes que le choix exige de défausser. Le coût est stocké en
     * négatif comme les autres (`drop: "-2"`), et vaut toujours 0 hors combat.
     *
     * @param {object} [cardContent] - Le contenu (choix) de la carte, déjà résolu.
     *
     * @returns {number} Le nombre de cartes à défausser (0 si aucune).
     */
    static required(cardContent) {
        if (!Constants.isActorInCombat) {
            return 0;
        }
        const cost = Number(cardContent?.drop);
        return Number.isFinite(cost) && cost < 0 ? -cost : 0;
    }

    /**
     * Les cartes de la main réellement défaussables pour payer le jeu de `card` :
     * toutes sauf la carte jouée elle-même, les cartes éphémères (leur seule
     * sortie de la main est le jeu, qui les détruit) et les cartes épuisées pour
     * le round (passif déjà posé, charge consommée) — qui ne quittent la main
     * que par leur propre chemin.
     *
     * @param {Card} card - La carte jouée (dont le parent est la main).
     *
     * @returns {Card[]} Les cartes défaussables, dans l'ordre de la main.
     */
    static eligibleCards(card) {
        const hand = card?.parent;
        return [...(hand?.cards ?? [])].filter(candidate => {
            if (candidate.id === card?.id || CardFqSystem.hasEphemeralChoice(candidate)) {
                return false;
            }
            return !(candidate.system?.fq?.choices ?? []).some(choice => choice?.hasBeenPlayed);
        });
    }

    /**
     * Indique si le lanceur a de quoi payer le coût en défausse du choix : assez
     * de cartes défaussables en main, la carte jouée NON comptée. Rendu sans
     * rien publier — c'est l'appelant qui avertit — et appelé aussi par les
     * évaluations silencieuses (carte automatique, carte réactive préparée).
     *
     * @param {object} [cardContent] - Le contenu (choix) de la carte, déjà résolu.
     * @param {Card}   [card]        - La carte jouée (dont le parent est la main).
     *
     * @returns {boolean} True si le coût peut être payé (ou s'il n'y en a pas).
     */
    static canPay(cardContent, card) {
        const count = DiscardCost.required(cardContent);
        if (!count) {
            return true;
        }
        return DiscardCost.eligibleCards(card).length >= count;
    }

    /**
     * Verdict PUBLIANT du coût en défausse : le même que {@link DiscardCost.canPay},
     * assorti de l'avertissement de chat quand la main est trop courte. C'est le
     * pendant de `ResourceHandler.checkResources` pour la seule ressource qui ne
     * se lit sur aucune réserve — il vit ici, et non dans `ResourceHandler`, pour
     * que le noyau des ressources n'ait pas à connaître la couche interface :
     * l'import refermerait le cycle `resource-handler` → `card-selection` →
     * `display-card` → `weapon-damage` → `resource-handler`.
     *
     * @param {object}  cardContent        - Le contenu (choix) de la carte, déjà résolu.
     * @param {Card}    [card]             - La carte jouée (dont le parent est la main).
     * @param {object}  [options]          - Les options du verdict.
     * @param {boolean} [options.silent=false] - Ne publie aucun avertissement.
     *
     * @returns {boolean} True si le coût peut être payé (ou s'il n'y en a pas).
     */
    static verify(cardContent, card, {silent = false} = {}) {
        if (DiscardCost.canPay(cardContent, card)) {
            return true;
        }
        if (!silent) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgNotEnoughCardsToDiscard",
                {count: DiscardCost.required(cardContent)}),
            {actor: Constants.actorCurrent, prependActorName: true});
        }
        return false;
    }

    /**
     * Paie le coût en défausse : ouvre le voile de sélection sur les cartes
     * défaussables de la main et transfère celles que le joueur retient vers sa
     * pile de défausse. Le voile est annulable — rien n'a encore été prélevé au
     * moment où il s'ouvre, une annulation renonce simplement au jeu de la carte.
     *
     * Le paiement est sans objet (et rend `true`) quand le choix n'exige aucune
     * défausse, notamment hors combat.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte, déjà résolu.
     * @param {Card}   card        - La carte jouée (dont le parent est la main).
     * @param {Cards}  to          - La pile de défausse cible.
     *
     * @returns {Promise<boolean>} True si le coût est payé (ou nul), false si le joueur a renoncé.
     */
    static async pay(cardContent, card, to) {
        const count = DiscardCost.required(cardContent);
        if (!count) {
            return true;
        }
        const candidates = DiscardCost.eligibleCards(card);
        // Garde-fou : `canPay` a déjà refusé le jeu en amont, mais le voile ne
        // doit jamais s'ouvrir sur une sélection impossible à compléter.
        if (candidates.length < count) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgNotEnoughCardsToDiscard", {count}),
                {actor: Constants.actorCurrent, prependActorName: true});
            return false;
        }
        const chosen = await CardSelection.openSelectionVeil(candidates, count, {
            title: game.i18n.format("FQCARDENGINE.DiscardSelectionTitle", {count})
        });
        if (!chosen?.length) {
            return false;
        }
        await DiscardCost.discardChosen(chosen, card.parent, to);
        return true;
    }

    /**
     * Transfère à la pile de défausse les cartes retenues pour payer un coût en
     * défausse, et l'annonce au fil. Une erreur de transfert est notifiée à
     * l'utilisateur sans interrompre le jeu de la carte — le coût est alors
     * considéré payé, comme tout prélèvement déjà engagé.
     *
     * @param {Card[]} chosen - Les cartes retenues par le joueur.
     * @param {Cards}  hand   - La main du lanceur.
     * @param {Cards}  to     - La pile de défausse cible.
     *
     * @returns {Promise<void>}
     */
    static async discardChosen(chosen, hand, to) {
        await hand.pass(to, chosen.map(c => c.id), {
            action: "pass",
            chatNotification: !CONFIG.FqCardEngine.options.hideMessages
        }).catch(err => ui.notifications.error(err.message));
        createInfo(game.i18n.format("FQCARDENGINE.InfoMsgCardsDiscardedForCost",
            {names: chosen.map(c => game.i18n.localize(c.name)).join(", ")}),
        {actor: Constants.actorCurrent});
    }
}
