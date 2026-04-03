import {socket} from "./socket-lib.js";
import {OriginFQEffectLabel, WARNING_COLOR} from "../domain/utils/fq-constants.js";
import DeckUtils, {DECK_TYPE, HAND_TYPE} from "../domain/utils/deck-utils.js";

//TODO Renommer les fichiers js qui font des hooks globaux (à déplacer dans des dossiers?)
Hooks.on("deleteCombat", async function (combat, _delta) {
    if (Combat.isLocalUserFirstActiveGM()) {
        await Combat.resetCards();
        combat.combatants.forEach(combatant => {
            combatant.actor.update({"system.attributes.exhaustion": 0});
            if (combatant?.actor?.effects && combatant.actor.effects.size > 0) {
                combatant.actor.effects.filter(
                    effect => effect.origin === OriginFQEffectLabel
                ).forEach(effect => {
                    effect.delete();
                });
            }
        });
    }
});

Hooks.on("createCombatant", async function (_combatant, _data, _options) {
    if (CONFIG.FqCardEngine.options.rollInitiative && Combat.isLocalUserFirstActiveGM()) {
        await game.combat.rollAll();
    }
});

Hooks.on("createCombat", function (_data, _delta) {
    Combat.resetCards();
});

Hooks.on("userConnected", function (user, connected) {
    Combat.drawBaseCards();
});

/**
 * combatTurnChange : A hook event which fires when the turn order of a Combat encounter is progressed. This event fires
 * on all clients after the database update has occurred for the Combat.
 *
 * combat: Combat
 * The Combat encounter for which the turn order has changed
 *
 * prior: CombatHistoryData
 * The prior turn state
 *
 * current: CombatHistoryData
 * The new turn state
 */
Hooks.on("combatTurnChange", async function (combat, _prior, _current) {
    if (combat.round < combat.previous?.round || (combat.round === combat.previous?.round && combat.turn < combat.previous?.turn)) {
        // Si on revient en arrière il ne se passe rien
        return;
    }
    const combatants = [...combat.combatants];
    if (combatants.find(c => !c.actor)) {
        ui.notifications.warn("FQCARDENGINE.WarningCombattantsWithNoActor", {localize: true});
    }
    if (Combat.isLocalUserFirstActiveGM()) {
        await Combat.deleteExpiredEffects();
        if (combat.current.round !== combat.previous.round) { // It's a new round
            Combat.resetAction(combatants);
            if (combat.previous.round === 0) { // It's the first round
                Combat.resetZeal(combatants);
                await Combat.drawHand(combatants);
                Combat.resetCurrentDropCard(combatants);
                Combat.resetSacrificedSkeleton(combatants);
            }
        }
        const actor = combat.combatant?.actor;
        const user = game.users.find(user => user.character?.id === actor?.id);
        if (combat.previous.round !== 0 && actor?.system?.fq.bonus.dot) {
            actor.update({"system.attributes.hp.value": actor.system.attributes.hp.value - actor.system.fq.bonus.dot});
        }
        if (combat.previous.round !== 0 && user) { // C'est le tour d'un joueur !
            Combat.resetSacrificedSkeleton(combatants);
            Combat.resetCurrentDropCard(combatants);
            // Un utilisateur ne devrait avoir qu'une main, une pile et un deck (FQ)
            const deck = DeckUtils.getFirstDeck(user?.id, DECK_TYPE);
            const hand = DeckUtils.getFirstDeck(user?.id, HAND_TYPE);

            if (deck && hand && actor.system.fq.cards?.pick) {
                const nextPick = deck.availableCards.length - actor.system.fq.cards.pick;
                if (deck.availableCards.length > actor.system.fq.cards.pick) {
                    await Combat.drawPick(user, actor, hand, deck, actor.system.fq.cards.pick);
                } else {
                    if (deck.availableCards.length > 0) {
                        await Combat.drawPick(user, actor, hand, deck, deck.availableCards.length); // Piochez les cartes restantes
                    }
                    actor.update({
                        "system.attributes.exhaustion":
                            actor.system.attributes.exhaustion + 1
                    });
                    ChatMessage.create({
                        speaker: {actor: actor},
                        content: `<div style='font-style: italic; color:${WARNING_COLOR};'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgNoMoreCardInDeck", {pick: -nextPick})}</div>`
                    });
                }
            }
        }
    }
});


