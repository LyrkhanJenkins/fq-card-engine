import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Damage from "../../src/domain/engine/roll/damage.js";

describe("Damage", () => {
    let actor;

    beforeEach(() => {
        vi.clearAllMocks();
        // Façade globale du module, référencée par Damage.applyActorHpModification
        // (`FqCardEngineModule.moduleName`, portée du flag `expireOnDamage`).
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
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
        const result = await Damage.buildDamageDiceLauncher(actor, {damage: "1d8", bonusCrit: 1, bonusEva: -9999, minReach: 1, maxReach: 1});
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should build heal dice launcher with bonus", async () => {
        const result = await Damage.buildHealDiceLauncher(actor, {heal: "1d8", bonusCrit: 1, minReach: 1, maxReach: 1});
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should add bonuses to heal", async () => {
        const result = await Damage.addCriticalToHeal(actor, 10, {bonusCrit: 1, minReach: 1, maxReach: 1});
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    it("should add bonuses to damage", async () => {
        const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: 1, bonusEva: -999, minReach: 1, maxReach: 1});
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    // ─── rollTotalAsync ───────────────────────────────────────────────────────

    describe("Damage — rollTotalAsync", () => {
        it("rend le total du jet", async () => {
            const result = await Damage.rollTotalAsync("1d20");
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(20);
        });

        it("ne publie aucun message : le chat est écrit une seule fois, en fin de résolution", async () => {
            await Damage.rollTotalAsync("1d20");
            const instance = Roll.mock.instances[Roll.mock.instances.length - 1];
            expect(instance.toMessage).not.toHaveBeenCalled();
            expect(ChatMessage.create).not.toHaveBeenCalled();
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
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([]);
        });

        it("should halve damages when the target's evasion succeeds and no critical", async () => {
            // Une seule défense réussie fait descendre d'un cran sur l'échelle
            // `0 → ½ → normal → ×2` : l'esquive protège, elle n'annule plus.
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 15}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([expect.objectContaining({value: 5, critical: false, evasion: true})]);
        });

        it("should keep full damages when the target's evasion fails and no critical", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([expect.objectContaining({value: 10, critical: false, evasion: false})]);
        });

        it("should double damages on critical when the target's evasion fails", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: 20, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([expect.objectContaining({value: 20, critical: true, evasion: false})]);
        });

        it("should NOT double damages when critical but the target's evasion succeeds (evasion passes over the critical)", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 15}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, 10, {bonusCrit: 20, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([expect.objectContaining({value: 10, critical: true, evasion: true})]);
        });

        it("should bound negative damages to 0", async () => {
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Target1"}
            }]);
            const result = await Damage.addCriticalEvasionToDamage(actor, -5, {bonusCrit: -999, bonusEva: 0, minReach: 1, maxReach: 1});
            expect(result).toEqual([expect.objectContaining({value: 0})]);
        });
    });

    // ─── addCriticalToHeal — critique + heal<0 ──────────────────────────────────

    describe("Damage — addCriticalToHeal", () => {
        it("should double the heal amount on critical", async () => {
            const result = await Damage.addCriticalToHeal(actor, 10, {bonusCrit: 15, minReach: 1, maxReach: 1});
            expect(result[0].value).toBe(20);
            expect(result[0].critical).toBe(true);
        });

        it("should bound a negative heal to 0", async () => {
            const result = await Damage.addCriticalToHeal(actor, -5, {bonusCrit: -999, minReach: 1, maxReach: 1});
            expect(result[0].value).toBe(0);
            expect(result[0].critical).toBe(false);
        });

        it("should heal the caster's own token when the card has no reach, whatever is targeted on the scene", async () => {
            actor.id = "casterActorId";
            const casterPlaceable = {
                id: "casterTokenId",
                actor,
                document: {name: "Lanceur", actorId: actor.id}
            };
            game.canvas.scene.tokens = [{actorId: actor.id, object: casterPlaceable}];
            game.user.targets = new Set([{
                id: "token1",
                actor: {_id: "otherActor", system: {fq: {attributes: {evasion: 1}}}},
                document: {name: "Cible de la scène"}
            }]);

            const result = await Damage.addCriticalToHeal(actor, 10, {bonusCrit: -999});

            expect(result).toHaveLength(1);
            expect(result[0].targetTokenId).toBe("casterTokenId");
            expect(result[0].key).toContain("Lanceur");
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
            const expiringEffect = {flags: {"fq-card-engine": {expireOnDamage: true}}, delete: vi.fn()};
            const persistentEffect = {flags: {"fq-card-engine": {expireOnDamage: false}}, delete: vi.fn()};
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
            // Aucune initiative transmise par l'appelant : le combattant naît sans,
            // et le jet automatique du module lui en donnera une.
            expect(createCombatantMock).toHaveBeenCalledWith("Combatant", [{
                tokenId: "tokenId", sceneId: "sceneId", actorId: "newActorId", hidden: false,
                initiative: null
            }]);
        });

        it("places the token on the imposed position when one is given (summon on a placed zone)", async () => {
            const newActor = {_id: "newActorId3", prototypeToken: {name: "Token"}};
            Actor.create = vi.fn().mockResolvedValue(newActor);
            const createTokenMock = vi.fn().mockResolvedValue([{id: "tokenId3", actorId: "newActorId3"}]);
            game.scenes = {active: {id: "sceneId", createEmbeddedDocuments: createTokenMock}};
            // Le token du lanceur reste en (10,10) : si la position imposée était ignorée,
            // le sbire apparaîtrait là plutôt que sur la case de la zone.
            game.canvas.scene.tokens = [{actorId: "userCharacterId", x: 10, y: 10}];
            game.users = {...game.users, get: vi.fn().mockReturnValue({character: {id: "userCharacterId"}})};
            game.combat = undefined;

            await Damage.createActorFromData({name: "Minion"}, "user1", null, {x: 60, y: 25});

            expect(createTokenMock).toHaveBeenCalledWith("Token", [expect.objectContaining({
                actorId: "newActorId3", x: 60, y: 25
            })]);
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
