import {describe, expect, test} from "vitest";
import WeaponDamage from "../../src/domain/engine/roll/weapon-damage.js";
import ReachProfile from "../../src/domain/engine/reaction/reach-profile.js";

// Portée de mêlée lue sur l'arme équipée. Les valeurs de `range` reproduisent
// celles relevées dans les compendiums dnd5e 5.x (`equipment24` / `items`) :
//   épée longue, dague  -> {reach: 5}
//   hallebarde, glaive, pique, lance, fouet -> {reach: 10}
//   fronde (à distance) -> {value: 30, long: 120, reach: 5}  <- reach factice

/**
 * Item arme équipé, avec une portée et une éventuelle activité.
 *
 * @param {string} typeValue        - La catégorie dnd5e (`system.type.value`).
 * @param {object} range            - Le `system.range` de l'item.
 * @param {object} [activityRange]  - Le `range` de l'activité, si elle en porte un.
 *
 * @returns {object} L'item arme.
 */
function makeWeapon(typeValue, range, activityRange) {
    const activity = activityRange ? {type: "damage", range: activityRange} : undefined;
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            range,
            activities: {getByType: t => (t === "damage" && activity ? [activity] : [])}
        }
    };
}

const FT = (reach) => ({value: null, long: null, reach, units: "ft"});

describe("WeaponDamage.getEquippedMeleeReach", () => {

    test("arme de mêlée standard : 5 pieds", () => {
        const actor = {items: [makeWeapon("martialM", FT(5))]};
        expect(WeaponDamage.getEquippedMeleeReach(actor)).toEqual({reach: 5, units: "ft"});
    });

    test("arme à allonge : 10 pieds", () => {
        const actor = {items: [makeWeapon("martialM", FT(10))]};
        expect(WeaponDamage.getEquippedMeleeReach(actor)).toEqual({reach: 10, units: "ft"});
    });

    test("les catégories de mêlée simple et naturelle sont reconnues", () => {
        for (const category of ["simpleM", "martialM", "natural"]) {
            const actor = {items: [makeWeapon(category, FT(5))]};
            expect(WeaponDamage.getEquippedMeleeReach(actor).reach).toBe(5);
        }
    });

    test("aucune arme de mêlée équipée : portée nulle", () => {
        expect(WeaponDamage.getEquippedMeleeReach({items: []})).toEqual({reach: 0, units: null});
        expect(WeaponDamage.getEquippedMeleeReach({})).toEqual({reach: 0, units: null});
        expect(WeaponDamage.getEquippedMeleeReach(undefined)).toEqual({reach: 0, units: null});
    });

    test("une arme non équipée est ignorée", () => {
        const weapon = makeWeapon("martialM", FT(10));
        weapon.system.equipped = false;
        expect(WeaponDamage.getEquippedMeleeReach({items: [weapon]})).toEqual({reach: 0, units: null});
    });

    test("le reach factice des armes à distance n'est jamais retenu", () => {
        // Une fronde équipée déclare reach: 5, qui ne décrit aucune portée de mêlée.
        const sling = makeWeapon("simpleR", {value: 30, long: 120, reach: 5, units: "ft"});
        expect(WeaponDamage.getEquippedMeleeReach({items: [sling]})).toEqual({reach: 0, units: null});
    });

    test("une arme de mêlée est retenue même si une arme à distance est équipée avant", () => {
        const sling = makeWeapon("simpleR", {value: 30, long: 120, reach: 5, units: "ft"});
        const halberd = makeWeapon("martialM", FT(10));
        expect(WeaponDamage.getEquippedMeleeReach({items: [sling, halberd]}).reach).toBe(10);
    });

    test("la portée de l'activité n'est retenue que si elle est marquée override", () => {
        const inherited = makeWeapon("martialM", FT(10), {reach: 5, units: "ft", override: false});
        expect(WeaponDamage.getEquippedMeleeReach({items: [inherited]}).reach).toBe(10);

        const overridden = makeWeapon("martialM", FT(5), {reach: 15, units: "ft", override: true});
        expect(WeaponDamage.getEquippedMeleeReach({items: [overridden]})).toEqual({reach: 15, units: "ft"});
    });

    test("portée absente, nulle ou non numérique : portée nulle", () => {
        for (const range of [FT(0), FT(null), FT(undefined), FT("allonge"), {}, undefined]) {
            const actor = {items: [makeWeapon("martialM", range)]};
            expect(WeaponDamage.getEquippedMeleeReach(actor)).toEqual({reach: 0, units: null});
        }
    });

    test("unité absente sur l'arme : la portée reste exploitable", () => {
        const actor = {items: [makeWeapon("martialM", {reach: 10})]};
        expect(WeaponDamage.getEquippedMeleeReach(actor)).toEqual({reach: 10, units: null});
    });
});

describe("Composition avec ReachProfile.reachToCases", () => {

    test("les portées dnd5e réelles deviennent 1 et 2 cases sur une grille de 5 pieds", () => {
        globalThis.game = {canvas: {scene: {dimensions: {size: 100}, grid: {distance: 5, units: "ft"}}}};

        const toCases = (actor) => {
            const {reach, units} = WeaponDamage.getEquippedMeleeReach(actor);
            return ReachProfile.reachToCases(reach, units);
        };

        expect(toCases({items: [makeWeapon("martialM", FT(5))]})).toBe(1);
        expect(toCases({items: [makeWeapon("martialM", FT(10))]})).toBe(2);
        // Sans arme de mêlée, la chaîne complète rend 0 : aucune attaque d'opportunité.
        expect(toCases({items: []})).toBe(0);
    });
});
