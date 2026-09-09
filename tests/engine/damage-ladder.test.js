import {afterEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";
import {makeTarget, stubRolls, targeting} from "./roll-fixtures.js";

/**
 * L'échelle des dégâts : `0 → demi → normal → ×2`. Une cible oppose deux
 * défenses INDÉPENDANTES — son esquive FQ, et la protection que lui donnent sa
 * classe d'armure ou sa sauvegarde. Chacune fait descendre d'un cran, le
 * critique fait monter d'un cran, et les deux demi-réductions ne se multiplient
 * jamais entre elles.
 *
 * L'ordre des jets dans la résolution est imposé et compté par les séquences
 * ci-dessous : le critique du lanceur d'abord, puis PAR CIBLE l'esquive puis le
 * toucher. Un seuil hors de portée (`bonusCrit` / `bonusEva` très négatifs)
 * supprime le jet correspondant, ce qui permet d'isoler chaque défense.
 */

const originalRoll = globalThis.Roll;

/** Lanceur sans critique possible ni bonus, avec de quoi calculer un modificateur. */
const CASTER = {
    _id: "caster",
    system: {
        fq: {attributes: {critical: 0}, bonus: {damage: "", heal: ""}},
        abilities: {wis: {mod: 3}},
        attributes: {prof: 2}
    }
};

/** Carte à jet d'attaque, modificateur de caractéristique : M = 3 + 2 = 5. */
const ATTACK_CHOICE = {
    bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1,
    hitType: "attack", hitSource: "ability", hitAbility: "wis"
};

/** Carte à sauvegarde, même modificateur : DD = 8 + 5 = 13. */
const SAVE_CHOICE = {
    bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1,
    hitType: "save", hitSource: "ability", hitAbility: "wis", saveAbility: "dex"
};

afterEach(() => {
    globalThis.Roll = originalRoll;
    vi.restoreAllMocks();
});

describe("Damage.damageMultiplier", () => {

    it("sans critique : chaque défense réussie fait descendre d'un cran", () => {
        expect(Damage.damageMultiplier(0, false)).toBe(1);
        expect(Damage.damageMultiplier(1, false)).toBe(0.5);
        expect(Damage.damageMultiplier(2, false)).toBe(0);
    });

    it("avec critique : tout remonte d'un cran", () => {
        expect(Damage.damageMultiplier(0, true)).toBe(2);
        expect(Damage.damageMultiplier(1, true)).toBe(1);
        expect(Damage.damageMultiplier(2, true)).toBe(0.5);
    });

    it("ne sort jamais de l'échelle", () => {
        expect(Damage.damageMultiplier(5, false)).toBe(0);
        expect(Damage.damageMultiplier(0, true)).toBe(2);
        expect(Damage.damageMultiplier(-3, true)).toBe(2);
    });
});

describe("Damage — jet d'attaque contre la classe d'armure", () => {

    it("le jet atteint la classe d'armure : dégâts pleins", async () => {
        // M = 5, dé 12 → total 17 ≥ CA 15 : la cible ne se protège pas.
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 12}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE);

        expect(result[0].value).toBe(10);
    });

    it("la classe d'armure passe au-dessus du jet : demi-dégâts", async () => {
        // M = 5, dé 4 → total 9 < CA 15 : la cible se protège.
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 4}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE);

        expect(result[0].value).toBe(5);
    });

    it("à égalité, l'attaque touche : la classe d'armure ne protège pas", async () => {
        // M = 5, dé 10 → total 15 = CA 15.
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 10}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE);

        expect(result[0].value).toBe(10);
    });

    it("cible sans classe d'armure : aucune protection, aucun dé gâché", async () => {
        targeting(makeTarget("t1", "Rocher", 0));
        stubRolls([{total: 1}]);

        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};
        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE, report);

        expect(result[0].value).toBe(10);
        expect(report.addHit).not.toHaveBeenCalled();
    });
});

