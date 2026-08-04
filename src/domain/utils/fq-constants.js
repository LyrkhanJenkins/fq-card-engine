import CardFqSystem from "../system/cards/card-fq-system.mjs";

export const CRITICAL_COLOR = "#C0392B";
export const CRITICAL_HEAL_COLOR = "#D9F356";
export const HEAL_COLOR = "#10911A";
export const DAMAGES_COLOR = "#F1C40F";
export const EVASION_COLOR = "#4B8AF1";
export const OTHER_ROLL_COLOR = "#34CBE3";
export const WARNING_COLOR = "#E36934";
export const ERROR_COLOR = "#C04200";
export const SUCCESS_COLOR = "green";
export const FAIL_COLOR = "red";
export const OriginFQEffectLabel = "FQ Effect";
export const DEFAULT_MAX_ZEAL = 8;

// TODO Rendre ces constantes utilisables de partout
/**
 * Regroupe des constantes de couleurs/labels et des accesseurs pratiques vers
 * le personnage de l'utilisateur courant, ses cibles et l'état de combat.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class FqConstants {

    /**
     * Accès rapide aux attributs (hp, etc.) du personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le bloc `system.attributes`, ou undefined si aucun personnage.
     */
    static get actorAttr() {
        return game.user.character?.system?.attributes;
    }

    /**
     * Accès rapide aux caractéristiques (abilities) du personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le bloc `system.abilities`, ou undefined si aucun personnage.
     */
    static get actorAbi() {
        return game.user.character?.system?.abilities;
    }

    /**
     * Accès rapide aux données FQ (action, mana, zeal, cards…) du personnage courant.
     *
     * @returns {object|undefined} Le bloc `system.fq`, ou undefined si aucun personnage.
     */
    static get actorFQ() {
        return game.user.character?.system?.fq;
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
     * Pour le type « squelette », renvoie tous les squelettes en combat de la scène active ;
     * sinon renvoie les cibles actuellement sélectionnées par l'utilisateur.
     *
     * @param {string} [targetType=CardFqSystem.TARGET_TYPE_DEFAULT] - Le type de ciblage FQ.
     *
     * @returns {object[]} La liste des tokens ciblés.
     */
    static myTargets(targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        if (targetType === CardFqSystem.TARGET_TYPE_SKELETON) {
            // Récupère tous les squelettes de la scene active qui sont en combat
            return [...game.canvas?.scene?.tokens ?? []].map(t => t.object).filter(t => t.name.includes("Skeleton") && [...game.combat?.combatants ?? []].map(c => c.tokenId).includes(t.id));
        }
        return [...game.user.targets];
    }

    /**
     * L'id du personnage de l'utilisateur courant.
     *
     * @returns {string|undefined} L'id de l'acteur, ou undefined si aucun personnage.
     */
    static get myId() {
        return game.user.character?.id;
    }

    /**
     * Le token de la scène active correspondant au personnage de l'utilisateur courant.
     *
     * @returns {object|undefined} Le document token, ou undefined si absent.
     */
    static get myToken() {
        return game.canvas?.scene?.tokens?.find(t => t.actorId === FqConstants.myId);
    }

    /**
     * Indique si le personnage de l'utilisateur courant participe au combat actif.
     *
     * @returns {boolean} True si l'acteur est un combattant du combat en cours.
     */
    static get isActorInCombat() {
        return !!game.combat?.combatants?.some(c => c.actorId === game.user.character?.id);
    }
}
