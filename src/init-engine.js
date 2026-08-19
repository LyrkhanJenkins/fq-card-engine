import Constants from "./domain/constants.js";
import HandBoard from "./domain/interface/window/hand-board.js";
import TradingCards from "./domain/trading/trading-cards.js";
import CharGauges from "./domain/interface/window/char-gauges.js";
import BoardLayout from "./domain/interface/window/board-layout.js";
import HandBars from "./domain/interface/window/hand-bars.js";
import CardActions from "./domain/interface/window/card-actions.js";
import DragDrop from "./domain/interface/window/drag-drop.js";
import WeaponDamage from "./domain/engine/roll/weapon-damage.js";
import CardCondition from "./domain/engine/shared/card-condition.js";

CONFIG.FqCardEngine = {
    options: {
        rollInitiative: false,
        playerLimitCardsRight: false,
        betterChatMessages: false,
        hideMessages: false,
        faceUpMode: false,
        cardClick: "play_card"
    }, documentClass: HandBoard
};

// Façade globale : agrège l'état du module et les modules `window/` par spread.
// L'interface publique `window.FqCardEngineModule.*` (macros, templates,
// hand-board) et le binding `this` des méthodes sont préservés à l'identique.
window.FqCardEngineModule = {
    cst: Constants,
    cond: CardCondition,
    handMiniBarList: new Array(),
    moduleName: "fq-card-engine",
    eventName: "module.fq-card-engine",
    handMax: 10,
    pendingShuffleReveal: null,

    ...CharGauges,
    ...BoardLayout,
    ...HandBars,
    ...CardActions,
    ...DragDrop,

    /**
     * Entrée macro : utilise les armes équipées du combattant courant si un combat
     * est démarré et que c'est le tour d'un token contrôlé par l'utilisateur
     * (délégué à `WeaponDamage.useEquippedWeapons`). Avertit sinon.
     *
     * @returns {void}
     */
    rollCurrentCombattantWeaponDamage() {
        const actor = game.combat?.started ? game.combat.combatant?.actor : undefined;
        if (!actor?.isOwner) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgPlayOutOfHisRound"));
            return;
        }
        WeaponDamage.useEquippedWeapons(actor);
    },

    /**
     * Met à jour les decks d'un utilisateur (délégué à `Deck.updateDeckForUser`).
     *
     * @param {string} currentUserId - L'id de l'utilisateur cible.
     *
     * @returns {Promise<void>}
     */
    async updateDeckForUser(currentUserId) {
        await TradingCards.updateDeckForUser(currentUserId);
    },

    /**
     * Supprime les decks d'un utilisateur (délégué à `Deck.deleteDeckForUser`).
     *
     * @param {string} currentUserId - L'id de l'utilisateur cible.
     *
     * @returns {Promise<void>}
     */
    async deleteDeckForUser(currentUserId) {
        await TradingCards.deleteDeckForUser(currentUserId);
    }
};
