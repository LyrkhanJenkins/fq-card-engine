import Constants from "../../constants.js";
import DisplayCard from "../shared/display-card.js";
import TargetingView from "../shared/targeting-view.js";
import ZoneTargeting from "../shared/zone-targeting.js";
import AdjacentTargeting from "../shared/adjacent-targeting.js";
import CombatTargeting from "../shared/combat-targeting.js";
import ObjectUtils from "../../../core/utils/object.utils.js";
import Minion from "../../engine/shared/minion.js";
import PlayCard from "../../engine/play-card.js";
import FormError from "../../../core/error/form-error.model.js";
import CardEffect from "../../engine/shared/card-effect.js";
import ResourceHandler from "../../engine/shared/resource-handler.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {PILE_TYPE} from "../../trading/trading-cards.js";

// Correspondance verdict de ciblage (`ResourceHandler.TARGETING_VERDICT`) → clé du
// message d'erreur du formulaire de jeu. `ok` n'y figure pas (aucune erreur levée).
const TARGETING_FORM_ERROR = {
    none: "FQCARDENGINE.DialogPlayFormErrorNoTarget",
    multipleNotAllowed: "FQCARDENGINE.DialogPlayFormErrorNoMultipleTarget",
    tooMany: "FQCARDENGINE.DialogPlayFormErrorTooManyTargets",
    noCasterToken: "FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene",
    outOfReach: "FQCARDENGINE.DialogPlayFormErrorOutOfReach",
};

