import {describe, expect, it} from "vitest";
import path from "node:path";
import {
    DIFFICULTY_FACTORS,
    composeOpposition,
    crBudgetForLevel,
    crToEighths,
    loadMonsterIndex,
    parseEnemiesOption,
    resolveExplicitEnemies
} from "../script/uat/monsters.mjs";
import {createRng} from "../script/uat/rng.mjs";

/**
 * Couvre la composition d'opposition SRD sur budget de CR exact (UAT-05) :
 * arithmétique en huitièmes entiers, bornes de nombre d'ennemis et de somme de
 * CR, surcharge explicite par nom insensible à la casse/aux espaces.
 */

const INDEX_PATH = path.join(process.cwd(), "tests", "script", "uat", "monsters-index.json");

describe("crToEighths", () => {
    it("convertit les CR fractionnaires en huitièmes entiers exacts", () => {
        expect(crToEighths(0.125)).toBe(1);
        expect(crToEighths(0.25)).toBe(2);
        expect(crToEighths(0.5)).toBe(4);
        expect(crToEighths(1)).toBe(8);
        expect(crToEighths(30)).toBe(240);
    });
});

describe("loadMonsterIndex", () => {
    it("charge l'index committé, filtré des documents catégorie sans CR", () => {
        const index = loadMonsterIndex(INDEX_PATH);

        expect(index.system).toBe("dnd5e");
        expect(index.count).toBe(index.monsters.length);
        expect(index.monsters.length).toBeLessThan(346);

        for (const monster of index.monsters) {
            expect(Number.isFinite(monster.cr)).toBe(true);
            expect(monster.name).toBeTruthy();
        }
    });

    it("lève une erreur explicite invitant à régénérer si le fichier est absent", () => {
        expect(() => loadMonsterIndex(path.join(process.cwd(), "does-not-exist.json"))).toThrow(/testWorld:monsters/);
    });
});

describe("crBudgetForLevel", () => {
    it("calcule le budget en huitièmes pour normal et deadly", () => {
        expect(crBudgetForLevel(10, "normal")).toBe(80);
        expect(crBudgetForLevel(10, "deadly")).toBe(160);
    });

    it("rejette un niveau hors de [1, 20]", () => {
        expect(() => crBudgetForLevel(0, "normal")).toThrow();
        expect(() => crBudgetForLevel(21, "normal")).toThrow();
    });

    it("rejette une difficulté inconnue", () => {
        expect(() => crBudgetForLevel(10, "impossible")).toThrow();
    });
});

describe("composeOpposition", () => {
    const index = loadMonsterIndex(INDEX_PATH);

    it("rend entre 1 et 6 ennemis dont la somme des CR ne dépasse jamais le budget, sur tous les niveaux et difficultés", () => {
        let seedCounter = 0;
        for (let level = 1; level <= 20; level++) {
            for (const difficulty of Object.keys(DIFFICULTY_FACTORS)) {
                const budgetEighths = crBudgetForLevel(level, difficulty);
                const rng = createRng(1000 + seedCounter++);

                const enemies = composeOpposition({index, budgetEighths, rng});

                expect(enemies.length).toBeGreaterThanOrEqual(1);
                expect(enemies.length).toBeLessThanOrEqual(6);
                const total = enemies.reduce((sum, e) => sum + e.crEighths, 0);
                expect(total).toBeLessThanOrEqual(budgetEighths);
            }
        }
    });

    it("est déterministe à graine égale", () => {
        const budgetEighths = crBudgetForLevel(10, "normal");
        const a = composeOpposition({index, budgetEighths, rng: createRng(4242)});
        const b = composeOpposition({index, budgetEighths, rng: createRng(4242)});

        expect(a).toEqual(b);
    });
});

describe("parseEnemiesOption", () => {
    it("reconnaît un mode compté sur une valeur purement numérique", () => {
        expect(parseEnemiesOption("3")).toEqual({mode: "count", count: 3});
    });

    it("découpe une liste explicite nom/quantité", () => {
        const result = parseEnemiesOption("Goblin x3, Ogre");
        expect(result).toEqual({
            mode: "explicit",
            entries: [
                {name: "Goblin", count: 3},
                {name: "Ogre", count: 1}
            ]
        });
    });
});

describe("resolveExplicitEnemies", () => {
    const index = loadMonsterIndex(INDEX_PATH);

    it("accepte un nom en minuscules et un nom avec espaces de bord", () => {
        const result = resolveExplicitEnemies(index, [
            {name: "goblin", count: 1},
            {name: "  Goblin  ", count: 1}
        ]);

        expect(result).toHaveLength(2);
        for (const enemy of result) {
            expect(enemy.name).toBe("Goblin");
        }
    });

    it("lève une erreur nommant le monstre inconnu plutôt que de l'ignorer silencieusement", () => {
        expect(() => resolveExplicitEnemies(index, [{name: "Nonexistent Creature", count: 1}]))
            .toThrow(/Nonexistent Creature/);
    });
});
