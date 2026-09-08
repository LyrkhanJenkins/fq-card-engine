import Constants from "../constants.js";
import WeaponDamage from "../engine/roll/weapon-damage.js";
import TargetingPredicates from "../engine/shared/targeting-predicates.js";
import {socket} from "../../hook/integration/socketlib.hook.js";

/**
 * Gestion des boutons personnalisés ajoutés au HUD des tokens (dégâts, sacrifice
 * de sbire) et suppression de token côté MJ.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TokenHud {

    /**
     * Score de sacrifice par sbire : ce que rapporte au compteur
     * `fq.minions.sacrificedMinion` le sbire envoyé au charnier. Tout sbire
     * absent de la table — les familiers du trappeur — vaut le score par défaut
     * de `getSacrificedScore`.
     * @type {Object<string, number>}
     */
    static SACRIFICE_SCORES = Object.freeze({
        "Skeleton lvl 1": 1,
        "Skeleton lvl 2": 2,
        "Skeleton lvl 3": 3,
        "Skeleton lvl 4": 4,
        "Giant Skeleton": 3,
        "Skeleton Sorcerer": 6
    });

    /**
     * Ajoute au HUD du token un bouton « sacrifier le sbire », réservé aux sbires
     * VIVANTS invoqués par le personnage courant : le verdict vient de
     * l'estampille posée à l'invocation ({@link TargetingPredicates.isLivingMinion}),
     * et non du nom du token — un squelette de la sorcière comme un familier du
     * trappeur s'offrent au charnier, la créature d'un autre joueur ou du MJ non.
     * Au clic : joue un effet Sequencer si disponible, publie un message de chat,
     * incrémente le score de sacrifice du personnage et supprime le token via
     * socket (droits MJ).
     *
     * @param {HTMLElement} column - La colonne du HUD où insérer le bouton.
     * @param {object}      token  - Le token concerné.
     *
     * @returns {void}
     */
    static addSacrificeButton(column, token) {
        if (!TargetingPredicates.isLivingMinion(token)) return;
        if (column.querySelector("[data-action='minion-sacrificed']")) return;
        column.appendChild(TokenHud.#createHudButton({
            tooltipKey: "FQCARDENGINE.SacrifyMinionButton",
            iconSrc: "icons/magic/death/skeleton-skull-soul-blue.webp",
            action: "minion-sacrificed",
            onClick: () => {
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
                    speaker: ChatMessage.getSpeaker({actor: Constants.actorCurrent}),
                    content: `<span>${game.i18n.format("FQCARDENGINE.SacrifyMinionMsg")}, ${game.i18n.format("FQCARDENGINE.SacrificedScoreMinionMsg",
                        {"sacrifice": Constants.actorCurrent.system.fq.minions.sacrificedMinion + TokenHud.getSacrificedScore(token.name)})}</span>`
                });
                Constants.actorCurrent.update({
                    "system.fq.minions.sacrificedMinion":
                        Constants.actorCurrent.system.fq.minions.sacrificedMinion + TokenHud.getSacrificedScore(token.name)
                });
                socket.executeAsGM("deleteToken", token.id);
            }
        }));
    }

    /**
     * Construit un bouton de HUD de token : icône, tooltip, et action au clic. Un
     * `action` de dataset est optionnel (utilisé par le sacrifice de sbire pour
     * détecter sa propre présence, cf. `addSacrificeButton`).
     *
     * @param {object}   options
     * @param {string}   options.tooltipKey - La clé i18n du tooltip du bouton.
     * @param {string}   options.iconSrc    - Le chemin de l'icône (36×36).
     * @param {string}   [options.action]   - La valeur `dataset.action` du bouton.
     * @param {Function} options.onClick    - Le gestionnaire de clic.
     *
     * @returns {HTMLButtonElement} Le bouton, prêt à être inséré dans la colonne du HUD.
     */
    static #createHudButton({tooltipKey, iconSrc, action, onClick}) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.classList.add("control-icon");
        if (action) {
            bouton.dataset.action = action;
        }
        bouton.dataset.tooltip = game.i18n.localize(tooltipKey);
        bouton.innerHTML = `<img src="${iconSrc}" width="36" height="36"/>`;
        bouton.addEventListener("click", onClick);
        return bouton;
    }

    /**
     * Supprime un token de la scène active à partir de son id. Exécutée côté MJ via
     * socket (voir `hook/integration/socketlib.hook.js`).
     *
     * @param {string} tokenId - L'id du token à supprimer.
     *
     * @returns {void}
     */
    static deleteToken(tokenId) {
        const token = game.canvas.tokens.get(tokenId);
        token.document.delete();
    }

    /**
     * Retourne le score de sacrifice associé à un sbire, d'après son nom.
     *
     * @param {string} tokenName - Le nom du token du sbire.
     *
     * @returns {number} Le score de sacrifice (5 par défaut, pour tout sbire absent de la table).
     */
    static getSacrificedScore(tokenName) {
        // Le jeton d'un sbire porte le nom du sbire SUIVI d'un suffixe aléatoire
        // (« Skeleton lvl 3_428913 », cf. `Minion.createActorData`) : la table se
        // lit donc par préfixe, jamais par égalité.
        const name = String(tokenName ?? "");
        const entry = Object.entries(TokenHud.SACRIFICE_SCORES).find(([minion]) => name.startsWith(minion));
        return entry ? entry[1] : 5;
    }

    /**
     * Ajoute au HUD du token deux boutons « infliger des dégâts » : l'un déclenche
     * l'usage de la première arme de mêlée équipée de l'acteur, l'autre celui de la
     * première arme à distance équipée, après validation de l'usage d'un sort dans
     * le tour.
     *
     * @param {HTMLElement} column - La colonne du HUD où insérer les boutons.
     * @param {object}      token  - Le token dont l'acteur porte les armes.
     *
     * @returns {void}
     */
    static addDamageButtons(column, token) {
        const actor = token.actor;
        const configs = [
            {weaponToken: "@wpnM", icon: "icons/weapons/swords/scimitar-guard-gold.webp", tooltipKey: "FQCARDENGINE.TokenMeleeDamageButton"},
            {weaponToken: "@wpnR", icon: "icons/weapons/bows/shortbow-recurve-yellow.webp", tooltipKey: "FQCARDENGINE.TokenRangedDamageButton"}
        ];
        for (const {weaponToken, icon, tooltipKey} of configs) {
            column.appendChild(TokenHud.#createHudButton({
                tooltipKey,
                iconSrc: icon,
                onClick: () => WeaponDamage.useFirstEquippedWeapon(actor, weaponToken)
            }));
        }
    }
}
