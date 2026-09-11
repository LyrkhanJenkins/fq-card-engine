import {afterEach, describe, expect, test} from "vitest";
import {
    lockPlayMode, removeModeToggle, RIGHTS_LIMITED_CLASS, stripEditingContextOptions
} from "../../src/domain/interface/sheet/sheet-play-mode.js";

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

        test("marque la fenêtre pour masquer les boutons de création et d'édition", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            const sheet = makeSheet();

            removeModeToggle(sheet);

            expect(sheet.element.classList.contains(RIGHTS_LIMITED_CLASS)).toBe(true);
        });

        test("retire la marque quand la limitation est inactive", () => {
            const sheet = makeSheet();
            sheet.element.classList.add(RIGHTS_LIMITED_CLASS);

            removeModeToggle(sheet);

            expect(sheet.element.classList.contains(RIGHTS_LIMITED_CLASS)).toBe(false);
        });
    });

    describe("stripEditingContextOptions", () => {
        const menu = () => [
            {name: "DND5E.ItemView"},
            {name: "DND5E.ContextMenuActionEdit"},
            {name: "DND5E.ContextMenuActionDuplicate"},
            {name: "DND5E.ContextMenuActionDelete"},
            {name: "DND5E.Scroll.CreateScroll"},
            {name: "DND5E.ContextMenuActionEquip"}
        ];

        test("retire sur place les entrées d'édition pour un joueur aux droits limités", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            const menuItems = menu();

            stripEditingContextOptions(menuItems);

            expect(menuItems.map(e => e.name)).toEqual(["DND5E.ItemView", "DND5E.ContextMenuActionEquip"]);
        });

        test("laisse le menu intact quand la limitation est inactive", () => {
            const menuItems = menu();

            stripEditingContextOptions(menuItems);

            expect(menuItems).toHaveLength(6);
        });
    });
});
