import ResourceHandler from "../../domain/engine/shared/resource-handler.js";
import Damage from "../../domain/engine/roll/damage.js";
import {socket} from "./socketlib.hook.js";
import Constants from "../../domain/constants.js";
import Fx from "../../domain/engine/shared/fx.js";
import TargetingPredicates from "../../domain/engine/shared/targeting-predicates.js";
import OpportunityAttack from "../../domain/engine/reaction/opportunity-attack.js";
import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../../domain/trading/trading-cards.js";
import SpellbookWindow from "../../domain/interface/window/spellbook-window.js";

/**
 * Indique si la logique FQ ne doit PAS s'appliquer à une activité dnd5e donnée :
 * c'est le cas lorsqu'il n'y a pas d'acteur et que l'activité n'est ni un soin,
 * ni une attaque, ni des dégâts.
 *
 * @param {object} activity - L'activité dnd5e en cours (`actor`, `type`…).
 *
 * @returns {boolean|undefined} True si la logique FQ doit être ignorée, undefined sinon.
 */
const notApplyFQOnActivity = (activity) => {
    if (!activity.actor && !["heal", "attack", "damage"].includes(activity.type)) {
        return true;
    }
};

/**
 * Portées d'une activité dnd5e converties dans l'unité du moteur (les cases) :
 * une portée exprimée en distance (`range.value`) part de la case adjacente,
 * une allonge de mêlée (`range.reach`) part de 0. Lecture unique partagée par
 * le garde de ciblage (`preUseActivity`) et la résolution des dégâts
 * (`rollDamageV2`), qui doivent voir exactement la même portée.
 *
 * @param {object} range - Le bloc `range` de l'activité (`value`, `reach`).
 *
 * @returns {{minReach: number, maxReach: number}} Les portées en cases.
 */
const activityReachInCases = (range) => {
    const squareDistance = game.system.grid.distance;
    return {
        minReach: Math.trunc((range.value ? squareDistance : range.reach) ?? 0) / squareDistance,
        maxReach: Math.trunc((range.value ?? range.reach) ?? 0) / squareDistance
    };
};

Hooks.on("dnd5e.shortRest", (actor, _config) => {
    actor.update({"system.fq.action.value": actor.system.fq.action.max});
    actor.update({"system.fq.zeal.value": actor.system.fq.zeal.init});
    let manaRest = Math.max(actor.system.abilities.wis.mod, actor.system.abilities.int.mod);
    if (manaRest < 1) {
        manaRest = 1;
    }
    actor.update({"system.fq.mana.value": (actor.system.fq.mana.value + manaRest > actor.system.fq.mana.max) ? actor.system.fq.mana.max : actor.system.fq.mana.value + manaRest});
});

Hooks.on("dnd5e.longRest", (actor, _config) => {
    actor.update({"system.fq.action.value": actor.system.fq.action.max});
    actor.update({"system.fq.zeal.value": actor.system.fq.zeal.init});
    actor.update({"system.fq.mana.value": actor.system.fq.mana.max});
});


Hooks.on("dnd5e.preUseActivity", (activity, _usageConfig, _dialogConfig, _messageConfig) => {
    // Filter Activities
    if (notApplyFQOnActivity(activity)) {
        return true;
    }

    if (OpportunityAttack.rememberContextFor(activity)) {
        return true;
    }

    if (!ResourceHandler.checkResources(activity.item.system?.fq, activity.actor)) {
        return false;
    }
    const {minReach: minRange, maxReach: maxRange} = activityReachInCases(activity.range);
    const itemNbTargets = ResourceHandler.determineNbTargets(activity.target);
    // Use on yourself
    if (!Constants.myTargets()?.length && minRange === 0) {
        return true;
    }

    const {verdict, outOfReach} = ResourceHandler.evaluateTargeting(activity.actor, itemNbTargets, minRange, maxRange);
    if (verdict === ResourceHandler.TARGETING_VERDICT.OK) {
        return true;
    }
    ResourceHandler.warnTargeting(activity.actor, {verdict, nbTargets: itemNbTargets, minReach: minRange, maxReach: maxRange, outOfReach});
    return false;

});

Hooks.on("dnd5e.preRollAttackV2", (config, _dialog, _message) => {
    if (!game.settings.get(FqCardEngineModule.moduleName, "BypassWeaponAttackRoll")) {
        return true;
    }
    const activity = config.subject;
    if (activity?.item?.type !== "weapon") {
        return true;
    }
    activity.rollDamage({}, {configure: false});
    return false;
});

