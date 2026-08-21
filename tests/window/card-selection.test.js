import {beforeEach, describe, expect, test, vi} from "vitest";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {default: CardSelection} = await import("../../src/domain/interface/window/card-selection.js");
const {default: TradingCards, DECK_TYPE, PILE_TYPE, SPELLBOOK_TYPE} = await import("../../src/domain/trading/trading-cards.js");

/**
 * Sélection de cartes proposées (`chooseCards`) : résolution du pool de
 * références compendium, garde-fous d'arguments et de taille de pool,
 * vérification des piles de destination AVANT le voile, puis application de la
 * sélection — `discard` crée des copies « générées » (sans deck d'origine,
 * nettoyées en combat) dans la défausse, `deck` copie dans le deck ET le
 * spellbook. Le voile lui-même (DOM) est stubbé : il part en UAT visuel Foundry.
 */

const CARD_A = {
    _id: "card-a-id",
    name: "FQCARDTITLE.CardA",
    face: 0,
    drawn: true,
    origin: "some-deck-id",
    system: {fq: {choices: [{damage: "1d4"}]}}
};
const CARD_B = {...CARD_A, _id: "card-b-id", name: "FQCARDTITLE.CardB"};

/**
 * Monte un mock `game.packs` contenant un unique pack de decks.
 *
 * @param {object[]} [cardsData] - Les données brutes des cartes du deck mocké.
 *
 * @returns {object} L'override à affecter à `game.packs`.
 */
function makePacks(cardsData = [CARD_A, CARD_B]) {
    const deck = {
        name: "Proposed deck",
        cards: cardsData.map(data => ({
            name: data.name,
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

const REF_A = "decks-pattern-fq8.Proposed deck.FQCARDTITLE.CardA";
const REF_B = "decks-pattern-fq8.Proposed deck.FQCARDTITLE.CardB";

/** Fabrique une pile FQ mockée avec espion de création de cartes. */
function makeStack(id) {
    return {
        id,
        cards: [],
        createEmbeddedDocuments: vi.fn(async (_embeddedName, data) => data)
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    game.packs = makePacks();
    game.user.id = "user1";
});

describe("resolveCardPool — résolution des références compendium", () => {
    test("résout les références valides et rapporte les manquantes sans bloquer", async () => {
        const pool = await CardSelection.resolveCardPool([REF_A, "pack-inconnu.Deck.Carte", REF_B]);

        expect(pool.cards.map(c => c.name)).toEqual(["FQCARDTITLE.CardA", "FQCARDTITLE.CardB"]);
        expect(pool.missing).toEqual(["pack-inconnu.Deck.Carte"]);
    });

    test("liste vide ou absente : pool vide sans erreur", async () => {
        expect(await CardSelection.resolveCardPool([])).toEqual({cards: [], missing: []});
        expect(await CardSelection.resolveCardPool(undefined)).toEqual({cards: [], missing: []});
    });
});

/**
 * Monte un mock `game.packs` à deux decks avec cartes à niveaux.
 *
 * @returns {object} L'override à affecter à `game.packs`.
 */
function makeLeveledPacks() {
    const makeCard = (name, level) => ({
        name,
        system: {fq: {level, choices: [{damage: "1d4"}]}},
        toObject: () => JSON.parse(JSON.stringify({name, face: 0, system: {fq: {level, choices: [{damage: "1d4"}]}}}))
    });
    const deckA = {
        name: "Deck A",
        cards: [makeCard("FQCARDTITLE.A1", 1), makeCard("FQCARDTITLE.A2", 2), makeCard("FQCARDTITLE.A3", 3)]
    };
    const deckB = {
        name: "Deck B",
        cards: [makeCard("FQCARDTITLE.B1", 1), makeCard("FQCARDTITLE.B2", 2)]
    };
    const pack = {
        metadata: {name: "decks-pattern-fq8"},
        collection: "fq-card-engine.decks-pattern-fq8",
        getDocuments: vi.fn(async () => [deckA, deckB])
    };
    return {
        get: vi.fn(key => (key === pack.collection ? pack : undefined)),
        find: vi.fn(predicate => [pack].find(predicate))
    };
}

describe("pickRandomCardRefs — tirage aléatoire filtré dans un compendium", () => {
    beforeEach(() => {
        game.packs = makeLeveledPacks();
        // Tirage déterministe : Fisher-Yates avec random=0 conserve l'ordre du vivier.
        vi.spyOn(Math, "random").mockReturnValue(0);
    });

    test("source deck précis + filtre de niveaux : seules les cartes des niveaux listés sont candidates", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", levels: [1, 3], count: 10});

        expect(refs).toEqual([
            "fq-card-engine.decks-pattern-fq8.Deck A.FQCARDTITLE.A1",
            "fq-card-engine.decks-pattern-fq8.Deck A.FQCARDTITLE.A3",
        ]);
    });

    test("source pack entier : les cartes de tous les decks sont candidates, count borne le tirage", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "decks-pattern-fq8", levels: [], count: 3});

        expect(refs).toHaveLength(3);
        expect(new Set(refs).size).toBe(3);
        refs.forEach(ref => expect(ref.startsWith("fq-card-engine.decks-pattern-fq8.Deck ")).toBe(true));
    });

    test("sans levels : tous les niveaux sont candidats", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", count: 10});

        expect(refs).toHaveLength(3);
    });

    test("exclude : les cartes déjà présentes (par nom) dans le deck d'exclusion sont écartées", async () => {
        const playerDeck = {cards: [{name: "FQCARDTITLE.A1"}, {name: "FQCARDTITLE.A3"}]};

        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", count: 10, exclude: playerDeck});

        expect(refs).toEqual(["fq-card-engine.decks-pattern-fq8.Deck A.FQCARDTITLE.A2"]);
    });

    test("exclude par id : résolu via game.cards.get ; introuvable → avertit et ne tire rien", async () => {
        game.cards = {get: vi.fn(() => undefined)};

        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", count: 1, exclude: "deck-id"});

        expect(refs).toEqual([]);
        expect(game.cards.get).toHaveBeenCalledWith("deck-id");
        expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgRandomCardsExcludeNotFound",
            {name: "deck-id"});
    });

    test("les références tirées se résolvent telles quelles via resolveCardPool", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck B", levels: [2], count: 1});

        const pool = await CardSelection.resolveCardPool(refs);

        expect(pool.missing).toEqual([]);
        expect(pool.cards.map(c => c.name)).toEqual(["FQCARDTITLE.B2"]);
    });

    test("source introuvable (pack ou deck) : avertit et renvoie une liste vide", async () => {
        const refs = await CardSelection.pickRandomCardRefs({from: "pack-inconnu.Deck X", count: 1});

        expect(refs).toEqual([]);
        expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgRandomCardsSourceNotFound",
            {name: "pack-inconnu.Deck X"});
    });

    test("count 0 : renvoie toutes les références candidates (mélangées)", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", count: 0});

        expect(refs).toHaveLength(3);
    });

    test("count invalide (négatif ou non entier) : avertit et renvoie une liste vide", async () => {
        const refs = await CardSelection.pickRandomCardRefs(
            {from: "fq-card-engine.decks-pattern-fq8.Deck A", count: -1});

        expect(refs).toEqual([]);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgRandomCardsInvalidArgs");
    });
});

