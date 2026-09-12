import {afterEach, describe, expect, it, vi} from "vitest";
import {makeDeck} from "../factories.js";
import TradingCards, {DECK_TYPE, PILE_TYPE} from "../../src/domain/trading/trading-cards.js";
import "../../src/hook/trading-cards.hook.js";

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

afterEach(() => {
    vi.restoreAllMocks();
    // Globals locaux : nettoyés pour ne pas fuiter vers les autres suites (T-04-05).
    globalThis.FqCardEngineModule = undefined;
    if (globalThis.foundry) {
        delete globalThis.foundry.documents;
    }
});

describe("trading-cards", () => {

    describe("updateUser", () => {
        it("délègue à TradingCards.updateDeckWhenAssigned(user, changed, userId)", () => {
            vi.spyOn(TradingCards, "updateDeckWhenAssigned").mockResolvedValue(undefined);
            const user = {id: "player-1"};
            const changed = {character: "actor-1"};

            getHook("updateUser")(user, changed, {}, "gm-1");

            expect(TradingCards.updateDeckWhenAssigned).toHaveBeenCalledWith(user, changed, "gm-1");
        });
    });

    describe("passCards", () => {
        it("avertit et bloque le passage d'une carte du spellbook hors deck", () => {
            const hook = getHook("passCards");
            const from = makeDeck("SPELLBOOK", {type: "deck"});
            const to = makeDeck("PILE", {type: "pile"});
            const action = {action: "pass", toCreate: []};

            const result = hook(from, to, action);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningOnlyCopyCardFromSpellBookToDeck");
            expect(result).toBe(false);
        });

        it("crée les cartes dans le deck cible quand deck->deck valide et canPassCardsToDeck vrai", () => {
            const hook = getHook("passCards");
            vi.spyOn(TradingCards, "canPassCardsToDeck").mockReturnValue(true);
            const from = makeDeck(DECK_TYPE, {type: "deck"});
            const to = makeDeck(DECK_TYPE, {type: "deck"});
            const action = {action: "pass", toCreate: [{name: "Card1"}]};

            const result = hook(from, to, action);

            expect(to.createEmbeddedDocuments).toHaveBeenCalledWith("Card", [...action.toCreate], {keepId: false});
            expect(ui.notifications.warn).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it("avertit sans créer de cartes quand canPassCardsToDeck est faux (limite atteinte)", () => {
            const hook = getHook("passCards");
            vi.spyOn(TradingCards, "canPassCardsToDeck").mockReturnValue(false);
            const from = makeDeck(DECK_TYPE, {type: "deck"});
            const to = makeDeck(DECK_TYPE, {type: "deck"});
            const action = {action: "pass", toCreate: [{name: "Card1"}]};

            const result = hook(from, to, action);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningReachMaxCardsForDeck");
            expect(to.createEmbeddedDocuments).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it("laisse passer (true) quand aucune des conditions de blocage n'est remplie", () => {
            const hook = getHook("passCards");
            const from = makeDeck("HAND", {type: "hand"});
            const to = makeDeck("HAND", {type: "hand"});
            const action = {action: "pass", toCreate: []};

            const result = hook(from, to, action);

            expect(ui.notifications.warn).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });
    });

    describe("preCreateCard", () => {
        it("remplace l'icône par défaut par l'icône 'en cours' de FQ", () => {
            const hook = getHook("preCreateCard");
            const DEFAULT_ICON = "icons/svg/card-joker.svg";
            globalThis.foundry.documents = {BaseCard: {DEFAULT_ICON}};
            const card = {updateSource: vi.fn()};
            const data = {faces: [{img: DEFAULT_ICON}]};

            hook(card, data, {}, "user-1");

            expect(card.updateSource).toHaveBeenCalledWith({
                faces: [{img: "modules/fq-card-engine/images/cards/in_progress.png"}]
            });
        });

        it("ne modifie pas la face si l'icône n'est pas celle par défaut", () => {
            const hook = getHook("preCreateCard");
            globalThis.foundry.documents = {BaseCard: {DEFAULT_ICON: "icons/svg/card-joker.svg"}};
            const card = {updateSource: vi.fn()};
            const data = {faces: [{img: "modules/fq-card-engine/images/cards/custom.png"}]};

            hook(card, data, {}, "user-1");

            expect(card.updateSource).not.toHaveBeenCalled();
        });
    });

    describe("recallCardsFromPiles", () => {

        // Collection embarquée minimale : un tableau doté d'un `get` par id,
        // comme l'EmbeddedCollection Foundry consommée par recallCardsFromPiles.
        function makeEmbedded(cards) {
            return Object.assign([...cards], {get: (id) => cards.find(c => c.id === id)});
        }

        function makeTestDeck(cards, owner) {
            return {
                id: "deck-1",
                system: {fq: {type: DECK_TYPE, owner}},
                cards: makeEmbedded(cards),
                updateEmbeddedDocuments: vi.fn().mockResolvedValue([]),
                createEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
        }

        function makeTestPile(cards, owner) {
            return {
                system: {fq: {type: PILE_TYPE, owner}},
                cards: makeEmbedded(cards),
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
        }

        /** Copie générée défaussée : flag `generated`, origine = la main quittée (v14). */
        function makeGeneratedPileCard(id) {
            const data = {name: id, drawn: false, face: 0, flags: {"fq-card-engine": {generated: true, generatedAt: 1}}};
            return {
                id,
                origin: {type: "hand"},
                flags: data.flags,
                toObject: () => JSON.parse(JSON.stringify({...data, _id: id}))
            };
        }

        it("ramène au deck ses cartes défaussées dans n'importe quelle pile, sans toucher aux autres", async () => {
            const deck = makeTestDeck([{id: "c1", drawn: true}, {id: "c2", drawn: true}]);
            const ownPile = makeTestPile([{id: "c1", origin: deck}]);
            const otherPile = makeTestPile([
                {id: "c2", origin: deck},
                {id: "x1", origin: {id: "other-deck"}}
            ]);
            game.cards = [ownPile, otherPile, deck]; // le deck n'est pas une pile : ignoré

            const recalled = await TradingCards.recallCardsFromPiles(deck);

            expect(recalled).toBe(2);
            expect(deck.updateEmbeddedDocuments).toHaveBeenCalledWith("Card", [{_id: "c1", drawn: false}]);
            expect(deck.updateEmbeddedDocuments).toHaveBeenCalledWith("Card", [{_id: "c2", drawn: false}]);
            expect(ownPile.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["c1"]);
            expect(otherPile.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["c2"]);
        });

        it("supprime la copie orpheline (originale absente du deck) sans mise à jour du deck", async () => {
            const deck = makeTestDeck([]);
            const pile = makeTestPile([{id: "gone", origin: deck}]);
            game.cards = [pile];

            const recalled = await TradingCards.recallCardsFromPiles(deck);

            expect(recalled).toBe(1);
            expect(deck.updateEmbeddedDocuments).not.toHaveBeenCalled();
            expect(pile.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["gone"]);
        });

        it("pile sans carte du deck (ou sans origin) : aucune opération", async () => {
            const deck = makeTestDeck([{id: "c1", drawn: true}]);
            const pile = makeTestPile([{id: "x1", origin: {id: "other-deck"}}, {id: "x2"}]);
            game.cards = [pile];

            const recalled = await TradingCards.recallCardsFromPiles(deck);

            expect(recalled).toBe(0);
            expect(deck.updateEmbeddedDocuments).not.toHaveBeenCalled();
            expect(pile.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });

        it("déplace les cartes générées de la pile du même joueur dans le deck (piochables à nouveau)", async () => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            const deck = makeTestDeck([{id: "c1", drawn: true}], "user-1");
            const pile = makeTestPile([
                makeGeneratedPileCard("gen-1"),
                {id: "c1", origin: deck}
            ], "user-1");
            game.cards = [pile];

            const recalled = await TradingCards.recallCardsFromPiles(deck);

            expect(recalled).toBe(2);
            const [embeddedName, [data]] = deck.createEmbeddedDocuments.mock.calls[0];
            expect(embeddedName).toBe("Card");
            expect(data._id).toBeUndefined();
            expect(data.drawn).toBe(false);
            expect(data.origin).toBeNull();
            // Le flag survit au transfert : le nettoyage de combat saura la supprimer du deck
            expect(data.flags["fq-card-engine"].generated).toBe(true);
            expect(pile.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["c1", "gen-1"]);
        });

        it("ne recycle pas les cartes générées d'une pile appartenant à un autre joueur", async () => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            const deck = makeTestDeck([], "user-1");
            const otherPile = makeTestPile([makeGeneratedPileCard("gen-1")], "user-2");
            game.cards = [otherPile];

            const recalled = await TradingCards.recallCardsFromPiles(deck);

            expect(recalled).toBe(0);
            expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
            expect(otherPile.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });
    });
});
