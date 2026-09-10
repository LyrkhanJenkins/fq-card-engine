import {beforeAll, describe, expect, it, vi} from "vitest";

// ─── Caractérisation du modèle de carte + verrou v14 EffectChangeData ─────────
//
// `tests/setup.js` mocke `foundry.data.fields` en passthrough : chaque DataField
// (StringField, NumberField, SchemaField, ArrayField, ...) renvoie simplement son
// 1er argument étalé (`{...opts}`). Conséquence notable pour la navigation :
// - `new SchemaField({a, b})` renvoie directement `{a, b}` (pas de wrapper `.fields`).
// - `new ArrayField(elementSchema, options)` ignore le 2e argument (label) et
//   étale le 1er (l'élément), donc `new ArrayField(new SchemaField({x, y}))`
//   renvoie directement `{x, y}` — c'est ce qui permet de descendre
//   `effects.data.changes` sans jamais désindexer un tableau.
// - `initial` est parfois une FONCTION (`class`, `targetType`, `changes.type`)
//   qu'il faut appeler, et parfois une VALEUR (`changes.priority.initial`).
//
// Ce fichier CARACTÉRISE le schéma existant tel qu'il est lu dans
// `card-fq-system.mjs` : aucune modification de `src/`.
//
// Déviation locale à ce fichier (aucune modification de tests/setup.js) : sous
// Vitest 4, `vi.fn().mockImplementation(opts => ({...opts}))` — l'implémentation
// fléchée utilisée par `mockField` dans tests/setup.js — n'est plus utilisable
// avec `new` ("TypeError: ... is not a constructor"), alors que `defineSchema()`
// et consorts appellent `new StringField(...)`, `new SchemaField(...)`, etc. Ce
// module n'était jamais exercé par les 93 tests existants (aucun n'appelle
// `defineSchema()`), la régression était donc invisible jusqu'ici. On ne peut ni
// modifier `tests/setup.js` (hors périmètre du plan), ni `src/` (caractérisation
// seule) : ce fichier repatch localement `foundry.data.fields` avec des
// équivalents *constructibles* (même comportement passthrough, `function` au
// lieu d'arrow) juste avant d'importer dynamiquement `CardFqSystem`, en suivant
// le précédent déjà établi par `tests/window/play-card.test.js` qui surcharge
// localement `global.CONFIG`. Vitest isole chaque fichier de test (`isolate:
// true` par défaut) : ce repatch ne fuit pas vers les autres suites.
let CardFqSystem;

beforeAll(async () => {
    for (const key of Object.keys(foundry.data.fields)) {
        foundry.data.fields[key] = vi.fn().mockImplementation(function (opts = {}) {
            return {...opts};
        });
    }
    ({default: CardFqSystem} = await import("../../src/domain/system/cards/card-fq-system.mjs"));
});

describe("CardFqSystem.defineSchema", () => {

    it("expose les champs fq de premier niveau (maxSameCard/class/level/isInnate/choices)", () => {
        const fq = CardFqSystem.defineSchema().fq;

        expect(fq).toHaveProperty("maxSameCard");
        expect(fq).toHaveProperty("class");
        expect(fq).toHaveProperty("level");
        expect(fq).toHaveProperty("isInnate");
        expect(fq).toHaveProperty("choices");
    });

    it("a pour classe par défaut 'neutral'", () => {
        expect(CardFqSystem.defineSchema().fq.class.initial()).toBe("neutral");
    });

    it("liste les 10 classes de CLASS_CHOICE comme choix possibles", () => {
        expect(CardFqSystem.defineSchema().fq.class.choices).toEqual(CardFqSystem.CLASS_CHOICE);
        expect(CardFqSystem.defineSchema().fq.class.choices).toEqual({
            "neutral": "neutral",
            "elementalist": "elementalist",
            "fencing-master": "fencing-master",
            "guardian": "guardian",
            "illusionist": "illusionist",
            "monk": "monk",
            "runic-warrior": "runic-warrior",
            "trapper": "trapper",
            "white-mage": "white-mage",
            "witch": "witch",
        });
    });
});

describe("CardFqSystem v14 EffectChangeData (MODEL-02)", () => {

    // Navigation : getApplyEffectsFormulaSchema().effects.data.changes
    // (effects, data et changes sont chacun un ArrayField dont le mock étale
    // l'élément SchemaField, d'où la descente directe sans indexation de tableau)
    function getChangesSchema() {
        return CardFqSystem.getApplyEffectsFormulaSchema().effects.data.changes;
    }

    it("expose les champs key/value du changement d'effet", () => {
        const changes = getChangesSchema();

        expect(changes).toHaveProperty("key");
        expect(changes).toHaveProperty("value");
    });

    it("a pour type par défaut 'add'", () => {
        expect(getChangesSchema().type.initial()).toBe("add");
    });

    it("verrouille les choix de type sur CHANGE_TYPE_CHOICES (dérivé de CONST.ACTIVE_EFFECT_CHANGE_TYPES)", () => {
        const changes = getChangesSchema();

        expect(changes.type.choices).toEqual(CardFqSystem.CHANGE_TYPE_CHOICES);
        expect(changes.type.choices).toEqual({
            custom: "custom",
            multiply: "multiply",
            add: "add",
            downgrade: "downgrade",
            upgrade: "upgrade",
            override: "override",
            subtract: "subtract",
        });
    });

    it("verrouille priority en nullable avec un défaut null (v14)", () => {
        const changes = getChangesSchema();

        expect(changes.priority.nullable).toBe(true);
        expect(changes.priority.initial).toBeNull();
    });

    it("ne contient plus le champ 'mode' de v13", () => {
        expect(getChangesSchema()).not.toHaveProperty("mode");
    });
});

