import DisplayCard from "../card-svg/display-card.js";
import {buildSpellbookGroups, computeCopyState, computeToggleAction} from "../../engine/shared/spellbook-grid.js";
import TradingCards from "../../trading/trading-cards.js";

/** Icône Font Awesome par état de distribution (aucune pour "none"). */
const COPY_STATE_ICONS = {
    partial: "fa-circle-half-stroke",
    full: "fa-circle-check"
};

/** Clé de localisation du tooltip par état de distribution. */
const COPY_STATE_TOOLTIP_KEYS = {
    none: "FQCARDENGINE.SpellBookCopiesNone",
    partial: "FQCARDENGINE.SpellBookCopiesPartial",
    full: "FQCARDENGINE.SpellBookCopiesFull"
};

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/**
 * Fenêtre `ApplicationV2` du grimoire : présentation en lecture seule des
 * cartes débloquées du joueur, en grille de vraies cartes `card-svg`. Une
 * instance par grimoire (`#instances`, keyée par `spellBook.id`) — un
 * singleton scalaire empêcherait le MJ d'ouvrir simultanément les grimoires
 * de plusieurs joueurs. La fenêtre ne lit l'état qu'à l'ouverture : aucun
 * hook Foundry n'est écouté, elle ne se met plus à jour ensuite.
 */
