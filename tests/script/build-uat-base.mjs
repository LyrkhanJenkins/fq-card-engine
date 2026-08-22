import {access, cp, mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import {constants as FS} from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {ClassicLevel} from "classic-level";
import {compilePack, extractPack} from "@foundryvtt/foundryvtt-cli";

/**
 * Script one-shot (D-11) : fabrique tests/script/uat-base à partir de
 * tests/script/test-world. C'est le SEUL script de la phase à écrire du
 * LevelDB — exige Foundry fermé (verrou LEVEL_ITERATOR_NOT_OPEN sinon).
 * Rejouable via --force ; le résultat est committé.
 */

const MODULE_DIR = process.cwd();
const SRC_WORLD_DIR = path.join(MODULE_DIR, "tests", "script", "test-world");
const TARGET_WORLD_DIR = path.join(MODULE_DIR, "tests", "script", "uat-base");

const FORCE = process.argv.includes("--force");

const GM_USER_ID = "uUbINdqSmS5ll9IK";
const PLAYER_USER_ID = "uatPlayerUser001";
const SEED_MACRO_ID = "uatSeedMacro0001";
const MODULE_ID = "fq-card-engine";
const ARENA_SCENE_ID = "Pl5kNER7PeAwjkHI";
const UNUSED_ARENA_IMAGE = "ancienne_arene_semoutiene.png";

// Réglages de portée monde forcés dans tout monde UAT : les mondes générés doivent
// tester le moteur dans sa configuration de jeu réelle. Les réglages d'autres modules
// activés dans le template en font partie. L'id est figé pour que la fabrication du
// template reste reproductible.
const FORCED_SETTINGS = [
    {module: MODULE_ID, key: "PlayerLimitCardsRight", value: true, id: "fqUatSetting0001"},
    {module: MODULE_ID, key: "RollInitiative", value: true, id: "fqUatSetting0002"},
    {module: MODULE_ID, key: "BypassWeaponAttackRoll", value: true, id: "fqUatSetting0003"},
    // fq-restrain-movement laisse le MJ hors restrictions par défaut ; en UAT on veut
    // au contraire qu'il soit soumis aux mêmes règles de déplacement que le joueur.
    {module: "fq-restrain-movement", key: "gmNotRestrained", value: false, id: "fqUatSetting0004"}
];

// Horodatage figé pour que le template one-shot reste reproductible à l'octet
// près d'une fabrication à l'autre (hors id/timestamps de compaction LevelDB).
const FIXED_STATS_TIME = 1787200000000;

// Sel figé, pour la même raison de reproductibilité. Aucun enjeu de sécurité :
// le mot de passe du joueur UAT est vide par construction, et le monde est local.
const PLAYER_PASSWORD_SALT = "0000000000000000000000000000000000000000000000000000000000000000";

// Le serveur Foundry appelle testPassword(soumis, user.password, user.passwordSalt),
// qui compare pbkdf2Sync(soumis, sel, 1000, 64, "sha512") au hash stocké — sans
// aucun court-circuit pour un mot de passe vide. Un user portant password: "" et
// aucun sel ne peut donc jamais se connecter : il faut stocker le hash du vide.
function hashEmptyPassword() {
    return crypto.pbkdf2Sync("", PLAYER_PASSWORD_SALT, 1000, 64, "sha512").toString("hex");
}

// ====== utils ======

async function exists(p) {
    try {
        await access(p, FS.F_OK);
        return true;
    } catch {
        return false;
    }
}

function buildStats(overrides = {}) {
    return {
        coreVersion: "14.367",
        systemId: "dnd5e",
        systemVersion: "5.3.3",
        createdTime: FIXED_STATS_TIME,
        modifiedTime: FIXED_STATS_TIME,
        lastModifiedBy: GM_USER_ID,
        compendiumSource: null,
        duplicateSource: null,
        exportSource: null,
        ...overrides
    };
}

async function withTempDir(prefix, run) {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
    try {
        await run(dir);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function findJsonFiles(dir) {
    const entries = await readdir(dir, {withFileTypes: true});
    const files = [];
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await findJsonFiles(entryPath));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(entryPath);
        }
    }
    return files;
}

// ====== transformations LevelDB ======
// Mécanique commune : extraire la base vers un dossier JSON temporaire sous
// os.tmpdir(), muter les fichiers, puis recompiler ce dossier directement
// sur la base d'origine. compilePack purge automatiquement toute clé absente
// du jeu de fichiers source fourni (cf. @foundryvtt/foundryvtt-cli/lib/package.mjs),
// ce qui permet de "supprimer" des documents en ne les recopiant simplement pas.

