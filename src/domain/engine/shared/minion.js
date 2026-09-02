import RollService from "../roll/roll-service.js";
import Geometry from "./geometry.js";
import {DEFAULT_MAX_ZEAL} from "../../constants.js";
import {socket} from "../../../hook/integration/socketlib.hook.js";

/**
 * Service de gestion des sbires (minions) : création de l'acteur et de son token
 * à partir du compendium, dossier temporaire dédié et comptage des emplacements
 * d'apparition sélectionnés.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Minion {

    /**
     * Crée un sbire (minion) : s'assure de l'existence du dossier temporaire
     * (créé côté MJ si besoin), puis prépare et instancie l'acteur.
     *
     * @param {object} minion   - Les données du sbire à créer.
     * @param {string} location - La direction d'apparition adjacente (« left », « right », « up », « down »).
     *
     * @returns {Promise<void>}
     */
    static async createActor(minion, location) {
        if (!Minion.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        await Minion.createActorData(minion, location);

    }

    /**
     * Les cases (coins supérieurs-gauches, en pixels) couvertes par une zone
     * posée, dans l'ordre de lecture depuis son coin d'origine.
     *
     * Seul le rectangle se découpe en cases entières : c'est la forme qui porte
     * des dimensions en cases (`width`/`height`). Toute autre forme n'offre, pour
     * l'invocation, que sa case d'origine — un cercle ou un cône ne dit pas
     * lesquelles de ses cases accueilleraient un sbire.
     *
     * @param {object} [zonePlacement] - La géométrie de la zone posée.
     *
     * @returns {{x: number, y: number}[]} Les cases disponibles (vide sans zone exploitable).
     */
    static zoneSquares(zonePlacement) {
        const {originX, originY, type, width, height} = zonePlacement ?? {};
        if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
            return [];
        }
        const gridSize = game.canvas?.scene?.dimensions?.size || 100;
        const cols = type === "rectangle" ? Math.max(1, Math.round(width ?? 1)) : 1;
        const rows = type === "rectangle" ? Math.max(1, Math.round(height ?? 1)) : 1;
        const squares = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                squares.push({x: originX + (col * gridSize), y: originY + (row * gridSize)});
            }
        }
        return squares;
    }

    /**
     * Les cases de la zone posée déjà occupées par un token.
     *
     * Un sbire ne se pose JAMAIS sur un jeton existant : c'est la contrepartie,
     * pour l'invocation en zone, de l'exclusion des directions occupées dans
     * l'invocation au contact.
     *
     * @param {object} [zonePlacement] - La géométrie de la zone posée.
     *
     * @returns {{x: number, y: number}[]} Les cases occupées de la zone.
     */
    static occupiedZoneSquares(zonePlacement) {
        return Minion.zoneSquares(zonePlacement).filter(square => Geometry.squareIsOccupied(square));
    }

    /**
     * Crée les sbires sur les cases de la zone posée, plutôt qu'à côté du lanceur :
     * un sbire par case, dans l'ordre de lecture, jusqu'à épuisement des sbires
     * déclarés ou des cases de la zone.
     *
     * Sans géométrie de zone exploitable — la carte a été jouée sans pose, ou la
     * pose a été annulée — aucun sbire n'est créé : mieux vaut pas de sbire qu'un
     * sbire aux pieds du lanceur, à l'opposé de ce que la carte annonce.
     *
     * @param {object[]} [minions]      - Les sbires déclarés par le choix.
     * @param {object} [zonePlacement]  - La géométrie de la zone posée (`originX`/`originY`, dimensions).
     *
     * @returns {Promise<number>} Le nombre de sbires effectivement demandés.
     */
    static async createActorsOnZone(minions, zonePlacement) {
        const squares = Minion.zoneSquares(zonePlacement);
        const toCreate = (minions ?? []).filter(Boolean).slice(0, squares.length);
        if (!toCreate.length) {
            return 0;
        }
        if (!Minion.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        for (let i = 0; i < toCreate.length; i++) {
            await Minion.createActorData(toCreate[i], null, squares[i]);
        }
        return toCreate.length;
    }

    /**
     * Construit les données d'un sbire à partir du compendium des sbires, applique
     * les surcharges éventuelles (PV, critique, esquive, action, mana, zèle,
     * bonus, déplacement), attribue la propriété au joueur, puis délègue la
     * création de l'acteur et de son token au MJ via socket.
     *
     * @param {object} minion     - Les données du sbire (`name`, `data`…).
     * @param {string} location   - La direction d'apparition adjacente.
     * @param {object} [position] - La position absolue (px) où poser le sbire ;
     *                              à défaut, la case adjacente au lanceur.
     *
     * @returns {Promise<void>}
     */
    static async createActorData(minion, location, position) {
        const minionPack = await game.packs.get(FqCardEngineModule.moduleName + ".minions-fq8").getDocuments();

        let actorData = JSON.parse(JSON.stringify(minionPack.find(m => m.name === minion?.name)));

        if (actorData) {
            actorData.folder = Minion.getTempActorFolder().id;
            actorData.name = actorData.name + "_" + Math.floor(Math.random() * 1000000);
            if (minion.data) {
                if (minion.data.hp) {
                    actorData.system.attributes.hp.max = RollService.rollResultSync(minion.data.hp);
                    actorData.system.attributes.hp.value = RollService.rollResultSync(minion.data.hp);
                }
                if (minion.data.critical) {
                    actorData.system.fq.attributes.critical = RollService.rollResultSync(minion.data.critical);
                }
                if (minion.data.evasion) {
                    actorData.system.fq.attributes.evasion = RollService.rollResultSync(minion.data.evasion);
                }
                if (minion.data.action) {
                    actorData.system.fq.action.max = RollService.rollResultSync(minion.data.action);
                    actorData.system.fq.action.value = RollService.rollResultSync(minion.data.action);
                }
                if (minion.data.mana) {
                    actorData.system.fq.mana.max = RollService.rollResultSync(minion.data.mana);
                    actorData.system.fq.mana.value = RollService.rollResultSync(minion.data.mana);
                }
                if (minion.data.zeal) {
                    actorData.system.fq.zeal.max = DEFAULT_MAX_ZEAL;
                    actorData.system.fq.zeal.value = RollService.rollResultSync(minion.data.zeal);
                }
                if (minion.data.damageBonus) {
                    actorData.system.fq.bonus.damage = RollService.rollResultSync(minion.data.damageBonus);
                }
                if (minion.data.healBonus) {
                    actorData.system.fq.bonus.heal = RollService.rollResultSync(minion.data.healBonus);
                }
                if (minion.data.movement) {
                    actorData.system.attributes.movement.walk = RollService.rollResultSync(minion.data.movement);
                }
            }
            actorData.ownership[game.userId] = 3;

            await socket.executeAsGM("createActorFromData", actorData, game.userId, location, position);
        }
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés ET libres (non
     * occupés) parmi les quatre directions.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements valides sélectionnés (0 à 4).
     */
    static getNbValideMinionLocationSelected(fd) {
        return Minion.LOCATION_FIELDS
            .filter(([field, location]) => fd[field] && !Geometry.locationIsOccupied(location))
            .length;
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés parmi les quatre
     * directions, qu'ils soient libres ou non.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements sélectionnés (0 à 4).
     */
    static getNbMinionLocationSelected(fd) {
        return Minion.LOCATION_FIELDS.filter(([field]) => fd[field]).length;
    }

    /**
     * Les quatre emplacements d'apparition d'un sbire, appariant le champ du
     * formulaire de jeu à la direction consommée par `Geometry`. Source unique
     * des deux comptages ci-dessus ; l'ordre EST celui dans lequel l'occupation
     * des cases est interrogée.
     * @type {ReadonlyArray<[string, string]>}
     */
    static LOCATION_FIELDS = Object.freeze([
        ["minionUp", "up"],
        ["minionDown", "down"],
        ["minionLeft", "left"],
        ["minionRight", "right"],
    ]);


    /**
     * Retourne le dossier d'acteurs temporaire (nommé « Temporaire »), s'il existe.
     *
     * @returns {object|undefined} Le dossier « Temporaire », ou undefined.
     */
    static getTempActorFolder() {
        return game.folders.find(fol => fol.type === "Actor" && fol.name === "Temporaire");
    }

    /**
     * Crée le dossier d'acteurs temporaire « Temporaire ». Exécutée côté MJ via socket.
     *
     * @returns {Promise<void>}
     */
    static async createTempFold() {
        await Folder.create({
            name: "Temporaire", type: "Actor"
        });
    }
}
