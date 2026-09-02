import TradingCards, {DECK_TYPE, HAND_TYPE, SPELLBOOK_TYPE} from "../../trading/trading-cards.js";
import DisplayCard from "../card-svg/display-card.js";
import CardCondition from "../../engine/shared/card-condition.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {formatFatigue} from "../../../core/utils/dialog.utils.js";
import SpellbookWindow from "./spellbook-window.js";

const GENERATED_GLOW_DURATION_MS = 24000;

/**
 * Représente une barre de main affichée à l'écran (le module peut en gérer
 * plusieurs). Une barre est liée à un jeu de cartes (`currentCards`) et, côté MJ,
 * éventuellement à un utilisateur (`currentUser`). Elle gère le rendu des cartes,
 * les interactions (clic, retournement, glisser-déposer), les dialogues de
 * sélection et la persistance de son état dans les flags de l'utilisateur.
 */
export default class HandBoard {
    /**
     * Construit les données de gabarit d'une barre pour `hand.hbs` : `id`,
     * `manualActions` (droits étendus sur les cartes — reprise inchangée de
     * `playerLimitCardsRight === false || isGM`, conditionne les boutons de
     * pioche/ouverture de main) et `isGM`, clé DISTINCTE valant strictement
     * `game.user.isGM`, jamais dérivée du réglage `playerLimitCardsRight`
     * (BAR-02/D1-04) : c'est elle seule qui conditionne le bouton d'engrenage.
     *
     * @param {number} id - L'index/identifiant de la barre.
     *
     * @returns {{id: number, manualActions: boolean, isGM: boolean}} Les données de gabarit.
     */
    static buildTemplateData(id) {
        return {
            id: id,
            manualActions: CONFIG.FqCardEngine.options.playerLimitCardsRight === false || game.user.isGM,
            isGM: game.user.isGM
        };
    }

