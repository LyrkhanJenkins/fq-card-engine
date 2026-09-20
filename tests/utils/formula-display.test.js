import {beforeEach, describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import FormulaDisplay, {ABILITY_EMOJIS, FORMULA_FIELDS, WEAPON_EMOJIS} from "../../src/domain/interface/card-svg/formula-display.js";
import DisplayCard from "../../src/domain/interface/card-svg/display-card.js";
import {expandPills, PILL_SOURCE, sanitizePillInput, stripPills} from "../../src/domain/interface/card-svg/formula-pill.js";
import {
    actorWith, makeActivity, makeReferenceActor, makeWeapon, NEUTRAL_ABILITIES, REFERENCE_ABILITIES
} from "./formula-fixtures.js";

describe("FormulaDisplay — constantes exportées", () => {
    it("expose les tables d'emojis et la liste des champs de formule repliés", () => {
        expect(ABILITY_EMOJIS).toEqual({
            str: "💪", dex: "🎯", con: "❤️", int: "🧠", wis: "🦉", cha: "✨️"
        });
        expect(WEAPON_EMOJIS).toEqual({"@wpnM": "⚔️", "@wpnR": "🏹"});
        expect(FORMULA_FIELDS).toEqual(["damage", "heal", "hp"]);
    });
});

describe("FormulaDisplay.foldSegment — cas nominaux (tracer)", () => {
    it("fusionne des constantes autour d'un dé unique", () => {
        expect(FormulaDisplay.foldSegment("1+2+1+1d6")).toBe("1d6+4");
    });

    it("ordonne les dés de tailles différentes avant la constante", () => {
        expect(FormulaDisplay.foldSegment("1d8 + 3 + 2 + 1d4")).toBe("1d8+1d4+5");
    });

    it("replie les multiplications de constantes", () => {
        expect(FormulaDisplay.foldSegment("2*2")).toBe("4");
        expect(FormulaDisplay.foldSegment("(2 * 3) + 1d6 + 1")).toBe("1d6+7");
        expect(FormulaDisplay.foldSegment("2*X + 3*2")).toBe("6+2X");
    });
});

describe("FormulaDisplay — la frappe runique de bout en bout (tracer principal du plan 20-01)", () => {
    /**
     * Prouve la chaîne complète sur la formule la plus complexe du corpus :
     * substitution → arbre à repli local → nœud opaque (division) → pastilles
     * → échappement HTML → expansion. `(ceil((@wpnM + @int)/2))[slashing]`
     * doit s'afficher `(1d8+4)÷2` accompagnée de ses pastilles ⚔️ 🧠 🔪
     * (arme `1d8`, mod exclu ; 🧠+4).
     */
    let actor;

    beforeEach(() => {
        actor = makeReferenceActor();
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
    });

    it("foldFormula replie la frappe runique en formule nue (1d8+4)÷2", () => {
        expect(FormulaDisplay.foldFormula("(ceil((@wpnM + @int)/2))[slashing]", {actor})).toBe("(1d8+4)÷2");
    });

    it("foldFormula : ceil purement numérique disparaît, division évaluée (2 + ceil(@str/3))[bludgeoning] -> 3", () => {
        expect(FormulaDisplay.foldFormula("(2 + ceil(@str/3))[bludgeoning]", {actor})).toBe("3");
    });

    it("foldFormula : (1+ ceil(@str/2) + 1d4)[bludgeoning] -> 1d4+3", () => {
        expect(FormulaDisplay.foldFormula("(1+ ceil(@str/2) + 1d4)[bludgeoning]", {actor})).toBe("1d4+3");
    });

    it("foldFormula : ceil(XXX/2) -> X÷2, la division opaque ne wrappe pas un enfant à un seul terme", () => {
        expect(FormulaDisplay.foldFormula("ceil(XXX/2)", {actor})).toBe("X÷2");
    });

    it("foldFormula replie désormais un dé à taille calculée (D-07, plan 20-03) : 1d(2*@str) avec 💪+3 rend 1d6", () => {
        expect(FormulaDisplay.foldFormula("1d(2*@str)", {actor})).toBe("1d6");
        expect(() => FormulaDisplay.forDisplay("1d(2*@str)", {actor})).not.toThrow();
    });

    it("forDisplay + wrapEmojiTooltips : la pastille de source Intelligence porte le tooltip chiffré exact", () => {
        const html = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("(ceil((@wpnM + @int)/2))[slashing]", {actor})
        );
        expect(html).toContain(
            "<span class=\"fq-formula-pill fq-formula-pill--src\" data-tooltip=\"FQCARDENGINE.SourceAbilityInt (+4)\">🧠</span>"
        );
    });

    it("forDisplay + wrapEmojiTooltips : la pastille de source Arme porte le nom et la formule de l'arme équipée", () => {
        const html = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("(ceil((@wpnM + @int)/2))[slashing]", {actor})
        );
        expect(html).toContain("FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8)");
    });

    it("forDisplay + wrapEmojiTooltips : exactement une pastille de type, portant l'emoji 🔪", () => {
        const html = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("(ceil((@wpnM + @int)/2))[slashing]", {actor})
        );
        expect((html.match(/fq-formula-pill--type/g) ?? []).length).toBe(1);
        expect(html).toContain("🔪");
    });

    it("stripPills(forDisplay(...)) ne contient plus aucun caractère sentinelle", () => {
        const result = FormulaDisplay.forDisplay("(ceil((@wpnM + @int)/2))[slashing]", {actor});
        const visible = stripPills(result);
        // eslint-disable-next-line no-control-regex
        expect(visible).not.toMatch(/[]/);
        expect(visible).toBe("(1d8+4)÷2 ⚔️🧠🔪");
    });

    it("getDescriptionSizeForCardSvg renvoie la même taille avec ou sans les pastilles de cette formule", () => {
        const result = FormulaDisplay.forDisplay("(ceil((@wpnM + @int)/2))[slashing]", {actor});
        expect(DisplayCard.getDescriptionSizeForCardSvg(result))
            .toBe(DisplayCard.getDescriptionSizeForCardSvg(stripPills(result)));
    });

    it("le même chemin, joué via le vrai DisplayCard.getDescriptionFromCard, produit (1d8+4)÷2 dans le SVG final", () => {
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
        // getDescriptionFromCard résout l'arme équipée via Constants.actorCurrent
        // (le personnage courant), pas via un acteur passé explicitement : on
        // pose donc l'arme sur le personnage courant plutôt que sur `actor`.
        game.user.character.items = [makeWeapon("martialM", makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]), "Épée longue")];
        const card = {
            face: 0,
            faces: {0: {text: "FQCARDDESCRIPTION.Frappe {0_damage}"}},
            system: {fq: {choices: [{damage: "(ceil((@wpnM + @int)/2))[slashing]"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        // Le mock de `game.i18n.format` (tests/setup.js) ne fait pas une vraie
        // interpolation `{0_damage}` — il concatène le gabarit et un
        // JSON.stringify des arguments. On vérifie donc la valeur EXACTE
        // transmise en argument, au niveau où `FormulaDisplay.forDisplay` a
        // produit ses marqueurs de pastille, plutôt que le texte final agrégé.
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        const rawWithMarkers = calledArgs["0_damage"];
        expect(rawWithMarkers).toContain("(1d8+4)÷2");
        const html = DisplayCard.wrapEmojiTooltips(rawWithMarkers);
        expect(html).toContain("fq-formula-pill--type");
    });

    it("un nom d'arme contenant une tentative d'injection ressort échappé, jamais exécutable (T-20-03)", () => {
        const maliciousActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const maliciousActor = actorWith(makeWeapon("martialM", maliciousActivity, "<img src=x onerror=alert(1)>"));
        const html = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("(@wpnM)[slashing]", maliciousActor)
        );
        expect(html).toContain("&lt;img");
        expect(html).not.toContain("<img");
    });
});

