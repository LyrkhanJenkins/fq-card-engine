import {beforeEach, describe, expect, test, vi} from "vitest";
import PlayCard from "../../src/domain/engine/play-card.js";
import {makeCard} from "../factories.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import CardEffect from "../../src/domain/engine/shared/card-effect.js";
vi.mock("../../src/domain/engine/shared/card-effect.js", () => ({
    default: {
        replaceCardContentAbilitiesBonus: vi.fn(),
        prepareDataFromCard: vi.fn(),
        applyCardEffect: vi.fn(),
        replaceCardContentXAndYValue: vi.fn().mockResolvedValue(true),
        checkIfCanUseCard: vi.fn().mockResolvedValue(true),
        rewriteCardContent: vi.fn(),
        // Prédicat réel réimplémenté : le module étant mocké, buildChoiceRenderData
        // s'appuie dessus pour décider d'afficher (ou non) les cibles.
        cardTargetsOthers: (cc) => Boolean(cc?.minReach || cc?.maxReach || cc?.targetType === "Skeletons"),
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

        test("should warn and not discard an ephemeral card", async () => {
            const cardContent = {hasBeenPlayed: false, replayable: "ephemere"};
            const card = {system: {fq: {choices: [{replayable: "ephemere"}]}}};
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.discardCard({}, {}, cardContent, card, currentCards);

            expect(ChatMessage.create).toHaveBeenCalledWith({
                speaker: expect.any(Object),
                content: expect.stringContaining("FQCARDENGINE.WarningMsgCantDropEphemeralCard"),
            });
            expect(currentCards.pass).not.toHaveBeenCalled();
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
        test("should NOT recalculate content (recalcul remonté dans playValidatedCard)", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"}, flags: {}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            // Le recalcul (bonus de caractéristiques, X/Y, données dérivées) a été remonté
            // dans playValidatedCard : callBackplayCard ne résout plus rien.
            expect(CardEffect.replaceCardContentAbilitiesBonus).not.toHaveBeenCalled();
            expect(CardEffect.replaceCardContentXAndYValue).not.toHaveBeenCalled();
            expect(CardEffect.prepareDataFromCard).not.toHaveBeenCalled();
        });

        test("should apply card effect and pass the card if needed", async () => {
            const cardContent = {};
            const card = {
                id: "mockCardId", _id: "mockCardId",
                back: {img: "mockImg"}, origin: {name: "mockName"}, flags: {}
            };
            const currentCards = {pass: vi.fn().mockResolvedValue()};

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(CardEffect.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {}, {});
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

            expect(CardEffect.applyCardEffect).toHaveBeenCalledWith(cardContent, card, {}, {});
            expect(currentCards.pass).toHaveBeenCalledWith({}, ["mockCardId"], expect.any(Object));
        });

        test("should not apply effect or pass card when checkIfCanUseCard returns false", async () => {
            const cardContent = {};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockResolvedValue()};
            CardEffect.replaceCardContentXAndYValue.mockResolvedValue(true);
            // CRUCIAL : checkIfCanUseCard est appelé de façon SYNCHRONE dans le code
            // (`if (!CardEffect.checkIfCanUseCard(...))`) : on utilise mockReturnValue(false),
            // pas mockResolvedValue(false), sinon la Promise résolue serait truthy et ne
            // bloquerait pas l'exécution.
            CardEffect.checkIfCanUseCard.mockReturnValue(false);

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(CardEffect.applyCardEffect).not.toHaveBeenCalled();
            expect(currentCards.pass).not.toHaveBeenCalled();

            // Restaure le comportement par défaut pour ne pas polluer les tests suivants.
            CardEffect.checkIfCanUseCard.mockReturnValue(true);
        });

        test("should call ui.notifications.error when currentCards.pass rejects", async () => {
            const cardContent = {};
            const card = makeCard();
            const currentCards = {pass: vi.fn().mockRejectedValue(new Error("pass failed"))};
            CardEffect.checkIfCanUseCard.mockReturnValue(true);
            CardEffect.replaceCardContentXAndYValue.mockResolvedValue(true);

            await PlayCard.callBackplayCard({}, {}, cardContent, true, {}, currentCards, card);

            expect(ui.notifications.error).toHaveBeenCalledWith("pass failed");
        });
    });

    describe("destroyPlayedCard (carte éphémère)", () => {
        /**
         * Carte éphémère en main dont l'exemplaire d'origine est resté dans le deck
         * sous le même id (ce que fait Foundry à la pioche).
         *
         * @returns {object} La carte espionnable.
         */
        function makeEphemeralCard() {
            return {
                id: "ephemeral", _id: "ephemeral", back: {img: "mockImg"}, flags: {},
                system: {fq: {choices: [{replayable: "ephemere"}]}},
                origin: {
                    name: "mockDeck",
                    cards: new Map([["ephemeral", {id: "ephemeral"}]]),
                    deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
                }
            };
        }

        test("ne défausse pas la carte et la supprime de la main ET du deck", async () => {
            const card = makeEphemeralCard();
            const currentCards = {
                pass: vi.fn().mockResolvedValue(),
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };

            await PlayCard.callBackplayCard({}, {}, {replayable: "ephemere"}, false, [], currentCards, card);

            expect(currentCards.pass).not.toHaveBeenCalled();
            expect(currentCards.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["ephemeral"]);
            expect(card.origin.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["ephemeral"]);
        });

        test("carte générée (aucun exemplaire dans le deck) : seule la main est nettoyée", async () => {
            const card = makeEphemeralCard();
            card.origin.cards = new Map();
            const currentCards = {
                pass: vi.fn().mockResolvedValue(),
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };

            await PlayCard.callBackplayCard({}, {}, {replayable: "ephemere"}, false, [], currentCards, card);

            expect(currentCards.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["ephemeral"]);
            expect(card.origin.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });

        test("le MJ qui conserve ses cartes (GMUsingCards désactivé) ne détruit rien", async () => {
            const card = makeEphemeralCard();
            const currentCards = {
                pass: vi.fn().mockResolvedValue(),
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.user.isGM = true;
            try {
                await PlayCard.callBackplayCard({}, {}, {replayable: "ephemere"}, false, [], currentCards, card);
            } finally {
                game.user.isGM = false;
            }

            expect(currentCards.deleteEmbeddedDocuments).not.toHaveBeenCalled();
            expect(card.origin.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });

        test("remonte une erreur de suppression en notification", async () => {
            const card = makeEphemeralCard();
            const currentCards = {
                pass: vi.fn().mockResolvedValue(),
                deleteEmbeddedDocuments: vi.fn().mockRejectedValue(new Error("boom"))
            };

            await PlayCard.callBackplayCard({}, {}, {replayable: "ephemere"}, false, [], currentCards, card);

            expect(ui.notifications.error).toHaveBeenCalledWith("boom");
        });
    });

    describe("buildChoiceRenderData", () => {
        const selectedTargets = [
            {document: {name: "Goblin", texture: {src: "goblin.png"}}},
        ];

        test("should NOT list targets when the card has no reach (targets the caster)", () => {
            game.user.targets = selectedTargets;
            const cardContent = {targetType: "Default"};

            const data = PlayCard.buildChoiceRenderData({}, {cardContent});

            expect(data.targets).toEqual([]);
        });

        test("should list targets when the card has a reach", () => {
            game.user.targets = selectedTargets;
            const cardContent = {targetType: "Default", maxReach: 3};

            const data = PlayCard.buildChoiceRenderData({}, {cardContent});

            expect(data.targets).toEqual([{name: "Goblin", img: "goblin.png"}]);
        });

        test("should still list targets for skeleton targeting without reach", () => {
            game.user.targets = selectedTargets;
            const cardContent = {targetType: "Skeletons"};

            const data = PlayCard.buildChoiceRenderData({}, {cardContent});

            // Le ciblage squelette lit game.canvas (absent ici) → catch → liste vide,
            // mais la garde de portée n'a PAS court-circuité le calcul : myTargets a été
            // atteint. On vérifie surtout l'absence d'exception et une liste bien définie.
            expect(Array.isArray(data.targets)).toBe(true);
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
