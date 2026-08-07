import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {makeActor} from "../factories.js";
import ResourceHandler from "../../src/domain/engine/shared/resource-handler.js";
import Constants from "../../src/domain/constants.js";
import Damage from "../../src/domain/engine/roll/damage.js";
import Fx from "../../src/domain/engine/shared/fx.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import {socket} from "../../src/hook/integration/socketlib.hook.js";
import "../../src/hook/integration/dnd5e.hook.js";

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

/**
 * Construit un acteur minimal pour les tests de repos (shortRest/longRest),
 * en réutilisant les défauts de fabrique (action/zeal) et en surchargeant
 * uniquement mana/abilities selon les besoins du test.
 */
function buildActorForRest({wisMod = 0, intMod = 0, mana = {value: 5, max: 5}} = {}) {
    const fq = makeActor().system.fq;
    return {
        system: {
            fq: {...fq, mana: {...mana}},
            abilities: {wis: {mod: wisMod}, int: {mod: intMod}}
        },
        update: vi.fn()
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("integration/dnd5e", () => {

    describe("dnd5e.shortRest", () => {
        it("restaure action et zeal, et ajoute le mana avec un plancher de 1", () => {
            const hook = getHook("dnd5e.shortRest");
            const actor = buildActorForRest({wisMod: -2, intMod: -1, mana: {value: 1, max: 10}});

            hook(actor, {});

            expect(actor.update).toHaveBeenCalledWith({"system.fq.action.value": 10});
            expect(actor.update).toHaveBeenCalledWith({"system.fq.zeal.value": 0});
            // max(-2, -1) = -1 < 1 -> plancher à 1 -> mana 1 + 1 = 2
            expect(actor.update).toHaveBeenCalledWith({"system.fq.mana.value": 2});
        });

        it("plafonne le mana ajouté au maximum de l'acteur", () => {
            const hook = getHook("dnd5e.shortRest");
            const actor = buildActorForRest({wisMod: 10, intMod: 3, mana: {value: 4, max: 5}});

            hook(actor, {});

            // max(10, 3) = 10 -> 4 + 10 = 14 > 5 -> plafonné à 5
            expect(actor.update).toHaveBeenCalledWith({"system.fq.mana.value": 5});
        });
    });

    describe("dnd5e.longRest", () => {
        it("restaure action, zeal et mana à leur maximum", () => {
            const hook = getHook("dnd5e.longRest");
            const actor = buildActorForRest({mana: {value: 1, max: 8}});

            hook(actor, {});

            expect(actor.update).toHaveBeenCalledWith({"system.fq.action.value": 10});
            expect(actor.update).toHaveBeenCalledWith({"system.fq.zeal.value": 0});
            expect(actor.update).toHaveBeenCalledWith({"system.fq.mana.value": 8});
        });
    });

    describe("dnd5e.preUseActivity", () => {
        beforeEach(() => {
            game.system = {grid: {distance: 5}};
        });

        it("ignore une activité sans acteur hors soin/attaque/dégâts (filtre notApplyFQOnActivity)", () => {
            const hook = getHook("dnd5e.preUseActivity");
            const activity = {actor: undefined, type: "utility"};

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
        });

        it("retourne false si les ressources sont insuffisantes", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(false);
            const activity = {actor: {}, item: {system: {fq: {mana: -3}}}, type: "attack"};

            const result = hook(activity, {}, {}, {});

            expect(ResourceHandler.checkResources).toHaveBeenCalledWith(activity.item.system.fq, activity.actor);
            expect(result).toBe(false);
        });

        it("retourne true en auto-cible (aucune cible sélectionnée et portée minimale nulle)", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([]);
            const activity = {
                actor: {}, item: {system: {fq: {}}}, type: "attack",
                range: {value: 0, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
        });

        it("délègue à evaluateTargeting : verdict non-OK → avertit (warnTargeting) et retourne false", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OUT_OF_REACH, targets: [], outOfReach: []
            });
            const warnSpy = vi.spyOn(ResourceHandler, "warnTargeting").mockImplementation(() => {});
            const activity = {
                actor: {}, item: {system: {fq: {}}}, type: "attack",
                range: {value: 10, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            // squareDistance=5 ; minRange = trunc(5)/5 = 1 ; maxRange = trunc(10)/5 = 2
            expect(ResourceHandler.evaluateTargeting).toHaveBeenCalledWith(activity.actor, 1, 1, 2);
            expect(warnSpy).toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it("délègue à evaluateTargeting : verdict OK → retourne true sans avertir", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [{id: "t1"}], outOfReach: []
            });
            const warnSpy = vi.spyOn(ResourceHandler, "warnTargeting").mockImplementation(() => {});
            const activity = {
                actor: {}, item: {system: {fq: {}}}, type: "attack",
                range: {value: 10, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe("dnd5e.activityConsumption", () => {
        it("ignore la consommation quand le filtre s'applique", () => {
            const hook = getHook("dnd5e.activityConsumption");
            vi.spyOn(ResourceHandler, "consumeResources");
            const activity = {actor: undefined, type: "utility"};

            const result = hook(activity, {}, {});

            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it("consomme les ressources hors filtre", () => {
            const hook = getHook("dnd5e.activityConsumption");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const activity = {actor: {}, item: {system: {fq: {action: -1}}}, type: "attack"};

            const result = hook(activity, {}, {});

            expect(ResourceHandler.consumeResources).toHaveBeenCalledWith(activity.item.system.fq, activity.actor);
            expect(result).toBe(true);
        });
    });

    describe("dnd5e.rollDamageV2", () => {
        beforeEach(() => {
            game.system = {grid: {distance: 5}};
            game.canvas = {scene: {tokens: [{actorId: "actor-1", id: "token-1"}]}};
        });

        it("ne fait rien si subject.item est absent (garde de retour anticipé)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(Damage, "addCriticalToHeal");
            const subject = {
                item: undefined,
                actor: {id: "actor-1"},
                range: {value: 0, reach: 0},
                type: "heal"
            };

            await hook([], {subject});

            expect(Damage.addCriticalToHeal).not.toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalled();
        });

        it("applique un soin : addCriticalToHeal puis applyActorHpModification et logCardPlayed via socket", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(Damage, "addCriticalToHeal").mockResolvedValue([
                {targetTokenId: "token-1", value: 5, type: "healFQ"}
            ]);
            vi.spyOn(Damage, "displayResult").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            const actor = {id: "actor-1", system: {fq: {bonus: {heal: ""}}}};
            const item = {actor};
            const subject = {
                item, actor, type: "heal",
                range: {value: 0, reach: 0}
            };
            const roll = {formula: "1d8", total: 8, options: {type: "fire"}};

            await hook([roll], {subject});

            expect(Damage.addCriticalToHeal)
                .toHaveBeenCalledWith(actor, roll.total, expect.objectContaining({heal: "1d8"}), expect.any(Array));
            expect(Fx.handleSpecialEffect).toHaveBeenCalled();
            expect(socket.executeAsGM).toHaveBeenCalledWith("applyActorHpModification", "token-1", 5, "healFQ");
            expect(Damage.displayResult)
                .toHaveBeenCalledWith(actor, [{targetTokenId: "token-1", value: 5, type: "healFQ"}], null);
            expect(socket.executeAsGM)
                .toHaveBeenCalledWith("logCardPlayed", expect.any(Array), expect.objectContaining({heal: "1d8"}));
        });
    });
});
