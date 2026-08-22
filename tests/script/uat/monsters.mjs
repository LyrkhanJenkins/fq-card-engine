import {existsSync, readFileSync} from "node:fs";

/**
 * Composition d'une opposition SRD sur un budget de CR, et surcharge explicite
 * par nom (UAT-05). Module Node pur qui ne lit QUE l'index JSON committé
 * (`tests/script/uat/monsters-index.json`) — jamais la base LevelDB du
 * système, ce qui garde le générateur utilisable Foundry ouvert (D-01).
 * L'index lui-même est produit hors ligne par `build-monster-index.mjs`.
 */

/**
 * Table des facteurs de difficulté appliqués au budget de CR par niveau.
 * Regroupés ici pour être ajustables d'une ligne (proposition de plan,
 * discrétion laissée à l'exécuteur par le contexte de phase).
 *
 * @type {Object<string, number>}
 */
export const DIFFICULTY_FACTORS = {
    easy: 0.5,
    normal: 1,
    hard: 1.5,
    deadly: 2
};

/**
 * Convertit un CR (potentiellement fractionnaire : 0.125, 0.25, 0.5...) en
 * huitièmes entiers. Toute l'arithmétique de budget se fait ensuite sur des
 * entiers, ce qui élimine la dérive de flottant sur ces CR fractionnaires.
 *
 * @param {number} cr - Le CR (peut être fractionnaire).
 *
 * @returns {number} Le CR exprimé en huitièmes entiers.
 */
export function crToEighths(cr) {
    return Math.round(cr * 8);
}

/**
 * Charge et valide l'index de monstres committé.
 *
 * @param {string} indexPath - Le chemin vers `monsters-index.json`.
 *
 * @returns {{system: string, systemVersion: string, generatedAt: string, count: number, monsters: object[]}}
 *   L'index chargé, y compris `systemVersion` — à l'appelant d'avertir en cas
 *   de décalage avec le système dnd5e installé (plan 19-03).
 */
export function loadMonsterIndex(indexPath) {
    if (!existsSync(indexPath)) {
        throw new Error(
            `Index de monstres introuvable (${indexPath}). Lancer \`npm run testWorld:monsters\` `
            + "(Foundry fermé) pour le générer."
        );
    }
    return JSON.parse(readFileSync(indexPath, "utf8"));
}

/**
 * Calcule le budget de CR (en huitièmes) alloué à une opposition, dérivé du
 * niveau du héros et modulé par la difficulté.
 *
 * @param {number} level        - Le niveau du héros, dans [1, 20].
 * @param {string} difficulty   - Une clé de `DIFFICULTY_FACTORS`.
 *
 * @returns {number} Le budget en huitièmes de CR.
 */
export function crBudgetForLevel(level, difficulty) {
    if (!Number.isInteger(level) || level < 1 || level > 20) {
        throw new Error(`Niveau hors intervalle 1-20: ${level}`);
    }
    const factor = DIFFICULTY_FACTORS[difficulty];
    if (factor === undefined) {
        throw new Error(`Difficulté inconnue: "${difficulty}" (attendu: ${Object.keys(DIFFICULTY_FACTORS).join(", ")}).`);
    }
    return Math.round(level * factor * 8);
}

/**
 * Compose une opposition SRD sur un budget de CR exact. Le nombre d'ennemis
 * (borne haute : 1 + budget/16, ramenée dans [1, 6]) est tiré, puis chaque
 * emplacement retient les monstres les plus proches de la cible restante
 * (budget restant / emplacements restants), avec repli sur tout monstre tenant
 * dans le budget restant si aucun n'est proche de la cible. Le pack contenant
 * 37 monstres de CR 0, ce repli n'est jamais vide : la somme des CR ne peut
 * jamais dépasser le budget.
 *
 * @param {object} params
 * @param {{monsters: object[]}} params.index - L'index de monstres chargé.
 * @param {number} params.budgetEighths       - Le budget total, en huitièmes de CR.
 * @param {{int: function(number, number): number, pick: function(Array): *}} params.rng - Le RNG déterministe.
 *
 * @returns {Array<{name: string, uuid: string, cr: number, crEighths: number, size: string, width: number, height: number}>}
 *   Entre 1 et 6 ennemis, jamais au-delà du budget.
 */