describe("FormulaDisplay — dés : taille calculée, taille symbolique, nombre symbolique (Task 1, D-07/D-08/D-09)", () => {
    let actor;

    beforeEach(() => {
        actor = makeReferenceActor();
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
    });

    it.each([
        ["taille calculée + dé d'arme : deux dés numériques, taille décroissante",
            "(@wpnM + 1d(2*@str))[slashing]", "1d8+1d6"],
        ["taille calculée seule", "@int+1d(2*@wis)[fire]", "1d6+4"],
        ["taille calculée seule (autre caractéristique)", "@con+1d(2*@wis)", "1d6+1"],
        ["compte symbolique + taille calculée", "2*XXX+1d(3*@dex)", "1d6+2X"],
        ["taille de dé = un seul jeton, pas un produit", "((2*XXX)+1d(@wis))[force]", "1d3+2X"],
        ["compte symbolique + taille calculée (coefficient 3)", "((3*XXX)+1d(2*@wis))[force]", "1d6+3X"],
        ["nombre de dés symbolique en tête d'expression", "@dex+@wis+@int+XXXd6[force]", "Xd6+9"],
        ["nombre de dés symbolique, dé en tête de segment", "(XXXd8 + @int)[lightning]", "Xd8+4"],
        ["taille de dé symbolique (nombre de faces)", "@wis+2dXXX[piercing]", "2dX+3"],
        ["nombre de dés symbolique, constante nulle omise", "(XXX*@wis +XXXd6)[bludgeoning]", "Xd6+3X"],
        ["dé symbolique EN TÊTE devant les variables (D-09)",
            "((2*@dex+3*YYY)+1d(2*XXX))[psychic]", "1d2X+4+3Y"],
    ])("%s : foldFormula(%j) === %j", (_label, input, expected) => {
        expect(FormulaDisplay.foldFormula(input, {actor})).toBe(expected);
    });

    it("taille de dé nulle : 1d(2*@str) avec 💪+0 rend 1d0", () => {
        game.user.character.system.abilities = {...REFERENCE_ABILITIES, str: {mod: 0}};
        expect(FormulaDisplay.foldFormula("1d(2*@str)", {actor})).toBe("1d0");
    });

    it("taille de dé négative : 1d(2*@str) avec 💪-1 rend 1d0 (ramenée à 0, jamais masquée)", () => {
        game.user.character.system.abilities = {...REFERENCE_ABILITIES, str: {mod: -1}};
        expect(FormulaDisplay.foldFormula("1d(2*@str)", {actor})).toBe("1d0");
    });

    it("soustraction de dés refusée même avec un compte/taille symbolique local au nœud (D-10)", () => {
        expect(() => FormulaDisplay.foldFormula("2d6-1d6", {actor})).toThrow();
    });

    it("tokenize(\"XXXd6\") produit trois jetons : XXX, le jeton de dé, 6 — jamais XXXd + 6", () => {
        const tokens = FormulaDisplay.tokenize("XXXd6");
        expect(tokens).toHaveLength(3);
        expect(tokens[0]).toBe("XXX");
        expect(tokens[1]).toBe("d");
        expect(tokens[2]).toBe("6");
    });
});

describe("FormulaDisplay — fonctions : arrondis transparents et plafonds (Task 2, D-05/D-06)", () => {
    let actor;

    beforeEach(() => {
        actor = makeReferenceActor();
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
    });

    it("ceil purement numérique s'évalue et disparaît : (2 + ceil(@str/3))[bludgeoning] avec 💪+3 rend 3", () => {
        expect(FormulaDisplay.foldFormula("(2 + ceil(@str/3))[bludgeoning]", {actor})).toBe("3");
    });

    it("ceil purement numérique à côté d'un dé : (1+ ceil(@str/2) + 1d4)[bludgeoning] rend 1d4+3", () => {
        expect(FormulaDisplay.foldFormula("(1+ ceil(@str/2) + 1d4)[bludgeoning]", {actor})).toBe("1d4+3");
    });

    it("ceil enveloppant un dé : seule la division opaque subsiste, (1d8+4)÷2", () => {
        expect(FormulaDisplay.foldFormula("(ceil((@wpnM + @int)/2))[slashing]", {actor})).toBe("(1d8+4)÷2");
    });

    it("ceil enveloppant un numérateur à un seul terme : pas de parenthèses, X÷2", () => {
        expect(FormulaDisplay.foldFormula("ceil(XXX/2)", {actor})).toBe("X÷2");
    });

    it("trunc se comporte comme ceil en transparence (numérique évalué, non numérique inchangé)", () => {
        expect(FormulaDisplay.foldFormula("trunc(7/2)", {actor})).toBe("3");
        expect(FormulaDisplay.foldFormula("trunc(XXX/2)", {actor})).toBe("X÷2");
    });

    it("min/max entièrement numériques s'évaluent et disparaissent", () => {
        expect(FormulaDisplay.foldFormula("min(5,3)", {actor})).toBe("3");
        expect(FormulaDisplay.foldFormula("max(5,3)", {actor})).toBe("5");
    });

    it("plafond min avec opérande symbolique : le libellé est INVERSÉ (min borne par le haut, libellé max)", () => {
        // Convention projet : clé i18n dans la donnée, localisation en ligne
        // via game.i18n.localize — le mock de test (tests/setup.js) est une
        // identité, la clé apparaît donc non traduite ici (même convention
        // que les tooltips de source, voir FormulaDisplay.collectSourceDetails).
        const result = FormulaDisplay.foldFormula("min(5,3+XXX)", {actor});
        expect(result).toBe("3+X (FQCARDENGINE.FormulaCapMax 5)");
    });

    it("plafond max avec opérande symbolique : le libellé est INVERSÉ (max borne par le bas, libellé min)", () => {
        const result = FormulaDisplay.foldFormula("max(2,XXX)", {actor});
        expect(result).toBe("X (FQCARDENGINE.FormulaCapMin 2)");
    });

    it("plafond porté par un coefficient scalaire : @int*(min(5,XXX)) avec 🧠+4 multiplie le coefficient de l'atome, pas le plafond", () => {
        const result = FormulaDisplay.foldFormula("@int*(min(5,XXX))", {actor});
        expect(result).toBe("4×X (FQCARDENGINE.FormulaCapMax 5)");
    });
});

