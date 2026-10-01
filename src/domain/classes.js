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
 * Il tient aussi la table des SPÉCIALISATIONS de chaque classe (bas de
 * fichier). Celle-là n'est pas un registre : elle est écrite en dur, une spé
 * faisant partie de la caractérisation d'une classe et non de ce qu'un monde
 * déclare.
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

/* -------------------------------------------- */
/*  Spécialisations                             */

/* -------------------------------------------- */

/**
 * Le séparateur d'un identifiant de spécialisation, entre la classe et la spé :
 * `"elementalist.fire"`. Un point, parce qu'aucun identifiant de classe n'en
 * contient — le tiret est déjà dans `fencing-master` et rendrait la coupure
 * ambiguë.
 * @type {string}
 */
export const SPEC_SEPARATOR = ".";

/**
 * Le nombre maximum de spécialisations qu'une carte peut porter. La gemme de la
 * carte se partage entre elles : au-delà, les quartiers ne se lisent plus.
 *
 * C'est une borne de CONTENU, pas de schéma : le `SetField` en accepterait
 * davantage sans broncher. Elle est tenue par le test d'intégrité des decks, et
 * la gemme (`buildSpecGem`, `card-svg/display-card.js`) s'en sert pour découper
 * ses quartiers.
 * @type {number}
 */
export const MAX_CARD_SPECS = 4;

/**
 * Les spécialisations fournies par le moteur : identifiant de classe vers la
 * table de SES spécialisations, identifiant court vers clé de localisation.
 *
 * Table écrite EN TOUTES LETTRES comme `BASE_FQ_CLASSES`, pour la même raison :
 * une clé construite par concaténation serait introuvable à la recherche dans le
 * dépôt.
 *
 * L'ordre d'écriture est celui du rendu : c'est lui qui ordonne les quartiers de
 * la gemme d'une carte, pour que deux cartes aux mêmes spés se dessinent pareil
 * quel que soit l'ordre dans lequel on a cliqué les cases.
 *
 * Les classes absentes de cette table n'ont pas de spécialisation : le neutre,
 * qui n'appartient à personne, et le guerrier runique, pas encore caractérisé
 * (`devNotes/CLASSES.md`).
 * @type {Object<string, Object<string, string>>}
 */
export const BASE_FQ_SPECIALIZATIONS = Object.freeze({
    "elementalist": Object.freeze({
        "fire": "FQCARDENGINE.SpecElementalistFire",
        "frost": "FQCARDENGINE.SpecElementalistFrost",
        "earth": "FQCARDENGINE.SpecElementalistEarth",
        "air": "FQCARDENGINE.SpecElementalistAir"
    }),
    "fencing-master": Object.freeze({
        "melee": "FQCARDENGINE.SpecFencingMasterMelee",
        "ranged": "FQCARDENGINE.SpecFencingMasterRanged",
        "thrown": "FQCARDENGINE.SpecFencingMasterThrown"
    }),
    "guardian": Object.freeze({
        "berserker": "FQCARDENGINE.SpecGuardianBerserker",
        "bulwark": "FQCARDENGINE.SpecGuardianBulwark",
        "guardian-angel": "FQCARDENGINE.SpecGuardianGuardianAngel"
    }),
    "illusionist": Object.freeze({
        "reaching-blade": "FQCARDENGINE.SpecIllusionistReachingBlade",
        "bard": "FQCARDENGINE.SpecIllusionistBard",
        "chronomancer": "FQCARDENGINE.SpecIllusionistChronomancer"
    }),
    "monk": Object.freeze({
        "chain": "FQCARDENGINE.SpecMonkChain",
        "full-hand": "FQCARDENGINE.SpecMonkFullHand",
        "palm": "FQCARDENGINE.SpecMonkPalm"
    }),
    "trapper": Object.freeze({
        "sniper": "FQCARDENGINE.SpecTrapperSniper",
        "traps": "FQCARDENGINE.SpecTrapperTraps",
        "beastmaster": "FQCARDENGINE.SpecTrapperBeastmaster"
    }),
    "white-mage": Object.freeze({
        "healing": "FQCARDENGINE.SpecWhiteMageHealing",
        "curse": "FQCARDENGINE.SpecWhiteMageCurse",
        "haunt": "FQCARDENGINE.SpecWhiteMageHaunt"
    }),
    "witch": Object.freeze({
        "army": "FQCARDENGINE.SpecWitchArmy",
        "colossus": "FQCARDENGINE.SpecWitchColossus",
        "charnel": "FQCARDENGINE.SpecWitchCharnel"
    })
});

/**
 * Les spécialisations déclarées, à plat : identifiant complet vers son
 * identifiant de classe et sa clé de libellé, dans l'ordre d'écriture de
 * `BASE_FQ_SPECIALIZATIONS`.
 *
 * Aplatie une fois à l'import : `sortCardSpecs` est appelé au rendu de CHAQUE
 * carte, et la table d'ordre lui épargne un parcours de la table imbriquée.
 * @type {Map<string, {classId: string, labelKey: string}>}
 */
const specRegistry = new Map(Object.entries(BASE_FQ_SPECIALIZATIONS).flatMap(
    ([classId, specs]) => Object.entries(specs).map(
        ([specId, labelKey]) => [`${classId}${SPEC_SEPARATOR}${specId}`, {classId, labelKey}])));

