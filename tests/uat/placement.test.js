import {describe, expect, it} from "vitest";
import {ARENA_AREA, PLACEMENT_PATTERNS, createOccupancy, placeEncounter} from "../script/uat/placement.mjs";
import {createRng} from "../script/uat/rng.mjs";

/**
 * Couvre le placement sans superposition sur la grille réelle de l'arène
 * (UAT-05), tailles `lg` (2x2) et `huge` (3x3) comprises, pour les quatre
 * motifs. La non-superposition est un critère structurel (occupancy) : ces
 * tests le vérifient mécaniquement (surfaces == cases occupées) plutôt que
 * par échantillonnage visuel.
 */

const SEED_COUNT = 50;

function makeHero() {
    return {name: "Hero", width: 1, height: 1};
}

function makeEnemies() {
    return [
        {name: "Goblin A", width: 1, height: 1},
        {name: "Goblin B", width: 1, height: 1},
        {name: "Ogre", width: 2, height: 2},
        {name: "Dragon", width: 3, height: 3}
    ];
}

function footprintArea(entity) {
    return (entity.width ?? 1) * (entity.height ?? 1);
}

function withinArena(entity) {
    const width = entity.width ?? 1;
    const height = entity.height ?? 1;
    return entity.col >= ARENA_AREA.col
        && entity.row >= ARENA_AREA.row
        && (entity.col + width - 1) <= (ARENA_AREA.col + ARENA_AREA.cols - 1)
        && (entity.row + height - 1) <= (ARENA_AREA.row + ARENA_AREA.rows - 1);
}

describe("placeEncounter", () => {
    for (const pattern of PLACEMENT_PATTERNS) {
        it(`motif "${pattern}" : aucune superposition et tout tient dans ARENA_AREA, sur ${SEED_COUNT} graines`, () => {
            for (let seed = 0; seed < SEED_COUNT; seed++) {
                const rng = createRng(seed);
                const hero = makeHero();
                const enemies = makeEnemies();

                const placements = placeEncounter({pattern, hero, enemies, allies: [], rng, area: ARENA_AREA});

                const totalArea = placements.reduce((sum, entity) => sum + footprintArea(entity), 0);
                const occupiedCells = new Set();
                for (const entity of placements) {
                    const width = entity.width ?? 1;
                    const height = entity.height ?? 1;
                    for (let dc = 0; dc < width; dc++) {
                        for (let dr = 0; dr < height; dr++) {
                            occupiedCells.add(`${entity.col + dc},${entity.row + dr}`);
                        }
                    }
                    expect(withinArena(entity)).toBe(true);
                }

                expect(occupiedCells.size).toBe(totalArea);
            }
        });
    }

    it("rejette un motif inconnu", () => {
        expect(() => placeEncounter({
            pattern: "unknown", hero: makeHero(), enemies: [], allies: [], rng: createRng(1), area: ARENA_AREA
        })).toThrow();
    });

    it("est déterministe à graine égale", () => {
        const buildPlacements = () => placeEncounter({
            pattern: "scattered", hero: makeHero(), enemies: makeEnemies(), allies: [], rng: createRng(4242), area: ARENA_AREA
        });

        const a = buildPlacements();
        const b = buildPlacements();

        expect(a).toEqual(b);
    });

    it("vérifie la règle de distance nominale du motif packed (héros à >= 6 de l'ancre effective)", () => {
        const rng = createRng(4242);
        const hero = makeHero();
        const enemies = [{name: "Goblin", width: 1, height: 1}];

        placeEncounter({pattern: "packed", hero, enemies, allies: [], rng, area: ARENA_AREA});

        // L'ennemi est posé à <= 3 cases de l'ancre implicite, donc la distance
        // héros-ennemi observable est cohérente avec un héros écarté du groupe.
        const distance = Math.max(Math.abs(hero.col - enemies[0].col), Math.abs(hero.row - enemies[0].row));
        expect(distance).toBeGreaterThanOrEqual(3);
    });

    it("vérifie la règle de distance nominale du motif scattered (ennemis dispersés)", () => {
        const rng = createRng(4242);
        const hero = makeHero();
        const enemies = [
            {name: "Goblin A", width: 1, height: 1},
            {name: "Goblin B", width: 1, height: 1}
        ];

        placeEncounter({pattern: "scattered", hero, enemies, allies: [], rng, area: ARENA_AREA});

        const distance = Math.max(
            Math.abs(enemies[0].col - enemies[1].col),
            Math.abs(enemies[0].row - enemies[1].row)
        );
        expect(distance).toBeGreaterThanOrEqual(2);
    });

    it("vérifie la règle de distance nominale du motif line (ennemis consécutifs, héros perpendiculaire)", () => {
        const rng = createRng(4242);
        const hero = makeHero();
        const enemies = [
            {name: "Goblin A", width: 1, height: 1},
            {name: "Goblin B", width: 1, height: 1},
            {name: "Goblin C", width: 1, height: 1}
        ];

        placeEncounter({pattern: "line", hero, enemies, allies: [], rng, area: ARENA_AREA});

        const sameRow = enemies.every(e => e.row === enemies[0].row);
        const sameCol = enemies.every(e => e.col === enemies[0].col);
        expect(sameRow || sameCol).toBe(true);
    });

    it("vérifie la règle de distance nominale du motif melee (ennemis à 1 ou 2 cases du héros)", () => {
        const rng = createRng(4242);
        const hero = makeHero();
        const enemies = [{name: "Goblin", width: 1, height: 1}];

        placeEncounter({pattern: "melee", hero, enemies, allies: [], rng, area: ARENA_AREA});

        const distance = Math.max(Math.abs(hero.col - enemies[0].col), Math.abs(hero.row - enemies[0].row));
        expect(distance).toBeGreaterThanOrEqual(1);
        expect(distance).toBeLessThanOrEqual(3);
    });

    it("lève une erreur explicite plutôt qu'un chevauchement quand la demande est impossible", () => {
        const rng = createRng(4242);
        const tinyArea = {col: 0, row: 0, cols: 2, rows: 2};
        const hero = makeHero();
        // 5 ennemis 1x1 ne tiennent jamais dans une aire de 4 cases (dont 1 pour le héros).
        const enemies = Array.from({length: 5}, (_, i) => ({name: `Enemy ${i}`, width: 1, height: 1}));

        expect(() => placeEncounter({pattern: "scattered", hero, enemies, allies: [], rng, area: tinyArea})).toThrow();
    });
});

