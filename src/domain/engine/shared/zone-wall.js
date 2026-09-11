/**
 * Murs de zone : transforme la zone posée par une carte (`cardContent.zonePlacement`)
 * en murs Foundry permanents, bloquant le déplacement et la vue, accompagnés d'un
 * dessin qui les rend visibles. Rien n'expire : c'est au MJ de dissiper l'ouvrage
 * à la main, en supprimant le dessin et ses murs.
 *
 * Appelé depuis le script `executeEval` d'une carte via la façade
 * `FqCardEngineModule.walls.fromZone(cardContent, options)` : aucun champ de
 * formulaire n'est dédié aux murs. La création passe par le MJ (socket), seul
 * autorisé à poser des murs.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ZoneWall {

    /** Nombre de côtés du polygone qui approche un cercle. */
    static CIRCLE_SEGMENTS = 24;

    /** Valeurs de `CONST.DRAWING_FILL_TYPES` utilisées par le dessin. */
    static FILL_NONE = 0;
    static FILL_SOLID = 1;

    /** Style du dessin par défaut, surchargeable par la carte. */
    static DEFAULT_STYLE = Object.freeze({
        strokeColor: "#bfe9ff",
        strokeAlpha: 1,
        strokeWidth: 8,
        fillColor: "#bfe9ff",
        fillAlpha: 0
    });

    /**
     * Taille d'une case de la scène courante, en pixels.
     *
     * @returns {number} La taille de grille (100 à défaut de scène).
     */
    static gridSize() {
        return game.canvas?.scene?.dimensions?.size || 100;
    }

    /**
     * Découpe la zone posée en segments de mur `[x1, y1, x2, y2]` (pixels
     * entiers) : une ligne donne un segment, un rectangle ses quatre côtés
     * (rotation comprise, autour de son centre), un cercle un polygone de
     * {@link ZoneWall.CIRCLE_SEGMENTS} côtés. Un cône n'a pas de contour
     * exploitable : aucun segment.
     *
     * @param {object} [placement] - La géométrie de la zone posée (voir `ZoneTargeting.buildPlacementFx`).
     *
     * @returns {number[][]} Les segments de mur (vide si la forme n'est pas prise en charge).
     */
    static segmentsFromPlacement(placement) {
        const grid = ZoneWall.gridSize();
        const round = segment => segment.map(Math.round);

        if (placement?.type === "line") {
            return [round([placement.x, placement.y, placement.endX, placement.endY])];
        }
        if (placement?.type === "rectangle") {
            const corners = ZoneWall.rectangleCorners(placement, grid);
            return corners.map((corner, i) => {
                const next = corners[(i + 1) % corners.length];
                return round([corner.x, corner.y, next.x, next.y]);
            });
        }
        if (placement?.type === "circle") {
            const radius = ((placement.size ?? 0) / 2) * grid;
            const points = Array.from({length: ZoneWall.CIRCLE_SEGMENTS}, (_, k) => {
                const angle = (2 * Math.PI * k) / ZoneWall.CIRCLE_SEGMENTS;
                return {x: placement.x + (radius * Math.cos(angle)), y: placement.y + (radius * Math.sin(angle))};
            });
            return points.map((point, i) => {
                const next = points[(i + 1) % points.length];
                return round([point.x, point.y, next.x, next.y]);
            });
        }
        return [];
    }

    /**
     * Les quatre coins d'un rectangle posé, dans l'ordre du contour, en tenant
     * compte de sa rotation autour de son centre.
     *
     * @param {object} placement - La géométrie du rectangle (centre, dimensions en cases, rotation en degrés).
     * @param {number} grid      - La taille d'une case, en pixels.
     *
     * @returns {{x: number, y: number}[]} Les coins, en pixels.
     */
    static rectangleCorners(placement, grid) {
        const halfW = ((placement.width ?? 0) * grid) / 2;
        const halfH = ((placement.height ?? 0) * grid) / 2;
        const rad = ((placement.rotation ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]].map(([dx, dy]) => ({
            x: placement.x + (dx * cos) - (dy * sin),
            y: placement.y + (dx * sin) + (dy * cos)
        }));
    }

    /**
     * Construit les données du dessin qui matérialise l'ouvrage : un trait
     * épais pour une ligne, un rectangle ou une ellipse pour les formes
     * pleines. Le remplissage n'est posé que si `fillAlpha` est positif.
     *
     * @param {object} [placement] - La géométrie de la zone posée.
     * @param {object} [style]     - Surcharges de {@link ZoneWall.DEFAULT_STYLE}.
     *
     * @returns {object|null} Les données de `DrawingDocument`, ou null si la forme n'est pas prise en charge.
     */
    static drawingFromPlacement(placement, style = {}) {
        const grid = ZoneWall.gridSize();
        const {strokeColor, strokeAlpha, strokeWidth, fillColor, fillAlpha} = {...ZoneWall.DEFAULT_STYLE, ...style};
        const base = {
            strokeColor, strokeAlpha, strokeWidth, fillColor, fillAlpha,
            fillType: fillAlpha > 0 ? ZoneWall.FILL_SOLID : ZoneWall.FILL_NONE
        };

        if (placement?.type === "line") {
            const x = Math.min(placement.x, placement.endX);
            const y = Math.min(placement.y, placement.endY);
            return {
                ...base,
                // Un mur ligne n'a pas de surface : son épaisseur visible est le trait.
                strokeWidth: style.strokeWidth ?? Math.round(grid / 4),
                x: Math.round(x), y: Math.round(y),
                shape: {
                    type: "p",
                    width: Math.round(Math.abs(placement.endX - placement.x)),
                    height: Math.round(Math.abs(placement.endY - placement.y)),
                    points: [placement.x - x, placement.y - y, placement.endX - x, placement.endY - y].map(Math.round)
                }
            };
        }
        if (placement?.type === "rectangle") {
            const width = (placement.width ?? 0) * grid;
            const height = (placement.height ?? 0) * grid;
            return {
                ...base,
                x: Math.round(placement.x - (width / 2)), y: Math.round(placement.y - (height / 2)),
                rotation: placement.rotation ?? 0,
                shape: {type: "r", width: Math.round(width), height: Math.round(height)}
            };
        }
        if (placement?.type === "circle") {
            const diameter = (placement.size ?? 0) * grid;
            return {
                ...base,
                x: Math.round(placement.x - (diameter / 2)), y: Math.round(placement.y - (diameter / 2)),
                shape: {type: "e", width: Math.round(diameter), height: Math.round(diameter)}
            };
        }
        return null;
    }

    /**
     * Demande au MJ de dresser l'ouvrage sur la zone posée par la carte. Point
     * d'entrée des scripts de carte (via la façade) : ne lève jamais, avertit
     * et renvoie 0 si la zone manque ou si la création échoue. Le socket est
     * reçu en paramètre pour que ce service n'importe jamais la couche `hook/`.
     *
     * @param {object} gmSocket    - L'instance socketlib du module (`executeAsGM`).
     * @param {object} cardContent - Le choix joué, porteur de `zonePlacement`.
     * @param {object} [style]     - Surcharges du style du dessin.
     *
     * @returns {Promise<number>} Le nombre de murs créés.
     */
    static async requestFromZone(gmSocket, cardContent, style = {}) {
        const placement = cardContent?.zonePlacement;
        const walls = ZoneWall.segmentsFromPlacement(placement);
        if (!walls.length) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningZoneWallNoZone"));
            return 0;
        }
        try {
            return await gmSocket.executeAsGM("createZoneWalls", {
                sceneId: game.canvas?.scene?.id,
                walls,
                drawing: ZoneWall.drawingFromPlacement(placement, style)
            });
        } catch (err) {
            ui.notifications.error(err.message);
            return 0;
        }
    }

    /**
     * Côté MJ : crée le dessin puis les murs sur la scène. Les murs gardent les
     * réglages par défaut de Foundry : ils bloquent déplacement, vue, lumière et son.
     *
     * @param {object}     data          - Les données envoyées par `requestFromZone`.
     * @param {string}     data.sceneId  - La scène où dresser l'ouvrage.
     * @param {number[][]} data.walls    - Les segments de mur.
     * @param {object}     [data.drawing] - Les données du dessin.
     *
     * @returns {Promise<number>} Le nombre de murs créés.
     */
    static async createZoneWalls({sceneId, walls, drawing}) {
        const scene = game.scenes.get(sceneId);
        if (!scene || !walls?.length) {
            return 0;
        }
        if (drawing) {
            await scene.createEmbeddedDocuments("Drawing", [drawing]);
        }
        const created = await scene.createEmbeddedDocuments("Wall", walls.map(c => ({c})));
        return created?.length ?? walls.length;
    }
}
