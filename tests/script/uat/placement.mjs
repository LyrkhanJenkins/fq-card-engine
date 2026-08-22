/**
 * Placement des tokens sur la grille de l'arène selon quatre motifs
 * (`packed`, `scattered`, `line`, `melee`), sans jamais superposer deux
 * empreintes — y compris pour les tailles `lg` (2x2) et `huge` (3x3) du pack
 * SRD (UAT-05). Module Node pur ; les coordonnées sont exprimées en CASES de
 * grille, jamais en pixels (le seeder convertit à partir de `scene.dimensions`).
 */

/**
 * Aire jouable de l'arène, en cases. Déduite de l'emprise des dix tokens du
 * monde template (colonnes 19 à 31, lignes 8 à 17), élargie de deux cases
 * dans chaque direction. ESTIMATION : les 141 murs de la scène ne sont pas
 * analysés — c'est le point unique à ajuster si un token se retrouve dans un
 * mur lors de l'UAT visuel.
 *
 * @type {{col: number, row: number, cols: number, rows: number}}
 */
export const ARENA_AREA = {col: 17, row: 6, cols: 17, rows: 14};

/**
 * Les quatre motifs de placement pris en charge.
 *
 * @type {string[]}
 */
export const PLACEMENT_PATTERNS = ["packed", "scattered", "line", "melee"];

const MAX_ATTEMPTS = 200;

/**
 * Distance de Tchebychev entre deux coins supérieurs gauches (`col`/`row`).
 *
 * @param {{col: number, row: number}} a
 * @param {{col: number, row: number}} b
 *
 * @returns {number} La distance en cases.
 */
