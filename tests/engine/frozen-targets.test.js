import {afterEach, describe, expect, it} from "vitest";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";

// La sélection de cibles est figée à l'usage de l'activité, puis consommée à la
// résolution. Ce qui est éprouvé ici est la course elle-même : la sélection
// CHANGE entre les deux moments, comme elle le fait en jeu quand les dés durent
// et que la sélection du MJ est rendue entre-temps.

const ALLY = {id: "token-momie-alliee"};
const ENEMY = {id: "token-lyrkhan"};

/**
 * Monte une sélection d'utilisateur mutable, celle que `Constants.currentTargets`
 * lit — un `Set`, exactement comme `game.user.targets`.
 *
 * @param {object[]} targets - Les tokens initialement sélectionnés.
 *
 * @returns {Set} La sélection, mutable par le test.
 */
function mockSelection(targets) {
    const selection = new Set(targets);
    globalThis.game = {user: {targets: selection}};
    return selection;
}

describe("cibles figées à l'usage (course de résolution)", () => {
    afterEach(() => {
        delete globalThis.game;
    });

    it("la résolution garde les cibles de l'usage, même si la sélection a changé depuis", () => {
        const selection = mockSelection([ENEMY]);
        const activity = {id: "act-1"};

        TargetingPredicates.rememberTargetsFor(activity);

        // Pendant que les dés roulent, la sélection du MJ est rendue : elle
        // désigne maintenant une alliée. C'est le scénario exact qui a fait
        // frapper une momie par une momie.
        selection.clear();
        selection.add(ALLY);

        expect(TargetingPredicates.consumeTargetsFor(activity)).toEqual([ENEMY]);
    });

    it("une sélection figée ne sert qu'une fois", () => {
        mockSelection([ENEMY]);
        const activity = {id: "act-1"};

        TargetingPredicates.rememberTargetsFor(activity);

        expect(TargetingPredicates.consumeTargetsFor(activity)).toEqual([ENEMY]);
        expect(TargetingPredicates.consumeTargetsFor(activity)).toBeNull();
    });

    it("deux activités simultanées ne se mélangent pas leurs cibles", () => {
        const selection = mockSelection([ENEMY]);
        const first = {id: "act-1"};
        const second = {id: "act-2"};

        TargetingPredicates.rememberTargetsFor(first);
        selection.clear();
        selection.add(ALLY);
        TargetingPredicates.rememberTargetsFor(second);

        expect(TargetingPredicates.consumeTargetsFor(first)).toEqual([ENEMY]);
        expect(TargetingPredicates.consumeTargetsFor(second)).toEqual([ALLY]);
    });

    it("une activité jamais mémorisée rend null, et non une sélection vide", () => {
        mockSelection([ENEMY]);

        // La nuance porte : `null` laisse la résolution suivre son chemin normal
        // (dont l'auto-ciblage d'un sort sans portée), un tableau vide imposerait
        // « personne ».
        expect(TargetingPredicates.consumeTargetsFor({id: "jamais-vue"})).toBeNull();
        expect(TargetingPredicates.consumeTargetsFor(undefined)).toBeNull();
    });

    it("la sélection figée est une copie : vider la sélection après coup ne la vide pas", () => {
        const selection = mockSelection([ENEMY, ALLY]);
        const activity = {id: "act-1"};

        TargetingPredicates.rememberTargetsFor(activity);
        selection.clear();

        expect(TargetingPredicates.consumeTargetsFor(activity)).toHaveLength(2);
    });
});
