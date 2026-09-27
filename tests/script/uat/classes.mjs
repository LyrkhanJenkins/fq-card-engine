import {readdir, readFile} from "node:fs/promises";
import path from "node:path";

/**
 * Tirage du build de héros (classe(s), niveau(x), picks de stats, PV,
 * améliorations de caractéristiques) — module Node pur, sans dépendance à
 * Foundry. Toutes les fonctions lisent les sources de packs `_source`
 * committées : aucune ouverture de compendium n'est nécessaire (D-01, D-03).
 */

const MODULE_ID = "fq-card-engine";
const CLASSES_PACK = "classes-fq8";
const HEROES_PACK = "starter-heroes";
const STATS_PACK = "classes-stats-fq8";

/**
 * Les identifiants de classe FQ jouables par l'outil : ceux présents À LA FOIS
 * dans `packs/_source/classes-fq8` et `packs/_source/starter-heroes` (nom de
 * fichier == slug).
 *
 * L'intersection est CALCULÉE et non figée : depuis que les classes étendues
 * vivent dans `fq-card-engine-extended`, ce module ne livre plus les neuf classes,
 * et les starters des classes parties restent là sans leur item de classe. Une
 * liste en dur ouvrirait un fichier absent.
 *
 * @param {string} [repoRoot] - La racine du dépôt (défaut : `process.cwd()`).
 *
 * @returns {Promise<string[]>} Les slugs jouables, triés.
 */
export async function classSlugs(repoRoot = process.cwd()) {
    const slugsIn = async pack => new Set((await readdir(path.join(repoRoot, "packs", "_source", pack)))
        .filter(name => name.endsWith(".json"))
        .map(name => name.slice(0, -".json".length)));
    const classes = await slugsIn(CLASSES_PACK);
    const heroes = await slugsIn(HEROES_PACK);
    const slugs = [...classes].filter(slug => heroes.has(slug)).sort();
    if (slugs.length === 0) {
        throw new Error(
            `Aucune classe jouable : ${CLASSES_PACK} et ${HEROES_PACK} n'ont aucun slug en commun.`);
    }
    return slugs;
}

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Extrait le nombre de faces du dé de vie depuis `system.hd.denomination`
 * (par exemple `"d10"` -> `10`).
 *
 * @param {string} denomination - La dénomination brute du dé de vie.
 *
 * @returns {?number} Le nombre de faces, ou `null` si la dénomination est absente/invalide.
 */
function parseHitDieFaces(denomination) {
    const match = /^d(\d+)$/.exec(denomination ?? "");
    return match ? Number(match[1]) : null;
}

/**
 * Les modificateurs de caractéristiques des stats de départ qu'une classe
 * octroie à la classe principale (advancements `ItemGrant` de niveau 1), lus
 * dans les effets des items de `classes-stats-fq8`.
 *
 * @param {string} repoRoot  - La racine du dépôt.
 * @param {object} classData - L'item de classe source.
 *
 * @returns {Promise<Object<string, number>>} Le modificateur total par caractéristique.
 */
async function startingAbilityChanges(repoRoot, classData) {
    const grantedIds = Object.values(classData.system.advancement ?? {})
        .filter(a => a.type === "ItemGrant" && Number(a.level) <= 1 && a.classRestriction !== "secondary")
        .flatMap(a => a.configuration?.items ?? [])
        .map(entry => entry.uuid.split(".").pop());
    const changes = {};
    if (grantedIds.length === 0) {
        return changes;
    }
    const statsDir = path.join(repoRoot, "packs", "_source", STATS_PACK);
    for (const file of (await readdir(statsDir)).filter(name => name.endsWith(".json"))) {
        const item = JSON.parse(await readFile(path.join(statsDir, file), "utf8"));
        if (!grantedIds.includes(item._id)) continue;
        for (const change of (item.effects ?? []).flatMap(effect => effect.system?.changes ?? [])) {
            const match = /^system\.abilities\.(\w+)\.value$/.exec(change.key);
            if (match && change.type === "add") {
                changes[match[1]] = (changes[match[1]] ?? 0) + Number(change.value);
            }
        }
    }
    return changes;
}

/**
 * Charge le catalogue des classes FQ jouables depuis les sources de packs
 * committées, hors ligne (aucune ouverture de Foundry, key_links du plan 19-02).
 *
 * @param {string} [repoRoot] - La racine du dépôt (défaut : `process.cwd()`).
 *
 * @returns {Promise<Object<string, object>>} Une table indexée par `slug`, chaque entrée
 *   portant `slug`, `className`, `classItemId`, `classUuid`, `heroActorId`, `heroUuid`,
 *   `hitDieFaces`, `baseHitPoints`, `baseAbilities`, et `advancement`
 *   (`{itemChoices, abilityScoreImprovements, hitPoints}`).
 */