function chebyshev(a, b) {
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * Vrai si une empreinte `width`x`height` posée en `(col, row)` tient
 * entièrement dans `area`.
 *
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {number} col
 * @param {number} row
 * @param {number} width
 * @param {number} height
 *
 * @returns {boolean}
 */
function withinArea(area, col, row, width, height) {
    return col >= area.col && row >= area.row
        && (col + width - 1) <= (area.col + area.cols - 1)
        && (row + height - 1) <= (area.row + area.rows - 1);
}

/**
 * Construit une grille d'occupation sur `area`. C'est cet objet qui rend
 * l'absence de superposition structurellement impossible : deux empreintes
 * peuvent être adjacentes (cases voisines), jamais partager une case.
 *
 * @param {{col: number, row: number, cols: number, rows: number}} area - L'aire jouable.
 *
 * @returns {{
 *   isFree: function(number, number, number, number): boolean,
 *   reserve: function(number, number, number, number): void,
 *   occupiedCells: function(): Set<string>
 * }} L'objet d'occupation.
 */
export function createOccupancy(area) {
    const occupied = new Set();
    const cellKey = (col, row) => `${col},${row}`;

    return {
        isFree(col, row, width, height) {
            if (!withinArea(area, col, row, width, height)) return false;
            for (let dc = 0; dc < width; dc++) {
                for (let dr = 0; dr < height; dr++) {
                    if (occupied.has(cellKey(col + dc, row + dr))) return false;
                }
            }
            return true;
        },

        reserve(col, row, width, height) {
            for (let dc = 0; dc < width; dc++) {
                for (let dr = 0; dr < height; dr++) {
                    occupied.add(cellKey(col + dc, row + dr));
                }
            }
        },

        occupiedCells() {
            return new Set(occupied);
        }
    };
}

/**
 * Tire une position candidate aléatoire dont l'empreinte tient dans `area`.
 *
 * @param {{int: function(number, number): number}} rng
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {number} width
 * @param {number} height
 *
 * @returns {{col: number, row: number}}
 */
function randomCandidate(rng, area, width, height) {
    return {
        col: rng.int(area.col, area.col + area.cols - width),
        row: rng.int(area.row, area.row + area.rows - height)
    };
}

/**
 * Compose le message d'erreur d'échec de placement, citant le motif, la
 * taille demandée et le nombre de cases libres restantes.
 *
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {ReturnType<typeof createOccupancy>} occupancy
 * @param {number} width
 * @param {number} height
 * @param {string} patternName
 *
 * @returns {Error}
 */
function placementFailure(area, occupancy, width, height, patternName) {
    const freeCells = area.cols * area.rows - occupancy.occupiedCells().size;
    return new Error(
        `placeEncounter: impossible de placer une empreinte ${width}x${height} pour le motif `
        + `"${patternName}" (${freeCells} case(s) libre(s) restante(s) dans l'aire jouable).`
    );
}

/**
 * Cherche jusqu'à `MAX_ATTEMPTS` positions aléatoires satisfaisant à la fois
 * l'absence de superposition et `distanceOk`, sans jamais relâcher la
 * première contrainte.
 *
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {ReturnType<typeof createOccupancy>} occupancy
 * @param {object} rng
 * @param {number} width
 * @param {number} height
 * @param {function({col: number, row: number}): boolean} distanceOk
 *
 * @returns {?{col: number, row: number}} La position trouvée, ou `null`.
 */
function searchCandidate(area, occupancy, rng, width, height, distanceOk) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = randomCandidate(rng, area, width, height);
        if (occupancy.isFree(candidate.col, candidate.row, width, height) && distanceOk(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Place une entité (`{width, height}`, défaut 1x1) en essayant d'abord
 * `distanceOk`, puis `relaxedDistanceOk` (contrainte de distance relâchée
 * d'une case) si la première échoue après `MAX_ATTEMPTS` essais. La
 * contrainte de non-superposition n'est JAMAIS relâchée : si aucune position
 * libre ne satisfait même la contrainte relâchée, lève une erreur explicite.
 *
 * @param {object} entity - Mutée en place : reçoit `col` et `row`.
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {ReturnType<typeof createOccupancy>} occupancy
 * @param {object} rng
 * @param {function({col: number, row: number}): boolean} distanceOk
 * @param {function({col: number, row: number}): boolean} relaxedDistanceOk
 * @param {string} patternName
 *
 * @returns {object} `entity`, avec `col`/`row` renseignés.
 */
function placeWithRetry(entity, area, occupancy, rng, distanceOk, relaxedDistanceOk, patternName) {
    const width = entity.width ?? 1;
    const height = entity.height ?? 1;

    const candidate = searchCandidate(area, occupancy, rng, width, height, distanceOk)
        ?? searchCandidate(area, occupancy, rng, width, height, relaxedDistanceOk);

    if (!candidate) throw placementFailure(area, occupancy, width, height, patternName);

    entity.col = candidate.col;
    entity.row = candidate.row;
    occupancy.reserve(candidate.col, candidate.row, width, height);
    return entity;
}

/**
 * Place une entité à une position précise, ou, si elle est occupée ou hors
 * aire, avance selon `advance` jusqu'à `MAX_ATTEMPTS` fois. Utilisé par le
 * motif `line`, dont l'alignement est déterministe (pas de tirage par case).
 *
 * @param {object} entity
 * @param {{col: number, row: number, cols: number, rows: number}} area
 * @param {ReturnType<typeof createOccupancy>} occupancy
 * @param {{col: number, row: number}} startCandidate
 * @param {function({col: number, row: number}): {col: number, row: number}} advance
 * @param {string} patternName
 *
 * @returns {object} `entity`, avec `col`/`row` renseignés.
 */
function placeAtOrNext(entity, area, occupancy, startCandidate, advance, patternName) {
    const width = entity.width ?? 1;
    const height = entity.height ?? 1;
    let candidate = startCandidate;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (withinArea(area, candidate.col, candidate.row, width, height)
            && occupancy.isFree(candidate.col, candidate.row, width, height)) {
            entity.col = candidate.col;
            entity.row = candidate.row;
            occupancy.reserve(candidate.col, candidate.row, width, height);
            return entity;
        }
        candidate = advance(candidate);
    }

    throw placementFailure(area, occupancy, width, height, patternName);
}

/**
 * Cases supplémentaires qu'une empreinte ajoute à une distance mesurée entre
 * coins supérieurs gauches : une empreinte 3x3 « dépasse » de 2 cases
 * au-delà de son coin, dans le pire cas. Utilisé pour élargir les seuils de
 * distance (packed, melee) proportionnellement à la taille de l'entité, sans
 * changer la convention de mesure (coin à coin).
 *
 * @param {object} entity - `{width, height}`.
 *
 * @returns {number} Le surplus de cases (0 pour une empreinte 1x1).
 */
function footprintRadius(entity) {
    return Math.max(entity.width ?? 1, entity.height ?? 1) - 1;
}

/**
 * Motif `packed` : les ennemis se regroupent dans un bloc contigu autour
 * d'une ancre tirée une fois (avec une marge tenant compte de la plus grande
 * empreinte, pour que le bloc reste entièrement plaçable) ; le héros est
 * posé à au moins 6 cases de l'ancre.
 */
function placePacked({hero, enemies, allies}, area, occupancy, rng) {
    const baseRadius = 3;
    const maxEnemyRadius = Math.max(0, ...enemies.map(footprintRadius));
    const margin = Math.min(baseRadius + maxEnemyRadius, Math.floor((Math.min(area.cols, area.rows) - 1) / 2));

    const anchor = {
        col: rng.int(area.col + margin, area.col + area.cols - 1 - margin),
        row: rng.int(area.row + margin, area.row + area.rows - 1 - margin)
    };

    placeWithRetry(
        hero, area, occupancy, rng,
        candidate => chebyshev(candidate, anchor) >= 6,
        candidate => chebyshev(candidate, anchor) >= 5,
        "packed"
    );

    for (const enemy of enemies) {
        const radius = baseRadius + footprintRadius(enemy);
        placeWithRetry(
            enemy, area, occupancy, rng,
            candidate => chebyshev(candidate, anchor) <= radius,
            candidate => chebyshev(candidate, anchor) <= radius + 2,
            "packed"
        );
    }

    for (const ally of allies) {
        placeWithRetry(ally, area, occupancy, rng, () => true, () => true, "packed");
    }

    return [hero, ...enemies, ...allies];
}

/**
 * Motif `scattered` : chaque ennemi à au moins 3 cases de tout autre ennemi,
 * le héros à au moins 4 cases de tous.
 */
function placeScattered({hero, enemies, allies}, area, occupancy, rng) {
    placeWithRetry(hero, area, occupancy, rng, () => true, () => true, "scattered");

    const placedEnemies = [];
    for (const enemy of enemies) {
        placeWithRetry(
            enemy, area, occupancy, rng,
            candidate => chebyshev(candidate, hero) >= 4 && placedEnemies.every(e => chebyshev(candidate, e) >= 3),
            candidate => chebyshev(candidate, hero) >= 3 && placedEnemies.every(e => chebyshev(candidate, e) >= 2),
            "scattered"
        );
        placedEnemies.push(enemy);
    }

    for (const ally of allies) {
        placeWithRetry(
            ally, area, occupancy, rng,
            candidate => chebyshev(candidate, hero) >= 4,
            candidate => chebyshev(candidate, hero) >= 3,
            "scattered"
        );
    }

    return [hero, ...enemies, ...allies];
}

/**
 * Motif `line` : les ennemis s'alignent sur une même ligne (horizontale) ou
 * colonne (verticale), en cases consécutives (touchant, jamais superposées) ;
 * le héros est posé à au moins 5 cases perpendiculairement à cette ligne.
 */
function placeLine({hero, enemies, allies}, area, occupancy, rng) {
    const horizontal = rng.bool();
    const crossSizes = enemies.map(enemy => (horizontal ? (enemy.height ?? 1) : (enemy.width ?? 1)));
    const maxCross = Math.max(1, ...crossSizes);

    const lineFixed = horizontal
        ? rng.int(area.row, area.row + area.rows - maxCross)
        : rng.int(area.col, area.col + area.cols - maxCross);

    const perpendicularDistance = candidate => (
        horizontal ? Math.abs(candidate.row - lineFixed) : Math.abs(candidate.col - lineFixed)
    );

    placeWithRetry(
        hero, area, occupancy, rng,
        candidate => perpendicularDistance(candidate) >= 5,
        candidate => perpendicularDistance(candidate) >= 4,
        "line"
    );

    // La ligne complète doit tenir dans l'aire dès son point de départ : le
    // curseur initial laisse assez de place pour la somme des empreintes,
    // sinon `placeAtOrNext` userait ses 200 essais à avancer hors de l'aire.
    const totalAlongAxis = enemies.reduce(
        (sum, enemy) => sum + (horizontal ? (enemy.width ?? 1) : (enemy.height ?? 1)),
        0
    );
    const axisLength = horizontal ? area.cols : area.rows;
    const axisStart = horizontal ? area.col : area.row;
    const cursorSpan = Math.max(0, axisLength - totalAlongAxis);
    let cursor = axisStart + rng.int(0, cursorSpan);

    for (const enemy of enemies) {
        const width = enemy.width ?? 1;
        const height = enemy.height ?? 1;
        const start = horizontal ? {col: cursor, row: lineFixed} : {col: lineFixed, row: cursor};
        const advance = horizontal
            ? candidate => ({col: candidate.col + width, row: candidate.row})
            : candidate => ({col: candidate.col, row: candidate.row + height});

        placeAtOrNext(enemy, area, occupancy, start, advance, "line");
        cursor = horizontal ? enemy.col + width : enemy.row + height;
    }

    for (const ally of allies) {
        placeWithRetry(ally, area, occupancy, rng, () => true, () => true, "line");
    }

    return [hero, ...enemies, ...allies];
}

/**
 * Motif `melee` : chaque ennemi est posé à 1 ou 2 cases du héros ; les
 * alliés s'intercalent entre héros et ennemis (distance 1 à 3 du héros).
 */
function placeMelee({hero, enemies, allies}, area, occupancy, rng) {
    placeWithRetry(hero, area, occupancy, rng, () => true, () => true, "melee");

    for (const enemy of enemies) {
        // Une grande empreinte (lg/huge) a besoin de plus de marge que sa
        // seule distance de coin à coin pour ne pas systématiquement
        // chevaucher le héros à distance 1-2 : on l'élargit de son surplus.
        const extra = footprintRadius(enemy);
        placeWithRetry(
            enemy, area, occupancy, rng,
            candidate => {
                const distance = chebyshev(candidate, hero);
                return distance >= 1 && distance <= 2 + extra;
            },
            candidate => {
                const distance = chebyshev(candidate, hero);
                return distance >= 1 && distance <= 3 + extra;
            },
            "melee"
        );
    }

    for (const ally of allies) {
        const extra = footprintRadius(ally);
        placeWithRetry(
            ally, area, occupancy, rng,
            candidate => {
                const distance = chebyshev(candidate, hero);
                return distance >= 1 && distance <= 3 + extra;
            },
            candidate => {
                const distance = chebyshev(candidate, hero);
                return distance >= 1 && distance <= 4 + extra;
            },
            "melee"
        );
    }

    return [hero, ...enemies, ...allies];
}

const PATTERN_HANDLERS = {
    packed: placePacked,
    scattered: placeScattered,
    line: placeLine,
    melee: placeMelee
};

/**
 * Pose le héros, les ennemis puis les alliés sur `area` selon `pattern`,
 * en écrivant `col`/`row` sur chaque entrée. La contrainte de
 * non-superposition n'est jamais relâchée ; la contrainte de distance propre
 * au motif l'est d'une case si les 200 premiers essais échouent.
 *
 * @param {object} params
 * @param {string} params.pattern    - Un motif de `PLACEMENT_PATTERNS`.
 * @param {object} params.hero       - L'entrée héros (mutée : reçoit `col`/`row`).
 * @param {object[]} params.enemies  - Les entrées ennemies (`{width, height}`, mutées).
 * @param {object[]} [params.allies] - Les entrées alliées (mutées).
 * @param {object} params.rng        - Le RNG déterministe (`int`, `bool`, ...).
 * @param {{col: number, row: number, cols: number, rows: number}} params.area - L'aire jouable.
 *
 * @returns {object[]} La liste complète des placements : `[hero, ...enemies, ...allies]`.
 */
export function placeEncounter({pattern, hero, enemies, allies = [], rng, area}) {
    const handler = PATTERN_HANDLERS[pattern];
    if (!handler) {
        throw new Error(`Motif de placement inconnu: "${pattern}" (attendu: ${PLACEMENT_PATTERNS.join(", ")}).`);
    }
    return handler({hero, enemies, allies}, area, createOccupancy(area), rng);
}
