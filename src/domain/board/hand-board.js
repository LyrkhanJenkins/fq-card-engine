import {DECK_TYPE, SPELLBOOK_TYPE} from "../utils/deck-utils.js";
import DisplayCard from "../utils/display-card.js";

export default class HandBoard {
    constructor(id) {
        this.id = id;
        this.currentCards = undefined;
        this.currentUser = undefined;
        this.updating = false;
        this.html = undefined;
        this.playerBarCount = 0;
        let t = this;

        foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/hand.html", {
            id: this.id, manualActions: CONFIG.FqCardEngine.options.playerLimitCardsRight === false || game.user.isGM
        }).then(content => {
            content = $(content);
            content.find(".fq-card-engine-settings-hand").click(function (e) {
                t.openStackWindow(e);
            });
            content.find(".fq-card-engine-open-deck").click(function (e) {
                t.openDeck(e);
            });
            content.find(".fq-card-engine-settings-choose").click(function (e) {
                t.chooseDialog(e);
            });
            content.find(".fq-card-engine-settings-choose").contextmenu(function (e) {
                t.resetToolbarDialog(e);
            });
            content.find(".fq-card-engine-draw").click(function () {
                t.drawCard();
            });
            $("#fq-card-engine-hands-container").prepend(content);
            FqCardEngineModule.setupHorizontalScroll(content[0]);
            t.restore();
            t.html = content;
        });

        /**
         * Hooks to listen to changes in this hand
         * Useful: CONFIG.debug.hooks = true
         */
        Hooks.on("updateCard", function (target, data) {
            if (!!data.drawn || data.sort !== undefined || data.face !== undefined) {
                t.update();
            }
        });

        Hooks.on("deleteCard", function (target) {
            if (!!target && !!target.parent && (!!t.currentCards && (target.parent._id ? target.parent._id : target.parent.data._id) == (t.currentCards._id ? t.currentCards._id : t.currentCards.data._id))) {
                t.update();
            }
        });

        Hooks.on("createCard", function (target) {
            if (!!target && !!target.parent && (!!t.currentCards && (target.parent._id ? target.parent._id : target.parent.data._id) == (t.currentCards._id ? t.currentCards._id : t.currentCards.data._id))) {
                t.update();
            }
        });

        Hooks.on("updateUser", function (target, data) {
            //GM informs others not informaed by players
            if (data != undefined && data.flags !== undefined) {
                if (data.flags[FqCardEngineModule.moduleName] !== undefined) {
                    t.restore();
                }
            }
        });
        //auto register to listen for updates
        FqCardEngineModule.handMiniBarList.push(this);
    }

    renderCards(resolve) {
        let t = this;
        let length = 0;
        if (typeof this.currentCards !== "undefined") {
            $("#fq-card-engine-card-container-" + t.id).empty();
            length = this.currentCards.cards.contents.length;
            if (CONFIG.FqCardEngine.options.faceUpMode) {
                // Check to make sure all the cards are flipped over to their face
                $(this.currentCards.cards.contents.sort(FqCardEngineModule.cardSort)).each(function (i, c) {
                    if (c.face == null) {
                        c.flip();
                    }
                });
            }
            $(this.currentCards.cards.contents.sort(FqCardEngineModule.cardSort)).each(function (i, c) {
                let img = DisplayCard.getImgFromCard(c);
                let description = DisplayCard.getDescriptionFromCard(c);
                let name = DisplayCard.getNameFromCard(c);
                let cardContent = c.system.fq?.choices?.length ? c.system.fq?.choices[0] : {};
                let renderData = {
                    id: c._id ? c._id : c.data._id,
                    description: description,
                    descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
                    titleSize: DisplayCard.getTitleSizeForCardSvg(name),
                    action : DisplayCard.getFirstNumberForCardSvg(cardContent.action),
                    mana : DisplayCard.getFirstNumberForCardSvg(cardContent.mana),
                    zeal : DisplayCard.getFirstNumberForCardSvg(cardContent.zeal),
                    minReach : DisplayCard.getFirstNumberForCardSvg(cardContent.minReach),
                    maxReach : DisplayCard.getFirstNumberForCardSvg(cardContent.maxReach),
                    maxSameCard : c.system.fq?.maxSameCard,
                    hasBeenPlayed: cardContent?.hasBeenPlayed,
                    hasBeenPlayedOnRound: cardContent?.playedRound && cardContent?.playedRound?.toString() === game.combat?.round?.toString(),
                    isFQBase: c.system?.fq?.isBase,
                    cardsid: t.currentCards._id ? t.currentCards._id : t.currentCards.data._id,
                    uuid: c.uuid,
                    back: (c.face == null),
                    img: img,
                    name: name,
                };
                foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/card.hbs", renderData).then(content => {
                    content = $(content);
                    content.click(function (e) {
                        t.cardClicked(e);
                    });
                    content.contextmenu(function (e) {
                        t.flipCard(e);
                    });
                    if (i === 0) {
                        content.addClass("fq-card-engine-hand-first-card");
                    }
                    $("#fq-card-engine-card-container-" + t.id).append(content);
                    FqCardEngineModule.updateSize();
                    if (i == length - 1) {
                        if (resolve) {
                            //Return for the promise
                            resolve();
                        }
                    }
                });
            });
        }

        this.updateTitle();
        this.updatePlayerColor();
        //Return for the promise if there is nothing to render
        if (length == 0) {
            if (resolve) {
                resolve();
            }
        }
    }

    update() {
        let t = this;
        if (t.currentCards) {
            if (!t.updating) {
                t.updating = true;
                const myPromise = new Promise((resolve, _reject) => {
                    t.renderCards(resolve);
                });

                myPromise
                    .then(function () {
                        FqCardEngineModule.attachDragDrop.bind(t)(t.html[0]);
                    })
                    .then(function () {
                        FqCardEngineModule.applyFan();
                    })
                    .then(function () {
                        t.updating = false;
                    }, function () {
                        t.updating = false;//even on error still finish updating
                    });
            } else {
                setTimeout(function () {
                    //continue to try to update the hand
                    t.update();
                }, 500);
            }
        } else {
            //check if player is selected but not a hand yet then display color and player name
            this.updateTitle();
            this.updatePlayerColor();
            foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/empty-hand-message.html", {}).then(content => {
                $("#fq-card-engine-card-container-" + t.id).html(content);
                t.updatePlayerColor();
            });
        }
    }

    drag(event) {
        FqCardEngineModule.drag.call(this, event);
    }

    drop(event) {
        FqCardEngineModule.drop.call(this, event);
    }

    setCardsOption(choice) {
        this.currentCards = choice;
        if (!choice) {
            this.resetCardsID();
            if (game.user.isGM && this.currentUser != undefined) {
                this.currentUser.unsetFlag(FqCardEngineModule.moduleName, "CardsID-" + this.playerBarCount);
            }
        } else {
            this.storeCardsID(this.currentCards._id ? this.currentCards._id : this.currentCards.data._id);
            if (game.user.isGM && this.currentUser != undefined) {
                this.currentUser.setFlag(FqCardEngineModule.moduleName, "CardsID-" + this.playerBarCount, this.currentCards._id ? this.currentCards._id : this.currentCards.data._id);
            }
        }
        this.update();
        if (!game.user.isGM) {
            game.socket.emit(FqCardEngineModule.eventName, {"action": "updatePlayers"});
        } else {
            FqCardEngineModule.updatePlayerHandsDelayed();
        }
    }

    setUserOption(choice) {
        this.currentUser = choice;
        this.storeUserID(this.currentUser._id ? this.currentUser._id : this.currentUser.data._id);
        this.update();
        if (game.user.isGM) {
            //check to see if user has a hand selected already
            if (game.user.isGM) {
                FqCardEngineModule.updatePlayerBarCounts();
            }
            let id = this.currentUser.getFlag(FqCardEngineModule.moduleName, "CardsID-" + this.playerBarCount);
            if (id) {
                this.storeCardsID(id);
                this.setCardsID(id);
            } else {
                this.resetCardsID();
            }
            FqCardEngineModule.updatePlayerHandsDelayed();
        }
    }

    setCardsID(id) {
        if (!id) {
            this.currentCards = undefined;
        } else {
            let cards = game.cards.get(id);
            if (cards != undefined) {
                this.currentCards = cards;
                if (this.currentCards != undefined) {
                    this.update();
                }
            }
        }
    }

    setUserID(id) {
        if (!id) {
            this.currentUser = undefined;
        } else {
            let user = game.users.get(id);
            if (user != undefined) {
                this.currentUser = user;
            }
        }
    }

    async chooseDialog() {
        const buttons = [];

        buttons.push({
            action: "hand",
            icon: "fas fa-hand",
            label: game.i18n.localize("FQCARDENGINE.Hand"),
            default: true
        });

        if (game.user.isGM) {
            buttons.push({
                action: "player",
                icon: "fas fa-user",
                label: game.i18n.localize("FQCARDENGINE.Player"),
            });
        }

        if (this.currentCards != undefined || this.currentUser != undefined) {
            buttons.push({
                action: "reset",
                icon: "fas fa-rotate-left",
                label: game.i18n.localize("FQCARDENGINE.ResetBar"),
            });
        }

        if (buttons.length === 1) {
            this.chooseHandDialog();
            return;
        }

        const result = await foundry.applications.api.DialogV2.wait({
            window: {
                title: game.i18n.localize("FQCARDENGINE.ChooseForGMTitle"),
            },
            content: `<p>${game.i18n.localize("FQCARDENGINE.ChooseForGMQuestion")}</p>`,
            buttons,
            rejectClose: false
        });

        if (result === "hand") this.chooseHandDialog();
        if (result === "player") this.chooseUserDialog();
        if (result === "reset") this.reset();
    }

    async chooseUserDialog() {
        const options = game.users.map(u =>
            `<option value="${u.id}">${u.name}</option>`
        ).join("");

        const result = await foundry.applications.api.DialogV2.wait({
            window: {title: game.i18n.localize("FQCARDENGINE.UserList")},
            content: `
            <p>${game.i18n.localize("FQCARDENGINE.ChooseUser")}</p>
            <div class="fq-card-engine-option-container">
                <select class="fq-card-engine-user-selection" name="user">
                    ${options}
                </select>
            </div>`,
            buttons: [
                {
                    action: "ok",
                    icon: "fas fa-check",
                    label: "OK",
                    default: true,
                    callback: (event, button) => {
                        return button.form.querySelector(".fq-card-engine-user-selection").value;
                    }
                },
                {
                    action: "cancel",
                    icon: "fas fa-times",
                    label: "Cancel",
                }
            ],
            rejectClose: false
        });

        if (result && result !== "cancel") {
            const choice = game.users.get(result);
            this.setUserOption(choice);
        }
    }

    async chooseHandDialog() {
        // Construction du select sans jQuery
        const options = [`<option value="">${game.i18n.localize("FQCARDENGINE.NoHand")}</option>`];
        game.cards.forEach(c => {
            if (
                (c.permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ||
                    c.permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) &&
                c.type === "hand"
            ) {
                options.push(`<option value="${c.id}">${c.name}</option>`);
            }
        });

        const result = await foundry.applications.api.DialogV2.wait({
            window: {title: game.i18n.localize("FQCARDENGINE.DeckList")},
            content: `
            <p>${game.i18n.localize("FQCARDENGINE.ChooseHand")}</p>
            <div class="fq-card-engine-option-container">
                <select class="fq-card-engine-hand-selection" name="hand">
                    ${options.join("")}
                </select>
            </div>`,
            buttons: [
                {
                    action: "ok",
                    icon: "fas fa-check",
                    label: "OK",
                    default: true,
                    callback: (event, button) => {
                        return button.form.querySelector(".fq-card-engine-hand-selection").value;
                    }
                },
                {
                    action: "cancel",
                    icon: "fas fa-times",
                    label: "Cancel",
                }
            ],
            rejectClose: false
        });

        if (result && result !== "cancel") {
            const choice = game.cards.get(result);
            this.setCardsOption(choice);
        }
    }

    async resetToolbarDialog() {
        if (this.currentCards == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        Dialog.confirm({
            title: game.i18n.localize("FQCARDENGINE.ResetToolbarDialogTitle"),
            content: "<p>" + game.i18n.localize("FQCARDENGINE.ResetToolbarDialogQuestion") + "</p>",
            yes: () => this.reset(),
            no: function () {
            },//do nothing
            defaultYes: true
        });
    }

    async openStackWindow() {
        if (this.currentCards == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        FqCardEngineModule.openHand(this.currentCards);
    }

    async openDeck() {
        const userId = this.currentUser?._id ?? this.currentUser?.data?._id ?? game.userId;
        const deck = game.cards.find(c => c.system.fq.type === DECK_TYPE && c.ownership[userId] === 3);
        const spellBook = game.cards.find(c => c.system.fq.type === SPELLBOOK_TYPE && c.ownership[userId] === 3);
        if (deck) {
            deck.sheet.render(true, {
                position: {
                    left: 110,
                    top: 100
                }
            });
        }
        if (spellBook) {
            spellBook.sheet.render(true, {
                position: {
                    left: 110 + deck.sheet.position.width,
                    top: 100
                }
            });
        }
    }

    async drawCard() {
        if (this.currentCards == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        this.currentCards.drawDialog();
    }

    updateTitle() {
        let t = this;
        let handTitle = "";
        if (typeof this.currentCards !== "undefined") {
            handTitle = this.currentCards.name;
        }
        /** Do Some Extra GM work here **/
        if (game.user.isGM) {
            if (!!this.currentUser && this.currentUser.name != handTitle) {
                if (handTitle != "") {
                    handTitle = this.currentUser.name + " (" + handTitle + ")";
                } else {
                    handTitle = this.currentUser.name;
                }
                if (this.playerBarCount !== 0) {
                    handTitle += " " + game.i18n.localize("FQCARDENGINE.Bar") + " " + (this.playerBarCount + 1);
                }
            }
        }
        $("#fq-card-engine-hand-name-" + t.id).html(handTitle);
    }

    updatePlayerBarCount() {
        let count = 0;
        if (this.currentUser) {
            this.id;
            let list = FqCardEngineModule.handMiniBarList;
            let userId = this.currentUser._id ? this.currentUser._id : this.currentUser.data._id;
            for (let i = 0; i < list.length && i < this.id; i++) {
                let bar = list[i];
                if (bar.currentUser) {
                    let barUserId = bar.currentUser._id ? bar.currentUser._id : bar.currentUser.data._id;
                    if (barUserId === userId) {
                        count++;
                    }
                }
            }
        }
        this.playerBarCount = count;
    }

    updatePlayerColor() {
        if (game.user.isGM) {
            const panel = this.html?.[0]?.querySelector(".fq-hand-toolbar");
            const sidebar = this.html?.[0]?.querySelector(".fq-hand-sidebar");
            if (!panel) return;

            if (this.currentUser) {
                const color = this.currentUser.color ?? this.currentUser.data?.color ?? "";
                panel.style.setProperty("--fq-player-color", color);
                sidebar.style.setProperty("--fq-player-color", color);
            } else {
                panel.style.removeProperty("--fq-player-color");
                sidebar.style.removeProperty("--fq-player-color");
            }
        }
    }

    async cardClicked(e) {
        let id = $(e.target).closest("[data-card-id]").data("card-id");
        let card = this.currentCards.cards.get(id);
        FqCardEngineModule.cardClicked(this.currentCards, card);
    }

    async flipCard(e) {
        let id = $(e.target).closest("[data-card-id]").data("card-id");
        let card = this.currentCards.cards.get(id);
        FqCardEngineModule.flipCard(card);
    }

    restore() {
        this.setCardsID(this.getStoredCardsID());
        this.setUserID(this.getStoredUserID());
        this.update();
    }

    storeCardsID(id) {
        game.user.setFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id, id);
    }

    resetCardsID() {
        game.user.unsetFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id);
        this.currentCards = undefined;
    }

    getStoredCardsID() {
        return game.user.getFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id);
    }

    storeUserID(id) {
        game.user.setFlag(FqCardEngineModule.moduleName, "UserID-" + this.id, id);
    }

    resetUserID() {
        game.user.unsetFlag(FqCardEngineModule.moduleName, "UserID-" + this.id);
        this.currentUser = undefined;
    }

    getStoredUserID() {
        return game.user.getFlag(FqCardEngineModule.moduleName, "UserID-" + this.id);
    }

    reset() {
        this.resetCardsID();
        this.resetUserID();
        //updated for GMs
        game.socket.emit(FqCardEngineModule.eventName, {"action": "updatePlayers"});
        FqCardEngineModule.updatePlayerHandsDelayed();
    }

    remove() {
        if (this.html) {
            this.html.remove();
        }
    }

    getCards() {
        return this.currentCards;
    }
}
