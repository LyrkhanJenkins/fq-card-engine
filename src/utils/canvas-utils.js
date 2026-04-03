// TODO Stop les classes utils
export default class CanvasUtils {

    static getMinDistanceBetweenTwoToken(x1, y1, x2, y2, w1, w2, h1, h2) {
        const squares1 = CanvasUtils.getAllSquaresOccupiedByToken(x1, y1, w1, h1);
        const squares2 = CanvasUtils.getAllSquaresOccupiedByToken(x2, y2, w2, h2);
        const result = [];
        squares1.forEach(s1 => {
            squares2.forEach(s2 => {
                result.push(CanvasUtils.getDistanceBetweenTwoSquares(s1.x, s1.y, s2.x, s2.y));
            });
        });
        return Math.min(...result);
    }

    static getAllSquaresOccupiedByToken(x, y, w, h) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        let result = [];
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < h; j++) {
                result.push({x: x + (squareSize * i), y: y + (squareSize * j)});
            }
        }
        return result;
    }

    static getDistanceBetweenTwoSquares(x1, y1, x2, y2) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return ((Math.abs(x1 - x2) + Math.abs(y1 - y2)) / squareSize);
    }

    static getXAdjacentLocation(token, location) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return token.x + (location === "left" ? -squareSize : location === "right" ? squareSize : 0);
    }

    static getYAdjacentLocation(token, location) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return token.y + (location === "down" ? squareSize : location === "up" ? -squareSize : 0);
    }

    static locationIsOccupied(location) {
        const myToken = game.canvas?.scene?.tokens?.find(t => t.actorId === game.user?.character?.id);
        return !!game.scenes.find(s => s.active).tokens?.find(t =>
            t.x === CanvasUtils.getXAdjacentLocation(myToken, location) &&
            t.y === CanvasUtils.getYAdjacentLocation(myToken, location));
    }
}
