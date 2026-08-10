import {OriginFQEffectLabel} from "../domain/constants.js";
import {createWarning} from "../core/utils/chat.utils.js";
import TradingCards, {DECK_TYPE, HAND_TYPE} from "../domain/trading/trading-cards.js";
import CombatTurn from "../domain/engine/combat-turn.js";

Hooks.on("deleteCombat", async function (combat, _delta) {
    if (CombatTurn.isLocalUserFirstActiveGM()) {
        await CombatTurn.resetCards();
        combat.combatants.forEach(combatant => {
            if (!combatant.actor) return;
            combatant.actor.update({"system.attributes.exhaustion": 0});
            if (combatant.actor.effects && combatant.actor.effects.size > 0) {
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
    if (CONFIG.FqCardEngine.options.rollInitiative && CombatTurn.isLocalUserFirstActiveGM()) {
        await game.combat.rollAll();
    }
});

Hooks.on("createCombat", function (_data, _delta) {
    CombatTurn.resetCards();
});

Hooks.on("userConnected", function (user, connected) {
    CombatTurn.drawBaseCards();
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
    if (CombatTurn.isLocalUserFirstActiveGM()) {
        // Suppression des effets expirés de l'acteur dont le tour COMMENCE (combattant
        // courant) : l'effet disparaît au début du tour de l'acteur affecté, pas au round.
        if (combat.current.round !== combat.previous.round) { // It's a new round
            CombatTurn.resetAction(combatants);
            if (combat.previous.round === 0) { // It's the first round
                CombatTurn.resetZeal(combatants);
                await CombatTurn.drawHand(combatants);
                CombatTurn.resetCurrentDropCard(combatants);
                CombatTurn.resetSacrificedSkeleton(combatants);
            }
        }
        const actor = combat.combatant?.actor;
        const user = game.users.find(user => user.character?.id === actor?.id);
        if (combat.previous.round !== 0 && actor?.system?.fq.bonus.dot) {
            actor.update({"system.attributes.hp.value": actor.system.attributes.hp.value - actor.system.fq.bonus.dot});
        }
        if (combat.previous.round !== 0 && user) { // C'est le tour d'un joueur !
            CombatTurn.resetSacrificedSkeleton(combatants);
            CombatTurn.resetCurrentDropCard(combatants);
            // Un utilisateur ne devrait avoir qu'une main, une pile et un deck (FQ)
            const deck = TradingCards.getFirstDeck(user?.id, DECK_TYPE);
            const hand = TradingCards.getFirstDeck(user?.id, HAND_TYPE);

            if (deck && hand && actor.system.fq.cards?.pick) {
                const nextPick = deck.availableCards.length - actor.system.fq.cards.pick;
                if (deck.availableCards.length > actor.system.fq.cards.pick) {
                    await CombatTurn.drawPick(user, actor, hand, deck, actor.system.fq.cards.pick);
                } else {
                    if (deck.availableCards.length > 0) {
                        await CombatTurn.drawPick(user, actor, hand, deck, deck.availableCards.length); // Piochez les cartes restantes
                    }
                    actor.update({
                        "system.attributes.exhaustion":
                            actor.system.attributes.exhaustion + 1
                    });
                    createWarning(game.i18n.format("FQCARDENGINE.WarningMsgNoMoreCardInDeck", {pick: -nextPick}), {actor});
                }
            }
        }
        await CombatTurn.deleteExpiredEffects(combat.combatant?.actor);
    }
});
