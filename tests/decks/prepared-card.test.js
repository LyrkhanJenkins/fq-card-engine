import {beforeEach, describe, expect, test, vi} from "vitest";
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

const {mountWorld, ensureEngineLoaded} = await import("./play-harness.js");
const {installDeterministicRoll} = await import("./deterministic-roll.js");
const {default: PreparedCard} = await import("../../src/domain/engine/prepared-card.js");
const {PREPARED_FLAG} = await import("../../src/domain/constants.js");
const {default: TradingCards, HAND_TYPE} = await import("../../src/domain/trading/trading-cards.js");

/**
 * CARTE RÉACTIVE PRÉPARÉE — à son propre tour, un joueur ne peut pas jouer une
 * carte réactive : il l'ARME. Le moteur la joue ensuite seul, hors de son tour,
 * au moment même où le halo orange de la main se serait allumé.
 *
 * Le déclenchement est piloté directement sur `PreparedCard.triggerPreparedCards`,
 * la façade de jeu étant espionnée pour caractériser la décision (déclencher /
 * attendre / désarmer) sans rejouer tout le pipeline — le JEU lui-même est déjà
 * couvert par les tests de deck qui passent par le vrai `playValidatedCard`.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const worldFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8"));

/**
 * Tous les choix réactifs livrés par les decks du dépôt, découverts par balayage.
 *
 * Jamais par nom de carte : les classes livrées par ce module changent selon le
 * découpage public/étendu, et un nom en dur casse à chaque déplacement de contenu.
 *
 * @returns {Array<{deckFile: string, cardName: string, choice: object}>} Les choix réactifs.
 */
function reactiveChoicesFromDecks() {
    const out = [];
    for (const deckFile of fs.readdirSync(DECKS_DIR).filter(name => name.endsWith(".json"))) {
        const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
        for (const card of deck.cards ?? []) {
            for (const choice of card.system?.fq?.choices ?? []) {
                if (choice.reactive) {
                    out.push({deckFile, cardName: card.name, choice});
                }
            }
        }
    }
    return out;
}

/**
 * Surcharges de monde plaçant le combat sur le tour de QUELQU'UN D'AUTRE : la
 * seule situation où une carte préparée peut se déclencher.
 *
 * @param {object} [overrides] - Surcharges du combat (round, combattant, logs).
 *
 * @returns {object} Les surcharges `world` de combat.
 */
function otherTurnWorld(overrides = {}) {
    return {
        combat: {
            round: 2,
            combatant: {actor: {id: worldFixture.target.actorId}},
            combatants: [],
            flags: {fq: {logs: []}},
            ...overrides
        }
    };
}

/**
 * Carte réactive synthétique, armée ou non : un unique choix réactif au coût de
 * mana demandé, sans portée ni effet — le déclenchement n'a besoin que de la
 * réactivité, des conditions et du coût.
 *
 * @param {object}  [options] - La forme de la carte.
 * @param {string}  [options.mana="-1"] - Le coût en mana du choix.
 * @param {object[]} [options.customEvals=[]] - Les conditions du choix.
 * @param {boolean} [options.prepared=true] - Si la carte porte une préparation.
 * @param {object}  [options.fd] - L'instantané de formulaire de la préparation.
 *
 * @returns {object} La carte, sous la forme attendue par `triggerPreparedCards`.
 */
function fakeReactiveCard({mana = "-1", customEvals = [], prepared = true, fd = {}} = {}) {
    const preparation = {fd: {nameContent: "", XXX: 1, YYY: 1, ...fd}, toId: worldFixture.discardPile.id};
    return {
        id: "prepared-card",
        name: "FQCARDTITLE.Riposte",
        flags: prepared ? {"fq-card-engine": {[PREPARED_FLAG]: preparation}} : {},
        system: {fq: {choices: [{name: "", mana, reactive: true, replayable: "", customEvals}]}},
        setFlag: vi.fn().mockResolvedValue(null),
        unsetFlag: vi.fn().mockResolvedValue(null)
    };
}

/**
 * Monte un monde de combat hors du tour du joueur et branche sa main et sa pile
 * de défausse sur les cartes fournies, comme les résoudrait `TradingCards.getFirstDeck`.
 *
 * @param {object[]} handCards  - Les cartes de la main du porteur.
 * @param {object}   [overrides] - Surcharges de monde supplémentaires.
 *
 * @returns {{hand: object, pile: object, playSpy: import("vitest").Mock}} La main, la pile et l'espion de jeu.
 */
