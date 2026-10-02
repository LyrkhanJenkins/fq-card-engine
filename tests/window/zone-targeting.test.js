import {afterEach, describe, expect, test, vi} from "vitest";

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
const ZoneTargeting = (await import("../../src/domain/interface/targeting/zone-targeting.js")).default;
const {makeChoice} = await import("../factories.js");

/**
 * Fabrique un document token de scène avec son placeable espionnable (`object.setTarget`).
 *
 * @param {object} data - id, x, y, et optionnellement actorId/width/height/elevation.
 *
 * @returns {object} Le document token factice.
 */
function sceneToken({id, x, y, actorId, width = 1, height = 1, elevation = 0}) {
    return {id, actorId, x, y, width, height, elevation, object: {setTarget: vi.fn()}};
}

/**
 * Fabrique une région posée factice : première forme à l'origine donnée, test de
 * contenance fourni, et un espion `delete`.
 *
 * @param {{x: number, y: number}} origin - L'origine (px) de la première forme.
 * @param {Function} [testPoint] - Le prédicat de contenance (absent = repli `tokens`).
 * @param {object[]} [tokens] - Les tokens du repli `region.tokens`.
 *
 * @returns {object} La région factice.
 */
function regionLike(origin, testPoint, tokens) {
    const region = {shapes: [origin], delete: vi.fn().mockResolvedValue(null)};
    if (testPoint) region.testPoint = testPoint;
    if (tokens) region.tokens = new Set(tokens);
    return region;
}

/**
 * Monte le monde de world-fixture (grille 5, lanceur `world-character` en (5,5))
 * avec une couche régions mockée et le `Roll` déterministe. Les tokens de scène
 * fournis remplacent ceux de la fixture.
 *
 * @param {object} [regionResult] - La région que `placeRegion` doit résoudre (null = pose annulée).
 * @param {object[]} [tokens]     - Les documents token de la scène.
 * @param {object} [overrides]    - Surcharges supplémentaires transmises à `mountWorld`.
 *
 * @returns {{placeRegion: import("vitest").Mock}} Les espions.
 */
function mountZoneWorld(regionResult = null, tokens = null, overrides = {}) {
    const placeRegion = vi.fn().mockResolvedValue(regionResult);
    const {canvas: canvasOverrides, ...rest} = overrides;
    mountWorld({
        canvas: {
            regions: {placeRegion},
            ...(tokens ? {scene: {tokens}} : {}),
            ...canvasOverrides,
        },
        ...rest,
    });
    installDeterministicRoll();
    resetDiceControl();
    return {placeRegion};
}

/**
 * Le token du lanceur de la fixture (world-character en (5,5)), avec placeable.
 *
 * @returns {object} Le document token du lanceur.
 */
function casterToken() {
    return sceneToken({id: "caster", actorId: "world-character", x: 5, y: 5});
}

// L'état « zone posée » est statique : remise à zéro entre les tests pour éviter les fuites.
afterEach(() => ZoneTargeting.clearPlacement());

describe("ZoneTargeting — état « zone posée » (condition de jeu des cartes Zone)", () => {
    test("pose valide → hasPlacement vrai ; clearPlacement le remet à zéro", async () => {
        const region = regionLike({x: 2, y: 7}, () => false);
        mountZoneWorld(region, [casterToken()]);
        await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(ZoneTargeting.hasPlacement()).toBe(true);
        ZoneTargeting.clearPlacement();
        expect(ZoneTargeting.hasPlacement()).toBe(false);
    });

    test("pose valide → la géométrie FX est capturée, clearPlacement l'oublie", async () => {
        const region = regionLike({type: "circle", x: 2, y: 7, radius: 10}, () => false);
        mountZoneWorld(region, [casterToken()]);
        await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(ZoneTargeting.getPlacement()).toEqual({type: "circle", x: 2, y: 7, originX: 0, originY: 5, size: 4});
        ZoneTargeting.clearPlacement();
        expect(ZoneTargeting.getPlacement()).toBeNull();
    });

    test("pose annulée → hasPlacement reste faux", async () => {
        mountZoneWorld(null, [casterToken()]);
        await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(ZoneTargeting.hasPlacement()).toBe(false);
    });

    test("zone hors portée → hasPlacement reste faux", async () => {
        const region = regionLike({x: 100, y: 5}, () => true);
        mountZoneWorld(region, [casterToken()]);
        await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(ZoneTargeting.hasPlacement()).toBe(false);
    });
});