describe("FormulaDisplay — variables X/Y — substitution par valeur (D-02, Task 1)", () => {
    let actor;

    beforeEach(() => {
        actor = makeReferenceActor();
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
    });

    it("X fourni : @int*(min(5,XXX)) avec 🧠+4 et X=7 rend 20 (min devient purement numérique)", () => {
        expect(FormulaDisplay.foldFormula("@int*(min(5,XXX))", {actor, xValue: 7})).toBe("20");
    });

    it("X fourni : @dex+@wis+@int+XXXd6[force] avec X=3 rend 3d6+9 (dé numérique, plus symbolique)", () => {
        expect(FormulaDisplay.foldFormula("@dex+@wis+@int+XXXd6[force]", {actor, xValue: 3})).toBe("3d6+9");
    });

    it("X fourni : @wis+2dXXX[piercing] avec X=4 rend 2d4+3", () => {
        expect(FormulaDisplay.foldFormula("@wis+2dXXX[piercing]", {actor, xValue: 4})).toBe("2d4+3");
    });

    it("X fourni : ceil(XXX/2) avec X=5 rend 3 (division numérique puis arrondi supérieur)", () => {
        expect(FormulaDisplay.foldFormula("ceil(XXX/2)", {actor, xValue: 5})).toBe("3");
    });

    it("X et Y fournis : ((2*@dex+3*YYY)+1d(2*XXX))[psychic] avec X=3 et Y=2 rend 1d6+10", () => {
        expect(FormulaDisplay.foldFormula("((2*@dex+3*YYY)+1d(2*XXX))[psychic]", {actor, xValue: 3, yValue: 2})).toBe("1d6+10");
    });

    it("la même formule SANS xValue ni yValue reste symbolique : 1d2X+4+3Y", () => {
        expect(FormulaDisplay.foldFormula("((2*@dex+3*YYY)+1d(2*XXX))[psychic]", {actor})).toBe("1d2X+4+3Y");
    });

    it.each([
        ["chaîne vide", ""],
        ["null", null],
        ["undefined", undefined],
        ["NaN", NaN],
    ])("xValue absent (%s) ne déclenche aucune substitution : XXX reste X", (_label, badValue) => {
        expect(FormulaDisplay.foldFormula("XXX", {actor, xValue: badValue})).toBe("X");
    });

    it("xValue = 0 déclenche la substitution (0 est une valeur finie, pas une absence)", () => {
        expect(FormulaDisplay.foldFormula("XXX", {actor, xValue: 0})).toBe("0");
        expect(FormulaDisplay.foldFormula("XXX", {actor})).toBe("X");
    });

    it("xValue négatif déclenche la substitution, le résultat reste algébriquement correct", () => {
        expect(FormulaDisplay.foldFormula("2*XXX", {actor, xValue: -2})).toBe("-4");
    });

    it("xValue fourni et yValue absent substitue X seul, laisse Y symbolique", () => {
        expect(FormulaDisplay.foldFormula("XXX+YYY", {actor, xValue: 5})).toBe("5+Y");
    });

    it("forDisplay honore aussi xValue/yValue (pas seulement foldFormula)", () => {
        expect(stripPills(FormulaDisplay.forDisplay("XXX", {actor, xValue: 7}))).toBe("7");
    });
});

describe("FormulaDisplay — sans personnage assigné (D-15, Task 2)", () => {
    beforeEach(() => {
        game.user.character = {items: [], system: {abilities: {}}};
    });

    it("ne lève pas : @int+1d(2*@wis)[fire] se replie en formule symbolique portant les deux caractéristiques", () => {
        expect(() => FormulaDisplay.foldFormula("@int+1d(2*@wis)[fire]", {})).not.toThrow();
        const result = FormulaDisplay.foldFormula("@int+1d(2*@wis)[fire]", {});
        expect(result).toContain("🧠");
        expect(result).toContain("🦉");
    });

    it("ne contient jamais la chaîne undefined (bug undefined(🧠) corrigé)", () => {
        const result = FormulaDisplay.forDisplay("@int+1d(2*@wis)[fire]", actorWith());
        expect(stripPills(result)).not.toContain("undefined");
    });

    it("ne se replie jamais en 1d0 : aucun modificateur absent n'est remplacé par une valeur numérique", () => {
        expect(FormulaDisplay.foldFormula("@int+1d(2*@wis)[fire]", {})).not.toBe("1d0");
    });

    it("sans personnage assigné ET sans arme équipée, le jeton d'arme résout 0 et sa pastille reste présente", () => {
        const result = FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actorWith());
        expect(stripPills(result)).toBe("💪 ⚔️🔪");
        expect(result).toContain("FQCARDENGINE.SourceWeaponNone");
    });

    it("collectSourceDetails exclut une caractéristique non résolue du groupe de pastilles de source (D-15)", () => {
        expect(FormulaDisplay.collectSourceDetails("@int", actorWith())).toEqual([]);
    });

    it("avec un personnage assigné, le comportement reste strictement inchangé (non-régression)", () => {
        game.user.character = {items: [], system: {abilities: {...REFERENCE_ABILITIES}}};
        expect(FormulaDisplay.foldFormula("@int+1d(2*@wis)[fire]", {})).toBe("1d6+4");
    });
});

describe("FormulaDisplay.substituteWeaponTokens", () => {
    it("substitue @wpnM par la formule d'arme sans ajouter de parenthèses", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        expect(FormulaDisplay.substituteWeaponTokens("(@wpnM + 1d4)", actor)).toBe("(1d8 + 1d4)");
    });

    it("laisse la chaîne inchangée quand aucun jeton d'arme n'est présent", () => {
        expect(FormulaDisplay.substituteWeaponTokens("1d6+2", actorWith())).toBe("1d6+2");
    });

    it("une formule d'arme portant @abilities.<abr>.mod est dépouillée de ses modificateurs puis repliée (substitution avant repli)", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod", "@abilities.str.mod"], data: {mod: 3, abilities: {str: {mod: 3}}}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        expect(FormulaDisplay.substituteWeaponTokens("(@wpnM + 1d4)", actor)).toBe("(1d8 + 1d4)");
        expect(FormulaDisplay.foldFormula("(@wpnM + 1d4)[slashing]", {actor})).toBe("1d8+1d4");
        expect(stripPills(FormulaDisplay.forDisplay("(@wpnM + 1d4)[slashing]", actor))).toBe("1d8+1d4 ⚔️🔪");
    });
});

describe("FormulaDisplay.collectSources", () => {
    it("liste les icônes d'arme puis de caractéristique, dans l'ordre canonique", () => {
        expect(FormulaDisplay.collectSources("(@wpnM + @str + 1d4)[slashing]")).toEqual(["⚔️", "💪"]);
    });

    it("ne renvoie rien pour une chaîne sans jeton de source", () => {
        expect(FormulaDisplay.collectSources("1d6+2")).toEqual([]);
    });
});

