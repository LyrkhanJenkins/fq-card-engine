import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import {CLASS_SLUGS, resolveAbilityScoreImprovements, resolveHitPoints, resolvePicks, splitClassLevels} from "./classes.mjs";
import {DIFFICULTY_FACTORS, composeOpposition, crBudgetForLevel, parseEnemiesOption, resolveExplicitEnemies} from "./monsters.mjs";
import {ARENA_AREA, PLACEMENT_PATTERNS, placeEncounter} from "./placement.mjs";
import {createRng} from "./rng.mjs";

/**
 * Construction du plan UAT (D-03) : tout le hasard est résolu ici, côté Node,
 * jamais dans le seeder Foundry. Le plan produit est un objet complet, lisible
 * et sérialisable dans `uat-seed.json` ; le seeder n'est qu'un exécuteur
 * déterministe de ce plan.
 *
 * Version complète (ce plan 19-03) : tous les axes de randomisation (D-12)
 * sont assemblés — multi-classe, picks de stats, opposition sur budget de CR,
 * motif de placement, alliés, regions. `buildUatPlan` reste un module Node pur
 * : il ne touche jamais au système de fichiers lui-même, il reçoit le
 * catalogue de classes, l'index de monstres, les alliés et les variantes de
 * decks déjà chargés en paramètres (`loadMinions`/`loadDeckVariants`
 * ci-dessous sont les seuls points d'accès disque de ce module, réservés à
 * l'appelant — typiquement `generate-world.mjs`).
 */

export const PLAN_VERSION = 2;

/**
 * Identifiant constant de l'outil, écrit dans `plan.generator.tool`. C'est le
 * marqueur partagé avec `generate-world.mjs` (`isToolGeneratedWorld`) et
 * `clean-worlds.mjs` : un dossier ne porte ce marqueur que s'il a été produit
 * par cet outil (menaces T-19-08/T-19-09).
 *
 * @type {string}
 */
export const TOOL_ID = "fq-card-engine-uat-generator";

const MODULE_ID = "fq-card-engine";
const MINIONS_PACK = "minions-fq8";
const DECKS_PATTERN_PACK = "decks-pattern-fq8";

const REGION_COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9d4edd"];

/**
 * Charge les sept alliés/invocations depuis les sources de packs committées
 * (`packs/_source/minions-fq8`), hors ligne (D-01). Triés par nom pour que le
 * tirage (`rng.sample`) reste indépendant de l'ordre de lecture du système de
 * fichiers, qui n'est pas garanti stable d'un environnement à l'autre.
 *
 * @param {string} [repoRoot] - La racine du dépôt (défaut : `process.cwd()`).
 *
 * @returns {Promise<Array<{name: string, uuid: string, width: number, height: number}>>}
 *   Les alliés disponibles, triés par nom.
 */
