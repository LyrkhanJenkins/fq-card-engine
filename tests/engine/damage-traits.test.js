import {describe, expect, it, vi} from "vitest";
import DamageTraits from "../../src/domain/engine/roll/damage-traits.js";
import {dnd5eDamage} from "./roll-fixtures.js";

/**
 * `DamageTraits` : les éléments d'une formule, et le coefficient qu'y applique
 * une cible. dnd5e dit quels traits jouent sur chaque élément (ici le double
 * `dnd5eDamage`) ; le moteur multiplie les coefficients.
 */

/** Un acteur porteur de traits dnd5e. */
const actorWith = traits => ({calculateDamage: dnd5eDamage(traits)});

/** Givrefeu : feu et froid. */
const FROSTFIRE = {types: ["fire", "cold"]};

describe("DamageTraits.elementsOf", () => {

    it("un élément", () => {
        expect(DamageTraits.elementsOf("(@wpnM + @str)[slashing]")).toEqual(["slashing"]);
    });

    it("deux éléments, dans l'ordre", () => {
        expect(DamageTraits.elementsOf("(1d4)[fire]+(4+@int+1d6)[cold]")).toEqual(["fire", "cold"]);
    });

    it("un élément répété ne compte qu'une fois", () => {
        expect(DamageTraits.elementsOf("+1[poison]+1[poison]+2[fire]")).toEqual(["poison", "fire"]);
    });

    it("en minuscules, comme dnd5e", () => {
        expect(DamageTraits.elementsOf("1d6[Fire]")).toEqual(["fire"]);
    });

    it("rien entre crochets : aucun élément", () => {
        expect(DamageTraits.elementsOf("2*@wis+1d8")).toEqual([]);
        expect(DamageTraits.elementsOf("")).toEqual([]);
        expect(DamageTraits.elementsOf(null)).toEqual([]);
        expect(DamageTraits.elementsOf(3)).toEqual([]);
    });
});

describe("DamageTraits.cardProperties — la case « Dégâts magiques »", () => {

    it("cochée : « mgc »", () => {
        expect(DamageTraits.cardProperties({magical: true})).toEqual(["mgc"]);
    });

    it("décochée : aucune propriété", () => {
        expect(DamageTraits.cardProperties({magical: false})).toEqual([]);
    });

    it("un choix antérieur à la case est magique, comme le défaut du schéma", () => {
        expect(DamageTraits.cardProperties({})).toEqual(["mgc"]);
        expect(DamageTraits.cardProperties(null)).toEqual(["mgc"]);
    });

    it("rend une copie : la constante partagée ne peut pas être modifiée par un appelant", () => {
        DamageTraits.cardProperties({}).push("sil");

        expect(DamageTraits.MAGICAL_PROPERTIES).toEqual(["mgc"]);
    });
});

describe("DamageTraits.apply — ce qui est soumis à dnd5e", () => {

    it("sans propriétés précisées : aucune", () => {
        const actor = actorWith();

        DamageTraits.apply(actor, 12, 1, FROSTFIRE);

        expect(actor.calculateDamage.mock.calls[0][0][0].properties).toEqual(new Set());
    });

    it("chaque élément une fois, avec les propriétés « magique » d'une carte", () => {
        const actor = actorWith();

        DamageTraits.apply(actor, 12, 1, {...FROSTFIRE, properties: DamageTraits.cardProperties({magical: true})});

        const [damages, options] = actor.calculateDamage.mock.calls[0];
        expect(damages.map(damage => damage.type)).toEqual(["fire", "cold"]);
        expect(damages.every(damage => damage.properties.has("mgc") && damage.properties.size === 1)).toBe(true);
        expect(options).toEqual({only: "damage"});
    });

    it("les propriétés d'un jet d'activité remplacent celles d'une carte", () => {
        const actor = actorWith();

        DamageTraits.apply(actor, 7, 1, {types: ["slashing"], properties: ["sil"]});

        expect(actor.calculateDamage.mock.calls[0][0][0].properties).toEqual(new Set(["sil"]));
    });

    it("aucun élément : dnd5e n'est pas dérangé et rien ne réduit les dégâts", () => {
        const actor = actorWith({di: ["fire"]});

        expect(DamageTraits.apply(actor, 12)).toEqual({value: 12, traits: []});
        expect(actor.calculateDamage).not.toHaveBeenCalled();
    });
});

