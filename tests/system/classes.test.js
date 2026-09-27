import {afterEach, describe, expect, it} from "vitest";
import {
    BASE_FQ_CLASSES,
    NEUTRAL_CLASS,
    fqClassChoices,
    fqClassIds,
    hasFqClass,
    registerFqClass,
    unregisterFqClass
} from "../../src/domain/classes.js";

// ─── Registre des classes FQ ──────────────────────────────────────────────────
//
// Le registre est un état de MODULE, partagé par tous les tests de ce fichier :
// chacun remet les classes du moteur en place derrière lui, sinon une classe de
// test fuirait dans le schéma lu par les tests suivants.
//
// Ce que le registre protège, et qui justifie ses refus :
// - `""` comme identifiant ferait lever le `StringField` du schéma, qui passe
//   `blank` à false dès qu'il reçoit des choix, et viderait silencieusement les
//   choix de toutes les cartes du monde (voir schema-choice-fields.test.js) ;
// - retirer `neutral` priverait le champ de classe de sa valeur `initial`.

/**
 * Remet le registre dans l'état du moteur : les classes de base, et elles seules.
 *
 * @returns {void}
 */
function resetRegistry() {
    for (const classId of fqClassIds()) {
        if (!Object.hasOwn(BASE_FQ_CLASSES, classId)) {
            unregisterFqClass(classId);
        }
    }
    for (const [classId, labelKey] of Object.entries(BASE_FQ_CLASSES)) {
        registerFqClass(classId, labelKey);
    }
}

afterEach(resetRegistry);

describe("Registre des classes FQ : état de départ", () => {

    it("déclare les dix classes du moteur, libellés en clés de localisation", () => {
        expect(fqClassChoices()).toEqual(BASE_FQ_CLASSES);
        expect(fqClassIds()).toHaveLength(10);
        expect(Object.values(BASE_FQ_CLASSES).every(key => key.startsWith("FQCARDENGINE.Class"))).toBe(true);
    });

    it("garde neutral en tête, la liste déroulante suivant l'ordre d'inscription", () => {
        expect(fqClassIds()[0]).toBe(NEUTRAL_CLASS);
    });

    it("rend un objet neuf à chaque appel, jamais le registre lui-même", () => {
        // Foundry conserve la table qu'on lui donne : la muter après coup
        // modifierait un schéma déjà figé.
        const choices = fqClassChoices();
        choices["witch"] = "détourné";

        expect(fqClassChoices()["witch"]).toBe("FQCARDENGINE.ClassWitch");
    });
});

describe("Registre des classes FQ : déclaration par un module de contenu", () => {

    it("ajoute une classe, qui entre dans les choix et en fin de liste", () => {
        registerFqClass("chronomancer", "FQ8CONTENT.ClassChronomancer");

        expect(hasFqClass("chronomancer")).toBe(true);
        expect(fqClassChoices()["chronomancer"]).toBe("FQ8CONTENT.ClassChronomancer");
        expect(fqClassIds().at(-1)).toBe("chronomancer");
    });

    it("remplace la clé de libellé d'une classe déjà déclarée, sans la dupliquer", () => {
        registerFqClass("witch", "FQ8CONTENT.ClassWitch");

        expect(fqClassChoices()["witch"]).toBe("FQ8CONTENT.ClassWitch");
        expect(fqClassIds().filter(id => id === "witch")).toHaveLength(1);
    });

    it("refuse un identifiant ou une clé de libellé vide", () => {
        expect(() => registerFqClass("", "FQ8CONTENT.ClassNone")).toThrow();
        expect(() => registerFqClass("chronomancer", "")).toThrow();
        expect(hasFqClass("chronomancer")).toBe(false);
    });

    it("refuse un identifiant qui n'est pas une chaîne", () => {
        expect(() => registerFqClass(null, "FQ8CONTENT.ClassNull")).toThrow();
        expect(() => registerFqClass(12, "FQ8CONTENT.ClassNumber")).toThrow();
    });
});

describe("Registre des classes FQ : retrait", () => {

    it("retire une classe déclarée et le signale", () => {
        registerFqClass("chronomancer", "FQ8CONTENT.ClassChronomancer");

        expect(unregisterFqClass("chronomancer")).toBe(true);
        expect(hasFqClass("chronomancer")).toBe(false);
        expect(fqClassChoices()).not.toHaveProperty("chronomancer");
    });

    it("retire une classe du moteur : le contenu absent cesse d'être proposé", () => {
        // Le cas du module de contenu séparé : sans lui, le sélecteur ne doit
        // plus offrir une classe dont aucune carte n'est installée.
        expect(unregisterFqClass("witch")).toBe(true);
        expect(fqClassIds()).toHaveLength(9);
        expect(fqClassChoices()).not.toHaveProperty("witch");
    });

    it("refuse de retirer neutral, valeur initiale du champ de classe", () => {
        expect(unregisterFqClass(NEUTRAL_CLASS)).toBe(false);
        expect(hasFqClass(NEUTRAL_CLASS)).toBe(true);
    });

    it("signale sans lever le retrait d'une classe jamais déclarée", () => {
        expect(unregisterFqClass("inconnue")).toBe(false);
    });
});