export async function loadClassCatalog(repoRoot = process.cwd()) {
    const catalog = {};

    for (const slug of await classSlugs(repoRoot)) {
        const classPath = path.join(repoRoot, "packs", "_source", CLASSES_PACK, `${slug}.json`);
        const heroPath = path.join(repoRoot, "packs", "_source", HEROES_PACK, `${slug}.json`);

        const classData = JSON.parse(await readFile(classPath, "utf8"));
        const heroData = JSON.parse(await readFile(heroPath, "utf8"));

        const advancement = Object.values(classData.system.advancement ?? {});
        // Les starters sont livrés sans classe : leurs caractéristiques de niveau 1
        // sont celles du héros vierge plus les stats de départ de sa classe.
        const startingChanges = await startingAbilityChanges(repoRoot, classData);
        const baseAbilities = {};
        for (const key of ABILITY_KEYS) {
            const value = heroData.system.abilities?.[key]?.value;
            baseAbilities[key] = value === undefined || value === null ? null : Number(value) + (startingChanges[key] ?? 0);
        }
        const hitDieFaces = parseHitDieFaces(classData.system.hd?.denomination);
        const heroHitPoints = heroData.system.attributes?.hp?.max ?? heroData.system.attributes?.hp?.value ?? null;

        catalog[slug] = {
            slug,
            className: classData.name,
            classItemId: classData._id,
            classUuid: `Compendium.${MODULE_ID}.${CLASSES_PACK}.Item.${classData._id}`,
            heroActorId: heroData._id,
            heroUuid: `Compendium.${MODULE_ID}.${HEROES_PACK}.Actor.${heroData._id}`,
            hitDieFaces,
            // PV de niveau 1 : ceux du héros vierge (sans classe) plus le dé de vie
            // maximal de la classe principale.
            baseHitPoints: heroHitPoints === null ? null : Number(heroHitPoints) + (hitDieFaces ?? 0),
            baseAbilities,
            advancement: {
                itemChoices: advancement.filter(a => a.type === "ItemChoice"),
                abilityScoreImprovements: advancement.filter(a => a.type === "AbilityScoreImprovement"),
                hitPoints: advancement.filter(a => a.type === "HitPoints")
            }
        };
    }

    return catalog;
}

/**
 * Répartit `totalLevel` sur les classes demandées, chacune recevant au moins 1
 * niveau et la somme valant exactement `totalLevel`. La première classe de
 * `slugs` reste la classe principale dans la liste rendue (l'appelant en
 * contrôle l'ordre).
 *
 * @param {string[]} slugs      - Les slugs de classe demandés (mono ou multi-classe).
 * @param {number} totalLevel   - Le niveau total du héros.
 * @param {{int: function(number, number): number}} rng - Le RNG déterministe.
 *
 * @returns {Array<{slug: string, level: number}>} La répartition, dans l'ordre de `slugs`.
 */
export function splitClassLevels(slugs, totalLevel, rng) {
    if (totalLevel < slugs.length) {
        throw new Error(
            `totalLevel (${totalLevel}) doit être au moins égal au nombre de classes (${slugs.length}).`
        );
    }

    const levels = slugs.map(() => 1);
    let remaining = totalLevel - slugs.length;
    while (remaining > 0) {
        const index = rng.int(0, slugs.length - 1);
        levels[index] += 1;
        remaining -= 1;
    }

    return slugs.map((slug, index) => ({slug, level: levels[index]}));
}

/**
 * Rejoue fidèlement les advancements `ItemChoice` d'une classe jusqu'au niveau
 * demandé. `replacement` valant toujours `false` dans les sources FQ, un même
 * UUID n'est jamais rendu deux fois AU SEIN d'un même advancement (un pool
 * neuf par advancement). Si le pool est épuisé avant d'avoir servi `count`
 * UUID pour un niveau, sert ce qui reste sans lever d'erreur.
 *
 * @param {object} classEntry - Une entrée du catalogue rendu par `loadClassCatalog`.
 * @param {number} level      - Le niveau atteint par cette classe.
 * @param {{sample: function(Array, number): Array}} rng - Le RNG déterministe.
 *
 * @returns {Array<{advancementId: string, level: number, uuid: string}>} Les picks,
 *   triés par niveau croissant puis par ordre de tirage.
 */
