import {describe, expect, it} from "vitest";
import Advantage from "../../src/domain/engine/roll/advantage.js";
import {CONDITION_EFFECTS} from "../../src/domain/conditions.js";

/**
 * `Advantage` : les prédicats d'avantage, de désavantage et de défense tombée,
 * sans aucun dé ni document Foundry. Chaque règle est vérifiée seule, puis dans
 * ses combinaisons — l'annulation D&D est la source de bugs la plus probable.
 */

/**
 * Une sonde minimale bâtie sur la table du moteur, telle que `ConditionProbe` la
 * rendrait sans dnd5e : les conditions portées, moins les immunités.
 *
 * @param {string[]} [statuses] - Les conditions de l'acteur.
 * @param {object}   [options]  - Le reste de la sonde.
 * @param {boolean}  [options.untrainedArmor] - Armure non maîtrisée.
 * @param {string[]} [options.immune]         - Les immunités aux conditions.
 * @param {Object<string, string[]>} [options.extra] - Règles hors table (celles de dnd5e).
 *
 * @returns {object} La sonde.
 */
function probe(statuses = [], {untrainedArmor = false, immune = [], extra = {}} = {}) {
    const causes = key => [...(CONDITION_EFFECTS[key] ?? extra[key] ?? [])]
        .filter(id => statuses.includes(id) && !immune.includes(id));
    return {has: key => causes(key).length > 0, causes, untrainedArmor};
}

const NONE = probe();

describe("Advantage.combine", () => {

    it("sans raison : jet normal", () => {
        expect(Advantage.combine([], [])).toBe(Advantage.NORMAL);
    });

    it("des avantages seuls : avantage", () => {
        expect(Advantage.combine([{}], [])).toBe(Advantage.ADVANTAGE);
        expect(Advantage.combine([{}, {}, {}], [])).toBe(Advantage.ADVANTAGE);
    });

    it("des désavantages seuls : désavantage", () => {
        expect(Advantage.combine([], [{}])).toBe(Advantage.DISADVANTAGE);
    });

    it("un seul de chaque côté suffit à tout annuler, quel que soit leur nombre", () => {
        expect(Advantage.combine([{}], [{}])).toBe(Advantage.NORMAL);
        expect(Advantage.combine([{}, {}, {}], [{}])).toBe(Advantage.NORMAL);
        expect(Advantage.combine([{}], [{}, {}, {}])).toBe(Advantage.NORMAL);
    });
});

describe("Advantage.attack — conditions du LANCEUR", () => {

    it.each(["blinded", "frightened", "poisoned", "prone", "restrained"])(
        "lanceur %s : désavantage", condition => {
            const verdict = Advantage.attack(probe([condition]), NONE);

            expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
            expect(verdict.disadvantages).toEqual([{side: "caster", cause: condition}]);
            expect(verdict.advantages).toEqual([]);
        });

    it("lanceur invisible : avantage", () => {
        const verdict = Advantage.attack(probe(["invisible"]), NONE);

        expect(verdict.mode).toBe(Advantage.ADVANTAGE);
        expect(verdict.advantages).toEqual([{side: "caster", cause: "invisible"}]);
    });

    it.each(["charmed", "deafened", "grappled", "incapacitated", "paralyzed", "petrified", "stunned", "unconscious"])(
        "lanceur %s : aucun effet sur son propre jet d'attaque", condition => {
            expect(Advantage.attack(probe([condition]), NONE).mode).toBe(Advantage.NORMAL);
        });

    it("plusieurs gênes du lanceur : un seul désavantage, toutes les raisons gardées", () => {
        const verdict = Advantage.attack(probe(["poisoned", "prone"]), NONE);

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([
            {side: "caster", cause: "poisoned"},
            {side: "caster", cause: "prone"}
        ]);
    });
});

