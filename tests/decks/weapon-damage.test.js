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
 * Phase 12/13 Tracer : le jeton `@wpnR` injecte les dégâts de l'arme à distance
 * équipée dans la formule de dégâts d'une carte, jouée via le VRAI
 * `playValidatedCard`. Arme `martialR` dont l'activité produit `1d8 + @mod`
 * (mod = 3). Dés pilotés : d8 = 5, d20 critique et d20 esquive = 19 (seuils = 21 −
 * critical(1) − 0 = 20 → ni critique ni esquive). Attendu : 5 + 3 = 8 dégâts.
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

describe("@wpnR — dégâts de l'arme à distance (bout en bout)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("une carte @wpnR jouée avec une arme à distance inflige ses dégâts", async () => {
        const weapon = makeRangedWeapon();
        const card = {
            _id: "wpn-card",
            name: "FQCARDTITLE.WpnTracer",
            face: 0,
            system: {fq: {choices: [{damage: "@wpnR", bonusCrit: "0", bonusEva: "0"}]}}
        };

        const result = await playChoice(card, 0, {
            world: {character: {items: [weapon]}},
            dice: [{faces: 8, value: 5}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].type).toBe("damageFQ");
        expect(result.hpCalls[0].value).toBe(8);
        expect(weapon.system.activities.getByType("attack")[0].use).not.toHaveBeenCalled();
    });
});
