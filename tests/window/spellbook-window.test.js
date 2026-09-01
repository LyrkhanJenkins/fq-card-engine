import {describe, expect, test} from "vitest";

const {default: SpellbookWindow} = await import("../../src/domain/interface/window/spellbook-window.js");

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
