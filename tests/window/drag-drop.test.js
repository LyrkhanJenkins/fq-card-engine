import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import DragDrop, {restrictCardsConfigDrop} from "../../src/domain/interface/window/drag-drop.js";

/**
 * Couvre la garde du dépôt sur une barre de main sous « Limitation des droits du
 * joueur » : un joueur limité ne fait entrer aucune carte étrangère dans sa main,
 * mais peut toujours réordonner les siennes ; le MJ n'est jamais concerné.
 *
 * `drop` est invoqué avec `this` lié à un objet simple exposant `getCards()`,
 * comme le fait `HandBoard.drop`.
 */

let previousLimit;
let previousUx;
let previousCards;

/**
 * Construit un jeu de cartes minimal : une collection filtrable et `pass` espionné.
 *
 * @param {string} id - L'id du jeu.
 * @param {string[]} cardIds - Les ids des cartes qu'il contient.
 *
 * @returns {object} Le jeu simulé.
 */
function makeStack(id, cardIds) {
    const stack = {id, uuid: `Cards.${id}`};
    const list = cardIds.map(cardId => ({
        id: cardId,
        _id: cardId,
        parent: stack,
        pass: vi.fn(() => Promise.resolve())
    }));
    stack.cards = {
        get: cardId => list.find(c => c.id === cardId),
        filter: fn => list.filter(fn)
    };
    stack.pass = vi.fn(() => Promise.resolve());
    return stack;
}

/**
 * Construit un événement de dépôt ne visant aucune carte (pas de tri effectif).
 *
 * @param {object} data - Les données de glisser.
 *
 * @returns {object} L'événement simulé.
 */
function makeEvent(data) {
    return {data, target: {closest: () => null}};
}

beforeEach(() => {
    previousLimit = CONFIG.FqCardEngine.options.playerLimitCardsRight;
    previousUx = foundry.applications.ux;
    previousCards = game.cards;
    foundry.applications.ux = {TextEditor: {implementation: {getDragEventData: e => e.data}}};
    game.user.isGM = false;
    CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
});

afterEach(() => {
    CONFIG.FqCardEngine.options.playerLimitCardsRight = previousLimit;
    foundry.applications.ux = previousUx;
    game.cards = previousCards;
    vi.unstubAllGlobals();
});

