import {describe, expect, it} from "vitest";
import {escapeHtml} from "../../src/core/utils/html.utils.js";

/**
 * `escapeHtml` : ce qui entre dans un `data-tooltip="…"` ou dans du contenu HTML
 * ne doit jamais pouvoir y ouvrir une balise ni fermer l'attribut.
 */
describe("escapeHtml", () => {

    it("échappe les quatre caractères qui ouvrent une balise ou ferment un attribut", () => {
        expect(escapeHtml(`<b class="x">A & B</b>`))
            .toBe("&lt;b class=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;");
    });

    it("échappe l'esperluette en premier : rien n'est échappé deux fois", () => {
        expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    });

    it("laisse intact un texte ordinaire, apostrophes et accents compris", () => {
        expect(escapeHtml("À terre (cible) · l'avantage")).toBe("À terre (cible) · l'avantage");
    });

    it("convertit ce qui n'est pas une chaîne, et rend « » pour null ou undefined", () => {
        expect(escapeHtml(17)).toBe("17");
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
    });
});
