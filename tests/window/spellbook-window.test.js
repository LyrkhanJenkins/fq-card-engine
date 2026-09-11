import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import DisplayCard from "../../src/domain/interface/card-svg/display-card.js";

const {default: SpellbookWindow} = await import("../../src/domain/interface/window/spellbook-window.js");

// `$(html)[0]` (jQuery) n'est fourni par aucune dépendance npm de ce projet :
// en Foundry réel, jQuery est un global du client. Mock minimal suffisant
// pour extraire le premier élément racine d'un fragment HTML rendu — les
// méthodes testées ici (`renderPreviewCard`, `#renderCardsInto` via `_onRender`)
// s'en servent exactement de cette façon.
if (!globalThis.$) {
    globalThis.$ = html => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = typeof html === "string" ? html.trim() : "";
        return [...wrapper.children];
    };
}

/**
 * Fabrique une carte factice du grimoire, suffisante pour
 * `computeCopyState`/`computeToggleAction` : un nom et un `maxSameCard`
 * arbitraires, jamais une carte réelle de compendium (aucun test ne
 * verrouille une valeur d'équilibrage). Porte aussi `back`/`faces`/`face` —
 * squelette minimal exigé par `DisplayCard.getImgFromCard`/`getDescriptionFromCard`,
 * traversés par `buildCardRenderData` (tâche 4, `renderPreviewCard`/`_onRender`).
 *
 * @param {object} [options]              - Options de fabrication.
 * @param {string} [options.name]         - Le nom de la carte.
 * @param {number} [options.maxSameCard]  - Le nombre d'exemplaires prévu.
 * @param {string} [options.id]           - L'identifiant source de la carte.
 *
 * @returns {object} La carte factice.
 */
function makeFakeCard({name = "Boule de feu", maxSameCard = 3, id = "sourceCardId"} = {}) {
    return {
        id, _id: id, name, face: 0,
        back: {img: ""},
        faces: [{img: "", text: ""}],
        system: {fq: {maxSameCard}}
    };
}

/**
 * Fabrique un deck factice dont `createEmbeddedDocuments`/
 * `deleteEmbeddedDocuments` mutent réellement `cards` — c'est ce que fait
 * Foundry avant de résoudre la promesse (RESEARCH Pitfall 3) : la vraie
 * chaîne `TradingCards` est exercée, jamais réimplémentée dans le test.
 *
 * @param {object[]} [initialCards] - Les cartes déjà présentes dans le deck.
 *
 * @returns {object} Le deck factice.
 */
function makeFakeDeck(initialCards = []) {
    let nextId = 0;
    const deck = {
        cards: [...initialCards],
        createEmbeddedDocuments: vi.fn(async (type, data) => {
            const created = data.map(cardData => {
                const newCard = {id: `generated-${nextId++}`, name: cardData.name};
                deck.cards.push(newCard);
                return newCard;
            });
            return created;
        }),
        deleteEmbeddedDocuments: vi.fn(async (type, ids) => {
            deck.cards = deck.cards.filter(c => !ids.includes(c.id));
            return ids;
        })
    };
    return deck;
}

/**
 * Bascule du libellé de nom de carte du grimoire vers le calque de tooltip
 * natif de Foundry (`applyNameTooltip`) : la grille `.fq-spellbook-grid`
 * rogne (`overflow-y: auto`) la tooltip inline positionnée en absolu au-dessus
 * de la carte, pour toute carte de la première rangée ou proche d'un bord.
 * Le rendu visuel du calque natif lui-même n'est pas observable en Vitest
 * (`tests/setup.js` ne monte aucun gestionnaire de tooltip Foundry) : il est
 * couvert par le bloc `<human-check>` du plan, en UAT Foundry.
 */

/**
 * Fabrique un élément racine de carte, réplique de la structure produite par
 * `board/card.hbs` : un `div.fq-card` portant l'attribut `title`, un enfant
 * `div.fq-card-inner`, et, quand `withInline` est vrai, un `span.fq-card-tooltip`
 * frère portant le libellé.
 *
 * @param {object}  [options]              - Options de fabrication.
 * @param {string}  [options.name]         - Le libellé de nom porté par la carte.
 * @param {boolean} [options.withInline]   - Si vrai, ajoute le `span.fq-card-tooltip` frère.
 * @param {boolean} [options.withBadge]    - Si vrai, ajoute dans `.fq-card-inner` un badge portant déjà son propre `data-tooltip`.
 *
 * @returns {Element} L'élément racine de carte fabriqué.
 */
function makeCardElement({name = "Boule de feu", withInline = true, withBadge = false} = {}) {
    const el = document.createElement("div");
    el.className = "fq-card";
    el.setAttribute("title", name);

    const inner = document.createElement("div");
    inner.className = "fq-card-inner";
    el.appendChild(inner);

    if (withBadge) {
        const badge = document.createElement("span");
        badge.className = "fq-card-badge fq-spellbook-card-badge";
        badge.dataset.tooltip = "1/3 distribuées";
        inner.appendChild(badge);
    }

    if (withInline) {
        const tooltip = document.createElement("span");
        tooltip.className = "fq-card-tooltip";
        tooltip.textContent = name;
        el.appendChild(tooltip);
    }

    return el;
}

describe("SpellbookWindow.applyNameTooltip — bascule du libellé de nom vers le calque natif", () => {
    test("pose data-tooltip avec le libellé du span.fq-card-tooltip", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyNameTooltip(el);

        expect(el.dataset.tooltip).toBe("Boule de feu");
    });

    test("retire le span.fq-card-tooltip du DOM", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyNameTooltip(el);

        expect(el.querySelector(".fq-card-tooltip")).toBeNull();
    });

    test("retire l'attribut title de l'élément racine", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyNameTooltip(el);

        expect(el.hasAttribute("title")).toBe(false);
    });

    test("un enfant portant déjà son propre data-tooltip (badge n/N) conserve sa valeur intacte", () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const badge = el.querySelector(".fq-card-badge");

        SpellbookWindow.applyNameTooltip(el);

        expect(badge.dataset.tooltip).toBe("1/3 distribuées");
    });

    test("repli sur l'attribut title, localisé, quand le span.fq-card-tooltip est absent", () => {
        const el = makeCardElement({name: "FQCARDTITLE.BouleDeFeu", withInline: false});

        SpellbookWindow.applyNameTooltip(el);

        expect(game.i18n.localize).toHaveBeenCalledWith("FQCARDTITLE.BouleDeFeu");
        expect(el.dataset.tooltip).toBe("FQCARDTITLE.BouleDeFeu");
        expect(el.hasAttribute("title")).toBe(false);
    });

    test("libellé vide ou uniquement composé d'espaces : aucun data-tooltip n'est posé", () => {
        const el = makeCardElement({name: "   "});

        SpellbookWindow.applyNameTooltip(el);

        expect(el.hasAttribute("data-tooltip")).toBe(false);
    });

    test("ne lève pas sur un élément sans libellé inline ni attribut title", () => {
        const el = makeCardElement({withInline: false});
        el.removeAttribute("title");

        expect(() => SpellbookWindow.applyNameTooltip(el)).not.toThrow();
        expect(el.hasAttribute("data-tooltip")).toBe(false);
    });
});

