// TODO Verifier les options
import FqConstants from "./domain/utils/fq-constants.js";
import HandBoard from "./domain/board/hand-board.js";
import DeckUtils, {PILE_TYPE} from "./domain/utils/deck-utils.js";
import FQUtils from "./domain/utils/fq-utils.js";
import PlayCard from "./domain/utils/play-card.js";
import {mergeSchema} from "./core/utils/schema.utils.js";
import FormError from "./core/error/form-error.model.js";
import CharacterDataFQ from "./domain/system/actors/character-fq.mjs";
import ActionFQTemplate from "./domain/system/items/item-action-fq.mjs";
import CardsFqSystem from "./domain/system/cards/cards-fq-system.mjs";
import CardFqSystem from "./domain/system/cards/card-fq-system.mjs";
import NPCDataFQ from "./domain/system/actors/npc-fq.mjs";
import FqCharacterSheet from "./domain/sheet/actor/fq-character-sheet.js";
import FqNpcSheet from "./domain/sheet/actor/fq-npc-sheet.js";
import FqItemSheet from "./domain/sheet/items/fq-item-sheet.js";
import FqCardsSheet from "./domain/sheet/cards/fq-cards-sheet.js";
import FqCardSheet from "./domain/sheet/cards/fq-card-sheet.js";
import DisplayCard from "./domain/utils/display-card.js";

CONFIG.FqCardEngine = {
    options: {
        rollInitiative: false,
        playerLimitCardsRight: false,
        betterChatMessages: false,
        hideMessages: false,
        faceUpMode: false,
        showPlayedPlayerNames: false,
        position: "",
        size: "",
        positionDefault: "right_bar",
        cardClick: "play_card"
    }, documentClass: HandBoard
};