describe("Advantage.attack — conditions de la CIBLE", () => {

    it.each(["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"])(
        "cible %s : avantage", condition => {
            const verdict = Advantage.attack(NONE, probe([condition]));

            expect(verdict.mode).toBe(Advantage.ADVANTAGE);
            expect(verdict.advantages).toEqual([{side: "target", cause: condition}]);
        });

    it("cible invisible : désavantage", () => {
        const verdict = Advantage.attack(NONE, probe(["invisible"]));

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "invisible"}]);
    });

    it("cible à terre et lanceur AU CONTACT : avantage", () => {
        const verdict = Advantage.attack(NONE, probe(["prone"]), {adjacent: true});

        expect(verdict.mode).toBe(Advantage.ADVANTAGE);
        expect(verdict.advantages).toEqual([{side: "target", cause: "prone"}]);
    });

    it("cible à terre et lanceur À DISTANCE : désavantage", () => {
        const verdict = Advantage.attack(NONE, probe(["prone"]), {adjacent: false});

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "prone"}]);
    });

    it.each(["charmed", "deafened", "frightened", "grappled", "incapacitated", "poisoned"])(
        "cible %s : aucun effet sur le jet qui la vise", condition => {
            expect(Advantage.attack(NONE, probe([condition])).mode).toBe(Advantage.NORMAL);
        });

    it("une cible immunisée à sa condition n'en donne aucun avantage", () => {
        const verdict = Advantage.attack(NONE, probe(["prone"], {immune: ["prone"]}), {adjacent: true});

        expect(verdict.mode).toBe(Advantage.NORMAL);
        expect(verdict.advantages).toEqual([]);
    });
});

describe("Advantage.attack — statuts FQ « En élan » et « Garde brisée »", () => {

    it("lanceur « En élan » : avantage, et la raison le nomme", () => {
        const verdict = Advantage.attack(probe(["fqEmpowered"]), NONE);

        expect(verdict.mode).toBe(Advantage.ADVANTAGE);
        expect(verdict.advantages).toEqual([{side: "caster", cause: "fqEmpowered"}]);
    });

    it("cible en « Garde brisée » : avantage pour qui l'attaque", () => {
        const verdict = Advantage.attack(NONE, probe(["fqExposed"]));

        expect(verdict.mode).toBe(Advantage.ADVANTAGE);
        expect(verdict.advantages).toEqual([{side: "target", cause: "fqExposed"}]);
    });

    it("« Garde brisée » sur le LANCEUR ne l'aide pas à attaquer", () => {
        expect(Advantage.attack(probe(["fqExposed"]), NONE).mode).toBe(Advantage.NORMAL);
    });

    it("« En élan » sur la CIBLE n'aide pas qui l'attaque", () => {
        expect(Advantage.attack(NONE, probe(["fqEmpowered"])).mode).toBe(Advantage.NORMAL);
    });

    it("lanceur « En élan » contre cible invisible : ils s'annulent", () => {
        expect(Advantage.attack(probe(["fqEmpowered"]), probe(["invisible"])).mode).toBe(Advantage.NORMAL);
    });

    it("aucun des deux n'agit sur une sauvegarde", () => {
        expect(Advantage.save(probe(["fqExposed", "fqEmpowered"]), {ability: "dex"}).mode).toBe(Advantage.NORMAL);
    });
});

describe("Advantage — statuts FQ « Sous égide » et « Ébranlé »", () => {

    it("cible « Sous égide » : désavantage pour qui l'attaque, et la raison le nomme", () => {
        const verdict = Advantage.attack(NONE, probe(["fqWarded"]));

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "fqWarded"}]);
    });

    it("« Sous égide » contre « Garde brisée » sur la même cible : ils s'annulent", () => {
        expect(Advantage.attack(NONE, probe(["fqWarded", "fqExposed"])).mode).toBe(Advantage.NORMAL);
    });

    it("« Sous égide » sur le LANCEUR ne le gêne pas pour attaquer", () => {
        expect(Advantage.attack(probe(["fqWarded"]), NONE).mode).toBe(Advantage.NORMAL);
    });

    it.each(["str", "dex", "con", "int", "wis", "cha"])("cible « Ébranlée » : désavantage à sa sauvegarde de %s", ability => {
        const verdict = Advantage.save(probe(["fqShaken"]), {ability});

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "fqShaken"}]);
    });

    it("« Ébranlé » et un avantage posé sur la feuille : ils s'annulent", () => {
        expect(Advantage.save(probe(["fqShaken"]), {ability: "wis", systemMode: Advantage.ADVANTAGE}).mode)
            .toBe(Advantage.NORMAL);
    });

    it("« Ébranlé » n'agit pas sur une attaque", () => {
        expect(Advantage.attack(NONE, probe(["fqShaken"])).mode).toBe(Advantage.NORMAL);
        expect(Advantage.attack(probe(["fqShaken"]), NONE).mode).toBe(Advantage.NORMAL);
    });

    it("une cible « Ébranlée » et sans défense ne jette toujours rien", () => {
        expect(Advantage.save(probe(["fqShaken", "unconscious"]), {ability: "wis"}).auto).toBe("defenseless");
    });
});

