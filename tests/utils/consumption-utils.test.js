import {afterEach, beforeEach, describe, expect, it, test, vi} from "vitest";
import ResourceHandler from "../../src/domain/engine/shared/resource-handler.js";
import Constants from "../../src/domain/constants.js";
import Geometry from "../../src/domain/engine/shared/geometry.js";

describe("ResourceHandler", () => {

    const resources = {currentDrop: -1, action: -1, mana: -1, zeal: -1, hp: -1, drop: -1};
    const actor = {
        system: {
            fq: {
                cards: {currentDrop: 2},
                action: {value: 2},
                mana: {value: 2},
                zeal: {value: 2}
            },
            attributes: {hp: {value: 2}}
        },
        update: vi.fn().mockResolvedValue(null)
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("checkResourcesNoActor", () => {
        const result = ResourceHandler.checkResources(null, null);
        expect(result).toEqual(true);
    });

    test("checkResourcesNotEnoughHp", () => {
        const result = ResourceHandler.checkResources(
            {hp: -7},
            {system: {attributes: {hp: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test("checkResourcesNotEnoughAction", () => {
        const result = ResourceHandler.checkResources(
            {action: -7},
            {system: {fq: {action: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test("checkResourcesNotEnoughMana", () => {
        const result = ResourceHandler.checkResources(
            {mana: -7},
            {system: {fq: {mana: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test("checkResourcesNotEnoughZeal", () => {
        const result = ResourceHandler.checkResources(
            {zeal: -7},
            {system: {fq: {zeal: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test("checkResourcesNotEnoughCurrentDrop", () => {
        const result = ResourceHandler.checkResources(
            {drop: -7},
            {system: {fq: {cards: {currentDrop: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test("checkResourcesOk", () => {
        const result = ResourceHandler.checkResources(resources, actor);
        expect(ChatMessage.create).toHaveBeenCalledTimes(0);
        expect(result).toEqual(true);
    });

    test("checkConsumeResources", () => {
        ResourceHandler.consumeResources(resources, actor);
        expect(actor.update).toHaveBeenCalledTimes(5);
    });

    // ─── consumeResources — branches spéciales et plafonds ─────────────────────

    describe("ResourceHandler.consumeResources — branches spéciales", () => {
        it("bounds drop at 0 when it would go negative", () => {
            const localActor = {system: {fq: {cards: {currentDrop: 2}}}, update: vi.fn()};
            ResourceHandler.consumeResources({drop: -10}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.cards.currentDrop": 0});
        });

        it("resets special.sacrificedSkeleton when xvalue matches", () => {
            const localActor = {system: {fq: {}}, update: vi.fn()};
            ResourceHandler.consumeResources({xvalue: "fq.special.sacrificedSkeleton"}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.special.sacrificedSkeleton": 0});
        });

        it("resets special.sacrificedSkeleton when yvalue matches", () => {
            const localActor = {system: {fq: {}}, update: vi.fn()};
            ResourceHandler.consumeResources({yvalue: "fq.special.sacrificedSkeleton"}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.special.sacrificedSkeleton": 0});
        });

        it("resets cards.currentDrop when xvalue matches fq.cards.currentDrop", () => {
            const localActor = {system: {fq: {}}, update: vi.fn()};
            ResourceHandler.consumeResources({xvalue: "fq.cards.currentDrop"}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.cards.currentDrop": 0});
        });

        it("caps hp at its max", () => {
            const localActor = {system: {attributes: {hp: {value: 18, max: 20}}}, update: vi.fn()};
            ResourceHandler.consumeResources({hp: 5}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 20});
        });

        it("caps mana at its max", () => {
            const localActor = {system: {fq: {mana: {value: 3, max: 5}}}, update: vi.fn()};
            ResourceHandler.consumeResources({mana: 5}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.mana.value": 5});
        });

        it("caps zeal at its max", () => {
            const localActor = {system: {fq: {zeal: {value: 3, max: 8}}}, update: vi.fn()};
            ResourceHandler.consumeResources({zeal: 10}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.zeal.value": 8});
        });

        it("lets action exceed its max (no cap — it is the only uncapped resource)", () => {
            const localActor = {system: {fq: {action: {value: 8, max: 10}}}, update: vi.fn()};
            ResourceHandler.consumeResources({action: 5}, localActor);
            expect(localActor.update).toHaveBeenCalledWith({"system.fq.action.value": 13});
        });
    });

    // ─── checkIfCanCardCanReachTargets ──────────────────────────────────────────

    describe("ResourceHandler.checkIfCanCardCanReachTargets", () => {
        const caster = {id: "casterId", name: "Caster"};

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("warns NoTarget and returns false when there are no targets", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([]);

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 1, 0, 1);

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
            expect(ChatMessage.create.mock.calls[0][0].content).toContain("WarningMsgNoTarget");
        });

        it("warns NoMultipleTarget and returns false with several targets but no nbTargets", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([
                {document: {name: "T1"}}, {document: {name: "T2"}}
            ]);

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 0, 0, 1);

            expect(result).toBe(false);
            expect(ChatMessage.create.mock.calls[0][0].content).toContain("WarningMsgNoMultipleTarget");
        });

        it("warns TooMuchTarget and returns false when there are more targets than allowed", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([
                {document: {name: "T1"}}, {document: {name: "T2"}}, {document: {name: "T3"}}
            ]);

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 2, 0, 1);

            expect(result).toBe(false);
            expect(ChatMessage.create.mock.calls[0][0].content).toContain("WarningMsgTooMuchTarget");
        });

        it("warns NoTokenInCanvas and returns false when the caster has no token on the active scene", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([{document: {name: "T1"}}]);
            game.canvas.scene.tokens = [{actorId: "someoneElse", x: 0, y: 0}];

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 1, 0, 1);

            expect(result).toBe(false);
            expect(ChatMessage.create.mock.calls[0][0].content).toContain("WarningNoTokenInCanvas");
        });

        it("returns false and warns per target when out of the min/max reach", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([
                {document: {name: "T1", x: 100, y: 100, width: 1, height: 1}}
            ]);
            game.canvas.scene.tokens = [{actorId: "casterId", x: 0, y: 0, width: 1, height: 1}];
            vi.spyOn(Geometry, "getMinDistanceBetweenTwoToken").mockReturnValue(10);

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 1, 0, 5);

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
            expect(ChatMessage.create.mock.calls[0][0].content).toContain("WarningMsgCantReachTarget");
        });

        it("returns true when the target is within min/max reach", () => {
            vi.spyOn(Constants, "myTargets").mockReturnValue([
                {document: {name: "T1", x: 10, y: 0, width: 1, height: 1}}
            ]);
            game.canvas.scene.tokens = [{actorId: "casterId", x: 0, y: 0, width: 1, height: 1}];
            vi.spyOn(Geometry, "getMinDistanceBetweenTwoToken").mockReturnValue(2);

            const result = ResourceHandler.checkIfCanCardCanReachTargets(caster, 1, 0, 5);

            expect(result).toBe(true);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });
    });

    // ─── determineNbTargets ─────────────────────────────────────────────────────

    describe("ResourceHandler.determineNbTargets", () => {
        it("returns target.value (or 1 by default) for single-target templates", () => {
            expect(ResourceHandler.determineNbTargets({template: {type: "enemy"}, value: 3})).toBe(3);
            expect(ResourceHandler.determineNbTargets({template: {type: "creature"}})).toBe(1);
        });

        it("returns 99999 for area-of-effect templates", () => {
            expect(ResourceHandler.determineNbTargets({template: {type: "cone"}})).toBe(99999);
            expect(ResourceHandler.determineNbTargets({template: {type: "radius"}})).toBe(99999);
        });

        it("returns 1 by default for unknown/missing template types", () => {
            expect(ResourceHandler.determineNbTargets({template: {type: "unknown"}})).toBe(1);
            expect(ResourceHandler.determineNbTargets({})).toBe(1);
        });
    });

    // ─── validateUseSpellInTurn ─────────────────────────────────────────────────

    describe("ResourceHandler.validateUseSpellInTurn", () => {
        it("warns and returns false when there is no active combat", () => {
            game.combat = undefined;

            const result = ResourceHandler.validateUseSpellInTurn({id: "actorId"});

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        });

        it("warns and returns false when it is not the actor's turn", () => {
            game.combat = {combatant: {actor: {id: "someoneElse"}}};

            const result = ResourceHandler.validateUseSpellInTurn({id: "actorId"});

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        });

        it("returns true when it is the actor's turn in combat", () => {
            game.combat = {combatant: {actor: {id: "actorId"}}};

            const result = ResourceHandler.validateUseSpellInTurn({id: "actorId"});

            expect(result).toBe(true);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });
    });
});
