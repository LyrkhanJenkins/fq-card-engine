import Geometry from "../shared/geometry.js";

/**
 * Construction des profils de distance le long d'un trajet de token, et
 * conversion des portées dnd5e vers l'unité du moteur.
 *
 * Adaptateur : c'est la seule couche de la détection qui lit le monde (grille de
 * scène via `Geometry`, unités via `scene.grid`). Les prédicats restent purs dans
 * `reach-rules.js`. La mesure passe par `Geometry.getMinDistanceBetweenTwoToken`
 * — donc distance de Manhattan en cases, minimum sur les cases occupées, taille
 * des tokens prise en compte — et NON par `canvas.grid.measurePath`, qui mesure
 * en pieds, de centre à centre et selon la règle 5-5-5. Les deux conventions
 * divergent en diagonale ; utiliser celle du moteur garantit qu'une attaque
 * d'opportunité a exactement la même portée qu'une carte de même allonge.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ReachProfile {

    /**
     * Rayon de préfiltre, en cases : un observateur qui reste au-delà de cette
     * distance sur tout le trajet est écarté sans autre calcul. Couvre l'allonge
     * maximale d'une arme de mêlée (2 cases) avec de la marge pour un bonus de
     * portée, sans balayer la scène entière à chaque pas.
     * @type {number}
     */
    static PREFILTER_CASES = 4;

    /**
     * Profils de distance entre un token en mouvement et chaque observateur, à
     * chaque étape du trajet.
     *
     * La position du mobile est lue EXCLUSIVEMENT dans `movement` : au moment où
     * le hook `moveToken` est appelé, `mover.x`/`mover.y` portent encore la
     * position d'AVANT le déplacement (vérifié en jeu). Les lire ici produirait
     * des distances silencieusement fausses. Seules les DIMENSIONS du mobile sont
     * prises sur le document, en repli de celles portées par le waypoint — un
     * token qui change de taille en cours de trajet reste ainsi correct.
     *
     * Le profil commence à `movement.origin`, que Foundry n'inclut pas dans
     * `passed.waypoints` : sans lui, un pas clavier n'aurait qu'un seul point et
     * aucun franchissement ne serait détectable.
     *
     * @param {object}   movement                     - Le mouvement livré par le hook `moveToken`.
     * @param {object}   mover                        - Le TokenDocument en mouvement (dimensions et identité seulement).
     * @param {object[]} observers                    - Les TokenDocuments candidats (le mobile est écarté).
     * @param {number}   [prefilterCases]             - Le rayon de préfiltre, en cases.
     *
     * @returns {Array<{observer: object, distances: number[]}>} Un profil par observateur retenu.
     */
    static buildDistanceProfiles(movement, mover, observers, prefilterCases = ReachProfile.PREFILTER_CASES) {
        const origin = movement?.origin;
        const waypoints = movement?.passed?.waypoints ?? [];
        if (!origin || waypoints.length === 0) {
            return [];
        }
        const points = [origin, ...waypoints];
        const profiles = [];
        for (const observer of observers ?? []) {
            if (!observer || observer.id === mover?.id) {
                continue;
            }
            const distances = points.map(point => Geometry.getMinDistanceBetweenTwoToken(
                point.x, point.y, observer.x, observer.y,
                point.width ?? mover?.width, observer.width,
                point.height ?? mover?.height, observer.height));
            if (Math.min(...distances) > prefilterCases) {
                continue;
            }
            profiles.push({observer, distances});
        }
        return profiles;
    }

    /**
     * Convertit une portée d'arme dnd5e (`system.range.reach`, exprimée dans les
     * unités du système — pieds en dnd5e) vers des cases, unité de la géométrie
     * du moteur.
     *
     * Plancher à 1 case dès que la portée est positive, par cohérence avec le
     * défaut d'`AdjacentTargeting` (`maxReach || 1`) : toute arme de mêlée atteint
     * au moins la case adjacente, y compris sur une grille dont la case vaut plus
     * que l'allonge de l'arme.
     *
     * Refuse explicitement une divergence d'unités entre l'arme et la scène (arme
     * en pieds sur une scène en mètres) : la comparaison `distance > portée`
     * serait fausse sans le moindre signe. Renvoie alors `0` — donc aucune attaque
     * d'opportunité — et le signale en console, plutôt que d'appliquer une règle
     * faussée.
     *
     * @param {number} reach   - La portée de l'arme (`system.range.reach`).
     * @param {string} [units] - L'unité de la portée (`system.range.units`). Non vérifiée si absente.
     *
     * @returns {number} La portée en cases, ou `0` si inexploitable.
     */
    static reachToCases(reach, units) {
        if (!Number.isFinite(reach) || reach <= 0) {
            return 0;
        }
        const grid = game.canvas?.scene?.grid;
        const perCase = grid?.distance;
        if (!Number.isFinite(perCase) || perCase <= 0) {
            return 0;
        }
        if (units && grid.units && units !== grid.units) {
            console.warn(`[fq-card-engine] Portée d'arme en « ${units} » sur une scène en « ${grid.units} » : `
                + `attaque d'opportunité désactivée pour éviter une comparaison erronée.`);
            return 0;
        }
        return Math.max(1, Math.floor(reach / perCase));
    }
}
