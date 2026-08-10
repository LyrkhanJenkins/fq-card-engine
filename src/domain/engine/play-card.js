import Constants from "../constants.js";
import CardEffect from "./shared/card-effect.js";
import RollService from "./roll/roll-service.js";
import {createWarning} from "../../core/utils/chat.utils.js";

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
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCantDropPlayedCard"), {actor: game.user.character});
            return;
        }

        // Add +1 on drop card
        game.user.character.update({
            "system.fq.cards.currentDrop": Constants.actorFQ.cards.currentDrop + 1
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
     * Le contenu est déjà entièrement recalculé en amont (bonus de caractéristiques,
     * variables X/Y, données dérivées) par `playValidatedCard` ; cette méthode vérifie
     * que la carte peut être utilisée, gère la logique de rejouabilité (passive ou à
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
        if (!CardEffect.checkIfCanUseCard(cardContent, card)) {
            return;
        }

        // Check pour savoir si la carte est rejouable et si on va la passer à la défausse.
        if (!!cardContent && !!cardContent?.replayable) {
            if (cardContent?.replayable === "passif") {
                CardEffect.rewriteCardContent(card, initCardContents, {
                    hasBeenPlayed: true, passivePlayedRound: game.combat?.round.toString()
                });
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<div style='color: green;font-style: italic;font-weight: 700'>${game.i18n.localize("FQCARDENGINE.InfoMsgPassiveSpell")}</div>`
                });
            } else if (cardContent?.replayable) {
                cardContent.replayable = RollService.rollResultSync(cardContent.replayable);
                if (Number(cardContent?.replayable) > 1) {
                    CardEffect.rewriteCardContent(card, initCardContents, {
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

        PlayCard.renderChatMessage(to, fd, card, "FQCARDENGINE.CardPlayed", {
            cardContent, hasVariables, hasSeveralChoices: (initCardContents?.length ?? 0) > 1
        });

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

        await CardEffect.applyCardEffect(cardContent, card, fd);

        return result;
    }

    /**
     * Construit et publie le message de chat consolidé « carte jouée / défaussée »
     * (visuel de la carte, face visible ou dos selon `fd.down`) enrichi des choix
     * faits par l'utilisateur dans le dialogue de jeu — effet retenu, valeurs X/Y
     * saisies et cibles visées — uniquement si l'option `betterChatMessages` est
     * active. Ce message absorbe l'ancien message séparé « Choix de l'effet ». Les
     * jets de dés (Dice So Nice) et le récapitulatif des résultats restent des
     * messages distincts.
     *
     * @param {Cards}  to          - La pile cible du transfert (contexte du message).
     * @param {object} fd          - Les données du formulaire (ex. `down` pour face cachée, `XXX`/`YYY`).
     * @param {Card}   card        - La carte concernée par le message.
     * @param {string} actionLabel - La clé de localisation du libellé d'action à afficher.
     * @param {object} [choiceData] - Les choix faits dans le dialogue à reporter (jeu uniquement).
     * @param {object} [choiceData.cardContent]      - Le contenu (choix) retenu, déjà résolu (X/Y substitués).
     * @param {boolean} [choiceData.hasVariables]    - True si l'utilisateur a saisi des valeurs X/Y.
     * @param {boolean} [choiceData.hasSeveralChoices] - True si la carte proposait plusieurs choix d'effet.
     *
     * @returns {void}
     */
    static renderChatMessage(to, fd, card, actionLabel, choiceData = {}) {
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
                action: game.i18n.localize(actionLabel),
                hidden: !!fd.down,
                hiddenLabel: game.i18n.localize("FQCARDENGINE.ChatMessagePartHidden"),
                ...PlayCard.buildChoiceRenderData(fd, choiceData)
            };

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

    /**
     * Assemble, pour le message de chat consolidé, les données décrivant les choix
     * faits par l'utilisateur : effet retenu (si la carte proposait plusieurs
     * choix), valeurs X/Y saisies (si la carte a des variables), et cibles visées.
     * Renvoie un objet vide de détails si aucun `cardContent` n'est fourni (ex.
     * défausse : la carte n'est pas résolue, aucun choix à reporter).
     *
     * @param {object} fd         - Les données du formulaire (`XXX`, `YYY`, `nameContent`…).
     * @param {object} choiceData - Les choix faits (`cardContent`, `hasVariables`, `hasSeveralChoices`).
     *
     * @returns {object} Les champs de rendu des choix pour le template de message.
     */
    static buildChoiceRenderData(fd, choiceData = {}) {
        const {cardContent, hasVariables, hasSeveralChoices} = choiceData;
        if (!cardContent) {
            return {hasDetails: false, targets: []};
        }

        const isFilled = value => value !== undefined && value !== null && value !== "";
        const showX = !!hasVariables && isFilled(fd?.XXX);
        const showY = !!hasVariables && isFilled(fd?.YYY);
        const choiceName = (hasSeveralChoices && cardContent?.name) ? game.i18n.localize(cardContent.name) : null;

        let targets = [];
        try {
            targets = CardEffect.cardTargetsOthers(cardContent) ? Constants.myTargets(cardContent.targetType).map(target => ({
                name: target.document?.name ?? target.name ?? "",
                img: target.document?.texture?.src
            })) : [];
        } catch (e) {
            // Certains types de cible (ex. squelettes) supposent un contexte de scène
            // complet absent hors jeu : on retombe sur une liste vide plutôt que
            // d'interrompre la publication du message.
            targets = [];
        }

        return {
            hasDetails: !!choiceName || showX || showY || targets.length > 0,
            choiceName,
            effectLabel: game.i18n.localize("FQCARDENGINE.ChatMessagePartChoice"),
            hasX: showX,
            xValue: fd?.XXX,
            hasY: showY,
            yValue: fd?.YYY,
            targets,
            targetsLabel: game.i18n.localize("FQCARDENGINE.ChatMessagePartTargets")
        };
    }

    /**
     * Enregistre dans les flags du combat actif une entrée de log décrivant la
     * carte jouée : acteur, cibles, round/tour, résultats et contenu de la carte.
     * N'a aucun effet hors combat.
     *
     * @param {object[]} initResultatArray - Le tableau des résultats de l'effet joué.
     * @param {object}   cardContent       - Le contenu (choix) de la carte jouée.
     *
     * @returns {void}
     */
    static logCardPlayed(initResultatArray, cardContent) {
        if (game.combat) {
            let FQLogs = game.combat.flags.fq?.logs ? game.combat.flags.fq?.logs : [];
            let resultArray = [...initResultatArray];
            FQLogs.push({
                "actorId": game.user.character.id,
                "targetsId": Constants.myTargets(cardContent.targetType).map(t => t.document.actorId),
                "round": game.combat.round,
                "turn": game.combat.turn,
                resultArray: {...resultArray},
                "cardContent": {...cardContent}
            });

            game.combat.update({
                "flags.fq": {logs: FQLogs}
            });
        }
    }
}
