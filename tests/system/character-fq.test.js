import {describe, expect, it} from "vitest";
import CharacterDataFQ from "../../src/domain/system/actors/character-fq.mjs";

// Caractérisation de la composition `common` + `cards` + `special` pour les
// personnages (MODEL-03). `defineSchema().fq` est l'objet obtenu par le
// SchemaField mocké : `{...CreatureFQTemplate.common, cards, special}`.

describe("CharacterDataFQ.defineSchema", () => {
    const fq = CharacterDataFQ.defineSchema().fq;

    it("expose les clés communes plus cards et special", () => {
        expect(fq).toHaveProperty("action");
        expect(fq).toHaveProperty("mana");
        expect(fq).toHaveProperty("zeal");
        expect(fq).toHaveProperty("attributes");
        expect(fq).toHaveProperty("bonus");
        expect(fq).toHaveProperty("cards");
        expect(fq).toHaveProperty("special");
    });

    it("hérite des défauts du template commun (composition de CreatureFQTemplate.common)", () => {
        expect(fq.action.value.initial).toBe(10);
        expect(fq.mana.value.initial).toBe(5);
    });

    describe("cards", () => {
        it("verrouille les défauts hand/pick/currentDrop", () => {
            expect(fq.cards.hand.initial).toBe(1);
            expect(fq.cards.pick.initial).toBe(1);
            expect(fq.cards.currentDrop.initial).toBe(0);
        });
    });

    describe("special", () => {
        it("verrouille le défaut sacrificedSkeleton", () => {
            expect(fq.special.sacrificedSkeleton.initial).toBe(1);
        });
    });
});
