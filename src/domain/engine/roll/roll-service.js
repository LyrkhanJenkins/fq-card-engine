import Constants from "../../constants.js";

/**
 * Service de jets de dés et de substitution des bonus de caractéristiques dans
 * les formules (@str, @dex…).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class RollService {

    /**
     * Évalue une formule de façon SYNCHRONE
     *
     * @param {string|number} formula - La formule de jet (convertie en chaîne).
     *
     * @returns {number} Le total du jet.
     */
    static rollResultSync(formula) {
        return new Roll(formula.toString()).evaluateSync().total;
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
        if (typeof str !== "string") return false;
        return (str.includes("@str") && Constants.actorAbi.str.mod > 0) ||
         (str.includes("@dex") && Constants.actorAbi.dex.mod > 0) ||
         (str.includes("@con") && Constants.actorAbi.con.mod > 0) ||
         (str.includes("@int") && Constants.actorAbi.int.mod > 0) ||
         (str.includes("@wis") && Constants.actorAbi.wis.mod > 0) ||
         (str.includes("@cha") && Constants.actorAbi.cha.mod > 0);
    }
}