export default class SpellbookWindow extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @type {Map<string, SpellbookWindow>} Une instance par grimoire, keyée par `spellBook.id`. */
    static #instances = new Map();

    /** @type {{isEmpty: boolean, groups: object[]}} L'état préparé de la grille, mémorisé entre `_prepareContext` et `_onRender`. */
    #preparedGroups = {isEmpty: true, groups: []};

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["fq-spellbook-window"],
        window: {
            resizable: false,
            positioned: true,
            minimizable: true
        },
        actions: {
            fqToggleCopy: SpellbookWindow.#onToggleCopy
        }
    };

    /** @override */
    static PARTS = {
        grid: {
            template: "modules/fq-card-engine/src/templates/spellbook/spellbook-window.hbs",
            scrollable: [".fq-spellbook-grid"]
        }
    };

    /**
     * @param {Cards}   spellBook - Le grimoire du joueur.
     * @param {Cards}   deck      - Le deck du joueur.
     * @param {object}  [options] - Options additionnelles transmises à `ApplicationV2`.
     */
    constructor(spellBook, deck, options = {}) {
        const width = Math.min(1280, Math.max(640, Math.round(window.innerWidth * 0.85)));
        const height = Math.min(900, Math.max(480, Math.round(window.innerHeight * 0.85)));
        super({...options, position: {width, height}, window: {title: spellBook.name}});
        this.spellBook = spellBook;
        this.deck = deck;
    }

    /**
     * Ouvre la fenêtre du grimoire donné, ou la remet au premier plan si elle
     * est déjà ouverte (une instance par grimoire, D-04/D-09).
     *
     * @param {Cards} spellBook - Le grimoire à afficher.
     * @param {Cards} deck      - Le deck associé.
     *
     * @returns {SpellbookWindow} L'instance ouverte (existante ou nouvelle).
     */
    static open(spellBook, deck) {
        // L'instance de la Map fait foi, rendue ou non : `rendered` reste false
        // pendant tout le rendu asynchrone, s'y fier ouvrirait une seconde
        // fenêtre sur un double-clic rapide.
        const existing = SpellbookWindow.#instances.get(spellBook.id);
        if (existing) {
            if (existing.minimized) {
                existing.maximize();
            }
            existing.bringToFront();
            return existing;
        }
        const app = new SpellbookWindow(spellBook, deck);
        SpellbookWindow.#instances.set(spellBook.id, app);
        app.render(true);
        return app;
    }

    /**
     * Construit les données de rendu `card.hbs` d'une carte du grimoire, hors
     * de toute pile — copie fidèle de `CardSelection.buildCardRenderData`,
     * dupliquée ici plutôt qu'importée : `card-selection.js` porte une
     * dépendance à `socketlib.hook.js` dont le grimoire n'a aucun besoin.
     *
     * @param {Card} card - La carte du grimoire à rendre.
     *
     * @returns {object} Les données consommables par le gabarit `card.hbs`.
     */
    static buildCardRenderData(card) {
        const faceIndex = card.face ?? 0;
        const img = DisplayCard.getImgFromCard(card, faceIndex);
        const name = DisplayCard.getNameFromCard(card, faceIndex);
        const cardContent = card.system.fq?.choices?.length ? card.system.fq.choices[0] : {};
        const description = DisplayCard.getDescriptionFromCard(card, faceIndex);
        return {
            id: card._id ?? card.id,
            description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            ...DisplayCard.buildBubbleData(cardContent, card),
            isFQInnate: card.system?.fq?.isInnate,
            cardsid: "",
            uuid: card.uuid,
            back: false,
            img,
            name
        };
    }

    /**
     * Bascule le libellé de nom d'une carte déjà rendue vers le calque de
     * tooltip natif de Foundry (`data-tooltip`), monté hors de la fenêtre du
     * grimoire. La grille `.fq-spellbook-grid` est un conteneur
     * `overflow-y: auto`, qui rogne aussi horizontalement ; le
     * `span.fq-card-tooltip` du gabarit partagé est positionné en absolu
     * au-dessus de la carte et ne peut donc pas s'échapper de ce conteneur
     * pour toute carte de la première rangée ou proche d'un bord. Le calque
     * natif se recadre lui-même dans la fenêtre du navigateur.
     *
     * @param {Element} cardElement - L'élément racine d'une carte déjà rendue.
     *
     * @returns {void}
     */
    static applyNameTooltip(cardElement) {
        const inlineTooltip = cardElement.querySelector(".fq-card-tooltip");
        const label = (inlineTooltip
            ? inlineTooltip.textContent
            : game.i18n.localize(cardElement.getAttribute("title") ?? "")
        ).trim();

        inlineTooltip?.remove();
        cardElement.removeAttribute("title");

        if (label) {
            cardElement.dataset.tooltip = label;
        }
    }

    /**
     * Pose sur une carte déjà rendue la pastille de niveau, à gauche du badge
     * `n/N` (BOOK-01) : un `span.fq-card-badge.fq-spellbook-card-level`
     * inséré dans `.fq-card-inner` (retour silencieux si absent, miroir de
     * `#applyCopyState`), portant le niveau en texte brut
     * (`document.createElement`/`textContent`, jamais de HTML brut, T-01-08)
     * et un tooltip localisé posé via `dataset.tooltip`.
     *
     * @param {Element} cardElement - L'élément racine de la carte rendue.
     * @param {number}  level       - Le niveau de la carte (`card.system.fq.level`), déjà normalisé.
     *
     * @returns {void}
     */
    static applyLevelBadge(cardElement, level) {
        const inner = cardElement.querySelector(".fq-card-inner");
        if (!inner) {
            return;
        }
        const badge = document.createElement("span");
        badge.className = "fq-card-badge fq-spellbook-card-level";
        badge.textContent = String(level);
        badge.dataset.tooltip = game.i18n.format("FQCARDENGINE.SpellBookLevelTooltip", {level});
        inner.appendChild(badge);
    }

    /**
     * Prépare le contexte de rendu : groupe les cartes du grimoire par classe
     * (fonctions pures de `spellbook-grid.js`) et mémorise le résultat complet
     * pour `_onRender`. Le contexte renvoyé au gabarit ne contient AUCUN
     * document `Card` : seulement les métadonnées de groupe (`classKey`,
     * `classLabel`, `count`) — c'est `_onRender` qui insère les fragments de
     * carte rendus dans le DOM.
     *
     * @inheritDoc
     * @returns {Promise<object>} Le contexte de rendu.
     */
    async _prepareContext(_options) {
        this.#preparedGroups = buildSpellbookGroups(this.spellBook.cards.contents, this.deck);
        return {
            isEmpty: this.#preparedGroups.isEmpty,
            combatLocked: SpellbookWindow.isCombatLocked(),
            groups: this.#preparedGroups.groups.map(({classKey, classLabel, count}) => ({classKey, classLabel, count}))
        };
    }

    /**
     * Bascule le modificateur `fq-spellbook-window--combat-locked` sur
     * l'élément racine de la fenêtre (D2-06) : grille désaturée, curseur
     * d'interdiction, bannière visible — l'affichage seul, la garde réelle
     * vit dans `toggleCardCopies` (re-vérifiée à chaque clic, D2-06/D2-07).
     *
     * @param {Element} rootElement - L'élément racine de la fenêtre (`this.element`).
     * @param {boolean} locked      - Vrai si un combat est actif.
     *
     * @returns {void}
     */
    static applyCombatLock(rootElement, locked) {
        rootElement.classList.toggle("fq-spellbook-window--combat-locked", locked);
    }

    /**
     * Rend les cartes de chaque groupe de classe dans la grille, une fois le
     * gabarit inséré dans le DOM. Sans carte débloquée (`isEmpty`), il n'y a
     * aucun conteneur `[data-spellbook-cards]` à remplir.
     *
     * @inheritDoc
     * @returns {Promise<void>}
     */
    async _onRender(_context, _options) {
        const combatLocked = SpellbookWindow.isCombatLocked();
        SpellbookWindow.applyCombatLock(this.element, combatLocked);
        if (this.#preparedGroups.isEmpty) {
            return;
        }
        for (const group of this.#preparedGroups.groups) {
            const container = this.element.querySelector(`[data-spellbook-cards="${group.classKey}"]`);
            if (container) {
                await this.#renderCardsInto(container, group.entries);
            }
        }
        DisplayCard.fitDescriptionSize(this.element);
    }

    /**
     * Rend un lot de cartes et les insère dans le conteneur donné, dans
     * l'ordre reçu : vide le conteneur, rend chaque carte via le gabarit
     * partagé `board/card.hbs`, ajoute la classe `fq-spellbook-card` sur
     * chaque élément racine et retire son attribut `draggable` (les cartes du
     * grimoire ne se glissent pas), bascule le libellé de nom vers le calque
     * de tooltip natif (G-01-3), puis pose le badge `n/N` et la classe
     * d'état de distribution (BOOK-02, BOOK-03) à partir de l'état déjà
     * calculé par `buildSpellbookGroups`, et enfin la pastille de niveau
     * (BOOK-01), lue sur `card.system.fq.level`. N'appelle PAS `fitDescriptionSize` :
     * l'appelant le fait une seule fois, après le dernier appel à cette
     * méthode (un groupe de classe par appel).
     *
     * @param {Element}                          container - Le conteneur à remplir.
     * @param {{card: Card, copies: object}[]}   entries   - Les cartes à rendre, avec leur état de distribution, dans l'ordre d'affichage.
     *
     * @returns {Promise<void>}
     */
    async #renderCardsInto(container, entries) {
        container.replaceChildren();
        const contents = await Promise.all(entries.map(({card}) => foundry.applications.handlebars.renderTemplate(
            "modules/fq-card-engine/src/templates/board/card.hbs", SpellbookWindow.buildCardRenderData(card)
        )));
        contents.forEach((raw, i) => {
            const el = $(raw)[0];
            if (!el) {
                return;
            }
            el.classList.add("fq-spellbook-card");
            el.setAttribute("draggable", "false");
            el.dataset.action = "fqToggleCopy";
            SpellbookWindow.applyNameTooltip(el);
            SpellbookWindow.applyCopyState(el, entries[i].copies);
            const level = Number(entries[i].card?.system?.fq?.level) || 0;
            SpellbookWindow.applyLevelBadge(el, level);
            container.appendChild(el);
        });
    }

    /**
     * Pose sur une carte déjà rendue la classe d'état de distribution
     * (`fq-spellbook-card--{state}`) et le badge `n/N` correspondant, inséré
     * dans `.fq-card-inner` (miroir du badge « Innée » existant). Le badge est
     * construit via `document.createElement`/`textContent`, jamais par
     * affectation de HTML brut (T-01-02). N'ADD/n'APPEND jamais après un
     * nettoyage : un second appel sur une carte déjà peuplée empile classe
     * d'état et badge (voir `patchCopyState`, qui nettoie avant de rappeler
     * cette méthode).
     *
     * @param {Element} cardElement - L'élément racine de la carte rendue.
     * @param {{count: number, max: number, state: string}} copies - L'état de distribution déjà calculé.
     *
     * @returns {void}
     */
    static applyCopyState(cardElement, copies) {
        const {count, max, state} = copies;
        cardElement.classList.add(`fq-spellbook-card--${state}`);

        const inner = cardElement.querySelector(".fq-card-inner");
        if (!inner) {
            return;
        }
        const badge = document.createElement("span");
        badge.className = `fq-card-badge fq-spellbook-card-badge fq-spellbook-card-badge--${state}`;
        const iconClass = COPY_STATE_ICONS[state];
        if (iconClass) {
            const icon = document.createElement("i");
            icon.className = `fa-solid ${iconClass}`;
            badge.appendChild(icon);
        }
        const text = document.createElement("span");
        text.textContent = `${count}/${max}`;
        badge.appendChild(text);
        badge.dataset.tooltip = state === "none"
            ? game.i18n.localize(COPY_STATE_TOOLTIP_KEYS.none)
            : state === "partial"
                ? game.i18n.format(COPY_STATE_TOOLTIP_KEYS.partial, {n: count, total: max})
                : game.i18n.format(COPY_STATE_TOOLTIP_KEYS.full, {total: max});
        inner.appendChild(badge);
    }

    /**
     * Nettoie la classe d'état et le badge `n/N` déjà posés sur une carte
     * rendue avant de rappeler `applyCopyState`, qui ne fait jamais que
     * ajouter/append (jamais remplacer) : un second appel sans ce nettoyage
     * préalable empilerait deux badges et deux classes d'état.
     *
     * @param {Element} cardElement - L'élément racine de la carte déjà rendue.
     * @param {{count: number, max: number, state: string}} copies - Le nouvel état de distribution.
     *
     * @returns {void}
     */
    static patchCopyState(cardElement, copies) {
        cardElement.classList.remove(
            "fq-spellbook-card--none", "fq-spellbook-card--partial", "fq-spellbook-card--full"
        );
        cardElement.querySelector(".fq-spellbook-card-badge")?.remove();
        SpellbookWindow.applyCopyState(cardElement, copies);
    }

    /**
     * Prédicat unique de combat actif du module (D2-06/D2-07) : dérivé de
     * `game.combat`, jamais d'exception pour le MJ. Doit être re-vérifié à
     * chaque clic, pas seulement au rendu — la fenêtre est une photo de
     * l'instant T (D-05/D-07 de la phase 1) et un combat peut démarrer après
     * son ouverture.
     *
     * @returns {boolean} Vrai si un combat est actif.
     */
    static isCombatLocked() {
        return !!game.combat;
    }

    /**
     * Cœur testable du geste de bascule au clic (COPY-01..05, BOOK-04) :
     * verrou anti double-clic (D2-09), garde de combat re-vérifiée à chaque
     * clic (D2-06/D2-07), décision pure via `computeToggleAction`, mutation
     * groupée du deck (D2-11/D2-12), puis patch chirurgical du badge — jamais
     * de re-fetch ni d'abonnement à un hook Foundry (D2-10, Pitfall 3 : la
     * collection locale du deck est déjà à jour au retour de la promesse).
     * Aucune boîte de confirmation, dans aucun des deux sens (D2-05).
     *
     * @param {Element} cardElement - L'élément racine de la carte cliquée.
     * @param {Card}    card        - La carte du grimoire concernée.
     * @param {Cards}   deck        - Le deck du joueur, cible de la mutation.
     *
     * @returns {Promise<void>}
     */
    static async toggleCardCopies(cardElement, card, deck) {
        if (cardElement.dataset.busy === "true") {
            return;
        }
        if (SpellbookWindow.isCombatLocked()) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.SpellBookCombatLockedBanner"));
            return;
        }

        const {action, count} = computeToggleAction(computeCopyState(card, deck));
        if (count <= 0) {
            return;
        }

        cardElement.dataset.busy = "true";
        cardElement.classList.add("fq-spellbook-card--busy");
        try {
            if (action === "create") {
                await TradingCards.createCardsForDeck(deck, Array(count).fill(card));
            } else {
                const matches = deck.cards.filter(c => c.name === card.name);
                await TradingCards.deleteCardsForDeck(deck, matches);
            }
            SpellbookWindow.patchCopyState(cardElement, computeCopyState(card, deck));
        } catch (err) {
            ui.notifications.error(err.message);
        } finally {
            cardElement.dataset.busy = "false";
            cardElement.classList.remove("fq-spellbook-card--busy");
        }
    }

    /**
     * Action handler `ApplicationV2` du clic sur une carte du grimoire :
     * résout la carte cliquée depuis le grimoire courant (jamais un
     * identifiant DOM falsifié ne peut résoudre une carte hors du grimoire),
     * puis délègue à `toggleCardCopies` avec le deck tenu par l'instance
     * depuis l'ouverture, jamais un identifiant lu dans le DOM.
     *
     * @this {SpellbookWindow}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  target - L'élément portant `data-action="fqToggleCopy"`.
     *
     * @returns {Promise<void>}
     */
    static async #onToggleCopy(event, target) {
        const cardId = target.closest("[data-card-id]")?.dataset.cardId;
        const card = this.spellBook.cards.get(cardId);
        if (!card) {
            return;
        }
        await SpellbookWindow.toggleCardCopies(target, card, this.deck);
    }

    /**
     * À la fermeture, retire l'instance de `#instances` si elle correspond
     * bien à celle-ci (évite qu'une réouverture concurrente écrase la Map).
     *
     * @inheritDoc
     */
    _onClose(options) {
        super._onClose(options);
        if (SpellbookWindow.#instances.get(this.spellBook.id) === this) {
            SpellbookWindow.#instances.delete(this.spellBook.id);
        }
    }
}
