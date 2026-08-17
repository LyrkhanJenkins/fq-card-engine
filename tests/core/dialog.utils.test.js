import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {showDeckShuffledAlert, showTransientAlert} from "../../src/core/utils/dialog.utils.js";

let instances;

class MockDialogV2 {
    constructor(config) {
        this.config = config;
        this.render = vi.fn().mockResolvedValue(this);
        this.close = vi.fn().mockResolvedValue(this);
        instances.push(this);
    }
}

beforeEach(() => {
    instances = [];
    vi.useFakeTimers();
    // foundry.applications existe déjà dans setup.js (zone 1) : on n'ajoute que l'api.
    globalThis.foundry.applications.api = {DialogV2: MockDialogV2};
    globalThis.FqCardEngineModule = {pendingShuffleReveal: null};
    game.user = {id: "local-user"};
});

afterEach(() => {
    vi.useRealTimers();
    delete globalThis.foundry.applications.api;
    globalThis.FqCardEngineModule = undefined;
});

describe("core/utils/dialog.utils.js", () => {

    describe("showTransientAlert", () => {
        it("rend un dialogue avec titre, message et bouton OK", async () => {
            const dialog = await showTransientAlert("Le message", {title: "Le titre"});

            expect(dialog.config.window).toEqual({title: "Le titre"});
            expect(dialog.config.content).toBe("<p>Le message</p>");
            expect(dialog.config.buttons).toEqual([{action: "ok", label: "OK", default: true}]);
            expect(dialog.render).toHaveBeenCalledWith({force: true});
        });

        it("ferme le dialogue tout seul après la durée demandée", async () => {
            const dialog = await showTransientAlert("Msg", {duration: 2000});

            expect(dialog.close).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1999);
            expect(dialog.close).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(dialog.close).toHaveBeenCalled();
        });

        it("utilise la durée par défaut de 4000 ms", async () => {
            const dialog = await showTransientAlert("Msg");

            vi.advanceTimersByTime(3999);
            expect(dialog.close).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(dialog.close).toHaveBeenCalled();
        });
    });

    describe("showDeckShuffledAlert", () => {
        it("autre client : affiche l'alerte localisée avec le nom du personnage", async () => {
            game.i18n.format = vi.fn((key, data) => `${key}:${data.actor}`);
            game.i18n.localize = vi.fn(key => key);

            await showDeckShuffledAlert("other-user", "Lyrkhan");

            expect(instances).toHaveLength(1);
            expect(instances[0].config.window).toEqual({title: "FQCARDENGINE.InfoDeckShuffledTitle"});
            expect(instances[0].config.content).toBe("<p>FQCARDENGINE.InfoMsgDeckShuffled:Lyrkhan</p>");
            expect(instances[0].render).toHaveBeenCalledWith({force: true});
            expect(FqCardEngineModule.pendingShuffleReveal).toBeNull();
        });

        it("joueur concerné : pas de dialogue, pose le drapeau pour la bannière de révélation", async () => {
            vi.setSystemTime(1700000000000);

            await showDeckShuffledAlert("local-user", "Lyrkhan");

            expect(instances).toHaveLength(0);
            expect(FqCardEngineModule.pendingShuffleReveal).toBe(1700000000000);
        });
    });
});
