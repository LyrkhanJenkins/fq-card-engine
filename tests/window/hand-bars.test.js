import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import HandBars from "../../src/domain/interface/window/hand-bars.js";
import HandBoard from "../../src/domain/interface/window/hand-board.js";

/**
 * Couvre le clamp d'une seule barre pour un joueur non-MJ dans
 * `updateHandCount` (D1-05) : un joueur n'a jamais plus d'une barre, quelle
 * que soit la valeur demandée, alors que le MJ conserve le multi-barres
 * (plafonné à `handMax`).
 */

// `HandBoard` construit du jQuery réel dans son constructeur (absent des mocks
// de tests/setup.js) : on le remplace par une fabrique renvoyant un objet
// simple portant une méthode `remove`, pour que `updateHandCount` puisse en
// créer sans jamais toucher au DOM.
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({
    default: vi.fn(function () {
        return {remove: vi.fn()};
    })
}));

const MODULE_NAME = "fq-card-engine";

let previousModule;

beforeEach(() => {
    previousModule = globalThis.FqCardEngineModule;
    globalThis.FqCardEngineModule = {
        moduleName: MODULE_NAME,
        handMiniBarList: [{id: 0, playerBarCount: 0, updatePlayerBarCount: vi.fn()}],
        restore: vi.fn(),
        handMax: 10
    };

    game.user = {isGM: true};

    // Le mock de HandBoard est partagé au niveau module (vi.mock hissé) : sans
    // ce clear, le compteur d'appels d'un test précédent fausserait les
    // assertions `toHaveBeenCalledTimes` du bloc `updateHandCount`.
    HandBoard.mockClear();
});

afterEach(() => {
    globalThis.FqCardEngineModule = previousModule;
    vi.restoreAllMocks();
});

describe("updateHandCount", () => {
    it("crée le nombre de barres demandé pour le MJ (multi-barres conservé)", () => {
        game.user.isGM = true;
        FqCardEngineModule.handMiniBarList = [];

        HandBars.updateHandCount(3);

        expect(HandBoard).toHaveBeenCalledTimes(3);
        expect(FqCardEngineModule.handMiniBarList.length).toBe(3);
    });

    it("ne crée qu'une seule barre pour un joueur non-MJ quelle que soit la valeur demandée", () => {
        game.user.isGM = false;
        FqCardEngineModule.handMiniBarList = [];

        HandBars.updateHandCount(3);

        expect(HandBoard).toHaveBeenCalledTimes(1);
        expect(FqCardEngineModule.handMiniBarList.length).toBe(1);
    });

    it("ne crée aucune barre supplémentaire si un joueur non-MJ en a déjà une", () => {
        game.user.isGM = false;
        FqCardEngineModule.handMiniBarList = [{id: 0, remove: vi.fn()}];

        HandBars.updateHandCount(5);

        expect(HandBoard).not.toHaveBeenCalled();
        expect(FqCardEngineModule.handMiniBarList.length).toBe(1);
    });

    it("plafonne le nombre de barres du MJ à handMax", () => {
        game.user.isGM = true;
        FqCardEngineModule.handMiniBarList = [];

        HandBars.updateHandCount(15);

        expect(FqCardEngineModule.handMiniBarList.length).toBe(FqCardEngineModule.handMax);
    });
});
