import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {makeActor} from "../factories.js";
import ResourceHandler from "../../src/domain/engine/shared/resource-handler.js";
import Constants from "../../src/domain/constants.js";
import Damage from "../../src/domain/engine/roll/damage.js";
import ResultChatLog from "../../src/domain/engine/roll/result-chat-log.js";
import {registerResultPresenter} from "../../src/domain/engine/roll/result-presenter.js";
import RollReport from "../../src/domain/engine/roll/roll-report.js";
import Fx from "../../src/domain/engine/shared/fx.js";
import OpportunityAttack from "../../src/domain/engine/reaction/opportunity-attack.js";

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

        it("le bonus de portée de l'acteur qui agit étend la portée maximale, jamais la minimale", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [{id: "t1"}], outOfReach: []});
            const actor = {system: {fq: {bonus: {range: 2}}}};
            const activity = {
                actor, item: {system: {fq: {}}}, type: "attack",
                range: {value: 10, reach: 0}, target: {}
            };

            hook(activity, {}, {}, {});

            // Sans bonus : min 1, max 2. Le bonus de deux cases porte le max à 4
            // et laisse le min intact — un coup pré-validé grâce au bonus était
            // sinon refusé par cette garde, ce qui termine le tour d'un PNJ.
            expect(ResourceHandler.evaluateTargeting).toHaveBeenCalledWith(actor, 1, 1, 4);
        });

        it("le bonus lu est celui de l'acteur qui agit, pas celui du personnage de l'utilisateur", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [{id: "t1"}], outOfReach: []});
            // Le personnage de l'utilisateur a un gros bonus ; le PNJ qui agit,
            // aucun. Lire le premier donnerait au PNJ une portée qu'il n'a pas.
            vi.spyOn(Constants, "rangeBonus", "get").mockReturnValue(9);
            const actor = {system: {fq: {bonus: {range: 0}}}};
            const activity = {actor, item: {system: {fq: {}}}, type: "attack", range: {value: 10, reach: 0}, target: {}};

            hook(activity, {}, {}, {});

            expect(ResourceHandler.evaluateTargeting).toHaveBeenCalledWith(actor, 1, 1, 2);
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

        it("consomme le coût FQ d'une activité hors soin/attaque/dégâts, qu'aucun jet ne viendrait facturer", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [{id: "t1"}], outOfReach: []
            });
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const fq = {action: -3};
            const activity = {
                actor: {}, item: {system: {fq}}, type: "utility",
                range: {value: 10, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
            expect(ResourceHandler.consumeResources).toHaveBeenCalledWith(fq, activity.actor);
        });

        it("consomme aussi sur le chemin d'auto-cible", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([]);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const fq = {mana: -2};
            const activity = {
                actor: {}, item: {system: {fq}}, type: "utility",
                range: {value: 0, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(true);
            expect(ResourceHandler.consumeResources).toHaveBeenCalledWith(fq, activity.actor);
        });

        it("ne consomme PAS un soin, une attaque ou des dégâts : leur coût reste prélevé après le jet de dés", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [{id: "t1"}], outOfReach: []
            });
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});

            for (const type of ["heal", "attack", "damage"]) {
                const activity = {
                    actor: {}, item: {system: {fq: {action: -3}}}, type,
                    range: {value: 10, reach: 0}, target: {}
                };

                expect(hook(activity, {}, {}, {})).toBe(true);
            }

            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
        });

        it("ne consomme rien quand le ciblage est refusé : une activité écartée ne coûte pas", () => {
            const hook = getHook("dnd5e.preUseActivity");
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(Constants, "myTargets").mockReturnValue([{id: "t1"}]);
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OUT_OF_REACH, targets: [], outOfReach: []
            });
            vi.spyOn(ResourceHandler, "warnTargeting").mockImplementation(() => {});
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const activity = {
                actor: {}, item: {system: {fq: {action: -3}}}, type: "utility",
                range: {value: 10, reach: 0}, target: {}
            };

            const result = hook(activity, {}, {}, {});

            expect(result).toBe(false);
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
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
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
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
                .toHaveBeenCalledWith(actor, roll.total, expect.objectContaining({heal: "1d8"}), expect.any(RollReport));
            expect(Fx.handleSpecialEffect).toHaveBeenCalled();
            expect(socket.executeAsGM).toHaveBeenCalledWith("applyActorHpModification", "token-1", 5, "healFQ");
            expect(ResultChatLog.publish).toHaveBeenCalledWith(actor, expect.any(RollReport));
            expect(socket.executeAsGM)
                .toHaveBeenCalledWith("logCardPlayed", expect.any(Array), expect.objectContaining({heal: "1d8"}),
                    expect.any(String), expect.any(Array), null);
        });

        it("consomme les ressources FQ au jet pour une activité de dégâts (consommation différée)", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
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
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
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

        it("la résolution frappe les cibles de l'usage, pas celles que la sélection est devenue depuis", async () => {
            const preUse = getHook("dnd5e.preUseActivity");
            const rollDamage = getHook("dnd5e.rollDamageV2");
            game.system = {grid: {distance: 5}};
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [], outOfReach: []});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            const ennemi = {id: "token-lyrkhan"};
            const alliee = {id: "token-momie-alliee"};
            const selection = new Set([ennemi]);
            vi.spyOn(Constants, "myTargets").mockImplementation(() => [...selection]);
            vi.spyOn(Constants, "currentTargets", "get").mockImplementation(() => [...selection]);

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const item = {actor, system: {fq: {action: -1}}};
            const subject = {item, actor, type: "attack", range: {value: 0, reach: 5}, target: {}};

            preUse(subject, {}, {}, {});
            // Les dés roulent ; la sélection du MJ est rendue entre-temps et
            // désigne maintenant une alliée. C'est la course exacte relevée en jeu.
            selection.clear();
            selection.add(alliee);

            await rollDamage([{formula: "2d6", total: 7, options: {type: "slashing"}}], {subject});

            // Le 5e argument : l'élément du jet dnd5e — le sien.
            expect(Damage.addCriticalEvasionToDamage).toHaveBeenCalledWith(
                actor, expect.any(Number), expect.objectContaining({forcedTargets: [ennemi]}), expect.any(RollReport),
                expect.objectContaining({types: ["slashing"]}));
        });

        it("le journal ne reçoit pas les cibles imposées : un Token est un graphe circulaire", async () => {
            const preUse = getHook("dnd5e.preUseActivity");
            const rollDamage = getHook("dnd5e.rollDamageV2");
            game.system = {grid: {distance: 5}};
            vi.spyOn(ResourceHandler, "checkResources").mockReturnValue(true);
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(ResourceHandler, "evaluateTargeting").mockReturnValue({
                verdict: ResourceHandler.TARGETING_VERDICT.OK, targets: [], outOfReach: []});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            // Un Token de Foundry est un objet PIXI qui se référence lui-même par sa
            // scène et son calque : c'est CE graphe qui faisait déborder la pile dans
            // la sérialisation socketlib, chez un joueur uniquement.
            const cible = {id: "token-cible"};
            cible.scene = {tokens: [cible]};
            vi.spyOn(Constants, "myTargets").mockReturnValue([cible]);
            vi.spyOn(Constants, "currentTargets", "get").mockReturnValue([cible]);

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const item = {actor, system: {fq: {action: -1}}};
            const subject = {item, actor, type: "attack", range: {value: 0, reach: 5}, target: {}};

            preUse(subject, {}, {}, {});
            // Le mock socketlib du fichier est partagé et jamais vidé entre les tests :
            // sans ce nettoyage, la recherche ci-dessous retomberait sur le journal
            // d'un test précédent, et l'assertion ne prouverait rien.
            socket.executeAsGM.mockClear();
            await rollDamage([{formula: "2d6", total: 7, options: {type: "slashing"}}], {subject});

            // La résolution locale, elle, garde bien les cibles figées.
            expect(Damage.addCriticalEvasionToDamage).toHaveBeenCalledWith(
                actor, expect.any(Number), expect.objectContaining({forcedTargets: [cible]}), expect.any(RollReport),
                expect.any(Object));

            const logged = socket.executeAsGM.mock.calls.find(call => call[0] === "logCardPlayed")?.[2];
            expect(logged).toBeDefined();
            expect(logged).not.toHaveProperty("forcedTargets");
            // La charge du journal doit rester sérialisable de bout en bout : socketlib
            // la transporte, puis Foundry l'écrit dans les flags du combat.
            expect(() => JSON.stringify(logged)).not.toThrow();
        });

        it("attaque d'opportunité : FX joués depuis le token réactant, vers la cible imposée", async () => {
            // Deux jetons pour un même acteur (une horde) : la recherche par acteur
            // rendrait `token-1`, alors que c'est `token-2` qui a réagi.
            const reactant = {actorId: "actor-1", id: "token-2"};
            const fuyard = {actorId: "actor-2", id: "token-fuyard"};
            game.canvas = {scene: {tokens: [{actorId: "actor-1", id: "token-1"}, reactant, fuyard]}};

            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            const published = vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const item = {actor, system: {fq: {action: -1}}};
            const subject = {item, actor, type: "attack", range: {value: 0, reach: 5}};

            // Ce que fait `strike` puis `preUseActivity`, dans cet ordre.
            OpportunityAttack.pending = {
                actorId: "actor-1", sourceTokenId: "token-2", targetTokenId: "token-fuyard"};
            OpportunityAttack.rememberContextFor(subject);
            OpportunityAttack.pending = null;

            await hook([{formula: "2d6", total: 7, options: {type: "slashing"}}], {subject});

            expect(Fx.handleSpecialEffect).toHaveBeenCalledWith(
                expect.objectContaining({forcedTargets: [fuyard]}), expect.any(Array), reactant, "slashing",
                [fuyard]);
            // Une attaque d'opportunité est gratuite.
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            // …et le rapport porte la mention : sans elle, une AO serait
            // indiscernable d'une attaque ordinaire, dans la fenêtre comme dans le
            // message de chat, qui la rendent tous deux depuis ce seul champ.
            const report = published.mock.calls[0][1];
            expect(report.header.tag).toContain("FQCARDENGINE.ChatMessagePartOpportunityAttack");
        });

        it("garde le type de dégâts pour les FX même quand l'acteur a un bonus", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();

            // Le bonus fait repartir un second jet, reconstruit à partir du seul
            // total : il a perdu les options de dnd5e, dont le type de dégâts.
            const actor = {id: "actor-1", system: {fq: {bonus: {damage: "+2"}}}};
            const item = {actor, system: {fq: {}}};
            const subject = {item, actor, type: "damage", range: {value: 0, reach: 0}};

            await hook([{formula: "2d6", total: 7, options: {type: "fire"}}], {subject});

            expect(Fx.handleSpecialEffect).toHaveBeenCalledWith(
                expect.anything(), expect.any(Array), expect.anything(), "fire", expect.anything());
        });

        it("vise les cibles figées avant l'animation, pas celles d'après", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            const visee = {id: "token-vise"};
            const survenue = {id: "token-survenu"};
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            vi.spyOn(Fx, "handleSpecialEffect").mockResolvedValue();
            vi.spyOn(Constants, "myTargets").mockReturnValue([visee]);
            // La sélection change PENDANT que la fenêtre déroule son animation.
            registerResultPresenter(async () => {
                Constants.myTargets.mockReturnValue([survenue]);
            });

            const actor = {id: "actor-1", system: {fq: {bonus: {damage: ""}}}};
            const item = {actor, system: {fq: {}}};
            const subject = {item, actor, type: "damage", range: {value: 0, reach: 0}};

            await hook([{formula: "2d6", total: 7, options: {type: "fire"}}], {subject});

            expect(Fx.handleSpecialEffect).toHaveBeenCalledWith(
                expect.anything(), expect.any(Array), expect.anything(), expect.anything(), [visee]);
            registerResultPresenter(null);
        });

        it("joue les FX seulement une fois l'affichage du résultat terminé", async () => {
            const hook = getHook("dnd5e.rollDamageV2");
            let presented = false;
            let presentedWhenFxPlayed;
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            vi.spyOn(ResultChatLog, "publish").mockImplementation(() => {});
            // L'affichage se termine de façon asynchrone, après tout code
            // synchrone : les FX ne doivent pas partir avant lui.
            registerResultPresenter(async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                presented = true;
            });
            vi.spyOn(Damage, "addCriticalEvasionToDamage").mockResolvedValue([]);
            vi.spyOn(Fx, "handleSpecialEffect").mockImplementation(async () => {
                presentedWhenFxPlayed = presented;
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
            expect(presentedWhenFxPlayed).toBe(true);
            registerResultPresenter(null);
        });

    });

    describe("dnd5e.preUseActivity — carte d'usage", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            game.system = {grid: {distance: 5}};
        });

        it("supprime la carte de dnd5e quand le moteur résout l'activité", () => {
            const hook = getHook("dnd5e.preUseActivity");
            const actor = {id: "actor-1"};
            const activity = {
                type: "save", actor, item: {type: "spell", actor, system: {fq: {}}},
                range: {value: 30}, target: {}
            };
            const messageConfig = {create: true};

            hook(activity, {}, {}, messageConfig);

            // Ses boutons rejoueraient à la main des dés déjà lancés.
            expect(messageConfig.create).toBe(false);
        });

        it("laisse la carte des activités que le moteur ne résout pas", () => {
            const hook = getHook("dnd5e.preUseActivity");
            const actor = {id: "actor-1"};
            const activity = {
                type: "utility", actor, item: {type: "spell", actor: null, system: {fq: {}}},
                range: {value: 30}, target: {}
            };
            const messageConfig = {create: true};

            hook(activity, {}, {}, messageConfig);

            expect(messageConfig.create).toBe(true);
        });
    });

    describe("dnd5e.postUseActivity", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        });

        /**
         * Activité dnd5e minimale, telle que le hook la reçoit après usage.
         *
         * @param {string} type - Le type d'activité.
         *
         * @returns {object} L'activité simulée.
         */
        function used(type) {
            const actor = {id: "actor-1"};
            return {type, actor, item: {type: "spell", actor}, rollDamage: vi.fn()};
        }

        it("déclenche le jet d'une sauvegarde, que dnd5e n'enchaîne pas seul", () => {
            const hook = getHook("dnd5e.postUseActivity");
            const activity = used("save");

            hook(activity);

            expect(activity.rollDamage).toHaveBeenCalledWith({}, {configure: false});
        });

        it("ne double pas les types que dnd5e enchaîne déjà", () => {
            const hook = getHook("dnd5e.postUseActivity");
            for (const type of ["attack", "damage", "heal"]) {
                const activity = used(type);
                hook(activity);
                expect(activity.rollDamage).not.toHaveBeenCalled();
            }
        });

        it("laisse tranquille une activité que le moteur ne résout pas", () => {
            const hook = getHook("dnd5e.postUseActivity");
            const activity = {type: "save", item: {type: "spell", actor: null}, rollDamage: vi.fn()};

            hook(activity);

            expect(activity.rollDamage).not.toHaveBeenCalled();
        });
    });

    describe("dnd5e.preRollAttackV2", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        });

        /**
         * Activité dnd5e minimale. `item.actor` et le type décident à eux seuls si
         * le moteur prend la résolution en charge : le type d'ITEM (arme ou sort)
         * n'entre plus dans la décision.
         *
         * @param {object} [options] - Le type d'activité et la présence d'un acteur.
         *
         * @returns {object} Le contexte du hook.
         */
        function buildAttackConfig({type = "attack", withActor = true} = {}) {
            const actor = {id: "actor-1"};
            const activity = {
                type,
                actor,
                item: {type: "weapon", actor: withActor ? actor : null, system: {fq: {action: -1}}},
                rollDamage: vi.fn()
            };
            return {config: {subject: activity}, activity, actor};
        }

        it("écarte le jet d'attaque de dnd5e et enchaîne sur les dégâts", () => {
            // Le moteur jette le toucher PAR CIBLE dans sa fenêtre : laisser dnd5e
            // jeter une attaque unique en plus n'aurait aucun sens.
            const hook = getHook("dnd5e.preRollAttackV2");
            vi.spyOn(ResourceHandler, "consumeResources").mockImplementation(() => {});
            const {config, activity} = buildAttackConfig();

            const result = hook(config, {}, {});

            expect(result).toBe(false);
            // La consommation reste au jet de dés, comme avant.
            expect(ResourceHandler.consumeResources).not.toHaveBeenCalled();
            expect(activity.rollDamage).toHaveBeenCalledWith({}, {configure: false});
        });

        it("laisse passer une activité que le moteur ne résout pas", () => {
            const hook = getHook("dnd5e.preRollAttackV2");
            const {config, activity} = buildAttackConfig({withActor: false});

            const result = hook(config, {}, {});

            expect(result).toBe(true);
            expect(activity.rollDamage).not.toHaveBeenCalled();
        });

        it("laisse passer un type d'activité hors du périmètre du moteur", () => {
            const hook = getHook("dnd5e.preRollAttackV2");
            const {config, activity} = buildAttackConfig({type: "utility"});

            const result = hook(config, {}, {});

            expect(result).toBe(true);
            expect(activity.rollDamage).not.toHaveBeenCalled();
        });
    });

    describe("dnd5e.preRollDamageV2", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        });

        /**
         * Contexte de jet de dégâts pour une activité résolue ou non par le moteur.
         *
         * @param {object} [options] - Le type d'activité et la présence d'un acteur.
         *
         * @returns {object} Le contexte du hook.
         */
        function damageConfig({type = "attack", withActor = true} = {}) {
            const actor = {id: "actor-1"};
            return {subject: {type, actor, item: {type: "weapon", actor: withActor ? actor : null}}};
        }

        it("supprime le message de dnd5e et sa modale quand le moteur résout le jet", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            const dialog = {configure: true};
            const message = {create: true};

            const result = hook(damageConfig(), dialog, message);

            expect(result).toBe(true);
            expect(dialog.configure).toBe(false);
            expect(message.create).toBe(false);
        });

        it("court-circuite aussi la modale d'une sauvegarde", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            const dialog = {configure: true};

            const result = hook(damageConfig({type: "save"}), dialog, {});

            expect(result).toBe(true);
            expect(dialog.configure).toBe(false);
        });

        it("ne touche à rien quand le moteur ne résout pas le jet", () => {
            const hook = getHook("dnd5e.preRollDamageV2");
            const dialog = {configure: true};
            const message = {create: true};

            const result = hook(damageConfig({withActor: false}), dialog, message);

            expect(result).toBe(true);
            expect(dialog.configure).toBe(true);
            expect(message.create).toBe(true);
        });
    });

    describe("menus contextuels des feuilles", () => {
        afterEach(() => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = false;
        });

        it("retirent l'édition des objets, effets et activités pour un joueur aux droits limités", () => {
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
            game.user.isGM = false;
            const menu = () => [{label: "DND5E.ItemView"}, {label: "DND5E.ContextMenuActionEdit"}];
            const itemMenu = menu();
            const effectMenu = menu();
            const activityMenu = menu();

            getHook("dnd5e.getItemContextOptions")({}, itemMenu);
            getHook("dnd5e.getActiveEffectContextOptions")({}, effectMenu);
            getHook("dnd5e.getItemActivityContext")({}, null, activityMenu);

            for (const menuItems of [itemMenu, effectMenu, activityMenu]) {
                expect(menuItems.map(e => e.label)).toEqual(["DND5E.ItemView"]);
            }
        });
    });
});
