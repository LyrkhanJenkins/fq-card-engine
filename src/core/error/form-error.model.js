/**
 * Erreur métier levée lors de la validation du formulaire de jeu d'une carte
 * (dialogue « Jouer la carte »). Permet à Foundry d'afficher un message d'erreur
 * localisé sans interrompre le flux applicatif.
 *
 * @extends Error
 */
export default class FormError extends Error {
    /**
     * Construit l'erreur et remplace le nom (`this.name`) par le libellé localisé
     * afin qu'il soit affiché correctement dans la notification Foundry.
     *
     * @param {...*} args - Les arguments transmis au constructeur natif `Error`
     *                      (généralement le message d'erreur déjà localisé).
     */
    constructor(...args) {
        super(...args);
        this.name = game.i18n.localize("FQCARDENGINE.DialogPlayFormError");
    }
}