describe("SpellbookWindow.applyLevelBadge — pastille de niveau à gauche du badge n/N", () => {
    test("crée une pastille portant le niveau en texte", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyLevelBadge(el, 3);

        const badge = el.querySelector(".fq-spellbook-card-level");
        expect(badge).not.toBeNull();
        expect(badge.textContent).toBe("3");
    });

    test("affiche le niveau 0 comme les autres valeurs", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyLevelBadge(el, 0);

        expect(el.querySelector(".fq-spellbook-card-level").textContent).toBe("0");
    });

    test("pose le tooltip localisé via dataset.tooltip", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyLevelBadge(el, 5);

        expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.SpellBookLevelTooltip", {level: 5});
        const badge = el.querySelector(".fq-spellbook-card-level");
        expect(badge.dataset.tooltip).toContain("FQCARDENGINE.SpellBookLevelTooltip");
    });

    test("retour silencieux quand .fq-card-inner est absent", () => {
        const el = document.createElement("div");
        el.className = "fq-card";

        expect(() => SpellbookWindow.applyLevelBadge(el, 2)).not.toThrow();
        expect(el.querySelector(".fq-spellbook-card-level")).toBeNull();
    });

    test("le texte est posé via textContent, jamais de HTML brut", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyLevelBadge(el, 3);

        const badge = el.querySelector(".fq-spellbook-card-level");
        expect(badge.children.length).toBe(0);
    });
});

describe("SpellbookWindow.isCombatLocked — prédicat unique de combat actif (D2-06)", () => {
    test("renvoie true quand game.combat est renseigné (défaut de tests/setup.js)", () => {
        expect(SpellbookWindow.isCombatLocked()).toBe(true);
    });

    test("renvoie false quand game.combat vaut null", () => {
        game.combat = null;

        expect(SpellbookWindow.isCombatLocked()).toBe(false);
    });
});

describe("SpellbookWindow.patchCopyState — nettoyage avant re-application (RESEARCH Pitfall 2)", () => {
    test("appelé deux fois de suite laisse exactement un badge et une classe d'état", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.patchCopyState(el, {count: 1, max: 3, state: "partial"});
        SpellbookWindow.patchCopyState(el, {count: 3, max: 3, state: "full"});

        expect(el.querySelectorAll(".fq-spellbook-card-badge").length).toBe(1);
        const stateClasses = ["fq-spellbook-card--none", "fq-spellbook-card--partial", "fq-spellbook-card--full"]
            .filter(c => el.classList.contains(c));
        expect(stateClasses).toEqual(["fq-spellbook-card--full"]);
    });

    test("le badge reflète le nouvel état", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.patchCopyState(el, {count: 0, max: 3, state: "none"});
        SpellbookWindow.patchCopyState(el, {count: 3, max: 3, state: "full"});

        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
    });
});

describe("SpellbookWindow — cartes obligatoires (niveau 0)", () => {
    function makeMandatoryCard({name = "Frappe de base", maxSameCard = 2} = {}) {
        const card = makeFakeCard({name, maxSameCard});
        card.system.fq.level = 0;
        return card;
    }

    test("clic sur une carte obligatoire complète : aucun retrait, avertissement dédié", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Frappe de base"});
        const card = makeMandatoryCard();
        const deck = makeFakeDeck([{id: "c1", name: "Frappe de base"}, {id: "c2", name: "Frappe de base"}]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        expect(deck.cards).toHaveLength(2);
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningCantRemoveMandatoryCard");
    });

    test("clic sur une carte obligatoire partielle : complète jusqu'au maximum", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Frappe de base"});
        const card = makeMandatoryCard({maxSameCard: 3});
        const deck = makeFakeDeck([{id: "c1", name: "Frappe de base"}]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.createEmbeddedDocuments.mock.calls[0][1]).toHaveLength(2);
        expect(el.classList.contains("fq-spellbook-card--mandatory")).toBe(true);
    });

    test("applyCopyState : cadenas et classe obligatoire, tooltip dédié", () => {
        const el = makeCardElement({name: "Frappe de base"});

        SpellbookWindow.applyCopyState(el, {count: 2, max: 2, state: "full", mandatory: true});

        const badge = el.querySelector(".fq-spellbook-card-badge");
        expect(el.classList.contains("fq-spellbook-card--mandatory")).toBe(true);
        expect(badge.classList.contains("fq-spellbook-card-badge--mandatory")).toBe(true);
        expect(badge.querySelector("i").className).toContain("fa-lock");
        expect(badge.dataset.tooltip).toContain("FQCARDENGINE.SpellBookMandatoryTooltip");
    });

    test("applyCopyState : une carte optionnelle ne porte ni cadenas ni classe obligatoire", () => {
        const el = makeCardElement({name: "Boule de feu"});

        SpellbookWindow.applyCopyState(el, {count: 3, max: 3, state: "full", mandatory: false});

        expect(el.classList.contains("fq-spellbook-card--mandatory")).toBe(false);
        expect(el.querySelector(".fq-spellbook-card-badge i").className).toContain("fa-circle-check");
    });
});

