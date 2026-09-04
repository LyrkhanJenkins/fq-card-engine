import {cp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {TOOL_ID, buildUatPlan, loadDeckVariants, loadMinions} from "./uat/plan.mjs";
import {loadClassCatalog} from "./uat/classes.mjs";
import {loadMonsterIndex} from "./uat/monsters.mjs";

/**
 * Générateur de mondes UAT (D-01) : ne fait QUE du système de fichiers — copier
 * le template committé, patcher world.json, écrire le plan et recopier les
 * scripts versionnés. Aucune base LevelDB n'est ouverte, ce qui rend l'outil
 * utilisable Foundry ouvert (contrairement à build-uat-base.mjs).
 *
 * Version complète (plan 19-03) : tous les axes de randomisation sont
 * exposés en options CLI, et le générateur pose les trois garde-fous
 * système de fichiers de la phase (nom de monde, remontée de répertoire,
 * écrasement d'un monde étranger — menaces T-19-07/T-19-09 de 19-CONTEXT.md).
 */

const MODULE_DIR = process.cwd();
const TEMPLATE_DIR = path.join(MODULE_DIR, "tests", "script", "uat-base");
// Scripts versionnés recopiés à la racine de chaque monde généré : les macros du
// template les importent par `/worlds/<monde>/<fichier>`, ils doivent donc y être.
const WORLD_SCRIPTS = ["uat-seeder.mjs", "uat-random-deck.mjs"];
const SCRIPTS_DIR = path.join(MODULE_DIR, "tests", "script");
const DEFAULT_WORLDS_DIR = path.join(MODULE_DIR, "..", "..", "worlds");
const INSTALLED_SYSTEM_MANIFEST = path.join(MODULE_DIR, "..", "..", "systems", "dnd5e", "system.json");

/**
 * Motif de validation du nom d'un monde : un premier caractère minuscule ou
 * chiffre, suivi d'au plus 62 caractères pris parmi les minuscules, les
 * chiffres et le tiret (63 caractères au total). Aucun `/`, `\`, `.` ni
 * majuscule — c'est ce qui interdit toute remontée de répertoire (`..`) une
 * fois le nom concaténé dans un chemin (menace T-19-07).
 *
 * @type {RegExp}
 */
export const WORLD_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Valide un nom de monde contre `WORLD_NAME_PATTERN`. Appelée AVANT toute
 * résolution ou concaténation de chemin (menace T-19-07).
 *
 * @param {string} name - Le nom candidat.
 *
 * @returns {void}
 * @throws {Error} Si le nom ne respecte pas le motif, citant le nom fautif.
 */
export function assertSafeWorldName(name) {
    if (typeof name !== "string" || !WORLD_NAME_PATTERN.test(name)) {
        throw new Error(
            `Nom de monde invalide: "${name}" (attendu: motif ${WORLD_NAME_PATTERN}, `
            + "minuscules/chiffres/tirets uniquement, 63 caractères maximum)."
        );
    }
}

/**
 * Résout le chemin absolu de la cible et vérifie qu'il est bien un enfant
 * DIRECT du dossier `worlds` résolu lui aussi en absolu. C'est ce double
 * contrôle (nom validé + confinement du chemin résolu) qui empêche toute
 * sortie du dossier `worlds` (menace T-19-07) — y compris si `name` avait par
 * ailleurs échappé au premier filtre.
 *
 * @param {string} worldsDir - Le dossier `worlds` cible.
 * @param {string} name      - Le nom du monde, déjà validé par `assertSafeWorldName`.
 *
 * @returns {string} Le chemin absolu résolu de la cible.
 * @throws {Error} Si le chemin résolu ne reste pas un enfant direct de `worldsDir`.
 */
export function resolveWorldDir(worldsDir, name) {
    const resolvedWorldsDir = path.resolve(worldsDir);
    const resolvedTarget = path.resolve(resolvedWorldsDir, name);

    if (path.dirname(resolvedTarget) !== resolvedWorldsDir) {
        throw new Error(
            `Cible hors du dossier worlds: "${resolvedTarget}" n'est pas un enfant direct de "${resolvedWorldsDir}".`
        );
    }

    return resolvedTarget;
}

/**
 * Rend vrai seulement si `dir` contient un `uat-seed.json` lisible dont le JSON
 * parse et porte une graine numérique. C'est le marqueur unique partagé avec
 * `clean-worlds.mjs` : lui seul autorise l'écrasement par le générateur
 * (menace T-19-09) et la suppression par le nettoyage (menace T-19-08). La
 * version du plan et l'identifiant d'outil ne sont volontairement PAS vérifiés,
 * pour que les mondes produits par une version antérieure restent gérables.
 *
 * @param {string} dir - Le dossier candidat.
 *
 * @returns {boolean}
 */
export function isToolGeneratedWorld(dir) {
    const seedPath = path.join(dir, "uat-seed.json");
    if (!existsSync(seedPath)) return false;

    try {
        const plan = JSON.parse(readFileSync(seedPath, "utf8"));
        // Le fichier marqueur suffit à identifier un monde produit par l'outil : aucun
        // monde réel n'en porte. Exiger en plus l'identifiant d'outil courant rendrait
        // les mondes générés par une version antérieure indéracinables — ni écrasables
        // par une régénération, ni supprimables par testWorld:clean. On vérifie donc la
        // forme minimale du plan (une graine numérique), pas sa version.
        return Number.isFinite(plan?.seed);
    } catch {
        return false;
    }
}

// Réexporté pour que clean-worlds.mjs (et les tests) partagent le même
// identifiant sans dupliquer sa définition — plan.mjs en reste la source unique.
export {TOOL_ID};

/**
 * Compare la `systemVersion` de l'index de monstres à celle du système dnd5e
 * installé, et AVERTIT (jamais n'échoue) en cas de décalage.
 *
 * @param {string} indexedVersion - `monsterIndex.systemVersion`.
 *
 * @returns {void}
 */
function warnOnSystemVersionMismatch(indexedVersion) {
    if (!existsSync(INSTALLED_SYSTEM_MANIFEST)) return;

    const manifest = JSON.parse(readFileSync(INSTALLED_SYSTEM_MANIFEST, "utf8"));
    if (manifest.version && manifest.version !== indexedVersion) {
        console.warn(
            `AVERTISSEMENT: l'index de monstres (systemVersion=${indexedVersion}) ne correspond pas `
            + `au système dnd5e installé (version=${manifest.version}). `
            + "Relancer `npm run testWorld:monsters` (Foundry fermé) pour le régénérer."
        );
    }
}

/**
 * Déclare les options de la ligne de commande avec `yargs` (même approche que
 * `utils/packs.mjs`). L'aide et la version intégrées sont désactivées : elles
 * appelleraient `process.exit`, ce qui rendrait `parseArgs` inutilisable depuis
 * les tests. `main` rend l'aide lui-même via `showHelp`.
 *
 * @param {string[]} argv - Les arguments bruts (`process.argv`).
 *
 * @returns {object} L'instance yargs configurée.
 */
function buildCli(argv) {
    return yargs(hideBin(argv))
        .option("seed", {type: "number", describe: "Graine du monde (tirée et affichée si omise)"})
        .option("class", {type: "string", describe: "slug[:niveau][,slug2[:niveau2]...]"})
        .option("level", {type: "number", describe: "Niveau total du héros (1-20)"})
        .option("enemies", {type: "string", describe: "Nombre, ou liste explicite (\"Goblin x3, Ogre\")"})
        .option("difficulty", {type: "string", describe: "easy | normal | hard | deadly"})
        .option("placement", {type: "string", describe: "packed | scattered | line | melee"})
        .option("allies", {type: "number", describe: "Nombre d'alliés (défaut 0)"})
        .option("regions", {type: "number", describe: "Nombre de regions"})
        .option("combat", {type: "boolean", default: false, describe: "Prépare et lance le combat au seed (défaut : non)"})
        .option("name", {type: "string", describe: "Nom du monde (défaut uat-<graine>)"})
        .option("worlds-dir", {type: "string", describe: "Dossier worlds cible (défaut le DataPath)"})
        .option("dry-run", {type: "boolean", default: false, describe: "Construit et affiche le plan sans rien écrire"})
        .help(false)
        .version(false);
}

/**
 * Analyse les arguments de la ligne de commande.
 *
 * @param {string[]} argv - Les arguments bruts (process.argv).
 *
 * @returns {object} Les options reconnues.
 */
export function parseArgs(argv) {
    return buildCli(argv).parseSync();
}

/**
 * Tire une graine aléatoire (32 bits non signés) quand `--seed` est omis.
 *
 * @returns {number}
 */
function randomSeed() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
}

