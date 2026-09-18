import {OriginFQEffectLabel} from "../domain/constants.js";
import TradingCards, {DECK_TYPE, HAND_TYPE} from "../domain/trading/trading-cards.js";
import CombatTurn from "../domain/engine/combat-turn.js";
import AutoCard from "../domain/engine/auto-card.js";
import DeathSave from "../domain/engine/death-save.js";
import Damage from "../domain/engine/roll/damage.js";
import Minion from "../domain/engine/shared/minion.js";

Hooks.on("deleteCombat", async function (combat, _delta) {
    if (CombatTurn.isLocalUserFirstActiveGM()) {
        // Filet pour les fantômes que la fin de leur tour n'a pas emportés : celui
        // créé dans le dernier tour du combat, ou celui dont le tour n'est jamais
        // venu. Aucun ne doit survivre au combat qui l'a vu naître.
        await Minion.dismissAllGhosts();
        await CombatTurn.resetCards();
        combat.combatants.forEach(combatant => {
            if (!combatant.actor) return;
            combatant.actor.update({"system.attributes.exhaustion": 0});
            if (combatant.actor.effects && combatant.actor.effects.size > 0) {
                // Un effet déjà expiré est retiré par dnd5e lui-même à la sortie du
                // combat (`_onExit`) : le supprimer ici aussi le ferait supprimer deux fois.
                combatant.actor.effects.filter(
                    effect => effect.origin === OriginFQEffectLabel && !effect.duration?.expired
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

Hooks.on("userConnected", function (_user, _connected) {
    CombatTurn.drawInnateCards();
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
Hooks.on("combatTurnChange", async function (combat, prior, _current) {
    if (combat.round < combat.previous?.round || (combat.round === combat.previous?.round && combat.turn < combat.previous?.turn)) {
        // Si on revient en arrière il ne se passe rien
        return;
    }
    const combatants = [...combat.combatants];
    if (combatants.find(c => !c.actor)) {
        ui.notifications.warn("FQCARDENGINE.WarningCombattantsWithNoActor", {localize: true});
    }
    if (CombatTurn.isLocalUserFirstActiveGM()) {
        // Le fantôme ne survit pas au tour qu'on lui a volé : sa copie quitte la
        // scène dès que son tour s'achève. Dissipé AVANT tout le reste — un fantôme
        // encore en jeu fausserait les réinitialisations de ressources du tour qui
        // commence comme les plafonds d'invocation de son invocateur.
        await Minion.dismissGhostOfTurn(prior?.tokenId ?? combat.previous?.tokenId);
        // Suppression des effets expirés de l'acteur dont le tour COMMENCE (combattant
        // courant) : l'effet disparaît au début du tour de l'acteur affecté, pas au round.
        if (combat.current.round !== combat.previous.round) { // It's a new round
            CombatTurn.resetAction(combatants);
            if (combat.previous.round === 0) { // It's the first round
                CombatTurn.resetZeal(combatants);
                await CombatTurn.drawHand(combatants);
                CombatTurn.resetCurrentDropCard(combatants);
                CombatTurn.resetSacrificedMinion(combatants);
            }
        }
        const actor = combat.combatant?.actor;
        const user = game.users.find(user => user.character?.id === actor?.id);
        if (combat.previous.round !== 0 && actor?.system?.fq.bonus.dot) {
            // Formule typée : chaque élément passe par les résistances de l'acteur.
            const dot = await Damage.damageOverTime(actor);
            if (dot) {
                await actor.update({"system.attributes.hp.value": actor.system.attributes.hp.value - dot});
            }
        }
        // Début de tour à 0 point de vie : jet de sauvegarde contre la mort pour un
        // personnage, dissipation pour un sbire. Le tour consommé ne se déroule pas.
        const turnConsumed = await DeathSave.resolveTurnStart(combat);
        if (!turnConsumed && combat.previous.round !== 0 && user) { // C'est le tour d'un joueur !
            CombatTurn.resetSacrificedMinion(combatants);
            CombatTurn.resetCurrentDropCard(combatants);
            // Un utilisateur ne devrait avoir qu'une main, une pile et un deck (FQ)
            const deck = TradingCards.getFirstDeck(user?.id, DECK_TYPE);
            const hand = TradingCards.getFirstDeck(user?.id, HAND_TYPE);

            if (deck && hand && actor.system.fq.cards?.pick) {
                await CombatTurn.drawWithRecall(user, actor, hand, deck, actor.system.fq.cards.pick);
            }
        }
        await CombatTurn.deleteExpiredEffects(combat.combatant?.actor);
    }

    // Cartes automatiques : hors du bloc MJ, car le rejeu s'exécute sur le client
    // du PORTEUR — le pipeline de jeu lit le personnage de l'utilisateur courant et
    // pose ses cibles. Chaque client ne traite donc que ses propres cartes.
    // Un porteur à terre ne rejoue rien : son tour appartient au jet de sauvegarde.
    if (!DeathSave.skipsTurn(combat.combatant?.actor)) {
        await AutoCard.playTurnAutoCards();
    }
});
