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
     * Sélections de cibles figées à l'USAGE d'une activité, indexées par activité.
     *
     * La résolution des dégâts arrive bien après `activity.use()` : les handlers de
     * hook dnd5e asynchrones ne sont pas attendus par Foundry, et l'attente des
     * animations de dés élargit encore le délai. Relire la sélection de
     * l'utilisateur à cet instant, c'est lire ce qu'elle est devenue entre-temps —
     * en jeu, une momie a ainsi frappé une momie alliée, la sélection ayant été
     * rendue au MJ pendant que ses dés roulaient encore.
     *
     * La sélection voyage donc AVEC l'activité, mémorisée par `preUseActivity` (qui
     * est synchrone et précède tous les jets) et consommée à la résolution. Même
     * mécanisme, et pour la même raison, que le contexte d'attaque d'opportunité.
     *
     * `WeakMap` : une activité oubliée n'empêche pas sa collecte, aucune fuite
     * possible même si un usage est annulé avant tout jet.
     *
     * @type {WeakMap<object, object[]>}
     */
    static #targetsByActivity = new WeakMap();

    /**
     * Fige la sélection de cibles courante pour l'activité donnée.
     *
     * @param {object} activity - L'activité dnd5e dont l'usage vient d'être approuvé.
     *
     * @returns {void}
     */
    static rememberTargetsFor(activity) {
        if (!activity) {
            return;
        }
        TargetingPredicates.#targetsByActivity.set(activity, Constants.currentTargets);
    }

    /**
     * Rend la sélection figée pour l'activité donnée, et l'oublie aussitôt : une
     * sélection ne sert qu'une résolution.
     *
     * @param {object} activity - L'activité dnd5e en cours de résolution.
     *
     * @returns {?object[]} Les cibles figées, ou `null` si aucune ne l'a été.
     */
    static consumeTargetsFor(activity) {
        if (!activity || !TargetingPredicates.#targetsByActivity.has(activity)) {
            return null;
        }
        const targets = TargetingPredicates.#targetsByActivity.get(activity);
        TargetingPredicates.#targetsByActivity.delete(activity);
        return targets;
    }

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
     * Indique si un jeton porte un sbire VIVANT invoqué par `summonerId` — la
     * lecture unique des estampilles posées à l'invocation (`minionType`/
     * `summonerId`), partagée par le recensement des sbires d'un type et par le
     * bouton de sacrifice du HUD, qui n'en filtre aucun.
     *
     * @param {object} token        - Le jeton (ou son document) à juger.
     * @param {string} [summonerId] - L'id de l'invocateur (défaut : le personnage courant).
     *
     * @returns {boolean} True si le jeton porte un sbire vivant de cet invocateur.
     */
    static isLivingMinion(token, summonerId = Constants.myId) {
        const flags = token?.actor?.flags?.[FqCardEngineModule.moduleName];
        return !!summonerId
            && !!flags?.minionType
            && flags.summonerId === summonerId
            && (token.actor?.system?.attributes?.hp?.value ?? 0) > 0;
    }

    /**
     * Les tokens des sbires VIVANTS d'un type donné invoqués par un invocateur,
     * sur la scène active — le recensement que consomment le plafond
     * d'invocations et les cartes qui lisent leurs sbires.
     *
     * @param {string} type         - Le type de sbire (`beast`, `skeleton`…).
     * @param {string} [summonerId] - L'id de l'invocateur (défaut : le personnage courant).
     *
     * @returns {object[]} Les tokens des sbires vivants correspondants (vide si type ou invocateur manquant).
     */
    static livingMinionTokens(type, summonerId = Constants.myId) {
        return TargetingPredicates.#livingMinionsBy(type, summonerId, stamped => stamped);
    }

    /**
     * Les tokens des sbires VIVANTS d'une FAMILLE donnée invoqués par un
     * invocateur — le recensement des cartes de MASSE (« tous vos squelettes »)
     * et des comptages d'armée, là où {@link livingMinionTokens} s'en tient au
     * type exact (plafonds d'invocation, bonus de rituel).
     *
     * Tout l'écart entre les deux tient au Squelette Géant : type
     * `giantSkeleton`, famille `skeleton`. Il échappe au plafond de la piétaille
     * sans échapper aux sorts qui dopent l'armée entière.
     *
     * @param {string} family       - La famille de sbire (`beast`, `skeleton`…).
     * @param {string} [summonerId] - L'id de l'invocateur (défaut : le personnage courant).
     *
     * @returns {object[]} Les tokens des sbires vivants de cette famille (vide si famille ou invocateur manquant).
     */
    static livingMinionFamilyTokens(family, summonerId = Constants.myId) {
        return TargetingPredicates.#livingMinionsBy(family, summonerId, CardFqSystem.minionFamily);
    }

    /**
     * Le recensement commun aux deux lectures d'estampille : les sbires vivants
     * de l'invocateur dont le type, passé au crible de `asKey`, égale `key`.
     *
     * @param {string}   key                 - Le type ou la famille attendue.
     * @param {string}   summonerId          - L'id de l'invocateur.
     * @param {function(string): string} asKey - La projection du type estampillé (identité, ou famille).
     *
     * @returns {object[]} Les tokens correspondants (vide si clé ou invocateur manquant).
     */
    static #livingMinionsBy(key, summonerId, asKey) {
        if (!key || !summonerId) {
            return [];
        }
        const tokens = game.canvas?.scene?.tokens ?? game.scenes?.active?.tokens ?? [];
        return [...tokens].filter(token =>
            TargetingPredicates.isLivingMinion(token, summonerId)
            && asKey(token.actor.flags[FqCardEngineModule.moduleName].minionType) === key);
    }

    /**
     * Filtre des tokens candidats à ceux compris dans l'anneau [minReach, maxReach]
     * (en cases) autour du lanceur, bonus de portée de l'acteur inclus — la même
     * géométrie que le moteur. Partagé entre `AdjacentTargeting` et
     * `CombatTargeting`, qui ne diffèrent que par leur pré-filtre (tokens de la
     * scène vs. combattants d'un camp) et leur borne haute par défaut.
     *
     * @param {object}   casterToken     - Le document token du lanceur.
     * @param {object[]} candidates      - Les tokens déjà pré-filtrés à considérer.
     * @param {number}   minReach        - La portée minimale résolue (falsy = 0).
     * @param {number}   maxReach        - La portée maximale résolue (falsy = `fallbackMax`).
     * @param {number}   [fallbackMax=1] - La borne haute par défaut quand `maxReach` est vide.
     *
     * @returns {object[]} Les tokens candidats dans l'anneau de portée.
     */
    static tokensWithinRange(casterToken, candidates, minReach, maxReach, fallbackMax = 1) {
        const min = minReach || 0;
        const max = (maxReach || fallbackMax) + Constants.rangeBonus;
        return candidates.filter(token => {
            const dist = Geometry.distanceBetweenTokens(casterToken, token);
            return dist >= min && dist <= max;
        });
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

    /**
     * Les cibles réduites à ce qui se transmet : id de jeton et nom, jamais le jeton
     * lui-même. Forme attendue par le rapport de jet, qui doit rester sérialisable.
     *
     * Certains types de cible (les squelettes, par exemple) supposent un contexte de
     * scène complet : hors jeu, la résolution lève. On retombe alors sur une liste
     * vide plutôt que d'interrompre la résolution en cours, comme le fait déjà le
     * message de chat (`PlayCard.buildChoiceRenderData`).
     *
     * @param {object}  cardContent - Le contenu (choix) de la carte.
     * @param {object} [casterActor=Constants.actorCurrent] - L'acteur lanceur.
     *
     * @returns {{tokenId: string, name: string}[]} Les cibles désignées par id et nom.
     */
    static resolveTargetLabels(cardContent, casterActor = Constants.actorCurrent) {
        try {
            return TargetingPredicates.resolveTargets(cardContent, casterActor).map(target => ({
                tokenId: target.id,
                name: Constants.tokenName(target) ?? ""
            }));
        } catch {
            return [];
        }
    }
}
