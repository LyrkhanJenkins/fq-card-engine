import {afterEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";
import RollReport from "../../src/domain/engine/roll/roll-report.js";
import {dnd5eDamage, makeTarget, stubRolls, targeting} from "./roll-fixtures.js";

/**
 * Résistances, immunités et vulnérabilités dans la VRAIE résolution : une carte
 * lance sa formule d'un seul tenant, l'échelle FQ s'applique, puis le
 * coefficient des éléments de la formule pour chaque cible — les traits étant
 * lus par le `calculateDamage` de l'acteur (ici le double de `roll-fixtures`).
 *
 * Le critique et l'esquive sont hors de portée, sauf là où c'est leur cran
 * qu'on veut voir se combiner aux traits.
 */

const originalRoll = globalThis.Roll;

/** Un lanceur sans critique possible et sans bonus de dégâts. */
function caster(bonus = "") {
    return {_id: "caster", system: {fq: {attributes: {critical: 0}, bonus: {damage: bonus, heal: ""}}}};
}

/** Une cible porteuse de traits dnd5e. */
function foe(id, traits = {}, evasion = 0) {
    const token = makeTarget(id, id, evasion);
    token.actor.calculateDamage = dnd5eDamage(traits);
    return token;
}

/** Le choix *Givrefeu* : feu et froid. */
const FROSTFIRE = {damage: "(1d4)[fire]+(4+1d6)[cold]", bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1};

afterEach(() => {
    globalThis.Roll = originalRoll;
    vi.restoreAllMocks();
});

describe("Damage — une carte à deux éléments", () => {

    it("la formule est lancée d'un seul tenant", async () => {
        targeting(foe("gobelin"));
        stubRolls([{total: 12}]);
        const report = new RollReport();

        await Damage.buildDamageDiceLauncher(caster(), FROSTFIRE, report);

        expect(globalThis.Roll).toHaveBeenCalledTimes(1);
        expect(globalThis.Roll.mock.calls[0][0]).toContain("(1d4)[fire]+(4+1d6)[cold]");
        expect(report.mainRoll.total).toBe(12);
    });

    it("six profils, un seul jet de 12", async () => {
        targeting(
            foe("gobelin"),
            foe("salamandre", {di: ["fire"]}),
            foe("glace", {dv: ["fire"]}),
            foe("golem", {dr: ["cold"]}),
            foe("diablotin", {dr: ["fire"], di: ["cold"]}),
            foe("élémentaire", {dv: ["fire"], dr: ["cold"]}));
        stubRolls([{total: 12}]);
        const report = new RollReport();

        const result = await Damage.buildDamageDiceLauncher(caster(), FROSTFIRE, report);

        // aucun trait ×1 ; immunité partielle ×½ ; vulnérabilité ×2 ; résistance ×½ ;
        // résistance + immunité partielle ×¼ ; vulnérabilité + résistance ×1.
        expect(result.map(entry => entry.value)).toEqual([12, 6, 24, 6, 3, 12]);
        expect(report.results[0].traits).toBeUndefined();
        expect(report.results[1].traits).toEqual([{type: "fire", kinds: ["immune"], factor: 0.5}]);
        expect(report.results[4].traits).toEqual([
            {type: "fire", kinds: ["resist"], factor: 0.5},
            {type: "cold", kinds: ["immune"], factor: 0.5}
        ]);
    });

    it("immunisée aux deux éléments : rien", async () => {
        targeting(foe("golem de glace et de feu", {di: ["fire", "cold"]}));
        stubRolls([{total: 12}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), FROSTFIRE))[0].value).toBe(0);
    });

    it("le bonus de dégâts de l'acteur fait partie du total, et en subit le coefficient", async () => {
        targeting(foe("salamandre", {di: ["fire"]}));
        stubRolls([{total: 14}]);

        const result = await Damage.buildDamageDiceLauncher(caster("+2"), FROSTFIRE);

        expect(globalThis.Roll.mock.calls[0][0]).toContain("2");
        expect(result[0].value).toBe(7);
    });

    it("un malus qui efface tout (« ne peut infliger de dégâts ») : zéro, même contre un vulnérable", async () => {
        targeting(foe("glace", {dv: ["fire", "cold"]}));
        stubRolls([{total: -9999988}]);

        expect((await Damage.buildDamageDiceLauncher(caster("-9999999"), FROSTFIRE))[0].value).toBe(0);
    });

    it("un terme nu dans une formule d'un seul élément est de cet élément", async () => {
        targeting(foe("golem", {di: ["poison"]}));
        stubRolls([{total: 8}]);

        const result = await Damage.buildDamageDiceLauncher(caster(), {...FROSTFIRE, damage: "5+@cha[poison]"});

        expect(result[0].value).toBe(0);
    });

    it("une formule sans type : aucun trait ne joue", async () => {
        targeting(foe("salamandre", {di: ["fire"]}));
        stubRolls([{total: 9}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), {...FROSTFIRE, damage: "2*@wis+1d8"}))[0].value).toBe(9);
    });
});

describe("Damage — l'échelle FQ et les traits se combinent", () => {

    it("esquive (½) puis résistance (½) : 13 → 3", async () => {
        targeting(foe("diablotin", {dr: ["fire"]}, 20));
        stubRolls([{total: 13}, {total: 10}]);

        const result = await Damage.buildDamageDiceLauncher(caster(),
            {damage: "(2d6+3)[fire]", bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1});

        expect(result[0].evasion).toBe(true);
        expect(result[0].value).toBe(3);
    });

    it("sans dnd5e (acteur sans calculateDamage) : exactement le calcul d'avant", async () => {
        targeting(makeTarget("t1", "Rocher", 0));
        stubRolls([{total: 11}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), FROSTFIRE))[0].value).toBe(11);
    });
});

