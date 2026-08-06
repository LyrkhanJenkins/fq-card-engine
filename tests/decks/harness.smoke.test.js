import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

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

/**
 * Charge une entrée de carte brute depuis un deck du dépôt
 * (`packs/_source/decks-pattern-fq8/<deckFile>`), par index dans `cards[]`.
 *
 * @param {string} deckFile   - Le nom de fichier du deck (ex. `monk-base.json`).
 * @param {number} cardIndex  - L'indice de la carte dans `deck.cards`.
 *
 * @returns {object} L'entrée carte brute.
 */
function loadRawCard(deckFile, cardIndex) {
    const deckPath = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8", deckFile);
    const deck = JSON.parse(fs.readFileSync(deckPath, "utf-8"));
    return deck.cards[cardIndex];
}

describe("Socle exhaustif (07-02) — tracer end-to-end sur une carte réelle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("joue FQCARDTITLE.RightPunch (monk-base, choix 0) via le vrai playValidatedCard, pipeline complet + Roll déterministe", async () => {
        const rightPunch = loadRawCard("monk-base.json", 0);
        expect(rightPunch.name).toBe("FQCARDTITLE.RightPunch");

        // RightPunch : damage "(2 + ceil(@str/3))[bludgeoning]", @str=3 (fixture) -> 2 + ceil(1) = 3.
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
        const rightPunch = loadRawCard("monk-base.json", 0);

        const result = await playChoice(rightPunch, 0, {dice: [20]});

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].value).toBe(6); // 3 de base, doublé par le critique piloté
    });
});
