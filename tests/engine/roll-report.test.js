import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";
import Damage from "../../src/domain/engine/roll/damage.js";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";
import {makeTarget, stubRolls, targeting} from "./roll-fixtures.js";

/**
 * Rapport de jet : ce que la résolution d'une carte consigne au passage. Les
 * jets sont pilotés par un `Roll` de substitution qui rend une séquence de
 * totaux et de faces imposée, de sorte que le contenu du rapport soit vérifiable
 * exactement — c'est le détail des dés, et non le seul total, qui distingue ce
 * rapport de ce que le moteur savait déjà produire.
 */

const originalRoll = globalThis.Roll;

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
            targeting(
                makeTarget("t1", "Gobelin", 5),
                makeTarget("t2", "Rocher", 0)
            );
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
                {targetTokenId: "t1", targetName: "Gobelin", value: 18, type: "damageFQ", critical: true, evasion: false, defended: false},
                {targetTokenId: "t2", targetName: "Rocher", value: 18, type: "damageFQ", critical: true, evasion: false, defended: false}
            ]);
        });
    });

    it("un soin ne produit aucune esquive et marque ses résultats comme non esquivés", async () => {
        stubRolls([{total: 6, dice: [{sides: 6, values: [6]}]}, {total: 3}]);
        targeting(makeTarget("a1", "Bruenor", 5));
        const report = new RollReport();

        await Damage.buildHealDiceLauncher(CASTER, {heal: "1d6", bonusCrit: 0, targetType: "Default"}, report);

        expect(report.kind).toBe(ROLL_ROLE.HEAL);
        expect(report.evasions).toEqual([]);
        expect(report.critical).toEqual({roll: 3, threshold: 17, hit: false});
        expect(report.results).toEqual([
            {targetTokenId: "a1", targetName: "Bruenor", value: 6, type: "healFQ", critical: false, evasion: false, defended: false}
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
            targeting(cible);

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

    describe("avantage, désavantage et défenses tombées", () => {

        it("un jet pour toucher sans mode garde des valeurs par défaut explicites", () => {
            const report = new RollReport();
            report.addHit({targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 12, modifier: 5, total: 17, threshold: 15, defended: false});

            expect(report.hits[0]).toEqual({
                targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 12, modifier: 5, total: 17, threshold: 15, defended: false,
                dice: [12], mode: 0, auto: null, advantages: [], disadvantages: [], autoCauses: []
            });
        });

        it("un jet sans dé (échec d'office) n'invente aucun dé", () => {
            const report = new RollReport();
            report.addHit({targetTokenId: "t1", targetName: "Étourdi", kind: "save",
                roll: null, modifier: 20, total: null, threshold: 13, defended: false, auto: "fail"});

            expect(report.hits[0].dice).toEqual([]);
            expect(report.hits[0].auto).toBe("fail");
        });

        it("une esquive ordinaire garde exactement sa forme de toujours", () => {
            const report = new RollReport();
            report.addEvasion({targetTokenId: "t1", targetName: "Gobelin", roll: 12, threshold: 16, evaded: false});

            expect(report.evasions[0]).toEqual(
                {targetTokenId: "t1", targetName: "Gobelin", roll: 12, threshold: 16, evaded: false});
        });

        it("une cible sans défense est marquée comme telle, avec sa cause", () => {
            const report = new RollReport();
            report.addEvasion({targetTokenId: "t1", targetName: "Paralysé", roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]});

            expect(report.evasions[0]).toEqual({
                targetTokenId: "t1", targetName: "Paralysé", roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]
            });
        });

        it("toObject copie en profondeur les dés et les raisons", () => {
            const report = new RollReport();
            report.addHit({targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 17, modifier: 5, total: 22, threshold: 15, defended: false,
                dice: [4, 17], mode: 1, advantages: [{side: "target", cause: "restrained"}]});
            report.addEvasion({targetTokenId: "t1", targetName: "Gobelin", roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]});

            const plain = report.toObject();
            plain.hits[0].dice.push(99);
            plain.hits[0].advantages[0].cause = "muté";
            plain.evasions[0].autoCauses[0].cause = "muté";

            expect(report.hits[0].dice).toEqual([4, 17]);
            expect(report.hits[0].advantages[0].cause).toBe("restrained");
            expect(report.evasions[0].autoCauses[0].cause).toBe("paralyzed");
            expect(plain).toEqual(JSON.parse(JSON.stringify(plain)));
        });
    });
});