describe("SpellbookWindow.toggleCardCopies — geste de bascule au clic (COPY-01..05, BOOK-04)", () => {
    test("hors combat, carte à 0/3 : création groupée en un seul appel, badge 3/3, classe complète", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.createEmbeddedDocuments.mock.calls[0][1]).toHaveLength(3);
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
        expect(el.classList.contains("fq-spellbook-card--full")).toBe(true);
    });

    test("combat actif : aucune mutation du deck, notification d'avertissement portant la clé de bannière", async () => {
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.SpellBookCombatLockedBanner");
    });

    test("élément déjà verrouillé (dataset.busy) : aucune mutation, aucune notification", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        el.dataset.busy = "true";
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    test("pendant l'opération, l'élément porte le verrou et la classe --busy ; les deux sont retirés en fin d'opération", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);
        let sawBusyDuringCall = false;
        deck.createEmbeddedDocuments.mockImplementationOnce(async (type, data) => {
            sawBusyDuringCall = el.dataset.busy === "true" && el.classList.contains("fq-spellbook-card--busy");
            return data.map(cardData => {
                const newCard = {id: `g-${Math.random()}`, name: cardData.name};
                deck.cards.push(newCard);
                return newCard;
            });
        });

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(sawBusyDuringCall).toBe(true);
        expect(el.dataset.busy).toBe("false");
        expect(el.classList.contains("fq-spellbook-card--busy")).toBe(false);
    });

    test("carte à 3/3 cliquée hors combat : suppression groupée des 3 exemplaires, badge 0/3, classe non distribuée (COPY-02)", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.deleteEmbeddedDocuments.mock.calls[0][1].sort()).toEqual(["c1", "c2", "c3"]);
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("0/3");
        expect(el.classList.contains("fq-spellbook-card--none")).toBe(true);
    });

    test("carte à 1/3 cliquée hors combat : création groupée de 2 exemplaires seulement, badge 3/3 (COPY-03)", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([{id: "c1", name: "Boule de feu"}]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.createEmbeddedDocuments.mock.calls[0][1]).toHaveLength(2);
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
    });

    test("le deck contient aussi des cartes d'un autre nom : aucune n'est incluse dans les identifiants supprimés", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 2});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "other", name: "Éclair"}
        ]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.deleteEmbeddedDocuments.mock.calls[0][1]).not.toContain("other");
        expect(deck.cards.find(c => c.id === "other")).toBeDefined();
    });

    test("une carte du deck de même nom portant un marqueur de génération est incluse dans la suppression (RESEARCH Pitfall 5)", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 2});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"},
            {id: "c2", name: "Boule de feu", flags: {"fq-card-engine": {generated: true}}}
        ]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.deleteEmbeddedDocuments.mock.calls[0][1].sort()).toEqual(["c1", "c2"]);
    });

    test("deux bascules successives (non distribuée -> complète -> non distribuée) laissent exactement un badge et une classe d'état", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 2});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);
        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(el.querySelectorAll(".fq-spellbook-card-badge").length).toBe(1);
        const stateClasses = ["fq-spellbook-card--none", "fq-spellbook-card--partial", "fq-spellbook-card--full"]
            .filter(c => el.classList.contains(c));
        expect(stateClasses).toEqual(["fq-spellbook-card--none"]);
    });

    test("promesse de mutation rejetée : notification d'erreur, badge et état inchangés, verrou libéré", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);
        SpellbookWindow.patchCopyState(el, {count: 3, max: 3, state: "full"});
        const badgeBefore = el.querySelector(".fq-spellbook-card-badge").textContent;
        deck.deleteEmbeddedDocuments.mockRejectedValueOnce(new Error("échec réseau"));

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(ui.notifications.error).toHaveBeenCalledWith("échec réseau");
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toBe(badgeBefore);
        expect(el.classList.contains("fq-spellbook-card--full")).toBe(true);
        expect(el.dataset.busy).toBe("false");
        expect(el.classList.contains("fq-spellbook-card--busy")).toBe(false);
    });

    test("deux appels concurrents sur la même carte : une seule mutation Foundry, compte final égal à max", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);
        let resolveCreate;
        const controlled = new Promise(resolve => {
            resolveCreate = resolve;
        });
        deck.createEmbeddedDocuments.mockImplementationOnce(async (type, data) => {
            await controlled;
            return data.map(cardData => {
                const newCard = {id: `g-${Math.random()}`, name: cardData.name};
                deck.cards.push(newCard);
                return newCard;
            });
        });

        const firstCall = SpellbookWindow.toggleCardCopies(el, card, deck);
        const secondCall = SpellbookWindow.toggleCardCopies(el, card, deck);
        resolveCreate();
        await Promise.all([firstCall, secondCall]);

        expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.cards.filter(c => c.name === "Boule de feu").length).toBe(3);
    });

    test("combat actif et carte complète : aucune suppression, notification d'avertissement", async () => {
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(deck.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.SpellBookCombatLockedBanner");
    });
});

/**
 * Fabrique une grille minimale du grimoire, réplique de la structure produite
 * par `spellbook-window.hbs` + `#renderCardsInto` : un `.fq-spellbook-grid`
 * contenant un `.fq-spellbook-group` avec un en-tête de groupe frère (hors de
 * la zone des cartes) et un `.fq-spellbook-cards` contenant une seule carte
 * portant `data-card-id`.
 *
 * @param {object}  [options]        - Options de fabrication.
 * @param {string}  [options.cardId] - L'identifiant de carte porté par l'élément fabriqué.
 *
 * @returns {{grid: Element, header: Element, cardsContainer: Element, card: Element}} Les éléments fabriqués.
 */
function makeSpellbookGrid({cardId = "card1"} = {}) {
    const grid = document.createElement("div");
    grid.className = "fq-spellbook-grid";

    const group = document.createElement("div");
    group.className = "fq-spellbook-group";
    grid.appendChild(group);

    const header = document.createElement("div");
    header.className = "fq-spellbook-group-header";
    group.appendChild(header);

    const cardsContainer = document.createElement("div");
    cardsContainer.className = "fq-spellbook-cards";
    group.appendChild(cardsContainer);

    const card = makeCardElement({name: "Boule de feu"});
    card.classList.add("fq-spellbook-card");
    card.dataset.cardId = cardId;
    cardsContainer.appendChild(card);

    return {grid, header, cardsContainer, card};
}

/**
 * Fabrique une grille réaliste et filtrable, réplique de la structure posée
 * par `#renderCardsInto` à partir de la tâche 1 : plusieurs `.fq-spellbook-group`
 * portant chacun un en-tête avec son compte, un conteneur de cartes et des
 * cartes portant les trois attributs de données lus par `applyFilters`, plus
 * le bloc « aucun résultat » masqué.
 *
 * @param {{classKey: string, cards: {name: string, level: number}[]}[]} [groups] - Les groupes à fabriquer.
 *
 * @returns {Element} L'élément `.fq-spellbook-grid` fabriqué.
 */
function makeFilterableGrid(groups = [
    {classKey: "monk", cards: [{name: "Boule de feu", level: 1}, {name: "Eclair", level: 2}]},
    {classKey: "trapper", cards: [{name: "Piege a loup", level: 1}]}
]) {
    const grid = document.createElement("div");
    grid.className = "fq-spellbook-grid";
    for (const group of groups) {
        const groupElement = document.createElement("div");
        groupElement.className = "fq-spellbook-group";
        const header = document.createElement("div");
        header.className = "fq-spellbook-group-header";
        const count = document.createElement("span");
        count.className = "fq-spellbook-group-count";
        count.textContent = `(${group.cards.length})`;
        header.appendChild(count);
        groupElement.appendChild(header);
        const cardsContainer = document.createElement("div");
        cardsContainer.className = "fq-spellbook-cards";
        cardsContainer.dataset.spellbookCards = group.classKey;
        for (const card of group.cards) {
            const cardElement = document.createElement("div");
            cardElement.className = "fq-spellbook-card";
            cardElement.dataset.cardClass = group.classKey;
            cardElement.dataset.cardLevel = String(card.level);
            cardElement.dataset.cardName = card.name;
            cardsContainer.appendChild(cardElement);
        }
        groupElement.appendChild(cardsContainer);
        grid.appendChild(groupElement);
    }
    const noResults = document.createElement("div");
    noResults.className = "fq-spellbook-no-results";
    noResults.hidden = true;
    grid.appendChild(noResults);
    return grid;
}

/**
 * Fabrique une barre d'outils portant tout ou partie des trois contrôles de
 * filtre nommés, avec quelques options arbitraires pour les deux menus
 * déroulants — jamais de donnée d'équilibrage réelle.
 *
 * @param {{withClassSelect?: boolean, withLevelSelect?: boolean, withSearch?: boolean}} [options] - Quels contrôles fabriquer.
 *
 * @returns {Element} L'élément `.fq-spellbook-toolbar` fabriqué.
 */