window.FqCardEngineModule = {
    cst: FqConstants,
    handMiniBarList: new Array(),
    moduleName: "fq-card-engine",
    eventName: "module.fq-card-engine",
    playerPlayedProp: "player-played",
    handMax: 10,
    updateCharGauges: function () {
        const character = game.user?.character;
        const gauges = document.getElementById("fq-char-gauges");
        const toggle = document.getElementById("fq-char-gauges-toggle");
        if (!gauges) return;

        const visible = game.settings.get(FqCardEngineModule.moduleName, "ShowCharGauges") ?? true;
        gauges.style.display = (visible && character) ? "flex" : "none";
        if (toggle) toggle.style.opacity = visible ? "1" : "0.35";

        if (!character || !visible) return;

        const avatar = document.getElementById("fq-cg-avatar");
        if (avatar) avatar.src = character.img;

        const set = (id, valId, value, max) => {
            const pct = max > 0 ? Math.round((value / max) * 100) : 0;
            const fill = document.getElementById(id);
            const val = document.getElementById(valId);
            if (fill) fill.style.width = pct + "%";
            if (val) val.textContent = `${value}/${max}`;
        };

        const hp = character.system?.attributes?.hp;
        const action = character.system?.fq?.action;
        const mana = character.system?.fq?.mana;
        const zeal = character.system?.fq?.zeal;

        set("fq-cg-hp", "fq-cg-hp-val", hp?.value ?? 0, hp?.max ?? 1);
        set("fq-cg-action", "fq-cg-action-val", action?.value ?? 0, action?.max ?? 1);
        set("fq-cg-mana", "fq-cg-mana-val", mana?.value ?? 0, mana?.max ?? 1);
        set("fq-cg-zeal", "fq-cg-zeal-val", zeal?.value ?? 0, zeal?.max ?? 1);
    },

    toggleCharGauges: function () {
        const current = game.settings.get(FqCardEngineModule.moduleName, "ShowCharGauges") ?? true;
        game.settings.set(FqCardEngineModule.moduleName, "ShowCharGauges", !current).then(() => {
            FqCardEngineModule.updateCharGauges();
        });
    },
    updateSize: function () {
        const slider = document.getElementById("fq-size-slider");
        const scale = slider ? parseFloat(slider.value) : 1.0;
        const container = document.getElementById("fq-card-engine-container");
        if (!container) return;

        container.style.setProperty("--fq-scale", scale);

        const cardH = 130 * scale; // hauteur réelle de la carte
        const overflow = 15;
        const panelH = cardH + overflow;
        container.style.setProperty("--fq-panel-h", panelH + "px");

        // Le fan tilte à max 10°, la carte rotée déborde de cardH * sin(10°) à gauche
        // La sidebar gauche (28px) absorbe une partie de ce débordement
        const TILT_MAX_RAD = 10 * Math.PI / 180;
        const fanOverflow = Math.ceil(cardH * Math.sin(TILT_MAX_RAD));
        const sidebarW = 28;
        const paddingLeft = Math.max(0, fanOverflow - sidebarW);

        FqCardEngineModule.applyFan();
    },
    applyFan: function () {
        const TILT_MAX = 10;   // degrés max (courbure 67)
        const LIFT_MAX = 19;   // px lift latéral (courbure 67)

        document.querySelectorAll(".fq-card-zone, .fq-card-engine-card-container").forEach(function (zone) {
            const cards = Array.from(zone.querySelectorAll(".fq-card, .fq-card-engine-card"));
            const n = cards.length;
            if (n === 0) return;

            cards.forEach(function (card, i) {
                const pct = n > 1 ? (i / (n - 1)) - 0.5 : 0;
                const tilt = pct * TILT_MAX * 2;
                const lift = -Math.abs(pct) * LIFT_MAX;
                const z = Math.round(20 - Math.abs(pct) * 12);
                card.style.setProperty("--fan-transform", `rotate(${tilt.toFixed(2)}deg) translateY(${lift.toFixed(1)}px)`);
                card.style.transform = card.style.getPropertyValue("--fan-transform");
                card.style.zIndex = z;
            });
        });
    },
    setupPosition: function () {
        const content = document.getElementById("fq-card-engine-container");
        if (!content) return;

        const isDraggable = game.settings.get(FqCardEngineModule.moduleName, "Draggable") ?? false;

        if (isDraggable) {
            // Mode draggable : place avant #players, position absolue
            document.getElementById("players")?.before(content);
            content.classList.add("fq-card-engine-draggable");
            FqCardEngineModule.initializeDraggable();
        } else {
            // Ancre dans #interface pour que left:0 = bord gauche réel de l'écran
            const interfaceEl = document.getElementById("interface");
            if (interfaceEl) interfaceEl.appendChild(content);
            content.classList.remove("fq-card-engine-draggable");
        }
    },
    setupHorizontalScroll: function (handEl) {
        const panel = handEl.querySelector(".fq-hand-panel, .fq-card-engine-hand-inner");
        const zone = handEl.querySelector(".fq-card-zone, .fq-card-engine-card-container");
        if (!panel || !zone) return;

        // Nettoie les anciens listeners si on rappelle la fonction
        if (handEl._fqScrollCleanup) handEl._fqScrollCleanup();

        let targetX = 0;
        let currentX = 0;
        let rafId = null;

        const tick = () => {
            currentX += (targetX - currentX) * 0.1;
            zone.style.transform = `translateX(${currentX.toFixed(1)}px)`;
            if (Math.abs(targetX - currentX) > 0.2) {
                rafId = requestAnimationFrame(tick);
            } else {
                currentX = targetX;
                zone.style.transform = `translateX(${targetX}px)`;
                rafId = null;
            }
        };

        const onMove = (e) => {
            const sidebarW = 56 + 16;                         // 2×28px + 2×8px padding zone
            const availableW = panel.getBoundingClientRect().width - sidebarW;
            const activateScrollPct = 0.5;
            const maxOffset = availableW - (e.clientX * activateScrollPct);

            if (maxOffset <= 0) {
                targetX = 0;
            } else {
                const pct = e.clientX / window.innerWidth;

                if (pct <= activateScrollPct) {
                    targetX = 0;
                } else {
                    const rightPct = (pct - activateScrollPct) / (1 - activateScrollPct);
                    const eased = (1 - Math.cos(rightPct * Math.PI)) / 2; // ease-in-out, pic à 0.5
                    targetX = -(eased * maxOffset);
                }
            }
            if (!rafId) rafId = requestAnimationFrame(tick);
        };

        const onLeave = () => {
            targetX = 0;
            if (!rafId) rafId = requestAnimationFrame(tick);
        };

        panel.addEventListener("mousemove", onMove);
        panel.addEventListener("mouseleave", onLeave);

        handEl._fqScrollCleanup = () => {
            panel.removeEventListener("mousemove", onMove);
            panel.removeEventListener("mouseleave", onLeave);
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
    },
    updateHandCount: function (value) { // value is the new value of the setting
        if (value > FqCardEngineModule.handMax) {
            value = FqCardEngineModule.handMax;
        }
        //add more
        if (value == FqCardEngineModule.handMiniBarList.length) {
            //do nothing
        } else if (value > FqCardEngineModule.handMiniBarList.length) {
            let more = value - FqCardEngineModule.handMiniBarList.length;
            for (let i = 0; i < more; i++) {
                FqCardEngineModule.handMiniBarList.push(new HandBoard(FqCardEngineModule.handMiniBarList.length));
            }
        } else {//remove some may need additional cleanup
            let less = FqCardEngineModule.handMiniBarList.length - value;
            for (let i = 0; i < less; i++) {
                FqCardEngineModule.handMiniBarList.pop().remove();
            }
        }
    }, //updates the player hands but with a delay so user flags are correctly set
    updatePlayerHandsDelayed: function () {
        setTimeout(function () {
            FqCardEngineModule.updatePlayerHands();
        }, 500);
    }, //updates the player hands that are owned by other players (the DM)
    updatePlayerHands: function () {
        if (game.user.isGM) {
            let u = game.user;
            let changed = false;
            for (let i = 0; i <= FqCardEngineModule.handMiniBarList.length; i++) {
                let toolbar = FqCardEngineModule.handMiniBarList[i];
                if (!toolbar) {
                    break;
                }
                toolbar.updatePlayerBarCount();
                let uID = u.getFlag(FqCardEngineModule.moduleName, "UserID-" + toolbar.id);
                if (uID) {
                    let cardsID = game.users.get(uID).getFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.playerBarCount);
                    let userCards = u.getFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id);
                    if (userCards !== cardsID) {
                        if (cardsID) {
                            u.setFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id, cardsID);
                            changed = true;
                        } else {
                            u.unsetFlag(FqCardEngineModule.moduleName, "CardsID-" + toolbar.id);
                            changed = true;
                        }
                    }
                }
            }
            if (changed) {
                FqCardEngineModule.restore();
            }
        }
    },
    rerender: function () {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.renderCards();
        });
    },
    restore: function () {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.restore();
        });
    },
    updatePlayerBarCounts() {
        $(FqCardEngineModule.handMiniBarList).each(function (i, h) {
            h.updatePlayerBarCount();
        });
    },

    //Attach for dragging cards from the toolbar
    attachDragDrop: function (html) {
        let t = this;
        let dragDrop = new foundry.applications.ux.DragDrop.implementation({
            dragSelector: ".fq-card-engine-card, .fq-card-engine-window-card", dropSelector: undefined, permissions: {
                dragstart: function () {
                    return true;
                }
            }, callbacks: {
                dragstart: t.drag.bind(t), drop: t.drop.bind(t)
            }
        });
        dragDrop.bind(html);
    },

    drag: function (event) {
        const id = $(event.currentTarget).data("card-id");
        const cardsid = $(event.currentTarget).data("cards-id");
        const uuid = $(event.currentTarget).data("card-uuid");

        // Create drag data
        const dragData = {
            id: id,//id required
            type: "Card", cardsId: cardsid, cardId: id, uuid: uuid
        };

        // Set data transfer
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    },

    drop: function (event) {
        let cards = this.getCards();
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (data.type !== "Card") return;

        //SORT
        let sort = function (card) {
            const closest = event.target.closest("[data-card-id]");
            if (closest) {
                const siblings = cards.cards.filter(c => c.id ? c.id : c._id !== card.id);
                const target = cards.cards.get(closest.dataset.cardId);
                const updateData = SortingHelpers.performIntegerSort(card, {target, siblings}).map(u => {
                    return {_id: u.target.id, sort: u.update.sort};
                });
                cards.updateEmbeddedDocuments("Card", updateData);
            }
        };

        if (data.uuid) {
            fromUuid(data.uuid).then(function (card) {
                if (!card) {
                    ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropUUIDError"));
                }
                let cardList = [];
                cardList.push(card._id);

                let exists = cards.cards.filter(c => c._id === card._id);
                if (exists.length == 0) {
                    card.parent.pass(cards, cardList, {chatNotification: !CONFIG.FqCardEngine.options.hideMessages})
                        .then(() => {
                            sort(card);
                        })
                        .catch(() => {
                            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropError"));
                        });
                } else {
                    sort(card);
                }
            }).catch(function () {
                ui.notifications.warn(game.i18n.localize("FQCARDENGINE.DragDropError"));
            });
        } else {
            const source = game.cards.get(data.cardsId);
            const card = source.cards.get(data.cardId);
            //if the card does not already exist in this hand then pass it to it
            let exists = cards.cards.filter(c => c.id === card.id);
            if (exists.length == 0) {
                return card.pass(cards, {chatNotification: !CONFIG.FqCardEngine.options.hideMessages}).then(function () {
                    sort(card);
                }, function (error) {
                    ui.notifications.error(error);
                });
            } else {//already a part of the hand, just sort
                sort();
            }
        }
    },

    //one of the cards was clicked, based on options pick what to do
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
    flipCard: async function (card) {
        if (card.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoPermission"));
        }
        card.flip();
    },

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
        let cardContents = FQUtils.deepCopy(card.system.fq.choices);

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
            description: description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            action: DisplayCard.getNumberForBubbleCardSvg(firstChoice.action, firstChoice),
            mana: DisplayCard.getNumberForBubbleCardSvg(firstChoice.mana, firstChoice),
            zeal: DisplayCard.getNumberForBubbleCardSvg(firstChoice.zeal, firstChoice),
            minReach: DisplayCard.getNumberForBubbleCardSvg(firstChoice.minReach, firstChoice),
            maxReach: DisplayCard.getNumberForBubbleCardSvg(firstChoice.maxReach, firstChoice),

            actionMod: FQUtils.hasAbilitiesBonus(firstChoice.action),
            manaMod: FQUtils.hasAbilitiesBonus(firstChoice.mana),
            zealMod: FQUtils.hasAbilitiesBonus(firstChoice.zeal),
            reachMod: FQUtils.hasAbilitiesBonus(firstChoice.minReach) || FQUtils.hasAbilitiesBonus(firstChoice.maxReach),
            replayableMod: FQUtils.hasAbilitiesBonus(firstChoice.replayable),

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

                    const nbSelectedMinionLocations = FQUtils.getNbMinionLocationSelected(fd);
                    const nbValideMinionLocations = FQUtils.getNbValideMinionLocationSelected(fd);

                    if (firstChoice.minions?.length &&
                        ((nbSelectedMinionLocations === 0) ||
                            (firstChoice.minions?.length < nbValideMinionLocations) ||
                            (nbSelectedMinionLocations !== nbValideMinionLocations))) {
                        throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorMinionLocation"));
                    }

                    if (fd.XXX === null) throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorXXX"));
                    if (fd.YYY === null) throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorYYY"));
                    if (cardContents.length > 1) {
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                            content: `<div>${game.i18n.format("FQCARDENGINE.ChatMessageCardEffectChoice", {nameContent: fd.nameContent})}</div>`
                        });
                    }
                    PlayCard.callBackplayCard(to, fd, cardContent, hasVariables, initCardContents, currentCards, card);
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

    initializeDraggable: function () {
        let isDragging = false;
        const draggableElement = document.getElementById("fq-card-engine-container");
        let storedX = game.settings.get(FqCardEngineModule.moduleName, "PositionX");
        let storedY = game.settings.get(FqCardEngineModule.moduleName, "PositionY");
        draggableElement.style.left = `${storedX}px`;
        draggableElement.style.top = `${storedY}px`;


        $(".fq-card-engine-move-handle").on("mousedown", (e) => {
            isDragging = true;

            const offsetX = e.clientX - draggableElement.offsetLeft;
            const offsetY = e.clientY - draggableElement.offsetTop;

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);

            function onMouseMove(e) {
                if (isDragging) {
                    const x = e.clientX - offsetX;
                    const y = e.clientY - offsetY;
                    if (x > 0) {
                        draggableElement.style.left = `${x}px`;
                    }
                    if (y > 0) {
                        draggableElement.style.top = `${y}px`;
                    }
                }
            }

            function onMouseUp() {
                isDragging = false;
                game.settings.set(FqCardEngineModule.moduleName, "PositionX", draggableElement.offsetLeft);
                game.settings.set(FqCardEngineModule.moduleName, "PositionY", draggableElement.offsetTop);
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }
        });
    },


    //Shows the card image
    showCardImage: async function (card) {
        const ip = new ImagePopout(card.img, {
            title: card.name, shareable: true, uuid: card.uuid
        });
        ip.render(true);
    },

    //Opens the hand for any additional options
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

    cardSort(a, b) {
        if (a.system?.fq?.isBase && !b.system?.fq?.isBase) return -1;
        if (b.system?.fq?.isBase && !a.system?.fq?.isBase) return 1;
        if (a.sort < b.sort) return -1;
        if (a.sort > b.sort) return 1;
        return 0;
    },

    async createDeckForUser(currentUserId) {
        await DeckUtils.createDeckForUser(currentUserId);
    },

    async deleteDeckForUser(currentUserId) {
        await DeckUtils.deleteDeckForUser(currentUserId);
    }
};


