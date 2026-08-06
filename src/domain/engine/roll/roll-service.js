import Damage from "./damage.js";
import Constants from "../../constants.js";

/**
 * Service de jets de dés et de substitution des bonus de caractéristiques dans
 * les formules (@str, @dex…).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class RollService {

    /**
     * Lance un jet de dés et attend le résultat, avec affichage optionnel dans le chat.
     *
     * @param {string|number} formula        - La formule de jet (convertie en chaîne).
     * @param {boolean}       [display=false] - Si true, publie le résultat dans un message de chat.
     * @param {Promise[]}     [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice :
     *        la promesse du jet y est empilée (au lieu d'être attendue) pour un affichage simultané ;
     *        l'appelant attend l'ensemble via `Promise.all` au bon moment.
     *
     * @returns {Promise<number>} Le total du jet.
     */
    static async rollResultAsync(formula, display = false, dsnAnimations = []) {
        const roll = await new Roll(formula.toString()).evaluate();
        if (display === false) {
            return roll.total;
        }
        Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
        const msg = await roll.toMessage();
        // Même principe que Damage : on empile la promesse d'animation dans le
        // collecteur fourni au lieu de l'attendre, pour un affichage simultané des dés.
        if (game.dice3d && roll.isDeterministic === false) {
            dsnAnimations.push(game.dice3d.waitFor3DAnimationByMessageID(msg.id));
        }
        return roll.total;
    }

    /**
     * Remplace dans une chaîne les références de caractéristiques (@str, @dex,
     * @con, @int, @wis, @cha) par le modificateur correspondant du personnage.
     *
     * @param {string} str - La chaîne contenant d'éventuelles références.
     *
     * @returns {string} La chaîne avec les modificateurs substitués.
     */
    static replaceAbilitiesBonus(str) {
        return str.replaceAll("@str", Constants.actorAbi.str.mod.toString())
            .replaceAll("@dex", Constants.actorAbi.dex.mod.toString())
            .replaceAll("@con", Constants.actorAbi.con.mod.toString())
            .replaceAll("@int", Constants.actorAbi.int.mod.toString())
            .replaceAll("@wis", Constants.actorAbi.wis.mod.toString())
            .replaceAll("@cha", Constants.actorAbi.cha.mod.toString());
    }

    /**
     * Indique si une chaîne référence une caractéristique dont le modificateur du
     * personnage est positif (sert à décider d'afficher un indicateur de bonus).
     *
     * @param {string} str - La chaîne à inspecter.
     *
     * @returns {boolean} True si au moins une caractéristique référencée a un modificateur > 0.
     */
    static hasAbilitiesBonus(str) {
        return (str.includes("@str") && Constants.actorAbi.str.mod > 0) ||
         (str.includes("@dex") && Constants.actorAbi.dex.mod > 0) ||
         (str.includes("@con") && Constants.actorAbi.con.mod > 0) ||
         (str.includes("@int") && Constants.actorAbi.int.mod > 0) ||
         (str.includes("@wis") && Constants.actorAbi.wis.mod > 0) ||
         (str.includes("@cha") && Constants.actorAbi.cha.mod > 0);
    }
}
