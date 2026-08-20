import {describe, expect, test, vi} from "vitest";

// Mocks requis par le harnais (vi.mock hissé par fichier) — bloc canonique,
// voir REQUIRED_MOCKS dans tests/decks/play-harness.js.
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld} = await import("../decks/play-harness.js");
const {installDeterministicRoll, resetDiceControl} = await import("../decks/deterministic-roll.js");
const CombatTargeting = (await import("../../src/domain/interface/shared/combat-targeting.js")).default;
const {makeChoice} = await import("../factories.js");

/**
 * Fabrique un document token de scène avec son placeable espionnable (`object.setTarget`).
 *
 * @param {object} data - id, x, y, disposition, et optionnellement actorId/width/height.
 *
 * @returns {object} Le document token factice.
 */
function sceneToken({id, x, y, disposition = -1, actorId = "someActor", width = 1, height = 1}) {
    return {id, actorId, x, y, disposition, width, height, object: {setTarget: vi.fn()}};
}

/**
 * Le token du lanceur de la fixture (world-character en (5,5), disposition 1), avec placeable.
 *
 * @returns {object} Le document token du lanceur.
 */
function casterToken() {
    return sceneToken({id: "caster", actorId: "world-character", x: 5, y: 5, disposition: 1});
}

/**
 * Monte le monde de world-fixture (grille 5, lanceur en (5,5)) avec les tokens de
 * scène fournis, un combat actif dont les combattants sont les `combatantIds`
 * donnés, et le `Roll` déterministe.
 *
 * @param {object[]} tokens       - Les documents token de la scène.
 * @param {string[]} combatantIds - Les ids des tokens combattants (défaut : tous).
 * @param {object} [overrides]    - Surcharges supplémentaires transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountCombatWorld(tokens, combatantIds = null, overrides = {}) {
    const {canvas: canvasOverrides, ...rest} = overrides;
    mountWorld({
        canvas: {scene: {tokens}, ...canvasOverrides},
        combat: {combatants: (combatantIds ?? tokens.map(t => t.id)).map(tokenId => ({tokenId}))},
        ...rest,
    });
    installDeterministicRoll();
    resetDiceControl();
}

describe("CombatTargeting.acquireCombatants — filtres camp/combat (grille 5, Manhattan)", () => {
    test("CombatEnemies : seuls les combattants de disposition différente sont ciblés, lanceur exclu", () => {
        const caster = casterToken();
        const enemy = sceneToken({id: "enemy", x: 0, y: 5, disposition: -1});
        const ally = sceneToken({id: "ally", x: 10, y: 5, disposition: 1});
        mountCombatWorld([caster, enemy, ally]);

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 1, 999);

        expect(enemy.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(ally.object.setTarget).not.toHaveBeenCalled();
        expect(caster.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("CombatAllies : les combattants de même disposition sont ciblés, lanceur inclus (minReach 0)", () => {
        const caster = casterToken();
        const enemy = sceneToken({id: "enemy", x: 0, y: 5, disposition: -1});
        const ally = sceneToken({id: "ally", x: 10, y: 5, disposition: 1});
        mountCombatWorld([caster, enemy, ally]);

        const result = CombatTargeting.acquireCombatants("CombatAllies", 0, 999);

        expect(ally.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(caster.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(enemy.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "ok", count: 2});
    });

    test("CombatAllies + minReach 1 : le lanceur s'exclut par la distance", () => {
        const caster = casterToken();
        const ally = sceneToken({id: "ally", x: 10, y: 5, disposition: 1});
        mountCombatWorld([caster, ally]);

        const result = CombatTargeting.acquireCombatants("CombatAllies", 1, 999);

        expect(caster.object.setTarget).not.toHaveBeenCalled();
        expect(ally.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });

    test("un token hors combat n'est jamais ciblé, même ennemi à portée", () => {
        const caster = casterToken();
        const enemy = sceneToken({id: "enemy", x: 0, y: 5, disposition: -1});
        const bystander = sceneToken({id: "bystander", x: 10, y: 5, disposition: -1});
        mountCombatWorld([caster, enemy, bystander], ["caster", "enemy"]);

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 0, 999);

        expect(enemy.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(bystander.object.setTarget).not.toHaveBeenCalled();
        expect(result.count).toBe(1);
    });

    test("l'anneau [minReach, maxReach] filtre à l'acquisition (pas de blocage hors-portée)", () => {
        const caster = casterToken();
        const close = sceneToken({id: "close", x: 0, y: 5, disposition: -1});   // distance 1
        const far = sceneToken({id: "far", x: 30, y: 5, disposition: -1});      // distance 5
        mountCombatWorld([caster, close, far]);

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 1, 3);

        expect(close.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(far.object.setTarget).not.toHaveBeenCalled();
        expect(result.count).toBe(1);
    });

    test("le bonus de portée de l'acteur étend maxReach", () => {
        const far = sceneToken({id: "far", x: 20, y: 5, disposition: -1});      // distance 3
        mountCombatWorld([casterToken(), far], null, {character: {system: {fq: {bonus: {range: 2}}}}});

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 0, 1); // 1 + bonus 2 = 3

        expect(far.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });

    test("maxReach falsy → portée illimitée : tout le combat est couvert", () => {
        const veryFar = sceneToken({id: "veryFar", x: 500, y: 500, disposition: -1});
        mountCombatWorld([casterToken(), veryFar]);

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 1, 0);

        expect(veryFar.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });

    test("les cibles précédentes sont relâchées", () => {
        const prev = sceneToken({id: "prev", x: 30, y: 30, disposition: -1});
        mountCombatWorld([casterToken()], null, {user: {targets: [prev]}});

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 0, 999);

        expect(prev.object.setTarget).toHaveBeenCalledWith(false, {releaseOthers: false});
        expect(result.count).toBe(0);
    });

    test("aucun combat actif → noCombat, aucune acquisition", () => {
        const enemy = sceneToken({id: "enemy", x: 0, y: 5, disposition: -1});
        mountWorld({canvas: {scene: {tokens: [casterToken(), enemy]}}});
        installDeterministicRoll();
        resetDiceControl();

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 0, 999);

        expect(enemy.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "noCombat", count: 0});
    });

    test("lanceur absent de la scène → noCasterToken, aucune acquisition", () => {
        const enemy = sceneToken({id: "enemy", x: 0, y: 5, disposition: -1});
        mountCombatWorld([enemy]);

        const result = CombatTargeting.acquireCombatants("CombatEnemies", 0, 999);

        expect(enemy.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "noCasterToken", count: 0});
    });
});

describe("CombatTargeting.acquireTargets — résolution du choix (formules, défauts)", () => {
    test("maxReach vide → portée illimitée, le type du choix pilote le camp", () => {
        const caster = casterToken();
        const enemy = sceneToken({id: "enemy", x: 500, y: 500, disposition: -1});
        mountCombatWorld([caster, enemy]);

        const result = CombatTargeting.acquireTargets(
            makeChoice({targetType: "CombatEnemies", minReach: "1", maxReach: ""}));

        expect(enemy.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("les portées en XXX sont résolues avec les données du formulaire", () => {
        const close = sceneToken({id: "close", x: 0, y: 5, disposition: -1});   // distance 1
        mountCombatWorld([casterToken(), close]);

        const result = CombatTargeting.acquireTargets(
            makeChoice({targetType: "CombatEnemies", minReach: "4-XXX", maxReach: "5"}), {XXX: 3});

        expect(close.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });
});
