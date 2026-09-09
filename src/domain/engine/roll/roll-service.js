import Constants from "../../constants.js";
import {ABILITIES} from "../../abilities.js";

// Réexporté pour les appelants historiques : la liste vit désormais dans un
// module sans dépendance, que le schéma de carte peut importer sans cycle.
export {ABILITIES};

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
     * Évalue une valeur de champ de carte en restant synchrone, une valeur vide
     * (chaîne vide, `null`, `undefined`, `0`) valant 0 sans jet — la lecture
     * commune des champs optionnels de portée, de taille de zone et d'angle.
     *
     * @param {string|number} [value] - La valeur brute du champ.
     *
     * @returns {number} Le total du jet, ou 0 si le champ est vide.
     */
    static resolveOrZero(value) {
        return value ? RollService.rollResultSync(value) : 0;
    }

    /**
     * Évalue une formule pouvant contenir des DÉS, en restant synchrone.
     *
     * Foundry refuse d'évaluer un dé en synchrone (un dé peut être fourni par une
     * source externe, donc de façon asynchrone) et lève alors « This Roll contains
     * terms that cannot be synchronously evaluated ». Or la résolution d'une carte
     * doit rester synchrone pour que le garde-fou de la dialog puisse la garder
     * ouverte. Les dés sont donc tirés ici avec le générateur de Foundry, puis la
     * formule devenue déterministe est évaluée normalement. Une formule sans dé
     * passe directement par {@link RollService.rollResultSync}.
     *
     * @param {string|number} formula - La formule de jet (convertie en chaîne).
     *
     * @returns {number} Le total du jet.
     */
    static rollDiceSync(formula) {
        const str = formula.toString();
        try {
            return RollService.rollResultSync(str);
        } catch (error) {
            const rolled = RollService.replaceDiceByResults(str);
            if (rolled === str) {
                throw error;
            }
            return RollService.rollResultSync(rolled);
        }
    }

    /**
     * Remplace chaque notation de dés (`NdM`) d'une formule par le total d'un
     * tirage effectif. Les notations à taille de face calculée (`1d(2*@str)`) ne
     * sont pas concernées : elles restent telles quelles.
     *
     * @param {string} str - La formule contenant d'éventuelles notations de dés.
     *
     * @returns {string} La formule avec les dés remplacés par leur résultat.
     */
    static replaceDiceByResults(str) {
        return str.replace(/(\d*)d(\d+)/gi, (match, count, faces) => {
            const nbDice = Number(count || 1);
            const nbFaces = Number(faces);
            if (!Number.isInteger(nbDice) || !Number.isInteger(nbFaces) || nbDice < 1 || nbFaces < 1) {
                return match;
            }
            let total = 0;
            for (let i = 0; i < nbDice; i++) {
                total += Math.ceil(RollService.randomUniform() * nbFaces);
            }
            return String(total);
        });
    }

    /**
     * Tire un nombre aléatoire dans [0, 1[ via le générateur de Foundry quand il
     * est disponible (respecte une éventuelle configuration de jets), sinon via
     * `Math.random`.
     *
     * @returns {number} Le nombre aléatoire tiré.
     */
    static randomUniform() {
        return typeof CONFIG?.Dice?.randomUniform === "function" ? CONFIG.Dice.randomUniform() : Math.random();
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
        // Un utilisateur sans personnage assigné — typiquement le MJ qui affiche la
        // main d'un joueur — n'a aucune caractéristique à substituer. Les jetons
        // valent alors 0, comme `replaceNamedBonus` le fait déjà pour un bonus nommé
        // absent. Sans ce repli, la lecture lève un TypeError qui remonte jusqu'au
        // rendu de la main et l'annule entièrement, sans message.
        const abilities = Constants.actorAbi;
        const mod = (ability) => Number(abilities?.[ability]?.mod ?? 0).toString();

        return ABILITIES.reduce(
            (result, ability) => result.replaceAll(`@${ability}`, mod(ability)),
            RollService.replaceNamedBonus(str)
        );
    }

    /**
     * Remplace chaque jeton de bonus nommé (`@bonus.<nom>`) par la valeur
     * `system.fq.cardBonus.<nom>` du personnage courant (posée par des effets
     * actifs), ou `0` si aucune valeur n'est déclarée. Les jetons de bonus sont
     * résolus AVANT les caractéristiques : `@bonus.` doit disparaître de la
     * chaîne sans jamais être tronqué par un autre remplacement.
     *
     * @param {string} str - La chaîne contenant d'éventuels jetons `@bonus.<nom>`.
     *
     * @returns {string} La chaîne avec les bonus nommés substitués.
     */
    static replaceNamedBonus(str) {
        return str.replace(/@bonus\.(\w+)/g, (_, name) => {
            const bonus = Number(Constants.actorFQ?.cardBonus?.[name]);
            return Number.isFinite(bonus) ? bonus.toString() : "0";
        });
    }

    /**
     * Indique si une chaîne référence une caractéristique dont le modificateur du
     * personnage est positif (sert à décider d'afficher un indicateur de bonus).
     * Un utilisateur sans personnage assigné — typiquement le MJ qui ouvre le
     * grimoire ou la main d'un joueur — n'a aucune caractéristique à comparer :
     * aucun indicateur n'est alors affiché. Sans ce repli, la lecture lève un
     * TypeError qui remonte jusqu'au rendu des cartes et l'annule entièrement,
     * sans message.
     *
     * @param {string} str - La chaîne à inspecter.
     *
     * @returns {boolean} True si au moins une caractéristique référencée a un modificateur > 0.
     */
    static hasAbilitiesBonus(str) {
        if (typeof str !== "string") return false;
        const abilities = Constants.actorAbi;
        return ABILITIES.some(ability => str.includes(`@${ability}`) && abilities?.[ability]?.mod > 0);
    }
}
