import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le commentaire JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice, makeEquippedWeapon} = await import("./play-harness.js");
const {DECKS_DIR, installMacroStub, worldFixture, sweepWorldOverridesFor} = await import("./corpus-helpers.js");
installMacroStub();
const {OriginFQEffectLabel} = await import("../../src/domain/constants.js");

/**
 * Les cartes qui posent une condition dnd5e, ou « Garde brisée », jouées TELLES
 * QU'ELLES SONT dans les paquets par le vrai pipeline (`playChoice`).
 *
 * Pour chaque carte : la condition est posée sur la bonne cible, avec la durée
 * saisie sur la carte, et l'origine FQ qui la fait tomber en fin de combat. Une
 * condition tirée au dé est jouée DEUX fois : sur le résultat qui la pose, et
 * sur un résultat qui ne la pose pas.
 *
 * Chaque monde satisfait les prérequis de sa carte (effets requis sur la cible,
 * bouclier, combat en cours, distance) : sans cela la carte serait refusée et ne
 * poserait rien — ce qui ferait passer un test « rien n'est posé » pour de
 * mauvaises raisons. Deux tests vérifient d'ailleurs que ces refus tiennent.
 */

/** Toutes les cartes des paquets pattern, par id. */
const CARDS = new Map(fs.readdirSync(DECKS_DIR)
    .filter(file => file.endsWith(".json"))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8")).cards ?? [])
    .map(card => [card._id, card]));

/**
 * Une carte des paquets, en copie : le pipeline mute ce qu'il joue.
 *
 * @param {string} id - L'id de la carte.
 *
 * @returns {object} La carte brute.
 */
function packCard(id) {
    const card = CARDS.get(id);
    expect(card, `carte ${id} absente des paquets`).toBeDefined();
    return JSON.parse(JSON.stringify(card));
}

/** Des dés imposés par nombre de faces. */
const dice = (faces, ...values) => values.map(value => ({faces, value}));

/** Une arme de chaque type : les cartes à jeton d'arme en exigent une. */
const ARMED = [makeEquippedWeapon("martialM"), makeEquippedWeapon("martialR")];

/** Un bouclier équipé, qu'exige *Onde de Choc*. */
const SHIELD = {type: "equipment", system: {equipped: true, type: {value: "shield"}}};

/**
 * De quoi payer n'importe quelle carte : le personnage de la fixture n'a ni zèle
 * ni plus de 10 PA, et une carte qu'il ne peut pas payer est refusée AVANT de
 * rien poser — le test mesurerait alors le garde-fou des ressources, pas la carte.
 */
const WEALTHY = {fq: {action: {value: 20, max: 20}, zeal: {value: 8, max: 8}, mana: {value: 10, max: 10}}};

/**
 * Le monde de base : le lanceur armé, la cible de la fixture portant les effets
 * nommés que la carte exige.
 *
 * @param {object} [options]            - Ce qui distingue ce monde.
 * @param {string[]} [options.effects]  - Les noms d'effets déjà portés par la cible.
 * @param {object[]} [options.items]    - Les objets du lanceur.
 * @param {object} [options.target]     - Surcharges de l'acteur ciblé.
 * @param {object} [options.extra]      - Surcharges supplémentaires du monde.
 *
 * @returns {object} Les surcharges `world`.
 */
function world({effects = [], items = ARMED, target = {}, extra = {}} = {}) {
    return {
        character: {items, system: WEALTHY},
        targetActor: {effects: effects.map((name, index) => ({id: `fx${index}`, name})), ...target},
        ...extra
    };
}

/**
 * Une cible posée à `cases` cases à gauche du lanceur, remplaçant celle de la
 * fixture dans la sélection.
 *
 * @param {number} cases - La distance en cases.
 *
 * @returns {object} Les surcharges `world` qui la ciblent.
 */
function targetAt(cases) {
    const {target, myToken, gridSize} = worldFixture;
    const actor = {_id: target.actorId, id: target.actorId, name: target.name, system: {fq: {attributes: {evasion: 0}}}};
    const token = {
        id: target.tokenId, actor,
        document: {name: target.name, actorId: target.actorId, x: myToken.x - cases * gridSize, y: myToken.y,
            width: 1, height: 1}
    };
    // Un TABLEAU et non un Set : le `deepMerge` du harnais prend un Set pour un
    // objet simple et le viderait en le fusionnant ; un tableau est remplacé tel quel.
    return {character: {items: ARMED, system: WEALTHY}, user: {targets: [token]}};
}

/**
 * Tous les effets actifs créés : ceux posés sur les cibles par le MJ, et ceux
 * posés sur le lanceur lui-même.
 *
 * @param {object} result - Le résultat de `playChoice`.
 *
 * @returns {object[]} Les données d'effets créées.
 */
