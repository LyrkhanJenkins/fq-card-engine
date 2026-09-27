import {beforeAll, beforeEach, describe, expect, it} from "vitest";
import {classSlugs} from "../script/uat/classes.mjs";
import {existsSync} from "node:fs";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    WORLD_NAME_PATTERN,
    assertSafeWorldName,
    generateWorld,
    isToolGeneratedWorld,
    resolveWorldDir
} from "../script/generate-world.mjs";

/**
 * Exerce le vrai générateur vers un dossier `worlds` temporaire sous
 * os.tmpdir() — JAMAIS vers le DataPath réel (aucune assertion ne cible
 * `../../worlds`). Couvre le chemin Node complet (UAT-01, UAT-03) : tous les
 * axes en ligne de commande, déterminisme à l'octet près, et les trois
 * garde-fous système de fichiers de la phase (nom de monde, remontée de
 * répertoire, écrasement d'un monde étranger).
 */

const REPO_ROOT = process.cwd();
const WORLD_SCRIPTS = ["uat-seeder.mjs", "uat-random-deck.mjs"];
/**
 * Classes témoins résolues au catalogue réel plutôt que nommées : le module ne
 * livre plus les neuf classes (les étendues vivent dans `fq-card-engine-extended`),
 * et un slug en dur y désignerait un fichier absent.
 */
let CLASS_A;
let CLASS_B;

beforeAll(async () => {
    [CLASS_A, CLASS_B] = await classSlugs(REPO_ROOT);
});


let worldsDir;

beforeEach(async () => {
    worldsDir = await mkdtemp(path.join(os.tmpdir(), "uat-worlds-"));
});

