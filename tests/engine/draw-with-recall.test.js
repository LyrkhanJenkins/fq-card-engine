import {beforeEach, describe, expect, it, vi} from "vitest";
import CombatTurn from "../../src/domain/engine/combat-turn.js";
import TradingCards from "../../src/domain/trading/trading-cards.js";

// combat-turn.js importe `{socket}` depuis socketlib.hook.js (qui enregistre un
// hook et tire une chaîne d'imports au chargement) : on le neutralise, en gardant
// les entrées assertables du routage de pioche et de l'alerte de remélange.
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {executeAsGM: vi.fn(), executeAsUser: vi.fn(), executeForEveryone: vi.fn()}
}));

const {socket} = await import("../../src/hook/integration/socketlib.hook.js");

/**
 * `CombatTurn.drawWithRecall` : source UNIQUE de la pioche, partagée par le début
 * de tour (`combatTurnChange`) et par les cartes qui font piocher
 * (`CardEffect.applyCardEffect`). Tant que le deck suffit, c'est une pioche
 * normale ; sinon la défausse est ramenée dans le deck (alerte de remélange à
 * tous les clients) et le tirage se complète avec les cartes recyclées.
 */
const makeUser = (active = true) => ({id: "user-1", active});
const makeActor = () => ({
    name: "Perso",
    system: {attributes: {exhaustion: 0, hp: {value: 10, max: 10}}},
    update: vi.fn()
});

describe("CombatTurn.drawWithRecall — remélange de la défausse quand le deck est à sec", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        globalThis.game = {i18n: {localize: vi.fn(key => key)}};
    });

    it("deck suffisant : pioche directe du nombre demandé, aucun remélange", async () => {
        const recall = vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(0);
        const deck = {id: "deck-1", availableCards: [{id: "a"}, {id: "b"}, {id: "c"}, {id: "d"}]};

        const drawn = await CombatTurn.drawWithRecall(makeUser(), makeActor(), {id: "hand-1"}, deck, 3);

        expect(recall).not.toHaveBeenCalled();
        expect(socket.executeAsUser).toHaveBeenCalledWith("drawCard", "user-1", "hand-1", "deck-1", 3);
        expect(drawn).toBe(3);
    });

    it("deck à sec : la défausse est ramenée AVANT le tirage, et tout le monde est alerté", async () => {
        const order = [];
        const deck = {id: "deck-1", availableCards: [{id: "reste"}]};
        vi.spyOn(TradingCards, "recallCardsFromPiles").mockImplementation(async () => {
            order.push("recall");
            deck.availableCards = [{id: "reste"}, {id: "p1"}, {id: "p2"}];
            return 2;
        });
        vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue(["p2"]);
        socket.executeAsUser.mockImplementation(() => order.push("draw"));

        const drawn = await CombatTurn.drawWithRecall(makeUser(), makeActor(), {id: "hand-1"}, deck, 2);

        expect(order).toEqual(["recall", "draw"]);
        expect(socket.executeForEveryone).toHaveBeenCalledWith("deckShuffledAlert", "user-1", "Perso");
        // Une seule pioche groupée : la carte restante puis les recyclées tirées au hasard.
        expect(socket.executeAsUser).toHaveBeenCalledWith("passCards", "user-1", "hand-1", "deck-1", ["reste", "p2"]);
        expect(drawn).toBe(2);
    });

    it("rien à recycler : aucune alerte, et la pioche se limite à ce qui reste", async () => {
        vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(0);
        vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue([]);
        const deck = {id: "deck-1", availableCards: [{id: "reste"}]};

        const drawn = await CombatTurn.drawWithRecall(makeUser(), makeActor(), {id: "hand-1"}, deck, 3);

        expect(socket.executeForEveryone).not.toHaveBeenCalled();
        expect(socket.executeAsUser).toHaveBeenCalledWith("passCards", "user-1", "hand-1", "deck-1", ["reste"]);
        expect(drawn).toBe(1);
    });

    it("aucun rang d'épuisement n'est infligé quand le deck se vide", async () => {
        vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(3);
        vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue(["p1"]);
        const actor = makeActor();

        await CombatTurn.drawWithRecall(makeUser(), actor, {id: "hand-1"}, {id: "deck-1", availableCards: []}, 2);

        expect(actor.update).not.toHaveBeenCalled();
    });

    it("joueur déconnecté : la pioche est déléguée au MJ", async () => {
        vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(0);
        const deck = {id: "deck-1", availableCards: [{id: "a"}, {id: "b"}]};

        await CombatTurn.drawWithRecall(makeUser(false), makeActor(), {id: "hand-1"}, deck, 1);

        expect(socket.executeAsGM).toHaveBeenCalledWith("drawCard", "hand-1", "deck-1", 1);
        expect(socket.executeAsUser).not.toHaveBeenCalled();
    });
});
