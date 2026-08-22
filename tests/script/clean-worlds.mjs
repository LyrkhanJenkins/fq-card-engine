import {readdir, rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {isToolGeneratedWorld} from "./generate-world.mjs";

/**
 * `npm run testWorld:clean` : supprime les mondes UAT générés par
 * `generate-world.mjs`, et RIEN d'autre (menace T-19-08 de 19-CONTEXT.md — un
 * `rm` trop large détruirait des mondes de jeu réels de l'utilisateur). Le
 * marqueur de reconnaissance (`isToolGeneratedWorld`) est importé de
 * `generate-world.mjs`, jamais redéfini ici.
 */

const MODULE_DIR = process.cwd();
const DEFAULT_WORLDS_DIR = path.join(MODULE_DIR, "..", "..", "worlds");
const GENERATED_PREFIX = "uat-";

/**
 * Liste les mondes générés par l'outil sous `worldsDir`. Le parcours n'est
 * JAMAIS récursif : seuls les enfants directs sont examinés. Une entrée n'est
 * retenue que si les TROIS conditions suivantes sont vraies (garde triple
 * cumulative, menace T-19-08) :
 * - c'est un répertoire (jamais un fichier, jamais un lien symbolique) ;
 * - son nom commence par le préfixe `uat-` ;
 * - `isToolGeneratedWorld` (generate-world.mjs) rend vrai pour ce dossier.
 *
 * @param {string} worldsDir - Le dossier `worlds` à examiner.
 *
 * @returns {Promise<string[]>} Les noms des dossiers retenus. Une liste vide si `worldsDir`
 *   n'existe pas (aucune exception levée).
 */
export async function findGeneratedWorlds(worldsDir) {
    let entries;
    try {
        entries = await readdir(worldsDir, {withFileTypes: true});
    } catch {
        return [];
    }

    return entries
        .filter(entry => entry.isDirectory())
        .filter(entry => entry.name.startsWith(GENERATED_PREFIX))
        .filter(entry => isToolGeneratedWorld(path.join(worldsDir, entry.name)))
        .map(entry => entry.name);
}

/**
 * Supprime (ou, en `dryRun`, se contente de lister) les mondes générés
 * trouvés par `findGeneratedWorlds`. Énumère systématiquement sur la console
 * ce qui a été supprimé/listé, ainsi que le nombre d'entrées ignorées, pour
 * qu'une portée trop large soit immédiatement visible.
 *
 * @param {object} params
 * @param {string} [params.worldsDir] - Le dossier `worlds` cible (défaut le DataPath).
 * @param {boolean} [params.dryRun]   - Si vrai, ne supprime rien.
 *
 * @returns {Promise<string[]>} Les noms de monde traités (supprimés, ou listés en `dryRun`).
 */
export async function cleanGeneratedWorlds({worldsDir = DEFAULT_WORLDS_DIR, dryRun = false} = {}) {
    let totalEntries = 0;
    try {
        totalEntries = (await readdir(worldsDir)).length;
    } catch {
        totalEntries = 0;
    }

    const generated = await findGeneratedWorlds(worldsDir);
    const ignoredCount = totalEntries - generated.length;

    if (dryRun) {
        for (const name of generated) console.info(`(dry-run) Monde généré trouvé: ${name}`);
    } else {
        for (const name of generated) {
            await rm(path.join(worldsDir, name), {recursive: true, force: true});
            console.info(`Monde supprimé: ${name}`);
        }
    }

    console.info(
        `${generated.length} monde(s) ${dryRun ? "trouvé(s)" : "supprimé(s)"}, `
        + `${ignoredCount} entrée(s) ignorée(s) (hors périmètre du nettoyage).`
    );

    return generated;
}

/**
 * Analyse les arguments de la ligne de commande.
 *
 * @param {string[]} argv - `process.argv` complet.
 *
 * @returns {object} Les options reconnues (`worlds-dir`, `dry-run`).
 */
function parseArgs(argv) {
    return yargs(hideBin(argv))
        .option("worlds-dir", {type: "string", describe: "Dossier worlds cible (défaut le DataPath)"})
        .option("dry-run", {type: "boolean", default: false, describe: "Liste sans rien supprimer"})
        .help(false)
        .version(false)
        .parseSync();
}

async function main() {
    const options = parseArgs(process.argv);
    await cleanGeneratedWorlds({
        worldsDir: options["worlds-dir"] ?? DEFAULT_WORLDS_DIR,
        dryRun: options["dry-run"]
    });
}

const invokedDirectly = process.argv[1] && (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]));
if (invokedDirectly) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
