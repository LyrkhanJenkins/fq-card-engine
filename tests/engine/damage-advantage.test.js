import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";
import RollReport from "../../src/domain/engine/roll/roll-report.js";
import {makeTarget, stubRolls, targeting} from "./roll-fixtures.js";

/**
 * Avantage, désavantage et défenses tombées dans la VRAIE résolution des dégâts.
 *
 * Le nombre de `new Roll` compte : c'est lui qui prouve qu'un dé n'a PAS été
 * jeté (échec d'office, cible sans défense) ou qu'un second l'a été (avantage,
 * désavantage). Les séquences imposent donc chaque d20, dans l'ordre de la
 * résolution : les dés d'attaque de la carte d'abord, puis PAR CIBLE sa
 * sauvegarde et son esquive. Le critique est hors de portée partout.
 *
 * Toutes les cibles ont 10 points de dégâts à encaisser : 10 plein, 5 à
 * demi-dégâts, 0 quand les deux défenses tiennent.
 */

const originalRoll = globalThis.Roll;
const DAMAGE = 10;

/**
 * Un lanceur sans critique possible : M = 3 + 2 = 5 en Sagesse comme en Force.
 *
 * @param {object} [options]                 - Ce qui le distingue.
 * @param {string[]} [options.statuses]      - Ses conditions.
 * @param {boolean} [options.untrainedArmor] - Armure équipée non maîtrisée.
 *
 * @returns {object} Le lanceur.
 */
function caster({statuses = [], untrainedArmor = false} = {}) {
    return {
        _id: "caster",
        statuses: new Set(statuses),
        system: {
            fq: {attributes: {critical: 0}, bonus: {damage: "", heal: ""}},
            abilities: {wis: {mod: 3}, str: {mod: 3}},
            attributes: {
                prof: 2,
                ac: untrainedArmor ? {equippedArmor: {system: {proficiencyMultiplier: 0}}} : {}
            }
        }
    };
}

/**
 * Un choix de carte à jet d'attaque (contre la CA) ou de sauvegarde (DD 13).
 *
 * @param {object} [overrides] - Les champs à changer.
 *
 * @returns {object} Le choix.
 */
function attackChoice(overrides = {}) {
    return {
        bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1,
        hitType: "attack", hitSource: "ability", hitAbility: "wis", ...overrides
    };
}

/** @see attackChoice */
function saveChoice(overrides = {}) {
    return {
        bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1,
        hitType: "save", hitSource: "ability", hitAbility: "wis", saveAbility: "dex", ...overrides
    };
}

/**
 * Joue la résolution et rend ce qu'il faut regarder.
 *
 * @param {object} actor  - Le lanceur.
 * @param {object} choice - Le choix de carte.
 *
 * @returns {Promise<{values: number[], report: RollReport, rolls: number}>} Les dégâts par
 *          cible, le rapport, et le nombre de dés réellement jetés.
 */
async function resolve(actor, choice) {
    const report = new RollReport();
    const result = await Damage.addCriticalEvasionToDamage(actor, DAMAGE, choice, report);
    return {values: result.map(entry => entry.value), report, rolls: globalThis.Roll.mock.calls.length};
}

afterEach(() => {
    globalThis.Roll = originalRoll;
    vi.restoreAllMocks();
});

describe("Damage — attaque sans mode : rien ne change", () => {

    it("un seul d20, et son rapport le dit", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 12}]);

        const {values, report, rolls} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(1);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({
            roll: 12, total: 17, dice: [12], mode: 0, auto: null, advantages: [], disadvantages: []
        });
    });
});