describe("FormulaDisplay.collectSourceDetails", () => {
    beforeEach(() => {
        game.user.character = {items: [], system: {abilities: {...NEUTRAL_ABILITIES, int: {mod: 4}}}};
    });

    it("détaille la source d'arme avec le nom et la formule de l'arme équipée", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialM", activity, "Épée longue"));
        expect(FormulaDisplay.collectSourceDetails("@wpnM", actor)).toEqual([
            {emoji: "⚔️", tooltip: "FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8)"}
        ]);
    });

    it("détaille la source d'arme avec le tooltip « aucune arme équipée » sans arme correspondante", () => {
        expect(FormulaDisplay.collectSourceDetails("@wpnM", actorWith())).toEqual([
            {emoji: "⚔️", tooltip: "FQCARDENGINE.SourceWeaponNone"}
        ]);
    });

    it("détaille la source de caractéristique avec le modificateur signé", () => {
        expect(FormulaDisplay.collectSourceDetails("@int", actorWith())).toEqual([
            {emoji: "🧠", tooltip: "FQCARDENGINE.SourceAbilityInt (+4)"}
        ]);
    });

    it("signe explicitement un modificateur négatif ou nul", () => {
        game.user.character.system.abilities = {...NEUTRAL_ABILITIES, str: {mod: -1}, dex: {mod: 0}};
        expect(FormulaDisplay.collectSourceDetails("@str", actorWith())).toEqual([
            {emoji: "💪", tooltip: "FQCARDENGINE.SourceAbilityStr (-1)"}
        ]);
        expect(FormulaDisplay.collectSourceDetails("@dex", actorWith())).toEqual([
            {emoji: "🎯", tooltip: "FQCARDENGINE.SourceAbilityDex (+0)"}
        ]);
    });

    it("aucune entrée pour un bonus nommé (D-12)", () => {
        expect(FormulaDisplay.collectSourceDetails("@bonus.serenityRune", actorWith())).toEqual([]);
    });

    it("renvoie un tableau vide pour une valeur non-chaîne", () => {
        expect(FormulaDisplay.collectSourceDetails(undefined, actorWith())).toEqual([]);
    });
});

describe("FormulaDisplay.splitDamageSegments", () => {
    it("découpe en segments {expr, type} sur les jetons de type de dégâts", () => {
        const segments = FormulaDisplay.splitDamageSegments("(1+1d4)[thunder]+(2+1d4)[cold]");
        expect(segments).toHaveLength(2);
        expect(segments[0]).toEqual({expr: "(1+1d4)", type: "[thunder]"});
        expect(segments[1]).toEqual({expr: "(2+1d4)", type: "[cold]"});
    });

    it("renvoie un unique segment de type null pour une chaîne sans jeton de type", () => {
        expect(FormulaDisplay.splitDamageSegments("1+2")).toEqual([{expr: "1+2", type: null}]);
    });
});

describe("FormulaDisplay.forDisplay — contrat « ne lève jamais »", () => {
    it("renvoie les valeurs non-string ou vides inchangées", () => {
        expect(FormulaDisplay.forDisplay("")).toBe("");
        expect(FormulaDisplay.forDisplay(null)).toBe(null);
        expect(FormulaDisplay.forDisplay(undefined)).toBe(undefined);
        expect(FormulaDisplay.forDisplay(42)).toBe(42);
    });

    it("D-15 : sans caractéristique résolue, ceil(@str/2) se replie désormais en atome symbolique 💪÷2, au lieu de retomber en fallback (@str/ceil intacts, comportement pré-plan 04)", () => {
        const result = FormulaDisplay.forDisplay("(1+ ceil(@str/2) + 1d4)[bludgeoning]");
        expect(result).not.toContain("@str");
        expect(result).not.toContain("ceil");
        expect(stripPills(result)).toBe("1d4+1+💪÷2 ⚒️");
    });

    it("D-15 : substitue quand même les jetons d'arme, et replie désormais @str non résolu en variable symbolique 💪 (au lieu de retomber en fallback)", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        const result = FormulaDisplay.forDisplay("(@wpnM + 1d(2*@str))[slashing]", actor);
        expect(result).not.toContain("@wpnM");
        expect(result).not.toContain("@str");
        expect(stripPills(result)).toBe("1d8+1d2💪 ⚔️🔪");
    });
});

describe("FormulaDisplay.forDisplay — balayage du corpus réel (7 decks pattern fq8)", () => {
    const decksDir = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");

    function collectFieldValues() {
        const files = fs.readdirSync(decksDir).filter(f => f.endsWith(".json"));
        const values = [];
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(decksDir, file), "utf-8"));
            for (const card of data.cards ?? []) {
                for (const choice of card.system?.fq?.choices ?? []) {
                    for (const field of FORMULA_FIELDS) {
                        if (choice[field] !== undefined) {
                            values.push(choice[field]);
                        }
                    }
                }
            }
        }
        return values;
    }

    function runSweep(actor) {
        const values = collectFieldValues();
        expect(values.length).toBeGreaterThanOrEqual(150);
        for (const value of values) {
            let result;
            expect(() => {
                result = FormulaDisplay.forDisplay(value, actor);
            }).not.toThrow();
            const str = stripPills((result ?? "").toString());
            expect(str).not.toContain("NaN");
            expect(str).not.toContain("undefined");
            expect(str).not.toContain("@wpnM");
            expect(str).not.toContain("@wpnR");
            // Tout champ non vide en entrée doit produire une sortie non vide
            // (repliée ou en fallback) : le repli d'affichage ne doit jamais
            // faire disparaître silencieusement une formule renseignée.
            if (typeof value === "string" && value.trim() !== "") {
                expect(str.trim()).not.toBe("");
            }
        }
    }

    beforeEach(() => {
        game.user.character.system.abilities = {...NEUTRAL_ABILITIES};
    });

    it("aucune valeur damage/heal/hp ne lève, avec un acteur portant une arme de mêlée et une arme à distance", () => {
        const meleeActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const rangedActivity = makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]);
        const actor = actorWith(makeWeapon("martialM", meleeActivity), makeWeapon("martialR", rangedActivity));
        runSweep(actor);
    });

    it("aucune valeur damage/heal/hp ne lève, sans aucune arme équipée", () => {
        runSweep(actorWith());
    });
});

describe("FormulaDisplay.foldSegment — repli nominal", () => {
    it("fusionne les dés de même taille et ordonne dés puis constante", () => {
        expect(FormulaDisplay.foldSegment("1+2+1+1d6+2d6")).toBe("3d6+4");
    });

    it("ne fusionne pas les dés de tailles différentes, la plus grande d'abord", () => {
        expect(FormulaDisplay.foldSegment("1d8+1d4")).toBe("1d8+1d4");
    });

    it("trie par taille décroissante indépendamment de l'ordre d'écriture", () => {
        expect(FormulaDisplay.foldSegment("1d4+1d8")).toBe("1d8+1d4");
    });

    it("ordonne dés, puis constante, puis variable symbolique", () => {
        expect(FormulaDisplay.foldSegment("3d6+7-X")).toBe("3d6+7-X");
    });

    it("omet la constante nulle quand un dé est déjà rendu", () => {
        expect(FormulaDisplay.foldSegment("1d6")).toBe("1d6");
    });

    it("rend « 0 » pour une expression sans contenu résiduel", () => {
        expect(FormulaDisplay.foldSegment("0")).toBe("0");
        expect(FormulaDisplay.foldSegment("X-X")).toBe("0");
    });

    it("replie une constante négative telle quelle", () => {
        expect(FormulaDisplay.foldSegment("- (6-0)")).toBe("-6");
    });

    it("supprime un coefficient de variable nul", () => {
        expect(FormulaDisplay.foldSegment("1d10+((1-1)*X)")).toBe("1d10");
    });

    it("replie une multiplication de constantes avant de fusionner avec un dé", () => {
        expect(FormulaDisplay.foldSegment("(2 * 1)+1d6+1")).toBe("1d6+3");
    });

    it("ordonne les variables X avant Y, ordre canonique déterministe", () => {
        expect(FormulaDisplay.foldSegment("2*X+3*Y")).toBe("2X+3Y");
    });
});

