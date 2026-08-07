import {beforeEach, describe, expect, test, vi} from "vitest";

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
const {makeCard, makeChoice} = await import("../factories.js");

/**
 * Phase 10 — retrait d'effet via `applyEffectsFormulas[].effects[].removeEffectName`.
 * Pilote le VRAI pipeline (`playValidatedCard`) via le harnais : quand le jet de la
 * formule touche le `result` de l'effet, le retrait s'applique sur le lanceur ou la
 * cible selon le `self` de l'effet (même règle que l'ajout d'effet).
 *
 * `effectsRemoved` = appels socket `removeEffectForTarget` (retrait sur cible) ;
 * `selfEffectsRemoved` = ids passés à `deleteEmbeddedDocuments` (retrait sur soi).
 * Carte fabriquée : effet à `data: []`, seul le retrait est exercé.
 */
function cardWithFormulaRemove({self, removeEffectName, result = "1", reach = true}) {
    return makeCard({
        name: "FQCARDTITLE.RemoveEffectHarness",
        faces: [{name: "", img: "", text: ""}],
        system: {
            fq: {
                maxSameCard: 1, class: "neutral", level: 1, isBase: false,
                choices: [makeChoice({
                    damage: "",
                    minReach: reach ? "1" : "",
                    maxReach: reach ? "6" : "",
                    applyEffectsFormulas: [{
                        title: "T", formula: "1",
                        effects: [{result, self, data: [], removeEffectName, messages: []}]
                    }]
                })]
            }
        }
    });
}

const targetWith = (...effects) => ({world: {targetActor: {effects: {contents: effects}}}});
const casterWith = (...effects) => ({world: {character: {effects: {contents: effects}}}});

describe("removeEffectName — pipeline réel via playChoice", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("effet non-self + portée : retire l'effet nommé sur la cible (socket removeEffectForTarget)", async () => {
        const result = await playChoice(
            cardWithFormulaRemove({self: false, removeEffectName: "Earth Effect"}),
            0,
            targetWith({id: "eff-earth", name: "Earth Effect"}, {id: "eff-frost", name: "Frost"})
        );

        expect(result.threw).toBe(false);
        expect(result.effectsRemoved).toContainEqual({targetId: "world-target-token", effectId: "eff-earth"});
        expect(result.selfEffectsRemoved).toEqual([]);
    });

    test("effet self : retire l'effet nommé sur le lanceur (deleteEmbeddedDocuments)", async () => {
        const result = await playChoice(
            cardWithFormulaRemove({self: true, removeEffectName: "Poison", reach: false}),
            0,
            casterWith({id: "self-poison", name: "Poison"})
        );

        expect(result.threw).toBe(false);
        expect(result.selfEffectsRemoved).toContain("self-poison");
        expect(result.effectsRemoved).toEqual([]);
    });

    test("nom absent sur la cible : aucun retrait", async () => {
        const result = await playChoice(
            cardWithFormulaRemove({self: false, removeEffectName: "Earth Effect"}),
            0,
            targetWith({id: "eff-frost", name: "Frost"})
        );

        expect(result.threw).toBe(false);
        expect(result.effectsRemoved).toEqual([]);
    });

    test("effet non déclenché (result ≠ jet) : aucun retrait", async () => {
        const result = await playChoice(
            cardWithFormulaRemove({self: false, removeEffectName: "Earth Effect", result: "2"}),
            0,
            targetWith({id: "eff-earth", name: "Earth Effect"})
        );

        expect(result.threw).toBe(false);
        expect(result.effectsRemoved).toEqual([]);
    });

    test("removeEffectName vide : aucun retrait (invariant de non-régression)", async () => {
        const result = await playChoice(
            cardWithFormulaRemove({self: false, removeEffectName: ""}),
            0,
            targetWith({id: "eff-earth", name: "Earth Effect"})
        );

        expect(result.threw).toBe(false);
        expect(result.effectsRemoved).toEqual([]);
        expect(result.selfEffectsRemoved).toEqual([]);
    });
});