describe("DamageTraits.apply — un seul élément", () => {

    it("aucun trait : les dégâts passent entiers, aucune puce", () => {
        expect(DamageTraits.apply(actorWith(), 12, 1, {types: ["fire"]})).toEqual({value: 12, traits: []});
    });

    it("résistance : ×½", () => {
        expect(DamageTraits.apply(actorWith({dr: ["fire"]}), 12, 1, {types: ["fire"]}))
            .toEqual({value: 6, traits: [{type: "fire", kinds: ["resist"], factor: 0.5}]});
    });

    it("immunité : ×0 — et elle efface une résistance du même élément", () => {
        expect(DamageTraits.apply(actorWith({dr: ["fire"], di: ["fire"]}), 12, 1, {types: ["fire"]}))
            .toEqual({value: 0, traits: [{type: "fire", kinds: ["immune"], factor: 0}]});
    });

    it("vulnérabilité : ×2", () => {
        expect(DamageTraits.apply(actorWith({dv: ["fire"]}), 3, 1, {types: ["fire"]}).value).toBe(6);
    });

    it("résistance ET vulnérabilité au même élément : ×1, deux puces", () => {
        expect(DamageTraits.apply(actorWith({dr: ["fire"], dv: ["fire"]}), 12, 1, {types: ["fire"]}))
            .toEqual({value: 12, traits: [{type: "fire", kinds: ["resist", "vulnerable"], factor: 1}]});
    });

    it("le cran FQ s'applique avec : esquive (½) et résistance (½) font ×¼, tronqué", () => {
        expect(DamageTraits.apply(actorWith({dr: ["fire"]}), 13, 0.5, {types: ["fire"]}).value).toBe(3);
    });
});

describe("DamageTraits.apply — plusieurs éléments : les coefficients se multiplient", () => {

    it("résistant au feu, immunisé au froid : ×¼", () => {
        const result = DamageTraits.apply(actorWith({dr: ["fire"], di: ["cold"]}), 12, 1, FROSTFIRE);

        expect(result.value).toBe(3);
        expect(result.traits).toEqual([
            {type: "fire", kinds: ["resist"], factor: 0.5},
            {type: "cold", kinds: ["immune"], factor: 0.5}
        ]);
    });

    it("vulnérable au feu, résistant au froid : ×1", () => {
        expect(DamageTraits.apply(actorWith({dv: ["fire"], dr: ["cold"]}), 12, 1, FROSTFIRE).value).toBe(12);
    });

    it("immunisé au seul feu : ×½", () => {
        expect(DamageTraits.apply(actorWith({di: ["fire"]}), 12, 1, FROSTFIRE).value).toBe(6);
    });

    it("immunisé aux deux : ×0", () => {
        const result = DamageTraits.apply(actorWith({di: ["fire", "cold"]}), 12, 1, FROSTFIRE);

        expect(result.value).toBe(0);
        expect(result.traits.map(trait => trait.factor)).toEqual([0, 0]);
    });

    it("vulnérable aux deux : ×4", () => {
        expect(DamageTraits.apply(actorWith({dv: ["fire", "cold"]}), 3, 1, FROSTFIRE).value).toBe(12);
    });

    it("seuls les éléments où un trait joue ont une puce", () => {
        expect(DamageTraits.apply(actorWith({dr: ["cold"]}), 12, 1, FROSTFIRE).traits)
            .toEqual([{type: "cold", kinds: ["resist"], factor: 0.5}]);
    });

    it("une marque « all » (résistance à tous les dégâts) joue sur chaque élément", () => {
        const calculateDamage = vi.fn(damages => damages.map(damage => ({...damage, active: {all: {resistance: true}}})));

        expect(DamageTraits.apply({calculateDamage}, 12, 1, FROSTFIRE).value).toBe(3);
    });
});

describe("DamageTraits.apply — sans dnd5e", () => {

    it("un acteur sans calculateDamage : le seul cran FQ, tronqué", () => {
        expect(DamageTraits.apply({}, 5, 0.5, FROSTFIRE)).toEqual({value: 2, traits: []});
    });

    it("sans acteur : pareil", () => {
        expect(DamageTraits.apply(null, 4, 1, FROSTFIRE).value).toBe(4);
    });

    it("un calcul annulé par un module (dnd5e rend false) : aucun trait ne joue", () => {
        expect(DamageTraits.apply({calculateDamage: () => false}, 10, 2, FROSTFIRE).value).toBe(20);
    });
});
