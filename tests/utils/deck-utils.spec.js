import DeckUtils, {SPELLBOOK_TYPE} from "../../scripts/utils/deck-utils.js";
import setGlobal from "../before-each.js";

const createEmbeddedDocumentsMock = jest.fn();
const deck = {
    system: {fq: {type: ""}},
    cards: [],
    createEmbeddedDocuments: createEmbeddedDocumentsMock,
};

describe("DeckUtils", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        setGlobal();
    });

    it("should return true when there are no cards to create", () => {
        const to = {};
        const action = {};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should return true when cards to create can be added to the deck", () => {
        const to = {
            cards: [{name: "Card1"}, {name: "Card2"}]
        };
        const action = {
            toCreate: [{name: "Card3"}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should return false when cards to create exceed the max same card limit", () => {
        const to = {
            cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]
        };
        const action = {
            toCreate: [{name: "Card1", system: {fq: {maxSameCard: 2}}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(false);
    });

    it("should return true when maxSameCard is not reached", () => {
        const to = {
            cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]
        };
        const action = {
            toCreate: [{name: "Card1", system: {fq: {maxSameCard: 3}}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should handle cards without flags correctly", () => {
        const to = {
            cards: [{name: "Card1"}, {name: "Card2"}]
        };
        const action = {
            toCreate: [{name: "Card3"}, {name: "Card4", system: {fq: {maxSameCard: 1}}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });


    const document = {
        flags: {
            fq: {},
        },
        parent: {
            id: "parent-id",
        },
    };

    it("should return true if the character is owned by a user", () => {
        global.game = {
            users: [
                {
                    character: {id: "parent-id"}
                },
            ]
        };
        const options = {isAdvancement: true};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(true);
    });

    it("should show warning and return false if the character is not owned by a user", () => {
        global.game = {
            users: [
                {
                    character: {id: "other-id"}
                },
            ]
        };
        const options = {isAdvancement: true};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoUserForActor", {localize: true});
    });

    it("should return true if not an advancement", () => {
        const options = {isAdvancement: false};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(true);
    });

    it("should return true if document does not have type FQ system", () => {
        const options = {isAdvancement: true};
        const localDocument = {...document};

        const result = DeckUtils.checkIfCanUpdateClasses(localDocument, options);

        expect(result).toBe(true);
    });

    it("should not call deck methods if conditions are not met", async () => {
        const localDocument = {
            system: {
                isOriginalClass: false,
                levels: 10,
            },
            flags: {
                fq: {}
            }
        };
        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, "deleteDeckForUser");

        const options = {isAdvancement: true, parent: {id: "parent-id"}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it("should not call deck methods if document does not have fq type flag", async () => {
        const localDocument = {
            flags: {}
        };

        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, "deleteDeckForUser");
        const options = {isAdvancement: true, parent: {id: "parent-id"}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it("should return the first matching deck", function () {
        const userId = "user123";
        const typeFQ = "someType";

        // Mock data
        const cards = [
            {
                ownership: {"user123": 3},
                system: {fq: {type: typeFQ, owner: "user123"}}
            },
            {
                ownership: {"user123": 3},
                system: {fq: {type: typeFQ, owner: "user123"}}
            }
        ];

        global.game.cards = cards;

        const result = DeckUtils.getFirstDeck(userId, typeFQ);

        expect(result).toEqual(cards[0]);
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("should warn if no deck is found", function () {
        const userId = "user123";
        const typeFQ = "someType";

        // Empty list implies no matching deck
        game.cards = [];

        const result = DeckUtils.getFirstDeck(userId, typeFQ);

        expect(result).toEqual(undefined);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
    });

    it("should warn if no matching deck is found", function () {
        const userId = "user123";
        const typeFQ = "someType";

        // Data that does not match the criteria
        const cards = [
            {
                ownership: {"user456": 3},
                system: {fq: {type: "anotherType", owner: "user456"}}
            }
        ];

        global.game.cards = cards;

        const result = DeckUtils.getFirstDeck(userId, typeFQ);

        expect(result).toEqual(undefined);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
    });

    it("should add cards to the deck that are not duplicates and not already in the deck for SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = SPELLBOOK_TYPE;
        deck.cards = [{name: "ExistingCard"}];

        const cards = [
            {name: "Card1"},
            {name: "Card2"},
            {name: "Card3"},
        ];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    it("should add all cards to the deck for non-SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = "OTHER_TYPE";

        const cards = [
            {name: "Card1"},
            {name: "Card2"},
        ];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    it("should warn if the user has no character", async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;

        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({character: null});

        await DeckUtils.deleteDeckForUser("user1");

        expect(ui.notifications.warn).toHaveBeenCalledWith(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it("should warn if the user's character has no main class", async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;
        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({
            character: {name: "CharacterName", classes: {}}
        });

        await DeckUtils.deleteDeckForUser("user1");

        expect(ui.notifications.warn).toHaveBeenCalledWith(game.i18n.localize("FQCARDENGINE.NoMainClass"));
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });
});