describe("drop sous droits limités", () => {
    it("refuse une carte d'un autre jeu désignée par ids", () => {
        const hand = makeStack("hand", ["a"]);
        const deck = makeStack("deck", ["x"]);
        game.cards = {get: id => ({hand, deck})[id]};

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", cardsId: "deck", cardId: "x"}));

        expect(deck.cards.get("x").pass).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropPlayerRightsLimited");
    });

    it("refuse une carte d'un autre jeu désignée par uuid sans même la résoudre", () => {
        const hand = makeStack("hand", ["a"]);
        const fromUuid = vi.fn();
        vi.stubGlobal("fromUuid", fromUuid);

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", uuid: "Cards.deck.Card.x"}));

        expect(fromUuid).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropPlayerRightsLimited");
    });

    it("laisse réordonner une carte déjà dans la main", () => {
        const hand = makeStack("hand", ["a"]);
        const fromUuid = vi.fn(() => Promise.resolve(hand.cards.get("a")));
        vi.stubGlobal("fromUuid", fromUuid);

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", uuid: "Cards.hand.Card.a"}));

        expect(fromUuid).toHaveBeenCalledWith("Cards.hand.Card.a");
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("ne bride pas le MJ", () => {
        game.user.isGM = true;
        const hand = makeStack("hand", ["a"]);
        const deck = makeStack("deck", ["x"]);
        game.cards = {get: id => ({hand, deck})[id]};

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", cardsId: "deck", cardId: "x"}));

        expect(deck.cards.get("x").pass).toHaveBeenCalled();
    });

    it("refuse une carte venue d'un compendium sans même la résoudre", () => {
        const hand = makeStack("hand", ["a"]);
        const fromUuid = vi.fn();
        vi.stubGlobal("fromUuid", fromUuid);

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", uuid: "Compendium.fq.cards.Cards.deck.Card.x"}));

        expect(fromUuid).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropCompendiumRefused");
    });

    it("refuse tout autre type de données venu d'un compendium", () => {
        const hand = makeStack("hand", ["a"]);

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Item", uuid: "Compendium.fq.items.Item.i"}));

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropCompendiumRefused");
    });

    it("laisse le MJ déposer une carte venue d'un compendium", () => {
        game.user.isGM = true;
        const hand = makeStack("hand", ["a"]);
        const fromUuid = vi.fn(() => Promise.resolve(null));
        vi.stubGlobal("fromUuid", fromUuid);

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", uuid: "Compendium.fq.cards.Cards.deck.Card.x"}));

        expect(fromUuid).toHaveBeenCalled();
        expect(ui.notifications.warn).not.toHaveBeenCalledWith("FQCARDENGINE.DragDropCompendiumRefused");
    });

    it("ne bride pas un joueur quand le réglage est désactivé", () => {
        CONFIG.FqCardEngine.options.playerLimitCardsRight = false;
        const hand = makeStack("hand", ["a"]);
        const deck = makeStack("deck", ["x"]);
        game.cards = {get: id => ({hand, deck})[id]};

        DragDrop.drop.call({getCards: () => hand},
            makeEvent({type: "Card", cardsId: "deck", cardId: "x"}));

        expect(deck.cards.get("x").pass).toHaveBeenCalled();
    });
});

/**
 * Le dépôt sur une FEUILLE de `Cards` (deck, main, défausse, FqCardsSheet), passé
 * par l'enveloppe libWrapper de `CardsConfig.prototype._onDrop`. La règle de droits
 * y est la MÊME que sur la barre de main : les deux chemins partagent
 * `refuseRestrictedDrop`, et ces cas le vérifient sur le chemin de la feuille —
 * celui par lequel un joueur limité pourrait sinon contourner la restriction.
 *
 * `restrictCardsConfigDrop` est invoquée avec `this` lié à la feuille, comme le
 * fait libWrapper.
 */
describe("restrictCardsConfigDrop (dépôt sur une feuille de Cards)", () => {
    /**
     * Construit la feuille qui reçoit le dépôt.
     *
     * @param {string} id - L'id du jeu porté par la feuille.
     *
     * @returns {object} La feuille simulée (`this` du gestionnaire).
     */
    function makeSheet(id) {
        return {document: {id, uuid: `Cards.${id}`}};
    }

    it("refuse une carte d'un autre jeu désignée par ids", () => {
        const wrapper = vi.fn();

        restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Card", cardsId: "hand", cardId: "x"}));

        expect(wrapper).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropPlayerRightsLimited");
    });

    it("refuse une carte d'un autre jeu désignée par uuid", () => {
        const wrapper = vi.fn();

        restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Card", uuid: "Cards.hand.Card.x"}));

        expect(wrapper).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropPlayerRightsLimited");
    });

    it("refuse tout ce qui vient d'un compendium, quel que soit le type", () => {
        const wrapper = vi.fn();

        restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Item", pack: "fq.items"}));

        expect(wrapper).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.DragDropCompendiumRefused");
    });

    it("laisse réordonner une carte du jeu de la feuille", () => {
        const wrapper = vi.fn(() => "trié");

        const result = restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Card", uuid: "Cards.deck.Card.a"}));

        expect(result).toBe("trié");
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("ne bride pas le MJ", () => {
        game.user.isGM = true;
        const wrapper = vi.fn();

        restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Card", cardsId: "hand", cardId: "x"}));

        expect(wrapper).toHaveBeenCalled();
    });

    it("ne bride pas un joueur quand le réglage est désactivé", () => {
        CONFIG.FqCardEngine.options.playerLimitCardsRight = false;
        const wrapper = vi.fn();

        restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Card", cardsId: "hand", cardId: "x"}));

        expect(wrapper).toHaveBeenCalled();
    });

    it("laisse passer les autres types de données hors compendium (dossier, macro…)", () => {
        const wrapper = vi.fn(() => "délégué");

        const result = restrictCardsConfigDrop.call(makeSheet("deck"), wrapper,
            makeEvent({type: "Folder", uuid: "Folder.f"}));

        expect(result).toBe("délégué");
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
});
