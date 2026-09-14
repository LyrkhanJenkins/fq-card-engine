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
 * Classe posée sur la fenêtre d'une feuille verrouillée : dnd5e laisse visibles
 * en mode jeu les boutons de création (« + ») et certains contrôles d'édition,
 * que la feuille de style du module masque grâce à elle. Une classe plutôt
 * qu'un retrait du DOM : dnd5e ajoute certains de ces boutons après
 * `_renderModeToggle` (bouton de création de l'inventaire).
 *
 * @type {string}
 */
export const RIGHTS_LIMITED_CLASS = "fq-rights-limited";

/**
 * Libellés (`label`) des entrées des menus contextuels dnd5e (objets, effets,
 * activités) qui créent, modifient ou suppriment un document.
 *
 * @type {string[]}
 */
const EDITING_CONTEXT_ENTRIES = Object.freeze([
    "DND5E.ContextMenuActionEdit",
    "DND5E.ContextMenuActionDuplicate",
    "DND5E.ContextMenuActionDelete",
    "DND5E.Scroll.CreateScroll"
]);

/**
 * Retire (et n'ajoute jamais) la bascule de mode de l'en-tête d'une feuille si
 * les droits du joueur sont limités, et marque la fenêtre de
 * {@link RIGHTS_LIMITED_CLASS}. Le mode est reverrouillé au passage : le rendu
 * recalcule les classes de la fenêtre juste après cet appel.
 *
 * @param {object} sheet - La feuille dnd5e concernée.
 *
 * @returns {boolean} True si la bascule a été retirée (le comportement natif ne doit pas s'appliquer).
 */
export function removeModeToggle(sheet) {
    const limited = lockPlayMode(sheet);
    sheet.element?.classList.toggle(RIGHTS_LIMITED_CLASS, limited);
    if (!limited) return false;
    sheet.element?.querySelector(".window-header .mode-slider")?.remove();
    return true;
}

/**
 * Retire d'un menu contextuel dnd5e les entrées d'édition (modifier, dupliquer,
 * supprimer, créer un parchemin) si les droits du joueur sont limités. Le
 * tableau est modifié sur place : dnd5e ouvre le menu avec cette même référence
 * après l'appel de ses hooks.
 *
 * @param {object[]} menuItems - Les entrées du menu contextuel.
 *
 * @returns {void}
 */
export function stripEditingContextOptions(menuItems) {
    if (!Constants.isPlayerRightsLimited) return;
    for (let i = menuItems.length - 1; i >= 0; i--) {
        if (EDITING_CONTEXT_ENTRIES.includes(menuItems[i]?.label)) menuItems.splice(i, 1);
    }
}
