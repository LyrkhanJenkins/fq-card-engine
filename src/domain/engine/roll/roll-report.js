/**
 * Rôles possibles d'un jet dans un rapport : ils déterminent où le jet est rangé
 * et comment il sera présenté (au centre pour les dégâts et les soins, sur les
 * côtés pour le critique et l'esquive).
 *
 * @type {Readonly<object>}
 */
export const ROLL_ROLE = Object.freeze({
    DAMAGE: "damage",
    HEAL: "heal"
});

/**
 * Rapport d'une résolution de carte ou d'activité : rassemble tout ce qui a été
 * jeté et décidé au cours d'un même effet — entête, jet principal et le détail
 * de ses dés, critique, esquive par cible, jets de formules d'effets, valeurs
 * appliquées et messages.
 *
 * Le rapport ne contient QUE des données simples (nombres, chaînes, ids) : il
 * est destiné à être sérialisé tel quel (`toObject`) et transmis aux autres
 * clients. Un document Foundry placé dedans le rendrait intransmissible ; les
 * cibles y sont donc désignées par leur id de jeton et leur nom, jamais par
 * l'objet lui-même.
 */
export default class RollReport {

    constructor() {
        /** @type {object} L'entête : qui joue quoi, sur qui. */
        this.header = {
            actorName: null,
            cardName: null,
            deckName: null,
            choiceName: null,
            xValue: null,
            yValue: null,
            /**
             * Mention distinguant cette résolution des autres (attaque
             * d'opportunité…), déjà localisée. Sans elle, une attaque
             * d'opportunité serait indiscernable d'une attaque ordinaire.
             */
            tag: null,
            targets: []
        };

        /** @type {?string} Le rôle du jet principal (`ROLL_ROLE`), null si la carte n'en a pas. */
        this.kind = null;

        /** @type {?object} Le jet de dégâts ou de soins : formule, dés, total. */
        this.mainRoll = null;

        /** @type {?object} Le jet de critique : dé, seuil, réussite. Null si aucun critique n'est possible. */
        this.critical = null;

        /** @type {object[]} Une entrée par cible : dé d'esquive, seuil, verdict. */
        this.evasions = [];

        /** @type {object[]} Les valeurs réellement appliquées, une par cible. */
        this.results = [];

        /** @type {object[]} Les jets des formules d'effets de la carte. */
        this.extraRolls = [];

        /** @type {string[]} Les messages de la carte, déjà localisés. */
        this.messages = [];
    }

    /**
     * Extrait d'un jet évalué le détail de ses dés, sous une forme simple
     * affichable et transmissible. Les résultats écartés (relance, garde du
     * meilleur…) sont ignorés : seuls comptent les dés qui participent au total.
     *
     * @param {Roll} roll - Le jet déjà évalué.
     *
     * @returns {{sides: number, value: number}[]} Le détail des dés actifs.
     */
    static diceOf(roll) {
        const dice = [];
        for (const term of roll?.dice ?? []) {
            for (const result of term?.results ?? []) {
                if (result?.active === false) {
                    continue;
                }
                dice.push({sides: term.faces, value: result.result});
            }
        }
        return dice;
    }

    /**
     * Renseigne l'entête du rapport. Les champs absents laissent la valeur
     * précédente inchangée, ce qui permet de compléter l'entête en plusieurs fois
     * (le nom de la carte et les cibles ne sont pas connus au même endroit).
     *
     * @param {object} fields - Les champs d'entête à poser.
     *
     * @returns {void}
     */
    setHeader(fields) {
        this.header = {...this.header, ...fields};
    }

    /**
     * Enregistre le jet principal de l'effet et fixe le rôle du rapport.
     *
     * @param {object} data          - Le jet principal.
     * @param {string} data.role     - Le rôle du jet (`ROLL_ROLE`).
     * @param {string} data.formula  - La formule jetée.
     * @param {object[]} data.dice   - Le détail des dés (voir `diceOf`).
     * @param {number} data.total    - Le total du jet.
     * @param {?string} [data.bonus] - Le bonus d'acteur ajouté APRÈS coup, quand il ne
     *        figure pas déjà dans la formule (chemin dnd5e, où le bonus fait un second jet).
     *
     * @returns {void}
     */
    setMainRoll({role, formula, dice, total, bonus = null}) {
        this.kind = role;
        this.mainRoll = {formula, dice, total, bonus};
    }