describe("Damage — attaque avec avantage ou désavantage", () => {

    it("cible entravée : deux d20, le MEILLEUR compte", async () => {
        // Sans avantage, 3 + 5 = 8 contre CA 15 : demi-dégâts. Avec, 14 + 5 = 19.
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15, statuses: ["restrained"]}));
        stubRolls([{total: 3}, {total: 14}]);

        const {values, report, rolls} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(2);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({
            dice: [3, 14], mode: 1, roll: 14, total: 19, defended: false,
            advantages: [{side: "target", cause: "restrained"}]
        });
    });

    it("cible invisible : deux d20, le PIRE compte", async () => {
        targeting(makeTarget("t1", "Ombre", 0, {ac: 15, statuses: ["invisible"]}));
        stubRolls([{total: 14}, {total: 3}]);

        const {values, report} = await resolve(caster(), attackChoice());

        expect(values).toEqual([5]);
        expect(report.hits[0]).toMatchObject({
            dice: [14, 3], mode: -1, roll: 3, total: 8, defended: true,
            disadvantages: [{side: "target", cause: "invisible"}]
        });
    });

    it("cible à terre, lanceur hors de contact : désavantage", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15, statuses: ["prone"]}));
        stubRolls([{total: 14}, {total: 3}]);

        const {values, report} = await resolve(caster(), attackChoice());

        expect(values).toEqual([5]);
        expect(report.hits[0].disadvantages).toEqual([{side: "target", cause: "prone"}]);
    });

    it("lanceur empoisonné : désavantage contre toute cible", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 14}, {total: 3}]);

        const {values, report} = await resolve(caster({statuses: ["poisoned"]}), attackChoice());

        expect(values).toEqual([5]);
        expect(report.hits[0].disadvantages).toEqual([{side: "caster", cause: "poisoned"}]);
    });

    it("lanceur invisible : avantage", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 3}, {total: 14}]);

        const {values} = await resolve(caster({statuses: ["invisible"]}), attackChoice());

        expect(values).toEqual([10]);
    });

    it("avantage et désavantage s'annulent : UN SEUL d20 est jeté", async () => {
        targeting(makeTarget("t1", "Ombre", 0, {ac: 15, statuses: ["invisible"]}));
        stubRolls([{total: 12}, {total: 1}]);

        const {values, report, rolls} = await resolve(caster({statuses: ["invisible"]}), attackChoice());

        expect(rolls).toBe(1);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({dice: [12], mode: 0});
        expect(report.hits[0].advantages).toHaveLength(1);
        expect(report.hits[0].disadvantages).toHaveLength(1);
    });

    it("une cible immunisée à sa condition est visée normalement", async () => {
        targeting(makeTarget("t1", "Golem", 0, {ac: 15, statuses: ["prone"], immune: ["prone"]}));
        stubRolls([{total: 12}]);

        const {rolls, report} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(1);
        expect(report.hits[0].mode).toBe(0);
    });
});

describe("Damage — un seul jet d'attaque pour toute la carte", () => {

    it("deux d20 jetés UNE fois, chaque cible garde celui que lui vaut son mode", async () => {
        targeting(
            makeTarget("t1", "Entravé", 0, {ac: 15, statuses: ["restrained"]}),
            makeTarget("t2", "Invisible", 0, {ac: 15, statuses: ["invisible"]}),
            makeTarget("t3", "Ordinaire", 0, {ac: 15})
        );
        stubRolls([{total: 6}, {total: 17}]);

        const {values, report, rolls} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(2);
        // Entravé : 17 + 5 = 22. Invisible : 6 + 5 = 11. Ordinaire : le premier dé, 6.
        expect(report.hits.map(hit => hit.roll)).toEqual([17, 6, 6]);
        expect(report.hits.map(hit => hit.dice)).toEqual([[6, 17], [6, 17], [6, 17]]);
        expect(values).toEqual([10, 5, 5]);
    });

    it("sans aucune cible à mode, les cibles se partagent toujours un seul dé", async () => {
        targeting(makeTarget("t1", "A", 0, {ac: 10}), makeTarget("t2", "B", 0, {ac: 20}));
        stubRolls([{total: 10}]);

        const {values, rolls} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(1);
        expect(values).toEqual([10, 5]);
    });
});

describe("Damage — armure non maîtrisée", () => {

    it("attaque de Force en armure non maîtrisée : désavantage", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 14}, {total: 3}]);

        const {values, report} = await resolve(caster({untrainedArmor: true}), attackChoice({hitAbility: "str"}));

        expect(values).toEqual([5]);
        expect(report.hits[0].disadvantages).toEqual([{side: "caster", cause: "armor"}]);
    });

    it("attaque de Sagesse en armure non maîtrisée : aucun effet", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 12}]);

        const {rolls, values} = await resolve(caster({untrainedArmor: true}), attackChoice({hitAbility: "wis"}));

        expect(rolls).toBe(1);
        expect(values).toEqual([10]);
    });

    it("sauvegarde de Dextérité d'une cible en armure non maîtrisée : désavantage", async () => {
        // DD 13 ; sauvegarde +2. Avec désavantage, 4 + 2 = 6 : ratée.
        targeting(makeTarget("t1", "Soldat", 0, {saves: {dex: 2}, untrainedArmor: true}));
        stubRolls([{total: 18}, {total: 4}]);

        const {values, report} = await resolve(caster(), saveChoice());

        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({kind: "save", dice: [18, 4], mode: -1, roll: 4, total: 6});
    });
});

