import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../../trading/trading-cards.js";
import DisplayCard from "../shared/display-card.js";

/**
 * Représente une barre de main affichée à l'écran (le module peut en gérer
 * plusieurs). Une barre est liée à un jeu de cartes (`currentCards`) et, côté MJ,
 * éventuellement à un utilisateur (`currentUser`). Elle gère le rendu des cartes,
 * les interactions (clic, retournement, glisser-déposer), les dialogues de
 * sélection et la persistance de son état dans les flags de l'utilisateur.
 */
export default class HandBoard {
    /**
     * Instancie une barre de main : rend son gabarit, branche les gestionnaires
     * d'événements de l'UI, enregistre les hooks de synchronisation des cartes et
     * des utilisateurs, restaure son état persistant, et s'auto-enregistre dans
     * `FqCardEngineModule.handMiniBarList`.
     *
     * @param {number} id - L'index/identifiant de la barre.
     */
    constructor(id) {
        this.id = id;
        this.currentCards = undefined;
        this.currentUser = undefined;
        this.updating = false;
        this.html = undefined;
        this.playerBarCount = 0;
        // Regroupement des cartes d'une même pioche pour l'animation de révélation.
        this._drawRevealBuffer = [];
        this._drawRevealTimer = null;
        // Ids des hooks de synchronisation, retirés dans remove() pour éviter que
        // les barres détruites (ex. réduction du nombre de barres joueur) laissent
        // des hooks orphelins agir sur un DOM disparu.
        this._hookIds = {};
        let t = this;

        foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/hand.hbs", {
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
        this._hookIds.updateCard = Hooks.on("updateCard", function (target, data) {
            if (!!data.drawn || data.sort !== undefined || data.face !== undefined
                || data.system?.fq?.choices !== undefined) {
                t.update();
            }
        });

        this._hookIds.deleteCard = Hooks.on("deleteCard", function (target) {
            if (!!target && !!target.parent && (!!t.currentCards && (target.parent._id ? target.parent._id : target.parent.data._id) == (t.currentCards._id ? t.currentCards._id : t.currentCards.data._id))) {
                t.update();
            }
        });

        this._hookIds.createCard = Hooks.on("createCard", function (target, options, userId) {
            if (!!target && !!target.parent && (!!t.currentCards && (target.parent._id ? target.parent._id : target.parent.data._id) == (t.currentCards._id ? t.currentCards._id : t.currentCards.data._id))) {
                t.update();
                // Révélation cosmétique : uniquement pour le joueur qui pioche
                // (`userId` local) et uniquement pour les cartes réellement piochées
                // (`drawn`), quelle que soit la méthode de pioche. Les cartes de base
                // (`isBase`), distribuées automatiquement, ne déclenchent pas la révélation.
                if (userId === game.user.id && target.drawn && !target.system?.fq?.isBase) {
                    t.bufferDrawReveal(target);
                }
            }
        });

        this._hookIds.updateUser = Hooks.on("updateUser", function (target, data) {
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

    /**
     * Construit l'objet de données d'affichage d'une carte pour le gabarit
     * `card.hbs` (bulles, description, modificateurs, face/dos…). Centralise la
     * logique afin qu'elle soit réutilisable telle quelle par le rendu de la main
     * et par l'animation de révélation à la pioche.
     *
     * @param {Card} c - La carte à présenter.
     * @param {object} [options] - Options de présentation.
     * @param {boolean} [options.forceFace=false] - Force l'affichage de la face avant même si la carte est face cachée (pour la révélation).
     *
     * @returns {object} Les données à passer à `card.hbs`.
     */
    buildCardRenderData(c, {forceFace = false} = {}) {
        const faceIndex = forceFace && c.face == null ? 0 : c.face;
        const img = DisplayCard.getImgFromCard(c, faceIndex);
        const name = DisplayCard.getNameFromCard(c, faceIndex);
        const cardContent = c.system.fq?.choices?.length ? c.system.fq?.choices[0] : {};
        const description = DisplayCard.getDescriptionFromCard(c, faceIndex);
        return {
            id: c._id ? c._id : c.data._id,
            description: description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            ...DisplayCard.buildBubbleData(cardContent, c),
            hasBeenPlayed: cardContent?.hasBeenPlayed,
            passiveHasBeenPlayedOnRound: cardContent?.passivePlayedRound && cardContent?.passivePlayedRound?.toString() === game.combat?.round?.toString(),
            isFQBase: c.system?.fq?.isBase,
            cardsid: this.currentCards._id ? this.currentCards._id : this.currentCards.data._id,
            uuid: c.uuid,
            back: forceFace ? false : (c.face == null),
            img: img,
            name: name,
        };
    }

    /**
     * Rend l'ensemble des cartes de la main courante dans son conteneur : trie les
     * cartes, les retourne face visible en mode « faceUp », calcule les données
     * d'affichage (bulles, description, modificateurs…) et branche les interactions.
     * Met aussi à jour le titre et la couleur du joueur.
     *
     * @param {Function} [resolve] - Callback appelé une fois le rendu terminé (pour une Promise).
     *
     * @returns {void}
     */
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
                let renderData = t.buildCardRenderData(c);
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

    /**
     * Rafraîchit la barre : rend les cartes puis (re)branche le glisser-déposer et
     * l'effet d'éventail. Un verrou `updating` évite les rendus concurrents : les
     * appels reçus pendant un rendu en cours sont coalescés via `pendingUpdate` et
     * déclenchent une unique relance à la fin du rendu. Sans cartes, met seulement
     * à jour le titre et la couleur du joueur.
     *
     * @returns {void}
     */
    update() {
        let t = this;
        if (t.currentCards) {
            if (!t.updating) {
                t.updating = true;
                const myPromise = new Promise((resolve, _reject) => {
                    t.renderCards(resolve);
                });

                const finish = function () {
                    t.updating = false;
                    // Un ou plusieurs appels reçus pendant le rendu : relance une seule fois.
                    if (t.pendingUpdate) {
                        t.pendingUpdate = false;
                        t.update();
                    }
                };

                myPromise
                    .then(function () {
                        FqCardEngineModule.attachDragDrop.bind(t)(t.html[0]);
                    })
                    .then(function () {
                        FqCardEngineModule.applyFan();
                    })
                    .then(finish, finish);//even on error still finish updating
            } else {
                // Rendu déjà en cours : mémorise la demande, traitée à la fin du rendu.
                t.pendingUpdate = true;
            }
        } else {
            //check if player is selected but not a hand yet then display color and player name
            this.updateTitle();
            this.updatePlayerColor();
        }
    }

    /**
     * Gestionnaire de début de glisser d'une carte, délégué à `FqCardEngineModule.drag`.
     *
     * @param {DragEvent} event - L'événement de glisser.
     *
     * @returns {void}
     */
    drag(event) {
        FqCardEngineModule.drag.call(this, event);
    }

    /**
     * Gestionnaire de dépôt d'une carte, délégué à `FqCardEngineModule.drop`.
     *
     * @param {DragEvent} event - L'événement de dépôt.
     *
     * @returns {void}
     */
    drop(event) {
        FqCardEngineModule.drop.call(this, event);
    }

    /**
     * Définit le jeu de cartes affiché par la barre, persiste (ou retire) son id,
     * met à jour l'affichage et synchronise les autres clients (ou les mains MJ).
     *
     * @param {Cards|null|undefined} choice - Le jeu de cartes à afficher, ou falsy pour réinitialiser.
     *
     * @returns {void}
     */
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

    /**
     * (MJ) Associe un utilisateur à la barre, persiste son id, met à jour
     * l'affichage et, si l'utilisateur a déjà une main mémorisée, la sélectionne.
     *
     * @param {object} choice - L'utilisateur à associer à la barre.
     *
     * @returns {void}
     */
    setUserOption(choice) {
        this.currentUser = choice;
        this.storeUserID(this.currentUser._id ? this.currentUser._id : this.currentUser.data._id);
        this.update();
        if (game.user.isGM) {
            //check to see if user has a hand selected already
            FqCardEngineModule.updatePlayerBarCounts();
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

    /**
     * Sélectionne le jeu de cartes de la barre à partir de son id et rafraîchit
     * l'affichage. Un id falsy vide la barre.
     *
     * @param {string} id - L'id du jeu de cartes, ou falsy pour vider la barre.
     *
     * @returns {void}
     */
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

    /**
     * Sélectionne l'utilisateur de la barre à partir de son id. Un id falsy vide
     * l'utilisateur courant.
     *
     * @param {string} id - L'id de l'utilisateur, ou falsy pour le retirer.
     *
     * @returns {void}
     */
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

    /**
     * Ouvre le dialogue de configuration de la barre : choisir une main, choisir
     * un joueur (MJ uniquement) ou réinitialiser. Si seule l'option « main » est
     * disponible, ouvre directement le dialogue de choix de main.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * (MJ) Ouvre un dialogue de sélection d'un utilisateur parmi la liste des
     * joueurs et l'associe à la barre.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Ouvre un dialogue de sélection d'une main parmi les jeux de type « hand »
     * accessibles (observateur ou propriétaire) et l'associe à la barre.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Demande confirmation avant de réinitialiser la barre. Avertit si aucune main
     * n'est sélectionnée.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Ouvre la feuille de la main courante. Avertit si aucune main n'est sélectionnée.
     *
     * @returns {Promise<void>}
     */
    async openStackWindow() {
        if (this.currentCards == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        FqCardEngineModule.openHand(this.currentCards);
    }

    /**
     * Ouvre les feuilles du deck et du grimoire (spellbook) de l'utilisateur
     * associé à la barre (ou de l'utilisateur courant), positionnées côte à côte.
     *
     * @returns {Promise<void>}
     */
    async openDeck() {
        const userId = this.currentUser?._id ?? this.currentUser?.data?._id ?? game.userId;
        const deck = TradingCards.getFirstDeck(userId, DECK_TYPE);
        const spellBook = TradingCards.getFirstDeck(userId, SPELLBOOK_TYPE);
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
                    left: 110 + (deck ? deck.sheet.position.width : 0),
                    top: 100
                }
            });
        }
    }

    /**
     * Ouvre le dialogue de pioche de la main courante. Avertit si aucune main
     * n'est sélectionnée.
     *
     * @returns {Promise<void>}
     */
    async drawCard() {
        if (this.currentCards == undefined) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoHandSelected"));
            return;
        }
        this.currentCards.drawDialog();
    }

    /**
     * Met une carte piochée en tampon puis, après un court délai, déclenche la
     * révélation de toutes les cartes de la même pioche d'un seul coup. Les cartes
     * d'une pioche multiple arrivent via plusieurs événements `createCard` quasi
     * simultanés : ce regroupement (debounce) les rassemble pour une seule
     * animation « toutes ensemble ».
     *
     * @param {Card} card - Une carte fraîchement piochée à révéler.
     *
     * @returns {void}
     */
    bufferDrawReveal(card) {
        const t = this;
        t._drawRevealBuffer.push(card);
        clearTimeout(t._drawRevealTimer);
        t._drawRevealTimer = setTimeout(function () {
            const cards = t._drawRevealBuffer.slice();
            t._drawRevealBuffer = [];
            t._drawRevealTimer = null;
            t.playDrawReveal(cards);
        }, 80);
    }

    /**
     * Joue une animation cosmétique de révélation des cartes piochées : un voile
     * noir plein écran apparaît, les cartes sont révélées face avant (rendues via
     * le même gabarit `card.hbs` que la main), maintenues brièvement, puis
     * « aspirées » vers la barre de main de cette barre avant que le voile ne se
     * dissolve. Purement local et cosmétique — aucun impact sur le moteur, aucun
     * socket. Un clic n'importe où accélère/passe l'animation.
     *
     * @param {Card[]} cards - Les cartes réellement piochées à révéler.
     *
     * @returns {Promise<void>}
     */
    async playDrawReveal(cards) {
        if (!Array.isArray(cards) || cards.length === 0) {
            return;
        }
        const t = this;
        const count = cards.length;

        const overlay = document.createElement("div");
        overlay.className = "fq-draw-reveal-overlay";
        const stage = document.createElement("div");
        stage.className = "fq-draw-reveal-stage";
        overlay.appendChild(stage);

        const shuffledAt = FqCardEngineModule.pendingShuffleReveal;
        FqCardEngineModule.pendingShuffleReveal = null;
        if (shuffledAt && (Date.now() - shuffledAt) < 10000) {
            const banner = document.createElement("div");
            banner.className = "fq-draw-reveal-banner";
            banner.textContent = game.i18n.localize("FQCARDENGINE.InfoMsgDeckShuffledSelf");
            overlay.appendChild(banner);
        }

        // Taille responsive : cartes aussi grandes que possible selon la hauteur
        // d'écran, mais assez petites pour que toute la volée tienne en largeur.
        const scaleByHeight = (window.innerHeight * 0.55) / 130;
        const scaleByWidth = (window.innerWidth * 0.9) / (count * 94 * 1.15);
        const scale = Math.max(1.6, Math.min(scaleByHeight, scaleByWidth, 5));
        stage.style.setProperty("--fq-scale", scale);

        // Rend chaque carte piochée face avant, à l'identique de la main.
        const elements = await Promise.all(cards.map(async (c, i) => {
            const renderData = t.buildCardRenderData(c, {forceFace: true});
            const html = await foundry.applications.handlebars.renderTemplate(
                "modules/fq-card-engine/src/templates/board/card.hbs", renderData);
            const el = $(html)[0];
            el.classList.add("fq-draw-reveal-card");
            // Léger éventail : rotation centrée autour du milieu de la volée.
            const rot = (i - (count - 1) / 2) * 5;
            el.style.setProperty("--fq-reveal-rot", rot + "deg");
            el.style.setProperty("--fq-reveal-delay", (i * 90) + "ms");
            return el;
        }));
        elements.forEach(el => stage.appendChild(el));

        document.body.appendChild(overlay);
        // Force un reflow avant de déclencher l'entrée (sinon la transition est ignorée).
        void overlay.offsetWidth;
        overlay.classList.add("fq-draw-reveal-in");

        // Machine à états : enter → charge (illumination immobile) → out (aspiration) → done.
        let phase = "enter";
        const timers = [];
        const clearTimers = () => {
            timers.forEach(clearTimeout);
            timers.length = 0;
        };

        // Vise la barre de main de CETTE barre ; renvoie le point d'arrivée à l'écran.
        const aimAtHand = () => {
            const target = document.getElementById("fq-card-engine-card-container-" + t.id);
            const rect = target?.getBoundingClientRect();
            const hx = (rect && rect.width) ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const hy = (rect && rect.width) ? rect.top + rect.height / 2 : window.innerHeight;
            stage.style.setProperty("--fq-reveal-out-x", (hx - window.innerWidth / 2) + "px");
            stage.style.setProperty("--fq-reveal-out-y", (hy - window.innerHeight / 2) + "px");
            return {hx, hy};
        };

        // Éclat lumineux à l'arrivée des cartes dans la main.
        const burstAt = (hx, hy) => {
            const burst = document.createElement("div");
            burst.className = "fq-draw-reveal-burst";
            burst.style.left = hx + "px";
            burst.style.top = hy + "px";
            overlay.appendChild(burst);
            setTimeout(() => burst.remove(), 700);
        };

        // Phase finale : accélération lumineuse vers la main puis éclat + nettoyage.
        const finish = () => {
            if (phase === "out" || phase === "done") {
                return;
            }
            phase = "out";
            clearTimers();
            const {hx, hy} = aimAtHand();
            overlay.classList.add("fq-draw-reveal-out");
            timers.push(setTimeout(() => burstAt(hx, hy), 430));
            timers.push(setTimeout(() => {
                phase = "done";
                overlay.remove();
            }, 900));
        };

        // Illumination : les cartes restent immobiles et s'éclairent avant le lancement.
        const charge = (chargeMs) => {
            if (phase !== "enter") {
                return;
            }
            phase = "charge";
            overlay.classList.add("fq-draw-reveal-charge");
            timers.push(setTimeout(finish, chargeMs));
        };

        // Durées : maintien plus long quand il y a plus de cartes (plafonné).
        const enterMs = 500 + count * 90;
        const holdMs = Math.min(1500 + count * 400, 3800);
        timers.push(setTimeout(() => charge(400), enterMs + holdMs));

        // Clic = accélère : illumination courte puis aspiration, ou fin immédiate.
        overlay.addEventListener("click", () => {
            if (phase === "enter") {
                clearTimers();
                charge(140);
            } else if (phase === "charge") {
                finish();
            } else {
                clearTimers();
                phase = "done";
                overlay.remove();
            }
        });
    }

    /**
     * Met à jour le titre affiché de la barre à partir du nom de la main et, côté
     * MJ, du nom de l'utilisateur associé et du numéro de barre.
     *
     * @returns {void}
     */
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

    /**
     * Calcule l'indice de cette barre parmi les barres du même utilisateur (0 pour
     * la première), afin de distinguer plusieurs barres attribuées au même joueur.
     *
     * @returns {void}
     */
    updatePlayerBarCount() {
        let count = 0;
        if (this.currentUser) {
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

    /**
     * (MJ) Applique la couleur de l'utilisateur associé sur la barre et sa barre
     * latérale (via une variable CSS), ou la retire si aucun utilisateur.
     *
     * @returns {void}
     */
    updatePlayerColor() {
        if (game.user.isGM) {
            const panel = this.html?.[0]?.querySelector(".fq-hand-toolbar");
            const sidebar = this.html?.[0]?.querySelector(".fq-hand-sidebar");
            if (!panel) return;

            if (this.currentUser) {
                const color = this.currentUser.color ?? this.currentUser.data?.color ?? "";
                panel.style.setProperty("--fq-player-color", color);
                sidebar?.style.setProperty("--fq-player-color", color);
            } else {
                panel.style.removeProperty("--fq-player-color");
                sidebar?.style.removeProperty("--fq-player-color");
            }
        }
    }

    /**
     * Gestionnaire de clic sur une carte : retrouve la carte via son `data-card-id`
     * et délègue le comportement à `FqCardEngineModule.cardClicked`.
     *
     * @param {Event} e - L'événement de clic.
     *
     * @returns {Promise<void>}
     */
    async cardClicked(e) {
        let id = $(e.target).closest("[data-card-id]").data("card-id");
        let card = this.currentCards.cards.get(id);
        FqCardEngineModule.cardClicked(this.currentCards, card);
    }

    /**
     * Gestionnaire de clic droit sur une carte : retrouve la carte via son
     * `data-card-id` et la retourne via `FqCardEngineModule.flipCard`.
     *
     * @param {Event} e - L'événement de clic droit.
     *
     * @returns {Promise<void>}
     */
    async flipCard(e) {
        let id = $(e.target).closest("[data-card-id]").data("card-id");
        let card = this.currentCards.cards.get(id);
        FqCardEngineModule.flipCard(card);
    }

    /**
     * Restaure l'état persistant de la barre (jeu de cartes et utilisateur
     * mémorisés dans les flags) puis rafraîchit l'affichage.
     *
     * @returns {void}
     */
    restore() {
        this.setCardsID(this.getStoredCardsID());
        this.setUserID(this.getStoredUserID());
        this.update();
    }

    /**
     * Persiste l'id du jeu de cartes de la barre dans les flags de l'utilisateur.
     *
     * @param {string} id - L'id du jeu de cartes à mémoriser.
     *
     * @returns {void}
     */
    storeCardsID(id) {
        game.user.setFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id, id);
    }

    /**
     * Retire l'id de jeu de cartes mémorisé et vide le jeu courant de la barre.
     *
     * @returns {void}
     */
    resetCardsID() {
        game.user.unsetFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id);
        this.currentCards = undefined;
    }

    /**
     * Retourne l'id du jeu de cartes mémorisé pour cette barre.
     *
     * @returns {string|undefined} L'id mémorisé, ou undefined.
     */
    getStoredCardsID() {
        return game.user.getFlag(FqCardEngineModule.moduleName, "CardsID-" + this.id);
    }

    /**
     * Persiste l'id de l'utilisateur de la barre dans les flags de l'utilisateur.
     *
     * @param {string} id - L'id de l'utilisateur à mémoriser.
     *
     * @returns {void}
     */
    storeUserID(id) {
        game.user.setFlag(FqCardEngineModule.moduleName, "UserID-" + this.id, id);
    }

    /**
     * Retire l'id d'utilisateur mémorisé et vide l'utilisateur courant de la barre.
     *
     * @returns {void}
     */
    resetUserID() {
        game.user.unsetFlag(FqCardEngineModule.moduleName, "UserID-" + this.id);
        this.currentUser = undefined;
    }

    /**
     * Retourne l'id de l'utilisateur mémorisé pour cette barre.
     *
     * @returns {string|undefined} L'id mémorisé, ou undefined.
     */
    getStoredUserID() {
        return game.user.getFlag(FqCardEngineModule.moduleName, "UserID-" + this.id);
    }

    /**
     * Réinitialise complètement la barre (jeu de cartes et utilisateur) et
     * synchronise les mains des autres clients (MJ).
     *
     * @returns {void}
     */
    reset() {
        this.resetCardsID();
        this.resetUserID();
        //updated for GMs
        game.socket.emit(FqCardEngineModule.eventName, {"action": "updatePlayers"});
        FqCardEngineModule.updatePlayerHandsDelayed();
    }

    /**
     * Retire du DOM l'élément HTML de la barre et désenregistre ses hooks de
     * synchronisation.
     *
     * @returns {void}
     */
    remove() {
        for (const [hook, id] of Object.entries(this._hookIds)) {
            Hooks.off(hook, id);
        }
        this._hookIds = {};
        if (this.html) {
            this.html.remove();
        }
    }

    /**
     * Retourne le jeu de cartes actuellement affiché par la barre.
     *
     * @returns {Cards|undefined} Le jeu de cartes courant, ou undefined.
     */
    getCards() {
        return this.currentCards;
    }
}