export function resolvePicks(classEntry, level, rng) {
    const picks = [];

    for (const itemChoice of classEntry.advancement.itemChoices) {
        const choices = itemChoice.configuration?.choices ?? {};
        const pool = (itemChoice.configuration?.pool ?? []).map(entry => entry.uuid);
        const used = new Set();

        const levelKeys = Object.keys(choices)
            .filter(key => Number(key) <= level)
            .sort((a, b) => Number(a) - Number(b));

        for (const key of levelKeys) {
            const {count} = choices[key];
            const available = pool.filter(uuid => !used.has(uuid));
            const picked = rng.sample(available, count);
            for (const uuid of picked) {
                used.add(uuid);
                picks.push({advancementId: itemChoice._id, level: Number(key), uuid});
            }
        }
    }

    // Tri stable : conserve l'ordre de tirage au sein d'un même niveau.
    return picks.sort((a, b) => a.level - b.level);
}

/**
 * Rejoue les advancements `AbilityScoreImprovement` jusqu'au niveau demandé,
 * en répartissant `configuration.points` sur les six caractéristiques sans
 * jamais dépasser `configuration.cap` sur une même caractéristique pour un
 * même advancement.
 *
 * @param {object} classEntry - Une entrée du catalogue rendu par `loadClassCatalog`.
 * @param {number} level      - Le niveau atteint par cette classe.
 * @param {{pick: function(Array): *}} rng - Le RNG déterministe.
 *
 * @returns {Array<{level: number, abilities: Object<string, number>}>} Une entrée par
 *   advancement atteint, triée par niveau croissant. `abilities` ne contient que
 *   les caractéristiques effectivement augmentées.
 */
export function resolveAbilityScoreImprovements(classEntry, level, rng) {
    const relevant = classEntry.advancement.abilityScoreImprovements
        .filter(asi => Number(asi.level) <= level)
        .sort((a, b) => Number(a.level) - Number(b.level));

    return relevant.map(asi => {
        const points = asi.configuration?.points ?? 0;
        const cap = asi.configuration?.cap ?? points;
        const abilities = {};
        let remaining = points;

        while (remaining > 0) {
            const candidates = ABILITY_KEYS.filter(key => (abilities[key] ?? 0) < cap);
            if (candidates.length === 0) break;
            const key = rng.pick(candidates);
            abilities[key] = (abilities[key] ?? 0) + 1;
            remaining -= 1;
        }

        return {level: Number(asi.level), abilities};
    });
}

/**
 * Calcule les PV du héros. Règle propre à FQ (à ne pas confondre avec la
 * règle 5e du modificateur de Constitution, sans rapport ici) : les PV de
 * niveau 1 valent ceux du héros vierge plus le dé de vie maximal de la classe
 * principale (`baseHitPoints`) ; chaque niveau au-delà du premier ajoute un jet du dé de vie de
 * la classe qui gagne ce niveau. La classe principale (première entrée de
 * `classEntries`) gagne ses niveaux 2..N en premier, puis chaque classe
 * secondaire ses niveaux 1..N (ce sont, pour elle, des niveaux neufs).
 *
 * @param {Array<{slug: string, level: number}>} classEntries - La répartition rendue par `splitClassLevels`.
 * @param {Object<string, object>} catalog - Le catalogue rendu par `loadClassCatalog`.
 * @param {{int: function(number, number): number}} rng - Le RNG déterministe.
 *
 * @returns {{max: number, base: number, rolls: Array<{level: number, slug: string, value: number}>}}
 *   `max` est le total de PV, `base` les PV de niveau 1, `rolls` le détail des jets.
 */
export function resolveHitPoints(classEntries, catalog, rng) {
    const [mainEntry, ...secondaryEntries] = classEntries;
    const base = catalog[mainEntry.slug].baseHitPoints;

    const rolls = [];
    let currentLevel = 1;

    for (let lvl = 2; lvl <= mainEntry.level; lvl++) {
        currentLevel += 1;
        rolls.push({
            level: currentLevel,
            slug: mainEntry.slug,
            value: rng.int(1, catalog[mainEntry.slug].hitDieFaces)
        });
    }

    for (const entry of secondaryEntries) {
        for (let lvl = 1; lvl <= entry.level; lvl++) {
            currentLevel += 1;
            rolls.push({
                level: currentLevel,
                slug: entry.slug,
                value: rng.int(1, catalog[entry.slug].hitDieFaces)
            });
        }
    }

    const max = base + rolls.reduce((sum, roll) => sum + roll.value, 0);
    return {max, base, rolls};
}
