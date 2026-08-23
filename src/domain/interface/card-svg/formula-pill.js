/**
 * Protocole de marqueur de pastille (« pill »), module SANS AUCUNE dépendance
 * (règle projet : les helpers partagés vivent dans un module dédié, jamais
 * d'import circulaire). Un marqueur encode, dans une chaîne de caractères de
 * formule, une pastille à faire apparaître plus tard dans le rendu HTML —
 * source de modification (arme/caractéristique) ou type de dégâts.
 *
 * Le marqueur utilise trois caractères de contrôle ASCII (SOH/US/STX,
 * jamais visibles ni saisissables) qui n'apparaissent jamais dans une
 * donnée de carte, une formule ou une traduction légitime, ce qui permet de
 * le faire traverser `game.i18n.format` et l'échappement HTML intact, puis
 * de le reconnaître sans ambiguïté à l'expansion. `sanitizePillInput` retire
 * ces caractères de toute entrée non fiable AVANT fabrication d'un marqueur :
 * une donnée de carte ou une traduction ne peut donc jamais forger un
 * marqueur de toutes pièces.
 */

/** Caractère de début de marqueur (SOH, unité de contrôle non imprimable). @type {string} */
export const PILL_START = "";

/** Séparateur de champ à l'intérieur d'un marqueur (US). @type {string} */
export const PILL_SEP = "";

/** Caractère de fin de marqueur (STX). @type {string} */
export const PILL_END = "";

/** Variant « source de modification » (arme, caractéristique). @type {string} */
export const PILL_SOURCE = "src";

/** Variant « type de dégâts ». @type {string} */
export const PILL_TYPE = "type";

/**
 * Expression régulière globale reconnaissant un marqueur complet
 * `START variant SEP emoji SEP tooltip END`. Les trois groupes capturés
 * excluent eux-mêmes les caractères de contrôle du protocole : un marqueur ne
 * peut donc jamais en imbriquer un autre.
 * @type {RegExp}
 */
// eslint-disable-next-line no-control-regex
export const PILL_PATTERN = /([^]*)([^]*)([^]*)/g;

/**
 * Retire de `text` les trois caractères de contrôle du protocole de pastille.
 * Appelée sur toute entrée non fiable (valeur brute de champ de formule,
 * texte de description localisé) AVANT toute fabrication de marqueur : sans
 * cette garde, une donnée de carte ou une traduction pourrait injecter les
 * caractères de contrôle elle-même et forger un faux marqueur.
 *
 * @param {*} text - Le texte à assainir (renvoyé inchangé si non-chaîne).
 *
 * @returns {*} Le texte débarrassé de tout caractère sentinelle, ou `text` inchangé.
 */
export function sanitizePillInput(text) {
    if (typeof text !== "string") {
        return text;
    }
    // eslint-disable-next-line no-control-regex
    return text.replace(/[]/g, "");
}

/**
 * Assemble un marqueur de pastille. `emoji` et `tooltip` passent d'abord par
 * `sanitizePillInput` : même si l'appelant fabrique le marqueur à partir de
 * données de carte (nom d'arme, libellé), aucune de ces données ne peut
 * contenir elle-même un caractère de contrôle du protocole.
 *
 * @param {string} variant - `PILL_SOURCE` ou `PILL_TYPE`.
 * @param {string} emoji   - L'emoji affiché dans la pastille.
 * @param {string} tooltip - Le contenu du tooltip (texte déjà localisé, ou clé i18n pour `PILL_TYPE`).
 *
 * @returns {string} Le marqueur assemblé.
 */
export function makePill(variant, emoji, tooltip) {
    const safeEmoji = sanitizePillInput(emoji ?? "");
    const safeTooltip = sanitizePillInput(tooltip ?? "");
    return `${PILL_START}${variant}${PILL_SEP}${safeEmoji}${PILL_SEP}${safeTooltip}${PILL_END}`;
}

/**
 * Réduit chaque marqueur de pastille présent dans `text` à son seul emoji :
 * c'est le texte VISIBLE, utilisé pour mesurer la taille de police
 * (`DisplayCard.getDescriptionSizeForCardSvg`) sans que le markup invisible
 * ne fausse la mesure.
 *
 * @param {*} text - Le texte pouvant contenir des marqueurs (renvoyé inchangé si non-chaîne).
 *
 * @returns {*} Le texte visible, ou `text` inchangé.
 */
export function stripPills(text) {
    if (typeof text !== "string") {
        return text;
    }
    return text.replace(new RegExp(PILL_PATTERN.source, "g"), (_, __, emoji) => emoji);
}

/**
 * Développe les marqueurs de pastille de `escapedText` en HTML. POURQUOI
 * l'expansion se fait après échappement : `escapedText` doit déjà avoir subi
 * l'échappement HTML (`& < > "`) sur sa totalité AVANT cet appel — c'est ce
 * qui garantit qu'un nom d'arme ou une donnée de carte contenu dans le
 * tooltip d'un marqueur ressort échappé (jamais de balise injectable), sans
 * que cette fonction ait elle-même à échapper quoi que ce soit. Les morceaux
 * de texte entre deux marqueurs passent par `textChunkTransform` (par exemple
 * l'enveloppement des emojis nus en `<span data-tooltip>`).
 *
 * Validation « fail closed » (anti-forge) : un marqueur dont le `variant`
 * n'appartient pas à `{PILL_SOURCE, PILL_TYPE}`, ou dont l'`emoji` n'appartient
 * pas à `allowedEmojis` (liste blanche fournie par l'appelant), est rendu
 * comme son seul emoji, SANS balise — un marqueur forgé ne peut donc jamais
 * produire de markup, même s'il a survécu à l'assainissement en amont.
 *
 * @param {*}        escapedText       - Le texte déjà échappé HTML, pouvant contenir des marqueurs.
 * @param {string[]} allowedEmojis     - La liste blanche des emojis autorisés à produire une pastille.
 * @param {Function} [textChunkTransform] - Transformation appliquée aux morceaux de texte hors marqueur (identité par défaut).
 *
 * @returns {*} Le HTML avec les pastilles développées, ou `escapedText` inchangé si non-chaîne.
 */
export function expandPills(escapedText, allowedEmojis, textChunkTransform = (chunk) => chunk) {
    if (typeof escapedText !== "string") {
        return escapedText;
    }
    const pattern = new RegExp(PILL_PATTERN.source, "g");
    let result = "";
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(escapedText)) !== null) {
        result += textChunkTransform(escapedText.slice(lastIndex, match.index));
        const [, variant, emoji, tooltip] = match;
        const variantOk = variant === PILL_SOURCE || variant === PILL_TYPE;
        const emojiOk = Array.isArray(allowedEmojis) && allowedEmojis.includes(emoji);
        if (variantOk && emojiOk) {
            result += `<span class="fq-formula-pill fq-formula-pill--${variant}" data-tooltip="${tooltip}">${emoji}</span>`;
        } else {
            // Fail closed : variant/emoji hors liste blanche -> emoji nu, sans balise.
            result += emoji;
        }
        lastIndex = pattern.lastIndex;
    }
    result += textChunkTransform(escapedText.slice(lastIndex));
    return result;
}
