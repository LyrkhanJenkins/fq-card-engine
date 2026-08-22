import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {cp, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {ClassicLevel} from "classic-level";
import {extractPack} from "@foundryvtt/foundryvtt-cli";

/**
 * Verrouille le contenu du template committé tests/script/uat-base (UAT-02).
 *
 * IMPORTANT : ouvrir une base LevelDB la réécrit sur disque (compaction :
 * CURRENT, MANIFEST-xxx et LOG changent) même en lecture seule. Ce test recopie
 * donc systématiquement le template vers os.tmpdir() AVANT toute extraction,
 * et n'extrait jamais tests/script/uat-base directement.
 */

const REPO_ROOT = process.cwd();
const SOURCE_TEMPLATE_DIR = path.join(REPO_ROOT, "tests", "script", "uat-base");

let tempDir;
let tempTemplateDataDir;
let users;
let actors;
let scenes;
let macros;
let settings;

/**
 * Liste les clés brutes de la collection `scenes` de la copie temporaire du
 * template. `extractPack` n'expose pas les documents embarqués que le CLI ne
 * connaît pas (les niveaux de scène v14), d'où la lecture directe.
 *
 * @returns {Promise<string[]>} Les clés LevelDB de la collection `scenes`.
 */
async function readSceneKeys() {
    const db = new ClassicLevel(path.join(tempTemplateDataDir, "scenes"), {valueEncoding: "json"});
    try {
        return await db.keys().all();
    } finally {
        await db.close();
    }
}

async function extractCollection(collection) {
    const src = path.join(tempTemplateDataDir, collection);
    const dest = path.join(tempDir, "extracted", collection);
    const docs = [];
    await extractPack(src, dest, {
        collection,
        log: false,
        transformEntry: (entry) => {
            docs.push(entry);
            return false;
        }
    });
    return docs;
}

beforeAll(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "uat-base-test-"));
    const tempTemplateDir = path.join(tempDir, "uat-base-copy");
    await cp(SOURCE_TEMPLATE_DIR, tempTemplateDir, {recursive: true});
    tempTemplateDataDir = path.join(tempTemplateDir, "data");

    users = await extractCollection("users");
    actors = await extractCollection("actors");
    scenes = await extractCollection("scenes");
    macros = await extractCollection("macros");
    settings = await extractCollection("settings");
}, 60000);

afterAll(async () => {
    await rm(tempDir, {recursive: true, force: true});
});

describe("template uat-base", () => {
    it("contient exactement 2 users : le MJ (role 4) et UAT Player (role 1), sans personnage", () => {
        expect(users).toHaveLength(2);

        const gm = users.find(u => u.role === 4);
        const player = users.find(u => u.role === 1);

        expect(gm).toBeDefined();
        expect(player).toBeDefined();
        expect(player.name).toBe("UAT Player");
        expect(gm.character).toBeNull();
        expect(player.character).toBeNull();
    });

    it("pose la macro 'Seed UAT' en slot 1 de la hotbar du MJ", () => {
        const gm = users.find(u => u.role === 4);
        expect(gm.hotbar).toEqual({"1": "uatSeedMacro0001"});
    });

    it("ne laisse au MJ aucun flag du module lié au monde source", () => {
        const gm = users.find(u => u.role === 4);

        // Les flags `UserID-<n>` / `CardsID-<n>` lient chaque barre du conteneur de
        // main à un user et à un jeu de cartes. Hérités de test-world, ils pointent
        // vers des documents absents du monde généré et rendent le conteneur
        // inconfigurable pour le MJ.
        expect(gm.flags["fq-card-engine"]).toBeUndefined();
    });

    it("ne contient aucun acteur (le héros est importé par le seeder)", () => {
        expect(actors).toHaveLength(0);
    });

    it("contient une seule scène active, vidée de ses tokens et de ses regions", () => {
        expect(scenes).toHaveLength(1);
        const [scene] = scenes;

        expect(scene.active).toBe(true);
        expect(scene.tokens).toHaveLength(0);
        expect(scene.regions).toHaveLength(0);
        expect(scene.thumb).toBeNull();
        expect(scene.grid.size).toBe(256);
        expect(scene.width).toBe(12288);
        expect(scene.height).toBe(6912);
        expect(scene.ownership.default).toBe(2);
    });

    it("conserve le document de niveau que la scène référence", async () => {
        const [scene] = scenes;
        expect(scene.levels).toHaveLength(1);

        // Chaque id listé dans `levels` doit correspondre à un document de niveau
        // réellement présent dans la base. Une référence pendante bloque le canvas
        // en `canvas.loading` : plus aucune scène n'est visualisable, et la fiche de
        // configuration plante sur `initialLevel.id`. C'est ce que produisait le
        // round-trip extractPack/compilePack, qui ignore les clés `!scenes.levels!`.
        const keys = await readSceneKeys();
        for (const levelId of scene.levels) {
            expect(keys).toContain(`!scenes.levels!${scene._id}.${levelId}`);
        }
    });

    it("ajoute la macro 'Seed UAT' qui importe dynamiquement le seeder versionné", () => {
        const seedMacro = macros.find(m => m.name === "Seed UAT");

        expect(seedMacro).toBeDefined();
        expect(seedMacro._id).toBe("uatSeedMacro0001");
        expect(seedMacro.command).toContain("uat-seeder.mjs");
        expect(seedMacro.command).toContain("seedUatWorld");
    });

    it("force à true les trois réglages de jeu attendus dans un monde UAT", () => {
        // Un monde UAT doit exercer le moteur dans sa configuration de jeu réelle :
        // droits de cartes limités côté joueur, initiative jetée automatiquement,
        // et jet d'attaque d'arme court-circuité.
        for (const key of ["PlayerLimitCardsRight", "RollInitiative", "BypassWeaponAttackRoll"]) {
            const setting = settings.find(s => s.key === `fq-card-engine.${key}`);

            expect(setting, `réglage manquant : ${key}`).toBeDefined();
            expect(JSON.parse(setting.value), `réglage non activé : ${key}`).toBe(true);
        }
    });

    it("active fq-card-engine dans le réglage core.moduleConfiguration", () => {
        const setting = settings.find(s => s.key === "core.moduleConfiguration");

        expect(setting).toBeDefined();
        const moduleConfiguration = JSON.parse(setting.value);
        expect(moduleConfiguration["fq-card-engine"]).toBe(true);
    });
});
