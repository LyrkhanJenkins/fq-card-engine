import {describe, expect, test} from "vitest";
import StatusEffects from "../../src/domain/system/effects/status-effects.js";

/**
 * Registre des effets de statut normalisés : garde le MÉCANISME (clés, clonage,
 * intégrité des données consommées par le pipeline et par DAE), pas l'équilibrage
 * (valeurs de dégâts/durées des statuts = design, réglable sans casser de test,
 * à l'exception des invariants structurels dont dépend le moteur).
 */
describe("StatusEffects — registre des statuts normalisés", () => {

    test("STATUS_CHOICES expose le mode Personnalisé (clé vide) plus une entrée par statut du registre", () => {
        const keys = Object.keys(StatusEffects.STATUS_CHOICES);
        expect(keys).toContain("");
        for (const key of keys.filter(k => k !== "")) {
            expect(StatusEffects.isStatusKey(key)).toBe(true);
        }
    });

    test("isStatusKey rejette la clé vide (Personnalisé), les clés inconnues et les non-chaînes", () => {
        expect(StatusEffects.isStatusKey("")).toBe(false);
        expect(StatusEffects.isStatusKey("inconnu")).toBe(false);
        expect(StatusEffects.isStatusKey(undefined)).toBe(false);
        expect(StatusEffects.isStatusKey(null)).toBe(false);
        // Une clé héritée d'Object.prototype ne doit jamais passer pour un statut.
        expect(StatusEffects.isStatusKey("toString")).toBe(false);
    });

    test("expand renvoie null pour une clé qui n'est pas un statut", () => {
        expect(StatusEffects.expand("")).toBeNull();
        expect(StatusEffects.expand("inconnu")).toBeNull();
        expect(StatusEffects.expand(undefined)).toBeNull();
    });

    test("expand renvoie une copie profonde : muter le résultat n'altère pas le registre", () => {
        const first = StatusEffects.expand("poison");
        first[0].name = "MUTATED";
        first[0].changes.push({key: "hacked", value: "1"});
        const second = StatusEffects.expand("poison");
        expect(second[0].name).toBe("Poison");
        expect(second[0].changes.some(c => c.key === "hacked")).toBe(false);
        expect(second).not.toBe(first);
    });

    test("chaque statut expanse en données d'effet bien formées (nom, icône, changes, duration)", () => {
        for (const key of Object.keys(StatusEffects.STATUS_CHOICES).filter(k => k !== "")) {
            const dataList = StatusEffects.expand(key);
            expect(dataList.length, key).toBeGreaterThanOrEqual(1);
            for (const data of dataList) {
                expect(data.name, key).toBeTruthy();
                expect(data.img, key).toBeTruthy();
                expect(Array.isArray(data.changes), key).toBe(true);
                expect(data.duration, key).toHaveProperty("value");
                expect(data.duration.units, key).toBe("rounds");
            }
        }
    });

    test("poison : durée illimitée, propagation via la macro FQPoisonSpread ré-exécutée par DAE en fin de tour", () => {
        const [poison] = StatusEffects.expand("poison");
        // Durée vide = illimitée (purge en fin de combat via l'origine FQ).
        expect(poison.duration.value).toBe("");
        // La duplication quadratique repose sur ces deux invariants : le change
        // macro.execute (macro importée du compendium) et le flag DAE de
        // ré-exécution en FIN de tour (la copie ne compte qu'au tour suivant).
        const macroChange = poison.changes.find(c => c.key === "macro.execute");
        expect(macroChange?.value).toBe(StatusEffects.POISON_SPREAD_MACRO);
        expect(poison.flags?.dae?.macroRepeat).toBe("endEveryTurn");
        // Et sur les dégâts par tour portés par le mécanisme dot existant.
        expect(poison.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(true);
    });

    test("acide : effets empilés à durées échelonnées, tous nommés pareil (retrait/conditions par nom)", () => {
        const acids = StatusEffects.expand("acid");
        expect(acids.length).toBeGreaterThan(1);
        expect(new Set(acids.map(a => a.name)).size).toBe(1);
        // Les durées sont strictement croissantes : chaque expiration fait
        // baisser le total de dot — c'est la dégressivité, sans code moteur.
        const durations = acids.map(a => Number(a.duration.value));
        for (let i = 1; i < durations.length; i++) {
            expect(durations[i]).toBeGreaterThan(durations[i - 1]);
        }
        for (const acid of acids) {
            expect(acid.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(true);
        }
    });

    test("malédiction : aucun dégât (pas de change dot), durée illimitée — pure marque de combo", () => {
        const [curse] = StatusEffects.expand("curse");
        expect(curse.duration.value).toBe("");
        expect(curse.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(false);
        expect(curse.name).toBe("Curse");
    });

    test("virus : override des PV max par les PV restants (résolu par DAE), aucun dégât, durée illimitée", () => {
        const [virus] = StatusEffects.expand("virus");
        expect(virus.name).toBe("Virus");
        expect(virus.duration.value).toBe("");
        expect(virus.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(false);
        // La valeur reste une référence @ : c'est DAE qui la résout dynamiquement
        // sur l'acteur porteur — les PV max suivent les PV restants.
        const override = virus.changes.find(c => c.key === "system.attributes.hp.max");
        expect(override).toEqual(expect.objectContaining({value: "@attributes.hp.value", type: "override"}));
    });

    test("les noms canoniques référencés par les scripts de combo des cartes existantes sont préservés", () => {
        // targetsHaveEffect(["Burn"|"Frost"|"Curse"|"Earth Effect"|"Air Effect"]) :
        // renommer un de ces effets casserait les combos Élémentaliste/Mage Blanc.
        expect(StatusEffects.expand("burn")[0].name).toBe("Burn");
        expect(StatusEffects.expand("frost")[0].name).toBe("Frost");
        expect(StatusEffects.expand("earth")[0].name).toBe("Earth Effect");
        expect(StatusEffects.expand("air")[0].name).toBe("Air Effect");
        expect(StatusEffects.expand("poison")[0].name).toBe("Poison");
        expect(StatusEffects.expand("acid")[0].name).toBe("Acid");
    });
});
