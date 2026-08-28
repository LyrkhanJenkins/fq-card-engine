import Geometry from "./geometry.js";
import Constants from "../../constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";

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
     * Deux tokens sont-ils du même camp ?
     *
     * Modèle de camp du moteur, jusqu'ici implicite dans le ciblage « Combat » :
     * disposition identique = allié, disposition différente = ennemi. Les
     * dispositions Foundry décrivent le rapport au camp des joueurs et non une
     * relation entre deux tokens ; ce prédicat en fait une relation, et il est la
     * source de vérité unique de la notion de camp — ciblage des cartes comme
     * attaque d'opportunité.
     *
     * Deux tokens sans disposition exploitable sont considérés alliés : la
     * conséquence est l'absence d'effet hostile, pas un effet hostile de trop.
     *
     * @param {object} a - Le premier TokenDocument.
     * @param {object} b - Le second TokenDocument.
     *
     * @returns {boolean} `true` si les deux tokens sont du même camp.
     */
    static areAllies(a, b) {
        return a?.disposition === b?.disposition;
    }

    /**
     * Deux tokens appartiennent-ils à des camps opposés ? Strict complément de
     * {@link TargetingPredicates.areAllies}.
     *
     * @param {object} a - Le premier TokenDocument.
     * @param {object} b - Le second TokenDocument.
     *
     * @returns {boolean} `true` si les deux tokens sont dans des camps opposés.
     */
    static areEnemies(a, b) {
        return !TargetingPredicates.areAllies(a, b);
    }

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
            const dist = Geometry.distanceBetweenTokens(casterToken, target);
            if (minReach > dist || maxReach < dist) {
                outOfReach.push({target, dist});
            }
        });
        return outOfReach;
    }

    /**
     * Indique si la carte vise autrui plutôt que son lanceur : vrai si elle a une portée
     * (`minReach`/`maxReach`), cible des squelettes, une zone, les tokens adjacents ou
     * des combattants. Sans portée, le sort est considéré comme se ciblant lui-même.
     * Source de vérité unique du ciblage (effets, dégâts/soins, message de chat, log).
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si la carte vise la/les cible(s), false si elle vise le lanceur.
     */
    static cardTargetsOthers(cardContent) {
        return Boolean(cardContent?.minReach || cardContent?.maxReach ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_SKELETON ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_ZONE ||
            cardContent?.targetType === CardFqSystem.TARGET_TYPE_ADJACENT ||
            CardFqSystem.isCombatTargetType(cardContent?.targetType));
    }

    /**
     * Résout les tokens réellement affectés par un contenu de carte : les cibles
     * désignées sur la scène si la carte vise autrui, sinon le token du lanceur
     * lui-même (un sort sans portée s'applique à son lanceur, quelles que soient
     * les cibles que le joueur a sélectionnées sur la scène).
     *
     * `cardContent.forcedTargets` court-circuite toute la résolution : les cibles
     * sont imposées par l'appelant au lieu d'être lues dans la sélection de
     * l'utilisateur. Nécessaire pour les effets que le MOTEUR déclenche et dont la
     * cible n'a rien à voir avec ce que l'utilisateur a sélectionné — l'attaque
     * d'opportunité, dont la cible est désignée par la détection. Passer par la
     * sélection y serait de toute façon impossible : les handlers de hook dnd5e
     * asynchrones ne sont pas attendus par Foundry, donc la sélection peut changer
     * avant que la résolution n'y arrive.
     *
     * @param {object} cardContent  - Le contenu (choix) de la carte.
     * @param {object} [casterActor=Constants.actorCurrent] - L'acteur lanceur.
     *
     * @returns {object[]} Les tokens affectés (vide si le lanceur n'est pas sur la scène).
     */
    static resolveTargets(cardContent, casterActor = Constants.actorCurrent) {
        if (Array.isArray(cardContent?.forcedTargets)) {
            return cardContent.forcedTargets;
        }
        if (TargetingPredicates.cardTargetsOthers(cardContent)) {
            return Constants.myTargets(cardContent?.targetType);
        }
        // `Constants.myTargets` rend des placeables : on aligne la forme du token du
        // lanceur (document de scène) pour que les appelants n'aient qu'un seul cas.
        const casterToken = Constants.actorToken(casterActor?.id)?.object;
        return casterToken ? [casterToken] : [];
    }

    /**
     * Les ids d'acteur réellement affectés par un contenu de carte — forme attendue
     * par le log de combat, cohérente avec {@link TargetingPredicates.resolveTargets}.
     *
     * @param {object} cardContent  - Le contenu (choix) de la carte.
     * @param {object} [casterActor=Constants.actorCurrent] - L'acteur lanceur.
     *
     * @returns {string[]} Les ids d'acteur affectés.
     */
    static resolveTargetActorIds(cardContent, casterActor = Constants.actorCurrent) {
        return TargetingPredicates.resolveTargets(cardContent, casterActor)
            .map(t => Constants.tokenActorId(t)).filter(Boolean);
    }
}
