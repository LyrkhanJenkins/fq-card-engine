import {beforeEach, describe, expect, test, vi} from "vitest";
import PlayCard from "../../src/domain/utils/play-card.js";

vi.mock("../../src/fq-card-engine-module.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

const FQUtils = await import("../../src/domain/utils/fq-utils.js");
vi.mock("../../src/utils/fq-utils.js", () => ({
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
global.renderTemplate = async (template, data) => `<div>${template} - ${JSON.stringify(data)}</div>`;

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

        test("should apply card effect and not pass card if FQBase flag", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"},
                system: {fq: {isBase: true}}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.default.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {});
            expect(currentCards.pass).toHaveBeenCalledTimes(0);
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
