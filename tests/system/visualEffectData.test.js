import {describe, expect, it} from "vitest";
import {visualEffectData} from "../../src/domain/system/fx/visualEffectData.js";

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
            expect(visualEffectData.generics.melee.fire).toBe("modules/fq-card-engine/visuals/generics/melee/fire.webm");
        });

        it("generics.other.heal", () => {
            expect(visualEffectData.generics.other.heal).toBe("modules/fq-card-engine/visuals/generics/other/heal.webm");
        });

        it("elementalist.tornado", () => {
            expect(visualEffectData.elementalist.tornado).toBe("modules/fq-card-engine/visuals/elementalist/tornado.webm");
        });
    });

    describe("invariante de format", () => {
        it("chaque chemin (feuille) commence par le préfixe visuels et se termine par .webm", () => {
            const leaves = collectLeaves(visualEffectData);
            expect(leaves.length).toBeGreaterThan(0);
            leaves.forEach(path => {
                expect(path).toMatch(/^modules\/fq-card-engine\/visuals\//);
                expect(path).toMatch(/\.webm$/);
            });
        });
    });
});
