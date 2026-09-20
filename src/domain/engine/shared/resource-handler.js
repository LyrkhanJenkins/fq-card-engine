import TargetingPredicates from "./targeting-predicates.js";
import Constants from "../../constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {createWarning} from "../../../core/utils/chat.utils.js";


/**
 * Utilitaires de gestion des ressources et des contraintes de jeu d'une carte :
 * vérification et consommation des coûts (hp, action, mana, zeal, défausse),
 * contrôle du nombre de cibles et de la portée, et validation du tour de jeu.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
/**
 * Chemin du score de squelettes sacrifiés, tel qu'une carte le désigne dans son
 * `xvalue`/`yvalue`. Une carte qui lit ce score le DÉPENSE.
 * @type {string}
 */
export const SACRIFICE_PATH = "fq.minions.sacrificedMinion";

export default class ResourceHandler {

    /**
     * Le plafond de dépense d'une carte qui puise dans un compteur : la borne
     * `xmax`/`ymax` du contenu (déjà résolue en nombre au moment du jeu), ou le
     * compteur entier si la carte n'en déclare pas.
     *
     * @param {object} resources - Le contenu (choix) de la carte joué.
     * @param {number} fallback  - La valeur retenue en l'absence de borne.
     *
     * @returns {number} Le plafond de dépense.
     */
    static #spendCap(resources, fallback) {
        const bound = resources?.xvalue === SACRIFICE_PATH ? resources?.xmax : resources?.ymax;
        const cap = Number(bound);
        return Number.isFinite(cap) && cap > 0 ? cap : fallback;
    }

    /**
     * Vérifie que l'acteur dispose de suffisamment de ressources pour payer les
     * coûts indiqués (hp, action, mana, zeal, défausse). Affiche un message
     * d'avertissement pour la première ressource insuffisante.
     *
     * Le mode `silent` rend le même verdict sans rien publier : il sert aux
     * évaluations répétées et automatiques (déclenchement d'une carte réactive
     * préparée, réévaluées à chaque événement de combat), qui inonderaient
     * sinon le chat d'un avertissement par évaluation.
     *
     * Le coût en défausse (`drop`) ne passe PAS par ici : il ne se lit sur aucune
     * réserve, se paie en cartes de la main, et son verdict
     * (`DiscardCost.verify`) est rendu par chaque appelant qui connaît la carte
     * jouée — le faire ici obligerait ce module, importé par tout le moteur, à
     * dépendre de la couche interface.
     *
     * @param {object} resources         - Les coûts à payer (valeurs négatives).
     * @param {number} [resources.hp]     - Coût en points de vie.
     * @param {number} [resources.action] - Coût en points d'action.
     * @param {number} [resources.mana]   - Coût en mana.
     * @param {number} [resources.zeal]   - Coût en zèle.
     * @param {object} actor             - L'acteur qui paie les coûts.
     * @param {object} [options]          - Les options de vérification.
     * @param {boolean} [options.silent=false] - Ne publie aucun avertissement.
     *
     * @returns {boolean} True si toutes les ressources sont suffisantes (ou pas d'acteur), false sinon.
     */
    static checkResources(resources, actor, {silent = false} = {}) {
        if (!actor) {
            return true;
        }

        for (const {field, current, warningKey} of ResourceHandler.#COSTS) {
            if (!resources?.[field]) {
                continue;
            }
            if (current(actor) + resources[field] < 0) {
                if (!silent) {
                    ResourceHandler.createUserWarningMessage(game.i18n.localize(warningKey), actor);
                }
                return false;
            }
        }

        return true;
    }

    /**
     * Descripteurs des coûts vérifiés par {@link ResourceHandler.checkResources} :
     * champ du contenu de carte, réserve courante de l'acteur et clé i18n de
     * l'avertissement. L'ordre de la table EST l'ordre de vérification : seul le
     * premier coût insuffisant est signalé.
     */
    static #COSTS = Object.freeze([
        {
            field: "hp",
            current: actor => actor.system?.attributes.hp.value,
            warningKey: "FQCARDENGINE.WarningMsgNotEnoughHp"
        },
        {
            field: "action",
            current: actor => actor.system?.fq.action.value,
            warningKey: "FQCARDENGINE.WarningMsgNotEnoughAction"
        },
        {
            field: "mana",
            current: actor => actor.system?.fq.mana.value,
            warningKey: "FQCARDENGINE.WarningMsgNotEnoughMana"
        },
        {
            field: "zeal",
            current: actor => actor.system?.fq.zeal.value,
            warningKey: "FQCARDENGINE.WarningMsgNotEnoughZeal"
        },
    ]);

    /**
     * Descripteurs des réserves modifiées par {@link ResourceHandler.consumeResources} :
     * champ du contenu de carte, chemin de mise à jour, réserve courante et
     * plafond de l'acteur. Un descripteur sans `max` décrit une réserve sans
     * plafond (l'action, seule à pouvoir dépasser son maximum). L'ordre de la
     * table EST l'ordre des mises à jour appliquées à l'acteur.
     */
    static #POOLS = Object.freeze([
        {
            field: "hp",
            path: "system.attributes.hp.value",
            current: actor => actor.system?.attributes.hp.value,
            max: actor => actor.system?.attributes.hp.max
        },
        {
            field: "action",
            path: "system.fq.action.value",
            current: actor => actor.system?.fq.action.value
        },
        {
            field: "mana",
            path: "system.fq.mana.value",
            current: actor => actor.system?.fq.mana.value,
            max: actor => actor.system?.fq.mana.max
        },
        {
            field: "zeal",
            path: "system.fq.zeal.value",
            current: actor => actor.system?.fq.zeal.value,
            max: actor => actor.system?.fq.zeal.max
        },
    ]);

    /**
     * Applique la consommation (ou le gain) de ressources sur l'acteur. Les
     * ressources sont plafonnées à leur maximum (sauf l'action qui peut le
     * dépasser), et le score de squelettes sacrifiés est déduit de ce que la
     * carte en a dépensé. Le coût en défausse (`drop`) ne passe pas par ici :
     * il se paie en cartes, au moment du jeu (cf. `DiscardCost.pay`).
     *
     * @param {object} resources - Les ressources à appliquer (hp, action, mana, zeal, xvalue, yvalue).
     * @param {object} actor     - L'acteur sur lequel appliquer les modifications.
     *
     * @returns {void}
     */
    static consumeResources(resources, actor) {

        if (!actor) {
            return;
        }

        for (const {field, path, current, max} of ResourceHandler.#POOLS) {
            if (!resources?.[field]) {
                continue;
            }
            const total = current(actor) + resources[field];
            // Seule l'action n'a pas de plafond : elle peut monter au-dessus de son max.
            const cap = max?.(actor);
            actor.update({[path]: total > cap ? cap : total});
        }
        if (resources?.xvalue === SACRIFICE_PATH || resources?.yvalue === SACRIFICE_PATH) {
            // Le score de sacrifice est DÉDUIT de ce que la carte a réellement
            // dépensé — c'est-à-dire X, lui-même plafonné par `xmax` (cf.
            // `CardEffect.boundedXYValue`) — et non vidé : sacrifier un gros
            // squelette laisse le reliquat disponible pour la carte suivante.
            const current = actor.system?.fq.minions.sacrificedMinion ?? 0;
            const spent = Math.min(current, ResourceHandler.#spendCap(resources, current));
            actor.update({
                "system.fq.minions.sacrificedMinion": Math.max(0, current - spent)
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
        createWarning(message, {actor, prependActorName: true});
    }

    /**
     * Verdicts possibles de l'évaluation du ciblage (objet gelé). Les verdicts de
     * comptage réutilisent les valeurs de `TargetingPredicates.TARGET_COUNT`
     * (source unique) pour éviter toute désynchronisation silencieuse ; s'y
     * ajoutent les verdicts propres au ciblage (token du lanceur, portée).
     */
    static TARGETING_VERDICT = Object.freeze({
        OK: TargetingPredicates.TARGET_COUNT.OK,
        NO_TARGET: TargetingPredicates.TARGET_COUNT.NONE,
        MULTIPLE_NOT_ALLOWED: TargetingPredicates.TARGET_COUNT.MULTIPLE_NOT_ALLOWED,
        TOO_MANY: TargetingPredicates.TARGET_COUNT.TOO_MANY,
        NO_CASTER_TOKEN: "noCasterToken",
        OUT_OF_REACH: "outOfReach",
    });

    /**
     * Évalue le ciblage (nombre de cibles, présence du token du lanceur, portée) et
     * renvoie un VERDICT neutre — sans lever d'erreur ni publier de message. C'est la
     * source de vérité unique du contrôle de ciblage, appelée EN AMONT du jeu par les
     * DEUX appelants qui traduisent ensuite le verdict à leur façon :
     * - la dialog (`playValidatedCard`) → `FormError` (garde la dialog ouverte) ;
     * - l'intégration dnd5e (`dnd5e.hook`) → message de chat + booléen (via `warnTargeting`).
     * Les valeurs `nbTargets`/`minReach`/`maxReach` sont supposées déjà RÉSOLUES.
     *
     * @param {object} actor        - L'acteur lanceur.
     * @param {number} nbTargets    - Le nombre de cibles autorisé (falsy = une seule).
     * @param {number} minReach     - La portée minimale (en cases).
     * @param {number} maxReach     - La portée maximale (en cases).
     * @param {string} [targetType=CardFqSystem.TARGET_TYPE_DEFAULT] - Le type de ciblage FQ.
     *
     * @returns {{verdict: string, targets: object[], outOfReach: {target: object, dist: number}[]}}
     *          Le verdict (`TARGETING_VERDICT`), les cibles courantes et, le cas échéant, les cibles hors portée.
     */
    static evaluateTargeting(actor, nbTargets, minReach, maxReach, targetType = CardFqSystem.TARGET_TYPE_DEFAULT) {
        const targets = Constants.myTargets(targetType);
        const countVerdict = TargetingPredicates.evaluateTargetCount(targets.length, nbTargets);
        if (countVerdict !== TargetingPredicates.TARGET_COUNT.OK) {
            return {verdict: countVerdict, targets, outOfReach: []};
        }
        const casterToken = TargetingPredicates.findCasterToken(actor);
        if (!casterToken) {
            return {verdict: ResourceHandler.TARGETING_VERDICT.NO_CASTER_TOKEN, targets, outOfReach: []};
        }
        const outOfReach = TargetingPredicates.findOutOfReachTargets(casterToken, targets, minReach, maxReach);
        if (outOfReach.length > 0) {
            return {verdict: ResourceHandler.TARGETING_VERDICT.OUT_OF_REACH, targets, outOfReach};
        }
        return {verdict: ResourceHandler.TARGETING_VERDICT.OK, targets, outOfReach: []};
    }

    /**
     * Publie le(s) message(s) de chat d'avertissement correspondant à un verdict de
     * ciblage invalide — utilisé par l'intégration dnd5e (la dialog, elle, lève une
     * `FormError`). Ne publie rien pour un verdict `OK`. Reproduit les messages
     * historiques (mêmes clés/arguments/speaker) de l'ancien contrôle de portée.
     *
     * @param {object} actor       - L'acteur lanceur (speaker des avertissements de comptage/token).
     * @param {object} info        - Le détail du verdict.
     * @param {string} info.verdict    - Le verdict de `evaluateTargeting`.
     * @param {number} info.nbTargets  - Le nombre de cibles autorisé (pour les messages formatés).
     * @param {number} info.minReach   - La portée minimale (message hors-portée).
     * @param {number} info.maxReach   - La portée maximale (message hors-portée).
     * @param {{target: object, dist: number}[]} [info.outOfReach] - Les cibles hors portée.
     *
     * @returns {void}
     */
    static warnTargeting(actor, {verdict, nbTargets, minReach, maxReach, outOfReach = []}) {
        const V = ResourceHandler.TARGETING_VERDICT;
        if (verdict === V.NO_TARGET) {
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgNoTarget"), {actor});
        } else if (verdict === V.MULTIPLE_NOT_ALLOWED) {
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgNoMultipleTarget"), {actor});
        } else if (verdict === V.TOO_MANY) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgTooMuchTarget", {nbTargets}), {actor});
        } else if (verdict === V.NO_CASTER_TOKEN) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningNoTokenInCanvas", {nbTargets}), {actor});
        } else if (verdict === V.OUT_OF_REACH) {
            outOfReach.forEach(({target, dist}) => {
                createWarning(game.i18n.format("FQCARDENGINE.WarningMsgCantReachTarget", {
                    targetName: target.name, minReach, maxReach, dist
                }), {actor: Constants.actorCurrent});
            });
        }
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
        const singleTargets = ["self", "enemy", "creature", "ally", "object", "creatureOrObject", "willing", "any", "space"];

        const areaTargets = ["cone", "cube", "cylinder", "line", "radius", "ring", "sphere", "square", "wall"];

        if (singleTargets.includes(target?.template?.type)) {
            return target?.value ?? 1;
        } else if (areaTargets.includes(target?.template?.type)) {
            return 99999;
        } else {
            return 1;
        }
    }

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
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgPlayOutOfHisRound"), {actor: Constants.actorCurrent});
            return false;
        }
        return true;
    }

}
