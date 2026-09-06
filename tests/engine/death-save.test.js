import {beforeEach, describe, expect, it, vi} from "vitest";
import DeathSave, {DEATH_SAVE_SETTING} from "../../src/domain/engine/death-save.js";

const MODULE = "fq-card-engine";

/**
 * Construit un personnage à terre (ou debout) exposant tout ce que `DeathSave`
 * consulte : points de vie, compteurs de sauvegarde contre la mort, jet du
 * système et bascule de statut. `rollDeathSave` applique l'issue passée en
 * option, comme le ferait dnd5e (compteurs mis à jour, remontée à 1 PV sur
 * réussite critique).
 */
function makeCharacter({
    name = "Aldric",
    hp = 0,
    success = 0,
    failure = 0,
    outcome = null,
    type = "character",
    flags = {}
} = {}) {
    const actor = {
        name,
        type,
        flags,
        system: {attributes: {hp: {value: hp}, death: {success, failure}}},
        update: vi.fn(async updates => {
            if ("system.attributes.hp.value" in updates) {
                actor.system.attributes.hp.value = updates["system.attributes.hp.value"];
            }
        }),
        toggleStatusEffect: vi.fn().mockResolvedValue(undefined),
        rollDeathSave: vi.fn(async () => {
            const death = actor.system.attributes.death;
            if (outcome === "failure") {
                death.failure += 1;
            } else if (outcome === "success") {
                death.success += 1;
            } else if (outcome === "stabilized") { // 3e réussite : dnd5e remet les deux compteurs à zéro
                death.success = 0;
                death.failure = 0;
            } else if (outcome === "critical") { // réussite critique : dnd5e rend 1 PV
                death.success = 0;
                death.failure = 0;
                actor.system.attributes.hp.value = 1;
            }
            return [];
        })
    };
    return actor;
}

/**
 * Construit un combat dont le combattant courant porte l'acteur fourni.
 * `nextTurn`, `combatant.delete` et `combatant.token.delete` sont espionnables.
 */
function makeCombat(actor) {
    const combatant = {
        id: "combatant-1",
        actor,
        token: {delete: vi.fn().mockResolvedValue(undefined)},
        delete: vi.fn().mockResolvedValue(undefined)
    };
    return {combatant, nextTurn: vi.fn().mockResolvedValue(undefined)};
}

/** Déroule le délai d'attente puis laisse la chaîne détachée de `endTurnLater` se résoudre. */
async function flushEndTurn() {
    await vi.advanceTimersByTimeAsync(DeathSave.PASS_TURN_DELAY);
    await vi.runAllTimersAsync();
}

beforeEach(() => {
    globalThis.FqCardEngineModule = {moduleName: MODULE};
    game.settings.get = vi.fn((module, key) => module === MODULE && key === DEATH_SAVE_SETTING);
});