describe("ZoneTargeting.releaseTargets — ardoise vierge du ciblage", () => {
    test("relâche chaque cible en cours, sans en cibler de nouvelle", () => {
        const a = sceneToken({id: "a", x: 0, y: 5});
        const b = sceneToken({id: "b", x: 20, y: 20});
        mountZoneWorld(null, [casterToken(), a, b], {user: {targets: [a, b]}});

        ZoneTargeting.releaseTargets();

        expect(a.object.setTarget).toHaveBeenCalledWith(false, {releaseOthers: false});
        expect(b.object.setTarget).toHaveBeenCalledWith(false, {releaseOthers: false});
        expect(a.object.setTarget).not.toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(b.object.setTarget).not.toHaveBeenCalledWith(true, {releaseOthers: false});
    });

    test("sans cible en cours : ne fait rien (aucune erreur)", () => {
        mountZoneWorld(null, [casterToken()], {user: {targets: []}});

        expect(() => ZoneTargeting.releaseTargets()).not.toThrow();
    });
});

describe("ZoneTargeting.snapToGrid — aimantation forcée de la pose", () => {
    test("repose la forme aimantée et neutralise le déplacement par défaut", () => {
        const shape = {move: vi.fn()};

        // Foundry appellerait `shape.move(position, {snap: !event.shiftKey})` : rendre
        // false lui retire la main, donc Maj ne peut plus débrayer l'aimantation.
        const result = ZoneTargeting.snapToGrid({shape, position: {x: 37, y: 12}});

        expect(shape.move).toHaveBeenCalledWith({x: 37, y: 12}, {snap: true});
        expect(result).toBe(false);
    });
});

describe("ZoneTargeting.buildPlacementFx — géométrie FX normalisée (grille 5)", () => {
    test("cercle : taille = diamètre converti en cases", () => {
        mountZoneWorld();
        expect(ZoneTargeting.buildPlacementFx({type: "circle", x: 30, y: 40, radius: 10}))
            .toEqual({type: "circle", x: 30, y: 40, originX: 30, originY: 40, size: 4});
    });

    test("rectangle : ancrage ramené au centre, dimensions en cases, rotation conservée", () => {
        mountZoneWorld();
        expect(ZoneTargeting.buildPlacementFx({type: "rectangle", x: 10, y: 20, width: 10, height: 20, rotation: 30}))
            .toEqual({type: "rectangle", x: 15, y: 30, originX: 10, originY: 20, width: 2, height: 4, rotation: 30});
    });

    test("cône : point d'arrivée à distance radius dans la direction de rotation", () => {
        mountZoneWorld();
        const fx = ZoneTargeting.buildPlacementFx({type: "cone", x: 0, y: 0, radius: 10, rotation: 90});
        expect(fx.type).toBe("cone");
        expect(fx.endX).toBeCloseTo(0);
        expect(fx.endY).toBeCloseTo(10);
    });

    test("ligne sans rotation : point d'arrivée à distance length vers l'est", () => {
        mountZoneWorld();
        expect(ZoneTargeting.buildPlacementFx({type: "line", x: 5, y: 5, length: 20}))
            .toEqual({type: "line", x: 5, y: 5, originX: 5, originY: 5, endX: 25, endY: 5});
    });

    test("forme absente → null", () => {
        expect(ZoneTargeting.buildPlacementFx(null)).toBeNull();
    });
});

describe("ZoneTargeting.buildShapeData — formes en pixels (grille 5)", () => {
    test("cercle : zoneSize en cases → rayon en pixels", () => {
        mountZoneWorld();
        const shape = ZoneTargeting.buildShapeData(makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2"}));
        expect(shape).toEqual({type: "circle", x: 0, y: 0, radius: 10});
    });

    test("cercle : zoneSize vide → défaut 1 case", () => {
        mountZoneWorld();
        const shape = ZoneTargeting.buildShapeData(makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: ""}));
        expect(shape.radius).toBe(5);
    });

    test("cône : angle par défaut 90°, angle explicite respecté", () => {
        mountZoneWorld();
        const choice = makeChoice({targetType: "Zone", zoneShape: "cone", zoneSize: "3", zoneAngle: ""});
        expect(ZoneTargeting.buildShapeData(choice)).toEqual({type: "cone", x: 0, y: 0, radius: 15, angle: 90});
        const withAngle = makeChoice({targetType: "Zone", zoneShape: "cone", zoneSize: "3", zoneAngle: "45"});
        expect(ZoneTargeting.buildShapeData(withAngle).angle).toBe(45);
    });

    test("rectangle : hauteur = zoneWidth, sinon carré de zoneSize", () => {
        mountZoneWorld();
        const square = makeChoice({targetType: "Zone", zoneShape: "rectangle", zoneSize: "2", zoneWidth: ""});
        expect(ZoneTargeting.buildShapeData(square)).toEqual({type: "rectangle", x: 0, y: 0, width: 10, height: 10});
        const rect = makeChoice({targetType: "Zone", zoneShape: "rectangle", zoneSize: "2", zoneWidth: "3"});
        expect(ZoneTargeting.buildShapeData(rect).height).toBe(15);
    });

    test("ligne : longueur = zoneSize, épaisseur par défaut 1 case", () => {
        mountZoneWorld();
        const line = makeChoice({targetType: "Zone", zoneShape: "line", zoneSize: "4", zoneWidth: ""});
        expect(ZoneTargeting.buildShapeData(line)).toEqual({type: "line", x: 0, y: 0, length: 20, width: 5});
    });
});

