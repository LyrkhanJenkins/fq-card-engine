import {beforeEach, describe, expect, it, vi} from "vitest";
import fs from "fs";
import path from "path";
import DisplayCard from "../../src/domain/interface/card-svg/display-card.js";
import FormulaDisplay, {
    ABILITY_EMOJIS, CAP_LABEL_KEYS, DAMAGE_TYPE_EMOJIS, EMOJI_TOOLTIP_KEYS, SOURCE_LABEL_KEYS, WEAPON_EMOJIS
} from "../../src/domain/interface/card-svg/formula-display.js";
import {expandPills, makePill, PILL_SOURCE, PILL_TYPE, sanitizePillInput, stripPills} from "../../src/domain/interface/card-svg/formula-pill.js";
import {actorWith, makeReferenceActor, NEUTRAL_ABILITIES, REFERENCE_ABILITIES} from "./formula-fixtures.js";

describe("DisplayCard.simplifyExpression", () => {

    describe("cas nominaux", () => {
        it("additionne des constantes", () => {
            expect(DisplayCard.simplifyExpression("1+5")).toBe("6");
        });

        it("combine constantes et multiplication implicite d'une variable", () => {
            expect(DisplayCard.simplifyExpression("5 + 3 + 4*X")).toBe("8+4X");
        });

        it("simplifie une multiplication explicite constante*variable", () => {
            expect(DisplayCard.simplifyExpression("2*X")).toBe("2X");
        });

        it("annule une variable soustraite à elle-même", () => {
            expect(DisplayCard.simplifyExpression("X-X")).toBe("0");
        });
    });

    describe("cas d'erreur (Error native, pas FormError)", () => {
        it("lève une erreur si la parenthèse fermante est absente", () => {
            expect(() => DisplayCard.simplifyExpression("(1+2"))
                .toThrow("Parenthèse fermante attendue");
        });

        it("lève une erreur si l'expression est incomplète", () => {
            expect(() => DisplayCard.simplifyExpression("1+"))
                .toThrow("Expression incomplète");
        });

        it("lève une erreur sur un produit de deux variables", () => {
            expect(() => DisplayCard.simplifyExpression("X*Y"))
                .toThrow("Produit de deux variables");
        });

        it("lève une erreur si des tokens restent non consommés", () => {
            expect(() => DisplayCard.simplifyExpression("1)"))
                .toThrow("Tokens non consommés");
        });

        it("lève des instances d'Error natives (pas de FormError)", () => {
            let caught;
            try {
                DisplayCard.simplifyExpression("(1+2");
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(Error);
            expect(caught.constructor.name).toBe("Error");
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

    it("retombe sur data.faces[data.face].text quand faces est absent", () => {
        const card = {
            face: 1,
            system: {fq: {choices: []}},
            data: {face: 1, faces: {1: {text: "Fallback text"}}}
        };
        const result = DisplayCard.getDescriptionFromCard(card);
        expect(result).toBe("Fallback text{}");
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

    it("retombe sur data.faces[data.face].img quand faces est absent", () => {
        const card = {
            face: 1,
            back: {img: "back.png"},
            data: {face: 1, faces: {1: {img: "fallback.png"}}}
        };
        expect(DisplayCard.getImgFromCard(card)).toBe("fallback.png");
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

    it("chaque clé de SOURCE_LABEL_KEYS, plus SourceWeaponNone et SourceAbilityUnknown, existe dans lang/fr.json ET lang/en.json", () => {
        const fr = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/fr.json"), "utf-8"));
        const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../lang/en.json"), "utf-8"));
        const keys = [
            ...Object.values(SOURCE_LABEL_KEYS),
            "FQCARDENGINE.SourceWeaponNone",
            "FQCARDENGINE.SourceAbilityUnknown"
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
            "data-tooltip=\"FQCARDENGINE.SourceWeaponMelee — Épée longue (1d8 + 3)\""
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
            system: {abilities: {...NEUTRAL_ABILITIES}, fq: {bonus: {cards: {serenityRune: 2}}}}
        };
        const countPills = s => (s.match(/class="fq-formula-pill/g) ?? []).length;
        const withoutBonus = DisplayCard.wrapEmojiTooltips(FormulaDisplay.forDisplay("1d6+@str[fire]", actorWith()));
        const withBonus = DisplayCard.wrapEmojiTooltips(
            FormulaDisplay.forDisplay("1d6+@str+@bonus.serenityRune[fire]", actorWith())
        );
        expect(countPills(withBonus)).toBe(countPills(withoutBonus));
    });

    it("DisplayCard.getNumberForBubbleCardSvg et DisplayCard.simplifyExpression conservent leur comportement historique (D-13, bulles rondes hors périmètre)", () => {
        expect(DisplayCard.simplifyExpression("5 + 3 + 4*X")).toBe("8+4X");
        expect(DisplayCard.simplifyExpression("1+5")).toBe("6");
        expect(DisplayCard.getNumberForBubbleCardSvg("")).toBe("0");
        expect(DisplayCard.getNumberForBubbleCardSvg("999999").toString()).toBe("∞");
    });
});

describe("DisplayCard.buildBubbleData — bulle de rejouabilité", () => {

    it("affiche « P » et le tooltip passif pour un choix passif", () => {
        const data = DisplayCard.buildBubbleData({replayable: "passif"});

        expect(data.replayable).toBe("P");
        expect(data.replayableTooltip).toBe("FQCARDENGINE.TooltipReplayablePassive");
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
