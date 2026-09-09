import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";
import Damage from "../../src/domain/engine/roll/damage.js";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";

/**
 * Rapport de jet : ce que la résolution d'une carte consigne au passage. Les
 * jets sont pilotés par un `Roll` de substitution qui rend une séquence de
 * totaux et de faces imposée, de sorte que le contenu du rapport soit vérifiable
 * exactement — c'est le détail des dés, et non le seul total, qui distingue ce
 * rapport de ce que le moteur savait déjà produire.
 */

const originalRoll = globalThis.Roll;

/**
 * Remplace le `Roll` global par une séquence imposée : le n-ième `new Roll(...)`
 * rend le n-ième élément de la séquence.
 *
 * @param {{total: number, dice?: {sides: number, values: number[]}[]}[]} sequence - Les jets à servir, dans l'ordre.
 *
 * @returns {void}
 */
function stubRolls(sequence) {
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
 * @param {string} id      - L'id du jeton.
 * @param {string} name    - Le nom affiché.
 * @param {number} evasion - Le score d'esquive de son acteur.
 *
 * @returns {object} Le jeton.
 */
function makeTarget(id, name, evasion) {
    return {id, name, actor: {_id: `actor-${id}`, system: {fq: {attributes: {evasion}}}}};
}

const CASTER = {
    _id: "caster",
    system: {fq: {attributes: {critical: 4}, bonus: {damage: "", heal: ""}}}
};

afterEach(() => {
    globalThis.Roll = originalRoll;
    vi.restoreAllMocks();
});

describe("RollReport", () => {

    describe("diceOf", () => {
        it("relève les faces et la valeur de chaque dé, tous termes confondus", () => {
            const roll = {
                dice: [
                    {faces: 6, results: [{result: 4, active: true}, {result: 5, active: true}]},
                    {faces: 8, results: [{result: 7, active: true}]}
                ]
            };

            expect(RollReport.diceOf(roll)).toEqual([
                {sides: 6, value: 4}, {sides: 6, value: 5}, {sides: 8, value: 7}
            ]);
        });

        it("écarte les résultats inactifs : seuls comptent les dés qui font le total", () => {
            const roll = {
                dice: [{faces: 20, results: [{result: 3, active: false}, {result: 17, active: true}]}]
            };

            expect(RollReport.diceOf(roll)).toEqual([{sides: 20, value: 17}]);
        });

        it("rend une liste vide plutôt que de lever sur un jet sans dés", () => {
            expect(RollReport.diceOf(null)).toEqual([]);
            expect(RollReport.diceOf({})).toEqual([]);
        });
    });

    describe("consigné par une résolution de dégâts", () => {
        const cardContent = {damage: "2d6", bonusCrit: 0, bonusEva: 0, targetType: "Default"};
        let report;

        beforeEach(async () => {
            // 1) les dégâts, 2) le critique (seuil 21-4 = 17), 3) l'esquive de la
            // seule cible qui en a un score (seuil 21-5 = 16).
            stubRolls([
                {total: 9, dice: [{sides: 6, values: [4, 5]}]},
                {total: 18},
                {total: 12}
            ]);
            vi.spyOn(TargetingPredicates, "resolveTargets").mockReturnValue([
                makeTarget("t1", "Gobelin", 5),
                makeTarget("t2", "Rocher", 0)
            ]);
            report = new RollReport();
            await Damage.buildDamageDiceLauncher(CASTER, cardContent, report);
        });

        it("garde le détail des dés du jet principal, pas seulement son total", () => {
            expect(report.kind).toBe(ROLL_ROLE.DAMAGE);
            expect(report.mainRoll).toEqual({
                formula: "2d6",
                dice: [{sides: 6, value: 4}, {sides: 6, value: 5}],
                total: 9,
                // Le bonus de l'acteur est déjà fondu dans la formule côté carte :
                // il n'est renseigné à part que sur le chemin dnd5e.
                bonus: null
            });
        });

        it("garde le dé de critique et le seuil qu'il devait atteindre", () => {
            expect(report.critical).toEqual({roll: 18, threshold: 17, hit: true});
        });

        it("inscrit une cible sans score d'esquive sans lui inventer de jet", () => {
            expect(report.evasions).toEqual([
                {targetTokenId: "t1", targetName: "Gobelin", roll: 12, threshold: 16, evaded: false},
                {targetTokenId: "t2", targetName: "Rocher", roll: null, threshold: null, evaded: false}
            ]);
        });

        it("consigne la valeur réellement appliquée à chaque cible", () => {
            expect(report.results).toEqual([
                {targetTokenId: "t1", targetName: "Gobelin", value: 18, type: "damageFQ", critical: true, evasion: false},
                {targetTokenId: "t2", targetName: "Rocher", value: 18, type: "damageFQ", critical: true, evasion: false}
            ]);
        });
    });

    it("un soin ne produit aucune esquive et marque ses résultats comme non esquivés", async () => {
        stubRolls([{total: 6, dice: [{sides: 6, values: [6]}]}, {total: 3}]);
        vi.spyOn(TargetingPredicates, "resolveTargets").mockReturnValue([makeTarget("a1", "Bruenor", 5)]);
        const report = new RollReport();

        await Damage.buildHealDiceLauncher(CASTER, {heal: "1d6", bonusCrit: 0, targetType: "Default"}, report);

        expect(report.kind).toBe(ROLL_ROLE.HEAL);
        expect(report.evasions).toEqual([]);
        expect(report.critical).toEqual({roll: 3, threshold: 17, hit: false});
        expect(report.results).toEqual([
            {targetTokenId: "a1", targetName: "Bruenor", value: 6, type: "healFQ", critical: false, evasion: false}
        ]);
    });

    describe("toObject", () => {
        it("rend un objet strictement sérialisable", () => {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

            const plain = report.toObject();

            expect(plain).toEqual(JSON.parse(JSON.stringify(plain)));
        });

        it("survit à un jeton qui se référence lui-même : le rapport ne porte que des ids et des noms", () => {
            // Un Token de Foundry est un objet PIXI qui se référence par sa scène et
            // son calque : c'est CE graphe qui faisait déborder la pile à la
            // sérialisation socketlib (voir tests/hook/dnd5e.test.js).
            const cible = {id: "token-cible", name: "Momie"};
            cible.scene = {tokens: [cible]};
            vi.spyOn(TargetingPredicates, "resolveTargets").mockReturnValue([cible]);

            const report = new RollReport();
            report.setHeader({targets: TargetingPredicates.resolveTargetLabels({})});

            expect(report.header.targets).toEqual([{tokenId: "token-cible", name: "Momie"}]);
            expect(() => JSON.stringify(report.toObject())).not.toThrow();
        });

        it("rend une liste de cibles vide quand la résolution de ciblage lève", () => {
            vi.spyOn(TargetingPredicates, "resolveTargets").mockImplementation(() => {
                throw new Error("contexte de scène absent");
            });

            expect(TargetingPredicates.resolveTargetLabels({})).toEqual([]);
        });
    });
});
