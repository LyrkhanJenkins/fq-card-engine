import {afterEach, describe, expect, it, vi} from "vitest";
import {makeDeck} from "../factories.js";
import TradingCards, {DECK_TYPE} from "../../src/domain/trading/trading-cards.js";
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

        it("historise la carte jouée dans les flags utilisateur quand showPlayedPlayerNames est actif", () => {
            const hook = getHook("passCards");
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine", playerPlayedProp: "playerPlayed"};
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = true;
            game.user.getFlag = vi.fn(() => undefined);
            game.user.setFlag = vi.fn();

            const from = makeDeck("HAND", {type: "hand"});
            const to = makeDeck("PILE", {type: "pile"});
            const action = {action: "play", toCreate: [{_id: "card-1"}]};

            hook(from, to, action);

            expect(game.user.getFlag).toHaveBeenCalledWith("fq-card-engine", "playerPlayed");
            expect(game.user.setFlag).toHaveBeenCalledWith(
                "fq-card-engine", "playerPlayed", expect.objectContaining({"card-1": expect.any(Number)})
            );

            // Restauré pour ne pas polluer les autres tests du fichier (CONFIG n'est
            // pas réinitialisé entre tests, cf. tests/setup.js Zone 1).
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = false;
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

    describe("dealCards / returnCards (no-op)", () => {
        it("dealCards n'a aucun effet observable", () => {
            const hook = getHook("dealCards");

            expect(() => hook({}, {}, {})).not.toThrow();
            expect(hook({}, {}, {})).toBeUndefined();
        });

        it("returnCards n'a aucun effet observable", () => {
            const hook = getHook("returnCards");

            expect(() => hook({}, {}, {})).not.toThrow();
            expect(hook({}, {}, {})).toBeUndefined();
        });
    });
});
