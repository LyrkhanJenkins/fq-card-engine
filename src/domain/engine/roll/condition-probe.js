import {CONDITION_EFFECTS} from "../../conditions.js";

/**
 * Réduit un acteur à la SONDE que les prédicats d'`Advantage` interrogent :
 * quelles règles de condition il déclenche, à cause de quoi, et s'il porte une
 * armure qu'il ne maîtrise pas.
 *
 * C'est la seule couche qui lit un acteur ; `Advantage` reste pur.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ConditionProbe {

    /**
     * La sonde d'un acteur.
     *
     * @param {?object} actor - L'acteur (lanceur ou cible).
     *
     * @returns {?{has: function(string): boolean, causes: function(string): string[],
     *             untrainedArmor: boolean}} La sonde, ou null sans acteur.
     */
    static of(actor) {
        if (!actor) {
            return null;
        }
        return {
            has: key => ConditionProbe.#has(actor, key),
            causes: key => ConditionProbe.#causes(actor, key),
            untrainedArmor: ConditionProbe.#untrainedArmor(actor)
        };
    }

    /**
     * Le mode de sauvegarde que dnd5e a calculé sur la feuille de l'acteur
     * (`abilities.<abr>.save.roll.mode`) : 1, -1, ou 0.
     *
     * @param {?object} actor   - L'acteur qui sauvegarde.
     * @param {?string} ability - La caractéristique de sauvegarde.
     *
     * @returns {number} Le mode, 0 s'il est absent ou illisible.
     */
    static saveMode(actor, ability) {
        const mode = Number(actor?.system?.abilities?.[ability]?.save?.roll?.mode ?? 0);
        return Number.isFinite(mode) ? Math.sign(mode) : 0;
    }

    /**
     * La règle est-elle déclenchée ? dnd5e en est seul juge quand il est là :
     * `hasConditionEffect` tient compte des immunités et de l'épuisement
     * « legacy ». Sans lui (tests, acteur réduit), la table seule répond.
     *
     * @param {object} actor - L'acteur.
     * @param {string} key   - La clé de règle.
     *
     * @returns {boolean} True si l'acteur déclenche la règle.
     */
    static #has(actor, key) {
        if (typeof actor.hasConditionEffect === "function") {
            return actor.hasConditionEffect(key);
        }
        return ConditionProbe.#causes(actor, key).length > 0;
    }

    /**
     * Les conditions de l'acteur qui déclenchent une règle, immunités retirées.
     *
     * @param {object} actor - L'acteur.
     * @param {string} key   - La clé de règle.
     *
     * @returns {string[]} Les identifiants de condition en cause.
     */
    static #causes(actor, key) {
        const statuses = new Set(actor.statuses ?? []);
        const immunities = new Set(actor.system?.traits?.ci?.value ?? []);
        const table = globalThis.CONFIG?.DND5E?.conditionEffects?.[key] ?? CONDITION_EFFECTS[key] ?? [];
        return [...table].filter(id => statuses.has(id) && !immunities.has(id));
    }

    /**
     * L'acteur porte-t-il une armure ou un bouclier qu'il ne maîtrise pas ?
     *
     * dnd5e calcule ce verdict (`proficiencyMultiplier` de l'objet équipé) mais
     * ne le consomme nulle part. Un PNJ est toujours réputé maîtriser son
     * équipement : dnd5e rend alors 1, jamais 0.
     *
     * @param {object} actor - L'acteur.
     *
     * @returns {boolean} True si une pièce équipée n'est pas maîtrisée.
     */
    static #untrainedArmor(actor) {
        const ac = actor.system?.attributes?.ac;
        return [ac?.equippedArmor, ac?.equippedShield]
            .some(item => item && item.system?.proficiencyMultiplier === 0);
    }
}
