/**
 * Error that can be thrown during the advancement update preparation process.
 */
export default class FormError extends Error {
    constructor(...args) {
        super(...args);
        this.name = game.i18n.localize("FQCARDENGINE.DialogPlayFormError");
    }
}