function makeFilterToolbar({withClassSelect = true, withLevelSelect = true, withSearch = true} = {}) {
    const toolbar = document.createElement("div");
    toolbar.className = "fq-spellbook-toolbar";
    if (withClassSelect) {
        const select = document.createElement("select");
        select.name = "classKey";
        for (const value of ["", "monk", "trapper"]) {
            const option = document.createElement("option");
            option.value = value;
            select.appendChild(option);
        }
        toolbar.appendChild(select);
    }
    if (withLevelSelect) {
        const select = document.createElement("select");
        select.name = "level";
        for (const value of ["", "1", "2"]) {
            const option = document.createElement("option");
            option.value = value;
            select.appendChild(option);
        }
        toolbar.appendChild(select);
    }
    if (withSearch) {
        const input = document.createElement("input");
        input.type = "search";
        input.name = "search";
        toolbar.appendChild(input);
    }
    return toolbar;
}

describe("SpellbookWindow.readFilters — lecture de l'état de filtre courant (D3-06)", () => {
    test("barre d'outils ne portant que le champ de recherche : renvoie les trois clés, les deux absentes valant la chaîne vide", () => {
        const toolbar = makeFilterToolbar({withClassSelect: false, withLevelSelect: false});
        toolbar.querySelector("[name=\"search\"]").value = "boule";

        expect(SpellbookWindow.readFilters(toolbar)).toEqual({classKey: "", level: "", search: "boule"});
    });

    test("barre d'outils portant les trois contrôles : renvoie les trois valeurs sélectionnées", () => {
        const toolbar = makeFilterToolbar();
        toolbar.querySelector("[name=\"classKey\"]").value = "monk";
        toolbar.querySelector("[name=\"level\"]").value = "2";
        toolbar.querySelector("[name=\"search\"]").value = "boule";

        expect(SpellbookWindow.readFilters(toolbar)).toEqual({classKey: "monk", level: "2", search: "boule"});
    });
});

describe("SpellbookWindow.applyFilters — masquage DOM pur (D3-05, D3-07, D3-08)", () => {
    test("critères vides : ne masque aucune carte, rétablit les comptes d'en-tête à leur forme non filtrée", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: ""});

        expect(grid.querySelectorAll(".fq-spellbook-card--filtered-out").length).toBe(0);
        const counts = [...grid.querySelectorAll(".fq-spellbook-group-count")].map(el => el.textContent);
        expect(counts).toEqual(["(2)", "(1)"]);
    });

    test("critère de recherche : masque les cartes non retenues, laisse les autres visibles", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: "boule"});

        const cards = [...grid.querySelectorAll(".fq-spellbook-card")];
        const visible = cards.filter(c => !c.classList.contains("fq-spellbook-card--filtered-out"));
        expect(visible).toHaveLength(1);
        expect(visible[0].dataset.cardName).toBe("Boule de feu");
    });

    test("réécrit le compte d'en-tête en « visibles/total » dès qu'un critère est actif", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: "boule"});

        const counts = [...grid.querySelectorAll(".fq-spellbook-group-count")].map(el => el.textContent);
        expect(counts).toEqual(["(1/2)", "(0/1)"]);
    });

    test("marque comme vide un groupe dont plus aucune carte n'est visible, en-tête compris", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: "boule"});

        const groups = [...grid.querySelectorAll(".fq-spellbook-group")];
        expect(groups[0].classList.contains("fq-spellbook-group--empty")).toBe(false);
        expect(groups[1].classList.contains("fq-spellbook-group--empty")).toBe(true);
    });

    test("révèle le bloc « aucun résultat » quand plus rien n'est visible, le remasque dès qu'une carte l'est de nouveau", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: "introuvable"});
        expect(grid.querySelector(".fq-spellbook-no-results").hidden).toBe(false);

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: ""});
        expect(grid.querySelector(".fq-spellbook-no-results").hidden).toBe(true);
    });

    test("ne touche jamais aux classes d'état de distribution ni aux badges déjà posés", () => {
        const grid = makeFilterableGrid();
        const card = grid.querySelector(".fq-spellbook-card");
        card.classList.add("fq-spellbook-card--partial");
        const badge = document.createElement("span");
        badge.className = "fq-spellbook-card-badge";
        card.appendChild(badge);

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "", search: "introuvable"});

        expect(card.classList.contains("fq-spellbook-card--partial")).toBe(true);
        expect(card.querySelector(".fq-spellbook-card-badge")).not.toBeNull();
    });

    test("critère de classe seul : ne laisse visibles que les cartes de cette classe, marque les autres groupes vides", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "trapper", level: "", search: ""});

        const groups = [...grid.querySelectorAll(".fq-spellbook-group")];
        expect(groups[0].classList.contains("fq-spellbook-group--empty")).toBe(true);
        expect(groups[1].classList.contains("fq-spellbook-group--empty")).toBe(false);
    });

    test("critère de niveau seul : ne laisse visibles que les cartes de ce niveau, à travers plusieurs groupes", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "", level: "1", search: ""});

        const visibleNames = [...grid.querySelectorAll(".fq-spellbook-card")]
            .filter(c => !c.classList.contains("fq-spellbook-card--filtered-out"))
            .map(c => c.dataset.cardName);
        expect(visibleNames.sort()).toEqual(["Boule de feu", "Piege a loup"]);
    });

    test("classe et niveau combinés : ne laisse visible que l'intersection des deux", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "monk", level: "1", search: ""});

        const visibleNames = [...grid.querySelectorAll(".fq-spellbook-card")]
            .filter(c => !c.classList.contains("fq-spellbook-card--filtered-out"))
            .map(c => c.dataset.cardName);
        expect(visibleNames).toEqual(["Boule de feu"]);
    });

    test("les trois critères combinés : ne laisse visible que la carte satisfaisant les trois, révèle l'état aucun résultat si aucune", () => {
        const grid = makeFilterableGrid();

        SpellbookWindow.applyFilters(grid, {classKey: "monk", level: "1", search: "boule"});
        expect(grid.querySelector(".fq-spellbook-no-results").hidden).toBe(true);

        SpellbookWindow.applyFilters(grid, {classKey: "monk", level: "1", search: "eclair"});
        expect(grid.querySelector(".fq-spellbook-no-results").hidden).toBe(false);
    });
});

describe("SpellbookWindow.refreshFilters — point unique de mise à jour du filtrage", () => {
    test("pose la classe d'état filtré quand au moins un critère est actif, la retire quand aucun ne l'est", () => {
        const toolbar = makeFilterToolbar();
        const grid = makeFilterableGrid();
        toolbar.querySelector("[name=\"search\"]").value = "boule";

        SpellbookWindow.refreshFilters(toolbar, grid);
        expect(toolbar.classList.contains("fq-spellbook-toolbar--filtered")).toBe(true);

        toolbar.querySelector("[name=\"search\"]").value = "";
        SpellbookWindow.refreshFilters(toolbar, grid);
        expect(toolbar.classList.contains("fq-spellbook-toolbar--filtered")).toBe(false);
    });
});

describe("SpellbookWindow.resetFilterControls — remise à zéro des contrôles nommés", () => {
    test("barre d'outils ne portant que le champ de recherche : remet le champ à la chaîne vide", () => {
        const toolbar = makeFilterToolbar({withClassSelect: false, withLevelSelect: false});
        toolbar.querySelector("[name=\"search\"]").value = "boule";

        SpellbookWindow.resetFilterControls(toolbar);

        expect(toolbar.querySelector("[name=\"search\"]").value).toBe("");
    });

    test("barre d'outils complète : remet les deux menus déroulants ET le champ de recherche en un seul appel", () => {
        const toolbar = makeFilterToolbar();
        toolbar.querySelector("[name=\"classKey\"]").value = "monk";
        toolbar.querySelector("[name=\"level\"]").value = "2";
        toolbar.querySelector("[name=\"search\"]").value = "boule";

        SpellbookWindow.resetFilterControls(toolbar);

        expect(SpellbookWindow.readFilters(toolbar)).toEqual({classKey: "", level: "", search: ""});
    });
});

