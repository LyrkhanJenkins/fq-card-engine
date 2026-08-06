import ResourceHandler from "../../engine/shared/resource-handler.js";
import {socket} from "../../../hook/integration/socketlib.hook.js";

/**
 * Gestion des boutons personnalisés ajoutés au HUD des tokens (dégâts, sacrifice
 * de squelette) et suppression de token côté MJ.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TokenHud {

    /**
     * Ajoute au HUD du token un bouton « sacrifier le squelette » (uniquement pour
     * les tokens dont le nom contient « Skeleton »). Au clic : joue un effet Sequencer
     * si disponible, publie un message de chat, incrémente le score de squelettes
     * sacrifiés du personnage et supprime le token via socket (droits MJ).
     *
     * @param {HTMLElement} column - La colonne du HUD où insérer le bouton.
     * @param {object}      token  - Le token concerné.
     *
     * @returns {void}
     */
    static addSqueletonButton(column, token) {
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
                    {"sacrifice": game.user.character.system.fq.special.sacrificedSkeleton + TokenHud.getSacrificedScore(token.name)})}</span>`
            });
            game.user.character.update({
                "system.fq.special.sacrificedSkeleton":
                    game.user.character.system.fq.special.sacrificedSkeleton + TokenHud.getSacrificedScore(token.name)
            });
            socket.executeAsGM("deleteToken", token.id);
        });
        column.appendChild(bouton);
    }

    // TODO protect for user not owner ?
    /**
     * Supprime un token de la scène active à partir de son id. Exécutée côté MJ via
     * socket (voir `hook/integration/socketlib.hook.js`).
     *
     * @param {string} tokenId - L'id du token à supprimer.
     *
     * @returns {void}
     */
    static deleteToken(tokenId) {
        // TODO Meilleur façon de récupérer un token, généraliser cette récupération!!
        // Ou parcourir toutes les scenes game.scenes ?
        const token = game.canvas.tokens.get(tokenId);
        token.document.delete();
    }

    /**
     * Retourne le score de sacrifice associé à un type de squelette, d'après son nom.
     *
     * @param {string} tokenName - Le nom du token squelette.
     *
     * @returns {number} Le score de sacrifice (1 par défaut).
     */
    static getSacrificedScore(tokenName) {
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

    /**
     * Ajoute au HUD du token un bouton « infliger des dégâts » qui déclenche l'usage
     * de toutes les armes équipées de l'acteur, après validation de l'usage d'un sort
     * dans le tour.
     *
     * @param {HTMLElement} column - La colonne du HUD où insérer le bouton.
     * @param {object}      token  - Le token dont l'acteur porte les armes.
     *
     * @returns {void}
     */
    static addDamageButton(column, token) {
        const actor = token.actor;
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.classList.add("control-icon");
        bouton.dataset.tooltip = game.i18n.localize("FQCARDENGINE.TokenDamageButton");
        bouton.innerHTML = `<img src="icons/svg/sword.svg" width="36" height="36">`;
        bouton.addEventListener("click", async () => {
            if (!ResourceHandler.validateUseSpellInTurn(actor)) {
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
}
