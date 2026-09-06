import DisplayCard from "../card-svg/display-card.js";
import {
    buildLevelOptions, buildSpellbookGroups, computeCopyState, computeDeckSize, computeIncrementAction,
    computeToggleAction, matchesSpellbookFilters
} from "../../engine/shared/spellbook-grid.js";
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

/** Délai du survol prolongé avant remplissage du panneau d'aperçu (D3-01, UI-SPEC §3), en millisecondes. */
const PREVIEW_DWELL_DELAY = 250;

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

    /** @type {{classKey: string, level: string, search: string}} L'état de filtre courant, entre deux événements de la barre d'outils (D3-06). */
    #filters = {classKey: "", level: "", search: ""};

    /**
     * @type {number|null} Le minuteur partagé du survol prolongé du panneau
     * d'aperçu. DOIT vivre dans ce champ privé d'instance, jamais comme
     * propriété d'un nœud DOM : le cycle de fermeture d'`ApplicationV2` retire
     * l'élément de fenêtre et annule sa référence (`this.#element = null`)
     * AVANT d'exécuter `_onClose` — un nettoyage passant par `this.element` à
     * ce moment ne pourrait jamais s'exécuter (RESEARCH, Pitfall 1). Le
     * précédent de nettoyage accroché à un nœud DOM, déjà présent dans ce
     * fichier pour la secousse de badge (`badge._fqShakeCleanup`), ne
     * s'applique PAS ici : il est invoqué depuis un code qui tient encore une
     * référence directe au nœud, jamais depuis `_onClose`.
     */
    #dwellTimer = null;

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["fq-spellbook-window"],
        window: {
            resizable: false,
            positioned: true,
            minimizable: true
        },
        actions: {
            fqToggleCopy: SpellbookWindow.#onToggleCopy,
            fqResetFilters: SpellbookWindow.#onResetFilters
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
        const width = Math.min(2400, Math.max(640, Math.round(window.innerWidth * 0.85)));
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
     * de toute pile — le socle est partagé avec `CardSelection.buildCardRenderData`
     * via `DisplayCard.buildBaseCardRenderData` ; seul ce socle est importé, jamais
     * `card-selection.js` lui-même, qui porte une dépendance à `socketlib.hook.js`
     * dont le grimoire n'a aucun besoin.
     *
     * @param {Card} card - La carte du grimoire à rendre.
     *
     * @returns {object} Les données consommables par le gabarit `card.hbs`.
     */
    static buildCardRenderData(card) {
        return {
            ...DisplayCard.buildBaseCardRenderData(card, card.face ?? 0),
            cardsid: "",
            back: false,
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
     * `classLabel`, `count`), les niveaux distincts pour le filtre de niveau
     * et la taille initiale du deck — c'est `_onRender` qui insère les
     * fragments de carte rendus dans le DOM. Le contexte ne connaît jamais
     * l'état de filtre lui-même, purement DOM (RESEARCH, Pitfall 5).
     *
     * @inheritDoc
     * @returns {Promise<object>} Le contexte de rendu.
     */
    async _prepareContext(_options) {
        this.#preparedGroups = buildSpellbookGroups(this.spellBook.cards.contents, this.deck);
        return {
            isEmpty: this.#preparedGroups.isEmpty,
            combatLocked: SpellbookWindow.isCombatLocked(),
            groups: this.#preparedGroups.groups.map(({classKey, classLabel, count}) => ({classKey, classLabel, count})),
            levelOptions: buildLevelOptions(this.spellBook.cards.contents),
            deckSize: computeDeckSize(this.deck)
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
     * aucun conteneur `[data-spellbook-cards]` à remplir, ni barre d'outils ni
     * panneau à câbler (UI-SPEC §1).
     *
     * @inheritDoc
     * @returns {Promise<void>}
     */
    async _onRender(_context, _options) {
        const combatLocked = SpellbookWindow.isCombatLocked();
        SpellbookWindow.applyCombatLock(this.element, combatLocked);
        const gridElement = this.element.querySelector(".fq-spellbook-grid");
        if (gridElement) {
            SpellbookWindow.bindAddOneCopy(gridElement, this.spellBook, this.deck);
        }
        const toolbarElement = this.element.querySelector(".fq-spellbook-toolbar");
        if (toolbarElement && gridElement) {
            SpellbookWindow.bindFilterControls(toolbarElement, gridElement, filters => {
                this.#filters = filters;
            });
        }
        SpellbookWindow.applyDeckSize(this.element, computeDeckSize(this.deck));
        if (this.#preparedGroups.isEmpty) {
            return;
        }
        for (const group of this.#preparedGroups.groups) {
            const container = this.element.querySelector(`[data-spellbook-cards="${group.classKey}"]`);
            if (container) {
                await this.#renderCardsInto(container, group.entries);
            }
        }
        if (toolbarElement && gridElement) {
            // Un re-rendu du PART hors filtre (minimisation, changement de
            // position…) reconstruit la barre d'outils à ses valeurs par
            // défaut ; ré-appliquer #filters ici garde la grille cohérente
            // avec le dernier critère choisi par le joueur, sans exiger un
            // nouveau geste sur les contrôles. Sur le tout premier rendu,
            // #filters part vide : ce passage est un no-op (RESEARCH).
            for (const [name, value] of Object.entries(this.#filters)) {
                const control = toolbarElement.querySelector(`[name="${name}"]`);
                if (control) {
                    control.value = value;
                }
            }
            SpellbookWindow.applyFilters(gridElement, this.#filters);
            toolbarElement.classList.toggle(
                "fq-spellbook-toolbar--filtered",
                !!(this.#filters.classKey || this.#filters.level || this.#filters.search)
            );
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
     * (BOOK-01), lue sur `card.system.fq.level`. Pose aussi les attributs de
     * données lus par `applyFilters` (`data-card-class`, recopié du conteneur
     * de groupe pour que le filtre et l'en-tête de groupe parlent toujours de
     * la même valeur ; `data-card-level` ; `data-card-name`, le nom localisé,
     * seul texte sur lequel la recherche a un sens) et les écouteurs de survol
     * prolongé/prise de focus du panneau d'aperçu (D3-01, D3-04) — posés PAR
     * CARTE et non délégués : `mouseenter`/`mouseleave` ne bouillonnent pas,
     * et cette méthode vide son conteneur et recrée chaque nœud de carte à
     * chaque appel, si bien qu'aucun ancien écouteur ne survit à son ancien
     * nœud (aucune accumulation possible d'un rendu à l'autre). N'appelle PAS
     * `fitDescriptionSize` : l'appelant le fait une seule fois, après le
     * dernier appel à cette méthode (un groupe de classe par appel).
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
            const {card, copies} = entries[i];
            el.classList.add("fq-spellbook-card");
            el.setAttribute("draggable", "false");
            el.dataset.action = "fqToggleCopy";
            SpellbookWindow.applyNameTooltip(el);
            SpellbookWindow.applyCopyState(el, copies);
            const level = Number(card?.system?.fq?.level) || 0;
            SpellbookWindow.applyLevelBadge(el, level);
            el.dataset.cardClass = container.dataset.spellbookCards ?? "";
            el.dataset.cardLevel = String(level);
            el.dataset.cardName = game.i18n.localize(card.name);
            el.addEventListener("mouseenter", () => this.#schedulePreview(card));
            el.addEventListener("mouseleave", () => this.#cancelPreview());
            el.addEventListener("focusin", () => this.#showPreview(card));
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
            SpellbookWindow.patchDeckSize(cardElement, deck);
        } catch (err) {
            ui.notifications.error(err.message);
        } finally {
            cardElement.dataset.busy = "false";
            cardElement.classList.remove("fq-spellbook-card--busy");
        }
    }

    /**
     * Cœur testable du geste additif au clic droit (COPY-07, D21-01, D21-03) :
     * jumelle stricte de `toggleCardCopies`, mêmes gardes dans le même ordre
     * (verrou anti double-geste PARTAGÉ avec le clic gauche, D21-05 ; garde de
     * combat re-vérifiée à chaque geste, D21-06) mais décision plafonnée par
     * `computeIncrementAction` : jamais plus d'UN exemplaire créé par appel,
     * jamais de retrait. Le compte se lit toujours sur le deck seul, exemplaires
     * marqués comme piochés compris (BOOK-07) — jamais sur la main ni la
     * défausse. Quand le maximum est déjà atteint, aucune mutation n'a lieu et
     * `signalMaxReached` produit le signal « maximum atteint » (D21-02) — la
     * garde de combat l'emporte toujours sur ce signal, jamais l'inverse.
     *
     * @param {Element} cardElement - L'élément racine de la carte visée.
     * @param {Card}    card        - La carte du grimoire concernée.
     * @param {Cards}   deck        - Le deck du joueur, cible de la mutation.
     *
     * @returns {Promise<void>}
     */
    static async addOneCopy(cardElement, card, deck) {
        if (cardElement.dataset.busy === "true") {
            return;
        }
        if (SpellbookWindow.isCombatLocked()) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.SpellBookCombatLockedBanner"));
            return;
        }

        const copies = computeCopyState(card, deck);
        const {action, count} = computeIncrementAction(copies);
        if (action !== "create") {
            SpellbookWindow.signalMaxReached(cardElement, copies.max);
            return;
        }

        cardElement.dataset.busy = "true";
        cardElement.classList.add("fq-spellbook-card--busy");
        try {
            await TradingCards.createCardsForDeck(deck, Array(count).fill(card));
            SpellbookWindow.patchCopyState(cardElement, computeCopyState(card, deck));
            SpellbookWindow.patchDeckSize(cardElement, deck);
        } catch (err) {
            ui.notifications.error(err.message);
        } finally {
            cardElement.dataset.busy = "false";
            cardElement.classList.remove("fq-spellbook-card--busy");
        }
    }

    /**
     * Signale qu'une carte est déjà au maximum d'exemplaires (D21-02) : une
     * secousse brève et ponctuelle du badge `n/N`, ou une notification quand
     * le mouvement réduit est demandé, ou quand la carte n'a pas de badge —
     * un signal au moins est toujours produit. La lecture de `badge.offsetWidth`
     * force un recalcul de mise en page entre le retrait et la repose de la
     * classe d'animation : sans cette lecture, le navigateur ne voit aucun
     * changement d'état entre les deux et un geste répété ne rejoue jamais la
     * secousse. La classe est retirée à la fin de l'animation (`animationend`,
     * mode `once`), ce qui rend la secousse rejouable au geste suivant.
     *
     * @param {Element} cardElement - L'élément racine de la carte visée.
     * @param {number}  max         - Le nombre maximal d'exemplaires prévu par la carte.
     *
     * @returns {void}
     */
    static signalMaxReached(cardElement, max) {
        const badge = cardElement.querySelector(".fq-spellbook-card-badge");
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

        if (!badge || reducedMotion) {
            ui.notifications.info(game.i18n.format("FQCARDENGINE.SpellBookMaxReached", {max}));
            return;
        }

        badge.classList.remove("fq-spellbook-card-badge--shake");
        void badge.offsetWidth;
        badge.classList.add("fq-spellbook-card-badge--shake");
        // Une secousse interrompue par un geste répété n'émet jamais son
        // animationend : sans retrait de l'écouteur précédent, chaque geste
        // en empilerait un de plus sur ce badge tant que la fenêtre vit.
        if (badge._fqShakeCleanup) {
            badge.removeEventListener("animationend", badge._fqShakeCleanup);
        }
        badge._fqShakeCleanup = () => {
            badge.classList.remove("fq-spellbook-card-badge--shake");
            delete badge._fqShakeCleanup;
        };
        badge.addEventListener("animationend", badge._fqShakeCleanup, {once: true});
    }

    /**
     * Pose UN gestionnaire délégué d'événement `contextmenu` sur la grille du
     * grimoire, jamais carte par carte (D21-04) : la règle d'état en vol de la
     * phase 2 neutralise les événements de pointeur sur une carte verrouillée
     * (`pointer-events: none`), un gestionnaire posé sur la carte elle-même ne
     * serait donc jamais atteint pendant le verrou et laisserait réapparaître
     * le menu du navigateur. Posé au niveau de la grille, l'événement est reçu
     * dans les deux cas : sur une carte active, la remontée trouve la carte et
     * le geste s'exécute ; sur une carte verrouillée, la cible est le
     * conteneur de cartes, l'événement est annulé et aucune mutation n'a lieu.
     * La liaison ne s'accumule pas d'un rendu à l'autre : le gabarit du PART
     * reconstruit l'élément de grille à chaque rendu, l'ancien gestionnaire
     * disparaît donc avec l'ancien élément. Le gestionnaire d'action natif de
     * bascule du clic gauche n'est déclenché que par le bouton principal de la
     * souris — un clic droit ne peut donc jamais le déclencher, ce qui permet
     * aux deux gestes de coexister sur le même élément sans se marcher dessus.
     *
     * @param {Element} gridElement - L'élément `.fq-spellbook-grid` du rendu courant.
     * @param {Cards}   spellBook   - Le grimoire courant, pour résoudre l'identifiant de carte.
     * @param {Cards}   deck        - Le deck du joueur, cible de la mutation.
     *
     * @returns {void}
     */
    static bindAddOneCopy(gridElement, spellBook, deck) {
        gridElement.addEventListener("contextmenu", event => {
            if (!event.target.closest(".fq-spellbook-cards")) {
                // Hors de la zone des cartes (en-tête de groupe, etc.) : le menu
                // du navigateur reste disponible partout ailleurs.
                return;
            }
            // Première instruction après le filtre de zone, AVANT toute autre
            // garde : le menu du navigateur doit disparaître y compris sur une
            // carte complète, verrouillée ou pendant un combat (D21-04).
            event.preventDefault();

            const cardElement = event.target.closest(".fq-spellbook-card");
            if (!cardElement) {
                return;
            }
            const card = spellBook.cards.get(cardElement.dataset.cardId);
            if (!card) {
                // Identifiant falsifié dans le DOM : ne résout qu'une carte du
                // grimoire courant, jamais hors de ce périmètre.
                return;
            }
            // Le gestionnaire d'événement reste synchrone : la promesse de
            // addOneCopy n'est jamais attendue ici.
            SpellbookWindow.addOneCopy(cardElement, card, deck);
        });
    }

    /**
     * Lit l'état de filtre courant depuis les contrôles de la barre d'outils
     * (BOOK-05, D3-06). Replie chaque contrôle absent ou sans valeur sur la
     * chaîne vide — ce repli n'est pas défensif par habitude : il permet à la
     * fonction de rester juste alors que les menus déroulants de classe et de
     * niveau n'existent pas encore avant la tâche 2 de la phase.
     *
     * @param {Element} toolbarElement - L'élément `.fq-spellbook-toolbar` du rendu courant.
     *
     * @returns {{classKey: string, level: string, search: string}} L'état de filtre lu.
     */
    static readFilters(toolbarElement) {
        return {
            classKey: toolbarElement.querySelector("[name=\"classKey\"]")?.value ?? "",
            level: toolbarElement.querySelector("[name=\"level\"]")?.value ?? "",
            search: toolbarElement.querySelector("[name=\"search\"]")?.value ?? ""
        };
    }

    /**
     * Applique la combinaison de filtres reçue à la grille déjà rendue : une
     * opération DOM pure, synchrone, sans re-rendu du gabarit (RESEARCH,
     * Anti-Patterns — un `this.render()` reperdrait la frappe en cours dans le
     * champ de recherche). Bascule `fq-spellbook-card--filtered-out` sur
     * chaque carte selon `matchesSpellbookFilters`, réécrit le compte de
     * chaque en-tête de groupe en « (visible/total) » dès qu'un critère est
     * actif ou en « (total) » seul sinon, bascule `fq-spellbook-group--empty`
     * quand un groupe n'a plus aucune carte visible (D3-05), et révèle ou
     * masque `.fq-spellbook-no-results` selon qu'au moins une carte reste
     * visible (D3-08). Ne touche à AUCUNE autre classe : ni l'état de
     * distribution, ni les badges, ni les attributs d'action — le filtrage
     * n'est jamais qu'une question de visibilité (D3-07, D3-13).
     *
     * @param {Element} gridElement - L'élément `.fq-spellbook-grid` du rendu courant.
     * @param {{classKey: string, level: string, search: string}} filters - L'état de filtre à appliquer.
     *
     * @returns {void}
     */
    static applyFilters(gridElement, filters) {
        const hasActiveFilter = !!(filters.classKey || filters.level || filters.search);
        let anyVisible = false;
        for (const groupElement of gridElement.querySelectorAll(".fq-spellbook-group")) {
            const cards = [...groupElement.querySelectorAll(".fq-spellbook-card")];
            let visibleCount = 0;
            for (const cardElement of cards) {
                const cardMeta = {
                    classKey: cardElement.dataset.cardClass ?? "",
                    level: cardElement.dataset.cardLevel ?? "",
                    name: cardElement.dataset.cardName ?? ""
                };
                const match = matchesSpellbookFilters(cardMeta, filters);
                cardElement.classList.toggle("fq-spellbook-card--filtered-out", !match);
                if (match) {
                    visibleCount++;
                    anyVisible = true;
                }
            }
            const countElement = groupElement.querySelector(".fq-spellbook-group-count");
            if (countElement) {
                countElement.textContent = hasActiveFilter ? `(${visibleCount}/${cards.length})` : `(${cards.length})`;
            }
            groupElement.classList.toggle("fq-spellbook-group--empty", visibleCount === 0);
        }
        const noResultsElement = gridElement.querySelector(".fq-spellbook-no-results");
        if (noResultsElement) {
            const hasAnyCard = gridElement.querySelector(".fq-spellbook-card") !== null;
            noResultsElement.hidden = !(hasAnyCard && !anyVisible);
        }
    }

    /**
     * Point unique par lequel passent toutes les mises à jour de filtre, quelle
     * qu'en soit l'origine (changement de contrôle ou réinitialisation) : lit
     * les critères courants via `readFilters`, les applique via `applyFilters`,
     * bascule `fq-spellbook-toolbar--filtered` sur la barre d'outils selon
     * qu'au moins un critère est actif (révèle le bouton de réinitialisation),
     * et renvoie les critères lus pour que l'appelant les mémorise.
     *
     * @param {Element} toolbarElement - L'élément `.fq-spellbook-toolbar` du rendu courant.
     * @param {Element} gridElement    - L'élément `.fq-spellbook-grid` du rendu courant.
     *
     * @returns {{classKey: string, level: string, search: string}} Les critères de filtre lus et appliqués.
     */
    static refreshFilters(toolbarElement, gridElement) {
        const filters = SpellbookWindow.readFilters(toolbarElement);
        SpellbookWindow.applyFilters(gridElement, filters);
        toolbarElement.classList.toggle(
            "fq-spellbook-toolbar--filtered", !!(filters.classKey || filters.level || filters.search)
        );
        return filters;
    }

    /**
     * Remet à la chaîne vide la valeur de chaque contrôle nommé de la barre
     * d'outils (classe, niveau, recherche). Ne déclenche aucun événement et
     * n'applique rien elle-même — c'est à l'appelant d'enchaîner sur
     * `refreshFilters` pour que la grille se recompacte.
     *
     * @param {Element} toolbarElement - L'élément `.fq-spellbook-toolbar` du rendu courant.
     *
     * @returns {void}
     */
    static resetFilterControls(toolbarElement) {
        for (const control of toolbarElement.querySelectorAll("[name]")) {
            control.value = "";
        }
    }

    /**
     * Pose les écouteurs des trois contrôles de filtre, câblés à la main sur
     * le modèle exact de `bindAddOneCopy` : le mécanisme d'action déclaratif
     * de la fenêtre (`DEFAULT_OPTIONS.actions`) n'écoute que le clic, un
     * attribut d'action posé sur un `<select>`/`<input>` ne serait jamais
     * déclenché par un `change`/`input` (RESEARCH, vérifié dans le client
     * Foundry) — même raison que celle qui a imposé la liaison manuelle du
     * menu contextuel en phase 2.1. `change` sur les deux menus déroulants
     * s'ils existent, `input` sur le champ de recherche — une réaction à
     * chaque caractère, sans anti-rebond : le masquage est une opération DOM
     * synchrone et bon marché sur quelques dizaines d'éléments (UI-SPEC §2).
     * Une liaison unique posée au rendu est sûre : le gabarit du PART
     * reconstruit la barre d'outils à chaque rendu, les anciens écouteurs
     * disparaissent avec l'ancien élément.
     *
     * @param {Element}  toolbarElement    - L'élément `.fq-spellbook-toolbar` du rendu courant.
     * @param {Element}  gridElement       - L'élément `.fq-spellbook-grid` du rendu courant.
     * @param {Function} onFiltersChanged  - Rappel invoqué avec les critères courants après chaque mise à jour.
     *
     * @returns {void}
     */
    static bindFilterControls(toolbarElement, gridElement, onFiltersChanged) {
        const onChange = () => {
            const filters = SpellbookWindow.refreshFilters(toolbarElement, gridElement);
            onFiltersChanged(filters);
        };
        toolbarElement.querySelector("[name=\"classKey\"]")?.addEventListener("change", onChange);
        toolbarElement.querySelector("[name=\"level\"]")?.addEventListener("change", onChange);
        toolbarElement.querySelector("[name=\"search\"]")?.addEventListener("input", onChange);
    }

    /**
     * Action handler `ApplicationV2` de réinitialisation des filtres,
     * partagée par les DEUX boutons de réinitialisation — celui de la barre
     * d'outils et celui de l'état « aucun résultat » (un seul geste à deux
     * déclencheurs). Résout la barre d'outils et la grille depuis l'élément de
     * fenêtre, sort sans rien faire si l'une des deux manque, remet les
     * contrôles à zéro puis stocke le retour de `refreshFilters` dans
     * `this.#filters`.
     *
     * @this {SpellbookWindow}
     * @param {PointerEvent} _event - L'événement de clic déclencheur, non utilisé.
     * @param {HTMLElement}  _target - L'élément cliqué, non utilisé.
     *
     * @returns {void}
     */
    static #onResetFilters(_event, _target) {
        const toolbarElement = this.element.querySelector(".fq-spellbook-toolbar");
        const gridElement = this.element.querySelector(".fq-spellbook-grid");
        if (!toolbarElement || !gridElement) {
            return;
        }
        SpellbookWindow.resetFilterControls(toolbarElement);
        this.#filters = SpellbookWindow.refreshFilters(toolbarElement, gridElement);
    }

    /**
     * Construit, puis pose sous la racine reçue, le libellé de l'indicateur de
     * taille de deck (D3-09, D3-10) : le texte localisé de
     * `FQCARDENGINE.SpellBookDeckSize` est découpé sur son marqueur de
     * substitution littéral `{count}` — plutôt qu'un formatage direct — pour
     * isoler le seul chiffre dans son propre nœud
     * `span.fq-spellbook-deck-size-count`, mis en valeur typographique sans le
     * sortir de sa phrase localisée (UI-SPEC §4). Le marqueur étant littéral
     * et stable dans les deux fichiers de langue, le découpage l'est aussi ;
     * quand il est absent de la chaîne (localisation simulée des tests), la
     * partie après est simplement vide et le compte reste présent dans son
     * propre nœud. Tout est construit par création d'élément et affectation de
     * texte, jamais par affectation de HTML brut. IDEMPOTENTE et
     * silencieuse : sort sans erreur si la racine est absente ou si
     * l'indicateur n'y est pas — ce repli n'est pas facultatif, les tests des
     * phases 2 et 2.1 passent un élément de carte détaché de toute racine.
     *
     * @param {Element} rootElement - La racine de fenêtre (`.fq-spellbook-body` ou un ancêtre), ou `null`/`undefined`.
     * @param {number}  size        - Le nombre total d'exemplaires du deck.
     *
     * @returns {void}
     */
    static applyDeckSize(rootElement, size) {
        const counterHost = rootElement?.querySelector?.(".fq-spellbook-deck-size");
        if (!counterHost) {
            return;
        }
        counterHost.querySelector(".fq-spellbook-deck-size-label")?.remove();
        const template = game.i18n.localize("FQCARDENGINE.SpellBookDeckSize");
        const [before, after = ""] = template.split("{count}");
        const label = document.createElement("span");
        label.className = "fq-spellbook-deck-size-label";
        if (before) {
            label.appendChild(document.createTextNode(before));
        }
        const countSpan = document.createElement("span");
        countSpan.className = "fq-spellbook-deck-size-count";
        countSpan.textContent = String(size);
        label.appendChild(countSpan);
        if (after) {
            label.appendChild(document.createTextNode(after));
        }
        counterHost.appendChild(label);
    }

    /**
     * Patch chirurgical de l'indicateur de taille de deck après une mutation
     * réussie (D3-10), au même point que `patchCopyState` : remonte de
     * l'élément de carte muté jusqu'à `.fq-spellbook-body` — l'unique racine
     * du PART, donc toujours un ancêtre de toute carte quelle que soit la
     * profondeur de nesting de cette phase (RESEARCH, Pitfall 4) — puis
     * délègue à `applyDeckSize`. C'est la seule façon d'atteindre l'indicateur
     * depuis les méthodes de mutation, dont la signature est figée depuis les
     * phases 2 et 2.1 et ne reçoit que l'élément de carte ; ce couplage à la
     * structure du gabarit est assumé.
     *
     * @param {Element} cardElement - L'élément racine de la carte muté.
     * @param {Cards}   deck        - Le deck du joueur, pour le calcul du total.
     *
     * @returns {void}
     */
    static patchDeckSize(cardElement, deck) {
        const rootElement = cardElement.closest(".fq-spellbook-body");
        SpellbookWindow.applyDeckSize(rootElement, computeDeckSize(deck));
    }

    /**
     * Rend le fragment de carte du panneau d'aperçu (D3-04) : exactement le
     * même chemin de rendu que la grille —
     * `buildCardRenderData`/`renderTemplate("board/card.hbs", …)` — jamais un
     * clone d'un nœud déjà rendu (RESEARCH, Pitfall 3 : `fitDescriptionSize`
     * ne fait que réduire la police, un clone hériterait de la taille déjà
     * ajustée pour la petite boîte de la grille). Pose la classe dédiée
     * `fq-spellbook-preview-card` — jamais `fq-spellbook-card`, qui apporterait
     * le curseur cliquable et le liseré de survol de la phase 2 sur un
     * fragment qui n'est pas interactif — retire l'attribut de glisser-déposer
     * et l'attribut d'action, remplace intégralement le contenu du panneau
     * (efface l'invite au premier remplissage), et n'appelle
     * `fitDescriptionSize` qu'APRÈS cette insertion, sur le fragment du
     * panneau.
     *
     * Le panneau retire les marques propres au grimoire : ni badge
     * d'exemplaires, ni pastille de niveau, ni halo d'état de distribution.
     * Ces marques servent à balayer la grille du regard ; ici la carte est lue
     * en grand, et tout ajout recouvrirait ce qu'on cherche justement à lire.
     * La pastille « Innée » fait exception : elle appartient à la carte
     * elle-même et non au grimoire, et c'est en grand qu'elle se lit le mieux.
     *
     * @param {Element} previewElement - L'élément `.fq-spellbook-preview-content` du rendu courant.
     * @param {Card}    card           - La carte du grimoire à afficher en grand.
     *
     * @returns {Promise<void>}
     */
    static async renderPreviewCard(previewElement, card) {
        const raw = await foundry.applications.handlebars.renderTemplate(
            "modules/fq-card-engine/src/templates/board/card.hbs", SpellbookWindow.buildCardRenderData(card)
        );
        const el = $(raw)[0];
        if (!el) {
            return;
        }
        el.classList.add("fq-spellbook-preview-card");
        el.removeAttribute("draggable");
        el.removeAttribute("data-action");
        SpellbookWindow.applyNameTooltip(el);
        el.querySelectorAll(".fq-spellbook-card-badge, .fq-spellbook-card-level").forEach(badge => badge.remove());
        previewElement.replaceChildren(el);
        DisplayCard.fitDescriptionSize(el);
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
     * Arme le minuteur partagé du survol prolongé (D3-01) pour la carte reçue,
     * après avoir annulé celui déjà en cours : un seul minuteur pour toute la
     * fenêtre, si bien que passer rapidement la souris sur plusieurs cartes ne
     * peut jamais accumuler de minuteurs concurrents — le suivant réassigne
     * toujours le champ.
     *
     * @param {Card} card - La carte survolée.
     *
     * @returns {void}
     */
    #schedulePreview(card) {
        clearTimeout(this.#dwellTimer);
        this.#dwellTimer = setTimeout(() => this.#showPreview(card), PREVIEW_DWELL_DELAY);
    }

    /**
     * Annule le minuteur de survol en cours, et RIEN d'autre : le contenu du
     * panneau reste exactement ce qu'il était (D3-02, persistance verrouillée
     * — le panneau est une zone de lecture, pas une infobulle).
     *
     * @returns {void}
     */
    #cancelPreview() {
        clearTimeout(this.#dwellTimer);
    }

    /**
     * Remplit le panneau d'aperçu avec la carte reçue : résout
     * `.fq-spellbook-preview-content` depuis l'élément de fenêtre, sort si
     * l'élément ou le panneau manque, puis délègue à `renderPreviewCard`.
     * Appelée directement par la prise de focus (immédiatement, sans délai,
     * UI-SPEC §6) et par l'expiration du minuteur de survol.
     *
     * @param {Card} card - La carte à afficher en grand.
     *
     * @returns {Promise<void>}
     */
    async #showPreview(card) {
        const previewElement = this.element?.querySelector(".fq-spellbook-preview-content");
        if (!previewElement) {
            return;
        }
        await SpellbookWindow.renderPreviewCard(previewElement, card);
        // Le rendu du gabarit est asynchrone : un re-rendu de la partie
        // survenu pendant l'attente aurait détaché le conteneur capturé plus
        // haut, et la carte s'écrirait dans un nœud invisible. On rejoue alors
        // le remplissage sur le conteneur réellement affiché.
        const current = this.element?.querySelector(".fq-spellbook-preview-content");
        if (current && current !== previewElement) {
            await SpellbookWindow.renderPreviewCard(current, card);
        }
    }

    /**
     * À la fermeture, retire l'instance de `#instances` si elle correspond
     * bien à celle-ci (évite qu'une réouverture concurrente écrase la Map).
     * Annule EN PREMIER le minuteur de survol en cours, sans jamais passer par
     * `this.element` : `_tearDown` retire l'élément et annule sa référence
     * AVANT que `_onClose` ne s'exécute (RESEARCH, Pitfall 1 — vérifié dans le
     * client Foundry), le nettoyage lit donc uniquement le champ privé
     * `#dwellTimer`.
     *
     * @inheritDoc
     */
    _onClose(options) {
        clearTimeout(this.#dwellTimer);
        super._onClose(options);
        if (SpellbookWindow.#instances.get(this.spellBook.id) === this) {
            SpellbookWindow.#instances.delete(this.spellBook.id);
        }
    }
}
