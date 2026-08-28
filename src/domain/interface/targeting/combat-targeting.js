import Constants from "../../constants.js";
import RollService from "../../engine/roll/roll-service.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";
import Geometry from "../../engine/shared/geometry.js";
import ZoneTargeting from "./zone-targeting.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";

/**
 * Ciblage « Combat » (targetTypes « CombatEnemies »/« CombatAllies ») :
 * acquisition AUTOMATIQUE, sans aucune interaction, de tous les tokens
 * COMBATTANTS du combat actif situés dans l'anneau [minReach, maxReach]
 * (même géométrie que le moteur) autour du token du lanceur.
 * Le camp est déterminé par la disposition du token comparée à celle du
 * lanceur : disposition différente = ennemi, disposition identique = allié
 * (le lanceur lui-même est un allié comme un autre — un `minReach` de 0
 * l'inclut, un `minReach` ≥ 1 l'exclut par la distance). `maxReach` vide
 * vaut « illimité » : tout le combat est couvert. Les tokens couverts
 * deviennent les cibles de l'utilisateur (`retargetTo`), donc tout l'aval
 * du moteur est inchangé.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class CombatTargeting {
    /**
     * Statuts possibles de l'acquisition (objet gelé).
     */
    static ACQUISITION = Object.freeze({
        OK: "ok",
        NO_CASTER_TOKEN: "noCasterToken",
        NO_COMBAT: "noCombat",
    });

    /**
     * Acquiert comme cibles les tokens combattants de l'anneau [minReach, maxReach]
     * autour du lanceur, filtrés par camp, à partir de portées DÉJÀ résolues.
     * Le bonus de portée de l'acteur s'ajoute à maxReach (comme partout ailleurs) ;
     * les tokens sans acteur (décor) et les tokens hors combat sont ignorés.
     *
     * @param {string} targetType - Le type de ciblage (« CombatEnemies » ou « CombatAllies »).
     * @param {number} minReach   - La portée minimale résolue (falsy = 0).
     * @param {number} maxReach   - La portée maximale résolue (falsy = illimitée).
     *
     * @returns {{status: string, count: number}} Le statut (`ACQUISITION`) et le nombre de cibles acquises.
     */
    static acquireCombatants(targetType, minReach, maxReach) {
        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        if (!casterToken) {
            return {status: CombatTargeting.ACQUISITION.NO_CASTER_TOKEN, count: 0};
        }
        const combatantTokenIds = Constants.combatantTokenIds;
        if (!combatantTokenIds.length) {
            return {status: CombatTargeting.ACQUISITION.NO_COMBAT, count: 0};
        }
        const wantAllies = targetType === CardFqSystem.TARGET_TYPE_COMBAT_ALLIES;
        const min = minReach || 0;
        const max = (maxReach || Infinity) + Constants.rangeBonus;

        const covered = [...(game.canvas?.scene?.tokens ?? [])]
            .filter(token => token.actorId && combatantTokenIds.includes(token.id))
            .filter(token => wantAllies === TargetingPredicates.areAllies(token, casterToken))
            .filter(token => {
                const dist = Geometry.distanceBetweenTokens(casterToken, token);
                return dist >= min && dist <= max;
            });

        ZoneTargeting.retargetTo(covered);
        return {status: CombatTargeting.ACQUISITION.OK, count: covered.length};
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
        const resolve = (value) => (value ? RollService.rollResultSync(value) : 0);
        return CombatTargeting.acquireCombatants(cc.targetType, resolve(cc.minReach), resolve(cc.maxReach));
    }
}
