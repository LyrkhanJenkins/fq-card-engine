import {WARNING_COLOR} from "../constants.js";

/**
 * Publie dans le chat un message d'avertissement stylisé (span italique coloré) —
 * helper générique factorisant le pattern répété partout dans le code.
 *
 * @param {string} message - Le texte déjà localisé/formaté à afficher.
 * @param {object} [options] - Options d'affichage.
 * @param {object} [options.actor] - L'acteur speaker du message.
 * @param {string} [options.color=WARNING_COLOR] - La couleur du texte (ex. `ERROR_COLOR`).
 * @param {boolean} [options.prependActorName=false] - Préfixe le message du nom de l'acteur.
 *
 * @returns {void}
 */
export function createWarning(message, {actor = null, color = WARNING_COLOR, prependActorName = false} = {}) {
    const text = prependActorName && actor?.name ? `${actor.name} ${message}` : message;
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `<span style='color: ${color}; font-style: italic'>${text}</span>`
    });
}

/**
 * Publie dans le chat un message d'information stylisé (div italique).
 *
 * @param {string} message - Le texte déjà localisé/formaté à afficher.
 * @param {object} [options] - Options d'affichage.
 * @param {object} [options.actor] - L'acteur speaker du message.
 *
 * @returns {void}
 */
export function createInfo(message, {actor = null} = {}) {
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `<div style='font-style: italic'>${message}</div>`
    });
}

/**
 * Publie dans le chat un message de statut stylisé (div italique grasse colorée),
 * utilisé pour les états de carte (éphémère, passive, charges restantes…).
 *
 * @param {string} message - Le texte déjà localisé/formaté à afficher.
 * @param {object} [options] - Options d'affichage.
 * @param {object} [options.actor] - L'acteur speaker du message.
 * @param {string} [options.color="green"] - La couleur du texte.
 *
 * @returns {void}
 */
export function createStatus(message, {actor = null, color = "green"} = {}) {
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `<div style='color: ${color};font-style: italic;font-weight: 700'>${message}</div>`
    });
}
