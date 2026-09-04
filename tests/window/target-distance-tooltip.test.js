import {beforeEach, describe, expect, test, vi} from "vitest";

// Mocks requis par le harnais (vi.mock hissé par fichier). Bloc canonique des
// suites du harnais : le module n'importe pas les feuilles, mais ses imports
// transitifs (card-fq-system, etc.) en dépendent.
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld} = await import("../decks/play-harness.js");
const TargetDistanceTooltip = (await import("../../src/domain/interface/targeting/target-distance-tooltip.js")).default;

/** Hooks enregistrés par le module, indexés par identifiant rendu par `Hooks.on`. */
let registered;

/**
 * Déclenche tous les handlers enregistrés pour un hook donné.
 *
 * @param {string}   name    - Le nom du hook.
 * @param {...any}   args    - Les arguments transmis aux handlers.
 *
 * @returns {void}
 */
function fire(name, ...args) {
    for (const entry of registered.values()) {
        if (entry.name === name) {
            entry.fn(...args);
        }
    }
}

/**
 * Token synthétique placé sur la grille du monde de test (case de 5 px).
 *
 * @param {number} x - L'abscisse (px) du token.
 *
 * @returns {object} Un token survolable.
 */
function tokenAt(x) {
    return {name: "Survolé", document: {x, y: 5, width: 1, height: 1}};
}

/**
 * Rend l'élément d'infobulle présent dans le document, s'il existe.
 *
 * @returns {?HTMLElement} L'infobulle, ou null.
 */
function tooltip() {
    return document.querySelector(".fq-play-distance-tooltip");
}

beforeEach(() => {
    TargetDistanceTooltip.deactivate();
    mountWorld();
    document.body.innerHTML = "";
    registered = new Map();
    let nextId = 1;
    globalThis.Hooks = {
        on: vi.fn((name, fn) => {
            const id = nextId++;
            registered.set(id, {name, fn});
            return id;
        }),
        off: vi.fn((name, id) => registered.delete(id)),
        once: vi.fn(), call: vi.fn(), callAll: vi.fn(),
    };
});

describe("TargetDistanceTooltip — cycle de vie", () => {
    test("hors activation, aucun hook et aucune infobulle", () => {
        expect(registered.size).toBe(0);
        expect(tooltip()).toBeNull();
    });

    test("activate écoute le survol des tokens", () => {
        TargetDistanceTooltip.activate();
        expect([...registered.values()].map(e => e.name)).toEqual(["hoverToken"]);
    });

    test("activate est idempotent (un seul hook malgré deux entrées en ciblage)", () => {
        TargetDistanceTooltip.activate();
        TargetDistanceTooltip.activate();
        expect(registered.size).toBe(1);
    });

    test("deactivate retire le hook et l'infobulle du document", () => {
        TargetDistanceTooltip.activate();
        fire("hoverToken", tokenAt(0), true);
        expect(tooltip()).not.toBeNull();

        TargetDistanceTooltip.deactivate();
        expect(registered.size).toBe(0);
        expect(tooltip()).toBeNull();
    });
});

describe("TargetDistanceTooltip — distance affichée", () => {
    beforeEach(() => TargetDistanceTooltip.activate());

    test("survol d'un token à une case → unité au singulier", () => {
        fire("hoverToken", tokenAt(0), true);
        expect(tooltip().textContent).toBe("1 FQCARDENGINE.TargetingPanelSquare");
    });

    test("survol d'un token à deux cases → unité au pluriel", () => {
        fire("hoverToken", tokenAt(15), true);
        expect(tooltip().textContent).toBe("2 FQCARDENGINE.TargetingPanelSquares");
    });

    test("fin du survol → infobulle masquée mais conservée", () => {
        fire("hoverToken", tokenAt(0), true);
        fire("hoverToken", tokenAt(0), false);
        expect(tooltip().classList.contains("fq-play-distance-tooltip--visible")).toBe(false);
    });

    test("lanceur absent de la scène → aucune distance affichée", () => {
        mountWorld({user: {character: null}});
        fire("hoverToken", tokenAt(0), true);
        expect(tooltip()).toBeNull();
    });

    test("l'infobulle suit le curseur", () => {
        document.dispatchEvent(new MouseEvent("mousemove", {clientX: 100, clientY: 200}));
        fire("hoverToken", tokenAt(0), true);
        expect(tooltip().style.left).toBe(`${100 + TargetDistanceTooltip.CURSOR_OFFSET.x}px`);
        expect(tooltip().style.top).toBe(`${200 + TargetDistanceTooltip.CURSOR_OFFSET.y}px`);
    });
});