describe("SpellbookWindow.bindFilterControls — écouteurs manuels change/input (RESEARCH, actions ne gère que click)", () => {
    test("saisie dans le champ de recherche : déclenche le rappel avec les critères courants, masque les cartes non retenues", () => {
        const toolbar = makeFilterToolbar();
        const grid = makeFilterableGrid();
        const onFiltersChanged = vi.fn();
        SpellbookWindow.bindFilterControls(toolbar, grid, onFiltersChanged);

        const input = toolbar.querySelector("[name=\"search\"]");
        input.value = "boule";
        input.dispatchEvent(new Event("input", {bubbles: true}));

        expect(onFiltersChanged).toHaveBeenCalledWith({classKey: "", level: "", search: "boule"});
        expect(grid.querySelectorAll(".fq-spellbook-card--filtered-out").length).toBeGreaterThan(0);
    });

    test("le rappel n'est jamais invoqué au moment de la liaison elle-même", () => {
        const toolbar = makeFilterToolbar();
        const grid = makeFilterableGrid();
        const onFiltersChanged = vi.fn();

        SpellbookWindow.bindFilterControls(toolbar, grid, onFiltersChanged);

        expect(onFiltersChanged).not.toHaveBeenCalled();
    });

    test("changement du menu déroulant de classe : déclenche le rappel, masque les cartes des autres classes", () => {
        const toolbar = makeFilterToolbar();
        const grid = makeFilterableGrid();
        const onFiltersChanged = vi.fn();
        SpellbookWindow.bindFilterControls(toolbar, grid, onFiltersChanged);

        const select = toolbar.querySelector("[name=\"classKey\"]");
        select.value = "monk";
        select.dispatchEvent(new Event("change", {bubbles: true}));

        expect(onFiltersChanged).toHaveBeenCalledWith({classKey: "monk", level: "", search: ""});
        const trapperCard = grid.querySelector("[data-card-class=\"trapper\"]");
        expect(trapperCard.classList.contains("fq-spellbook-card--filtered-out")).toBe(true);
    });

    test("changement du menu déroulant de niveau : déclenche le rappel, masque les cartes des autres niveaux", () => {
        const toolbar = makeFilterToolbar();
        const grid = makeFilterableGrid();
        const onFiltersChanged = vi.fn();
        SpellbookWindow.bindFilterControls(toolbar, grid, onFiltersChanged);

        const select = toolbar.querySelector("[name=\"level\"]");
        select.value = "2";
        select.dispatchEvent(new Event("change", {bubbles: true}));

        expect(onFiltersChanged).toHaveBeenCalledWith({classKey: "", level: "2", search: ""});
        const level1Card = grid.querySelector("[data-card-level=\"1\"]");
        expect(level1Card.classList.contains("fq-spellbook-card--filtered-out")).toBe(true);
    });
});

/**
 * Fabrique une racine minimale portant `.fq-spellbook-deck-size`, réplique de
 * l'extrémité droite de la barre d'outils.
 *
 * @returns {{root: Element, counter: Element}} La racine et l'indicateur fabriqués.
 */
function makeDeckSizeRoot() {
    const root = document.createElement("div");
    const toolbar = document.createElement("div");
    toolbar.className = "fq-spellbook-toolbar";
    const counter = document.createElement("span");
    counter.className = "fq-spellbook-deck-size";
    toolbar.appendChild(counter);
    root.appendChild(toolbar);
    return {root, counter};
}

describe("SpellbookWindow.applyDeckSize — indicateur de taille de deck (D3-09, D3-10)", () => {
    test("écrit le total dans le nœud de compte et le reste du libellé autour de lui", () => {
        vi.spyOn(game.i18n, "localize").mockImplementation(key =>
            (key === "FQCARDENGINE.SpellBookDeckSize" ? "Deck : {count} carte(s)" : key));
        const {root, counter} = makeDeckSizeRoot();

        SpellbookWindow.applyDeckSize(root, 7);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("7");
        expect(counter.textContent).toBe("Deck : 7 carte(s)");
    });

    test("appelée deux fois de suite ne laisse qu'un seul libellé dans l'indicateur", () => {
        const {root, counter} = makeDeckSizeRoot();

        SpellbookWindow.applyDeckSize(root, 3);
        SpellbookWindow.applyDeckSize(root, 5);

        expect(counter.querySelectorAll(".fq-spellbook-deck-size-label").length).toBe(1);
        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("5");
    });

    test("racine sans indicateur : aucune erreur", () => {
        const root = document.createElement("div");

        expect(() => SpellbookWindow.applyDeckSize(root, 3)).not.toThrow();
    });

    test("racine nulle : aucune erreur", () => {
        expect(() => SpellbookWindow.applyDeckSize(null, 3)).not.toThrow();
        expect(() => SpellbookWindow.applyDeckSize(undefined, 3)).not.toThrow();
    });

    test("chaîne localisée sans marqueur {count} (localisation simulée des tests) : le compte reste présent dans son propre nœud", () => {
        const {root, counter} = makeDeckSizeRoot();

        SpellbookWindow.applyDeckSize(root, 4);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("4");
    });
});

