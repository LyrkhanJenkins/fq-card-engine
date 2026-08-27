import {describe, expect, test, vi} from "vitest";
import ReachRules from "../../src/domain/engine/reaction/reach-rules.js";

// Prédicats purs : ni DOM, ni `game`, ni acteur. Les profils sont exprimés en
// CASES (géométrie Manhattan du moteur) et reprennent les relevés faits en jeu
// sur un éloignement en ligne droite depuis le contact : au glisser Foundry
// livre le profil complet en un événement, au clavier un profil à deux points
// par pas.

describe("ReachRules.crossedOutward", () => {

    test("glisser depuis le contact : franchit toute portée inférieure à la distance finale", () => {
        expect(ReachRules.crossedOutward([1, 2, 3, 4], 1)).toBe(true);
        expect(ReachRules.crossedOutward([1, 2, 3, 4], 2)).toBe(true);
        expect(ReachRules.crossedOutward([1, 2, 3, 4], 3)).toBe(true);
    });

    test("glisser qui reste à portée : aucun franchissement", () => {
        expect(ReachRules.crossedOutward([1, 2, 3, 4], 4)).toBe(false);
        expect(ReachRules.crossedOutward([1, 2, 3, 4], 5)).toBe(false);
    });

    test("clavier : chaque portée n'est franchie que sur un seul pas", () => {
        // Pas 1 : 1 -> 2 cases
        expect(ReachRules.crossedOutward([1, 2], 1)).toBe(true);
        expect(ReachRules.crossedOutward([1, 2], 2)).toBe(false);
        // Pas 2 : 2 -> 3 cases
        expect(ReachRules.crossedOutward([2, 3], 1)).toBe(false);
        expect(ReachRules.crossedOutward([2, 3], 2)).toBe(true);
        // Pas 3 : 3 -> 4 cases — plus aucune portée de mêlée concernée
        expect(ReachRules.crossedOutward([3, 4], 1)).toBe(false);
        expect(ReachRules.crossedOutward([3, 4], 2)).toBe(false);
    });

    test("approche : ne franchit jamais, quelle que soit la portée", () => {
        for (const reach of [1, 2, 3, 4]) {
            expect(ReachRules.crossedOutward([4, 3, 2, 1], reach)).toBe(false);
        }
    });

    test("sortie puis retour à portée dans le même trajet : ne provoque pas", () => {
        expect(ReachRules.crossedOutward([1, 3, 1], 1)).toBe(false);
    });

    test("seules les extrémités comptent, les points intermédiaires sont ignorés", () => {
        expect(ReachRules.crossedOutward([1, 9, 9, 2], 1)).toBe(true);
        expect(ReachRules.crossedOutward([1, 1, 1, 1], 1)).toBe(false);
    });

    test("portée nulle, négative ou non finie : aucun franchissement", () => {
        expect(ReachRules.crossedOutward([1, 4], 0)).toBe(false);
        expect(ReachRules.crossedOutward([1, 4], -1)).toBe(false);
        expect(ReachRules.crossedOutward([1, 4], NaN)).toBe(false);
        expect(ReachRules.crossedOutward([1, 4], undefined)).toBe(false);
        // Portée infinie = toujours à portée, donc jamais de sortie.
        expect(ReachRules.crossedOutward([1, 4], Infinity)).toBe(false);
    });

    test("profil trop court ou non exploitable", () => {
        expect(ReachRules.crossedOutward([1], 1)).toBe(false);
        expect(ReachRules.crossedOutward([], 1)).toBe(false);
        expect(ReachRules.crossedOutward(null, 1)).toBe(false);
        expect(ReachRules.crossedOutward(undefined, 1)).toBe(false);
        expect(ReachRules.crossedOutward("1,4", 1)).toBe(false);
    });

    test("une distance non finie en extrémité est refusée plutôt qu'interprétée", () => {
        expect(ReachRules.crossedOutward([NaN, 4], 1)).toBe(false);
        expect(ReachRules.crossedOutward([1, NaN], 1)).toBe(false);
        expect(ReachRules.crossedOutward([1, Infinity], 1)).toBe(false);
    });
});

describe("ReachRules.provokers", () => {
    const hostile = {id: "hostile"};
    const ally = {id: "ally"};

    test("ne retient que les observateurs hostiles dont la portée est franchie", () => {
        const profiles = [
            {observer: hostile, distances: [1, 2]},
            {observer: ally, distances: [1, 2]},
        ];
        expect(ReachRules.provokers(profiles, () => 1, (o) => o.id === "hostile"))
            .toEqual([{observer: hostile, reach: 1}]);
    });

    test("un hostile dont la portée n'est pas franchie n'est pas retenu", () => {
        expect(ReachRules.provokers([{observer: hostile, distances: [3, 4]}], () => 1, () => true))
            .toEqual([]);
    });

    test("reachOf n'est pas appelé pour un observateur non hostile", () => {
        const reachOf = vi.fn(() => 1);
        ReachRules.provokers([{observer: ally, distances: [1, 2]}], reachOf, () => false);
        expect(reachOf).not.toHaveBeenCalled();
    });

    test("la portée est résolue par observateur, pas globalement", () => {
        const shortReach = {id: "short"};
        const longReach = {id: "long"};
        const profiles = [
            {observer: shortReach, distances: [1, 2]},
            {observer: longReach, distances: [2, 3]},
        ];
        const reachOf = (o) => (o.id === "short" ? 1 : 2);
        expect(ReachRules.provokers(profiles, reachOf, () => true)).toEqual([
            {observer: shortReach, reach: 1},
            {observer: longReach, reach: 2},
        ]);
    });

    test("un observateur sans arme de mêlée (portée 0) ne provoque pas", () => {
        expect(ReachRules.provokers([{observer: hostile, distances: [1, 2]}], () => 0, () => true))
            .toEqual([]);
    });

    test("entrées vides ou non exploitables", () => {
        expect(ReachRules.provokers([], () => 1, () => true)).toEqual([]);
        expect(ReachRules.provokers(null, () => 1, () => true)).toEqual([]);
        expect(ReachRules.provokers([null], () => 1, () => true)).toEqual([]);
    });
});
