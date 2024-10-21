import PlayCard from "../../scripts/utils/play-card.js";

jest.mock("../../scripts/fq-card-engine-module.js", () => ({
    socket: {
        executeAsGM: jest.fn()
    }
}));

const FQUtils = require("../../scripts/utils/fq-utils.js");
jest.mock("../../scripts/utils/fq-utils.js", () => ({
    replaceCardContentAbilitiesBonus: jest.fn(),
    prepareDataFromCard: jest.fn(),
    applyCardEffect: jest.fn(),
    replaceCardContentXAndYValue: jest.fn().mockResolvedValue(true),
    checkIfCanUseCard: jest.fn().mockResolvedValue(true),
}));

global.game = {
    user: {
        character: {
            name: "Test Character",
            system: {fq: {cards: {currentDrop: 0}}},
            update: jest.fn()
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
        error: jest.fn(),
        warn: jest.fn(),
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
    create: jest.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
    getSpeaker: jest.fn().mockResolvedValue({alias: "Test Character"}),
};

global.renderTemplate = async (template, data) => `<div>${template} - ${JSON.stringify(data)}</div>`;

describe("PlayCard", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("discardCard", () => {
        test("should warn and not discard the card if card has been played", async () => {
            const cardContent = {hasBeenPlayed: true};
            const card = {};
            const currentCards = {
                pass: jest.fn().mockResolvedValue(),
            };

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
            const currentCards = {
                pass: jest.fn().mockResolvedValue(),
            };

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
            const card = {id: "mockCardId", _id: "mockCardId", back: {img: "mockImg"}, origin: {name: "mockName"}};
            const currentCards = {
                pass: jest.fn().mockResolvedValue(),
            };

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.replaceCardContentAbilitiesBonus).toHaveBeenCalledWith(cardContent);
            expect(FQUtils.prepareDataFromCard).toHaveBeenCalledWith(cardContent);
        });

        test("should apply card effect and pass the card if needed", async () => {
            const cardContent = {};
            const card = {id: "mockCardId", _id: "mockCardId", back: {img: "mockImg"}, origin: {name: "mockName"}};
            const currentCards = {
                pass: jest.fn().mockResolvedValue(),
            };

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(FQUtils.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {});
            expect(currentCards.pass).toHaveBeenCalledWith({}, ["mockCardId"], expect.any(Object));
        });
    });

    describe("renderChatMessage", () => {
        test("should render and create chat message", async () => {
            const card = {
                face: null,
                back: {img: "mockBackImg"},
                origin: {name: "mockDeckName"},
                name: "mockCardName",
                _id: "mockCardId"
            };

            await PlayCard.renderChatMessage({}, {}, card, "FQCARDENGINE.CardPlayed");

            expect(ChatMessage.create).toHaveBeenCalledWith(expect.any(Object));
        });
    });
});
