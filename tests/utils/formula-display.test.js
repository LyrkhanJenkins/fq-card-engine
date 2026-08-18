import {beforeEach, describe, expect, it, vi} from "vitest";
import fs from "fs";
import path from "path";
import FormulaDisplay, {ABILITY_EMOJIS, FORMULA_FIELDS, WEAPON_EMOJIS} from "../../src/domain/interface/shared/formula-display.js";
import DisplayCard from "../../src/domain/interface/shared/display-card.js";

/**
 * Factories reprises de `tests/engine/weapon-damage.test.js` (Phase 12/13) :
 * arme équipée d'une catégorie donnée exposant une activité d'attaque, et
 * acteur minimal portant des items — réutilisées ici pour piloter la
 * résolution d'arme côté affichage sans dupliquer le moteur.
 */
function makeWeapon(typeValue, attackActivity) {
    return {
        type: "weapon",
        system: {
            equipped: true,
            type: {value: typeValue},
            activities: {getByType: t => (t === "attack" && attackActivity ? [attackActivity] : [])}
        }
    };
}

function makeActivity(rolls) {
    return {type: "attack", use: vi.fn(), getDamageConfig: vi.fn(() => ({rolls}))};
}

function actorWith(...items) {
    return {items};
}

/**
 * Les 6 caractéristiques posées à 0 : piège documenté (13-01-PLAN.md) — les
 * substitutions lisent les 6 caractéristiques, une caractéristique manquante
 * lève une exception non liée au cas testé.
 */
const NEUTRAL_ABILITIES = {
    str: {mod: 0}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
};

describe("FormulaDisplay — constantes exportées", () => {
    it("expose les tables d'emojis et la liste des champs de formule repliés", () => {
        expect(ABILITY_EMOJIS).toEqual({
            str: "💪", dex: "🎯", con: "❤️", int: "🧠", wis: "🦉", cha: "✨️"
        });
        expect(WEAPON_EMOJIS).toEqual({"@wpnM": "⚔️", "@wpnR": "🏹"});
        expect(FORMULA_FIELDS).toEqual(["damage", "heal", "hp"]);
    });
});

describe("FormulaDisplay.foldExpression — cas nominaux (tracer)", () => {
    it("fusionne des constantes autour d'un dé unique", () => {
        expect(FormulaDisplay.foldExpression("1+2+1+1d6")).toBe("1d6+4");
    });

    it("ordonne les dés de tailles différentes avant la constante", () => {
        expect(FormulaDisplay.foldExpression("1d8 + 3 + 2 + 1d4")).toBe("1d8+1d4+5");
    });

    it("replie les multiplications de constantes", () => {
        expect(FormulaDisplay.foldExpression("2*2")).toBe("4");
        expect(FormulaDisplay.foldExpression("(2 * 3) + 1d6 + 1")).toBe("1d6+7");
        expect(FormulaDisplay.foldExpression("2*X + 3*2")).toBe("6+2X");
    });
});

