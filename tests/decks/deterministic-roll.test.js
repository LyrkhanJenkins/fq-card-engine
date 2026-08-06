import {beforeEach, describe, expect, test} from "vitest";
import {
    DeterministicRoll,
    forceDie,
    installDeterministicRoll,
    pushDie,
    resetDiceControl
} from "./deterministic-roll.js";

describe("DeterministicRoll — évaluation réelle des formules", () => {
    beforeEach(() => {
        resetDiceControl();
    });

    test("arithmétique simple : \"2 + 3\" -> 5", async () => {
        const roll = await new DeterministicRoll("2 + 3").evaluate();
        expect(roll.total).toBe(5);
    });

    test("fonctions usuelles : ceil/floor/round/abs/min/max/trunc", async () => {
        expect((await new DeterministicRoll("ceil(7/3)").evaluate()).total).toBe(3);
        expect((await new DeterministicRoll("floor(7/3)").evaluate()).total).toBe(2);
        expect((await new DeterministicRoll("round(2.5)").evaluate()).total).toBe(3);
        expect((await new DeterministicRoll("abs(-4)").evaluate()).total).toBe(4);
        expect((await new DeterministicRoll("min(2,5)").evaluate()).total).toBe(2);
        expect((await new DeterministicRoll("max(2,5)").evaluate()).total).toBe(5);
        expect((await new DeterministicRoll("trunc(2.9)").evaluate()).total).toBe(2);
    });

    test("parenthèses et signes unaires respectés", async () => {
        expect((await new DeterministicRoll("-(2 + 3)").evaluate()).total).toBe(-5);
        expect((await new DeterministicRoll("+(2 + 3) - 1").evaluate()).total).toBe(4);
    });

    test("@-référence substituée en amont par le pipeline (ex. @str -> \"3\")", async () => {
        // Le pipeline réel (RollService.replaceAbilitiesBonus) substitue @str par le
        // modificateur AVANT de construire le Roll ; DeterministicRoll reçoit donc
        // directement la formule déjà substituée.
        const roll = await new DeterministicRoll("2 + ceil(3/3)").evaluate();
        expect(roll.total).toBe(3);
    });

    test("flavor [type] retiré et ne produit pas de NaN", async () => {
        const roll = await new DeterministicRoll("(4)[bludgeoning]").evaluate();
        expect(roll.total).toBe(4);
        expect(Number.isNaN(roll.total)).toBe(false);
    });

    test("@-référence NON résolue (@for, @sag) -> 0 sans exception", async () => {
        const rollFor = await new DeterministicRoll("2 + @for").evaluate();
        expect(rollFor.total).toBe(2);
        const rollSag = await new DeterministicRoll("@sag").evaluate();
        expect(rollSag.total).toBe(0);
    });

    test("expression non parsable -> total fini documenté (0), sans lever", async () => {
        await expect(new DeterministicRoll("???").evaluate()).resolves.toBeDefined();
        const roll = await new DeterministicRoll("???").evaluate();
        expect(roll.total).toBe(0);
        expect(Number.isNaN(roll.total)).toBe(false);
    });

    test("dé piloté \"1d20\" renvoie exactement la valeur forcée (pushDie)", async () => {
        pushDie(20);
        const roll = await new DeterministicRoll("1d20").evaluate();
        expect(roll.total).toBe(20);
    });

    test("dé piloté \"1d20\" renvoie exactement la valeur forcée (forceDie ciblé par face)", async () => {
        forceDie(20, 1);
        const roll = await new DeterministicRoll("1d20").evaluate();
        expect(roll.total).toBe(1);
    });

    test("dé non piloté : défaut stable documenté (jamais aléatoire)", async () => {
        const rollA = await new DeterministicRoll("1d6").evaluate();
        const rollB = await new DeterministicRoll("1d6").evaluate();
        expect(rollA.total).toBe(rollB.total);
        expect(Number.isFinite(rollA.total)).toBe(true);
    });

    test("Nd(expr) : nombre de dés et expression de faces évalués récursivement", async () => {
        pushDie(2);
        pushDie(3);
        const roll = await new DeterministicRoll("(1+1)d(2+2)").evaluate();
        expect(roll.total).toBe(5); // 2 dés pilotés à 2 puis 3
        expect(roll.dice.length).toBe(2);
    });

    test("interface préservée : total/options/dice/evaluate/toMessage/isDeterministic", async () => {
        const roll = new DeterministicRoll("1d6");
        expect(roll.options).toEqual({});
        await roll.evaluate();
        expect(Array.isArray(roll.dice)).toBe(true);
        expect(roll.dice[0]).toHaveProperty("options");
        expect(typeof roll.toMessage).toBe("function");
        expect(await roll.toMessage()).toEqual(expect.objectContaining({id: expect.any(String)}));
        expect(roll.isDeterministic).toBe(true);
    });
});

describe("installDeterministicRoll — réinstallation après le beforeEach de setup.js", () => {
    test("remplace le Roll constant de tests/setup.js par le Roll déterministe", async () => {
        // Avant installation : le Roll de tests/setup.js (constant, total figé à 10).
        const beforeInstall = await new global.Roll("2 + 3").evaluate();
        expect(beforeInstall.total).toBe(10);

        installDeterministicRoll();

        const afterInstall = await new global.Roll("2 + 3").evaluate();
        expect(afterInstall.total).toBe(5);
    });
});
