import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";
import RollReport from "../../src/domain/engine/roll/roll-report.js";

/**
 * Les effets « à la prochaine attaque » : « En élan » (le porteur attaque avec
 * avantage jusqu'à son prochain jet) et « Garde brisée » (on l'attaque avec
 * avantage jusqu'au prochain jet qui le vise).
 *
 * `attackConsumption` lit dans le rapport QUI a été visé par un jet d'attaque ;
 * `consumeAttackEffects`, exécutée chez le MJ, retire ce qui doit tomber.
 */

const MODULE = "fq-card-engine";
let originalCanvas;
let originalModule;

/**
 * Un effet actif, marqué ou non pour la prochaine attaque.
 *
 * @param {string}  id     - Son id.
 * @param {?string} [side] - « made », « received », ou rien.
 *
 * @returns {object} L'effet.
 */
const effect = (id, side) => ({id, flags: side ? {[MODULE]: {expireOnAttack: side}} : {[MODULE]: {expireOnDamage: false}}});

/**
 * Un acteur porteur d'effets, qui enregistre ce qu'on lui retire.
 *
 * @param {...object} effects - Ses effets.
 *
 * @returns {object} L'acteur.
 */
const bearer = (...effects) => ({effects, deleteEmbeddedDocuments: vi.fn(async () => [])});

/**
 * Le rapport d'une résolution, avec ses jets pour toucher.
 *
 * @param {...object} hits - Les jets `{targetTokenId, kind}`.
 *
 * @returns {RollReport} Le rapport.
 */
function reportWith(...hits) {
    const report = new RollReport();
    hits.forEach(({targetTokenId, kind}) => report.addHit({
        targetTokenId, targetName: targetTokenId, kind, roll: 10, modifier: 0, total: 10, threshold: 12, defended: false
    }));
    return report;
}

beforeEach(() => {
    originalCanvas = globalThis.game.canvas;
    originalModule = globalThis.FqCardEngineModule;
    globalThis.FqCardEngineModule = {moduleName: MODULE};
});

afterEach(() => {
    globalThis.game.canvas = originalCanvas;
    globalThis.FqCardEngineModule = originalModule;
    vi.restoreAllMocks();
});

describe("Damage.attackConsumption", () => {

    it("aucun jet pour toucher : rien à consommer", () => {
        expect(Damage.attackConsumption({token: {id: "me"}}, new RollReport())).toBeNull();
    });

    it("une SAUVEGARDE n'est pas un jet d'attaque : rien à consommer", () => {
        expect(Damage.attackConsumption({token: {id: "me"}}, reportWith({targetTokenId: "t1", kind: "save"})))
            .toBeNull();
    });

    it("un jet d'attaque : le jeton du lanceur et ceux des cibles visées, sans doublon", () => {
        const report = reportWith(
            {targetTokenId: "t1", kind: "ac"}, {targetTokenId: "t2", kind: "ac"}, {targetTokenId: "t1", kind: "ac"});

        expect(Damage.attackConsumption({token: {id: "me"}}, report)).toEqual(["me", ["t1", "t2"]]);
    });

    it("le jeton du lanceur est retrouvé sur la scène quand l'acteur est lié", () => {
        globalThis.game.canvas = {scene: {tokens: [{id: "hero-token", actorId: "hero"}]}};

        expect(Damage.attackConsumption({id: "hero"}, reportWith({targetTokenId: "t1", kind: "ac"})))
            .toEqual(["hero-token", ["t1"]]);
    });

    it("un lanceur sans jeton : les cibles sont tout de même consommées", () => {
        globalThis.game.canvas = {scene: {tokens: []}};

        expect(Damage.attackConsumption({id: "ghost"}, reportWith({targetTokenId: "t1", kind: "ac"})))
            .toEqual([null, ["t1"]]);
    });
});

describe("Damage.consumeAttackEffects (côté MJ)", () => {

    /**
     * Pose des jetons sur le canevas.
     *
     * @param {Object<string, object>} actors - Les acteurs par id de jeton.
     */
    function canvasWith(actors) {
        globalThis.game.canvas = {tokens: {get: vi.fn(id => actors[id] ? {actor: actors[id]} : undefined)}};
    }

    it("le lanceur perd son « En élan », pas une « Garde brisée » qu'il porterait", async () => {
        const caster = bearer(effect("elan", "made"), effect("breche", "received"), effect("autre"));
        canvasWith({me: caster});

        await Damage.consumeAttackEffects("me", []);

        expect(caster.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["elan"]);
    });

    it("chaque cible visée perd sa « Garde brisée », pas un « En élan » qu'elle porterait", async () => {
        const first = bearer(effect("breche-1", "received"), effect("elan-1", "made"));
        const second = bearer(effect("breche-2", "received"));
        canvasWith({t1: first, t2: second});

        await Damage.consumeAttackEffects(null, ["t1", "t2"]);

        expect(first.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["breche-1"]);
        expect(second.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["breche-2"]);
    });

    it("rien à retirer : aucune suppression demandée", async () => {
        const quiet = bearer(effect("autre"));
        canvasWith({me: quiet, t1: quiet});

        await Damage.consumeAttackEffects("me", ["t1"]);

        expect(quiet.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it("une cible visée deux fois n'est traitée qu'une fois", async () => {
        const target = bearer(effect("breche", "received"));
        canvasWith({t1: target});

        await Damage.consumeAttackEffects(null, ["t1", "t1"]);

        expect(target.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    });

    it("jeton absent ou acteur sans effets : aucune erreur", async () => {
        canvasWith({t2: {effects: undefined, deleteEmbeddedDocuments: vi.fn()}});

        await expect(Damage.consumeAttackEffects("absent", ["absent", "t2"])).resolves.toBeUndefined();
    });

    it("les effets arrivent aussi en collection Foundry, pas seulement en tableau", async () => {
        const target = {effects: new Set([effect("breche", "received")]), deleteEmbeddedDocuments: vi.fn(async () => [])};
        canvasWith({t1: target});

        await Damage.consumeAttackEffects(null, ["t1"]);

        expect(target.deleteEmbeddedDocuments).toHaveBeenCalledWith("ActiveEffect", ["breche"]);
    });
});
