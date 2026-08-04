import {beforeEach, describe, expect, test, vi} from "vitest";
import PlayCard from "../../src/domain/utils/play-card.js";
import {makeCard} from "../factories.js";

vi.mock("../../src/hook/socket-lib.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

const FQUtils = await import("../../src/domain/utils/fq-utils.js");
vi.mock("../../src/domain/utils/fq-utils.js", () => ({
    default: {
        replaceCardContentAbilitiesBonus: vi.fn(),
        prepareDataFromCard: vi.fn(),
        applyCardEffect: vi.fn(),
        replaceCardContentXAndYValue: vi.fn().mockResolvedValue(true),
        checkIfCanUseCard: vi.fn().mockResolvedValue(true),
    }
}));

global.game = {
    user: {
        character: {
            name: "Test Character",
            system: {fq: {cards: {currentDrop: 0}}},
            update: vi.fn()
        },
        isGM: false,
    },
    i18n: {
        localize: (key) => key,
        format: (key, obj) => `${key} ${JSON.stringify(obj)}`,
    },
    combat: {round: 1},
};
global.ui = {
    notifications: {
        error: vi.fn(),
        warn: vi.fn(),
    },
};
global.CONFIG = {
    FqCardEngine: {
        options: {
            GMUsingCards: false,
            hideMessages: false,
            betterChatMessages: true,
        }
    }
};
global.ChatMessage = {
    create: vi.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
    getSpeaker: vi.fn().mockResolvedValue({alias: "Test Character"}),
};

describe("PlayCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("discardCard", () => {
        test("should warn and not discard the card if card has been played", async () => {
            const cardContent = {hasBeenPlayed: true};
            const card = {};
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.discardCard({}, {}, cardContent, card, currentCards);

            expect(ChatMessage.create).toHaveBeenCalledWith({
                speaker: expect.any(Object),
                content: expect.stringContaining("FQCARDENGINE.WarningMsgCantDropPlayedCard"),
            });
            expect(currentCards.pass).not.toHaveBeenCalled();
        });

        test("should discard the card if it has not been played", async () => {
            const cardContent = {hasBeenPlayed: false};
            const card = {id: "mockCardId", _id: "mockCardId", back: {img: "mockImg"}, origin: {name: "mockName"}};
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.discardCard({}, {}, cardContent, card, currentCards);

            expect(game.user.character.update).toHaveBeenCalledWith({
                "system.fq.cards.currentDrop": 1,
            });
            expect(currentCards.pass).toHaveBeenCalledWith({}, ["mockCardId"], expect.any(Object));
        });

        test("should call ui.notifications.error when currentCards.pass rejects", async () => {
            const cardContent = {hasBeenPlayed: false};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockRejectedValue(new Error("boom"))};

            await PlayCard.discardCard({}, {}, cardContent, card, currentCards);

            expect(ui.notifications.error).toHaveBeenCalledWith("boom");
        });
    });

    describe("callBackplayCard", () => {
        test("should replace card content abilities bonus", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"}, flags: {}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.replaceCardContentAbilitiesBonus).toHaveBeenCalledWith(cardContent);
            expect(FQUtils.default.prepareDataFromCard).toHaveBeenCalledWith(cardContent);
        });

        test("should apply card effect and pass the card if needed", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"}, flags: {}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {});
            expect(currentCards.pass).toHaveBeenCalledWith({}, ["mockCardId"], expect.any(Object));
        });

        test("should apply card effect and pass card if FQBase flag", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"},
                system: {fq: {isBase: true}}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {});
            expect(currentCards.pass).toHaveBeenCalledWith({}, ["mockCardId"], expect.any(Object));
        });

        test("should not apply effect or pass card when checkIfCanUseCard returns false", async () => {
            const cardContent = {};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockResolvedValue()};
            FQUtils.default.replaceCardContentXAndYValue.mockResolvedValue(true);
            // CRUCIAL : checkIfCanUseCard est appelé de façon SYNCHRONE dans le code
            // (`if (!FQUtils.checkIfCanUseCard(...))`) : on utilise mockReturnValue(false),
            // pas mockResolvedValue(false), sinon la Promise résolue serait truthy et ne
            // bloquerait pas l'exécution.
            FQUtils.default.checkIfCanUseCard.mockReturnValue(false);

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.applyCardEffect).not.toHaveBeenCalled();
            expect(currentCards.pass).not.toHaveBeenCalled();

            // Restaure le comportement par défaut pour ne pas polluer les tests suivants.
            FQUtils.default.checkIfCanUseCard.mockReturnValue(true);
        });

        test("should not apply effect or pass card when replaceCardContentXAndYValue resolves false", async () => {
            const cardContent = {};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockResolvedValue()};
            FQUtils.default.checkIfCanUseCard.mockReturnValue(true);
            FQUtils.default.replaceCardContentXAndYValue.mockResolvedValue(false);

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.replaceCardContentAbilitiesBonus).toHaveBeenCalled();
            expect(FQUtils.default.applyCardEffect).not.toHaveBeenCalled();
            expect(currentCards.pass).not.toHaveBeenCalled();

            // Restaure le comportement par défaut pour ne pas polluer les tests suivants.
            FQUtils.default.replaceCardContentXAndYValue.mockResolvedValue(true);
        });

        test("should call ui.notifications.error when currentCards.pass rejects", async () => {
            const cardContent = {};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockRejectedValue(new Error("pass failed"))};
            FQUtils.default.checkIfCanUseCard.mockReturnValue(true);
            FQUtils.default.replaceCardContentXAndYValue.mockResolvedValue(true);

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(ui.notifications.error).toHaveBeenCalledWith("pass failed");
        });
    });

    describe("renderChatMessage", () => {
        test("should render and create chat message", async () => {
            const card = {
                face: null, back: {img: "mockBackImg"},
                origin: {name: "mockDeckName"}, name: "mockCardName", _id: "mockCardId"
            };

            await PlayCard.renderChatMessage({}, {}, card, "FQCARDENGINE.CardPlayed");

            expect(ChatMessage.create).toHaveBeenCalledWith(expect.any(Object));
        });
    });
});
