import {beforeEach, describe, expect, test, vi} from "vitest";
import {makeCard, makeChoice} from "../factories.js";
import {PILE_TYPE} from "../../src/domain/trading/trading-cards.js";

// ─── Mocks des feuilles Foundry (couplées à dnd5e / DOM, hors périmètre ici) ──
// Couture identique à tests/window/play-dialog.test.js : vi.mock est hissé PAR
// FICHIER (limitation Vitest), donc redéclaré ici.
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

vi.mock("../../src/domain/engine/play-card.js", () => ({
    default: {
        discardCard: vi.fn(),
        callBackplayCard: vi.fn().mockResolvedValue(null),
        renderChatMessage: vi.fn()
    }
}));

globalThis.socketlib = {
    registerModule: vi.fn(() => ({register: vi.fn()}))
};

// Import dynamique APRÈS les mocks : peuple window.FqCardEngineModule sans
// dépendre du rendu DOM réel (Handlebars/Dialog restent mockés ci-dessous).
await import("../../src/init-engine.js");

globalThis.CONST.DOCUMENT_OWNERSHIP_LEVELS = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};

/**
 * Construit un choix de carte jouable, avec un champ `damage` portant une
 * variable `XXX` (pilote le vrai listener `change` de `input[name="XXX"]`,
 * jamais une ré-implémentation du re-rendu).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un choix de carte jouable, avec `damage: "XXXd6"` par défaut.
 */
function makeVariableChoice(overrides = {}) {
    return makeChoice({replayable: "", damage: "XXXd6", targetType: "Default", ...overrides});
}

/**
 * Construit une carte jouable par `playDialog`, dont la description
 * interpole `{0_damage}` (le champ `damage` du premier choix).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Une carte jouable, une seule face, un seul choix par défaut.
 */
function makePlayableCard(overrides = {}) {
    return makeCard({
        face: 0,
        faces: {0: {text: "{0_damage}"}},
        system: {
            fq: {
                maxSameCard: 1,
                class: "neutral",
                level: 1,
                isBase: false,
                choices: [makeVariableChoice()]
            }
        },
        ...overrides
    });
}

/**
 * Construit une pile de défausse espionnable, filtrable par `playDialog`.
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Une pile de défausse simple.
 */
function makePile(overrides = {}) {
    return {
        id: "pile-1",
        system: {fq: {type: PILE_TYPE}},
        testUserPermission: vi.fn(() => true),
        ...overrides
    };
}

/**
 * Construit une main (`Cards` de type hand) navigable par `playDialog`, avec
 * la permission OWNER par défaut (jeu autorisé).
 *
 * @param {object[]} cards       Les cartes de la main (insérées dans un `Set`).
 * @param {object}   [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Une main simple.
 */
function makeHand(cards, overrides = {}) {
    return {
        id: "hand-1",
        permission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        cards: new Set(cards),
        ...overrides
    };
}

/**
 * Construit une racine jsdom minimale reproduisant le fragment de dialog
 * consommé par `refreshDescription` : le formulaire (`form.cards-dialog`,
 * avec les champs `XXX`/`YYY` demandés) et le conteneur de description
 * (`.fq-card-description-box` / `.fq-card-description`), avec un texte
 * initial sentinelle pour prouver qu'un re-rendu a bien eu lieu.
 *
 * @param {{withX?: boolean, withY?: boolean, withDescription?: boolean}} [opts] Les éléments à inclure.
 * @returns {HTMLElement} La racine du fragment.
 */
function makeDialogRoot({withX = true, withY = false, withDescription = true} = {}) {
    const root = document.createElement("div");
    const xField = withX ? "<input type=\"number\" name=\"XXX\">" : "";
    const yField = withY ? "<input type=\"number\" name=\"YYY\">" : "";
    const description = withDescription
        ? "<div class=\"fq-card-description-box\" style=\"font-size: 40px\">"
        + "<span class=\"fq-card-description\">SENTINEL-INITIAL</span></div>"
        : "";
    root.innerHTML = `<form class="cards-dialog">${xField}${yField}</form>${description}`;
    return root;
}

