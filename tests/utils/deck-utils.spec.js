import DeckUtils, {DeckError} from "../../scripts/utils/deck-utils.js";

const createEmbeddedDocumentsMock = jest.fn();
const deck = {
    system: {fq: {type: ''}},
    cards: [],
    createEmbeddedDocuments: createEmbeddedDocumentsMock,
};

describe('DeckUtils', () => {

    beforeEach(() => {

        jest.clearAllMocks();
        global.ui = {
            notifications: {
                error: jest.fn(),
                warn: jest.fn(),
            },
        };
        global.game = {
            i18n: {
                localize: jest.fn(),
                format: jest.fn(),
            },
            users: {
                filter: jest.fn((callback) => [
                    {
                        id: 'parent-id',
                        character: {id: 'parent-id'}
                    }
                ].filter(callback)), // Simulate filter behavior
                get: jest.fn((id) => ({id, character: {id}})), // Simulate get behavior
                find: jest.fn((id) => ({id, character: {id}})) // Simulate get behavior
            },
            cards: []
        }
        global.Cards = {
            deleteDocuments: jest.fn()
        }
    });

    it('should return true when there are no cards to create', () => {
        const to = {};
        const action = {};
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it('should return true when cards to create can be added to the deck', () => {
        const to = {
            cards: [{name: 'Card1'}, {name: 'Card2'}]
        };
        const action = {
            toCreate: [{name: 'Card3'}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it('should return false when cards to create exceed the max same card limit', () => {
        const to = {
            cards: [{name: 'Card1'}, {name: 'Card1'}, {name: 'Card2'}]
        };
        const action = {
            toCreate: [{name: 'Card1', flags: {maxSameCard: 2}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(false);
    });

    it('should return true when maxSameCard is not reached', () => {
        const to = {
            cards: [{name: 'Card1'}, {name: 'Card1'}, {name: 'Card2'}]
        };
        const action = {
            toCreate: [{name: 'Card1', flags: {maxSameCard: 3}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });

    it('should handle cards without flags correctly', () => {
        const to = {
            cards: [{name: 'Card1'}, {name: 'Card2'}]
        };
        const action = {
            toCreate: [{name: 'Card3'}, {name: 'Card4', flags: {maxSameCard: 1}}]
        };
        expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
    });


    const document = {
        flags: {
            fq: {},
        },
        parent: {
            id: 'parent-id',
        },
    };

    it('should return true if the character is owned by a user', () => {
        global.game = {
            users: [
                {
                    character: {id: 'parent-id'}
                },
            ]
        };
        const options = {isAdvancement: true};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(true);
    });

    it('should show warning and return false if the character is not owned by a user', () => {
        global.game = {
            users: [
                {
                    character: {id: 'other-id'}
                },
            ]
        };
        const options = {isAdvancement: true};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoUserForActor", {localize: true});
    });

    it('should return true if not an advancement', () => {
        const options = {isAdvancement: false};

        const result = DeckUtils.checkIfCanUpdateClasses(document, options);

        expect(result).toBe(true);
    });

    it('should return true if document does not have type FQ system', () => {
        const options = {isAdvancement: true};
        const localDocument = {...document};

        const result = DeckUtils.checkIfCanUpdateClasses(localDocument, options);

        expect(result).toBe(true);
    });

    it('should call deleteDeckForUser and createDeckForUser when conditions are met', async () => {
        const document = {
            system: {
                isOriginalClass: true,
                levels: 5,
            },
            flags: {
                fq: {}
            }
        };
        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');
        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(document, options);

        expect(deleteDeckForUserMethodSpy).toHaveBeenCalled();
    });

    it('should not call deck methods if conditions are not met', async () => {
        const localDocument = {
            system: {
                isOriginalClass: false,
                levels: 10,
            },
            flags: {
                fq: {}
            }
        };
        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');

        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it('should not call deck methods if document does not have fq type flag', async () => {
        const localDocument = {
            flags: {}
        };

        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');
        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it('should return the first matching deck', function () {
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

    it('should warn if no deck is found', function () {
        const userId = "user123";
        const typeFQ = "someType";

        // Empty list implies no matching deck
        game.cards = [];

        const result = DeckUtils.getFirstDeck(userId, typeFQ);

        expect(result).toEqual(undefined);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
    });

    it('should warn if no matching deck is found', function () {
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

    it('should add cards to the deck that are not duplicates and not already in the deck for SPELLBOOK_TYPE', async () => {
        deck.system.fq.type = DeckUtils.SPELLBOOK_TYPE;
        deck.cards = [{name: 'ExistingCard'}];

        const cards = [
            {name: 'Card1'},
            {name: 'Card2'},
            {name: 'Card3'},
        ];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith('Card', cards, {keepId: false});
    });

    it('should warn when trying to add duplicate cards to SPELLBOOK_TYPE deck but create one anyway', async () => {
        deck.system.fq.type = DeckUtils.SPELLBOOK_TYPE;
        const cards = [
            {name: 'Card1'},
            {name: 'Card1'}, // Duplicate card
        ];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(ui.notifications.warn).toHaveBeenCalled();
        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith('Card', [{name: 'Card1'}], {keepId: false});
    });

    it('should throw an error when cards already exist in the SPELLBOOK_TYPE deck', async () => {
        deck.system.fq.type = DeckUtils.SPELLBOOK_TYPE;
        deck.cards = [{name: 'ExistingCard'}];

        const cards = [{name: 'ExistingCard'}];

        await expect(DeckUtils.createCardsForDeck(deck, cards)).rejects.toThrow(
            new DeckError(game.i18n.format('FQCARDENGINE.ErrorDuplicateCardSpellBook', {cardName: ''}))
        );

        expect(createEmbeddedDocumentsMock).not.toHaveBeenCalled();
    });

    it('should add all cards to the deck for non-SPELLBOOK_TYPE', async () => {
        deck.system.fq.type = 'OTHER_TYPE';

        const cards = [
            {name: 'Card1'},
            {name: 'Card2'},
        ];

        await DeckUtils.createCardsForDeck(deck, cards);

        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith('Card', cards, {keepId: false});
    });

    it('should warn if the user has no character', async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;

        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({character: null});

        await DeckUtils.deleteDeckForUser('user1');

        expect(ui.notifications.warn).toHaveBeenCalledWith(game.i18n.localize('FQCARDENGINE.NoOwnedCharacter'));
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it('should warn if the user\'s character has no main class', async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;
        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({
            character: {name: 'CharacterName', classes: {}}
        });

        await DeckUtils.deleteDeckForUser('user1');

        expect(ui.notifications.warn).toHaveBeenCalledWith(game.i18n.localize('FQCARDENGINE.NoMainClass'));
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it('should delete the deck if the conditions are met', async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;
        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({
            id: 'user1',
            character: {
                name: 'CharacterName',
                classes: {
                    mainClass: {
                        system: {isOriginalClass: true, levels: 5}
                    }
                }
            }
        });

        getFirstDeckMock.mockReturnValue({id: 'deck1'});

        await DeckUtils.deleteDeckForUser('user1');

        expect(Cards.deleteDocuments).toHaveBeenCalledWith(['deck1']);
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it('should not delete the deck if main class level is greater than 5', async () => {

        // Mock DeckUtils.getFirstDeck
        const getFirstDeckMock = jest.fn();
        DeckUtils.getFirstDeck = getFirstDeckMock;
        // Mock game.users.get
        const getUserMock = jest.fn();
        game.users.get = getUserMock;
        getUserMock.mockReturnValue({
            id: 'user1',
            character: {
                name: 'CharacterName',
                classes: {
                    mainClass: {
                        system: {isOriginalClass: true, levels: 6}
                    }
                }
            }
        });

        getFirstDeckMock.mockReturnValue({id: 'deck1'});

        await DeckUtils.deleteDeckForUser('user1');

        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
});
