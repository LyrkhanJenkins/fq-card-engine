import Constants from "../../constants.js";

/**
 * Utilitaires de géométrie sur le canvas Foundry : calculs de distances entre
 * tokens (en tenant compte de leur taille), et repérage des cases adjacentes.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Geometry {

    /**
     * Calcule la distance minimale (en cases) entre deux tokens, en considérant
     * l'ensemble des cases occupées par chacun d'eux (utile pour les tokens > 1×1).
     *
     * @param {number} x1 - Position X (px) du premier token.
     * @param {number} y1 - Position Y (px) du premier token.
     * @param {number} x2 - Position X (px) du second token.
     * @param {number} y2 - Position Y (px) du second token.
     * @param {number} w1 - Largeur (en cases) du premier token.
     * @param {number} w2 - Largeur (en cases) du second token.
     * @param {number} h1 - Hauteur (en cases) du premier token.
     * @param {number} h2 - Hauteur (en cases) du second token.
     *
     * @returns {number} La plus petite distance (en cases) entre les deux tokens.
     */
    static getMinDistanceBetweenTwoToken(x1, y1, x2, y2, w1, w2, h1, h2) {
        const squares1 = Geometry.getAllSquaresOccupiedByToken(x1, y1, w1, h1);
        const squares2 = Geometry.getAllSquaresOccupiedByToken(x2, y2, w2, h2);
        const result = [];
        squares1.forEach(s1 => {
            squares2.forEach(s2 => {
                result.push(Geometry.getDistanceBetweenTwoSquares(s1.x, s1.y, s2.x, s2.y));
            });
        });
        return Math.min(...result);
    }

    /**
     * Calcule la distance minimale (en cases) entre deux tokens donnés sous
     * forme de placeable ou de document (le document est utilisé s'il existe).
     *
     * @param {object} a - Le premier token (placeable ou document).
     * @param {object} b - Le second token (placeable ou document).
     *
     * @returns {number} La plus petite distance (en cases) entre les deux tokens.
     */
    static distanceBetweenTokens(a, b) {
        const da = a?.document ?? a;
        const db = b?.document ?? b;
        return Geometry.getMinDistanceBetweenTwoToken(da.x, da.y, db.x, db.y,
            da.width, db.width, da.height, db.height);
    }

    /**
     * Retourne les coordonnées (px) du coin supérieur-gauche de chaque case
     * occupée par un token de dimensions `w`×`h` cases.
     *
     * Un token plus petit qu'une case (0.5×0.5…) n'est pas aligné sur la grille :
     * Foundry le positionne au demi-carreau, donc ses coordonnées tombent au
     * milieu d'une case. On ramène chaque axe sur la case qui contient le centre
     * du token, afin que les distances mesurées restent des nombres entiers de
     * cases — sans quoi une cible adjacente serait mesurée à 0.5 ou 1.5 case et
     * échouerait aux bornes `minReach`/`maxReach` des cartes.
     *
     * @param {number} x - Position X (px) du token (coin haut-gauche).
     * @param {number} y - Position Y (px) du token (coin haut-gauche).
     * @param {number} w - Largeur du token en cases.
     * @param {number} h - Hauteur du token en cases.
     *
     * @returns {{x: number, y: number}[]} La liste des coins des cases occupées.
     */
    static getAllSquaresOccupiedByToken(x, y, w, h) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        const snapToSquare = (v, size) => squareSize
            ? Math.floor((v + (Math.min(size, 1) * squareSize) / 2) / squareSize) * squareSize
            : v;
        const gx = snapToSquare(x, w);
        const gy = snapToSquare(y, h);
        let result = [];
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < h; j++) {
                result.push({x: gx + (squareSize * i), y: gy + (squareSize * j)});
            }
        }
        return result;
    }

    /**
     * Calcule la distance de Manhattan (en cases) entre deux cases repérées par
     * leurs coordonnées en pixels.
     *
     * @param {number} x1 - Position X (px) de la première case.
     * @param {number} y1 - Position Y (px) de la première case.
     * @param {number} x2 - Position X (px) de la seconde case.
     * @param {number} y2 - Position Y (px) de la seconde case.
     *
     * @returns {number} La distance de Manhattan exprimée en cases.
     */
    static getDistanceBetweenTwoSquares(x1, y1, x2, y2) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return ((Math.abs(x1 - x2) + Math.abs(y1 - y2)) / squareSize);
    }

    /**
     * Retourne la position X (px) de la case adjacente à un token selon la direction.
     *
     * @param {object} token    - Le token de référence (doit exposer `x`).
     * @param {string} location - La direction (« left », « right », sinon aucun décalage).
     *
     * @returns {number} La coordonnée X (px) de la case adjacente.
     */
    static getXAdjacentLocation(token, location) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return token.x + (location === "left" ? -squareSize : location === "right" ? squareSize : 0);
    }

    /**
     * Retourne la position Y (px) de la case adjacente à un token selon la direction.
     *
     * @param {object} token    - Le token de référence (doit exposer `y`).
     * @param {string} location - La direction (« down », « up », sinon aucun décalage).
     *
     * @returns {number} La coordonnée Y (px) de la case adjacente.
     */
    static getYAdjacentLocation(token, location) {
        const squareSize = game.canvas?.scene?.dimensions?.size ?? 0;
        return token.y + (location === "down" ? squareSize : location === "up" ? -squareSize : 0);
    }

    /**
     * Indique si la case adjacente au token de l'utilisateur courant, dans la
     * direction donnée, est déjà occupée par un autre token de la scène active.
     *
     * @param {string} location - La direction à tester (« left », « right », « up », « down »).
     *
     * @returns {boolean} True si la case adjacente est occupée, false sinon.
     */
    static locationIsOccupied(location) {
        const myToken = Constants.myToken;
        return Geometry.squareIsOccupied({
            x: Geometry.getXAdjacentLocation(myToken, location),
            y: Geometry.getYAdjacentLocation(myToken, location)
        });
    }

    /**
     * Indique si une case de la scène active est occupée par un token.
     *
     * L'occupation est testée sur TOUTES les cases couvertes par chaque token, et
     * pas seulement sur son coin : un token de plus d'une case occupe bel et bien
     * les cases qu'il déborde.
     *
     * @param {{x: number, y: number}} square - Le coin supérieur-gauche de la case (px).
     *
     * @returns {boolean} True si un token occupe cette case.
     */
    static squareIsOccupied(square) {
        // Dimensions par défaut à 1 : un token sans `width`/`height` (donnée
        // partielle) occupe au moins sa propre case — sans ce repli, il
        // n'occuperait AUCUNE case et laisserait poser un sbire sur lui.
        return !!game.scenes.find(s => s.active).tokens?.some(token =>
            Geometry.getAllSquaresOccupiedByToken(token.x, token.y, token.width || 1, token.height || 1)
                .some(corner => corner.x === square?.x && corner.y === square?.y));
    }
}
