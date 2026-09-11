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

        /**
         * @type {object[]} Une entrée par cible pour le jet POUR TOUCHER, quand la
         * carte en demande un : dé, modificateur, seuil (classe d'armure ou DD) et
         * verdict de protection. Vide pour une carte sans jet pour toucher.
         */
        this.hits = [];

        /** @type {object[]} Les valeurs réellement appliquées, une par cible. */
        this.results = [];

        /** @type {object[]} Les jets des formules d'effets de la carte. */
        this.extraRolls = [];

        /**
         * @type {object[]} Une entrée par cible touchée par un effet de la carte :
         * `{targetTokenId, targetName, effects: [{label, count}]}`, les libellés
         * déjà localisés. Une cible qui n'a rien subi n'y figure pas.
         */
        this.effects = [];

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
     * @param {boolean} [data.defenseless] - True si la cible n'a plus aucune défense
     *        (paralysée, inconsciente) : elle n'esquive pas, et aucun dé n'est lancé.
     * @param {object[]} [data.autoCauses] - Les raisons `{side, cause}` de cette absence.
     *
     * @returns {void}
     */
    addEvasion({targetTokenId, targetName, roll, threshold, evaded, defenseless = false, autoCauses = []}) {
        // Les champs de la cible sans défense ne sont posés que pour elle : une
        // esquive ordinaire garde exactement sa forme de toujours.
        this.evasions.push({
            targetTokenId, targetName, roll, threshold, evaded,
            ...(defenseless ? {defenseless: true, autoCauses} : {})
        });
    }

    /**
     * Enregistre le jet POUR TOUCHER contre une cible.
     *
     * Le `kind` dit qui a jeté : « ac » pour un jet d'attaque du lanceur contre
     * la classe d'armure, « save » pour la sauvegarde de la cible contre un DD.
     * Dans les deux cas, `defended` signifie que la cible s'est protégée.
     *
     * @param {object}  data               - Le jet pour toucher.
     * @param {string}  data.targetTokenId - L'id du jeton ciblé.
     * @param {string}  data.targetName    - Le nom du jeton ciblé.
     * @param {string}  data.kind          - « ac » ou « save ».
     * @param {?number} data.roll          - Le d20 retenu, ou null quand aucun dé n'a compté.
     * @param {number}  data.modifier      - Le modificateur ajouté au dé.
     * @param {?number} data.total         - Le total du jet, ou null sans dé.
     * @param {number}  data.threshold     - La classe d'armure ou le DD.
     * @param {boolean} data.defended      - True si la cible est protégée.
     * @param {number[]} [data.dice]       - Les d20 jetés : deux en avantage ou désavantage.
     *        Pour une attaque, ce sont les dés COMMUNS à toute la carte.
     * @param {number}  [data.mode]        - Le mode du jet contre cette cible (1, -1, 0).
     * @param {?string} [data.auto]        - « fail » (sauvegarde ratée d'office) ou
     *        « defenseless » (cible sans défense), null pour un jet ordinaire.
     * @param {object[]} [data.advantages]    - Les raisons `{side, cause}` d'avantage.
     * @param {object[]} [data.disadvantages] - Les raisons `{side, cause}` de désavantage.
     * @param {object[]} [data.autoCauses]    - Les raisons `{side, cause}` de l'issue forcée.
     *
     * @returns {void}
     */
    addHit({targetTokenId, targetName, kind, roll, modifier, total, threshold, defended,
        dice = roll === null || roll === undefined ? [] : [roll], mode = 0, auto = null,
        advantages = [], disadvantages = [], autoCauses = []}) {
        this.hits.push({
            targetTokenId, targetName, kind, roll, modifier, total, threshold, defended,
            dice, mode, auto, advantages, disadvantages, autoCauses
        });
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
     * @param {boolean} [data.defended]    - True si la cible s'est protégée (armure ou sauvegarde).
     *
     * @returns {void}
     */
    addResult({targetTokenId, targetName, value, type, critical, evasion, defended = false, traits = []}) {
        // Le détail des résistances n'est posé que s'il y en a : un résultat
        // ordinaire garde exactement sa forme de toujours.
        this.results.push({
            targetTokenId, targetName, value, type, critical, evasion, defended,
            ...(traits.length ? {traits} : {})
        });
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
     * Enregistre les effets posés sur des cibles par une formule d'effets. Une
     * cible déjà touchée par une autre formule de la carte cumule ses effets, et
     * un même effet voit son compte s'additionner.
     *
     * @param {{targetTokenId: string, targetName: string}[]} targets - Les cibles qui subissent les effets.
     * @param {{label: string, count: number}[]} effects - Les effets, libellés déjà localisés.
     *
     * @returns {void}
     */
    addEffects(targets, effects) {
        if (!effects?.length) {
            return;
        }
        for (const {targetTokenId, targetName} of targets ?? []) {
            let entry = this.effects.find(known => known.targetTokenId === targetTokenId);
            if (!entry) {
                entry = {targetTokenId, targetName, effects: []};
                this.effects.push(entry);
            }
            for (const {label, count} of effects) {
                const known = entry.effects.find(effect => effect.label === label);
                if (known) {
                    known.count += count;
                } else {
                    entry.effects.push({label, count});
                }
            }
        }
    }

    /**
     * Le libellé d'un effet tel que la fenêtre et le chat l'affichent : son nom,
     * suivi du nombre de cumuls quand il y en a plusieurs (« Brûlure ×3 »).
     *
     * @param {{label: string, count: number}} effect - L'effet du rapport.
     *
     * @returns {string} Le libellé affiché.
     */
    static effectTag({label, count}) {
        return count > 1 ? `${label} ×${count}` : label;
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
            || (report?.effects?.length ?? 0) > 0
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
            evasions: this.evasions.map(evasion => ({
                ...evasion,
                ...(evasion.autoCauses ? {autoCauses: evasion.autoCauses.map(reason => ({...reason}))} : {})
            })),
            hits: this.hits.map(hit => ({
                ...hit,
                dice: [...hit.dice],
                advantages: hit.advantages.map(reason => ({...reason})),
                disadvantages: hit.disadvantages.map(reason => ({...reason})),
                autoCauses: hit.autoCauses.map(reason => ({...reason}))
            })),
            results: this.results.map(result => ({
                ...result,
                ...(result.traits ? {traits: result.traits.map(part => ({...part, kinds: [...part.kinds]}))} : {})
            })),
            extraRolls: this.extraRolls.map(extra => ({...extra, dice: [...extra.dice]})),
            effects: this.effects.map(entry => ({...entry, effects: entry.effects.map(effect => ({...effect}))})),
            messages: [...this.messages]
        };
    }
}
