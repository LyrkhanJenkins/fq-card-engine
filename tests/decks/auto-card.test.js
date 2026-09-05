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

const {playChoice, mountWorld, ensureEngineLoaded} = await import("./play-harness.js");
const {installDeterministicRoll} = await import("./deterministic-roll.js");
const {default: AutoCard} = await import("../../src/domain/engine/auto-card.js");
const {default: TradingCards, HAND_TYPE} = await import("../../src/domain/trading/trading-cards.js");

/**
 * CARTE AUTOMATIQUE (`replayable: "auto"`) — la carte s'installe, reste en main
 * comme un passif, puis le moteur la rejoue seul au début de chaque tour de son
 * porteur en repayant son coût. Le tour où ce coût n'est plus payable, elle
 * rejoint la défausse.
 *
 * Deux niveaux : le JEU d'une carte automatique passe par le VRAI
 * `playValidatedCard` (comme toutes les cartes du dépôt), et l'ORCHESTRATION de
 * début de tour est pilotée directement sur `AutoCard.playTurnAutoCards`, la
 * façade de jeu étant alors espionnée pour caractériser la décision (rejouer /
 * défausser / ne rien faire) sans rejouer tout le pipeline.
 *
 * Les cartes automatiques du dépôt sont aujourd'hui les auras du Mage Blanc —
 * « aura » est le nom de ces cartes, pas celui de la mécanique.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const worldFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8"));

/**
 * Charge une carte du dépôt par son nom (clé i18n), depuis un deck pattern.
 *
 * @param {string} deckFile - Le nom de fichier du deck.
 * @param {string} cardName - La clé i18n du nom de la carte.
 *
 * @returns {object} L'entrée carte brute.
 */
function loadRawCard(deckFile, cardName) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
    const card = deck.cards.find(c => c.name === cardName);
    if (!card) {
        throw new Error(`carte introuvable : ${cardName} dans ${deckFile}`);
    }
    return card;
}

/**
 * Surcharges de monde donnant un combat actif dont les deux tokens de la scène
 * sont combattants : un choix à ciblage « Combat » y trouve son allié (le
 * lanceur) comme son ennemi (le token cible, de disposition opposée).
 *
 * @returns {object} Les surcharges `world` à transmettre à `playChoice`.
 */
function combatWorld() {
    return {
        character: {system: {abilities: {int: {mod: 6}, wis: {mod: 4}}}},
        canvas: {
            scene: {
                grid: {distance: 1, size: worldFixture.gridSize},
                tokens: [
                    {
                        id: "auto-my-token",
                        actorId: worldFixture.character.id,
                        name: worldFixture.character.name,
                        disposition: 1,
                        x: worldFixture.myToken.x, y: worldFixture.myToken.y,
                        width: worldFixture.myToken.width, height: worldFixture.myToken.height,
                        object: {
                            id: "auto-my-object-token",
                            actor: {_id: worldFixture.character.id, id: worldFixture.character.id},
                            document: {name: worldFixture.character.name, actorId: worldFixture.character.id}
                        }
                    },
                    {
                        id: worldFixture.target.tokenId,
                        actorId: worldFixture.target.actorId,
                        name: worldFixture.target.name,
                        disposition: -1,
                        x: worldFixture.target.x, y: worldFixture.target.y,
                        width: worldFixture.target.width, height: worldFixture.target.height,
                        object: {id: worldFixture.target.tokenId, name: worldFixture.target.name}
                    }
                ]
            }
        },
        combat: {
            round: 2,
            combatant: {actor: {id: worldFixture.character.id}},
            combatants: [{tokenId: "auto-my-token"}, {tokenId: worldFixture.target.tokenId}],
            flags: {fq: {logs: []}}
        }
    };
}

/**
 * Carte automatique synthétique : un unique choix `auto` au coût de mana
 * demandé, sans ciblage ni effet — l'orchestration de début de tour n'a besoin
 * que du marqueur `replayable` et du coût.
 *
 * @param {string} [mana="-1"] - Le coût en mana du choix.
 *
 * @returns {object} La carte, sous la forme attendue par `AutoCard.playTurnAutoCards`.
 */
function fakeAutoCard(mana = "-1") {
    return {
        id: "auto-card",
        name: "FQCARDTITLE.LifeAura",
        system: {fq: {choices: [{name: "", mana, replayable: "auto"}]}}
    };
}

/**
 * Monte un monde de combat et branche la main et la pile de défausse du porteur
 * sur les cartes fournies, comme les résoudrait `TradingCards.getFirstDeck`.
 *
 * @param {object[]} handCards - Les cartes de la main du porteur.
 * @param {object}   [overrides] - Surcharges de monde supplémentaires.
 *
 * @returns {{hand: object, pile: object, playSpy: import("vitest").Mock}} La main, la pile et l'espion de jeu.
 */
