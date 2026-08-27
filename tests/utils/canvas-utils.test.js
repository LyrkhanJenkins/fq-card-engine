import {beforeEach, describe, expect, test, vi} from "vitest";
import Geometry from "../../src/domain/engine/shared/geometry.js";

describe("Geometry", () => {
    const token = {actorId: "charId", x: 5, y: 5};
    const squareSize = 5;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("getAllSquaresOccupiedByToken", () => {
        const result = Geometry.getAllSquaresOccupiedByToken(0, 0, 2, 2);
        expect(result).toEqual([
            {x: 0, y: 0},
            {x: 0, y: 5},
            {x: 5, y: 0},
            {x: 5, y: 5},
        ]);
    });

    test("getDistanceBetweenTwoSquares", () => {
        const result = Geometry.getDistanceBetweenTwoSquares(0, 0, 5, 5);
        expect(result).toEqual(2);
    });

    test("getXAdjacentLocation", () => {
        const result = Geometry.getXAdjacentLocation({actorId: "charId", x: 5, y: 5}, "left");
        expect(result).toEqual(token.x - squareSize);
    });

    test("getYAdjacentLocation", () => {
        const result = Geometry.getYAdjacentLocation({actorId: "charId", x: 5, y: 5}, "up");
        expect(result).toEqual(token.y - squareSize);
    });

    test("locationIsOccupied", () => {
        const result = Geometry.locationIsOccupied("left");
        expect(result).toEqual(true);
    });

    test("getXAdjacentLocation - right et direction neutre", () => {
        expect(Geometry.getXAdjacentLocation({x: 5}, "right")).toEqual(10);
        // Une direction verticale ne décale pas en X
        expect(Geometry.getXAdjacentLocation({x: 5}, "up")).toEqual(5);
    });

    test("getYAdjacentLocation - down et direction neutre", () => {
        expect(Geometry.getYAdjacentLocation({y: 5}, "down")).toEqual(10);
        // Une direction horizontale ne décale pas en Y
        expect(Geometry.getYAdjacentLocation({y: 5}, "left")).toEqual(5);
    });

    test("getMinDistanceBetweenTwoToken - retient la plus petite distance entre cases occupées", () => {
        // Token A de 2×1 cases en (0,0) → cases {0,0} et {5,0}
        // Token B de 1×1 case en (10,0)  → case  {10,0}
        // distances (en cases) : {0,0}->{10,0}=2 ; {5,0}->{10,0}=1  → min = 1
        const result = Geometry.getMinDistanceBetweenTwoToken(0, 0, 10, 0, 2, 1, 1, 1);
        expect(result).toEqual(1);
    });

    test("getAllSquaresOccupiedByToken - un token 0.5×0.5 est ramené sur la case qui contient son centre", () => {
        // Token 0.5×0.5 centré dans la case (5,5) : Foundry le pose en (6.25, 6.25)
        expect(Geometry.getAllSquaresOccupiedByToken(6.25, 6.25, 0.5, 0.5)).toEqual([{x: 5, y: 5}]);
        // Même case quand le petit token occupe le demi-carreau droit/bas (7.5, 7.5)
        expect(Geometry.getAllSquaresOccupiedByToken(7.5, 7.5, 0.5, 0.5)).toEqual([{x: 5, y: 5}]);
    });

    test("getMinDistanceBetweenTwoToken - un token 0.5×0.5 adjacent est à exactement 1 case", () => {
        // Lanceur 1×1 en (0,5) ; petit token 0.5×0.5 en (6.25,6.25), soit la case
        // adjacente (5,5). Sans arrondi à la case, la mesure donnerait 1.5.
        expect(Geometry.getMinDistanceBetweenTwoToken(0, 5, 6.25, 6.25, 1, 0.5, 1, 0.5)).toEqual(1);
    });

    test("getMinDistanceBetweenTwoToken - un token 0.5×0.5 dans la même case est à 0", () => {
        // Lanceur 1×1 en (5,5) ; petit token dans la même case → distance nulle,
        // donc toujours bloqué par une portée minimale de 1 (comportement voulu).
        expect(Geometry.getMinDistanceBetweenTwoToken(5, 5, 6.25, 6.25, 1, 0.5, 1, 0.5)).toEqual(0);
    });

    test("locationIsOccupied - false quand la case adjacente est libre", () => {
        // myToken en (5,5) ; 'up' → case cible (5,0) : aucun token présent → false
        expect(Geometry.locationIsOccupied("up")).toEqual(false);
    });
});