describe("resolveDestinationStacks — piles de destination", () => {
    test("discard : la défausse (PILE) du joueur", () => {
        const pile = makeStack("pile-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, typeFq) =>
            (typeFq === PILE_TYPE ? pile : undefined));

        expect(CardSelection.resolveDestinationStacks("discard", "user1")).toEqual([pile]);
    });

    test("discard : null si la défausse manque", () => {
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(undefined);

        expect(CardSelection.resolveDestinationStacks("discard", "user1")).toBeNull();
    });

    test("deck : le deck ET le spellbook du joueur", () => {
        const deck = makeStack("deck-1");
        const spellBook = makeStack("spellbook-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, typeFq) => {
            if (typeFq === DECK_TYPE) return deck;
            if (typeFq === SPELLBOOK_TYPE) return spellBook;
            return undefined;
        });

        expect(CardSelection.resolveDestinationStacks("deck", "user1")).toEqual([deck, spellBook]);
    });

    test("deck : null si le deck ou le spellbook manque", () => {
        const deck = makeStack("deck-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, typeFq) =>
            (typeFq === DECK_TYPE ? deck : undefined));

        expect(CardSelection.resolveDestinationStacks("deck", "user1")).toBeNull();
    });
});

describe("chooseCards — garde-fous avant le voile", () => {
    test.each([
        ["destination inconnue", {cards: [REF_A], count: 1, destination: "hand"}],
        ["destination absente", {cards: [REF_A], count: 1}],
        ["count nul", {cards: [REF_A], count: 0, destination: "discard"}],
        ["count non entier", {cards: [REF_A], count: 1.5, destination: "discard"}],
    ])("%s : avertit et renvoie null sans ouvrir le voile", async (_label, options) => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.chooseCards(options);

        expect(result).toBeNull();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgChooseCardsInvalidArgs");
        expect(veil).not.toHaveBeenCalled();
    });

    test("références irrésolubles : avertissement publié, la sélection continue sur les résolues", async () => {
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(makeStack("pile-1"));
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockResolvedValue(null);

        await CardSelection.chooseCards({cards: [REF_A, "pack-inconnu.Deck.Carte"], count: 1, destination: "discard"});

        expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgChooseCardsNotFound",
            {names: "pack-inconnu.Deck.Carte"});
        expect(veil).toHaveBeenCalledTimes(1);
        expect(veil.mock.calls[0][0].map(c => c.name)).toEqual(["FQCARDTITLE.CardA"]);
    });

    test("pool plus petit que count : avertit et renvoie null sans ouvrir le voile", async () => {
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.chooseCards({cards: [REF_A], count: 2, destination: "discard"});

        expect(result).toBeNull();
        expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgChooseCardsPoolTooSmall",
            {available: 1, count: 2});
        expect(veil).not.toHaveBeenCalled();
    });

    test("pile de destination manquante : renvoie null sans ouvrir le voile", async () => {
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(undefined);
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.chooseCards({cards: [REF_A], count: 1, destination: "discard"});

        expect(result).toBeNull();
        expect(veil).not.toHaveBeenCalled();
    });

    test("annulation du voile : renvoie null, rien n'est créé", async () => {
        const pile = makeStack("pile-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(pile);
        vi.spyOn(CardSelection, "openSelectionVeil").mockResolvedValue(null);

        const result = await CardSelection.chooseCards({cards: [REF_A, REF_B], count: 1, destination: "discard"});

        expect(result).toBeNull();
        expect(pile.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
});

describe("parseLevels / sampleDistinct — helpers de tirage", () => {
    test("parseLevels ignore les segments vides ou non numériques", () => {
        expect(CardSelection.parseLevels("1, 2,x,,3")).toEqual([1, 2, 3]);
        expect(CardSelection.parseLevels("")).toEqual([]);
        expect(CardSelection.parseLevels(undefined)).toEqual([]);
    });

    test("sampleDistinct : count 0 = tout le vivier, sinon count éléments distincts", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        expect(CardSelection.sampleDistinct(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
        expect(CardSelection.sampleDistinct(["a", "b", "c"], 2)).toEqual(["a", "b"]);
        expect(CardSelection.sampleDistinct(["a"], 5)).toEqual(["a"]);
    });
});

describe("playCardSelection — encart « proposer des cartes » d'une carte jouée", () => {
    const LIST = `${REF_A}, ${REF_B}`;

    /** Contenu de choix minimal portant l'encart. */
    function makeContent(fields) {
        return {chooseCardsList: "", chooseCardsFrom: "", chooseCardsLevels: "",
            chooseCardsProposed: "", chooseCardsCount: "", chooseCardsExcludeDeck: false, ...fields};
    }

    beforeEach(() => {
        vi.spyOn(Math, "random").mockReturnValue(0);
    });

    test("hasCardSelection : actif dès qu'une source est renseignée", () => {
        expect(CardSelection.hasCardSelection(makeContent({}))).toBe(false);
        expect(CardSelection.hasCardSelection(makeContent({chooseCardsList: REF_A}))).toBe(true);
        expect(CardSelection.hasCardSelection(makeContent({chooseCardsFrom: "decks-pattern-fq8"}))).toBe(true);
        expect(CardSelection.hasCardSelection(undefined)).toBe(false);
    });

    test("mode liste : voile non annulable, copies générées dans la main", async () => {
        const hand = makeStack("hand-1");
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);

        const result = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "1"}), hand);

        expect(veil).toHaveBeenCalledTimes(1);
        const [candidates, count, options] = veil.mock.calls[0];
        expect(candidates.map(c => c.name)).toEqual(["FQCARDTITLE.CardA", "FQCARDTITLE.CardB"]);
        expect(count).toBe(1);
        expect(options).toEqual({cancellable: false});
        const [embeddedName, data] = hand.createEmbeddedDocuments.mock.calls[0];
        expect(embeddedName).toBe("Card");
        expect(data.map(d => d.origin)).toEqual([null]);
        expect(result).toHaveLength(1);
    });

    test("choix forcé (nombre à choisir couvrant le vivier) : pas de voile, tout arrive en main", async () => {
        const hand = makeStack("hand-1");
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "5"}), hand);

        expect(veil).not.toHaveBeenCalled();
        const [embeddedName, data] = hand.createEmbeddedDocuments.mock.calls[0];
        expect(embeddedName).toBe("Card");
        expect(data.map(d => d.name)).toEqual(["FQCARDTITLE.CardA", "FQCARDTITLE.CardB"]);
        expect(data.map(d => d.origin)).toEqual([null, null]);
        expect(result).toHaveLength(2);
    });

    test("exclusion du deck du joueur : les cartes déjà possédées (par nom) sortent du vivier", async () => {
        const hand = makeStack("hand-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue({cards: [{name: "FQCARDTITLE.CardA"}]});
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "1", chooseCardsExcludeDeck: true}), hand);

        // Une seule candidate restante pour un choix de 1 : choix forcé, pas de voile.
        expect(veil).not.toHaveBeenCalled();
        expect(hand.createEmbeddedDocuments.mock.calls[0][1].map(d => d.name)).toEqual(["FQCARDTITLE.CardB"]);
    });

    test("mode deck : source + niveaux filtrent les candidates, nb proposées borne le voile", async () => {
        game.packs = makeLeveledPacks();
        const hand = makeStack("hand-1");
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);

        await CardSelection.playCardSelection(
            makeContent({chooseCardsFrom: "fq-card-engine.decks-pattern-fq8.Deck A",
                chooseCardsLevels: "1,2", chooseCardsProposed: "2", chooseCardsCount: "1"}), hand);

        const [candidates, count] = veil.mock.calls[0];
        expect(candidates.map(c => c.name).sort()).toEqual(["FQCARDTITLE.A1", "FQCARDTITLE.A2"]);
        expect(count).toBe(1);
    });

    test("sources multiples : une proposition par source, les cartes retenues s'additionnent", async () => {
        game.packs = makeLeveledPacks();
        const hand = makeStack("hand-1");
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);

        const created = await CardSelection.playCardSelection(
            makeContent({
                chooseCardsFrom: "fq-card-engine.decks-pattern-fq8.Deck A;fq-card-engine.decks-pattern-fq8.Deck B",
                chooseCardsLevels: "1,2", chooseCardsProposed: "2", chooseCardsCount: "1"
            }), hand);

        // Un voile par source, chacun borné à son propre deck.
        expect(veil).toHaveBeenCalledTimes(2);
        expect(veil.mock.calls[0][0].map(c => c.name).sort()).toEqual(["FQCARDTITLE.A1", "FQCARDTITLE.A2"]);
        expect(veil.mock.calls[1][0].map(c => c.name).sort()).toEqual(["FQCARDTITLE.B1", "FQCARDTITLE.B2"]);
        // Une carte retenue de chaque côté, toutes créées dans la main.
        expect(hand.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
        expect(created).toHaveLength(2);
    });

    test("source unique : le séparateur de sources ne change rien au comportement d'origine", async () => {
        game.packs = makeLeveledPacks();
        const hand = makeStack("hand-1");
        const veil = vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);

        await CardSelection.playCardSelection(
            makeContent({chooseCardsFrom: "fq-card-engine.decks-pattern-fq8.Deck A;",
                chooseCardsLevels: "1,2", chooseCardsProposed: "2", chooseCardsCount: "1"}), hand);

        expect(veil).toHaveBeenCalledTimes(1);
    });

    test("vivier vide après exclusion : avertissement de chat, pas de voile, renvoie null", async () => {
        const hand = makeStack("hand-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(
            {cards: [{name: "FQCARDTITLE.CardA"}, {name: "FQCARDTITLE.CardB"}]});
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "1", chooseCardsExcludeDeck: true}), hand);

        expect(result).toBeNull();
        expect(veil).not.toHaveBeenCalled();
        expect(game.i18n.localize).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgChooseCardsNoCandidates");
        expect(hand.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("deck du joueur introuvable alors que l'exclusion est demandée : rien n'est proposé", async () => {
        const hand = makeStack("hand-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(undefined);
        const veil = vi.spyOn(CardSelection, "openSelectionVeil");

        const result = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "1", chooseCardsExcludeDeck: true}), hand);

        expect(result).toBeNull();
        expect(veil).not.toHaveBeenCalled();
    });

    test("jeu immédiat : les cartes retenues sont jouées dans la foulée", async () => {
        const hand = makeStack("hand-1");
        const playNow = vi.spyOn(CardSelection, "playGeneratedCards").mockResolvedValue();

        const created = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "5", chooseCardsPlayNow: true}), hand);

        expect(playNow).toHaveBeenCalledWith(created, hand);
    });

    test("sans jeu immédiat : les cartes retenues restent en main", async () => {
        const hand = makeStack("hand-1");
        const playNow = vi.spyOn(CardSelection, "playGeneratedCards").mockResolvedValue();

        await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "5"}), hand);

        expect(playNow).not.toHaveBeenCalled();
    });

    test("aucune carte retenue : pas de jeu immédiat malgré l'option", async () => {
        const hand = makeStack("hand-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(
            {cards: [{name: "FQCARDTITLE.CardA"}, {name: "FQCARDTITLE.CardB"}]});
        const playNow = vi.spyOn(CardSelection, "playGeneratedCards").mockResolvedValue();

        const result = await CardSelection.playCardSelection(
            makeContent({chooseCardsList: LIST, chooseCardsCount: "1",
                chooseCardsExcludeDeck: true, chooseCardsPlayNow: true}), hand);

        expect(result).toBeNull();
        expect(playNow).not.toHaveBeenCalled();
    });
});