/**
 * L'identifiant complet d'une spécialisation, celui que portent les cartes.
 *
 * @param {string} classId - L'identifiant de la classe (`"elementalist"`).
 * @param {string} specId - L'identifiant court de la spé (`"fire"`).
 *
 * @returns {string} L'identifiant complet (`"elementalist.fire"`).
 */
export function fqSpecId(classId, specId) {
    return `${classId}${SPEC_SEPARATOR}${specId}`;
}

/**
 * La classe à laquelle appartient une spécialisation, lue dans son identifiant.
 *
 * Découpe sur le PREMIER séparateur : un identifiant de classe peut contenir des
 * tirets (`fencing-master`), jamais de point. Lu dans l'identifiant et non dans
 * le registre : la classe d'une spé retirée du code se lit encore, ce dont le
 * formulaire a besoin pour faire le ménage quand on change la classe d'une carte.
 *
 * @param {string} specId - L'identifiant complet de la spé (`"elementalist.fire"`).
 *
 * @returns {string} L'identifiant de la classe, ou la chaîne vide si l'identifiant est mal formé.
 */
export function fqSpecClassId(specId) {
    if (typeof specId !== "string") {
        return "";
    }
    const cut = specId.indexOf(SPEC_SEPARATOR);
    return cut === -1 ? "" : specId.slice(0, cut);
}

/**
 * Toutes les spécialisations déclarées, en table de choix PLATE pour un champ de
 * schéma : identifiant complet vers clé de localisation.
 *
 * Plate et complète, parce que les `choices` d'un champ sont figées au schéma, à
 * la première carte instanciée : le champ doit admettre les spés de toutes les
 * classes, et c'est le FORMULAIRE qui n'offre que celles de la classe de la carte
 * (`fqSpecChoicesOf`).
 *
 * Un objet neuf à chaque appel, jamais la table elle-même : Foundry conserve
 * celle qu'on lui donne.
 *
 * @returns {Object<string, string>} Les choix de spécialisation.
 */
export function fqSpecChoices() {
    return Object.fromEntries([...specRegistry].map(([specId, {labelKey}]) => [specId, labelKey]));
}

/**
 * Les spécialisations d'UNE classe, en table de choix : identifiant complet vers
 * clé de localisation. Pour le formulaire de carte, qui n'offre que les spés de
 * la classe choisie.
 *
 * Rend une table vide pour une classe sans spécialisation déclarée — le neutre,
 * une classe apportée par un module de contenu : le formulaire masque alors son
 * champ de spécialisation.
 *
 * @param {string} classId - L'identifiant de la classe.
 *
 * @returns {Object<string, string>} Les choix de spécialisation de cette classe.
 */
export function fqSpecChoicesOf(classId) {
    const specs = BASE_FQ_SPECIALIZATIONS[classId];
    if (!specs) {
        return {};
    }
    return Object.fromEntries(Object.entries(specs).map(
        ([specId, labelKey]) => [fqSpecId(classId, specId), labelKey]));
}

/**
 * La clé de localisation du libellé d'une spécialisation.
 *
 * @param {string} specId - L'identifiant complet de la spé.
 *
 * @returns {string} La clé de libellé, ou la chaîne vide si la spé n'est pas déclarée.
 */
export function fqSpecLabelKey(specId) {
    return specRegistry.get(specId)?.labelKey ?? "";
}

/**
 * Cette spécialisation est-elle déclarée ?
 *
 * @param {string} specId - L'identifiant complet de la spé.
 *
 * @returns {boolean} True si la spécialisation est déclarée.
 */
export function hasFqSpec(specId) {
    return specRegistry.has(specId);
}

/**
 * Les spécialisations d'une carte, remises dans l'ordre de déclaration et
 * débarrassées de ce qui ne la concerne plus.
 *
 * Trois raisons de ne pas rendre le `Set` tel quel :
 * - il garde l'ordre des CLICS, ce qui dessinerait deux gemmes différentes pour
 *   deux cartes aux mêmes spés ;
 * - une carte peut porter une spé disparue du code (renommée, retirée), qui n'a
 *   plus ni libellé ni couleur à donner à son quartier ;
 * - elle peut porter une spé d'une AUTRE classe, quand on a changé la classe
 *   d'une carte déjà spécialisée. C'est la classe de la carte qui fait foi, et
 *   l'identifiant d'une spé dit à quelle classe elle appartient : filtrer à la
 *   LECTURE évite de réécrire les données de la carte pour si peu, et une spé
 *   rendue muette ici reparaît intacte si on revient à sa classe.
 *
 * @param {Set<string>|string[]|null} [specs] - Les spés de la carte (`system.fq.specs`).
 * @param {?string} [classId] - La classe de la carte (`system.fq.class`) ; sans elle,
 *        aucun filtrage par classe.
 *
 * @returns {string[]} Les identifiants retenus, dans l'ordre de déclaration.
 */
export function sortCardSpecs(specs, classId = null) {
    if (!specs) {
        return [];
    }
    const held = new Set(specs);
    return [...specRegistry.entries()]
        .filter(([specId, spec]) => held.has(specId) && (classId === null || spec.classId === classId))
        .map(([specId]) => specId);
}