describe("Damage — sauvegardes", () => {

    it("désavantage posé par la feuille dnd5e (entravé) : le pire des deux", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 2}, saveModes: {dex: -1}, statuses: ["restrained"]}));
        stubRolls([{total: 18}, {total: 4}]);

        const {values, report, rolls} = await resolve(caster(), saveChoice());

        expect(rolls).toBe(2);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({mode: -1, roll: 4, defended: false});
    });

    it("avantage posé par la feuille dnd5e : le meilleur des deux", async () => {
        targeting(makeTarget("t1", "Moine", 0, {saves: {dex: 2}, saveModes: {dex: 1}}));
        stubRolls([{total: 4}, {total: 18}]);

        const {values, report} = await resolve(caster(), saveChoice());

        expect(values).toEqual([5]);
        expect(report.hits[0]).toMatchObject({mode: 1, roll: 18, total: 20, defended: true});
    });

    it("entravé SANS mode de feuille : le moteur n'ajoute rien — c'est à dnd5e de le poser", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 2}, statuses: ["restrained"]}));
        stubRolls([{total: 12}]);

        const {rolls} = await resolve(caster(), saveChoice());

        expect(rolls).toBe(1);
    });

    it("étourdi, sauvegarde de Dextérité : ratée d'office, AUCUN dé jeté", async () => {
        targeting(makeTarget("t1", "Étourdi", 0, {saves: {dex: 20}, statuses: ["stunned"]}));
        stubRolls([]);

        const {values, report, rolls} = await resolve(caster(), saveChoice());

        expect(rolls).toBe(0);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({
            auto: "fail", roll: null, total: null, dice: [], defended: false,
            autoCauses: [{side: "target", cause: "stunned"}]
        });
    });

    it("étourdi, sauvegarde de Sagesse : jet ordinaire", async () => {
        targeting(makeTarget("t1", "Étourdi", 0, {saves: {wis: 0}, statuses: ["stunned"]}));
        stubRolls([{total: 15}]);

        const {values, report} = await resolve(caster(), saveChoice({saveAbility: "wis"}));

        expect(values).toEqual([5]);
        expect(report.hits[0].auto).toBeNull();
    });

    it("pétrifié : la sauvegarde de Force tombe, mais l'ESQUIVE reste jetée", async () => {
        // Seule une cible sans défense perd son esquive ; pétrifiée, elle ne rate
        // que ses sauvegardes de Force et de Dextérité.
        targeting(makeTarget("t1", "Statue", 20, {saves: {str: 20}, statuses: ["petrified"]}));
        stubRolls([{total: 10}]);

        const {values, report, rolls} = await resolve(caster(), saveChoice({saveAbility: "str", bonusEva: 0}));

        expect(rolls).toBe(1);
        expect(report.hits[0].auto).toBe("fail");
        expect(report.evasions[0]).toMatchObject({roll: 10, evaded: true});
        expect(values).toEqual([5]);
    });
});

