import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {extractPack} from "@foundryvtt/foundryvtt-cli";

/**
 * Script à la demande (`npm run testWorld:monsters`), SEUL consommateur de la
 * base LevelDB du système dnd5e installé (D-01, T-19-04) : il en dérive un
 * index JSON committé (`tests/script/uat/monsters-index.json`), qui est la
 * seule chose que le générateur de mondes lit ensuite. Ouvrir une base
 * LevelDB la réécrit (compaction) même en lecture seule — c'est pourquoi ce
 * script exige Foundry fermé, et pourquoi il n'écrit jamais dans `systems/`
 * (le dossier de destination passé à `extractPack` n'est qu'un répertoire
 * temporaire jetable : `transformEntry` rend `false` pour ne matérialiser
 * aucun fichier extrait, seulement collecter les entrées en mémoire).
 */

const MODULE_DIR = process.cwd();
const DATA_PATH = path.join(MODULE_DIR, "..", "..");
const MONSTERS_PACK_DIR = path.join(DATA_PATH, "systems", "dnd5e", "packs", "monsters");
const SYSTEM_MANIFEST_PATH = path.join(DATA_PATH, "systems", "dnd5e", "system.json");
const OUTPUT_PATH = path.join(MODULE_DIR, "tests", "script", "uat", "monsters-index.json");

/**
 * Extrait les entrées brutes du pack `dnd5e.monsters` sans rien écrire dans
 * le dossier du système : `transformEntry` collecte chaque entrée en mémoire
 * et rend `false`, ce qui court-circuite l'écriture de fichier d'`extractPack`.
 *
 * @returns {Promise<object[]>} Les entrées brutes du pack (acteurs et documents catégorie confondus).
 */
async function extractRawMonsterEntries() {
    const entries = [];
    const scratchDest = await mkdtemp(path.join(os.tmpdir(), "monster-index-"));
    await extractPack(MONSTERS_PACK_DIR, scratchDest, {
        log: false,
        transformEntry: entry => {
            entries.push(entry);
            return false;
        }
    });
    return entries;
}

/**
 * Construit l'index de monstres SRD à partir du pack `dnd5e.monsters`
 * installé, et l'écrit dans `tests/script/uat/monsters-index.json`.
 *
 * @returns {Promise<object>} L'index écrit (mêmes champs que le fichier).
 */
export async function buildMonsterIndex() {
    const manifest = JSON.parse(await readFile(SYSTEM_MANIFEST_PATH, "utf8"));
    const rawEntries = await extractRawMonsterEntries();

    // Filtre les ~15 documents catégorie du SRD (ex. "Aberration"), dépourvus
    // de CR numérique : ce ne sont pas des créatures (D-06, UAT-05).
    const monsters = rawEntries
        .filter(entry => Number.isFinite(entry.system?.details?.cr))
        .map(entry => {
            const cr = entry.system.details.cr;
            return {
                name: entry.name,
                id: entry._id,
                uuid: `Compendium.dnd5e.monsters.Actor.${entry._id}`,
                cr,
                crEighths: Math.round(cr * 8),
                type: entry.system.details.type?.value ?? null,
                size: entry.system.traits?.size ?? null,
                width: entry.prototypeToken?.width ?? 1,
                height: entry.prototypeToken?.height ?? 1,
                hp: entry.system.attributes?.hp?.max ?? null
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    const index = {
        system: "dnd5e",
        systemVersion: manifest.version,
        generatedAt: new Date().toISOString(),
        count: monsters.length,
        monsters
    };

    await writeFile(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`);
    return index;
}

async function main() {
    const index = await buildMonsterIndex();
    console.info(`Index de monstres généré : ${index.count} entrées -> ${OUTPUT_PATH}`);
}

const invokedDirectly = process.argv[1] && (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]));
if (invokedDirectly) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
