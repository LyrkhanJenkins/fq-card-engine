import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import HitProfile from "../../src/domain/engine/roll/hit-profile.js";
import {actorWith, makeAttackActivity, makeWeapon} from "../utils/formula-fixtures.js";

/**
 * `HitProfile` : le calcul du toucher, sans aucun dé lancé. Un seul modificateur
 * sert aux deux cas — l'attaque le pose face à la classe d'armure, la sauvegarde
 * le transforme en DD `8 + modificateur`.
 *
 * Le `Roll` du harnais rend un total constant, ce qui ne dirait rien du chemin
 * « modificateur d'arme » : celui-ci n'est juste que si la formule rendue par
 * dnd5e est réellement évaluée, données `@` comprises. Le double ci-dessous fait
 * cette substitution, comme `roll-dice-sync.test.js` reproduit le refus du
 * synchrone.
 */
const realRoll = globalThis.Roll;

/** Roll minimal qui substitue les données `@` puis évalue l'arithmétique. */
class DataRoll {
    constructor(formula, data = {}) {
        this.formula = String(formula).replace(/@([\w.]+)/g, (match, path) => {
            const value = path.split(".").reduce((acc, key) => acc?.[key], data);
            return value === undefined || value === null || value === "" ? "0" : String(value);
        });
    }

    evaluateSync() {
        this.total = Function(`"use strict"; return (${this.formula});`)();
        return this;
    }
}

/**
 * Un acteur qui porte SES caractéristiques et SA maîtrise, en plus de ses armes.
 *
 * Complète `actorWith` des fixtures partagées, dont l'acteur n'a délibérément
 * pas de caractéristiques : les substitutions de formule les lisent sur
 * `game.user.character`, là où `HitProfile` les lit sur l'acteur qu'on lui passe
 * — c'est même la garde d'architecture du module.
 *
 * @param {object} [options] - Les caractéristiques, la maîtrise et les armes.
 *
 * @returns {object} L'acteur simulé.
 */
function actorWithStats({abilities = {}, prof = 0, items = []} = {}) {
    return {
        ...actorWith(...items),
        system: {
            abilities: Object.fromEntries(
                Object.entries(abilities).map(([key, mod]) => [key, {mod}])),
            attributes: {prof}
        }
    };
}

/**
 * Une cible minimale : classe d'armure et sauvegardes.
 *
 * @param {object} [system] - Le `system` de l'acteur ciblé.
 *
 * @returns {object} Le jeton simulé.
 */
function makeTarget(system) {
    return {actor: {system}};
}

