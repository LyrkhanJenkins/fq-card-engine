/**
 * Fusionne le schéma `b` dans le schéma `a` en mutant `a` sur place.
 * Utilisé pour greffer les champs de données FQ sur les schémas natifs de
 * dnd5e / Foundry via `libWrapper` (voir `init-engine.js`).
 *
 * @param {object} a - Le schéma cible, muté et enrichi des champs de `b`.
 * @param {object} b - Le schéma source dont les champs sont copiés dans `a`.
 *
 * @returns {object} Le schéma `a` enrichi (même référence que le paramètre `a`).
 *
 * @example
 * const schema = wrapper(...args);
 * return mergeSchema(schema, CharacterDataFQ.defineSchema());
 */
export function mergeSchema(a, b) {
    Object.assign(a, b);
    return a;
}
