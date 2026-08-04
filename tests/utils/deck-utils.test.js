import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import DeckUtils, {SPELLBOOK_TYPE} from "../../src/domain/utils/deck-utils.js";
import FqConstants from "../../src/domain/utils/fq-constants.js";

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
        const updateSpy = vi.spyOn(DeckUtils, "updateDeckForUser").mockResolvedValue();

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

        expect(deleteSpy).toHaveBeenCalledTimes(0);
        expect(updateSpy).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it("should handle two different users independently", async () => {
        vi.useFakeTimers();

        const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
        const updateSpy = vi.spyOn(DeckUtils, "updateDeckForUser").mockResolvedValue();

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

        expect(deleteSpy).toHaveBeenCalledTimes(0);
        expect(updateSpy).toHaveBeenCalledTimes(2);

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

    it("should return undefined without warning when warning=false and no deck found", () => {
        global.game.cards = [];
        expect(DeckUtils.getFirstDeck("user123", "HAND", false)).toBeUndefined();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("should warn WarningHandMissingForPlayer when no HAND deck found", () => {
        global.game.cards = [];
        expect(DeckUtils.getFirstDeck("user123", "HAND")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningHandMissingForPlayer", {localize: true});
    });

    it("should warn WarningDeckMissingForPlayer when no DECK deck found", () => {
        global.game.cards = [];
        expect(DeckUtils.getFirstDeck("user123", "DECK")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
    });

    it("should warn WarningPileMissingForPlayer when no PILE deck found", () => {
        global.game.cards = [];
        expect(DeckUtils.getFirstDeck("user123", "PILE")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
    });

    it("should warn WarningSpellBookMissingForPlayer when no SPELLBOOK deck found", () => {
        global.game.cards = [];
        expect(DeckUtils.getFirstDeck("user123", "SPELLBOOK")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningSpellBookMissingForPlayer", {localize: true});
    });

    // ─── drawCard ─────────────────────────────────────────────────────────────

    it("should draw cards from the deck into the hand", () => {
        const drawSpy = vi.fn();
        const hand = {draw: drawSpy};
        const deck = {id: "deckId"};
        global.game.cards = {
            get: vi.fn(id => (id === "handId" ? hand : deck))
        };

        DeckUtils.drawCard("handId", "deckId", 3);

        expect(game.cards.get).toHaveBeenCalledWith("handId");
        expect(game.cards.get).toHaveBeenCalledWith("deckId");
        expect(drawSpy).toHaveBeenCalledWith(deck, 3, {chatNotification: false, how: 2});
    });

    // ─── deleteCardsForDeck ───────────────────────────────────────────────────

    it("should delete the given cards from the deck via deleteEmbeddedDocuments", async () => {
        const deleteEmbeddedDocumentsMock = vi.fn().mockResolvedValue();
        const targetDeck = {deleteEmbeddedDocuments: deleteEmbeddedDocumentsMock};
        const cardsToDelete = [{id: "card1"}, {id: "card2"}];

        await DeckUtils.deleteCardsForDeck(targetDeck, cardsToDelete);

        expect(deleteEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", ["card1", "card2"], {});
    });

    // ─── logCardPlayed ────────────────────────────────────────────────────────

    describe("DeckUtils — logCardPlayed", () => {
        it("should push a log entry and update the active combat when a combat is running", () => {
            const updateMock = vi.fn();
            game.combat = {
                flags: {fq: {logs: []}},
                round: 2,
                turn: 1,
                update: updateMock
            };
            vi.spyOn(FqConstants, "myTargets").mockReturnValue([
                {document: {actorId: "target1"}},
                {document: {actorId: "target2"}}
            ]);

            const cardContent = {targetType: "Default", damage: "1d6"};
            DeckUtils.logCardPlayed([{key: "Dégâts", value: 5}], cardContent);

            expect(updateMock).toHaveBeenCalledWith({
                "flags.fq": {
                    logs: [expect.objectContaining({
                        actorId: "userCharacterId",
                        targetsId: ["target1", "target2"],
                        round: 2,
                        turn: 1
                    })]
                }
            });
        });

        it("should not throw and do nothing when there is no active combat", () => {
            game.combat = undefined;
            expect(() => DeckUtils.logCardPlayed([], {targetType: "Default"})).not.toThrow();
        });
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
        console.info("user retourné:", game.users.get("user1"));

        await DeckUtils.deleteDeckForUser("user1");
        console.info("warn appelé:", ui.notifications.warn.mock.calls);

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

    it("should destroy the deck AND the spellbook for a monoclass character at level <= 5", async () => {
        const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 5}};
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([mainClass]);
        const existingDeck = {id: "deckId"};
        const existingSpellbook = {id: "spellbookId"};
        vi.spyOn(DeckUtils, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            if (typeFq === "SPELLBOOK") return existingSpellbook;
            return undefined;
        });

        await DeckUtils.deleteDeckForUser("user1");

        expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingDeck.id]);
        expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingSpellbook.id]);
    });

    it("should NOT destroy the deck for a multiclass character (only the spellbook is deleted)", async () => {
        const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 2}};
        const secondClass = {name: "Mage", system: {isOriginalClass: false, levels: 1}};
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([mainClass, secondClass]);
        const existingDeck = {id: "deckId"};
        const existingSpellbook = {id: "spellbookId"};
        vi.spyOn(DeckUtils, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            if (typeFq === "SPELLBOOK") return existingSpellbook;
            return undefined;
        });

        await DeckUtils.deleteDeckForUser("user1");

        expect(Cards.deleteDocuments).not.toHaveBeenCalledWith([existingDeck.id]);
        expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingSpellbook.id]);
    });

    it("should NOT destroy the deck for a monoclass character above level 5", async () => {
        const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 6}};
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([mainClass]);
        const existingDeck = {id: "deckId"};
        vi.spyOn(DeckUtils, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            return undefined;
        });

        await DeckUtils.deleteDeckForUser("user1");

        expect(Cards.deleteDocuments).not.toHaveBeenCalledWith([existingDeck.id]);
    });

    // ─── updateDeckForUser ────────────────────────────────────────────────────

    describe("DeckUtils — updateDeckForUser", () => {

        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            globalThis.Cards.create = vi.fn().mockResolvedValue({id: "newDeck", cards: []});
            vi.spyOn(DeckUtils, "getFirstDeck").mockReturnValue(undefined);
            vi.spyOn(DeckUtils, "createCardsForDeck").mockResolvedValue();
            vi.spyOn(DeckUtils, "deleteCardsForDeck").mockResolvedValue();
        });

        afterEach(() => {
            globalThis.FqCardEngineModule = undefined;
        });

        it("should warn NoOwnedCharacter and create nothing when user has no character (non-GM)", async () => {
            game.users = {...game.users, get: vi.fn().mockReturnValue({character: null, isGM: false})};

            await DeckUtils.updateDeckForUser("user1");

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoOwnedCharacter");
            expect(Cards.create).not.toHaveBeenCalled();
        });

        it("should warn NoMainClass and create nothing when class/originDeck are missing (non-GM)", async () => {
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
            };
            vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([]);

            await DeckUtils.updateDeckForUser("user1");

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoMainClass");
            expect(Cards.create).not.toHaveBeenCalled();
        });

        it("should generate Hand/Pile/Spellbook/Deck from the pattern compendium (nominal monoclass path)", async () => {
            const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 3}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([mainClass]);

            const originDeckCards = [
                {name: "LowLevelCard", system: {fq: {level: 1}}},
                {name: "HighLevelCard", system: {fq: {level: 5}}}
            ];
            const originDeck = {
                name: "Warrior Base",
                system: {someBase: true},
                cards: originDeckCards
            };
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([originDeck])
            }));

            await DeckUtils.updateDeckForUser("user1");

            // Hand created
            expect(Cards.create).toHaveBeenCalledWith(expect.objectContaining({
                type: "hand",
                system: expect.objectContaining({fq: expect.objectContaining({type: "HAND", owner: "user1"})})
            }));
            // Pile created
            expect(Cards.create).toHaveBeenCalledWith(expect.objectContaining({
                type: "pile",
                system: expect.objectContaining({fq: expect.objectContaining({type: "PILE", owner: "user1"})})
            }));
            // Spellbook (re)created with the new class levels, no previous spellbook to delete
            expect(Cards.deleteDocuments).not.toHaveBeenCalled();
            expect(Cards.create).toHaveBeenCalledWith(expect.objectContaining({
                type: "deck",
                system: expect.objectContaining({
                    fq: expect.objectContaining({
                        type: "SPELLBOOK",
                        owner: "user1",
                        classLevels: {Warrior: 3}
                    })
                })
            }));
            // Only the card filtered by level <= 3 is forwarded to createCardsForDeck
            expect(DeckUtils.createCardsForDeck).toHaveBeenCalledWith(
                expect.anything(),
                [originDeckCards[0]]
            );
            // Deck created (none found via getFirstDeck)
            expect(Cards.create).toHaveBeenCalledWith(expect.objectContaining({
                type: "deck",
                system: expect.objectContaining({fq: expect.objectContaining({type: "DECK", owner: "user1"})})
            }));
        });

        it("should delete the previous spellbook and skip Hand/Pile creation when they already exist", async () => {
            const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 3}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(FqConstants, "userFQClasses").mockReturnValue([mainClass]);

            const originDeck = {name: "Warrior Base", system: {someBase: true}, cards: []};
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([originDeck])
            }));

            const existingHand = {id: "existingHand"};
            const existingPile = {id: "existingPile"};
            const existingSpellbook = {id: "existingSpellbook", system: {fq: {classLevels: {Warrior: 1}}}};
            const existingDeck = {id: "existingDeck", cards: []};
            DeckUtils.getFirstDeck.mockImplementation((userId, typeFq) => {
                if (typeFq === "HAND") return existingHand;
                if (typeFq === "PILE") return existingPile;
                if (typeFq === "SPELLBOOK") return existingSpellbook;
                if (typeFq === "DECK") return existingDeck;
                return undefined;
            });

            await DeckUtils.updateDeckForUser("user1");

            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({type: "hand"}));
            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({type: "pile"}));
            expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingSpellbook.id]);
            // Deck already exists: not recreated
            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({
                system: expect.objectContaining({fq: expect.objectContaining({type: "DECK"})})
            }));
        });
    });
});
