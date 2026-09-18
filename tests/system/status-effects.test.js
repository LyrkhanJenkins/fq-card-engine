import {afterEach, describe, expect, test} from "vitest";
import fs from "fs";
import path from "path";
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

    test("hantise : marque de combo distincte de la malédiction, sans dégât ni durée", () => {
        const [haunt] = StatusEffects.expand("haunt");
        expect(haunt.name).toBe("Haunt");
        expect(haunt.duration.value).toBe("");
        expect(haunt.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(false);
        // Les deux marques coexistent : un comptage par nom ne doit jamais
        // confondre une hantise avec une malédiction, sans quoi les cartes de
        // conversion et les seuils de la spécialisation deviennent faux.
        expect(haunt.name).not.toBe(StatusEffects.expand("curse")[0].name);
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

describe("StatusEffects — conditions dnd5e", () => {

    const CONDITIONS = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated",
        "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];

    afterEach(() => {
        delete globalThis.CONFIG.statusEffects;
    });

    test("les 14 conditions du PHB sont proposées au menu, avec leur libellé FQ, et SANS l'épuisement", () => {
        for (const id of CONDITIONS) {
            expect(StatusEffects.STATUS_CHOICES[id]).toMatch(/^FQCARDENGINE\.Condition/);
            expect(StatusEffects.isCondition(id)).toBe(true);
            expect(StatusEffects.isStatusKey(id)).toBe(true);
        }
        expect(StatusEffects.isCondition("exhaustion")).toBe(false);
        expect(StatusEffects.STATUS_CHOICES.exhaustion).toBeUndefined();
    });

    test("les statuts FQ ne sont pas des conditions, et aucune clé ne se chevauche", () => {
        for (const key of ["poison", "acid", "burn", "frost", "curse", "virus", "earth", "air"]) {
            expect(StatusEffects.isCondition(key)).toBe(false);
        }
        expect(CONDITIONS.some(id => ["poison", "burn", "curse"].includes(id))).toBe(false);
        expect(StatusEffects.isCondition("toString")).toBe(false);
        expect(StatusEffects.isCondition(undefined)).toBe(false);
    });

    test("les statuts FQ restent en tête du menu, les conditions viennent après", () => {
        const keys = Object.keys(StatusEffects.STATUS_CHOICES);
        expect(keys.indexOf("air")).toBeLessThan(keys.indexOf("blinded"));
        expect(keys[0]).toBe("");
    });

    test("expand d'une condition : un seul effet, porteur de son statut, sans changement ni durée", () => {
        const effects = StatusEffects.expand("prone");

        expect(effects).toHaveLength(1);
        expect(effects[0]).toEqual(expect.objectContaining({
            statuses: ["prone"], changes: [], expireOnDamage: false, showIcon: 1
        }));
        // Durée vide : illimitée, retirée par la purge de fin de combat.
        expect(effects[0].duration).toEqual({value: "", units: "rounds"});
    });

    test("sans configuration de statut (hors Foundry) : l'identifiant sert de nom, une icône par défaut", () => {
        const [effect] = StatusEffects.expand("blinded");

        expect(effect.name).toBe("blinded");
        expect(effect.img).toBe("icons/svg/aura.svg");
    });

    test("le nom et l'icône viennent de CONFIG.statusEffects, comme le reste de Foundry les montre", () => {
        globalThis.CONFIG.statusEffects = [
            {id: "blinded", name: "Blinded", img: "systems/dnd5e/icons/svg/statuses/blinded.svg"}
        ];

        const [effect] = StatusEffects.expand("blinded");

        expect(effect.name).toBe("Blinded");
        expect(effect.img).toBe("systems/dnd5e/icons/svg/statuses/blinded.svg");
    });

    test("CONFIG.statusEffects indexé par identifiant, comme dnd5e le range, est lu de la même façon", () => {
        globalThis.CONFIG.statusEffects = {
            paralyzed: {id: "paralyzed", name: "Paralyzed", img: "p.svg", riders: ["incapacitated"]}
        };

        const [effect] = StatusEffects.expand("paralyzed");

        expect(effect.name).toBe("Paralyzed");
        expect(effect.statuses).toEqual(["paralyzed", "incapacitated"]);
    });

    test("les conditions induites entrent dans le MÊME effet : paralysé porte aussi neutralisé", () => {
        globalThis.CONFIG.statusEffects = [
            {id: "paralyzed", name: "Paralyzed", img: "p.svg", riders: ["incapacitated"]}
        ];

        expect(StatusEffects.expand("paralyzed")[0].statuses).toEqual(["paralyzed", "incapacitated"]);
    });

    test("une condition induite déjà présente n'est pas dupliquée", () => {
        globalThis.CONFIG.statusEffects = [{id: "stunned", riders: ["stunned", "incapacitated"]}];

        expect(StatusEffects.expand("stunned")[0].statuses).toEqual(["stunned", "incapacitated"]);
    });

    test("chaque appel rend un objet neuf", () => {
        const first = StatusEffects.expand("prone");
        first[0].statuses.push("hacked");

        expect(StatusEffects.expand("prone")[0].statuses).toEqual(["prone"]);
    });
});

describe("StatusEffects — « En élan » et « Garde brisée »", () => {

    test("« En élan » : son porteur attaque avec avantage, jusqu'à SON prochain jet d'attaque", () => {
        const [effect] = StatusEffects.expand("empowered");

        expect(effect.statuses).toEqual(["fqEmpowered"]);
        expect(effect.expireOnAttack).toBe("made");
        expect(effect.changes).toEqual([]);
        expect(effect.name).toBe("Empowered");
    });

    test("« Garde brisée » : on attaque son porteur avec avantage, jusqu'au prochain jet qui le vise", () => {
        const [effect] = StatusEffects.expand("exposed");

        expect(effect.statuses).toEqual(["fqExposed"]);
        expect(effect.expireOnAttack).toBe("received");
        expect(effect.name).toBe("Broken Guard");
    });

    test("les deux sont proposés au menu, après les statuts FQ et avant les conditions", () => {
        const keys = Object.keys(StatusEffects.STATUS_CHOICES);

        expect(StatusEffects.STATUS_CHOICES.empowered).toBe("FQCARDENGINE.StatusEmpowered");
        expect(StatusEffects.STATUS_CHOICES.exposed).toBe("FQCARDENGINE.StatusExposed");
        expect(keys.indexOf("air")).toBeLessThan(keys.indexOf("empowered"));
        expect(keys.indexOf("exposed")).toBeLessThan(keys.indexOf("blinded"));
    });

    test("aucun autre statut du registre ne se consomme à l'attaque", () => {
        for (const key of ["poison", "acid", "burn", "frost", "curse", "virus", "earth", "air", "warded", "shaken"]) {
            expect(StatusEffects.expand(key).every(effect => effect.expireOnAttack === undefined)).toBe(true);
        }
    });
});

describe("StatusEffects — « Sous égide » et « Ébranlé »", () => {

    test("« Sous égide » : on attaque son porteur avec désavantage, pendant toute sa durée", () => {
        const [effect] = StatusEffects.expand("warded", {duration: {value: "1", units: "rounds"}});

        expect(effect.statuses).toEqual(["fqWarded"]);
        expect(effect.expireOnAttack).toBeUndefined();
        expect(effect.expireOnSave).toBeUndefined();
        expect(effect.duration).toEqual({value: "1", units: "rounds"});
    });

    test("« Ébranlé » : son porteur sauvegarde avec désavantage, jusqu'à SA prochaine sauvegarde", () => {
        const [effect] = StatusEffects.expand("shaken", {duration: {value: "3", units: "rounds"}});

        expect(effect.statuses).toEqual(["fqShaken"]);
        expect(effect.expireOnSave).toBe(true);
        expect(effect.duration).toEqual({value: "3", units: "rounds"});
    });

    test("seul « Ébranlé » se consomme à la sauvegarde", () => {
        const others = Object.keys(StatusEffects.STATUS_CHOICES).filter(key => key !== "" && key !== "shaken");
        for (const key of others) {
            expect(StatusEffects.expand(key).every(effect => effect.expireOnSave === undefined), key).toBe(true);
        }
    });

    test("les deux sont proposés au menu, avant les conditions", () => {
        const keys = Object.keys(StatusEffects.STATUS_CHOICES);

        expect(StatusEffects.STATUS_CHOICES.warded).toBe("FQCARDENGINE.StatusWarded");
        expect(StatusEffects.STATUS_CHOICES.shaken).toBe("FQCARDENGINE.StatusShaken");
        expect(keys.indexOf("shaken")).toBeLessThan(keys.indexOf("blinded"));
    });
});

describe("StatusEffects — durée réglée par la carte", () => {

    test("réglés par la carte : les 14 conditions et les statuts FQ d'avantage", () => {
        for (const key of ["prone", "paralyzed", "unconscious", "empowered", "exposed", "warded", "shaken"]) {
            expect(StatusEffects.isTimedByCard(key)).toBe(true);
        }
    });

    test("fixés par le registre : les 9 statuts FQ, dont la durée fait partie de l'équilibre", () => {
        expect(StatusEffects.fixedDurationKeys().sort())
            .toEqual(["acid", "air", "burn", "curse", "earth", "frost", "haunt", "poison", "virus"]);
        expect(StatusEffects.isTimedByCard("burn")).toBe(false);
        expect(StatusEffects.isTimedByCard("")).toBe(false);
    });

    test("une condition prend la durée saisie sur la carte", () => {
        const [effect] = StatusEffects.expand("prone", {duration: {value: "2", units: "rounds"}});

        expect(effect.duration).toEqual({value: "2", units: "rounds"});
    });

    test("une durée vide garde celle du registre : illimitée, jusqu'à la purge de fin de combat", () => {
        const [effect] = StatusEffects.expand("prone", {duration: {value: "", units: "rounds"}});

        expect(effect.duration).toEqual({value: "", units: "rounds"});
    });

    test("des unités absentes valent des rounds", () => {
        expect(StatusEffects.expand("prone", {duration: {value: "1"}})[0].duration)
            .toEqual({value: "1", units: "rounds"});
    });

    test("le retrait sur dégâts saisi sur la carte est repris (réveil d'un endormi)", () => {
        const [effect] = StatusEffects.expand("unconscious", {duration: {value: "1"}, expireOnDamage: true});

        expect(effect.expireOnDamage).toBe(true);
    });

    test("« Garde brisée » garde sa consommation à l'attaque même avec une durée de sûreté", () => {
        const [effect] = StatusEffects.expand("exposed", {duration: {value: "2", units: "rounds"}});

        expect(effect.duration).toEqual({value: "2", units: "rounds"});
        expect(effect.expireOnAttack).toBe("received");
    });

    test("un statut FQ ignore la durée de la carte : le registre fait foi", () => {
        const [burn] = StatusEffects.expand("burn", {duration: {value: "9", units: "rounds"}, expireOnDamage: true});

        expect(burn.duration.value).toBe("3");
        expect(burn.expireOnDamage).toBe(false);
    });

    test("sans donnée de carte, rien ne change", () => {
        expect(StatusEffects.expand("prone")[0].duration).toEqual({value: "", units: "rounds"});
    });
});

describe("StatusEffects — ce que fait chaque statut", () => {

    const lang = file => JSON.parse(fs.readFileSync(path.join(process.cwd(), "lang", file), "utf8"));
    const FR = lang("fr.json");
    const EN = lang("en.json");
    const TIMED = Object.keys(StatusEffects.STATUS_CHOICES).filter(key => StatusEffects.isTimedByCard(key));

    afterEach(() => {
        delete globalThis.CONFIG.statusEffects;
    });

    test("chaque statut réglé par la carte dit ce qu'il fait ; les statuts FQ, eux, gardent leurs messages de carte", () => {
        expect(TIMED).toHaveLength(18);
        for (const key of TIMED) {
            expect(StatusEffects.ruleKey(key), key).toMatch(/^FQCARDENGINE\.Rule/);
        }
        for (const key of StatusEffects.fixedDurationKeys()) {
            expect(StatusEffects.ruleKey(key), key).toBeNull();
        }
        expect(StatusEffects.ruleKey("")).toBeNull();
        expect(StatusEffects.ruleKey("toString")).toBeNull();
    });

    test("chaque phrase et les deux gabarits de message existent en français ET en anglais", () => {
        const keys = [...TIMED.map(key => StatusEffects.ruleKey(key)),
            "FQCARDENGINE.CardMsgConditionApplied", "FQCARDENGINE.CardMsgConditionAppliedFor"];
        for (const key of keys) {
            expect(FR[key], `${key} (fr)`).toBeTruthy();
            expect(EN[key], `${key} (en)`).toBeTruthy();
        }
    });

    test("la description d'une condition porte ce qu'elle fait, sans règle officielle hors de dnd5e", () => {
        const [effect] = StatusEffects.expand("prone");

        expect(effect.description).toMatch(/^<p>.+<\/p>$/);
        expect(effect.description).not.toContain("@Embed");
    });

    test("avec dnd5e, la règle officielle est intégrée APRÈS, comme dnd5e le fait lui-même", () => {
        globalThis.CONFIG.statusEffects = [{id: "prone", name: "Prone", reference: "Compendium.dnd5e.content24.X"}];

        const [effect] = StatusEffects.expand("prone");

        expect(effect.description).toMatch(/^<p>.+<\/p>@Embed\[Compendium\.dnd5e\.content24\.X inline]$/);
    });

    test("« En élan » et « Garde brisée » portent aussi leur description", () => {
        expect(StatusEffects.expand("empowered")[0].description).toMatch(/^<p>.+<\/p>$/);
        expect(StatusEffects.expand("exposed")[0].description).toMatch(/^<p>.+<\/p>$/);
    });

    test("un statut FQ n'en reçoit aucune : sa carte parle pour lui", () => {
        expect(StatusEffects.expand("burn")[0].description).toBeUndefined();
    });
});