/**
 * Récupère le callback passé au dernier appel `Hooks.once("renderDialog", cb)`.
 *
 * @returns {Function} Le callback capturé.
 */
function lastRenderDialogCallback() {
    const calls = Hooks.once.mock.calls.filter(call => call[0] === "renderDialog");
    return calls[calls.length - 1][1];
}

describe("card-actions.js — refreshDescription (re-rendu vivant de la description au changement de X/Y, AFF-09)", () => {
    let card;
    let pile;
    let currentCards;

    beforeEach(() => {
        vi.clearAllMocks();

        card = makePlayableCard({id: "card-1", _id: "card-1", sort: 1});
        pile = makePile();
        currentCards = makeHand([card]);

        globalThis.Dialog = {wait: vi.fn()};
        globalThis.ui = {
            notifications: {
                warn: vi.fn(),
                error: vi.fn()
            }
        };
        globalThis.game = {
            cards: [currentCards, pile],
            user: {
                character: {
                    name: "Test Character",
                    img: "character.png",
                    items: [],
                    system: {
                        attributes: {hp: {value: 8, max: 10}},
                        abilities: {},
                        fq: {
                            action: {value: 3, max: 5},
                            mana: {value: 2, max: 4},
                            zeal: {value: 1, max: 8},
                            cards: {currentDrop: 0}
                        }
                    }
                },
                targets: new Set()
            },
            i18n: {
                localize: (key) => key,
                format: (key, obj) => `${key} ${JSON.stringify(obj)}`
            },
            combat: null
        };
        // FormDataExtended réel (pas un mock à valeur constante, contrairement à
        // play-dialog.test.js) : lit les VRAIES valeurs du formulaire DOM via
        // l'API FormData de jsdom, pour piloter le vrai listener `change`.
        globalThis.foundry.applications.ux = {
            FormDataExtended: vi.fn().mockImplementation(function (form) {
                this.object = Object.fromEntries(new FormData(form).entries());
            })
        };
    });

    test("Test 1 : au change du champ XXX, .fq-card-description est remplacé par la description recalculée avec la valeur saisie", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true});

        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

        const input = root.querySelector("input[name=\"XXX\"]");
        input.value = "3";
        input.dispatchEvent(new Event("change", {bubbles: true}));

        const span = root.querySelector(".fq-card-description");
        expect(span.innerHTML).toContain("3d6");
        expect(span.innerHTML).not.toContain("Xd6");
        expect(span.innerHTML).not.toContain("SENTINEL-INITIAL");
    });

    test("Test 2 : au change du champ YYY, le même re-rendu a lieu", async () => {
        const cardWithY = makePlayableCard({
            id: "card-y", _id: "card-y", sort: 1,
            system: {
                fq: {
                    maxSameCard: 1, class: "neutral", level: 1, isBase: false,
                    choices: [makeVariableChoice({damage: "YYYd4"})]
                }
            }
        });
        currentCards = makeHand([cardWithY]);
        globalThis.game.cards = [currentCards, pile];

        await window.FqCardEngineModule.playDialog(currentCards, cardWithY);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: false, withY: true});

        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

        const input = root.querySelector("input[name=\"YYY\"]");
        input.value = "2";
        input.dispatchEvent(new Event("change", {bubbles: true}));

        const span = root.querySelector(".fq-card-description");
        expect(span.innerHTML).toContain("2d4");
        expect(span.innerHTML).not.toContain("Yd4");
    });

    test("Test 3 : le font-size de .fq-card-description-box est recalculé sur le texte visible de la nouvelle description", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true});

        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

        const input = root.querySelector("input[name=\"XXX\"]");
        input.value = "3";
        input.dispatchEvent(new Event("change", {bubbles: true}));

        const DisplayCard = (await import("../../src/domain/interface/card-svg/display-card.js")).default;
        const box = root.querySelector(".fq-card-description-box");
        const span = root.querySelector(".fq-card-description");
        const expectedSize = DisplayCard.getDescriptionSizeForCardSvg(span.textContent);
        expect(box.style.fontSize).toBe(`${expectedSize}px`);
    });

    test("Test 4 : un champ vidé revient à l'affichage symbolique", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true});

        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

        const input = root.querySelector("input[name=\"XXX\"]");
        input.value = "3";
        input.dispatchEvent(new Event("change", {bubbles: true}));
        expect(root.querySelector(".fq-card-description").innerHTML).toContain("3d6");

        input.value = "";
        input.dispatchEvent(new Event("change", {bubbles: true}));
        expect(root.querySelector(".fq-card-description").innerHTML).toContain("Xd6");
        expect(root.querySelector(".fq-card-description").innerHTML).not.toContain("3d6");
    });

    test("Test 5 : le re-rendu ne touche pas la racine de la dialog, ni le panneau de ciblage, ni les bulles rondes", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true});
        // Panneau de ciblage et bulle ronde témoins : leur contenu ne doit pas
        // bouger (D-13, hors périmètre) au changement de X/Y.
        const panel = document.createElement("div");
        panel.className = "fq-play-targets-content";
        panel.textContent = "PANEL-SENTINEL";
        root.appendChild(panel);
        const rootChildCountBefore = root.children.length;

        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

        const input = root.querySelector("input[name=\"XXX\"]");
        input.value = "3";
        input.dispatchEvent(new Event("change", {bubbles: true}));

        expect(root.querySelector(".fq-play-targets-content").textContent).toBe("PANEL-SENTINEL");
        expect(root.children.length).toBe(rootChildCountBefore);
    });

    test("Test 6 : une carte sans variable (aucun champ XXX/YYY) ne provoque aucun re-rendu et aucune erreur", async () => {
        const cardNoVariable = makePlayableCard({
            id: "card-novar", _id: "card-novar", sort: 1,
            system: {
                fq: {
                    maxSameCard: 1, class: "neutral", level: 1, isBase: false,
                    choices: [makeChoice({replayable: "", damage: "1d6", targetType: "Default"})]
                }
            }
        });
        currentCards = makeHand([cardNoVariable]);
        globalThis.game.cards = [currentCards, pile];

        await window.FqCardEngineModule.playDialog(currentCards, cardNoVariable);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: false, withY: false});

        expect(() => cb({element: root, close: vi.fn().mockResolvedValue(null)}, null)).not.toThrow();
        expect(root.querySelector(".fq-card-description").innerHTML).toContain("SENTINEL-INITIAL");
    });

    test("un fragment sans .fq-card-description ne provoque aucune exception au change (garde défensive, comme renderPanel)", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true, withDescription: false});

        expect(() => cb({element: root, close: vi.fn().mockResolvedValue(null)}, null)).not.toThrow();

        const input = root.querySelector("input[name=\"XXX\"]");
        expect(() => {
            input.value = "3";
            input.dispatchEvent(new Event("change", {bubbles: true}));
        }).not.toThrow();
    });

    test("aucun second écouteur change n'est ajouté sur input[name=\"XXX\"] (le listener existant est réutilisé)", async () => {
        await window.FqCardEngineModule.playDialog(currentCards, card);
        const cb = lastRenderDialogCallback();
        const root = makeDialogRoot({withX: true});

        const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");
        cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);
        const input = root.querySelector("input[name=\"XXX\"]");
        const changeListenersOnInput = addSpy.mock.calls
            .filter((call, i) => addSpy.mock.instances[i] === input && call[0] === "change");
        expect(changeListenersOnInput).toHaveLength(1);
        addSpy.mockRestore();
    });
});