describe("SpellbookWindow.addOneCopy — geste additif au clic droit (COPY-07, D21-01..D21-06)", () => {
    test("hors combat, carte à 0/3 : création groupée d'UN seul exemplaire, badge 1/3, classe partielle", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.createEmbeddedDocuments.mock.calls[0][1]).toHaveLength(1);
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("1/3");
        expect(el.classList.contains("fq-spellbook-card--partial")).toBe(true);
    });

    test("hors combat, carte à 2/3 : badge passe à 3/3, classe complète", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([{id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}]);

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(deck.createEmbeddedDocuments.mock.calls[0][1]).toHaveLength(1);
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
        expect(el.classList.contains("fq-spellbook-card--full")).toBe(true);
    });

    test("combat actif : aucune mutation du deck, notification d'avertissement portant la clé de bannière", async () => {
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.SpellBookCombatLockedBanner");
    });

    test("élément déjà verrouillé (dataset.busy) : aucune mutation, aucune notification", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        el.dataset.busy = "true";
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.warn).not.toHaveBeenCalled();
        expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    test("pendant l'opération, l'élément porte le verrou et la classe --busy ; les deux sont retirés en fin d'opération", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);
        let sawBusyDuringCall = false;
        deck.createEmbeddedDocuments.mockImplementationOnce(async (type, data) => {
            sawBusyDuringCall = el.dataset.busy === "true" && el.classList.contains("fq-spellbook-card--busy");
            return data.map(cardData => {
                const newCard = {id: `g-${Math.random()}`, name: cardData.name};
                deck.cards.push(newCard);
                return newCard;
            });
        });

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(sawBusyDuringCall).toBe(true);
        expect(el.dataset.busy).toBe("false");
        expect(el.classList.contains("fq-spellbook-card--busy")).toBe(false);
    });

    test("promesse de mutation rejetée : notification d'erreur, badge et état inchangés, verrou libéré", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([{id: "c1", name: "Boule de feu"}]);
        SpellbookWindow.patchCopyState(el, {count: 1, max: 3, state: "partial"});
        const badgeBefore = el.querySelector(".fq-spellbook-card-badge").textContent;
        deck.createEmbeddedDocuments.mockRejectedValueOnce(new Error("échec réseau"));

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(ui.notifications.error).toHaveBeenCalledWith("échec réseau");
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toBe(badgeBefore);
        expect(el.classList.contains("fq-spellbook-card--partial")).toBe(true);
        expect(el.dataset.busy).toBe("false");
        expect(el.classList.contains("fq-spellbook-card--busy")).toBe(false);
    });

    test("hors combat, carte à 3/3 : aucune mutation, aucune notification d'erreur, signal maximum atteint produit", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);
        const badge = el.querySelector(".fq-spellbook-card-badge");

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
        expect(ui.notifications.error).not.toHaveBeenCalled();
        expect(badge.classList.contains("fq-spellbook-card-badge--shake")).toBe(true);
    });

    test("hors combat, carte à 3/3 : le badge et l'état affichés ne sont pas altérés par le signal", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);
        SpellbookWindow.patchCopyState(el, {count: 3, max: 3, state: "full"});

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
        expect(el.classList.contains("fq-spellbook-card--full")).toBe(true);
    });

    test("carte à 3/3 avec un combat actif : la garde de combat l'emporte, avertissement de combat, pas de signal de plafond", async () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);
        const badge = el.querySelector(".fq-spellbook-card-badge");

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.SpellBookCombatLockedBanner");
        expect(badge.classList.contains("fq-spellbook-card-badge--shake")).toBe(false);
        expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    test("trois appels concurrents sur une carte à 0/3 : une seule mutation au total, compte final de 1", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);
        let resolveCreate;
        const controlled = new Promise(resolve => {
            resolveCreate = resolve;
        });
        deck.createEmbeddedDocuments.mockImplementationOnce(async (type, data) => {
            await controlled;
            return data.map(cardData => {
                const newCard = {id: `g-${Math.random()}`, name: cardData.name};
                deck.cards.push(newCard);
                return newCard;
            });
        });

        const firstCall = SpellbookWindow.addOneCopy(el, card, deck);
        const secondCall = SpellbookWindow.addOneCopy(el, card, deck);
        const thirdCall = SpellbookWindow.addOneCopy(el, card, deck);
        resolveCreate();
        await Promise.all([firstCall, secondCall, thirdCall]);

        expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(deck.cards.filter(c => c.name === "Boule de feu").length).toBe(1);
    });
});

describe("SpellbookWindow.signalMaxReached — signal ponctuel « maximum atteint » (D21-02)", () => {
    test("carte portant un badge, hors mouvement réduit : le badge porte la classe de secousse, aucune notification", () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const badge = el.querySelector(".fq-spellbook-card-badge");

        SpellbookWindow.signalMaxReached(el, 3);

        expect(badge.classList.contains("fq-spellbook-card-badge--shake")).toBe(true);
        expect(ui.notifications.info).not.toHaveBeenCalled();
    });

    test("appelée deux fois de suite sur le même badge : la classe de secousse n'est portée qu'une fois", () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const badge = el.querySelector(".fq-spellbook-card-badge");

        SpellbookWindow.signalMaxReached(el, 3);
        SpellbookWindow.signalMaxReached(el, 3);

        const occurrences = badge.className.split(" ").filter(c => c === "fq-spellbook-card-badge--shake");
        expect(occurrences).toHaveLength(1);
    });

    test("sous mouvement réduit : aucune classe de secousse, notification d'information avec le nombre maximal", () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn(() => ({matches: true}));
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const badge = el.querySelector(".fq-spellbook-card-badge");

        SpellbookWindow.signalMaxReached(el, 4);

        expect(badge.classList.contains("fq-spellbook-card-badge--shake")).toBe(false);
        expect(ui.notifications.info).toHaveBeenCalledWith(
            game.i18n.format("FQCARDENGINE.SpellBookMaxReached", {max: 4})
        );
        window.matchMedia = originalMatchMedia;
    });

    test("carte sans badge : notification d'information émise (un signal au moins toujours produit)", () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: false});

        expect(() => SpellbookWindow.signalMaxReached(el, 2)).not.toThrow();

        expect(ui.notifications.info).toHaveBeenCalledWith(
            game.i18n.format("FQCARDENGINE.SpellBookMaxReached", {max: 2})
        );
    });

    test("la classe de secousse est retirée du badge à la fin de l'animation (animationend)", () => {
        const el = makeCardElement({name: "Boule de feu", withBadge: true});
        const badge = el.querySelector(".fq-spellbook-card-badge");

        SpellbookWindow.signalMaxReached(el, 3);
        badge.dispatchEvent(new Event("animationend"));

        expect(badge.classList.contains("fq-spellbook-card-badge--shake")).toBe(false);
    });
});