describe("CardFqSystem.getChoiceSchema", () => {

    it("a pour targetType par défaut 'Default'", () => {
        expect(CardFqSystem.getChoiceSchema().targetType.initial()).toBe("Default");
    });

    it("verrouille les choix de targetType sur TARGET_TYPE_CHOICE (valeurs = clés i18n des libellés)", () => {
        expect(CardFqSystem.getChoiceSchema().targetType.choices).toEqual(CardFqSystem.TARGET_TYPE_CHOICE);
        expect(CardFqSystem.getChoiceSchema().targetType.choices).toEqual({
            "Default": "FQCARDENGINE.TargetTypeDefault",
            "Skeletons": "FQCARDENGINE.TargetTypeSkeletons",
            "Zone": "FQCARDENGINE.TargetTypeZone",
            "Adjacent": "FQCARDENGINE.TargetTypeAdjacent",
            "CombatEnemies": "FQCARDENGINE.TargetTypeCombatEnemies",
            "CombatAllies": "FQCARDENGINE.TargetTypeCombatAllies",
        });
    });

    it("expose les champs de zone (forme, taille, angle, largeur) avec cercle par défaut", () => {
        const choice = CardFqSystem.getChoiceSchema();
        expect(choice.zoneShape.initial()).toBe("circle");
        expect(choice.zoneShape.choices).toEqual(CardFqSystem.ZONE_SHAPE_CHOICE);
        expect(Object.keys(choice)).toEqual(expect.arrayContaining(["zoneShape", "zoneSize", "zoneAngle", "zoneWidth"]));
    });

    it("expose les champs de coûts, ciblage, dégâts/soins, options avancées et rejeu", () => {
        const choice = CardFqSystem.getChoiceSchema();

        expect(Object.keys(choice)).toEqual(expect.arrayContaining([
            "name",
            "action", "mana", "zeal", "reactive",
            "hp", "draw", "drop",
            "targetType", "minReach", "maxReach", "nbTargets",
            "damage", "magical", "heal", "bonusCrit", "bonusEva",
            "xmin", "xmax", "ymin", "ymax", "xvalue", "yvalue",
            "applyEffectsFormulas", "messages", "minions",
            "replayable", "sound", "visual",
            "customEvals",
        ]));
    });

    it("expose la structure du visuel (path/onTarget)", () => {
        const choice = CardFqSystem.getChoiceSchema();

        expect(choice.visual).toHaveProperty("path");
        expect(choice.visual).toHaveProperty("onTarget");
    });
});

describe("CardFqSystem durée v14 (value/units)", () => {

    // Navigation : getApplyEffectsFormulaSchema().effects.data.duration
    function getDurationSchema() {
        return CardFqSystem.getApplyEffectsFormulaSchema().effects.data.duration;
    }

    it("expose value/units et n'a plus startTime/rounds/turns", () => {
        const duration = getDurationSchema();

        expect(duration).toHaveProperty("value");
        expect(duration).toHaveProperty("units");
        expect(duration).not.toHaveProperty("startTime");
        expect(duration).not.toHaveProperty("rounds");
        expect(duration).not.toHaveProperty("turns");
    });

    it("a pour unité par défaut 'rounds' et verrouille les choix sur DURATION_UNITS_CHOICES", () => {
        const duration = getDurationSchema();

        expect(duration.units.initial()).toBe("rounds");
        expect(duration.units.choices).toEqual(CardFqSystem.DURATION_UNITS_CHOICES);
        expect(duration.units.choices).toEqual({
            rounds: "FQCARDENGINE.DurationUnitRounds",
            turns: "FQCARDENGINE.DurationUnitTurns",
        });
    });
});

describe("CardFqSystem données d'effet alignées v14 (name/img/showIcon)", () => {

    function getDataSchema() {
        return CardFqSystem.getApplyEffectsFormulaSchema().effects.data;
    }

    it("expose name/img/showIcon et n'a plus label/icon/showOnToken", () => {
        const data = getDataSchema();

        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("img");
        expect(data).toHaveProperty("showIcon");
        expect(data).not.toHaveProperty("label");
        expect(data).not.toHaveProperty("icon");
        expect(data).not.toHaveProperty("showOnToken");
    });

    it("showIcon : défaut 1 (Conditional, aligné Foundry) et choix verrouillés sur SHOW_ICON_CHOICES", () => {
        const data = getDataSchema();

        expect(data.showIcon.initial).toBe(1);
        expect(data.showIcon.choices).toEqual(CardFqSystem.SHOW_ICON_CHOICES);
        expect(data.showIcon.choices).toEqual({
            0: "FQCARDENGINE.ShowIconNever",
            1: "FQCARDENGINE.ShowIconConditional",
            2: "FQCARDENGINE.ShowIconAlways",
        });
    });
});

describe("CardFqSystem.getMessageSchema", () => {

    it("expose les champs key/arg d'un message localisable", () => {
        const msg = CardFqSystem.getMessageSchema();

        expect(msg).toHaveProperty("key");
        expect(msg).toHaveProperty("arg");
    });
});
