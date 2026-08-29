import CardFqSystem from "./system/cards/card-fq-system.mjs";

export const CRITICAL_COLOR = "#C0392B";
export const CRITICAL_HEAL_COLOR = "#c39f43";
export const HEAL_COLOR = "#10911A";
export const DAMAGES_COLOR = "#F1C40F";
export const EVASION_COLOR = "#4B8AF1";
export const OTHER_ROLL_COLOR = "#34CBE3";
export const SUCCESS_COLOR = "green";
export const FAIL_COLOR = "red";
export const OriginFQEffectLabel = "FQ Effect";
export const DEFAULT_MAX_ZEAL = 8;

// Construit une apparence Dice So Nice « forcée » à partir d'une couleur de fond.
// On force volontairement `colorset: "custom"`, `system: "standard"` et
// `texture: "none"` pour que la couleur s'affiche de façon fiable quel que soit le
// préréglage du joueur (ex. « Spectral », qui sinon écraserait la couleur). Le
// compromis : les dés du module n'utilisent plus le modèle choisi par le joueur,
// mais leur couleur est garantie.
export function buildDiceAppearance(color) {
    return {
        colorset: "custom",
        system: "standard",
        texture: "none",
        background: color,
        edge: color,
        foreground: "#FFFFFF",
        outline: "#000000"
    };
}

// Apparences forcées pour les jets spécifiques : critique = rouge, esquive = bleu.
// Les autres dés du module utilisent la couleur du joueur (voir Damage.getPlayerDiceAppearance).
export const CRITICAL_DICE_APPEARANCE = buildDiceAppearance(CRITICAL_COLOR);
export const EVASION_DICE_APPEARANCE = buildDiceAppearance(EVASION_COLOR);

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
            const combatantIds = Constants.combatantTokenIds;
            return [...game.canvas?.scene?.tokens ?? []].map(t => t.object).filter(t => t?.name?.includes("Skeleton") && combatantIds.includes(t.id));
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
