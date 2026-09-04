/**
 * Orientation d'un token vers sa cible.
 *
 * La convention d'angle n'est pas choisie ici : elle est recopiée de celle que
 * Foundry applique lui-même à l'auto-rotation d'un déplacement
 * (`Token##animateMovement`, `Math.toDegrees(ray.angle) - 90`). Un token orienté
 * par ce module regarde donc exactement dans la même direction qu'un token
 * orienté par Foundry, et non à quatre-vingt-dix degrés près.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Facing {

    /**
     * Centre d'un token en pixels, à partir de sa position (coin haut-gauche) et
     * de son encombrement en cases. Lecture défensive : un token sans taille
     * exploitable vaut une case.
     *
     * @param {object} token - Le document token (ou son placeable).
     * @param {number} gridSize - La taille d'une case, en pixels.
     *
     * @returns {?{x: number, y: number}} Le centre, ou `null` si la position est
     *   inexploitable.
     */
    static center(token, gridSize) {
        const document = token?.document ?? token;
        const x = document?.x;
        const y = document?.y;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(gridSize)) {
            return null;
        }
        const width = Number.isFinite(document?.width) ? document.width : 1;
        const height = Number.isFinite(document?.height) ? document.height : 1;
        return {x: x + ((width * gridSize) / 2), y: y + ((height * gridSize) / 2)};
    }

    /**
     * Rotation, en degrés, qu'un token doit prendre pour regarder vers un autre.
     *
     * @param {?{x: number, y: number}} from - Le centre du token qui regarde.
     * @param {?{x: number, y: number}} to   - Le centre du token regardé.
     *
     * @returns {?number} La rotation en degrés, ou `null` si l'un des deux centres
     *   manque ou si les deux se confondent (aucune direction ne s'en déduit).
     */
    static rotationToward(from, to) {
        if (!from || !to) {
            return null;
        }
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (dx === 0 && dy === 0) {
            return null;
        }
        return (Math.atan2(dy, dx) * 180 / Math.PI) - 90;
    }

    /**
     * Oriente un token vers sa cible. Sans effet si l'un des deux tokens manque,
     * si la rotation ne peut pas être déduite, ou si le token est verrouillé en
     * rotation — un jeton dont l'illustration ne supporte pas la rotation porte
     * ce verrou, et le respecter est la seule façon de ne pas casser sa table.
     *
     * @param {object} source - Le document token qui attaque.
     * @param {object} target - Le document token visé.
     *
     * @returns {Promise<unknown>|undefined} La mise à jour en cours, ou rien.
     */
    static faceTarget(source, target) {
        const document = source?.document ?? source;
        if (!document?.update || document.lockRotation) {
            return undefined;
        }
        const gridSize = game.canvas?.scene?.dimensions?.size;
        const rotation = Facing.rotationToward(Facing.center(source, gridSize), Facing.center(target, gridSize));
        if (rotation === null) {
            return undefined;
        }
        return document.update({rotation});
    }
}