describe("FormulaDisplay.foldSegment — division et fonctions transparentes (D-03/D-05)", () => {
    it("évalue une division purement numérique", () => {
        expect(FormulaDisplay.foldSegment("4/2")).toBe("2");
    });

    it("division non purement numérique : atome opaque, l'enfant à un seul terme n'est pas parenthésé", () => {
        expect(FormulaDisplay.foldSegment("X/2")).toBe("X÷2");
    });

    it("division non purement numérique : l'enfant à plusieurs termes additifs est parenthésé", () => {
        expect(FormulaDisplay.foldSegment("(1d8+7)/2")).toBe("(1d8+7)÷2");
    });

    it("ceil/trunc/floor/round purement numériques s'évaluent et disparaissent", () => {
        expect(FormulaDisplay.foldSegment("ceil(1.2)")).toBe("2");
        expect(FormulaDisplay.foldSegment("trunc(1.8)")).toBe("1");
        expect(FormulaDisplay.foldSegment("floor(1.8)")).toBe("1");
        expect(FormulaDisplay.foldSegment("round(1.5)")).toBe("2");
    });

    it("ceil non purement numérique : transparent, seule la division opaque subsiste", () => {
        expect(FormulaDisplay.foldSegment("ceil(X/2)")).toBe("X÷2");
    });
});

describe("FormulaDisplay.foldSegment — garde-fous de fidélité", () => {
    it("lève si un jeton @ résiduel subsiste dans l'expression", () => {
        expect(() => FormulaDisplay.foldSegment("1+@prof")).toThrow();
    });

    it("replie désormais le « d » isolé d'une taille de dé calculée (D-07, peuplé par ce plan)", () => {
        expect(FormulaDisplay.foldSegment("1d(2*2)")).toBe("1d4");
    });

    it("replie désormais min/max, reformulés en plafond français (D-06, peuplé par ce plan)", () => {
        expect(FormulaDisplay.foldSegment("min(5,2)")).toBe("2");
        expect(FormulaDisplay.foldSegment("max(5,2)")).toBe("5");
    });

    it("replie désormais un dé multiplié par un scalaire en ATOME opaque (D-04, plan 20-05) : un dé multiplié ne rejoint jamais le bucket `dice` (fidélité au jet), mais n'a plus besoin de faire lever tout le segment — corpus réel (fencing-master-base.json > DoubleStrike : « (2 * (@wpnM))[slashing] »)", () => {
        expect(FormulaDisplay.foldSegment("2*1d6")).toBe("2×1d6");
    });

    it("replie désormais un nombre de dés variable (Xd6, D-08, peuplé par ce plan)", () => {
        expect(FormulaDisplay.foldSegment("Xd6")).toBe("Xd6");
    });

    it("lève quand des dés sont soustraits", () => {
        expect(() => FormulaDisplay.foldSegment("2d6-1d6")).toThrow();
    });

    it("replie désormais un dé sous signe négatif unaire (D-04, plan 20-05) : même chemin que le scalaire × dé, coefficient -1", () => {
        expect(FormulaDisplay.foldSegment("-1d6")).toBe("-1d6");
    });

    it("laisse toujours passer les variables autorisées X et Y", () => {
        expect(FormulaDisplay.foldSegment("X")).toBe("X");
        expect(FormulaDisplay.foldSegment("Y")).toBe("Y");
    });

    it("conserve l'erreur héritée du parseur d'origine (parenthèse fermante attendue)", () => {
        expect(() => FormulaDisplay.foldSegment("(1+2")).toThrow("Parenthèse fermante attendue");
    });

    it("replie désormais un produit de deux variables en ATOME opaque (D-04, plan 20-05) : plus jamais de throw sur ce motif — corpus réel avec caractéristique non résolue (D-15), ex. « @wis * @int » (VengefulShield/EmpatheticShield, white-mage-base.json)", () => {
        expect(FormulaDisplay.foldSegment("X*Y")).toBe("X×Y");
    });

    it("lève au-delà de 512 caractères (garde-fou DoS, T-20-04)", () => {
        expect(() => FormulaDisplay.foldSegment("1+".repeat(300) + "1")).toThrow();
    });

    it("lève au-delà de 64 niveaux d'imbrication de parenthèses (garde-fou DoS, T-20-04)", () => {
        const pathological = "(".repeat(80) + "1" + ")".repeat(80);
        expect(pathological.length).toBeLessThanOrEqual(512);
        expect(() => FormulaDisplay.foldSegment(pathological)).toThrow();
    });

    describe("passées à forDisplay, ces expressions toujours guardées ne lèvent pas non plus : elles produisent le fallback", () => {
        beforeEach(() => {
            game.user.character = {
                items: [],
                system: {abilities: {...NEUTRAL_ABILITIES, str: {mod: 2}, dex: {mod: 1}, int: {mod: 3}, wis: {mod: 1}}}
            };
        });

        // "min(5,2)", "1d(2*2)" et "Xd6" ont quitté cette liste : ce plan les
        // rend repliables (D-06/D-07/D-08), elles ne passent plus par le
        // fallback — voir les tests dédiés ci-dessus.
        const guardedExpressions = [
            "1+@prof", "2*1d6", "2d6-1d6", "-1d6"
        ];

        it.each(guardedExpressions)("forDisplay(\"%s\") ne lève pas", (expr) => {
            expect(() => FormulaDisplay.forDisplay(expr)).not.toThrow();
        });

        it("(1+ ceil(@str/2) + 1d4)[bludgeoning] se replie désormais (D-03/D-05, ne contient plus « ceil »)", () => {
            const result = FormulaDisplay.forDisplay("(1+ ceil(@str/2) + 1d4)[bludgeoning]");
            expect(result).not.toContain("ceil");
            expect(stripPills(result)).toBe("1d4+2 💪⚒️");
        });

        it("cas corpus complet : @dex+@wis+@int+XXXd6[force] ne lève pas (dé à nombre symbolique, plan 20-03)", () => {
            expect(() => FormulaDisplay.forDisplay("@dex+@wis+@int+XXXd6[force]")).not.toThrow();
        });
    });
});

