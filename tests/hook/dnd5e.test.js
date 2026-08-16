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

        it("consomme les ressources FQ au jet pour une activité de dégâts (consommation différée)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(Damage, "displayResult").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const fq = {action: -1, mana: -2};
            const item = {actor, system: {fq}};
            const subject = {
                item, actor, type: "damage",
                range: {value: 0, reach: 0}
            };
            const roll = {formula: "2d6", total: 7, options: {type: "fire"}};

            await hook([roll], {subject});

            expect(ResourceHandler.consumeResources).toHaveBeenCalledWith(fq, actor);
        });

        it("consomme les ressources FQ au jet pour une activité d'attaque (armes, avec ou sans bypass)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(Damage, "displayResult").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const fq = {action: -1};
            const item = {actor, system: {fq}};
            const subject = {
                item, actor, type: "attack",
                range: {value: 0, reach: 0}
            };
            const roll = {formula: "2d6", total: 7, options: {type: "fire"}};

            await hook([roll], {subject});

            expect(ResourceHandler.consumeResources).toHaveBeenCalledWith(fq, actor);
        });

        it("joue les FX seulement après la fin des animations de dés (Dice So Nice)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            let diceDone = false;
            let diceDoneWhenFxPlayed;
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "displayResult").mockImplementation(() => {});
            // Le jet dépose une animation de dés dans le collecteur ; elle se termine
            // de façon asynchrone (setTimeout) après tout code synchrone.
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockImplementation(async (a, t, c, dsn) => {
                dsn.push(new Promise(resolve => setTimeout(() => {
                    diceDone = true;
                    resolve();
                }, 5)));
                return [];
            });
            vi.spyOn(Fx, "handleSpecialEffect").mockImplementation(async () => {
                diceDoneWhenFxPlayed = diceDone;
            });

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const item = {actor, system: {fq: {}}};
            const subject = {
                item, actor, type: "damage",
                range: {value: 0, reach: 0}
            };
            const roll = {formula: "2d6", total: 7, options: {type: "fire"}};

            await hook([roll], {subject});

            expect(Fx.handleSpecialEffect).toHaveBeenCalled();
            expect(diceDoneWhenFxPlayed).toBe(true);
        });

    });

    describe("dnd5e.preRollAttackV2", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        });

        function buildAttackConfig({itemType = "weapon", fq = {action: -1}} = {}) {
            const actor = {id: "actor-1"};
            const activity = {
                actor,
                item: {type: itemType, system: {fq}},
                rollDamage: vi.fn()
            };
            return {config: {subject: activity}, activity, actor, fq};
        }

        it("laisse passer le jet d'attaque quand le réglage de bypass est désactivé", () => {
            const hook = getHook("dnd5e.preRollAttackV2");
            game.settings.get.mockReturnValue(false);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const {config, activity} = buildAttackConfig();

            const result = hook(config, {}, {});

            expect(result).toBe(true);
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            expect(activity.rollDamage).not.toHaveBeenCalled();
        });

        it("bypass actif : lance directement les dégâts sans consommer ici (consommation dans rollDamageV2)", () => {
            const hook = getHook("dnd5e.preRollAttackV2");
            game.settings.get.mockReturnValue(true);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const {config, activity} = buildAttackConfig();

            const result = hook(config, {}, {});

            expect(result).toBe(false);
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            expect(activity.rollDamage).toHaveBeenCalledWith({}, {configure: false});
        });

        it("bypass actif : ignore les activités qui ne viennent pas d'une arme", () => {
            const hook = getHook("dnd5e.preRollAttackV2");
            game.settings.get.mockReturnValue(true);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const {config, activity} = buildAttackConfig({itemType: "spell"});

            const result = hook(config, {}, {});

            expect(result).toBe(true);
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            expect(activity.rollDamage).not.toHaveBeenCalled();
        });
    });

    describe("dnd5e.preRollDamageV2", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        });

        it("laisse la modale de dégâts quand le réglage de bypass est désactivé", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            game.settings.get.mockReturnValue(false);
            const config = {subject: {item: {type: "weapon"}}};
            const dialog = {configure: true};

            const result = hook(config, dialog, {});

            expect(result).toBe(true);
            expect(dialog.configure).toBe(true);
        });

        it("bypass actif : supprime la modale de dégâts des armes (cas activité damage seule)", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            game.settings.get.mockReturnValue(true);
            const config = {subject: {item: {type: "weapon"}}};
            const dialog = {configure: true};

            const result = hook(config, dialog, {});

            expect(result).toBe(true);
            expect(dialog.configure).toBe(false);
        });

        it("bypass actif : ne touche pas la modale des jets qui ne viennent pas d'une arme", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            game.settings.get.mockReturnValue(true);
            const config = {subject: {item: {type: "spell"}}};
            const dialog = {configure: true};

            const result = hook(config, dialog, {});

            expect(result).toBe(true);
            expect(dialog.configure).toBe(true);
        });
    });
});
