import HandBoard from "./hand-board.js";

/**
 * Gestion des barres de main : ajustement du nombre de barres, synchronisation
 * (MJ) des mains des joueurs, et redraw/restore. Extrait de la façade
 * `FqCardEngineModule` ; réassemblé par spread dans `init-engine.js`.
 */
export default {
    /**
     * Ajuste le nombre de barres de main affichées pour correspondre à `value`
     * (plafonné à `handMax`) : ajoute ou retire des instances `HandBoard`.
     *
     * @param {number} value - Le nombre de barres souhaité (nouvelle valeur du réglage).
     *
     * @returns {void}
     */
    updateHandCount: function (value) { // value is the new value of the setting
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
    }, //updates the player hands but with a delay so user flags are correctly set
    /**
     * Met à jour les mains des joueurs après un court délai, le temps que les
     * flags des utilisateurs soient correctement enregistrés.
     *
     * @returns {void}
     */
    updatePlayerHandsDelayed: function () {
        setTimeout(function () {
            FqCardEngineModule.updatePlayerHands();
        }, 500);
    }, //updates the player hands that are owned by other players (the DM)
    /**
     * (MJ) Synchronise, pour chaque barre, l'id du jeu de cartes de la main du
     * joueur associé avec le flag du MJ, puis restaure l'affichage si un changement
     * a eu lieu.
     *
     * @returns {void}
     */
    updatePlayerHands: function () {
        if (game.user.isGM) {
            let u = game.user;
            let changed = false;
            for (let i = 0; i <= FqCardEngineModule.handMiniBarList.length; i++) {
                let toolbar = FqCardEngineModule.handMiniBarList[i];
                if (!toolbar) {
                    break;
                }
                toolbar.updatePlayerBarCount();
                let uID = u.getFlag(FqCardEngineModule.moduleName, "UserID-" + toolbar.id);
                if (uID) {
                    let cardsID = game.users.get(uID).getFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.playerBarCount);
                    let userCards = u.getFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id);
                    if (userCards !== cardsID) {
                        if (cardsID) {
                            u.setFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id, cardsID);
                            changed = true;
                        } else {
                            u.unsetFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id);
                            changed = true;
                        }
                    }
                }
            }
            if (changed) {
                FqCardEngineModule.restore();
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
