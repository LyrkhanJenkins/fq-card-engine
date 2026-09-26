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
// créer sans jamais toucher au DOM. Le vrai constructeur s'inscrit lui-même
// dans `handBarList` (source d'enregistrement unique) : le mock reproduit
// ce comportement, sans quoi un défaut qui compterait les barres deux fois
// resterait invisible à la suite de tests.
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({
    default: vi.fn(function () {
        const instance = {remove: vi.fn()};
        globalThis.FqCardEngineModule.handBarList.push(instance);
        return instance;
    })
}));

const MODULE_NAME = "fq-card-engine";

let previousModule;

beforeEach(() => {
    previousModule = globalThis.FqCardEngineModule;
    globalThis.FqCardEngineModule = {
        moduleName: MODULE_NAME,
        handBarList: [{id: 0, playerBarCount: 0, updatePlayerBarCount: vi.fn()}],
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
        FqCardEngineModule.handBarList = [];

        HandBars.updateHandCount(3);

        expect(HandBoard).toHaveBeenCalledTimes(3);
        expect(FqCardEngineModule.handBarList.length).toBe(3);
    });

    it("ne crée qu'une seule barre pour un joueur non-MJ quelle que soit la valeur demandée", () => {
        game.user.isGM = false;
        FqCardEngineModule.handBarList = [];

        HandBars.updateHandCount(3);

        expect(HandBoard).toHaveBeenCalledTimes(1);
        expect(FqCardEngineModule.handBarList.length).toBe(1);
    });

    it("ne crée aucune barre supplémentaire si un joueur non-MJ en a déjà une", () => {
        game.user.isGM = false;
        FqCardEngineModule.handBarList = [{id: 0, remove: vi.fn()}];

        HandBars.updateHandCount(5);

        expect(HandBoard).not.toHaveBeenCalled();
        expect(FqCardEngineModule.handBarList.length).toBe(1);
    });

    it("plafonne le nombre de barres du MJ à handMax", () => {
        game.user.isGM = true;
        FqCardEngineModule.handBarList = [];

        HandBars.updateHandCount(15);

        expect(FqCardEngineModule.handBarList.length).toBe(FqCardEngineModule.handMax);
    });

    it("n'enregistre chaque barre créée qu'une seule fois", () => {
        game.user.isGM = true;
        FqCardEngineModule.handBarList = [];

        HandBars.updateHandCount(1);

        expect(FqCardEngineModule.handBarList.length).toBe(1);
        expect(FqCardEngineModule.handBarList[0]).toBe(HandBoard.mock.results[0].value);
    });

    it("un second appel avec la même valeur ne retire ni n'ajoute aucune barre", () => {
        game.user.isGM = true;
        FqCardEngineModule.handBarList = [];

        HandBars.updateHandCount(2);
        const barres = [...FqCardEngineModule.handBarList];

        HandBars.updateHandCount(2);

        expect(FqCardEngineModule.handBarList.length).toBe(2);
        for (const barre of barres) {
            expect(barre.remove).not.toHaveBeenCalled();
        }
    });
});
