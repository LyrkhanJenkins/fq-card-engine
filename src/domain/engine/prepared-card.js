import Constants, {PREPARED_COLOR, PREPARED_FLAG} from "../constants.js";
import CardCondition from "./shared/card-condition.js";
import CardEffect from "./shared/card-effect.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";
import ResourceHandler from "./shared/resource-handler.js";
import TradingCards, {HAND_TYPE, PILE_TYPE} from "../trading/trading-cards.js";
import ObjectUtils from "../../core/utils/object.utils.js";
import {createStatus} from "../../core/utils/chat.utils.js";
import {invokePlayPipeline} from "./shared/card-replay.js";

/**
 * Cartes réactives préparées : à son propre tour, un joueur ne peut pas jouer
 * une carte réactive (règle inchangée) — il la PRÉPARE. La carte reste en main,
 * marquée, et le moteur la joue seul dès que ses conditions sont réunies hors
 * de son tour, au moment même où le halo orange se serait allumé.
 *
 * Le déclenchement s'appuie donc sur le MÊME verdict que la mise en évidence de
 * la main (`CardCondition.isReactiveReady`) : ce que le halo promet est ce que
 * la préparation joue. Aux conditions de carte s'ajoutent, en évaluation
 * SILENCIEUSE, les gardes qui feraient échouer le jeu — coût des ressources et
 * ciblage — afin qu'une carte préparée attende son heure au lieu d'échouer
 * bruyamment à chaque événement de combat.
 *
 * Le jeu s'exécute sur le client du PORTEUR — le pipeline lit le personnage de
 * l'utilisateur courant et ses cibles — et emprunte le chemin commun à toutes
 * les cartes (`playValidatedCard`), appelé via la façade globale pour ne pas
 * fermer le cycle `engine` → `interface`.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class PreparedCard {

    /**
     * Verrou de déclenchement : le jeu d'une carte est asynchrone (dés, effets,
     * transferts) alors que les événements de combat qui déclenchent l'examen
     * arrivent en rafale. Sans ce verrou, une même carte serait jouée deux fois
     * avant que son drapeau ne soit retiré.
     * @type {boolean}
     */
    static triggering = false;

    /**
     * Indique si un choix peut être préparé : il doit être réactif, et son
     * ciblage doit se passer de toute acquisition au moment du jeu. Les zones
     * (pose interactive), les ciblages « Adjacent » et « Combat » (acquisition
     * qui écrase les cibles du joueur) sont donc exclus : leur déclenchement
     * automatique manipulerait le canvas ou les cibles hors de tout geste du
     * joueur. Un choix préparé se joue sur les cibles présentes à l'instant du
     * déclenchement, exactement comme s'il était joué à la main.
     *
     * @param {object} [choice] - Le choix (contenu) d'une carte.
     *
     * @returns {boolean} True si le choix peut être préparé.
     */
    static isPreparable(choice) {
        if (!choice?.reactive) {
            return false;
        }
        const targetType = choice.targetType ?? CardFqSystem.TARGET_TYPE_DEFAULT;
        return targetType === CardFqSystem.TARGET_TYPE_DEFAULT
            || targetType === CardFqSystem.TARGET_TYPE_SKELETON;
    }

    /**
     * Indique si l'utilisateur local est dans la situation où l'on prépare une
     * carte au lieu de la jouer : un combat est en cours et c'est le tour de son
     * personnage — le seul moment où une carte réactive est refusée au jeu.
     *
     * @returns {boolean} True si c'est le tour du personnage de l'utilisateur local.
     */
    static isOwnTurn() {
        return !!game.combat && game.combat.combatant?.actor?.id === Constants.myId;
    }

    /**
     * Retourne l'instantané de préparation d'une carte, ou undefined.
     *
     * @param {Card} [card] - La carte.
     *
     * @returns {object|undefined} L'instantané `{fd, toId}` de la préparation.
     */
    static getPreparation(card) {
        return card?.flags?.[globalThis.FqCardEngineModule?.moduleName]?.[PREPARED_FLAG] ?? undefined;
    }

    /**
     * Indique si une carte est préparée.
     *
     * @param {Card} [card] - La carte.
     *
     * @returns {boolean} True si la carte porte une préparation.
     */
    static isPrepared(card) {
        return !!PreparedCard.getPreparation(card);
    }

    /**
     * Prépare une carte : mémorise sur elle le choix retenu, les variables X/Y
     * saisies et la défausse cible. Aucune ressource n'est prélevée — le coût se
     * paie au déclenchement, par le pipeline de jeu, comme pour n'importe quelle
     * carte.
     *
     * @param {Card}   card - La carte à préparer.
     * @param {object} fd   - Les données du formulaire du dialogue (XXX, YYY, nameContent, down…).
     * @param {Cards}  to   - La pile de défausse cible retenue.
     *
     * @returns {Promise<void>}
     */
    static async prepare(card, fd, to) {
        await card.setFlag(globalThis.FqCardEngineModule.moduleName, PREPARED_FLAG, {
            fd: {...fd}, toId: to?.id ?? null
        });
        createStatus(game.i18n.format("FQCARDENGINE.InfoMsgCardPrepared",
            {cardName: game.i18n.localize(card.name)}), {actor: Constants.actorCurrent, color: PREPARED_COLOR});
    }

    /**
     * Annule la préparation d'une carte. Sans effet si la carte n'est pas
     * préparée.
     *
     * @param {Card} card - La carte concernée.
     *
     * @returns {Promise<void>}
     */
    static async cancel(card) {
        if (!PreparedCard.isPrepared(card)) {
            return;
        }
        await card.unsetFlag(globalThis.FqCardEngineModule.moduleName, PREPARED_FLAG);
    }

    /**
     * Examine les cartes préparées de la main de l'utilisateur local et joue
     * celles dont les conditions sont réunies. Ne fait RIEN pendant le tour du
     * personnage de l'utilisateur : une carte réactive ne se déclenche jamais
     * durant son propre tour, et aucune condition n'y est même évaluée.
     *
     * @returns {Promise<void>}
     */
    static async triggerPreparedCards() {
        if (PreparedCard.triggering || !Constants.actorCurrent || !game.combat || PreparedCard.isOwnTurn()) {
            return;
        }
        const hand = TradingCards.getFirstDeck(game.user.id, HAND_TYPE, false);
        if (!hand) {
            return;
        }
        PreparedCard.triggering = true;
        try {
            for (const card of [...hand.cards]) {
                if (PreparedCard.isPrepared(card)) {
                    await PreparedCard.#triggerCard(card, hand);
                }
            }
        } finally {
            PreparedCard.triggering = false;
        }
    }

    /**
     * Joue une carte préparée si son heure est venue. La préparation est retirée
     * AVANT le jeu : une garde tardive du pipeline ne doit pas laisser la carte
     * armée, sous peine de rejouer le même échec à chaque événement de combat.
     * Le joueur reste libre de la préparer à nouveau.
     *
     * @param {Card}  card - La carte préparée.
     * @param {Cards} hand - La main du porteur.
     *
     * @returns {Promise<void>}
     */
    static async #triggerCard(card, hand) {
        const preparation = PreparedCard.getPreparation(card);
        const fd = preparation.fd ?? {};
        const initCardContents = card.system.fq?.choices ?? [];
        const choiceIndex = Math.max(0, initCardContents.findIndex(cc => cc.name === fd.nameContent));
        const choice = initCardContents[choiceIndex];

        // La carte a changé depuis sa préparation (choix renommé, réactivité
        // retirée) : la préparation ne veut plus rien dire.
        if (!PreparedCard.isPreparable(choice)) {
            return PreparedCard.cancel(card);
        }
        if (CardFqSystem.isPlayedThisRound(choice)) {
            return;
        }
        if (!CardCondition.isReactiveReady(choice, card, {xValue: fd.XXX ?? 1, yValue: fd.YYY ?? 1})) {
            return;
        }

        const cardContents = ObjectUtils.deepCopy(initCardContents);
        const cardContent = cardContents[choiceIndex];
        const {hasVariables} = CardFqSystem.choiceVariables(initCardContents[0]);
        if (!PreparedCard.canPlayNow(cardContent, fd, hasVariables)) {
            return;
        }

        const to = game.cards.get(preparation.toId) ?? TradingCards.getFirstDeck(game.user.id, PILE_TYPE, false);
        if (!to) {
            return;
        }

        await PreparedCard.cancel(card);
        // Une garde du pipeline (bornes X/Y, sbires…) laisse simplement la
        // préparation retombée : le joueur est averti et peut la refaire
        // (voir `invokePlayPipeline`).
        await invokePlayPipeline(to, {...fd, to: to.id}, cardContent,
            {cardContents, hasVariables, initCardContents, currentCards: hand, card});
    }

    /**
     * Verdict SILENCIEUX de jouabilité immédiate d'un choix préparé : coût des
     * ressources et ciblage, évalués sur une copie résolue comme au jeu (bonus
     * de caractéristiques, variables X/Y, données dérivées) pour porter sur les
     * mêmes nombres que ceux qui seront prélevés. Aucun message n'est publié :
     * ce verdict est rendu à chaque événement de combat.
     *
     * @param {object}  cardContent  - Le choix préparé, non résolu (copie de travail).
     * @param {object}  fd           - L'instantané du formulaire de la préparation.
     * @param {boolean} hasVariables - True si la carte porte des variables X/Y libres.
     *
     * @returns {boolean} True si la carte peut être jouée à cet instant.
     */
    static canPlayNow(cardContent, fd, hasVariables) {
        const resolved = CardEffect.resolveForSilentCheck(cardContent, {hasVariables, xValue: fd.XXX, yValue: fd.YYY});

        if (!ResourceHandler.checkResources(resolved, Constants.actorCurrent, {silent: true})) {
            return false;
        }
        // Même garde de ciblage que `playValidatedCard`, au même endroit du
        // raisonnement : sans portée déclarée, la carte ne contrôle pas ses cibles.
        if (!resolved.minReach && !resolved.maxReach) {
            return true;
        }
        const {verdict} = ResourceHandler.evaluateTargeting(
            Constants.actorCurrent, resolved.nbTargets, resolved.minReach, resolved.maxReach, resolved.targetType);
        return verdict === ResourceHandler.TARGETING_VERDICT.OK;
    }
}
