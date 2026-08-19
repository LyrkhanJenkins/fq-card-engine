import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock hissé PAR FICHIER) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice} = await import("./play-harness.js");
const {default: CardSelection} = await import("../../src/domain/interface/window/card-selection.js");

/**
 * Encart « proposer des cartes » (`chooseCards*`), joué via le VRAI
 * `playValidatedCard` : quand le choix joué porte une source (liste de
 * références ou deck de compendium), le voile de sélection s'ouvre en mode NON
 * annulable après application des effets, et les cartes validées arrivent dans
 * la défausse cible en copies « générées » (sans deck d'origine — donc
 * supprimées par le nettoyage de combat) ; vivier vide → simple avertissement
 * de chat, le jeu de la carte n'est pas bloqué. Le voile lui-même est stubbé
 * (DOM → UAT visuel Foundry).
 */

const PROPOSED_A = {
    _id: "proposed-a",
    name: "FQCARDTITLE.ProposedA",
    face: 0,
    system: {fq: {level: 1, choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
};
const PROPOSED_B = {...PROPOSED_A, _id: "proposed-b", name: "FQCARDTITLE.ProposedB"};

/**
 * Monte un mock `game.packs` contenant un unique pack avec un deck proposable.
 *
 * @returns {object} L'override `packs` à passer à `playChoice` via `opts.world`.
 */
function makePacks() {
    const deck = {
        name: "Proposed deck",
        cards: [PROPOSED_A, PROPOSED_B].map(data => ({
            name: data.name,
            system: data.system,
            toObject: () => JSON.parse(JSON.stringify(data))
        }))
    };
    const pack = {
        metadata: {name: "decks-pattern-fq8"},
        collection: "fq-card-engine.decks-pattern-fq8",
        getDocuments: vi.fn(async () => [deck])
    };
    return {
        get: vi.fn(key => (key === pack.collection ? pack : undefined)),
        find: vi.fn(predicate => [pack].find(predicate))
    };
}

/**
 * Construit une carte de main minimale dont l'unique choix porte l'encart.
 *
 * @param {object} fields - Les champs `chooseCards*` du choix.
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeChooserCard(fields) {
    return {
        _id: "chooser-card",
        name: "FQCARDTITLE.Chooser",
        face: 0,
        system: {fq: {choices: [{bonusCrit: "0", bonusEva: "0", ...fields}]}}
    };
}

describe("chooseCards* — proposition de cartes au jeu de la carte", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("mode liste : le voile s'ouvre non annulable et les cartes validées arrivent en défausse sans origine", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);
        const card = makeChooserCard({
            chooseCardsList: "decks-pattern-fq8.Proposed deck.FQCARDTITLE.ProposedA," +
                "decks-pattern-fq8.Proposed deck.FQCARDTITLE.ProposedB",
            chooseCardsCount: "1"
        });

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(veil).toHaveBeenCalledTimes(1);
        expect(veil.mock.calls[0][1]).toBe(1);
        expect(veil.mock.calls[0][2]).toEqual({cancellable: false});
        const [embeddedName, [data]] = result.discardPile.createEmbeddedDocuments.mock.calls[0];
        expect(embeddedName).toBe("Card");
        // Le vivier est mélangé avant proposition : la carte créée est l'une des deux proposées.
        expect(["FQCARDTITLE.ProposedA", "FQCARDTITLE.ProposedB"]).toContain(data.name);
        expect(data._id).toBeUndefined();
        expect(data.drawn).toBe(false);
        expect(data.origin).toBeNull();
        expect(typeof data.flags["fq-card-engine"].generatedAt).toBe("number");
        // Marqueur durable : recyclage en deck épuisé + destruction au nettoyage de combat
        expect(data.flags["fq-card-engine"].generated).toBe(true);
        // Le jeu annonce les cartes ajoutées à la défausse dans le chat
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.InfoMsgCardsAddedToDiscard"))).toBe(true);
        // Aucun message vide : displayResult ne publie rien sans résultat ni message manuel
        expect(result.chatMessages.some(m => m.content === "<div class=\"fq-card-engine-result\"></div>")).toBe(false);
    });

    test("mode deck : source + niveaux résolus depuis le compendium, nb proposées respecté", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);
        const card = makeChooserCard({
            chooseCardsFrom: "fq-card-engine.decks-pattern-fq8.Proposed deck",
            chooseCardsLevels: "1",
            chooseCardsProposed: "2",
            chooseCardsCount: "1"
        });

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        const [candidates] = veil.mock.calls[0];
        expect(candidates.map(c => c.name).sort()).toEqual(["FQCARDTITLE.ProposedA", "FQCARDTITLE.ProposedB"]);
        expect(result.discardPile.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    });

    test("vivier vide (référence irrésoluble) : avertissements de chat, pas de voile, le jeu continue", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");
        const card = makeChooserCard({
            chooseCardsList: "pack-inconnu.Deck.Carte",
            chooseCardsCount: "1"
        });

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        expect(result.discardPile.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgChooseCardsNoCandidates"))).toBe(true);
        // La carte jouée part bien à la défausse malgré l'absence de vivier
        expect(result.passCalls).toHaveLength(1);
    });

    test("une carte sans encart n'ouvre jamais le voile", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");
        const card = makeChooserCard({damage: "1d4"});

        const result = await playChoice(card, 0, {
            world: {packs: makePacks()},
            dice: [{faces: 4, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
    });
});