class Combat {
    static async deleteExpiredEffects() {
        const expiredEffects = Array.from(game.scenes?.active?.tokens ?? [])
            .flatMap((x) => {
                const actor = x.actor;
                if (actor == null)
                    return [];
                return actor.appliedEffects;
            })
            .filter((x) =>
                (x.isTemporary &&
                    x.duration.remaining != null &&
                    x.duration.remaining <= 0)
            );

        let promises = [];
        expiredEffects.forEach((x) => promises.push(x.delete()));

        await Promise.all(promises);
    }

    static isLocalUserFirstActiveGM() {
        if (game.user == null || game.users == null || game.users.activeGM == null) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.GMMustBeConnected"));
            return false;
        }
        return game.userId === game.users.activeGM.id;
    }

    static resetAction(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.action.value": combatant.actor.system.fq.action?.max});
        });
    }

    static resetZeal(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.zeal.value": combatant.actor.system.fq.zeal?.init});
        });
    }

    static resetCurrentDropCard(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.cards.currentDrop": 0});
        });
    }

    static resetSacrificedSkeleton(combatants) {
        combatants.forEach(combatant => {
            combatant.actor.update({"system.fq.special.sacrificedSkeleton": 0});
        });
    }

    static async resetCards() {
        if (Combat.isLocalUserFirstActiveGM()) {
            for (const deck of game.cards
                .filter(c => c.system.fq.type === DECK_TYPE)) {
                await deck.recall({chatNotification: false});
            }
            Combat.drawBaseCards();
        }
    }

    static drawBaseCards() {
        if (Combat.isLocalUserFirstActiveGM()) {
            game.users.forEach(user => {
                const deck = DeckUtils.getFirstDeck(user?.id, DECK_TYPE, false);
                const hand = DeckUtils.getFirstDeck(user?.id, HAND_TYPE, false);
                if (user && deck && hand) {
                    const allBaseCardsNotDrawned = deck.cards.filter(c => c.system?.fq?.isBase && !c.drawn).map(c => c.id);
                    if (allBaseCardsNotDrawned.length > 0) {
                        deck.pass(hand, allBaseCardsNotDrawned, {chatNotification: false});
                    }
                }
            });
        }

    }

    static async drawHand(combatants) {
        // get users with actors
        const users = game.users.filter(user => user.character?.id);
        for (const combatant1 of combatants
            .filter(combatant => users.filter(user => user.character?.id === combatant.actor.id).length === 1)) {
            const user = users.find(user => user.character.id === combatant1.actor.id);
            const deck = DeckUtils.getFirstDeck(user?.id, DECK_TYPE);
            const hand = DeckUtils.getFirstDeck(user?.id, HAND_TYPE);
            if (user && deck && hand) {
                if (user.active) {
                    await socket.executeAsUser("drawCard", user.id, hand.id, deck.id, combatant1.actor.system.fq.cards.hand);
                } else {
                    await socket.executeAsGM("drawCard", hand.id, deck.id, combatant1.actor.system.fq.cards.hand);
                }
            }
        }
    }

    static async drawPick(user, actor, hand, deck, pickScore) {
        if (pickScore > 0) {
            if (user.active) {
                await socket.executeAsUser("drawCard", user.id, hand.id, deck.id, pickScore);
            } else {
                await socket.executeAsGM("drawCard", hand.id, deck.id, pickScore);
            }
            if (actor.system.attributes.exhaustion > 0) {
                actor.update({
                    "system.attributes.hp.value": actor.system.attributes.hp.value
                        - actor.system.attributes.exhaustion
                });
            }
        } else {
            ChatMessage.create({
                speaker: {actor: actor},
                content: `<div style='font-style: italic; color:${WARNING_COLOR};'>
                        ${game.i18n.localize("FQCARDENGINE.WarningMsgNoPickScore")}</div>`
            });
        }
    }
}



