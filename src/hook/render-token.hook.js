import Constants from "../domain/constants.js";
import TokenHud from "../domain/interface/token-hud.js";

Hooks.on("renderTokenHUD", (hud, html, _data) => {
    // Les contrôles natifs du HUD ne sont retirés aux joueurs que lorsque la
    // limitation de leurs droits est activée. On leur conserve toutefois le
    // ciblage et le choix de l'action de mouvement (bouton + palette,
    // tous deux porteurs de data-palette="movementActions").
    if (Constants.isPlayerRightsLimited) {
        const keptControls = "[data-action='target'], [data-palette='movementActions']";
        html.querySelectorAll(".col > *").forEach(el => {
            if (!el.matches(keptControls)) el.remove();
        });
    }

    const colLeft = html.querySelector(".col.left");
    if (!colLeft) return;

    // Ajout des boutons de dégâts agissent sur l'acteur DU TOKEN
    if (hud.object?.actor?.isOwner) {
        TokenHud.addDamageButtons(colLeft, hud.object);
    }

    // Ajout du bouton de sacrifice si le token est un sbire du personnage
    if (Constants.actorCurrent) {
        TokenHud.addSacrificeButton(colLeft, hud.object);
    }
});
