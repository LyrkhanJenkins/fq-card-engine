import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";
import {DAMAGES_COLOR} from "../../src/domain/constants.js";

describe("Damage", () => {
    let actor;

    beforeEach(() => {
        vi.clearAllMocks();
        actor = {
            _id: "targetActorId",
            system: {
                fq: {
                    bonus: {
                        damage: 5,
                        heal: 10
                    },
                    attributes: {
                        critical: 1,
                        evasion: 2
                    }
                }
            }
        };
    });

    it("should build damage dice launcher with bonus", async () => {
        const result = await Damage.buildDamageDiceLauncher(actor, "1d8", 1, -9999);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should build heal dice launcher with bonus", async () => {
        const result = await Damage.buildHealDiceLauncher(actor, "1d8", 1);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should add bonuses to heal", async () => {
        const result = await Damage.addCriticalToHeal(actor, 10, 1);
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    it("should add bonuses to damage", async () => {
        const result = await Damage.addCriticalEvasionToDamage(actor, 10, 1, -999);
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    it("should roll with success value result", async () => {
        const result = await Damage.rollWithSuccessValueResultAsync(actor, "1d20", {
            color: DAMAGES_COLOR,
            title: "Test"
        });
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it("should display roll result", () => {
        Damage.displayResult(actor, [{key: "Test", value: 10}], ["Manual Action"]);
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    });

    // ─── rollWithSuccessValueResultAsync — succès/échec ────────────────────────

    describe("Damage — rollWithSuccessValueResultAsync success/échec", () => {
        it("should flag SUCCÈS when the deterministic roll (10) reaches the success threshold", async () => {
            await Damage.rollWithSuccessValueResultAsync(actor, "1d20", {
                color: DAMAGES_COLOR, title: "Test", success: 5
            });
            const instance = Roll.mock.instances[Roll.mock.instances.length - 1];
            const flavor = instance.toMessage.mock.calls[0][0].flavor;
            expect(flavor).toContain("SUCCÈS");
        });

        it("should flag échec when the deterministic roll (10) misses the success threshold", async () => {
            await Damage.rollWithSuccessValueResultAsync(actor, "1d20", {
                color: DAMAGES_COLOR, title: "Test", success: 15
            });
            const instance = Roll.mock.instances[Roll.mock.instances.length - 1];
            const flavor = instance.toMessage.mock.calls[0][0].flavor;
            expect(flavor).toContain("échec");
        });
    });

    // ─── addCriticalEvasionToDamage — self/esquive/critique ────────────────────

    describe("Damage — addCriticalEvasionToDamage", () => {
        it("should push no entry when self-targeting (targetActor._id === actor._id)", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: actor._id, system: {fq: {attributes: {evasion: 3}}}},
                document: {name: "Self"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0});
            expect(result).toEqual([]);
        });

        it("should cancel damages (value: 0) when the target's evasion succeeds and no critical", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 15}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0});
            expect(result).toEqual([expect.objectContaining({value: 0, critical: false, evasion: true})]);
        });

        it("should keep full damages when the target's evasion fails and no critical", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0});
            expect(result).toEqual([expect.objectContaining({value: 10, critical: false, evasion: false})]);
        });

        it("should double damages on critical when the target's evasion fails", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: 20, bonusEva: 0});
            expect(result).toEqual([expect.objectContaining({value: 20, critical: true, evasion: false})]);
        });

        it("should NOT double damages when critical but the target's evasion succeeds (evasion passes over the critical)", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 15}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: 20, bonusEva: 0});
            expect(result).toEqual([expect.objectContaining({value: 10, critical: true, evasion: true})]);
        });

        it("should bound negative damages to 0", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, -5, {bonusCrit: -999, bonusEva: 0});
            expect(result).toEqual([expect.objectContaining({value: 0})]);
        });
    });

    // ─── addCriticalToHeal — critique + heal<0 ──────────────────────────────────

    describe("Damage — addCriticalToHeal", () => {
        it("should double the heal amount on critical", async () => {
            const result = await Damage.addCriticalToHeal(actor, 10, {bonusCrit: 15});
            expect(result[0].value).toBe(20);
            expect(result[0].critical).toBe(true);
        });

        it("should bound a negative heal to 0", async () => {
            const result = await Damage.addCriticalToHeal(actor, -5, {bonusCrit: -999});
            expect(result[0].value).toBe(0);
            expect(result[0].critical).toBe(false);
        });
    });

    // ─── displayResult — branches ────────────────────────────────────────────

    describe("Damage — displayResult branches", () => {
        it("should not post a chat message when resultArray is empty and manualActions is null", () => {
            Damage.displayResult(actor, [], null);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("should post a message with only the result section when manualActions is empty", () => {
            Damage.displayResult(actor, [{key: "Dégâts", value: 5}], []);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
            const content = ChatMessage.create.mock.calls[0][0].content;
            expect(content).toContain("Dégâts");
            expect(content).not.toContain("<h2>");
        });

        it("should post a message with only the manual actions section when resultArray is empty", () => {
            Damage.displayResult(actor, [], ["Manual Action"]);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
            const content = ChatMessage.create.mock.calls[0][0].content;
            expect(content).not.toContain("<h1>");
            expect(content).toContain("Manual Action");
        });
    });

    // ─── addEffectForTarget ────────────────────────────────────────────────────

    describe("Damage — addEffectForTarget", () => {
        afterEach(() => {
            globalThis.ActiveEffect = undefined;
        });

        it("should create the active effect on the actor of the targeted token", () => {
            const createMock = vi.fn();
            globalThis.ActiveEffect = {implementation: {create: createMock}};
            const targetActor = {id: "targetActorId"};
            game.canvas.tokens = {get: vi.fn(() => ({actor: targetActor}))};

            const effect = {name: "SomeEffect"};
            Damage.addEffectForTarget(effect, "token123");

            expect(game.canvas.tokens.get).toHaveBeenCalledWith("token123");
            expect(createMock).toHaveBeenCalledWith(effect, {parent: targetActor});
        });
    });

    // ─── applyActorHpModification ───────────────────────────────────────────────

    describe("Damage — applyActorHpModification", () => {
        let targetActor;

        function setupTargetActor(hp, effects) {
            targetActor = {
                system: {attributes: {hp}},
                update: vi.fn().mockResolvedValue(null),
                effects
            };
            game.canvas.tokens = {get: vi.fn(() => ({actor: targetActor}))};
        }

        it("damageFQ: quand hp.temp absorbe entièrement le coup, seuls les PV temporaires sont réduits (pas de double comptage)", () => {
            setupTargetActor({temp: 10, value: 20, max: 20, tempmax: 0}, {size: 0, filter: () => []});

            Damage.applyActorHpModification("token1", 5, "damageFQ");

            expect(targetActor.update).toHaveBeenCalledTimes(1);
            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.temp": 5});
        });

        it("damageFQ: consumes hp.temp partially then applies the remainder to hp.value", () => {
            setupTargetActor({temp: 3, value: 20, max: 20, tempmax: 0}, {size: 0, filter: () => []});

            Damage.applyActorHpModification("token1", 5, "damageFQ");

            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.temp": 0});
            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 18});
        });

        it("damageFQ: bounds hp.value to 0 when damages exceed remaining hp", () => {
            setupTargetActor({temp: 0, value: 20, max: 20, tempmax: 0}, {size: 0, filter: () => []});

            Damage.applyActorHpModification("token1", 25, "damageFQ");

            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 0});
        });

        it("damageFQ: removes effects flagged expireOnDamage only", () => {
            const expiringEffect = {flags: {expireOnDamage: true}, delete: vi.fn()};
            const persistentEffect = {flags: {}, delete: vi.fn()};
            setupTargetActor({temp: 0, value: 20, max: 20, tempmax: 0}, {
                size: 2,
                filter: (fn) => [expiringEffect, persistentEffect].filter(fn)
            });

            Damage.applyActorHpModification("token1", 5, "damageFQ");

            expect(expiringEffect.delete).toHaveBeenCalledTimes(1);
            expect(persistentEffect.delete).not.toHaveBeenCalled();
        });

        it("healFQ: bounds the heal to max + tempmax", () => {
            setupTargetActor({temp: 0, value: 20, max: 20, tempmax: 5}, {size: 0, filter: () => []});

            Damage.applyActorHpModification("token1", 10, "healFQ");

            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 25});
        });

        it("healFQ: applies the heal directly when under the max", () => {
            setupTargetActor({temp: 0, value: 10, max: 20, tempmax: 0}, {size: 0, filter: () => []});

            Damage.applyActorHpModification("token1", 5, "healFQ");

            expect(targetActor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 15});
        });
    });

    // ─── createActorFromData ────────────────────────────────────────────────────

    describe("Damage — createActorFromData", () => {
        afterEach(() => {
            delete Actor.create;
        });

        it("should create the actor, place its token on the adjacent square, and register it as combatant when in combat", async () => {
            const newActor = {_id: "newActorId", prototypeToken: {name: "Token"}};
            Actor.create = vi.fn().mockResolvedValue(newActor);
            const createTokenMock = vi.fn().mockResolvedValue([{id: "tokenId", actorId: "newActorId"}]);
            game.scenes = {active: {id: "sceneId", createEmbeddedDocuments: createTokenMock}};
            game.canvas.scene.tokens = [{actorId: "userCharacterId", x: 10, y: 10}];
            game.users = {...game.users, get: vi.fn().mockReturnValue({character: {id: "userCharacterId"}})};
            const createCombatantMock = vi.fn().mockResolvedValue();
            game.combat = {createEmbeddedDocuments: createCombatantMock};

            await Damage.createActorFromData({name: "Minion"}, "user1", "right");

            expect(Actor.create).toHaveBeenCalledWith({name: "Minion"});
            expect(createTokenMock).toHaveBeenCalledWith("Token", [expect.objectContaining({
                actorId: "newActorId", x: 15, y: 10
            })]);
            expect(createCombatantMock).toHaveBeenCalledWith("Combatant", [{
                tokenId: "tokenId", sceneId: "sceneId", actorId: "newActorId", hidden: false
            }]);
        });

        it("should not register a combatant when there is no active combat", async () => {
            const newActor = {_id: "newActorId2", prototypeToken: {}};
            Actor.create = vi.fn().mockResolvedValue(newActor);
            const createTokenMock = vi.fn().mockResolvedValue([{id: "tokenId2", actorId: "newActorId2"}]);
            game.scenes = {active: {id: "sceneId", createEmbeddedDocuments: createTokenMock}};
            game.canvas.scene.tokens = [{actorId: "userCharacterId", x: 10, y: 10}];
            game.users = {...game.users, get: vi.fn().mockReturnValue({character: {id: "userCharacterId"}})};
            game.combat = undefined;

            await Damage.createActorFromData({name: "Minion"}, "user1", "left");

            expect(createTokenMock).toHaveBeenCalled();
        });
    });
});