describe("FormulaDisplay.foldFormula — assemblage multi-segments (nu, API de vérification du corpus)", () => {
    /**
     * Acteur canonique du plan 13-02/13-03 : str=+2, dex=+1, con=0, int=+3,
     * wis=+1, cha=+1 ; arme de mêlée martialM `1d8`, arme à distance
     * simpleR `1d6` (le `@mod` des activités est exclu des jetons d'arme).
     */
    const CANONICAL_ABILITIES = {
        str: {mod: 2}, dex: {mod: 1}, con: {mod: 0}, int: {mod: 3}, wis: {mod: 1}, cha: {mod: 1}
    };

    function makeCanonicalActor({melee = true, ranged = true, meleeHasActivity = true} = {}) {
        const items = [];
        if (melee) {
            const activity = meleeHasActivity ? makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]) : null;
            items.push(makeWeapon("martialM", activity));
        }
        if (ranged) {
            items.push(makeWeapon("simpleR", makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}])));
        }
        return actorWith(...items);
    }

    beforeEach(() => {
        game.user.character = {items: [], system: {abilities: {...CANONICAL_ABILITIES}}};
    });

    it.each([
        ["un seul groupe de type", "(@wpnR + (2 * @cha) + 1d6 - XXX)[bludgeoning]", "2d6+2-X"],
        ["arme de mêlée + caractéristique", "(@wpnM + @str)[slashing]", "1d8+2"],
        ["arme de mêlée seule", "(@wpnM)[slashing]", "1d8"],
        ["plusieurs groupes de type", "(1+@int+1d4)[thunder]+(1+@wis+1d4)[cold]", "1d4+4+1d4+2"],
        ["groupe sans jeton de modification", "(2*@int)[thunder]+2d8[fire]", "6+2d8"],
        ["un même jeton dans deux groupes", "(@str+1d4)[slashing]+(@str+1d6)[fire]", "1d4+2+1d6+2"],
        ["l'arme reste dans le groupe où son jeton est écrit", "(@wpnM+@str)[slashing]+(1+@wpnR)[piercing]", "1d8+2+1d6+1"],
        ["aucune parenthèse superflue sans source", "1+1d4[piercing]", "1d4+1"],
        ["formule purement constante avec un type", "2*@int[poison]", "6"],
        ["aucun jeton de type", "(2*@wis)+1d8", "1d8+2"],
        ["formule purement constante sans type", "@int", "3"],
        ["multiplication imbriquée repliée dans la constante", "(3*(@wis+@int) + 1d12)[force]", "1d12+12"],
    ])("%s : foldFormula(%j) === %j", (_label, input, expected) => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.foldFormula(input, {actor})).toBe(expected);
    });

    it("sans arme de mêlée équipée : contribution repliée à 0 (D-08)", () => {
        const actor = makeCanonicalActor({melee: false});
        expect(FormulaDisplay.foldFormula("(@wpnM + @str)[slashing]", {actor})).toBe("2");
    });

    it("arme de mêlée équipée sans activité : contribution 0 sans exception (D-08)", () => {
        const actor = makeCanonicalActor({ranged: false, meleeHasActivity: false});
        expect(() => FormulaDisplay.foldFormula("(@wpnM + @str)[slashing]", {actor})).not.toThrow();
        expect(FormulaDisplay.foldFormula("(@wpnM + @str)[slashing]", {actor})).toBe("2");
    });

    it("mêlée ET distance équipées simultanément : chaque jeton prend la formule de son type", () => {
        const actor = makeCanonicalActor();
        const result = FormulaDisplay.foldFormula("(@wpnM + @wpnR)[force]", {actor});
        expect(result).toContain("1d8");
        expect(result).toContain("1d6");
    });
});

describe("FormulaDisplay.forDisplay — pastilles visibles (stripPills)", () => {
    const CANONICAL_ABILITIES = {
        str: {mod: 2}, dex: {mod: 1}, con: {mod: 0}, int: {mod: 3}, wis: {mod: 1}, cha: {mod: 1}
    };

    function makeCanonicalActor() {
        const melee = makeWeapon("martialM", makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]), "Épée longue");
        const ranged = makeWeapon("simpleR", makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]), "Arc court");
        return actorWith(melee, ranged);
    }

    beforeEach(() => {
        game.user.character = {items: [], system: {abilities: {...CANONICAL_ABILITIES}}};
    });

    it("chaque groupe de type porte ses propres pastilles, dans l'ordre source puis type", () => {
        const actor = makeCanonicalActor();
        const visible = stripPills(FormulaDisplay.forDisplay("(1+@int+1d4)[thunder]+(1+@wis+1d4)[cold]", actor));
        expect(visible).toBe("1d4+4 🧠🌪️+1d4+2 🦉🧊");
    });

    it("aucune pastille de source quand aucun jeton de modification n'est présent, la pastille de type reste seule", () => {
        const actor = makeCanonicalActor();
        expect(stripPills(FormulaDisplay.forDisplay("1+1d4[piercing]", actor))).toBe("1d4+1 🔱");
    });

    it("formule sans aucun type : aucune pastille du tout", () => {
        const actor = makeCanonicalActor();
        expect(stripPills(FormulaDisplay.forDisplay("1d6+2", actor))).toBe("1d6+2");
    });

    it("sans arme de mêlée équipée : la pastille d'arme reste présente, avec le tooltip « aucune arme équipée »", () => {
        const result = FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actorWith());
        expect(stripPills(result)).toBe("2 ⚔️💪🔪");
        expect(result).toContain("FQCARDENGINE.SourceWeaponNone");
    });
});

describe("FormulaDisplay.collectSources — groupe d'indicateurs", () => {
    it("déduplique une caractéristique référencée deux fois en une seule icône", () => {
        expect(FormulaDisplay.collectSources("(@str + @str + 1d4)")).toEqual(["💪"]);
    });

    it("ordonne armes d'abord puis caractéristiques dans l'ordre canonique", () => {
        expect(FormulaDisplay.collectSources("(@wis + @str + @wpnR)")).toEqual(["🏹", "💪", "🦉"]);
    });

    it("renvoie un tableau vide pour une formule sans source de modification", () => {
        expect(FormulaDisplay.collectSources("1d6[piercing]")).toEqual([]);
    });

    it("l'icône apparaît même avec un modificateur nul (détection par présence du jeton, pas par signe)", () => {
        game.user.character = {items: [], system: {abilities: {...NEUTRAL_ABILITIES}}};
        expect(FormulaDisplay.collectSources("(@wpnM + @str)")).toEqual(["⚔️", "💪"]);
    });

    it("D-15 : sans @dex résolu, la formule se replie désormais au lieu de tomber en fallback ; la pastille d'arme (sans arme équipée) reste présente", () => {
        // Avant le plan 20-04, la substitution de @dex levait AVANT même
        // d'atteindre le moteur de dé (D-07/D-08 rendent repliable une taille
        // de dé calculée, mais la résolution de caractéristique restait un
        // préalable qui levait) : ce chemin retombait donc toujours sur le
        // fallback. Le plan 20-04 (D-15) fait de @dex une variable symbolique
        // repliable : la formule se replie normalement, @dex apparaît EN
        // LIGNE (🎯, exclu du groupe de pastilles de source — D-15), et la
        // pastille d'arme (résolution "0", aucune arme équipée) reste présente.
        game.user.character = {items: [], system: {abilities: {}}};
        const result = FormulaDisplay.forDisplay("(@wpnR + 1d(2*@dex))[piercing]");
        expect(stripPills(result)).toBe("1d2🎯 🏹🔱");
        expect(result).toContain("FQCARDENGINE.SourceWeaponNone");
    });

    describe("aucune sortie repliée du corpus ne contient le détail inline mod(emoji)", () => {
        const decksDir = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
        const abilityEmojiPattern = /\d\((💪|🎯|❤️|🧠|🦉|✨️)\)/;

        function collectFieldValues() {
            const files = fs.readdirSync(decksDir).filter(f => f.endsWith(".json"));
            const values = [];
            for (const file of files) {
                const data = JSON.parse(fs.readFileSync(path.join(decksDir, file), "utf-8"));
                for (const card of data.cards ?? []) {
                    for (const choice of card.system?.fq?.choices ?? []) {
                        for (const field of FORMULA_FIELDS) {
                            if (choice[field] !== undefined) {
                                values.push(choice[field]);
                            }
                        }
                    }
                }
            }
            return values;
        }

        beforeEach(() => {
            const meleeActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
            const rangedActivity = makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]);
            game.user.character = {
                items: [makeWeapon("martialM", meleeActivity), makeWeapon("simpleR", rangedActivity)],
                system: {
                    abilities: {
                        str: {mod: 2}, dex: {mod: 1}, con: {mod: 0}, int: {mod: 3}, wis: {mod: 1}, cha: {mod: 1}
                    }
                }
            };
        });

        it("ne contient jamais un chiffre suivi d'une parenthèse d'emoji de caractéristique, ni () vide, ni double espace (sur le texte visible)", () => {
            const values = collectFieldValues();
            expect(values.length).toBeGreaterThanOrEqual(150);
            for (const value of values) {
                const result = stripPills((FormulaDisplay.forDisplay(value) ?? "").toString());
                expect(result).not.toMatch(abilityEmojiPattern);
                expect(result).not.toContain("()");
                expect(result).not.toMatch(/ {2}/);
            }
        });
    });
});

