import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import RollService from "../../src/domain/engine/roll/roll-service.js";

/**
 * `RollService.rollDiceSync` : évaluation SYNCHRONE d'une formule contenant des
 * dés. Foundry lève « This Roll contains terms that cannot be synchronously
 * evaluated » dès qu'un terme n'est pas déterministe (un dé peut être fourni par
 * une source externe, donc de façon asynchrone) — or la résolution d'une carte
 * doit rester synchrone. Le `Roll` de ce fichier reproduit exactement ce refus,
 * ce que le double déterministe du harnais de decks ne fait pas : sans lui, une
 * carte qui soigne avec un dé plante en jeu sans qu'aucun test ne le voie.
 */
const realRoll = globalThis.Roll;

/** Roll fidèle à Foundry v14 : refuse tout terme non déterministe en synchrone. */
class StrictRoll {
    constructor(formula) {
        this.formula = String(formula);
    }

    evaluateSync() {
        // Un terme de dés (`NdM`, ou taille de face calculée `Nd(...)`) n'est jamais
        // déterministe : Foundry refuse de l'évaluer en synchrone.
        if (/(^|[^\w])\d*d[\d(]/i.test(this.formula)) {
            throw new Error("This Roll contains terms that cannot be synchronously evaluated.");
        }
        // Arithmétique simple : suffisant pour les formules déterministes testées.
        this.total = Function(`"use strict"; return (${this.formula});`)();
        return this;
    }
}

describe("RollService.rollDiceSync", () => {
    beforeEach(() => {
        globalThis.Roll = StrictRoll;
        globalThis.CONFIG = {Dice: {randomUniform: vi.fn(() => 0.5)}};
    });

    afterEach(() => {
        globalThis.Roll = realRoll;
        vi.restoreAllMocks();
    });

    it("formule déterministe : évaluée directement, aucun tirage", () => {
        expect(RollService.rollDiceSync("3 + 4")).toBe(7);
        expect(CONFIG.Dice.randomUniform).not.toHaveBeenCalled();
    });

    it("formule avec dés : les dés sont tirés puis la formule est évaluée", () => {
        // randomUniform = 0.5 → 1d6 = ceil(0.5*6) = 3, plus le modificateur.
        expect(RollService.rollDiceSync("1d6 + 3")).toBe(6);
        expect(CONFIG.Dice.randomUniform).toHaveBeenCalledTimes(1);
    });

    it("plusieurs dés : chaque dé est tiré séparément", () => {
        // 2d10 = 5 + 5, + 2 → 12
        expect(RollService.rollDiceSync("2d10 + 2")).toBe(12);
        expect(CONFIG.Dice.randomUniform).toHaveBeenCalledTimes(2);
    });

    it("formule avec plusieurs groupes de dés", () => {
        // 1d4(2) + 1d8(4) = 6
        expect(RollService.rollDiceSync("1d4 + 1d8")).toBe(6);
    });

    it("taille de face calculée (1d(2*3)) : non remplaçable, l'erreur d'origine est propagée", () => {
        expect(() => RollService.rollDiceSync("1d(2*3)")).toThrow(/synchronously/);
    });

    it("sans générateur Foundry, le tirage retombe sur Math.random", () => {
        globalThis.CONFIG = {};
        vi.spyOn(Math, "random").mockReturnValue(0.99);

        // ceil(0.99 * 6) = 6
        expect(RollService.rollDiceSync("1d6")).toBe(6);
    });
});
