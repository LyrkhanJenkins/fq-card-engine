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

const {playChoice} = await import("./play-harness.js");
const {mockSelectionVeil} = await import("./corpus-helpers.js");

/**
 * Récupération de cartes de la défausse vers la main (`retrieveFromDiscard`),
 * jouée via le VRAI `playValidatedCard`, en deux modes — la carte jouée étant
 * toujours exclue. Mode `*N` (`*` seul = 1) : toute la pile est éligible, plus de
 * N éligibles → voile de sélection (`CardSelection.openSelectionVeil`, celui de
 * tous les choix de cartes) où le joueur en retient N, exactement N → récupération
 * automatique sans voile, moins de N → carte INJOUABLE
 * (`WarningMsgNoRetrievableCard` si la pile est vide, sinon
 * `WarningMsgNotEnoughPileCards`), coûts non prélevés.
 * Mode liste (noms séparés par des virgules) : TOUTES les cartes listées sont
 * récupérées sans voile (un nom en double exige deux exemplaires distincts) ;
 * un nom sans correspondance → injouable (`WarningMsgMissingRetrievableCards`,
 * aucun transfert). Les cartes sont DÉPLACÉES (`pile.pass(main)`) face visible
 * (même défaussées face cachée) et horodatées `generatedAt` (halo vert).
 */

/**
 * Construit une carte de main minimale dont l'unique choix récupère `spec`.
 * Elle coûte une action : un refus de lançabilité se prouve alors par l'absence
 * de mise à jour de l'acteur (`result.updates`), rien n'ayant été prélevé.
 *
 * @param {string} spec - La spécification (`*`, `?N`, ou liste de noms séparés par des virgules).
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeRetrieverCard(spec) {
    return {
        _id: "retriever-card",
        name: "FQCARDTITLE.Retriever",
        face: 0,
        system: {fq: {choices: [{retrieveFromDiscard: spec, action: "-1", bonusCrit: "0", bonusEva: "0"}]}}
    };
}

/**
 * Construit une carte minimale de pile de défausse.
 *
 * @param {string}      id   - L'id de la carte.
 * @param {string}      name - Le nom (clé i18n) de la carte.
 * @param {number|null} [face=0] - La face courante (null = défaussée face cachée).
 * @param {object|null} [origin=null] - Le stack d'origine résolu (ex. `{type: "deck"}` ou `{type: "hand"}`).
 *
 * @returns {object} La carte de pile.
 */
function pileCard(id, name, face = 0, origin = null) {
    return {id, name, face, origin, faces: [{img: `images/${id}.png`}]};
}

