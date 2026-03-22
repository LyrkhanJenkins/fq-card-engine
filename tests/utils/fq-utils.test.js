import {beforeEach, describe, expect, it, vi} from "vitest";
import FQUtils from "../../scripts/utils/fq-utils.js";
import FxUtils from "../../scripts/utils/fx-utils.js";
import setGlobal from "../before-each.js";

vi.mock("../../scripts/fq-card-engine-module.js", () => ({
    default: {},
    socket: {
        executeAsGM: vi.fn()
    }
}));

vi.mock("../../scripts/utils/consumption-utils.js", () => ({
    default: {
        consumeResources: vi.fn(),
        checkIfCanCardCanReachTargets: vi.fn(),
        createUserWarningMessage: vi.fn(),
        checkResources: vi.fn()
    }
}));

vi.mock("../../scripts/utils/damage-utils.js", () => ({
    default: {
        buildDamageDiceLauncher: vi.fn(async () => ([])),
        buildHealDiceLauncher: vi.fn(async () => ([])),
        handleSoundEffect: vi.fn(),
        displayResult: vi.fn()
    }
}));

vi.mock("../../scripts/utils/fx-utils.js", () => ({
    default: {
        handleSpecialEffect: vi.fn(),
        importMacroFromCompendium: vi.fn()
    }
}));

vi.mock("../../scripts/utils/canvas-utils.js", () => ({
    default: {
        locationIsOccupied: vi.fn(),
        getMinDistanceBetweenTwoToken: vi.fn()
    }
}));
describe("FQUtils", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        setGlobal();
    });

    it("should roll a dice and return result", async () => {
        const result = await FQUtils.rollResultAsync("1d20");
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it("should generate a random ID", () => {
        const id = FQUtils.generateRandomId(10);
        expect(id).toHaveLength(10);
    });

    it("should prepare data from card", async () => {
        const cardContent = {minReach: "1", maxReach: "1+1d6", nbTargets: "1d3"};
        await FQUtils.prepareDataFromCard(cardContent);

        expect(cardContent.minReach).toBeGreaterThanOrEqual(1);
        expect(cardContent.maxReach).toBeGreaterThanOrEqual(1);
        expect(cardContent.nbTargets).toBeGreaterThanOrEqual(1);
    });

    it("should replace card content abilities bonus", () => {
        const cardContent = {
            key1: "some text with @str modifier",
            key2: {
                nestedKey: "@dex modifier"
            }
        };

        game.user.character.system.abilities = {
            str: {mod: 2},
            dex: {mod: 3},
            con: {mod: 1},
            int: {mod: 4},
            wis: {mod: 1},
            cha: {mod: 3}
        };

        FQUtils.replaceCardContentAbilitiesBonus(cardContent);

        expect(cardContent.key1).toBe("some text with 2 modifier");
        expect(cardContent.key2.nestedKey).toBe("3 modifier");
    });

    it("should handle sound effect in applyCardEffect", async () => {
        const cardContent = {damage: "1d6", heal: "3+1d4", sound: "sound.mp3"};
        await FQUtils.applyCardEffect(cardContent, {}, {});
        expect(FxUtils.handleSpecialEffect).toHaveBeenCalledWith(cardContent, expect.any(Array), {
            "actorId": "userCharacterId",
            "x": 5,
            "y": 5
        }, null);
    });

    it("appelle numerizeEffectObjValue pour chaque effet et recopie label → name si manquant", async () => {
        const input = {
            data: [
                {label: "Effet A", changes: []},
                {label: "Ignoré", name: "Déjà nommé", changes: []},
            ],
        };

        const result = await FQUtils.createEffectsFromData(input);

        expect(result[0].name).toBe("Effet A");
        expect(result[1].name).toBe("Déjà nommé");
    });

    it("mappe duration (startTime/rounds/turns) et définit origin", async () => {
        const input = {
            data: [
                {
                    label: "Durée",
                    duration: {startTime: 10, rounds: 2, turns: 1},
                    changes: [],
                },
            ],
        };

        const [res] = await FQUtils.createEffectsFromData(input);

        expect(res.startTime).toBe(10);
        expect(res.rounds).toBe(2);
        expect(res.turns).toBe(1);
        expect(res.origin).toBe("FQ Effect");
    });

    it("n'évalue pas quand key ∈ [\"system.fq.bonus.damage\",\"system.fq.bonus.heal\"]", async () => {
        const input = {
            data: [
                {
                    label: "NoEval",
                    changes: [
                        {key: "system.fq.bonus.damage", value: "1+2"},
                        {key: "system.fq.bonus.heal", value: "2+3"},
                    ],
                },
            ],
        };

        const [res] = await FQUtils.createEffectsFromData(input);

        expect(res.changes[0].value).toBe("1+2");
        expect(res.changes[1].value).toBe("2+3");

        const calls = global.Roll.mock.calls.map((c) => c[0]);
        expect(calls).not.toContain("1+2");
        expect(calls).not.toContain("2+3");
    });
});