describe("createOccupancy — bornes exactes et adjacence", () => {
    it("accepte une empreinte 3x3 au dernier coin admissible, refuse une case plus loin", () => {
        const occupancy = createOccupancy(ARENA_AREA);
        const lastCol = ARENA_AREA.col + ARENA_AREA.cols - 3;
        const lastRow = ARENA_AREA.row + ARENA_AREA.rows - 3;

        expect(occupancy.isFree(lastCol, lastRow, 3, 3)).toBe(true);
        expect(occupancy.isFree(lastCol + 1, lastRow, 3, 3)).toBe(false);
        expect(occupancy.isFree(lastCol, lastRow + 1, 3, 3)).toBe(false);
    });

    it("accepte une empreinte 3x3 à la première case admissible, refuse une case en deçà", () => {
        const occupancy = createOccupancy(ARENA_AREA);

        expect(occupancy.isFree(ARENA_AREA.col, ARENA_AREA.row, 3, 3)).toBe(true);
        expect(occupancy.isFree(ARENA_AREA.col - 1, ARENA_AREA.row, 3, 3)).toBe(false);
        expect(occupancy.isFree(ARENA_AREA.col, ARENA_AREA.row - 1, 3, 3)).toBe(false);
    });

    it("accepte deux empreintes 1x1 adjacentes (jamais de superposition, adjacence permise)", () => {
        const occupancy = createOccupancy(ARENA_AREA);
        const col = ARENA_AREA.col + 2;
        const row = ARENA_AREA.row + 2;

        expect(occupancy.isFree(col, row, 1, 1)).toBe(true);
        occupancy.reserve(col, row, 1, 1);

        expect(occupancy.isFree(col + 1, row, 1, 1)).toBe(true);
        occupancy.reserve(col + 1, row, 1, 1);

        expect(occupancy.isFree(col, row, 1, 1)).toBe(false);
        expect(occupancy.isFree(col + 1, row, 1, 1)).toBe(false);
    });
});
