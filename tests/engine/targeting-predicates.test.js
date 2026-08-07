import {beforeEach, describe, expect, test} from "vitest";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";

// Prédicats purs : aucun DOM, aucun ChatMessage. Les cas de comptage sont
// totalement purs ; `findCasterToken`/`findOutOfReachTargets` lisent seulement
// `game.canvas.scene` (tokens + taille de case), monté minimalement ci-dessous.

describe("TargetingPredicates.evaluateTargetCount", () => {
    const {NONE, MULTIPLE_NOT_ALLOWED, TOO_MANY, OK} = TargetingPredicates.TARGET_COUNT;

    test("0 cible -> none", () => {
        expect(TargetingPredicates.evaluateTargetCount(0, 5)).toBe(NONE);
        expect(TargetingPredicates.evaluateTargetCount(0, undefined)).toBe(NONE);
    });

    test("plusieurs cibles sans nbTargets -> multipleNotAllowed", () => {
        expect(TargetingPredicates.evaluateTargetCount(2, undefined)).toBe(MULTIPLE_NOT_ALLOWED);
        expect(TargetingPredicates.evaluateTargetCount(3, 0)).toBe(MULTIPLE_NOT_ALLOWED);
    });

    test("plus de cibles que nbTargets -> tooMany", () => {
        expect(TargetingPredicates.evaluateTargetCount(3, 2)).toBe(TOO_MANY);
    });

    test("compte valide -> ok", () => {
        expect(TargetingPredicates.evaluateTargetCount(1, undefined)).toBe(OK);
        expect(TargetingPredicates.evaluateTargetCount(2, 3)).toBe(OK);
        expect(TargetingPredicates.evaluateTargetCount(2, 2)).toBe(OK);
    });

    test("les verdicts sont des valeurs de chaîne figées et stables", () => {
        expect(NONE).toBe("none");
        expect(MULTIPLE_NOT_ALLOWED).toBe("multipleNotAllowed");
        expect(TOO_MANY).toBe("tooMany");
        expect(OK).toBe("ok");
        expect(Object.isFrozen(TargetingPredicates.TARGET_COUNT)).toBe(true);
    });
});

describe("TargetingPredicates.findCasterToken", () => {
    beforeEach(() => {
        globalThis.game = {
            canvas: {
                scene: {
                    tokens: [
                        {actorId: "hero", x: 5, y: 5, width: 1, height: 1},
                        {actorId: "villain", x: 0, y: 0, width: 1, height: 1},
                    ],
                },
            },
        };
    });

    test("trouve le token dont actorId correspond à l'acteur", () => {
        expect(TargetingPredicates.findCasterToken({id: "hero"})).toEqual(
            expect.objectContaining({actorId: "hero"})
        );
    });

    test("retourne null quand aucun token ne correspond (ou acteur absent)", () => {
        expect(TargetingPredicates.findCasterToken({id: "ghost"})).toBeNull();
        expect(TargetingPredicates.findCasterToken(undefined)).toBeNull();
    });
});

describe("TargetingPredicates.findOutOfReachTargets", () => {
    // Géométrie de world-fixture : lanceur (5,5), cible (0,5), taille de case = 5
    // → distance de Manhattan = (|5-0| + |5-5|) / 5 = 1 case.
    const caster = {x: 5, y: 5, width: 1, height: 1};
    const target = {document: {x: 0, y: 5, width: 1, height: 1}, name: "Cible"};

    beforeEach(() => {
        globalThis.game = {canvas: {scene: {dimensions: {size: 5}}}};
    });

    test("cible à portée (0..6, dist=1) -> aucune hors-portée", () => {
        expect(TargetingPredicates.findOutOfReachTargets(caster, [target], 0, 6)).toEqual([]);
    });

    test("cible hors portée (2..3, dist=1) -> une entrée avec distance numérique", () => {
        const out = TargetingPredicates.findOutOfReachTargets(caster, [target], 2, 3);
        expect(out).toHaveLength(1);
        expect(out[0].target).toBe(target);
        expect(typeof out[0].dist).toBe("number");
        expect(out[0].dist).toBe(1);
    });
});
