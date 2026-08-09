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
     * Construit les données d'un sbire à partir du compendium des sbires, applique
     * les surcharges éventuelles (PV, critique, esquive, action, mana, zèle,
     * bonus, déplacement), attribue la propriété au joueur, puis délègue la
     * création de l'acteur et de son token au MJ via socket.
     *
     * @param {object} minion   - Les données du sbire (`name`, `data`…).
     * @param {string} location - La direction d'apparition adjacente.
     *
     * @returns {Promise<void>}
     */
    static async createActorData(minion, location) {
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

            await socket.executeAsGM("createActorFromData", actorData, game.userId, location);
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
        return (fd.minionUp && !Geometry.locationIsOccupied("up") ? 1 : 0) +
            (fd.minionDown && !Geometry.locationIsOccupied("down") ? 1 : 0) +
            (fd.minionLeft && !Geometry.locationIsOccupied("left") ? 1 : 0) +
            (fd.minionRight && !Geometry.locationIsOccupied("right") ? 1 : 0);
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
        return (fd.minionUp ? 1 : 0) +
            (fd.minionDown ? 1 : 0) +
            (fd.minionLeft ? 1 : 0) +
            (fd.minionRight ? 1 : 0);
    }


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
