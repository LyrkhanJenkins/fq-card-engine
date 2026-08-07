import RollService from "../roll/roll-service.js";
import Constants from "../../constants.js";

/**
 * Résolveur déterministe des champs de ciblage (portée, nombre de cibles) d'un
 * choix de carte. Reproduit EXACTEMENT la résolution du pipeline moteur
 * (`CardEffect.prepareDataFromCard`) mais de façon SYNCHRONE et SANS muter le
 * `cardContent` reçu.
 *
 * Pourquoi synchrone : le garde-fou de la dialog doit pouvoir `throw` une
 * `FormError` pour garder la dialog ouverte (comme les gardes `XXX`/`YYY`) ; une
 * résolution asynchrone l'en empêcherait. La résolution synchrone via
 * `Roll.evaluateSync` est sûre car l'invariant « aucun dé dans les champs
 * bloquants » (verrouillé par `tests/decks/no-dice-invariant.test.js`) garantit
 * le déterminisme.
 *
 * Pourquoi non-mutant : `playValidatedCard` retourne ensuite
 * `PlayCard.callBackplayCard(...)` sur le même `cardContent`, que le pipeline
 * re-résout ; muter les champs ici (p. ex. redoubler le bonus de portée) serait
 * un bug.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TargetingResolver {
    /**
     * Résout une formule de champ déterministe, exactement comme le pipeline
     * (`RollService.rollResultAsync` précédé de la substitution amont) : substitue
     * les caractéristiques (@str…), puis les variables X/Y saisies, puis évalue le
     * math de façon synchrone.
     *
     * Évalue TOUJOURS (une chaîne vide donne 0, comme `rollResultAsync("")`) : le
     * choix « valeur brute vs résolue » est porté en amont par le gating de
     * `resolveReach`/`resolveNbTargets` — miroir de `prepareDataFromCard`, qui ne
     * résout les bornes que lorsqu'au moins une portée est déclarée, mais résout
     * alors les DEUX bornes.
     *
     * @param {string|number} rawValue - La valeur brute du champ.
     * @param {object}        fd        - Les données du formulaire (XXX/YYY saisis).
     *
     * @returns {number} La valeur résolue (total du jet déterministe).
     */
    static resolveField(rawValue, fd) {
        let str = RollService.replaceAbilitiesBonus(String(rawValue ?? ""));
        str = str.replaceAll("XXX", fd?.XXX ?? 0).replaceAll("YYY", fd?.YYY ?? 0);
        return new Roll(str).evaluateSync().total;
    }

    /**
     * Résout les portées min/max d'un choix, bonus de portée de l'acteur inclus
     * sur `maxReach` uniquement — exactement comme `prepareDataFromCard`, sans
     * muter le choix.
     *
     * @param {object} cardContent - Le choix de carte.
     * @param {object} fd          - Les données du formulaire.
     *
     * @returns {{minReach: *, maxReach: *}} Les portées résolues, ou brutes si aucune portée n'est déclarée.
     */
    static resolveReach(cardContent, fd) {
        if (cardContent?.minReach || cardContent?.maxReach) {
            return {
                minReach: TargetingResolver.resolveField(cardContent.minReach, fd),
                maxReach: TargetingResolver.resolveField(cardContent.maxReach, fd) + Number(Constants.actorFQ.bonus.range),
            };
        }
        return {minReach: cardContent?.minReach, maxReach: cardContent?.maxReach};
    }

    /**
     * Résout le nombre de cibles d'un choix, sans muter le choix.
     *
     * @param {object} cardContent - Le choix de carte.
     * @param {object} fd          - Les données du formulaire.
     *
     * @returns {*} Le nombre de cibles résolu, ou brut si non renseigné.
     */
    static resolveNbTargets(cardContent, fd) {
        if (cardContent?.nbTargets) {
            return TargetingResolver.resolveField(cardContent.nbTargets, fd);
        }
        return cardContent?.nbTargets;
    }
}
