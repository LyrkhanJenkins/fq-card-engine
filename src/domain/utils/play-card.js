import FqConstants, {WARNING_COLOR} from "./fq-constants.js";
import FQUtils from "./fq-utils.js";

export default class PlayCard {
    static async discardCard(to, fd, cardContent, card, currentCards) {
        if (cardContent?.hasBeenPlayed) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                    ${game.i18n.localize("FQCARDENGINE.WarningMsgCantDropPlayedCard")}</span>`
            });
            return;
        }

        // Add +1 on drop card
        game.user.character.update({
            "system.fq.cards.currentDrop": FqConstants.actorFQ.cards.currentDrop + 1
        });
        this.renderChatMessage(to, fd, card, "FQCARDENGINE.CardDiscard");

        return currentCards.pass(to, [card.id], {
            action: "pass",
            chatNotification: !CONFIG.FqCardEngine.options.hideMessages,
            updateData: fd.down ? {face: null} : {}
        }).catch(err => {
            return ui.notifications.error(err.message);
        });
    }

    static async callBackplayCard(to, fd, cardContent, hasVariables, initCardContents, currentCards, card) {
        // Recalcul de la carte à partir des bonus de caractéristiques
        FQUtils.replaceCardContentAbilitiesBonus(cardContent);
        // Recalcul de la carte à partir des valeurs X, Y donné par l'utilisateur
        if (!await FQUtils.replaceCardContentXAndYValue(cardContent, hasVariables, fd.XXX, fd.YYY)) {
            return;
        }
        await FQUtils.prepareDataFromCard(cardContent);

        if (!FQUtils.checkIfCanUseCard(cardContent, card)) {
            return;
        }

        // Check pour savoir si la carte est rejouable et si on va la passer à la défausse. TODO TESTER
        if (!!cardContent && !!cardContent?.replayable) {
            if (cardContent?.replayable === "passif") {
                FQUtils.rewriteCardContent(card, initCardContents, {
                    hasBeenPlayed: true, passivePlayedRound: game.combat?.round.toString()
                });
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<div style='color: green;font-style: italic;font-weight: 700'>${game.i18n.localize("FQCARDENGINE.InfoMsgPassiveSpell")}</div>`
                });
            } else if (Number(cardContent?.replayable) && Number(cardContent?.replayable) > 1) {
                cardContent.replayable = await FQUtils.rollResultAsync(cardContent.replayable);
                FQUtils.rewriteCardContent(card, initCardContents, {
                    replayable: Number(cardContent?.replayable) - 1, hasBeenPlayed: true
                });
                if (Number(cardContent.replayable) > 100){
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                        content: `<div style='color: green;font-style: italic;font-weight: 700'>${game.i18n.format("FQCARDENGINE.InfoMsgReplayableSpell")}</div>`
                    });
                } else {
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                        content: `<div style='color: green;font-style: italic;font-weight: 700'>${game.i18n.format("FQCARDENGINE.InfoMsgRemainingCharge",
                            {remainingCharge: Number(cardContent.replayable) - 1})}</div>`
                    });
                }
            }
        }

        PlayCard.renderChatMessage(to, fd, card, "FQCARDENGINE.CardPlayed");

        let result = null;

        if (cardContent &&
            (!cardContent.replayable || (cardContent.replayable !== "passif" && cardContent.replayable <= 1)) &&
            (!game.user?.isGM || CONFIG.FqCardEngine.options.GMUsingCards)
        ) {
            result = currentCards.pass(to, [card.id], {
                action: "pass",
                chatNotification: !CONFIG.FqCardEngine.options.hideMessages,
                updateData: fd.down ? {face: null} : {}
            }).catch(err => {
                return ui.notifications.error(err.message);
            });
        }

        await FQUtils.applyCardEffect(cardContent, card, fd);

        return result;
    }

    static renderChatMessage(to, fd, card, actionLabel) {
        if (CONFIG.FqCardEngine.options.betterChatMessages) {

            if (fd.down && card.face != null) {
                card.flip();
            }
            let img = card.back.img;
            if (card.face != null && !fd.down) {
                if (!card.faces) {
                    img = undefined;
                } else {
                    img = card.faces[card.face].img;
                }
            }
            if (card.face && !img) {
                img = card.data.faces[card.data.face].img;
            }

            let cardID = card._id ? card._id : card.data._id;
            let renderData = {
                id: cardID,
                back: (card.face == null || fd.down),
                img: img,
                deckName: card.origin.name,
                name: (card.face !== null && !fd.down) ? game.i18n.localize(card.name) : game.i18n.localize("FQCARDENGINE.CardHidden"),
                action: game.i18n.localize(actionLabel)
            };

            //TODO refacto Chat-Messages
            foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/chat-message.hbs", renderData).then(content => {
                const messageData = {
                    speaker: {
                        scene: game.scenes?.active?.id, actor: game.userId, token: null, alias: null,
                    }, content: content,
                };
                ChatMessage.create(messageData);

            });
        }
    }
}
