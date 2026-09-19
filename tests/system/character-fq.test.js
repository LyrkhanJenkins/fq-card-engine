import {describe, expect, it} from "vitest";
import CharacterDataFQ from "../../src/domain/system/actors/character-fq.mjs";

// Caractérisation de la composition `common` + `cards` + `cardBonus` + `minions` pour les
// personnages (MODEL-03). `defineSchema().fq` est l'objet obtenu par le
// SchemaField mocké : `{...CreatureFQTemplate.common, cards, cardBonus, minions}`.

describe("CharacterDataFQ.defineSchema", () => {
    const fq = CharacterDataFQ.defineSchema().fq;

    it("expose les clés communes plus cards, cardBonus et minions", () => {
        expect(fq).toHaveProperty("action");
        expect(fq).toHaveProperty("mana");
        expect(fq).toHaveProperty("zeal");
        expect(fq).toHaveProperty("attributes");
        expect(fq).toHaveProperty("bonus");
        expect(fq).toHaveProperty("cards");
        expect(fq).toHaveProperty("cardBonus");
        expect(fq).toHaveProperty("minions");
    });

    it("hérite des défauts du template commun (composition de CreatureFQTemplate.common)", () => {
        expect(fq.action.value.initial).toBe(10);
        expect(fq.mana.value.initial).toBe(5);
    });

    describe("cards", () => {
        it("verrouille les défauts hand/pick", () => {
            expect(fq.cards.hand.initial).toBe(1);
            expect(fq.cards.pick.initial).toBe(1);
        });

        it("ne porte plus de score de défausse : le coût `drop` se paie en cartes", () => {
            expect(fq.cards).not.toHaveProperty("currentDrop");
        });
    });

    describe("minions", () => {
        it("verrouille le défaut sacrificedMinion", () => {
            expect(fq.minions.sacrificedMinion.initial).toBe(1);
        });
    });
});
