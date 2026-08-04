import {describe, expect, it} from "vitest";
import ActionFQTemplate from "../../src/domain/system/items/item-action-fq.mjs";

// Caractérisation des coûts d'utilisation d'objet (MODEL-03). ActionFQTemplate
// est une classe simple (PAS une Activity dnd5e), pleinement testable.

describe("ActionFQTemplate.defineSchema", () => {
    const fq = ActionFQTemplate.defineSchema().fq;

    it("expose les clés action/mana/zeal/drop/hp", () => {
        expect(fq).toHaveProperty("action");
        expect(fq).toHaveProperty("mana");
        expect(fq).toHaveProperty("zeal");
        expect(fq).toHaveProperty("drop");
        expect(fq).toHaveProperty("hp");
    });

    it("verrouille les défauts réels : action=-10, mana/zeal/drop/hp=0", () => {
        expect(fq.action.initial).toBe(-10);
        expect(fq.mana.initial).toBe(0);
        expect(fq.zeal.initial).toBe(0);
        expect(fq.drop.initial).toBe(0);
        expect(fq.hp.initial).toBe(0);
    });

    it("verrouille la forme du champ action (entier non nullable)", () => {
        expect(fq.action.nullable).toBe(false);
        expect(fq.action.integer).toBe(true);
    });
});
