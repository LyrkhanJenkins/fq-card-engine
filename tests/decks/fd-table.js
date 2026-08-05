/**
 * Table carte -> saisies dialogue (07-02 Task 3) : dérive un `fd` (données du
 * formulaire du dialogue « Jouer la carte ») par défaut auto pour N'IMPORTE
 * QUELLE carte du dépôt (découverte par glob dans 07-03), plus une table
 * d'overrides explicites par titre de carte pour les cas nécessitant des
 * saisies précises (ajoutée au fil de l'eau par 07-03/07-04 quand un défaut
 * auto ne suffit pas à couvrir un cas particulier).
 *
 * Ne fixe PAS `fd.to` (l'id de la pile de défausse cible) : cette valeur dépend
 * du monde monté (`mountWorld`), donc c'est `playChoice` (tests/decks/play-harness.js)
 * qui la renseigne après appel à `defaultFdFor`.
 */

const MINION_LOCATIONS = ["up", "down", "left", "right"];

/**
 * Table d'overrides explicites, indexée par titre de carte (`rawCard.name`, ex.
 * `"FQCARDTITLE.RightPunch"`). Chaque entrée est une fonction `(rawCard, choice)
 * -> object` fusionnée (premier niveau) par-dessus le `fd` auto. Vide par défaut :
 * à peupler au fil de l'eau (07-03/07-04) pour les cartes dont le défaut auto ne
 * convient pas (ex. saisie X/Y devant respecter une contrainte métier précise).
 *
 * @type {Object<string, function(object, object): object>}
 */
export const CARD_OVERRIDES = {};

/**
 * Dérive un `fd` par défaut auto pour un choix de carte donné : borne `XXX`/`YYY`
 * valide si `xmin`/`ymin` est présent (sinon 0), `nameContent` pour les cartes à
 * choix multiples, sélection d'emplacements de sbires égale à `choice.minions.length`
 * (dans l'ordre up/down/left/right), et `down: false`. Applique ensuite l'éventuel
 * override explicite de `CARD_OVERRIDES` (fusion superficielle par-dessus le défaut).
 *
 * @param {object} rawCard - L'entrée carte brute du deck JSON (`deck.cards[i]`).
 * @param {object} choice  - Le choix (contenu) de la carte pour lequel dériver le `fd`.
 *
 * @returns {object} Le `fd` par défaut (sans `to`, renseigné séparément par `playChoice`).
 */
export function defaultFdFor(rawCard, choice) {
    const xmin = isFilled(choice?.xmin) ? Number(choice.xmin) : undefined;
    const ymin = isFilled(choice?.ymin) ? Number(choice.ymin) : undefined;

    const fd = {
        XXX: xmin !== undefined ? xmin : 0,
        YYY: ymin !== undefined ? ymin : 0,
        down: false,
        minionUp: false,
        minionDown: false,
        minionLeft: false,
        minionRight: false
    };

    if (isFilled(choice?.name)) {
        fd.nameContent = choice.name;
    }

    const minionCount = Array.isArray(choice?.minions) ? choice.minions.length : 0;
    for (let i = 0; i < minionCount && i < MINION_LOCATIONS.length; i++) {
        fd[minionFdKey(MINION_LOCATIONS[i])] = true;
    }

    const override = CARD_OVERRIDES[rawCard?.name];
    return override ? {...fd, ...override(rawCard, choice)} : fd;
}

/**
 * Indique si une valeur de champ de carte est « renseignée » (ni `undefined`,
 * ni `null`, ni chaîne vide) — les champs FQ non renseignés sont des chaînes vides.
 *
 * @param {*} value - La valeur à tester.
 *
 * @returns {boolean} True si la valeur est renseignée.
 */
function isFilled(value) {
    return value !== undefined && value !== null && value !== "";
}

/**
 * Construit la clé `fd` (`minionUp`/`minionDown`/`minionLeft`/`minionRight`)
 * correspondant à une direction.
 *
 * @param {string} location - La direction (« up », « down », « left », « right »).
 *
 * @returns {string} La clé `fd` correspondante.
 */
function minionFdKey(location) {
    return "minion" + location.charAt(0).toUpperCase() + location.slice(1);
}
