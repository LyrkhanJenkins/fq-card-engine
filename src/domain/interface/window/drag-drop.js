import Constants from "../../constants.js";

/**
 * Glisser-déposer des cartes entre barres de main. Extrait de la façade
 * `FqCardEngineModule` ; réassemblé par spread dans `init-engine.js`.
 *
 * NB : `drag`/`drop`/`attachDragDrop` sont invoqués par `hand-board.js` avec
 * `this` lié à l'instance `HandBoard` (`FqCardEngineModule.drop.call(this, …)`),
 * d'où `this.getCards()` dans `drop`. Ce contrat `this` est préservé tel quel.
 */
export default {
    //Attach for dragging cards from the toolbar
    /**
     * Branche le glisser-déposer des cartes sur un élément HTML de barre, en
     * autorisant le début de glisser et en déléguant aux gestionnaires `drag`/`drop`.
     *
     * @param {HTMLElement} html - L'élément racine sur lequel activer le glisser-déposer.
     *
     * @returns {void}
     */
    attachDragDrop: function (html) {
        let t = this;
        let dragDrop = new foundry.applications.ux.DragDrop.implementation({
            dragSelector: ".fq-card-engine-card, .fq-card-engine-window-card", dropSelector: undefined, permissions: {
                dragstart: function () {
                    return true;
                }
            }, callbacks: {
                dragstart: t.drag.bind(t), drop: t.drop.bind(t)
            }
        });
        dragDrop.bind(html);
    },

    /**
     * Prépare les données de transfert au début du glisser d'une carte (id, uuid,
     * id du jeu source) et les sérialise dans l'événement.
     *
     * @param {DragEvent} event - L'événement de début de glisser.
     *
     * @returns {void}
     */
    drag: function (event) {
        const id = $(event.currentTarget).data("card-id");
        const cardsid = $(event.currentTarget).data("cards-id");
        const uuid = $(event.currentTarget).data("card-uuid");

        // Create drag data
        const dragData = {
            id: id,//id required
            type: "Card", cardsId: cardsid, cardId: id, uuid: uuid
        };

        // Set data transfer
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    },

    /**
     * Gère le dépôt d'une carte sur une main : transfère la carte depuis sa source
     * (par uuid ou par ids) si elle n'est pas déjà présente, puis réordonne les
     * cartes à l'emplacement du dépôt.
     *
     * @param {DragEvent} event - L'événement de dépôt.
     *
     * @returns {*} La promesse de transfert le cas échéant, sinon undefined.
     */
    drop: function (event) {
        let cards = this.getCards();
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (data.type !== "Card") return;

        // Sous droits limités, un joueur peut encore réordonner sa main mais n'y
        // fait entrer aucune carte venue d'ailleurs. Une carte de la main a une
        // uuid préfixée par celle de la main, ou, sans uuid, le même jeu source.
        const fromThisHand = data.uuid
            ? data.uuid.startsWith(`${cards.uuid}.`)
            : data.cardsId === cards.id;
        if (Constants.isPlayerRightsLimited && !fromThisHand) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropPlayerRightsLimited"));
            return;
        }

        //SORT
        let sort = function (card) {
            const closest = event.target.closest("[data-card-id]");
            if (closest) {
                const siblings = cards.cards.filter(c => (c.id ?? c._id) !== card.id);
                const target = cards.cards.get(closest.dataset.cardId);
                const updateData = SortingHelpers.performIntegerSort(card, {target, siblings}).map(u => {
                    return {_id: u.target.id, sort: u.update.sort};
                });
                cards.updateEmbeddedDocuments("Card", updateData);
            }
        };

        if (data.uuid) {
            fromUuid(data.uuid).then(function (card) {
                if (!card) {
                    ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropUUIDError"));
                    return;
                }
                let cardList = [];
                cardList.push(card._id);

                let exists = cards.cards.filter(c => c._id === card._id);
                if (exists.length == 0) {
                    card.parent.pass(cards, cardList, {chatNotification: !CONFIG.FqCardEngine.options.hideMessages})
                        .then(() => {
                            sort(card);
                        })
                        .catch(() => {
                            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropError"));
                        });
                } else {
                    sort(card);
                }
            }).catch(function () {
                ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropError"));
            });
        } else {
            const source = game.cards.get(data.cardsId);
            const card = source.cards.get(data.cardId);
            //if the card does not already exist in this hand then pass it to it
            let exists = cards.cards.filter(c => c.id === card.id);
            if (exists.length == 0) {
                return card.pass(cards, {chatNotification: !CONFIG.FqCardEngine.options.hideMessages}).then(function () {
                    sort(card);
                }, function (error) {
                    ui.notifications.error(error);
                });
            } else {//already a part of the hand, just sort
                sort(card);
            }
        }
    },
};
