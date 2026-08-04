import {describe, expect, it} from "vitest";
import FormError from "../../src/core/error/form-error.model.js";

describe("FormError", () => {

    it("étend Error", () => {
        const err = new FormError("boom");

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(FormError);
    });

    it("transmet le message au constructeur natif", () => {
        expect(new FormError("boom").message).toBe("boom");
    });

    it("fixe name avec le libellé localisé via game.i18n.localize", () => {
        expect(new FormError("boom").name).toBe("FQCARDENGINE.DialogPlayFormError");
    });

    it("peut être levée et interceptée comme une Error classique", () => {
        expect(() => {
            throw new FormError("x");
        }).toThrow("x");
    });
});
