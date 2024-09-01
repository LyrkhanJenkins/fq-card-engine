import CanvasUtils from '../../scripts/utils/canvas-utils';

describe('CanvasUtils', () => {
    const token = {actorId: 'charId', x: 5, y: 5}; // Un exemple de token
    const tokenToLeft = {actorId: 'otherId', x: 0, y: 5}; // Un exemple de token
    const squareSize = 5; // Une taille de case hypothétique


    beforeEach(() => { // Mock de l'instance `game`
        global.game = {
            canvas: {
                scene: {
                    dimensions: {size: squareSize},
                    tokens: [token, tokenToLeft]
                }
            },
            scenes: [{active: true, tokens: [token, tokenToLeft]}],
            user: {character: {id: 'charId'}}
        };
    });

    test('getAllSquaresOccupiedByToken', () => {
        const result = CanvasUtils.getAllSquaresOccupiedByToken(0, 0, 2, 2);
        expect(result).toEqual([
                {
                    "x": 0,
                    "y": 0,
                },
                {
                    "x": 0,
                    "y": 5,
                },
                {
                    "x": 5,
                    "y": 0,
                },
                {
                    "x": 5,
                    "y": 5,
                },
            ]
        );
    });

    test('getDistanceBetweenTwoSquares', () => {
        const result = CanvasUtils.getDistanceBetweenTwoSquares(0, 0, 5, 5);
        expect(result).toEqual(2);
    });

    test('getXAdjacentLocation', () => {
        const result = CanvasUtils.getXAdjacentLocation(token, 'left');
        expect(result).toEqual(token.x - squareSize);
    });

    test('getYAdjacentLocation', () => {
        const result = CanvasUtils.getYAdjacentLocation(token, 'up');
        expect(result).toEqual(token.y - squareSize);
    });

    test('locationIsOccupied', () => {
        const result = CanvasUtils.locationIsOccupied('left');
        expect(result).toEqual(true);
    });
});