describe("Advantage.attack — armure non maîtrisée", () => {

    it.each(["str", "dex"])("attaque de %s en armure non maîtrisée : désavantage", ability => {
        const verdict = Advantage.attack(probe([], {untrainedArmor: true}), NONE, {ability});

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "caster", cause: "armor"}]);
    });

    it.each(["con", "int", "wis", "cha", null])(
        "attaque de %s en armure non maîtrisée : aucun effet", ability => {
            expect(Advantage.attack(probe([], {untrainedArmor: true}), NONE, {ability}).mode)
                .toBe(Advantage.NORMAL);
        });

    it("l'armure de la CIBLE ne gêne pas celui qui l'attaque", () => {
        expect(Advantage.attack(NONE, probe([], {untrainedArmor: true}), {ability: "str"}).mode)
            .toBe(Advantage.NORMAL);
    });
});

describe("Advantage.attack — annulations", () => {

    it("lanceur invisible contre cible invisible : jet normal, les deux raisons restent dites", () => {
        const verdict = Advantage.attack(probe(["invisible"]), probe(["invisible"]));

        expect(verdict.mode).toBe(Advantage.NORMAL);
        expect(verdict.advantages).toEqual([{side: "caster", cause: "invisible"}]);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "invisible"}]);
    });

    it("lanceur empoisonné contre cible paralysée : jet normal", () => {
        expect(Advantage.attack(probe(["poisoned"]), probe(["paralyzed"])).mode).toBe(Advantage.NORMAL);
    });

    it("trois gênes contre un seul avantage : jet normal", () => {
        const caster = probe(["poisoned", "blinded"], {untrainedArmor: true});
        expect(Advantage.attack(caster, probe(["restrained"]), {ability: "str"}).mode).toBe(Advantage.NORMAL);
    });

    it("sans sonde (acteur absent) : jet normal", () => {
        expect(Advantage.attack(null, null).mode).toBe(Advantage.NORMAL);
    });

    it("une règle déclenchée sans cause nommable garde la clé de règle comme raison", () => {
        // L'épuisement de la règle « legacy » passe par hasConditionEffect sans
        // être un statut : la sonde sait qu'il y a désavantage, pas pourquoi.
        const exhausted = {has: key => key === "attackDisadvantage", causes: () => [], untrainedArmor: false};

        expect(Advantage.attack(exhausted, NONE).disadvantages)
            .toEqual([{side: "caster", cause: "attackDisadvantage"}]);
    });
});