export async function loadMinions(repoRoot = process.cwd()) {
    const dir = path.join(repoRoot, "packs", "_source", MINIONS_PACK);
    const files = (await readdir(dir)).filter(file => file.endsWith(".json"));

    const minions = [];
    for (const file of files) {
        const data = JSON.parse(await readFile(path.join(dir, file), "utf8"));
        minions.push({
            name: data.name,
            uuid: `Compendium.${MODULE_ID}.${MINIONS_PACK}.Actor.${data._id}`,
            width: data.prototypeToken?.width ?? 1,
            height: data.prototypeToken?.height ?? 1
        });
    }

    return minions.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recense, pour chaque classe FQ, les variantes de decks générés proposées en
 * jeu (`packs/_source/decks-pattern-fq8/<slug>-<variante>.json`, distinctes de
 * `-base` et `-generated`) et les niveaux couverts par le deck `-generated` de
 * la classe, s'il existe. C'est de l'information d'orientation pour l'UAT
 * (D-03) : le seeder ne construit aucune de ces variantes lui-même.
 *
 * @param {string} [repoRoot] - La racine du dépôt (défaut : `process.cwd()`).
 *
 * @returns {Promise<Object<string, {patternVariants: string[], generatedLevels: number[]}>>}
 *   Une entrée par slug de classe.
 */
export async function loadDeckVariants(repoRoot = process.cwd()) {
    const dir = path.join(repoRoot, "packs", "_source", DECKS_PATTERN_PACK);
    const files = await readdir(dir);

    const result = {};
    for (const slug of CLASS_SLUGS) {
        const prefix = `${slug}-`;
        const slugFiles = files.filter(file => file.startsWith(prefix) && file.endsWith(".json"));

        const patternVariants = [];
        for (const file of slugFiles) {
            if (file === `${prefix}base.json` || file === `${prefix}generated.json`) continue;
            const data = JSON.parse(await readFile(path.join(dir, file), "utf8"));
            patternVariants.push(data.name);
        }
        patternVariants.sort();

        let generatedLevels = [];
        const generatedFile = `${prefix}generated.json`;
        if (slugFiles.includes(generatedFile)) {
            const data = JSON.parse(await readFile(path.join(dir, generatedFile), "utf8"));
            const levels = new Set((data.cards ?? []).map(card => card.system?.fq?.level).filter(Number.isFinite));
            generatedLevels = [...levels].sort((a, b) => a - b);
        }

        result[slug] = {patternVariants, generatedLevels};
    }

    return result;
}

/**
 * Vérifie qu'un niveau total tombe dans l'intervalle [1, 20], sinon lève une
 * erreur explicite AVANT toute écriture sur disque (borne du plan 19-03).
 *
 * @param {number} level - Le niveau total à valider.
 *
 * @returns {void}
 */
function assertValidLevel(level) {
    if (!Number.isInteger(level) || level < 1 || level > 20) {
        throw new Error(`Niveau hors intervalle 1-20: ${level}`);
    }
}

/**
 * Analyse la surcharge `--class`. Chaque entrée est un slug éventuellement
 * suffixé par `:niveau` (`witch`, `witch:5`, `witch:5,guardian:3`).
 *
 * @param {string} raw - La valeur brute de `--class`.
 *
 * @returns {Array<{slug: string, level: ?number}>} Les entrées, dans l'ordre fourni
 *   (la première reste la classe principale).
 */
function parseClassOverride(raw) {
    return raw.split(",").map(fragment => {
        const trimmed = fragment.trim();
        const match = /^([a-z][a-z0-9-]*)(?::(\d+))?$/.exec(trimmed);
        if (!match) {
            throw new Error(`Identifiant de classe invalide: "${trimmed}".`);
        }
        const [, slug, levelStr] = match;
        return {slug, level: levelStr !== undefined ? Number(levelStr) : undefined};
    });
}

/**
 * Tire le nombre de classes (1, ou 2 avec une probabilité de 25%) et leurs
 * identifiants, sans remise, parmi les classes du catalogue. Toujours
 * consommée quand `options.class` n'est pas fourni, pour préserver l'ordre de
 * consommation du flux aléatoire documenté sur `buildUatPlan`.
 *
 * @param {object} catalog - Le catalogue rendu par `loadClassCatalog`.
 * @param {object} rng     - Le RNG déterministe.
 *
 * @returns {string[]} Les slugs tirés (1 ou 2).
 */
function rollClassSlugs(catalog, rng) {
    const allSlugs = Object.keys(catalog);
    const wantsTwo = rng.bool(0.25);
    const numClasses = wantsTwo ? 2 : 1;
    return rng.sample(allSlugs, numClasses);
}

/**
 * Reconstruit la description `slug:niveau,...` d'une répartition de classes,
 * utilisée à la fois dans `plan.overrides.class` et dans
 * `journal.regenerateCommand`.
 *
 * @param {Array<{slug: string, level: number}>} classEntries
 *
 * @returns {string}
 */
function describeClasses(classEntries) {
    return classEntries.map(entry => `${entry.slug}:${entry.level}`).join(",");
}

/**
 * Reconstruit une description `Nom xN, Nom2 xM` d'une opposition résolue,
 * utilisée pour `journal.summary` et pour `plan.overrides.enemies` lorsque la
 * surcharge `--enemies` était une liste explicite.
 *
 * @param {Array<{name: string}>} enemies
 *
 * @returns {string}
 */
function describeEnemies(enemies) {
    const counts = new Map();
    for (const enemy of enemies) counts.set(enemy.name, (counts.get(enemy.name) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => `${name} x${count}`).join(", ");
}

/**
 * Compose une opposition de taille FIXÉE sur le même budget de CR (en
 * huitièmes) que `composeOpposition` (monsters.mjs), pour honorer une
 * surcharge `--enemies=<n>` numérique — `composeOpposition` tire toujours son
 * propre nombre d'ennemis, ce qui ne convient pas quand ce nombre est imposé
 * (D-10). Ne modifie pas `monsters.mjs` (hors périmètre de ce plan) : ne lit
 * que la structure publique de l'index déjà chargé.
 *
 * @param {object} params
 * @param {{monsters: object[]}} params.index - L'index de monstres chargé.
 * @param {number} params.budgetEighths       - Le budget total, en huitièmes de CR.
 * @param {number} params.count               - Le nombre d'ennemis imposé.
 * @param {object} params.rng                 - Le RNG déterministe.
 *
 * @returns {Array<{name: string, uuid: string, cr: number, crEighths: number, size: string, width: number, height: number}>}
 */
function pickFixedOpposition({index, budgetEighths, count, rng}) {
    const chosen = [];
    let remainingBudget = budgetEighths;
    let remainingSlots = count;

    for (let i = 0; i < count; i++) {
        const target = remainingSlots > 0 ? remainingBudget / remainingSlots : 0;
        const affordable = index.monsters.filter(m => m.crEighths <= Math.max(0, remainingBudget));
        const pool = affordable.length > 0 ? affordable : index.monsters.filter(m => m.crEighths === 0);
        let candidates = pool.filter(m => m.crEighths >= target * 0.5 && m.crEighths <= target * 1.25);
        if (candidates.length === 0) candidates = pool;

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
 * Résout l'axe `enemies` : liste explicite (`--enemies="Goblin x3, Ogre"`,
 * aucun tirage), nombre imposé (`--enemies=3`, identités tirées sur budget) ou
 * tirage complet (nombre ET identités tirés par `composeOpposition`).
 *
 * @param {object} params
 * @param {object} params.options       - Les surcharges CLI.
 * @param {number} params.level         - Le niveau total du héros.
 * @param {string} params.difficulty    - La difficulté résolue.
 * @param {object} params.monsterIndex  - L'index de monstres chargé.
 * @param {object} params.rng           - Le RNG déterministe.
 *
 * @returns {{enemies: object[], overrideValue: (string|number)}} Les ennemis résolus et
 *   la valeur à recopier dans `plan.overrides.enemies`.
 */
function resolveEnemies({options, level, difficulty, monsterIndex, rng}) {
    if (options.enemies !== undefined) {
        const parsed = parseEnemiesOption(String(options.enemies));

        if (parsed.mode === "explicit") {
            const enemies = resolveExplicitEnemies(monsterIndex, parsed.entries);
            return {enemies, overrideValue: describeEnemies(enemies)};
        }

        const budgetEighths = crBudgetForLevel(level, difficulty);
        const enemies = pickFixedOpposition({index: monsterIndex, budgetEighths, count: parsed.count, rng});
        return {enemies, overrideValue: enemies.length};
    }

    const budgetEighths = crBudgetForLevel(level, difficulty);
    const enemies = composeOpposition({index: monsterIndex, budgetEighths, rng});
    return {enemies, overrideValue: enemies.length};
}

/**
 * Construit le plan complet d'un monde UAT (D-03, D-10, D-12).
 *
 * ORDRE DE CONSOMMATION DU FLUX ALÉATOIRE (fige la reproductibilité d'une
 * graine — ne JAMAIS réordonner) : nombre de classes, identifiants de classes,
 * niveau total, répartition des niveaux, picks de stats (par classe),
 * améliorations de caractéristiques (par classe), points de vie, difficulté,
 * opposition, motif de placement, nombre d'alliés, identité des alliés,
 * nombre de regions, géométrie des regions, placement, initiatives.
 * Une étape n'est PAS consommée quand l'axe correspondant est entièrement
 * fourni par `options` (D-10) : deux appels avec les mêmes surcharges
 * consomment donc toujours le même sous-ensemble d'étapes, dans le même
 * ordre, ce qui suffit à la reproductibilité à l'octet près.
 *
 * @param {object} params
 * @param {number} params.seed                  - La graine du monde.
 * @param {object} [params.options]              - Les surcharges CLI (gagnent toujours sur le tirage).
 * @param {string} [params.options.class]        - `slug[:niveau][,slug2[:niveau2]...]`.
 * @param {number} [params.options.level]        - Le niveau total du héros (1-20).
 * @param {string|number} [params.options.enemies] - Un compte, ou une liste explicite (`monsters.mjs`).
 * @param {string} [params.options.difficulty]   - Une clé de `DIFFICULTY_FACTORS`.
 * @param {string} [params.options.placement]    - Un motif de `PLACEMENT_PATTERNS`.
 * @param {number} [params.options.allies]       - Le nombre d'alliés (0+).
 * @param {number} [params.options.regions]      - Le nombre de regions (0+).
 * @param {object} params.catalog                - Le catalogue rendu par `loadClassCatalog`.
 * @param {object} params.monsterIndex           - L'index rendu par `loadMonsterIndex`.
 * @param {Array<{name: string, uuid: string, width: number, height: number}>} [params.minions] - Rendu par `loadMinions`.
 * @param {Object<string, {patternVariants: string[], generatedLevels: number[]}>} [params.deckVariants] - Rendu par `loadDeckVariants`.
 *
 * @returns {object} Le plan, sérialisable tel quel dans `uat-seed.json`. AUCUN champ
 *   d'horodatage n'y figure (reproductibilité à l'octet près, D-04).
 */
export function buildUatPlan({seed, options = {}, catalog, monsterIndex, minions = [], deckVariants = {}}) {
    if (!catalog) throw new Error("buildUatPlan: catalog est requis (loadClassCatalog).");
    if (!monsterIndex) throw new Error("buildUatPlan: monsterIndex est requis (loadMonsterIndex).");

    const rng = createRng(seed);

    // --- Classes, niveau, répartition ---------------------------------------
    let classOverrideEntries = null;
    if (options.class !== undefined) {
        classOverrideEntries = parseClassOverride(options.class);
        for (const {slug} of classOverrideEntries) {
            if (!catalog[slug]) {
                throw new Error(`Classe FQ inconnue: "${slug}" (attendu: ${Object.keys(catalog).join(", ")}).`);
            }
        }
        const anyExplicit = classOverrideEntries.some(entry => entry.level !== undefined);
        const allExplicit = classOverrideEntries.every(entry => entry.level !== undefined);
        if (anyExplicit && !allExplicit) {
            throw new Error("Surcharge --class: précisez un niveau pour toutes les classes (slug:niveau) ou pour aucune.");
        }
    }

    const slugs = classOverrideEntries ? classOverrideEntries.map(entry => entry.slug) : rollClassSlugs(catalog, rng);
    const explicitLevelsGiven = Boolean(classOverrideEntries?.every(entry => entry.level !== undefined));

    let totalLevel;
    if (explicitLevelsGiven) {
        totalLevel = classOverrideEntries.reduce((sum, entry) => sum + entry.level, 0);
    } else if (options.level !== undefined) {
        totalLevel = Number(options.level);
    } else {
        totalLevel = rng.int(1, 20);
    }
    assertValidLevel(totalLevel);

    const effectiveSlugs = totalLevel >= slugs.length ? slugs : slugs.slice(0, 1);

    const classEntries = explicitLevelsGiven
        ? classOverrideEntries.map(({slug, level}) => ({slug, level}))
        : splitClassLevels(effectiveSlugs, totalLevel, rng);

    // --- Picks, améliorations de caractéristiques, points de vie -----------
    const picks = [];
    for (const entry of classEntries) {
        for (const pick of resolvePicks(catalog[entry.slug], entry.level, rng)) {
            picks.push({...pick, slug: entry.slug});
        }
    }

    const abilityScoreImprovements = [];
    for (const entry of classEntries) {
        for (const asi of resolveAbilityScoreImprovements(catalog[entry.slug], entry.level, rng)) {
            abilityScoreImprovements.push({...asi, slug: entry.slug});
        }
    }

    const hitPoints = resolveHitPoints(classEntries, catalog, rng);

    // --- Difficulté et opposition --------------------------------------------
    const difficulty = options.difficulty ?? rng.pick(Object.keys(DIFFICULTY_FACTORS));
    if (!(difficulty in DIFFICULTY_FACTORS)) {
        throw new Error(`Difficulté inconnue: "${difficulty}" (attendu: ${Object.keys(DIFFICULTY_FACTORS).join(", ")}).`);
    }

    const {enemies, overrideValue: enemiesOverride} = resolveEnemies({
        options, level: totalLevel, difficulty, monsterIndex, rng
    });

    // --- Motif de placement (le nom seulement — l'algorithme tourne plus bas) --
    const pattern = options.placement ?? rng.pick(PLACEMENT_PATTERNS);

    // --- Alliés ---------------------------------------------------------------
    const alliesCount = options.allies !== undefined ? Number(options.allies) : rng.int(0, 2);
    const allies = rng.sample(minions, alliesCount).map(minion => ({
        name: minion.name, uuid: minion.uuid, width: minion.width, height: minion.height
    }));

    // --- Regions ----------------------------------------------------------------
    const regionsCount = options.regions !== undefined ? Number(options.regions) : rng.int(0, 2);
    const regions = [];
    for (let i = 0; i < regionsCount; i++) {
        const cols = rng.int(2, 5);
        const rows = rng.int(2, 5);
        const col = rng.int(ARENA_AREA.col, ARENA_AREA.col + ARENA_AREA.cols - cols);
        const row = rng.int(ARENA_AREA.row, ARENA_AREA.row + ARENA_AREA.rows - rows);
        regions.push({name: `Region ${i + 1}`, col, row, cols, rows, color: rng.pick(REGION_COLORS)});
    }

    // --- Placement (algorithme) --------------------------------------------------
    const heroFootprint = {width: 1, height: 1};
    placeEncounter({pattern, hero: heroFootprint, enemies, allies, rng, area: ARENA_AREA});

    // --- Initiatives ---------------------------------------------------------
    const heroInitiative = rng.int(1, 20);
    for (const enemy of enemies) enemy.initiative = rng.int(1, 20);
    for (const ally of allies) ally.initiative = rng.int(1, 20);

    // Tri stable (V8/Node garantit un tri stable depuis ES2019) : à initiative
    // égale, l'ordre d'apparition (héros, puis ennemis, puis alliés) est
    // préservé, ce qui rend l'ordre de combat sérialisé stable (must_have).
    const combatants = [
        {ref: "hero", initiative: heroInitiative},
        ...enemies.map((enemy, index) => ({ref: `enemy:${index}`, initiative: enemy.initiative})),
        ...allies.map((ally, index) => ({ref: `ally:${index}`, initiative: ally.initiative}))
    ];
    const order = combatants.slice().sort((a, b) => b.initiative - a.initiative);

    // --- Héros (assemblage final) ----------------------------------------------
    const mainSlug = classEntries[0].slug;
    const mainLevel = classEntries[0].level;
    const variantsForMain = deckVariants[mainSlug] ?? {patternVariants: [], generatedLevels: []};

    const hero = {
        name: catalog[mainSlug].className,
        sourceUuid: catalog[mainSlug].heroUuid,
        classes: classEntries.map(entry => ({
            slug: entry.slug,
            className: catalog[entry.slug].className,
            classUuid: catalog[entry.slug].classUuid,
            level: entry.level
        })),
        picks,
        abilityScoreImprovements,
        hitPoints,
        deckVariants: {
            patternVariants: variantsForMain.patternVariants,
            generatedLevels: variantsForMain.generatedLevels.filter(level => level <= mainLevel),
            suggested: variantsForMain.patternVariants[0] ?? null
        },
        col: heroFootprint.col,
        row: heroFootprint.row,
        initiative: heroInitiative
    };

    // --- Overrides (valeurs EFFECTIVES, imposées ou tirées — D-10) -------------
    const overrides = {
        class: describeClasses(classEntries),
        level: totalLevel,
        enemies: enemiesOverride,
        difficulty,
        placement: pattern,
        allies: allies.length,
        regions: regions.length
    };

    // --- Journal -------------------------------------------------------------
    const enemiesArg = /[\s,]/.test(String(overrides.enemies)) ? `"${overrides.enemies}"` : overrides.enemies;
    const regenerateCommand = "npm run testWorld:random -- "
        + `--seed=${seed} --class=${overrides.class} --level=${overrides.level} --enemies=${enemiesArg} `
        + `--difficulty=${overrides.difficulty} --placement=${overrides.placement} `
        + `--allies=${overrides.allies} --regions=${overrides.regions}`;

    const classSummary = classEntries.map(entry => `${catalog[entry.slug].className} niv.${entry.level}`).join(" / ");
    const journal = {
        title: `Scénario UAT #${seed}`,
        summary: `${classSummary}, ${picks.length} pick(s) de stats, opposition : `
            + `${describeEnemies(enemies) || "aucune"} (motif ${pattern}).`,
        regenerateCommand
    };

    return {
        planVersion: PLAN_VERSION,
        generator: {
            // Pas de champ generatedAt ici : deux générations avec la même graine et
            // les mêmes surcharges doivent produire un uat-seed.json identique à l'octet près.
            tool: TOOL_ID,
            planVersion: PLAN_VERSION,
            systemVersion: monsterIndex.systemVersion
        },
        seed,
        world: {},
        overrides,
        hero,
        player: {},
        enemies,
        allies,
        regions,
        combat: {round: 1, turn: 0, order},
        placement: {pattern, area: ARENA_AREA},
        journal
    };
}
