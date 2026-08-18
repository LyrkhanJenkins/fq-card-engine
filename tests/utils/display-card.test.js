import {beforeEach, describe, expect, it, vi} from "vitest";
import fs from "fs";
import path from "path";
import DisplayCard from "../../src/domain/interface/shared/display-card.js";
import {ABILITY_EMOJIS, DAMAGE_TYPE_EMOJIS, EMOJI_TOOLTIP_KEYS, WEAPON_EMOJIS} from "../../src/domain/interface/shared/formula-display.js";

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
    it("choisit la taille de police en franchissant les seuils de longueur de description", () => {
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(1))).toBe(40);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(80))).toBe(36);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(81))).toBe(34);
        expect(DisplayCard.getDescriptionSizeForCardSvg("a".repeat(500))).toBe(16);
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
        expect(result).toBe("Desc 2(💪){}");
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
        expect(result).toBe("3(🧠) -1(🦉) 0(✨️) 2(💪) 1(🎯) 4(❤️)");
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
});

describe("DisplayCard.wrapEmojiTooltips (AFF-04)", () => {
    it("enveloppe chaque emoji connu d'un span data-tooltip avec sa clé i18n", () => {
        expect(DisplayCard.wrapEmojiTooltips("2d6+4 (⚔️💪) [🔪]")).toBe(
            "2d6+4 (<span data-tooltip=\"FQCARDENGINE.TooltipWeaponMelee\">⚔️</span>" +
            "<span data-tooltip=\"FQCARDENGINE.TooltipAbilityStr\">💪</span>) " +
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
});