function mountAutoTurn(handCards, overrides = {}) {
    mountWorld({...combatWorld(), ...overrides});
    installDeterministicRoll();

    const hand = {id: "auto-hand", cards: handCards, pass: vi.fn().mockResolvedValue([])};
    const pile = {id: "auto-pile"};
    vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, type) => type === HAND_TYPE ? hand : pile);

    const playSpy = vi.fn().mockResolvedValue(null);
    globalThis.FqCardEngineModule.playValidatedCard = playSpy;

    return {hand, pile, playSpy};
}

describe("Carte automatique — le jeu d'un choix `replayable: \"auto\"` (pipeline réel)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    test("FQCARDTITLE.LifeAura reste en main, marque le round et annonce le rejeu automatique", async () => {
        const lifeAura = loadRawCard("white-mage-base.json", "FQCARDTITLE.LifeAura");

        const result = await playChoice(lifeAura, 0, {world: combatWorld()});

        expect(result.threw).toBe(false);
        // Ni défausse ni destruction : la carte vit en main comme un passif.
        expect(result.passCalls).toHaveLength(0);
        expect(result.handDestroyCalls).toHaveLength(0);
        // Marquage du round joué (réécriture du contenu de la carte).
        expect(result.card.update).toHaveBeenCalled();
        const chat = result.chatMessages.map(message => message.content).join("\n");
        expect(chat).toContain("FQCARDENGINE.InfoMsgAutoSpell");
        expect(chat).not.toContain("FQCARDENGINE.InfoMsgPassiveSpell");
    });

    test("FQCARDTITLE.LifeAura soigne le lanceur et ses alliés du combat", async () => {
        const lifeAura = loadRawCard("white-mage-base.json", "FQCARDTITLE.LifeAura");

        const result = await playChoice(lifeAura, 0, {world: combatWorld()});

        expect(result.threw).toBe(false);
        expect(result.hpCalls.length).toBeGreaterThan(0);
        for (const hpCall of result.hpCalls) {
            expect(hpCall.type).toBe("healFQ");
            expect(Number.isFinite(hpCall.value)).toBe(true);
        }
    });
});

describe("Carte automatique — rejeu au début du tour du porteur", () => {
    beforeEach(async () => {
        await ensureEngineLoaded();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    test("rejoue chaque carte automatique de la main quand le porteur peut payer", async () => {
        const autoCard = fakeAutoCard("-1");
        const {hand, playSpy} = mountAutoTurn([autoCard]);

        await AutoCard.playTurnAutoCards();

        expect(playSpy).toHaveBeenCalledTimes(1);
        const [, , cardContent, ctx] = playSpy.mock.calls[0];
        expect(cardContent.replayable).toBe("auto");
        expect(ctx.card).toBe(autoCard);
        expect(hand.pass).not.toHaveBeenCalled();
    });

    test("ne touche pas aux cartes sans choix automatique", async () => {
        const plainCard = {id: "plain", name: "FQCARDTITLE.Heal", system: {fq: {choices: [{mana: "-1", replayable: ""}]}}};
        const {hand, playSpy} = mountAutoTurn([plainCard]);

        await AutoCard.playTurnAutoCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(hand.pass).not.toHaveBeenCalled();
    });

    test("envoie la carte à la défausse quand le coût n'est plus payable", async () => {
        const autoCard = fakeAutoCard("-1");
        const {hand, pile, playSpy} = mountAutoTurn([autoCard], {
            character: {system: {fq: {mana: {value: 0, max: 10}}}}
        });

        await AutoCard.playTurnAutoCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(hand.pass).toHaveBeenCalledTimes(1);
        const [to, ids] = hand.pass.mock.calls[0];
        expect(to).toBe(pile);
        expect(ids).toEqual([autoCard.id]);
    });

    test("ne fait rien quand ce n'est pas le tour du porteur", async () => {
        const autoCard = fakeAutoCard("-1");
        const {hand, playSpy} = mountAutoTurn([autoCard], {
            combat: {
                round: 2,
                combatant: {actor: {id: "someone-else"}},
                combatants: [],
                flags: {fq: {logs: []}}
            }
        });

        await AutoCard.playTurnAutoCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(hand.pass).not.toHaveBeenCalled();
    });

    test("ne fait rien hors combat", async () => {
        const autoCard = fakeAutoCard("-1");
        const {hand, playSpy} = mountAutoTurn([autoCard], {combat: null});

        await AutoCard.playTurnAutoCards();

        expect(playSpy).not.toHaveBeenCalled();
        expect(hand.pass).not.toHaveBeenCalled();
    });
});
