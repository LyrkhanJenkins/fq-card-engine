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

/**
 * Génération d'une copie de carte de compendium dans la main (`generateCard`),
 * jouée via le VRAI `playValidatedCard` : le champ `compendium.deck.carte` est
 * résolu (nom du pack seul ou id complet `scope.nom`, nom de carte pouvant
 * contenir des points type `FQCARDTITLE.xxx`), la copie est créée dans la main
 * (`card.parent`) face visible, non piochée et sans deck d'origine ; toute
 * référence irrésoluble (format, compendium, deck ou carte) publie l'unique
 * avertissement `WarningMsgGenerateCardNotFound` sans bloquer le jeu de la carte.
 */

const COMPENDIUM_CARD_DATA = {
    _id: "compendium-card-id",
    name: "FQCARDTITLE.GeneratedCopy",
    face: 0,
    drawn: true,
    origin: "some-deck-id",
    system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
};

/**
 * Monte un mock `game.packs` contenant un unique pack de decks.
 *
 * @param {object} [options] - Options du pack mocké.
 * @param {string} [options.packName="decks-pattern-fq8"] - Le nom (metadata) du pack.
 * @param {string} [options.scope="fq-card-engine"] - Le scope de l'id complet du pack.
 * @param {string} [options.deckName="Elementalist Base deck"] - Le nom du deck contenu.
 *
 * @returns {object} L'override `packs` à passer à `playChoice` via `opts.world`.
 */
function makePacks({packName = "decks-pattern-fq8", scope = "fq-card-engine", deckName = "Elementalist Base deck"} = {}) {
    const compendiumCard = {
        name: COMPENDIUM_CARD_DATA.name,
        toObject: () => JSON.parse(JSON.stringify(COMPENDIUM_CARD_DATA))
    };
    const deck = {name: deckName, cards: [compendiumCard]};
    const pack = {
        metadata: {name: packName},
        collection: `${scope}.${packName}`,
        getDocuments: vi.fn(async () => [deck])
    };
    return {
        get: vi.fn(key => (key === pack.collection ? pack : undefined)),
        find: vi.fn(predicate => [pack].find(predicate))
    };
}

/**
 * Construit une carte de main minimale dont l'unique choix génère `reference`.
 *
 * @param {string} reference - La référence `compendium.deck.carte` du choix.
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeGeneratorCard(reference) {
    return {
        _id: "generator-card",
        name: "FQCARDTITLE.Generator",
        face: 0,
        system: {fq: {choices: [{generateCard: reference, bonusCrit: "0", bonusEva: "0"}]}}
    };
}

describe("generateCard — copie d'une carte de compendium dans la main", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("une référence 'nomPack.deck.carte' crée la copie dans la main (nom de carte avec points)", async () => {
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(1);
        const [embeddedName, [data]] = result.generatedCards[0];
        expect(embeddedName).toBe("Card");
        expect(data.name).toBe("FQCARDTITLE.GeneratedCopy");
        expect(data._id).toBeUndefined();
        expect(data.drawn).toBe(false);
        expect(data.origin).toBeNull();
        expect(data.face).toBe(0);
        // L'horodatage qui pilote le halo vert temporaire dans la main
        expect(typeof data.flags["fq-card-engine"].generatedAt).toBe("number");
        // Aucun avertissement de génération publié
        expect(result.chatMessages.some(m => m.content?.includes("WarningMsgGenerateCard"))).toBe(false);
    });

    test("une référence par id complet 'scope.nomPack.deck.carte' est résolue via game.packs.get", async () => {
        const packs = makePacks();
        const card = makeGeneratorCard("fq-card-engine.decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(1);
        expect(packs.get).toHaveBeenCalledWith("fq-card-engine.decks-pattern-fq8");
    });

    test("compendium introuvable : avertissement publié, rien n'est créé, le jeu de la carte continue", async () => {
        const card = makeGeneratorCard("pack-inconnu.Deck.Carte");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgGenerateCardNotFound"))).toBe(true);
        // La carte jouée part bien à la défausse malgré l'échec de génération
        expect(result.passCalls).toHaveLength(1);
    });

    test("deck introuvable dans le compendium : avertissement", async () => {
        const card = makeGeneratorCard("decks-pattern-fq8.Deck Inconnu.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgGenerateCardNotFound"))).toBe(true);
    });

    test("carte introuvable dans le deck : avertissement", async () => {
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.Inconnue");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgGenerateCardNotFound"))).toBe(true);
    });

    test("référence à moins de trois segments : avertissement", async () => {
        const card = makeGeneratorCard("deck.carte");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgGenerateCardNotFound"))).toBe(true);
    });

    test("une carte sans generateCard ne crée rien dans la main", async () => {
        const card = {
            _id: "plain-card",
            name: "FQCARDTITLE.Plain",
            face: 0,
            system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
        };

        const result = await playChoice(card, 0, {
            world: {packs: makePacks()},
            dice: [{faces: 4, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
    });
});