Hooks.on("init", function () {
    // TODO Utile?
    Handlebars.registerHelper("breaklines", function (text) {
        text = Handlebars.Utils.escapeExpression(text);
        text = text.replace(/(\r\n|\n|\r)/gm, "<br>");
        return new Handlebars.SafeString(text);
    });
    game.settings.register(FqCardEngineModule.moduleName, "HandCount", {
        name: game.i18n.localize("FQCARDENGINE.HandCountSetting"),
        hint: game.i18n.localize("FQCARDENGINE.HandCountSettingHint"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 1,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 10, step: 1
        },
        onChange: FqCardEngineModule.updateHandCount,
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "DisplayHandName", {
        name: game.i18n.localize("FQCARDENGINE.DisplayHandNameSetting"),
        hint: game.i18n.localize("FQCARDENGINE.DisplayHandNameSettingHint"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            (value == true) ? $("#fq-card-engine-container").addClass("show-names") : $("#fq-card-engine-container").removeClass("show-names");
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PlayerLimitCardsRight", {
        name: game.i18n.localize("FQCARDENGINE.PlayerLimitCardsRightSetting"),
        hint: game.i18n.localize("FQCARDENGINE.PlayerLimitCardsRightSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.playerLimitCardsRight = value;
            window.location.reload();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "RollInitiative", {
        name: game.i18n.localize("FQCARDENGINE.RollInitiativeNameSetting"),
        hint: game.i18n.localize("FQCARDENGINE.RollInitiativeNameSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.rollInitiative = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "BetterChatMessages", {
        name: game.i18n.localize("FQCARDENGINE.BetterChatMessagesSetting"),
        hint: game.i18n.localize("FQCARDENGINE.BetterChatMessagesSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.betterChatMessages = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "HideMessages", {
        name: game.i18n.localize("FQCARDENGINE.HideMessagesSetting"),
        hint: game.i18n.localize("FQCARDENGINE.HideMessagesSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.hideMessages = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "GMUsingCards", {
        name: game.i18n.localize("FQCARDENGINE.GMUsingCardsSetting"),
        hint: game.i18n.localize("FQCARDENGINE.GMUsingCardsSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.GMUsingCards = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "FaceUpMode", {
        name: game.i18n.localize("FQCARDENGINE.FaceUpModeSetting"),
        hint: game.i18n.localize("FQCARDENGINE.FaceUpModeSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.faceUpMode = value;
            game.socket.emit(FqCardEngineModule.eventName, {"action": "rerender"});
            FqCardEngineModule.rerender();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "ShowPlayedPlayerNames", {
        name: game.i18n.localize("FQCARDENGINE.ShowPlayedPlayerNames"),
        hint: game.i18n.localize("FQCARDENGINE.ShowPlayedPlayerNamesHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = value;
            game.socket.emit(FqCardEngineModule.eventName, {"action": "rerender"});
            FqCardEngineModule.rerender();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "ShowCharGauges", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });
    game.settings.register(FqCardEngineModule.moduleName, "Draggable", {
        name: game.i18n.localize("FQCARDENGINE.DraggableSetting"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableSettingHint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: function () {
            window.location.reload();
        },
    });
    game.settings.register(FqCardEngineModule.moduleName, "CardClick", {
        name: game.i18n.localize("FQCARDENGINE.CardClickBehavior"),
        hint: game.i18n.localize("FQCARDENGINE.CardClickBehaviorHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: String,       // Number, Boolean, String,
        choices: {
            "play_card": game.i18n.localize("FQCARDENGINE.CardClickPlayCard"),
            "open_hand": game.i18n.localize("FQCARDENGINE.CardClickOpenHand"),
            "card_image": game.i18n.localize("FQCARDENGINE.CardClickCardImage")
        },
        default: "play_card",
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.cardClick = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PositionX", {
        name: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingX"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingHintX"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 110,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 4096, step: 1
        },
        onChange: function (value) {
            document.getElementById("fq-card-engine-container").style.left = `${value}px`;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PositionY", {
        name: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingY"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingHintY"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 50,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 2160, step: 1
        },
        onChange: function (value) {
            document.getElementById("fq-card-engine-container").style.top = `${value}px`;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "HandScaleFloat", {
        scope: "client",
        config: false,   // pas visible dans l'UI des settings
        type: Number,
        default: 1.0,
    });

    // TODO déplacer dans des fichiers particuliers les dépendances aux autre librairies?
    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.actor.CharacterData.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, CharacterDataFQ.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.actor.NPCData.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, NPCDataFQ.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.item.ActivitiesTemplate.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, ActionFQTemplate.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `foundry.documents.Cards.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, ActionFQTemplate.defineSchema());
    }, "WRAPPER");

    CONFIG.Cards.dataModels = {
        deck: CardsFqSystem, hand: CardsFqSystem, pile: CardsFqSystem
    };

    CONFIG.Card.dataModels = {
        base: CardFqSystem
    };
});

Hooks.on("renderGamePause", (app, html) => {
    html.classList.add("dnd5e2");
    html.classList.add("fq-card-engine");
    const container = document.createElement("div");
    container.classList.add("flexcol");
    container.append(...html.children);
    html.append(container);
    const img = html.querySelector("img");
    img.src = "modules/fq-card-engine/images/logo.png";
    img.className = "";
});

Hooks.on("ready", function () {

    // Add Trackables Attributes to create bar
    const currentConfig = CONFIG.Actor.trackableAttributes || {};
    currentConfig.character.bar.push("fq.action");
    currentConfig.character.bar.push("fq.mana");
    currentConfig.character.bar.push("fq.zeal");
});

Hooks.on("setup", function () {
    // Pre Load templates.
    const templatePaths = [
        "modules/fq-card-engine/src/templates/partials/card-svg.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-character-sidebar.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-npc-header.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-npc-sidebar.hbs",
        "modules/fq-card-engine/src/templates/items/fq-item-tabs.hbs",
        "modules/fq-card-engine/src/templates/board/card.hbs",
        "modules/fq-card-engine/src/templates/board/hand-container.hbs",
        "modules/fq-card-engine/src/templates/board/hand.hbs",
        "modules/fq-card-engine/src/templates/chat-message.hbs",
        "modules/fq-card-engine/src/templates/dialog-play.hbs"];

    foundry.applications.handlebars.loadTemplates(templatePaths).then(() => {
        console.info("Better Hand templates preloaded");
    });

    foundry.documents.collections.Actors.registerSheet("dnd5e", FqCharacterSheet, {
        label: "FQCARDENGINE.SheetCharacter", types: ["character"], makeDefault: true,
    });

    foundry.documents.collections.Actors.registerSheet("dnd5e", FqNpcSheet, {
        label: "FQCARDENGINE.SheetNPC", types: ["npc"], makeDefault: true,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dnd5e", FqItemSheet, {
        label: "FQCARDENGINE.SheetItem",
        types: ["weapon", "feat", "equipment", "consumable", "spell"],
        makeDefault: true,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Cards, "core", FqCardsSheet, {
        label: "FQCARDENGINE.SheetFQCardsConfig", types: ["deck"], makeDefault: true
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Card, "core", FqCardSheet, {
        label: "FQCARDENGINE.FQCardConfig", makeDefault: true
    });

    if (game.settings.get(FqCardEngineModule.moduleName, "PlayerLimitCardsRight") == true) {
        CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
    }
    const adminRights = CONFIG.FqCardEngine.options.playerLimitCardsRight === false || game.user.isGM;
    foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/hand-container.hbs", {
        manualActions: adminRights
    }).then(content => {
        content = $(content);
        $("#ui-bottom").append(content);
        CONFIG.FqCardEngine.options.draggable = game.settings.get(FqCardEngineModule.moduleName, "Draggable");
        FqCardEngineModule.setupPosition();
        let count = game.settings.get(FqCardEngineModule.moduleName, "HandCount");
        count = count ? count : 0;
        if (count > FqCardEngineModule.handMax) {
            count = adminRights ? FqCardEngineModule.handMax : 1;
        }
        for (let i = 0; i < count; i++) {
            new HandBoard(i);
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "DisplayHandName") == true) {
            $("#fq-card-engine-container").addClass("show-names");
        }
        $(".fq-card-engine-hide-show").click(function () {
            $("#fq-card-engine-hands-container").toggleClass("hidden");
        });
        $(".fq-card-engine-add-bar").click(function () {
            let value = game.settings.get(FqCardEngineModule.moduleName, "HandCount") + 1;
            if (value < FqCardEngineModule.handMax + 1) {
                game.settings.set(FqCardEngineModule.moduleName, "HandCount", value);
                FqCardEngineModule.updateHandCount(value);
            }
        });
        $(".fq-card-engine-subtract-bar").click(function () {
            let value = game.settings.get(FqCardEngineModule.moduleName, "HandCount") - 1;
            if (value > 0) {
                game.settings.set(FqCardEngineModule.moduleName, "HandCount", value);
                FqCardEngineModule.updateHandCount(value);
            }
        });
        //popup card image on message click
        $(document).on("click", ".fq-card-engine-message-card", function (e) {
            let t = $(e.target);
            let src = t.data("img");
            if (src) {
                const ip = new ImagePopout(src, {
                    title: t.attr("title"), shareable: true
                });
                ip.render(true);
            }
        });
        //initialize Options from saved settings
        CONFIG.FqCardEngine.options.cardClick = game.settings.get(FqCardEngineModule.moduleName, "CardClick");
        if (game.settings.get(FqCardEngineModule.moduleName, "HideMessages") == true) {
            CONFIG.FqCardEngine.options.hideMessages = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "GMUsingCards") == true) {
            CONFIG.FqCardEngine.options.GMUsingCards = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "RollInitiative") == true) {
            CONFIG.FqCardEngine.options.rollInitiative = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "BetterChatMessages") == true) {
            CONFIG.FqCardEngine.options.betterChatMessages = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "FaceUpMode") == true) {
            CONFIG.FqCardEngine.options.faceUpMode = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "ShowPlayedPlayerNames") == true) {
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = true;
        }
        game.socket.on(FqCardEngineModule.eventName, data => {
            if (data.action === "rerender") {
                FqCardEngineModule.rerender();
            } else if (data.action === "reposition") {
                FqCardEngineModule.setupPosition();
            } else if (data.action === "reload") {
                FqCardEngineModule.restore();
            } else if (data.action === "updatePlayers") {
                FqCardEngineModule.updatePlayerHandsDelayed();
            }
        });
        FqCardEngineModule.restore();

        FqCardEngineModule.updateCharGauges();
        $(document).on("click", "#fq-char-gauges-toggle", () => {
            FqCardEngineModule.toggleCharGauges();
        });

        Hooks.on("updateActor", (actor) => {
            if (game.user?.character?.id === actor.id) {
                FqCardEngineModule.updateCharGauges();
            }
        });
        Hooks.on("controlToken", () => FqCardEngineModule.updateCharGauges());

        FqCardEngineModule.updatePlayerHands();

        const savedScale = game.settings.get(FqCardEngineModule.moduleName, "HandScaleFloat") ?? 1.0;
        const slider = document.getElementById("fq-size-slider");
        if (slider) {
            slider.value = savedScale;
        }
        document.getElementById("fq-card-engine-container")
            ?.style.setProperty("--fq-scale", savedScale);
        FqCardEngineModule.updateSize();
        FqCardEngineModule.applyFan();

        $("#fq-size-slider").on("input", function () {
            const scale = parseFloat(this.value);
            document.getElementById("fq-card-engine-container")
                ?.style.setProperty("--fq-scale", scale);

            // Persiste dans les settings (optionnel — utilise un setting "client")
            game.settings.set(FqCardEngineModule.moduleName, "HandScaleFloat", scale);

            FqCardEngineModule.updateSize();
            FqCardEngineModule.applyFan();
        });
    });
});
