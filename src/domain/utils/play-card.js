import FqConstants, {WARNING_COLOR} from "./fq-constants.js";
import FQUtils from "./fq-utils.js";

/**
 * Orchestration du jeu et de la défausse d'une carte : gestion des cartes
 * rejouables (passives/à charges), application des effets, envoi des messages de
 * chat et transfert de la carte vers la pile de défausse.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class PlayCard {
    /**
     * Défausse une carte vers la pile cible. Bloque la défausse d'une carte déjà
     * jouée, incrémente le compteur de défausses du personnage puis transfère la
     * carte (face cachée si demandé).
     *
     * @param {Cards}  to           - La pile de défausse cible.
     * @param {object} fd           - Les données du formulaire du dialogue (ex. `down` pour face cachée).
     * @param {object} cardContent  - Le contenu (choix) de la carte.
     * @param {Card}   card         - La carte à défausser.
     * @param {Cards}  currentCards - La main courante contenant la carte.
     *
     * @returns {Promise<*>|void} La promesse du transfert, ou undefined si la défausse est bloquée.
     */
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

    /**
     * Callback principal du jeu d'une carte, déclenché à la validation du dialogue.
     * Recalcule le contenu (bonus de caractéristiques, variables X/Y), vérifie que
     * la carte peut être utilisée, gère la logique de rejouabilité (passive ou à
     * charges), transfère la carte vers la défausse le cas échéant, puis applique
     * les effets de la carte.
     *
     * @param {Cards}    to               - La pile de défausse cible.
     * @param {object}   fd               - Les données du formulaire du dialogue (XXX, YYY, down…).
     * @param {object}   cardContent      - Le contenu (choix) sélectionné de la carte.
     * @param {boolean}  hasVariables     - True si le contenu contient des variables X/Y à résoudre.
     * @param {object[]} initCardContents - Les contenus d'origine de la carte (avant recalcul), pour réécriture.
     * @param {Cards}    currentCards     - La main courante contenant la carte.
     * @param {Card}     card             - La carte jouée.
     *
     * @returns {Promise<*>|null} La promesse du transfert de la carte, ou null si la carte n'est pas transférée.
     */
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
            } else if (cardContent?.replayable) {
                cardContent.replayable = await FQUtils.rollResultAsync(cardContent.replayable);
                if (Number(cardContent?.replayable) > 1) {
                    FQUtils.rewriteCardContent(card, initCardContents, {
                        replayable: Number(cardContent?.replayable) - 1, hasBeenPlayed: true
                    });
                }
                if (Number(cardContent.replayable) > 100) {
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

    /**
     * Construit et publie le message de chat « carte jouée / défaussée » enrichi
     * (visuel de la carte, face visible ou dos selon `fd.down`), uniquement si
     * l'option `betterChatMessages` est active.
     *
     * @param {Cards}  to          - La pile cible du transfert (contexte du message).
     * @param {object} fd          - Les données du formulaire (ex. `down` pour face cachée).
     * @param {Card}   card        - La carte concernée par le message.
     * @param {string} actionLabel - La clé de localisation du libellé d'action à afficher.
     *
     * @returns {void}
     */
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
