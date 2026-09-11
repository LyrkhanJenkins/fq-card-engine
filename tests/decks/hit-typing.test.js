import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import CardFqSystem from "../../src/domain/system/cards/card-fq-system.mjs";

/**
 * La cohérence du jet pour toucher des choix de cartes des paquets pattern.
 *
 * Un choix typé mais incomplet — une attaque sans source, une source
 * « caractéristique » sans caractéristique, une sauvegarde sans caractéristique
 * de sauvegarde — n'échoue pas : `HitProfile.of` l'écarte et la carte se joue
 * SANS jet pour toucher, en silence. Ce test refuse ces trous, et les valeurs
 * inconnues du schéma. Il ne dit rien du CHOIX d'un type pour une carte, qui
 * relève du design.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const schema = CardFqSystem.getChoiceSchema();
const TYPES = Object.keys(schema.hitType.choices);
const SOURCES = Object.keys(schema.hitSource.choices).filter(Boolean);
const ABILITIES = Object.keys(schema.hitAbility.choices).filter(Boolean);

const choices = fs.readdirSync(DECKS_DIR).filter(file => file.endsWith(".json"))
    .flatMap(file => (JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8")).cards ?? [])
        .flatMap(card => card.system.fq.choices.map((choice, index) => ({
            label: `${file} :: ${card.name} #${index}`, choice
        }))));
const typed = choices.filter(({choice}) => CardFqSystem.hasHitRoll(choice));

describe("Jet pour toucher des paquets pattern", () => {

    it("balaie effectivement des choix typés, attaques et sauvegardes", () => {
        expect(typed.filter(({choice}) => choice.hitType === CardFqSystem.HIT_TYPE_ATTACK).length).toBeGreaterThan(50);
        expect(typed.filter(({choice}) => choice.hitType === CardFqSystem.HIT_TYPE_SAVE).length).toBeGreaterThan(10);
    });

    it("aucun type de toucher inconnu du schéma", () => {
        const faulty = choices.filter(({choice}) => choice.hitType !== undefined && !TYPES.includes(choice.hitType))
            .map(({label, choice}) => `${label} : « ${choice.hitType} »`);

        expect(faulty).toEqual([]);
    });

    it("tout choix typé a une source connue", () => {
        const faulty = typed.filter(({choice}) => !SOURCES.includes(choice.hitSource))
            .map(({label, choice}) => `${label} : source « ${choice.hitSource} »`);

        expect(faulty).toEqual([]);
    });

    it("une source « caractéristique » nomme sa caractéristique", () => {
        const faulty = typed
            .filter(({choice}) => choice.hitSource === CardFqSystem.HIT_SOURCE_ABILITY
                && !ABILITIES.includes(choice.hitAbility))
            .map(({label, choice}) => `${label} : « ${choice.hitAbility} »`);

        expect(faulty).toEqual([]);
    });

    it("une sauvegarde nomme la caractéristique que la cible jette", () => {
        const faulty = typed
            .filter(({choice}) => choice.hitType === CardFqSystem.HIT_TYPE_SAVE
                && !ABILITIES.includes(choice.saveAbility))
            .map(({label, choice}) => `${label} : « ${choice.saveAbility} »`);

        expect(faulty).toEqual([]);
    });
});
