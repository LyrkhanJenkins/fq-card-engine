import {CONDITION_EFFECTS} from "../domain/conditions.js";

/**
 * Verse les règles de condition du moteur dans `CONFIG.DND5E.conditionEffects`.
 *
 * Les ensembles existants sont COMPLÉTÉS, jamais remplacés : ce que dnd5e ou un
 * autre module y range reste en place, et `actor.hasConditionEffect` évalue
 * ensuite nos règles comme les siennes, immunités comprises.
 *
 * À appeler au `init` : dnd5e pose `CONFIG.DND5E` dans son propre `init`, qui
 * s'exécute avant celui des modules. Sans dnd5e, rien n'est fait.
 *
 * @returns {void}
 */
export function registerConditionEffects() {
    const table = globalThis.CONFIG?.DND5E?.conditionEffects;
    if (!table) {
        return;
    }
    for (const [key, conditions] of Object.entries(CONDITION_EFFECTS)) {
        table[key] = new Set([...(table[key] ?? []), ...conditions]);
    }
}
