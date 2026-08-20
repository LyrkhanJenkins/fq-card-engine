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

/**
 * Destruction définitive de cartes de la défausse (`destroyFromDiscard`), jouée
 * via le VRAI `playValidatedCard`. Mêmes deux modes que la récupération —
 * `*` (dialog de choix d'UNE carte, automatique s'il n'y en a qu'une) et liste
 * de noms (toutes détruites sans dialog) — avec une restriction structurante :
 * SEULES les copies générées en cours de partie (drapeau `generated` du module)
 * sont éligibles. Une carte permanente du deck n'est jamais proposée ni
 * détruite, et si rien n'est éligible la carte est injouable
 * (`WarningMsgNoDestroyableCard`) : aucune ressource n'est dépensée.
 */

/**
 * Construit une carte de main minimale dont l'unique choix détruit `spec`.
 *
 * @param {string} spec - La spécification (`*` ou liste de noms séparés par des virgules).
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeDestroyerCard(spec) {
    return {
        _id: "destroyer-card",
        name: "FQCARDTITLE.Destroyer",
        face: 0,
        system: {fq: {choices: [{destroyFromDiscard: spec, action: "-1", bonusCrit: "0", bonusEva: "0"}]}}
    };
}

/**
 * Construit une carte de pile de défausse, générée en cours de partie ou non.
 *
 * @param {string}  id          - L'id de la carte.
 * @param {string}  name        - Le nom (clé i18n) de la carte.
 * @param {boolean} [generated] - True pour une copie générée (éligible à la destruction).
 *
 * @returns {object} La carte de pile.
 */
function pileCard(id, name, generated = true) {
    return {
        id, name, face: 0, origin: null, faces: [{img: `images/${id}.png`}],
        flags: generated ? {"fq-card-engine": {generated: true}} : {}
    };
}

/**
 * Installe l'espion `DialogV2.prompt` (absent du socle tests/setup.js) et le renvoie.
 *
 * @param {Promise<string|undefined>} resolution - La promesse renvoyée par le prompt.
 *
 * @returns {import("vitest").Mock} L'espion prompt installé.
 */
function mockDialogPrompt(resolution) {
    const prompt = vi.fn(() => resolution);
    globalThis.foundry.applications.api = {DialogV2: {prompt}};
    return prompt;
}

describe("destroyFromDiscard — destruction définitive de cartes générées de la défausse", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete globalThis.foundry.applications.api;
    });

    test("'*' avec plusieurs cartes générées : dialog de choix, la carte choisie est supprimée de la pile", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("g2"));
        const cards = [pileCard("g1", "FQCARDTITLE.A"), pileCard("g2", "FQCARDTITLE.B")];

        const result = await playChoice(makeDestroyerCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(result.destroyCalls).toEqual([["Card", ["g2"]]]);
        // Destruction, pas déplacement : rien n'est passé vers la main.
        expect(result.retrieveCalls).toHaveLength(0);
    });

    test("une seule carte générée éligible : destruction automatique, aucune dialog", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("jamais"));
        const cards = [pileCard("g1", "FQCARDTITLE.A")];

        const result = await playChoice(makeDestroyerCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(prompt).not.toHaveBeenCalled();
        expect(result.destroyCalls).toEqual([["Card", ["g1"]]]);
    });

    test("les cartes NON générées ne sont ni proposées ni détruites", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("g1"));
        const cards = [
            pileCard("deck1", "FQCARDTITLE.Permanente", false),
            pileCard("g1", "FQCARDTITLE.Generee")
        ];

        const result = await playChoice(makeDestroyerCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        // Une seule éligible : pas de dialog, et c'est bien la générée.
        expect(prompt).not.toHaveBeenCalled();
        expect(result.destroyCalls).toEqual([["Card", ["g1"]]]);
    });

    test("pile sans aucune carte générée : carte injouable, aucune ressource dépensée", async () => {
        const cards = [pileCard("deck1", "FQCARDTITLE.Permanente", false)];

        const result = await playChoice(makeDestroyerCard("*"), 0, {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.destroyCalls).toHaveLength(0);
        expect(result.updates).toEqual([]);
        expect(game.i18n.localize).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgNoDestroyableCard");
    });

    test("liste de noms : toutes les cartes générées listées sont détruites en une fois, sans dialog", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("jamais"));
        const cards = [
            pileCard("gA", "FQCARDTITLE.A"),
            pileCard("gB", "FQCARDTITLE.B"),
            pileCard("gC", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeDestroyerCard("FQCARDTITLE.A, FQCARDTITLE.C"), 0,
            {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(prompt).not.toHaveBeenCalled();
        expect(result.destroyCalls).toEqual([["Card", ["gA", "gC"]]]);
    });

    test("nom listé correspondant à une carte NON générée : carte injouable, rien n'est détruit", async () => {
        const cards = [
            pileCard("deck1", "FQCARDTITLE.Permanente", false),
            pileCard("gB", "FQCARDTITLE.B")
        ];

        const result = await playChoice(makeDestroyerCard("FQCARDTITLE.Permanente"), 0,
            {world: {discardPile: {cards}}});

        expect(result.threw).toBe(false);
        expect(result.destroyCalls).toHaveLength(0);
        expect(result.updates).toEqual([]);
    });
});