/**
 * `foldSegment` a repris le contrat de l'analyseur propre aux bulles rondes
 * (`DisplayCard.simplifyExpression`, supprimé à la revue du 2026-09-20, constat
 * AUD-2026-09-20-04) : ces deux sorties sont celles que la bulle affichait, et
 * doivent le rester — c'est ce qui rend la suppression de son analyseur
 * invisible à la table. La troisième est celle que l'analyseur de la bulle ne
 * savait PAS produire (il lisait `1d6` comme un produit implicite).
 */
describe("FormulaDisplay.foldSegment — le contrat d'affichage repris des bulles rondes", () => {
    it("garde la constante en tête", () => {
        expect(FormulaDisplay.foldSegment("5 + 3 + 4*X")).toBe("8+4X");
    });

    it("replie une multiplication explicite constante*variable", () => {
        expect(FormulaDisplay.foldSegment("2*X")).toBe("2X");
    });

    it("replie fidèlement une expression avec dé", () => {
        expect(FormulaDisplay.foldSegment("1d6+4")).toBe("1d6+4");
    });
});

describe("FormulaDisplay — instantané du corpus (foldFormula, nu)", () => {
    /**
     * Acteur canonique du plan 13-02/13-03 : str=+2, dex=+1, con=0, int=+3,
     * wis=+1, cha=+1 ; arme de mêlée martialM `1d8`, arme à distance
     * simpleR `1d6` (mod exclu des jetons d'arme). Chaque paire ci-dessous
     * provient d'une valeur `damage`/`heal`/`hp` réelle de
     * `packs/_source/decks-pattern-fq8/`.
     */
    const CANONICAL_ABILITIES = {
        str: {mod: 2}, dex: {mod: 1}, con: {mod: 0}, int: {mod: 3}, wis: {mod: 1}, cha: {mod: 1}
    };

    let actor;

    beforeEach(() => {
        const meleeActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const rangedActivity = makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]);
        actor = actorWith(makeWeapon("martialM", meleeActivity), makeWeapon("simpleR", rangedActivity));
        game.user.character = {items: [], system: {abilities: {...CANONICAL_ABILITIES}}};
    });

    describe("formules repliables (foldFormula)", () => {
        it.each([
            ["arme de mêlée + caractéristique + dé (exemple canonique utilisateur)",
                "(@wpnM + @str + 1d4)[slashing]", "1d8+1d4+2"],
            ["arme de mêlée seule", "(@wpnM)[slashing]", "1d8"],
            ["arme à distance + caractéristique + dés multiples", "(@wpnR + @dex + 2d3)[force]", "1d6+2d3+1"],
            ["multi-groupes de type, un groupe d'emojis par groupe de dégâts",
                "(1+@int+1d4)[thunder]+(1+@wis+1d4)[cold]", "1d4+4+1d4+2"],
            ["multi-groupes de type, second groupe sans source de modification",
                "(2*@int)[thunder]+2d8[fire]", "6+2d8"],
            ["multi-groupes de type, sources différentes de part et d'autre",
                "(@int+1d10)[fire]+(4+@wis+1d4)[cold]", "1d10+3+1d4+5"],
            ["sans jeton de type (aucun crochet)", "(2*@wis)+1d8", "1d8+2"],
            ["variable X pure, sans source ni type", "(3*XXX)", "3X"],
            ["formule purement constante, sans type", "-5", "-5"],
            ["formule purement dés, avec type", "1d8[poison]", "1d8"],
            ["champ vide", "", ""],
            ["ceil purement numérique désormais repliable (D-03/D-05)", "(2 + ceil(@str/3))[bludgeoning]", "3"],
            // Les deux cas ci-dessous étaient figés sur le comportement de
            // repli global (fallback) avant ce plan — migrés ici avec leur
            // nouvelle sortie repliée (D-07/D-08), la table « formules non
            // repliables » historique de ce describe a disparu.
            ["dé à taille variable (nombre de dés en variable, D-08)", "@dex+@wis+@int+XXXd6[force]", "Xd6+5"],
            ["jeton d'arme présent et dé à taille calculée dans le reste (D-07)",
                "(@wpnM + 1d(2*@str))[slashing]", "1d8+1d4"],
        ])("%s : foldFormula(%j) === %j", (_label, input, expected) => {
            expect(FormulaDisplay.foldFormula(input, {actor})).toBe(expected);
        });
    });
});

describe("FormulaDisplay — table des cas durs (Task 3)", () => {
    /**
     * Table nommée figeant, formule par formule, les arêtes difficiles des
     * quatre familles peuplées par ce plan (dé, arrondi, plafond, division) —
     * sur `foldSegment` (déjà substitué, `X`/`Y` au lieu de `XXX`/`YYY`), pas
     * besoin d'acteur : chaque cas est autoportant.
     */
    it.each([
        ["taille de dé nulle (calculée)", "1d(2*0)", "1d0"],
        ["taille de dé négative (calculée, ramenée à 0)", "1d(-2)", "1d0"],
        ["taille de dé symbolique à un seul terme, sans parenthèses", "1d(2*X)", "1d2X"],
        ["taille de dé symbolique à PLUSIEURS termes, parenthésée (D-07)", "1d(X+2)", "1d(2+X)"],
        ["compte de dé symbolique, dé EN TÊTE d'expression", "Xd6+3", "Xd6+3"],
        ["compte de dé symbolique, dé écrit EN QUEUE mais rendu en tête (D-09)", "3+Xd6", "Xd6+3"],
        ["compte ET taille de dé symboliques", "Xd(2*Y)", "Xd2Y"],
        ["ceil purement numérique : s'évalue et disparaît (D-05)", "ceil(1.2)", "2"],
        ["ceil enveloppant un dé : transparent, seule la division opaque subsiste (D-05)",
            "ceil((1d8+7)/2)", "(1d8+7)÷2"],
        ["min entièrement numérique : s'évalue et disparaît (D-06)", "min(5,3)", "3"],
        ["min avec plafond : libellé INVERSÉ « max » (D-06)", "min(5,X)", "X (FQCARDENGINE.FormulaCapMax 5)"],
        ["max avec plancher : libellé INVERSÉ « min » (D-06)", "max(2,X)", "X (FQCARDENGINE.FormulaCapMin 2)"],
        ["division à numérateur multi-termes : parenthésée (D-05)", "(1d8+7)/2", "(1d8+7)÷2"],
        ["division à numérateur à un seul terme : sans parenthèses (D-05)", "X/2", "X÷2"],
        ["division purement numérique : s'évalue (D-03)", "10/4", "2.5"],
    ])("%s : foldSegment(%j) === %j", (_label, input, expected) => {
        expect(FormulaDisplay.foldSegment(input)).toBe(expected);
    });

    it("soustraction de dés toujours refusée, portée locale au nœud (D-10)", () => {
        expect(() => FormulaDisplay.foldSegment("2d6-1d6")).toThrow();
    });
});

