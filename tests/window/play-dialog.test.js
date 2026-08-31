import {beforeEach, describe, expect, test, vi} from "vitest";
import {makeCard, makeChoice} from "../factories.js";
import {PILE_TYPE} from "../../src/domain/trading/trading-cards.js";

// ─── Mocks des feuilles Foundry (couplées à dnd5e / DOM, hors périmètre ici) ──
// Couture identique à 07-01/07-02 (tests/decks/play-harness.js REQUIRED_MOCKS) :
// vi.mock est hissé PAR FICHIER (limitation Vitest), donc redéclaré ici.
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

// PlayCard est mocké : seul le bouton discard de playDialog délègue à
// PlayCard.discardCard (espionné ici). Le bouton ok (playValidatedCard) est
// hors périmètre de ce plan (déjà couvert par play-validated-card.test.js).
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
const PlayCard = (await import("../../src/domain/engine/play-card.js")).default;

// CONST.DOCUMENT_OWNERSHIP_LEVELS n'est pas fourni par tests/setup.js (zone 1,
// jamais réinitialisée entre les tests) : on l'étend une seule fois ici.
globalThis.CONST.DOCUMENT_OWNERSHIP_LEVELS = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};

// Espion sur le renderTemplate réel fourni par tests/setup.js (zone 1) : on ne
// remplace pas son implémentation, on observe juste les appels/arguments.
const renderTemplateSpy = vi.spyOn(foundry.applications.handlebars, "renderTemplate");

/**
 * Construit un choix de carte jouable par `playDialog` : ajoute `replayable`
 * (absent des défauts de `makeChoice`, mais lu sans garde de nullité par
 * `RollService.hasAbilitiesBonus` lors de la construction des données du template).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un choix de carte jouable par `playDialog`.
 */
function makePlayableChoice(overrides = {}) {
    return makeChoice({replayable: "", ...overrides});
}

/**
 * Construit une carte jouable par `playDialog`, avec un `system.fq` complet
 * (un seul choix jouable par défaut). `choices` et `isInnate` sont transmis à
 * `system.fq` ; tout autre champ de premier niveau (id, _id, sort…) est
 * transmis tel quel à `makeCard`.
 *
 * @param {object}   [overrides]          Surcharge de premier niveau.
 * @param {object[]} [overrides.choices]  Les choix de la carte (un choix jouable par défaut).
 * @param {boolean}  [overrides.isInnate]   Si la carte est une carte innée (false par défaut).
 * @returns {object} Une carte simple, jouable par `playDialog`.
 */
function makePlayableCard({choices, isInnate = false, ...overrides} = {}) {
    return makeCard({
        system: {
            fq: {
                maxSameCard: 1,
                class: "neutral",
                level: 1,
                isInnate,
                choices: choices ?? [makePlayableChoice()]
            }
        },
        ...overrides
    });
}

/**
 * Construit une pile de défausse espionnable, filtrable par `playDialog`
 * (`system.fq.type === PILE_TYPE` et `testUserPermission` accordant LIMITED).
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
 * Construit un personnage minimal, suffisant pour la construction de
 * `charStats` par `playDialog` (aucun champ n'exige de faire évaluer un `Roll`).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un personnage simple.
 */
function makeCharacter(overrides = {}) {
    return {
        name: "Test Character",
        img: "character.png",
        system: {
            attributes: {hp: {value: 8, max: 10}},
            fq: {
                action: {value: 3, max: 5},
                mana: {value: 2, max: 4},
                zeal: {value: 1, max: 8},
                cards: {currentDrop: 0}
            }
        },
        ...overrides
    };
}

