import {afterEach, describe, expect, it, vi} from "vitest";
import Facing from "../../src/domain/engine/shared/facing.js";

const SIZE = 100;

/** Un document token minimal, positionné en pixels. */
function makeToken({x = 0, y = 0, width = 1, height = 1, lockRotation = false} = {}) {
    return {x, y, width, height, lockRotation, update: vi.fn()};
}

/** Monte le minimum global : la taille de case de la scène active. */
function mockScene() {
    globalThis.game = {canvas: {scene: {dimensions: {size: SIZE}}}};
}

describe("Facing.rotationToward", () => {
    it("suit la convention d'angle de Foundry : l'est vaut -90, le sud vaut 0", () => {
        // Recopiée de l'auto-rotation de déplacement de Foundry
        // (`Math.toDegrees(ray.angle) - 90`) : un token orienté par ce moteur
        // regarde dans la même direction qu'un token orienté par Foundry.
        expect(Facing.rotationToward({x: 0, y: 0}, {x: 100, y: 0})).toBe(-90);
        expect(Facing.rotationToward({x: 0, y: 0}, {x: 0, y: 100})).toBe(0);
        expect(Facing.rotationToward({x: 0, y: 0}, {x: -100, y: 0})).toBe(90);
    });

    it("rend null quand aucune direction ne se déduit — centres confondus ou centre manquant", () => {
        expect(Facing.rotationToward({x: 5, y: 5}, {x: 5, y: 5})).toBeNull();
        expect(Facing.rotationToward(null, {x: 1, y: 1})).toBeNull();
        expect(Facing.rotationToward({x: 1, y: 1}, null)).toBeNull();
    });
});

describe("Facing.center", () => {
    it("prend le centre, pas le coin : un token de deux cases n'est pas orienté depuis son angle", () => {
        expect(Facing.center(makeToken({x: 0, y: 0, width: 2, height: 2}), SIZE)).toEqual({x: 100, y: 100});
    });

    it("une taille absente vaut une case, une position illisible rend null", () => {
        expect(Facing.center({x: 0, y: 0}, SIZE)).toEqual({x: 50, y: 50});
        expect(Facing.center({x: null, y: 0}, SIZE)).toBeNull();
        expect(Facing.center(undefined, SIZE)).toBeNull();
    });
});

describe("Facing.faceTarget", () => {
    afterEach(() => {
        delete globalThis.game;
    });

    it("écrit la rotation du token source vers sa cible", () => {
        mockScene();
        const source = makeToken({x: 0, y: 0});
        const target = makeToken({x: 300, y: 0});

        Facing.faceTarget(source, target);

        expect(source.update).toHaveBeenCalledWith({rotation: -90});
    });

    it("respecte le verrou de rotation : un jeton dont l'illustration ne tourne pas n'est jamais tourné", () => {
        mockScene();
        const source = makeToken({x: 0, y: 0, lockRotation: true});

        Facing.faceTarget(source, makeToken({x: 300, y: 0}));

        expect(source.update).not.toHaveBeenCalled();
    });

    it("ne touche à rien sans cible, ni quand la cible occupe la même case", () => {
        mockScene();
        const source = makeToken({x: 0, y: 0});

        Facing.faceTarget(source, undefined);
        Facing.faceTarget(source, makeToken({x: 0, y: 0}));

        expect(source.update).not.toHaveBeenCalled();
    });
});