function mountPreparedTurn(handCards, overrides = {}) {
    mountWorld({...otherTurnWorld(), ...overrides});
    installDeterministicRoll();

    const hand = {id: "prepared-hand", cards: handCards, pass: vi.fn().mockResolvedValue([])};
    const pile = {id: worldFixture.discardPile.id};
    vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, type) => type === HAND_TYPE ? hand : pile);
    globalThis.game.cards.get = vi.fn(id => id === pile.id ? pile : undefined);

    const playSpy = vi.fn().mockResolvedValue(null);
    globalThis.FqCardEngineModule.playValidatedCard = playSpy;

    return {hand, pile, playSpy};
}

describe("Carte réactive préparée — ce qui peut être armé", () => {
    beforeEach(async () => {
        await ensureEngineLoaded();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    test("au moins un choix réactif du dépôt est préparable", () => {
        // Le dépôt doit livrer de quoi armer une réaction : sans cela la
        // fonctionnalité serait morte pour le joueur, quel que soit le découpage.
        const reactive = reactiveChoicesFromDecks();
        expect(reactive.length).toBeGreaterThan(0);

        const preparable = reactive.filter(entry => PreparedCard.isPreparable(entry.choice));

        expect(preparable.length).toBeGreaterThan(0);
    });

    test("un choix non réactif ne l'est pas", () => {
        expect(PreparedCard.isPreparable({reactive: false})).toBe(false);
    });

    test("un choix réactif à ciblage acquis au jeu (zone, adjacent, combat) ne l'est pas", () => {
        expect(PreparedCard.isPreparable({reactive: true, targetType: "Zone"})).toBe(false);
        expect(PreparedCard.isPreparable({reactive: true, targetType: "Adjacent"})).toBe(false);
        expect(PreparedCard.isPreparable({reactive: true, targetType: "CombatEnemies"})).toBe(false);
    });
});

describe("Carte réactive préparée — déclenchement automatique", () => {
    beforeEach(async () => {
        await ensureEngineLoaded();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    test("joue la carte armée dès que ses conditions sont réunies, avec le choix et les variables préparés", async () => {
        const card = fakeReactiveCard({fd: {XXX: 3}});
        const {hand, pile, playSpy} = mountPreparedTurn([card]);

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).toHaveBeenCalledTimes(1);
        const [to, fd, cardContent, ctx] = playSpy.mock.calls[0];
        expect(to).toBe(pile);
        expect(ctx.currentCards).toBe(hand);
        expect(fd.XXX).toBe(3);
        expect(cardContent.reactive).toBe(true);
        expect(ctx.card).toBe(card);
        // La carte est désarmée AVANT le jeu : elle ne se déclenche qu'une fois.
        expect(card.unsetFlag).toHaveBeenCalledWith("fq-card-engine", PREPARED_FLAG);
    });

    test("ne fait rien pendant le tour du porteur — aucune condition n'y est évaluée", async () => {
        const card = fakeReactiveCard();
        const {playSpy} = mountPreparedTurn([card], {
            combat: {
                round: 2,
                combatant: {actor: {id: worldFixture.character.id}},
                combatants: [],
                flags: {fq: {logs: []}}
            }
        });

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(card.unsetFlag).not.toHaveBeenCalled();
    });

    test("laisse la carte armée tant que ses conditions ne sont pas réunies", async () => {
        const card = fakeReactiveCard({customEvals: [{script: "false", errorMessages: []}]});
        const {playSpy} = mountPreparedTurn([card]);

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(card.unsetFlag).not.toHaveBeenCalled();
    });

    test("laisse la carte armée quand le coût n'est pas payable, sans rien publier", async () => {
        const card = fakeReactiveCard({mana: "-99"});
        const {playSpy} = mountPreparedTurn([card]);
        const messages = [];
        globalThis.ChatMessage.create = vi.fn(message => messages.push(message));

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(card.unsetFlag).not.toHaveBeenCalled();
        expect(messages).toHaveLength(0);
    });

    test("ignore les cartes non armées", async () => {
        const card = fakeReactiveCard({prepared: false});
        const {playSpy} = mountPreparedTurn([card]);

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
    });

    test("désarme une carte dont le choix n'est plus préparable", async () => {
        const card = fakeReactiveCard();
        card.system.fq.choices[0].reactive = false;
        const {playSpy} = mountPreparedTurn([card]);

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(card.unsetFlag).toHaveBeenCalledWith("fq-card-engine", PREPARED_FLAG);
    });

    test("ne déclenche rien hors combat", async () => {
        const card = fakeReactiveCard();
        const {playSpy} = mountPreparedTurn([card], {combat: null});

        await PreparedCard.triggerPreparedCards();

        expect(playSpy).not.toHaveBeenCalled();
    });
});
