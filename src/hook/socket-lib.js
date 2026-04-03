
//TODO faire mieux pour exposé socket?
import DamageUtils from "../utils/damage-utils.js";
import DeckUtils from "../utils/deck-utils.js";
import FQUtils from "../utils/fq-utils.js";
import {deleteToken} from "./render-token.js"; // relocate

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
    socket.register("createDeckForUser", DeckUtils.createDeckForUser);
    socket.register("deleteDeckForUser", DeckUtils.deleteDeckForUser);
    socket.register("deleteToken", deleteToken); // TODO relocate
});
