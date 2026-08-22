import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import HandBars from "../../src/domain/interface/window/hand-bars.js";

/**
 * Couvre la synchronisation (MJ) des barres de main sur la configuration des
 * joueurs — `updatePlayerHands`.
 *
 * Le point sensible : la barre du MJ ne doit être écrasée que par un id de main
 * RÉELLEMENT renseigné par le joueur. Un joueur qui n'a jamais configuré sa
 * propre barre ne doit pas faire disparaître la sélection manuelle du MJ.
 */

const MODULE_NAME = "fq-card-engine";

let gmFlags;
let playerFlags;
let previousModule;

/**
 * Construit un faux `game.user` MJ dont les flags vivent dans `gmFlags`.
 *
 * @returns {object} Le user MJ simulé.
 */
function buildGmUser() {
    return {
        isGM: true,
        getFlag: vi.fn((_module, key) => gmFlags[key]),
        setFlag: vi.fn((_module, key, value) => {
            gmFlags[key] = value;
        }),
        unsetFlag: vi.fn((_module, key) => {
            delete gmFlags[key];
        })
    };
}

beforeEach(() => {
    gmFlags = {"UserID-0": "player-id", "CardsID-0": "hand-chosen-by-gm"};
    playerFlags = {};

    previousModule = globalThis.FqCardEngineModule;
    globalThis.FqCardEngineModule = {
        moduleName: MODULE_NAME,
        handMiniBarList: [{id: 0, playerBarCount: 0, updatePlayerBarCount: vi.fn()}],
        restore: vi.fn()
    };

    game.user = buildGmUser();
    game.users.get = vi.fn(() => ({
        getFlag: vi.fn((_module, key) => playerFlags[key])
    }));
});

afterEach(() => {
    globalThis.FqCardEngineModule = previousModule;
    vi.restoreAllMocks();
});

describe("updatePlayerHands", () => {
    it("synchronise la barre du MJ sur la main configurée par le joueur", () => {
        playerFlags["CardsID-0"] = "hand-configured-by-player";

        HandBars.updatePlayerHands();

        expect(gmFlags["CardsID-0"]).toBe("hand-configured-by-player");
        expect(FqCardEngineModule.restore).toHaveBeenCalled();
    });

    it("conserve la sélection manuelle du MJ quand le joueur n'a pas configuré sa barre", () => {
        // Cas d'un monde neuf : le joueur ne s'est jamais connecté pour choisir sa
        // main. Effacer ici rendrait toute configuration manuelle du MJ impossible.
        HandBars.updatePlayerHands();

        expect(gmFlags["CardsID-0"]).toBe("hand-chosen-by-gm");
        expect(game.user.unsetFlag).not.toHaveBeenCalled();
        expect(FqCardEngineModule.restore).not.toHaveBeenCalled();
    });

    it("ne lève pas d'exception si le joueur associé à la barre a été supprimé du monde", () => {
        game.users.get = vi.fn(() => undefined);

        expect(() => HandBars.updatePlayerHands()).not.toThrow();
        expect(gmFlags["CardsID-0"]).toBe("hand-chosen-by-gm");
    });

    it("ne touche à rien quand l'utilisateur courant n'est pas MJ", () => {
        game.user.isGM = false;

        HandBars.updatePlayerHands();

        expect(game.user.setFlag).not.toHaveBeenCalled();
        expect(game.user.unsetFlag).not.toHaveBeenCalled();
    });
});
