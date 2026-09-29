import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

/**
 * Macro de compendium PushBack (projection d'une cible) : posée par un effet
 * DAE `macro.execute` (« PushBack <cases> ») sur le LANCEUR, elle projette la
 * cible sélectionnée du joueur déclencheur dans la direction lanceur → cible,
 * sur le nombre de cases passé en argument.
 *
 * Le code testé est la VRAIE commande du document macro de
 * `packs/_source/macros-sequencer/pushback.json` — évaluée ici avec les
 * globaux Foundry/Sequencer mockés (args, game, ui, canvas, token, Sequence).
 */
const MACRO_PATH = path.join(process.cwd(), "packs", "_source", "macros-sequencer", "pushback.json");
const macroDoc = JSON.parse(fs.readFileSync(MACRO_PATH, "utf-8"));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const GRID = 100;

/**
 * Stub Sequencer : toute méthode de la chaîne retourne la chaîne elle-même, et
 * la destination passée à `teleportTo` est mémorisée — le seul effet de bord
 * observable de la macro.
 */
function makeSequenceStub(recorder) {
    const chain = new Proxy({}, {
        get: (_t, prop) => (...params) => {
            if (prop === "teleportTo") {
                recorder.teleportedTo = params[0];
            }
            return chain;
        }
    });
    return function Sequence() {
        return chain;
    };
}

/**
 * Monte un monde minimal : un lanceur au centre, une cible posée où le test le
 * demande, et l'utilisateur déclencheur qui la cible.
 *
 * @param {object} [options]          - La configuration du monde.
 * @param {object} [options.casterAt] - La case (en cases) du lanceur.
 * @param {object} [options.targetAt] - La case (en cases) de la cible.
 * @param {boolean} [options.targeted] - False pour un utilisateur sans cible.
 */
function makeWorld({casterAt = {x: 5, y: 5}, targetAt = {x: 6, y: 5}, targeted = true} = {}) {
    const toPlaceable = at => ({
        position: {x: at.x * GRID, y: at.y * GRID},
        center: {x: at.x * GRID + GRID / 2, y: at.y * GRID + GRID / 2}
    });
    const token = toPlaceable(casterAt);
    const target = toPlaceable(targetAt);
    const actor = {id: "caster"};
    const user = {character: {id: "caster"}, targets: targeted ? new Set([target]) : new Set()};
    // La macro localise ses avertissements : le stub renvoie la clé demandée,
    // ce qui laisse les tests vérifier laquelle est affichée.
    const i18n = {localize: vi.fn(key => key)};
    const game = {actors: {get: vi.fn(() => actor)}, users: [user], i18n};
    const ui = {notifications: {warn: vi.fn(), error: vi.fn()}};
    const canvas = {grid: {size: GRID}};
    return {token, target, game, ui, canvas};
}

function runMacro(args, world) {
    const recorder = {};
    const fn = new AsyncFunction("args", "game", "ui", "canvas", "token", "Sequence", macroDoc.command);
    return fn(args, world.game, world.ui, world.canvas, world.token, makeSequenceStub(recorder))
        .then(() => recorder);
}

/** Les arguments d'un déclenchement DAE « à la pose » de l'effet. */
function daeArgs(distance) {
    return ["on", distance, {actorId: "caster"}];
}

describe("PushBack — projection d'une cible", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("cible plein est : projetée du nombre de cases demandé, sur le même axe", async () => {
        const world = makeWorld({casterAt: {x: 5, y: 5}, targetAt: {x: 6, y: 5}});
        const {teleportedTo} = await runMacro(daeArgs("5"), world);

        expect(teleportedTo).toEqual({x: (6 + 5) * GRID, y: 5 * GRID});
    });

    test("cible plein nord : projetée vers le haut, l'autre axe inchangé", async () => {
        const world = makeWorld({casterAt: {x: 5, y: 5}, targetAt: {x: 5, y: 4}});
        const {teleportedTo} = await runMacro(daeArgs("5"), world);

        expect(teleportedTo).toEqual({x: 5 * GRID, y: (4 - 5) * GRID});
    });

    test("cible en diagonale : la projection reste alignée sur la grille", async () => {
        const world = makeWorld({casterAt: {x: 5, y: 5}, targetAt: {x: 6, y: 6}});
        const {teleportedTo} = await runMacro(daeArgs("5"), world);

        // Chaque axe porte round(cos(45°) * 5) = 4 cases.
        expect(teleportedTo).toEqual({x: (6 + 4) * GRID, y: (6 + 4) * GRID});
    });

    test("distance absente : la projection retombe sur 5 cases", async () => {
        const world = makeWorld({casterAt: {x: 5, y: 5}, targetAt: {x: 6, y: 5}});
        const {teleportedTo} = await runMacro(["on", undefined, {actorId: "caster"}], world);

        expect(teleportedTo).toEqual({x: (6 + 5) * GRID, y: 5 * GRID});
    });

    test("aucune cible sélectionnée : rien n'est déplacé, l'utilisateur est averti", async () => {
        const world = makeWorld({targeted: false});
        const {teleportedTo} = await runMacro(daeArgs("5"), world);

        expect(teleportedTo).toBeUndefined();
        expect(world.ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.MacroErrorMsgNoTarget");
    });

    test("cible sur la case du lanceur : aucune direction, rien n'est déplacé", async () => {
        const world = makeWorld({casterAt: {x: 5, y: 5}, targetAt: {x: 5, y: 5}});
        const {teleportedTo} = await runMacro(daeArgs("5"), world);

        expect(teleportedTo).toBeUndefined();
        expect(world.ui.notifications.error).toHaveBeenCalledWith("FQCARDENGINE.MacroErrorMsgNoPushDirection");
    });

    test("déclenchement autre que la pose de l'effet : la macro ne fait rien", async () => {
        const world = makeWorld();
        const {teleportedTo} = await runMacro(["off", "5", {actorId: "caster"}], world);

        expect(teleportedTo).toBeUndefined();
    });
});
