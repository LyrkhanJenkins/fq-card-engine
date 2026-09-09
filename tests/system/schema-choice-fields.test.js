import {describe, expect, it} from "vitest";
import CardFqSystem from "../../src/domain/system/cards/card-fq-system.mjs";
import fs from "fs";
import path from "path";

/**
 * Le piège du `StringField` à liste de choix.
 *
 * Foundry, dans `common/data/fields.mjs` :
 *
 * ```js
 * // If choices are provided, the field should not be null or blank by default
 * if ( this.choices ) {
 *   this.nullable = options.nullable ?? false;
 *   this.blank = options.blank ?? false;
 * }
 * ```
 *
 * Autrement dit, DÉCLARER des choix passe `blank` à false, et `_validateSpecial`
 * LÈVE alors sur la chaîne vide — même quand `""` figure explicitement parmi les
 * choix, et même quand c'est la valeur `initial` du champ.
 *
 * Les conséquences sont brutales et silencieuses : le champ invalide rend son
 * `SchemaField` invalide, l'`ArrayField` qui le contient écarte l'élément, et
 * `system.fq.choices` d'une carte se retrouve VIDE. Toutes les cartes du monde
 * cessent alors de s'afficher, sans la moindre erreur visible dans les données.
 *
 * Ce test ne peut pas s'appuyer sur les vrais champs Foundry (le harnais les
 * remplace par des doubles passe-plat, qui rendent les options telles quelles) —
 * mais c'est justement ce qu'il faut : le défaut vit dans la DÉCLARATION, et
 * c'est elle qu'on inspecte.
 */

/**
 * Parcourt un schéma en profondeur et rend chaque champ déclarant des `choices`.
 *
 * Les doubles du harnais rendent l'objet d'options reçu ; un champ imbriqué se
 * reconnaît donc à ses propres clés (`fields` pour un SchemaField, `element`
 * pour un ArrayField), telles que les fabriques les reçoivent.
 *
 * @param {object} node - Le nœud de schéma à parcourir.
 * @param {string} [path] - Le chemin parcouru, pour nommer les échecs.
 *
 * @returns {Array<{path: string, field: object}>} Les champs à liste de choix.
 */
function choiceFields(node, path = "") {
    if (!node || typeof node !== "object") {
        return [];
    }
    const found = [];
    if (node.choices && typeof node.choices === "object") {
        found.push({path, field: node});
    }
    // Un SchemaField reçoit ses sous-champs en premier argument, que le double
    // du harnais rend tel quel ; un ArrayField reçoit son élément de la même façon.
    for (const [key, value] of Object.entries(node)) {
        if (key === "choices" || !value || typeof value !== "object") {
            continue;
        }
        found.push(...choiceFields(value, path ? `${path}.${key}` : key));
    }
    return found;
}

describe("Schéma de carte : champs à liste de choix", () => {

    const fields = choiceFields(CardFqSystem.getChoiceSchema());

    it("inspecte réellement des champs à choix", () => {
        // Garde du garde : un parcours qui ne trouve rien rendrait le test
        // suivant vert sans rien avoir vérifié.
        expect(fields.length).toBeGreaterThan(0);
    });

    it("tout champ dont les choix admettent la chaîne vide déclare `blank: true`", () => {
        const faulty = fields
            .filter(({field}) => Object.keys(field.choices).includes("") && field.blank !== true)
            .map(({path, field}) => `${path || field.label} : « "" » figure dans les choix mais blank n'est pas true`);

        expect(faulty).toEqual([]);
    });
});

/**
 * Une liste de choix dont les libellés sont des CLÉS de localisation ne se
 * traduit QUE si `localize=true` est passé au `formInput` DANS LE GABARIT.
 *
 * Le déclarer dans le schéma ne suffit pas, et c'est contre-intuitif :
 * `DataField#toInput` ne recopie du champ que `placeholder`, et
 * `StringField#_toInput` que `choices` — `localize` n'est jamais transmis.
 * Un champ qui porte `localize: true` sans le drapeau du gabarit affiche donc
 * « FQCARDENGINE.HitTypeNone » au lieu de « Aucun ».
 *
 * Ce test a d'abord accepté le drapeau du schéma, et il est resté VERT alors
 * que le formulaire montrait ses clés brutes. Il n'accepte plus que le gabarit.
 */

const TEMPLATE = fs.readFileSync(
    path.join(process.cwd(), "src", "templates", "fq-form", "card", "attributes.hbs"), "utf8");

/**
 * Le gabarit localise-t-il ce champ ? On isole le bloc `formInput` qui le rend
 * et on y cherche le drapeau.
 *
 * @param {string} fieldName - Le nom du champ (dernier segment de son chemin).
 *
 * @returns {boolean} True si le gabarit passe `localize=true` pour ce champ.
 */
function localizedByTemplate(fieldName) {
    // Comparaison de chaînes plutôt qu'expression régulière : le nom du champ y
    // serait interpolé, et un échappement de trop y est passé inaperçu une fois.
    // Le séparateur écarte les préfixes (`type` ne doit pas matcher `targetType`).
    const references = [" ", "\r", "\n"].map(separator => `.fields.${fieldName}${separator}`);
    return TEMPLATE.split("{{formInput")
        .some(block => references.some(reference => block.includes(reference))
            && block.includes("localize=true"));
}

describe("Schéma de carte : libellés des listes de choix", () => {

    it("toute liste à libellés localisables porte `localize=true` dans le gabarit", () => {
        const untranslated = choiceFields(CardFqSystem.getChoiceSchema())
            .filter(({field}) => Object.values(field.choices).some(
                label => typeof label === "string" && label.startsWith("FQCARDENGINE.")))
            .filter(({path: fieldPath}) => !localizedByTemplate(fieldPath.split(".").pop()))
            .map(({path: fieldPath}) => `${fieldPath} : libellés en clés i18n, sans localize=true au gabarit`);

        expect(untranslated).toEqual([]);
    });
});
