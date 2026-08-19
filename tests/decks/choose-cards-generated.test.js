import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "node:fs";
import path from "node:path";

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
 * Copie « générée » d'une carte de compendium via l'encart 🃏 (`chooseCardsList`
 * à référence unique — choix forcé, aucun voile), jouée via le VRAI
 * `playValidatedCard` : la référence `compendium.deck.carte` est résolue (nom du
 * pack seul ou id complet `scope.nom`, nom de carte pouvant contenir des points
 * type `FQCARDTITLE.xxx`), la copie est créée dans la main (`card.parent`) face
 * visible, non piochée et sans deck d'origine ; toute référence irrésoluble
 * publie les avertissements de l'encart sans bloquer le jeu de la carte.
 */

const COMPENDIUM_CARD_DATA = {
    _id: "compendium-card-id",
    name: "FQCARDTITLE.GeneratedCopy",
    face: 0,
    drawn: true,
    origin: "some-deck-id",
    system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
};

const worldFixture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8")
);

/** Combat en cours au round `round`, tour du personnage joueur. */
function combatAtRound(round) {
    return {
        round,
        combatant: {actor: {id: worldFixture.character.id}},
        combatants: [{actorId: worldFixture.character.id}],
        flags: {fq: {logs: []}}
    };
}

/**
 * Monte un mock `game.packs` contenant un unique pack de decks.
 *
 * @param {object} [options] - Options du pack mocké.
 * @param {string} [options.packName="decks-pattern-fq8"] - Le nom (metadata) du pack.
 * @param {string} [options.scope="fq-card-engine"] - Le scope de l'id complet du pack.
 * @param {string} [options.deckName="Elementalist Base deck"] - Le nom du deck contenu.
 * @param {object} [options.cardData] - Les données brutes de la carte de compendium.
 *
 * @returns {object} L'override `packs` à passer à `playChoice` via `opts.world`.
 */
function makePacks({packName = "decks-pattern-fq8", scope = "fq-card-engine", deckName = "Elementalist Base deck", cardData = COMPENDIUM_CARD_DATA} = {}) {
    const compendiumCard = {
        name: cardData.name,
        system: cardData.system,
        toObject: () => JSON.parse(JSON.stringify(cardData))
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
 * Construit une carte de main minimale dont l'unique choix propose `reference`
 * en référence unique (choix forcé : la copie arrive en main sans voile).
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
        system: {fq: {choices: [{chooseCardsList: reference, bonusCrit: "0", bonusEva: "0"}]}}
    };
}

describe("chooseCardsList à référence unique — copie d'une carte de compendium dans la main", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("une référence 'nomPack.deck.carte' crée la copie dans la main sans voile (nom de carte avec points)", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(veil).not.toHaveBeenCalled();
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
        // Aucun avertissement de résolution publié
        expect(result.chatMessages.some(m => m.content?.includes("WarningMsgChooseCards"))).toBe(false);
    });

    test("une référence par id complet 'scope.nomPack.deck.carte' est résolue via game.packs.get", async () => {
        const packs = makePacks();
        const card = makeGeneratorCard("fq-card-engine.decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(1);
        expect(packs.get).toHaveBeenCalledWith("fq-card-engine.decks-pattern-fq8");
    });

    test("compendium introuvable : avertissements publiés, rien n'est créé, le jeu de la carte continue", async () => {
        const card = makeGeneratorCard("pack-inconnu.Deck.Carte");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgChooseCardsNotFound"))).toBe(true);
        // La carte jouée part bien à la défausse malgré l'échec de résolution
        expect(result.passCalls).toHaveLength(1);
    });

    test("deck introuvable dans le compendium : avertissement", async () => {
        const card = makeGeneratorCard("decks-pattern-fq8.Deck Inconnu.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgChooseCardsNotFound"))).toBe(true);
    });

    test("carte introuvable dans le deck : avertissement", async () => {
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.Inconnue");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgChooseCardsNotFound"))).toBe(true);
    });

    test("référence à moins de trois segments : avertissement", async () => {
        const card = makeGeneratorCard("deck.carte");

        const result = await playChoice(card, 0, {world: {packs: makePacks()}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.chatMessages.some(m => m.content?.includes("FQCARDENGINE.WarningMsgChooseCardsNotFound"))).toBe(true);
    });
});

/**
 * Horodatage des passifs générés : la version « après première utilisation » d'un
 * passif remplace une carte dont l'effet vient d'être appliqué, elle ne doit donc
 * pas être rejouable avant le round suivant. Le marquage est porté par la donnée
 * de la carte générée (`replayable: "passif"` + `hasBeenPlayed`), la copie ne
 * fait que compléter le round courant ; toute autre carte reste intacte.
 */
describe("chooseCardsList — passifs générés marqués joués au round courant", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Construit les données d'une carte de compendium à choix unique.
     *
     * @param {object} choice - Le choix de la carte générée.
     *
     * @returns {object} Les données brutes de la carte de compendium.
     */
    function makeCompendiumCard(choice) {
        return {
            ...COMPENDIUM_CARD_DATA,
            system: {fq: {choices: [{bonusCrit: "0", bonusEva: "0", ...choice}]}}
        };
    }

    test("un choix passif déclaré déjà joué est horodaté au round courant", async () => {
        const packs = makePacks({cardData: makeCompendiumCard({replayable: "passif", hasBeenPlayed: true})});
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs, combat: combatAtRound(3)}});

        expect(result.threw).toBe(false);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].passivePlayedRound).toBe("3");
    });

    test("un choix passif non déclaré joué n'est pas horodaté", async () => {
        const packs = makePacks({cardData: makeCompendiumCard({replayable: "passif", hasBeenPlayed: false})});
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs, combat: combatAtRound(3)}});

        expect(result.threw).toBe(false);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].passivePlayedRound).toBeUndefined();
    });

    test("un choix non passif déclaré joué n'est pas horodaté", async () => {
        const packs = makePacks({cardData: makeCompendiumCard({replayable: "", hasBeenPlayed: true})});
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs, combat: combatAtRound(3)}});

        expect(result.threw).toBe(false);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].passivePlayedRound).toBeUndefined();
    });

    test("hors combat, le passif généré est horodaté à vide (aucun round à comparer)", async () => {
        const packs = makePacks({cardData: makeCompendiumCard({replayable: "passif", hasBeenPlayed: true})});
        const card = makeGeneratorCard("decks-pattern-fq8.Elementalist Base deck.FQCARDTITLE.GeneratedCopy");

        const result = await playChoice(card, 0, {world: {packs, combat: null}});

        expect(result.threw).toBe(false);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].passivePlayedRound).toBe("");
    });
});