describe("HitProfile.of", () => {

    beforeEach(() => {
        globalThis.Roll = DataRoll;
    });

    afterEach(() => {
        globalThis.Roll = realRoll;
        vi.restoreAllMocks();
    });

    it("aucun jet pour toucher : profil nul", () => {
        const actor = actorWithStats({abilities: {str: 3}, prof: 2});
        expect(HitProfile.of(actor, {})).toBeNull();
        expect(HitProfile.of(actor, {hitType: ""})).toBeNull();
        expect(HitProfile.of(actor, {hitType: "autre chose"})).toBeNull();
    });

    it("acteur absent : profil nul, sans exception", () => {
        expect(HitProfile.of(null, {hitType: "attack", hitSource: "ability", hitAbility: "str"}))
            .toBeNull();
    });

    it("source caractéristique : modificateur = caractéristique + maîtrise", () => {
        const actor = actorWithStats({abilities: {str: 3, int: 5}, prof: 2});

        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "ability", hitAbility: "str"}))
            .toMatchObject({type: "attack", modifier: 5, ability: "str", dc: null});
        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "ability", hitAbility: "int"}))
            .toMatchObject({modifier: 7});
    });

    it("maîtrise absente ou caractéristique inconnue : comptées pour zéro", () => {
        const sansProf = actorWithStats({abilities: {str: 4}});
        expect(HitProfile.of(sansProf, {hitType: "attack", hitSource: "ability", hitAbility: "str"}))
            .toMatchObject({modifier: 4});

        const sansCarac = actorWithStats({prof: 3});
        expect(HitProfile.of(sansCarac, {hitType: "attack", hitSource: "ability", hitAbility: "dex"}))
            .toMatchObject({modifier: 3});
    });

    it("bonus de carte ajouté au modificateur, négatif compris", () => {
        const actor = actorWithStats({abilities: {str: 3}, prof: 2});
        const choice = {hitType: "attack", hitSource: "ability", hitAbility: "str"};

        expect(HitProfile.of(actor, {...choice, hitBonus: 2})).toMatchObject({modifier: 7});
        expect(HitProfile.of(actor, {...choice, hitBonus: "-3"})).toMatchObject({modifier: 2});
        expect(HitProfile.of(actor, {...choice, hitBonus: ""})).toMatchObject({modifier: 5});
    });

    it("source arme : modificateur issu de la donnée d'attaque de dnd5e", () => {
        // Ce que rend `getAttackData` : le modificateur, la maîtrise, le bonus
        // magique de l'arme et le bonus d'acteur, avec leurs valeurs.
        const actor = actorWithStats({
            items: [makeWeapon("martialM", makeAttackActivity({
                parts: ["@mod", "@prof", "@weaponMagic"],
                data: {mod: 4, prof: 3, weaponMagic: 1}
            }))]
        });

        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "@wpnM"}))
            .toMatchObject({source: "@wpnM", ability: null, modifier: 8});
    });

    it("arme non maîtrisée : la maîtrise est simplement absente de la formule", () => {
        // dnd5e laisse `prof` vide quand l'arme n'est pas maîtrisée — perte du
        // bonus, et surtout AUCUN désavantage : c'est la règle D&D.
        const actor = actorWithStats({
            items: [makeWeapon("simpleM", makeAttackActivity({parts: ["@mod", ""], data: {mod: 4}}))]
        });

        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "@wpnM"}))
            .toMatchObject({modifier: 4});
    });

    it("aucune arme équipée du type : modificateur nul", () => {
        const actor = actorWithStats({items: []});
        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "@wpnR"}))
            .toMatchObject({modifier: 0});
    });

    it("arme sans activité d'attaque : modificateur nul (l'activité de dégâts ne convient pas)", () => {
        const actor = actorWithStats({
            items: [makeWeapon("simpleM",
                makeAttackActivity({parts: ["@mod"], data: {mod: 4}}), "Arme", "damage")]
        });
        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "@wpnM"}))
            .toMatchObject({modifier: 0});
    });

    it("donnée d'attaque qui lève : modificateur nul, aucune exception propagée", () => {
        const actor = actorWithStats({
            items: [makeWeapon("simpleM", makeAttackActivity(null, new Error("dnd5e refuse")))]
        });
        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "@wpnM"}))
            .toMatchObject({modifier: 0});
    });

    it("sauvegarde : DD = 8 + modificateur", () => {
        const actor = actorWithStats({abilities: {wis: 4}, prof: 3});
        const profile = HitProfile.of(actor, {
            hitType: "save", hitSource: "ability", hitAbility: "wis", saveAbility: "dex"
        });

        expect(profile).toMatchObject({type: "save", modifier: 7, dc: 15, saveAbility: "dex"});
    });

    it("sauvegarde : un DD explicite l'emporte sur le calcul", () => {
        const actor = actorWithStats({abilities: {wis: 4}, prof: 3});
        const profile = HitProfile.of(actor, {
            hitType: "save", hitSource: "ability", hitAbility: "wis", saveAbility: "con", saveDc: "12"
        });

        expect(profile).toMatchObject({dc: 12, modifier: 7});
    });

    it("attaque : aucun DD, aucune caractéristique de sauvegarde", () => {
        const actor = actorWithStats({abilities: {str: 1}, prof: 2});
        const profile = HitProfile.of(actor, {
            hitType: "attack", hitSource: "ability", hitAbility: "str", saveAbility: "dex"
        });

        expect(profile.dc).toBeNull();
        expect(profile.saveAbility).toBeNull();
    });

    it("configuration incomplète : profil nul plutôt qu'un modificateur deviné", () => {
        const actor = actorWithStats({abilities: {str: 3}, prof: 2});
        vi.spyOn(console, "warn").mockImplementation(() => {
        });

        expect(HitProfile.of(actor, {hitType: "attack"})).toBeNull();
        expect(HitProfile.of(actor, {hitType: "attack", hitSource: "ability"})).toBeNull();
        expect(HitProfile.of(actor, {hitType: "save", hitSource: "ability", hitAbility: "wis"}))
            .toBeNull();
        expect(console.warn).toHaveBeenCalledTimes(3);
    });
});