describe("playGeneratedCards — jeu immédiat des cartes générées", () => {
    /** Carte générée minimale : un choix unique, sans saisie. */
    function makeGenerated(id, choice) {
        return {id, system: {fq: {choices: [{name: `FQCARDCHOICE.${id}`, ...choice}]}}};
    }

    test("chaque carte part dans le jeu normal, l'une après l'autre", async () => {
        const hand = makeStack("hand-1");
        const pile = makeStack("pile-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(pile);
        let endFirst;
        const playValidatedCard = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => {
                endFirst = resolve;
            }))
            .mockResolvedValue(null);
        globalThis.FqCardEngineModule.playValidatedCard = playValidatedCard;
        const cardA = makeGenerated("generated-a", {damage: "1d4"});
        const cardB = makeGenerated("generated-b", {heal: "1d6"});

        const done = CardSelection.playGeneratedCards([cardA, cardB], hand);
        await Promise.resolve();

        expect(playValidatedCard).toHaveBeenCalledTimes(1);
        const [to, fd, cardContent, ctx] = playValidatedCard.mock.calls[0];
        expect(to).toBe(pile);
        // Formulaire d'un dialogue validé sans aucune saisie.
        expect(fd).toEqual({to: "pile-1", nameContent: "FQCARDCHOICE.generated-a"});
        expect(cardContent.damage).toBe("1d4");
        // Le choix joué est une COPIE : le jeu recalcule le contenu sur place.
        expect(cardContent).not.toBe(cardA.system.fq.choices[0]);
        expect(ctx).toMatchObject({hasVariables: false, currentCards: hand, card: cardA});
        expect(ctx.initCardContents).toBe(cardA.system.fq.choices);

        endFirst(null);
        await done;

        expect(playValidatedCard).toHaveBeenCalledTimes(2);
        expect(playValidatedCard.mock.calls[1][3].card).toBe(cardB);
    });
});

