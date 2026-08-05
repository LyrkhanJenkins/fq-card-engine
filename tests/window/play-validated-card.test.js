import {beforeEach, describe, expect, test, vi} from "vitest";
import {makeCard, makeChoice} from "../factories.js";

// ─── Mocks des feuilles Foundry (couplées à dnd5e / DOM, hors périmètre ici) ──
vi.mock("../../src/domain/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/board/hand-board.js", () => ({default: class {}}));

vi.mock("../../src/hook/socket-lib.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

vi.mock("../../src/domain/utils/play-card.js", () => ({
    default: {
        callBackplayCard: vi.fn().mockResolvedValue(null),
        discardCard: vi.fn()
    }
}));

globalThis.socketlib = {
    registerModule: vi.fn(() => ({register: vi.fn()}))
};

// Import dynamique APRÈS les mocks : peuple window.FqCardEngineModule sans
// dépendre du rendu DOM/Handlebars/Dialog (hors périmètre de ce test).
await import("../../src/init-engine.js");
const PlayCard = (await import("../../src/domain/utils/play-card.js")).default;

/**
 * Construit un contexte `ctx` minimal pour `playValidatedCard`, sans variables
 * ni sbires, avec un seul choix (donc pas de message de chat multi-choix).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Le contexte `ctx` attendu par `playValidatedCard`.
 */
function makeCtx(overrides = {}) {
    const card = makeCard();
    const firstChoice = makeChoice();
    const defaults = {
        firstChoice,
        cardContents: [firstChoice],
        hasVariables: false,
        initCardContents: card.system.fq.choices,
        currentCards: {pass: vi.fn()},
        card
    };
    return {...defaults, ...overrides};
}

describe("playValidatedCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.ChatMessage = {
            create: vi.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
            getSpeaker: vi.fn().mockReturnValue({alias: "Test Character"})
        };
    });

    test("est une fonction exposée sur window.FqCardEngineModule", () => {
        expect(typeof window.FqCardEngineModule.playValidatedCard).toBe("function");
    });

    test("cas nominal : délègue à PlayCard.callBackplayCard avec les 7 arguments exacts", () => {
        const ctx = makeCtx();
        const to = {id: "discard-pile"};
        const fd = {XXX: undefined, YYY: undefined};
        const cardContent = ctx.firstChoice;

        window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx);

        expect(PlayCard.callBackplayCard).toHaveBeenCalledWith(
            to, fd, cardContent, ctx.hasVariables, ctx.initCardContents, ctx.currentCards, ctx.card
        );
    });

    test("garde XXX : fd.XXX === null lève FormError et n'appelle pas callBackplayCard", () => {
        const ctx = makeCtx();
        const to = {id: "discard-pile"};
        const fd = {XXX: null, YYY: undefined};
        const cardContent = ctx.firstChoice;

        expect(() => window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx)).toThrow();
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("garde YYY : fd.YYY === null lève FormError et n'appelle pas callBackplayCard", () => {
        const ctx = makeCtx();
        const to = {id: "discard-pile"};
        const fd = {XXX: undefined, YYY: null};
        const cardContent = ctx.firstChoice;

        expect(() => window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx)).toThrow();
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("garde sbires : sélection incomplète des emplacements lève FormError", () => {
        const firstChoiceWithMinions = makeChoice({minions: ["up", "down"]});
        const card = makeCard({system: {fq: {maxSameCard: 1, class: "neutral", level: 1, isBase: false, choices: [firstChoiceWithMinions]}}});
        const ctx = makeCtx({firstChoice: firstChoiceWithMinions, cardContents: [firstChoiceWithMinions], initCardContents: card.system.fq.choices, card});
        const to = {id: "discard-pile"};
        // Aucun emplacement sélectionné (minionUp/minionDown/minionLeft/minionRight absents) : garde levée.
        const fd = {XXX: undefined, YYY: undefined};
        const cardContent = firstChoiceWithMinions;

        expect(() => window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx)).toThrow();
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("choix multiples : émet un ChatMessage de choix avant de déléguer au pipeline", () => {
        const choiceA = makeChoice({name: "ChoixA"});
        const choiceB = makeChoice({name: "ChoixB"});
        const ctx = makeCtx({firstChoice: choiceA, cardContents: [choiceA, choiceB]});
        const to = {id: "discard-pile"};
        const fd = {XXX: undefined, YYY: undefined, nameContent: "ChoixA"};
        const cardContent = choiceA;

        window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx);

        expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining("FQCARDENGINE.ChatMessageCardEffectChoice")
        }));
        expect(PlayCard.callBackplayCard).toHaveBeenCalledWith(
            to, fd, cardContent, ctx.hasVariables, ctx.initCardContents, ctx.currentCards, ctx.card
        );
    });

    test("choix unique : n'émet pas de ChatMessage de choix", () => {
        const ctx = makeCtx();
        const to = {id: "discard-pile"};
        const fd = {XXX: undefined, YYY: undefined};
        const cardContent = ctx.firstChoice;

        window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, ctx);

        expect(ChatMessage.create).not.toHaveBeenCalled();
    });
});
