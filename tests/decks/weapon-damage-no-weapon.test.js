import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

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
 * Phase 13 — Garde-fou de lançabilité : une carte portant `@wpnR`/`@wpnM` sans
 * l'arme du type équipée est INJOUABLE, exactement comme un manque de ressources
 * (`checkIfCanUseCard` → warning + `return false`, aucun jet de dégâts). Jouée via
 * le VRAI `playValidatedCard`. Aucune exception : `threw === false`, aucun
 * `hpCalls`, un message d'avertissement en chat.
 */
function makeMeleeWeapon() {
    const attackActivity = {
        type: "attack",
        use: vi.fn(),
        getDamageConfig: vi.fn(() => ({rolls: [{parts: ["1d8", "@mod"], data: {mod: 3}}]}))
    };
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: "martialM"},
            activities: {getByType: t => (t === "attack" ? [attackActivity] : [])}
        }
    };
}

const rangedCard = {
    _id: "wpn-card-ranged",
    name: "FQCARDTITLE.WpnRangedRequired",
    face: 0,
    system: {fq: {choices: [{damage: "@wpnR", bonusCrit: "0", bonusEva: "0"}]}}
};

describe("@wpnR — carte injouable sans arme à distance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("aucune arme équipée → carte bloquée (aucun dégât, avertissement)", async () => {
        const result = await playChoice(rangedCard, 0, {
            world: {character: {items: []}},
            dice: [{faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRangedWeapon"))).toBe(true);
    });

    test("seulement une arme de mêlée équipée → carte @wpnR bloquée (mauvais type)", async () => {
        const result = await playChoice(rangedCard, 0, {
            world: {character: {items: [makeMeleeWeapon()]}},
            dice: [{faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRangedWeapon"))).toBe(true);
    });

    test("matrice complète : cas avec arme (12-01) + cas bloqué (ici) présents", () => {
        const decks = path.join(process.cwd(), "tests", "decks");
        expect(fs.existsSync(path.join(decks, "weapon-damage.test.js"))).toBe(true);
        expect(fs.existsSync(path.join(decks, "weapon-damage-no-weapon.test.js"))).toBe(true);
    });
});
