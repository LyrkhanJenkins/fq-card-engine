import Constants from "../../constants.js";

/**
 * Verrouillage du mode d'une feuille dnd5e (acteur ou objet) pour les joueurs
 * aux droits limités. Les feuilles dnd5e exposent toutes la même mécanique via
 * `PrimarySheetMixin` : un mode courant (`_mode`) et une bascule « jeu/édition »
 * dans l'en-tête de la fenêtre.
 */

/**
 * Force une feuille en mode « jeu » si les droits du joueur sont limités.
 * À appeler avant la préparation du contexte : les parties de la feuille sont
 * bâties depuis le mode courant, un verrouillage au rendu arriverait trop tard.
 *
 * @param {object} sheet - La feuille dnd5e à verrouiller.
 *
 * @returns {boolean} True si le mode a été verrouillé.
 */
export function lockPlayMode(sheet) {
    if (!Constants.isPlayerRightsLimited) return false;
    sheet._mode = sheet.constructor.MODES.PLAY;
    return true;
}

/**
 * Retire (et n'ajoute jamais) la bascule de mode de l'en-tête d'une feuille si
 * les droits du joueur sont limités. Le mode est reverrouillé au passage : le
 * rendu recalcule les classes de la fenêtre juste après cet appel.
 *
 * @param {object} sheet - La feuille dnd5e concernée.
 *
 * @returns {boolean} True si la bascule a été retirée (le comportement natif ne doit pas s'appliquer).
 */
export function removeModeToggle(sheet) {
    if (!lockPlayMode(sheet)) return false;
    sheet.element?.querySelector(".window-header .mode-slider")?.remove();
    return true;
}
