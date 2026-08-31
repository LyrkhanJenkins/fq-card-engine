/**
 * Affiche une alerte non bloquante qui se ferme d'elle-même après `duration` ms.
 * Un bouton OK permet de la fermer avant.
 *
 * @param {string} message - Le texte (déjà localisé) à afficher.
 * @param {object} [options] - Options d'affichage.
 * @param {string} [options.title=""] - Le titre de la fenêtre.
 * @param {number} [options.duration=4000] - La durée d'affichage en millisecondes.
 *
 * @returns {Promise<object>} Le dialogue rendu (DialogV2).
 */
export async function showTransientAlert(message, {title = "", duration = 4000} = {}) {
    const dialog = new foundry.applications.api.DialogV2({
        window: {title},
        content: `<p>${message}</p>`,
        buttons: [{action: "ok", label: "OK", default: true}]
    });
    await dialog.render({force: true});
    setTimeout(() => dialog.close(), duration);
    return dialog;
}

/**
 * Signale que la défausse d'un joueur a été mélangée dans son deck épuisé, et
 * ce que ce remélange lui a coûté en fatigue. Enregistrée dans socketlib
 * (`deckShuffledAlert`) et diffusée à tous les clients. Pour le joueur concerné,
 * l'information est intégrée en bannière à l'animation de révélation qui suit
 * immédiatement (le voile passe au-dessus de tout dialogue) ; les autres clients
 * voient l'alerte transitoire.
 *
 * @param {string} userId    - L'id de l'utilisateur dont le deck a été regarni.
 * @param {string} actorName - Le nom de son personnage.
 * @param {object} [fatigue] - Le bilan de fatigue (cf. `CombatTurn.applyDeckFatigue`).
 * @param {number} [fatigue.level]  - Le rang d'épuisement atteint.
 * @param {number} [fatigue.damage] - Les points de vie perdus au remélange.
 *
 * @returns {Promise<void>}
 */
export async function showDeckShuffledAlert(userId, actorName, fatigue = null) {
    if (userId === game.user.id) {
        FqCardEngineModule.pendingShuffleReveal = {at: Date.now(), fatigue};
        return;
    }
    const message = game.i18n.format("FQCARDENGINE.InfoMsgDeckShuffled", {actor: actorName})
        + (fatigue ? ` ${formatFatigue(fatigue)}` : "");
    await showTransientAlert(message, {title: game.i18n.localize("FQCARDENGINE.InfoDeckShuffledTitle")});
}

/**
 * Met en phrase le bilan de fatigue d'un remélange — rang d'épuisement atteint et
 * points de vie perdus. Partagé par l'alerte transitoire des autres clients et par
 * la bannière de l'animation de révélation du joueur concerné.
 *
 * @param {object} fatigue          - Le bilan de fatigue.
 * @param {number} [fatigue.level]  - Le rang d'épuisement atteint.
 * @param {number} [fatigue.damage] - Les points de vie perdus au remélange.
 *
 * @returns {string} Le texte localisé, vide si le bilan est absent.
 */
export function formatFatigue(fatigue) {
    if (!fatigue?.level) {
        return "";
    }
    return game.i18n.format("FQCARDENGINE.InfoMsgDeckFatigue", {
        level: fatigue.level,
        damage: fatigue.damage ?? 0
    });
}
