/**
 * Échappe un texte pour l'insérer dans du HTML, comme contenu ou comme valeur
 * d'attribut entre guillemets doubles (`data-tooltip="…"`). Un nom de carte, de
 * condition ou de cible ne doit jamais pouvoir y ouvrir une balise.
 *
 * @param {*} text - Le texte à échapper (converti en chaîne ; null et undefined donnent « »).
 *
 * @returns {string} Le texte échappé.
 */
export function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
