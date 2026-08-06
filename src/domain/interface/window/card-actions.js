import DisplayCard from "../shared/display-card.js";
import ObjectUtils from "../../../core/utils/object.utils.js";
import RollService from "../../engine/roll/roll-service.js";
import Minion from "../../engine/shared/minion.js";
import PlayCard from "../../engine/play-card.js";
import FormError from "../../../core/error/form-error.model.js";
import {PILE_TYPE} from "../../trading/trading-cards.js";

/**
 * Interactions de jeu sur une carte : clic, retournement, dialogue « Jouer la
 * carte », validation/défausse, affichage image, ouverture de main et tri.
 * Extrait de la façade `FqCardEngineModule` ; réassemblé par spread dans
 * `init-engine.js`. Les méthodes utilisant `this` restent appelées via la façade.
 */
export default {
    //one of the cards was clicked, based on options pick what to do
    /**
     * Réagit au clic sur une carte selon le réglage `cardClick` : ouvrir le
     * dialogue de jeu, ouvrir la main, ou afficher l'image de la carte.
     *
     * @param {Cards} currentCards - Le jeu de cartes contenant la carte cliquée.
     * @param {Card}  card         - La carte cliquée.
     *
     * @returns {Promise<void>}
     */
    cardClicked: async function (currentCards, card) {
        let option = CONFIG.FqCardEngine.options.cardClick;
        if (option === "play_card") {
            this.playDialog(currentCards, card);
        } else if (option === "open_hand") {
            this.openHand(currentCards);
        } else if (option === "card_image") {
            this.showCardImage(card);
        }
    },

    //Flip the card the player right clicked on
    /**
     * Retourne la carte sur laquelle le joueur a fait un clic droit, si celui-ci
     * en est propriétaire (avertit sinon).
     *
     * @param {Card} card - La carte à retourner.
     *
     * @returns {Promise<void>}
     */
    flipCard: async function (card) {
        if (card.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoPermission"));
        }
        card.flip();
    },

    /**
     * Ouvre le dialogue « Jouer la carte » : prépare toutes les données
     * d'affichage (visuel de la carte, stats du personnage et des cibles, choix,
     * variables X/Y, défausses disponibles), branche la navigation entre cartes de
     * la main, et déclenche le jeu ou la défausse à la validation.
     *
     * @param {Cards} currentCards - La main courante contenant la carte.
     * @param {Card}  card         - La carte à jouer.
     *
     * @returns {Promise<void>}
     */
    async playDialog(currentCards, card) {
        let img = DisplayCard.getImgFromCard(card);
        let name = DisplayCard.getNameFromCard(card);
        // ── Récupération des cartes navigables (mêmes filtres que la main) ──
        const handCards = [...currentCards.cards].sort(FqCardEngineModule.cardSort); // toutes les cartes de la main courante
        const currentIndex = handCards.findIndex(c => c.id === card.id);

        const discards = game.cards.filter(c => (c !== currentCards) && (c.system.fq.type === PILE_TYPE) && c.testUserPermission(game.user, "LIMITED"));

        if (!discards.length) return ui.notifications.warn("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
        if (currentCards.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoPermission"));
        }

        if (!card.system.fq?.choices?.length) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgCardNotImplemented"));
        }

        let initCardContents = card.system.fq.choices;
        let cardContents = ObjectUtils.deepCopy(card.system.fq.choices);

        let firstChoice = cardContents[0];
        const firstChoiceString = JSON.stringify(firstChoice);

        const hasXVariable = !firstChoice.xvalue && !!firstChoiceString.match(/XXX/);
        const hasYVariable = !firstChoice.yvalue && !!firstChoiceString.match(/YYY/);
        const hasVariables = hasXVariable || hasYVariable;

        if (!game.user.character) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }

        const character = game.user.character;
        const targets = [...game.user.targets].map(t => ({
            name: t.name,
            img: t.document.texture?.src,
            hpValue: t.actor?.system?.attributes?.hp?.value ?? 0,
            hpMax: t.actor?.system?.attributes?.hp?.max ?? 1,
            hpPct: Math.round(((t.actor?.system?.attributes?.hp?.value ?? 0) / (t.actor?.system?.attributes?.hp?.max ?? 1)) * 100),
        }));

        const charStats = character ? {
            name: character.name,
            img: character.img,
            hpValue: character.system?.attributes?.hp?.value ?? 0,
            hpMax: character.system?.attributes?.hp?.max ?? 1,
            hpPct: Math.round(((character.system?.attributes?.hp?.value ?? 0) / (character.system?.attributes?.hp?.max ?? 1)) * 100),
            actionValue: character.system?.fq?.action?.value ?? 0,
            actionMax: character.system?.fq?.action?.max ?? 1,
            actionPct: Math.round(((character.system?.fq?.action?.value ?? 0) / (character.system?.fq?.action?.max ?? 1)) * 100),
            manaValue: character.system?.fq?.mana?.value ?? 0,
            manaMax: character.system?.fq?.mana?.max ?? 1,
            manaPct: Math.round(((character.system?.fq?.mana?.value ?? 0) / (character.system?.fq?.mana?.max ?? 1)) * 100),
            zealValue: character.system?.fq?.zeal?.value ?? 0,
            zealMax: character.system?.fq?.zeal?.max ?? 1,
            zealPct: Math.round(((character.system?.fq?.zeal?.value ?? 0) / (character.system?.fq?.zeal?.max ?? 1)) * 100),
            currentDrop: character.system?.fq?.cards?.currentDrop ?? 0,
        } : null;

        let description = DisplayCard.getDescriptionFromCard(card);

        const html = await foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/dialog-play.hbs", {
            card,
            img: img,
            name: name,
            back: (card.face == null),
            description: description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            action: DisplayCard.getNumberForBubbleCardSvg(firstChoice.action, firstChoice),
            mana: DisplayCard.getNumberForBubbleCardSvg(firstChoice.mana, firstChoice),
            zeal: DisplayCard.getNumberForBubbleCardSvg(firstChoice.zeal, firstChoice),
            minReach: DisplayCard.getNumberForBubbleCardSvg(firstChoice.minReach, firstChoice),
            maxReach: DisplayCard.getNumberForBubbleCardSvg(firstChoice.maxReach, firstChoice),

            actionMod: RollService.hasAbilitiesBonus(firstChoice.action),
            manaMod: RollService.hasAbilitiesBonus(firstChoice.mana),
            zealMod: RollService.hasAbilitiesBonus(firstChoice.zeal),
            reachMod: RollService.hasAbilitiesBonus(firstChoice.minReach) || RollService.hasAbilitiesBonus(firstChoice.maxReach),
            replayableMod: RollService.hasAbilitiesBonus(firstChoice.replayable),

            reactive: firstChoice.reactive,
            replayable: firstChoice?.replayable === "passif" ? "P" : !firstChoice?.replayable ? null : DisplayCard.getNumberForBubbleCardSvg(firstChoice?.replayable, firstChoice),
            maxSameCard: card.system.fq?.maxSameCard,
            fqClass: card.system.fq?.class,
            discards,
            targets,
            charStats,
            hasSeveralDiscards: discards.length > 1,
            cardContents,
            hasVariables,
            hasXVariable,
            hasYVariable,
            severalChoices: cardContents.length > 1,
            minions: firstChoice.minions?.length,
            hasBeenPlayed: firstChoice.hasBeenPlayed,
            isFQBase: card.system?.fq?.isBase,
            passiveHasBeenPlayedOnRound: firstChoice.passivePlayedRound && firstChoice.passivePlayedRound?.toString() === game.combat?.round?.toString(),
        });

        let buttons = {
            ok: {
                icon: `<i class="fas fa-bolt"></i>`,
                label: game.i18n.localize("FQCARDENGINE.PlayCard"),
                callback: html => {
                    const {to, fd, cardContent} = this.getCardContent(html[0], cardContents, discards);
                    this.playValidatedCard(to, fd, cardContent, {
                        firstChoice, cardContents, hasVariables, initCardContents, currentCards, card
                    });
                }
            },
        };

        if (!card.system?.fq?.isBase) {
            buttons = {
                ...buttons, discard: {
                    icon: `<i class="fas fa-trash"></i>`,
                    label: game.i18n.localize("FQCARDENGINE.DiscardCard"),
                    callback: html => {
                        const {to, fd, cardContent} = this.getCardContent(html[0], cardContents, discards);
                        PlayCard.discardCard(to, fd, cardContent, card, currentCards);
                    }
                }
            };
        }

        Hooks.once("renderDialog", (app, _html) => {
            const root = app.element instanceof HTMLElement ? app.element : app.element[0];

            const prevBtn = root.querySelector(".fq-play-nav--prev");
            const nextBtn = root.querySelector(".fq-play-nav--next");

            if (!prevBtn || !nextBtn) return;

            if (currentIndex <= 0) prevBtn.disabled = true;
            if (currentIndex >= handCards.length - 1) nextBtn.disabled = true;

            const navigate = async (targetIndex) => {
                // Verrouillage immédiat des deux boutons dès le premier clic
                prevBtn.disabled = true;
                nextBtn.disabled = true;

                await app.close();
                this.playDialog(currentCards, handCards[targetIndex]);
            };

            prevBtn.addEventListener("click", () => {
                if (currentIndex <= 0 || prevBtn.disabled) return;
                navigate(currentIndex - 1);
            });

            nextBtn.addEventListener("click", () => {
                if (currentIndex >= handCards.length - 1 || nextBtn.disabled) return;
                navigate(currentIndex + 1);
            });
        });

        Dialog.wait({
            title: game.i18n.localize("FQCARDENGINE.PlayCard"),
            content: html,
            close: () => null,
            buttons,
            options: {jQuery: false, height: "80%"},
        });

    },

    /**
     * Valide et déclenche le jeu effectif d'une carte, une fois les données du
     * formulaire du dialogue (bouton OK) extraites via `getCardContent`. Vérifie
     * le placement des sbires et les variables X/Y saisies, publie le message de
     * chat de choix multiple le cas échéant, puis délègue au pipeline du moteur.
     *
     * @param {Cards}  to  - La pile de défausse cible.
     * @param {object} fd  - Les données du formulaire du dialogue (XXX, YYY, down…).
     * @param {object} cardContent - Le contenu (choix) sélectionné de la carte.
     * @param {object} ctx - Le contexte du jeu de la carte : `firstChoice`, `cardContents`,
     *                       `hasVariables`, `initCardContents`, `currentCards`, `card`.
     *
     * @returns {Promise<*>|void} La promesse du transfert de la carte, ou undefined si une garde a levé une erreur.
     */
    playValidatedCard(to, fd, cardContent, ctx) {
        const {firstChoice, cardContents, hasVariables, initCardContents, currentCards, card} = ctx;

        const nbSelectedMinionLocations = Minion.getNbMinionLocationSelected(fd);
        const nbValideMinionLocations = Minion.getNbValideMinionLocationSelected(fd);

        if (firstChoice.minions?.length &&
            ((nbSelectedMinionLocations === 0) ||
                (firstChoice.minions?.length < nbValideMinionLocations) ||
                (nbSelectedMinionLocations !== nbValideMinionLocations))) {
            throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorMinionLocation"));
        }

        if (fd.XXX === null) throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorXXX"));
        if (fd.YYY === null) throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorYYY"));
        // Le choix d'effet est désormais consolidé dans le message de carte enrichi
        // (voir PlayCard.renderChatMessage). On ne conserve le message séparé hérité
        // que lorsque les messages enrichis sont désactivés, pour ne pas perdre l'info.
        if (cardContents.length > 1 && !CONFIG.FqCardEngine.options.betterChatMessages) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<div>${game.i18n.format("FQCARDENGINE.ChatMessageCardEffectChoice", {nameContent: fd.nameContent})}</div>`
            });
        }
        return PlayCard.callBackplayCard(to, fd, cardContent, hasVariables, initCardContents, currentCards, card);
    },

    /**
     * Extrait du formulaire du dialogue de jeu les données saisies : la pile de
     * défausse cible, les valeurs du formulaire, et le contenu (choix) sélectionné.
     *
     * @param {HTMLElement} html         - La racine du dialogue contenant le formulaire.
     * @param {object[]}    cardContents - Les contenus (choix) possibles de la carte.
     * @param {Cards[]}     discards     - Les piles de défausse disponibles.
     *
     * @returns {{to: Cards, fd: object, cardContent: object}} La cible, les données de formulaire et le choix retenu.
     */
    getCardContent(html, cardContents, discards) {
        const form = html.querySelector("form.cards-dialog");
        let fde = new foundry.applications.ux.FormDataExtended(form);
        let fd = fde.object;
        if (!fd) {
            fd = fde.toObject();
        }
        let to = discards[0];
        if (discards.length > 1) {
            to = game.cards.get(fd.to);
        }
        const cardContent = cardContents.length === 1 ? cardContents[0] : cardContents.filter(cc => cc.name === fd.nameContent)[0];
        return {to, fd, cardContent};
    },
    //Shows the card image
    /**
     * Affiche l'image de la carte dans une fenêtre partageable (ImagePopout).
     *
     * @param {Card} card - La carte dont afficher l'image.
     *
     * @returns {Promise<void>}
     */
    showCardImage: async function (card) {
        const ip = new ImagePopout(card.img, {
            title: card.name, shareable: true, uuid: card.uuid
        });
        ip.render(true);
    },

    //Opens the hand for any additional options
    /**
     * Ouvre (ou ferme si déjà ouverte) la feuille d'une main pour accéder aux
     * options supplémentaires. Avertit si aucune main n'est fournie.
     *
     * @param {Cards} hand - La main à ouvrir.
     *
     * @returns {Promise<void>}
     */
    openHand: async function (hand) {
        if (hand == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        if (hand.sheet.rendered) {
            hand.sheet.close();
        } else {
            hand.sheet.render(true);
        }
    },

    /**
     * Comparateur de tri des cartes : les cartes de base (`isBase`) passent en
     * premier, puis tri par ordre `sort` croissant.
     *
     * @param {Card} a - La première carte à comparer.
     * @param {Card} b - La seconde carte à comparer.
     *
     * @returns {number} -1, 0 ou 1 selon l'ordre de tri.
     */
    cardSort(a, b) {
        if (a.system?.fq?.isBase && !b.system?.fq?.isBase) return -1;
        if (b.system?.fq?.isBase && !a.system?.fq?.isBase) return 1;
        if (a.sort < b.sort) return -1;
        if (a.sort > b.sort) return 1;
        return 0;
    },
};
