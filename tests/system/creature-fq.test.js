import {describe, expect, it} from "vitest";
import CreatureFQTemplate from "../../src/domain/system/actors/creature-fq.mjs";

// Caractérisation du template commun partagé par character-fq et npc-fq
// (MODEL-03). Le mock passthrough de tests/setup.js (SchemaField/NumberField/
// StringField) renvoie directement les options reçues : `initial` est donc
// une VALEUR, pas une fonction, et le 2e argument (`{label}`) des SchemaField
// est ignoré (common.action navigue directement vers {value, max}).

describe("CreatureFQTemplate.common", () => {
    const common = CreatureFQTemplate.common;

    it("expose les clés communes action/mana/zeal/attributes/bonus", () => {
        expect(common).toHaveProperty("action");
        expect(common).toHaveProperty("mana");
        expect(common).toHaveProperty("zeal");
        expect(common).toHaveProperty("attributes");
        expect(common).toHaveProperty("bonus");
    });

    describe("action", () => {
        it("verrouille les défauts value/max", () => {
            expect(common.action.value.initial).toBe(10);
            expect(common.action.max.initial).toBe(10);
        });

        it("verrouille la nullabilité value/max", () => {
            expect(common.action.value.nullable).toBe(false);
            expect(common.action.max.nullable).toBe(true);
        });
    });

    describe("mana", () => {
        it("verrouille les défauts value/max", () => {
            expect(common.mana.value.initial).toBe(5);
            expect(common.mana.max.initial).toBe(5);
        });
    });

    describe("zeal", () => {
        it("verrouille les défauts value/max/init", () => {
            expect(common.zeal.value.initial).toBe(0);
            expect(common.zeal.max.initial).toBe(8);
            expect(common.zeal.init.initial).toBe(0);
        });
    });

    describe("attributes", () => {
        it("verrouille les défauts critical/evasion", () => {
            expect(common.attributes.critical.initial).toBe(1);
            expect(common.attributes.evasion.initial).toBe(1);
        });
    });

    describe("bonus", () => {
        it("verrouille les défauts numériques range/dot", () => {
            expect(common.bonus.range.initial).toBe(0);
            expect(common.bonus.dot.initial).toBe(0);
        });

        it("expose damage/heal comme des champs sans défaut numérique (StringField)", () => {
            expect(common.bonus).toHaveProperty("damage");
            expect(common.bonus).toHaveProperty("heal");
            expect(common.bonus.damage.required).toBe(true);
            expect(common.bonus.heal.required).toBe(true);
        });
    });
});
