import Constants, {SUCCESS_COLOR} from "../constants.js";
import CardEffect from "./shared/card-effect.js";
import RollService from "./roll/roll-service.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";
import {createStatus, createWarning} from "../../core/utils/chat.utils.js";
import TargetingPredicates from "./shared/targeting-predicates.js";

/**
 * Orchestration du jeu et de la défausse d'une carte : gestion des cartes
 * rejouables (passives/à charges), des cartes éphémères (détruites au jeu),
 * application des effets, envoi des messages de chat et transfert de la carte
 * vers la pile de défausse.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class PlayCard {
    /**
     * Défausse une carte vers la pile cible. Bloque la défausse d'une carte déjà
     * jouée ou éphémère, incrémente le compteur de défausses du personnage puis
     * transfère la carte (face cachée si demandé).
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
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCantDropPlayedCard"), {actor: Constants.actorCurrent});
            return;
        }

        // Une carte éphémère n'a qu'une sortie de la main : être jouée, ce qui la
        // détruit. La défausser la rendrait récupérable/rappelable — interdit, au
        // même titre qu'une carte de base (dont le bouton est déjà masqué).
        if (CardFqSystem.hasEphemeralChoice(card)) {
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgCantDropEphemeralCard"), {actor: Constants.actorCurrent});
            return;
        }

        // Add +1 on drop card
        Constants.actorCurrent.update({
            "system.fq.cards.currentDrop": Constants.actorFQ.cards.currentDrop + 1
        });
        this.renderChatMessage(to, fd, card, "FQCARDENGINE.CardDiscard");

        return PlayCard.transferToPile(currentCards, to, card, fd);
    }

    /**
     * Callback principal du jeu d'une carte, déclenché à la validation du dialogue.
     * Le contenu est déjà entièrement recalculé en amont (bonus de caractéristiques,
     * variables X/Y, données dérivées) par `playValidatedCard` ; cette méthode vérifie
     * que la carte peut être utilisée, gère la logique de rejouabilité (passive ou à
     * charges), transfère la carte vers la défausse le cas échéant, puis applique
     * les effets de la carte. Un choix éphémère ne passe jamais par la défausse :
     * la carte est détruite dès la validation, avant l'application des effets
     * (cf. {@link PlayCard.destroyPlayedCard}).
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
        if (!CardEffect.checkIfCanUseCard(cardContent, card, to)) {
            return;
        }

        // AVANT le traitement passif/charges : la copie de la carte prise dans les
        // flags du message (cf. renderChatMessage) doit figer la carte telle qu'elle
        // était en main — rewriteCardContent (hasBeenPlayed, décrément de charge)
        // n'est pas attendu et rendrait la copie non déterministe. Le message carte
        // passe par une microtâche (renderTemplate.then) : il s'affiche toujours
        // après les messages de statut synchrones ci-dessous, comme avant.
        PlayCard.renderChatMessage(to, fd, card, "FQCARDENGINE.CardPlayed", {
            cardContent, hasVariables, hasSeveralChoices: (initCardContents?.length ?? 0) > 1
        });

        // Éphémère et rejouable partagent le champ `replayable` et s'excluent : le
        // traitement « charges/passif » ci-dessous est donc court-circuité.
        const ephemeral = CardFqSystem.isEphemeralChoice(cardContent);
        if (ephemeral) {
            createStatus(game.i18n.localize("FQCARDENGINE.InfoMsgEphemeralSpell"),
                {actor: Constants.actorCurrent, color: "darkred"});
        }

        // Check pour savoir si la carte est rejouable et si on va la passer à la défausse.
        if (!ephemeral && !!cardContent && !!cardContent?.replayable) {
            if (cardContent?.replayable === CardFqSystem.REPLAYABLE_PASSIVE) {
                CardEffect.rewriteCardContent(card, initCardContents, {
                    hasBeenPlayed: true, playedRound: game.combat?.round.toString()
                });
                createStatus(game.i18n.localize("FQCARDENGINE.InfoMsgPassiveSpell"),
                    {actor: Constants.actorCurrent, color: SUCCESS_COLOR});
            } else if (cardContent?.replayable) {
                cardContent.replayable = RollService.rollResultSync(cardContent.replayable);
                if (Number(cardContent?.replayable) > 1) {
                    CardEffect.rewriteCardContent(card, initCardContents, {
                        replayable: Number(cardContent?.replayable) - 1, hasBeenPlayed: true
                    });
                }
                if (Number(cardContent.replayable) > 100) {
                    createStatus(game.i18n.format("FQCARDENGINE.InfoMsgReplayableSpell"),
                        {actor: Constants.actorCurrent, color: SUCCESS_COLOR});
                } else {
                    createStatus(game.i18n.format("FQCARDENGINE.InfoMsgRemainingCharge",
                        {remainingCharge: Number(cardContent.replayable) - 1}),
                    {actor: Constants.actorCurrent, color: SUCCESS_COLOR});
                }
            }
        }

        let result = null;

        // Le MJ conserve ses cartes en main (sauf option contraire) : ni défausse,
        // ni destruction.
        const leavesHand = !game.user?.isGM || CONFIG.FqCardEngine.options.GMUsingCards;

        if (cardContent && !ephemeral &&
            (!cardContent.replayable || (cardContent.replayable !== CardFqSystem.REPLAYABLE_PASSIVE && cardContent.replayable <= 1)) &&
            leavesHand
        ) {
            result = PlayCard.transferToPile(currentCards, to, card, fd);
        }

        // Destruction AVANT les effets : la carte disparaît de la main (et du deck)
        // dès la validation, sans attendre la fin des effets (dialogs, dés,
        // animations). Le document supprimé reste lisible en mémoire et les effets
        // n'en consomment que `id`, `parent` et `source` — jamais `card.update()`,
        // le traitement rejouable (seul écrivain) étant exclusif de l'éphémère.
        // Supprimer l'exemplaire du deck en amont ferme aussi la fenêtre où un
        // rappel déclenché par un effet `draw` l'aurait remis en circulation.
        if (ephemeral && leavesHand) {
            await PlayCard.destroyPlayedCard(card, currentCards);
        }

        await CardEffect.applyCardEffect(cardContent, card, fd, to);

        return result;
    }

    /**
     * Transfère la carte de la main vers la pile de défausse cible, face cachée
     * si le formulaire le demande — le geste commun à la défausse volontaire et
     * au jeu d'une carte non rejouable. Une erreur de transfert est notifiée à
     * l'utilisateur sans interrompre le flux appelant.
     *
     * @param {Cards}  currentCards - La main courante contenant la carte.
     * @param {Cards}  to           - La pile de défausse cible.
     * @param {Card}   card         - La carte transférée.
     * @param {object} fd           - Les données du formulaire (`down` pour face cachée).
     *
     * @returns {Promise<*>} La promesse du transfert.
     */
    static transferToPile(currentCards, to, card, fd) {
        return currentCards.pass(to, [card.id], {
            action: "pass",
            chatNotification: !CONFIG.FqCardEngine.options.hideMessages,
            updateData: fd.down ? {face: null} : {}
        }).catch(err => {
            return ui.notifications.error(err.message);
        });
    }

    /**
     * Détruit définitivement une carte éphémère qui vient d'être jouée : la copie
     * présente dans la main est supprimée, ainsi que l'exemplaire d'origine resté
     * dans le deck — Foundry conserve celui-ci, marqué « pioché », et le rappel de
     * la défausse comme le remélange le remettraient sinon en circulation. Les
     * deux documents portent le même id (la pioche copie la carte à l'identique).
     * Une carte générée en cours de partie n'a pas d'exemplaire de deck : seule la
     * copie de la main est supprimée.
     *
     * @param {Card}  card         - La carte jouée à détruire.
     * @param {Cards} currentCards - La main courante contenant la carte.
     *
     * @returns {Promise<void>}
     */
    static async destroyPlayedCard(card, currentCards) {
        const cardId = card.id ?? card._id;
        const deck = card.origin;
        try {
            await currentCards?.deleteEmbeddedDocuments("Card", [cardId]);
            if (deck?.cards?.get?.(cardId)) {
                await deck.deleteEmbeddedDocuments("Card", [cardId]);
            }
        } catch (err) {
            ui.notifications.error(err.message);
        }
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
            let cardID = card._id;

            // Copie profonde de la carte dans les flags du message : au clic, si la
            // carte n'existe plus (éphémère détruite, copie générée supprimée), le
            // voile carte SVG est reconstruit depuis cette copie au lieu de retomber
            // sur l'image simple.
            const cardCopy = card.toObject?.();
            if (cardCopy && fd.down) {
                cardCopy.face = null;
            }

            let renderData = {
                id: cardID,
                back: (card.face == null || fd.down),
                img: img,
                deckName: card.origin?.name ?? "",
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
                if (cardCopy) {
                    messageData.flags = {[FqCardEngineModule.moduleName]: {card: cardCopy}};
                }
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
            // Un sort sans portée s'applique à son lanceur : le message montre alors
            // le token du lanceur, pas les cibles restées sélectionnées sur la scène.
            targets = TargetingPredicates.resolveTargets(cardContent).map(target => ({
                name: Constants.tokenName(target) ?? "",
                img: target.document?.texture?.src
            }));
        } catch {
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
     * Cette méthode s'exécute chez le MJ (socket `logCardPlayed`) : l'acteur et
     * les cibles ne peuvent donc pas être déduits du contexte local — le MJ n'a
     * pas forcément de personnage assigné et ses cibles ne sont pas celles du
     * joueur. Ils sont résolus par l'appelant et passés en paramètres.
     *
     * @param {object[]} initResultatArray - Le tableau des résultats de l'effet joué.
     * @param {object}   cardContent       - Le contenu (choix) de la carte jouée.
     * @param {string}   actorId           - L'id de l'acteur qui joue la carte.
     * @param {string[]} targetsId         - Les ids des acteurs ciblés.
     *
     * @returns {void}
     */
    static logCardPlayed(initResultatArray, cardContent, actorId, targetsId) {
        if (game.combat) {
            // Copie du tableau : muter en place celui des flags rendrait le diff
            // de `update()` vide, et l'entrée ne serait ni persistée ni diffusée.
            const FQLogs = [...(game.combat.flags.fq?.logs ?? [])];
            FQLogs.push({
                "actorId": actorId,
                "targetsId": targetsId ?? [],
                "round": game.combat.round,
                "turn": game.combat.turn,
                resultArray: {...initResultatArray},
                "cardContent": {...cardContent}
            });

            game.combat.update({
                "flags.fq": {logs: FQLogs}
            });
        }
    }
}
