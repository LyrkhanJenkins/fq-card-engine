import {beforeEach, describe, expect, it, vi} from "vitest";
import DamageUtils from "../../scripts/utils/damage-utils.js";
import {DAMAGES_COLOR} from "../../scripts/utils/fq-constants";
import setGlobal from "../before-each.js";

describe("DamageUtils", () => {
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
        setGlobal();
    });

    it("should build damage dice launcher with bonus", async () => {
        const result = await DamageUtils.buildDamageDiceLauncher(actor, "1d8", 1, -9999);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should build heal dice launcher with bonus", async () => {
        const result = await DamageUtils.buildHealDiceLauncher(actor, "1d8", 1);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it("should add bonuses to heal", async () => {
        const result = await DamageUtils.addCriticalToHeal(actor, 10, 1);
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    it("should add bonuses to damage", async () => {
        const result = await DamageUtils.addCriticalEvasionToDamage(actor, 10, 1, -999);
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true);
    });

    it("should roll with success value result", async () => {
        const result = await DamageUtils.rollWithSuccessValueResultAsync(actor, "1d20", {
            color: DAMAGES_COLOR,
            title: "Test"
        });
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it("should display roll result", () => {
        DamageUtils.displayResult(actor, [{key: "Test", value: 10}], ["Manual Action"]);
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    });
});