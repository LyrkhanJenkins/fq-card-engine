import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";
import {basicCard} from "./card-fixtures.js";

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
const {DECKS_DIR, worldFixture} = await import("./corpus-helpers.js");

/**
 * IDENTITÉ DE LA CARTE JOUÉE — deux cartes du dépôt dépendent de ce que le
 * journal de combat retient : l'Embuscade se reconnaît elle-même par son NOM
 * DE CARTE, l'Intervention lit les derniers dégâts de SA CIBLE. Le journal ne
 * portant que le CHOIX joué, ni l'une ni l'autre ne peut se contenter de
 * `cardContent`. Les deux sont jouées par le vrai `playValidatedCard`.
 */

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Charge une carte du dépôt par son nom (clé i18n).
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
 * Entrée de journal : un tiers inflige `value` dégâts FQ au token donné.
 *
 * @param {object} options                - La forme de l'entrée.
 * @param {string} options.targetActorId  - L'acteur blessé.
 * @param {string} options.targetTokenId  - Le token blessé.
 * @param {number} options.value          - Les dégâts encaissés.
 *
 * @returns {object} L'entrée de journal.
 */
function damageLog({targetActorId, targetTokenId, value}) {
    return {
        actorId: "someone-else",
        targetsId: [targetActorId],
        round: 2,
        turn: 0,
        cardName: null,
        cardContent: {},
        resultArray: {0: {type: "damageFQ", value, targetTokenId}}
    };
}

/**
 * Monde du tour d'un AUTRE combattant, avec le journal demandé.
 *
 * @param {object[]} logs - Les entrées de journal du combat.
 *
 * @returns {object} Les surcharges `world`.
 */
function otherTurnWithLogs(logs) {
    return {
        combat: {
            round: 2, turn: 0,
            combatant: {actor: {id: worldFixture.target.actorId}},
            combatants: [],
            flags: {fq: {logs}}
        }
    };
}

/**
 * Monde du tour du joueur, avec le journal demandé.
 *
 * @param {object[]} logs - Les entrées de journal du combat.
 *
 * @returns {object} Les surcharges `world`.
 */
function myTurnWithLogs(logs) {
    return {
        combat: {
            round: 2, turn: 0,
            combatant: {actor: {id: worldFixture.character.id}},
            combatants: [{actorId: worldFixture.character.id}],
            flags: {fq: {logs}}
        }
    };
}

describe("Soin indexé sur les dégâts — il suit ceux de la CIBLE, pas les miens", () => {

    // Le journal porte DEUX blessures de valeurs différentes : celle de la cible
    // (7) puis la mienne (3), la mienne en dernier. Un `xvalue` qui retomberait
    // sur le personnage de l'utilisateur soignerait 3.
    test("soigne la cible du montant qu'ELLE a encaissé ce round", async () => {
        // Carte FABRIQUEE portant le mecanisme teste : un `xvalue` SCRIPT qui lit
        // les derniers degats de la CIBLE, reinjecte dans le soin par {XXX}.
        // C'est la resolution du xvalue qui est en jeu, pas la carte Intervention
        // (partie avec le Gardien dans `fq-card-engine-extended`).
        const card = basicCard({
            heal: "XXX",
            xvalue: "SCRIPT:FqCardEngineModule.cst.lastDamageThisTurn(FqCardEngineModule.cst.myTargets()[0])"
        }, {id: "FIXTUREheal", name: "FIXTURE.HealFromTargetDamage"});
        const world = otherTurnWithLogs([
            damageLog({targetActorId: worldFixture.target.actorId, targetTokenId: worldFixture.target.tokenId, value: 7}),
            damageLog({targetActorId: worldFixture.character.id, targetTokenId: worldFixture.myToken.tokenId, value: 3})
        ]);

        const result = await playChoice(card, 0, {world});

        expect(result.threw).toBe(false);
        expect(result.cardContent.heal).toBe("7");
    });
});

describe("Embuscade — se reconnaît elle-même dans le journal", () => {

    const AMBUSH = "FQCARDTITLE.Ambush";

    /**
     * Entrée de journal d'une carte que J'AI jouée ce round.
     *
     * @param {?string} cardName - Le nom de la carte journalisée.
     *
     * @returns {object} L'entrée de journal.
     */
    function myPlayedCard(cardName) {
        return {
            actorId: worldFixture.character.id, targetsId: [], round: 2, turn: 0,
            cardName, cardContent: {}, resultArray: {}
        };
    }

    test("journalise son propre nom de carte", async () => {
        const card = loadRawCard("trapper-base.json", AMBUSH);

        const result = await playChoice(card, 0, {world: myTurnWithLogs([])});

        expect(result.threw).toBe(false);
        expect(result.logCalls[0].cardName).toBe(AMBUSH);
    });

    test("reste jouable après une PREMIÈRE Embuscade du round", async () => {
        const card = loadRawCard("trapper-base.json", AMBUSH);

        const result = await playChoice(card, 0, {world: myTurnWithLogs([myPlayedCard(AMBUSH)])});

        expect(result.threw).toBe(false);
        expect(result.logCalls).toHaveLength(1);
    });

    // Le nom du CHOIX ne doit rien y faire : celui de l'Embuscade est vide, et
    // une carte tierce journalisée sous son propre nom bloque bien la seconde.
    test("reste bloquée après une AUTRE carte du round", async () => {
        const card = loadRawCard("trapper-base.json", AMBUSH);

        const result = await playChoice(card, 0, {world: myTurnWithLogs([myPlayedCard("FQCARDTITLE.SpikeTrap")])});

        expect(result.logCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m?.content ?? "")
            .includes("FQCARDENGINE.CardWarningMsgOnlyThisSpellThisTurn"))).toBe(true);
    });
});
