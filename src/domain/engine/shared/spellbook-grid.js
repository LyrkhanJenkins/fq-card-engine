import CardFqSystem from "../../system/cards/card-fq-system.mjs";

/**
 * Fonctions pures de préparation de la grille du grimoire : tri, groupement
 * par classe et calcul de l'état de distribution. Aucune dépendance à
 * `ApplicationV2` ni au DOM — la fenêtre du grimoire (`SpellbookWindow`) les
 * consomme mais elles restent testables indépendamment d'elle.
 */

/**
 * Trie des cartes par niveau croissant puis par nom localisé — transcription
 * fidèle de `FqCardsSheet#_prepareCards`, le comportement de référence tant
 * que la feuille du grimoire n'est pas retirée (phase 4). Ne mute jamais le
 * tableau reçu : la source peut être `spellBook.cards.contents`, un tableau
 * vivant du document Foundry.
 *
 * @param {Card[]} cards - Les cartes à trier.
 *
 * @returns {Card[]} Un nouveau tableau, trié par niveau puis par nom.
 */
export function sortCardsByLevelThenName(cards) {
    const level = card => {
        const value = Number(card.system?.fq?.level);
        return Number.isFinite(value) ? value : 0;
    };
    return [...cards].sort((a, b) =>
        level(a) - level(b) || game.i18n.localize(a.name).localeCompare(game.i18n.localize(b.name)));
}

/**
 * Calcule l'état de distribution d'une carte du grimoire dans le deck du
 * joueur — même prédicat que `FqCardsSheet#_preparePartContext`
 * (`deck.cards.filter(c => c.name === card.name).length`), sans filtre sur
 * l'état de pioche des cartes du deck : Foundry laisse l'originale dans le
 * deck (marquée `drawn`) à la pioche, le compte reste donc juste en combat
 * (BOOK-07). N'est jamais appelée comme critère de tri — toujours APRÈS le
 * tri, en pure annotation (D-14).
 *
 * @param {Card}   card    - La carte du grimoire.
 * @param {Cards}  [deck]  - Le deck du joueur (absent = 0 exemplaire).
 *
 * @returns {{count: number, max: number, state: "none"|"partial"|"full"}} L'état de distribution.
 */
export function computeCopyState(card, deck) {
    const rawMax = card.system?.fq?.maxSameCard;
    const max = Number.isFinite(rawMax) ? rawMax : 1;
    const count = deck ? deck.cards.filter(c => c.name === card.name).length : 0;
    const state = count === 0 ? "none" : count >= max ? "full" : "partial";
    return {count, max, state};
}

/**
 * Détermine l'action de bascule à partir de l'état de distribution déjà
 * calculé par `computeCopyState` : aucune → crée les exemplaires manquants
 * (`max - count`, qui vaut `max` quand `count` est 0, COPY-01) ; partielle →
 * même calcul (COPY-03, COPY-04, ne dépasse jamais) ; pleine → retire tout
 * (COPY-02). Ne lit jamais directement le deck ou la carte : reçoit l'état
 * déjà annoté, pour rester composable avec `computeCopyState` sans
 * dépendance circulaire.
 *
 * @param {{count: number, max: number, state: "none"|"partial"|"full"}} copies - L'état de distribution.
 *
 * @returns {{action: "create"|"remove", count: number}} L'action à effectuer et le nombre d'exemplaires concernés.
 */
export function computeToggleAction(copies) {
    if (copies.state === "full") {
        return {action: "remove", count: copies.count};
    }
    return {action: "create", count: copies.max - copies.count};
}

