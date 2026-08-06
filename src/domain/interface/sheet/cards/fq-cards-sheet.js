import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../../../trading/trading-cards.js";
import DisplayCard from "../../shared/display-card.js";

/**
 * Feuille de configuration d'un jeu de cartes (deck / spellbook) FQ.
 * Étend `CardDeckConfig` en ajoutant un onglet « cards » personnalisé, des actions
 * FQ (suppression sans confirmation, déplacement d'une carte vers le deck du joueur)
 * et un rafraîchissement automatique lorsqu'une carte du deck concerné change.
 *
 * @extends foundry.applications.sheets.CardDeckConfig
 */
export default class FqCardsSheet extends foundry.applications.sheets.CardDeckConfig {
    /**
     * @param {object} object  - Le document Cards (deck) associé à la feuille.
     * @param {object} options - Les options de l'application Foundry.
     */
    constructor(object, options) {
        super(object, options);
    }

    /**
     * Identifiants des hooks de carte enregistrés à l'ouverture, retirés à la
     * fermeture pour éviter les fuites de listeners.
     * @type {{createCard: number, updateCard: number, deleteCard: number}}
     */
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
            fqMoveCardDeck: FqCardsSheet.#onMoveCardDeck,
            fqViewCard: FqCardsSheet.#onViewCard
        }
    };

    /**
     * Prépare les boutons du pied de formulaire. Retire le bouton de soumission
     * pour les joueurs non-MJ afin de les empêcher d'enregistrer la configuration.
     *
     * @inheritDoc
     * @returns {object[]} La liste des boutons à afficher.
     */
    _prepareButtons() {
        if (game.user.isGM) {
            return super._prepareButtons();
        } else {
            return super._prepareButtons().filter((button) => button.type !== "submit");
        }
    }

    /**
     * Enrichit le contexte de la partie « cards » : détermine si le deck affiché
     * est le deck ou le grimoire (spellbook) du joueur courant, et marque les
     * cartes du grimoire déjà présentes en nombre maximal dans le deck (`isMaxReached`).
     *
     * @inheritDoc
     * @param {string} partId  - L'identifiant de la partie de gabarit en cours de rendu.
     * @param {object} context - Le contexte de rendu partagé.
     * @param {object} options - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte de la partie, enrichi pour « cards ».
     */
    async _preparePartContext(partId, context, options) {
        const partContext = await super._preparePartContext(partId, context, options);
        if (partId === "cards") {
            partContext.isYourDeck = (partContext?.document.system?.fq?.type === DECK_TYPE && partContext?.document.system?.fq?.owner === game.user.id);
            partContext.isYourSpellbook = (partContext?.document.system?.fq?.type === SPELLBOOK_TYPE && partContext?.document.system?.fq?.owner === game.user.id);

            if (partContext.isYourSpellbook) {
                const deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE, false);
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
     * Action handler pour le déplacement d'une carte du grimoire vers le deck du
     * joueur courant. Ignoré si la cible est désactivée ou verrouillée ; pose un
     * verrou temporaire (300 ms) pour éviter les doubles clics.
     *
     * @this {FqCardsSheet}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  target - L'élément portant l'action (repère la carte via `data-card-id`).
     *
     * @returns {Promise<void>}
     */
    static async #onMoveCardDeck(event, target) {
        if (target.classList.contains("disabled") || target.classList.contains("locked")) return;

        const li = target.closest("[data-card-id]");
        const card = this.document.cards.get(li?.dataset.cardId);
        let deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE, false);
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

    /**
     * Action handler : affiche la carte cliquée en grand sur un voile noir, pour
     * la regarder. Aucune animation (voile simple) ; clic n'importe où pour fermer.
     *
     * @this {FqCardsSheet}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  target - L'élément portant l'action (repère la carte via `data-card-id`).
     *
     * @returns {Promise<void>}
     */
    static async #onViewCard(event, target) {
        const li = target.closest("[data-card-id]");
        const card = this.document.cards.get(li?.dataset.cardId);
        if (!card) return;
        await FqCardsSheet.#showCardOverlay(card);
    }

    /**
     * Monte un voile noir plein écran affichant une carte en grand : le rendu SVG
     * complet (`card-svg.hbs`) pour une carte visible, ou simplement l'image de dos
     * pour une carte face cachée. Aucun impact moteur ; clic n'importe où = fermeture.
     *
     * @param {Card} card - La carte à afficher en grand.
     *
     * @returns {Promise<void>}
     */
    static async #showCardOverlay(card) {
        await DisplayCard.showCardOverlay(card);
    }

    /**
     * Au premier rendu, enregistre les hooks `createCard` / `updateCard` /
     * `deleteCard` pour rafraîchir la feuille quand une carte du deck change.
     *
     * @inheritDoc
     * @param {object} context - Le contexte de rendu.
     * @param {object} options - Les options de rendu Foundry.
     */
    _onFirstRender(context, options) {
        super._onFirstRender(context, options);

        const handler = this.#onDeckCardChange.bind(this);
        this.#deckHooks = {
            createCard: Hooks.on("createCard", handler),
            updateCard: Hooks.on("updateCard", handler),
            deleteCard: Hooks.on("deleteCard", handler)
        };
    }

    /**
     * À la fermeture, retire tous les hooks de carte enregistrés au premier rendu.
     *
     * @inheritDoc
     * @param {object} options - Les options de fermeture Foundry.
     */
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
        const deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE, false);
        if (deck && card.parent?.id === deck.id) {
            this.render();
        }
    }
}
