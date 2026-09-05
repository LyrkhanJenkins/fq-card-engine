import PreparedCard from "../domain/engine/prepared-card.js";
import {REACTIVE_READY_HOOKS} from "../domain/engine/shared/card-condition.js";

/**
 * Examen des cartes réactives préparées, débouncé : le déclenchement suit
 * EXACTEMENT les événements qui rallument le halo orange de la main
 * (REACTIVE_READY_HOOKS, partagé avec `hand-board.js`). Le débounce évite
 * d'examiner la main une fois par jeton (dé)ciblé.
 *
 * Aucune garde de rôle ici : elle est dans le handler, qui ne traite que la main
 * de l'utilisateur local et ne fait rien pendant le tour de son personnage.
 * @type {Function}
 */
const triggerPreparedCards = foundry.utils.debounce(() => PreparedCard.triggerPreparedCards(), 150);

for (const hook of REACTIVE_READY_HOOKS) {
    Hooks.on(hook, () => triggerPreparedCards());
}
