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
const AdjacentTargeting = (await import("../../src/domain/interface/shared/adjacent-targeting.js")).default;
const {makeChoice} = await import("../factories.js");

/**
 * Fabrique un document token de scène avec son placeable espionnable (`object.setTarget`).
 *
 * @param {object} data - id, x, y, et optionnellement actorId/width/height.
 *
 * @returns {object} Le document token factice.
 */
function sceneToken({id, x, y, actorId = "someActor", width = 1, height = 1}) {
    return {id, actorId, x, y, width, height, object: {setTarget: vi.fn()}};
}

/**
 * Le token du lanceur de la fixture (world-character en (5,5)), avec placeable.
 *
 * @returns {object} Le document token du lanceur.
 */
function casterToken() {
    return sceneToken({id: "caster", actorId: "world-character", x: 5, y: 5});
}

/**
 * Monte le monde de world-fixture (grille 5, lanceur en (5,5)) avec les tokens
 * de scène fournis et le `Roll` déterministe.
 *
 * @param {object[]} tokens - Les documents token de la scène.
 * @param {object} [overrides] - Surcharges supplémentaires transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountAdjacentWorld(tokens, overrides = {}) {
    const {canvas: canvasOverrides, ...rest} = overrides;
    mountWorld({
        canvas: {scene: {tokens}, ...canvasOverrides},
        ...rest,
    });
    installDeterministicRoll();
    resetDiceControl();
}

describe("AdjacentTargeting.acquireWithin — anneau autour du lanceur (grille 5, Manhattan)", () => {
    test("token à distance 1 ciblé, token lointain et lanceur exclus", () => {
        const caster = casterToken();
        const close = sceneToken({id: "close", x: 0, y: 5});   // distance 1
        const far = sceneToken({id: "far", x: 30, y: 5});      // distance 5
        mountAdjacentWorld([caster, close, far]);

        const result = AdjacentTargeting.acquireWithin(0, 1);

        expect(close.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(far.object.setTarget).not.toHaveBeenCalled();
        expect(caster.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("anneau (minReach 2) : le contact est exclu, la couronne est ciblée", () => {
        const close = sceneToken({id: "close", x: 0, y: 5});   // distance 1
        const ring = sceneToken({id: "ring", x: 20, y: 5});    // distance 3
        mountAdjacentWorld([casterToken(), close, ring]);

        const result = AdjacentTargeting.acquireWithin(2, 3);

        expect(close.object.setTarget).not.toHaveBeenCalled();
        expect(ring.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("le bonus de portée de l'acteur étend maxReach", () => {
        const far = sceneToken({id: "far", x: 20, y: 5});      // distance 3
        mountAdjacentWorld([casterToken(), far], {character: {system: {fq: {bonus: {range: 2}}}}});

        const result = AdjacentTargeting.acquireWithin(0, 1);  // 1 + bonus 2 = 3

        expect(far.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });

    test("les cibles précédentes sont relâchées, les tokens sans acteur ignorés", () => {
        const prev = sceneToken({id: "prev", x: 30, y: 30});
        const decor = sceneToken({id: "decor", x: 0, y: 5, actorId: ""});
        mountAdjacentWorld([casterToken(), prev, decor], {user: {targets: [prev]}});

        const result = AdjacentTargeting.acquireWithin(0, 1);

        expect(prev.object.setTarget).toHaveBeenCalledWith(false, {releaseOthers: false});
        expect(decor.object.setTarget).not.toHaveBeenCalled();
        expect(result.count).toBe(0);
    });

    test("lanceur absent de la scène → noCasterToken, aucune acquisition", () => {
        const close = sceneToken({id: "close", x: 0, y: 5});
        mountAdjacentWorld([close]);
        const result = AdjacentTargeting.acquireWithin(0, 1);
        expect(close.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "noCasterToken", count: 0});
    });
});

describe("AdjacentTargeting.acquireTargets — résolution du choix (formules, défauts)", () => {
    test("maxReach vide → défaut 1 case (adjacence stricte)", () => {
        const close = sceneToken({id: "close", x: 0, y: 5});   // distance 1
        const far = sceneToken({id: "far", x: 20, y: 5});      // distance 3
        mountAdjacentWorld([casterToken(), close, far]);

        const result = AdjacentTargeting.acquireTargets(
            makeChoice({targetType: "Adjacent", minReach: "", maxReach: ""}));

        expect(close.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(far.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("les portées en XXX sont résolues avec les données du formulaire (anneau rétrécissant)", () => {
        const close = sceneToken({id: "close", x: 0, y: 5});   // distance 1
        mountAdjacentWorld([casterToken(), close]);

        const result = AdjacentTargeting.acquireTargets(
            makeChoice({targetType: "Adjacent", minReach: "4-XXX", maxReach: "5"}), {XXX: 3});

        expect(close.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result.count).toBe(1);
    });
});
