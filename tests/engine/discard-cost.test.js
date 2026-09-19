import {beforeEach, describe, expect, it, vi} from "vitest";
import DiscardCost from "../../src/domain/engine/shared/discard-cost.js";
import CardSelection from "../../src/domain/interface/window/card-selection.js";

/**
 * Coût en défausse d'une carte (`drop`) : combien de cartes il réclame, lesquelles
 * de la main peuvent le payer, et comment le paiement se déroule — voile de
 * sélection, transfert vers la pile, renoncement.
 */

/**
 * Construit une carte de main.
 *
 * @param {string}   id        - L'id de la carte.
 * @param {object[]} [choices] - Les choix de la carte.
 *
 * @returns {object} La carte.
 */
function handCard(id, choices = [{}]) {
    return {id, name: `FQCARDTITLE.${id}`, system: {fq: {choices}}};
}

/**
 * Construit la carte jouée et sa main.
 *
 * @param {object[]} others - Les autres cartes de la main.
 *
 * @returns {object} La carte jouée (son `parent` porte la main complète).
 */
function playedCardIn(others) {
    const played = handCard("played");
    played.parent = {cards: [played, ...others], pass: vi.fn().mockResolvedValue([])};
    return played;
}

describe("DiscardCost", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe("required", () => {
        it("traduit un coût négatif en nombre de cartes à défausser", () => {
            expect(DiscardCost.required({drop: -3})).toBe(3);
        });

        it("ne réclame rien sans coût déclaré, ni pour un gain", () => {
            expect(DiscardCost.required({})).toBe(0);
            expect(DiscardCost.required({drop: 2})).toBe(0);
        });

        it("ne réclame JAMAIS rien hors combat", () => {
            const combat = game.combat;
            game.combat = null;
            try {
                expect(DiscardCost.required({drop: -3})).toBe(0);
            } finally {
                game.combat = combat;
            }
        });
    });

    describe("eligibleCards", () => {
        it("exclut la carte jouée elle-même", () => {
            const card = playedCardIn([handCard("a")]);
            expect(DiscardCost.eligibleCards(card).map(c => c.id)).toEqual(["a"]);
        });

        it("exclut une carte éphémère : jouer est sa seule sortie de la main", () => {
            const card = playedCardIn([handCard("a"), handCard("eph", [{replayable: "ephemere"}])]);
            expect(DiscardCost.eligibleCards(card).map(c => c.id)).toEqual(["a"]);
        });

        it("exclut une carte épuisée (passif posé, charge consommée)", () => {
            const card = playedCardIn([handCard("a"), handCard("used", [{hasBeenPlayed: true}])]);
            expect(DiscardCost.eligibleCards(card).map(c => c.id)).toEqual(["a"]);
        });
    });

    describe("canPay", () => {
        it("accepte une main assez fournie, la carte jouée non comptée", () => {
            expect(DiscardCost.canPay({drop: -2}, playedCardIn([handCard("a"), handCard("b")]))).toBe(true);
        });

        it("refuse quand la carte jouée est la seule à pouvoir compléter le compte", () => {
            expect(DiscardCost.canPay({drop: -2}, playedCardIn([handCard("a")]))).toBe(false);
        });

        it("accepte tout choix sans coût en défausse", () => {
            expect(DiscardCost.canPay({}, playedCardIn([]))).toBe(true);
        });
    });

    describe("verify", () => {
        it("laisse passer et ne publie rien quand le coût est payable", () => {
            expect(DiscardCost.verify({drop: -1}, playedCardIn([handCard("a")]))).toBe(true);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("refuse et avertit quand la main est trop courte", () => {
            expect(DiscardCost.verify({drop: -2}, playedCardIn([handCard("a")]))).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalled();
        });

        it("refuse SANS rien publier en mode silencieux (carte réactive armée)", () => {
            expect(DiscardCost.verify({drop: -2}, playedCardIn([]), {silent: true})).toBe(false);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });
    });

    describe("pay", () => {
        it("ne montre aucun voile et laisse passer quand rien n'est exigé", async () => {
            const veil = vi.spyOn(CardSelection, "openSelectionVeil");
            const card = playedCardIn([handCard("a")]);

            await expect(DiscardCost.pay({}, card, {})).resolves.toBe(true);
            expect(veil).not.toHaveBeenCalled();
        });

        it("propose les cartes défaussables et transfère la sélection à la pile", async () => {
            const veil = vi.spyOn(CardSelection, "openSelectionVeil")
                .mockImplementation(async (cards, count) => cards.slice(0, count));
            const card = playedCardIn([handCard("a"), handCard("b"), handCard("c")]);
            const pile = {id: "pile-1"};

            await expect(DiscardCost.pay({drop: -2}, card, pile)).resolves.toBe(true);

            expect(veil).toHaveBeenCalledWith(
                [expect.objectContaining({id: "a"}), expect.objectContaining({id: "b"}),
                    expect.objectContaining({id: "c"})],
                2, expect.any(Object));
            expect(card.parent.pass).toHaveBeenCalledWith(pile, ["a", "b"], expect.any(Object));
        });

        it("renonce au jeu quand la sélection est annulée : rien ne quitte la main", async () => {
            vi.spyOn(CardSelection, "openSelectionVeil").mockResolvedValue(null);
            const card = playedCardIn([handCard("a"), handCard("b")]);

            await expect(DiscardCost.pay({drop: -2}, card, {})).resolves.toBe(false);
            expect(card.parent.pass).not.toHaveBeenCalled();
        });

        it("n'ouvre pas le voile sur une sélection impossible à compléter", async () => {
            const veil = vi.spyOn(CardSelection, "openSelectionVeil");
            const card = playedCardIn([handCard("a")]);

            await expect(DiscardCost.pay({drop: -3}, card, {})).resolves.toBe(false);
            expect(veil).not.toHaveBeenCalled();
            expect(ChatMessage.create).toHaveBeenCalled();
        });

        it("notifie une erreur de transfert sans faire échouer le paiement", async () => {
            vi.spyOn(CardSelection, "openSelectionVeil").mockImplementation(async cards => [cards[0]]);
            const card = playedCardIn([handCard("a")]);
            card.parent.pass = vi.fn().mockRejectedValue(new Error("boom"));

            await expect(DiscardCost.pay({drop: -1}, card, {})).resolves.toBe(true);
            expect(ui.notifications.error).toHaveBeenCalledWith("boom");
        });
    });
});
