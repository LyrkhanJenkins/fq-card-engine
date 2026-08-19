// Ajoute un bouton perso dans le Token HUD
import Constants from "../domain/constants.js";
import TokenHud from "../domain/interface/shared/token-hud.js";

Hooks.on("renderTokenHUD", (hud, html, data) => {
    if (!game.user.isGM) {
        html.querySelectorAll(".col").forEach(col => col.innerHTML = "");
    }
    if (!Constants.actorCurrent) return;

    const colLeft = html.querySelector(".col.left");
    if (!colLeft) return;

    TokenHud.addDamageButton(colLeft, hud.object);
    TokenHud.addSqueletonButton(colLeft, hud.object);
});
