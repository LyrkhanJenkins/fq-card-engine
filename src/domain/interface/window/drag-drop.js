import Constants from "../../constants.js";

/**
 * Règle de « Limitation des droits du joueur » sur un dépôt de carte : rien de
 * ce qui vient d'un compendium ne se dépose, quel que soit le type de données
 * glissées, et une carte n'entre dans une pile que si elle en vient déjà (le
 * tri reste permis). Source UNIQUE de la règle : la barre de main
 * (`drop`) et les feuilles de `Cards` (`restrictCardsConfigDrop`) la partagent,
 * pour qu'une évolution ne laisse jamais l'un des deux chemins plus permissif.
 *
 * Une carte de la pile a une uuid préfixée par celle de la pile, ou, sans uuid,
 * le même jeu source.
 *
 * Le refus est publié à l'utilisateur ; le MJ n'est jamais concerné.
 *
 * @param {object} data  - Les données glissées (`getDragEventData`).
 * @param {Cards}  stack - La pile qui reçoit le dépôt.
 *
 * @returns {boolean} True si le dépôt est refusé (l'appelant doit s'arrêter).
 */
export function refuseRestrictedDrop(data, stack) {
    if (!Constants.isPlayerRightsLimited) {
        return false;
    }
    if (data.uuid?.startsWith("Compendium.") || data.pack) {
        ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropCompendiumRefused"));
        return true;
    }
    if (data.type !== "Card") {
        return false;
    }
    const fromThisStack = data.uuid
        ? data.uuid.startsWith(`${stack.uuid}.`)
        : data.cardsId === stack.id;
    if (!fromThisStack) {
        ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropPlayerRightsLimited"));
        return true;
    }
    return false;
}

/**
 * Enveloppe libWrapper du `_onDrop` des feuilles de `Cards` (deck, main,
 * défausse et `FqCardsSheet` héritent de ce gestionnaire) : sous droits limités,
 * un joueur ne fait passer aucune carte d'un jeu à un autre en la déposant sur
 * une feuille ; le tri reste permis. Les `pass` du moteur appellent
 * `Cards#pass` directement et ne passent pas par ici.
 *
 * Appelée par libWrapper avec `this` lié à la feuille.
 *
 * @param {Function}  wrapper - Le gestionnaire d'origine.
 * @param {DragEvent} event   - L'événement de dépôt.
 * @param {...*}      args    - Les arguments suivants du gestionnaire d'origine.
 *
 * @returns {*} Le résultat du gestionnaire d'origine, ou undefined si le dépôt est refusé.
 */
export function restrictCardsConfigDrop(wrapper, event, ...args) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (refuseRestrictedDrop(data, this.document)) {
        return;
    }
    return wrapper(event, ...args);
}

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

        // Sous droits limités, rien ne vient d'un compendium et aucune carte
        // étrangère n'entre dans la main : seul le tri reste permis.
        if (refuseRestrictedDrop(data, cards)) return;
        if (data.type !== "Card") return;

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
