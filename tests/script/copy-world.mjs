// scripts/e2e-run.mjs
import {access, cp, rm} from "node:fs/promises";
import {constants as FS} from "node:fs";
import path from "node:path";

const MODULE_DIR = process.cwd();
const worldName = process.argv[2];

// Monde template (dans le repo) et destination (dans le DataPath)
const SRC_WORLD_DIR = path.join(MODULE_DIR, "tests", "script", worldName);
const TARGET_WORLD_DIR = path.join(MODULE_DIR, "..", "..", "worlds", worldName);

// ====== utils ======
async function exists(p) {
    try {
        await access(p, FS.F_OK);
        return true;
    } catch {
        return false;
    }
}

// ====== Main orchestration ======
async function main() {
    console.log(`== E2E :: préparation DataPath (monde: ${worldName}) ==`);

    // Copie du monde template
    if (!(await exists(SRC_WORLD_DIR))) {
        console.error(`Dossier script introuvable: ${SRC_WORLD_DIR}`);
        process.exit(1);
    }
    if (await exists(TARGET_WORLD_DIR)) {
        await rm(TARGET_WORLD_DIR, {recursive: true, force: true});
    }
    await cp(SRC_WORLD_DIR, TARGET_WORLD_DIR, {recursive: true});
    console.log(`Monde '${worldName}' copié dans ${TARGET_WORLD_DIR}`);
}

main().catch(async (err) => {
    console.error(err);
    process.exit(1);
});