async function emptyCollection(collection) {
    const dbPath = path.join(TARGET_WORLD_DIR, "data", collection);
    await withTempDir(`uat-base-${collection}-`, async (tmpDir) => {
        // Dossier source vide : compilePack purgera alors toutes les clés existantes.
        await compilePack(tmpDir, dbPath, {recursive: true, log: false});
    });
    console.info(`Collection '${collection}' vidée.`);
}

async function transformUsers() {
    const collection = "users";
    const dbPath = path.join(TARGET_WORLD_DIR, "data", collection);
    await withTempDir("uat-base-users-", async (tmpDir) => {
        await extractPack(dbPath, tmpDir, {collection, log: false});

        const files = await findJsonFiles(tmpDir);
        for (const file of files) {
            const doc = await readJson(file);
            if (doc._id === GM_USER_ID) {
                doc.character = null;
                doc.hotbar = {"1": SEED_MACRO_ID};
                // Les flags du module lient chaque barre de main du MJ à un couple
                // (user, jeu de cartes) du monde source. Ces ids n'existent pas dans un
                // monde généré : les conserver laisse le conteneur de main pré-câblé sur
                // sept références mortes, impossible à configurer proprement.
                delete doc.flags[MODULE_ID];
                await writeJson(file, doc);
            } else {
                // Retire les 9 joueurs starter du monde source : seul le MJ est conservé.
                await rm(file, {force: true});
            }
        }

        const playerUser = {
            name: "UAT Player",
            role: 1,
            _id: PLAYER_USER_ID,
            password: hashEmptyPassword(),
            passwordSalt: PLAYER_PASSWORD_SALT,
            avatar: null,
            character: null,
            color: "#ff6400",
            pronouns: "",
            hotbar: {},
            permissions: {},
            flags: {},
            _stats: buildStats(),
            _key: `!users!${PLAYER_USER_ID}`
        };
        await writeJson(path.join(tmpDir, "uat-player.json"), playerUser);

        await compilePack(tmpDir, dbPath, {recursive: true, log: false});
    });
    console.info("Collection 'users' réduite au MJ + UAT Player, tous deux sans personnage.");
}

async function transformScenes() {
    const dbPath = path.join(TARGET_WORLD_DIR, "data", "scenes");

    // Édition en place, sans extractPack/compilePack : ce round-trip perd les documents
    // de niveau de scène (clés "!scenes.levels!", introduites en v14 et inconnues du CLI
    // 1.1.0), alors que le document de scène continue de les référencer. Une scène dont
    // "levels" pointe vers un niveau absent fait échouer le rendu du canvas — il reste
    // bloqué en "canvas.loading", donc plus aucune scène n'est visualisable — et fait
    // planter sa fiche de configuration sur "initialLevel.id".
    const db = new ClassicLevel(dbPath, {valueEncoding: "json"});
    try {
        const sceneKey = `!scenes!${ARENA_SCENE_ID}`;
        const doc = await db.get(sceneKey);
        doc.tokens = [];
        doc.regions = [];
        // Sans droit d'observation par défaut, un user joueur voit la scène dans la barre
        // de navigation mais ne peut ni la visualiser ni cliquer dessus. Le porter ici, et
        // non au moment du seed, évite le piège d'ordre : le monde est navigable par le
        // joueur même avant que le MJ ait lancé « Seed UAT ».
        doc.ownership = {...doc.ownership, default: 2};
        // Chemin dépendant du nom du monde ("worlds/test-world/...") : n'existerait pas
        // dans un monde généré. Foundry régénère la vignette à la première ouverture.
        doc.thumb = null;
        await db.put(sceneKey, doc);

        const obsolete = (await db.keys().all()).filter(key =>
            key.startsWith("!scenes.tokens!")
            || key.startsWith("!scenes.tokens.delta!")
            || key.startsWith("!scenes.regions!"));
        if (obsolete.length) {
            await db.batch(obsolete.map(key => ({type: "del", key})));
        }
    } finally {
        await db.close();
    }

    console.info("Scène de l'arène vidée (tokens/regions), partagée en observation, vignette retirée. Murs, niveau, grille et padding intacts.");
}

