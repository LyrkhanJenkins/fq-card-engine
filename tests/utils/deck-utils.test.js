import {beforeEach, describe, expect, it, vi} from "vitest";
import DeckUtils, {SPELLBOOK_TYPE} from "../../scripts/utils/deck-utils.js";
import FqConstants from "../../scripts/utils/fq-constants.js";

const createEmbeddedDocumentsMock = vi.fn();
const deck = {
    system: {fq: {type: ""}},
    cards: [],
    createEmbeddedDocuments: createEmbeddedDocumentsMock,
};

describe("DeckUtils", () => {

    beforeEach(() => {
        vi.resetAllMocks(); // remet les compteurs d'appels à zéro mais garde les implémentations
        DeckUtils.debouncedUpdateDeckByUser = {}; // reset du debounce entre chaque test
    });

    // ─── canPassCardsToDeck ───────────────────────────────────────────────────

    it("should return true when there are no cards to create", () => {
        expect(DeckUtils.canPassCardsToDeck({}, {})).toBe(true);
    });

    it("should return true when cards to create can be added to the deck", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card3"}]};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should return false when cards to create exceed the max same card limit", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 2}}}]};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(false);
    });

    it("should return true when maxSameCard is not reached", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 3}}}]};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should handle cards without flags correctly", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card3"}, {name: "Card4", system: {fq: {maxSameCard: 1}}}]};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    // ─── checkIfCanUpdateClasses ──────────────────────────────────────────────

    const document = {
        system: {source: {label: "FQ"}},
        type: "class",
        parent: {id: "parent-id"},
    };

    it("should return true if the character is owned by a user", () => {
        global.game = {users: [{character: {id: "parent-id"}}]};
        expect(DeckUtils.checkIfCanUpdateClasses(document, {isAdvancement: true})).toBe(true);
    });

    it("should show warning and return false if the character is not owned by a user", () => {
        global.game = {users: [{character: {id: "other-id"}}]};
        const result = DeckUtils.checkIfCanUpdateClasses(document, {isAdvancement: true});
        expect(result).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoUserForActor", {localize: true});
    });

    it("should return true if not an advancement", () => {
        expect(DeckUtils.checkIfCanUpdateClasses(document, {isAdvancement: false})).toBe(true);
    });

    it("should return true if document does not have type FQ system", () => {
        expect(DeckUtils.checkIfCanUpdateClasses({...document}, {isAdvancement: true})).toBe(true);
    });

    // ─── updateDeckWhenChange ─────────────────────────────────────────────────

    it("should not trigger delete/create if not an advancement", () => {
        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        DeckUtils.updateDeckWhenChange({flags: {fq: {}}}, {isAdvancement: false});
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should not trigger delete/create if document is not an FQ class", () => {
        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        DeckUtils.updateDeckWhenChange(
            {system: {isOriginalClass: false, levels: 10}, flags: {fq: {}}},
            {isAdvancement: true, parent: {id: "parent-id"}}
        );
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should not trigger delete/create if no matching user found", () => {
        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        DeckUtils.updateDeckWhenChange(
            {system: {source: {label: "FQ"}}, type: "class", parent: {id: "unknown-id"}},
            {isAdvancement: true, parent: {id: "unknown-id"}}
        );
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should debounce and call delete then create once despite 7 triggers", async () => {
        vi.useFakeTimers();

        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        const createSpy = vi.spyOn(DeckUtils, "createDeckForUser").mockResolvedValue();

        const fqDocument = {
            system: {source: {label: "FQ"}},
            type: "class",
            parent: {id: "userCharacterId"},
        };
        const options = {isAdvancement: true, parent: {id: "userCharacterId"}};

        for (let i = 0; i < 7; i++) {
            DeckUtils.updateDeckWhenChange(fqDocument, options);
        }

        expect(deleteSpy).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();

        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(createSpy).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it("should handle two different users independently", async () => {
        vi.useFakeTimers();

        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        const createSpy = vi.spyOn(DeckUtils, "createDeckForUser").mockResolvedValue();

        global.game.users.find = vi.fn((fn) => {
            const users = [
                {id: "user-a", character: {id: "char-a"}},
                {id: "user-b", character: {id: "char-b"}},
            ];
            return users.find(fn);
        });

        const docA = {system: {source: {label: "FQ"}}, type: "class", parent: {id: "char-a"}};
        const docB = {system: {source: {label: "FQ"}}, type: "class", parent: {id: "char-b"}};

        for (let i = 0; i < 3; i++) {
            DeckUtils.updateDeckWhenChange(docA, {isAdvancement: true, parent: {id: "char-a"}});
            DeckUtils.updateDeckWhenChange(docB, {isAdvancement: true, parent: {id: "char-b"}});
        }

        await vi.runAllTimersAsync();

        expect(deleteSpy).toHaveBeenCalledTimes(2);
        expect(deleteSpy).toHaveBeenCalledWith("user-a");
        expect(deleteSpy).toHaveBeenCalledWith("user-b");
        expect(createSpy).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    // ─── getFirstDeck ─────────────────────────────────────────────────────────

    it("should return the first matching deck", () => {
        const userId = "user123";
        const typeFQ = "someType";
        const cards = [
            {ownership: {"user123": 3}, system: {fq: {type: typeFQ, owner: "user123"}}},
            {ownership: {"user123": 3}, system: {fq: {type: typeFQ, owner: "user123"}}},
        ];
        global.game.cards = cards;
        expect(DeckUtils.getFirstDeck(userId, typeFQ)).toEqual(cards[0]);
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    // ─── createCardsForDeck ───────────────────────────────────────────────────

    it("should add cards to the deck for SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = SPELLBOOK_TYPE;
        deck.cards = [{name: "ExistingCard"}];
        const cards = [{name: "Card1"}, {name: "Card2"}, {name: "Card3"}];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    it("should add all cards to the deck for non-SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = "OTHER_TYPE";
        const cards = [{name: "Card1"}, {name: "Card2"}];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    // ─── deleteDeckForUser ────────────────────────────────────────────────────

    it("should warn if the user has no character", async () => {
        // Mocker directement sur l'objet game existant après beforeEach
        const getMock = vi.fn().mockReturnValue({character: null, isGM: false});
        game.users = {...game.users, get: getMock};
        console.log("user retourné:", game.users.get("user1"));

        await DeckUtils.deleteDeckForUser("user1");
        console.log("warn appelé:", ui.notifications.warn.mock.calls);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoOwnedCharacter");
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it("should warn if the user's character has no main class", async () => {
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([]);

        await DeckUtils.deleteDeckForUser("user1");

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoMainClass");
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });
});