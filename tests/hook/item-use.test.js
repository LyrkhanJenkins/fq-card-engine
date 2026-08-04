import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {makeActor} from "../factories.js";
import DeckUtils from "../../src/domain/utils/deck-utils.js";
import ConsumptionUtils from "../../src/domain/utils/consumption-utils.js";
import FqConstants from "../../src/domain/utils/fq-constants.js";
import DamageUtils from "../../src/domain/utils/damage-utils.js";
import FxUtils from "../../src/domain/utils/fx-utils.js";

vi.mock("../../src/hook/socket-lib.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import {socket} from "../../src/hook/socket-lib.js";
import "../../src/hook/item-use.js";

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

describe("item-use", () => {

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
            vi.spyOn(ConsumptionUtils, "checkResources").mockReturnValue(false);
            const activity = {actor: {}, item: {system: {fq: {mana: -3}}}, type: "attack"};

            const result = hook(activity, {}, {}, {});

            expect(ConsumptionUtils.checkResources).toHaveBeenCalledWith(activity.item.system.fq, activity.actor);
            expect(result).toBe(false);
        });

        it("retourne true en auto-cible (aucune cible sélectionnée et portée minimale nulle)", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ConsumptionUtils, "checkResources").mockReturnValue(true);
            vi.spyOn(FqConstants, "myTargets").mockReturnValue([]);
            const activity = {
                actor: {}, item: {system: {fq: {}}}, type: "attack",
                range: {value: 0, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
        });

        it("délègue à checkIfCanCardCanReachTargets et propage sa valeur de retour", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ConsumptionUtils, "checkResources").mockReturnValue(true);
            vi.spyOn(FqConstants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ConsumptionUtils, "checkIfCanCardCanReachTargets").mockReturnValue(false);
            const activity = {
                actor: {}, item: {system: {fq: {}}}, type: "attack",
                range: {value: 10, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            // squareDistance=5 ; minRange = trunc(5)/5 = 1 ; maxRange = trunc(10)/5 = 2
            expect(ConsumptionUtils.checkIfCanCardCanReachTargets).toHaveBeenCalledWith(activity.actor, 1, 1, 2);
            expect(result).toBe(false);
        });
    });

    describe("dnd5e.activityConsumption", () => {
        it("ignore la consommation quand le filtre s'applique", () => {
            const hook = getHook("dnd5e.activityConsumption");
            vi.spyOn(ConsumptionUtils, "consumeResources");
            const activity = {actor: undefined, type: "utility"};

            const result = hook(activity, {}, {});

            expect(ConsumptionUtils.consumeResources).not.toHaveBeenCalled();
            expect(result).toBe(true);
        });

        it("consomme les ressources hors filtre", () => {
            const hook = getHook("dnd5e.activityConsumption");
            vi.spyOn(ConsumptionUtils, "consumeResources").mockImplementation(() => {});
            const activity = {actor: {}, item: {system: {fq: {action: -1}}}, type: "attack"};

            const result = hook(activity, {}, {});

            expect(ConsumptionUtils.consumeResources).toHaveBeenCalledWith(activity.item.system.fq, activity.actor);
            expect(result).toBe(true);
        });
    });

    describe("hooks CRUD d'objet (délégation vers DeckUtils)", () => {
        it("updateItem/createItem/deleteItem délèguent à DeckUtils.updateDeckWhenChange(document, options)", () => {
            vi.spyOn(DeckUtils, "updateDeckWhenChange").mockImplementation(() => {});
            const document = {type: "class"};
            const options = {isAdvancement: true, parent: {id: "parent-id"}};

            getHook("updateItem")(document, {}, options, "user-1");
            getHook("createItem")(document, options, "user-1");
            getHook("deleteItem")(document, options, "user-1");

            expect(DeckUtils.updateDeckWhenChange).toHaveBeenCalledTimes(3);
            expect(DeckUtils.updateDeckWhenChange).toHaveBeenCalledWith(document, options);
        });

        it("preUpdateItem/preCreateItem/preDeleteItem délèguent à DeckUtils.checkIfCanUpdateClasses(document, options)", () => {
            vi.spyOn(DeckUtils, "checkIfCanUpdateClasses").mockReturnValue(true);
            const document = {type: "class"};
            const options = {isAdvancement: true, parent: {id: "parent-id"}};

            getHook("preUpdateItem")(document, {}, options, "user-1");
            getHook("preCreateItem")(document, options, "user-1");
            getHook("preDeleteItem")(document, options, "user-1");

            expect(DeckUtils.checkIfCanUpdateClasses).toHaveBeenCalledTimes(3);
            expect(DeckUtils.checkIfCanUpdateClasses).toHaveBeenCalledWith(document, options);
        });
    });

    describe("dnd5e.rollDamageV2", () => {
        beforeEach(() => {
            game.system = {grid: {distance: 5}};
            game.canvas = {scene: {tokens: [{actorId: "actor-1", id: "token-1"}]}};
        });

        it("ne fait rien si subject.item est absent (garde de retour anticipé)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(DamageUtils, "addCriticalToHeal");
            const subject = {
                item: undefined,
                actor: {id: "actor-1"},
                range: {value: 0, reach: 0},
                type: "heal"
            };

            await hook([], {subject});

            expect(DamageUtils.addCriticalToHeal).not.toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalled();
        });

        it("applique un soin : addCriticalToHeal puis applyActorHpModification et logCardPlayed via socket", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(DamageUtils, "addCriticalToHeal").mockResolvedValue([
                {targetTokenId: "token-1", value: 5, type: "healFQ"}
            ]);
            vi.spyOn(DamageUtils, "displayResult").mockImplementation(() => {});
            vi.spyOn(FxUtils, "handleSpecialEffect").mockResolvedValue();

            const actor = {id: "actor-1", system: {fq: {bonus: {heal: ""}}}};
            const item = {actor};
            const subject = {
                item, actor, type: "heal",
                range: {value: 0, reach: 0}
            };
            const roll = {formula: "1d8", total: 8, options: {type: "fire"}};

            await hook([roll], {subject});

            expect(DamageUtils.addCriticalToHeal)
                .toHaveBeenCalledWith(actor, roll.total, expect.objectContaining({heal: "1d8"}));
            expect(FxUtils.handleSpecialEffect).toHaveBeenCalled();
            expect(socket.executeAsGM).toHaveBeenCalledWith("applyActorHpModification", "token-1", 5, "healFQ");
            expect(DamageUtils.displayResult)
                .toHaveBeenCalledWith(actor, [{targetTokenId: "token-1", value: 5, type: "healFQ"}], null);
            expect(socket.executeAsGM)
                .toHaveBeenCalledWith("logCardPlayed", expect.any(Array), expect.objectContaining({heal: "1d8"}));
        });
    });
});