function created(result) {
    return [
        ...result.effectsCreated.map(call => call.effect),
        ...result.activeEffectCalls.map(call => call[0])
    ].filter(Boolean);
}

/**
 * Les effets créés porteurs d'un statut.
 *
 * @param {object} result - Le résultat de `playChoice`.
 * @param {string} status - L'identifiant de statut.
 *
 * @returns {object[]} Les effets.
 */
const withStatus = (result, status) => created(result).filter(effect => (effect.statuses ?? []).includes(status));

/**
 * Vérifie qu'une condition a été posée une fois, avec sa durée et l'origine FQ.
 *
 * @param {object} result - Le résultat de `playChoice`.
 * @param {string} status - L'identifiant de statut.
 * @param {number} turns  - La durée attendue, en rounds.
 *
 * @returns {object} L'effet posé.
 */
function expectCondition(result, status, turns) {
    expect(result.threw, result.error?.message).toBe(false);
    const effects = withStatus(result, status);
    // En cas d'échec, dire ce qui a VRAIMENT été posé et ce que le chat a reçu :
    // une carte refusée ne pose rien, et son avertissement dit pourquoi.
    const posed = JSON.stringify(created(result).map(effect => [effect.name, effect.statuses ?? []]));
    const chat = result.chatMessages.map(message => String(message.content ?? "").replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").slice(0, 160)).join(" | ");
    expect(effects, `« ${status} » attendue une fois — posés : ${posed} — chat : ${chat}`).toHaveLength(1);
    const [effect] = effects;
    expect(effect.duration).toEqual({value: turns, units: "rounds"});
    expect(effect.origin).toBe(OriginFQEffectLabel);
    // Le champ de référence du registre ne doit jamais fuiter dans l'ActiveEffect.
    expect(effect.status).toBeUndefined();
    return effect;
}

/**
 * Joue une carte des paquets.
 *
 * @param {string} id       - L'id de la carte.
 * @param {object} [worldOverrides] - Le monde.
 * @param {object[]} [forced] - Les dés imposés.
 *
 * @returns {Promise<object>} Le résultat de `playChoice`.
 */
async function play(id, worldOverrides = world(), forced = []) {
    vi.clearAllMocks();
    return playChoice(packCard(id), 0, {world: worldOverrides, dice: forced});
}

const MODULE = "fq-card-engine";

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    delete globalThis.CONFIG.statusEffects;
});

describe("Entravé — les cartes qui immobilisent déjà", () => {

    test("Filet de rétiaire : entravée 2 tours, et le filet FQ reste posé", async () => {
        const result = await play("RetiariusNet8Fmt");

        expectCondition(result, "restrained", 2);
        expect(created(result).some(effect => effect.name === "Net")).toBe(true);
    });

    test("Traquenard : entravée 1 tour, avec son immobilisation", async () => {
        const result = await play("avtGZSi6Wmto1NMP");

        expectCondition(result, "restrained", 1);
        expect(created(result).some(effect => effect.name === "Immobilization")).toBe(true);
    });

    test("Piège en Chaîne : entravée 1 tour", async () => {
        expectCondition(await play("trChainTrap00001"), "restrained", 1);
    });

    test("Tourbillon, un 4 sur 1d4 : entravée 2 tours", async () => {
        const result = await play("e9muLayxFRouooiW", world(), dice(4, 4));

        expectCondition(result, "restrained", 2);
    });

    test("Tourbillon, un 2 sur 1d4 : deux effets d'air, PAS d'entrave", async () => {
        const result = await play("e9muLayxFRouooiW", world(), dice(4, 2));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "restrained")).toEqual([]);
        expect(created(result).filter(effect => effect.name === "Air Effect")).toHaveLength(2);
    });
});

describe("Pétrifié, paralysé, étourdi — les conditions très fortes", () => {

    test("Sépulcre de pierre (4 effets de terre sur la cible) : pétrifiée 1 tour", async () => {
        const result = await play("FQelemSepulcre01", world({effects: Array(4).fill("Earth Effect")}));

        expectCondition(result, "petrified", 1);
    });

    test("Sépulcre de pierre sans ses 4 effets de terre : refusé, rien n'est posé", async () => {
        const result = await play("FQelemSepulcre01", world({effects: ["Earth Effect"]}));

        expect(withStatus(result, "petrified")).toEqual([]);
        expect(result.hpCalls).toEqual([]);
    });

    test("Éternité glaciaire, un 3 sur 1d3 : paralysée 1 tour", async () => {
        const result = await play("FQelemGlacial001", world({effects: ["Frost", "Frost"]}), dice(3, 3));

        expectCondition(result, "paralyzed", 1);
    });

    test("Éternité glaciaire, un 1 sur 1d3 : les effets de gel, mais PAS la paralysie", async () => {
        const result = await play("FQelemGlacial001", world({effects: ["Frost", "Frost"]}), dice(3, 1));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "paralyzed")).toEqual([]);
        expect(created(result).filter(effect => effect.name === "Frost")).toHaveLength(4);
    });

    test("Interruption, un 4 sur 1d4 : étourdie 1 tour, en plus de la perte de PA", async () => {
        const result = await play("1MOAMJjs8KTHDHEW", world(), dice(4, 4));

        expectCondition(result, "stunned", 1);
        expect(created(result).some(effect => effect.name === "Interruption")).toBe(true);
    });

    test("Interruption, un 1 sur 1d4 : la perte de PA seule", async () => {
        const result = await play("1MOAMJjs8KTHDHEW", world(), dice(4, 1));

        expect(withStatus(result, "stunned")).toEqual([]);
        expect(created(result).some(effect => effect.name === "Interruption")).toBe(true);
    });
});

