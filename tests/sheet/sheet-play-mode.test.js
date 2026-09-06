import {afterEach, describe, expect, test} from "vitest";
import {lockPlayMode, removeModeToggle} from "../../src/domain/interface/sheet/sheet-play-mode.js";

// Les feuilles FQ étendent des classes dnd5e absentes des tests : on n'instancie
// donc pas de vraie feuille, mais un double minimal exposant ce que les deux
// helpers manipulent (le mode courant, les MODES de la classe, l'élément racine).
function makeSheet(mode = 2, html = "<div class=\"window-header\"><slide-toggle class=\"mode-slider\"></slide-toggle></div>") {
    const element = document.createElement("div");
    element.innerHTML = html;
    return {
        _mode: mode,
        element,
        constructor: {MODES: {PLAY: 1, EDIT: 2}},
    };
}

describe("sheet-play-mode", () => {

    afterEach(() => {
        CONFIG.FqCardEngine.options.playerLimitCardsRight = false;
    });

    describe("lockPlayMode", () => {
        test("force le mode jeu pour un joueur aux droits limités", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            const sheet = makeSheet();

            expect(lockPlayMode(sheet)).toBe(true);
            expect(sheet._mode).toBe(1);
        });

        test("laisse le mode intact quand la limitation est inactive", () => {
            const sheet = makeSheet();

            expect(lockPlayMode(sheet)).toBe(false);
            expect(sheet._mode).toBe(2);
        });

        test("laisse le mode intact pour le MJ", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            game.user.isGM = true;
            const sheet = makeSheet();

            expect(lockPlayMode(sheet)).toBe(false);
            expect(sheet._mode).toBe(2);
        });
    });

    describe("removeModeToggle", () => {
        test("retire la bascule de l'en-tête pour un joueur aux droits limités", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            const sheet = makeSheet();

            expect(removeModeToggle(sheet)).toBe(true);
            expect(sheet.element.querySelector(".mode-slider")).toBeNull();
            expect(sheet._mode).toBe(1);
        });

        test("conserve la bascule quand la limitation est inactive", () => {
            const sheet = makeSheet();

            expect(removeModeToggle(sheet)).toBe(false);
            expect(sheet.element.querySelector(".mode-slider")).not.toBeNull();
        });

        test("tolère une feuille pas encore rendue", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            const sheet = makeSheet();
            sheet.element = null;

            expect(removeModeToggle(sheet)).toBe(true);
            expect(sheet._mode).toBe(1);
        });
    });
});
