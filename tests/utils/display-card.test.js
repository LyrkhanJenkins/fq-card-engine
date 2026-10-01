import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import fs from "fs";
import path from "path";
import DisplayCard from "../../src/domain/interface/card-svg/display-card.js";
import FormulaDisplay, {
    ABILITY_EMOJIS, CAP_LABEL_KEYS, DAMAGE_TYPE_EMOJIS, EMOJI_TOOLTIP_KEYS, SOURCE_LABEL_KEYS, WEAPON_EMOJIS
} from "../../src/domain/interface/card-svg/formula-display.js";
import {expandPills, makePill, PILL_SOURCE, PILL_TYPE, stripPills} from "../../src/domain/interface/card-svg/formula-pill.js";
import {
    actorWith, makeAttackActivity, makeReferenceActor, makeWeapon, NEUTRAL_ABILITIES, REFERENCE_ABILITIES
} from "./formula-fixtures.js";

/**
 * Le repli symbolique d'une bulle ronde : ce qui s'affiche quand une variable
 * `XXX`/`YYY` laisse le jet inévaluable. Ce repli est celui de `FormulaDisplay`,
 * le seul arbre de repli du module — la bulle avait auparavant son propre
 * analyseur (`DisplayCard.simplifyExpression`, supprimé), qui ignorait la
 * division et l'arrondi et les lisait comme des multiplications implicites.
 *
 * Les cas s'écrivent tous au travers de l'API publique
 * `getNumberForBubbleCardSvg`, avec un `Roll` qui lève comme le fait Foundry sur
 * une formule à variable libre : c'est le seul chemin par lequel une bulle
 * atteint le repli en jeu.
 */
describe("DisplayCard.getNumberForBubbleCardSvg — repli symbolique d'une bulle", () => {

    const realRoll = globalThis.Roll;

    beforeEach(() => {
        // RollService.replaceAbilitiesBonus lit Constants.actorAbi.<abi>.mod sans
        // chaînage optionnel : les 6 caractéristiques doivent être posées.
        game.user.character.system.abilities = {
            str: {mod: 0}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
        };
        globalThis.Roll = vi.fn(function (formula) {
            this.formula = formula;
            this.evaluateSync = () => {
                throw new Error("This Roll contains terms that cannot be synchronously evaluated");
            };
        });
    });

    afterEach(() => {
        globalThis.Roll = realRoll;
    });

    describe("cas nominaux (sorties historiques des bulles, inchangées)", () => {
        it("combine constantes et multiplication d'une variable", () => {
            expect(DisplayCard.getNumberForBubbleCardSvg("5 + 3 + 4*XXX")).toBe("8+4X");
        });

        it("replie une multiplication explicite constante*variable", () => {
            expect(DisplayCard.getNumberForBubbleCardSvg("2*XXX")).toBe("2X");
        });

        it("replie un coût parenthésé négatif", () => {
            expect(DisplayCard.getNumberForBubbleCardSvg("-(3 + XXX)")).toBe("-3-X");
        });

        it("nomme la seconde variable Y", () => {
            expect(DisplayCard.getNumberForBubbleCardSvg("-(YYY)")).toBe("-Y");
        });
    });

    describe("ce que l'ancien analyseur de bulle lisait faux", () => {
        it("une division par une constante reste une division (et non un facteur)", () => {
            // L'ancien analyseur ignorait « / » : `XXX/2` s'affichait « 2X », soit
            // le QUADRUPLE de la valeur réelle pour X=4.
            expect(DisplayCard.getNumberForBubbleCardSvg("XXX/2")).toBe("X÷2");
        });

        it("un arrondi est transparent au lieu de faire échouer le repli", () => {
            // L'ancien analyseur voyait `ceil` comme une variable et levait
            // « Produit de deux variables », ce qui annulait le rendu de la carte.
            expect(DisplayCard.getNumberForBubbleCardSvg("ceil(XXX/2)")).toBe("X÷2");
        });

        it("une notation de dé à compte variable reste un dé", () => {
            // L'ancien analyseur lisait `XXXd6` comme X*d*6 et affichait « 6Xd ».
            expect(DisplayCard.getNumberForBubbleCardSvg("XXXd6")).toBe("Xd6");
        });
    });

    describe("robustesse : une bulle ne peut pas annuler le rendu de sa carte", () => {
        it("une expression irrepliable s'affiche telle quelle, variables rendues lisibles", () => {
            expect(DisplayCard.getNumberForBubbleCardSvg("(1+XXX")).toBe("(1+X");
        });

        it("ne lève jamais, quelle que soit la saisie", () => {
            for (const saisie of ["(1+2", "1)", "1+", "XXX*", ")("]) {
                expect(() => DisplayCard.getNumberForBubbleCardSvg(saisie)).not.toThrow();
            }
        });
    });
});

describe("DisplayCard.getNumberForBubbleCardSvg", () => {

    it("renvoie « 0 » pour une chaîne vide", () => {
        expect(DisplayCard.getNumberForBubbleCardSvg("", {})).toBe("0");
    });

    it("renvoie « ∞ » quand le premier nombre extrait dépasse 99", () => {
        expect(DisplayCard.getNumberForBubbleCardSvg("100", {})).toBe("∞");
    });

    describe("branches restantes (evaluateSync / simplify)", () => {
        beforeEach(() => {
            // RollService.replaceAbilitiesBonus lit Constants.actorAbi.<abi>.mod sans
            // chaînage optionnel : il faut poser les 6 caractéristiques pour ne pas
            // lever d'exception, même quand la chaîne ne contient aucun token @abi.
            game.user.character.system.abilities = {
                str: {mod: 0}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
            };
        });

        it("renvoie le total évalué quand l'expression est une formule de dés valide", () => {
            globalThis.Roll = vi.fn(function (formula) {
                this.formula = formula;
                this.evaluateSync = () => ({total: 42});
            });
            expect(DisplayCard.getNumberForBubbleCardSvg("1+2")).toBe(42);
        });

        it("simplifie l'expression (XXX→X) quand l'évaluation échoue, même avec xvalue renseigné", () => {
            globalThis.Roll = vi.fn(function (formula) {
                this.formula = formula;
                this.evaluateSync = () => {
                    throw new Error("cannot evaluate variable");
                };
            });
            expect(DisplayCard.getNumberForBubbleCardSvg("XXX")).toBe("X");
        });

        it("simplifie l'expression (YYY→Y) quand l'évaluation échoue", () => {
            globalThis.Roll = vi.fn(function (formula) {
                this.formula = formula;
                this.evaluateSync = () => {
                    throw new Error("cannot evaluate variable");
                };
            });
            expect(DisplayCard.getNumberForBubbleCardSvg("YYY")).toBe("Y");
        });
    });
});