describe("Damage — jet de sauvegarde contre le DD", () => {

    it("sauvegarde réussie : demi-dégâts", async () => {
        // DD = 8 + 5 = 13 ; sauvegarde +3, dé 11 → total 14 ≥ 13.
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, SAVE_CHOICE);

        expect(result[0].value).toBe(5);
    });

    it("sauvegarde ratée : dégâts pleins", async () => {
        // DD = 13 ; sauvegarde +3, dé 2 → total 5 < 13.
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 2}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, SAVE_CHOICE);

        expect(result[0].value).toBe(10);
    });

    it("un DD explicite l'emporte sur le calcul", async () => {
        // DD forcé à 25 : la même sauvegarde échoue là où elle réussissait.
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);

        const result = await Damage.addCriticalEvasionToDamage(
            CASTER, 10, {...SAVE_CHOICE, saveDc: 25});

        expect(result[0].value).toBe(10);
    });
});

describe("Damage — les deux défenses ensemble", () => {

    /** Lanceur dont le critique est possible (score 4 → seuil 17). */
    const LUCKY = {
        ...CASTER,
        system: {...CASTER.system, fq: {attributes: {critical: 4}, bonus: {damage: "", heal: ""}}}
    };

    it("esquive ET protection : aucun dégât", async () => {
        // M = 5, dé 1 → 6 < CA 15 : protégé. Puis esquive 15 → seuil 6, dé 18 : esquivé.
        targeting(makeTarget("t1", "Gobelin", 15, {ac: 15}));
        stubRolls([{total: 1}, {total: 18}]);

        const result = await Damage.addCriticalEvasionToDamage(
            CASTER, 10, {...ATTACK_CHOICE, bonusEva: 0});

        expect(result[0].value).toBe(0);
    });

    it("critique, esquive ET protection : demi-dégâts", async () => {
        // Critique (seuil 17, dé 20), puis protection, puis esquive réussie.
        targeting(makeTarget("t1", "Gobelin", 15, {ac: 15}));
        stubRolls([{total: 20}, {total: 1}, {total: 18}]);

        const result = await Damage.addCriticalEvasionToDamage(
            LUCKY, 10, {...ATTACK_CHOICE, bonusCrit: 0, bonusEva: 0});

        expect(result[0].value).toBe(5);
        expect(result[0].critical).toBe(true);
    });

    it("critique et protection seule : dégâts normaux", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 20}, {total: 1}]);

        const result = await Damage.addCriticalEvasionToDamage(
            LUCKY, 10, {...ATTACK_CHOICE, bonusCrit: 0});

        expect(result[0].value).toBe(10);
    });

    it("les demi-réductions ne se multiplient pas : jamais de quart de dégâts", async () => {
        targeting(makeTarget("t1", "Gobelin", 15, {ac: 15}));
        stubRolls([{total: 1}, {total: 18}]);

        const result = await Damage.addCriticalEvasionToDamage(
            CASTER, 8, {...ATTACK_CHOICE, bonusEva: 0});

        expect(result[0].value).not.toBe(2);
        expect(result[0].value).toBe(0);
    });

    it("les demi-dégâts sont arrondis à l'inférieur", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 1}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 7, ATTACK_CHOICE);

        expect(result[0].value).toBe(3);
    });
});