/**
 * Génère un monde UAT complet : copie du template, plan écrit dans
 * `uat-seed.json`, scripts versionnés recopiés. N'ouvre aucune base LevelDB
 * (D-01) : uniquement du système de fichiers et du JSON.
 *
 * @param {object} options                    - Options reconnues (voir `parseArgs`).
 * @param {number} [options.seed]              - La graine (tirée si omise).
 * @param {string} [options.class]             - Surcharge d'axe (voir `plan.mjs`).
 * @param {number} [options.level]
 * @param {string|number} [options.enemies]
 * @param {string} [options.difficulty]
 * @param {string} [options.placement]
 * @param {number} [options.allies]
 * @param {number} [options.regions]
 * @param {boolean} [options.combat]           - Prépare et lance le combat au seed (défaut : non).
 * @param {string} [options.name]              - Le nom du monde (défaut `uat-<seed>`).
 * @param {string} [options["worlds-dir"]]     - Le dossier `worlds` cible (défaut le DataPath).
 * @param {boolean} [options["dry-run"]]       - Si vrai, construit et affiche le plan sans rien écrire.
 *
 * @returns {Promise<{targetDir: string, plan: object}>} Le dossier créé (ou visé, en `--dry-run`) et le plan écrit.
 */
export async function generateWorld(options = {}) {
    const seed = options.seed !== undefined ? Number(options.seed) : randomSeed();
    if (!Number.isFinite(seed)) {
        throw new Error("Un --seed numérique est requis.");
    }
    if (options.seed === undefined) {
        console.info(`Graine tirée: ${seed} (rejouable avec --seed=${seed})`);
    }

    const worldName = options.name ?? `uat-${seed}`;
    assertSafeWorldName(worldName);

    const worldsDir = options["worlds-dir"] ?? DEFAULT_WORLDS_DIR;
    const targetDir = resolveWorldDir(worldsDir, worldName);

    const [catalog, monsterIndex, minions, deckVariants] = await Promise.all([
        loadClassCatalog(MODULE_DIR),
        loadMonsterIndex(path.join(MODULE_DIR, "tests", "script", "uat", "monsters-index.json")),
        loadMinions(MODULE_DIR),
        loadDeckVariants(MODULE_DIR)
    ]);
    warnOnSystemVersionMismatch(monsterIndex.systemVersion);

    const planOptions = {
        class: options.class,
        level: options.level !== undefined ? Number(options.level) : undefined,
        enemies: options.enemies,
        difficulty: options.difficulty,
        placement: options.placement,
        allies: options.allies !== undefined ? Number(options.allies) : undefined,
        regions: options.regions !== undefined ? Number(options.regions) : undefined,
        combat: options.combat === true ? true : undefined
    };
    for (const key of Object.keys(planOptions)) {
        if (planOptions[key] === undefined) delete planOptions[key];
    }

    const plan = buildUatPlan({seed, options: planOptions, catalog, monsterIndex, minions, deckVariants});

    if (options["dry-run"]) {
        console.info(JSON.stringify(plan, null, 2));
        console.info(`(dry-run) Monde non écrit: ${targetDir}`);
        return {targetDir, plan};
    }

    if (existsSync(targetDir)) {
        if (!isToolGeneratedWorld(targetDir)) {
            throw new Error(
                `Refus d'écraser "${targetDir}" : ce dossier existe déjà mais ne porte pas le marqueur `
                + "uat-seed.json de cet outil (menace T-19-09). Choisir un autre --name, ou supprimer ce "
                + "dossier manuellement si vous êtes certain(e) qu'il ne s'agit pas d'un monde réel."
            );
        }
        await rm(targetDir, {recursive: true, force: true});
    }

    await mkdir(worldsDir, {recursive: true});
    await cp(TEMPLATE_DIR, targetDir, {recursive: true});

    const worldJsonPath = path.join(targetDir, "world.json");
    const world = JSON.parse(await readFile(worldJsonPath, "utf8"));
    world.id = worldName;
    world.title = worldName;
    world.description = `Monde UAT généré (graine ${seed}) : ${plan.hero.classes.map(c => `${c.className} niv.${c.level}`).join(" / ")} `
        + `contre ${plan.enemies.length} ennemi(s) (motif ${plan.placement.pattern}).`;
    world.playtime = 0;
    delete world.lastPlayed;
    await writeFile(worldJsonPath, `${JSON.stringify(world, null, 2)}\n`);

    // uat-seed.json est écrit AVANT le seeder : c'est le marqueur qui identifie un
    // monde produit par l'outil (isToolGeneratedWorld, réutilisé par clean-worlds.mjs).
    await writeFile(path.join(targetDir, "uat-seed.json"), `${JSON.stringify(plan, null, 2)}\n`);
    for (const script of WORLD_SCRIPTS) {
        await cp(path.join(SCRIPTS_DIR, script), path.join(targetDir, script));
    }

    console.info(`Monde UAT généré: ${targetDir}`);
    console.info(plan.journal.regenerateCommand);

    return {targetDir, plan};
}

async function main() {
    // L'aide de yargs est désactivée dans `parseArgs` pour que la fonction reste
    // pure et sans `process.exit` quand les tests l'appellent. On la rend donc ici,
    // sans quoi `--help` retomberait sur le chemin nominal et générerait un monde.
    if (process.argv.slice(2).some(arg => arg === "--help" || arg === "-h")) {
        buildCli(process.argv).showHelp();
        return;
    }

    const options = parseArgs(process.argv);
    await generateWorld(options);
}

const invokedDirectly = process.argv[1] && (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]));
if (invokedDirectly) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
