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
 * Phase 12/13 — Additivité de bout en bout : `@wpnR + 1d6` traverse le pipeline de
 * dégâts FQ EXISTANT inchangé, bonus de dégâts acteur inclus. La formule d'arme
 * (`1d8`, mod exclu) est concaténée à `1d6`, puis le pipeline enveloppe du bonus
 * acteur : `(1d8 + 1d6) +2`. Dés pilotés d8 = 5, d6 = 2, d20 critique et d20
 * esquive = 19 (seuils = 20 → ni critique ni esquive).
 */
function makeRangedWeapon() {
    const attackActivity = {
        type: "attack",
        use: vi.fn(),
        getDamageConfig: vi.fn(() => ({rolls: [{parts: ["1d8", "@mod"], data: {mod: 3}}]}))
    };
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: "martialR"},
            activities: {getByType: t => (t === "attack" ? [attackActivity] : [])}
        }
    };
}

const wpnCard = {
    _id: "wpn-card-additive",
    name: "FQCARDTITLE.WpnAdditive",
    face: 0,
    system: {fq: {choices: [{damage: "@wpnR + 1d6", minReach: "1", maxReach: "1", bonusCrit: "0", bonusEva: "0"}]}}
};

describe("@wpnR additif à travers le pipeline de dégâts FQ", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("avec bonus de dégâts acteur '2' : (5+2)+2 = 9", async () => {
        const result = await playChoice(wpnCard, 0, {
            world: {character: {items: [makeRangedWeapon()], system: {fq: {bonus: {damage: "2"}}}}},
            dice: [{faces: 8, value: 5}, {faces: 6, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].type).toBe("damageFQ");
        expect(result.hpCalls[0].value).toBe(9);
    });

    test("sans bonus de dégâts acteur : 5+2 = 7", async () => {
        const result = await playChoice(wpnCard, 0, {
            world: {character: {items: [makeRangedWeapon()]}},
            dice: [{faces: 8, value: 5}, {faces: 6, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].type).toBe("damageFQ");
        expect(result.hpCalls[0].value).toBe(7);
    });
});
