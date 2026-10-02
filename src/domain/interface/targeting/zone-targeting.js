import Constants from "../../constants.js";
import ObjectUtils from "../../../core/utils/object.utils.js";
import CardEffect from "../../engine/shared/card-effect.js";
import RollService from "../../engine/roll/roll-service.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";
import Geometry from "../../engine/shared/geometry.js";

/**
 * Ciblage par zone (targetType « Zone ») : pose interactive d'une forme sur le
 * canvas via l'API Région de Foundry (`canvas.regions.placeRegion`), acquisition
 * des tokens couverts comme cibles utilisateur, puis suppression immédiate de la
 * région (elle ne sert qu'au ciblage — le visuel est porté par les FX).
 * Le contrôle de portée s'applique à la distance lanceur → point d'origine de la
 * zone, PAS à chaque token couvert : une zone posée à portée touche aussi les
 * tokens en bordure. Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ZoneTargeting {
    /**
     * Statuts possibles de la pose de zone (objet gelé).
     */
    static PLACEMENT = Object.freeze({
        OK: "ok",
        CANCELLED: "cancelled",
        OUT_OF_REACH: "outOfReach",
        NO_CASTER_TOKEN: "noCasterToken",
    });

    // Une zone a-t-elle été posée pour la dialog « Jouer la carte » courante ?
    // Poser la zone est LA condition de jeu d'une carte Zone (même posée sur du
    // vide) : le garde-fou de `playValidatedCard` lit cet état via `hasPlacement`.
    // Remis à zéro à la fermeture de la dialog et au changement de choix.
    static #zonePlaced = false;

    // Géométrie FX de la dernière zone posée (voir `buildPlacementFx`), snapshotée
    // dans le cardContent au moment du jeu — la dialog peut se fermer (et donc
    // `clearPlacement` tourner) avant que les FX ne jouent.
    static #placementFx = null;

    /**
     * Indique si une zone a été posée pour la dialog courante.
     *
     * @returns {boolean} True si la pose a abouti depuis la dernière remise à zéro.
     */
    static hasPlacement() {
        return ZoneTargeting.#zonePlaced;
    }

    /**
     * Retourne la géométrie FX de la zone posée pour la dialog courante.
     *
     * @returns {object|null} La géométrie (voir `buildPlacementFx`), ou null si aucune pose.
     */
    static getPlacement() {
        return ZoneTargeting.#placementFx;
    }

    /**
     * Oublie la zone posée (fermeture de la dialog, changement de choix).
     *
     * @returns {void}
     */
    static clearPlacement() {
        ZoneTargeting.#zonePlaced = false;
        ZoneTargeting.#placementFx = null;
    }

    /**
     * Normalise la première forme d'une région posée en géométrie prête pour les
     * FX : position d'ancrage en pixels, dimensions converties en cases, et point
     * d'arrivée précalculé pour les formes directionnelles (cône/ligne) — le
     * consommateur (Fx) n'a ainsi aucune trigonométrie à faire.
     * La rotation est interprétée en convention canvas (0° vers l'est, sens
     * horaire écran) ; pour un rectangle, l'ancrage est ramené à son centre.
     *
     * @param {object} shape - La donnée de forme (`RegionShapeData`) de la région posée.
     *
     * @returns {object|null} `{type, x, y, ...}` selon la forme (circle: `size` ;
     *          rectangle: `width`/`height`/`rotation` ; cone/line: `endX`/`endY`), ou null sans forme.
     */
    static buildPlacementFx(shape) {
        if (!shape) {
            return null;
        }
        const gridSize = game.canvas?.scene?.dimensions?.size || 100;
        const rad = ((shape.rotation ?? 0) * Math.PI) / 180;
        const origin = ZoneTargeting.squareOrigin(shape);

        if (shape.type === "cone" || shape.type === "line") {
            const dist = (shape.type === "cone" ? shape.radius : shape.length) ?? 0;
            return {
                type: shape.type,
                x: shape.x,
                y: shape.y,
                ...origin,
                endX: shape.x + dist * Math.cos(rad),
                endY: shape.y + dist * Math.sin(rad)
            };
        }
        if (shape.type === "rectangle") {
            return {
                type: "rectangle",
                x: shape.x + (shape.width ?? 0) / 2,
                y: shape.y + (shape.height ?? 0) / 2,
                ...origin,
                width: (shape.width ?? 0) / gridSize,
                height: (shape.height ?? 0) / gridSize,
                rotation: shape.rotation ?? 0
            };
        }
        return {
            type: "circle",
            x: shape.x,
            y: shape.y,
            ...origin,
            size: (2 * (shape.radius ?? 0)) / gridSize
        };
    }

    /**
     * Force l'aimantation de la zone à la grille pendant la pose.
     *
     * Foundry aimante par défaut mais laisse Maj débrayer (`snap = !event.shiftKey`).
     * Une zone posée hors grille produirait des cases couvertes ambiguës — et, pour
     * une invocation dans la zone, un sbire à cheval sur deux cases. On repose donc
     * la forme aimantée et on rend `false` pour neutraliser le déplacement par défaut.
     *
     * @param {object} args          - Les arguments du gestionnaire `onMove` de Foundry.
     * @param {object} args.shape    - La forme en cours de pose.
     * @param {object} args.position - La position visée (pixels, non aimantée).
     *
     * @returns {boolean} Toujours `false` : le déplacement par défaut est remplacé.
     */
    static snapToGrid({shape, position}) {
        shape.move(position, {snap: true});
        return false;
    }

    /**
     * Ramène le point d'ancrage d'une forme au coin supérieur-gauche de SA CASE.
     *
     * C'est la position qu'attend un token (dont les coordonnées sont celles du
     * coin de sa case), et l'unité dans laquelle la portée se mesure — d'où son
     * usage partagé par le contrôle de portée et par la géométrie transmise au
     * moteur (invocation dans la zone).
     *
     * @param {object} [shape] - La donnée de forme (`RegionShapeData`) posée.
     *
     * @returns {{originX: number, originY: number}} Le coin de la case d'ancrage, en pixels.
     */
    static squareOrigin(shape) {
        const gridSize = game.canvas?.scene?.dimensions?.size || 100;
        return {
            originX: Math.floor((shape?.x ?? 0) / gridSize) * gridSize,
            originY: Math.floor((shape?.y ?? 0) / gridSize) * gridSize
        };
    }

    /**
     * Construit la donnée de forme Région (pixels) depuis un choix de carte RÉSOLU.
     * `zoneSize` s'interprète selon la forme : rayon (cercle/cône), largeur
     * (rectangle) ou longueur (ligne) ; `zoneWidth` complète rectangle/ligne et
     * `zoneAngle` l'ouverture du cône. Les valeurs sont en cases, converties en
     * pixels via la taille de grille de la scène.
     *
     * @param {object} cardContent - Le choix de carte aux formules déjà résolues.
     *
     * @returns {object} La donnée de forme (`RegionShapeData`) à poser, origine (0,0).
     */
    static buildShapeData(cardContent) {
        const gridSize = game.canvas?.scene?.dimensions?.size ?? 0;
        const toPx = (value, fallback) => (RollService.resolveOrZero(value) || fallback) * gridSize;
        const shape = cardContent?.zoneShape || "circle";
        const sizePx = toPx(cardContent?.zoneSize, 1);

        if (shape === "cone") {
            return {type: "cone", x: 0, y: 0, radius: sizePx, angle: RollService.resolveOrZero(cardContent?.zoneAngle) || 90};
        }
        if (shape === "rectangle") {
            return {type: "rectangle", x: 0, y: 0, width: sizePx, height: toPx(cardContent?.zoneWidth, RollService.resolveOrZero(cardContent?.zoneSize) || 1)};
        }
        if (shape === "line") {
            return {type: "line", x: 0, y: 0, length: sizePx, width: toPx(cardContent?.zoneWidth, 1)};
        }
        return {type: "circle", x: 0, y: 0, radius: sizePx};
    }

    /**
     * Résout une copie du choix de carte pour la pose : bonus de caractéristiques
     * remplacés puis variables X/Y substituées — le miroir exact de la résolution
     * de `TargetingView.build`, pour que la zone posée corresponde à ce que le
     * panneau affiche.
     *
     * Un choix qui FIXE lui-même X/Y (`xvalue`/`yvalue`) ne les fait pas saisir au
     * dialogue : `fd` est alors vide, et les substituer par 0 poserait une zone plus
     * petite que celle que la carte appliquera — c'est le cône de la Volée de
     * Shuriken, qui grandit du bonus de portée. Ces valeurs sont donc CALCULÉES ici
     * comme au jeu ({@link CardEffect.substituteXAndYValue}), et non supposées nulles.
     *
     * @param {object} cardContent - Le choix de carte brut sélectionné.
     * @param {object} [fd={}]     - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {object} Une copie résolue du choix.
     */
    static resolveCardContent(cardContent, fd = {}) {
        const cc = ObjectUtils.deepCopy(cardContent);
        CardEffect.replaceCardContentAbilitiesBonus(cc);
        if (fd?.XXX === undefined && fd?.YYY === undefined && (cc.xvalue || cc.yvalue)) {
            CardEffect.substituteXAndYValue(cc, false, 0, 0);
        } else {
            CardEffect.recalculatedWithWYValue(cc, fd?.XXX ?? 0, fd?.YYY ?? 0);
        }
        return cc;
    }

    /**
     * Pose interactivement la zone sur le canvas puis acquiert les cibles :
     * les tokens couverts par la région deviennent les cibles de l'utilisateur
     * (`updateTokenTargets`, qui déclenche le hook `targetToken` et donc le
     * rafraîchissement du panneau), et la région est supprimée aussitôt.
     *
     * @param {object} cardContent - Le choix de carte brut sélectionné.
     * @param {object} [fd={}]     - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {Promise<{status: string, count: number}>} Le statut (`PLACEMENT`) et le nombre de cibles acquises.
     */
    static async placeZoneAndAcquireTargets(cardContent, fd = {}) {
        const cc = ZoneTargeting.resolveCardContent(cardContent, fd);

        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        if (!casterToken) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene"));
            return {status: ZoneTargeting.PLACEMENT.NO_CASTER_TOKEN, count: 0};
        }

        if (!game.canvas?.regions?.placeRegion) {
            return {status: ZoneTargeting.PLACEMENT.CANCELLED, count: 0};
        }
        const shape = ZoneTargeting.buildShapeData(cc);
        const region = await game.canvas.regions.placeRegion(
            {name: game.i18n.localize(cc.name || "FQCARDENGINE.TargetingPanelTitle"), shapes: [shape], color: game.user?.color},
            {create: true, onMove: ZoneTargeting.snapToGrid}
        );
        if (!region) {
            return {status: ZoneTargeting.PLACEMENT.CANCELLED, count: 0};
        }

        try {
            const reach = ZoneTargeting.checkZoneReach(cc, casterToken, region);
            if (reach) {
                ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningMsgZoneOutOfReach", reach));
                return {status: ZoneTargeting.PLACEMENT.OUT_OF_REACH, count: 0};
            }
            const covered = ZoneTargeting.tokensCoveredByRegion(region);
            ZoneTargeting.retargetTo(covered);
            ZoneTargeting.#zonePlaced = true;
            ZoneTargeting.#placementFx = ZoneTargeting.buildPlacementFx(region.shapes?.[0]);
            return {status: ZoneTargeting.PLACEMENT.OK, count: covered.length};
        } finally {
            await region.delete().catch(e => console.warn("fq-card-engine | Suppression de la région de ciblage impossible", e));
        }
    }

    /**
     * Retourne les documents token de la scène couverts par la région posée : un
     * token est couvert si le CENTRE d'au moins une de ses cases est dans la région
     * (`RegionDocument#testPoint`, synchrone). NE PAS lire `region.tokens` ici :
     * ce set est peuplé de façon asynchrone par le client et reste vide juste
     * après la pose (il ne sert que de repli si `testPoint` est indisponible).
     *
     * @param {object} region - La région posée.
     *
     * @returns {object[]} Les documents token couverts.
     */
    static tokensCoveredByRegion(region) {
        if (typeof region?.testPoint !== "function") {
            return [...(region?.tokens ?? [])];
        }
        const half = (game.canvas?.scene?.dimensions?.size ?? 0) / 2;
        return [...(game.canvas?.scene?.tokens ?? [])].filter(token =>
            Geometry.getAllSquaresOccupiedByToken(token.x, token.y, token.width, token.height)
                .some(corner => region.testPoint({x: corner.x + half, y: corner.y + half, elevation: token.elevation ?? 0})));
    }

    /**
     * Redéfinit les cibles de l'utilisateur courant : relâche les cibles actuelles
     * puis cible chaque token couvert via `Token#setTarget` — l'API publique de
     * ciblage (chaque appel déclenche le hook `targetToken`, donc le panneau de la
     * dialog se rafraîchit au fil de l'eau).
     *
     * @param {object[]} tokenDocuments - Les documents token à cibler.
     *
     * @returns {void}
     */
    static retargetTo(tokenDocuments) {
        ZoneTargeting.releaseTargets();
        tokenDocuments.forEach(td => (td.object ?? td).setTarget?.(true, {releaseOthers: false}));
    }

    /**
     * Relâche toutes les cibles de l'utilisateur courant.
     *
     * Le point d'écriture unique du « déciblage », partagé par la ré-acquisition
     * de zone et par le dialogue de jeu, qui repart d'une ardoise vierge à chaque
     * entrée en ciblage — sans quoi les cibles d'une carte précédente resteraient
     * comptées pour la suivante.
     *
     * @returns {void}
     */
    static releaseTargets() {
        Constants.currentTargets.forEach(t => (t.object ?? t).setTarget?.(false, {releaseOthers: false}));
    }

    /**
     * Vérifie la portée de la zone posée : distance (en cases) entre le lanceur et
     * la case d'origine de la première forme de la région, comparée aux portées
     * résolues du choix (mêmes formules que `TargetingView.build`, bonus de portée
     * inclus). Sans portée déclarée, aucune contrainte.
     *
     * @param {object} cardContent - Le choix de carte résolu.
     * @param {object} casterToken - Le document token du lanceur.
     * @param {object} region      - La région posée (sa première forme porte l'origine).
     *
     * @returns {{minReach: number, maxReach: number, dist: number}|null}
     *          Le détail hors-portée (pour le message formaté), ou null si la zone est à portée.
     */
    static checkZoneReach(cardContent, casterToken, region) {
        if (!cardContent?.minReach && !cardContent?.maxReach) {
            return null;
        }
        const minReach = RollService.resolveOrZero(cardContent.minReach);
        const maxReach = RollService.resolveOrZero(cardContent.maxReach) + Constants.rangeBonus;

        // Origine ramenée au coin de sa case pour mesurer en cases entières,
        // comme la géométrie token → token.
        const {originX, originY} = ZoneTargeting.squareOrigin(region.shapes?.[0]);
        const dist = Geometry.getMinDistanceBetweenTwoToken(
            casterToken.x, casterToken.y, originX, originY,
            casterToken.width, 1, casterToken.height, 1);

        return (minReach > dist || maxReach < dist) ? {minReach, maxReach, dist} : null;
    }
}
