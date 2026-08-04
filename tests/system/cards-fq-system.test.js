import {describe, expect, it} from "vitest";
import CardsFqSystem from "../../src/domain/system/cards/cards-fq-system.mjs";

// Caractérisation du modèle deck (MODEL-03) : type/owner/classLevels.
// `classLevels.initial` est une VALEUR objet ({}) et non une fonction.

describe("CardsFqSystem.defineSchema", () => {
    const fq = CardsFqSystem.defineSchema().fq;

    it("expose les clés type/owner/classLevels", () => {
        expect(fq).toHaveProperty("type");
        expect(fq).toHaveProperty("owner");
        expect(fq).toHaveProperty("classLevels");
    });

    it("verrouille type/owner comme requis (StringField sans initial)", () => {
        expect(fq.type.required).toBe(true);
        expect(fq.owner.required).toBe(true);
    });

    it("verrouille classLevels comme optionnel, nullable, initial {}", () => {
        expect(fq.classLevels.required).toBe(false);
        expect(fq.classLevels.nullable).toBe(true);
        expect(fq.classLevels.initial).toEqual({});
    });
});
