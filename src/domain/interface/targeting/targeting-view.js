import ZoneTargeting from "./zone-targeting.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import Constants from "../../constants.js";
import RollService from "../../engine/roll/roll-service.js";
import Geometry from "../../engine/shared/geometry.js";

/**
 * View-model d'affichage du ciblage pour la "dialog-play" .
 */
export default class TargetingView {
    /**
     * Construit l'état d'affichage du panneau de ciblage pour le choix sélectionné.
     *
     * @param {object} cardContent - Le choix de carte sélectionné.
     * @param {object} [fd={}]     - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {{manual: boolean, isZone: boolean|undefined, required: number, count: number, minReach: *, maxReach: *, targets: object[]}}
     *          Le view-model : ciblage manuel ?, ciblage par zone ?, nombre requis, nombre courant, portées résolues, et les cibles courantes.
     */
    static build(cardContent, fd = {}) {
        const isZone = cardContent?.targetType === CardFqSystem.TARGET_TYPE_ZONE;
        const isAdjacent = cardContent?.targetType === CardFqSystem.TARGET_TYPE_ADJACENT;
        const isCombat = CardFqSystem.isCombatTargetType(cardContent?.targetType);
        const manual = isZone || isAdjacent || isCombat
            || (cardContent?.targetType !== CardFqSystem.TARGET_TYPE_SKELETON
                && !!(cardContent?.minReach || cardContent?.maxReach));

        if (!manual) {
            return {manual: false, required: 0, count: 0, minReach: undefined, maxReach: undefined, targets: []};
        }

        const cc = ZoneTargeting.resolveCardContent(cardContent, fd);

        const required = (cc.nbTargets ? RollService.rollResultSync(cc.nbTargets) : cc.nbTargets) || 1;

        const tokens = Constants.myTargets(cardContent?.targetType);
        const {minReach, maxReach} = (cc.minReach || cc.maxReach)
            ? {
                minReach: RollService.rollResultSync(cc.minReach),
                maxReach: RollService.rollResultSync(cc.maxReach) + Constants.rangeBonus
            }
            : {minReach: cc.minReach, maxReach: cc.maxReach};

        // Pour une zone, la portée se contrôle à la pose (lanceur → origine de la
        // zone) : aucun marquage hors-portée par token, les tokens en bordure
        // d'une zone posée à portée restent des cibles valides.
        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        const outOfReachByToken = new Map();
        if (casterToken && !isZone && !isAdjacent && !isCombat) {
            for (const entry of TargetingPredicates.findOutOfReachTargets(casterToken, tokens, minReach, maxReach)) {
                outOfReachByToken.set(entry.target, entry.dist);
            }
        }

        // La distance est mesurée pour TOUTE cible, hors de portée ou non : le joueur
        // doit pouvoir juger d'un coup d'œil de ce qui le sépare de sa cible avant de
        // jouer la carte, et pas seulement constater qu'elle est trop loin.
        const targets = tokens.map(t => {
            const hpValue = t.actor?.system?.attributes?.hp?.value ?? 0;
            const hpMax = t.actor?.system?.attributes?.hp?.max ?? 1;
            const dist = casterToken ? Geometry.distanceBetweenTokens(casterToken, t) : null;
            return {
                name: t.name,
                img: t.document?.texture?.src,
                hpValue,
                hpMax,
                hpPct: Math.round((hpValue / hpMax) * 100),
                outOfReach: outOfReachByToken.has(t),
                dist,
                hasDist: dist !== null,
                distUnitKey: dist > 1
                    ? "FQCARDENGINE.TargetingPanelSquares"
                    : "FQCARDENGINE.TargetingPanelSquare",
            };
        });

        // Une zone touche tout ce qu'elle couvre : nbTargets ne limite pas, et
        // c'est la POSE de la zone (zonePlaced) qui conditionne le jeu de la carte.
        if (isZone) {
            return {manual, isZone, zonePlaced: ZoneTargeting.hasPlacement(), required: tokens.length, count: tokens.length, tooMuchTargets: false, minReach, maxReach, targets};
        }

        // « Adjacent » : cibles acquises automatiquement autour du lanceur —
        // rien à cibler à la main, nbTargets ne limite pas.
        if (isAdjacent) {
            return {manual, isAdjacent, required: tokens.length, count: tokens.length, tooMuchTargets: false, minReach, maxReach, targets};
        }

        // « Combat » : combattants acquis automatiquement (la portée filtre à
        // l'acquisition) — rien à cibler à la main, nbTargets ne limite pas.
        if (isCombat) {
            const combatLabelKey = cardContent?.targetType === CardFqSystem.TARGET_TYPE_COMBAT_ALLIES
                ? "FQCARDENGINE.TargetingPanelCombatAlliesLabel"
                : "FQCARDENGINE.TargetingPanelCombatEnemiesLabel";
            return {manual, isCombat, combatLabelKey, required: tokens.length, count: tokens.length, tooMuchTargets: false, minReach, maxReach, targets};
        }

        return {manual, required, count: tokens.length, tooMuchTargets: tokens.length > required, minReach, maxReach, targets};
    }
}