describe("engine/death-save.js", () => {

    describe("gardes", () => {
        it("ne fait rien quand le réglage est désactivé", async () => {
            game.settings.get = vi.fn(() => false);
            const actor = makeCharacter({hp: 0, outcome: "failure"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(actor.rollDeathSave).not.toHaveBeenCalled();
        });

        it("ne fait rien pour un personnage debout", async () => {
            const actor = makeCharacter({hp: 7, outcome: "failure"});

            expect(await DeathSave.resolveTurnStart(makeCombat(actor))).toBe(false);
            expect(actor.rollDeathSave).not.toHaveBeenCalled();
        });

        it("rend la main si le système n'expose pas de jet de sauvegarde", async () => {
            const actor = makeCharacter({hp: 0});
            actor.rollDeathSave = undefined;
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(combat.nextTurn).not.toHaveBeenCalled();
        });

        it("isDown ignore un acteur sans points de vie chiffrés", () => {
            expect(DeathSave.isDown({system: {attributes: {}}})).toBe(false);
            expect(DeathSave.isDown(undefined)).toBe(false);
            expect(DeathSave.isDown({system: {attributes: {hp: {value: 0}}}})).toBe(true);
            expect(DeathSave.isDown({system: {attributes: {hp: {value: -3}}}})).toBe(true);
        });
    });

    describe("personnage à 0 point de vie", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("lance le jet du système sans fenêtre de configuration", async () => {
            const actor = makeCharacter({hp: 0, outcome: "success"});

            await DeathSave.resolveTurnStart(makeCombat(actor));

            expect(actor.rollDeathSave).toHaveBeenCalledWith({fastForward: true}, {configure: false});
        });

        it("passe le tour après le délai de lecture quand le jet n'est pas concluant", async () => {
            const actor = makeCharacter({hp: 0, success: 1, outcome: "failure"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
            expect(combat.nextTurn).not.toHaveBeenCalled();

            await flushEndTurn();

            expect(combat.nextTurn).toHaveBeenCalledTimes(1);
            expect(combat.combatant.delete).not.toHaveBeenCalled();
            expect(actor.system.attributes.hp.value).toBe(0);
        });

        it("remonte le personnage à 1 point de vie à la troisième réussite", async () => {
            const actor = makeCharacter({hp: 0, success: 2, outcome: "stabilized"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 1});
            expect(actor.system.attributes.hp.value).toBe(1);

            await flushEndTurn();

            expect(combat.nextTurn).not.toHaveBeenCalled();
        });

        it("laisse la réussite critique du système rendre le point de vie", async () => {
            const actor = makeCharacter({hp: 0, success: 1, outcome: "critical"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(actor.update).not.toHaveBeenCalled();
            expect(actor.system.attributes.hp.value).toBe(1);

            await flushEndTurn();

            expect(combat.nextTurn).not.toHaveBeenCalled();
        });

        it("tue le personnage au troisième échec : statut mort, tour passé puis retrait du combat", async () => {
            const actor = makeCharacter({hp: 0, failure: 2, outcome: "failure"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
            expect(actor.toggleStatusEffect).toHaveBeenCalledWith("dead", {active: true, overlay: true});

            await flushEndTurn();

            expect(combat.nextTurn).toHaveBeenCalledTimes(1);
            expect(combat.combatant.delete).toHaveBeenCalledTimes(1);
            // Le personnage laisse un corps : son jeton reste sur la scène.
            expect(combat.combatant.token.delete).not.toHaveBeenCalled();
        });

        it("passe le tour AVANT de retirer le combattant du combat", async () => {
            const order = [];
            const actor = makeCharacter({hp: 0, failure: 2, outcome: "failure"});
            const combat = makeCombat(actor);
            combat.nextTurn.mockImplementation(async () => void order.push("nextTurn"));
            combat.combatant.delete.mockImplementation(async () => void order.push("delete"));

            await DeathSave.resolveTurnStart(combat);
            await flushEndTurn();

            expect(order).toEqual(["nextTurn", "delete"]);
        });
    });

    describe("sbire à 0 point de vie", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("se dissipe sans jet : retiré du combat ET de la scène", async () => {
            const actor = makeCharacter({
                name: "Skeleton lvl 2_1234",
                hp: 0,
                type: "npc",
                flags: {[MODULE]: {minionType: "skeleton", summonerId: "summoner-1"}}
            });
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
            expect(actor.rollDeathSave).not.toHaveBeenCalled();

            await flushEndTurn();

            expect(combat.nextTurn).toHaveBeenCalledTimes(1);
            expect(combat.combatant.delete).toHaveBeenCalledTimes(1);
            expect(combat.combatant.token.delete).toHaveBeenCalledTimes(1);
        });

        it("un sbire debout garde son tour", async () => {
            const actor = makeCharacter({
                hp: 4,
                type: "npc",
                flags: {[MODULE]: {summonerId: "summoner-1"}}
            });
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(combat.combatant.delete).not.toHaveBeenCalled();
        });

        it("isMinion ne reconnaît que l'estampille d'invocation", () => {
            expect(DeathSave.isMinion({flags: {[MODULE]: {summonerId: "a"}}})).toBe(true);
            expect(DeathSave.isMinion({flags: {[MODULE]: {minionType: "skeleton"}}})).toBe(false);
            expect(DeathSave.isMinion({flags: {}})).toBe(false);
            expect(DeathSave.isMinion(undefined)).toBe(false);
        });
    });

    describe("PNJ ordinaire à 0 point de vie", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("quitte le combat sans jet, et laisse son jeton sur la scène", async () => {
            const actor = makeCharacter({name: "Gobelin", hp: 0, type: "npc"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
            expect(actor.rollDeathSave).not.toHaveBeenCalled();

            await flushEndTurn();

            expect(combat.nextTurn).toHaveBeenCalledTimes(1);
            expect(combat.combatant.delete).toHaveBeenCalledTimes(1);
            expect(combat.combatant.token.delete).not.toHaveBeenCalled();
        });

        it("un PNJ debout garde son tour", async () => {
            const actor = makeCharacter({hp: 3, type: "npc"});
            const combat = makeCombat(actor);

            expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
            expect(combat.combatant.delete).not.toHaveBeenCalled();
        });
    });

    describe("réglage", () => {
        it("expose la clé attendue par register-settings", () => {
            expect(DEATH_SAVE_SETTING).toBe("DeathSaveOnTurnStart");
        });

        it("isEnabled reste faux si les réglages ne sont pas disponibles", () => {
            game.settings.get = vi.fn(() => {
                throw new Error("settings indisponibles");
            });

            expect(DeathSave.isEnabled()).toBe(false);
        });
    });
});