describe("chooseCards — application de la sélection", () => {
    test("discard : copies « générées » (sans _id ni origine, horodatées) créées dans la défausse", async () => {
        const pile = makeStack("pile-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, typeFq) =>
            (typeFq === PILE_TYPE ? pile : undefined));
        vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[1]]);

        const result = await CardSelection.chooseCards({cards: [REF_A, REF_B], count: 1, destination: "discard"});

        expect(pile.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        const [embeddedName, [data]] = pile.createEmbeddedDocuments.mock.calls[0];
        expect(embeddedName).toBe("Card");
        expect(data.name).toBe("FQCARDTITLE.CardB");
        expect(data._id).toBeUndefined();
        expect(data.drawn).toBe(false);
        expect(data.origin).toBeNull();
        expect(data.face).toBe(0);
        // L'horodatage qui pilote le halo vert temporaire dans la main
        expect(typeof data.flags["fq-card-engine"].generatedAt).toBe("number");
        expect(result).toHaveLength(1);
    });

    test("deck : chaque carte choisie est copiée dans le deck ET le spellbook", async () => {
        const deck = makeStack("deck-1");
        const spellBook = makeStack("spellbook-1");
        vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((_userId, typeFq) => {
            if (typeFq === DECK_TYPE) return deck;
            if (typeFq === SPELLBOOK_TYPE) return spellBook;
            return undefined;
        });
        vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => cards);

        const result = await CardSelection.chooseCards({cards: [REF_A, REF_B], count: 2, destination: "deck"});

        for (const stack of [deck, spellBook]) {
            expect(stack.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
            const [embeddedName, created] = stack.createEmbeddedDocuments.mock.calls[0];
            expect(embeddedName).toBe("Card");
            expect(created.map(c => c.name)).toEqual(["FQCARDTITLE.CardA", "FQCARDTITLE.CardB"]);
        }
        expect(result).toHaveLength(2);
    });
});
