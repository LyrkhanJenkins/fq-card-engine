import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {socket} from "../../src/hook/integration/socketlib.hook.js";
import Fx from "../../src/domain/engine/shared/fx.js";
import {visualEffectData} from "../../src/domain/system/fx/visualEffectData.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
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
        "animation", "on", "fadeIn", "opacity", "duration", "sound", "rotate", "thenDo"
    ];
    chainMethods.forEach(method => {
        chainable[method] = vi.fn(() => chainable);
    });
    chainable.play = vi.fn();
    return chainable;
}

describe("Fx", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Les visuels génériques vivent dans JB2A : sauf mention contraire, les
        // tests se placent dans la configuration recommandée, module installé.
        game.modules.set("JB2A_DnD5e", {active: true});
    });

    afterEach(() => {
        delete globalThis.Sequence;
        vi.useRealTimers();
    });

    describe("chemins statiques", () => {
        it("expose SOUND_PATH et l'identifiant du module JB2A", () => {
            expect(Fx.SOUND_PATH).toBe("modules/fq-card-engine/sounds/");
            expect(Fx.JB2A_MODULE_ID).toBe("JB2A_DnD5e");
        });
    });

    describe("getDamageGenericEffectPath", () => {
        it("maxReach <= 2 -> catégorie melee avec type mappé", () => {
            expect(Fx.getDamageGenericEffectPath("1d6", 1, "fire"))
                .toBe(visualEffectData.generics.melee.fire);
        });

        it("maxReach > 2 -> catégorie range avec type mappé", () => {
            expect(Fx.getDamageGenericEffectPath("1d6", 5, "cold"))
                .toBe(visualEffectData.generics.range.cold);
        });

        it("typeEffect falsy -> entrée default", () => {
            expect(Fx.getDamageGenericEffectPath("1d6", 1, undefined))
                .toBe(visualEffectData.generics.melee.default);
        });
    });

    describe("_getEffectFile", () => {
        it("heal -> visuel de soin", () => {
            expect(Fx._getEffectFile({heal: "1d4"}, null))
                .toBe(visualEffectData.generics.other.heal);
        });

        it("damage sans visuel -> délègue à getDamageGenericEffectPath", () => {
            expect(Fx._getEffectFile({damage: "1d6", maxReach: 1}, "fire"))
                .toBe(visualEffectData.generics.melee.fire);
        });

        it("ni heal ni damage -> visuel de buff", () => {
            expect(Fx._getEffectFile({}, null))
                .toBe(visualEffectData.generics.other.buff);
        });

        it("visual.path custom (hors jb2a) -> renvoyé tel quel", () => {
            expect(Fx._getEffectFile({visual: {path: "custom/path.webm"}}, null))
                .toBe("custom/path.webm");
        });

        it("visual.path jb2a avec module JB2A_DnD5e actif -> renvoyé tel quel", () => {
            const cardContent = {visual: {path: "jb2a.fire_bolt.orange"}, damage: "1d6", maxReach: 1};

            expect(Fx._getEffectFile(cardContent, "fire")).toBe("jb2a.fire_bolt.orange");
        });
    });

    describe("_getEffectFile - JB2A ABSENT", () => {

        beforeEach(() => {
            game.modules.delete("JB2A_DnD5e");
        });

        it("visuel générique -> null, faute de repli local", () => {
            expect(Fx._getEffectFile({damage: "1d6", maxReach: 1}, "fire")).toBeNull();
            expect(Fx._getEffectFile({heal: "1d4"}, null)).toBeNull();
            expect(Fx._getEffectFile({}, null)).toBeNull();
        });

        it("visual.path jb2a -> null, quelle que soit la casse", () => {
            expect(Fx._getEffectFile({visual: {path: "jb2a.fire_bolt.orange"}}, null)).toBeNull();
            expect(Fx._getEffectFile({visual: {path: "modules/JB2A_DnD5e/Library/x.webm"}}, null)).toBeNull();
        });

        it("visual.path étranger à JB2A -> toujours joué", () => {
            expect(Fx._getEffectFile({visual: {path: "custom/path.webm"}}, null))
                .toBe("custom/path.webm");
        });
    });

    describe("getSoundEffectPath", () => {
        it("customSound -> SOUND_PATH + customSound, sans appel socket", async () => {
            const result = await Fx.getSoundEffectPath(null, null, "evasion/1.mp3", null);

            expect(result).toBe("modules/fq-card-engine/sounds/evasion/1.mp3");
            expect(socket.executeAsGM).not.toHaveBeenCalled();
        });

        it("damage -> socket.executeAsGM avec le dossier du type de dégâts", async () => {
            await Fx.getSoundEffectPath("1d6", null, null, "fire");

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/fire");
        });

        it("damage sans firstType -> dossier default", async () => {
            await Fx.getSoundEffectPath("1d6", null, null, null);

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/default");
        });

        it("heal -> socket.executeAsGM avec le dossier heal", async () => {
            await Fx.getSoundEffectPath(null, "1d4", null, null);

            expect(socket.executeAsGM).toHaveBeenCalledWith("getRandomFileFromFolder", "modules/fq-card-engine/sounds/heal");
        });

        it("ni damage ni heal ni customSound -> null", async () => {
            const result = await Fx.getSoundEffectPath(null, null, null, null);

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

            await Fx.handleSpecialEffect(cardContent, resultArray, {actorId: "userCharacterId"}, "fire");

            expect(globalThis.Sequence).toHaveBeenCalled();
            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.some(seq => seq.play.mock.calls.length > 0)).toBe(true);
        });

        it("forcedTargets -> les FX portent sur la cible imposée, pas sur la sélection", async () => {
            // Le cas de l'attaque d'opportunité : la cible vient du moteur, alors que
            // l'utilisateur a une tout autre cible sélectionnée. Les FX doivent suivre
            // la première, comme les dégâts et le log.
            game.modules.set("sequencer", {active: true});
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });
            const imposee = {id: "cible-imposee"};
            const selectionnee = [...game.user.targets][0];

            const cardContent = {damage: "1d6", maxReach: 1, targetType: "Default", forcedTargets: [imposee]};

            await Fx.handleSpecialEffect(cardContent, [], {actorId: "userCharacterId"}, "fire");

            const atLocationArgs = globalThis.Sequence.mock.results
                .flatMap(r => r.value.atLocation.mock.calls.map(c => c[0]));
            expect(atLocationArgs).toContain(imposee);
            expect(atLocationArgs).not.toContain(selectionnee);
        });

        it("sans portée (maxReach falsy) -> construit la séquence sur le lanceur (branche soi)", async () => {
            game.modules.set("sequencer", {active: true});
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });

            const cardContent = {damage: "1d6", maxReach: 0, targetType: "Default"};

            await Fx.handleSpecialEffect(cardContent, [], {actorId: "userCharacterId"}, "fire");

            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.some(seq => seq.atLocation.mock.calls.length > 0 && seq.play.mock.calls.length > 0)).toBe(true);
        });
    });

    describe("effets de zone (_createSequenceForZone / _createTargetFeedback)", () => {

        beforeEach(() => {
            game.modules.set("sequencer", {active: true});
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });
        });

        it("cercle -> effet à l'emplacement de la zone, taille = diamètre en cases", () => {
            Fx._createSequenceForZone("file.webm", {type: "circle", x: 300, y: 400, size: 6});

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.atLocation).toHaveBeenCalledWith({x: 300, y: 400});
            expect(seq.size).toHaveBeenCalledWith(6, {gridUnits: true});
            expect(seq.play).toHaveBeenCalled();
        });

        it("rectangle -> taille largeur/hauteur en cases et rotation inversée", () => {
            Fx._createSequenceForZone("file.webm", {type: "rectangle", x: 150, y: 150, width: 3, height: 2, rotation: 45});

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.size).toHaveBeenCalledWith({width: 3, height: 2}, {gridUnits: true});
            expect(seq.rotate).toHaveBeenCalledWith(-45);
        });

        it("ligne/cône -> étiré de l'origine vers le point d'arrivée", () => {
            Fx._createSequenceForZone("file.webm", {type: "line", x: 0, y: 0, endX: 200, endY: 0});

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.atLocation).toHaveBeenCalledWith({x: 0, y: 0});
            expect(seq.stretchTo).toHaveBeenCalledWith({x: 200, y: 0});
            expect(seq.size).not.toHaveBeenCalled();
        });

        it("handleSpecialEffect avec zonePlacement -> branche zone, même sans cible (zone sur du vide)", async () => {
            const cardContent = {damage: "1d6", maxReach: 6, targetType: "Zone",
                zonePlacement: {type: "circle", x: 10, y: 20, size: 2}};

            await Fx.handleSpecialEffect(cardContent, [], {actorId: "userCharacterId"}, "fire");

            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.some(seq => seq.atLocation.mock.calls.some(c => c[0]?.x === 10 && c[0]?.y === 20))).toBe(true);
            expect(instances.some(seq => seq.stretchTo.mock.calls.length > 0)).toBe(false);
        });

        it("_createTargetFeedback : dégâts non esquivés -> clignotement joué sur la cible", () => {
            const target = {id: "t1"};

            Fx._createTargetFeedback(target, {damage: "1d6"}, false);

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.animation).toHaveBeenCalled();
            expect(seq.on).toHaveBeenCalledWith(target);
            expect(seq.play).toHaveBeenCalled();
        });

        it("_createTargetFeedback : esquive -> effet et son d'esquive sur la cible", () => {
            const target = {id: "t1"};

            Fx._createTargetFeedback(target, {damage: "1d6"}, true);

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.file).toHaveBeenCalledWith(visualEffectData.generics.other.evasion);
            expect(seq.animation).not.toHaveBeenCalled();
        });

        it("_createTargetFeedback : ni dégâts ni esquive -> aucune séquence", () => {
            Fx._createTargetFeedback({id: "t1"}, {heal: "1d4"}, false);

            expect(globalThis.Sequence).not.toHaveBeenCalled();
        });
    });

    describe("effets sans JB2A (UTIL-02)", () => {

        beforeEach(() => {
            game.modules.set("sequencer", {active: true});
            game.modules.delete("JB2A_DnD5e");
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });
        });

        it("dégâts sur une cible -> pas de visuel, mais le clignotement est joué", async () => {
            const cardContent = {damage: "1d6", maxReach: 5, targetType: "Default"};

            await Fx.handleSpecialEffect(cardContent, [], {actorId: "userCharacterId"}, "fire");

            const instances = globalThis.Sequence.mock.results.map(r => r.value);
            expect(instances.every(seq => seq.file.mock.calls.length === 0)).toBe(true);
            expect(instances.some(seq => seq.animation.mock.calls.length > 0)).toBe(true);
        });

        it("esquive -> pas de visuel, mais le son d'esquive est joué", () => {
            Fx._createTargetFeedback({id: "t1"}, {damage: "1d6"}, true);

            const seq = globalThis.Sequence.mock.results[0].value;
            expect(seq.effect).not.toHaveBeenCalled();
            expect(seq.file).toHaveBeenCalledWith("modules/fq-card-engine/sounds/evasion/1.mp3");
        });

        it("critique -> aucune séquence de critique construite", async () => {
            const cardContent = {damage: "1d6", maxReach: 0, targetType: "Default"};
            const resultArray = [{targetTokenId: "token1", critical: true}];

            await Fx.handleSpecialEffect(cardContent, resultArray, {actorId: "userCharacterId"}, "fire");

            expect(globalThis.Sequence).not.toHaveBeenCalled();
        });
    });

    describe("clignotement de dégâts (getBlinkAnimation / restoreTokenOpacity)", () => {

        beforeEach(() => {
            globalThis.Sequence = vi.fn().mockImplementation(function () {
                return makeChainableSequence();
            });
        });

        it("ne descend jamais jusqu'à une opacité nulle", () => {
            const seq = new globalThis.Sequence();

            Fx.getBlinkAnimation(seq, {id: "t1"}, 100, 3);

            const opacities = seq.opacity.mock.calls.map(call => call[0]);
            expect(opacities).not.toContain(0);
            expect(opacities).toContain(Fx.BLINK_MIN_OPACITY);
            expect(opacities).toContain(1);
        });

        it("restaure l'opacité pleine à la fin de la séquence", () => {
            const seq = new globalThis.Sequence();
            const token = {id: "t1", alpha: 1, mesh: {alpha: 1}};

            Fx.getBlinkAnimation(seq, token, 100, 2);
            token.alpha = Fx.BLINK_MIN_OPACITY;
            token.mesh.alpha = Fx.BLINK_MIN_OPACITY;
            seq.thenDo.mock.calls.at(-1)[0]();

            expect(token.alpha).toBe(1);
            expect(token.mesh.alpha).toBe(1);
        });

        it("restaure l'opacité même si la séquence est interrompue en plein clignotement", () => {
            vi.useFakeTimers();
            const seq = new globalThis.Sequence();
            const token = {id: "t1", alpha: 1, mesh: {alpha: 1}};

            Fx.getBlinkAnimation(seq, token, 100, 8);
            seq.thenDo.mock.calls[0][0]();
            token.alpha = Fx.BLINK_MIN_OPACITY;
            token.mesh.alpha = Fx.BLINK_MIN_OPACITY;
            vi.advanceTimersByTime(8 * (100 + Fx.BLINK_STEP_DURATION) + Fx.BLINK_SAFETY_MARGIN);

            expect(token.alpha).toBe(1);
            expect(token.mesh.alpha).toBe(1);
        });

        it("le filet de sécurité est annulé quand la séquence va au bout", () => {
            vi.useFakeTimers();
            const seq = new globalThis.Sequence();
            const token = {id: "t1", alpha: 1, mesh: {alpha: 1}};

            Fx.getBlinkAnimation(seq, token, 100, 2);
            seq.thenDo.mock.calls[0][0]();
            seq.thenDo.mock.calls.at(-1)[0]();

            expect(vi.getTimerCount()).toBe(0);
        });

        it("restoreTokenOpacity : accepte un document de token et ignore un placeable détruit", () => {
            const placeable = {alpha: 0.15, mesh: {alpha: 0.15}};

            Fx.restoreTokenOpacity({object: placeable});
            expect(placeable.alpha).toBe(1);

            const destroyed = {alpha: 0.15, destroyed: true, mesh: {alpha: 0.15}};
            Fx.restoreTokenOpacity(destroyed);
            expect(destroyed.alpha).toBe(0.15);

            expect(() => Fx.restoreTokenOpacity(null)).not.toThrow();
        });
    });

    describe("handleSpecialEffect - Sequencer ABSENT (UTIL-01)", () => {
        it("module inactif et Sequence non défini -> ne jette pas", async () => {
            expect(globalThis.Sequence).toBeUndefined();
            expect(game.modules.get("sequencer")?.active).toBeFalsy();

            const cardContent = {sound: "beep.mp3"};

            await expect(Fx.handleSpecialEffect(cardContent, [], {}, null)).resolves.toBeUndefined();
        });

        it("joue le son via foundry.audio.AudioHelper.play après 200ms", async () => {
            vi.useFakeTimers();
            const cardContent = {sound: "beep.mp3"};

            await Fx.handleSpecialEffect(cardContent, [], {}, null);
            expect(foundry.audio.AudioHelper.play).not.toHaveBeenCalled();

            vi.advanceTimersByTime(200);

            expect(foundry.audio.AudioHelper.play).toHaveBeenCalledWith(
                expect.objectContaining({src: "modules/fq-card-engine/sounds/beep.mp3"}),
                true
            );
        });
    });
});
