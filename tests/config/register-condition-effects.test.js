import {afterEach, describe, expect, it} from "vitest";
import {registerConditionEffects} from "../../src/config/register-condition-effects.js";
import {CONDITION_EFFECTS} from "../../src/domain/conditions.js";

/**
 * Les règles du moteur sont VERSÉES dans `CONFIG.DND5E.conditionEffects` : ce
 * que dnd5e y range doit y rester, sans quoi `hasConditionEffect` perdrait les
 * règles du système lui-même (l'épuisement, le désavantage de Dextérité…).
 */

const originalDnd5e = globalThis.CONFIG.DND5E;

/**
 * La table de dnd5e 5.3, réduite aux clés que le moteur complète ou côtoie.
 *
 * @returns {object} Une table neuve.
 */
function dnd5eTable() {
    return {
        attackDisadvantage: new Set(["poisoned", "exhaustion-3"]),
        dexteritySaveDisadvantage: new Set(["restrained"]),
        noMovement: new Set(["grappled", "paralyzed"])
    };
}

afterEach(() => {
    globalThis.CONFIG.DND5E = originalDnd5e;
});

describe("registerConditionEffects", () => {

    it("complète attackDisadvantage sans rien retirer à dnd5e", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: dnd5eTable()};

        registerConditionEffects();

        const table = globalThis.CONFIG.DND5E.conditionEffects;
        expect(table.attackDisadvantage).toEqual(
            new Set(["poisoned", "exhaustion-3", "blinded", "frightened", "prone", "restrained"]));
    });

    it("ne touche pas aux règles que le moteur ne connaît pas", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: dnd5eTable()};

        registerConditionEffects();

        const table = globalThis.CONFIG.DND5E.conditionEffects;
        expect(table.dexteritySaveDisadvantage).toEqual(new Set(["restrained"]));
        expect(table.noMovement).toEqual(new Set(["grappled", "paralyzed"]));
    });

    it("pose chaque règle nouvelle du moteur, sous forme d'ensemble", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: dnd5eTable()};

        registerConditionEffects();

        const table = globalThis.CONFIG.DND5E.conditionEffects;
        for (const [key, conditions] of Object.entries(CONDITION_EFFECTS)) {
            expect(table[key]).toBeInstanceOf(Set);
            for (const condition of conditions) {
                expect(table[key].has(condition)).toBe(true);
            }
        }
    });

    it("toutes les nouvelles règles portent le préfixe fq", () => {
        const added = Object.keys(CONDITION_EFFECTS).filter(key => !(key in dnd5eTable()));

        expect(added.length).toBeGreaterThan(0);
        expect(added.every(key => key.startsWith("fq"))).toBe(true);
    });

    it("peut être rejouée sans rien dupliquer", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: dnd5eTable()};

        registerConditionEffects();
        const once = Object.fromEntries(Object.entries(globalThis.CONFIG.DND5E.conditionEffects)
            .map(([key, set]) => [key, set.size]));
        registerConditionEffects();
        const twice = Object.fromEntries(Object.entries(globalThis.CONFIG.DND5E.conditionEffects)
            .map(([key, set]) => [key, set.size]));

        expect(twice).toEqual(once);
    });

    it("sans dnd5e : ne fait rien et ne lève pas", () => {
        globalThis.CONFIG.DND5E = undefined;

        expect(() => registerConditionEffects()).not.toThrow();
        expect(globalThis.CONFIG.DND5E).toBeUndefined();
    });
});