/**
 * `resolveCardContent` est ce qui donne sa TAILLE a la zone posee. Un choix qui
 * fixe lui-meme X (`xvalue`) ne le fait pas saisir au dialogue : si la pose le
 * supposait nul, le cone de la Volee de Shuriken serait pose a 2 cases pendant
 * que les degats, eux, compteraient le vrai bonus de portee. C'est cet ecart
 * entre la zone posee et la zone appliquee que ces cas verrouillent.
 */
describe("ZoneTargeting.resolveCardContent — X calcule vs X saisi", () => {
    test("xvalue sans saisie : X vaut le bonus de portee du lanceur, et le cone grandit d'autant", () => {
        mountZoneWorld(null, null, {character: {system: {fq: {bonus: {range: 3}}}}});
        const choice = makeChoice({
            targetType: "Zone", zoneShape: "cone", zoneSize: "2+XXX",
            damage: "(XXX+1d10)[piercing]", xvalue: "fq.bonus.range", yvalue: ""
        });

        const resolved = ZoneTargeting.resolveCardContent(choice);

        expect(resolved.zoneSize).toBe("2+3");
        // 2 + 3 = 5 cases, grille de 5 px : le rayon suit la taille resolue.
        expect(ZoneTargeting.buildShapeData(resolved).radius).toBe(25);
    });

    test("bonus de portee nul : la zone reste a sa taille de base", () => {
        mountZoneWorld();
        const choice = makeChoice({
            targetType: "Zone", zoneShape: "cone", zoneSize: "2+XXX", xvalue: "fq.bonus.range", yvalue: ""
        });

        expect(ZoneTargeting.buildShapeData(ZoneTargeting.resolveCardContent(choice)).radius).toBe(10);
    });

    test("X saisi au dialogue : la valeur du formulaire l'emporte sur le calcul", () => {
        mountZoneWorld(null, null, {character: {system: {fq: {bonus: {range: 3}}}}});
        const choice = makeChoice({
            targetType: "Zone", zoneShape: "cone", zoneSize: "2+XXX", xvalue: "fq.bonus.range", yvalue: ""
        });

        expect(ZoneTargeting.resolveCardContent(choice, {XXX: 1}).zoneSize).toBe("2+1");
    });

    test("choix sans xvalue ni saisie : X retombe a 0, comme auparavant", () => {
        mountZoneWorld();
        const choice = makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", nbTargets: "XXX"});

        expect(ZoneTargeting.resolveCardContent(choice).nbTargets).toBe("0");
    });

    test("yvalue absent du choix : la pose rend 0 au lieu de rompre", () => {
        mountZoneWorld(null, null, {character: {system: {fq: {bonus: {range: 3}}}}});
        // Le schema de carte garantit deux chaines, mais le ciblage recoit parfois
        // un choix construit a la main : l'absence ne doit pas lever.
        const choice = makeChoice({
            targetType: "Zone", zoneShape: "cone", zoneSize: "2+XXX", xvalue: "fq.bonus.range"
        });

        expect(ZoneTargeting.resolveCardContent(choice).zoneSize).toBe("2+3");
    });
});

