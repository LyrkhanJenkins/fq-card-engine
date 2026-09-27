import {beforeEach, describe, expect, test, vi} from "vitest";
import {basicCard} from "./card-fixtures.js";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le commentaire JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice} = await import("./play-harness.js");

describe("Socle exhaustif (07-02) — tracer end-to-end sur une carte réelle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("joue une carte à dégâts via le vrai playValidatedCard, pipeline complet + Roll déterministe", async () => {
        // Carte FABRIQUEE : le pipeline exerce reste le vrai, mais le tracage ne
        // depend plus de quelle carte est livree (RightPunch a suivi le Moine dans
        // `fq-card-engine-extended`). Degats fixes, sans modificateur ni de : la
        // valeur attendue ne bouge pas avec la fixture du monde.
        const rightPunch = basicCard({damage: "3[bludgeoning]"});

        // damage "3[bludgeoning]" -> 3 degats.
        // Aucun dé piloté : le d20 de critique/esquive retombe sur le défaut stable (1),
        // ni l'un ni l'autre n'atteint son seuil -> dégâts pleins, non critiques.
        const result = await playChoice(rightPunch, 0);

        expect(result.threw).toBe(false);
        expect(result.error).toBeNull();

        expect(result.hpCalls).toHaveLength(1);
        const [hpCall] = result.hpCalls;
        expect(hpCall.type).toBe("damageFQ");
        expect(Number.isFinite(hpCall.value)).toBe(true);
        expect(hpCall.value).toBeGreaterThanOrEqual(0);
        expect(hpCall.value).toBe(3);
        expect(hpCall.targetTokenId).toBe("world-target-token");
    });

    test("pilotage des dés : un critique forcé (1d20 = 20) double les dégâts", async () => {
        // Carte FABRIQUEE : le pipeline exerce reste le vrai, mais le tracage ne
        // depend plus de quelle carte est livree (RightPunch a suivi le Moine dans
        // `fq-card-engine-extended`). Degats fixes, sans modificateur ni de : la
        // valeur attendue ne bouge pas avec la fixture du monde.
        const rightPunch = basicCard({damage: "3[bludgeoning]"});

        const result = await playChoice(rightPunch, 0, {dice: [20]});

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].value).toBe(6); // 3 de base, doublé par le critique piloté
    });
});
