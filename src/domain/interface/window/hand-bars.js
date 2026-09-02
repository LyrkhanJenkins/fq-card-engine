import HandBoard from "./hand-board.js";

/**
 * Gestion des barres de main : ajustement du nombre de barres, synchronisation
 * (MJ) des mains des joueurs, et redraw/restore. Extrait de la façade
 * `FqCardEngineModule` ; réassemblé par spread dans `init-engine.js`.
 */
export default {
    /**
     * Ajuste le nombre de barres de main affichées pour correspondre à `value`
     * (plafonné à `handMax`) : ajoute ou retire des instances `HandBoard`. Un
     * joueur non-MJ est ramené inconditionnellement à 1 barre (D1-05), quelle
     * que soit la valeur demandée — couvre notamment le cas où le réglage
     * `HandCount` (scope client, `config: true`) serait changé par le menu natif
     * de réglages Foundry plutôt que par les boutons +/- désormais masqués.
     *
     * @param {number} value - Le nombre de barres souhaité (nouvelle valeur du réglage).
     *
     * @returns {void}
     */
    updateHandCount: function (value) { // value is the new value of the setting
        if (!game.user.isGM) {
            value = 1;
        }
        if (value > FqCardEngineModule.handMax) {
            value = FqCardEngineModule.handMax;
        }
        //add more
        if (value == FqCardEngineModule.handMiniBarList.length) {
            //do nothing
        } else if (value > FqCardEngineModule.handMiniBarList.length) {
            let more = value - FqCardEngineModule.handMiniBarList.length;
            for (let i = 0; i < more; i++) {
                FqCardEngineModule.handMiniBarList.push(new HandBoard(FqCardEngineModule.handMiniBarList.length));
            }
        } else {//remove some may need additional cleanup
            let less = FqCardEngineModule.handMiniBarList.length - value;
            for (let i = 0; i < less; i++) {
                FqCardEngineModule.handMiniBarList.pop().remove();
            }
        }
    },
    /**
     * Redessine les cartes de toutes les barres de main.
     *
     * @returns {void}
     */
    rerender: function () {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.renderCards();
        });
    },
    /**
     * Restaure l'état persistant de toutes les barres de main.
     *
     * @returns {void}
     */
    restore: function () {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.restore();
        });
    },
    /**
     * Recalcule l'indice de barre par joueur pour toutes les barres de main.
     *
     * @returns {void}
     */
    updatePlayerBarCounts() {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.updatePlayerBarCount();
        });
    },
};