describe("ZoneTargeting.tokensCoveredByRegion — contenance par centre de case", () => {
    test("un token 1×1 est couvert si le centre de sa case passe testPoint", () => {
        const enemy = sceneToken({id: "t1", x: 0, y: 5}); // centre (2.5, 7.5)
        mountZoneWorld(null, [casterToken(), enemy]);
        const region = regionLike({x: 0, y: 0}, ({x}) => x < 5);
        expect(ZoneTargeting.tokensCoveredByRegion(region)).toEqual([enemy]);
    });

    test("un token 2×2 est couvert dès qu'UNE de ses cases est dans la zone", () => {
        const big = sceneToken({id: "big", x: 10, y: 0, width: 2, height: 2}); // centres (12.5|17.5, 2.5|7.5)
        mountZoneWorld(null, [casterToken(), big]);
        const region = regionLike({x: 0, y: 0}, ({x, y}) => x === 17.5 && y === 7.5);
        expect(ZoneTargeting.tokensCoveredByRegion(region)).toEqual([big]);
    });

    test("testPoint reçoit l'élévation du token", () => {
        const flying = sceneToken({id: "fly", x: 0, y: 5, elevation: 10});
        mountZoneWorld(null, [flying]);
        const testPoint = vi.fn(() => true);
        ZoneTargeting.tokensCoveredByRegion(regionLike({x: 0, y: 0}, testPoint));
        expect(testPoint).toHaveBeenCalledWith({x: 2.5, y: 7.5, elevation: 10});
    });

    test("repli sur region.tokens si testPoint est indisponible", () => {
        mountZoneWorld();
        const tok = sceneToken({id: "t9", x: 0, y: 0});
        const region = regionLike({x: 0, y: 0}, null, [tok]);
        expect(ZoneTargeting.tokensCoveredByRegion(region)).toEqual([tok]);
    });
});

describe("ZoneTargeting.placeZoneAndAcquireTargets — acquisition des cibles", () => {
    test("pose valide : tokens couverts ciblés via setTarget, région supprimée, statut ok", async () => {
        const enemy = sceneToken({id: "t1", x: 0, y: 5});
        const region = regionLike({x: 2, y: 7}, ({x}) => x < 5); // case (0,5) → distance 1 du lanceur
        const caster = casterToken();
        const {placeRegion} = mountZoneWorld(region, [caster, enemy]);

        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));

        expect(placeRegion).toHaveBeenCalledTimes(1);
        expect(placeRegion.mock.calls[0][0].shapes).toEqual([{type: "circle", x: 0, y: 0, radius: 10}]);
        expect(enemy.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(caster.object.setTarget).not.toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(region.delete).toHaveBeenCalledTimes(1);
        expect(result).toEqual({status: "ok", count: 1});
    });

    test("zone posée sur du vide : les cibles précédentes sont relâchées", async () => {
        const prev = sceneToken({id: "prev", x: 20, y: 20});
        const region = regionLike({x: 2, y: 7}, () => false);
        mountZoneWorld(region, [casterToken(), prev], {user: {targets: [prev]}});

        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));

        expect(prev.object.setTarget).toHaveBeenCalledWith(false, {releaseOthers: false});
        expect(prev.object.setTarget).not.toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result).toEqual({status: "ok", count: 0});
    });

    test("pose annulée (placeRegion → null) : cibles inchangées, statut cancelled", async () => {
        const enemy = sceneToken({id: "t1", x: 0, y: 5});
        mountZoneWorld(null, [casterToken(), enemy]);
        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(enemy.object.setTarget).not.toHaveBeenCalled();
        expect(result).toEqual({status: "cancelled", count: 0});
    });

    test("zone hors portée : avertissement, cibles inchangées, région supprimée quand même", async () => {
        const enemy = sceneToken({id: "t1", x: 100, y: 5});
        const region = regionLike({x: 100, y: 5}, () => true); // distance 19 > maxReach 3
        mountZoneWorld(region, [casterToken(), enemy]);

        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));

        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(enemy.object.setTarget).not.toHaveBeenCalled();
        expect(region.delete).toHaveBeenCalledTimes(1);
        expect(result).toEqual({status: "outOfReach", count: 0});
    });

    test("aucune portée déclarée : la zone se pose n'importe où et couvre tout, lanceur compris", async () => {
        const caster = casterToken();
        const enemy = sceneToken({id: "t1", x: 100, y: 100});
        const region = regionLike({x: 100, y: 100}, () => true);
        mountZoneWorld(region, [caster, enemy]);

        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", minReach: "", maxReach: ""}));

        expect(caster.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(enemy.object.setTarget).toHaveBeenCalledWith(true, {releaseOthers: false});
        expect(result).toEqual({status: "ok", count: 2});
    });

    test("lanceur absent de la scène : avertissement, pose jamais lancée", async () => {
        const {placeRegion} = mountZoneWorld(null, []);
        const result = await ZoneTargeting.placeZoneAndAcquireTargets(
            makeChoice({targetType: "Zone", zoneShape: "circle", zoneSize: "2", maxReach: "3"}));
        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(placeRegion).not.toHaveBeenCalled();
        expect(result).toEqual({status: "noCasterToken", count: 0});
    });
});
