import {beforeEach, describe, expect, it, vi} from "vitest";
import Minion from "../../src/domain/engine/shared/minion.js";
import CardFqSystem from "../../src/domain/system/cards/card-fq-system.mjs";
import {socket} from "../../src/hook/integration/socketlib.hook.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {executeAsGM: vi.fn()}
}));

/**
 * Invocation d'un fantôme : la COPIE d'une cible visée, posée sur sa case et
 * confiée au lanceur. Ce qui se vérifie ici est ce qui distingue un fantôme d'un
 * sbire du compendium — la source des données, la case d'apparition, l'absence
 * d'effets hérités — et le fait qu'il ne consomme aucun emplacement d'invocation.
 */

const GHOST = CardFqSystem.MINION_TYPE_GHOST;
const SKELETON = CardFqSystem.MINION_TYPE_SKELETON;

/**
 * Le token ciblé par l'utilisateur : un placeable, son document et son acteur,
 * tels que `game.user.targets` les expose en jeu.
 *
 * @param {object}  [options]            - Les données de la cible.
 * @param {number}  [options.hp]         - Les points de vie restants.
 * @param {object}  [options.effects]    - Les effets actifs portés par l'acteur.
 *
 * @returns {object} Un token ciblé exploitable par `Minion.createGhostActorData`.
 */
function targetToken({hp = 12, effects = [{name: "Haunt"}]} = {}) {
    const system = {
        attributes: {hp: {max: 20, value: hp}, movement: {speeds: {walk: 30}}},
        fq: {
            attributes: {critical: 0, evasion: 0},
            action: {max: 2, value: 2},
            mana: {max: 0, value: 0},
            zeal: {max: 8, value: 0},
            bonus: {damage: 0, heal: 0}
        }
    };
    return {
        id: "targetTokenId",
        document: {
            id: "targetTokenId",
            name: "Gobelin",
            x: 300,
            y: 400,
            width: 2,
            height: 2,
            disposition: -1,
            texture: {src: "tokens/goblin.webp"}
        },
        actor: {
            id: "targetActorId",
            system,
            toObject: () => ({
                _id: "targetActorId",
                name: "Gobelin",
                effects,
                ownership: {default: 0},
                prototypeToken: {name: "Gobelin", texture: {src: "prototype.webp"}, actorLink: true},
                system: JSON.parse(JSON.stringify(system))
            })
        }
    };
}

/**
 * Installe le personnage courant (l'invocateur) et le dossier temporaire dans
 * lequel les créatures invoquées sont créées.
 *
 * @param {object[]} [targets] - Les tokens ciblés par l'utilisateur.
 */
function mountCaster(targets = [targetToken()]) {
    globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    game.userId = "userId";
    game.user.targets = new Set(targets);
    game.user.character = {
        id: "casterId",
        system: {fq: {minions: {ghost: {max: 1, hp: 0, damage: 0, movement: 0}}}}
    };
    game.folders = [{type: "Actor", name: "Temporaire", id: "tempFolderId"}];
    game.folders.find = Array.prototype.find.bind(game.folders);
}

describe("Minion — invocation d'un fantôme", () => {

    beforeEach(() => {
        socket.executeAsGM.mockClear();
        mountCaster();
    });

    it("copie la cible, la renomme et la pose sur SA case", async () => {
        await Minion.createGhostActorData({type: GHOST, data: {}});

        // L'invocateur n'est pas inscrit au combat du bac à sable : aucune
        // initiative n'est déductible, le combattant naîtra sans.
        expect(socket.executeAsGM).toHaveBeenCalledWith("createActorFromData",
            expect.any(Object), "userId", null, {x: 300, y: 400}, null);

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.name).toContain("FQCARDENGINE.GhostName");
        expect(actorData.name).toContain("Gobelin");
        expect(actorData._id).toBeUndefined();
        expect(actorData.folder).toBe("tempFolderId");
    });

    it("naît sans aucun effet hérité de la cible", async () => {
        await Minion.createGhostActorData({type: GHOST, data: {}});

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.effects).toEqual([]);
    });

    it("prend l'apparence du JETON de la cible, pas celle du prototype de son acteur", async () => {
        await Minion.createGhostActorData({type: GHOST, data: {}});

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.prototypeToken.texture).toEqual({src: "tokens/goblin.webp"});
        expect(actorData.prototypeToken.width).toBe(2);
        expect(actorData.prototypeToken.height).toBe(2);
        // La disposition de la cible est conservée : le fantôme reste du camp dont
        // il est la copie.
        expect(actorData.prototypeToken.disposition).toBe(-1);
        expect(actorData.prototypeToken.actorLink).toBe(false);
    });

    it("est confié au lanceur et estampillé, avec l'origine de sa cible", async () => {
        await Minion.createGhostActorData({type: GHOST, data: {}});

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.ownership.userId).toBe(3);
        expect(actorData.flags["fq-card-engine"]).toEqual(expect.objectContaining({
            minionType: GHOST,
            summonerId: "casterId",
            ghostOfTokenId: "targetTokenId",
            ghostOfActorId: "targetActorId"
        }));
    });

    it("hérite des points de vie RESTANTS de la cible, sauf surcharge de la carte", async () => {
        await Minion.createGhostActorData({type: GHOST, data: {}});

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.system.attributes.hp.value).toBe(12);
    });

    it("applique le bonus de dégâts déclaré par la carte, comme un sbire du compendium", async () => {
        // Le bonus passe par le résolveur de formules (une carte peut déclarer
        // « @wis » ou « 1d4 ») : le Roll du bac à sable rend toujours 10.
        await Minion.createGhostActorData({type: GHOST, data: {damageBonus: "1d4"}});

        const [, actorData] = socket.executeAsGM.mock.calls.at(-1);
        expect(actorData.system.fq.bonus.damage).toBe(10);
    });

    it("sans cible sélectionnée, ne crée rien et prévient", async () => {
        mountCaster([]);

        await Minion.createGhostActorData({type: GHOST, data: {}});

        expect(socket.executeAsGM).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith(
            "FQCARDENGINE.WarningMsgGhostNeedsTarget", {localize: true});
    });

    it("part sur le chemin fantôme depuis createActorData, sans toucher au compendium", async () => {
        await Minion.createActorData({type: GHOST, data: {}}, "left");

        expect(game.packs.get).not.toHaveBeenCalled();
        expect(socket.executeAsGM).toHaveBeenCalledWith("createActorFromData",
            expect.any(Object), "userId", null, {x: 300, y: 400}, null);
    });
});

