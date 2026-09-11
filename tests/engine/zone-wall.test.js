import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import ZoneWall from "../../src/domain/engine/shared/zone-wall.js";

/**
 * Murs de zone (`src/domain/engine/shared/zone-wall.js`) : découpe de la zone
 * posée en segments de mur, dessin associé et demande au MJ.
 * Grille de 100 px : les coordonnées attendues se lisent directement en cases.
 */

describe("ZoneWall", () => {
    let savedCanvas;
    let savedScenes;

    beforeEach(() => {
        savedCanvas = game.canvas;
        savedScenes = game.scenes;
        game.canvas = {scene: {id: "scene1", dimensions: {size: 100}}};
    });

    afterEach(() => {
        game.canvas = savedCanvas;
        game.scenes = savedScenes;
    });

    describe("segmentsFromPlacement", () => {
        it("une ligne donne un seul segment, de l'ancrage au point d'arrivée", () => {
            const segments = ZoneWall.segmentsFromPlacement({type: "line", x: 150, y: 250, endX: 550, endY: 250});

            expect(segments).toEqual([[150, 250, 550, 250]]);
        });

        it("un rectangle sans rotation donne ses quatre côtés, fermés", () => {
            const segments = ZoneWall.segmentsFromPlacement({type: "rectangle", x: 250, y: 250, width: 3, height: 3, rotation: 0});

            expect(segments).toEqual([
                [100, 100, 400, 100], [400, 100, 400, 400], [400, 400, 100, 400], [100, 400, 100, 100]
            ]);
        });

        it("un rectangle tourné de 90° garde son centre", () => {
            const segments = ZoneWall.segmentsFromPlacement({type: "rectangle", x: 300, y: 300, width: 2, height: 4, rotation: 90});

            expect(segments[0]).toEqual([500, 200, 500, 400]);
            expect(segments).toHaveLength(4);
        });

        it("un cercle donne un polygone fermé dont les sommets sont sur le rayon", () => {
            const segments = ZoneWall.segmentsFromPlacement({type: "circle", x: 500, y: 500, size: 4});

            expect(segments).toHaveLength(ZoneWall.CIRCLE_SEGMENTS);
            for (const [x1, y1] of segments) {
                // Sommets arrondis au pixel : l'écart au rayon reste sous le pixel.
                expect(Math.abs(Math.hypot(x1 - 500, y1 - 500) - 200)).toBeLessThan(1);
            }
            expect(segments.at(-1).slice(2)).toEqual(segments[0].slice(0, 2));
        });

        it("un cône, ou aucune zone, ne donne aucun segment", () => {
            expect(ZoneWall.segmentsFromPlacement({type: "cone", x: 0, y: 0, endX: 100, endY: 0})).toEqual([]);
            expect(ZoneWall.segmentsFromPlacement(null)).toEqual([]);
        });
    });

    describe("drawingFromPlacement", () => {
        it("ligne : polygone à deux points, trait épais, sans remplissage", () => {
            const drawing = ZoneWall.drawingFromPlacement({type: "line", x: 550, y: 250, endX: 150, endY: 250});

            expect(drawing).toMatchObject({
                x: 150, y: 250, strokeWidth: 25, fillType: ZoneWall.FILL_NONE,
                shape: {type: "p", width: 400, height: 0, points: [400, 0, 0, 0]}
            });
        });

        it("rectangle : ancré au coin supérieur gauche, rempli si fillAlpha est positif", () => {
            const drawing = ZoneWall.drawingFromPlacement(
                {type: "rectangle", x: 250, y: 250, width: 3, height: 3, rotation: 0},
                {fillColor: "#6a3fb5", fillAlpha: 0.35}
            );

            expect(drawing).toMatchObject({
                x: 100, y: 100, rotation: 0, fillType: ZoneWall.FILL_SOLID, fillColor: "#6a3fb5", fillAlpha: 0.35,
                shape: {type: "r", width: 300, height: 300}
            });
        });

        it("cercle : ellipse inscrite dans le carré du diamètre", () => {
            const drawing = ZoneWall.drawingFromPlacement({type: "circle", x: 500, y: 500, size: 4});

            expect(drawing).toMatchObject({x: 300, y: 300, shape: {type: "e", width: 400, height: 400}});
        });

        it("forme non prise en charge : aucun dessin", () => {
            expect(ZoneWall.drawingFromPlacement({type: "cone"})).toBeNull();
        });
    });

    describe("requestFromZone", () => {
        it("envoie au MJ la scène, les segments et le dessin", async () => {
            const gmSocket = {executeAsGM: vi.fn().mockResolvedValue(1)};
            const cardContent = {zonePlacement: {type: "line", x: 150, y: 250, endX: 550, endY: 250}};

            const count = await ZoneWall.requestFromZone(gmSocket, cardContent, {strokeColor: "#bfe9ff"});

            expect(count).toBe(1);
            expect(gmSocket.executeAsGM).toHaveBeenCalledWith("createZoneWalls", {
                sceneId: "scene1",
                walls: [[150, 250, 550, 250]],
                drawing: expect.objectContaining({strokeColor: "#bfe9ff", shape: expect.objectContaining({type: "p"})})
            });
        });

        it("sans zone exploitable : avertit et n'appelle pas le MJ", async () => {
            const gmSocket = {executeAsGM: vi.fn()};

            const count = await ZoneWall.requestFromZone(gmSocket, {}, {});

            expect(count).toBe(0);
            expect(gmSocket.executeAsGM).not.toHaveBeenCalled();
            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningZoneWallNoZone");
        });

        it("un échec côté MJ ne lève pas : erreur notifiée, 0 mur", async () => {
            const gmSocket = {executeAsGM: vi.fn().mockRejectedValue(new Error("pas de MJ"))};
            const cardContent = {zonePlacement: {type: "line", x: 0, y: 0, endX: 100, endY: 0}};

            await expect(ZoneWall.requestFromZone(gmSocket, cardContent)).resolves.toBe(0);
            expect(ui.notifications.error).toHaveBeenCalledWith("pas de MJ");
        });
    });

    describe("createZoneWalls", () => {
        it("crée le dessin puis les murs", async () => {
            const scene = {createEmbeddedDocuments: vi.fn(async (type, data) => data)};
            game.scenes = {get: vi.fn(() => scene)};

            const count = await ZoneWall.createZoneWalls({
                sceneId: "scene1", walls: [[0, 0, 100, 0], [100, 0, 100, 100]], drawing: {x: 0, y: 0}
            });

            expect(count).toBe(2);
            expect(scene.createEmbeddedDocuments).toHaveBeenNthCalledWith(1, "Drawing", [{x: 0, y: 0}]);
            expect(scene.createEmbeddedDocuments).toHaveBeenNthCalledWith(2, "Wall", [
                {c: [0, 0, 100, 0]}, {c: [100, 0, 100, 100]}
            ]);
        });

        it("scène introuvable : rien n'est créé", async () => {
            game.scenes = {get: vi.fn(() => undefined)};

            await expect(ZoneWall.createZoneWalls({sceneId: "x", walls: [[0, 0, 1, 1]]})).resolves.toBe(0);
        });
    });
});
