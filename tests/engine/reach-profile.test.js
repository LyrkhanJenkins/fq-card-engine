import {beforeEach, describe, expect, test, vi} from "vitest";
import ReachProfile from "../../src/domain/engine/reaction/reach-profile.js";

// `Geometry` lit la taille de case dans `game.canvas.scene.dimensions.size`, et
// `reachToCases` lit `game.canvas.scene.grid`. Monde minimal : case de 100 px
// valant 5 pieds. Les positions sont exprimées en cases par les fabriques
// ci-dessous, converties en pixels comme le fait Foundry.

const SIZE = 100;

function mockScene({distance = 5, units = "ft"} = {}) {
    globalThis.game = {
        canvas: {scene: {dimensions: {size: SIZE}, grid: {distance, units}}},
    };
}

/** Un TokenDocument minimal, positionné en cases. */
const token = (id, cx, cy, size = 1) => ({id, x: cx * SIZE, y: cy * SIZE, width: size, height: size});

/** Un waypoint de `movement.passed.waypoints`, positionné en cases. */
const at = (cx, cy) => ({x: cx * SIZE, y: cy * SIZE});

/** Un `movement` de hook `moveToken` réduit à ce que la détection consomme. */
const movementOf = (origin, ...waypoints) => ({origin, passed: {waypoints}});

describe("ReachProfile.buildDistanceProfiles", () => {
    beforeEach(() => mockScene());

    test("glisser : profil complet depuis le contact, origine incluse", () => {
        const observer = token("obs", 0, 0);
        const mover = token("mover", 1, 0);
        const movement = movementOf(at(1, 0), at(2, 0), at(3, 0), at(4, 0));

        expect(ReachProfile.buildDistanceProfiles(movement, mover, [observer]))
            .toEqual([{observer, distances: [1, 2, 3, 4]}]);
    });

    test("pas clavier : l'origine fournit le second point, sans quoi rien ne serait détectable", () => {
        const observer = token("obs", 0, 0);
        const mover = token("mover", 1, 0);
        const movement = movementOf(at(1, 0), at(2, 0));

        const [profile] = ReachProfile.buildDistanceProfiles(movement, mover, [observer]);
        expect(profile.distances).toEqual([1, 2]);
    });

    test("la position du mobile vient de `movement`, jamais du document (périmé dans moveToken)", () => {
        const observer = token("obs", 0, 0);
        // Position du document volontairement absurde : c'est celle d'AVANT le
        // déplacement que Foundry expose au moment du hook.
        const mover = {id: "mover", x: 99 * SIZE, y: 99 * SIZE, width: 1, height: 1};
        const movement = movementOf(at(1, 0), at(2, 0));

        const [profile] = ReachProfile.buildDistanceProfiles(movement, mover, [observer]);
        expect(profile.distances).toEqual([1, 2]);
    });

    test("géométrie Manhattan : un pas de côté augmente la distance et peut donc provoquer", () => {
        const observer = token("obs", 0, 0);
        const mover = token("mover", 3, 0);
        const movement = movementOf(at(3, 0), at(3, 1));

        const [profile] = ReachProfile.buildDistanceProfiles(movement, mover, [observer]);
        // Chebyshev donnerait [3, 3] ; Manhattan donne [3, 4].
        expect(profile.distances).toEqual([3, 4]);
    });

    test("la taille des observateurs est prise en compte (distance minimale entre cases occupées)", () => {
        const observer = token("obs", 0, 0, 2);   // occupe (0,0) (1,0) (0,1) (1,1)
        const mover = token("mover", 3, 0);
        const movement = movementOf(at(3, 0), at(4, 0));

        const [profile] = ReachProfile.buildDistanceProfiles(movement, mover, [observer]);
        // Depuis (3,0), la case occupée la plus proche est (1,0) : 2 cases.
        expect(profile.distances).toEqual([2, 3]);
    });

    test("les dimensions portées par le waypoint priment sur celles du document", () => {
        const observer = token("obs", 0, 0);
        const mover = token("mover", 2, 0, 1);
        const movement = {
            origin: at(2, 0),
            passed: {waypoints: [{...at(3, 0), width: 2, height: 2}]},
        };

        const [profile] = ReachProfile.buildDistanceProfiles(movement, mover, [observer]);
        // Au waypoint le mobile occupe (3,0) et (4,0) : la case la plus proche de
        // l'observateur reste (3,0), soit 3 cases.
        expect(profile.distances).toEqual([2, 3]);
    });

    test("préfiltre : un observateur hors rayon sur tout le trajet est écarté", () => {
        const near = token("near", 0, 0);
        const far = token("far", 20, 20);
        const mover = token("mover", 1, 0);
        const movement = movementOf(at(1, 0), at(2, 0));

        const profiles = ReachProfile.buildDistanceProfiles(movement, mover, [near, far]);
        expect(profiles.map(p => p.observer.id)).toEqual(["near"]);
    });

    test("le rayon de préfiltre est paramétrable", () => {
        const observer = token("obs", 0, 0);
        const mover = token("mover", 6, 0);
        const movement = movementOf(at(6, 0), at(7, 0));

        expect(ReachProfile.buildDistanceProfiles(movement, mover, [observer], 4)).toEqual([]);
        expect(ReachProfile.buildDistanceProfiles(movement, mover, [observer], 6)).toHaveLength(1);
    });

    test("le mobile lui-même et les entrées vides sont écartés", () => {
        const mover = token("mover", 1, 0);
        const movement = movementOf(at(1, 0), at(2, 0));

        expect(ReachProfile.buildDistanceProfiles(movement, mover, [mover, null])).toEqual([]);
        expect(ReachProfile.buildDistanceProfiles(movement, mover, [])).toEqual([]);
        expect(ReachProfile.buildDistanceProfiles(movement, mover, undefined)).toEqual([]);
    });

    test("mouvement sans trajet exploitable", () => {
        const mover = token("mover", 1, 0);
        const observer = token("obs", 0, 0);

        expect(ReachProfile.buildDistanceProfiles({origin: at(1, 0), passed: {waypoints: []}}, mover, [observer]))
            .toEqual([]);
        expect(ReachProfile.buildDistanceProfiles({passed: {waypoints: [at(2, 0)]}}, mover, [observer]))
            .toEqual([]);
        expect(ReachProfile.buildDistanceProfiles(undefined, mover, [observer])).toEqual([]);
    });
});