describe("DisplayCard.getDescriptionSizeForCardSvg / getTitleSizeForCardSvg", () => {
    it("choisit la taille de police en franchissant les seuils de longueur de description (aucun marqueur, table historique inchangée)", () => {
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(1))).toBe(40);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(80))).toBe(36);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(81))).toBe(34);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(500))).toBe(16);
    });

    it("mesure le texte VISIBLE : la taille pour une description à pastilles est celle de son texte visible (stripPills), pas celle du markup brut", () => {
        const withPills = "a".repeat(80)
            + makePill(PILL_SOURCE, "⚔️", "FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8 + 3)")
            + makePill(PILL_SOURCE, "💪", "FQCARDENGINE.SourceAbilityStr (+3)")
            + makePill(PILL_TYPE, "🔪", "FQCARDENGINE.TooltipDamageSlashing");
        // Le markup brut (avec les trois pastilles) est bien plus long que le
        // texte visible qu'il représente une fois développé.
        expect(withPills.length).toBeGreaterThan(stripPills(withPills).length);
        expect(DisplayCard.getDescriptionSizeForCardSvg(withPills))
            .toBe(DisplayCard.getDescriptionSizeForCardSvg(stripPills(withPills)));
    });

    it("un seuil de longueur VISIBLE franchi change bien la taille, même si le markup ajoute des centaines de caractères invisibles", () => {
        // Un tooltip très long (300 caractères) gonfle la longueur BRUTE du
        // marqueur très au-delà de 80/81, sans rien ajouter au texte visible
        // (le marqueur se réduit toujours à son seul emoji sous stripPills).
        const pill = makePill(PILL_TYPE, "🔪", "x".repeat(300));
        const visibleLen = "🔪".length;
        const under = "a".repeat(80 - visibleLen) + pill;
        const over = "a".repeat(81 - visibleLen) + pill;
        expect(under.length).toBeGreaterThan(300);
        expect(DisplayCard.getDescriptionSizeForCardSvg(under)).toBe(36);
        expect(DisplayCard.getDescriptionSizeForCardSvg(over)).toBe(34);
    });

    it("une description sans aucun marqueur traverse stripPills sans être altérée (identité)", () => {
        const plain = "Inflige 1d6 dégâts, sans aucune pastille.";
        expect(stripPills(plain)).toBe(plain);
        expect(DisplayCard.getDescriptionSizeForCardSvg(plain))
            .toBe(DisplayCard.getDescriptionSizeForCardSvg(stripPills(plain)));
    });

    it("choisit la taille de police en franchissant les seuils de longueur de titre", () => {
        expect(DisplayCard.getTitleSizeForCardSvg("a".repeat(1))).toBe(34);
        expect(DisplayCard.getTitleSizeForCardSvg("a".repeat(20))).toBe(32);
        expect(DisplayCard.getTitleSizeForCardSvg("a".repeat(21))).toBe(28);
        expect(DisplayCard.getTitleSizeForCardSvg("a".repeat(50))).toBe(20);
    });
});

describe("DisplayCard.getBubbleSizeForCardSvg", () => {
    it("garde la taille par défaut (36) pour une valeur courte (≤ 2 caractères)", () => {
        expect(DisplayCard.getBubbleSizeForCardSvg("8")).toBe(36);
        expect(DisplayCard.getBubbleSizeForCardSvg(10)).toBe(36);
        expect(DisplayCard.getBubbleSizeForCardSvg("2X")).toBe(36);
    });

    it("réduit progressivement la taille quand la valeur s'allonge", () => {
        expect(DisplayCard.getBubbleSizeForCardSvg("8+X")).toBe(30);      // 3 caractères
        expect(DisplayCard.getBubbleSizeForCardSvg("8+4X")).toBe(25);     // 4 caractères
        expect(DisplayCard.getBubbleSizeForCardSvg("2X+2Y")).toBe(21);    // 5 caractères
        expect(DisplayCard.getBubbleSizeForCardSvg("2X+20Y")).toBe(18);   // 6 caractères
        expect(DisplayCard.getBubbleSizeForCardSvg("10X+200Y")).toBe(15); // au-delà
    });

    it("ne lève pas sur null/undefined (taille par défaut)", () => {
        expect(DisplayCard.getBubbleSizeForCardSvg(null)).toBe(36);
        expect(DisplayCard.getBubbleSizeForCardSvg(undefined)).toBe(36);
    });
});

describe("DisplayCard.getReachSizeForCardSvg", () => {
    it("garde la taille par défaut (28) pour une portée courte", () => {
        expect(DisplayCard.getReachSizeForCardSvg("1", "5")).toBe(28); // « 1 | 5 » = 5 caractères
    });

    it("réduit la taille quand les valeurs de portée s'allongent", () => {
        expect(DisplayCard.getReachSizeForCardSvg("10", "12")).toBe(23);    // « 10 | 12 » = 7
        expect(DisplayCard.getReachSizeForCardSvg("2X", "3X+2")).toBe(19);  // « 2X | 3X+2 » = 9
        expect(DisplayCard.getReachSizeForCardSvg("2X+1", "3X+2")).toBe(16);// « 2X+1 | 3X+2 » = 11
        expect(DisplayCard.getReachSizeForCardSvg("2X+10", "3X+20")).toBe(13); // au-delà
    });
});

