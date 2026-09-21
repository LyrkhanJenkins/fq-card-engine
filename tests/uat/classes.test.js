import {describe, expect, it} from "vitest";
import {
    CLASS_SLUGS,
    loadClassCatalog,
    resolveAbilityScoreImprovements,
    resolveHitPoints,
    resolvePicks,
    splitClassLevels
} from "../script/uat/classes.mjs";
import {createRng} from "../script/uat/rng.mjs";

/**
 * Couvre le tirage du build de héros (UAT-04) : picks de stats fidèles aux
 * `ItemChoice`, PV, améliorations de caractéristiques, répartition
 * multi-classe — tout en Node, hors ligne (D-01, D-03).
 */

const REPO_ROOT = process.cwd();

describe("loadClassCatalog", () => {
    it("rend 9 entrées, chacune avec un heroUuid non vide et un hitDieFaces entier positif", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);

        expect(Object.keys(catalog)).toHaveLength(9);
        expect(Object.keys(catalog).sort()).toEqual(CLASS_SLUGS.slice().sort());

        for (const slug of CLASS_SLUGS) {
            const entry = catalog[slug];
            expect(entry.heroUuid).toMatch(/^Compendium\.fq-card-engine\.starter-heroes\.Actor\./);
            expect(entry.classUuid).toMatch(/^Compendium\.fq-card-engine\.classes-fq8\.Item\./);
            expect(Number.isInteger(entry.hitDieFaces)).toBe(true);
            expect(entry.hitDieFaces).toBeGreaterThan(0);
        }
    });

    it("hitDieFaces de witch vaut 6 et baseHitPoints vaut 21 (15 du héros vierge + d6 maximal)", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);

        expect(catalog.witch.hitDieFaces).toBe(6);
        expect(catalog.witch.baseHitPoints).toBe(21);
    });

    it("baseAbilities ajoute les stats de départ de la classe au héros vierge", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);

        // Héros vierge à 10 partout ; la Sorcière apporte Cha +6 et Con -4.
        expect(catalog.witch.baseAbilities.cha).toBe(16);
        expect(catalog.witch.baseAbilities.con).toBe(6);
    });
});

describe("resolvePicks", () => {
    it("au niveau 1, rend exactement 3 UUID pour runic-warrior ; les niveaux pairs en rendent 2", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);

        const picks = resolvePicks(catalog["runic-warrior"], 1, createRng(4242));
        expect(picks).toHaveLength(3);
        for (const pick of picks) {
            expect(pick.uuid).toMatch(/^Compendium\.fq-card-engine\.classes-stats-fq8\.Item\./);
            expect(pick.level).toBe(1);
        }

        const atLevelTwo = resolvePicks(catalog["runic-warrior"], 2, createRng(4242));
        expect(atLevelTwo.filter(pick => pick.level === 2)).toHaveLength(2);
    });

    it("au niveau 20, le total de picks égale la somme des count atteints, sans doublon par advancement", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const rng = createRng(4242);
        const classEntry = catalog["runic-warrior"];

        const picks = resolvePicks(classEntry, 20, rng);

        let expectedTotal = 0;
        for (const itemChoice of classEntry.advancement.itemChoices) {
            for (const [levelKey, config] of Object.entries(itemChoice.configuration?.choices ?? {})) {
                if (Number(levelKey) <= 20) expectedTotal += config.count;
            }
        }
        expect(picks).toHaveLength(expectedTotal);

        for (const pick of picks) {
            expect(pick.uuid).toMatch(/^Compendium\.fq-card-engine\.classes-stats-fq8\.Item\./);
        }

        const byAdvancement = new Map();
        for (const pick of picks) {
            if (!byAdvancement.has(pick.advancementId)) byAdvancement.set(pick.advancementId, new Set());
            const seen = byAdvancement.get(pick.advancementId);
            expect(seen.has(pick.uuid)).toBe(false);
            seen.add(pick.uuid);
        }
    });

    it("ne sert que les paliers inférieurs ou égaux au niveau demandé", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const rng = createRng(4242);
        const classEntry = catalog["runic-warrior"];

        // L'ItemChoice unique couvre les niveaux 1 à 20 : au niveau 5, seuls les
        // paliers 1 à 5 sont servis.
        const picks = resolvePicks(classEntry, 5, rng);

        let expectedTotal = 0;
        for (const itemChoice of classEntry.advancement.itemChoices) {
            for (const [levelKey, config] of Object.entries(itemChoice.configuration?.choices ?? {})) {
                if (Number(levelKey) <= 5) expectedTotal += config.count;
            }
        }
        expect(picks).toHaveLength(expectedTotal);
        expect(picks.every(p => p.level <= 5)).toBe(true);
    });
});

describe("resolveAbilityScoreImprovements", () => {
    it("au niveau 3, rend une seule entrée (niveau 2) totalisant 2 points, sans dépasser le cap", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const rng = createRng(4242);

        const result = resolveAbilityScoreImprovements(catalog["runic-warrior"], 3, rng);

        expect(result).toHaveLength(1);
        expect(result[0].level).toBe(2);
        const total = Object.values(result[0].abilities).reduce((sum, v) => sum + v, 0);
        expect(total).toBe(2);
        for (const value of Object.values(result[0].abilities)) {
            expect(value).toBeLessThanOrEqual(2);
        }
    });
});

describe("splitClassLevels", () => {
    it("répartit deux classes sur un niveau total de 12, somme exacte, chaque classe >= 1", () => {
        const rng = createRng(4242);
        const result = splitClassLevels(["witch", "runic-warrior"], 12, rng);

        expect(result).toHaveLength(2);
        expect(result[0].slug).toBe("witch");
        expect(result.reduce((sum, entry) => sum + entry.level, 0)).toBe(12);
        for (const entry of result) {
            expect(entry.level).toBeGreaterThanOrEqual(1);
        }
    });

    it("lève une erreur explicite si le niveau total est inférieur au nombre de classes", () => {
        const rng = createRng(4242);
        expect(() => splitClassLevels(["witch", "runic-warrior"], 1, rng)).toThrow();
    });
});

describe("déterminisme complet", () => {
    it("resolvePicks rend des structures strictement égales à graine égale", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const classEntry = catalog["runic-warrior"];

        const a = resolvePicks(classEntry, 20, createRng(4242));
        const b = resolvePicks(classEntry, 20, createRng(4242));

        expect(a).toEqual(b);
    });

    it("resolveAbilityScoreImprovements rend des structures strictement égales à graine égale", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const classEntry = catalog["runic-warrior"];

        const a = resolveAbilityScoreImprovements(classEntry, 20, createRng(4242));
        const b = resolveAbilityScoreImprovements(classEntry, 20, createRng(4242));

        expect(a).toEqual(b);
    });

    it("resolveHitPoints rend des structures strictement égales à graine égale", async () => {
        const catalog = await loadClassCatalog(REPO_ROOT);
        const classEntries = splitClassLevels(["witch", "runic-warrior"], 12, createRng(1));

        const a = resolveHitPoints(classEntries, catalog, createRng(4242));
        const b = resolveHitPoints(classEntries, catalog, createRng(4242));

        expect(a).toEqual(b);
        expect(a.max).toBe(a.base + a.rolls.reduce((sum, roll) => sum + roll.value, 0));
    });
});