describe("Advantage.save", () => {

    it("cible ordinaire : jet normal, aucun échec d'office", () => {
        expect(Advantage.save(NONE, {ability: "dex"})).toEqual({
            mode: Advantage.NORMAL, auto: null, advantages: [], disadvantages: [], autoCauses: []
        });
    });

    it.each(["paralyzed", "unconscious"])("cible %s : sans défense, sur TOUTE sauvegarde", condition => {
        for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
            const verdict = Advantage.save(probe([condition]), {ability});

            expect(verdict.auto).toBe("defenseless");
            expect(verdict.autoCauses).toEqual([{side: "target", cause: condition}]);
            expect(verdict.mode).toBe(Advantage.NORMAL);
        }
    });

    it.each(["petrified", "stunned"])("cible %s : échec d'office en Force et en Dextérité", condition => {
        for (const ability of ["str", "dex"]) {
            const verdict = Advantage.save(probe([condition]), {ability});

            expect(verdict.auto).toBe("fail");
            expect(verdict.autoCauses).toEqual([{side: "target", cause: condition}]);
        }
    });

    it.each(["petrified", "stunned"])("cible %s : sauvegarde ordinaire hors Force et Dextérité", condition => {
        for (const ability of ["con", "int", "wis", "cha"]) {
            expect(Advantage.save(probe([condition]), {ability}).auto).toBeNull();
        }
    });

    it("le mode posé par la feuille dnd5e est repris : avantage", () => {
        const verdict = Advantage.save(NONE, {ability: "wis", systemMode: 1});

        expect(verdict.mode).toBe(Advantage.ADVANTAGE);
        expect(verdict.advantages).toEqual([{side: "target", cause: "sheet"}]);
    });

    it("désavantage de la feuille : la condition en cause est nommée quand dnd5e la range", () => {
        const restrained = probe(["restrained"], {extra: {dexteritySaveDisadvantage: ["restrained"]}});
        const verdict = Advantage.save(restrained, {ability: "dex", systemMode: -1});

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "restrained"}]);
    });

    it("désavantage de la feuille sans condition connue : c'est la feuille qui est nommée", () => {
        const verdict = Advantage.save(NONE, {ability: "con", systemMode: -1});

        expect(verdict.disadvantages).toEqual([{side: "target", cause: "sheet"}]);
    });

    it("entravé ne donne AUCUN désavantage de lui-même : c'est dnd5e qui le pose sur la feuille", () => {
        // Le moteur ne recalcule pas ce que dnd5e calcule déjà : sans mode de
        // feuille, entravé n'agit pas sur la sauvegarde.
        expect(Advantage.save(probe(["restrained"]), {ability: "dex"}).mode).toBe(Advantage.NORMAL);
    });

    it.each(["str", "dex"])("armure non maîtrisée : désavantage à la sauvegarde de %s", ability => {
        const verdict = Advantage.save(probe([], {untrainedArmor: true}), {ability});

        expect(verdict.mode).toBe(Advantage.DISADVANTAGE);
        expect(verdict.disadvantages).toEqual([{side: "target", cause: "armor"}]);
    });

    it.each(["con", "int", "wis", "cha"])("armure non maîtrisée : aucun effet à la sauvegarde de %s", ability => {
        expect(Advantage.save(probe([], {untrainedArmor: true}), {ability}).mode).toBe(Advantage.NORMAL);
    });

    it("avantage de la feuille contre armure non maîtrisée : jet normal", () => {
        const verdict = Advantage.save(probe([], {untrainedArmor: true}), {ability: "dex", systemMode: 1});

        expect(verdict.mode).toBe(Advantage.NORMAL);
    });

    it("l'échec d'office l'emporte sur tout mode", () => {
        const verdict = Advantage.save(probe(["stunned"]), {ability: "dex", systemMode: 1});

        expect(verdict.auto).toBe("fail");
        expect(verdict.mode).toBe(Advantage.NORMAL);
    });

    it("une cible immunisée à l'étourdissement sauvegarde normalement", () => {
        expect(Advantage.save(probe(["stunned"], {immune: ["stunned"]}), {ability: "dex"}).auto).toBeNull();
    });
});

describe("Advantage — cible sans défense", () => {

    it.each(["paralyzed", "unconscious"])("%s : sans défense", condition => {
        expect(Advantage.isDefenseless(probe([condition]))).toBe(true);
        expect(Advantage.defenselessCauses(probe([condition]))).toEqual([{side: "target", cause: condition}]);
    });

    it.each(["petrified", "stunned", "restrained", "prone", "blinded"])("%s : se défend encore", condition => {
        expect(Advantage.isDefenseless(probe([condition]))).toBe(false);
        expect(Advantage.defenselessCauses(probe([condition]))).toEqual([]);
    });

    it("sans sonde : se défend", () => {
        expect(Advantage.isDefenseless(null)).toBe(false);
    });
});

describe("Advantage.keep", () => {

    it("un seul dé : rendu tel quel, quel que soit le mode", () => {
        expect(Advantage.keep([7], Advantage.ADVANTAGE)).toBe(7);
        expect(Advantage.keep([7], Advantage.DISADVANTAGE)).toBe(7);
        expect(Advantage.keep([7], Advantage.NORMAL)).toBe(7);
    });

    it("deux dés en jet normal : le premier, sans histoire", () => {
        expect(Advantage.keep([4, 17], Advantage.NORMAL)).toBe(4);
    });

    it("deux dés en avantage : le meilleur", () => {
        expect(Advantage.keep([4, 17], Advantage.ADVANTAGE)).toBe(17);
        expect(Advantage.keep([17, 4], Advantage.ADVANTAGE)).toBe(17);
    });

    it("deux dés en désavantage : le pire", () => {
        expect(Advantage.keep([4, 17], Advantage.DISADVANTAGE)).toBe(4);
        expect(Advantage.keep([17, 4], Advantage.DISADVANTAGE)).toBe(4);
    });
});
