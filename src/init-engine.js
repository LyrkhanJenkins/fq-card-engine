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
import ZoneWall from "./domain/engine/shared/zone-wall.js";
import {socket} from "./hook/integration/socketlib.hook.js";
import {fqClassIds, hasFqClass, registerFqClass, unregisterFqClass} from "./domain/classes.js";

CONFIG.FqCardEngine = {
    options: {
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
    /**
     * Entrée des scripts de carte pour les ouvrages permanents :
     * `FqCardEngineModule.walls.fromZone(cardContent, {strokeColor, fillColor, fillAlpha})`
     * dresse des murs (déplacement + vue) sur la zone posée, avec un dessin.
     * Pas d'`await` dans un `executeEval` : l'appel part sans être attendu.
     */
    walls: {
        fromZone: (cardContent, style) => ZoneWall.requestFromZone(socket, cardContent, style)
    },
    handBarList: new Array(),

    /**
     * Registre des classes FQ, ouvert aux modules de contenu : `registerClass`
     * declare une classe (identifiant, cle de libelle), `unregisterClass` la
     * retire, `hasClass` et `classIds` interrogent ce qui est disponible dans le
     * monde courant.
     *
     * A appeler depuis le hook `init` du module appelant : le schema de carte est
     * fige a la premiere carte instanciee, et n'enregistre plus rien ensuite.
     */
    registerClass: registerFqClass,
    unregisterClass: unregisterFqClass,
    hasClass: hasFqClass,
    classIds: fqClassIds,

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
     * Entrée macro : utilise la première arme équipée du type demandé (`@wpnM`
     * mêlée / `@wpnR` distance) du combattant courant si un combat est démarré et
     * que c'est le tour d'un token contrôlé par l'utilisateur (délégué à
     * `WeaponDamage.useFirstEquippedWeapon`). Avertit sinon.
     *
     * @param {string} weaponToken - Le jeton d'arme (clé de `WEAPON_TOKENS`).
     *
     * @returns {void}
     */
    rollCurrentCombattantWeaponDamage(weaponToken) {
        const actor = game.combat?.started ? game.combat.combatant?.actor : undefined;
        if (!actor?.isOwner) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgPlayOutOfHisRound"));
            return;
        }
        WeaponDamage.useFirstEquippedWeapon(actor, weaponToken);
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