describe("ReachProfile.reachToCases", () => {

    test("conversion des portées dnd5e réelles sur une grille de 5 pieds", () => {
        mockScene({distance: 5, units: "ft"});
        expect(ReachProfile.reachToCases(5, "ft")).toBe(1);    // épée longue, dague
        expect(ReachProfile.reachToCases(10, "ft")).toBe(2);   // hallebarde, pique, fouet
    });

    test("plancher à 1 case : une arme de mêlée atteint toujours la case adjacente", () => {
        mockScene({distance: 10, units: "ft"});
        expect(ReachProfile.reachToCases(5, "ft")).toBe(1);
    });

    test("portée absente, nulle ou non finie : aucune portée", () => {
        mockScene();
        expect(ReachProfile.reachToCases(0, "ft")).toBe(0);
        expect(ReachProfile.reachToCases(-5, "ft")).toBe(0);
        expect(ReachProfile.reachToCases(NaN, "ft")).toBe(0);
        expect(ReachProfile.reachToCases(undefined, "ft")).toBe(0);
    });

    test("unité de l'arme différente de celle de la scène : refus signalé, pas de comparaison faussée", () => {
        mockScene({distance: 1.5, units: "m"});
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {
        });

        expect(ReachProfile.reachToCases(10, "ft")).toBe(0);
        expect(warn).toHaveBeenCalledTimes(1);

        warn.mockRestore();
    });

    test("unité de l'arme absente : la vérification est passée", () => {
        mockScene({distance: 5, units: "ft"});
        expect(ReachProfile.reachToCases(10, undefined)).toBe(2);
    });

    test("grille de scène inexploitable", () => {
        globalThis.game = {canvas: {scene: {}}};
        expect(ReachProfile.reachToCases(10, "ft")).toBe(0);

        globalThis.game = {};
        expect(ReachProfile.reachToCases(10, "ft")).toBe(0);
    });
});
