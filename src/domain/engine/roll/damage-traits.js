/**
 * Résistances, immunités et vulnérabilités appliquées aux dégâts d'une carte,
 * d'une activité dnd5e ou d'un effet par tour.
 *
 * Les dégâts se lancent d'un seul tenant. Leurs éléments sont les types écrits
 * entre crochets dans la formule : `(1d4)[fire] + (4+1d6)[cold]` est de feu ET
 * de froid. Chaque élément donne un coefficient et les coefficients se
 * MULTIPLIENT — résistance ×½, vulnérabilité ×2, immunité ×½, et ×0 seulement
 * quand la cible est immunisée à TOUS les éléments. Résistante au feu et
 * immunisée au froid, une cible prend ×¼ d'un sort de feu et de froid ;
 * vulnérable au feu et résistante au froid, elle prend ×1.
 *
 * Savoir si un élément est résisté reste l'affaire de dnd5e :
 * `Actor5e#calculateDamage` connaît les traits `dr`/`di`/`dv`, les traits « à
 * tous les dégâts », leurs contournements (dégâts magiques, argentés…), et
 * qu'une immunité efface le reste pour son élément. Le moteur lui soumet chaque
 * élément et ne lit que ses marques ; il ne calcule lui-même que le coefficient.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DamageTraits {

    /**
     * Les propriétés de dégâts magiques : ils passent outre les résistances qui
     * les excluent (« dégâts des attaques non magiques »).
     *
     * @type {ReadonlyArray<string>}
     */
    static MAGICAL_PROPERTIES = Object.freeze(["mgc"]);

    /** Le montant témoin soumis à dnd5e pour chaque élément : seules ses marques sont lues. */
    static #PROBE = 100;

    /**
     * Les éléments d'une formule : ses types entre crochets, chacun une fois.
     *
     * @param {string|number} formula - La formule de dégâts.
     *
     * @returns {string[]} Les types de dégâts, dans l'ordre de leur première apparition.
     */
    static elementsOf(formula) {
        const types = [...String(formula ?? "").matchAll(/\[([a-zA-Z]+)\]/g)].map(match => match[1].toLowerCase());
        return [...new Set(types)];
    }

    /**
     * Les propriétés des dégâts d'un choix de carte, selon sa case « Dégâts
     * magiques ». Un choix antérieur à la case est magique, comme le défaut du
     * schéma. Les activités dnd5e, elles, gardent les propriétés de leur jet.
     *
     * @param {?object} choice - Le choix de carte.
     *
     * @returns {string[]} Les propriétés de ses dégâts.
     */
    static cardProperties(choice) {
        return choice?.magical === false ? [] : [...DamageTraits.MAGICAL_PROPERTIES];
    }

    /**
     * Applique à un acteur des dégâts, après le multiplicateur de l'échelle FQ.
     *
     * @param {?object}  actor        - L'acteur qui encaisse.
     * @param {number}   amount       - Les dégâts lancés.
     * @param {number}   [multiplier] - Le cran de l'échelle FQ (0, ½, 1, 2).
     * @param {object}   [options]    - Les options.
     * @param {string[]} [options.types]      - Les éléments des dégâts ; aucun : rien ne les réduit.
     * @param {string[]} [options.properties] - Leurs propriétés (magique, argenté…) ; aucune par défaut.
     *
     * @returns {{value: number, traits: Array<{type: string, kinds: string[], factor: number}>}}
     *          Les dégâts à retirer, et les éléments sur lesquels un trait a joué,
     *          `kinds` parmi « immune », « resist », « vulnerable ».
     */
    static apply(actor, amount, multiplier = 1, {types = [], properties = []} = {}) {
        const traits = DamageTraits.#traitsOf(actor, types, properties);
        const factor = traits.reduce((product, trait) => product * trait.factor, 1);
        return {
            value: Math.trunc(amount * multiplier * factor),
            traits: traits.filter(trait => trait.kinds.length)
        };
    }

    /**
     * Les traits de l'acteur pour chaque élément, et le coefficient de chacun.
     *
     * @param {?object}  actor      - L'acteur qui encaisse.
     * @param {string[]} types      - Les éléments.
     * @param {string[]} properties - Les propriétés des dégâts.
     *
     * @returns {Array<{type: string, kinds: string[], factor: number}>} Un détail par élément.
     */
    static #traitsOf(actor, types, properties) {
        let marks = [];
        if (types.length && typeof actor?.calculateDamage === "function") {
            // Un calcul annulé par un module rend false : aucun trait ne joue.
            marks = actor.calculateDamage(types.map(type => ({
                value: DamageTraits.#PROBE, type, properties: new Set(properties)
            })), {only: "damage"}) || [];
        }
        const kinds = types.map((type, index) => DamageTraits.#kinds(marks[index]?.active));
        const immuneToAll = kinds.every(list => list.includes("immune"));
        return types.map((type, index) => ({
            type, kinds: kinds[index], factor: DamageTraits.#factor(kinds[index], immuneToAll)
        }));
    }

    /**
     * Le coefficient d'un élément. Une immunité n'annule tout que si la cible
     * l'est à tous les éléments : sinon elle retire sa part, comme une résistance.
     *
     * @param {string[]} kinds       - Les traits qui jouent sur l'élément.
     * @param {boolean}  immuneToAll - Si la cible est immunisée à tous les éléments.
     *
     * @returns {number} Le coefficient.
     */
    static #factor(kinds, immuneToAll) {
        if (kinds.includes("immune")) {
            return immuneToAll ? 0 : 0.5;
        }
        return (kinds.includes("resist") ? 0.5 : 1) * (kinds.includes("vulnerable") ? 2 : 1);
    }

    /**
     * Ce que dnd5e a appliqué à un élément, d'après ses marques `active`. Une
     * immunité dit tout : dnd5e ne calcule plus rien d'autre après elle.
     *
     * @param {?object} active - Les marques de `calculateDamage` pour cet élément.
     *
     * @returns {string[]} Les traits appliqués.
     */
    static #kinds(active) {
        const flags = {...active?.all, ...active?.type};
        if (flags.immunity) {
            return ["immune"];
        }
        return [
            ...(flags.resistance ? ["resist"] : []),
            ...(flags.vulnerability ? ["vulnerable"] : [])
        ];
    }
}
