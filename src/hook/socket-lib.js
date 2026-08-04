
//TODO faire mieux pour exposé socket?
import DamageUtils from "../domain/utils/damage-utils.js";
import DeckUtils from "../domain/utils/deck-utils.js";
import FQUtils from "../domain/utils/fq-utils.js";
import {deleteToken} from "./render-token.js"; // relocate

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
    socket.register("addEffectForTarget", DamageUtils.addEffectForTarget);
    socket.register("drawCard", DeckUtils.drawCard);
    socket.register("applyActorHpModification", DamageUtils.applyActorHpModification);
    socket.register("logCardPlayed", DeckUtils.logCardPlayed);
    socket.register("createActorFromData", DamageUtils.createActorFromData);
    socket.register("createTempFold", FQUtils.createTempFold);
    socket.register("getRandomFileFromFolder", FQUtils.getRandomFileFromFolder);
    socket.register("updateDeckForUser", DeckUtils.updateDeckForUser);
    socket.register("deleteDeckForUser", DeckUtils.deleteDeckForUser);
    socket.register("deleteToken", deleteToken); // TODO relocate
});