describe("FormulaDisplay — balayage des 24 formules à risque du corpus (Task 3, critère de sortie 1)", () => {
    /**
     * Les quatre causes historiques de fallback (CONTEXT.md « faits vérifiés
     * sur disque ») : taille de dé calculée `1d(…)`, division/`ceil`/`trunc`,
     * nombre de dés variable, fonction `min`/`max`. Un filtre volontairement
     * large (division, virgule d'appel, arrondi, dé à taille/nombre
     * symbolique) — mieux vaut sur-inclure une formule déjà simple que
     * manquer une formule à risque et faire lever ce test dans le vide.
     */
    const RISKY_PATTERN = /[/,]|ceil\(|trunc\(|min\(|max\(|\dd\(|[A-Za-z]d\d|\dd[A-Za-z]/;
    const decksDir = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
    const spellsDir = path.join(process.cwd(), "packs", "_source", "spells-npc");

    function collectRiskyValues() {
        const values = [];
        for (const dir of [decksDir, spellsDir]) {
            if (!fs.existsSync(dir)) {
                continue;
            }
            for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
                const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
                for (const card of data.cards ?? []) {
                    for (const choice of card.system?.fq?.choices ?? []) {
                        for (const field of FORMULA_FIELDS) {
                            const v = choice[field];
                            if (typeof v === "string" && v.trim() !== "" && RISKY_PATTERN.test(v)) {
                                values.push(v);
                            }
                        }
                    }
                }
            }
        }
        return values;
    }

    beforeEach(() => {
        const meleeActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const rangedActivity = makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]);
        game.user.character = {
            items: [makeWeapon("martialM", meleeActivity), makeWeapon("simpleR", rangedActivity)],
            system: {abilities: {...REFERENCE_ABILITIES}}
        };
    });

    it("collecte au moins 24 formules à risque (sans quoi une régression du filtre rendrait ce test vert à vide)", () => {
        expect(collectRiskyValues().length).toBeGreaterThanOrEqual(24);
    });

    it("FormulaDisplay.foldFormula ne lève sur AUCUNE des formules à risque du corpus", () => {
        const actor = makeReferenceActor();
        const values = collectRiskyValues();
        for (const value of values) {
            expect(() => FormulaDisplay.foldFormula(value, {actor})).not.toThrow();
        }
    });

    it("aucune sortie repliée de ces formules ne contient « ceil » ni « trunc » (D-05)", () => {
        const actor = makeReferenceActor();
        const values = collectRiskyValues();
        for (const value of values) {
            const result = FormulaDisplay.foldFormula(value, {actor});
            expect(result).not.toContain("ceil");
            expect(result).not.toContain("trunc");
        }
    });
});

describe("FormulaDisplay — garde-fous d'injection (Task 3)", () => {
    beforeEach(() => {
        game.user.character = {items: [], system: {abilities: {...NEUTRAL_ABILITIES}}};
    });

    it("une valeur de champ contenant les trois caractères sentinelles ressort sans marqueur forgé, et ne produit aucune balise span supplémentaire", () => {
        const forged = `1d6type🔪FORGE+2`;
        const result = FormulaDisplay.forDisplay(forged, actorWith());
        // eslint-disable-next-line no-control-regex
        expect(result).not.toMatch(/[]/);
        const wrapped = DisplayCard.wrapEmojiTooltips(result);
        expect(wrapped).not.toContain("data-tooltip=\"FORGE\"");
    });

    it("expandPills avec un variant absent de {src, type} ne produit aucune balise", () => {
        const html = expandPills("abogus💪ttb", ["💪"], c => c);
        expect(html).not.toContain("fq-formula-pill");
        expect(html).toBe("a💪b");
    });

    it("expandPills avec un emoji hors liste blanche ne produit aucune balise (fail closed)", () => {
        const html = expandPills(`a${PILL_SOURCE}🧨ttb`, ["💪"], c => c);
        expect(html).not.toContain("fq-formula-pill");
        expect(html).toBe("a🧨b");
    });

    it("une formule contenant @bonus.serenityRune ne produit aucune pastille supplémentaire pour ce bonus (D-12)", () => {
        game.user.character.system.fq = {cardBonus: {serenityRune: 2}};
        const withoutBonus = FormulaDisplay.forDisplay("1d6+@str[fire]", actorWith());
        game.user.character.system.abilities = {...NEUTRAL_ABILITIES};
        const withBonus = FormulaDisplay.forDisplay("1d6+@str+@bonus.serenityRune[fire]", actorWith());
        // eslint-disable-next-line no-control-regex
        const countMarkers = s => (s.match(//g) ?? []).length;
        expect(countMarkers(withBonus)).toBe(countMarkers(withoutBonus));
    });

    it("une entrée de 600 caractères fait lever foldFormula mais forDisplay renvoie une chaîne (fallback)", () => {
        const pathological = "1+".repeat(300) + "1";
        expect(pathological.length).toBeGreaterThan(512);
        expect(() => FormulaDisplay.foldFormula(pathological, {actor: actorWith()})).toThrow();
        let result;
        expect(() => {
            result = FormulaDisplay.forDisplay(pathological, actorWith());
        }).not.toThrow();
        expect(typeof result).toBe("string");
    });
});

describe("FormulaDisplay — périmètres exclus (scope fence, Task 3)", () => {
    // La bulle ronde n'est PLUS hors périmètre : son analyseur propre est supprimé
    // et son repli symbolique passe par `foldFormula` (revue du 2026-09-20, constat
    // AUD-2026-09-20-04). Ce qui reste à elle, et que la phase 20 n'a jamais
    // touché, c'est sa lecture d'une valeur vide.
    it("la bulle ronde garde sa lecture d'une valeur vide", () => {
        expect(DisplayCard.getNumberForBubbleCardSvg("", {})).toBe("0");
    });

    it("formula-pill.js ne contient aucune ligne import (module sans dépendance)", () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, "../../src/domain/interface/card-svg/formula-pill.js"), "utf-8"
        );
        expect(source).not.toMatch(/^import /m);
    });

    it("formula-pill.js n'importe ni ne référence le pipeline moteur de résolution (RollService/WeaponDamage/CardEffect)", () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, "../../src/domain/interface/card-svg/formula-pill.js"), "utf-8"
        );
        expect(source).not.toMatch(/RollService|WeaponDamage|CardEffect/);
    });

    it("sanitizePillInput laisse une chaîne sans sentinelle inchangée (identité)", () => {
        expect(sanitizePillInput("1d6+2 (⚔️💪) [slashing]")).toBe("1d6+2 (⚔️💪) [slashing]");
    });
});
