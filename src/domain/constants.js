import CardFqSystem from "./system/cards/card-fq-system.mjs";
import TargetingPredicates from "./engine/shared/targeting-predicates.js";

export const SUCCESS_COLOR = "green";
export const FAIL_COLOR = "red";
export const OriginFQEffectLabel = "FQ Effect";

/**
 * Clé du drapeau de module posé sur une carte réactive PRÉPARÉE (armée à son
 * propre tour, jouée seule dès que ses conditions sont réunies). Sa valeur porte
 * l'instantané du formulaire de jeu — voir `PreparedCard`.
 * @type {string}
 */
export const PREPARED_FLAG = "prepared";

/**
 * L'instantané de préparation posé sur une carte, ou undefined.
 *
 * Unique LECTURE du drapeau dans le module : elle vit ici, avec la clé, et non
 * dans `PreparedCard` — les modules qui font SORTIR une carte de la main
 * (`PlayCard`, `DiscardCost`) doivent la faire sans pouvoir importer
 * `PreparedCard`, qui dépend déjà d'eux.
 *
 * @param {Card} [card] - La carte inspectée.
 *
 * @returns {object|undefined} L'instantané `{fd, toId}` de la préparation.
 */
export function preparationOf(card) {
    return card?.flags?.[globalThis.FqCardEngineModule?.moduleName]?.[PREPARED_FLAG] ?? undefined;
}

/**
 * Le fragment de mise à jour qui DÉSARME une carte, à joindre au transfert qui
 * la sort de la main.
 *
 * Une préparation vaut pour une carte EN MAIN : sans cet effacement, une carte
 * armée puis sortie reviendrait armée de la défausse au premier rappel — un
 * armement jamais payé. La règle est la même quelle que soit la porte de sortie
 * (jeu d'une autre carte, défausse du MJ, paiement d'un coût en défausse),
 * d'où un seul fragment pour toutes. Il ne dépend d'aucune carte : c'est à
 * l'appelant de ne le joindre qu'aux cartes que {@link preparationOf} désigne.
 *
 * @returns {object} Le fragment `{flags: {...}}` à joindre à `updateData`.
 */
export function disarmUpdateData() {
    return {flags: {[globalThis.FqCardEngineModule?.moduleName]: {[PREPARED_FLAG]: null}}};
}

/**
 * Couleur des messages de statut d'une carte préparée — le bleu de son halo dans
 * la main, pour que le chat et la main parlent la même langue.
 * @type {string}
 */
export const PREPARED_COLOR = "#5AAAE6";
export const DEFAULT_MAX_ZEAL = 8;

/**
 * Niveau maximal atteignable par une classe FQ. La progression d'une classe est
 * refusée au-delà : au-dessus de ce plafond, un personnage ne monte plus qu'en
 * prenant une autre classe.
 * @type {number}
 */
export const MAX_CLASS_LEVEL = 12;