describe("Minion — l'initiative d'une créature invoquée", () => {

    beforeEach(() => {
        mountCaster();
    });

    it("s'inscrit juste sous celle de son invocateur", () => {
        const combat = {combatants: [{actorId: "casterId", initiative: 17}]};

        expect(Minion.summonedInitiative("casterId", combat)).toBe(17 - Minion.SUMMON_INITIATIVE_STEP);
    });

    it("reste nulle si l'invocateur n'est pas au combat ou n'a pas jeté la sienne", () => {
        // Sans initiative posée, le combattant est créé sans : le jet automatique
        // du module lui en donnera une, comme avant.
        expect(Minion.summonedInitiative("casterId", {combatants: [{actorId: "casterId", initiative: null}]})).toBeNull();
        expect(Minion.summonedInitiative("casterId", {combatants: []})).toBeNull();
        expect(Minion.summonedInitiative(undefined, {combatants: [{actorId: "casterId", initiative: 12}]})).toBeNull();
    });

    it("est transmise au MJ avec les données de l'acteur, pour le fantôme aussi", async () => {
        game.combat = {combatants: [{actorId: "casterId", initiative: 9}]};

        await Minion.createGhostActorData({type: GHOST, data: {}});

        expect(socket.executeAsGM).toHaveBeenCalledWith("createActorFromData",
            expect.any(Object), "userId", null, {x: 300, y: 400}, 9 - Minion.SUMMON_INITIATIVE_STEP);
    });
});

