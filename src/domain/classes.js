/**
 * Registre des classes FQ : source unique des classes déclarées dans le monde
 * courant, pour la liste déroulante du formulaire de carte comme pour les
 * traitements qui itèrent sur les classes réellement disponibles.
 *
 * Les classes fournies par le moteur sont inscrites à l'import. Un module de
 * contenu ajoute les siennes avec `registerFqClass` depuis son hook `init` :
 * Foundry n'appelle `defineSchema` qu'à la première carte instanciée, bien après
 * que tous les modules aient été initialisés, et `CLASS_CHOICE` relit le registre
 * à chaque appel. Un enregistrement plus tardif (`ready`, macro) n'entrerait plus
 * dans le schéma déjà figé.
 *
 * Ce module ne doit importer AUCUN autre module du moteur, pour la même raison
 * qu'`abilities.js` et `weapon-tokens.js` : il est consommé par le SCHÉMA de
 * carte (`card-fq-system.mjs`), et tout import ferait un cycle.
 */

/**
 * La classe de repli, celle des cartes que toutes les classes partagent. Valeur
 * `initial` du champ de classe, et seule entrée que le registre refuse de
 * laisser retirer : le schéma n'aurait plus de repli valide.
 * @type {string}
 */
export const NEUTRAL_CLASS = "neutral";

/**
 * Les classes fournies par le moteur : identifiant vers clé de localisation.
 * Table écrite EN TOUTES LETTRES, comme `ABILITY_CHOICE` (`abilities.js`) : une
 * clé construite par concaténation serait introuvable à la recherche dans le
 * dépôt. `localizeClassKey` (`engine/shared/spellbook-grid.js`) lit cette table,
 * et ne construit la clé que pour une classe absente du registre.
 * @type {Object<string, string>}
 */
export const BASE_FQ_CLASSES = Object.freeze({
    "neutral": "FQCARDENGINE.ClassNeutral",
    "elementalist": "FQCARDENGINE.ClassElementalist",
    "fencing-master": "FQCARDENGINE.ClassFencingMaster",
    "guardian": "FQCARDENGINE.ClassGuardian",
    "illusionist": "FQCARDENGINE.ClassIllusionist",
    "monk": "FQCARDENGINE.ClassMonk",
    "runic-warrior": "FQCARDENGINE.ClassRunicWarrior",
    "trapper": "FQCARDENGINE.ClassTrapper",
    "white-mage": "FQCARDENGINE.ClassWhiteMage",
    "witch": "FQCARDENGINE.ClassWitch"
});

/**
 * L'état du registre. Une `Map` plutôt qu'un objet : l'ordre d'insertion y est
 * garanti, et c'est lui qui ordonne la liste déroulante — les classes du moteur
 * d'abord, celles des modules de contenu ensuite, dans leur ordre de chargement.
 * @type {Map<string, string>}
 */
const registry = new Map(Object.entries(BASE_FQ_CLASSES));

/**
 * Déclare une classe FQ, ou remplace la clé de libellé d'une classe déjà
 * déclarée. Appelé par le moteur pour ses propres classes, et par tout module de
 * contenu qui en apporte d'autres.
 *
 * La chaîne vide est refusée : un `StringField` à liste de choix passe `blank` à
 * `false` et lève sur `""`, ce qui viderait silencieusement les choix de toutes
 * les cartes du monde (voir `tests/system/schema-choice-fields.test.js`).
 *
 * @param {string} classId - L'identifiant de la classe (`"runic-warrior"`).
 * @param {string} labelKey - La clé de localisation de son libellé.
 *
 * @throws {Error} Si l'identifiant ou la clé de libellé est vide.
 * @returns {void}
 */
export function registerFqClass(classId, labelKey) {
    if (typeof classId !== "string" || classId === "") {
        throw new Error("FQ Card Engine : l'identifiant de classe doit être une chaîne non vide.");
    }
    if (typeof labelKey !== "string" || labelKey === "") {
        throw new Error(`FQ Card Engine : la classe « ${classId} » doit déclarer une clé de libellé.`);
    }
    registry.set(classId, labelKey);
}

/**
 * Retire une classe du registre : elle disparaît de la liste déroulante et des
 * parcours de classes. Les cartes qui la portent encore gardent leur valeur —
 * c'est le schéma qui cesse de la proposer, pas les données qui changent.
 *
 * `NEUTRAL_CLASS` ne peut pas être retirée : le champ de classe n'aurait plus de
 * valeur `initial` valide.
 *
 * @param {string} classId - L'identifiant de la classe à retirer.
 *
 * @returns {boolean} True si la classe était déclarée et a été retirée.
 */
export function unregisterFqClass(classId) {
    if (classId === NEUTRAL_CLASS) {
        return false;
    }
    return registry.delete(classId);
}

/**
 * Les classes déclarées en table de choix pour un champ de schéma : identifiant
 * vers clé de localisation. Un objet neuf à chaque appel, jamais le registre
 * lui-même : Foundry conserve la table qu'on lui donne, et une mutation
 * ultérieure du registre modifierait un schéma déjà figé.
 *
 * @returns {Object<string, string>} Les choix de classe, dans l'ordre d'inscription.
 */
export function fqClassChoices() {
    return Object.fromEntries(registry);
}

/**
 * Les identifiants des classes déclarées, dans leur ordre d'inscription. Pour
 * les traitements qui balaient les classes disponibles — génération de decks,
 * rapports — plutôt que de supposer les dix classes du moteur.
 *
 * @returns {string[]} Les identifiants de classe déclarés.
 */
export function fqClassIds() {
    return [...registry.keys()];
}

/**
 * Cette classe est-elle déclarée dans ce monde ? À interroger avant d'aller
 * chercher le contenu d'une classe, le module qui l'apporte pouvant être absent.
 *
 * @param {string} classId - L'identifiant de classe à tester.
 *
 * @returns {boolean} True si la classe est déclarée.
 */
export function hasFqClass(classId) {
    return registry.has(classId);
}
