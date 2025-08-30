import FQUtils from "../../scripts/utils/fq-utils.js";
import * as fqCardEngineModule from "../../scripts/fq-card-engine-module";
import FxUtils from "../../scripts/utils/fx-utils.js";
import setGlobal from "../before-each.js";

jest.mock("../../scripts/fq-card-engine-module.js", () => ({
    socket: {
        executeAsGM: jest.fn()
    }
}));

jest.mock("../../scripts/utils/consumption-utils.js", () => ({
    consumeResources: jest.fn(),
    checkIfCanCardCanReachTargets: jest.fn(),
    createUserWarningMessage: jest.fn(),
    checkResources: jest.fn()
}));

jest.mock("../../scripts/utils/damage-utils.js", () => ({
    buildDamageDiceLauncher: jest.fn(async () => ([])),
    buildHealDiceLauncher: jest.fn(async () => ([])),
    handleSoundEffect: jest.fn(),
    displayResult: jest.fn()
}));

jest.mock("../../scripts/utils/fx-utils.js", () => ({
    handleSpecialEffect: jest.fn()
}));

jest.mock("../../scripts/utils/canvas-utils.js", () => ({
    locationIsOccupied: jest.fn(),
    getMinDistanceBetweenTwoToken: jest.fn()
}));

describe("FQUtils", () => {

    beforeEach(() => {
        jest.clearAllMocks();
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

    // Similar test cases can be added for other static methods

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
        expect(FxUtils.handleSpecialEffect).toHaveBeenCalledWith(cardContent, expect.any(Array), {"actorId": "userCharacterId", "x": 5, "y": 5}, null); // TODO Mettre les grosse global dans un fichier séparé
    });

    it("should call socket.executeAsGM to add a new effect for actor", async () => {
        const currentEffect = {
            data: [{
                label: "test effect",
                value: 10,
                duration: {startTime: 1, rounds: 2, turns: 3}
            }]
        };
        await FQUtils.applyNewEffects(currentEffect, "actorId");

        expect(fqCardEngineModule.socket.executeAsGM).toHaveBeenCalledWith("addEffectForAnActor", expect.anything(), "actorId");
    });
});
