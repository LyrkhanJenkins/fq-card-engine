import {beforeEach, describe, expect, it} from "vitest";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {cleanGeneratedWorlds, findGeneratedWorlds} from "../script/clean-worlds.mjs";
import {generateWorld} from "../script/generate-world.mjs";

/**
 * Couvre `npm run testWorld:clean` (UAT-03, menace T-19-08) sur une
 * arborescence `worlds` temporaire reproduisant fidèlement le DataPath réel
 * de l'utilisateur : un monde de jeu réel, `test-world`, un dossier `uat-`
 * SANS marqueur, un dossier `uat-` au marqueur corrompu/étranger, et un
 * fichier isolé — aucun d'eux ne doit jamais être supprimé.
 */

let worldsDir;

beforeEach(async () => {
    worldsDir = await mkdtemp(path.join(os.tmpdir(), "uat-clean-worlds-"));
});

/**
 * Monte, sous `worldsDir`, une situation représentative du DataPath réel.
 *
 * @returns {Promise<void>}
 */
async function seedRepresentativeWorldsDir() {
    // Monde généré par l'outil, avec marqueur — SEUL candidat à la suppression.
    await generateWorld({seed: 4242, class: "witch", level: 1, name: "uat-4242", "worlds-dir": worldsDir});

    // Bon préfixe, mais AUCUN marqueur.
    const fakeDir = path.join(worldsDir, "uat-fake");
    await mkdir(fakeDir, {recursive: true});
    await writeFile(path.join(fakeDir, "witness.txt"), "monde uat- sans marqueur, ne pas toucher");

    // Bon préfixe, marqueur illisible / d'un autre outil.
    const brokenDir = path.join(worldsDir, "uat-broken");
    await mkdir(brokenDir, {recursive: true});
    await writeFile(path.join(brokenDir, "uat-seed.json"), JSON.stringify({generator: {tool: "un-autre-outil"}}));
    await writeFile(path.join(brokenDir, "witness.txt"), "marqueur étranger, ne pas toucher");

    // Monde produit par une version ANTÉRIEURE du générateur : son marqueur ne porte
    // pas l'identifiant d'outil courant, mais c'est bien un monde de l'outil. Il doit
    // rester nettoyable, sans quoi les mondes d'hier s'accumulent indéfiniment.
    const legacyDir = path.join(worldsDir, "uat-legacy");
    await mkdir(legacyDir, {recursive: true});
    await writeFile(path.join(legacyDir, "uat-seed.json"), JSON.stringify({
        planVersion: 1,
        generator: {tool: "tests/script/generate-world.mjs"},
        seed: 1337
    }));

    // Monde figé (copy-world.mjs), jamais un monde de l'outil.
    const testWorldDir = path.join(worldsDir, "test-world");
    await mkdir(testWorldDir, {recursive: true});
    await writeFile(path.join(testWorldDir, "world.json"), JSON.stringify({id: "test-world"}));

    // Monde de jeu réel de l'utilisateur.
    const realWorldDir = path.join(worldsDir, "final-quest-8");
    await mkdir(realWorldDir, {recursive: true});
    await writeFile(path.join(realWorldDir, "world.json"), JSON.stringify({id: "final-quest-8"}));

    // Fichier isolé (jamais un répertoire) — doit être ignoré par le parcours.
    await writeFile(path.join(worldsDir, "uat-archive.rar"), "contenu binaire simulé");
}

describe("findGeneratedWorlds", () => {
    it("ne retient que les mondes produits par l outil, version antérieure comprise", async () => {
        await seedRepresentativeWorldsDir();

        const found = await findGeneratedWorlds(worldsDir);
        expect(found.sort()).toEqual(["uat-4242", "uat-legacy"]);
    });

    it("rend une liste vide, sans exception, pour un dossier worlds inexistant", async () => {
        const found = await findGeneratedWorlds(path.join(worldsDir, "does-not-exist"));
        expect(found).toEqual([]);
    });
});

describe("cleanGeneratedWorlds", () => {
    it("supprime les mondes de l outil (courant et antérieur) ; les autres entrées survivent, contenu inclus", async () => {
        await seedRepresentativeWorldsDir();

        const cleaned = await cleanGeneratedWorlds({worldsDir});
        expect(cleaned.sort()).toEqual(["uat-4242", "uat-legacy"]);

        expect(existsSync(path.join(worldsDir, "uat-4242"))).toBe(false);

        expect(existsSync(path.join(worldsDir, "uat-fake"))).toBe(true);
        expect(await readFile(path.join(worldsDir, "uat-fake", "witness.txt"), "utf8"))
            .toBe("monde uat- sans marqueur, ne pas toucher");

        expect(existsSync(path.join(worldsDir, "uat-broken"))).toBe(true);
        expect(await readFile(path.join(worldsDir, "uat-broken", "witness.txt"), "utf8"))
            .toBe("marqueur étranger, ne pas toucher");

        expect(existsSync(path.join(worldsDir, "test-world"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "final-quest-8"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "uat-archive.rar"))).toBe(true);
    });

    it("dryRun ne supprime rien, tout en rendant la même liste", async () => {
        await seedRepresentativeWorldsDir();

        const listed = await cleanGeneratedWorlds({worldsDir, dryRun: true});
        expect(listed.sort()).toEqual(["uat-4242", "uat-legacy"]);

        expect(existsSync(path.join(worldsDir, "uat-4242"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "uat-legacy"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "uat-fake"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "uat-broken"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "test-world"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "final-quest-8"))).toBe(true);
        expect(existsSync(path.join(worldsDir, "uat-archive.rar"))).toBe(true);
    });

    it("un dossier worlds inexistant ne provoque pas d'exception, et ne supprime rien", async () => {
        const missingDir = path.join(worldsDir, "does-not-exist");
        const cleaned = await cleanGeneratedWorlds({worldsDir: missingDir});
        expect(cleaned).toEqual([]);
    });
});
