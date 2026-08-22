import Constants from "../domain/constants.js";
import TokenHud from "../domain/interface/shared/token-hud.js";

Hooks.on("renderTokenHUD", (hud, html, data) => {
    // Les contrôles natifs du HUD ne sont retirés aux joueurs que lorsque la
    // limitation de leurs droits est activée.
    if (!game.user.isGM && CONFIG.FqCardEngine.options.playerLimitCardsRight) {
        html.querySelectorAll(".col").forEach(col => col.innerHTML = "");
    }

    const colLeft = html.querySelector(".col.left");
    if (!colLeft) return;

    // Ajout des boutons de dégâts agissent sur l'acteur DU TOKEN
    if (hud.object?.actor?.isOwner) {
        TokenHud.addDamageButtons(colLeft, hud.object);
    }

    // Ajout des boutons de sacrifice de squelette si concernés
    if (Constants.actorCurrent) {
        TokenHud.addSqueletonButton(colLeft, hud.object);
    }
});
