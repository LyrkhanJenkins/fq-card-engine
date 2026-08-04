import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {socket} from "../../src/hook/socket-lib.js";
import FxUtils from "../../src/domain/utils/fx-utils.js";

vi.mock("../../src/hook/socket-lib.js", () => ({
    default: {},
    socket: {
        executeAsGM: vi.fn(async () => "modules/fq-card-engine/sounds/fire/1.mp3")
    }
}));

/**
 * Construit un objet Sequence chaînable minimal : chaque méthode listée
 * renvoie l'objet lui-même, sauf `.play` qui reste directement espionnable.
 *
 * @returns {object} Un stub chaînable de séquence Sequencer.
 */
function makeChainableSequence() {
    const chainable = {};
    const chainMethods = [
        "effect", "file", "atLocation", "size", "stretchTo", "waitUntilFinished",
        "animation", "on", "fadeIn", "opacity", "duration", "sound"
    ];
    chainMethods.forEach(method => {
        chainable[method] = vi.fn(() => chainable);
    });
    chainable.play = vi.fn();
    return chainable;
}

describe("FxUtils", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete globalThis.Sequence;
        vi.useRealTimers();
    });

    describe("chemins statiques", () => {
        it("expose SOUND_PATH, VISUAL_PATH et GENERIC_VISUAL_PATH", () => {
            expect(FxUtils.SOUND_PATH).toBe("modules/fq-card-engine/sounds/");
            expect(FxUtils.VISUAL_PATH).toBe("modules/fq-card-engine/visuals/");
            expect(FxUtils.GENERIC_VISUAL_PATH).toBe("modules/fq-card-engine/visuals/generics/");
        });
    });

    describe("getDamageGenericEffectPath", () => {
        it("maxReach <= 2 -> sous-dossier melee/ avec type mappé", () => {
            expect(FxUtils.getDamageGenericEffectPath("1d6", 1, "fire"))
                .toBe("modules/fq-card-engine/visuals/generics/melee/fire.webm");
        });

        it("maxReach > 2 -> sous-dossier range/ avec type mappé", () => {
            expect(FxUtils.getDamageGenericEffectPath("1d6", 5, "cold"))
                .toBe("modules/fq-card-engine/visuals/generics/range/cold.webm");
        });

        it("typeEffect falsy -> default.webm", () => {
            expect(FxUtils.getDamageGenericEffectPath("1d6", 1, undefined))
                .toBe("modules/fq-card-engine/visuals/generics/melee/default.webm");
        });
    });

    describe("_getEffectFile", () => {
        it("heal -> other/heal.webm", () => {
            expect(FxUtils._getEffectFile({heal: "1d4"}, null))
                .toBe("modules/fq-card-engine/visuals/generics/other/heal.webm");
        });

        it("damage sans visuel -> délègue à getDamageGenericEffectPath", () => {
            expect(FxUtils._getEffectFile({damage: "1d6", maxReach: 1}, "fire"))
                .toBe("modules/fq-card-engine/visuals/generics/melee/fire.webm");
        });

        it("ni heal ni damage -> other/buff.webm", () => {
            expect(FxUtils._getEffectFile({}, null))
                .toBe("modules/fq-card-engine/visuals/generics/other/buff.webm");
        });

        it("visual.path custom (hors jb2a) -> renvoyé tel quel", () => {
            expect(FxUtils._getEffectFile({visual: {path: "custom/path.webm"}}, null))
                .toBe("custom/path.webm");
        });

        it("visual.path jb2a avec module JB2A_DnD5e inactif -> ignoré, retombe sur damage", () => {
            const cardContent = {visual: {path: "modules/jb2a/fireball.webm"}, damage: "1d6", maxReach: 1};

            expect(FxUtils._getEffectFile(cardContent, "fire"))
                .toBe("modules/fq-card-engine/visuals/generics/melee/fire.webm");
        });

        it("visual.path jb2a avec module JB2A_DnD5e actif -> renvoyé tel quel", () => {
            game.modules.set("JB2A_DnD5e", {active: true});
            const cardContent = {visual: {path: "modules/jb2a/fireball.webm"}, damage: "1d6", maxReach: 1};

            expect(FxUtils._getEffectFile(cardContent, "fire")).toBe("modules/jb2a/fireball.webm");
        });
    });

    describe("getSoundEffectPath", () => {
        it("customSound -> SOUND_PATH + customSound, sans appel socket", async () => {
            const result = await FxUtils.getSoundEffectPath(null, null, "evasion/1.mp3", null);

            expect(result).toBe("modules/fq-card-engine/sounds/evasion/1.mp3");
            expect(socket.executeAsGM).not.toHaveBeenCalled();
        });

        it("damage -> socket.executeAsGM avec le dossier du type de dégâts", async () => {
            await FxUtils.getSoundEffectPath("1d6", null, null, "fire");

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/fire");
        });

        it("damage sans firstType -> dossier default", async () => {
            await FxUtils.getSoundEffectPath("1d6", null, null, null);

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/default");
        });

        it("heal -> socket.executeAsGM avec le dossier heal", async () => {
            await FxUtils.getSoundEffectPath(null, "1d4", null, null);

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/heal");
        });

        it("ni damage ni heal ni customSound -> null", async () => {
            const result = await FxUtils.getSoundEffectPath(null, null, null, null);

            expect(result).toBeNull();
        });
    });

    describe("handleSpecialEffect - Sequencer ACTIF", () => {
        it("construit au moins une Sequence et appelle .play() (branche cibles + critique)", async () => {
            game.modules.set("sequencer", {active: true});
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });

            const cardContent = {damage: "1d6", maxReach: 5, targetType: "Default"};
            const resultArray = [{targetTokenId: "token1", evasion: false, critical: true}];

            await FxUtils.handleSpecialEffect(cardContent, resultArray, {actorId: "userCharacterId"}, "fire");

            expect(globalThis.Sequence).toHaveBeenCalled();
            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.some(seq => seq.play.mock.calls.length > 0)).toBe(true);
        });

        it("sans portée (maxReach falsy) -> construit la séquence sur le lanceur (branche soi)", async () => {
            game.modules.set("sequencer", {active: true});
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });

            const cardContent = {damage: "1d6", maxReach: 0, targetType: "Default"};

            await FxUtils.handleSpecialEffect(cardContent, [], {actorId: "userCharacterId"}, "fire");

            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.some(seq => seq.atLocation.mock.calls.length > 0 && seq.play.mock.calls.length > 0)).toBe(true);
        });
    });

    describe("handleSpecialEffect - Sequencer ABSENT (UTIL-01)", () => {
        it("module inactif et Sequence non défini -> ne jette pas", async () => {
            expect(globalThis.Sequence).toBeUndefined();
            expect(game.modules.get("sequencer")?.active).toBeFalsy();

            const cardContent = {sound: "beep.mp3"};

            await expect(FxUtils.handleSpecialEffect(cardContent, [], {}, null)).resolves.toBeUndefined();
        });

        it("joue le son via foundry.audio.AudioHelper.play après 200ms", async () => {
            vi.useFakeTimers();
            const cardContent = {sound: "beep.mp3"};

            await FxUtils.handleSpecialEffect(cardContent, [], {}, null);
            expect(foundry.audio.AudioHelper.play).not.toHaveBeenCalled();

            vi.advanceTimersByTime(200);

            expect(foundry.audio.AudioHelper.play).toHaveBeenCalledWith(
                expect.objectContaining({src: "modules/fq-card-engine/sounds/beep.mp3"}),
                true
            );
        });
    });
});