describe("DisplayCard.getDescriptionFromCard", () => {
    it("renvoie une description vide transformée quand face est null", () => {
        const card = {face: null, system: {fq: {choices: []}}};
        const result = DisplayCard.getDescriptionFromCard(card);
        expect(result).toBe("" + JSON.stringify({}));
    });

    it("utilise faces[face].text quand la carte a des faces", () => {
        game.user.character.system.abilities = {str: {mod: 2}};
        const card = {face: 1, faces: {1: {text: "Desc @str"}}, system: {fq: {choices: []}}};
        const result = DisplayCard.getDescriptionFromCard(card);
        expect(stripPills(result)).toBe("Desc 2 💪{}");
    });

    it("rend une description indéfinie quand faces est absent", () => {
        const card = {
            face: 1,
            system: {fq: {choices: []}}
        };
        const result = DisplayCard.getDescriptionFromCard(card);
        expect(result).toBe("undefined{}");
    });

    it("aplatit system.fq.choices en arguments i18n.format préfixés par index", () => {
        const card = {
            face: 0,
            faces: {0: {text: "Text"}},
            system: {fq: {choices: [{action: "1d4", mana: ""}, {damage: "2d6"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        expect(game.i18n.format).toHaveBeenCalledWith("Text", {
            "0_action": "1d4", "0_mana": "", "1_damage": "2d6"
        });
    });

    it("assainit le texte de description AVANT game.i18n.format : un marqueur forgé dans la traduction ne survit pas (T-20-02)", () => {
        const sentinel = String.fromCharCode(1) + "type" + String.fromCharCode(31)
            + "🔪" + String.fromCharCode(31) + "FORGE" + String.fromCharCode(2);
        const forged = `Text${sentinel}`;
        const card = {face: 0, faces: {0: {text: forged}}, system: {fq: {choices: []}}};
        const result = DisplayCard.getDescriptionFromCard(card);
        const [calledTemplate] = game.i18n.format.mock.calls.at(-1);
        expect(calledTemplate).not.toContain(String.fromCharCode(1));
        expect(calledTemplate).toBe("Texttype🔪FORGE");
        expect(result).not.toContain("<span");
    });

    it("passe damage/heal/hp par FormulaDisplay.forDisplay avec l'acteur courant : la valeur transmise porte des marqueurs de pastille", () => {
        game.user.character = {
            items: [],
            system: {abilities: {str: {mod: 2}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}}}
        };
        const card = {
            face: 0,
            faces: {0: {text: "{0_damage}"}},
            system: {fq: {choices: [{damage: "1d6+@str[fire]"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        expect(stripPills(calledArgs["0_damage"])).toBe("1d6+2 💪🔥");
    });

    it("propage xValue/yValue (options) jusqu'à FormulaDisplay.forDisplay : XXX devient numérique quand la valeur est fournie", () => {
        game.user.character = {items: [], system: {abilities: {}}};
        const card = {
            face: 0,
            faces: {0: {text: "{0_damage}"}},
            system: {fq: {choices: [{damage: "XXXd6"}]}}
        };
        DisplayCard.getDescriptionFromCard(card, card.face, {xValue: 3});
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        expect(stripPills(calledArgs["0_damage"])).toBe("3d6");
    });

    it("sans options (les 3 autres sites d'appel : main, compendium, voile), XXX reste symbolique", () => {
        game.user.character = {items: [], system: {abilities: {}}};
        const card = {
            face: 0,
            faces: {0: {text: "{0_damage}"}},
            system: {fq: {choices: [{damage: "XXXd6"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        expect(stripPills(calledArgs["0_damage"])).toBe("Xd6");
    });
});

describe("DisplayCard.getNameFromCard", () => {
    it("renvoie le nom localisé quand la face est visible", () => {
        const card = {face: 0, name: "Fireball"};
        expect(DisplayCard.getNameFromCard(card)).toBe("Fireball");
        expect(game.i18n.localize).toHaveBeenCalledWith("Fireball");
    });

    it("renvoie le libellé CardBack localisé quand face est null", () => {
        const card = {face: null, name: "Fireball"};
        expect(DisplayCard.getNameFromCard(card)).toBe("FQCARDENGINE.CardBack");
    });
});

describe("DisplayCard.getImgFromCard", () => {
    it("renvoie l'image du dos quand face est null", () => {
        const card = {face: null, back: {img: "back.png"}};
        expect(DisplayCard.getImgFromCard(card)).toBe("back.png");
    });

    it("renvoie l'image de la face quand faces est présent", () => {
        const card = {face: 0, back: {img: "back.png"}, faces: {0: {img: "face0.png"}}};
        expect(DisplayCard.getImgFromCard(card)).toBe("face0.png");
    });

    it("rend une image indéfinie quand faces est absent", () => {
        const card = {
            face: 1,
            back: {img: "back.png"}
        };
        expect(DisplayCard.getImgFromCard(card)).toBe(undefined);
    });
});

describe("DisplayCard.transformForDescription", () => {
    it("renvoie les valeurs non-string inchangées", () => {
        expect(DisplayCard.transformForDescription(42)).toBe(42);
        expect(DisplayCard.transformForDescription(null)).toBe(null);
    });

    it("substitue les références de caractéristiques par leur modificateur et un emoji", () => {
        game.user.character.system.abilities = {
            int: {mod: 3}, wis: {mod: -1}, cha: {mod: 0}, str: {mod: 2}, dex: {mod: 1}, con: {mod: 4}
        };
        const result = DisplayCard.transformForDescription("@int @wis @cha @str @dex @con");
        // Même langage visuel que les formules repliées : la valeur, puis une
        // pastille de source à tooltip (et non plus le format inline mod(emoji)).
        expect(stripPills(result)).toBe("3 🧠 -1 🦉 0 ✨️ 2 💪 1 🎯 4 ❤️");
        expect(result).toContain(makePill(PILL_SOURCE, "🧠", "FQCARDENGINE.SourceAbilityInt (+3)"));
        expect(result).toContain(makePill(PILL_SOURCE, "🦉", "FQCARDENGINE.SourceAbilityWis (-1)"));
        expect(result).toContain(makePill(PILL_SOURCE, "✨️", "FQCARDENGINE.SourceAbilityCha (+0)"));
    });

    it("substitue les tokens de type de dégâts par leur symbole", () => {
        const result = DisplayCard.transformForDescription("[fire] [poison] [slashing]");
        expect(result).toBe("[🔥] [☠️] [🔪]");
    });

    it("remplace la première occurrence de XXX/YYY par X/Y", () => {
        expect(DisplayCard.transformForDescription("XXX dmg, YYY heal")).toBe("X dmg, Y heal");
    });

    it("consomme ABILITY_EMOJIS comme source unique de vérité (13-03, D-06)", () => {
        game.user.character.system.abilities = {
            str: {mod: 1}, dex: {mod: 1}, con: {mod: 1}, int: {mod: 1}, wis: {mod: 1}, cha: {mod: 1}
        };
        for (const [ability, emoji] of Object.entries(ABILITY_EMOJIS)) {
            expect(DisplayCard.transformForDescription(`@${ability}`)).toContain(emoji);
        }
    });

    it("consomme DAMAGE_TYPE_EMOJIS comme source unique de vérité", () => {
        for (const [type, emoji] of Object.entries(DAMAGE_TYPE_EMOJIS)) {
            expect(DisplayCard.transformForDescription(`[${type}]`)).toBe(`[${emoji}]`);
        }
    });

    it("D-15 : sans personnage assigné, rend le jeton symbolique porteur de l'emoji, sans valeur numérique inventée (bug undefined(🧠) corrigé)", () => {
        game.user.character.system.abilities = {};
        const unresolved = DisplayCard.transformForDescription("@int");
        expect(stripPills(unresolved)).toBe("🧠");
        expect(unresolved).toBe(makePill(PILL_SOURCE, "🧠", "FQCARDENGINE.SourceAbilityInt"));
    });

    it("D-15 : avec un personnage assigné, le comportement reste inchangé (non-régression)", () => {
        game.user.character.system.abilities = {int: {mod: 3}};
        const resolved = DisplayCard.transformForDescription("@int");
        expect(stripPills(resolved)).toBe("3 🧠");
        expect(resolved).toBe(`3 ${makePill(PILL_SOURCE, "🧠", "FQCARDENGINE.SourceAbilityInt (+3)")}`);
    });
});

describe("DisplayCard.wrapEmojiTooltips (AFF-04)", () => {
    it("enveloppe chaque emoji connu d'un span data-tooltip avec sa clé i18n", () => {
        expect(DisplayCard.wrapEmojiTooltips("2d6+4 (⚔️💪) [🔪]")).toBe(
            "2d6+4 (<span data-tooltip=\"FQCARDENGINE.TooltipWeaponMelee\">⚔️</span>" +
            "<span data-tooltip=\"FQCARDENGINE.SourceAbilityStr\">💪</span>) " +
            "[<span data-tooltip=\"FQCARDENGINE.TooltipDamageSlashing\">🔪</span>]"
        );
    });

    it("couvre la totalité des emojis des trois tables sources", () => {
        for (const emoji of [...Object.values(ABILITY_EMOJIS), ...Object.values(WEAPON_EMOJIS), ...Object.values(DAMAGE_TYPE_EMOJIS)]) {
            const wrapped = DisplayCard.wrapEmojiTooltips(emoji);
            expect(wrapped).toContain(`data-tooltip="${EMOJI_TOOLTIP_KEYS[emoji]}"`);
        }
    });

    it("échappe le HTML du texte avant enveloppement (la description devient du markup)", () => {
        expect(DisplayCard.wrapEmojiTooltips("<b>1d6</b> & \"2\"")).toBe("&lt;b&gt;1d6&lt;/b&gt; &amp; &quot;2&quot;");
    });

    it("laisse intacts le texte sans emoji connu et les valeurs non-string", () => {
        expect(DisplayCard.wrapEmojiTooltips("Inflige 1d6 dégâts")).toBe("Inflige 1d6 dégâts");
        expect(DisplayCard.wrapEmojiTooltips(null)).toBe(null);
        expect(DisplayCard.wrapEmojiTooltips(undefined)).toBe(undefined);
    });

    it("chaque clé de tooltip existe dans lang/fr.json ET lang/en.json", () => {
        const fr = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/fr.json"), "utf-8"));
        const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/en.json"), "utf-8"));
        for (const key of Object.values(EMOJI_TOOLTIP_KEYS)) {
            expect(fr[key], `clé fr manquante : ${key}`).toBeTruthy();
            expect(en[key], `clé en manquante : ${key}`).toBeTruthy();
        }
    });

    it("chaque clé de SOURCE_LABEL_KEYS, plus SourceWeaponNone, existe dans lang/fr.json ET lang/en.json", () => {
        const fr = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/fr.json"), "utf-8"));
        const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/en.json"), "utf-8"));
        const keys = [
            ...Object.values(SOURCE_LABEL_KEYS),
            "FQCARDENGINE.SourceWeaponNone"
        ];
        for (const key of keys) {
            expect(fr[key], `clé fr manquante : ${key}`).toBeTruthy();
            expect(en[key], `clé en manquante : ${key}`).toBeTruthy();
        }
    });

    it("chaque clé de CAP_LABEL_KEYS (plafonds min/max, D-06) existe dans lang/fr.json ET lang/en.json", () => {
        const fr = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/fr.json"), "utf-8"));
        const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/en.json"), "utf-8"));
        for (const key of Object.values(CAP_LABEL_KEYS)) {
            expect(fr[key], `clé fr manquante : ${key}`).toBeTruthy();
            expect(en[key], `clé en manquante : ${key}`).toBeTruthy();
        }
    });

    it("développe un marqueur de pastille (échappé) en <span class=\"fq-formula-pill …\">, après échappement HTML", () => {
        const pill = makePill(PILL_SOURCE, "⚔️", "FQCARDENGINE.SourceWeaponMelee — Épée <bâtarde> (1d8 + 3)");
        const wrapped = DisplayCard.wrapEmojiTooltips(`1d8+3 ${pill}`);
        expect(wrapped).toBe(
            "1d8+3 <span class=\"fq-formula-pill fq-formula-pill--src\" " +
            "data-tooltip=\"FQCARDENGINE.SourceWeaponMelee — Épée &lt;bâtarde&gt; (1d8 + 3)\">⚔️</span>"
        );
    });

    it("expandPills : un texte sans marqueur (juste le mot \"src\") ne produit jamais de balise (ce n'est pas un marqueur)", () => {
        const html = expandPills(`a${PILL_SOURCE}b`, ["a"], c => c);
        expect(html).not.toContain("fq-formula-pill");
        expect(html).toBe("asrcb");
    });
});

describe("DisplayCard — pastilles : contrat de rendu (D-11, Task 3 plan 20-05)", () => {
    it("les 13 types de dégâts (DAMAGE_TYPE_EMOJIS) produisent tous EXACTEMENT la même classe CSS de pastille — aucune coloration par élément", () => {
        expect(Object.keys(DAMAGE_TYPE_EMOJIS).length).toBe(13);
        const classes = new Set();
        for (const emoji of Object.values(DAMAGE_TYPE_EMOJIS)) {
            const wrapped = DisplayCard.wrapEmojiTooltips(makePill(PILL_TYPE, emoji, EMOJI_TOOLTIP_KEYS[emoji]));
            const match = wrapped.match(/class="([^"]+)"/);
            expect(match, `pas de pastille produite pour ${emoji}`).not.toBeNull();
            classes.add(match[1]);
        }
        expect([...classes]).toEqual(["fq-formula-pill fq-formula-pill--type"]);
    });

    it("le tooltip de la pastille d'arme nomme l'arme équipée ET sa formule de dégâts chiffrée (acteur de référence, 20-CONTEXT.md)", () => {
        const actor = makeReferenceActor();
        game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
        const card = {
            face: 0,
            faces: {0: {text: "{0_damage}"}},
            system: {fq: {choices: [{damage: "(@wpnM)[slashing]"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        const wrapped = DisplayCard.wrapEmojiTooltips(calledArgs["0_damage"]);
        expect(wrapped).toContain(
            "data-tooltip=\"FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8)\""
        );
    });

    it("le tooltip de la pastille de caractéristique nomme la caractéristique ET porte une contribution SIGNÉE", () => {
        const actor = makeReferenceActor();
        game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
        const card = {
            face: 0,
            faces: {0: {text: "{0_damage}"}},
            system: {fq: {choices: [{damage: "(@int)[fire]"}]}}
        };
        DisplayCard.getDescriptionFromCard(card);
        const [, calledArgs] = game.i18n.format.mock.calls.at(-1);
        const wrapped = DisplayCard.wrapEmojiTooltips(calledArgs["0_damage"]);
        expect(wrapped).toMatch(/data-tooltip="FQCARDENGINE\.SourceAbilityInt \(\+4\)"/);
    });

    it("la taille de police d'une description complète à pastilles (arme + caractéristique + type) reste identique à celle de son texte visible (critère de sortie 5)", () => {
        const withPills = "Inflige "
            + makePill(PILL_SOURCE, "⚔️", "FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8 + 3)")
            + makePill(PILL_SOURCE, "💪", "FQCARDENGINE.SourceAbilityStr (+3)")
            + makePill(PILL_TYPE, "🔪", "FQCARDENGINE.TooltipDamageSlashing")
            + " points de dégâts.";
        expect(DisplayCard.getDescriptionSizeForCardSvg(withPills))
            .toBe(DisplayCard.getDescriptionSizeForCardSvg(stripPills(withPills)));
    });

    it("la sortie de wrapEmojiTooltips sur une description complète (arme, caractéristique, type) a ses balises <span> équilibrées (T-20-16)", () => {
        const actor = makeReferenceActor();
        game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
        const folded = FormulaDisplay.forDisplay("(@wpnM + @int)[slashing]", actor);
        const wrapped = DisplayCard.wrapEmojiTooltips(folded);
        const openCount = (wrapped.match(/<span /g) ?? []).length;
        const closeCount = (wrapped.match(/<\/span>/g) ?? []).length;
        expect(openCount).toBeGreaterThan(0);
        expect(openCount).toBe(closeCount);
    });
});

describe("DisplayCard — périmètres exclus : non-régression (D-12, D-13, Task 3 plan 20-05)", () => {
    it("une formule à bonus nommé (@bonus.serenityRune) produit EXACTEMENT le même nombre de pastilles que sans ce jeton (D-12)", () => {
        game.user.character = {
            items: [],
            system: {abilities: {...NEUTRAL_ABILITIES}, fq: {cardBonus: {serenityRune: 2}}}
        };
        const countPills = s => (s.match(/class="fq-formula-pill/g) ?? []).length;
        const withoutBonus = DisplayCard.wrapEmojiTooltips(FormulaDisplay.forDisplay("1d6+@str[fire]", actorWith()));
        const withBonus = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("1d6+@str+@bonus.serenityRune[fire]", actorWith())
        );
        expect(countPills(withBonus)).toBe(countPills(withoutBonus));
    });

    // D-13 tenait la bulle ronde HORS du périmètre de la phase 20 : elle gardait
    // son propre analyseur, `DisplayCard.simplifyExpression`. Cette exclusion est
    // LEVÉE (revue du 2026-09-20, constat AUD-2026-09-20-04) : l'analyseur de la
    // bulle lisait `XXX/2` comme « 2X » et `XXXd6` comme « 6Xd », et levait sur
    // un arrondi — une grammaire concurrente de celle de `FormulaDisplay` sur la
    // même notation de carte. Il est supprimé ; la bulle passe par `foldFormula`,
    // ce que couvre « repli symbolique d'une bulle » en tête de fichier (sortie
    // vérifiée identique sur les 29 valeurs de bulle à variable des packs).
    // Ne subsiste ici que ce que D-13 gardait de PROPRE à la bulle : ses deux
    // sorties symboliques, qui ne passent par aucun analyseur.
    it("les sorties propres à la bulle ronde sont inchangées (vide → « 0 », au-delà de 99 → « ∞ »)", () => {
        expect(DisplayCard.getNumberForBubbleCardSvg("")).toBe("0");
        expect(DisplayCard.getNumberForBubbleCardSvg("999999").toString()).toBe("∞");
    });
});

describe("DisplayCard.buildBubbleData — bulle de toucher", () => {

    const realRoll = globalThis.Roll;

    /**
     * Roll minimal qui substitue les données `@` puis évalue l'arithmétique : le
     * bonus d'une arme n'est juste que si la formule de dnd5e est réellement
     * évaluée, ce que le `Roll` constant du harnais ne dirait pas.
     */
    class DataRoll {
        constructor(formula, data = {}) {
            this.formula = String(formula).replace(/@([\w.]+)/g, (match, key) =>
                String(key.split(".").reduce((acc, part) => acc?.[part], data) ?? 0));
        }

        evaluateSync() {
            this.total = Function(`"use strict"; return (${this.formula});`)();
            return this;
        }
    }

    beforeEach(() => {
        globalThis.Roll = DataRoll;
    });

    afterEach(() => {
        globalThis.Roll = realRoll;
    });

    /**
     * Un personnage : ses modificateurs, sa maîtrise et ses armes.
     *
     * @param {object} [options] - `abilities` (modificateurs), `prof`, `items`.
     *
     * @returns {object} Le personnage simulé.
     */
    const hero = ({abilities = {}, prof = 2, items = []} = {}) => ({
        items,
        system: {
            abilities: Object.fromEntries(Object.entries(abilities).map(([key, mod]) => [key, {mod}])),
            attributes: {prof}
        }
    });

    /**
     * Une arme de mêlée équipée : son activité d'attaque passe par `ability` et rend +3 +2.
     *
     * @param {string} ability - La caractéristique de l'activité (celle que dnd5e choisit).
     * @param {string} name    - Le nom de l'arme.
     *
     * @returns {object} L'arme.
     */
    const sword = (ability, name) => makeWeapon("martialM",
        Object.assign(makeAttackActivity({parts: ["@mod", "@prof"], data: {mod: 3, prof: 2}}), {ability}), name);

    /** Les trois formes possibles, pour vérifier qu'une seule est posée à la fois. */
    const shapes = data => ({shield: data.hitShield, die: data.hitDie, burst: data.hitBurst});

    /** Le tooltip tel que le `format` du harnais le rend. */
    const tooltip = (key, how) => key + JSON.stringify({how});

    describe("jet d'attaque : l'écu", () => {

        it("attaque de sort : l'icône de la caractéristique, et le bonus = modificateur + maîtrise", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "ability", hitAbility: "int"},
                null, hero({abilities: {int: 3}}));

            expect(data.hit).toBe("🧠");
            expect(data.hitNumber).toBe("+5");
            expect(data.hitTooltip).toBe(tooltip("FQCARDENGINE.TooltipHitAttack", "FQCARDENGINE.HitOnInt (+5)"));
            expect(shapes(data)).toEqual({shield: true, die: false, burst: false});
        });

        it("le bonus de carte s'ajoute ; une référence de caractéristique se lit sur le personnage", () => {
            const choice = {hitType: "attack", hitSource: "ability", hitAbility: "int", hitBonus: "@dex"};

            expect(DisplayCard.buildBubbleData(choice, null, hero({abilities: {int: 3, dex: 4}})).hitNumber)
                .toBe("+9");
        });

        it("un bonus de carte à dé n'est pas jeté pour dessiner la carte : il ne compte pas", () => {
            const choice = {hitType: "attack", hitSource: "ability", hitAbility: "int", hitBonus: "1d4"};

            expect(DisplayCard.buildBubbleData(choice, null, hero({abilities: {int: 3}})).hitNumber).toBe("+5");
        });

        it("un modificateur négatif garde son signe", () => {
            const choice = {hitType: "attack", hitSource: "ability", hitAbility: "str"};

            expect(DisplayCard.buildBubbleData(choice, null, hero({abilities: {str: -3}})).hitNumber).toBe("-1");
        });

        it("carte d'arme : l'icône et le bonus de l'arme ÉQUIPÉE, son nom dans le tooltip", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "@wpnM"},
                null, hero({items: [sword("str", "Épée longue")]}));

            expect(data.hit).toBe("💪");
            expect(data.hitNumber).toBe("+5");
            expect(data.hitTooltip)
                .toBe(tooltip("FQCARDENGINE.TooltipHitAttack", "FQCARDENGINE.HitOnStr (+5, Épée longue)"));
        });

        it("la même carte avec une arme de finesse : l'icône suit l'arme", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "@wpnM"},
                null, hero({items: [sword("dex", "Dague")]}));

            expect(data.hit).toBe("🎯");
        });

        it("carte d'arme sans personnage : l'icône de l'arme, aucun chiffre", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "@wpnR"}, null, null);

            expect(data.hit).toBe("🏹");
            expect(data.hitNumber).toBeNull();
            expect(data.hitTooltip).toBe(tooltip("FQCARDENGINE.TooltipHitAttack", "FQCARDENGINE.HitWithRangedWeapon"));
        });

        it("carte d'arme, personnage sans arme du bon type : l'icône de l'arme, aucun chiffre", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "@wpnM"}, null, hero());

            expect(data.hit).toBe("⚔️");
            expect(data.hitNumber).toBeNull();
        });

        it("attaque de sort sans personnage : l'icône de la caractéristique, aucun chiffre", () => {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "ability", hitAbility: "wis"},
                null, null);

            expect(data.hit).toBe("🦉");
            expect(data.hitNumber).toBeNull();
            expect(data.hitTooltip).toBe(tooltip("FQCARDENGINE.TooltipHitAttack", "FQCARDENGINE.HitOnWis"));
        });
    });

    describe("jet de sauvegarde : le d20", () => {

        const FIREBALL = {hitType: "save", hitSource: "ability", hitAbility: "int", saveAbility: "dex", damage: "2d8[fire]"};

        it("l'icône de la caractéristique que la CIBLE jette, et le DD = 8 + modificateur du lanceur", () => {
            const data = DisplayCard.buildBubbleData(FIREBALL, null, hero({abilities: {int: 3}}));

            expect(data.hit).toBe("🎯");
            expect(data.hitNumber).toBe("13");
            expect(data.hitTooltip).toBe(tooltip("FQCARDENGINE.TooltipHitSave",
                `FQCARDENGINE.HitOnDex (FQCARDENGINE.HitDc${JSON.stringify({dc: 13})})`));
            expect(shapes(data)).toEqual({shield: false, die: true, burst: false});
        });

        it("un DD imposé par la carte l'emporte", () => {
            expect(DisplayCard.buildBubbleData({...FIREBALL, saveDc: "15"}, null, hero({abilities: {int: 3}})).hitNumber)
                .toBe("15");
        });

        it("sans personnage : l'icône, aucun DD", () => {
            const data = DisplayCard.buildBubbleData(FIREBALL, null, null);

            expect(data.hit).toBe("🎯");
            expect(data.hitNumber).toBeNull();
            expect(data.hitTooltip).toBe(tooltip("FQCARDENGINE.TooltipHitSave", "FQCARDENGINE.HitOnDex"));
        });

        it("une sauvegarde sans caractéristique n'a aucune bulle, même avec des dégâts", () => {
            const data = DisplayCard.buildBubbleData({hitType: "save", saveAbility: "", damage: "2d8[fire]"}, null, null);

            expect(data.hit).toBeNull();
            expect(data.hitTooltip).toBeNull();
            expect(data.hitBurst).toBe(false);
        });
    });

    describe("dégâts bruts : l'étoile d'impact", () => {

        it("des dégâts sans jet pour toucher : l'étoile, son « ! », aucun chiffre", () => {
            const data = DisplayCard.buildBubbleData({hitType: "", damage: "(4+@int+1d8)[fire]"}, null, hero());

            expect(data.hit).toBe("FQCARDENGINE.HitBubbleRaw");
            expect(data.hitNumber).toBeNull();
            expect(data.hitTooltip).toBe("FQCARDENGINE.TooltipHitRaw");
            expect(shapes(data)).toEqual({shield: false, die: false, burst: true});
        });

        it("un choix antérieur au champ de toucher, avec dégâts, est aussi en dégâts bruts", () => {
            expect(DisplayCard.buildBubbleData({damage: "1d6[cold]"}, null, null).hitBurst).toBe(true);
        });

        it("aucune bulle sans jet pour toucher ni dégâts : soin, bonus, pioche…", () => {
            for (const choice of [{}, {hitType: ""}, {hitType: "", damage: ""}, {hitType: "", damage: "  ", heal: "2d4"}]) {
                const data = DisplayCard.buildBubbleData(choice, null, null);
                expect(data.hit, JSON.stringify(choice)).toBeNull();
                expect(shapes(data), JSON.stringify(choice)).toEqual({shield: false, die: false, burst: false});
            }
        });
    });

    it("sans personnage passé, celui de l'utilisateur est pris, comme pour les descriptions", () => {
        const previous = game.user;
        game.user = {...previous, character: hero({abilities: {int: 1}})};
        try {
            const data = DisplayCard.buildBubbleData({hitType: "attack", hitSource: "ability", hitAbility: "int"});

            expect(data.hitNumber).toBe("+3");
        } finally {
            game.user = previous;
        }
    });
});

describe("card-svg.hbs — bulle de toucher", () => {

    const template = fs.readFileSync(path.join(process.cwd(), "src", "templates", "partials", "card-svg.hbs"), "utf8");

    it("dessine une forme pour chacun des trois types, sous leur drapeau", () => {
        for (const flag of ["hitShield", "hitDie", "hitBurst"]) {
            expect(template, flag).toContain(`{{#if ${flag} }}`);
        }
    });

    it("déclare les dégradés de ses trois couleurs", () => {
        for (const gradient of ["hitAttackMana", "hitSaveMana", "hitRawMana"]) {
            expect(template, gradient).toContain(`id="${gradient}"`);
            expect(template, gradient).toContain(`url(#${gradient})`);
        }
    });
});

describe("DisplayCard.buildBubbleData — bulle de rejouabilité", () => {

    it("affiche « P » et le tooltip passif pour un choix passif", () => {
        const data = DisplayCard.buildBubbleData({replayable: "passif"});

        expect(data.replayable).toBe("P");
        expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayablePassive");
    });

    it("affiche « A » et le tooltip automatique pour un choix rejoué de lui-même", () => {
        const data = DisplayCard.buildBubbleData({replayable: "auto"});

        expect(data.replayable).toBe("A");
        expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayableAuto");
    });

    it("affiche « E » et le tooltip éphémère pour un choix éphémère", () => {
        const data = DisplayCard.buildBubbleData({replayable: "ephemere"});

        expect(data.replayable).toBe("E");
        expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayableEphemeral");
    });

    it("n'affiche aucune bulle ni tooltip quand le choix n'est pas rejouable", () => {
        const data = DisplayCard.buildBubbleData({replayable: ""});

        expect(data.replayable).toBeNull();
        expect(data.replayableTooltip).toBeNull();
    });

    describe("valeurs numériques (Roll requis)", () => {
        beforeEach(() => {
            game.user.character.system.abilities = {
                str: {mod: 0}, dex: {mod: 0}, con: {mod: 0}, int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
            };
            globalThis.Roll = vi.fn(function (formula) {
                this.formula = formula;
                this.evaluateSync = () => ({total: Number(formula)});
            });
        });

        it("affiche le nombre de charges et le tooltip correspondant", () => {
            const data = DisplayCard.buildBubbleData({replayable: "3"});

            expect(data.replayable).toBe(3);
            expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayableCharges");
        });

        it("affiche « ∞ » et le tooltip de rejouabilité sans limite au-delà de 99", () => {
            const data = DisplayCard.buildBubbleData({replayable: "999999"});

            expect(data.replayable).toBe("∞");
            expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayableInfinite");
        });
    });
});

describe("DisplayCard.fitDescriptionSize (passe de correction post-rendu du débordement de description)", () => {

    /**
     * Construit une boîte de description avec des métriques de layout simulées
     * (jsdom ne fait pas de mise en page) : la hauteur du span est une fonction
     * de la taille de police courante, comme dans un vrai rendu.
     *
     * @param {object} [opts] Les métriques simulées.
     * @returns {{box: HTMLElement, span: HTMLElement}} La boîte et son span.
     */
    function makeMeasuredBox({
        fontSize = 40,
        boxHeight = 266,
        boxWidth = 462,
        spanHeightFor = () => 0,
        spanWidthFor = () => 0,
    } = {}) {
        const box = document.createElement("div");
        box.className = "fq-card-description-box";
        if (fontSize !== null) {
            box.style.fontSize = `${fontSize}px`;
        }
        const span = document.createElement("span");
        span.className = "fq-card-description";
        span.textContent = "Description mesurée";
        box.appendChild(span);
        Object.defineProperty(box, "clientHeight", {get: () => boxHeight});
        Object.defineProperty(box, "clientWidth", {get: () => boxWidth});
        Object.defineProperty(span, "offsetHeight", {get: () => spanHeightFor(parseFloat(box.style.fontSize))});
        Object.defineProperty(span, "offsetWidth", {get: () => spanWidthFor(parseFloat(box.style.fontSize))});
        return {box, span};
    }

    it("ne touche pas la taille quand le texte tient déjà dans la boîte", () => {
        const {box} = makeMeasuredBox({fontSize: 40, spanHeightFor: () => 200});

        DisplayCard.fitDescriptionSize(box);

        expect(box.style.fontSize).toBe("40px");
    });

    it("réduit la taille juste assez pour que le texte tienne en hauteur", () => {
        // Hauteur simulée proportionnelle à la police : déborde à 40px (320 > 266),
        // tient à partir de 33px (264 <= 266).
        const {box} = makeMeasuredBox({fontSize: 40, spanHeightFor: size => size * 8});

        DisplayCard.fitDescriptionSize(box);

        expect(box.style.fontSize).toBe("33px");
    });

    it("réduit aussi sur un débordement horizontal (mot insécable trop large)", () => {
        const {box} = makeMeasuredBox({fontSize: 20, spanWidthFor: size => size * 25});

        DisplayCard.fitDescriptionSize(box);

        expect(box.style.fontSize).toBe("18px");
    });

    it("ne descend jamais sous le plancher minSize, même si le texte déborde toujours", () => {
        const {box} = makeMeasuredBox({fontSize: 40, spanHeightFor: () => 10000});

        DisplayCard.fitDescriptionSize(box);

        expect(box.style.fontSize).toBe("10px");
    });

    it("accepte un conteneur parent et traite toutes les boîtes qu'il contient", () => {
        const root = document.createElement("div");
        const fits = makeMeasuredBox({fontSize: 30, spanHeightFor: () => 100});
        const overflows = makeMeasuredBox({fontSize: 40, spanHeightFor: size => size * 8});
        root.append(fits.box, overflows.box);

        DisplayCard.fitDescriptionSize(root);

        expect(fits.box.style.fontSize).toBe("30px");
        expect(overflows.box.style.fontSize).toBe("33px");
    });

    it("no-op quand la boîte n'est pas affichée (clientHeight nul, cas jsdom/display:none)", () => {
        const box = document.createElement("div");
        box.className = "fq-card-description-box";
        box.style.fontSize = "40px";
        const span = document.createElement("span");
        span.className = "fq-card-description";
        box.appendChild(span);

        expect(() => DisplayCard.fitDescriptionSize(box)).not.toThrow();
        expect(box.style.fontSize).toBe("40px");
    });

    it("no-op sans font-size inline (rien à corriger sans point de départ de la table)", () => {
        const {box} = makeMeasuredBox({fontSize: null, spanHeightFor: () => 10000});

        expect(() => DisplayCard.fitDescriptionSize(box)).not.toThrow();
        expect(box.style.fontSize).toBe("");
    });

    it("no-op sur une racine sans DOM (garde défensive)", () => {
        expect(() => DisplayCard.fitDescriptionSize(null)).not.toThrow();
        expect(() => DisplayCard.fitDescriptionSize(undefined)).not.toThrow();
    });
});

// ─── Gemme de spécialisations ─────────────────────────────────────────────────
//
// La gemme est la seule géométrie que le JS calcule pour la carte : Handlebars ne
// divise pas, et l'angle d'un quartier dépend du nombre de spés. Le gabarit ne
// tient aucune coordonnée de lui-même, ce que le dernier bloc vérifie.

/**
 * Une carte réduite à ce que lit la gemme : sa classe et ses spés.
 *
 * @param {string} fqClass - La classe FQ de la carte.
 * @param {string[]} specs - Les identifiants de spés portés par la carte.
 *
 * @returns {object} Une carte factice.
 */
function cardWithSpecs(fqClass, specs) {
    return {system: {fq: {class: fqClass, specs: new Set(specs)}}};
}

describe("DisplayCard.cardSpecs — les spés d'une carte", () => {

    it("rend chaque spé avec sa clé de libellé, pour l'infobulle", () => {
        const specs = DisplayCard.cardSpecs(cardWithSpecs("monk", ["monk.palm"]));

        expect(specs).toEqual([{id: "monk.palm", label: "FQCARDENGINE.SpecMonkPalm"}]);
    });

    it("ne retient que les spés de la classe de la carte", () => {
        // La classe fait foi : une spé héritée d'une autre classe devient muette,
        // sans que les données de la carte soient retouchées.
        const card = cardWithSpecs("monk", ["monk.chain", "elementalist.fire"]);

        expect(DisplayCard.cardSpecs(card).map(spec => spec.id)).toEqual(["monk.chain"]);
    });

    it("rend une liste vide pour une carte sans spé, ou sans carte du tout", () => {
        expect(DisplayCard.cardSpecs(cardWithSpecs("neutral", []))).toEqual([]);
        expect(DisplayCard.cardSpecs(null)).toEqual([]);
        expect(DisplayCard.cardSpecs()).toEqual([]);
    });
});

describe("DisplayCard.buildSpecGem — découpe de la gemme", () => {

    /**
     * Les quartiers d'une carte d'Élémentaliste portant les `count` premières spés
     * de sa classe.
     *
     * @param {number} count - Le nombre de spés à poser sur la carte.
     *
     * @returns {{id: string, label: string, facet: string}[]} Les quartiers.
     */
    function facetsOf(count) {
        const specs = ["fire", "frost", "earth", "air"].slice(0, count)
            .map(spec => `elementalist.${spec}`);
        return DisplayCard.buildSpecGem(cardWithSpecs("elementalist", specs)).specs;
    }

    it("ne découpe rien sans spé, mais rend tout de même la pierre au gabarit", () => {
        const {specs, gem} = DisplayCard.buildSpecGem(cardWithSpecs("monk", []));

        expect(specs).toEqual([]);
        expect(gem.radius).toBeGreaterThan(0);
    });

    it("tient dans le cadre de description, qui va de (23, 408) à (485, 670)", () => {
        // Le cercle déborderait sur l'illustration ou hors de la carte sans ça.
        const {gem} = DisplayCard.buildSpecGem(cardWithSpecs("monk", ["monk.palm"]));

        expect(gem.cx - gem.radius).toBeGreaterThan(23);
        expect(gem.cx + gem.radius).toBeLessThan(485);
        expect(gem.cy - gem.radius).toBeGreaterThan(408);
        expect(gem.cy + gem.radius).toBeLessThan(670);
    });

    it("fait une pierre d'un bloc pour une spé seule, en deux arcs", () => {
        // Un seul arc ne peut pas fermer un cercle : ses extrémités se confondraient
        // et le navigateur ne tracerait rien.
        const [facet] = facetsOf(1);

        expect(facet.facet).toMatch(/^M .* a .* a .* Z$/);
        expect(facet.facet).not.toContain("L");
    });

    it("découpe des parts depuis le centre dès qu'il y a plusieurs spés", () => {
        const {gem} = DisplayCard.buildSpecGem(cardWithSpecs("elementalist", ["elementalist.fire"]));

        for (const count of [2, 3, 4]) {
            const facets = facetsOf(count);

            expect(facets, `${count} spés`).toHaveLength(count);
            for (const {facet} of facets) {
                // Chaque part part du centre, file vers le bord et revient par un arc.
                expect(facet, `${count} spés`).toContain(`M ${gem.cx} ${gem.cy} L `);
                expect(facet, `${count} spés`).toContain(` A ${gem.radius} ${gem.radius} `);
            }
            // Deux parts ne se superposent jamais.
            expect(new Set(facets.map(spec => spec.facet)).size, `${count} spés`).toBe(count);
        }
    });

    it("part de midi et tourne dans le sens des aiguilles d'une montre", () => {
        const {gem} = DisplayCard.buildSpecGem(cardWithSpecs("elementalist", ["elementalist.fire"]));
        const [first, second] = facetsOf(4);

        // La première part s'ouvre à midi et se referme à l'est.
        expect(first.facet).toContain(`L ${gem.cx} ${gem.cy - gem.radius}`);
        expect(first.facet).toContain(`1 ${gem.cx + gem.radius} ${gem.cy}`);
        // La suivante reprend là où elle s'arrête.
        expect(second.facet).toContain(`L ${gem.cx + gem.radius} ${gem.cy}`);
    });

    it("ordonne les quartiers comme la classe déclare ses spés, pas comme on les a cochés", () => {
        const card = cardWithSpecs("elementalist", ["elementalist.air", "elementalist.fire"]);

        expect(DisplayCard.buildSpecGem(card).specs.map(spec => spec.id))
            .toEqual(["elementalist.fire", "elementalist.air"]);
    });
});

describe("card-svg.hbs — gemme de spécialisations", () => {

    const template = fs.readFileSync(path.join(process.cwd(), "src", "templates", "partials", "card-svg.hbs"), "utf8");

    it("ne dessine la gemme que sous son drapeau", () => {
        expect(template).toContain("{{#if specs}}");
    });

    it("étiquette chaque quartier pour la feuille de style, sans couleur en dur", () => {
        expect(template).toContain(`class="fq-spec-facet"`);
        expect(template).toContain(`data-fq-spec="{{ id }}"`);
        expect(template).toContain(`d="{{ facet }}"`);
    });

    it("ne tient aucune coordonnée de lui-même : tout vient de `SPEC_GEM`", () => {
        for (const coordinate of ["gem.cx", "gem.cy", "gem.radius"]) {
            expect(template, coordinate).toContain(coordinate);
        }
    });

    it("bombe la pierre comme les bulles rondes de la carte", () => {
        expect(template).toContain(`id="specGemShine"`);
        expect(template).toContain("url(#specGemShine)");
    });

    it("dessine la gemme APRÈS le texte de la description, qu'elle ne rétrécit pas", () => {
        // Le texte garde la pleine largeur du cadre ; la gemme se pose par-dessus
        // dans son coin, et c'est l'ordre du balisage qui le garantit.
        expect(template).toContain(`<foreignObject x="23" y="404" width="462" height="266">`);
        expect(template.indexOf("fq-spec-facet")).toBeGreaterThan(template.indexOf("fq-card-description"));
    });
});
