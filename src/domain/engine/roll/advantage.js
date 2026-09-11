/**
 * Avantage, désavantage et défenses tombées : les PRÉDICATS, sans aucun dé ni
 * aucun document Foundry.
 *
 * Les acteurs arrivent déjà réduits à des sondes (voir `ConditionProbe`) :
 *
 * - `has(key)`       : l'acteur déclenche-t-il cette règle de `conditionEffects` ?
 * - `causes(key)`    : quelles conditions la déclenchent (pour dire POURQUOI) ;
 * - `untrainedArmor` : porte-t-il une armure ou un bouclier qu'il ne maîtrise pas ?
 *
 * Tout ce qui décide vit donc ici et se teste sans monter de monde.
 *
 * Règle d'annulation D&D : un seul avantage et un seul désavantage suffisent à
 * s'annuler, quel que soit leur nombre de chaque côté.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Advantage {

    /** Jet normal : un seul d20 compte. */
    static NORMAL = 0;

    /** Avantage : le meilleur de deux d20. */
    static ADVANTAGE = 1;

    /** Désavantage : le pire de deux d20. */
    static DISADVANTAGE = -1;

    /** Les caractéristiques que l'armure non maîtrisée pénalise. */
    static PHYSICAL_ABILITIES = Object.freeze(["str", "dex"]);

    /**
     * Le mode qui résulte de raisons d'avantage et de désavantage.
     *
     * @param {object[]} advantages    - Les raisons d'avantage.
     * @param {object[]} disadvantages - Les raisons de désavantage.
     *
     * @returns {number} `ADVANTAGE`, `DISADVANTAGE` ou `NORMAL`.
     */
    static combine(advantages, disadvantages) {
        const advantage = advantages.length > 0;
        const disadvantage = disadvantages.length > 0;
        if (advantage === disadvantage) {
            return Advantage.NORMAL;
        }
        return advantage ? Advantage.ADVANTAGE : Advantage.DISADVANTAGE;
    }

    /**
     * Le mode d'un jet d'ATTAQUE du lanceur contre une cible.
     *
     * Côté lanceur : invisible → avantage ; aveuglé, effrayé, empoisonné, à
     * terre, entravé (et l'épuisement que dnd5e range sous la même règle) →
     * désavantage ; armure non maîtrisée → désavantage, mais seulement si
     * l'attaque passe par la Force ou la Dextérité.
     *
     * Côté cible : aveuglée, paralysée, pétrifiée, entravée, étourdie,
     * inconsciente → avantage ; invisible → désavantage ; à terre → avantage si
     * le lanceur est au contact, désavantage sinon.
     *
     * @param {?object} attacker          - La sonde du lanceur.
     * @param {?object} target            - La sonde de la cible.
     * @param {object}  [options]         - Le contexte du jet.
     * @param {?string} [options.ability] - La caractéristique de l'attaque.
     * @param {boolean} [options.adjacent] - True si le lanceur est au contact de la cible.
     *
     * @returns {{mode: number, advantages: object[], disadvantages: object[]}} Le verdict.
     */
    static attack(attacker, target, {ability = null, adjacent = false} = {}) {
        const advantages = [
            ...Advantage.#reasons(attacker, "fqAttackAdvantage", "caster"),
            ...Advantage.#reasons(target, "fqAttackedAdvantage", "target")
        ];
        const disadvantages = [
            ...Advantage.#reasons(attacker, "attackDisadvantage", "caster"),
            ...Advantage.#reasons(target, "fqAttackedDisadvantage", "target")
        ];
        if (Advantage.#isPhysical(ability) && attacker?.untrainedArmor) {
            disadvantages.push({side: "caster", cause: "armor"});
        }
        if (target?.has("fqProneTarget")) {
            (adjacent ? advantages : disadvantages).push({side: "target", cause: "prone"});
        }
        return {mode: Advantage.combine(advantages, disadvantages), advantages, disadvantages};
    }

    /**
     * Le mode d'une SAUVEGARDE de la cible, ou son échec d'office.
     *
     * Le mode que dnd5e calcule déjà sur la feuille (`save.roll.mode`, qui
     * intègre entravé → désavantage de Dextérité, l'épuisement et les effets
     * actifs) est repris tel quel ; le moteur n'y ajoute que l'armure non
     * maîtrisée, que dnd5e ne consomme nulle part, et ses propres statuts de
     * désavantage (« Ébranlé »), que dnd5e ignore.
     *
     * Une cible sans défense (paralysée, inconsciente) ne jette rien. Une cible
     * pétrifiée ou étourdie rate d'office ses sauvegardes de Force et de
     * Dextérité, et ne jette rien non plus.
     *
     * @param {?object} target               - La sonde de la cible.
     * @param {object}  [options]            - Le contexte du jet.
     * @param {?string} [options.ability]    - La caractéristique de sauvegarde.
     * @param {number}  [options.systemMode] - Le mode lu sur la feuille dnd5e.
     *
     * @returns {{mode: number, auto: ?string, advantages: object[], disadvantages: object[],
     *            autoCauses: object[]}} Le verdict ; `auto` vaut « defenseless » ou
     *          « fail » quand aucun dé ne doit être jeté.
     */
    static save(target, {ability = null, systemMode = Advantage.NORMAL} = {}) {
        const none = {mode: Advantage.NORMAL, advantages: [], disadvantages: []};
        if (Advantage.isDefenseless(target)) {
            return {...none, auto: "defenseless", autoCauses: Advantage.defenselessCauses(target)};
        }
        if (Advantage.#isPhysical(ability) && target?.has("fqStrDexSaveFail")) {
            return {...none, auto: "fail", autoCauses: Advantage.#reasons(target, "fqStrDexSaveFail", "target")};
        }
        const advantages = [];
        const disadvantages = [];
        if (systemMode > 0) {
            advantages.push({side: "target", cause: "sheet"});
        } else if (systemMode < 0) {
            disadvantages.push(...Advantage.#sheetDisadvantages(target, ability));
        }
        if (Advantage.#isPhysical(ability) && target?.untrainedArmor) {
            disadvantages.push({side: "target", cause: "armor"});
        }
        disadvantages.push(...Advantage.#reasons(target, "fqSaveDisadvantage", "target"));
        return {mode: Advantage.combine(advantages, disadvantages), auto: null, advantages, disadvantages, autoCauses: []};
    }

    /**
     * Une cible qui n'oppose plus aucune défense : ni esquive, ni protection de
     * son armure, ni dé de sauvegarde.
     *
     * @param {?object} target - La sonde de la cible.
     *
     * @returns {boolean} True si la cible est sans défense.
     */
    static isDefenseless(target) {
        return !!target?.has("fqDefenseless");
    }

    /**
     * Ce qui laisse une cible sans défense, sous forme de raisons : vide si elle
     * se défend encore.
     *
     * @param {?object} target - La sonde de la cible.
     *
     * @returns {object[]} Les raisons `{side, cause}`.
     */
    static defenselessCauses(target) {
        return Advantage.#reasons(target, "fqDefenseless", "target");
    }

    /**
     * Le d20 qu'un mode retient parmi les dés jetés : le meilleur en avantage,
     * le pire en désavantage, le premier sinon. Un seul dé jeté est rendu tel
     * quel, quel que soit le mode.
     *
     * @param {number[]} dice - Les d20 jetés.
     * @param {number}   mode - Le mode du jet.
     *
     * @returns {number} Le d20 retenu.
     */
    static keep(dice, mode) {
        if (dice.length < 2 || mode === Advantage.NORMAL) {
            return dice[0];
        }
        return mode === Advantage.ADVANTAGE ? Math.max(...dice) : Math.min(...dice);
    }

    /**
     * Les raisons qu'une règle fournit pour un acteur : une par condition en
     * cause, ou la clé de la règle elle-même quand la sonde ne sait pas la
     * nommer (l'épuisement de la règle « legacy » de dnd5e, par exemple).
     *
     * @param {?object} probe - La sonde de l'acteur.
     * @param {string}  key   - La clé de règle.
     * @param {string}  side  - « caster » ou « target ».
     *
     * @returns {object[]} Les raisons `{side, cause}`.
     */
    static #reasons(probe, key, side) {
        if (!probe?.has(key)) {
            return [];
        }
        const causes = probe.causes?.(key) ?? [];
        return (causes.length ? causes : [key]).map(cause => ({side, cause}));
    }

    /**
     * Les raisons d'un désavantage que la feuille dnd5e a posé. Quand une
     * condition connue en est la cause, elle est nommée ; sinon la feuille
     * elle-même l'est (un effet actif, un trait, un objet…).
     *
     * @param {?object} target  - La sonde de la cible.
     * @param {?string} ability - La caractéristique de sauvegarde.
     *
     * @returns {object[]} Les raisons `{side, cause}`.
     */
    static #sheetDisadvantages(target, ability) {
        const keys = ["abilitySaveDisadvantage", ...(ability === "dex" ? ["dexteritySaveDisadvantage"] : [])];
        const causes = keys.flatMap(key => target?.causes?.(key) ?? []);
        return causes.length
            ? [...new Set(causes)].map(cause => ({side: "target", cause}))
            : [{side: "target", cause: "sheet"}];
    }

    /**
     * @param {?string} ability - Une caractéristique.
     *
     * @returns {boolean} True pour la Force et la Dextérité.
     */
    static #isPhysical(ability) {
        return Advantage.PHYSICAL_ABILITIES.includes(ability);
    }
}
