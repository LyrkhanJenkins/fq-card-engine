import TargetingResolver from "../../engine/shared/targeting-resolver.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import Constants from "../../constants.js";

/**
 * View-model d'affichage du ciblage pour la dialog « Jouer la carte ». Fonction
 * PURE (aucune manipulation DOM) : réutilise strictement la logique de ciblage
 * figée en Phase 8 (`TargetingResolver` + `TargetingPredicates` + `Constants.myTargets`)
 * afin de garantir « ce qu'on voit = ce qui bloque ». C'est le seul cœur testable
 * de la Phase 9 ; le rendu du panneau et son interactivité sont du DOM Foundry.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TargetingView {
    /**
     * Construit l'état d'affichage du panneau de ciblage pour le choix sélectionné.
     *
     * @param {object} cardContent - Le choix de carte sélectionné.
     * @param {object} [fd={}]     - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {{manual: boolean, required: number, count: number, minReach: *, maxReach: *, targets: object[]}}
     *          Le view-model : ciblage manuel ?, nombre requis, nombre courant, portées résolues, et les cibles courantes.
     */
    static build(cardContent, fd = {}) {
        // `manual` = gating IDENTIQUE au garde-fou Phase 8 (card-actions.js) : ciblage
        // manuel (targetType ≠ Skeletons, donc Default/absent) ET portée déclarée.
        const manual = cardContent?.targetType !== CardFqSystem.TARGET_TYPE_SKELETON
            && !!(cardContent?.minReach || cardContent?.maxReach);

        // Court-circuit : quand le ciblage n'est pas manuel, le panneau ne s'affiche
        // pas (le partial est gaté par `manual`). On évite ainsi tout calcul inutile —
        // en particulier `myTargets("Skeletons")`, qui résout les squelettes de la scène.
        if (!manual) {
            return {manual: false, required: 0, count: 0, minReach: undefined, maxReach: undefined, targets: []};
        }

        const resolvedNb = TargetingResolver.resolveNbTargets(cardContent, fd);
        const required = resolvedNb || 1;

        const tokens = Constants.myTargets(cardContent?.targetType);
        const {minReach, maxReach} = TargetingResolver.resolveReach(cardContent, fd);

        // État hors-portée : uniquement si le token du lanceur existe sur la scène.
        // Sinon, le garde-fou Phase 8 bloque déjà le jeu via NoTokenOnScene — le
        // panneau n'a pas à ré-implémenter ce verdict (dist laissée à null).
        const casterToken = TargetingPredicates.findCasterToken(game.user.character);
        const outOfReachByToken = new Map();
        if (casterToken) {
            for (const entry of TargetingPredicates.findOutOfReachTargets(casterToken, tokens, minReach, maxReach)) {
                outOfReachByToken.set(entry.target, entry.dist);
            }
        }

        const targets = tokens.map(t => {
            const hpValue = t.actor?.system?.attributes?.hp?.value ?? 0;
            const hpMax = t.actor?.system?.attributes?.hp?.max ?? 1;
            return {
                name: t.name,
                img: t.document?.texture?.src,
                hpValue,
                hpMax,
                hpPct: Math.round((hpValue / hpMax) * 100),
                outOfReach: outOfReachByToken.has(t),
                dist: outOfReachByToken.get(t) ?? null,
            };
        });

        return {manual, required, count: tokens.length, tooMuchTargets: tokens.length > required, minReach, maxReach, targets};
    }
}
