import ConsumptionUtils from "../domain/utils/consumption-utils.js";
import DamageUtils from "../domain/utils/damage-utils.js";
import {socket} from "./socket-lib.js";
import DeckUtils from "../domain/utils/deck-utils.js";
import FqConstants from "../domain/utils/fq-constants.js";
import FxUtils from "../domain/utils/fx-utils.js";
import {visualEffectData} from "../domain/system/fx/visualEffectData.js";

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
    //TODO voir si il y a une action
    if (!activity.actor && !["heal", "attack", "damage"].includes(activity.type)) {
        return true;
    }
};
// TODO Sequencer hooks
Hooks.on("sequencer.ready", () => {
    Sequencer.Database.registerEntries("fq", visualEffectData);
    console.info("FQ | Sequencer database registered under 'fq'");
});
// TODO dnd5e hooks?
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


Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
    // Filter Activities
    if (notApplyFQOnActivity(activity)) {
        return true;
    }

    if (!ConsumptionUtils.checkResources(activity.item.system?.fq, activity.actor)) {
        return false;
    }
    const squareDistance = game.system.grid.distance;
    const minRange = Math.trunc((activity.range.value ? squareDistance : activity.range.reach) ?? 0) / squareDistance;
    const maxRange = Math.trunc((activity.range.value ?? activity.range.reach) ?? 0) / squareDistance;
    const itemNbTargets = ConsumptionUtils.determineNbTargets(activity.target);
    // Use on yourself
    if (!FqConstants.myTargets()?.length && minRange === 0) {
        return true;
    }

    return ConsumptionUtils.checkIfCanCardCanReachTargets(activity.actor, itemNbTargets, minRange, maxRange);

});
Hooks.on("dnd5e.activityConsumption", (activity, _config, _messageConfig) => {
    // Filter Activities
    if (notApplyFQOnActivity(activity)) {
        return true;
    }
    ConsumptionUtils.consumeResources(activity.item?.system?.fq, activity.actor);
    return true;
});

Hooks.on("dnd5e.rollDamageV2", async (rolls, {subject}) => {
    const item = subject.item;
    //TODO Refacto
    const squareDistance = game.system.grid.distance;
    const minReach = Math.trunc((subject.range.value ? squareDistance : subject.range.reach) ?? 0) / squareDistance;
    const maxReach = Math.trunc((subject.range.value ?? subject.range.reach) ?? 0) / squareDistance;
    const token = game.canvas.scene.tokens.find(t => t.actorId === subject.actor.id);
    // TODO mettre en option
    if (!subject.item) {
        return;
    }
    let resultArray = [];
    let cardContent = {heal: 0, damage: 0, minReach, maxReach, bonusCrit: 0, bonusEva: 0};
    for (let roll of rolls) {
        if (item.actor) {
            if (subject.type === "heal") {
                cardContent.heal = roll.formula;
                if (item.actor.system?.fq?.bonus?.heal) {
                    roll = await new Roll(DamageUtils.getHealWithBonus(item.actor, roll.total)).evaluate();
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgHealBonus", {heal: item.actor.system?.fq?.bonus?.heal})
                    });
                }
                resultArray.push(...await DamageUtils.addCriticalToHeal(item.actor, roll.total, cardContent));
                if (token) {
                    await FxUtils.handleSpecialEffect(cardContent, resultArray, token, roll.options.type);
                }
            } else if (subject.type === "damage" || subject.type === "attack") {
                cardContent.damage = roll.formula;
                if (item.actor.system?.fq?.bonus?.damage) {
                    roll = await new Roll(DamageUtils.getDamageWithBonus(item.actor, roll.total)).evaluate();
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgDamageBonus", {damage: item.actor.system?.fq?.bonus?.damage})
                    });
                }
                resultArray.push(...await DamageUtils.addCriticalEvasionToDamage(item.actor, roll.total, cardContent));
                if (token) {
                    await FxUtils.handleSpecialEffect(cardContent, resultArray, token, roll.options.type);
                }
            }

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            DamageUtils.displayResult(item.actor, resultArray, null);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent);
        }
    }
});

// Update class
Hooks.on("preUpdateItem", (document, changed, options, _userId) => {
    DeckUtils.checkIfCanUpdateClasses(document, options);
});
Hooks.on("updateItem", (document, changed, options, _userId) => {
    DeckUtils.updateDeckWhenChange(document, options);
});
Hooks.on("preCreateItem", (document, options, _userId) => {
    DeckUtils.checkIfCanUpdateClasses(document, options);
});
Hooks.on("createItem", (document, options, _userId) => {
    DeckUtils.updateDeckWhenChange(document, options);
});
Hooks.on("preDeleteItem", (document, options, _userId) => {
    DeckUtils.checkIfCanUpdateClasses(document, options);
});
Hooks.on("deleteItem", (document, options, _userId) => {
    DeckUtils.updateDeckWhenChange(document, options);
});
