import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import TradingCards, {SPELLBOOK_TYPE} from "../../src/domain/trading/trading-cards.js";
import Constants from "../../src/domain/constants.js";
import PlayCard from "../../src/domain/engine/play-card.js";

const createEmbeddedDocumentsMock = vi.fn();
const deck = {
    system: {fq: {type: ""}},
    cards: [],
    createEmbeddedDocuments: createEmbeddedDocumentsMock,
};

describe("TradingCards", () => {

    beforeEach(() => {
        vi.resetAllMocks(); // remet les compteurs d'appels à zéro mais garde les implémentations
        TradingCards.debouncedUpdateDeckByUser = {}; // reset du debounce entre chaque test
    });

    // ─── canPassCardsToDeck ───────────────────────────────────────────────────

    it("should return true when there are no cards to create", () => {
        expect(TradingCards.canPassCardsToDeck({}, {})).toBe(true);
    });

    it("should return true when cards to create can be added to the deck", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card3"}]};
        expect(TradingCards.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should return false when cards to create exceed the max same card limit", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 2}}}]};
        expect(TradingCards.canPassCardsToDeck(to, action)).toBe(false);
    });

    it("should return true when maxSameCard is not reached", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 3}}}]};
        expect(TradingCards.canPassCardsToDeck(to, action)).toBe(true);
    });

    it("should handle cards without flags correctly", () => {
        const to = {cards: [{name: "Card1"}, {name: "Card2"}]};
        const action = {toCreate: [{name: "Card3"}, {name: "Card4", system: {fq: {maxSameCard: 1}}}]};
        expect(TradingCards.canPassCardsToDeck(to, action)).toBe(true);
    });

    // ─── checkIfCanUpdateClasses ──────────────────────────────────────────────

    const document = {
        system: {source: {label: "FQ"}},
        type: "class",
        parent: {id: "parent-id"},
    };

    it("should return true if the character is owned by a user", () => {
        global.game = {users: [{character: {id: "parent-id"}}]};
        expect(TradingCards.checkIfCanUpdateClasses(document, {isAdvancement: true})).toBe(true);
    });

    it("should show warning and return false if the character is not owned by a user", () => {
        global.game = {users: [{character: {id: "other-id"}}]};
        const result = TradingCards.checkIfCanUpdateClasses(document, {isAdvancement: true});
        expect(result).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoUserForActor", {localize: true});
    });

    it("should return true if not an advancement", () => {
        expect(TradingCards.checkIfCanUpdateClasses(document, {isAdvancement: false})).toBe(true);
    });

    it("should return true if document does not have type FQ system", () => {
        expect(TradingCards.checkIfCanUpdateClasses({...document}, {isAdvancement: true})).toBe(true);
    });

    it("refuse et avertit sans lever d'erreur quand la classe FQ n'a pas de parent", () => {
        global.game = {users: [{character: {id: "parent-id"}}]};
        const orphan = {system: {source: {label: "FQ"}}, type: "class"};
        expect(TradingCards.checkIfCanUpdateClasses(orphan, {isAdvancement: true})).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoUserForActor", {localize: true});
    });

    it("laisse passer sans lever d'erreur quand aucune option n'est fournie", () => {
        expect(TradingCards.checkIfCanUpdateClasses(document, undefined)).toBe(true);
    });

    // ─── checkClassLevelCap ───────────────────────────────────────────────────

    it("accepte une montée de niveau jusqu'au plafond de classe", () => {
        expect(TradingCards.checkClassLevelCap(document, {system: {levels: 12}})).toBe(true);
    });

    it("refuse et avertit une montée de niveau au-delà du plafond de classe", () => {
        expect(TradingCards.checkClassLevelCap(document, {system: {levels: 13}})).toBe(false);
        expect(ui.notifications.warn).toHaveBeenCalledWith(
            expect.stringContaining("FQCARDENGINE.MaxClassLevelReached"));
    });

    it("refuse un delta de niveau aplati au-delà du plafond", () => {
        expect(TradingCards.checkClassLevelCap(document, {"system.levels": 13})).toBe(false);
    });

    it("laisse passer une mise à jour qui ne touche pas au niveau, même sur une classe hors plafond", () => {
        const overCapped = {...document, system: {...document.system, levels: 15}};
        expect(TradingCards.checkClassLevelCap(overCapped, {name: "Autre nom"})).toBe(true);
    });

    it("refuse la création d'une classe FQ déjà au-delà du plafond", () => {
        const overCapped = {...document, system: {...document.system, levels: 13}};
        expect(TradingCards.checkClassLevelCap(overCapped, overCapped)).toBe(false);
    });

    it("ignore les objets qui ne sont pas des classes FQ", () => {
        expect(TradingCards.checkClassLevelCap({type: "weapon"}, {system: {levels: 99}})).toBe(true);
    });

    // ─── updateDeckWhenChange ─────────────────────────────────────────────────

    it("should not trigger delete/create if not an advancement", () => {
        const deleteSpy = vi.spyOn(TradingCards, "deleteDeckForUser").mockResolvedValue();
        TradingCards.updateDeckWhenChange({flags: {fq: {}}}, {isAdvancement: false});
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should not trigger delete/create if document is not an FQ class", () => {
        const deleteSpy = vi.spyOn(TradingCards, "deleteDeckForUser").mockResolvedValue();
        TradingCards.updateDeckWhenChange(
            {system: {isOriginalClass: false, levels: 10}, flags: {fq: {}}},
            {isAdvancement: true, parent: {id: "parent-id"}}
        );
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should not trigger delete/create if no matching user found", () => {
        const deleteSpy = vi.spyOn(TradingCards, "deleteDeckForUser").mockResolvedValue();
        TradingCards.updateDeckWhenChange(
            {system: {source: {label: "FQ"}}, type: "class", parent: {id: "unknown-id"}},
            {isAdvancement: true, parent: {id: "unknown-id"}}
        );
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("should debounce and call delete then create once despite 7 triggers", async () => {
        vi.useFakeTimers();

        const deleteSpy = vi.spyOn(TradingCards, "deleteDeckForUser").mockResolvedValue();
        const updateSpy = vi.spyOn(TradingCards, "updateDeckForUser").mockResolvedValue();

        const fqDocument = {
            system: {source: {label: "FQ"}},
            type: "class",
            parent: {id: "userCharacterId"},
        };
        const options = {isAdvancement: true, parent: {id: "userCharacterId"}};

        for (let i = 0; i < 7; i++) {
            TradingCards.updateDeckWhenChange(fqDocument, options);
        }

        expect(deleteSpy).not.toHaveBeenCalled();

        await vi.runAllTimersAsync();

        expect(deleteSpy).toHaveBeenCalledTimes(0);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        // Preuve côté émetteur que le signal de fin de rebuild part réellement,
        // après la résolution du rebuild (D4-07) — complément du côté récepteur
        // couvert par tests/hook/dnd5e-advancement.test.js.
        expect(Hooks.callAll).toHaveBeenCalledWith("fq-card-engine.deckRebuilt", "userCharacterId");

        vi.useRealTimers();
    });

    it("should handle two different users independently", async () => {
        vi.useFakeTimers();

        const deleteSpy = vi.spyOn(TradingCards, "deleteDeckForUser").mockResolvedValue();
        const updateSpy = vi.spyOn(TradingCards, "updateDeckForUser").mockResolvedValue();

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
            TradingCards.updateDeckWhenChange(docA, {isAdvancement: true, parent: {id: "char-a"}});
            TradingCards.updateDeckWhenChange(docB, {isAdvancement: true, parent: {id: "char-b"}});
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
        expect(TradingCards.getFirstDeck(userId, typeFQ)).toEqual(cards[0]);
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("should return undefined without warning when warning=false and no deck found", () => {
        global.game.cards = [];
        expect(TradingCards.getFirstDeck("user123", "HAND", false)).toBeUndefined();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("should warn WarningHandMissingForPlayer when no HAND deck found", () => {
        global.game.cards = [];
        expect(TradingCards.getFirstDeck("user123", "HAND")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningHandMissingForPlayer", {localize: true});
    });

    it("should warn WarningDeckMissingForPlayer when no DECK deck found", () => {
        global.game.cards = [];
        expect(TradingCards.getFirstDeck("user123", "DECK")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
    });

    it("should warn WarningPileMissingForPlayer when no PILE deck found", () => {
        global.game.cards = [];
        expect(TradingCards.getFirstDeck("user123", "PILE")).toBeUndefined();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
    });

    it("should warn WarningSpellBookMissingForPlayer when no SPELLBOOK deck found", () => {
        global.game.cards = [];
        expect(TradingCards.getFirstDeck("user123", "SPELLBOOK")).toBeUndefined();
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

        TradingCards.drawCard("handId", "deckId", 3);

        expect(game.cards.get).toHaveBeenCalledWith("handId");
        expect(game.cards.get).toHaveBeenCalledWith("deckId");
        expect(drawSpy).toHaveBeenCalledWith(deck, 3, {chatNotification: false, how: 2});
    });

    // ─── passCards ────────────────────────────────────────────────────────────

    it("should pass the requested card ids from the deck to the hand in one transfer", async () => {
        const passSpy = vi.fn().mockResolvedValue([]);
        const hand = {id: "handId"};
        const deck = {id: "deckId", pass: passSpy};
        global.game.cards = {
            get: vi.fn(id => (id === "handId" ? hand : deck))
        };

        await TradingCards.passCards("handId", "deckId", ["c1", "c2"]);

        expect(passSpy).toHaveBeenCalledWith(hand, ["c1", "c2"], {chatNotification: false});
    });

    // ─── sampleCardIds ────────────────────────────────────────────────────────

    it("should sample the requested number of distinct card ids", () => {
        const cards = [{id: "a"}, {id: "b"}, {id: "c"}, {id: "d"}];

        const sampled = TradingCards.sampleCardIds(cards, 2);

        expect(sampled).toHaveLength(2);
        expect(new Set(sampled).size).toBe(2);
        sampled.forEach(id => expect(["a", "b", "c", "d"]).toContain(id));
    });

    it("should cap the sample to the pool size and handle non-positive counts", () => {
        const cards = [{id: "a"}, {id: "b"}];

        expect(TradingCards.sampleCardIds(cards, 5).sort()).toEqual(["a", "b"]);
        expect(TradingCards.sampleCardIds(cards, 0)).toEqual([]);
        expect(TradingCards.sampleCardIds(cards, -2)).toEqual([]);
        expect(TradingCards.sampleCardIds([], 3)).toEqual([]);
    });

    // ─── deleteCardsForDeck ───────────────────────────────────────────────────

    it("should delete the given cards from the deck via deleteEmbeddedDocuments", async () => {
        const deleteEmbeddedDocumentsMock = vi.fn().mockResolvedValue();
        const targetDeck = {deleteEmbeddedDocuments: deleteEmbeddedDocumentsMock};
        const cardsToDelete = [{id: "card1"}, {id: "card2"}];

        await TradingCards.deleteCardsForDeck(targetDeck, cardsToDelete);

        expect(deleteEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", ["card1", "card2"], {fqAllowMandatory: true});
    });

    // ─── cartes obligatoires ──────────────────────────────────────────────────

    describe("TradingCards — cartes obligatoires", () => {

        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            game.combat = null;
        });

        afterEach(() => {
            globalThis.FqCardEngineModule = undefined;
        });

        it("isMandatoryCard : niveau 0 non générée seulement", () => {
            expect(TradingCards.isMandatoryCard({system: {fq: {level: 0}}})).toBe(true);
            expect(TradingCards.isMandatoryCard({system: {fq: {level: 1}}})).toBe(false);
            expect(TradingCards.isMandatoryCard({system: {fq: {level: null}}})).toBe(false);
            expect(TradingCards.isMandatoryCard({system: {fq: {}}})).toBe(false);
            expect(TradingCards.isMandatoryCard({
                system: {fq: {level: 0}}, flags: {"fq-card-engine": {generated: true}}
            })).toBe(false);
        });

        it("syncMandatoryCards : complète chaque carte obligatoire jusqu'à maxSameCard, en un seul appel", async () => {
            const createSpy = vi.spyOn(TradingCards, "createCardsForDeck").mockResolvedValue();
            const basic = {name: "Basic", system: {fq: {level: 0, maxSameCard: 3}}};
            const other = {name: "Other", system: {fq: {level: 0, maxSameCard: 1}}};
            const optional = {name: "Optional", system: {fq: {level: 1, maxSameCard: 2}}};
            const targetDeck = {cards: [{name: "Basic", drawn: true}]};

            const added = await TradingCards.syncMandatoryCards(targetDeck, [basic, other, optional, basic]);

            expect(added).toBe(3);
            expect(createSpy).toHaveBeenCalledTimes(1);
            expect(createSpy).toHaveBeenCalledWith(targetDeck, [basic, basic, other]);
        });

        it("syncMandatoryCards : rien à créer quand le deck est déjà complet", async () => {
            const createSpy = vi.spyOn(TradingCards, "createCardsForDeck").mockResolvedValue();
            const basic = {name: "Basic", system: {fq: {level: 0, maxSameCard: 1}}};

            const added = await TradingCards.syncMandatoryCards({cards: [{name: "Basic"}]}, [basic]);

            expect(added).toBe(0);
            expect(createSpy).not.toHaveBeenCalled();
        });

        it("syncMandatoryCards : aucune mutation pendant un combat", async () => {
            game.combat = {id: "combat"};
            const createSpy = vi.spyOn(TradingCards, "createCardsForDeck").mockResolvedValue();
            const basic = {name: "Basic", system: {fq: {level: 0, maxSameCard: 2}}};

            const added = await TradingCards.syncMandatoryCards({cards: []}, [basic]);

            expect(added).toBe(0);
            expect(createSpy).not.toHaveBeenCalled();
        });

        it("canDeleteDeckCard : refuse la suppression d'une carte obligatoire d'un deck de combat", () => {
            const card = {system: {fq: {level: 0}}, parent: {system: {fq: {type: "DECK"}}}};

            expect(TradingCards.canDeleteDeckCard(card, {})).toBe(false);
            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningCantRemoveMandatoryCard");
        });

        it("canDeleteDeckCard : laisse passer les chemins internes, les autres cartes et les autres piles", () => {
            const mandatoryInDeck = {system: {fq: {level: 0}}, parent: {system: {fq: {type: "DECK"}}}};
            const optionalInDeck = {system: {fq: {level: 2}}, parent: {system: {fq: {type: "DECK"}}}};
            const mandatoryInHand = {system: {fq: {level: 0}}, parent: {system: {fq: {type: "HAND"}}}};

            expect(TradingCards.canDeleteDeckCard(mandatoryInDeck, {fqAllowMandatory: true})).toBe(true);
            expect(TradingCards.canDeleteDeckCard(optionalInDeck, {})).toBe(true);
            expect(TradingCards.canDeleteDeckCard(mandatoryInHand, {})).toBe(true);
            expect(ui.notifications.warn).not.toHaveBeenCalled();
        });
    });

    // ─── logCardPlayed ────────────────────────────────────────────────────────

    describe("PlayCard — logCardPlayed", () => {
        it("should push a log entry and update the active combat when a combat is running", () => {
            const updateMock = vi.fn();
            game.combat = {
                flags: {fq: {logs: []}},
                round: 2,
                turn: 1,
                update: updateMock
            };
            const cardContent = {targetType: "Default", damage: "1d6"};
            PlayCard.logCardPlayed([{key: "Dégâts", value: 5}], cardContent, "userCharacterId",
                ["target1", "target2"], "FQCARDTITLE.Ambush");

            expect(updateMock).toHaveBeenCalledWith({
                "flags.fq": {
                    logs: [expect.objectContaining({
                        actorId: "userCharacterId",
                        targetsId: ["target1", "target2"],
                        round: 2,
                        turn: 1,
                        cardName: "FQCARDTITLE.Ambush"
                    })]
                }
            });
        });

        // Le contenu journalisé est le CHOIX joué : il n'identifie pas la carte.
        // Sans nom fourni (attaque dnd5e), l'entrée porte explicitement null.
        it("journalise null comme nom de carte quand l'appelant n'en fournit pas", () => {
            const updateMock = vi.fn();
            game.combat = {flags: {fq: {logs: []}}, round: 2, turn: 1, update: updateMock};

            PlayCard.logCardPlayed([], {targetType: "Default"}, "me", ["target1"]);

            const {logs} = updateMock.mock.calls[0][0]["flags.fq"];
            expect(logs[0].cardName).toBeNull();
        });

        it("n'ajoute pas l'entrée dans le tableau des flags : muter en place viderait le diff de update()", () => {
            const existing = [{actorId: "before", round: 1}];
            const updateMock = vi.fn();
            game.combat = {flags: {fq: {logs: existing}}, round: 2, turn: 1, update: updateMock};

            PlayCard.logCardPlayed([], {targetType: "Default"}, "me", ["target1"]);

            expect(existing).toHaveLength(1);
            const {logs} = updateMock.mock.calls[0][0]["flags.fq"];
            expect(logs).not.toBe(existing);
            expect(logs).toHaveLength(2);
        });

        it("should not throw and do nothing when there is no active combat", () => {
            game.combat = undefined;
            expect(() => PlayCard.logCardPlayed([], {targetType: "Default"})).not.toThrow();
        });
    });

    // ─── createCardsForDeck ───────────────────────────────────────────────────

    it("should add cards to the deck for SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = SPELLBOOK_TYPE;
        deck.cards = [{name: "ExistingCard"}];
        const cards = [{name: "Card1"}, {name: "Card2"}, {name: "Card3"}];

        await TradingCards.createCardsForDeck(deck, cards);

        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    it("should add all cards to the deck for non-SPELLBOOK_TYPE", async () => {
        deck.system.fq.type = "OTHER_TYPE";
        const cards = [{name: "Card1"}, {name: "Card2"}];

        await TradingCards.createCardsForDeck(deck, cards);

        expect(createEmbeddedDocumentsMock).toHaveBeenCalledWith("Card", cards, {keepId: false});
    });

    // ─── deleteDeckForUser ────────────────────────────────────────────────────

    it("should warn if the user has no character", async () => {
        // Mocker directement sur l'objet game existant après beforeEach
        const getMock = vi.fn().mockReturnValue({character: null, isGM: false});
        game.users = {...game.users, get: getMock};
        console.info("user retourné:", game.users.get("user1"));

        await TradingCards.deleteDeckForUser("user1");
        console.info("warn appelé:", ui.notifications.warn.mock.calls);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoOwnedCharacter");
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it("should warn if the user's character has no main class", async () => {
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(Constants, "userFQClasses").mockReturnValue([]);

        await TradingCards.deleteDeckForUser("user1");

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoMainClass");
        expect(Cards.deleteDocuments).not.toHaveBeenCalled();
    });

    it("should destroy the deck AND the spellbook for a monoclass character at level <= 5", async () => {
        const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 5}};
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(Constants, "userFQClasses").mockReturnValue([mainClass]);
        const existingDeck = {id: "deckId"};
        const existingSpellbook = {id: "spellbookId"};
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            if (typeFq === "SPELLBOOK") return existingSpellbook;
            return undefined;
        });

        await TradingCards.deleteDeckForUser("user1");

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
        vi.spyOn(Constants, "userFQClasses").mockReturnValue([mainClass, secondClass]);
        const existingDeck = {id: "deckId"};
        const existingSpellbook = {id: "spellbookId"};
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            if (typeFq === "SPELLBOOK") return existingSpellbook;
            return undefined;
        });

        await TradingCards.deleteDeckForUser("user1");

        expect(Cards.deleteDocuments).not.toHaveBeenCalledWith([existingDeck.id]);
        expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingSpellbook.id]);
    });

    it("should NOT destroy the deck for a monoclass character above level 5", async () => {
        const mainClass = {name: "Warrior", system: {isOriginalClass: true, levels: 6}};
        game.users = {
            ...game.users,
            get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
        };
        vi.spyOn(Constants, "userFQClasses").mockReturnValue([mainClass]);
        const existingDeck = {id: "deckId"};
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => {
            if (typeFq === "DECK") return existingDeck;
            return undefined;
        });

        await TradingCards.deleteDeckForUser("user1");

        expect(Cards.deleteDocuments).not.toHaveBeenCalledWith([existingDeck.id]);
    });

    // ─── updateDeckForUser ────────────────────────────────────────────────────

    describe("TradingCards — updateDeckForUser", () => {

        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            globalThis.Cards.create = vi.fn().mockResolvedValue({id: "newDeck", cards: []});
            vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(undefined);
            vi.spyOn(TradingCards, "createCardsForDeck").mockResolvedValue();
            vi.spyOn(TradingCards, "deleteCardsForDeck").mockResolvedValue();
        });

        afterEach(() => {
            globalThis.FqCardEngineModule = undefined;
        });

        it("should warn NoOwnedCharacter and create nothing when user has no character (non-GM)", async () => {
            game.users = {...game.users, get: vi.fn().mockReturnValue({character: null, isGM: false})};

            await TradingCards.updateDeckForUser("user1");

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoOwnedCharacter");
            expect(Cards.create).not.toHaveBeenCalled();
        });

        it("should warn NoMainClass and create nothing when class/originDeck are missing (non-GM)", async () => {
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({id: "user1", character: {name: "CharacterName"}, isGM: false})
            };
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([]);

            await TradingCards.updateDeckForUser("user1");

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
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([mainClass]);

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

            await TradingCards.updateDeckForUser("user1");

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
            expect(TradingCards.createCardsForDeck).toHaveBeenCalledWith(
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
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([mainClass]);

            const originDeck = {name: "Warrior Base", system: {someBase: true}, cards: []};
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([originDeck])
            }));

            const existingHand = {id: "existingHand"};
            const existingPile = {id: "existingPile"};
            const existingSpellbook = {id: "existingSpellbook", system: {fq: {classLevels: {Warrior: 1}}}};
            const existingDeck = {id: "existingDeck", cards: []};
            TradingCards.getFirstDeck.mockImplementation((userId, typeFq) => {
                if (typeFq === "HAND") return existingHand;
                if (typeFq === "PILE") return existingPile;
                if (typeFq === "SPELLBOOK") return existingSpellbook;
                if (typeFq === "DECK") return existingDeck;
                return undefined;
            });

            await TradingCards.updateDeckForUser("user1");

            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({type: "hand"}));
            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({type: "pile"}));
            expect(Cards.deleteDocuments).toHaveBeenCalledWith([existingSpellbook.id]);
            // Deck already exists: not recreated
            expect(Cards.create).not.toHaveBeenCalledWith(expect.objectContaining({
                system: expect.objectContaining({fq: expect.objectContaining({type: "DECK"})})
            }));
        });

        it("should unlock neutral cards at the global level (sum of FQ class levels) in spellbook and deck", async () => {
            const warrior = {name: "Warrior", system: {isOriginalClass: true, levels: 3}};
            const mage = {name: "Mage", system: {isOriginalClass: false, levels: 2}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([warrior, mage]);

            const warriorCards = [
                {name: "WarriorCard", system: {fq: {level: 3}}},
                {name: "WarriorLate", system: {fq: {level: 4}}}
            ];
            const mageCards = [{name: "MageCard", system: {fq: {level: 2}}}];
            const neutralCards = [
                {name: "NeutralEarly", system: {fq: {level: 4}}},
                {name: "NeutralLate", system: {fq: {level: 6}}}
            ];
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([
                    {name: "Warrior Base", system: {someBase: true}, cards: warriorCards},
                    {name: "Mage Base", system: {someBase: true}, cards: mageCards},
                    {name: "Neutral Base", system: {someBase: true}, cards: neutralCards}
                ])
            }));

            await TradingCards.updateDeckForUser("user1");

            // Spellbook : cartes de classe au niveau de leur classe, cartes neutres
            // au niveau global 3 + 2 = 5 (NeutralEarly incluse, NeutralLate exclue).
            expect(TradingCards.createCardsForDeck).toHaveBeenNthCalledWith(1,
                expect.anything(),
                [warriorCards[0], mageCards[0], neutralCards[0]]
            );
            // Deck de combat : plus aucun peuplement automatique (D4-01/LEVEL-01) —
            // preuve négative, un seul appel total à createCardsForDeck (le spellbook).
            expect(TradingCards.createCardsForDeck).toHaveBeenCalledTimes(1);
        });

        it("should remove neutral cards from the deck when the global level drops below their level", async () => {
            const warrior = {name: "Warrior", system: {isOriginalClass: true, levels: 2}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([warrior]);

            const neutralCards = [{name: "NeutralGone", system: {fq: {level: 3}}}];
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([
                    {name: "Warrior Base", system: {someBase: true}, cards: []},
                    {name: "Neutral Base", system: {someBase: true}, cards: neutralCards}
                ])
            }));

            const deckCard = {id: "card1", name: "NeutralGone"};
            const existingSpellbook = {id: "existingSpellbook", system: {fq: {classLevels: {Warrior: 3}}}};
            const existingDeck = {id: "existingDeck", cards: [deckCard]};
            TradingCards.getFirstDeck.mockImplementation((userId, typeFq) => {
                if (typeFq === "SPELLBOOK") return existingSpellbook;
                if (typeFq === "DECK") return existingDeck;
                return {id: "other"};
            });

            await TradingCards.updateDeckForUser("user1");

            // Niveau global 3 -> 2 : la carte neutre de niveau 3 quitte le deck.
            expect(TradingCards.deleteCardsForDeck).toHaveBeenCalledWith(existingDeck, [deckCard]);
        });

        it("should fill the deck with every copy of the mandatory (level 0) cards", async () => {
            game.combat = null;
            const warrior = {name: "Warrior", system: {isOriginalClass: true, levels: 1}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([warrior]);

            const basic = {name: "Basic", system: {fq: {level: 0, maxSameCard: 2}}};
            const optional = {name: "Optional", system: {fq: {level: 1, maxSameCard: 2}}};
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([
                    {name: "Warrior Base", system: {someBase: true}, cards: [basic, optional]}
                ])
            }));

            await TradingCards.updateDeckForUser("user1");

            // 1er appel : le grimoire ; 2e : les exemplaires obligatoires du deck, seuls.
            expect(TradingCards.createCardsForDeck).toHaveBeenCalledTimes(2);
            expect(TradingCards.createCardsForDeck).toHaveBeenNthCalledWith(2,
                expect.objectContaining({id: "newDeck"}),
                [basic, basic]
            );
        });

        it("should remove the mandatory cards of a class the character no longer has", async () => {
            const warrior = {name: "Warrior", system: {isOriginalClass: true, levels: 2}};
            game.users = {
                ...game.users,
                get: vi.fn().mockReturnValue({
                    id: "user1",
                    character: {id: "char1", name: "CharacterName"},
                    isGM: false
                })
            };
            vi.spyOn(Constants, "userFQClasses").mockReturnValue([warrior]);

            const mageBasic = {name: "MageBasic", system: {fq: {level: 0}}};
            game.packs.get = vi.fn(() => ({
                getDocuments: vi.fn().mockResolvedValue([
                    {name: "Warrior Base", system: {someBase: true}, cards: []},
                    {name: "Mage Base", system: {someBase: true}, cards: [mageBasic]}
                ])
            }));

            const deckCard = {id: "card1", name: "MageBasic"};
            const existingSpellbook = {id: "existingSpellbook", system: {fq: {classLevels: {Warrior: 2, Mage: 1}}}};
            const existingDeck = {id: "existingDeck", cards: [deckCard]};
            TradingCards.getFirstDeck.mockImplementation((userId, typeFq) => {
                if (typeFq === "SPELLBOOK") return existingSpellbook;
                if (typeFq === "DECK") return existingDeck;
                return {id: "other"};
            });

            await TradingCards.updateDeckForUser("user1");

            expect(TradingCards.deleteCardsForDeck).toHaveBeenCalledWith(existingDeck, [deckCard]);
        });
    });
});
