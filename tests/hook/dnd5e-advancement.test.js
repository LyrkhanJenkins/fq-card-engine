import {afterEach, describe, expect, it, vi} from "vitest";
import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../../src/domain/trading/trading-cards.js";
import SpellbookWindow from "../../src/domain/interface/window/spellbook-window.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import "../../src/hook/integration/dnd5e.hook.js";

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

afterEach(() => {
    vi.restoreAllMocks();
});

// Le Set privé pendingSpellbookOpens (src/hook/integration/dnd5e.hook.js) vit
// au niveau du module, jamais réinitialisé entre les tests de ce fichier :
// chaque test DOIT consommer (déclencher fq-card-engine.deckRebuilt pour) toute
// attente qu'il arme, sous peine de fuiter vers le test suivant.
describe("hook/integration/dnd5e — ouverture automatique du grimoire (LEVEL-04)", () => {

    it("arme l'attente d'ouverture chez le propriétaire de l'acteur, ouvre seulement une fois le rebuild signalé", () => {
        game.users.find = vi.fn(fn => [{id: "user-a", character: {id: "char-a"}}].find(fn));
        const getFirstDeckSpy = vi.spyOn(TradingCards, "getFirstDeck")
            .mockImplementation((userId, typeFq) => (typeFq === SPELLBOOK_TYPE ? {id: "book-a"} : {id: "deck-a"}));
        const openSpy = vi.spyOn(SpellbookWindow, "open").mockImplementation(() => {});

        getHook("dnd5e.advancementManagerComplete")({actor: {id: "char-a"}});

        // Piège d'ordonnancement (Pitfall 1) : rien ne s'ouvre avant le signal de fin de rebuild.
        expect(openSpy).not.toHaveBeenCalled();

        getHook("fq-card-engine.deckRebuilt")("user-a");

        // Le troisième argument coupe l'avertissement : une reconstruction
        // interrompue en a déjà émis un pour la même cause.
        expect(getFirstDeckSpy).toHaveBeenCalledWith("user-a", SPELLBOOK_TYPE, false);
        expect(getFirstDeckSpy).toHaveBeenCalledWith("user-a", DECK_TYPE, false);
        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy).toHaveBeenCalledWith({id: "book-a"}, {id: "deck-a"});
    });

    it("un rebuild d'un AUTRE utilisateur n'ouvre rien ; le bon rebuild ouvre quand même correctement ensuite", () => {
        game.users.find = vi.fn(fn => [{id: "user-b", character: {id: "char-b"}}].find(fn));
        vi.spyOn(TradingCards, "getFirstDeck")
            .mockImplementation((userId, typeFq) => (typeFq === SPELLBOOK_TYPE ? {id: `book-${userId}`} : {id: `deck-${userId}`}));
        const openSpy = vi.spyOn(SpellbookWindow, "open").mockImplementation(() => {});

        getHook("dnd5e.advancementManagerComplete")({actor: {id: "char-b"}});

        getHook("fq-card-engine.deckRebuilt")("user-other"); // rebuild d'un autre utilisateur, jamais armé
        expect(openSpy).not.toHaveBeenCalled();

        getHook("fq-card-engine.deckRebuilt")("user-b"); // le bon rebuild
        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(openSpy).toHaveBeenCalledWith({id: "book-user-b"}, {id: "deck-user-b"});
    });

    it("un second signal de rebuild pour le même utilisateur, sans nouvel armement, n'ouvre pas une seconde fois", () => {
        game.users.find = vi.fn(fn => [{id: "user-c", character: {id: "char-c"}}].find(fn));
        vi.spyOn(TradingCards, "getFirstDeck")
            .mockImplementation((userId, typeFq) => (typeFq === SPELLBOOK_TYPE ? {id: "book-c"} : {id: "deck-c"}));
        const openSpy = vi.spyOn(SpellbookWindow, "open").mockImplementation(() => {});

        getHook("dnd5e.advancementManagerComplete")({actor: {id: "char-c"}});
        getHook("fq-card-engine.deckRebuilt")("user-c");
        getHook("fq-card-engine.deckRebuilt")("user-c"); // second signal, sans nouvel armement entre les deux

        expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it("un acteur sans utilisateur propriétaire n'arme rien et ne plante pas", () => {
        game.users.find = vi.fn(() => undefined);
        const openSpy = vi.spyOn(SpellbookWindow, "open").mockImplementation(() => {});

        expect(() => getHook("dnd5e.advancementManagerComplete")({actor: {id: "orphan"}})).not.toThrow();
        expect(() => getHook("dnd5e.advancementManagerComplete")({})).not.toThrow();

        getHook("fq-card-engine.deckRebuilt")(undefined);
        expect(openSpy).not.toHaveBeenCalled();
    });

    it("deux utilisateurs armés en parallèle ouvrent chacun leur propre fenêtre, une fois chacun", () => {
        game.users.find = vi.fn(fn => [
            {id: "user-d", character: {id: "char-d"}},
            {id: "user-e", character: {id: "char-e"}}
        ].find(fn));
        vi.spyOn(TradingCards, "getFirstDeck")
            .mockImplementation((userId, typeFq) => (typeFq === SPELLBOOK_TYPE ? {id: `book-${userId}`} : {id: `deck-${userId}`}));
        const openSpy = vi.spyOn(SpellbookWindow, "open").mockImplementation(() => {});

        getHook("dnd5e.advancementManagerComplete")({actor: {id: "char-d"}});
        getHook("dnd5e.advancementManagerComplete")({actor: {id: "char-e"}});

        getHook("fq-card-engine.deckRebuilt")("user-d");
        getHook("fq-card-engine.deckRebuilt")("user-e");

        expect(openSpy).toHaveBeenCalledTimes(2);
        expect(openSpy).toHaveBeenCalledWith({id: "book-user-d"}, {id: "deck-user-d"});
        expect(openSpy).toHaveBeenCalledWith({id: "book-user-e"}, {id: "deck-user-e"});
    });
});
