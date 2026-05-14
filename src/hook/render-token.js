// Ajoute un bouton perso dans le Token HUD
import {socket} from "./socket-lib.js";
import ConsumptionUtils from "../domain/utils/consumption-utils.js";

Hooks.on("renderTokenHUD", (hud, html, data) => {
    // TODO Add option in FQ (hide token HUD default buttons for players)L
    if (!game.user.isGM) {
        html.querySelectorAll(".col").forEach(col => col.innerHTML = "");
    }
    if (!game.user.character) return;

    const colLeft = html.querySelector(".col.left");
    if (!colLeft) return;

    addDamageButton(colLeft, hud.object);
    addSqueletonButton(colLeft, hud.object);
});

function addSqueletonButton(column, token) {
    if (!token.document.name.includes("Skeleton")) return;
    if (column.querySelector("[data-action='skeleton-sacrificed']")) return;
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.classList.add("control-icon");
    bouton.dataset.action = "skeleton-sacrificed";

    bouton.dataset.tooltip = game.i18n.localize("FQCARDENGINE.SacrifySkeletonButton");
    bouton.innerHTML = `<img src="icons/magic/death/skeleton-skull-soul-blue.webp" width="36" height="36"/>`;
    bouton.addEventListener("click", ev => {
        if (game.modules.get("sequencer")?.active) {
            new Sequence()
                .effect()
                .file("jb2a.explosion.04.blue")
                .atLocation(token)
                .scaleToObject(1.5)
                .fadeIn(300)
                .fadeOut(500)
                .duration(1500)
                .belowTokens()
                .effect()
                .file("jb2a.smoke.puff.centered.grey")
                .atLocation(token)
                .scaleToObject(1.5)
                .randomRotation()
                .fadeIn(100)
                .fadeOut(1000)
                .duration(1200)
                .effect()
                .file("jb2a.explosion.04.blue")
                .atLocation(token)
                .scaleToObject(1.5)
                .play();
        }
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
            content: `<span>${game.i18n.format("FQCARDENGINE.SacrifySkeletonMsg")}, ${game.i18n.format("FQCARDENGINE.SacrificedScoreSkeletonMsg",
                {"sacrifice": game.user.character.system.fq.special.sacrificedSkeleton + getSacrificedScore(token.name)})}</span>`
        });
        game.user.character.update({
            "system.fq.special.sacrificedSkeleton":
                game.user.character.system.fq.special.sacrificedSkeleton + getSacrificedScore(token.name)
        });
        socket.executeAsGM("deleteToken", token.id);
    });
    column.appendChild(bouton);
}

// TODO protect for user not owner ?
export function deleteToken(tokenId) {
    // TODO Meilleur façon de récupérer un token, généraliser cette récupération!!
    // Ou parcourir toutes les scenes game.scenes ?
    const token = game.canvas.tokens.get(tokenId);
    token.document.delete();
}

function getSacrificedScore(tokenName) {
    switch (tokenName) {
    case "Skeleton lvl 2":
        return 2;
    case "Skeleton lvl 3":
        return 3;
    case "Giant Skeleton":
        return 4;
    case "Skeleton Sorcerer":
        return 5;
    default:
        return 1;
    }
}

function addDamageButton(column, token) {
    const actor = token.actor;
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.classList.add("control-icon");
    bouton.dataset.tooltip = game.i18n.localize("FQCARDENGINE.TokenDamageButton");
    bouton.innerHTML = `<img src="icons/svg/sword.svg" width="36" height="36">`;
    bouton.addEventListener("click", async () => {
        if (!ConsumptionUtils.validateUseSpellInTurn(actor)) {
            return;
        }
        const armes = actor.items.filter(i => i.type === "weapon" && i.system.equipped);
        if (!armes.length) return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.TokenDamageNoWeaponWarningMsg"));
        for (let arme of armes) {
            arme.use();
        }
    });

    column.appendChild(bouton);
}