/**
 * Détermine l'action du geste additif (clic droit, COPY-07) à partir de
 * l'état de distribution déjà calculé par `computeCopyState` : tant que le
 * compte est strictement inférieur au maximum, crée UN exemplaire ; dès qu'il
 * l'atteint ou le dépasse, ne fait rien. Décider sur `count`/`max` plutôt que
 * sur `state` rend la fonction robuste à un deck déjà en dépassement (compte
 * supérieur au maximum sur un vieux deck) : la décision reste `none` et le
 * geste ne peut jamais aggraver la situation — c'est l'unique garantie de
 * plafond de ce chemin, le garde-fou de plafond existant du module n'étant
 * câblé que sur le hook de transfert de l'API `Cards`, jamais sur un appel
 * direct à la couche document. Ne lit jamais `card` ni `deck` et ne recalcule
 * jamais l'état, exactement comme `computeToggleAction`.
 *
 * @param {{count: number, max: number, state: "none"|"partial"|"full"}} copies - L'état de distribution.
 *
 * @returns {{action: "create"|"none", count: number}} L'action à effectuer et le nombre d'exemplaires concernés.
 */
export function computeIncrementAction(copies) {
    if (copies.count >= copies.max) {
        return {action: "none", count: 0};
    }
    return {action: "create", count: 1};
}

/**
 * Groupe des cartes déjà triées par leur classe FQ (`system.fq.class`), avec
 * repli sur `CardFqSystem.NEUTRAL_CLASS` quand la valeur est absente. L'ordre
 * interne de chaque groupe est celui d'entrée — jamais retrié ici (D-14 :
 * l'ordre d'affichage ne dépend jamais de l'état de distribution).
 *
 * @param {Card[]} sortedCards - Les cartes déjà triées par `sortCardsByLevelThenName`.
 *
 * @returns {Map<string, Card[]>} Les cartes groupées, keyées par identifiant de classe.
 */
export function groupCardsByClass(sortedCards) {
    const groups = new Map();
    for (const card of sortedCards) {
        const key = card.system?.fq?.class ?? CardFqSystem.NEUTRAL_CLASS;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(card);
    }
    return groups;
}

/**
 * Localise un identifiant de classe FQ (`"runic-warrior"`) en libellé humain,
 * via la clé `FQCARDENGINE.Class<PascalCase>`. Renvoie l'identifiant brut si
 * la clé est absente du fichier de langue — c'est la façon dont Foundry
 * signale une clé manquante : `game.i18n.localize` renvoie alors la clé
 * demandée telle quelle.
 *
 * @param {string} classKey - L'identifiant de classe brut (`system.fq.class`).
 *
 * @returns {string} Le libellé localisé, ou l'identifiant brut si non localisable.
 */
export function localizeClassKey(classKey) {
    const pascalCase = classKey.split("-").map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join("");
    const key = `FQCARDENGINE.Class${pascalCase}`;
    const localized = game.i18n.localize(key);
    return localized === key ? classKey : localized;
}

/**
 * Orchestre la chaîne complète de préparation de la grille du grimoire : trie
 * les cartes, les groupe par classe, puis annote chaque carte de son état de
 * distribution. L'annotation d'état arrive toujours en dernier et n'entre
 * jamais dans un comparateur (D-14). Les groupes sont ordonnés entre eux par
 * libellé de classe localisé.
 *
 * @param {Card[]} cards - Les cartes débloquées du grimoire (non triées).
 * @param {Cards}  [deck] - Le deck du joueur, pour le calcul des exemplaires.
 *
 * @returns {{isEmpty: boolean, groups: {classKey: string, classLabel: string, count: number, entries: {card: Card, copies: object}[]}[]}}
 *   L'état préparé de la grille.
 */
export function buildSpellbookGroups(cards, deck) {
    if (!cards.length) {
        return {isEmpty: true, groups: []};
    }
    const sorted = sortCardsByLevelThenName(cards);
    const grouped = groupCardsByClass(sorted);
    const groups = [...grouped.entries()].map(([classKey, groupCards]) => ({
        classKey,
        classLabel: localizeClassKey(classKey),
        count: groupCards.length,
        entries: groupCards.map(card => ({card, copies: computeCopyState(card, deck)}))
    }));
    groups.sort((a, b) => a.classLabel.localeCompare(b.classLabel));
    return {isEmpty: false, groups};
}