describe("SpellbookWindow.bindAddOneCopy — liaison déléguée du menu contextuel sur la grille (D21-04, D21-05)", () => {
    test("événement de menu contextuel depuis un descendant d'une carte : annulé et déclenche la création", async () => {
        game.combat = null;
        const {grid, card} = makeSpellbookGrid({cardId: "card1"});
        const fakeCard = makeFakeCard({name: "Boule de feu", maxSameCard: 3, id: "card1"});
        const spellBook = {cards: {get: vi.fn(id => (id === "card1" ? fakeCard : undefined))}};
        const deck = makeFakeDeck([]);
        SpellbookWindow.bindAddOneCopy(grid, spellBook, deck);
        const inner = card.querySelector(".fq-card-inner");
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});

        inner.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        await vi.waitFor(() => expect(deck.createEmbeddedDocuments).toHaveBeenCalledTimes(1));
    });

    test("événement émis depuis le conteneur de cartes sans passer par une carte : annulé, aucune mutation", () => {
        game.combat = null;
        const {grid, cardsContainer} = makeSpellbookGrid({cardId: "card1"});
        const fakeCard = makeFakeCard({name: "Boule de feu", maxSameCard: 3, id: "card1"});
        const spellBook = {cards: {get: vi.fn(() => fakeCard)}};
        const deck = makeFakeDeck([]);
        SpellbookWindow.bindAddOneCopy(grid, spellBook, deck);
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});

        cardsContainer.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("événement émis depuis un en-tête de groupe, hors de la zone des cartes : PAS annulé", () => {
        const {grid, header} = makeSpellbookGrid({cardId: "card1"});
        const spellBook = {cards: {get: vi.fn()}};
        const deck = makeFakeDeck([]);
        SpellbookWindow.bindAddOneCopy(grid, spellBook, deck);
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});

        header.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("identifiant de carte inconnu du grimoire : annulé, aucune mutation", () => {
        game.combat = null;
        const {grid, card} = makeSpellbookGrid({cardId: "unknown-id"});
        const spellBook = {cards: {get: vi.fn(() => undefined)}};
        const deck = makeFakeDeck([]);
        SpellbookWindow.bindAddOneCopy(grid, spellBook, deck);
        const event = new MouseEvent("contextmenu", {bubbles: true, cancelable: true});

        card.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(deck.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
});

describe("SpellbookWindow.applyCombatLock — modificateur de fenêtre pendant un combat (D2-06)", () => {
    test("pose la classe fq-spellbook-window--combat-locked quand le verrou est actif", () => {
        const root = document.createElement("div");

        SpellbookWindow.applyCombatLock(root, true);

        expect(root.classList.contains("fq-spellbook-window--combat-locked")).toBe(true);
    });

    test("retire la classe quand le verrou n'est pas actif", () => {
        const root = document.createElement("div");
        root.classList.add("fq-spellbook-window--combat-locked");

        SpellbookWindow.applyCombatLock(root, false);

        expect(root.classList.contains("fq-spellbook-window--combat-locked")).toBe(false);
    });

    test("un double appel avec le même état ne laisse pas la classe en double", () => {
        const root = document.createElement("div");

        SpellbookWindow.applyCombatLock(root, true);
        SpellbookWindow.applyCombatLock(root, true);

        expect(root.className.split(" ").filter(c => c === "fq-spellbook-window--combat-locked")).toHaveLength(1);
    });
});

/**
 * Monte l'élément de carte fabriqué dans une racine réaliste
 * `.fq-spellbook-body > .fq-spellbook-toolbar > .fq-spellbook-deck-size`,
 * pour tester `patchDeckSize` sans toucher aux tests existants qui laissent
 * la carte détachée (RESEARCH, Pitfall 4).
 *
 * @param {Element} cardElement - L'élément de carte déjà fabriqué.
 *
 * @returns {{body: Element, counter: Element}} La racine et l'indicateur montés.
 */
function mountCardInDeckSizeRoot(cardElement) {
    const body = document.createElement("div");
    body.className = "fq-spellbook-body";
    const toolbar = document.createElement("div");
    toolbar.className = "fq-spellbook-toolbar";
    const counter = document.createElement("span");
    counter.className = "fq-spellbook-deck-size";
    toolbar.appendChild(counter);
    const content = document.createElement("div");
    content.className = "fq-spellbook-content";
    const grid = document.createElement("div");
    grid.className = "fq-spellbook-grid";
    grid.appendChild(cardElement);
    content.appendChild(grid);
    body.append(toolbar, content);
    return {body, counter};
}

describe("SpellbookWindow.toggleCardCopies / addOneCopy — patch de l'indicateur de taille de deck (D3-10, D3-11)", () => {
    test("après une bascule réussie, le total affiché correspond au nombre de cartes du deck, sans rouvrir la fenêtre", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const {counter} = mountCardInDeckSizeRoot(el);
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("3");
    });

    test("après un clic droit réussi, le total affiché a augmenté d'exactement un", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const {counter} = mountCardInDeckSizeRoot(el);
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([{id: "other", name: "Autre carte"}]);

        await SpellbookWindow.addOneCopy(el, card, deck);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("2");
    });

    test("après une bascule de retrait sur une carte complète, le total affiché a diminué du nombre d'exemplaires retirés", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const {counter} = mountCardInDeckSizeRoot(el);
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([
            {id: "c1", name: "Boule de feu"}, {id: "c2", name: "Boule de feu"}, {id: "c3", name: "Boule de feu"}
        ]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("0");
    });

    test("une bascule sur un élément de carte détaché de toute racine de fenêtre n'échoue pas et ne modifie rien d'autre que le badge de la carte", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await expect(SpellbookWindow.toggleCardCopies(el, card, deck)).resolves.toBeUndefined();
        expect(el.querySelector(".fq-spellbook-card-badge").textContent).toContain("3/3");
    });

    test("le total ne dépend pas des filtres actifs : avec des cartes masquées par un filtre, le total reste celui du deck entier", async () => {
        game.combat = null;
        const el = makeCardElement({name: "Boule de feu"});
        const {counter} = mountCardInDeckSizeRoot(el);
        el.classList.add("fq-spellbook-card--filtered-out");
        const card = makeFakeCard({name: "Boule de feu", maxSameCard: 3});
        const deck = makeFakeDeck([]);

        await SpellbookWindow.toggleCardCopies(el, card, deck);

        expect(counter.querySelector(".fq-spellbook-deck-size-count").textContent).toBe("3");
        expect(el.classList.contains("fq-spellbook-card--filtered-out")).toBe(true);
    });
});

/**
 * Construit une chaîne HTML minimale mais complète, réplique du gabarit
 * partagé `board/card.hbs` : un `.fq-card` portant `data-card-id`/`title`, un
 * `.fq-card-inner` (nécessaire à `applyCopyState`/`applyLevelBadge`) et un
 * `.fq-card-tooltip` frère.
 *
 * @param {{name?: string, id?: string, innate?: boolean}} [options] - Le nom, l'identifiant, et la présence de la pastille « Innée ».
 *
 * @returns {string} Le fragment HTML fabriqué.
 */
function makeRenderedCardHtml({name = "Boule de feu", id = "card1", innate = false} = {}) {
    const innateBadge = innate ? "<span class=\"fq-card-badge fq-card-badge--innate\">Innée</span>" : "";
    return `<div class="fq-card fq-card-engine-card" data-card-id="${id}" title="${name}" draggable="true">`
        + `<div class="fq-card-inner">${innateBadge}</div>`
        + `<span class="fq-card-tooltip">${name}</span>`
        + "</div>";
}