    /**
     * Instancie une barre de main : rend son gabarit, branche les gestionnaires
     * d'événements de l'UI, enregistre les hooks de synchronisation des cartes et
     * des utilisateurs, puis peuple son affichage initial et s'auto-enregistre
     * dans `FqCardEngineModule.handMiniBarList`. Côté MJ, l'affichage initial
     * restaure l'état persistant depuis les flags (`restore()`, inchangé). Côté
     * joueur non-MJ, aucun flag n'est lu ou écrit : `update()` résout directement
     * sa propre main via `TradingCards.getFirstDeck` (D1-01/D1-03).
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

        foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/hand.hbs",
            HandBoard.buildTemplateData(this.id)
        ).then(content => {
            content = $(content);
            content.find(".fq-card-engine-settings-hand").click(function (e) {
                t.openStackWindow(e);
            });
            content.find(".fq-card-engine-open-deck").click(function (e) {
                t.openDeck(e);
            });
            content.find(".fq-card-engine-settings-choose").click(function (e) {
                t.chooseUserDialog(e);
            });
            content.find(".fq-card-engine-draw").click(function () {
                t.drawCard();
            });
            $("#fq-card-engine-hands-container").prepend(content);
            FqCardEngineModule.setupHorizontalScroll(content[0]);
            // `html` est affecté AVANT le premier peuplement : `update()` refuse
            // de rendre tant qu'il est absent, ce premier rendu serait donc
            // silencieusement perdu et la barre resterait vide jusqu'à un
            // événement sans rapport.
            t.html = content;
            // MJ : restaure l'état persistant depuis les flags (D1-07, inchangé).
            // Joueur non-MJ : aucun flag, la résolution paresseuse de update()
            // (D1-01/D1-02/D1-03) suffit à peupler l'affichage initial.
            if (game.user.isGM) {
                t.restore();
            } else {
                t.update();
            }
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
            if (!!target && !!target.parent && (!!t.currentCards && target.parent._id == t.currentCards._id)) {
                t.update();
            }
        });

        this._hookIds.createCard = Hooks.on("createCard", function (target, options, userId) {
            if (!!target && !!target.parent && (!!t.currentCards && target.parent._id == t.currentCards._id)) {
                t.update();
                // Révélation cosmétique : uniquement pour le joueur qui pioche
                // (`userId` local) et uniquement pour les cartes réellement piochées
                // (`drawn`), quelle que soit la méthode de pioche. Les cartes innées
                // (`isInnate`), distribuées automatiquement, ne déclenchent pas la révélation.
                if (userId === game.user.id && target.drawn && !target.system?.fq?.isInnate) {
                    t.bufferDrawReveal(target);
                }
            }
        });

        // Réservé au MJ : `restore()` relit les flags de barre, et un joueur ne
        // mémorise plus rien (D1-03). Sans ce filtre, la barre d'un joueur
        // rouvrirait ce chemin de flags dès qu'un flag du module change
        // n'importe où dans le monde — y compris un flag hérité d'avant cette
        // phase, qui écraserait sa main résolue.
        this._hookIds.updateUser = Hooks.on("updateUser", function (target, data) {
            if (!game.user.isGM) {
                return;
            }
            //GM informs others not informaed by players
            if (data != undefined && data.flags !== undefined) {
                if (data.flags[FqCardEngineModule.moduleName] !== undefined) {
                    t.restore();
                }
            }
        });

        // BAR-03/D2-14 : signal de fin de (re)construction du deck d'un
        // utilisateur, déjà émis par TradingCards.updateDeckWhenChange (voir
        // 01-RESEARCH.md, Pattern 2). Enregistré INCONDITIONNELLEMENT (joueur ET
        // MJ) : un joueur se rafraîchit sur SA PROPRE reconstruction
        // (`userId === game.user.id`) ; un MJ se rafraîchit uniquement quand la
        // main du joueur qu'il suit ACTUELLEMENT (`t.currentUser`, lu à
        // l'exécution du callback, jamais figé à l'enregistrement) vient d'être
        // (re)construite. Sans ce filtre, la reconstruction du deck de n'importe
        // quel joueur recalculerait la barre de tous les autres clients. La clé
        // de `_hookIds` DOIT être le nom de hook littéral (accès par crochets) :
        // la boucle de nettoyage de remove() appelle Hooks.off(hook, id) avec
        // cette clé comme premier argument, une clé raccourcie casserait le
        // désenregistrement de ce hook précis.
        this._hookIds["fq-card-engine.deckRebuilt"] =
            Hooks.on("fq-card-engine.deckRebuilt", function (userId) {
                if (userId === game.user.id || (game.user.isGM && userId === t.currentUser?.id)) {
                    t.update();
                }
            });

        // Réévaluation du glow des réactifs (isReactiveReady) : sa jouabilité
        // dépend d'événements sans lien avec les documents cartes — logs de
        // combat (carte jouée, attaque/sort dnd5e via updateCombat), changement
        // de combattant, début/fin de combat, changement de cible. Débouncé car
        // renderCards reconstruit tout le DOM de la main et targetToken se
        // déclenche une fois par token (dé)ciblé.
        this._refreshReactiveGlow = foundry.utils.debounce(() => t.update(), 150);
        for (const hook of ["updateCombat", "combatTurnChange", "createCombat", "deleteCombat", "targetToken"]) {
            this._hookIds[hook] = Hooks.on(hook, () => t._refreshReactiveGlow());
        }
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
            id: c._id,
            description: description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            ...DisplayCard.buildBubbleData(cardContent, c),
            hasBeenPlayed: cardContent?.hasBeenPlayed,
            isPlayedThisRound: CardFqSystem.isPlayedThisRound(cardContent),
            isFQInnate: c.system?.fq?.isInnate,
            isGenerated: Date.now() - (c.flags?.[FqCardEngineModule.moduleName]?.generatedAt ?? 0) < GENERATED_GLOW_DURATION_MS,
            // Le verdict s'évalue avec le personnage de l'utilisateur LOCAL : pas de
            // glow sur les barres qui affichent la main d'un autre joueur (vue MJ).
            isReactiveReady: (!this.currentUser || this.currentUser.id === game.user?.id)
                && CardCondition.isReactiveReady(cardContent, c),
            cardsid: this.currentCards._id,
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
            const container = $("#fq-card-engine-card-container-" + t.id);
            container.empty();
            const sorted = [...this.currentCards.cards.contents].sort(FqCardEngineModule.cardSort);
            length = sorted.length;
            if (CONFIG.FqCardEngine.options.faceUpMode) {
                // Check to make sure all the cards are flipped over to their face
                for (const c of sorted) {
                    if (c.face == null) {
                        c.flip();
                    }
                }
            }
            // Rendus en parallèle puis append groupé : garantit l'ordre des cartes
            // et une seule passe de mesure/mise en page pour toute la main.
            Promise.all(sorted.map(c => foundry.applications.handlebars.renderTemplate(
                "modules/fq-card-engine/src/templates/board/card.hbs", t.buildCardRenderData(c)
            ))).then(contents => {
                contents.forEach((raw, i) => {
                    const content = $(raw);
                    content.click(function (e) {
                        t.cardClicked(e);
                    });
                    content.contextmenu(function (e) {
                        t.flipCard(e);
                    });
                    if (i === 0) {
                        content.addClass("fq-card-engine-hand-first-card");
                    }
                    container.append(content);
                });
                DisplayCard.fitDescriptionSize(container[0]);
                FqCardEngineModule.updateSize();
                if (resolve) {
                    //Return for the promise
                    resolve();
                }
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
     * Rafraîchit la barre : pour un joueur non-MJ, résout d'abord sa propre main
     * via `TradingCards.getFirstDeck` (aucun flag lu ni écrit, D1-01/D1-02/D1-03) —
     * c'est ce qui permet à la main d'apparaître sans rechargement de page dès
     * qu'elle existe (BAR-03). Pour le MJ, résout de la même façon la main du
     * joueur suivi (`currentUser`) — le même mécanisme, jamais un second
     * (BAR-04/D2-02) — sans lire ni écrire aucun flag `CardsID-*` (D2-03) ;
     * sans joueur suivi, la barre reste silencieusement vide (D2-04). Rend
     * ensuite les cartes puis (re)branche le glisser-déposer et l'effet
     * d'éventail. Un verrou `updating` évite les rendus concurrents : les
     * appels reçus pendant un rendu en cours sont coalescés via `pendingUpdate`
     * et déclenchent une unique relance à la fin du rendu. Sans cartes, met
     * seulement à jour le titre et la couleur du joueur, sans aucun
     * avertissement (D1-06).
     *
     * @returns {void}
     */
    update() {
        let t = this;
        if (t._removed) {
            return;
        }
        // Résolution paresseuse (D1-01/D1-02/D1-03 côté joueur, BAR-04/D2-02 côté
        // MJ) : un seul mécanisme (`TradingCards.getFirstDeck`) pour les deux
        // rôles, jamais une réimplémentation. warning=false : update() est appelé
        // très fréquemment (glow réactif débouncé, hooks de combat) et
        // republierait sinon l'avertissement en boucle tant que la main
        // n'existe pas (D1-06).
        if (!game.user.isGM) {
            t.currentCards = TradingCards.getFirstDeck(game.user.id, HAND_TYPE, false);
        } else if (t.currentUser) {
            t.currentCards = TradingCards.getFirstDeck(t.currentUser.id, HAND_TYPE, false);
        } else {
            // MJ sans joueur suivi : remet currentCards à zéro. Sans cette
            // remise à zéro, une barre dont le joueur suivi a disparu (ou a
            // été désélectionné) continuerait de rendre la dernière main
            // résolue, la valeur précédente n'étant jamais effacée.
            t.currentCards = undefined;
        }
        // Le gabarit est rendu de façon asynchrone alors que les hooks sont
        // posés dès le constructeur : un hook déclenché avant la résolution de
        // ce rendu trouverait `html` absent. La résolution paresseuse rend ce
        // cas nettement plus fréquent qu'avant, la main d'un joueur étant
        // désormais trouvée dès le premier appel. La résolution a lieu AVANT
        // cette garde : l'état reste à jour même quand le DOM n'est pas prêt.
        if (!t.html) {
            return;
        }
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
     * (MJ) Associe un utilisateur à la barre, persiste son id (seul flag encore
     * écrit par le chemin MJ, D2-03), recalcule l'indice de barre par joueur puis
     * rafraîchit l'affichage — c'est `update()` qui résout désormais la main du
     * joueur associé, par le même mécanisme que côté joueur (BAR-04/D2-02).
     *
     * @param {object} choice - L'utilisateur à associer à la barre.
     *
     * @returns {void}
     */
    setUserOption(choice) {
        this.currentUser = choice;
        this.storeUserID(this.currentUser._id);
        if (game.user.isGM) {
            FqCardEngineModule.updatePlayerBarCounts();
        }
        this.update();
    }

    /**
     * Sélectionne l'utilisateur de la barre à partir de son id. Un id falsy, ou
     * un id que `game.users.get` ne trouve pas (joueur retiré du monde), vide
     * l'utilisateur courant.
     *
     * @param {string} id - L'id de l'utilisateur, ou falsy pour le retirer.
     *
     * @returns {void}
     */
    setUserID(id) {
        this.currentUser = id ? (game.users.get(id) ?? undefined) : undefined;
    }

    /**
     * (MJ) Ouvre un dialogue de sélection d'un utilisateur parmi la liste des
     * joueurs et l'associe à la barre. Seule action désormais proposée par le
     * bouton d'engrenage (D2-01). Garde en profondeur (D2-12) : un joueur non-MJ
     * n'a plus ce bouton dans son gabarit (BAR-02/D1-04), mais cette méthode se
     * refuse aussi explicitement pour tout appelant direct (console, futur code) —
     * défense indépendante du masquage Handlebars, reprise du patron établi en
     * phase 1 (garde en profondeur des dialogues MJ).
     *
     * @returns {Promise<void>}
     */
    async chooseUserDialog() {
        if (!game.user.isGM) {
            return;
        }
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
     * Ouvre la fenêtre du grimoire (spellbook) de l'utilisateur associé à la
     * barre (ou de l'utilisateur courant) — et elle seule (D-02, CLEAN-02) :
     * la feuille du deck ne s'ouvre plus automatiquement. Les avertissements
     * de deck/grimoire manquant restent portés par `getFirstDeck`. Si le
     * grimoire est résolu mais pas le deck, rien ne s'ouvre : l'avertissement
     * a déjà été publié.
     *
     * @returns {Promise<void>}
     */
    async openDeck() {
        const userId = this.currentUser?._id ?? this.currentUser?.data?._id ?? game.userId;
        const deck = TradingCards.getFirstDeck(userId, DECK_TYPE);
        const spellBook = TradingCards.getFirstDeck(userId, SPELLBOOK_TYPE);
        if (spellBook && deck) {
            SpellbookWindow.open(spellBook, deck);
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

        // Bannière de remélange : le titre doré, et sous lui le bilan de fatigue en
        // rouge quand le remélange a coûté un rang d'épuisement et des points de vie.
        const shuffleReveal = FqCardEngineModule.pendingShuffleReveal;
        FqCardEngineModule.pendingShuffleReveal = null;
        if (shuffleReveal && (Date.now() - shuffleReveal.at) < 10000) {
            const banner = document.createElement("div");
            banner.className = "fq-draw-reveal-banner";
            const title = document.createElement("span");
            title.className = "fq-draw-reveal-banner-title";
            title.textContent = game.i18n.localize("FQCARDENGINE.InfoMsgDeckShuffledSelf");
            banner.appendChild(title);
            const fatigueText = formatFatigue(shuffleReveal.fatigue);
            if (fatigueText) {
                const fatigueLine = document.createElement("span");
                fatigueLine.className = "fq-draw-reveal-banner-fatigue";
                fatigueLine.textContent = fatigueText;
                banner.appendChild(fatigueLine);
            }
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
        DisplayCard.fitDescriptionSize(overlay);
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
            let userId = this.currentUser._id;
            for (let i = 0; i < list.length && i < this.id; i++) {
                let bar = list[i];
                if (bar.currentUser) {
                    let barUserId = bar.currentUser._id;
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
                const color = this.currentUser.color ?? "";
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
     * Restaure l'état persistant de la barre puis rafraîchit l'affichage. Pour un
     * joueur, seul le rafraîchissement compte (aucun flag mémorisé, D1-03). Pour
     * le MJ, seul le joueur suivi est restauré depuis `UserID-*` (D2-03) — plus
     * aucun flag `CardsID-*` n'est lu : c'est `update()`, appelé ensuite, qui
     * résout la main du joueur suivi (BAR-04/D2-02).
     *
     * @returns {void}
     */
    restore() {
        // Un joueur ne mémorise plus rien (D1-03) : relire ses flags de barre
        // écraserait la main que la résolution paresseuse vient de trouver, et
        // ferait ressurgir un flag hérité d'avant cette phase. Seul le
        // rafraîchissement est conservé pour lui.
        if (!game.user.isGM) {
            this.update();
            return;
        }
        this.setUserID(this.getStoredUserID());
        this.update();
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
     * Retourne l'id de l'utilisateur mémorisé pour cette barre.
     *
     * @returns {string|undefined} L'id mémorisé, ou undefined.
     */
    getStoredUserID() {
        return game.user.getFlag(FqCardEngineModule.moduleName, "UserID-" + this.id);
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
        // Neutralise les déclencheurs différés encore en vol : ils opéreraient
        // sinon sur le DOM d'une barre déjà retirée.
        if (this._drawRevealTimer) {
            clearTimeout(this._drawRevealTimer);
            this._drawRevealTimer = null;
        }
        this._drawRevealBuffer = [];
        this._removed = true;
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
