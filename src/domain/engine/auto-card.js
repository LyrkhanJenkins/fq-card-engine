import Constants from "../constants.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";
import CardEffect from "./shared/card-effect.js";
import DiscardCost from "./shared/discard-cost.js";
import PlayCard from "./play-card.js";
import ResourceHandler from "./shared/resource-handler.js";
import TradingCards, {HAND_TYPE, PILE_TYPE} from "../trading/trading-cards.js";
import ObjectUtils from "../../core/utils/object.utils.js";
import {createWarning} from "../../core/utils/chat.utils.js";
import {invokePlayPipeline} from "./shared/card-replay.js";

/**
 * Cartes automatiques : celles dont un choix porte `replayable: "auto"`. Jouée
 * une première fois à la main, une telle carte reste en main comme un passif ;
 * le moteur la rejoue ensuite seul au début de chaque tour de son porteur, en
 * repayant intégralement le coût de la carte. Le tour où ce coût ne peut plus
 * être payé, la carte rejoint la défausse.
 *
 * Le rejeu s'exécute sur le client du PORTEUR — le pipeline de jeu lit le
 * personnage de l'utilisateur courant et pose ses cibles — et emprunte le
 * chemin de jeu commun à toutes les cartes (`playValidatedCard`), appelé via la
 * façade globale pour ne pas fermer le cycle `engine` → `interface`.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class AutoCard {
    /**
     * Rejoue, au début du tour de l'utilisateur local, toutes les cartes
     * automatiques présentes dans sa main. Ne fait rien si le combattant courant
     * n'est pas le personnage de l'utilisateur : chaque client ne traite que ses
     * propres cartes.
     *
     * @returns {Promise<void>}
     */
    static async playTurnAutoCards() {
        const actor = Constants.actorCurrent;
        if (!actor || !game.combat || game.combat.combatant?.actor?.id !== actor.id) {
            return;
        }
        const hand = TradingCards.getFirstDeck(game.user.id, HAND_TYPE, false);
        const to = TradingCards.getFirstDeck(game.user.id, PILE_TYPE, false);
        if (!hand || !to) {
            return;
        }
        for (const card of [...hand.cards]) {
            const choiceIndex = CardFqSystem.autoChoiceIndex(card);
            if (choiceIndex < 0) {
                continue;
            }
            await AutoCard.replayCard(card, choiceIndex, hand, to);
        }
    }

    /**
     * Rejoue une carte automatique pour le tour qui commence : le coût est
     * vérifié AVANT le jeu sur une copie résolue du choix, de sorte qu'une carte
     * que son porteur ne peut plus entretenir parte à la défausse au lieu d'être
     * jouée à crédit. Une garde du pipeline (aucune cible acquise, par exemple)
     * interrompt le rejeu du tour sans défausser la carte ni facturer quoi que
     * ce soit.
     *
     * @param {Card}   card        - La carte automatique.
     * @param {number} choiceIndex - L'indice du choix automatique dans la carte.
     * @param {Cards}  hand        - La main du porteur.
     * @param {Cards}  to          - La pile de défausse du porteur.
     *
     * @returns {Promise<void>}
     */
    static async replayCard(card, choiceIndex, hand, to) {
        const initCardContents = card.system.fq.choices;
        const cardContents = ObjectUtils.deepCopy(initCardContents);
        const cardContent = cardContents[choiceIndex];

        if (!AutoCard.canAfford(cardContent, card)) {
            return AutoCard.discardUnaffordable(card, hand, to);
        }

        // Une garde du pipeline (ciblage, bornes…) fait simplement passer son tour à
        // la carte, sans être défaussée ni rien facturer (voir `invokePlayPipeline`).
        await invokePlayPipeline(to, {to: to.id, nameContent: cardContent.name}, cardContent,
            {cardContents, hasVariables: false, initCardContents, currentCards: hand, card});
    }

    /**
     * Indique si le porteur peut encore payer le coût d'un choix automatique. La
     * copie du choix est résolue comme au jeu (bonus de caractéristiques puis
     * coûts) pour que le verdict porte sur les mêmes nombres que ceux qui seront
     * prélevés. La carte accompagne le verdict : un coût en défausse se compte
     * sur la main qui la porte, elle-même exclue du décompte.
     *
     * @param {object} cardContent - Le choix automatique, non résolu.
     * @param {Card}   card        - La carte automatique.
     *
     * @returns {boolean} True si toutes les ressources exigées sont disponibles.
     */
    static canAfford(cardContent, card) {
        const cost = CardEffect.resolveForSilentCheck(cardContent);
        return ResourceHandler.checkResources(cost, Constants.actorCurrent)
            && DiscardCost.verify(cost, card);
    }

    /**
     * Sort de la main une carte automatique devenue impayable : elle rejoint la
     * pile de défausse, comme n'importe quelle carte jouée qui a fini sa course.
     *
     * @param {Card}  card - La carte automatique.
     * @param {Cards} hand - La main du porteur.
     * @param {Cards} to   - La pile de défausse du porteur.
     *
     * @returns {Promise<void>}
     */
    static async discardUnaffordable(card, hand, to) {
        createWarning(game.i18n.format("FQCARDENGINE.InfoMsgAutoCardDiscarded",
            {cardName: game.i18n.localize(card.name)}), {actor: Constants.actorCurrent});
        await PlayCard.transferToPile(hand, to, card, {});
    }
}