describe("Minion — dissipation d'un fantôme", () => {

    /**
     * Pose un fantôme sur la scène du combat, l'y inscrit, et rend les espions de
     * suppression de chacun de ses trois documents.
     *
     * La scène AFFICHÉE par le MJ (`game.canvas.scene`) est délibérément une
     * autre, vide : c'est la situation de table ordinaire (un MJ qui prépare la
     * suite pendant que le combat tourne), et la dissipation ne doit rien lui
     * devoir.
     *
     * @param {object}  [options]         - Les options de montage.
     * @param {string}  [options.type]    - Le type de sbire estampillé sur l'acteur.
     * @param {boolean} [options.onActiveScene=false] - Pose le fantôme sur la scène
     *        ACTIVE du monde plutôt que sur celle du combat (combat sans scène).
     *
     * @returns {object} Les espions `combatant`, `token` et `actor`.
     */
    function mountGhostOnScene({type = GHOST, onActiveScene = false} = {}) {
        const deletes = {combatant: vi.fn(), token: vi.fn(), actor: vi.fn()};
        const tokenDocument = {
            id: "ghostTokenId",
            delete: deletes.token,
            actor: {
                id: "ghostActorId",
                delete: deletes.actor,
                flags: {"fq-card-engine": {minionType: type, summonerId: "casterId"}}
            }
        };
        const ghostScene = {dimensions: {size: 100}, tokens: [tokenDocument]};
        const emptyScene = {dimensions: {size: 100}, tokens: []};
        // La scène sous les yeux du MJ n'est celle de personne : si la dissipation
        // la lit, elle ne trouvera aucun fantôme et le test le dira.
        game.canvas = {scene: emptyScene};
        game.scenes = [ghostScene];
        game.scenes.active = onActiveScene ? ghostScene : emptyScene;
        game.combat = {
            scene: onActiveScene ? null : ghostScene,
            combatants: [{tokenId: "ghostTokenId", delete: deletes.combatant}]
        };
        return deletes;
    }

    beforeEach(() => {
        mountCaster();
    });

    it("à la fin de son tour, retire le combattant, le jeton puis l'acteur", async () => {
        const deletes = mountGhostOnScene();

        await Minion.dismissGhostOfTurn("ghostTokenId", game.combat);

        expect(deletes.combatant).toHaveBeenCalled();
        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("ne touche pas à un jeton qui n'est pas un fantôme", async () => {
        const deletes = mountGhostOnScene({type: SKELETON});

        await Minion.dismissGhostOfTurn("ghostTokenId", game.combat);

        expect(deletes.token).not.toHaveBeenCalled();
        expect(deletes.actor).not.toHaveBeenCalled();
    });

    it("sans jeton désigné, ne fait rien", async () => {
        const deletes = mountGhostOnScene();

        await Minion.dismissGhostOfTurn(undefined, game.combat);

        expect(deletes.token).not.toHaveBeenCalled();
    });

    it("la fin du combat emporte les fantômes restants", async () => {
        const deletes = mountGhostOnScene();

        await Minion.dismissAllGhosts(game.combat);

        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("dissipe sur la scène ACTIVE quand le combat n'en déclare aucune", async () => {
        const deletes = mountGhostOnScene({onActiveScene: true});

        await Minion.dismissGhostOfTurn("ghostTokenId", game.combat);

        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("dissipe même quand le MJ regarde une AUTRE scène que celle du combat", async () => {
        // Le défaut que cette garde couvre : chercher le jeton sur
        // `game.canvas.scene` laissait le fantôme en jeu — et jouant chaque round
        // — dès que le MJ ouvrait une autre scène pendant le combat.
        const deletes = mountGhostOnScene();
        expect(game.canvas.scene.tokens).toEqual([]);

        await Minion.dismissGhostOfTurn("ghostTokenId", game.combat);
        await Minion.dismissAllGhosts(game.combat);

        expect(deletes.token).toHaveBeenCalled();
    });

    it("à la suppression du combat, dissipe sur le combat REÇU (game.combat est déjà vide)", async () => {
        const deletes = mountGhostOnScene();
        const deletedCombat = game.combat;
        game.combat = null;

        await Minion.dismissAllGhosts(deletedCombat);

        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("à la suppression du combat, ne supprime pas le combattant : il est parti avec son combat", async () => {
        const deletes = mountGhostOnScene();
        const deletedCombat = game.combat;
        deletedCombat.id = "deletedCombatId";
        game.combat = null;
        game.combats = new Map();

        await Minion.dismissAllGhosts(deletedCombat);

        expect(deletes.combatant).not.toHaveBeenCalled();
        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("retire le combattant quand le combat existe encore dans le monde", async () => {
        const deletes = mountGhostOnScene();
        game.combat.id = "liveCombatId";
        game.combats = new Map([["liveCombatId", game.combat]]);

        await Minion.dismissGhostOfTurn("ghostTokenId", game.combat);

        expect(deletes.combatant).toHaveBeenCalled();
        expect(deletes.token).toHaveBeenCalled();
        expect(deletes.actor).toHaveBeenCalled();
    });

    it("une suppression rejetée est notifiée sans se propager, et l'acteur est épargné", async () => {
        const deletes = mountGhostOnScene();
        deletes.combatant.mockRejectedValue(new Error("Combatant does not exist!"));

        await expect(Minion.dismissAllGhosts(game.combat)).resolves.toBeUndefined();

        expect(ui.notifications.error).toHaveBeenCalledWith("Combatant does not exist!");
        expect(deletes.token).not.toHaveBeenCalled();
        expect(deletes.actor).not.toHaveBeenCalled();
    });
});

describe("Minion — le fantôme face aux emplacements d'invocation", () => {

    beforeEach(() => {
        mountCaster();
    });

    it("ne compte pas parmi les sbires à poser", () => {
        const minions = [{type: GHOST}, {type: SKELETON}];

        expect(Minion.placedMinions(minions)).toEqual([{type: SKELETON}]);
        expect(Minion.ghostMinions(minions)).toEqual([{type: GHOST}]);
    });

    it("est compté par le plafond même sans aucun emplacement sélectionné", () => {
        // Un fantôme déjà en jeu, et la carte en demande un second : sans la
        // dérogation à la limite de pose, le dépassement passerait inaperçu.
        game.canvas = {
            scene: {
                dimensions: {size: 100},
                tokens: [{
                    actor: {
                        flags: {"fq-card-engine": {minionType: GHOST, summonerId: "casterId"}},
                        system: {attributes: {hp: {value: 10}}}
                    }
                }]
            }
        };

        expect(Minion.capVerdict([{type: GHOST}], 0)).toEqual({
            type: GHOST, current: 1, max: 1, requested: 1
        });
    });
});
