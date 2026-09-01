import {describe, expect, test, vi} from "vitest";

const {default: SpellbookWindow} = await import("../../src/domain/interface/window/spellbook-window.js");

/**
 * Fabrique une carte factice du grimoire, suffisante pour
 * `computeCopyState`/`computeToggleAction` : un nom et un `maxSameCard`
 * arbitraires, jamais une carte réelle de compendium (aucun test ne
 * verrouille une valeur d'équilibrage).
 *
 * @param {object} [options]              - Options de fabrication.
 * @param {string} [options.name]         - Le nom de la carte.
 * @param {number} [options.maxSameCard]  - Le nombre d'exemplaires prévu.
 * @param {string} [options.id]           - L'identifiant source de la carte.
 *
 * @returns {object} La carte factice.
 */
function makeFakeCard({name = "Boule de feu", maxSameCard = 3, id = "sourceCardId"} = {}) {
    return {id, _id: id, name, system: {fq: {maxSameCard}}};
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
