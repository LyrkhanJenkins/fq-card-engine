import {describe, expect, it} from "vitest";
import NPCDataFQ from "../../src/domain/system/actors/npc-fq.mjs";

// Caractérisation du modèle PNJ (MODEL-03) : composition du template commun
// SEUL, sans les données de cartes/spéciales propres aux personnages
// (différence npc ≠ character).

describe("NPCDataFQ.defineSchema", () => {
    const fq = NPCDataFQ.defineSchema().fq;

    it("expose les clés communes action/mana/zeal/attributes/bonus", () => {
        expect(fq).toHaveProperty("action");
        expect(fq).toHaveProperty("mana");
        expect(fq).toHaveProperty("zeal");
        expect(fq).toHaveProperty("attributes");
        expect(fq).toHaveProperty("bonus");
    });

    it("hérite des défauts du template commun (composition de CreatureFQTemplate.common)", () => {
        expect(fq.action.value.initial).toBe(10);
    });

    it("n'expose pas cards ni special (npc ≠ character)", () => {
        expect(fq).not.toHaveProperty("cards");
        expect(fq).not.toHaveProperty("special");
    });
});
