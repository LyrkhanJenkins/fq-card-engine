import CanvasUtils from "./canvas-utils.js";
import FqConstants, {WARNING_COLOR} from "./fq-constants.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";


export default class ConsumptionUtils {
    static checkResources(resources, actor) {
        if (!actor) {
            return true;
        }

        // COST HP
        if (resources?.hp) {
            if (actor.system?.attributes.hp.value + resources?.hp < 0) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughHp"), actor);
                return false;
            }
        }

        // COST ACTION
        if (resources?.action) {
            if (actor.system?.fq.action.value + resources?.action < 0) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughAction"), actor);
                return false;
            }
        }

        // COST MANA
        if (resources?.mana) {
            if (actor.system?.fq.mana.value + resources?.mana < 0) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughMana"), actor);
                return false;
            }
        }

        // COST ZEAL
        if (resources?.zeal) {
            if (actor.system?.fq.zeal.value + resources?.zeal < 0) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughZeal"), actor);
                return false;
            }
        }

        // COST DROP
        if (resources?.drop && FqConstants.isActorInCombat) {
            if (actor.system?.fq.cards.currentDrop + resources?.drop < 0) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDrop"), actor);
                return false;
            }
        }

        return true;
    }

    static consumeResources(resources, actor) {

        if (!actor) {
            return;
        }

        if (resources?.hp) {
            actor.update({
                "system.attributes.hp.value": (actor.system?.attributes.hp.value + resources.hp) > actor.system?.attributes.hp.max ? actor.system?.attributes.hp.max : actor.system?.attributes.hp.value + resources.hp
            });
        }
        if (resources?.action) {
            // L'action est la seule ressource qui peut monter au-dessus de son max
            actor.update({
                "system.fq.action.value": actor.system?.fq.action.value + resources.action
            });
        }
        if (resources?.mana) {
            actor.update({
                "system.fq.mana.value": (actor.system?.fq.mana.value + resources.mana) > actor.system?.fq.mana.max ? actor.system?.fq.mana.max : actor.system?.fq.mana.value + resources.mana
            });
        }
        if (resources?.zeal) {
            actor.update({
                "system.fq.zeal.value": (actor.system?.fq.zeal.value + resources.zeal) > actor.system?.fq.zeal.max ? actor.system?.fq.zeal.max : actor.system?.fq.zeal.value + resources.zeal
            });
        }
        if (resources?.drop) {
            // Ne peux pas descendre en dessous de 0
            // Utile dans le cas ou on est hors combat, on ne check pas
            let newDrop = actor.system?.fq.cards.currentDrop + resources.drop;
            newDrop = (newDrop > 0) ? newDrop : 0;
            actor.update({
                "system.fq.cards.currentDrop": newDrop
            });
        }
        if (resources?.xvalue === "fq.special.sacrificedSkeleton" || resources?.yvalue === "fq.special.sacrificedSkeleton") {
            actor.update({
                "system.fq.special.sacrificedSkeleton": 0
            });
        }
        if (resources?.xvalue === "fq.cards.currentDrop" || resources?.yvalue === "fq.cards.currentDrop") {
            actor.update({
                "system.fq.cards.currentDrop": 0
            });
        }
    }

    static createUserWarningMessage(message, actor) {
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor}),
            content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>${actor?.name} ${message}</span>`
        });
    }

    static checkIfCanCardCanReachTargets(actor, nbTargets, minReach, maxReach, targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        const targets = FqConstants.myTargets(targetType);

        if (targets.length === 0) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}), content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                    ${game.i18n.localize("FQCARDENGINE.WarningMsgNoTarget")}</span>`
            });
            return false;
        }

        if (!nbTargets && targets.length > 1) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}), content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                    ${game.i18n.localize("FQCARDENGINE.WarningMsgNoMultipleTarget")}</span>`
            });
            return false;
        }

        if (nbTargets && targets.length > nbTargets) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}), content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                    ${game.i18n.format("FQCARDENGINE.WarningMsgTooMuchTarget", {nbTargets})}</span>`
            });
            return false;
        }

        let result = true;
        const myToken = game.canvas?.scene?.tokens?.find(t => t.actorId === actor?.id);
        if (!myToken) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}), content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                    ${game.i18n.format("FQCARDENGINE.WarningNoTokenInCanvas", {nbTargets})}</span>`
            });
            return false;
        }
        targets.forEach(target => {
            const dist = CanvasUtils.getMinDistanceBetweenTwoToken(myToken.x, myToken.y, target.document.x, target.document.y, myToken.width, target.document.width, myToken.height, target.document.height);

            if (minReach > dist || maxReach < dist) {
                result = false;
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgCantReachTarget", {
                        targetName: target.name,
                        minReach,
                        maxReach,
                        dist
                    })}
                        </span>`
                });
            }

        });
        return result;
    }

    static determineNbTargets(target) {
        // TODO handle area targets
        const singleTargets = ["self", "enemy", "creature", "ally", "object", "creatureOrObject", "willing", "any", "space"];

        const areaTargets = ["cone", "cube", "cylinder", "line", "radius", "sphere", "square", "wall"];

        if (singleTargets.includes(target?.template?.type)) {
            return target?.value ?? 1;
        } else if (areaTargets.includes(target?.template?.type)) {
            return 99999;
        } else {
            return 1;
        }
    }

    /* TODO découper par objets métier et faire les validations par objet métier? (passage en typescript?) */
    static validateUseSpellInTurn(actor) {
        if (!game.combat || game.combat.combatant?.actor?.id !== actor?.id) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
            ${game.i18n.localize("FQCARDENGINE.WarningMsgPlayOutOfHisRound")}</span>`
            });
            return false;
        }
        return true;
    }

}
