// Ajoute un bouton perso dans le Token HUD
import TokenHud from "../domain/interface/shared/token-hud.js";

Hooks.on("renderTokenHUD", (hud, html, data) => {
    // TODO Add option in FQ (hide token HUD default buttons for players)L
    if (!game.user.isGM) {
        html.querySelectorAll(".col").forEach(col => col.innerHTML = "");
    }
    if (!game.user.character) return;

    const colLeft = html.querySelector(".col.left");
    if (!colLeft) return;

    TokenHud.addDamageButton(colLeft, hud.object);
    TokenHud.addSqueletonButton(colLeft, hud.object);
});