describe("Aveuglé, à terre, agrippé", () => {

    test("Frappe Solaire : la CIBLE est aveuglée 1 tour, le LANCEUR paie son coût", async () => {
        const result = await play("KKqwG2totfL6Ae6F");

        expectCondition(result, "blinded", 1);
        expect(result.effectsCreated.some(call => (call.effect.statuses ?? []).includes("blinded"))).toBe(true);
        expect(created(result).some(effect => effect.name === "Solar Strike")).toBe(true);
    });

    test("Onde De Choc, bouclier équipé : les cibles adjacentes sont à terre 1 tour", async () => {
        const result = await play("zBGTahQsDUYNMB8o", world({items: [...ARMED, SHIELD]}));

        expectCondition(result, "prone", 1);
    });

    test("Onde De Choc sans bouclier : refusée, personne n'est mis à terre", async () => {
        const result = await play("zBGTahQsDUYNMB8o", world());

        expect(withStatus(result, "prone")).toEqual([]);
    });

    test("Piège à Fosse, sur le combattant actif immobile : à terre 1 tour, et son tour prend fin", async () => {
        const combat = {combatant: {tokenId: worldFixture.target.tokenId}, round: 1, turn: 0, flags: {}};
        const result = await play("trPitTrap0000001", world({extra: {combat}}));

        expectCondition(result, "prone", 1);
        expect(created(result).some(effect => effect.name === "Turn Ended")).toBe(true);
    });

    test("Chaîne De Fer : la cible ramenée est agrippée 1 tour", async () => {
        const result = await play("gdIronChain00001");

        expectCondition(result, "grappled", 1);
        expect(created(result).some(effect => effect.name === "Iron Chain")).toBe(true);
    });
});

describe("Empoisonné — avec le poison FQ", () => {

    test("Tir Empoisonné (cible à 4 cases) : empoisonnée 2 tours, et le poison FQ posé", async () => {
        const result = await play("kORVYHpmXhuDsizl", targetAt(4));

        expectCondition(result, "poisoned", 2);
        expect(created(result).some(effect => effect.name === "Poison")).toBe(true);
    });

    test("Piège Empoisonné : empoisonnée 2 tours", async () => {
        expectCondition(await play("32n0BG877yvyRJ5q"), "poisoned", 2);
    });

    test("Shuriken empoisonné, un 4 sur 1d4 : empoisonnée ET le poison FQ", async () => {
        const result = await play("I1OreDXuHqkLzrBJ", world(), dice(4, 4));

        expectCondition(result, "poisoned", 2);
        expect(created(result).some(effect => effect.name === "Poison")).toBe(true);
    });

    test("Shuriken empoisonné, un 3 sur 1d4 : ni l'un ni l'autre", async () => {
        const result = await play("I1OreDXuHqkLzrBJ", world(), dice(4, 3));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "poisoned")).toEqual([]);
        expect(created(result).some(effect => effect.name === "Poison")).toBe(false);
    });
});

describe("Brouillard — tous les ennemis du combat", () => {

    const FOG = "wfkVjXjUGpI9ZdYq";

    /**
     * Le monde du balayage — un combat dont les ennemis sont les jetons de la
     * scène, comme l'exige le ciblage « Combat » — avec, sur la cible, l'effet
     * d'air que *Brouillard* réclame.
     *
     * @param {string[]} [effects] - Les effets portés par la cible sélectionnée.
     *
     * @returns {object} Les surcharges `world`.
     */
    const fogWorld = (effects = ["Air Effect"]) => ({
        ...sweepWorldOverridesFor(packCard(FOG).system.fq.choices[0]),
        targetActor: {effects: effects.map((name, index) => ({id: `fx${index}`, name}))}
    });

    test("un 4 sur 1d4 : les ennemis sont aveuglés 1 tour, en plus du brouillard", async () => {
        const result = await play(FOG, fogWorld(), dice(4, 4));

        expectCondition(result, "blinded", 1);
        expect(created(result).some(effect => effect.name === "Fog")).toBe(true);
    });

    test("un 3 sur 1d4 : le brouillard seul, personne n'est aveuglé", async () => {
        const result = await play(FOG, fogWorld(), dice(4, 3));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "blinded")).toEqual([]);
        expect(created(result).some(effect => effect.name === "Fog")).toBe(true);
    });

    test("sans effet d'air ni de terre sur la cible : refusé, rien n'est posé", async () => {
        const result = await play(FOG, fogWorld([]), dice(4, 4));

        expect(created(result)).toEqual([]);
    });
});

