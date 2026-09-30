import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock hissé PAR FICHIER) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice, makeHandCard} = await import("./play-harness.js");
const {mockSelectionVeil} = await import("./corpus-helpers.js");

/**
 * Récupération d'une carte dans le DECK de combat du joueur
 * (`retrieveFromDeck`), jouée via le VRAI `playValidatedCard` : une pioche
 * CHOISIE plutôt que tirée au hasard. Mode `*` : toute la pioche est éligible,
 * plusieurs éligibles → voile de choix d'UNE carte, une seule → transfert
 * automatique sans voile, aucune → injouable
 * (`WarningMsgNoRetrievableDeckCard`). Mode liste : TOUTES les cartes listées
 * sont récupérées sans voile ; un nom sans correspondance → injouable
 * (`WarningMsgMissingRetrievableDeckCards`). Les cartes DÉJÀ PIOCHÉES
 * (`drawn`) ne sont jamais éligibles : elles sont en main ou en défausse. Le
 * transfert emprunte `Cards#pass` du deck vers la main — aucune copie générée
 * n'est créée.
 */

/**
 * Construit une carte de main minimale dont l'unique choix récupère `spec`
 * dans le deck de combat.
 *
 * @param {string} spec - La spécification (`*` ou liste de noms séparés par des virgules).
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeRetrieverCard(spec) {
    return {
        _id: "deck-retriever-card",
        name: "FQCARDTITLE.DeckRetriever",
        face: 0,
        system: {fq: {choices: [{retrieveFromDeck: spec, bonusCrit: "0", bonusEva: "0"}]}}
    };
}

/**
 * Construit une carte de deck : une carte de main à laquelle on ajoute
 * l'indicateur de pioche que lit la résolution (`drawn`).
 *
 * @param {string}  id      - L'id de la carte.
 * @param {string}  name    - Le nom (clé i18n) de la carte.
 * @param {boolean} [drawn] - True pour une carte déjà piochée (donc inéligible).
 *
 * @returns {object} La carte du deck.
 */
function deckCard(id, name, drawn = false) {
    return {...makeHandCard(id, name), drawn};
}

describe("retrieveFromDeck — récupération d'une carte du deck de combat vers la main", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Les espions du voile posés par un test (ou par le harnais) ne doivent pas
        // suivre au suivant : chaque test repart du comportement par défaut.
        vi.restoreAllMocks();
    });

    test("'*' avec plusieurs cartes : voile de choix, la carte choisie est transférée en main", async () => {
        const veil = mockSelectionVeil("d2");
        const cards = [deckCard("d1", "FQCARDTITLE.A"), deckCard("d2", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).toHaveBeenCalledTimes(1);
        const [proposed, count] = veil.mock.calls[0];
        expect(proposed.map(c => c.id)).toEqual(["d1", "d2"]);
        expect(count).toBe(1);

        expect(result.deckRetrieveCalls).toHaveLength(1);
        const [destination, ids, options] = result.deckRetrieveCalls[0];
        expect(destination).toBe(result.card.parent);
        expect(ids).toEqual(["d2"]);
        expect(options.action).toBe("draw");
        expect(options.updateData.face).toBe(0);
        // Aucune copie générée : la carte est DÉPLACÉE, pas dupliquée.
        expect(result.generatedCards).toHaveLength(0);
        // La carte jouée part bien à la défausse
        expect(result.passCalls).toHaveLength(1);
    });

    test("une seule carte éligible : récupération automatique, aucun voile", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [deckCard("d1", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        expect(result.deckRetrieveCalls).toHaveLength(1);
        expect(result.deckRetrieveCalls[0][1]).toEqual(["d1"]);
    });

    test("les cartes déjà piochées sont hors du vivier : seule celle restée dans la pioche est prise", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [
            deckCard("dDrawn", "FQCARDTITLE.DejaPiochee", true),
            deckCard("dLeft", "FQCARDTITLE.EnPioche")
        ];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards}}});

        expect(veil).not.toHaveBeenCalled();
        expect(result.deckRetrieveCalls).toHaveLength(1);
        expect(result.deckRetrieveCalls[0][1]).toEqual(["dLeft"]);
    });

    test("deck entièrement pioché : carte injouable (avertissement, aucun transfert)", async () => {
        const cards = [deckCard("dDrawn", "FQCARDTITLE.DejaPiochee", true)];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.deckRetrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRetrievableDeckCard"))).toBe(true);
    });

    test("liste de noms : TOUTES les cartes listées sont récupérées, sans voile", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [
            deckCard("dA", "FQCARDTITLE.A"),
            deckCard("dB", "FQCARDTITLE.B"),
            deckCard("dC", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A, FQCARDTITLE.C"), 0,
            {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        // Un transfert par carte : `updateData` est propre à chacune.
        expect(result.deckRetrieveCalls.map(call => call[1])).toEqual([["dA"], ["dC"]]);
    });

    test("liste partiellement satisfaite : carte injouable (avertissement avec les noms manquants)", async () => {
        const cards = [deckCard("dA", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A,FQCARDTITLE.B"), 0,
            {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.deckRetrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgMissingRetrievableDeckCards")))
            .toBe(true);
    });

    test("deck vide : carte injouable (avertissement, aucun transfert)", async () => {
        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards: []}}});

        expect(result.threw).toBe(false);
        expect(result.deckRetrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRetrievableDeckCard"))).toBe(true);
    });

    test("aucun deck de combat pour le joueur : carte injouable, aucune exception", async () => {
        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {cards: []}});

        expect(result.threw).toBe(false);
        expect(result.passCalls).toHaveLength(0);
    });

    test("voile annulé sans choix : aucune récupération, le jeu de la carte continue", async () => {
        mockSelectionVeil(null);
        const cards = [deckCard("d1", "FQCARDTITLE.A"), deckCard("d2", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {deck: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.deckRetrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(1);
    });

    test("une carte sans retrieveFromDeck ne touche pas au deck", async () => {
        const card = {
            _id: "plain-card",
            name: "FQCARDTITLE.Plain",
            face: 0,
            system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
        };

        const result = await playChoice(card, 0, {
            dice: [{faces: 4, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.deckRetrieveCalls).toHaveLength(0);
    });
});
