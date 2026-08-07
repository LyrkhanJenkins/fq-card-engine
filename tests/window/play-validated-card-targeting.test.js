import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks des feuilles/hand-board/socket (couplées DOM/dnd5e, hors périmètre) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

// Le garde-fou délègue à PlayCard.callBackplayCard quand le ciblage est valide :
// on l'espionne pour prouver « bloqué => non appelé » / « valide => appelé ».
vi.mock("../../src/domain/engine/play-card.js", () => ({
    default: {
        callBackplayCard: vi.fn().mockResolvedValue(null),
        discardCard: vi.fn(),
    },
}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld, ensureEngineLoaded} = await import("../decks/play-harness.js");
const {installDeterministicRoll, resetDiceControl} = await import("../decks/deterministic-roll.js");
const PlayCard = (await import("../../src/domain/engine/play-card.js")).default;
const Constants = (await import("../../src/domain/constants.js")).default;
const {makeCard, makeChoice} = await import("../factories.js");

await ensureEngineLoaded();

/**
 * Cible synthétique dans la géométrie de world-fixture (0,5) — 1 case du lanceur (5,5).
 *
 * @param {string} name - Nom de la cible.
 *
 * @returns {object} Une cible utilisable dans `game.user.targets`.
 */
function targetLike(name = "Cible") {
    return {name, document: {x: 0, y: 5, width: 1, height: 1}};
}

/**
 * Contexte `ctx` minimal (un seul choix, aucune variable, aucun sbire) attendu
 * par `playValidatedCard`. `firstChoice` (par défaut, sans minions) ≠ `cardContent`
 * (le choix sélectionné soumis au garde-fou) pour prouver que le garde lit bien
 * le CHOIX SÉLECTIONNÉ.
 *
 * @param {object} cardContent - Le choix sélectionné.
 *
 * @returns {object} Le contexte `ctx`.
 */
function makeCtx(cardContent) {
    return {
        firstChoice: makeChoice(),
        cardContents: [cardContent],
        hasVariables: false,
        initCardContents: [cardContent],
        currentCards: {pass: vi.fn()},
        card: makeCard(),
    };
}

/**
 * Monte le monde (avec surcharges) puis installe le `Roll` déterministe pour que
 * `TargetingResolver` évalue réellement les formules (evaluateSync).
 *
 * @param {object} [overrides] - Surcharges transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountForGuard(overrides) {
    mountWorld(overrides);
    installDeterministicRoll();
    resetDiceControl();
}

/**
 * Joue le choix via le VRAI `playValidatedCard`.
 *
 * @param {object} cardContent - Le choix sélectionné.
 * @param {object} [fd]        - Les données de formulaire.
 *
 * @returns {*} Le retour de `playValidatedCard`.
 */
function play(cardContent, fd = {}) {
    return window.FqCardEngineModule.playValidatedCard({id: "pile"}, fd, cardContent, makeCtx(cardContent));
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Garde-fou de ciblage — blocage par FormError (dialog non fermée)", () => {
    test("0 cible (Default + portée) → FormErrorNoTarget, callBackplayCard NON appelé", () => {
        mountForGuard({user: {targets: []}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("plusieurs cibles sans nbTargets → FormErrorNoMultipleTarget, non délégué", () => {
        mountForGuard({user: {targets: [targetLike("A"), targetLike("B")]}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoMultipleTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("plus de cibles que nbTargets → FormErrorTooManyTargets, non délégué", () => {
        mountForGuard({user: {targets: [targetLike("A"), targetLike("B")]}});
        const choice = makeChoice({targetType: "Default", maxReach: "3", nbTargets: "1"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorTooManyTargets");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("pas de token du lanceur sur la scène → FormErrorNoTokenOnScene, non délégué", () => {
        mountForGuard({canvas: {scene: {tokens: []}}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("cible hors portée → FormErrorOutOfReach, non délégué", () => {
        mountForGuard(); // 1 cible à distance 1 du lanceur
        const choice = makeChoice({targetType: "Default", maxReach: "0"}); // portée 0 < distance 1
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorOutOfReach");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });
});

describe("Garde-fou de ciblage — gating", () => {
    test("aucune portée déclarée → garde-fou ignoré, délégation normale", () => {
        mountForGuard({user: {targets: []}});
        const choice = makeChoice({targetType: "Default", minReach: "", maxReach: ""});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });
});

describe("Garde-fou de ciblage — Skeletons contrôlé", () => {
    afterEach(() => vi.restoreAllMocks());

    test("Skeletons + portée + aucun squelette → FormError NoTarget, non délégué", () => {
        mountForGuard();
        vi.spyOn(Constants, "myTargets").mockReturnValue([]);
        const choice = makeChoice({targetType: "Skeletons", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Skeletons + squelette à portée → délègue", () => {
        mountForGuard();
        vi.spyOn(Constants, "myTargets").mockReturnValue([
            {name: "Skeleton", document: {x: 0, y: 5, width: 1, height: 1}}
        ]);
        const choice = makeChoice({targetType: "Skeletons", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });
});

describe("Garde-fou de ciblage — cas nominal", () => {
    test("cible unique à portée (Default) délègue à callBackplayCard", () => {
        mountForGuard(); // 1 cible à distance 1
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("le garde-fou ne mute pas le cardContent (portées restent brutes)", () => {
        mountForGuard();
        const choice = makeChoice({targetType: "Default", minReach: "1", maxReach: "3", nbTargets: "2"});
        play(choice);
        expect(choice.minReach).toBe("1");
        expect(choice.maxReach).toBe("3");
        expect(choice.nbTargets).toBe("2");
    });
});
