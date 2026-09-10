import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import DamageTraits from "../../src/domain/engine/roll/damage-traits.js";
import StatusEffects from "../../src/domain/system/effects/status-effects.js";
import {DAMAGE_TYPE_LABELS} from "../../src/domain/damage-types.js";

/**
 * Le TYPE des dégâts dans les paquets pattern.
 *
 * Une formule sans type n'est jamais résistée, et une formule d'un type
 * inconnu de dnd5e non plus : une coquille dans un crochet (`[fier]`) rend une
 * carte imparable sans que rien ne le dise. Ce test garde les deux.
 *
 * Et les dégâts par tour sont un texte que les effets CONCATÈNENT : un morceau
 * qui ne s'ouvre pas sur son signe se collerait au précédent (`1` + `1` = `11`).
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const KNOWN = new Set(Object.keys(DAMAGE_TYPE_LABELS));

const cards = fs.readdirSync(DECKS_DIR).filter(file => file.endsWith(".json"))
    .flatMap(file => (JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8")).cards ?? [])
        .map(card => ({file, card})));

/** Toutes les valeurs de dégâts par tour posées par les cartes. */
const dots = cards.flatMap(({file, card}) => card.system.fq.choices
    .flatMap(choice => choice.applyEffectsFormulas ?? [])
    .flatMap(formula => formula.effects)
    .flatMap(effect => effect.data)
    .flatMap(data => data.changes ?? [])
    .filter(change => change.key === "system.fq.bonus.dot")
    .map(change => ({label: `${file} :: ${card.name}`, value: String(change.value)})));

describe("Types de dégâts des paquets pattern", () => {

    it("balaie effectivement des formules et des dégâts par tour", () => {
        expect(cards.length).toBeGreaterThan(400);
        expect(dots.length).toBeGreaterThan(10);
    });

    it("chaque formule de dégâts porte au moins un type, et dnd5e les connaît tous", () => {
        const faulty = cards.flatMap(({file, card}) => card.system.fq.choices
            .filter(choice => choice.damage)
            .filter(choice => {
                const types = DamageTraits.elementsOf(choice.damage);
                return !types.length || types.some(type => !KNOWN.has(type));
            })
            .map(choice => `${file} :: ${card.name} : « ${choice.damage} »`));

        expect(faulty).toEqual([]);
    });

    it("chaque dégât par tour s'ouvre sur son signe", () => {
        const unsigned = dots.filter(dot => !/^[+-]/.test(dot.value)).map(dot => `${dot.label} : « ${dot.value} »`);

        expect(unsigned).toEqual([]);
    });

    it("chaque dégât par tour typé l'est d'un type connu", () => {
        const faulty = dots.filter(dot => DamageTraits.elementsOf(dot.value).some(type => !KNOWN.has(type)))
            .map(dot => `${dot.label} : « ${dot.value} »`);

        expect(faulty).toEqual([]);
    });

    it("les statuts FQ du registre posent des dégâts par tour signés et typés", () => {
        for (const key of ["poison", "acid", "burn"]) {
            const values = StatusEffects.expand(key)
                .flatMap(effect => effect.changes.filter(change => change.key === "system.fq.bonus.dot"))
                .map(change => String(change.value));
            expect(values.length, key).toBeGreaterThan(0);
            for (const value of values) {
                expect(value, key).toMatch(/^\+/);
                const types = DamageTraits.elementsOf(value);
                expect(types.length > 0 && types.every(type => KNOWN.has(type)), `${key} : ${value}`).toBe(true);
            }
        }
    });
});
