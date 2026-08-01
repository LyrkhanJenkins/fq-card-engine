import DeckUtils, {DECK_TYPE, SPELLBOOK_TYPE} from "../../utils/deck-utils.js";

export default class FqCardsSheet extends foundry.applications.sheets.CardDeckConfig {
    constructor(object, options) {
        super(object, options);
    }
    #deckHooks;

    /** @override */
    static PARTS = {
        header: {template: "templates/cards/deck/header.hbs"},
        tabs: {template: "templates/generic/tab-navigation.hbs"},
        details: {template: "templates/cards/deck/details.hbs"},
        cards: {template: `modules/fq-card-engine/src/templates/fq-form/cards/cards.hbs`, scrollable: ["ol[data-cards]"]},
        footer: {template: "templates/generic/form-footer.hbs"}
    };


    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            fqDeleteCard: FqCardsSheet.#onDeleteCard,
            fqMoveCardDeck: FqCardsSheet.#onMoveCardDeck
        }
    };

    /** @inheritDoc */
    _prepareButtons() {
        if (game.user.isGM) {
            return super._prepareButtons();
        } else {
            return super._prepareButtons().filter((button) => button.type !== "submit");
        }
    }

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        const partContext = await super._preparePartContext(partId, context, options);
        if (partId === "cards") {
            partContext.isYourDeck = (partContext?.document.system?.fq?.type === DECK_TYPE && partContext?.document.system?.fq?.owner === game.user.id);
            partContext.isYourSpellbook = (partContext?.document.system?.fq?.type === SPELLBOOK_TYPE && partContext?.document.system?.fq?.owner === game.user.id);

            if (partContext.isYourSpellbook) {
                const deck = DeckUtils.getFirstDeck(game.user.id, DECK_TYPE, false);
                for (const cardCtx of partContext.cards) {
                    const maxSameCard = cardCtx.system?.fq?.maxSameCard;
                    cardCtx.isMaxReached = deck && Number.isFinite(maxSameCard)
                        ? deck.cards.filter(c => c.name === cardCtx.name).length >= maxSameCard
                        : false;
                }
            }
        }
        return partContext;
    }

    /**
     * Action handler pour la suppression d'une carte, sans dialog de confirmation native.
     * @this {FqCardsSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onDeleteCard(event, target) {
        const li = target.closest("[data-card-id]");
        const card = this.document.cards.get(li?.dataset.cardId);
        if (!card) return;
        await card.delete();
    }

    /**
     * Action handler pour le déplacement d'une carte vers le deck du joueur courant
     * @param event
     * @param target
     * @returns {Promise<void>}
     */
    static async #onMoveCardDeck(event, target) {
        if (target.classList.contains("disabled") || target.classList.contains("locked")) return;

        const li = target.closest("[data-card-id]");
        const card = this.document.cards.get(li?.dataset.cardId);
        let deck = DeckUtils.getFirstDeck(game.user.id, DECK_TYPE, false);
        if (!card ||! deck) return;

        target.classList.add("locked"); // verrou temporaire, distinct de "disabled"
        setTimeout(() => target.classList.remove("locked"), 300);

        card.pass(deck, [card.id], {
            action: "pass",
            chatNotification: false,
        }).catch(err => {
            return ui.notifications.error(err.message);
        });
    }

    /** @inheritDoc */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);

        const handler = this.#onDeckCardChange.bind(this);
        this.#deckHooks = {
            createCard: Hooks.on("createCard", handler),
            updateCard: Hooks.on("updateCard", handler),
            deleteCard: Hooks.on("deleteCard", handler)
        };
    }

    /** @inheritDoc */
    _onClose(options) {
        super._onClose(options);
        for (const [hookName, hookId] of Object.entries(this.#deckHooks ?? {})) {
            Hooks.off(hookName, hookId);
        }
    }
    /**
     * Re-render la sheet si la carte modifiée appartient au deck concerné.
     * @param {Card} card
     */
    #onDeckCardChange(card) {
        const deck = DeckUtils.getFirstDeck(game.user.id, DECK_TYPE, false);
        if (deck && card.parent?.id === deck.id) {
            this.render();
        }
    }
}
