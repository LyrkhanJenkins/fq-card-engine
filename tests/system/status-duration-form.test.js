import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import StatusEffects from "../../src/domain/system/effects/status-effects.js";

/**
 * Le champ durée du formulaire de carte, en mode « Statut normalisé ».
 *
 * La feuille ne se re-rend pas quand on change le statut : c'est la CSS qui,
 * par `:has(option:checked)`, masque ou montre les champs en direct. Elle doit
 * donc connaître la liste des statuts dont la durée est FIXÉE par le registre —
 * une liste écrite en dur dans la feuille de style, qui dériverait en silence
 * le jour où un statut FQ serait ajouté au registre. Ce test la garde d'accord
 * avec `StatusEffects.fixedDurationKeys()`.
 */

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "styles", "card-engine", "utilities.css"), "utf8");
const template = fs.readFileSync(path.join(root, "src", "templates", "fq-form", "card", "attributes.hbs"), "utf8");

/**
 * Les statuts nommés dans la règle qui masque le bloc durée.
 *
 * @returns {string[]} Les valeurs d'option citées, triées.
 */
function hiddenForStatuses() {
    const rule = css.match(/option:checked:is\(([^)]*)\)\)\s*\[data-status-duration\]/);
    expect(rule, "règle de masquage du bloc durée introuvable").not.toBeNull();
    return [...rule[1].matchAll(/\[value="([^"]+)"\]/g)].map(match => match[1]).sort();
}

describe("Formulaire de carte — bloc durée d'un statut normalisé", () => {

    it("la CSS masque la durée pour exactement les statuts que le registre fixe", () => {
        expect(hiddenForStatuses()).toEqual([...StatusEffects.fixedDurationKeys()].sort());
    });

    it("aucun statut réglé par la carte n'y figure", () => {
        const hidden = hiddenForStatuses();
        for (const key of Object.keys(StatusEffects.STATUS_CHOICES).filter(StatusEffects.isTimedByCard)) {
            expect(hidden).not.toContain(key);
        }
    });

    it("le bloc durée vit HORS des détails, que la CSS masque dès qu'un statut est choisi", () => {
        const details = template.indexOf("<span data-status-details>");
        const detailsEnd = template.indexOf("</span>", template.indexOf("EffectShowIcon", details));
        const duration = template.indexOf("<span data-status-duration>");

        expect(details).toBeGreaterThan(-1);
        expect(duration).toBeGreaterThan(detailsEnd);
        expect(template.indexOf(".duration.value", duration)).toBeGreaterThan(duration);
        expect(template.indexOf(".expireOnDamage", duration)).toBeGreaterThan(duration);
    });
});