describe("SpellbookWindow.renderPreviewCard — fragment du panneau, même chemin de rendu que la grille (D3-04)", () => {
    let renderTemplateSpy;

    beforeEach(() => {
        renderTemplateSpy = vi.spyOn(foundry.applications.handlebars, "renderTemplate")
            .mockResolvedValue(makeRenderedCardHtml());
        vi.spyOn(SpellbookWindow, "buildCardRenderData");
        vi.spyOn(DisplayCard, "fitDescriptionSize");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function makePreviewElement() {
        const previewElement = document.createElement("div");
        previewElement.className = "fq-spellbook-preview-content";
        const invite = document.createElement("div");
        invite.className = "fq-spellbook-preview-empty";
        previewElement.appendChild(invite);
        return previewElement;
    }

    test("insère un fragment construit par le chemin de rendu de la grille, remplace intégralement le contenu précédent (invite comprise)", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        expect(SpellbookWindow.buildCardRenderData).toHaveBeenCalledWith(card);
        expect(renderTemplateSpy).toHaveBeenCalled();
        expect(previewElement.querySelector(".fq-spellbook-preview-empty")).toBeNull();
        expect(previewElement.querySelector(".fq-spellbook-preview-card")).not.toBeNull();
    });

    test("le fragment ne porte ni la classe de carte de grille, ni l'attribut d'action, ni le glisser-déposer", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        const el = previewElement.querySelector(".fq-spellbook-preview-card");
        expect(el.classList.contains("fq-spellbook-card")).toBe(false);
        expect(el.hasAttribute("data-action")).toBe(false);
        expect(el.hasAttribute("draggable")).toBe(false);
    });

    test("le fragment ne porte aucune marque du grimoire : ni badge d'exemplaires, ni pastille de niveau", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        const el = previewElement.querySelector(".fq-spellbook-preview-card");
        expect(el.querySelector(".fq-spellbook-card-badge")).toBeNull();
        expect(el.querySelector(".fq-spellbook-card-level")).toBeNull();
    });

    test("la pastille « Innée » de la carte est conservée dans le panneau", async () => {
        renderTemplateSpy.mockResolvedValue(makeRenderedCardHtml({innate: true}));
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        const el = previewElement.querySelector(".fq-spellbook-preview-card");
        expect(el.querySelector(".fq-card-badge--innate")).not.toBeNull();
    });

    test("une carte non innée ne reçoit aucune pastille « Innée » dans le panneau", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        const el = previewElement.querySelector(".fq-spellbook-preview-card");
        expect(el.querySelector(".fq-card-badge--innate")).toBeNull();
    });

    test("le fragment ne porte aucune classe d'état de distribution : aucun halo dans le panneau", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        const el = previewElement.querySelector(".fq-spellbook-preview-card");
        expect(el.classList.contains("fq-spellbook-card--none")).toBe(false);
        expect(el.classList.contains("fq-spellbook-card--partial")).toBe(false);
        expect(el.classList.contains("fq-spellbook-card--full")).toBe(false);
    });

    test("l'ajustement de taille de description est appelé sur le fragment APRÈS son insertion dans le panneau", async () => {
        const previewElement = makePreviewElement();
        const card = makeFakeCard({name: "Boule de feu"});

        await SpellbookWindow.renderPreviewCard(previewElement, card);

        expect(DisplayCard.fitDescriptionSize).toHaveBeenCalled();
        const insertedElement = DisplayCard.fitDescriptionSize.mock.calls[0][0];
        expect(previewElement.contains(insertedElement)).toBe(true);
    });
});

describe("SpellbookWindow — panneau d'aperçu au survol prolongé (D3-01, D3-02, RESEARCH Pitfall 1)", () => {
    let win;
    let grid;
    let previewContent;
    let cardElement;
    let card;
    let card2;

    beforeEach(async () => {
        game.combat = null;
        vi.useFakeTimers();
        vi.spyOn(foundry.applications.handlebars, "renderTemplate")
            .mockImplementation(async () => makeRenderedCardHtml());

        card = makeFakeCard({name: "Boule de feu", maxSameCard: 3, id: "card1"});
        card2 = makeFakeCard({name: "Eclair", maxSameCard: 2, id: "card2"});
        const deck = makeFakeDeck([]);
        const spellBook = {
            id: "sb1",
            cards: {
                contents: [card, card2],
                get: vi.fn(id => [card, card2].find(c => c.id === id))
            }
        };
        win = new SpellbookWindow(spellBook, deck);

        const root = document.createElement("div");
        const toolbar = document.createElement("div");
        toolbar.className = "fq-spellbook-toolbar";
        grid = document.createElement("div");
        grid.className = "fq-spellbook-grid";
        const preview = document.createElement("div");
        preview.className = "fq-spellbook-preview";
        previewContent = document.createElement("div");
        previewContent.className = "fq-spellbook-preview-content";
        const invite = document.createElement("div");
        invite.className = "fq-spellbook-preview-empty";
        previewContent.appendChild(invite);
        preview.appendChild(previewContent);
        root.append(toolbar, grid, preview);
        win.element = root;

        const context = await win._prepareContext({});
        const classKey = context.groups[0].classKey;
        const groupElement = document.createElement("div");
        groupElement.className = "fq-spellbook-group";
        const cardsContainer = document.createElement("div");
        cardsContainer.className = "fq-spellbook-cards";
        cardsContainer.dataset.spellbookCards = classKey;
        groupElement.appendChild(cardsContainer);
        grid.appendChild(groupElement);

        await win._onRender({}, {});

        [cardElement] = grid.querySelectorAll(".fq-spellbook-card");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("juste avant l'expiration du délai de survol : ne remplit pas le panneau", async () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));

        await vi.advanceTimersByTimeAsync(249);

        expect(previewContent.querySelector(".fq-spellbook-preview-empty")).not.toBeNull();
        expect(previewContent.querySelector(".fq-spellbook-preview-card")).toBeNull();
    });

    test("à l'expiration du délai de survol : remplit le panneau avec la carte survolée", async () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));

        await vi.advanceTimersByTimeAsync(250);

        expect(previewContent.querySelector(".fq-spellbook-preview-empty")).toBeNull();
        expect(previewContent.querySelector(".fq-spellbook-preview-card")).not.toBeNull();
    });

    test("une sortie avant l'expiration du délai annule le remplissage : le panneau garde exactement le contenu qu'il avait", async () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));
        cardElement.dispatchEvent(new MouseEvent("mouseleave"));

        await vi.advanceTimersByTimeAsync(500);

        expect(previewContent.querySelector(".fq-spellbook-preview-empty")).not.toBeNull();
        expect(previewContent.querySelector(".fq-spellbook-preview-card")).toBeNull();
    });

    test("survoler une seconde carte avant l'expiration de la première annule celui de la première : la seconde s'affiche, une seule fois", async () => {
        const renderSpy = vi.spyOn(SpellbookWindow, "renderPreviewCard").mockResolvedValue(undefined);
        const [, secondCardElement] = grid.querySelectorAll(".fq-spellbook-card");

        cardElement.dispatchEvent(new MouseEvent("mouseenter"));
        await vi.advanceTimersByTimeAsync(150);
        secondCardElement.dispatchEvent(new MouseEvent("mouseenter"));
        await vi.advanceTimersByTimeAsync(500);

        expect(renderSpy).toHaveBeenCalledTimes(1);
        expect(renderSpy.mock.calls[0][1]).toBe(card2);
    });

    test("sortir de la carte APRÈS l'expiration ne vide pas le panneau : le contenu reste affiché", async () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));
        await vi.advanceTimersByTimeAsync(500);
        expect(previewContent.querySelector(".fq-spellbook-preview-card")).not.toBeNull();

        cardElement.dispatchEvent(new MouseEvent("mouseleave"));

        expect(previewContent.querySelector(".fq-spellbook-preview-card")).not.toBeNull();
    });

    test("une prise de focus remplit le panneau immédiatement, sans attendre le délai", async () => {
        cardElement.dispatchEvent(new FocusEvent("focusin", {bubbles: true}));

        await vi.advanceTimersByTimeAsync(0);

        expect(previewContent.querySelector(".fq-spellbook-preview-card")).not.toBeNull();
    });

    test("la fermeture de la fenêtre annule un minuteur de survol en cours : aucun remplissage ne survient après", async () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));

        win._onClose({});
        await vi.advanceTimersByTimeAsync(500);

        expect(previewContent.querySelector(".fq-spellbook-preview-card")).toBeNull();
    });

    test("la fermeture de la fenêtre ne lit jamais l'élément de fenêtre pour nettoyer le minuteur", () => {
        cardElement.dispatchEvent(new MouseEvent("mouseenter"));
        win.element = null;

        expect(() => win._onClose({})).not.toThrow();
    });
});
