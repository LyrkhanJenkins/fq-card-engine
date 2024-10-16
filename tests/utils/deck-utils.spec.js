import DeckUtils from "../../scripts/utils/deck-utils.js";


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
                localize: () => ""
            },
            users:  {
                filter: jest.fn((callback) => [
                    {
                        id: 'parent-id',
                        character: { id: 'parent-id' }
                    }
                ].filter(callback)), // Simulate filter behavior
                get: jest.fn((id) => ({ id, character: { id } })), // Simulate get behavior
                find: jest.fn((id) => ({ id, character: { id } })) // Simulate get behavior
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
            fqType: true,
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

    it('should return true if document does not have fqType flag', () => {
        const options = {isAdvancement: true};
        const localDocument = {...document, flags: {}};

        const result = DeckUtils.checkIfCanUpdateClasses(localDocument, options);

        expect(result).toBe(true);
    });

    it('should call deleteDeckForUser and createDeckForUser when conditions are met', async () => {
        const document = {
            flags: {
                fqType: 'DECK',
            },
            system: {
                isOriginalClass: true,
                levels: 5,
            },
        };
        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');
        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(document, options);

        expect(deleteDeckForUserMethodSpy).toHaveBeenCalled();
    });

    it('should not call deck methods if conditions are not met', async () => {
        const localDocument = {
            flags: {
                fqType: 'DECK',
            },
            system: {
                isOriginalClass: false,
                levels: 10,
            },
        };
        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');

        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it('should not call deck methods if document does not have fqType flag', async () => {
        const localDocument = {
            flags: {}
        };

        const deleteDeckForUserMethodSpy = jest.spyOn(DeckUtils, 'deleteDeckForUser');
        const options = {isAdvancement: true, parent: {id: 'parent-id'}};

        await DeckUtils.updateDeckWhenChange(localDocument, options);

        expect(deleteDeckForUserMethodSpy).not.toHaveBeenCalled();
    });

    it('should return the first matching deck', function() {
        const userId = "user123";
        const fqType = "someType";

        // Mock data
        const cards = [
            {
                ownership: { "user123": 3 },
                flags: { fqType: "someType", fqOwner: "user123" }
            },
            {
                ownership: { "user123": 3 },
                flags: { fqType: "someType", fqOwner: "user123" }
            }
        ];

        global.game.cards = cards;

        const result = DeckUtils.getFirstDeck(userId, fqType);

        expect(result).toEqual(cards[0]);
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it('should warn if no deck is found', function() {
        const userId = "user123";
        const fqType = "someType";

        // Empty list implies no matching deck
        game.cards = [];

        const result = DeckUtils.getFirstDeck(userId, fqType);

        expect(result).toEqual(undefined);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", { localize: true });
    });

    it('should warn if no matching deck is found', function() {
        const userId = "user123";
        const fqType = "someType";

        // Data that does not match the criteria
        const cards = [
            {
                ownership: { "user456": 3 },
                flags: { fqType: "anotherType", fqOwner: "user456" }
            }
        ];

        global.game.cards = cards;

        const result = DeckUtils.getFirstDeck(userId, fqType);

        expect(result).toEqual(undefined);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", { localize: true });
    });
});
