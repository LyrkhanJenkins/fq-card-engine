
import Damage from "../../domain/engine/roll/damage.js";
import TradingCards from "../../domain/trading/trading-cards.js";
import Minion from "../../domain/engine/shared/minion.js";
import ObjectUtils from "../../core/utils/object.utils.js";
import TokenHud from "../../domain/interface/shared/token-hud.js";
import PlayCard from "../../domain/engine/play-card.js";

/**
 * Instance socketlib du module, initialisée au hook `socketlib.ready`.
 * Permet d'exécuter côté MJ (ou côté joueur cible) les opérations nécessitant des
 * droits particuliers : application de dégâts/soins, pioche, création d'acteurs,
 * gestion des decks et suppression de tokens.
 *
 * @type {object|undefined}
 */
export let socket;
Hooks.once("socketlib.ready", () => {
    socket = socketlib.registerModule(FqCardEngineModule.moduleName);
    socket.register("addEffectForTarget", Damage.addEffectForTarget);
    socket.register("removeEffectForTarget", Damage.removeEffectForTarget);
    socket.register("drawCard", TradingCards.drawCard);
    socket.register("applyActorHpModification", Damage.applyActorHpModification);
    socket.register("logCardPlayed", PlayCard.logCardPlayed);
    socket.register("createActorFromData", Damage.createActorFromData);
    socket.register("createTempFold", Minion.createTempFold);
    socket.register("getRandomFileFromFolder", ObjectUtils.getRandomFileFromFolder);
    socket.register("updateDeckForUser", TradingCards.updateDeckForUser);
    socket.register("deleteDeckForUser", TradingCards.deleteDeckForUser);
    socket.register("deleteToken", TokenHud.deleteToken);
});