describe("HitProfile.ofActivity", () => {

    beforeEach(() => {
        globalThis.Roll = DataRoll;
    });

    afterEach(() => {
        globalThis.Roll = realRoll;
        vi.restoreAllMocks();
    });

    it("activité d'attaque : le modificateur vient de sa donnée d'attaque", () => {
        const activity = makeAttackActivity({parts: ["@mod", "@prof"], data: {mod: 4, prof: 3}});

        expect(HitProfile.ofActivity(activity)).toMatchObject({
            type: "attack", modifier: 7, dc: null, saveAbility: null, defensesOnSuccess: 1
        });
    });

    it("activité de sauvegarde : le DD déjà calculé par dnd5e et la caractéristique visée", () => {
        const activity = {
            type: "save",
            save: {ability: new Set(["dex"]), dc: {value: 15}},
            damage: {onSave: "half"}
        };

        expect(HitProfile.ofActivity(activity)).toMatchObject({
            type: "save", dc: 15, saveAbility: "dex", defensesOnSuccess: 1
        });
    });

    it("une sauvegarde qui annule les dégâts vaut DEUX crans de défense", () => {
        const activity = {
            type: "save",
            save: {ability: new Set(["con"]), dc: {value: 13}},
            damage: {onSave: "none"}
        };

        expect(HitProfile.ofActivity(activity).defensesOnSuccess).toBe(2);
    });

    it("une sauvegarde qui ne réduit rien ne vaut AUCUN cran", () => {
        const activity = {
            type: "save",
            save: {ability: new Set(["wis"]), dc: {value: 13}},
            damage: {onSave: "full"}
        };

        expect(HitProfile.ofActivity(activity).defensesOnSuccess).toBe(0);
    });

    it("plusieurs sauvegardes au choix : la première est retenue", () => {
        const activity = {
            type: "save",
            save: {ability: new Set(["str", "dex"]), dc: {value: 14}},
            damage: {onSave: "half"}
        };

        expect(HitProfile.ofActivity(activity).saveAbility).toBe("str");
    });

    it("activité sans jet pour toucher, ou mal configurée : aucun profil", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {
        });

        expect(HitProfile.ofActivity({type: "damage"})).toBeNull();
        expect(HitProfile.ofActivity({type: "heal"})).toBeNull();
        expect(HitProfile.ofActivity(null)).toBeNull();
        expect(HitProfile.ofActivity({type: "save", save: {ability: new Set(), dc: {value: 12}}}))
            .toBeNull();
    });
});

describe("HitProfile.defenseOf", () => {

    it("attaque : la classe d'armure de la cible", () => {
        const target = makeTarget({attributes: {ac: {value: 16}}, abilities: {dex: {save: {value: 5}}}});
        expect(HitProfile.defenseOf(target, {type: "attack"})).toEqual({value: 16, kind: "ac"});
    });

    it("sauvegarde : le modificateur de sauvegarde de la caractéristique visée", () => {
        const target = makeTarget({
            attributes: {ac: {value: 16}},
            abilities: {dex: {save: {value: 5}}, con: {save: {value: 2}}}
        });

        expect(HitProfile.defenseOf(target, {type: "save", saveAbility: "dex"}))
            .toEqual({value: 5, kind: "save"});
        expect(HitProfile.defenseOf(target, {type: "save", saveAbility: "con"}))
            .toEqual({value: 2, kind: "save"});
    });

    it("cible ou valeur absente : aucune défense", () => {
        const target = makeTarget({attributes: {ac: {value: 16}}, abilities: {}});

        expect(HitProfile.defenseOf(null, {type: "attack"})).toBeNull();
        expect(HitProfile.defenseOf({}, {type: "attack"})).toBeNull();
        expect(HitProfile.defenseOf(target, null)).toBeNull();
        expect(HitProfile.defenseOf(target, {type: "save", saveAbility: "dex"})).toBeNull();
    });
});

describe("HitProfile.missingWeaponWarningKey", () => {

    it("arme du type équipée : aucun avertissement", () => {
        const actor = actorWithStats({items: [makeWeapon("martialM", makeAttackActivity({parts: [], data: {}}))]});
        expect(HitProfile.missingWeaponWarningKey({hitType: "attack", hitSource: "@wpnM"}, actor))
            .toBeNull();
    });

    it("aucune arme du type : la clé d'avertissement du jeton", () => {
        const actor = actorWithStats({items: [makeWeapon("martialM", makeAttackActivity({parts: [], data: {}}))]});
        expect(HitProfile.missingWeaponWarningKey({hitType: "attack", hitSource: "@wpnR"}, actor))
            .toBe("FQCARDENGINE.WarningMsgNoRangedWeapon");
    });

    it("modificateur de caractéristique ou choix sans jet : aucune contrainte d'arme", () => {
        const actor = actorWithStats({items: []});
        expect(HitProfile.missingWeaponWarningKey(
            {hitType: "attack", hitSource: "ability", hitAbility: "str"}, actor)).toBeNull();
        expect(HitProfile.missingWeaponWarningKey({hitSource: "@wpnM"}, actor)).toBeNull();
    });
});

describe("Non-régression du corpus", () => {

    it("un choix des cartes existantes ne déclare aucun jet et rend un profil nul", () => {
        // Choix réel (Poing droit, moine) : aucun des champs de toucher.
        const choice = {
            action: "-3", zeal: "1", targetType: "Default", minReach: "1", maxReach: "1",
            damage: "(2 + ceil(@str/3))[bludgeoning]", bonusCrit: "", bonusEva: ""
        };
        const actor = actorWithStats({abilities: {str: 3}, prof: 2});

        expect(HitProfile.of(actor, choice)).toBeNull();
        expect(HitProfile.missingWeaponWarningKey(choice, actor)).toBeNull();
    });
});
