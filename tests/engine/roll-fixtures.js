import {vi} from "vitest";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";

/**
 * Harnais partagé des tests de résolution de jets (`roll-report.test.js`,
 * `damage-ladder.test.js`) : un `Roll` de substitution qui sert une séquence de
 * totaux imposée, et les jetons de cible que le moteur manipule.
 *
 * Extrait ici — comme `tests/utils/formula-fixtures.js` l'a été pour les
 * fabriques d'armes — pour qu'aucun nouveau fichier de test n'ait à recopier
 * `stubRolls` : le contenu d'un rapport n'est vérifiable exactement que si la
 * séquence des dés est imposée, et cette séquence doit être décrite d'une seule
 * façon dans tout le dépôt.
 */

/**
 * Remplace le `Roll` global par une séquence imposée : le n-ième `new Roll(...)`
 * rend le n-ième élément de la séquence. Au-delà de la séquence, les jets valent 0.
 *
 * @param {{total: number, dice?: {sides: number, values: number[]}[]}[]} sequence - Les jets à servir, dans l'ordre.
 *
 * @returns {void}
 */
export function stubRolls(sequence) {
    let index = 0;
    globalThis.Roll = vi.fn(function (formula) {
        const spec = sequence[index++] ?? {total: 0, dice: []};
        this.formula = formula;
        this.total = spec.total;
        this.options = {};
        this.dice = (spec.dice ?? []).map(die => ({
            faces: die.sides,
            results: die.values.map(value => ({result: value, active: true})),
            options: {}
        }));
        this.evaluate = async () => this;
        this.toMessage = vi.fn(async () => ({id: "messageId"}));
    });
}

/**
 * Jeton de cible minimal, tel que le moteur le manipule.
 *
 * Les défenses de toucher (`ac`, `save`) ne sont posées que si on les demande :
 * une cible sans elles n'oppose aucune protection, ce qui est le cas de toutes
 * les cibles des tests antérieurs à la classe d'armure.
 *
 * Les conditions (`statuses`), les immunités (`immune`), le mode de sauvegarde
 * que dnd5e aurait posé sur la feuille (`saveModes`) et l'armure non maîtrisée
 * (`untrainedArmor`) servent aux règles d'avantage : sans dnd5e, la sonde des
 * conditions lit la table du moteur, exactement comme en jeu.
 *
 * @param {string} id        - L'id du jeton.
 * @param {string} name      - Le nom affiché.
 * @param {number} evasion   - Le score d'esquive de son acteur.
 * @param {object} [defense] - `ac` : la classe d'armure ; `saves` : les modificateurs
 *        de sauvegarde par caractéristique (ex. `{dex: 3}`) ; `statuses` : les
 *        conditions portées ; `immune` : les immunités aux conditions ;
 *        `saveModes` : le mode de sauvegarde par caractéristique (ex. `{dex: -1}`) ;
 *        `untrainedArmor` : true pour une armure équipée non maîtrisée.
 *
 * @returns {object} Le jeton.
 */
export function makeTarget(id, name, evasion, {ac, saves, statuses, immune, saveModes, untrainedArmor} = {}) {
    const system = {fq: {attributes: {evasion}}};
    if (ac !== undefined) {
        system.attributes = {ac: {value: ac}};
    }
    if (untrainedArmor) {
        system.attributes = {...system.attributes, ac: {
            ...system.attributes?.ac, equippedArmor: {system: {proficiencyMultiplier: 0}}
        }};
    }
    if (saves) {
        system.abilities = Object.fromEntries(Object.entries(saves).map(([ability, value]) =>
            [ability, {save: {value, roll: {mode: saveModes?.[ability] ?? 0}}}]));
    }
    if (immune) {
        system.traits = {ci: {value: new Set(immune)}};
    }
    const actor = {_id: `actor-${id}`, system};
    if (statuses) {
        actor.statuses = new Set(statuses);
    }
    return {id, name, actor};
}

/**
 * Un `calculateDamage` fidèle à celui de dnd5e sur ce que le moteur en attend :
 * l'immunité efface la partie (et rien d'autre ne s'y applique), puis le
 * multiplicateur, puis la résistance (moitié tronquée), puis la vulnérabilité
 * (double) ; les marques `active` disent ce qui s'est appliqué, et le total est
 * tronqué. Le vrai reste celui de dnd5e : ce double ne sert qu'aux tests, pour
 * vérifier ce que le moteur lui CONFIE et ce qu'il LIT en retour.
 *
 * @param {object}   [traits]    - Les traits de l'acteur, par liste de types.
 * @param {string[]} [traits.dr] - Les résistances.
 * @param {string[]} [traits.di] - Les immunités.
 * @param {string[]} [traits.dv] - Les vulnérabilités.
 * @param {string[]} [traits.bypasses] - Les propriétés qui passent outre les résistances
 *        (`["mgc"]` : le loup-garou, résistant aux seules attaques non magiques).
 *
 * @returns {function} Le `calculateDamage` de l'acteur.
 */
export function dnd5eDamage({dr = [], di = [], dv = [], bypasses = []} = {}) {
    return vi.fn((damages, {multiplier = 1} = {}) => {
        const out = damages.map(damage => ({...damage, active: {}}));
        out.amount = 0;
        for (const damage of out) {
            if (di.includes(damage.type)) {
                damage.value = 0;
                damage.active.type = {immunity: true};
                continue;
            }
            let value = damage.value * multiplier;
            const bypassed = bypasses.some(property => damage.properties?.has?.(property));
            if (dr.includes(damage.type) && !bypassed) {
                value = Math.trunc(value / 2);
                (damage.active.type ??= {}).resistance = true;
            }
            if (dv.includes(damage.type)) {
                value *= 2;
                (damage.active.type ??= {}).vulnerability = true;
            }
            damage.value = value;
            out.amount += value;
        }
        out.amount = Math.trunc(out.amount);
        return out;
    });
}

/**
 * Impose les cibles de la résolution, en court-circuitant l'acquisition réelle.
 *
 * @param {...object} targets - Les jetons ciblés.
 *
 * @returns {void}
 */
export function targeting(...targets) {
    vi.spyOn(TargetingPredicates, "resolveTargets").mockReturnValue(targets);
}
