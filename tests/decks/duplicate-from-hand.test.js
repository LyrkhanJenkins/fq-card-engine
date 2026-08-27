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
const {default: CardSelection} = await import("../../src/domain/interface/window/card-selection.js");

/**
 * Duplication d'une carte de la main (`duplicateFromHand`), jouée via le VRAI
 * `playValidatedCard`, en deux modes — la carte jouée étant toujours exclue.
 * Mode `*` : toute la main est éligible, plusieurs éligibles → dialog de choix
 * (DialogV2.prompt) d'UNE carte, une seule → duplication automatique sans
 * dialog, aucune → injouable (`WarningMsgNoDuplicableCard`). Mode liste (noms
 * séparés par des virgules) : TOUTES les cartes listées sont dupliquées sans
 * dialog ; un nom sans correspondance → injouable
 * (`WarningMsgMissingDuplicableCards`, aucune création). Les originaux ne
 * bougent pas : chaque carte choisie est COPIÉE en copie générée créée dans la
 * main (drapeau `generated`, sans deck d'origine), non épuisée sauf si
 * l'original porte déjà un choix marqué joué. `chooseCardsPlayNow` joue les
 * copies dans la foulée, comme celles de l'encart 🃏.
 */

/**
 * Construit une carte de main minimale dont l'unique choix duplique `spec`.
 *
 * @param {string} spec - La spécification (`*` ou liste de noms séparés par des virgules).
 * @param {object} [extra] - Champs supplémentaires du choix (ex. `chooseCardsPlayNow`).
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeDuplicatorCard(spec, extra = {}) {
    return {
        _id: "duplicator-card",
        name: "FQCARDTITLE.Duplicator",
        face: 0,
        system: {fq: {choices: [{duplicateFromHand: spec, bonusCrit: "0", bonusEva: "0", ...extra}]}}
    };
}

// Carte de main duplicable : le fabricant du harnais (avec `toObject`).
const handCard = makeHandCard;

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

describe("duplicateFromHand — duplication d'une carte de la main en copie générée", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete globalThis.foundry.applications.api;
    });

    test("'*' avec plusieurs cartes : dialog de choix, la carte choisie est copiée dans la main", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("h2"));
        const handCards = [handCard("h1", "FQCARDTITLE.A"), handCard("h2", "FQCARDTITLE.B")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(prompt).toHaveBeenCalledTimes(1);
        // La dialog présente bien toutes les cartes éligibles de la main
        const dialogContent = prompt.mock.calls[0][0].content;
        expect(dialogContent).toContain("FQCARDTITLE.A");
        expect(dialogContent).toContain("FQCARDTITLE.B");

        expect(result.generatedCards).toHaveLength(1);
        const [embeddedName, [data]] = result.generatedCards[0];
        expect(embeddedName).toBe("Card");
        expect(data.name).toBe("FQCARDTITLE.B");
        // Copie générée : sans id ni deck d'origine, non piochée, drapeau du module
        expect(data._id).toBeUndefined();
        expect(data.origin).toBeNull();
        expect(data.drawn).toBe(false);
        expect(data.flags["fq-card-engine"].generated).toBe(true);
        // La carte jouée part bien à la défausse
        expect(result.passCalls).toHaveLength(1);
    });

    test("une seule carte éligible : duplication automatique, aucune dialog", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("jamais"));
        const handCards = [handCard("h1", "FQCARDTITLE.A")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(prompt).not.toHaveBeenCalled();
        expect(result.generatedCards).toHaveLength(1);
        expect(result.generatedCards[0][1][0].name).toBe("FQCARDTITLE.A");
    });

    test("l'original ne bouge pas et la copie n'arrive pas épuisée", async () => {
        const handCards = [handCard("h1", "FQCARDTITLE.A")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        // Aucun transfert ni destruction : la duplication ne touche pas à l'original
        expect(result.retrieveCalls).toHaveLength(0);
        expect(result.handDestroyCalls).toHaveLength(0);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].hasBeenPlayed).toBeFalsy();
        expect(data.system.fq.choices[0].playedRound).toBeUndefined();
    });

    test("liste de noms : TOUTES les cartes listées sont copiées, sans dialog", async () => {
        const prompt = mockDialogPrompt(Promise.resolve("jamais"));
        const handCards = [
            handCard("hA", "FQCARDTITLE.A"),
            handCard("hB", "FQCARDTITLE.B"),
            handCard("hC", "FQCARDTITLE.C")
        ];

        const result = await playChoice(makeDuplicatorCard("FQCARDTITLE.A, FQCARDTITLE.C"), 0,
            {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(prompt).not.toHaveBeenCalled();
        expect(result.generatedCards).toHaveLength(1);
        expect(result.generatedCards[0][1].map(data => data.name))
            .toEqual(["FQCARDTITLE.A", "FQCARDTITLE.C"]);
        expect(result.passCalls).toHaveLength(1);
    });

    test("liste partiellement satisfaite : carte injouable (avertissement avec les noms manquants)", async () => {
        const handCards = [handCard("hA", "FQCARDTITLE.A")];

        const result = await playChoice(makeDuplicatorCard("FQCARDTITLE.A,FQCARDTITLE.B"), 0,
            {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgMissingDuplicableCards"))).toBe(true);
    });

    test("main vide (hors carte jouée) : carte injouable (avertissement, aucune création ni jeu)", async () => {
        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards: []}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoDuplicableCard"))).toBe(true);
    });

    test("la carte jouée elle-même ne compte pas : seule en main → injouable", async () => {
        const handCards = [handCard("duplicator-card", "FQCARDTITLE.Duplicator")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        expect(result.generatedCards).toHaveLength(0);
        expect(result.passCalls).toHaveLength(0);
        expect(result.chatMessages.some(m => String(m.content).includes("WarningMsgNoDuplicableCard"))).toBe(true);
    });

    test("dialog fermée sans choix : aucune duplication, le jeu de la carte continue", async () => {
        mockDialogPrompt(Promise.reject(new Error("closed")));
        const handCards = [handCard("h1", "FQCARDTITLE.A"), handCard("h2", "FQCARDTITLE.B")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
        expect(result.passCalls).toHaveLength(1);
    });

    test("chooseCardsPlayNow : la copie est jouée dans la foulée", async () => {
        const playNow = vi.spyOn(CardSelection, "playGeneratedCards").mockResolvedValue();
        const handCards = [handCard("h1", "FQCARDTITLE.A")];

        const result = await playChoice(makeDuplicatorCard("*", {chooseCardsPlayNow: true}), 0,
            {cardOptions: {handCards}});

        expect(result.threw).toBe(false);
        expect(playNow).toHaveBeenCalledTimes(1);
        const [created, hand] = playNow.mock.calls[0];
        expect(created.map(c => c.name)).toEqual(["FQCARDTITLE.A"]);
        expect(hand).toBe(result.card.parent);
    });

    test("sans chooseCardsPlayNow : la copie reste en main", async () => {
        const playNow = vi.spyOn(CardSelection, "playGeneratedCards").mockResolvedValue();
        const handCards = [handCard("h1", "FQCARDTITLE.A")];

        const result = await playChoice(makeDuplicatorCard("*"), 0, {cardOptions: {handCards}});

        expect(result.generatedCards).toHaveLength(1);
        expect(playNow).not.toHaveBeenCalled();
    });

    test("dupliquer une copie déjà générée : le drapeau et l'horodatage de choix marqué joué sont reconduits", async () => {
        // Une copie générée en main (ex. maillon de forge) porte des choix
        // `hasBeenPlayed` : sa duplication arrive épuisée pour le round courant,
        // comme une génération de compendium (stampPlayedRound).
        const generated = handCard("g1", "FQCARDTITLE.ForgeLink",
            {chooseCardsList: "x.y.z", replayable: "ephemere", hasBeenPlayed: true});
        const combat = {
            round: 4,
            combatant: {actor: {id: "world-character"}},
            combatants: [{actorId: "world-character"}],
            flags: {fq: {logs: []}}
        };

        const result = await playChoice(makeDuplicatorCard("*"), 0,
            {cardOptions: {handCards: [generated]}, world: {combat}});

        expect(result.threw).toBe(false);
        const [, [data]] = result.generatedCards[0];
        expect(data.system.fq.choices[0].hasBeenPlayed).toBe(true);
        expect(data.system.fq.choices[0].playedRound).toBe("4");
    });

    test("une carte sans duplicateFromHand ne crée rien dans la main", async () => {
        const card = {
            _id: "plain-card",
            name: "FQCARDTITLE.Plain",
            face: 0,
            system: {fq: {choices: [{damage: "1d4", bonusCrit: "0", bonusEva: "0"}]}}
        };

        const result = await playChoice(card, 0, {
            cardOptions: {handCards: [handCard("h1", "FQCARDTITLE.A")]},
            dice: [{faces: 4, value: 2}, {faces: 20, value: 19}, {faces: 20, value: 19}]
        });

        expect(result.threw).toBe(false);
        expect(result.generatedCards).toHaveLength(0);
    });
});