describe("Damage — profil imposé par une activité dnd5e", () => {

    /**
     * Contenu de résolution tel que le hook dnd5e le construit : le profil y est
     * posé tout fait, aucun champ de carte ne le décrit.
     *
     * @param {object} hitProfile - Le profil de toucher de l'activité.
     *
     * @returns {object} Le contenu de résolution.
     */
    function activityContent(hitProfile) {
        return {bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1, hitProfile};
    }

    it("le profil de l'activité l'emporte : aucun champ de carte n'est lu", async () => {
        // DD 15, sauvegarde +3, dé 11 → 14 < 15 : ratée, dégâts pleins.
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, activityContent({
            type: "save", dc: 15, saveAbility: "dex", modifier: 0, defensesOnSuccess: 1
        }));

        expect(result[0].value).toBe(10);
    });

    it("une sauvegarde « aucun dégât sur réussite » annule à elle seule", async () => {
        // DD 13, sauvegarde +3, dé 11 → 14 ≥ 13 : réussie, et elle vaut deux crans.
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, activityContent({
            type: "save", dc: 13, saveAbility: "dex", modifier: 0, defensesOnSuccess: 2
        }));

        expect(result[0].value).toBe(0);
    });

    it("une sauvegarde « dégâts pleins sur réussite » ne protège de rien", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, activityContent({
            type: "save", dc: 13, saveAbility: "dex", modifier: 0, defensesOnSuccess: 0
        }));

        expect(result[0].value).toBe(10);
    });
});

describe("Damage — ce que le rapport consigne", () => {

    it("le jet pour toucher figure au rapport, avec son seuil et son verdict", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 15}));
        stubRolls([{total: 4}]);
        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};

        await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE, report);

        expect(report.addHit).toHaveBeenCalledWith({
            targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
            roll: 4, modifier: 5, total: 9, threshold: 15, defended: true
        });
    });

    it("une sauvegarde consigne le modificateur de la CIBLE et le DD", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}]);
        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};

        await Damage.addCriticalEvasionToDamage(CASTER, 10, SAVE_CHOICE, report);

        expect(report.addHit).toHaveBeenCalledWith({
            targetTokenId: "t1", targetName: "Gobelin", kind: "save",
            roll: 11, modifier: 3, total: 14, threshold: 13, defended: true
        });
    });
});

describe("Non-régression : une carte sans jet pour toucher", () => {

    it("ne lance aucun dé de toucher et garde ses dégâts pleins", async () => {
        targeting(makeTarget("t1", "Gobelin", 0, {ac: 30}));
        stubRolls([{total: 1}]);
        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};

        const result = await Damage.addCriticalEvasionToDamage(
            CASTER, 10, {bonusCrit: -999, bonusEva: -9999, minReach: 1, maxReach: 1}, report);

        expect(result[0].value).toBe(10);
        expect(report.addHit).not.toHaveBeenCalled();
    });
});

describe("Damage — une attaque ne roule qu'une fois", () => {

    it("le même dé d'attaque est opposé à chaque classe d'armure", async () => {
        // Un seul d20 pour toute la carte : 12 + 5 = 17. La CA 15 est dépassée,
        // la CA 20 protège — sans qu'un second dé soit jeté.
        targeting(
            makeTarget("t1", "Gobelin", 0, {ac: 15}),
            makeTarget("t2", "Troll", 0, {ac: 20}));
        stubRolls([{total: 12}]);
        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, ATTACK_CHOICE, report);

        expect(result[0].value).toBe(10);
        expect(result[1].value).toBe(5);
        // Deux entrées au rapport, mais le MÊME dé et le même total.
        const rolls = report.addHit.mock.calls.map(([hit]) => [hit.roll, hit.total, hit.threshold]);
        expect(rolls).toEqual([[12, 17, 15], [12, 17, 20]]);
    });

    it("une sauvegarde, elle, est jetée par CHAQUE cible", async () => {
        // Deux dés distincts : la sauvegarde appartient à la cible, pas au lanceur.
        targeting(
            makeTarget("t1", "Gobelin", 0, {saves: {dex: 3}}),
            makeTarget("t2", "Troll", 0, {saves: {dex: 3}}));
        stubRolls([{total: 11}, {total: 2}]);
        const report = {addEvasion: vi.fn(), addHit: vi.fn(), addResult: vi.fn()};

        const result = await Damage.addCriticalEvasionToDamage(CASTER, 10, SAVE_CHOICE, report);

        expect(result[0].value).toBe(5);
        expect(result[1].value).toBe(10);
        expect(report.addHit.mock.calls.map(([hit]) => hit.roll)).toEqual([11, 2]);
    });
});
