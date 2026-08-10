import TradingCards, {DECK_TYPE, HAND_TYPE} from "../trading/trading-cards.js";
import {createWarning} from "../../core/utils/chat.utils.js";
import {socket} from "../../hook/integration/socketlib.hook.js";

/**
 * Action FQ déclenchée par les hooks Foundry pendant le changement d'état du combat : réinitialisation des
 * ressources (action, zèle, défausses, squelettes) au fil des rounds, pioche de
 * la main et des cartes de base, gestion de l'épuisement et suppression des
 * effets expirés. La plupart des opérations ne s'exécutent que pour le premier
 * MJ actif afin d'éviter les doublons.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class CombatTurn {
    /**
     * Supprime les effets temporaires expirés (durée restante ≤ 0) de l'acteur fourni.
     * Appelé au changement de tour avec l'acteur du combattant COURANT : la suppression
     * intervient ainsi au DÉBUT DU TOUR de l'acteur affecté (et non à la frontière de
     * round), en cohérence avec l'expiry natif `turnStart` de Foundry v14 — le cœur
     * calcule déjà `duration.remaining` ; on ne fait que déclencher la suppression au
     * bon moment, pour le bon acteur.
     *
     * @param {Actor} [actor] - L'acteur dont on purge les effets expirés (no-op si absent).
     *
     * @returns {Promise<void>}
     */
    static async deleteExpiredEffects(actor) {
        const expiredEffects = (actor?.appliedEffects ?? [])
            .filter((x) =>
                (x.isTemporary &&
                    x.duration.remaining != null &&
                    x.duration.remaining <= 0)
            );

        await Promise.all(expiredEffects.map((x) => x.delete()));
    }

    /**
     * Indique si l'utilisateur local est le premier MJ actif (celui qui doit
     * exécuter les opérations partagées). Avertit si aucun MJ n'est connecté.
     *
     * @returns {boolean} True si l'utilisateur local est le premier MJ actif.
     */
    static isLocalUserFirstActiveGM() {
        if (game.user == null || game.users == null || game.users.activeGM == null) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.GMMustBeConnected"));
            return false;
        }
        return game.userId === game.users.activeGM.id;
    }

    /**
     * Réinitialise les points d'action de chaque combattant à leur maximum.
     *
     * @param {object[]} combatants - Les combattants du combat.
     *
     * @returns {void}
     */
    static resetAction(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.action.value": combatant.actor.system.fq.action?.max});
        });
    }

    /**
     * Réinitialise le zèle de chaque combattant à sa valeur initiale.
     *
     * @param {object[]} combatants - Les combattants du combat.
     *
     * @returns {void}
     */
    static resetZeal(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.zeal.value": combatant.actor.system.fq.zeal?.init});
        });
    }

    /**
     * Remet à 0 le compteur de défausses courantes de chaque combattant.
     *
     * @param {object[]} combatants - Les combattants du combat.
     *
     * @returns {void}
     */
    static resetCurrentDropCard(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.cards.currentDrop": 0});
        });
    }

    /**
     * Remet à 0 le compteur de squelettes sacrifiés de chaque combattant.
     *
     * @param {object[]} combatants - Les combattants du combat.
     *
     * @returns {void}
     */
    static resetSacrificedSkeleton(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.special.sacrificedSkeleton": 0});
        });
    }

    /**
     * Rappelle toutes les cartes de tous les decks FQ (retour des cartes jouées),
     * puis redistribue les cartes de base. Réservé au premier MJ actif.
     *
     * @returns {Promise<void>}
     */
    static async resetCards() {
        if (CombatTurn.isLocalUserFirstActiveGM()) {
            for (const deck of game.cards
                .filter(c => c.system.fq.type === DECK_TYPE)) {
                await deck.recall({chatNotification: false});
            }
            CombatTurn.drawBaseCards();
        }
    }

    /**
     * Distribue à chaque utilisateur, depuis son deck vers sa main, les cartes de
     * base (`isBase`) non encore piochées. Réservé au premier MJ actif.
     *
     * @returns {void}
     */
    static drawBaseCards() {
        if (CombatTurn.isLocalUserFirstActiveGM()) {
            game.users.forEach(user => {
                const deck = TradingCards.getFirstDeck(user?.id, DECK_TYPE, false);
                const hand = TradingCards.getFirstDeck(user?.id, HAND_TYPE, false);
                if (user && deck && hand) {
                    const allBaseCardsNotDrawned = deck.cards.filter(c => c.system?.fq?.isBase && !c.drawn).map(c => c.id);
                    if (allBaseCardsNotDrawned.length > 0) {
                        deck.pass(hand, allBaseCardsNotDrawned, {chatNotification: false});
                    }
                }
            });
        }

    }

    /**
     * Fait piocher à chaque combattant associé à un utilisateur sa main de départ
     * (nombre de cartes défini par `fq.cards.hand`). La pioche s'exécute côté
     * joueur s'il est connecté, sinon côté MJ via socket.
     *
     * @param {object[]} combatants - Les combattants du combat.
     *
     * @returns {Promise<void>}
     */
    static async drawHand(combatants) {
        // get users with actors
        const users = game.users.filter(user => user.character?.id);
        for (const combatant1 of combatants
            .filter(combatant => users.filter(user => user.character?.id === combatant.actor.id).length === 1)) {
            const user = users.find(user => user.character.id === combatant1.actor.id);
            const deck = TradingCards.getFirstDeck(user?.id, DECK_TYPE);
            const hand = TradingCards.getFirstDeck(user?.id, HAND_TYPE);
            if (user && deck && hand) {
                if (user.active) {
                    await socket.executeAsUser("drawCard", user.id, hand.id, deck.id, combatant1.actor.system.fq.cards.hand);
                } else {
                    await socket.executeAsGM("drawCard", hand.id, deck.id, combatant1.actor.system.fq.cards.hand);
                }
            }
        }
    }

    /**
     * Fait piocher à un joueur `pickScore` cartes de son deck vers sa main en
     * début de tour. Applique les dégâts d'épuisement s'il y a lieu, ou avertit
     * si le score de pioche est nul.
     *
     * @param {object} user      - L'utilisateur qui pioche.
     * @param {object} actor     - Le personnage de l'utilisateur.
     * @param {Cards}  hand      - La main de destination.
     * @param {Cards}  deck      - Le deck source.
     * @param {number} pickScore - Le nombre de cartes à piocher.
     *
     * @returns {Promise<void>}
     */
    static async drawPick(user, actor, hand, deck, pickScore) {
        if (pickScore > 0) {
            if (user.active) {
                await socket.executeAsUser("drawCard", user.id, hand.id, deck.id, pickScore);
            } else {
                await socket.executeAsGM("drawCard", hand.id, deck.id, pickScore);
            }
            if (actor.system.attributes.exhaustion > 0) {
                actor.update({
                    "system.attributes.hp.value": actor.system.attributes.hp.value
                        - actor.system.attributes.exhaustion
                });
            }
        } else {
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgNoPickScore"), {actor});
        }
    }
}