describe("playDialog", () => {
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
                character: makeCharacter(),
                targets: new Set()
            },
            i18n: {
                localize: (key) => key,
                format: (key, obj) => `${key} ${JSON.stringify(obj)}`
            },
            combat: null
        };
        globalThis.foundry.applications.ux = {
            FormDataExtended: vi.fn().mockImplementation(function () {
                this.object = {XXX: undefined, YYY: undefined};
            })
        };
    });

    describe("cas nominal", () => {
        test("renderTemplate reçoit charStats/panel/cardContents/discards/hasVariables et Dialog.wait reçoit ok+discard", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(renderTemplateSpy).toHaveBeenCalledWith(
                expect.stringContaining("dialog-play.hbs"),
                expect.objectContaining({
                    charStats: expect.any(Object),
                    panel: expect.any(Object),
                    cardContents: expect.any(Array),
                    discards: [pile],
                    hasVariables: false
                })
            );
            expect(Dialog.wait).toHaveBeenCalledWith(expect.objectContaining({
                buttons: expect.objectContaining({
                    ok: expect.any(Object),
                    discard: expect.any(Object)
                })
            }));
        });

        test("carte innée (isInnate) : Dialog.wait reçoit le bouton discard comme une carte ordinaire", async () => {
            const innateCard = makePlayableCard({id: "innate-1", _id: "innate-1", sort: 1, isInnate: true});
            currentCards = makeHand([innateCard]);
            globalThis.game.cards = [currentCards, pile];

            await window.FqCardEngineModule.playDialog(currentCards, innateCard);

            const callArgs = Dialog.wait.mock.calls[0][0];
            expect(callArgs.buttons.ok).toBeDefined();
            expect(callArgs.buttons.discard).toBeDefined();
        });

        test("hasVariables est vrai quand un choix contient XXX sans xvalue", async () => {
            const cardWithVariable = makePlayableCard({
                id: "card-x", _id: "card-x", sort: 1,
                choices: [makePlayableChoice({damage: "XXXd6"})]
            });
            currentCards = makeHand([cardWithVariable]);
            globalThis.game.cards = [currentCards, pile];

            await window.FqCardEngineModule.playDialog(currentCards, cardWithVariable);

            expect(renderTemplateSpy).toHaveBeenCalledWith(
                expect.stringContaining("dialog-play.hbs"),
                expect.objectContaining({hasVariables: true, hasXVariable: true, hasYVariable: false})
            );
        });

        test("hasVariables est faux quand aucun choix ne contient XXX/YYY", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(renderTemplateSpy).toHaveBeenCalledWith(
                expect.stringContaining("dialog-play.hbs"),
                expect.objectContaining({hasVariables: false, hasXVariable: false, hasYVariable: false})
            );
        });

        test("filtre les piles de défausse : exclut la main courante, les non-piles et les piles sans permission", async () => {
            const pileNoPermission = makePile({id: "pile-no-perm", testUserPermission: vi.fn(() => false)});
            const deckNotPile = {id: "deck-1", system: {fq: {type: "DECK"}}, testUserPermission: vi.fn(() => true)};
            // La main courante porte (artificiellement) le type PILE pour vérifier
            // que le filtre l'exclut bien via `c !== currentCards`, pas seulement
            // via son type réel (HAND).
            currentCards = makeHand([card], {
                system: {fq: {type: PILE_TYPE}},
                testUserPermission: vi.fn(() => true)
            });
            globalThis.game.cards = [currentCards, pile, pileNoPermission, deckNotPile];

            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(renderTemplateSpy).toHaveBeenCalledWith(
                expect.stringContaining("dialog-play.hbs"),
                expect.objectContaining({discards: [pile]})
            );
        });
    });

    describe("branches dégradées", () => {
        test("aucune pile de défausse disponible : avertit et n'ouvre pas le dialogue", async () => {
            globalThis.game.cards = [currentCards];

            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
            expect(Dialog.wait).not.toHaveBeenCalled();
        });

        test("permission insuffisante sur la main : avertit et n'ouvre pas le dialogue", async () => {
            currentCards.permission = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoPermission");
            expect(Dialog.wait).not.toHaveBeenCalled();
        });

        test("carte non implémentée (aucun choix) : avertit et n'ouvre pas le dialogue", async () => {
            const emptyCard = makePlayableCard({id: "empty-1", _id: "empty-1", sort: 1, choices: []});
            currentCards = makeHand([emptyCard]);
            globalThis.game.cards = [currentCards, pile];

            await window.FqCardEngineModule.playDialog(currentCards, emptyCard);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgCardNotImplemented");
            expect(Dialog.wait).not.toHaveBeenCalled();
        });

        test("aucun personnage possédé : avertit et n'ouvre pas le dialogue", async () => {
            globalThis.game.user.character = null;

            await window.FqCardEngineModule.playDialog(currentCards, card);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.NoOwnedCharacter");
            expect(Dialog.wait).not.toHaveBeenCalled();
        });
    });

    describe("navigation renderDialog (prev/next)", () => {
        let card2;

        beforeEach(() => {
            card2 = makePlayableCard({id: "card-2", _id: "card-2", sort: 2});
            currentCards = makeHand([card, card2]);
            globalThis.game.cards = [currentCards, pile];
        });

        /**
         * Récupère le callback passé au dernier appel `Hooks.once("renderDialog", cb)`.
         *
         * @returns {Function} Le callback de navigation capturé.
         */
        function lastRenderDialogCallback() {
            const calls = Hooks.once.mock.calls.filter(call => call[0] === "renderDialog");
            return calls[calls.length - 1][1];
        }

        /**
         * Construit une racine jsdom minimale portant les boutons de navigation
         * attendus par le callback `renderDialog`.
         *
         * @returns {HTMLElement} La racine avec `.fq-play-nav--prev`/`--next`.
         */
        function makeNavRoot() {
            const root = document.createElement("div");
            root.innerHTML = "<button class='fq-play-nav--prev'></button><button class='fq-play-nav--next'></button>";
            return root;
        }

        test("désactive le bouton précédent au premier index de la main", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card);
            const cb = lastRenderDialogCallback();
            const root = makeNavRoot();

            cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

            expect(root.querySelector(".fq-play-nav--prev").disabled).toBe(true);
            expect(root.querySelector(".fq-play-nav--next").disabled).toBe(false);
        });

        test("désactive le bouton suivant au dernier index de la main", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card2);
            const cb = lastRenderDialogCallback();
            const root = makeNavRoot();

            cb({element: root, close: vi.fn().mockResolvedValue(null)}, null);

            expect(root.querySelector(".fq-play-nav--next").disabled).toBe(true);
            expect(root.querySelector(".fq-play-nav--prev").disabled).toBe(false);
        });

        test("un clic de navigation valide ferme le dialogue courant", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card);
            const cb = lastRenderDialogCallback();
            const root = makeNavRoot();
            const app = {element: root, close: vi.fn().mockResolvedValue(null)};

            cb(app, null);
            root.querySelector(".fq-play-nav--next").click();
            await Promise.resolve();

            expect(app.close).toHaveBeenCalled();
        });
    });

    describe("instance unique (fermeture du dialogue précédent)", () => {
        let card2;

        beforeEach(() => {
            card2 = makePlayableCard({id: "card-2", _id: "card-2", sort: 2});
            currentCards = makeHand([card, card2]);
            globalThis.game.cards = [currentCards, pile];
        });

        /**
         * Récupère le callback passé au dernier appel `Hooks.once("renderDialog", cb)`.
         *
         * @returns {Function} Le dernier callback `renderDialog` capturé.
         */
        function lastRenderDialogCallback() {
            const calls = Hooks.once.mock.calls.filter(call => call[0] === "renderDialog");
            return calls[calls.length - 1][1];
        }

        test("ouvrir un second dialogue ferme le premier", async () => {
            // 1er dialogue : on simule son rendu pour enregistrer l'instance ouverte.
            await window.FqCardEngineModule.playDialog(currentCards, card);
            const firstRoot = document.createElement("div");
            const firstApp = {element: firstRoot, close: vi.fn().mockResolvedValue(null)};
            lastRenderDialogCallback()(firstApp, null);

            // 2nd dialogue (autre carte) : doit fermer le premier avant de s'ouvrir.
            await window.FqCardEngineModule.playDialog(currentCards, card2);

            expect(firstApp.close).toHaveBeenCalled();
        });
    });

    describe("callback du bouton discard", () => {
        /**
         * Construit une racine jsdom minimale portant le formulaire attendu par
         * `getCardContent` (`form.cards-dialog`).
         *
         * @returns {HTMLElement} La racine avec le formulaire.
         */
        function makeDiscardRoot() {
            const root = document.createElement("div");
            root.innerHTML = "<form class='cards-dialog'></form>";
            return root;
        }

        test("délègue à PlayCard.discardCard avec (to, fd, cardContent, card, currentCards)", async () => {
            await window.FqCardEngineModule.playDialog(currentCards, card);
            const discardCallback = Dialog.wait.mock.calls[0][0].buttons.discard.callback;
            const root = makeDiscardRoot();

            discardCallback([root]);

            expect(PlayCard.discardCard).toHaveBeenCalledWith(
                pile,
                {XXX: undefined, YYY: undefined},
                expect.any(Object),
                card,
                currentCards
            );
        });
    });
});