Hooks.on("dnd5e.preRollDamageV2", (config, dialog, _message) => {
    if (!game.settings.get(FqCardEngineModule.moduleName, "BypassWeaponAttackRoll")) {
        return true;
    }
    if (config.subject?.item?.type !== "weapon") {
        return true;
    }
    dialog.configure = false;
    return true;
});

Hooks.on("dnd5e.rollDamageV2", async (rolls, {subject}) => {
    const opportunity = OpportunityAttack.consumeContextFor(subject);
    const opportunityTarget = opportunity?.target ?? null;
    const item = subject.item;
    const {minReach, maxReach} = activityReachInCases(subject.range);

    const token = opportunity?.source ?? Constants.actorToken(subject.actor.id);
    if (!subject.item) {
        return;
    }

    if (!opportunityTarget && ["heal", "damage", "attack"].includes(subject.type)) {
        ResourceHandler.consumeResources(item.system?.fq, subject.actor);
    }
    let resultArray = [];
    let cardContent = {heal: 0, damage: 0, minReach, maxReach, bonusCrit: 0, bonusEva: 0};
    if (opportunityTarget) {
        cardContent.forcedTargets = [opportunityTarget];
    }
    const dsnAnimations = [];
    for (let roll of rolls) {
        if (item.actor) {
            let fxType;
            let playFx = false;
            if (subject.type === "heal") {
                cardContent.heal = roll.formula;
                if (item.actor.system?.fq?.bonus?.heal) {
                    roll = await new Roll(Damage.getHealWithBonus(item.actor, roll.total)).evaluate();
                    Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgHealBonus", {heal: item.actor.system?.fq?.bonus?.heal})
                    });
                }
                resultArray.push(...await Damage.addCriticalToHeal(item.actor, roll.total, cardContent, dsnAnimations));
                fxType = roll.options.type;
                playFx = true;
            } else if (subject.type === "damage" || subject.type === "attack") {
                cardContent.damage = roll.formula;
                if (item.actor.system?.fq?.bonus?.damage) {
                    roll = await new Roll(Damage.getDamageWithBonus(item.actor, roll.total)).evaluate();
                    Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgDamageBonus", {damage: item.actor.system?.fq?.bonus?.damage})
                    });
                }
                resultArray.push(...await Damage.addCriticalEvasionToDamage(item.actor, roll.total, cardContent, dsnAnimations));
                fxType = roll.options.type;
                playFx = true;
            }
            await Promise.all(dsnAnimations);

            if (token && playFx) {
                await Fx.handleSpecialEffect(cardContent, resultArray, token, fxType);
            }

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            Damage.displayResult(item.actor, resultArray, null);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent, item.actor.id,
                TargetingPredicates.resolveTargetActorIds(cardContent, item.actor));
        }
    }
});

/**
 * Identifiants utilisateur en attente d'ouverture automatique du grimoire
 * (LEVEL-04, D4-04) : un `Set`, jamais un scalaire, pour que deux advancements
 * entrelacés de deux utilisateurs différents n'effacent jamais l'attente l'un
 * de l'autre. Armé par le hook système d'avancement de dnd5e ci-dessous — un
 * hook système local au SEUL client qui a fait tourner l'`AdvancementManager`
 * jusqu'au bout, contrairement aux hooks de document CRUD (`updateItem`…)
 * rejoués sur chaque client connecté : c'est ce qui garantit que la fenêtre
 * ne s'ouvre jamais que chez le déclencheur, sans avoir besoin de comparer un
 * `userId` de socket. Consommé par le signal explicite de fin de rebuild émis
 * par `TradingCards.updateDeckWhenChange` une fois celui-ci réellement résolu :
 * un délai calé sur la durée du debounce serait non déterministe face aux
 * `await Cards.create`/`deleteDocuments` réseau qu'il enchaîne.
 *
 * @type {Set<string>}
 */
const pendingSpellbookOpens = new Set();

Hooks.on("dnd5e.advancementManagerComplete", (manager) => {
    const user = game.users.find(u => u.character?.id === manager.actor?.id);
    if (!user?.id) return;
    pendingSpellbookOpens.add(user.id);
});

Hooks.on("fq-card-engine.deckRebuilt", (userId) => {
    if (!pendingSpellbookOpens.has(userId)) return;
    pendingSpellbookOpens.delete(userId);

    // Sans avertissement : une reconstruction interrompue en a déjà émis un,
    // le joueur en recevrait un second pour la même cause.
    const spellBook = TradingCards.getFirstDeck(userId, SPELLBOOK_TYPE, false);
    const deck = TradingCards.getFirstDeck(userId, DECK_TYPE, false);
    if (spellBook && deck) {
        SpellbookWindow.open(spellBook, deck);
    }
});