    /**
     * Enregistre le jet de critique. Un rapport sans critique enregistré signifie
     * qu'aucun critique n'était possible — aucun dé n'a alors été lancé.
     *
     * @param {object}  data           - Le jet de critique.
     * @param {number}  data.roll      - Le résultat du dé.
     * @param {number}  data.threshold - Le seuil à atteindre.
     * @param {boolean} data.hit       - True si le seuil est atteint.
     *
     * @returns {void}
     */
    setCritical({roll, threshold, hit}) {
        this.critical = {roll, threshold, hit};
    }

    /**
     * Enregistre la tentative d'esquive d'une cible. `roll` et `threshold` valent
     * null lorsque la cible n'a aucun score d'esquive : aucun dé n'est lancé, mais
     * la cible figure quand même au rapport pour que l'absence d'esquive se lise.
     *
     * @param {object}  data               - La tentative d'esquive.
     * @param {string}  data.targetTokenId - L'id du jeton ciblé.
     * @param {string}  data.targetName    - Le nom du jeton ciblé.
     * @param {?number} data.roll          - Le résultat du dé, ou null.
     * @param {?number} data.threshold     - Le seuil à atteindre, ou null.
     * @param {boolean} data.evaded        - True si la cible esquive.
     *
     * @returns {void}
     */
    addEvasion({targetTokenId, targetName, roll, threshold, evaded}) {
        this.evasions.push({targetTokenId, targetName, roll, threshold, evaded});
    }

    /**
     * Enregistre la valeur réellement appliquée à une cible.
     *
     * @param {object}  data               - Le résultat pour cette cible.
     * @param {string}  data.targetTokenId - L'id du jeton ciblé.
     * @param {string}  data.targetName    - Le nom du jeton ciblé.
     * @param {number}  data.value         - La valeur appliquée.
     * @param {string}  data.type          - Le type d'application (« damageFQ » ou « healFQ »).
     * @param {boolean} data.critical      - True si le jet était critique.
     * @param {boolean} data.evasion       - True si la cible a esquivé.
     *
     * @returns {void}
     */
    addResult({targetTokenId, targetName, value, type, critical, evasion}) {
        this.results.push({targetTokenId, targetName, value, type, critical, evasion});
    }

    /**
     * Enregistre le jet d'une formule d'effets de la carte.
     *
     * @param {object}   data         - Le jet supplémentaire.
     * @param {string}   data.title   - Le titre de la formule d'effets.
     * @param {string}   data.formula - La formule jetée.
     * @param {object[]} data.dice    - Le détail des dés (vide pour une formule purement numérique).
     * @param {number}   data.total   - Le total obtenu.
     * @param {boolean}  data.hit     - True si le total déclenche un effet.
     *
     * @returns {void}
     */
    addExtraRoll({title, formula, dice, total, hit}) {
        this.extraRolls.push({title, formula, dice, total, hit});
    }

    /**
     * Ajoute des messages de carte déjà localisés au rapport.
     *
     * @param {string[]} messages - Les messages à ajouter.
     *
     * @returns {void}
     */
    addMessages(messages) {
        if (Array.isArray(messages) && messages.length > 0) {
            this.messages.push(...messages);
        }
    }

    /**
     * Le rapport porte-t-il quoi que ce soit à montrer ? Une carte purement
     * utilitaire — pioche, défausse, récupération — n'a ni jet ni résultat à
     * annoncer, et ne doit donc ni ouvrir de fenêtre, ni publier de message, ni
     * occuper le socket.
     *
     * Statique et non méthode d'instance : le rapport traverse le socket sous sa
     * forme nue, et les clients qui le reçoivent doivent pouvoir poser la même
     * question à un simple objet.
     *
     * @param {RollReport|object} report - Le rapport, sous sa forme vive ou nue.
     *
     * @returns {boolean} True s'il y a un jet, un résultat ou un message.
     */
    static hasContent(report) {
        return !!report?.mainRoll
            || (report?.results?.length ?? 0) > 0
            || (report?.extraRolls?.length ?? 0) > 0
            || (report?.messages?.length ?? 0) > 0;
    }

    /**
     * Copie simple et transmissible du rapport : c'est cette forme qui traverse
     * le socket.
     *
     * @returns {object} Le rapport sous forme de données pures.
     */
    toObject() {
        return {
            header: {...this.header, targets: [...this.header.targets]},
            kind: this.kind,
            mainRoll: this.mainRoll ? {...this.mainRoll, dice: [...this.mainRoll.dice]} : null,
            critical: this.critical ? {...this.critical} : null,
            evasions: this.evasions.map(evasion => ({...evasion})),
            results: this.results.map(result => ({...result})),
            extraRolls: this.extraRolls.map(extra => ({...extra, dice: [...extra.dice]})),
            messages: [...this.messages]
        };
    }
}
