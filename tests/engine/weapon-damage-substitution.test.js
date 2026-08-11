import {afterEach, describe, expect, test, vi} from "vitest";
import WeaponDamage from "../../src/domain/engine/roll/weapon-damage.js";
import RollService from "../../src/domain/engine/roll/roll-service.js";

/**
 * Phase 12/13 — Substitution des jetons d'arme et garde de lançabilité (unitaire).
 * Les jetons `@wpnR`/`@wpnM` ne sont JAMAIS résolus par la passe de
 * caractéristiques à acteur global (`RollService.replaceAbilitiesBonus`) : la
 * substitution se fait via `WeaponDamage.substituteInDamage` avec l'acteur passé
 * explicitement, et `getMissingWeaponWarningKey` alimente le garde-fou moteur.
 */

/**
 * Item arme équipé d'une catégorie donnée produisant `1d8 + @mod` (mod = 3).
 *
 * @param {string} typeValue - La catégorie dnd5e (`system.type.value`).
 *
 * @returns {object} L'item arme.
 */
function makeWeapon(typeValue) {
    const attackActivity = {
        type: "attack",
        use: vi.fn(),
        getDamageConfig: vi.fn(() => ({rolls: [{parts: ["1d8", "@mod"], data: {mod: 3}}]}))
    };
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            activities: {getByType: t => (t === "attack" ? [attackActivity] : [])}
        }
    };
}

describe("Jetons d'arme — invariant caractéristiques", () => {
    afterEach(() => {
        delete globalThis.game;
    });

    test("replaceAbilitiesBonus laisse @wpnR / @wpnM intacts et remplace @str", () => {
        globalThis.game = {
            user: {
                character: {
                    system: {
                        abilities: {
                            str: {mod: 3}, dex: {mod: 0}, con: {mod: 0},
                            int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
                        }
                    }
                }
            }
        };
        expect(RollService.replaceAbilitiesBonus("@wpnR + @str")).toBe("@wpnR + 3");
        expect(RollService.replaceAbilitiesBonus("@wpnM + @str")).toBe("@wpnM + 3");
    });
});

describe("WeaponDamage.substituteInDamage", () => {
    test("@wpnR additif : '@wpnR + 1d6' → '1d8 + 3 + 1d6'", () => {
        const cardContent = {damage: "@wpnR + 1d6"};
        WeaponDamage.substituteInDamage(cardContent, {items: [makeWeapon("martialR")]});
        expect(cardContent.damage).toBe("1d8 + 3 + 1d6");
    });

    test("@wpnM résout la formule de l'arme de mêlée équipée", () => {
        const cardContent = {damage: "@wpnM"};
        WeaponDamage.substituteInDamage(cardContent, {items: [makeWeapon("simpleM")]});
        expect(cardContent.damage).toBe("1d8 + 3");
    });

    test("l'acteur vient du paramètre (aucun acteur global requis)", () => {
        const cardContent = {damage: "@wpnR"};
        WeaponDamage.substituteInDamage(cardContent, {items: [makeWeapon("simpleR")]});
        expect(cardContent.damage).toBe("1d8 + 3");
    });

    test("no-op si damage n'est pas une chaîne ou ne contient aucun jeton d'arme", () => {
        const noToken = {damage: "1d6"};
        WeaponDamage.substituteInDamage(noToken, {items: [makeWeapon("martialR")]});
        expect(noToken.damage).toBe("1d6");

        const noString = {damage: undefined};
        WeaponDamage.substituteInDamage(noString, {items: [makeWeapon("martialR")]});
        expect(noString.damage).toBeUndefined();
    });
});

describe("WeaponDamage.getMissingWeaponWarningKey", () => {
    test("@wpnR sans arme à distance → clé WarningMsgNoRangedWeapon", () => {
        const actor = {items: [makeWeapon("martialM")]}; // seulement une arme de mêlée
        expect(WeaponDamage.getMissingWeaponWarningKey({damage: "@wpnR"}, actor))
            .toBe("FQCARDENGINE.WarningMsgNoRangedWeapon");
    });

    test("@wpnM sans arme de mêlée → clé WarningMsgNoMeleeWeapon", () => {
        const actor = {items: [makeWeapon("simpleR")]};
        expect(WeaponDamage.getMissingWeaponWarningKey({damage: "@wpnM"}, actor))
            .toBe("FQCARDENGINE.WarningMsgNoMeleeWeapon");
    });

    test("null si l'arme du type est équipée", () => {
        const actor = {items: [makeWeapon("martialR")]};
        expect(WeaponDamage.getMissingWeaponWarningKey({damage: "@wpnR + 1d6"}, actor)).toBeNull();
    });

    test("null si aucun jeton d'arme dans damage", () => {
        expect(WeaponDamage.getMissingWeaponWarningKey({damage: "1d8 + @str"}, {items: []})).toBeNull();
    });
});
