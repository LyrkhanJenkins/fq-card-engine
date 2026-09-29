import {describe, expect, it} from "vitest";
import {JB2A_PATH, visualEffectData} from "../../src/domain/system/fx/visualEffectData.js";

const DAMAGE_TYPES = [
    "default", "acid", "bludgeoning", "cold", "fire", "force", "lightning",
    "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"
];

/**
 * Collecte récursivement toutes les valeurs feuilles (chaînes) d'un objet.
 *
 * @param {object} obj - L'objet à parcourir.
 * @returns {string[]} La liste des valeurs feuilles.
 */
function collectLeaves(obj) {
    return Object.values(obj).flatMap(value =>
        typeof value === "object" && value !== null ? collectLeaves(value) : [value]
    );
}

describe("visualEffectData", () => {

    describe("structure - clés de premier et second niveau", () => {
        it("expose les clés de premier niveau generics et elementalist", () => {
            expect(Object.keys(visualEffectData)).toContain("generics");
            expect(Object.keys(visualEffectData)).toContain("elementalist");
        });

        it("generics.melee a exactement 14 clés incluant default et fire", () => {
            const keys = Object.keys(visualEffectData.generics.melee);
            expect(keys).toHaveLength(14);
            expect(keys.sort()).toEqual([...DAMAGE_TYPES].sort());
            expect(keys).toContain("default");
            expect(keys).toContain("fire");
        });

        it("generics.range a exactement 14 clés incluant default et fire", () => {
            const keys = Object.keys(visualEffectData.generics.range);
            expect(keys).toHaveLength(14);
            expect(keys.sort()).toEqual([...DAMAGE_TYPES].sort());
            expect(keys).toContain("default");
            expect(keys).toContain("fire");
        });

        it("generics.other a les clés [buff, critical, evasion, heal]", () => {
            expect(Object.keys(visualEffectData.generics.other)).toEqual(["buff", "critical", "evasion", "heal"]);
        });
    });

    describe("chemins témoins exacts", () => {
        it("generics.melee.fire", () => {
            expect(visualEffectData.generics.melee.fire)
                .toBe("modules/JB2A_DnD5e/Library/Generic/Impact/ImpactFire01_01_Regular_Orange_600x600.webm");
        });

        it("generics.other.heal", () => {
            expect(visualEffectData.generics.other.heal)
                .toBe("modules/JB2A_DnD5e/Library/Generic/Healing/HealingAbility_01_Green_400x400.webm");
        });

        it("elementalist.tornado", () => {
            expect(visualEffectData.elementalist.tornado)
                .toBe("modules/JB2A_DnD5e/Library/Generic/Nature/SwirlingLeaves01_01_Regular_GreenOrange_60ft_2800x400.webm");
        });
    });

    describe("invariante de format", () => {
        it("chaque chemin (feuille) pointe dans la bibliothèque JB2A et se termine par .webm", () => {
            const leaves = collectLeaves(visualEffectData);
            expect(leaves.length).toBeGreaterThan(0);
            leaves.forEach(path => {
                expect(path).toMatch(new RegExp("^" + JB2A_PATH));
                expect(path).toMatch(/\.webm$/);
            });
        });

        it("les effets à distance sont les variantes 60ft, les seules qui tiennent l'étirement", () => {
            Object.values(visualEffectData.generics.range).forEach(path => {
                expect(path).toMatch(/_60ft_[^/]*\.webm$/);
            });
        });
    });
});
