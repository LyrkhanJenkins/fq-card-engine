/**
 * Comptabilité des réactions d'opportunité : une par round, sans coût en points
 * d'action.
 *
 * Le budget est porté par le TOKEN, pas par l'acteur : deux jetons issus d'un
 * même acteur sont deux réactants distincts, et c'est un TokenDocument que la
 * détection (`reach-profile.js`) désigne comme observateur.
 *
 * La consommation est mémorisée sous la forme `{combat, round}` et non d'un
 * simple numéro de round : les rounds repartent à 1 à chaque nouveau combat, et
 * un round mémorisé seul rendrait faussement la réaction indisponible au même
 * numéro de round du combat suivant. Aucune remise à zéro n'est donc nécessaire
 * — ni au changement de round, ni à la fin du combat : le couple mémorisé cesse
 * de correspondre de lui-même.
 *
 * `ResourceHandler` n'est volontairement pas sollicité : l'attaque d'opportunité
 * ne coûte ni point d'action, ni mana, ni zèle. Sa garde
 * `validateUseSpellInTurn` bloquerait d'ailleurs la réaction par construction,
 * puisqu'une attaque d'opportunité se produit HORS du tour du réactant.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ReactionBudget {

    /**
     * Clé du flag de consommation, sous le scope du module.
     * @type {string}
     */
    static FLAG_KEY = "opportunityReaction";

    /**
     * Prédicat PUR de disponibilité : la réaction est disponible sauf si elle a
     * déjà été consommée dans ce combat ET à ce round.
     *
     * Hors combat — pas d'identifiant de combat, ou round inférieur à 1 (combat
     * créé mais non démarré) — la réaction n'est jamais disponible : une attaque
     * d'opportunité n'existe pas sans round pour la comptabiliser.
     *
     * @param {?{combat: string, round: number}} spent    - La consommation mémorisée, ou `null`.
     * @param {?string}                          combatId - L'identifiant du combat en cours.
     * @param {?number}                          round    - Le round en cours.
     *
     * @returns {boolean} `true` si le réactant dispose encore de sa réaction.
     */
    static isReactionAvailable(spent, combatId, round) {
        if (!combatId || !Number.isFinite(round) || round < 1) {
            return false;
        }
        return !(spent?.combat === combatId && spent?.round === round);
    }

    /**
     * Consommation mémorisée sur un token, lue directement dans ses flags.
     * Renvoie `null` si le token, le module ou le flag sont absents.
     *
     * @param {object} token - Le TokenDocument réactant.
     *
     * @returns {?{combat: string, round: number}} La consommation mémorisée, ou `null`.
     */
    static readSpent(token) {
        const moduleName = globalThis.FqCardEngineModule?.moduleName;
        if (!token || !moduleName) {
            return null;
        }
        return token.flags?.[moduleName]?.[ReactionBudget.FLAG_KEY] ?? null;
    }

    /**
     * Disponibilité effective de la réaction d'un token dans le combat courant.
     *
     * @param {object} token    - Le TokenDocument réactant.
     * @param {object} [combat] - Le combat de référence (défaut : le combat courant).
     *
     * @returns {boolean} `true` si le réactant dispose encore de sa réaction.
     */
    static isAvailable(token, combat = game.combat) {
        return ReactionBudget.isReactionAvailable(
            ReactionBudget.readSpent(token), combat?.id, combat?.round);
    }

    /**
     * Marque la réaction d'un token comme consommée pour le round courant.
     *
     * Écrit un flag sur le TokenDocument : à n'appeler que depuis un client
     * habilité à le faire — le MJ désigné, conformément à la garde de la couche
     * de déclenchement. Ne vérifie pas la disponibilité : c'est à l'appelant de
     * l'avoir fait, pour que la décision et son enregistrement restent
     * séparés.
     *
     * @param {object} token    - Le TokenDocument réactant.
     * @param {object} [combat] - Le combat de référence (défaut : le combat courant).
     *
     * @returns {Promise<boolean>} `true` si la consommation a été enregistrée.
     */
    static async consume(token, combat = game.combat) {
        const moduleName = globalThis.FqCardEngineModule?.moduleName;
        const round = combat?.round;
        if (!token || !moduleName || !combat?.id || !Number.isFinite(round) || round < 1) {
            return false;
        }
        await token.setFlag(moduleName, ReactionBudget.FLAG_KEY, {combat: combat.id, round});
        return true;
    }
}
