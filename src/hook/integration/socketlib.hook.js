
import Damage from "../../domain/engine/roll/damage.js";
import TradingCards from "../../domain/trading/trading-cards.js";
import Minion from "../../domain/engine/shared/minion.js";
import ObjectUtils from "../../core/utils/object.utils.js";
import TokenHud from "../../domain/interface/token-hud.js";
import PlayCard from "../../domain/engine/play-card.js";
import {showDeckShuffledAlert} from "../../core/utils/dialog.utils.js";
import ResultWindow from "../../domain/interface/window/result-window.js";
import {registerResultBroadcaster} from "../../domain/engine/roll/result-presenter.js";

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
    socket.register("deckShuffledAlert", showDeckShuffledAlert);
    socket.register("passCards", TradingCards.passCards);
    // Le résultat s’affiche chez TOUT LE MONDE : sans chat animé ni dés 3D, un
    // spectateur privé de cette fenêtre ne verrait plus rien du jet, seulement
    // des barres de vie qui tombent sans explication.
    socket.register("showResultWindow", report => {
        // Pas d’attente : seul le client du lanceur retient l’application des
        // dégâts sur son animation, les autres ne font que regarder.
        ResultWindow.present(report);
    });
    registerResultBroadcaster(report => {
        socket.executeForOthers("showResultWindow",
            {...report, speed: ResultWindow.speed, pauseSpeed: ResultWindow.pauseSpeed});
    });
});
