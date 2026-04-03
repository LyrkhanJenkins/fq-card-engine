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
export default class FqConstants {

    static get actorAttr() {
        return game.user.character?.system?.attributes;
    }

    static get actorAbi() {
        return game.user.character?.system?.abilities;
    }

    static get actorFQ() {
        return game.user.character?.system?.fq;
    }

    static isFQClasses(document) {
        return document?.system?.source?.label === "FQ" && document.type === "class";
    }

    static lastDamageThisTurn(target) {
        let actor = target?.actor ?? game.user.character;
        const resultArray = game.combat.flags.fq?.logs.filter(l => l.targetsId.includes(actor?.id)
            && l.round === game.combat.round)?.at(-1)?.resultArray;
        if (!resultArray || !Object.values(resultArray)?.length) {
            return 0;
        }
        return Object.values(resultArray).filter(r => r.type === "damageFQ")?.at(-1)?.value;
    }

    static lastCriticalThisTurn(target) {
        let actor = target?.actor ?? game.user.character;
        const resultArray = game.combat.flags.fq?.logs.filter(l => l.actorId === actor?.id
            && l.round === game.combat.round)?.at(-1)?.resultArray;
        if (!resultArray || !Object.values(resultArray)?.length) {
            return false;
        }
        return Object.values(resultArray).filter(r => r.type === "damageFQ")?.at(-1)?.critical;
    }

    static userFQClasses(user) {
        return Object.values(user?.character?.classes).filter(c => this.isFQClasses(c));
    }

    static myTargets(targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        if (targetType === CardFqSystem.TARGET_TYPE_SKELETON) {
            // Récupère tous les squelettes de la scene active qui sont en combat
            return [...game.canvas?.scene?.tokens ?? []].map(t => t.object).filter(t => t.name.includes("Skeleton") && [...game.combat?.combatants ?? []].map(c => c.tokenId).includes(t.id));
        }
        return [...game.user.targets];
    }

    static get myId() {
        return game.user.character?.id;
    }

    static get myToken() {
        return game.canvas?.scene?.tokens?.find(t => t.actorId === FqConstants.myId);
    }

    static get isActorInCombat() {
        return !!game.combat?.combatants?.some(c => c.actorId === game.user.character?.id);
    }
}
