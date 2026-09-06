import Constants from "../../constants.js";
import RollService from "../../engine/roll/roll-service.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";
import ZoneTargeting from "./zone-targeting.js";

/**
 * Ciblage « Adjacent » (targetType « Adjacent ») : acquisition AUTOMATIQUE, sans
 * aucune interaction, de tous les tokens de la scène situés dans l'anneau
 * [minReach, maxReach] (en cases, distance Manhattan multi-cases — la géométrie
 * du moteur) autour du token du lanceur, lui-même exclu. `maxReach` vide vaut
 * 1 case (adjacence stricte) ; un `minReach` > 0 fait de l'anneau une couronne
 * (ex. Attaque En Cercle : 4-XXX à 5). Les tokens couverts deviennent les cibles
 * de l'utilisateur (`retargetTo`), donc tout l'aval du moteur est inchangé.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class AdjacentTargeting {
    /**
     * Statuts possibles de l'acquisition (objet gelé).
     */
    static ACQUISITION = Object.freeze({
        OK: "ok",
        NO_CASTER_TOKEN: "noCasterToken",
    });

    /**
     * Acquiert comme cibles les tokens de l'anneau [minReach, maxReach] autour du
     * lanceur, à partir de portées DÉJÀ résolues. Le bonus de portée de l'acteur
     * s'ajoute à maxReach (comme partout ailleurs) ; les tokens sans acteur
     * (décor) sont ignorés.
     *
     * @param {number} minReach - La portée minimale résolue (falsy = 0).
     * @param {number} maxReach - La portée maximale résolue (falsy = 1 case).
     *
     * @returns {{status: string, count: number}} Le statut (`ACQUISITION`) et le nombre de cibles acquises.
     */
    static acquireWithin(minReach, maxReach) {
        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        if (!casterToken) {
            return {status: AdjacentTargeting.ACQUISITION.NO_CASTER_TOKEN, count: 0};
        }
        const candidates = [...(game.canvas?.scene?.tokens ?? [])]
            .filter(token => token !== casterToken && token.actorId && token.actorId !== Constants.actorCurrent?.id);
        const covered = TargetingPredicates.tokensWithinRange(casterToken, candidates, minReach, maxReach, 1);

        ZoneTargeting.retargetTo(covered);
        return {status: AdjacentTargeting.ACQUISITION.OK, count: covered.length};
    }

    /**
     * Variante dialog : résout une copie du choix (bonus de caractéristiques +
     * variables X/Y — miroir de `TargetingView.build`) puis acquiert les cibles.
     *
     * @param {object} cardContent - Le choix de carte brut sélectionné.
     * @param {object} [fd={}]     - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {{status: string, count: number}} Le statut (`ACQUISITION`) et le nombre de cibles acquises.
     */
    static acquireTargets(cardContent, fd = {}) {
        const cc = ZoneTargeting.resolveCardContent(cardContent, fd);
        return AdjacentTargeting.acquireWithin(
            RollService.resolveOrZero(cc.minReach), RollService.resolveOrZero(cc.maxReach));
    }
}