describe("Damage — cible sans défense (paralysée, inconsciente)", () => {

    it("attaque contre une cible paralysée : touchée quelle que soit sa CA, sans esquive", async () => {
        // CA 30 et esquive de 20 : ailleurs, deux défenses qui tiendraient.
        targeting(makeTarget("t1", "Paralysé", 20, {ac: 30, statuses: ["paralyzed"]}));
        stubRolls([{total: 2}]);

        const {values, report, rolls} = await resolve(caster(), attackChoice({bonusEva: 0}));

        // Un seul dé : l'avantage que la paralysie donnerait ne sert à rien
        // contre une cible qui ne se défend plus.
        expect(rolls).toBe(1);
        expect(values).toEqual([10]);
        expect(report.hits[0]).toMatchObject({
            auto: "defenseless", defended: false, dice: [2],
            autoCauses: [{side: "target", cause: "paralyzed"}]
        });
        expect(report.evasions[0]).toEqual({
            targetTokenId: "t1", targetName: "Paralysé", roll: null, threshold: null, evaded: false,
            defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]
        });
    });

    it("sauvegarde d'une cible inconsciente : ni sauvegarde ni esquive, AUCUN dé", async () => {
        targeting(makeTarget("t1", "Endormi", 20, {saves: {dex: 20}, statuses: ["unconscious"]}));
        stubRolls([]);

        const {values, report, rolls} = await resolve(caster(), saveChoice({bonusEva: 0}));

        expect(rolls).toBe(0);
        expect(values).toEqual([10]);
        expect(report.hits[0].auto).toBe("defenseless");
        expect(report.evasions[0].defenseless).toBe(true);
    });

    it("carte sans jet pour toucher : la cible paralysée n'esquive pas, l'autre si", async () => {
        const plain = {bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1};
        targeting(
            makeTarget("t1", "Paralysé", 20, {statuses: ["paralyzed"]}),
            makeTarget("t2", "Alerte", 20)
        );
        stubRolls([{total: 10}]);

        const {values, report, rolls} = await resolve(caster(), plain);

        expect(rolls).toBe(1);
        expect(values).toEqual([10, 5]);
        expect(report.hits).toEqual([]);
        expect(report.evasions[0].defenseless).toBe(true);
        expect(report.evasions[1]).toEqual({targetTokenId: "t2", targetName: "Alerte", roll: 10, threshold: 1, evaded: true});
    });

    it("une cible sans défense ne fait pas jeter le second d20 aux autres", async () => {
        targeting(
            makeTarget("t1", "Paralysé", 0, {ac: 15, statuses: ["paralyzed"]}),
            makeTarget("t2", "Ordinaire", 0, {ac: 15})
        );
        stubRolls([{total: 12}]);

        const {rolls, values} = await resolve(caster(), attackChoice());

        expect(rolls).toBe(1);
        expect(values).toEqual([10, 10]);
    });

    it("une cible immunisée à la paralysie se défend", async () => {
        targeting(makeTarget("t1", "Golem", 0, {ac: 30, statuses: ["paralyzed"], immune: ["paralyzed"]}));
        stubRolls([{total: 2}]);

        const {values, report} = await resolve(caster(), attackChoice());

        expect(values).toEqual([5]);
        expect(report.hits[0].auto).toBeNull();
    });

    it("le lanceur ne se défend jamais contre sa propre carte, même paralysé", async () => {
        const self = caster({statuses: ["paralyzed"]});
        targeting({id: "self", name: "Moi", actor: self}, makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 12}]);

        const {values, report} = await resolve(self, attackChoice());

        expect(values).toEqual([10]);
        expect(report.hits).toHaveLength(1);
        expect(report.evasions).toHaveLength(1);
    });
});

describe("Damage — le contact avec une cible à terre se mesure depuis le BON jeton", () => {

    /** Cases de 100 px : un jeton à (100, 0) est au contact d'une cible à (0, 0). */
    const SQUARE = 100;
    let originalCanvas;

    /**
     * Une cible à terre posée en (0, 0).
     *
     * @returns {object} Le jeton.
     */
    function proneTargetAtOrigin() {
        const token = makeTarget("t1", "Gobelin", 0, {ac: 15, statuses: ["prone"]});
        token.document = {x: 0, y: 0, width: 1, height: 1};
        return token;
    }

    /**
     * Pose les jetons de la scène.
     *
     * @param {...object} tokens - Les documents de jeton.
     */
    function scene(...tokens) {
        globalThis.game.canvas = {scene: {dimensions: {size: SQUARE}, tokens}};
    }

    beforeEach(() => {
        originalCanvas = globalThis.game.canvas;
    });

    afterEach(() => {
        globalThis.game.canvas = originalCanvas;
    });

    it("PNJ non lié : son PROPRE jeton compte, pas celui de son jumeau trouvé en premier", async () => {
        // Deux jetons du même acteur : le jumeau, loin, est le premier de la scène.
        scene({actorId: "minion", x: 500, y: 0, width: 1, height: 1});
        const minion = {...caster(), id: "minion", token: {x: SQUARE, y: 0, width: 1, height: 1}};
        targeting(proneTargetAtOrigin());
        stubRolls([{total: 3}, {total: 14}]);

        const {values, report} = await resolve(minion, attackChoice());

        expect(report.hits[0]).toMatchObject({mode: 1, advantages: [{side: "target", cause: "prone"}]});
        expect(values).toEqual([10]);
    });

    it("acteur lié : son jeton est retrouvé sur la scène par son id", async () => {
        scene({actorId: "hero", x: SQUARE, y: 0, width: 1, height: 1});
        targeting(proneTargetAtOrigin());
        stubRolls([{total: 3}, {total: 14}]);

        const {report} = await resolve({...caster(), id: "hero"}, attackChoice());

        expect(report.hits[0].mode).toBe(1);
    });

    it("jeton propre hors de contact : désavantage, même si un jumeau est au contact", async () => {
        scene({actorId: "minion", x: SQUARE, y: 0, width: 1, height: 1});
        const minion = {...caster(), id: "minion", token: {x: 500, y: 0, width: 1, height: 1}};
        targeting(proneTargetAtOrigin());
        stubRolls([{total: 14}, {total: 3}]);

        const {report} = await resolve(minion, attackChoice());

        expect(report.hits[0]).toMatchObject({mode: -1, disadvantages: [{side: "target", cause: "prone"}]});
    });
});