/**
 * Regroupe des constantes de couleurs/labels et des accesseurs pratiques vers
 * le personnage de l'utilisateur courant, ses cibles et l'état de combat.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Constants {

    /**
     * Accès rapide aux attributs (hp, etc.) du personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le bloc `system.attributes`, ou undefined si aucun personnage.
     */
    static get actorAttr() {
        return Constants.actorCurrent?.system?.attributes;
    }

    /**
     * Accès rapide aux caractéristiques (abilities) du personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le bloc `system.abilities`, ou undefined si aucun personnage.
     */
    static get actorAbi() {
        return Constants.actorCurrent?.system?.abilities;
    }

    /**
     * Accès rapide aux données FQ (action, mana, zeal, cards…) du personnage courant.
     *
     * @returns {object|undefined} Le bloc `system.fq`, ou undefined si aucun personnage.
     */
    static get actorFQ() {
        return Constants.actorCurrent?.system?.fq;
    }

    /**
     * Accès au personnage de l'utilisateur courant, source d'acteur commune à la
     * résolution des jetons d'arme (@wpnM/@wpnR) à l'affichage, cohérente avec les
     * autres accesseurs statiques (actorAttr, actorAbi, actorFQ).
     *
     * @returns {object|undefined} Le personnage de l'utilisateur courant, ou undefined si aucun.
     */
    static get actorCurrent() {
        return game.user?.character;
    }

    /**
     * Indique si les droits de l'utilisateur courant sont limités au strict
     * minimum pour les cartes : uniquement pour un joueur (jamais le MJ) et
     * seulement quand le réglage « Limitation des droits du joueur » est actif.
     *
     * @returns {boolean} True si l'utilisateur est un joueur aux droits limités.
     */
    static get isPlayerRightsLimited() {
        return !game.user?.isGM && CONFIG.FqCardEngine.options.playerLimitCardsRight === true;
    }

    /**
     * Détermine si un document est une classe FQ (source « FQ » et type « class »).
     *
     * @param {object} document - Le document Foundry à tester.
     *
     * @returns {boolean} True si le document est une classe FQ, false sinon.
     */
    static isFQClasses(document) {
        return document?.system?.source?.label === "FQ" && document.type === "class";
    }

    /**
     * Retourne le dernier montant de dégâts FQ subi par la cible durant le round courant.
     * Parcourt les logs de combat stockés dans les flags du combat actif.
     *
     * @param {object} [target] - La cible (token) ; à défaut, le personnage de l'utilisateur courant.
     *
     * @returns {number} Le dernier montant de dégâts FQ du round, ou 0 si aucun.
     */
    static lastDamageThisTurn(target) {
        let actor = target?.actor ?? game.user.character;
        const resultArray = game.combat.flags.fq?.logs.filter(l => l.targetsId.includes(actor?.id)
            && l.round === game.combat.round)?.at(-1)?.resultArray;
        if (!resultArray || !Object.values(resultArray)?.length) {
            return 0;
        }
        return Object.values(resultArray).filter(r => r.type === "damageFQ")?.at(-1)?.value;
    }

    /**
     * Indique si la dernière source de dégâts FQ infligée par la cible durant le
     * round courant était un coup critique.
     *
     * @param {object} [target] - La cible (token) ; à défaut, le personnage de l'utilisateur courant.
     *
     * @returns {boolean} True si le dernier coup FQ du round était critique, false sinon.
     */
    static lastCriticalThisTurn(target) {
        let actor = target?.actor ?? game.user.character;
        const resultArray = game.combat.flags.fq?.logs.filter(l => l.actorId === actor?.id
            && l.round === game.combat.round)?.at(-1)?.resultArray;
        if (!resultArray || !Object.values(resultArray)?.length) {
            return false;
        }
        return Object.values(resultArray).filter(r => r.type === "damageFQ")?.at(-1)?.critical;
    }

    /**
     * Retourne la liste des classes FQ portées par le personnage d'un utilisateur.
     *
     * @param {object} user - L'utilisateur Foundry dont on inspecte le personnage.
     *
     * @returns {object[]} Les items de classe FQ du personnage (tableau vide si aucun).
     */
    static userFQClasses(user) {
        return Object.values(user?.character?.classes).filter(c => this.isFQClasses(c));
    }

    /**
     * Retourne les cibles courantes selon le type de ciblage demandé.
     * Pour le type « squelette », renvoie tous les squelettes VIVANTS que le
     * personnage courant a invoqués ; sinon renvoie les cibles actuellement
     * sélectionnées par l'utilisateur.
     *
     * Le recensement passe par la FAMILLE estampillée à l'invocation, et non par
     * le nom du jeton : le Squelette Géant, de type `giantSkeleton`, est de
     * famille `skeleton` et entre donc dans « tous vos squelettes » — sans que
     * cela tienne au mot « Skeleton » dans son nom, et sans qu'un jeton renommé
     * ou l'armée d'une autre sorcière puisse s'y glisser.
     *
     * @param {string} [targetType=CardFqSystem.TARGET_TYPE_DEFAULT] - Le type de ciblage FQ.
     *
     * @returns {object[]} La liste des tokens ciblés.
     */
    static myTargets(targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        if (targetType === CardFqSystem.TARGET_TYPE_SKELETON) {
            return TargetingPredicates
                .livingMinionFamilyTokens(CardFqSystem.MINION_TYPE_SKELETON)
                .map(token => token.object ?? token);
        }
        return Constants.currentTargets;
    }

    /**
     * Les tokens actuellement ciblés par l'utilisateur courant — l'accès unique
     * partagé par le moteur et les prédicats de condition.
     *
     * @returns {object[]} Les tokens ciblés (tableau vide si aucun).
     */
    static get currentTargets() {
        return [...(game.user?.targets ?? [])];
    }

    /**
     * Le bonus de portée du personnage courant — LA règle métier « le bonus de
     * portée s'ajoute à la portée maximale », partagée par tous les ciblages.
     *
     * @returns {number} Le bonus de portée (0 si absent).
     */
    static get rangeBonus() {
        return Number(Constants.actorFQ.bonus.range);
    }

    /**
     * Les ids de token des combattants du combat courant.
     *
     * @returns {string[]} Les ids de token (tableau vide hors combat).
     */
    static get combatantTokenIds() {
        return [...(game.combat?.combatants ?? [])].map(c => c.tokenId);
    }

    /**
     * L'id d'acteur porté par un token, qu'il soit donné sous forme de placeable
     * ou de document.
     *
     * @param {object} [token] - Le token (placeable ou document).
     *
     * @returns {string|undefined} L'id de l'acteur, ou undefined.
     */
    static tokenActorId(token) {
        return token?.actor?.id ?? token?.document?.actorId ?? token?.actorId;
    }

    /**
     * Le nom affichable d'un token, qu'il soit donné sous forme de placeable
     * (dont le nom vit sur le document) ou de document.
     *
     * @param {object} [token] - Le token (placeable ou document).
     *
     * @returns {string|undefined} Le nom du token, ou undefined.
     */
    static tokenName(token) {
        return token?.document?.name ?? token?.name;
    }

    /**
     * L'id du personnage de l'utilisateur courant.
     *
     * @returns {string|undefined} L'id de l'acteur, ou undefined si aucun personnage.
     */
    static get myId() {
        return Constants.actorCurrent?.id;
    }

    /**
     * Retourne le token de la scène active porté par un acteur — la recherche
     * unique partagée par le moteur, les prédicats de ciblage et de condition.
     *
     * @param {string} [actorId] - L'id de l'acteur recherché.
     *
     * @returns {object|undefined} Le document token, ou undefined si absent.
     */
    static actorToken(actorId) {
        return game.canvas?.scene?.tokens?.find(t => t.actorId === actorId);
    }

    /**
     * Le token de la scène active correspondant au personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le document token, ou undefined si absent.
     */
    static get myToken() {
        return Constants.actorToken(Constants.myId);
    }

    /**
     * Indique si le personnage de l'utilisateur courant participe au combat actif.
     *
     * @returns {boolean} True si l'acteur est un combattant du combat en cours.
     */
    static get isActorInCombat() {
        return !!game.combat?.combatants?.some(c => c.actorId === Constants.myId);
    }
}
