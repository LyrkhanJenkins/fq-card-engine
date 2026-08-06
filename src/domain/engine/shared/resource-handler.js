import Geometry from "./geometry.js";
import Constants, {WARNING_COLOR} from "../../constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";


/**
 * Utilitaires de gestion des ressources et des contraintes de jeu d'une carte :
 * vérification et consommation des coûts (hp, action, mana, zeal, défausse),
 * contrôle du nombre de cibles et de la portée, et validation du tour de jeu.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ResourceHandler {
    /**
     * Vérifie que l'acteur dispose de suffisamment de ressources pour payer les
     * coûts indiqués (hp, action, mana, zeal, défausse). Affiche un message
     * d'avertissement pour la première ressource insuffisante.
     *
     * @param {object} resources         - Les coûts à payer (valeurs négatives).
     * @param {number} [resources.hp]     - Coût en points de vie.
     * @param {number} [resources.action] - Coût en points d'action.
     * @param {number} [resources.mana]   - Coût en mana.
     * @param {number} [resources.zeal]   - Coût en zèle.
     * @param {number} [resources.drop]   - Coût en défausses (vérifié seulement en combat).
     * @param {object} actor             - L'acteur qui paie les coûts.
     *
     * @returns {boolean} True si toutes les ressources sont suffisantes (ou pas d'acteur), false sinon.
     */
    static checkResources(resources, actor) {
        if (!actor) {
            return true;
        }

        // COST HP
        if (resources?.hp) {
            if (actor.system?.attributes.hp.value + resources?.hp < 0) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughHp"), actor);
                return false;
            }
        }

        // COST ACTION
        if (resources?.action) {
            if (actor.system?.fq.action.value + resources?.action < 0) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughAction"), actor);
                return false;
            }
        }

        // COST MANA
        if (resources?.mana) {
            if (actor.system?.fq.mana.value + resources?.mana < 0) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughMana"), actor);
                return false;
            }
        }

        // COST ZEAL
        if (resources?.zeal) {
            if (actor.system?.fq.zeal.value + resources?.zeal < 0) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughZeal"), actor);
                return false;
            }
        }

        // COST DROP
        if (resources?.drop && Constants.isActorInCombat) {
            if (actor.system?.fq.cards.currentDrop + resources?.drop < 0) {
                ResourceHandler.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDrop"), actor);
                return false;
            }
        }

        return true;
    }

    /**
     * Applique la consommation (ou le gain) de ressources sur l'acteur. Les
     * ressources sont plafonnées à leur maximum (sauf l'action qui peut le
     * dépasser), la défausse ne descend pas sous 0, et certaines variables
     * spéciales (squelettes sacrifiés, défausses courantes) sont remises à 0.
     *
     * @param {object} resources - Les ressources à appliquer (hp, action, mana, zeal, drop, xvalue, yvalue).
     * @param {object} actor     - L'acteur sur lequel appliquer les modifications.
     *
     * @returns {void}
     */
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

    /**
     * Publie dans le chat un message d'avertissement stylisé, attribué à l'acteur.
     *
     * @param {string} message - Le message d'avertissement (déjà localisé).
     * @param {object} actor   - L'acteur à qui attribuer le message.
     *
     * @returns {void}
     */
    static createUserWarningMessage(message, actor) {
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor}),
            content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>${actor?.name} ${message}</span>`
        });
    }

    /**
     * Vérifie que la carte peut atteindre ses cibles : au moins une cible, pas
     * plus que le nombre autorisé, présence d'un token du lanceur sur la scène,
     * et distance de chaque cible comprise entre `minReach` et `maxReach`.
     * Publie un message d'avertissement pour chaque contrainte non respectée.
     *
     * @param {object} actor        - L'acteur lanceur.
     * @param {number} nbTargets    - Le nombre maximal de cibles autorisé (falsy = une seule).
     * @param {number} minReach     - La portée minimale (en cases).
     * @param {number} maxReach     - La portée maximale (en cases).
     * @param {string} [targetType=CardFqSystem.TARGET_TYPE_DEFAULT] - Le type de ciblage FQ.
     *
     * @returns {boolean} True si toutes les cibles sont valides et à portée, false sinon.
     */
    static checkIfCanCardCanReachTargets(actor, nbTargets, minReach, maxReach, targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        const targets = Constants.myTargets(targetType);

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
            const dist = Geometry.getMinDistanceBetweenTwoToken(myToken.x, myToken.y, target.document.x, target.document.y, myToken.width, target.document.width, myToken.height, target.document.height);

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

    /**
     * Détermine le nombre de cibles autorisé d'après le gabarit de ciblage :
     * la valeur déclarée pour une cible unique, un très grand nombre pour une
     * zone d'effet, 1 par défaut.
     *
     * @param {object} target - La configuration de ciblage (`template.type`, `value`).
     *
     * @returns {number} Le nombre de cibles autorisé.
     */
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
    /**
     * Vérifie que l'acteur peut jouer un sort maintenant : un combat est en cours
     * et c'est bien son tour. Publie un avertissement dans le cas contraire.
     *
     * @param {object} actor - L'acteur qui souhaite jouer.
     *
     * @returns {boolean} True si c'est le tour de l'acteur en combat, false sinon.
     */
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