describe("FormulaDisplay.substituteWeaponTokens", () => {
    it("substitue @wpnM par la formule d'arme sans ajouter de parenthèses", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        expect(FormulaDisplay.substituteWeaponTokens("(@wpnM + 1d4)", actor)).toBe("(1d8 + 3 + 1d4)");
    });

    it("laisse la chaîne inchangée quand aucun jeton d'arme n'est présent", () => {
        expect(FormulaDisplay.substituteWeaponTokens("1d6+2", actorWith())).toBe("1d6+2");
    });

    it("une formule d'arme portant @abilities.<abr>.mod est entièrement résolue puis repliée (substitution avant repli)", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod", "@abilities.str.mod"], data: {mod: 3, abilities: {str: {mod: 3}}}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        expect(FormulaDisplay.substituteWeaponTokens("(@wpnM + 1d4)", actor)).toBe("(1d8 + 3 + 3 + 1d4)");
        expect(FormulaDisplay.forDisplay("(@wpnM + 1d4)[slashing]", actor)).toBe("1d8+1d4+6 (⚔️) [slashing]");
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

describe("FormulaDisplay.forDisplay — chemin canonique complet (tracer)", () => {
    beforeEach(() => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        game.user.character = {
            items: [makeWeapon("martialM", activity)],
            system: {abilities: {...NEUTRAL_ABILITIES, str: {mod: 2}}}
        };
    });

    it("replie une formule réelle avec arme + caractéristique + dé", () => {
        const result = FormulaDisplay.forDisplay("(@wpnM + @str + 1d4)[slashing]");
        expect(result).toBe("1d8+1d4+5 (⚔️💪) [slashing]");
    });

    it("le même chemin, joué via le vrai DisplayCard.getDescriptionFromCard, produit la sous-chaîne canonique attendue par l'utilisateur", () => {
        const card = {
            face: 0,
            faces: {0: {text: "FQCARDDESCRIPTION.Test {0_damage}"}},
            system: {fq: {choices: [{damage: "(@wpnM + @str + 1d4)[slashing]"}]}}
        };
        const result = DisplayCard.getDescriptionFromCard(card);
        expect(result).toContain("1d8+1d4+5 (⚔️💪) [🔪]");
    });
});

describe("FormulaDisplay.forDisplay — contrat « ne lève jamais »", () => {
    it("renvoie les valeurs non-string ou vides inchangées", () => {
        expect(FormulaDisplay.forDisplay("")).toBe("");
        expect(FormulaDisplay.forDisplay(null)).toBe(null);
        expect(FormulaDisplay.forDisplay(undefined)).toBe(undefined);
        expect(FormulaDisplay.forDisplay(42)).toBe(42);
    });

    it("retombe sur l'affichage transformé (jetons @car intacts) pour une formule non repliable (fonction ceil)", () => {
        const result = FormulaDisplay.forDisplay("(1+ ceil(@str/2) + 1d4)[bludgeoning]");
        expect(result).toContain("@str");
        expect(result).toContain("ceil");
    });

    it("substitue quand même les jetons d'arme en cas de repli, laisse @car intact, icône d'arme en fin de chaîne", () => {
        const activity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const actor = actorWith(makeWeapon("martialM", activity));
        const result = FormulaDisplay.forDisplay("(@wpnM + 1d(2*@str))[slashing]", actor);
        expect(result).not.toContain("@wpnM");
        expect(result).toContain("@str");
        expect(result.endsWith("(⚔️)")).toBe(true);
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
            const str = (result ?? "").toString();
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

describe("FormulaDisplay.foldExpression — repli nominal", () => {
    it("fusionne les dés de même taille et ordonne dés puis constante", () => {
        expect(FormulaDisplay.foldExpression("1+2+1+1d6+2d6")).toBe("3d6+4");
    });

    it("ne fusionne pas les dés de tailles différentes, la plus grande d'abord", () => {
        expect(FormulaDisplay.foldExpression("1d8+1d4")).toBe("1d8+1d4");
    });

    it("trie par taille décroissante indépendamment de l'ordre d'écriture", () => {
        expect(FormulaDisplay.foldExpression("1d4+1d8")).toBe("1d8+1d4");
    });

    it("ordonne dés, puis constante, puis variable symbolique", () => {
        expect(FormulaDisplay.foldExpression("3d6+7-X")).toBe("3d6+7-X");
    });

    it("omet la constante nulle quand un dé est déjà rendu", () => {
        expect(FormulaDisplay.foldExpression("1d6")).toBe("1d6");
    });

    it("rend « 0 » pour une expression sans contenu résiduel", () => {
        expect(FormulaDisplay.foldExpression("0")).toBe("0");
        expect(FormulaDisplay.foldExpression("X-X")).toBe("0");
    });

    it("replie une constante négative telle quelle", () => {
        expect(FormulaDisplay.foldExpression("- (6-0)")).toBe("-6");
    });

    it("supprime un coefficient de variable nul", () => {
        expect(FormulaDisplay.foldExpression("1d10+((1-1)*X)")).toBe("1d10");
    });

    it("replie une multiplication de constantes avant de fusionner avec un dé", () => {
        expect(FormulaDisplay.foldExpression("(2 * 1)+1d6+1")).toBe("1d6+3");
    });

    it("ordonne les variables X avant Y, ordre canonique déterministe", () => {
        expect(FormulaDisplay.foldExpression("2*X+3*Y")).toBe("2X+3Y");
    });
});

describe("FormulaDisplay.foldExpression — garde-fous de fidélité", () => {
    it("lève si un caractère n'est pas reconnu par le tokenizer (division)", () => {
        expect(() => FormulaDisplay.foldExpression("2/3")).toThrow();
    });

    it("lève si un caractère n'est pas reconnu par le tokenizer (virgule d'appel de fonction)", () => {
        expect(() => FormulaDisplay.foldExpression("min(5,2)")).toThrow();
    });

    it("lève si un jeton @ résiduel subsiste dans l'expression", () => {
        expect(() => FormulaDisplay.foldExpression("1+@prof")).toThrow();
    });

    it("lève pour le « d » isolé d'un dé à taille variable", () => {
        expect(() => FormulaDisplay.foldExpression("1d(2*2)")).toThrow();
    });

    it("lève pour un appel de fonction non supporté (ceil)", () => {
        expect(() => FormulaDisplay.foldExpression("ceil(2)")).toThrow();
    });

    it("lève quand un dé est multiplié", () => {
        expect(() => FormulaDisplay.foldExpression("2*1d6")).toThrow();
    });

    it("lève pour un nombre de dés variable (Xd6)", () => {
        expect(() => FormulaDisplay.foldExpression("Xd6")).toThrow();
    });

    it("lève quand des dés sont soustraits", () => {
        expect(() => FormulaDisplay.foldExpression("2d6-1d6")).toThrow();
    });

    it("lève pour un dé sous signe négatif unaire", () => {
        expect(() => FormulaDisplay.foldExpression("-1d6")).toThrow();
    });

    it("laisse toujours passer les variables autorisées X et Y", () => {
        expect(FormulaDisplay.foldExpression("X")).toBe("X");
        expect(FormulaDisplay.foldExpression("Y")).toBe("Y");
    });

    it("conserve l'erreur héritée du parseur d'origine (parenthèse fermante attendue)", () => {
        expect(() => FormulaDisplay.foldExpression("(1+2")).toThrow("Parenthèse fermante attendue");
    });

    it("conserve l'erreur héritée du parseur d'origine (produit de deux variables)", () => {
        expect(() => FormulaDisplay.foldExpression("X*Y")).toThrow("Produit de deux variables non supporté");
    });

    describe("passées à forDisplay, ces mêmes expressions ne lèvent pas : elles produisent le fallback", () => {
        beforeEach(() => {
            game.user.character = {
                items: [],
                system: {abilities: {...NEUTRAL_ABILITIES, str: {mod: 2}, dex: {mod: 1}, int: {mod: 3}, wis: {mod: 1}}}
            };
        });

        const guardedExpressions = [
            "2/3", "min(5,2)", "1+@prof", "1d(2*2)", "ceil(2)",
            "2*1d6", "Xd6", "2d6-1d6", "-1d6"
        ];

        it.each(guardedExpressions)("forDisplay(\"%s\") ne lève pas", (expr) => {
            expect(() => FormulaDisplay.forDisplay(expr)).not.toThrow();
        });

        it("cas corpus complet : (1+ ceil(@str/2) + 1d4)[bludgeoning] ne lève pas et conserve ceil", () => {
            const result = FormulaDisplay.forDisplay("(1+ ceil(@str/2) + 1d4)[bludgeoning]");
            expect(result).toContain("ceil");
        });

        it("cas corpus complet : @dex+@wis+@int+XXXd6[force] ne lève pas", () => {
            expect(() => FormulaDisplay.forDisplay("@dex+@wis+@int+XXXd6[force]")).not.toThrow();
        });
    });
});

describe("FormulaDisplay.forDisplay — assemblage et cas d'arme", () => {
    /**
     * Acteur de test canonique du plan 13-02 : str=+2, dex=+1, con=0, int=+3,
     * wis=+1, cha=+1 ; arme de mêlée martialM `1d8 + 3`, arme à distance
     * simpleR `1d6 + 2`.
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

    it("un seul groupe de type : formule repliée (emojis) [type]", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(@wpnR + (2 * @cha) + 1d6 - XXX)[bludgeoning]", actor))
            .toBe("2d6+4-X (🏹✨️) [bludgeoning]");
    });

    it("arme de mêlée + caractéristique", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actor)).toBe("1d8+5 (⚔️💪) [slashing]");
    });

    it("arme de mêlée seule", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(@wpnM)[slashing]", actor)).toBe("1d8+3 (⚔️) [slashing]");
    });

    it("plusieurs groupes de type, chacun replié indépendamment, groupe d'emojis à la toute fin", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(1+@int+1d4)[thunder]+(1+@wis+1d4)[cold]", actor))
            .toBe("1d4+4 [thunder]+1d4+2 [cold] (🧠🦉)");
    });

    it("aucune parenthèse d'emojis quand aucune source de modification n'est présente", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("1+1d4[piercing]", actor)).toBe("1d4+1 [piercing]");
    });

    it("formule purement constante avec un type", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("2*@int[poison]", actor)).toBe("6 (🧠) [poison]");
    });

    it("aucun jeton de type : formule sans crochets", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(2*@wis)+1d8", actor)).toBe("1d8+2 (🦉)");
    });

    it("formule purement constante sans type", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("@int", actor)).toBe("3 (🧠)");
    });

    it("multiplication imbriquée repliée dans la constante, un seul type", () => {
        const actor = makeCanonicalActor();
        expect(FormulaDisplay.forDisplay("(3*(@wis+@int) + 1d12)[force]", actor)).toBe("1d12+12 (🧠🦉) [force]");
    });

    it("sans arme de mêlée équipée : contribution repliée à 0, icône d'arme conservée (D-08)", () => {
        const actor = makeCanonicalActor({melee: false});
        expect(FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actor)).toBe("2 (⚔️💪) [slashing]");
    });

    it("arme de mêlée équipée sans activité : contribution 0 sans exception (D-08)", () => {
        const actor = makeCanonicalActor({ranged: false, meleeHasActivity: false});
        expect(() => FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actor)).not.toThrow();
        expect(FormulaDisplay.forDisplay("(@wpnM + @str)[slashing]", actor)).toBe("2 (⚔️💪) [slashing]");
    });

    it("mêlée ET distance équipées simultanément : chaque jeton prend la formule de son type", () => {
        const actor = makeCanonicalActor();
        const result = FormulaDisplay.forDisplay("(@wpnM + @wpnR)[force]", actor);
        expect(result).toContain("1d8");
        expect(result).toContain("1d6");
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

    it("forDisplay n'ajoute aucune parenthèse ni espace superflu quand aucune source n'est présente", () => {
        game.user.character = {items: [], system: {abilities: {...NEUTRAL_ABILITIES}}};
        expect(FormulaDisplay.forDisplay("1d6[piercing]")).toBe("1d6 [piercing]");
    });

    it("l'icône d'arme reste visible sur le chemin de fallback sans arme à distance équipée", () => {
        game.user.character = {
            items: [],
            system: {abilities: {...NEUTRAL_ABILITIES, dex: {mod: 1}}}
        };
        const result = FormulaDisplay.forDisplay("(@wpnR + 1d(2*@dex))[piercing]");
        expect(result.endsWith("(🏹)")).toBe(true);
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

        it("ne contient jamais un chiffre suivi d'une parenthèse d'emoji de caractéristique, ni () vide, ni double espace", () => {
            const values = collectFieldValues();
            expect(values.length).toBeGreaterThanOrEqual(150);
            for (const value of values) {
                const result = (FormulaDisplay.forDisplay(value) ?? "").toString();
                expect(result).not.toMatch(abilityEmojiPattern);
                expect(result).not.toContain("()");
                expect(result).not.toMatch(/ {2}/);
            }
        });
    });
});

describe("FormulaDisplay.foldExpression vs DisplayCard.simplifyExpression — justification du module séparé", () => {
    it("simplifyExpression garde la constante en tête (contrat des bulles, inchangé)", () => {
        expect(DisplayCard.simplifyExpression("5 + 3 + 4*X")).toBe("8+4X");
    });

    it("foldExpression produit le même résultat sur une expression sans dé", () => {
        expect(FormulaDisplay.foldExpression("5 + 3 + 4*X")).toBe("8+4X");
    });

    it("foldExpression replie fidèlement une expression avec dé, là où simplifyExpression ne représente pas la formule réelle", () => {
        expect(FormulaDisplay.foldExpression("1d6+4")).toBe("1d6+4");
        expect(DisplayCard.simplifyExpression("1d6+4")).not.toBe("1d6+4");
    });
});

describe("FormulaDisplay — instantané du corpus", () => {
    /**
     * Acteur canonique du plan 13-02/13-03 : str=+2, dex=+1, con=0, int=+3,
     * wis=+1, cha=+1 ; arme de mêlée martialM `1d8 + 3`, arme à distance
     * simpleR `1d6 + 2`. Chaque paire ci-dessous provient d'une valeur
     * `damage`/`heal`/`hp` réelle de `packs/_source/decks-pattern-fq8/`.
     */
    const CANONICAL_ABILITIES = {
        str: {mod: 2}, dex: {mod: 1}, con: {mod: 0}, int: {mod: 3}, wis: {mod: 1}, cha: {mod: 1}
    };

    beforeEach(() => {
        const meleeActivity = makeActivity([{parts: ["1d8", "@mod"], data: {mod: 3}}]);
        const rangedActivity = makeActivity([{parts: ["1d6", "@mod"], data: {mod: 2}}]);
        game.user.character = {
            items: [makeWeapon("martialM", meleeActivity), makeWeapon("simpleR", rangedActivity)],
            system: {abilities: {...CANONICAL_ABILITIES}}
        };
    });

    describe("formules repliables (folded)", () => {
        it.each([
            ["arme de mêlée + caractéristique + dé (exemple canonique utilisateur)",
                "(@wpnM + @str + 1d4)[slashing]", "1d8+1d4+5 (⚔️💪) [slashing]"],
            ["arme de mêlée seule", "(@wpnM)[slashing]", "1d8+3 (⚔️) [slashing]"],
            ["arme à distance + caractéristique + dés multiples", "(@wpnR + @dex + 2d3)[force]", "1d6+2d3+3 (🏹🎯) [force]"],
            ["multi-groupes de type, groupe d'emojis unique en fin de chaîne",
                "(1+@int+1d4)[thunder]+(1+@wis+1d4)[cold]", "1d4+4 [thunder]+1d4+2 [cold] (🧠🦉)"],
            ["sans jeton de type (aucun crochet)", "(2*@wis)+1d8", "1d8+2 (🦉)"],
            ["variable X pure, sans source ni type", "(3*XXX)", "3X"],
            ["formule purement constante, sans type", "-5", "-5"],
            ["formule purement dés, avec type", "1d8[poison]", "1d8 [poison]"],
            ["champ vide", "", ""],
        ])("%s : forDisplay(%j) === %j", (_label, input, expected) => {
            expect(FormulaDisplay.forDisplay(input)).toBe(expected);
        });
    });

    describe("formules non repliables (fallback, D-04)", () => {
        it.each([
            ["fonction non supportée (ceil)", "(2 + ceil(@str/3))[bludgeoning]", "(2 + ceil(@str/3))[bludgeoning]"],
            ["dé à taille variable (nombre de dés en variable)", "@dex+@wis+@int+XXXd6[force]", "@dex+@wis+@int+XXXd6[force]"],
            ["jeton d'arme présent mais dé à taille variable dans le reste : icône d'arme conservée (D-08)",
                "(@wpnM + 1d(2*@str))[slashing]", "(1d8 + 3 + 1d(2*@str))[slashing] (⚔️)"],
        ])("%s : forDisplay(%j) === %j", (_label, input, expected) => {
            expect(FormulaDisplay.forDisplay(input)).toBe(expected);
        });
    });
});
