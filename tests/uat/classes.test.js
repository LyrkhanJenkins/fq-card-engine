import {beforeAll, describe, expect, it} from "vitest";
import {
    classSlugs,
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
 *
 * AUCUN slug de classe en dur, et aucun attendu chiffré recopié d'une classe
 * précise : le module ne livre plus les neuf classes (les étendues vivent dans
 * `fq-card-engine-extended`), et une classe nommée ici disparaîtrait du jour où
 * elle change de module. Les attendus sont donc DÉDUITS des advancements lus,
 * et les classes témoins prises dans le catalogue réel.
 */

const REPO_ROOT = process.cwd();

let catalog;
let slugs;
/** Une classe témoin, et deux pour les cas multi-classe. */
let someSlug;
let twoSlugs;

beforeAll(async () => {
    catalog = await loadClassCatalog(REPO_ROOT);
    slugs = await classSlugs(REPO_ROOT);
    someSlug = slugs[0];
    twoSlugs = slugs.slice(0, 2);
});

/**
 * Le nombre de picks que les `ItemChoice` d'une classe doivent servir jusqu'à un
 * niveau donné : la somme des `count` des paliers atteints. Déduit des données
 * plutôt que recopié, pour que l'attendu suive la classe témoin.
 *
 * @param {object} classEntry - L'entrée de catalogue de la classe.
 * @param {number} level - Le niveau demandé.
 *
 * @returns {number} Le nombre de picks attendu.
 */
function expectedPickCount(classEntry, level) {
    let total = 0;
    for (const itemChoice of classEntry.advancement.itemChoices) {
        for (const [levelKey, config] of Object.entries(itemChoice.configuration?.choices ?? {})) {
            if (Number(levelKey) <= level) total += config.count;
        }
    }
    return total;
}

describe("loadClassCatalog", () => {
    it("rend une entrée par classe jouable, chacune avec un heroUuid et un hitDieFaces valides", () => {
        expect(slugs.length).toBeGreaterThan(0);
        expect(Object.keys(catalog)).toHaveLength(slugs.length);
        expect(Object.keys(catalog).sort()).toEqual(slugs.slice().sort());

        for (const slug of slugs) {
            const entry = catalog[slug];
            expect(entry.heroUuid).toMatch(/^Compendium\.fq-card-engine\.starter-heroes\.Actor\./);
            expect(entry.classUuid).toMatch(/^Compendium\.fq-card-engine\.classes-fq8\.Item\./);
            expect(Number.isInteger(entry.hitDieFaces)).toBe(true);
            expect(entry.hitDieFaces).toBeGreaterThan(0);
        }
    });

    it("fait des PV de niveau 1 ceux du héros vierge plus le dé de vie maximal", () => {
        // La règle, et non la valeur d'une classe : 15 PV du héros vierge + le dé
        // de vie plein. Elle tenait pour la Sorcière (6 -> 21), elle doit tenir
        // pour toutes.
        for (const slug of slugs) {
            const entry = catalog[slug];
            expect(entry.baseHitPoints, `PV de base de ${slug}`).toBe(15 + entry.hitDieFaces);
        }
    });

    it("ajoute les stats de départ de la classe au héros vierge", () => {
        // Le héros vierge est à 10 partout : toute valeur qui s'en écarte vient
        // des `ItemGrant` de niveau 1 de la classe. Au moins une classe doit en
        // porter, sinon le mécanisme est muet.
        const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
        let modified = 0;
        for (const slug of slugs) {
            const abilities = catalog[slug].baseAbilities;
            expect(Object.keys(abilities).sort()).toEqual(abilityKeys.slice().sort());
            for (const key of abilityKeys) {
                expect(Number.isInteger(abilities[key]), `${slug}.${key}`).toBe(true);
                expect(abilities[key]).toBeGreaterThan(0);
            }
            if (abilityKeys.some(key => abilities[key] !== 10)) modified += 1;
        }
        expect(modified, "aucune classe n'applique ses stats de départ").toBeGreaterThan(0);
    });
});

describe("resolvePicks", () => {
    it("sert au niveau 1 le compte déclaré par les ItemChoice, et les paliers suivants à leur tour", () => {
        const classEntry = catalog[someSlug];

        const picks = resolvePicks(classEntry, 1, createRng(4242));
        expect(picks).toHaveLength(expectedPickCount(classEntry, 1));
        for (const pick of picks) {
            expect(pick.uuid).toMatch(/^Compendium\.fq-card-engine\.classes-stats-fq8\.Item\./);
            expect(pick.level).toBe(1);
        }

        const atLevelTwo = resolvePicks(classEntry, 2, createRng(4242));
        const addedAtTwo = expectedPickCount(classEntry, 2) - expectedPickCount(classEntry, 1);
        expect(atLevelTwo.filter(pick => pick.level === 2)).toHaveLength(addedAtTwo);
    });

    it("au niveau 20, le total de picks égale la somme des count atteints, sans doublon par advancement", () => {
        const rng = createRng(4242);
        const classEntry = catalog[someSlug];

        const picks = resolvePicks(classEntry, 20, rng);

        expect(picks).toHaveLength(expectedPickCount(classEntry, 20));

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

    it("ne sert que les paliers inférieurs ou égaux au niveau demandé", () => {
        const rng = createRng(4242);
        const classEntry = catalog[someSlug];

        const picks = resolvePicks(classEntry, 5, rng);

        expect(picks).toHaveLength(expectedPickCount(classEntry, 5));
        expect(picks.every(p => p.level <= 5)).toBe(true);
    });
});

describe("resolveAbilityScoreImprovements", () => {
    it("ne sert que les paliers atteints, chaque entrée totalisant les points de son palier sans dépasser le cap", () => {
        const rng = createRng(4242);
        const classEntry = catalog[someSlug];
        const asiLevels = classEntry.advancement.abilityScoreImprovements
            .map(asi => Number(asi.level))
            .filter(level => level <= 3)
            .sort((a, b) => a - b);

        const result = resolveAbilityScoreImprovements(classEntry, 3, rng);

        expect(result.map(entry => entry.level)).toEqual(asiLevels);
        for (const entry of result) {
            const total = Object.values(entry.abilities).reduce((sum, v) => sum + v, 0);
            expect(total).toBeGreaterThan(0);
            for (const value of Object.values(entry.abilities)) {
                expect(value).toBeLessThanOrEqual(total);
            }
        }
    });
});

describe("splitClassLevels", () => {
    it("répartit deux classes sur un niveau total de 12, somme exacte, chaque classe >= 1", () => {
        const rng = createRng(4242);
        const result = splitClassLevels(twoSlugs, 12, rng);

        expect(result).toHaveLength(2);
        // L'ordre relève du tirage : on vérifie l'ensemble servi, pas son rang.
        expect(result.map(entry => entry.slug).sort()).toEqual(twoSlugs.slice().sort());
        expect(result.reduce((sum, entry) => sum + entry.level, 0)).toBe(12);
        for (const entry of result) {
            expect(entry.level).toBeGreaterThanOrEqual(1);
        }
    });

    it("lève une erreur explicite si le niveau total est inférieur au nombre de classes", () => {
        const rng = createRng(4242);
        expect(() => splitClassLevels(twoSlugs, 1, rng)).toThrow();
    });
});

describe("déterminisme complet", () => {
    it("resolvePicks rend des structures strictement égales à graine égale", () => {
        const classEntry = catalog[someSlug];

        const a = resolvePicks(classEntry, 20, createRng(4242));
        const b = resolvePicks(classEntry, 20, createRng(4242));

        expect(a).toEqual(b);
    });

    it("resolveAbilityScoreImprovements rend des structures strictement égales à graine égale", () => {
        const classEntry = catalog[someSlug];

        const a = resolveAbilityScoreImprovements(classEntry, 20, createRng(4242));
        const b = resolveAbilityScoreImprovements(classEntry, 20, createRng(4242));

        expect(a).toEqual(b);
    });

    it("resolveHitPoints rend des structures strictement égales à graine égale", () => {
        const classEntries = splitClassLevels(twoSlugs, 12, createRng(1));

        const a = resolveHitPoints(classEntries, catalog, createRng(4242));
        const b = resolveHitPoints(classEntries, catalog, createRng(4242));

        expect(a).toEqual(b);
        expect(a.max).toBe(a.base + a.rolls.reduce((sum, roll) => sum + roll.value, 0));
    });
});
