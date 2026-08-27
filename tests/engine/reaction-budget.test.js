import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import ReactionBudget from "../../src/domain/engine/reaction/reaction-budget.js";

// Le budget est lu/écrit dans les flags du TokenDocument, sous le scope
// `FqCardEngineModule.moduleName`. Monde minimal : la façade globale du module
// et un combat réduit à `{id, round}`.

const MODULE = "fq-card-engine";

/** Un TokenDocument minimal, avec `setFlag` espionné. */
function makeToken(spent) {
    const token = {
        id: "tok",
        flags: spent === undefined ? {} : {[MODULE]: {[ReactionBudget.FLAG_KEY]: spent}},
        setFlag: vi.fn(async (scope, key, value) => {
            token.flags[scope] = {...(token.flags[scope] ?? {}), [key]: value};
        }),
    };
    return token;
}

const combat = (id, round) => ({id, round});

describe("ReactionBudget.isReactionAvailable", () => {

    test("aucune consommation mémorisée : la réaction est disponible", () => {
        expect(ReactionBudget.isReactionAvailable(null, "c1", 1)).toBe(true);
        expect(ReactionBudget.isReactionAvailable(undefined, "c1", 3)).toBe(true);
    });

    test("consommée dans ce combat à ce round : indisponible", () => {
        expect(ReactionBudget.isReactionAvailable({combat: "c1", round: 2}, "c1", 2)).toBe(false);
    });

    test("consommée à un round précédent du même combat : redevient disponible", () => {
        expect(ReactionBudget.isReactionAvailable({combat: "c1", round: 2}, "c1", 3)).toBe(true);
    });

    test("même numéro de round mais autre combat : disponible", () => {
        // Le cas que le seul numéro de round ne saurait pas distinguer : les
        // rounds repartent à 1 à chaque combat.
        expect(ReactionBudget.isReactionAvailable({combat: "c1", round: 3}, "c2", 3)).toBe(true);
    });

    test("hors combat : jamais disponible", () => {
        expect(ReactionBudget.isReactionAvailable(null, undefined, undefined)).toBe(false);
        expect(ReactionBudget.isReactionAvailable(null, null, 1)).toBe(false);
        expect(ReactionBudget.isReactionAvailable(null, "c1", undefined)).toBe(false);
        expect(ReactionBudget.isReactionAvailable(null, "c1", NaN)).toBe(false);
    });

    test("combat créé mais non démarré (round 0) : jamais disponible", () => {
        expect(ReactionBudget.isReactionAvailable(null, "c1", 0)).toBe(false);
        expect(ReactionBudget.isReactionAvailable(null, "c1", -1)).toBe(false);
    });

    test("consommation mémorisée partielle : n'empêche pas la disponibilité", () => {
        expect(ReactionBudget.isReactionAvailable({round: 2}, "c1", 2)).toBe(true);
        expect(ReactionBudget.isReactionAvailable({combat: "c1"}, "c1", 2)).toBe(true);
        expect(ReactionBudget.isReactionAvailable({}, "c1", 2)).toBe(true);
    });
});

describe("ReactionBudget — lecture et écriture des flags", () => {
    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: MODULE};
    });

    afterEach(() => {
        delete globalThis.FqCardEngineModule;
        delete globalThis.game;
    });

    test("readSpent rend la consommation mémorisée", () => {
        expect(ReactionBudget.readSpent(makeToken({combat: "c1", round: 2})))
            .toEqual({combat: "c1", round: 2});
    });

    test("readSpent rend null quand rien n'est mémorisé", () => {
        expect(ReactionBudget.readSpent(makeToken())).toBeNull();
        expect(ReactionBudget.readSpent({flags: {}})).toBeNull();
        expect(ReactionBudget.readSpent(undefined)).toBeNull();
    });

    test("readSpent rend null si la façade du module est absente", () => {
        delete globalThis.FqCardEngineModule;
        expect(ReactionBudget.readSpent(makeToken({combat: "c1", round: 2}))).toBeNull();
    });

    test("isAvailable croise les flags du token et le combat", () => {
        const token = makeToken({combat: "c1", round: 2});
        expect(ReactionBudget.isAvailable(token, combat("c1", 2))).toBe(false);
        expect(ReactionBudget.isAvailable(token, combat("c1", 3))).toBe(true);
        expect(ReactionBudget.isAvailable(makeToken(), combat("c1", 2))).toBe(true);
    });

    test("isAvailable retombe sur le combat courant quand il n'est pas fourni", () => {
        globalThis.game = {combat: combat("c1", 4)};
        expect(ReactionBudget.isAvailable(makeToken({combat: "c1", round: 4}))).toBe(false);
        expect(ReactionBudget.isAvailable(makeToken({combat: "c1", round: 3}))).toBe(true);
    });

    test("isAvailable rend false sans combat courant", () => {
        globalThis.game = {};
        expect(ReactionBudget.isAvailable(makeToken())).toBe(false);
    });

    test("consume écrit le couple combat/round et rend true", async () => {
        const token = makeToken();
        await expect(ReactionBudget.consume(token, combat("c1", 2))).resolves.toBe(true);
        expect(token.setFlag).toHaveBeenCalledWith(MODULE, ReactionBudget.FLAG_KEY,
            {combat: "c1", round: 2});
    });

    test("consume rend la réaction indisponible pour ce round, puis disponible au suivant", async () => {
        const token = makeToken();
        await ReactionBudget.consume(token, combat("c1", 2));
        expect(ReactionBudget.isAvailable(token, combat("c1", 2))).toBe(false);
        expect(ReactionBudget.isAvailable(token, combat("c1", 3))).toBe(true);
    });

    test("consume n'écrit rien sans combat exploitable", async () => {
        const token = makeToken();
        await expect(ReactionBudget.consume(token, combat("c1", 0))).resolves.toBe(false);
        await expect(ReactionBudget.consume(token, {round: 2})).resolves.toBe(false);
        await expect(ReactionBudget.consume(token, undefined)).resolves.toBe(false);
        expect(token.setFlag).not.toHaveBeenCalled();
    });

    test("consume n'écrit rien sans token ni façade de module", async () => {
        await expect(ReactionBudget.consume(undefined, combat("c1", 2))).resolves.toBe(false);

        delete globalThis.FqCardEngineModule;
        const token = makeToken();
        await expect(ReactionBudget.consume(token, combat("c1", 2))).resolves.toBe(false);
        expect(token.setFlag).not.toHaveBeenCalled();
    });
});
