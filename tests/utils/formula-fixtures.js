import {vi} from "vitest";

/**
 * Fabriques et jeux de caractéristiques partagés par les tests de la Phase 20
 * (`formula-display.test.js`, `display-card.test.js`,
 * `formula-corpus-snapshot.test.js`). Extraites ici pour éviter toute
 * duplication entre fichiers de test (plutôt que de recopier `makeWeapon` /
 * `makeActivity` / `actorWith` dans chaque nouveau fichier de test).
 *
 * Origine : `makeWeapon`/`makeActivity`/`actorWith` reprises de
 * `tests/engine/weapon-damage.test.js` (Phase 12/13), déjà réutilisées telles
 * quelles par `tests/utils/formula-display.test.js` (Phase 20 plan 01).
 */

/**
 * Arme équipée d'une catégorie donnée exposant une activité d'attaque.
 * `name` alimente le tooltip de pastille de source
 * (`FormulaDisplay.collectSourceDetails`).
 *
 * @param {string} typeValue - La catégorie d'arme (`system.type.value`, ex. `"martialM"`).
 * @param {object|null} attackActivity - L'activité d'attaque (voir `makeActivity`), ou `null` si aucune.
 * @param {string} [name] - Le nom de l'arme.
 *
 * @returns {object} Un item d'arme minimal, tel que consommé par `WeaponDamage`.
 */
export function makeWeapon(typeValue, attackActivity, name = "Arme") {
    return {
        name,
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            activities: {getByType: t => (t === "attack" && attackActivity ? [attackActivity] : [])}
        }
    };
}

/**
 * Activité d'attaque minimale exposant `getDamageConfig` (jets de dégâts).
 *
 * @param {Array<{parts: string[], data: object}>} rolls - Les jets de dégâts de l'activité.
 *
 * @returns {object} Une activité d'attaque minimale.
 */
export function makeActivity(rolls) {
    return {type: "attack", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls}))};
}

/**
 * Acteur minimal portant des items (armes), sans caractéristiques (les
 * caractéristiques sont lues via `game.user.character.system.abilities`,
 * hors de cet objet — voir `Constants.actorAbi`).
 *
 * @param {...object} items - Les items portés par l'acteur.
 *
 * @returns {{items: object[]}} L'acteur minimal.
 */
export function actorWith(...items) {
    return {items};
}

/**
 * Les 6 caractéristiques posées à 0 : piège documenté (13-01-PLAN.md) — les
 * substitutions lisent les 6 caractéristiques, une caractéristique manquante
 * lève une exception non liée au cas testé.
 * @type {Object<string, {mod: number}>}
 */
export const NEUTRAL_ABILITIES = {
    str: {mod: 0}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
};

/**
 * Acteur de référence de `20-CONTEXT.md` (corpus de référence, gelé en
 * discussion, ne pas dévier) : 💪+3 🎯+2 ❤️+1 🧠+4 🦉+3 ✨️+2.
 * @type {Object<string, {mod: number}>}
 */
export const REFERENCE_ABILITIES = {
    str: {mod: 3}, dex: {mod: 2}, con: {mod: 1}, int: {mod: 4}, wis: {mod: 3}, cha: {mod: 2}
};

/**
 * La formule de dégâts de l'arme de mêlée de référence (« Épée longue »),
 * produite par `WeaponDamage.getEquippedWeaponDamageFormula` pour l'acteur de
 * `makeReferenceActor` : `1d8` seul — le terme `@mod` de l'activité est EXCLU
 * des jetons d'arme (sémantique de `getEquippedWeaponDamageFormula`).
 * @type {string}
 */
export const REFERENCE_WEAPON_FORMULA = "1d8";

/**
 * Acteur de référence de `20-CONTEXT.md` : porte une arme de mêlée équipée
 * nommée « Épée longue » dont l'activité d'attaque produit
 * `REFERENCE_WEAPON_FORMULA`. Les caractéristiques (`REFERENCE_ABILITIES`) ne
 * sont PAS portées par cet objet : elles doivent être posées séparément sur
 * `game.user.character.system.abilities` (`Constants.actorAbi`), comme pour
 * toute résolution de caractéristique de `FormulaDisplay`.
 *
 * @returns {{items: object[]}} L'acteur de référence, prêt pour la résolution d'arme.
 */
export function makeReferenceActor() {
    const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
    return actorWith(makeWeapon("martialM", activity, "Épée longue"));
}