describe("retrieveFromDiscard — récupération d'une carte de la défausse vers la main", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Les espions du voile posés par un test (ou par le harnais) ne doivent pas
        // suivre au suivant : chaque test repart du comportement par défaut.
        vi.restoreAllMocks();
    });

    test("'*' avec plusieurs cartes : voile de choix, la carte choisie est déplacée vers la main (face visible + halo)", async () => {
        const veil = mockSelectionVeil("p2");
        const cards = [pileCard("p1", "FQCARDTITLE.A"), pileCard("p2", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).toHaveBeenCalledTimes(1);
        // Le voile propose bien toutes les cartes éligibles, une seule à retenir
        const [proposed, count] = veil.mock.calls[0];
        expect(proposed.map(c => c.id)).toEqual(["p1", "p2"]);
        expect(count).toBe(1);

        expect(result.retrieveCalls).toHaveLength(1);
        const [dest, ids, opts] = result.retrieveCalls[0];
        expect(dest).toBe(result.card.parent); // la main de la carte jouée
        expect(ids).toEqual(["p2"]);
        expect(opts.updateData.face).toBe(0);
        // L'horodatage qui pilote le halo vert temporaire dans la main
        expect(typeof opts.updateData.flags["fq-card-engine"].generatedAt).toBe("number");
        // La carte jouée part bien à la défausse
        expect(result.passCalls).toHaveLength(1);
    });

    test("une seule carte éligible : récupération automatique, aucun voile", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [pileCard("p1", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        expect(result.retrieveCalls).toHaveLength(1);
        expect(result.retrieveCalls[0][1]).toEqual(["p1"]);
    });

    test("liste de noms : TOUTES les cartes listées sont récupérées, sans voile", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [
            pileCard("pA", "FQCARDTITLE.A"),
            pileCard("pB", "FQCARDTITLE.B"),
            pileCard("pC", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A, FQCARDTITLE.C"), 0,
            {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        expect(result.retrieveCalls).toHaveLength(2);
        expect(result.retrieveCalls.map(call => call[1])).toEqual([["pA"], ["pC"]]);
        // Chaque transfert porte face visible + horodatage du halo
        for (const call of result.retrieveCalls) {
            expect(call[2].updateData.face).toBe(0);
            expect(typeof call[2].updateData.flags["fq-card-engine"].generatedAt).toBe("number");
        }
        expect(result.passCalls).toHaveLength(1);
    });

    test("nom en double dans la liste : deux exemplaires distincts sont récupérés", async () => {
        const cards = [
            pileCard("p1", "FQCARDTITLE.A"),
            pileCard("p2", "FQCARDTITLE.A"),
            pileCard("p3", "FQCARDTITLE.B")
        ];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A,FQCARDTITLE.A"), 0,
            {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls.map(call => call[1])).toEqual([["p1"], ["p2"]]);
    });

    test("liste partiellement satisfaite : carte injouable (avertissement avec les noms manquants)", async () => {
        const cards = [pileCard("pA", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A,FQCARDTITLE.B"), 0,
            {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgMissingRetrievableCards"))).toBe(true);
    });

    test("nom en double mais un seul exemplaire dans la pile : carte injouable", async () => {
        const cards = [pileCard("p1", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A,FQCARDTITLE.A"), 0,
            {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgMissingRetrievableCards"))).toBe(true);
    });

    test("défausse vide : carte injouable (avertissement, aucun transfert ni jeu)", async () => {
        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards: []}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRetrievableCard"))).toBe(true);
    });

    test("aucune carte de la liste dans la défausse : carte injouable", async () => {
        const cards = [pileCard("pB", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgMissingRetrievableCards"))).toBe(true);
    });

    test("la carte jouée elle-même ne compte pas : seule dans la pile → injouable", async () => {
        const cards = [pileCard("retriever-card", "FQCARDTITLE.Retriever")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRetrievableCard"))).toBe(true);
    });

    test("voile annulé sans choix : aucune récupération, le jeu de la carte continue", async () => {
        mockSelectionVeil(null);
        const cards = [pileCard("p1", "FQCARDTITLE.A"), pileCard("p2", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(1);
    });

    test("'*2' : le voile fait retenir DEUX cartes, toutes deux reviennent en main", async () => {
        const veil = mockSelectionVeil(["p1", "p3"]);
        const cards = [
            pileCard("p1", "FQCARDTITLE.A"),
            pileCard("p2", "FQCARDTITLE.B"),
            pileCard("p3", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).toHaveBeenCalledTimes(1);
        // Tout le vivier est proposé, et le voile en réclame exactement deux.
        const [proposed, count] = veil.mock.calls[0];
        expect(proposed.map(c => c.id)).toEqual(["p1", "p2", "p3"]);
        expect(count).toBe(2);

        expect(result.retrieveCalls.map(call => call[1])).toEqual([["p1"], ["p3"]]);
        expect(result.passCalls).toHaveLength(1);
    });

    test("'*2' avec exactement deux éligibles : les deux sont prises d'office, sans voile", async () => {
        const veil = mockSelectionVeil("jamais");
        const cards = [pileCard("p1", "FQCARDTITLE.A"), pileCard("p2", "FQCARDTITLE.B")];

        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
        expect(result.retrieveCalls.map(call => call[1])).toEqual([["p1"], ["p2"]]);
    });

    test("'*2' avec une seule carte en défausse : carte INJOUABLE, aucun coût prélevé", async () => {
        const cards = [pileCard("p1", "FQCARDTITLE.A")];

        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        // Ni transfert de la carte jouée, ni consommation d'action : le garde a refusé.
        expect(result.passCalls).toHaveLength(0);
        expect(result.updates).toEqual([]);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNotEnoughPileCards"))).toBe(true);
    });

    test("'*2' sur une défausse vide : carte injouable, avertissement générique", async () => {
        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards: []}}});

        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.updates).toEqual([]);
        // Pile vide : le manque chiffré n'apprendrait rien de plus.
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoRetrievableCard"))).toBe(true);
    });

    test("'*2' : la carte jouée ne compte pas dans le vivier", async () => {
        const cards = [
            pileCard("retriever-card", "FQCARDTITLE.Retriever"),
            pileCard("p1", "FQCARDTITLE.A")
        ];

        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards}}});

        // Une seule carte réellement éligible : en retenir deux est impossible.
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNotEnoughPileCards"))).toBe(true);
    });

    test("'*2' : voile annulé, aucune récupération, le jeu de la carte continue", async () => {
        mockSelectionVeil(null);
        const cards = [
            pileCard("p1", "FQCARDTITLE.A"),
            pileCard("p2", "FQCARDTITLE.B"),
            pileCard("p3", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeRetrieverCard("*2"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.passCalls).toHaveLength(1);
    });

    test("carte défaussée face cachée : éligible et récupérée face visible", async () => {
        const cards = [pileCard("p1", "FQCARDTITLE.A", null)];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(1);
        expect(result.retrieveCalls[0][2].updateData.face).toBe(0);
    });

    test("carte récupérée sans deck d'origine (générée) : origin remis à null dans la main", async () => {
        // Cards#pass estampille `origin = la main` sur les cartes générées lors de leur
        // défausse ; sans normalisation, la carte revenue en main serait `isHome`
        // (origin === parent) et sa prochaine défausse la dupliquerait (doublon d'id).
        const cards = [pileCard("p1", "FQCARDTITLE.A", 0, {type: "hand"})];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(1);
        expect(result.handCardUpdates).toHaveLength(1);
        expect(result.handCardUpdates[0][0]).toBe("Card");
        expect(result.handCardUpdates[0][1]).toEqual([{_id: "p1", origin: null}]);
    });

    test("carte récupérée issue d'un vrai deck : origin conservé (aucune normalisation)", async () => {
        const cards = [pileCard("p1", "FQCARDTITLE.A", 0, {type: "deck"})];

        const result = await playChoice(makeRetrieverCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(1);
        expect(result.handCardUpdates).toHaveLength(0);
    });

    test("liste mixte : seules les cartes sans deck d'origine sont normalisées", async () => {
        const cards = [
            pileCard("pA", "FQCARDTITLE.A", 0, {type: "deck"}),
            pileCard("pB", "FQCARDTITLE.B", 0, null)
        ];

        const result = await playChoice(makeRetrieverCard("FQCARDTITLE.A,FQCARDTITLE.B"), 0,
            {world: {discardPile: {cards}}});

        expect(result.retrieveCalls).toHaveLength(2);
        expect(result.handCardUpdates).toHaveLength(1);
        expect(result.handCardUpdates[0][1]).toEqual([{_id: "pB", origin: null}]);
    });

    test("une carte sans retrieveFromDiscard ne touche pas à la pile", async () => {
        const card = {
            _id: "plain-card",
            name: "FQCARDTITLE.Plain",
            face: 0,
            system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
        };

        const result = await playChoice(card, 0, {
            world: {discardPile: {cards: [pileCard("p1", "FQCARDTITLE.A")]}},
            dice: [{faces: 4, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.retrieveCalls).toHaveLength(0);
    });
});