describe("generateWorld", () => {
    it("produit un monde complet, jamais vers le DataPath réel", async () => {
        const {targetDir, plan} = await generateWorld({seed: 4242, class: CLASS_A, level: 1, "worlds-dir": worldsDir});

        expect(targetDir).toBe(path.join(path.resolve(worldsDir), "uat-4242"));

        const entries = await readdir(targetDir);
        expect(entries).toEqual(expect.arrayContaining(["world.json", "uat-seed.json", "data", ...WORLD_SCRIPTS]));

        const world = JSON.parse(await readFile(path.join(targetDir, "world.json"), "utf8"));
        expect(world.id).toBe("uat-4242");
        expect(world.title).toBe("uat-4242");

        expect(plan.seed).toBe(4242);
        expect(plan.hero.classes[0].slug).toBe(CLASS_A);
        expect(plan.enemies.length).toBeGreaterThan(0);
        expect(Number.isInteger(plan.hero.col)).toBe(true);
        expect(Number.isInteger(plan.hero.row)).toBe(true);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("écrit uat-seed.json cohérent avec le plan retourné", async () => {
        const {targetDir, plan} = await generateWorld({seed: 4242, class: CLASS_A, level: 1, "worlds-dir": worldsDir});

        const writtenPlan = JSON.parse(await readFile(path.join(targetDir, "uat-seed.json"), "utf8"));
        expect(writtenPlan).toEqual(plan);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("recopie chaque script versionné octet pour octet", async () => {
        const {targetDir} = await generateWorld({seed: 4242, "worlds-dir": worldsDir});

        for (const script of WORLD_SCRIPTS) {
            const original = await readFile(path.join(REPO_ROOT, "tests", "script", script));
            const copy = await readFile(path.join(targetDir, script));
            expect(Buffer.compare(original, copy), `script altéré à la copie : ${script}`).toBe(0);
        }

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("est déterministe : deux générations avec les mêmes arguments produisent le même uat-seed.json", async () => {
        const args = {seed: 4242, class: CLASS_A, level: 1, difficulty: "hard", placement: "line", allies: 1, regions: 2};
        const runA = await generateWorld({...args, name: "uat-4242-a", "worlds-dir": worldsDir});
        const runB = await generateWorld({...args, name: "uat-4242-b", "worlds-dir": worldsDir});

        const planA = await readFile(path.join(runA.targetDir, "uat-seed.json"), "utf8");
        const planB = await readFile(path.join(runB.targetDir, "uat-seed.json"), "utf8");

        expect(planA).toBe(planB);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("chaque surcharge CLI se retrouve dans uat-seed.json", async () => {
        const {plan} = await generateWorld({
            seed: 4242,
            class: CLASS_B,
            level: 6,
            enemies: 3,
            difficulty: "deadly",
            placement: "melee",
            allies: 1,
            regions: 2,
            "worlds-dir": worldsDir
        });

        expect(plan.overrides.class).toBe(`${CLASS_B}:6`);
        expect(plan.overrides.level).toBe(6);
        expect(plan.overrides.enemies).toBe(3);
        expect(plan.overrides.difficulty).toBe("deadly");
        expect(plan.overrides.placement).toBe("melee");
        expect(plan.overrides.allies).toBe(1);
        expect(plan.overrides.regions).toBe(2);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("ne demande pas le combat sans --combat, et le demande avec", async () => {
        const args = {seed: 4242, class: CLASS_A, level: 1, "worlds-dir": worldsDir, "dry-run": true};

        const {plan} = await generateWorld(args);
        expect(plan.combat.start).toBe(false);
        expect(plan.overrides.combat).toBe(false);

        const withCombat = await generateWorld({...args, combat: true});
        expect(withCombat.plan.combat.start).toBe(true);
        expect(withCombat.plan.overrides.combat).toBe(true);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("--dry-run n'écrit aucun fichier", async () => {
        const targetName = "uat-dryrun";
        const {targetDir, plan} = await generateWorld({
            seed: 1, name: targetName, "worlds-dir": worldsDir, "dry-run": true
        });

        expect(plan).toBeTruthy();
        expect(existsSync(targetDir)).toBe(false);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("refuse d'écraser un dossier existant dépourvu du marqueur uat-seed.json, et le laisse intact", async () => {
        const targetName = "uat-foreign";
        const targetDir = path.join(worldsDir, targetName);
        await mkdir(targetDir, {recursive: true});
        await writeFile(path.join(targetDir, "witness.txt"), "monde étranger, ne pas toucher");

        await expect(generateWorld({seed: 1, name: targetName, "worlds-dir": worldsDir})).rejects.toThrow();

        const witness = await readFile(path.join(targetDir, "witness.txt"), "utf8");
        expect(witness).toBe("monde étranger, ne pas toucher");
        expect(existsSync(path.join(targetDir, "uat-seed.json"))).toBe(false);

        await rm(worldsDir, {recursive: true, force: true});
    });

    it("régénère avec succès un monde déjà produit par l'outil, et remplace son contenu", async () => {
        const targetName = "uat-idempotent";
        const first = await generateWorld({seed: 4242, class: CLASS_A, level: 1, name: targetName, "worlds-dir": worldsDir});
        const second = await generateWorld({seed: 4242, class: CLASS_A, level: 1, name: targetName, "worlds-dir": worldsDir});

        const planA = await readFile(path.join(first.targetDir, "uat-seed.json"), "utf8");
        const planB = await readFile(path.join(second.targetDir, "uat-seed.json"), "utf8");
        expect(planA).toBe(planB);

        await rm(worldsDir, {recursive: true, force: true});
    });
    // Chaque test de cette suite génère un monde COMPLET : copie récursive du
    // gabarit `uat-base` (LevelDB inclus) dans un dossier temporaire. Seul, c'est
    // 1 à 3 s ; en exécution parallèle des ~136 fichiers de tests, la contention
    // disque multiplie ce coût par plusieurs et dépasse le `testTimeout` global
    // de 20 s — sans qu'aucune assertion ne soit en cause. La suite porte donc
    // son propre délai, comme le `beforeAll` de `uat-base.test.js`. Les trois
    // autres suites du fichier ne touchent pas au disque et gardent le défaut.
}, 60000);

describe("assertSafeWorldName", () => {
    it("accepte un nom conforme", () => {
        expect(() => assertSafeWorldName("uat-4242")).not.toThrow();
    });

    it("rejette une séquence de remontée de répertoire", () => {
        expect(() => assertSafeWorldName("../etc")).toThrow();
    });

    it("rejette une chaîne contenant une barre oblique", () => {
        expect(() => assertSafeWorldName("uat/4242")).toThrow();
    });

    it("rejette une chaîne contenant une barre oblique inverse", () => {
        expect(() => assertSafeWorldName("uat\\4242")).toThrow();
    });

    it("rejette une chaîne vide", () => {
        expect(() => assertSafeWorldName("")).toThrow();
    });

    it("rejette une chaîne contenant des majuscules", () => {
        expect(() => assertSafeWorldName("UAT-4242")).toThrow();
    });

    it("WORLD_NAME_PATTERN est exporté et correspond au comportement de assertSafeWorldName", () => {
        expect(WORLD_NAME_PATTERN.test("uat-4242")).toBe(true);
        expect(WORLD_NAME_PATTERN.test("UAT-4242")).toBe(false);
    });
});

describe("resolveWorldDir", () => {
    it("résout un enfant direct du dossier worlds", () => {
        const resolved = resolveWorldDir(worldsDir, "uat-4242");
        expect(resolved).toBe(path.join(path.resolve(worldsDir), "uat-4242"));
    });

    it("lève une erreur pour un nom qui résoudrait hors du dossier worlds", () => {
        expect(() => resolveWorldDir(worldsDir, "../../etc")).toThrow();
    });
});

describe("isToolGeneratedWorld", () => {
    it("rend faux pour un dossier inexistant", () => {
        expect(isToolGeneratedWorld(path.join(worldsDir, "does-not-exist"))).toBe(false);
    });

    it("rend faux pour un dossier sans uat-seed.json", async () => {
        const dir = path.join(worldsDir, "no-marker");
        await mkdir(dir, {recursive: true});
        expect(isToolGeneratedWorld(dir)).toBe(false);
    });

    it("rend faux pour un uat-seed.json illisible ou d'un autre outil", async () => {
        const dir = path.join(worldsDir, "broken-marker");
        await mkdir(dir, {recursive: true});
        await writeFile(path.join(dir, "uat-seed.json"), "{not json");
        expect(isToolGeneratedWorld(dir)).toBe(false);

        const dirOther = path.join(worldsDir, "other-tool");
        await mkdir(dirOther, {recursive: true});
        await writeFile(path.join(dirOther, "uat-seed.json"), JSON.stringify({generator: {tool: "someone-else"}}));
        expect(isToolGeneratedWorld(dirOther)).toBe(false);
    });

    it("rend vrai pour un monde produit par ce générateur", async () => {
        const {targetDir} = await generateWorld({seed: 1, "worlds-dir": worldsDir});
        expect(isToolGeneratedWorld(targetDir)).toBe(true);

        await rm(worldsDir, {recursive: true, force: true});
    });
});
