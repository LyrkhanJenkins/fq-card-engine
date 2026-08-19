import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock hissé PAR FICHIER) ──
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
 * Jetons de bonus nommés `@bonus.<nom>` : dans N'IMPORTE QUELLE formule d'un
 * choix, le jeton est remplacé par `system.fq.bonus.cards.<nom>` de l'acteur
 * (posé par des effets actifs en jeu), ou par 0 si aucune valeur n'est
 * déclarée — via le VRAI `playValidatedCard` (la substitution passe par
 * `replaceCardContentAbilitiesBonus` → `RollService.replaceNamedBonus`).
 * Dés pilotés : d4 = 3, d20 critique et d20 esquive = 19 (seuils 20 → ni
 * critique ni esquive).
 */
function makeDamageCard(damage) {
    return {
        _id: "named-bonus-card",
        name: "FQCARDTITLE.NamedBonusTracer",
        face: 0,
        system: {fq: {choices: [{damage, bonusCrit: "0", bonusEva: "0"}]}}
    };
}

const DICE = [{faces: 4, value: 3}, {faces: 20, value: 19}, {faces: 20, value: 19}];

describe("@bonus.<nom> — bonus nommés dans les formules (bout en bout)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("un jeton déclaré sur l'acteur s'ajoute aux dégâts", async () => {
        const result = await playChoice(makeDamageCard("1d4 + @bonus.knife"), 0, {
            world: {character: {system: {fq: {bonus: {cards: {knife: 2}}}}}},
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        // 1d4(3) + @bonus.knife(2) = 5
        expect(result.hpCalls[0].value).toBe(5);
    });

    test("un jeton sans valeur déclarée est remplacé par 0", async () => {
        const result = await playChoice(makeDamageCard("1d4 + @bonus.unknown"), 0, {dice: DICE});

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].value).toBe(3);
    });

    test("le jeton est substitué dans les autres formules du choix (coût en action)", async () => {
        const card = {
            _id: "named-bonus-action-card",
            name: "FQCARDTITLE.NamedBonusActionTracer",
            face: 0,
            system: {fq: {choices: [{action: "-(1 + @bonus.haste)"}]}}
        };

        const result = await playChoice(card, 0, {
            world: {character: {system: {fq: {action: {value: 50, max: 200}, bonus: {cards: {haste: 2}}}}}}
        });

        expect(result.threw).toBe(false);
        const actionUpdate = result.updates.find(call => "system.fq.action.value" in call[0]);
        expect(actionUpdate).toBeDefined();
        // 50 − (1 + @bonus.haste(2)) = 47
        expect(actionUpdate[0]["system.fq.action.value"]).toBe(47);
    });
});
