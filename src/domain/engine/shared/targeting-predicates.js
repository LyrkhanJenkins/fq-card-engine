import Geometry from "./geometry.js";
import Constants from "../../constants.js";

/**
 * Prédicats purs de ciblage, extraits de `ResourceHandler.checkIfCanCardCanReachTargets`
 * pour servir de source de vérité unique partagée entre le moteur (qui publie des
 * messages de chat) et le garde-fou de la dialog « Jouer la carte » (qui lève une
 * `FormError`). Aucune méthode ne publie de message ni ne dépend d'une erreur
 * applicative : elles reçoivent des données et rendent un verdict neutre, le mapping
 * verdict → message/erreur restant à la charge de l'appelant.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TargetingPredicates {
    /**
     * Verdicts possibles du comptage de cibles (objet gelé).
     */
    static TARGET_COUNT = Object.freeze({
        NONE: "none",
        MULTIPLE_NOT_ALLOWED: "multipleNotAllowed",
        TOO_MANY: "tooMany",
        OK: "ok",
    });

    /**
     * Évalue le nombre de cibles sélectionnées par rapport au nombre autorisé,
     * selon exactement la logique et l'ordre du moteur.
     *
     * @param {number} targetCount - Le nombre de cibles actuellement sélectionnées.
     * @param {number} nbTargets   - Le nombre de cibles autorisé (falsy = une seule).
     *
     * @returns {string} Un verdict de `TargetingPredicates.TARGET_COUNT`.
     */
    static evaluateTargetCount(targetCount, nbTargets) {
        if (targetCount === 0) {
            return TargetingPredicates.TARGET_COUNT.NONE;
        }
        if (!nbTargets && targetCount > 1) {
            return TargetingPredicates.TARGET_COUNT.MULTIPLE_NOT_ALLOWED;
        }
        if (nbTargets && targetCount > nbTargets) {
            return TargetingPredicates.TARGET_COUNT.TOO_MANY;
        }
        return TargetingPredicates.TARGET_COUNT.OK;
    }

    /**
     * Recherche le token du lanceur sur la scène active — délègue à la recherche
     * unique `Constants.actorToken`.
     *
     * @param {object} actor - L'acteur lanceur.
     *
     * @returns {object|null} Le document token du lanceur, ou null si absent.
     */
    static findCasterToken(actor) {
        return Constants.actorToken(actor?.id) ?? null;
    }

    /**
     * Retourne les cibles hors de portée du lanceur, avec leur distance résolue.
     * Même géométrie et même condition (`minReach > dist || maxReach < dist`) que
     * le moteur.
     *
     * @param {object}   casterToken - Le document token du lanceur.
     * @param {object[]} targets     - Les cibles à vérifier.
     * @param {number}   minReach    - La portée minimale (en cases).
     * @param {number}   maxReach    - La portée maximale (en cases).
     *
     * @returns {{target: object, dist: number}[]} Les cibles hors portée et leur distance.
     */
    static findOutOfReachTargets(casterToken, targets, minReach, maxReach) {
        const outOfReach = [];
        targets.forEach(target => {
            const dist = Geometry.getMinDistanceBetweenTwoToken(casterToken.x, casterToken.y, target.document.x, target.document.y, casterToken.width, target.document.width, casterToken.height, target.document.height);
            if (minReach > dist || maxReach < dist) {
                outOfReach.push({target, dist});
            }
        });
        return outOfReach;
    }
}