async function transformSettings() {
    const collection = "settings";
    const dbPath = path.join(TARGET_WORLD_DIR, "data", collection);
    await withTempDir("uat-base-settings-", async (tmpDir) => {
        await extractPack(dbPath, tmpDir, {collection, log: false});

        const files = await findJsonFiles(tmpDir);
        const docsByKey = new Map();
        for (const file of files) {
            const doc = await readJson(file);
            docsByKey.set(doc.key, {file, doc});
        }

        for (const forced of FORCED_SETTINGS) {
            const key = `${forced.module}.${forced.key}`;
            const existing = docsByKey.get(key);
            if (existing) {
                // La valeur d'un réglage est stockée sérialisée en JSON, jamais en booléen brut.
                existing.doc.value = JSON.stringify(forced.value);
                await writeJson(existing.file, existing.doc);
                continue;
            }
            await writeJson(path.join(tmpDir, `${forced.id}.json`), {
                key,
                user: null,
                value: JSON.stringify(forced.value),
                _id: forced.id,
                _stats: buildStats(),
                _key: `!settings!${forced.id}`
            });
        }

        await compilePack(tmpDir, dbPath, {recursive: true, log: false});
    });
    console.info(`Réglages forcés : ${FORCED_SETTINGS.map(s => `${s.module}.${s.key}=${s.value}`).join(", ")}.`);
}

async function transformMacros() {
    const collection = "macros";
    const dbPath = path.join(TARGET_WORLD_DIR, "data", collection);
    await withTempDir("uat-base-macros-", async (tmpDir) => {
        // Les 13 macros existantes sont recopiées telles quelles.
        await extractPack(dbPath, tmpDir, {collection, log: false});

        const seedMacro = {
            name: "Seed UAT",
            type: "script",
            command: [
                "try {",
                "    const url = `/worlds/${game.world.id}/uat-seeder.mjs?t=${Date.now()}`;",
                "    const module = await import(url);",
                "    await module.seedUatWorld();",
                "} catch (err) {",
                "    ui.notifications.error(err.message);",
                "}"
            ].join("\n"),
            img: "icons/svg/dice-target.svg",
            author: GM_USER_ID,
            scope: "global",
            folder: null,
            ownership: {default: 0},
            flags: {},
            _stats: buildStats(),
            _id: SEED_MACRO_ID,
            sort: 0,
            _key: `!macros!${SEED_MACRO_ID}`
        };
        await writeJson(path.join(tmpDir, "seed-uat.json"), seedMacro);

        await compilePack(tmpDir, dbPath, {recursive: true, log: false});
    });
    console.info("Macro 'Seed UAT' ajoutée aux 13 macros existantes.");
}

async function patchWorldJson() {
    const worldJsonPath = path.join(TARGET_WORLD_DIR, "world.json");
    const world = await readJson(worldJsonPath);
    world.id = "uat-base";
    world.title = "uat-base";
    world.description = "Template UAT minimal : 1 MJ + 1 joueur sans personnage, arène vide, "
        + "macro « Seed UAT » en hotbar. Fabriqué par tests/script/build-uat-base.mjs.";
    world.playtime = 0;
    delete world.lastPlayed;
    await writeJson(worldJsonPath, world);
    console.info("world.json patché (id/title = 'uat-base').");
}

// ====== Main orchestration ======

async function main() {
    console.info("== UAT :: fabrication du template 'uat-base' ==");

    if (!(await exists(SRC_WORLD_DIR))) {
        console.error(`Monde source introuvable: ${SRC_WORLD_DIR}`);
        process.exit(1);
    }

    if (await exists(TARGET_WORLD_DIR)) {
        if (!FORCE) {
            console.error(`La cible existe déjà: ${TARGET_WORLD_DIR}. Relancer avec --force pour l'écraser.`);
            process.exit(1);
        }
        await rm(TARGET_WORLD_DIR, {recursive: true, force: true});
    }

    await cp(SRC_WORLD_DIR, TARGET_WORLD_DIR, {
        recursive: true,
        // Le document de scène ne référence aucune image (ni background, ni tuile) :
        // recopier ce PNG de 43 Mo alourdirait chaque monde généré pour rien.
        filter: (src) => path.basename(src) !== UNUSED_ARENA_IMAGE
    });
    console.info(`Monde source copié vers ${TARGET_WORLD_DIR}`);

    await transformUsers();
    await emptyCollection("actors");
    await transformScenes();
    await emptyCollection("journal");
    await transformSettings();
    await transformMacros();
    await patchWorldJson();

    console.info("== Template 'uat-base' prêt. ==");
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