// Dialogue « Jouer la carte » actuellement ouvert. Une seule instance doit
// exister à la fois : le mode ciblage (hook `targetToken`, barre flottante,
// outil « target ») est global, deux dialogues ouverts se marcheraient dessus.
// Ouvrir un nouveau dialogue ferme le précédent (voir `playDialog`).
let openPlayDialog = null;

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

        const discards = game.cards.filter(c => (c !== currentCards) && (c.system.fq.type === PILE_TYPE) && c.testUserPermission(game.user, "LIMITED"))
            .sort((a, b) => Number(b.system.fq.owner === game.user.id) - Number(a.system.fq.owner === game.user.id));

        if (!discards.length) return ui.notifications.warn("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
        if (currentCards.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoPermission"));
        }

        if (!card.system.fq?.choices?.length) {
            return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgCardNotImplemented"));
        }

        let initCardContents = card.system.fq.choices;
        let cardContents = ObjectUtils.deepCopy(card.system.fq.choices);
        // Libellé localisé pour l'affichage du sélecteur d'effet ; la valeur (`name`)
        // reste brute car elle sert de clé de correspondance à la validation.
        cardContents.forEach(cc => cc.localizedName = game.i18n.localize(cc.name));

        let firstChoice = cardContents[0];
        const firstChoiceString = JSON.stringify(firstChoice);

        const hasXVariable = !firstChoice.xvalue && !!firstChoiceString.match(/XXX/);
        const hasYVariable = !firstChoice.yvalue && !!firstChoiceString.match(/YYY/);
        const hasVariables = hasXVariable || hasYVariable;

        if (!Constants.actorCurrent) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }

        const character = Constants.actorCurrent;
        // Panneau de ciblage
        // (source de vérité unique → « ce qu'on voit = ce qui bloque »). Calculé pour le
        // premier choix au rendu initial ; recalculé en direct par le hook renderDialog
        // (au ciblage/déciblage et au changement de choix).
        const panel = TargetingView.build(firstChoice, {});

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
            critical: character.system?.fq?.attributes?.critical ?? 0,
            evasion: character.system?.fq?.attributes?.evasion ?? 0,
            sacrificedSkeleton: character.system?.fq?.special?.sacrificedSkeleton ?? 0,
            rangeBonus: character.system?.fq?.bonus?.range ?? 0,
            damageBonus: character.system?.fq?.bonus?.damage ?? "",
            healBonus: character.system?.fq?.bonus?.heal ?? "",
            showSacrifice: (character.system?.fq?.special?.sacrificedSkeleton ?? 0) > 0,
            showRangeBonus: (character.system?.fq?.bonus?.range ?? 0) > 0,
            showDamageBonus: DisplayCard.hasBonusStr(character.system?.fq?.bonus?.damage),
            showHealBonus: DisplayCard.hasBonusStr(character.system?.fq?.bonus?.heal),
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
            ...DisplayCard.buildBubbleData(firstChoice, card),

            discards,
            panel,
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

        // Ferme le dialogue « Jouer » déjà ouvert (le cas échéant) avant d'afficher
        // celui-ci : garantit une instance unique et déclenche le nettoyage du mode
        // ciblage du précédent via son hook `closeDialog`.
        if (openPlayDialog) {
            await openPlayDialog.close();
            openPlayDialog = null;
        }

        Hooks.once("renderDialog", (app, _html) => {
            const root = app.element instanceof HTMLElement ? app.element : app.element[0];
            openPlayDialog = app;

            // ── Panneau de ciblage actif + mode ciblage ──
            // Câblé AVANT le garde de navigation ci-dessous pour ne pas dépendre de la
            // présence des boutons prev/next. Le view-model partagé alimente le panneau
            // (rendu initial + refresh live) et la barre du mode ciblage.
            let targetingBar = null;

            // Recalcule le view-model pour le CHOIX SÉLECTIONNÉ (cohérent avec le garde-fou).
            const currentView = () => {
                const {fd, cardContent} = this.getCardContent(root, cardContents, discards);
                return TargetingView.build(cardContent, fd);
            };

            const updateBar = (view) => {
                const label = targetingBar?.querySelector(".fq-play-targeting-bar-label");
                if (label) {
                    label.classList.toggle("fq-play-target--oor", view.tooMuchTargets);
                    label.textContent = `${game.i18n.localize("FQCARDENGINE.TargetingPanelInProgress")} ${view.count} / ${view.required}`;
                }
            };

            // Re-rend le partial dans `.fq-play-targets-content` (et la barre si active).
            const renderPanel = async () => {
                const content = root.querySelector(".fq-play-targets-content");
                if (!content) return;
                const view = currentView();
                content.innerHTML = await foundry.applications.handlebars.renderTemplate(
                    "modules/fq-card-engine/src/templates/partials/targeting-panel.hbs", view
                );
                if (targetingBar) updateBar(view);
            };

            // Sortie du mode ciblage : revient à l'outil « select », restaure la dialog
            // (jamais fermée → état préservé) et rafraîchit le panneau avec les cibles finales.
            const exitTargeting = async () => {
                await ui.controls?.activate?.({control: "tokens", tool: "select"});
                root.classList.remove("fq-targeting-mode");
                targetingBar?.remove();
                targetingBar = null;
                renderPanel();
            };

            // Entrée du mode ciblage : outil « target » actif + canvas libéré (CSS) +
            // barre flottante « Ciblage… X / N — [Terminé] ». La dialog reste ouverte.
            const enterTargeting = async () => {
                await ui.controls?.activate?.({control: "tokens", tool: "target"});
                root.classList.add("fq-targeting-mode");
                targetingBar = document.createElement("div");
                targetingBar.className = "fq-play-targeting-bar";
                const label = document.createElement("span");
                label.className = "fq-play-targeting-bar-label";
                const doneBtn = document.createElement("button");
                doneBtn.type = "button";
                doneBtn.className = "fq-play-targeting-done";
                doneBtn.textContent = game.i18n.localize("FQCARDENGINE.TargetingPanelDone");
                doneBtn.addEventListener("click", () => exitTargeting());
                targetingBar.append(label, doneBtn);
                document.body.appendChild(targetingBar);
                updateBar(currentView());
                ui.notifications.info(game.i18n.localize("FQCARDENGINE.TargetingPanelTargetHint"));
            };

            // Pose de zone (targetType « Zone ») : le canvas est libéré (CSS) le temps
            // de la pose interactive, les cibles sont acquises par la région posée,
            // puis le panneau se rafraîchit avec les cibles finales. Ni barre ni
            // outil « target » : la pose est modale côté canvas (clic pour poser,
            // clic droit/Échap pour annuler).
            const enterZonePlacement = async () => {
                const {fd, cardContent} = this.getCardContent(root, cardContents, discards);
                root.classList.add("fq-targeting-mode");
                ui.notifications.info(game.i18n.localize("FQCARDENGINE.TargetingPanelZoneHint"));
                try {
                    await ZoneTargeting.placeZoneAndAcquireTargets(cardContent, fd);
                } finally {
                    root.classList.remove("fq-targeting-mode");
                    renderPanel();
                }
            };

            // Ciblages automatiques « Adjacent » et « Combat » : acquisition sans
            // interaction — au rendu initial, au changement de choix et à la saisie
            // de X/Y (certaines portées dépendent de XXX). Le garde-fou ré-acquiert
            // au moment du jeu, l'aperçu du panneau n'est donc jamais bloquant.
            const acquireIfAutomatic = () => {
                const {fd, cardContent} = this.getCardContent(root, cardContents, discards);
                if (cardContent?.targetType === CardFqSystem.TARGET_TYPE_ADJACENT) {
                    AdjacentTargeting.acquireTargets(cardContent, fd);
                } else if (CardFqSystem.isCombatTargetType(cardContent?.targetType)) {
                    CombatTargeting.acquireTargets(cardContent, fd);
                } else {
                    return;
                }
                renderPanel();
            };
            acquireIfAutomatic();
            root.querySelectorAll("input[name=\"XXX\"], input[name=\"YYY\"]")
                .forEach(el => el.addEventListener("change", () => acquireIfAutomatic()));

            // Boutons « 🎯 Cibler » / « ⭕ Poser la zone » : listeners DÉLÉGUÉS sur
            // `root` (survivent au re-rendu du panneau).
            root.addEventListener("click", (event) => {
                if (event.target.closest(".fq-play-zone-btn")) {
                    event.preventDefault();
                    enterZonePlacement();
                    return;
                }
                if (!event.target.closest(".fq-play-target-btn")) return;
                event.preventDefault();
                enterTargeting();
            });

            const targetHookId = Hooks.on("targetToken", () => renderPanel());
            // Changer de choix invalide la zone posée (l'autre choix peut avoir une
            // toute autre forme/taille de zone, voire ne pas être une zone).
            root.querySelector("select[name=\"nameContent\"]")?.addEventListener("change", () => {
                ZoneTargeting.clearPlacement();
                acquireIfAutomatic();
                renderPanel();
            });
            // Nettoyage obligatoire à la fermeture de CETTE dialog : retirer le hook
            // targetToken (pas de fuite), enlever la barre et revenir à l'outil « select »
            // si on ferme en plein ciblage.
            Hooks.once("closeDialog", (closedApp) => {
                if (closedApp !== app) return;
                if (openPlayDialog === app) openPlayDialog = null;
                Hooks.off("targetToken", targetHookId);
                ZoneTargeting.clearPlacement();
                targetingBar?.remove();
                if (root.classList.contains("fq-targeting-mode")) {
                    ui.controls?.activate?.({control: "tokens", tool: "select"});
                }
            });

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
     * formulaire du dialogue (bouton OK) extraites via `getCardContent`. Vérifie le
     * placement des sbires, recalcule tout le contenu de façon synchrone (bonus de
     * caractéristiques, variables X/Y, données dérivées), garde le ciblage, publie le
     * message de chat de choix multiple le cas échéant, puis délègue au moteur.
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

        // Recalcul complet du contenu avec els caracteristiques dnd5E
        CardEffect.replaceCardContentAbilitiesBonus(cardContent);

        // Garde de bornes max et min de X/Y
        const boundVerdict = CardEffect.evaluateXYBounds(cardContent, fd.XXX, fd.YYY);
        if (boundVerdict) {
            throw new FormError(game.i18n.format(boundVerdict.messageKey, boundVerdict.format));
        }
        // calcul X/Y
        CardEffect.substituteXAndYValue(cardContent, hasVariables, fd.XXX, fd.YYY);
        CardEffect.prepareDataFromCard(cardContent);

        // ── Garde-fou de ciblage ── Pour une carte Zone, POSER LA ZONE SUFFIT :
        // les cibles ont été acquises à la pose (même aucune — la zone peut tomber
        // sur du vide), la portée y a déjà été contrôlée, nbTargets ne s'applique pas.
        if (cardContent?.targetType === CardFqSystem.TARGET_TYPE_ZONE) {
            if (!ZoneTargeting.hasPlacement()) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoZone"));
            }
        } else if (cardContent?.targetType === CardFqSystem.TARGET_TYPE_ADJACENT) {
            // Acquisition automatique au moment du jeu (les tokens ont pu bouger
            // depuis l'aperçu du panneau) : l'anneau vide bloque le jeu.
            const {status, count} = AdjacentTargeting.acquireWithin(cardContent.minReach, cardContent.maxReach);
            if (status === AdjacentTargeting.ACQUISITION.NO_CASTER_TOKEN) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene"));
            }
            if (count === 0) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoAdjacentTarget"));
            }
        } else if (CardFqSystem.isCombatTargetType(cardContent?.targetType)) {
            // Acquisition automatique au moment du jeu (les combattants ont pu
            // bouger, mourir ou rejoindre le combat depuis l'aperçu du panneau) :
            // sans combat actif ni combattant du bon camp à portée, le jeu bloque.
            const {status, count} = CombatTargeting.acquireCombatants(cardContent.targetType, cardContent.minReach, cardContent.maxReach);
            if (status === CombatTargeting.ACQUISITION.NO_CASTER_TOKEN) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene"));
            }
            if (status === CombatTargeting.ACQUISITION.NO_COMBAT) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoCombat"));
            }
            if (count === 0) {
                throw new FormError(game.i18n.localize("FQCARDENGINE.DialogPlayFormErrorNoCombatTarget"));
            }
        } else if (cardContent?.minReach || cardContent?.maxReach) {
            const {verdict} = ResourceHandler.evaluateTargeting(Constants.actorCurrent, cardContent.nbTargets, cardContent.minReach, cardContent.maxReach, cardContent.targetType);
            const errorKey = TARGETING_FORM_ERROR[verdict];
            if (errorKey) {
                throw new FormError(game.i18n.localize(errorKey));
            }
        }

        if (cardContents.length > 1 && !CONFIG.FqCardEngine.options.betterChatMessages) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: Constants.actorCurrent}),
                content: `<div>${game.i18n.format("FQCARDENGINE.ChatMessageCardEffectChoice", {nameContent: game.i18n.localize(fd.nameContent)})}</div>`
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
