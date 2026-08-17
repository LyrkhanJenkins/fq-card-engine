import {afterEach, describe, expect, test, vi} from "vitest";
import WeaponDamage from "../../src/domain/engine/roll/weapon-damage.js";
import ResourceHandler from "../../src/domain/engine/shared/resource-handler.js";

/**
 * Phase 12/13 — Helper `WeaponDamage` (appels directs, sans harnais). Couvre la
 * sélection par catégorie (`system.type.value`) et l'assemblage de la formule
 * complète via l'activité d'attaque : arme du bon type, bonus magique intégré,
 * sélection du bon type quand plusieurs armes sont équipées, et les trois voies
 * « aucune formule → 0 » (aucune arme du type, aucune activité, `getDamageConfig`
 * en échec). `activity.use` ne doit jamais être appelée.
 */

const RANGED = ["simpleR", "martialR"];
const MELEE = ["simpleM", "martialM"];

/**
 * Item arme équipé d'une catégorie donnée, exposant (ou non) une activité d'attaque.
 *
 * @param {string}      typeValue      - La catégorie dnd5e (`system.type.value`).
 * @param {object|null} attackActivity - L'activité d'attaque, ou null pour aucune.
 *
 * @returns {object} L'item arme.
 */
function makeWeapon(typeValue, attackActivity) {
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            activities: {getByType: t => (t === "attack" && attackActivity ? [attackActivity] : [])}
        }
    };
}

function makeActivity(rolls) {
    return {type: "attack", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls}))};
}

/**
 * Item arme équipé exposant des activités par type (ex. seulement "damage").
 *
 * @param {string}                 typeValue  - La catégorie dnd5e (`system.type.value`).
 * @param {Object<string, object>} byTypeMap  - Les activités indexées par type.
 *
 * @returns {object} L'item arme.
 */
function makeWeaponWithActivities(typeValue, byTypeMap) {
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            activities: {getByType: t => (byTypeMap[t] ? [byTypeMap[t]] : [])}
        }
    };
}

function actorWith(...items) {
    return {items};
}

describe("WeaponDamage.getEquippedWeaponDamageFormula", () => {
    test("arme à distance (martialR) : parts [1d8, @mod], mod=3 → '1d8 + 3'", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialR", activity));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, RANGED)).toBe("1d8 + 3");
        expect(activity.use).not.toHaveBeenCalled();
    });

    test("bonus magique intégré aux parts : [1d8, @mod, 1], mod=2 → '1d8 + 2 + 1'", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod", "1"], data: {mod: 2}}]);
        const actor = actorWith(makeWeapon("simpleM", activity));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, MELEE)).toBe("1d8 + 2 + 1");
        expect(activity.use).not.toHaveBeenCalled();
    });

    test("sélection par type quand mêlée ET distance équipées", () => {
        const melee = makeWeapon("martialM", makeActivity([{parts: ["1d10", "@mod"], data: {mod: 4}}]));
        const ranged = makeWeapon("simpleR", makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]));
        const actor = actorWith(melee, ranged);
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, RANGED)).toBe("1d6 + 2");
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, MELEE)).toBe("1d10 + 4");
    });

    test("aucune arme du type → '0' (une épée équipée, on demande distance)", () => {
        const actor = actorWith(makeWeapon("martialM", makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}])));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, RANGED)).toBe("0");
    });

    test("aucun item / acteur absent → '0' (sans exception)", () => {
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actorWith(), RANGED)).toBe("0");
        expect(WeaponDamage.getEquippedWeaponDamageFormula({}, MELEE)).toBe("0");
        expect(WeaponDamage.getEquippedWeaponDamageFormula(undefined, RANGED)).toBe("0");
    });

    test("arme du type sans activité d'attaque ni de dégâts → '0'", () => {
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actorWith(makeWeapon("martialR", null)), RANGED)).toBe("0");
    });

    test("arme avec seulement une activité 'damage' : la formule est extraite", () => {
        const damageActivity = {type: "damage", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls: [{parts: ["2d6", "@mod"], data: {mod: 2}}]}))};
        const actor = actorWith(makeWeaponWithActivities("martialM", {damage: damageActivity}));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, MELEE)).toBe("2d6 + 2");
        expect(damageActivity.use).not.toHaveBeenCalled();
    });

    test("arme avec activités 'attack' ET 'damage' : les dégâts sont prioritaires", () => {
        const attackActivity = {type: "attack", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls: [{parts: ["1d8", "@mod"], data: {mod: 3}}]}))};
        const damageActivity = {type: "damage", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls: [{parts: ["2d6"], data: {}}]}))};
        const actor = actorWith(makeWeaponWithActivities("simpleR", {attack: attackActivity, damage: damageActivity}));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, RANGED)).toBe("2d6");
        expect(attackActivity.getDamageConfig).not.toHaveBeenCalled();
    });

    test("getDamageConfig qui lève → '0' (aucune exception propagée)", () => {
        const activity = {
            type: "attack",
            use: vi.fn(),
            getDamageConfig: vi.fn(() => {
                throw new Error("no config");
            })
        };
        const actor = actorWith(makeWeapon("simpleR", activity));
        expect(WeaponDamage.getEquippedWeaponDamageFormula(actor, RANGED)).toBe("0");
        expect(activity.use).not.toHaveBeenCalled();
    });

    test("getDamageConfig est toujours appelée à une main (attackMode: 'oneHanded')", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        WeaponDamage.getEquippedWeaponDamageFormula(actorWith(makeWeapon("martialR", activity)), RANGED);
        expect(activity.getDamageConfig).toHaveBeenCalledWith({attackMode: "oneHanded"});
    });
});

describe("WeaponDamage.useEquippedWeapons", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function makeUsableWeapon(equipped = true) {
        return {type: "weapon", system: {equipped}, use: vi.fn()};
    }

    test("hors de son tour de combat : aucune arme utilisée", () => {
        vi.spyOn(ResourceHandler, "validateUseSpellInTurn").mockReturnValue(false);
        const weapon = makeUsableWeapon();
        WeaponDamage.useEquippedWeapons({items: [weapon]});
        expect(weapon.use).not.toHaveBeenCalled();
    });

    test("aucune arme équipée : avertit sans rien utiliser", () => {
        vi.spyOn(ResourceHandler, "validateUseSpellInTurn").mockReturnValue(true);
        const unequipped = makeUsableWeapon(false);
        WeaponDamage.useEquippedWeapons({items: [unequipped]});
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.TokenDamageNoWeaponWarningMsg");
        expect(unequipped.use).not.toHaveBeenCalled();
    });

    test("utilise chaque arme équipée (et ignore le reste de l'inventaire)", () => {
        vi.spyOn(ResourceHandler, "validateUseSpellInTurn").mockReturnValue(true);
        const sword = makeUsableWeapon();
        const bow = makeUsableWeapon();
        const unequipped = makeUsableWeapon(false);
        const potion = {type: "consumable", system: {equipped: true}, use: vi.fn()};
        WeaponDamage.useEquippedWeapons({items: [sword, bow, unequipped, potion]});
        expect(sword.use).toHaveBeenCalled();
        expect(bow.use).toHaveBeenCalled();
        expect(unequipped.use).not.toHaveBeenCalled();
        expect(potion.use).not.toHaveBeenCalled();
    });
});