describe("Effrayé, invisible, neutralisé, assourdi", () => {

    test("Explosion D'Ombre, un 3 sur 1d3 : effrayées 1 tour", async () => {
        const result = await play("E2U3HtP9Qkoo4gAx", world(), dice(3, 3));

        expectCondition(result, "frightened", 1);
    });

    test("Explosion D'Ombre, un 2 sur 1d3 : pas d'effroi", async () => {
        const result = await play("E2U3HtP9Qkoo4gAx", world(), dice(3, 2));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "frightened")).toEqual([]);
    });

    test("Dissimulation : le LANCEUR devient invisible 1 tour", async () => {
        const result = await play("tyBaqGt92r9MCeRa");

        expectCondition(result, "invisible", 1);
    });

    test("Givre Des Synapses (gel et air sur la cible) : neutralisée 2 tours", async () => {
        const result = await play("FQelemSynapse406", world({effects: ["Frost", "Air Effect"]}));

        expectCondition(result, "incapacitated", 2);
    });

    test("Fusion Des Extrêmes (brûlure et gel sur la cible) : assourdie 2 tours", async () => {
        const result = await play("FQelemExtreme403", world({effects: ["Burn", "Frost"]}));

        expectCondition(result, "deafened", 2);
    });
});

describe("Les nouvelles cartes", () => {

    test("Berceuse, un 4 sur 1d4 : inconsciente 1 tour, et réveillée au premier dégât", async () => {
        const result = await play("FqIllusLullaby01", world(), dice(4, 4));

        const effect = expectCondition(result, "unconscious", 1);
        expect(effect.flags[MODULE].expireOnDamage).toBe(true);
        // Aucun dégât : la berceuse endort, elle ne blesse pas.
        expect(result.hpCalls).toEqual([]);
    });

    test("Berceuse, un 3 sur 1d4 : rien", async () => {
        const result = await play("FqIllusLullaby01", world(), dice(4, 3));

        expect(result.threw).toBe(false);
        expect(withStatus(result, "unconscious")).toEqual([]);
    });

    test("Regard envoûtant : charmée 2 tours", async () => {
        const result = await play("FqIllusCharmGaze");

        expectCondition(result, "charmed", 2);
        expect(result.hpCalls).toEqual([]);
    });

    test("Brèche : une attaque d'arme, puis « Garde brisée » (2 tours au plus), consommée au prochain jet reçu", async () => {
        const result = await play("FqGuardBreach001", world({target: {system: {attributes: {ac: {value: 10}}}}}),
            dice(20, 1, 15, 1));

        const effect = expectCondition(result, "fqExposed", 2);
        expect(effect.flags[MODULE].expireOnAttack).toBe("received");
        expect(effect.name).toBe("Broken Guard");
        expect(result.hpCalls.some(call => call.type === "damageFQ")).toBe(true);
    });

    test("Brèche : l'ancienne brèche est consommée AVANT que la nouvelle ne soit posée", async () => {
        const result = await play("FqGuardBreach001", world({target: {system: {attributes: {ac: {value: 10}}}}}),
            dice(20, 1, 15, 1));

        const {socket} = await import("../../src/hook/integration/socketlib.hook.js");
        const calls = socket.executeAsGM.mock.calls.map(call => call[0]);
        const consumed = calls.indexOf("consumeAttackEffects");
        const posed = calls.findIndex((name, index) => name === "addEffectForTarget"
            && (socket.executeAsGM.mock.calls[index][1].statuses ?? []).includes("fqExposed"));
        expect(consumed).toBeGreaterThan(-1);
        expect(posed).toBeGreaterThan(consumed);
        expect(socket.executeAsGM.mock.calls[consumed].slice(1))
            .toEqual(["world-my-token", [worldFixture.target.tokenId]]);
        expect(result.threw).toBe(false);
    });

    test("une carte SANS jet d'attaque ne consomme rien", async () => {
        await play("FqIllusCharmGaze");

        const {socket} = await import("../../src/hook/integration/socketlib.hook.js");
        expect(socket.executeAsGM.mock.calls.map(call => call[0])).not.toContain("consumeAttackEffects");
    });
});