describe("Damage — dégâts magiques ou non : le loup-garou", () => {

    /** Résistant au tranchant, sauf aux attaques magiques. */
    const WEREWOLF = {dr: ["slashing"], bypasses: ["mgc"]};
    const SLASH = {damage: "(1d8+3)[slashing]", bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1};

    it("une carte magique passe outre sa résistance", async () => {
        targeting(foe("loup-garou", WEREWOLF));
        stubRolls([{total: 10}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), {...SLASH, magical: true}))[0].value).toBe(10);
    });

    it("une carte antérieure à la case est magique", async () => {
        targeting(foe("loup-garou", WEREWOLF));
        stubRolls([{total: 10}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), SLASH))[0].value).toBe(10);
    });

    it("une technique d'arme non magique : il résiste", async () => {
        const target = foe("loup-garou", WEREWOLF);
        targeting(target);
        stubRolls([{total: 10}]);

        const result = await Damage.buildDamageDiceLauncher(caster(), {...SLASH, magical: false});

        expect(result[0].value).toBe(5);
        expect(target.actor.calculateDamage.mock.calls[0][0][0].properties).toEqual(new Set());
    });

    it("une résistance sans exception joue même contre la magie", async () => {
        targeting(foe("golem", {dr: ["slashing"]}));
        stubRolls([{total: 10}]);

        expect((await Damage.buildDamageDiceLauncher(caster(), {...SLASH, magical: true}))[0].value).toBe(5);
    });
});

describe("Damage — un jet d'activité dnd5e", () => {

    it("ses dégâts sont de son type, avec les propriétés de son jet", async () => {
        const target = foe("loup-garou", {dr: ["slashing"]});
        targeting(target);

        const result = await Damage.addCriticalEvasionToDamage(caster(), 10,
            {bonusCrit: -999, bonusEva: -9999}, new RollReport(), {types: ["slashing"], properties: ["sil"]});

        expect(result[0].value).toBe(5);
        expect(target.actor.calculateDamage.mock.calls[0][0][0].properties).toEqual(new Set(["sil"]));
    });

    it("sans élément fourni : aucune résistance ne les arrête", async () => {
        targeting(foe("salamandre", {di: ["fire"]}));

        const result = await Damage.addCriticalEvasionToDamage(caster(), 10, {bonusCrit: -999, bonusEva: -9999});

        expect(result[0].value).toBe(10);
    });
});

describe("Damage.damageOverTime", () => {

    /**
     * Un acteur porteur de dégâts par tour.
     *
     * @param {string|number} dot      - Sa formule.
     * @param {object}        [traits] - Ses traits dnd5e.
     *
     * @returns {object} L'acteur.
     */
    const bearer = (dot, traits) => ({
        system: {fq: {bonus: {dot}}},
        calculateDamage: traits ? dnd5eDamage(traits) : undefined,
        getRollData: () => ({con: 3})
    });

    it("rien à retirer sans formule", async () => {
        expect(await Damage.damageOverTime(bearer(""))).toBe(0);
        expect(await Damage.damageOverTime(null)).toBe(0);
    });

    it("un nombre se lit sans jet : l'ancien format numérique, ou un morceau signé", async () => {
        globalThis.Roll = vi.fn();

        expect(await Damage.damageOverTime(bearer(3))).toBe(3);
        expect(await Damage.damageOverTime(bearer("+3"))).toBe(3);
        expect(globalThis.Roll).not.toHaveBeenCalled();
    });

    it("la formule est lancée d'un seul tenant, sans son signe d'ouverture", async () => {
        stubRolls([{total: 3}]);

        await Damage.damageOverTime(bearer("+1[poison]+1[poison]+1[fire]"));

        expect(globalThis.Roll.mock.calls[0][0]).toBe("1[poison]+1[poison]+1[fire]");
    });

    it("poison et brûlure sur un squelette immunisé au poison : ×½", async () => {
        stubRolls([{total: 4}]);

        expect(await Damage.damageOverTime(bearer("+1[poison]+1[poison]+2[fire]", {di: ["poison"]}))).toBe(2);
    });

    it("un démon résistant au feu : ×½ tronqué", async () => {
        stubRolls([{total: 3}]);

        expect(await Damage.damageOverTime(bearer("+3[fire]", {dr: ["fire"]}))).toBe(1);
    });

    it("les dégâts par tour n'ont aucune propriété : une résistance physique joue", async () => {
        stubRolls([{total: 4}]);
        const actor = bearer("+4[piercing]", {dr: ["piercing"]});

        expect(await Damage.damageOverTime(actor)).toBe(2);
        expect(actor.calculateDamage.mock.calls[0][0][0].properties).toEqual(new Set());
    });

    it("un soin par tour (total négatif) n'est réduit par aucun trait", async () => {
        stubRolls([{total: -3}]);

        expect(await Damage.damageOverTime(bearer("+2[poison]-5", {di: ["poison"]}))).toBe(-3);
    });

    it("la bombe à retardement se compense : rien", async () => {
        stubRolls([{total: 0}]);

        expect(await Damage.damageOverTime(bearer("+5[fire]-5[fire]", {dv: ["fire"]}))).toBe(0);
    });

    it("un dé est tiré à chaque tour, une référence @ se résout sur le porteur", async () => {
        stubRolls([{total: 6}]);

        expect(await Damage.damageOverTime(bearer("+(@con+1d8)[piercing]"))).toBe(6);
        expect(globalThis.Roll.mock.calls[0]).toEqual(["(@con+1d8)[piercing]", {con: 3}]);
    });
});
