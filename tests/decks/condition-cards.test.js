import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";
import {conditionCard} from "./card-fixtures.js";

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

const {playChoice} = await import("./play-harness.js");
const {DECKS_DIR, installMacroStub} = await import("./corpus-helpers.js");
installMacroStub();
const {OriginFQEffectLabel} = await import("../../src/domain/constants.js");
const {DND5E_CONDITIONS} = await import("../../src/domain/conditions.js");

/**
 * Les conditions dnd5e posées par le vrai pipeline (`playChoice`), exercées PAR
 * FONCTIONNALITÉ et non carte par carte.
 *
 * Ce fichier sélectionnait ses cartes par identifiant (`gdIronChain00001`, …).
 * C'était la seule exception du dossier — `resources-targeting`, `sweep` et
 * `description-formula-guards` découvrent leurs cas par glob et par propriété —
 * et c'est cette exception qui a cassé quand les classes étendues sont parties
 * dans `fq-card-engine-extended` : six conditions n'étaient plus posées par
 * aucune carte livrée ici.
 *
 * Poser une condition est le travail du MOTEUR ; le contenu n'est que le
 * déclencheur. La couverture porte donc sur `DND5E_CONDITIONS`, la liste que le
 * moteur déclare connaître : elle reste juste quel que soit le contenu installé,
 * et une condition ajoutée au moteur est exercée sans toucher à ce fichier. Les
 * cartes sont fabriquées par `card-fixtures.js` ; le pipeline, lui, est le vrai.
 *
 * Ce qu'un test par carte vérifiait en plus — prérequis de bouclier, sauvegarde
 * de la cible, valeurs de `changes`, messages propres à une carte — appartient au
 * module qui livre cette carte.
 */

/** Toutes les cartes des paquets pattern livrés, par id. */
const CARDS = new Map(fs.readdirSync(DECKS_DIR)
    .filter(file => file.endsWith(".json"))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8")).cards ?? [])
    .map(card => [card._id, card]));

/**
 * De quoi payer la carte : le personnage de la fixture n'a ni zèle ni plus de
 * 10 PA, et une carte qu'il ne peut pas payer est refusée AVANT de rien poser —
 * le test mesurerait alors le garde-fou des ressources, pas la condition.
 */
const WEALTHY = {fq: {action: {value: 20, max: 20}, zeal: {value: 8, max: 8}, mana: {value: 10, max: 10}}};

/**
 * Le monde de base : un lanceur qui peut payer, la cible de la fixture.
 *
 * @returns {object} Les surcharges `world`.
 */
const world = () => ({character: {system: WEALTHY}});

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
 * @param {string} turns  - La durée attendue, en rounds.
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
 * Joue une carte fabriquée.
 *
 * @param {object} card - La carte (voir `card-fixtures.js`).
 *
 * @returns {Promise<object>} Le résultat de `playChoice`.
 */
async function play(card) {
    vi.clearAllMocks();
    return playChoice(card, 0, {world: world()});
}

const CONDITIONS = Object.keys(DND5E_CONDITIONS);

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    delete globalThis.CONFIG.statusEffects;
});

describe("Le moteur pose chaque condition dnd5e qu'il déclare connaître", () => {

    test("le moteur déclare des conditions (garde-fou anti-liste-vide)", () => {
        expect(CONDITIONS.length).toBeGreaterThan(0);
    });

    test.each(CONDITIONS)("%s est posée sur la cible, avec sa durée et l'origine FQ", async status => {
        expectCondition(await play(conditionCard(status)), status, 1);
    });

    test.each(CONDITIONS)("%s respecte la durée saisie sur la carte", async status => {
        expectCondition(await play(conditionCard(status, {rounds: 3})), status, 3);
    });

    test("une condition marquée « sur soi » va sur le lanceur, pas sur la cible", async () => {
        const [status] = CONDITIONS;
        const result = await play(conditionCard(status, {onSelf: true}));

        expect(result.threw, result.error?.message).toBe(false);
        // Posée sur le lanceur : elle passe par les effets du personnage, non par
        // ceux que le MJ applique aux cibles.
        expect(result.activeEffectCalls.length).toBeGreaterThan(0);
        expect(withStatus(result, status)).toHaveLength(1);
    });

    test("aucune condition n'est posée quand l'effet ne se déclenche pas", async () => {
        const [status] = CONDITIONS;
        const card = conditionCard(status);
        // La formule vaut 1 : un effet attendu sur le résultat 2 ne se déclenche pas.
        card.system.fq.choices[0].applyEffectsFormulas[0].effects[0].result = "2";

        const result = await play(card);

        expect(result.threw, result.error?.message).toBe(false);
        expect(withStatus(result, status)).toEqual([]);
    });
});

describe("Le chat explique la condition posée", () => {

    /**
     * Le texte de tous les messages de chat de la partie.
     *
     * @param {object} result - Le résultat de `playChoice`.
     *
     * @returns {string} Le contenu concaténé.
     */
    const chatOf = result => result.chatMessages.map(message => String(message.content ?? "")).join("\n");

    test.each(CONDITIONS)("%s : le chat nomme la condition, sa durée et sa règle", async status => {
        const chat = chatOf(await play(conditionCard(status, {rounds: 2})));

        expect(chat).toContain("FQCARDENGINE.CardMsgConditionAppliedFor");
        expect(chat).toContain(DND5E_CONDITIONS[status]);
        expect(chat).toMatch(/"turns":2/);
    });

    test("le vieux message générique, avec le nom anglais de la condition, a disparu", async () => {
        const [status] = CONDITIONS;
        const chat = chatOf(await play(conditionCard(status)));

        const english = status.charAt(0).toUpperCase() + status.slice(1);
        expect(chat).not.toContain(`"effectName":"${english}"`);
    });

    test("aucune carte des paquets ne garde de message générique pour une condition", () => {
        // Balayage du corpus livré : celui-ci ne dépend d'aucune carte nommée et
        // reste valable quel que soit le contenu installé.
        const names = ["Restrained", "Petrified", "Paralyzed", "Stunned", "Blinded", "Prone", "Grappled", "Poisoned",
            "Frightened", "Invisible", "Incapacitated", "Deafened", "Unconscious", "Charmed", "Broken Guard"];
        const leftovers = [...CARDS.values()].flatMap(card => card.system.fq.choices
            .flatMap(choice => (choice.applyEffectsFormulas ?? []).flatMap(formula => formula.effects))
            .flatMap(effect => effect.messages ?? [])
            .filter(message => names.includes(JSON.parse(message.arg || "{}").effectName))
            .map(message => `${card._id} : ${message.arg}`));

        expect(leftovers).toEqual([]);
    });
});
