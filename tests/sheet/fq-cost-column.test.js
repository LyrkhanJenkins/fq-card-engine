import {describe, expect, test} from "vitest";
import {FQ_COST_COLUMN, fqCostEntries, withFqCostColumn} from "../../src/domain/interface/sheet/actor/fq-cost-column.js";

function makeItem(fq, activityCount = 1) {
    const activities = new Map(Array.from({length: activityCount}, (_, i) => [`a${i}`, {}]));
    return {system: {fq, activities}};
}

describe("fq-cost-column", () => {

    describe("fqCostEntries", () => {
        test("affiche les coûts sans signe, dans l'ordre action, mana, zèle, défausse, vie", () => {
            const entries = fqCostEntries(makeItem({action: -3, mana: -2, zeal: -1, drop: -1, hp: -5}));

            expect(entries.map(e => [e.cssClass, e.value])).toEqual([
                ["action-cost", "3"], ["mana-cost", "2"], ["zeal-cost", "1"], ["drop-cost", "1"], ["hp-cost", "5"]
            ]);
            expect(entries[0].short).toBe("FQCARDENGINE.ShortActionPoints");
            expect(entries[0].label).toBe("FQCARDENGINE.ActionPoints");
        });

        test("omet les valeurs nulles", () => {
            const entries = fqCostEntries(makeItem({action: -10, mana: 0, zeal: 0, drop: 0, hp: 0}));

            expect(entries.map(e => e.cssClass)).toEqual(["action-cost"]);
        });

        test("préfixe un gain de « + »", () => {
            const entries = fqCostEntries(makeItem({action: 0, mana: 0, zeal: 2, drop: 0, hp: 0}));

            expect(entries).toHaveLength(1);
            expect(entries[0].value).toBe("+2");
        });

        test("n'affiche rien pour un objet sans activité", () => {
            expect(fqCostEntries(makeItem({action: -10}, 0))).toEqual([]);
        });

        test("n'affiche rien pour un objet sans données FQ", () => {
            expect(fqCostEntries({system: {activities: new Map([["a", {}]])}})).toEqual([]);
            expect(fqCostEntries(undefined)).toEqual([]);
        });
    });

    describe("withFqCostColumn", () => {
        test("ajoute la colonne sans muter la liste reçue", () => {
            const columns = ["price", {id: "uses", order: 650}];

            const result = withFqCostColumn(columns);

            expect(result).toEqual(["price", {id: "uses", order: 650}, FQ_COST_COLUMN]);
            expect(columns).toHaveLength(2);
        });

        test("n'ajoute pas la colonne deux fois", () => {
            const once = withFqCostColumn(["price"]);

            expect(withFqCostColumn(once)).toBe(once);
            expect(withFqCostColumn(["fqCost"])).toEqual(["fqCost"]);
        });

        test("tolère une section sans colonnes", () => {
            expect(withFqCostColumn(undefined)).toEqual([FQ_COST_COLUMN]);
        });
    });
});