export function composeOpposition({index, budgetEighths, rng}) {
    const maxCount = Math.min(6, Math.max(1, 1 + Math.floor(budgetEighths / 16)));
    const count = rng.int(1, maxCount);

    const chosen = [];
    let remainingBudget = budgetEighths;
    let remainingSlots = count;

    for (let i = 0; i < count; i++) {
        const target = remainingBudget / remainingSlots;
        const affordable = index.monsters.filter(m => m.crEighths <= remainingBudget);
        let candidates = affordable.filter(m => m.crEighths >= target * 0.5 && m.crEighths <= target * 1.25);
        if (candidates.length === 0) candidates = affordable;

        const picked = rng.pick(candidates);
        chosen.push({
            name: picked.name,
            uuid: picked.uuid,
            cr: picked.cr,
            crEighths: picked.crEighths,
            size: picked.size,
            width: picked.width,
            height: picked.height
        });

        remainingBudget -= picked.crEighths;
        remainingSlots -= 1;
    }

    return chosen;
}

/**
 * Analyse la surcharge `--enemies`. Les noms du SRD sont en anglais (attendu :
 * `--enemies="Goblin x3, Ogre"`).
 *
 * @param {string} raw - La valeur brute de `--enemies`.
 *
 * @returns {{mode: "count", count: number}|{mode: "explicit", entries: Array<{name: string, count: number}>}}
 *   Un mode compté (valeur purement numérique) ou explicite (liste nom/quantité).
 */
export function parseEnemiesOption(raw) {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
        return {mode: "count", count: Number(trimmed)};
    }

    const entries = trimmed.split(",").map(fragment => {
        const match = /^(.+?)(?:\s+x\s*(\d+))?$/i.exec(fragment.trim());
        const name = match[1].trim().normalize("NFC");
        const count = match[2] ? Number(match[2]) : 1;
        return {name, count};
    });

    return {mode: "explicit", entries};
}

/**
 * Résout chaque nom demandé en une entrée de l'index, par comparaison
 * insensible à la casse et aux espaces de bord sur des noms normalisés en
 * NFC, puis développe les quantités. Un nom introuvable lève une erreur
 * explicite plutôt que d'être ignoré silencieusement.
 *
 * @param {{monsters: object[]}} index - L'index de monstres chargé.
 * @param {Array<{name: string, count: number}>} entries - Les entrées de `parseEnemiesOption`.
 *
 * @returns {Array<{name: string, uuid: string, cr: number, crEighths: number, size: string, width: number, height: number}>}
 *   Une entrée par ennemi demandé (quantités développées).
 */
export function resolveExplicitEnemies(index, entries) {
    const result = [];

    for (const {name, count} of entries) {
        const normalized = name.trim().normalize("NFC").toLowerCase();
        const found = index.monsters.find(m => m.name.normalize("NFC").toLowerCase() === normalized);
        if (!found) {
            const suggestions = closestNames(index.monsters, normalized, 3);
            throw new Error(`Monstre inconnu: "${name}". Noms les plus proches: ${suggestions.join(", ")}.`);
        }
        for (let i = 0; i < count; i++) {
            result.push({
                name: found.name,
                uuid: found.uuid,
                cr: found.cr,
                crEighths: found.crEighths,
                size: found.size,
                width: found.width,
                height: found.height
            });
        }
    }

    return result;
}

/**
 * Rend les `n` noms de l'index les plus proches (distance de Levenshtein) du
 * nom normalisé demandé, pour un message d'erreur utile.
 *
 * @param {object[]} monsters          - Les entrées de l'index.
 * @param {string} normalizedTarget    - Le nom recherché, déjà en minuscules/NFC.
 * @param {number} n                   - Le nombre de suggestions souhaitées.
 *
 * @returns {string[]} Les `n` noms les plus proches.
 */
function closestNames(monsters, normalizedTarget, n) {
    return monsters
        .map(m => ({name: m.name, distance: levenshtein(normalizedTarget, m.name.toLowerCase())}))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, n)
        .map(m => m.name);
}

/**
 * Distance de Levenshtein entre deux chaînes.
 *
 * @param {string} a
 * @param {string} b
 *
 * @returns {number} Le nombre minimal d'éditions (insertion/suppression/substitution).
 */
function levenshtein(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({length: rows}, () => new Array(cols).fill(0));

    for (let i = 0; i < rows; i++) dp[i][0] = i;
    for (let j = 0; j < cols; j++) dp[0][j] = j;

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }

    return dp[rows - 1][cols - 1];
}
