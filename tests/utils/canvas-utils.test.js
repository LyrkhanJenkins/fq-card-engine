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
});
