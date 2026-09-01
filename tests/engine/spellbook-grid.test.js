import {describe, expect, it, vi} from "vitest";
import {
    buildSpellbookGroups, computeCopyState, computeIncrementAction, computeToggleAction, groupCardsByClass,
    localizeClassKey, sortCardsByLevelThenName
} from "../../src/domain/engine/shared/spellbook-grid.js";

/**
 * Fonctions pures de préparation de la grille du grimoire
 * (`src/domain/engine/shared/spellbook-grid.js`) : tri par niveau puis par
 * nom localisé (tâche 1), calcul de l'état de distribution `n/N` (tâche 2),
 * groupement par classe et état vide (tâche 3). Les cartes et decks utilisés
 * sont des littéraux fabriqués ici — aucune donnée d'équilibrage réelle
 * (`maxSameCard`, noms de cartes de packs) n'est assertée.
 */

/** Fabrique une carte minimale pour les tests de tri/groupement. */
function makeCard({name, level, ...rest} = {}) {
    return {name, system: {fq: {level, ...rest}}};
}

describe("sortCardsByLevelThenName", () => {
    it("trie par niveau croissant", () => {
        const high = makeCard({name: "FQCARDTITLE.High", level: 3});
        const low = makeCard({name: "FQCARDTITLE.Low", level: 1});

        const sorted = sortCardsByLevelThenName([high, low]);

        expect(sorted.map(c => c.name)).toEqual(["FQCARDTITLE.Low", "FQCARDTITLE.High"]);
    });

    it("à niveau égal, trie par nom localisé", () => {
        const b = makeCard({name: "FQCARDTITLE.B", level: 1});
        const a = makeCard({name: "FQCARDTITLE.A", level: 1});

        const sorted = sortCardsByLevelThenName([b, a]);

        expect(sorted.map(c => c.name)).toEqual(["FQCARDTITLE.A", "FQCARDTITLE.B"]);
    });

    it("un niveau absent, null ou non numérique est traité comme niveau 0", () => {
        const withoutLevel = makeCard({name: "FQCARDTITLE.NoLevel"});
        const nullLevel = makeCard({name: "FQCARDTITLE.NullLevel", level: null});
        const nanLevel = makeCard({name: "FQCARDTITLE.NanLevel", level: "abc"});
        const levelOne = makeCard({name: "FQCARDTITLE.LevelOne", level: 1});

        const sorted = sortCardsByLevelThenName([levelOne, nanLevel, nullLevel, withoutLevel]);

        expect(sorted.map(c => c.name)).toEqual([
            "FQCARDTITLE.NanLevel", "FQCARDTITLE.NoLevel", "FQCARDTITLE.NullLevel", "FQCARDTITLE.LevelOne"
        ]);
    });

    it("ne mute pas le tableau source", () => {
        const high = makeCard({name: "FQCARDTITLE.High", level: 3});
        const low = makeCard({name: "FQCARDTITLE.Low", level: 1});
        const source = [high, low];

        sortCardsByLevelThenName(source);

        expect(source).toEqual([high, low]);
    });
});

/** Fabrique un deck minimal : un tableau de cartes exposé sous `.cards`. */
function makeDeck(cards) {
    return {cards};
}

describe("computeCopyState", () => {
    it("0 exemplaire sur maxSameCard 3 : state none", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([]);

        expect(computeCopyState(card, deck)).toEqual({count: 0, max: 3, state: "none"});
    });

    it("1 exemplaire sur maxSameCard 3 : state partial", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([{name: "FQCARDTITLE.Card"}]);

        expect(computeCopyState(card, deck)).toEqual({count: 1, max: 3, state: "partial"});
    });

    it("3 exemplaires sur maxSameCard 3 : state full", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}
        ]);

        expect(computeCopyState(card, deck)).toEqual({count: 3, max: 3, state: "full"});
    });

    it("4 exemplaires sur maxSameCard 3 (deck hérité incohérent) : full, compte réel affiché sans écrêtage", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"},
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}
        ]);

        expect(computeCopyState(card, deck)).toEqual({count: 4, max: 3, state: "full"});
    });

    it("sans maxSameCard, ou valeur non finie : max vaut 1 (COPY-05)", () => {
        const withoutMax = makeCard({name: "FQCARDTITLE.Card"});
        const nonFiniteMax = makeCard({name: "FQCARDTITLE.Card2", maxSameCard: "abc"});
        const deck = makeDeck([]);

        expect(computeCopyState(withoutMax, deck).max).toBe(1);
        expect(computeCopyState(nonFiniteMax, deck).max).toBe(1);
    });

    it("deck absent : count 0, state none, sans lever", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});

        expect(computeCopyState(card, undefined)).toEqual({count: 0, max: 3, state: "none"});
    });

    it("BOOK-07 : une carte marquée drawn reste comptée (aucun filtre sur l'état de pioche)", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([
            {name: "FQCARDTITLE.Card", drawn: true}, {name: "FQCARDTITLE.Card", drawn: false}
        ]);

        expect(computeCopyState(card, deck).count).toBe(2);
    });

    it("seules les cartes de même nom sont comptées", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([{name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.OtherCard"}]);

        expect(computeCopyState(card, deck).count).toBe(1);
    });
});

describe("computeToggleAction", () => {
    it("carte non distribuée (0/3) : crée les 3 exemplaires attendus (COPY-01)", () => {
        expect(computeToggleAction({count: 0, max: 3, state: "none"})).toEqual({action: "create", count: 3});
    });

    it("carte partielle (1/3) : crée les 2 exemplaires manquants (COPY-03)", () => {
        expect(computeToggleAction({count: 1, max: 3, state: "partial"})).toEqual({action: "create", count: 2});
    });

    it("carte complète (3/3) : retire les 3 exemplaires (COPY-02)", () => {
        expect(computeToggleAction({count: 3, max: 3, state: "full"})).toEqual({action: "remove", count: 3});
    });

    it("carte sans maxSameCard renseigné (0/1, COPY-05) : crée l'exemplaire unique", () => {
        expect(computeToggleAction({count: 0, max: 1, state: "none"})).toEqual({action: "create", count: 1});
    });

    it("COPY-04 : pour toute combinaison count/max, une création ne dépasse jamais max et ne renvoie jamais un compte négatif", () => {
        for (let max = 1; max <= 5; max++) {
            for (let count = 0; count <= max; count++) {
                const state = count === 0 ? "none" : count >= max ? "full" : "partial";
                const result = computeToggleAction({count, max, state});
                expect(result.count).toBeGreaterThanOrEqual(0);
                if (result.action === "create") {
                    expect(count + result.count).toBe(max);
                }
            }
        }
    });
});

describe("computeIncrementAction", () => {
    it("carte non distribuée (0/3) : crée UN exemplaire (COPY-07)", () => {
        expect(computeIncrementAction({count: 0, max: 3, state: "none"})).toEqual({action: "create", count: 1});
    });

    it("carte partielle (2/3) : crée UN exemplaire, jamais les exemplaires manquants au complet", () => {
        expect(computeIncrementAction({count: 2, max: 3, state: "partial"})).toEqual({action: "create", count: 1});
    });

    it("carte complète (3/3) : aucune action", () => {
        expect(computeIncrementAction({count: 3, max: 3, state: "full"})).toEqual({action: "none", count: 0});
    });

    it("carte sans maxSameCard renseigné (0/1) : crée l'exemplaire unique", () => {
        expect(computeIncrementAction({count: 0, max: 1, state: "none"})).toEqual({action: "create", count: 1});
    });

    it("deck déjà en dépassement (4/3) : aucune action, ne peut pas aggraver la situation", () => {
        expect(computeIncrementAction({count: 4, max: 3, state: "full"})).toEqual({action: "none", count: 0});
    });

    it("COPY-07 : pour toute combinaison count/max, le compte décidé vaut 1 tant que count < max, 0 dès qu'il l'atteint ou le dépasse", () => {
        for (let max = 1; max <= 5; max++) {
            for (let count = 0; count <= max; count++) {
                const state = count === 0 ? "none" : count >= max ? "full" : "partial";
                const result = computeIncrementAction({count, max, state});
                expect(result.count).toBeGreaterThanOrEqual(0);
                expect(result.count).toBeLessThanOrEqual(1);
                if (count < max) {
                    expect(result).toEqual({action: "create", count: 1});
                } else {
                    expect(result).toEqual({action: "none", count: 0});
                }
            }
        }
    });
});

describe("groupCardsByClass", () => {
    it("groupe des cartes déjà triées en préservant l'ordre interne de chaque groupe", () => {
        const a = makeCard({name: "FQCARDTITLE.A", class: "elementalist"});
        const b = makeCard({name: "FQCARDTITLE.B", class: "elementalist"});
        const c = makeCard({name: "FQCARDTITLE.C", class: "monk"});

        const groups = groupCardsByClass([a, b, c]);

        expect(groups.get("elementalist").map(card => card.name)).toEqual(["FQCARDTITLE.A", "FQCARDTITLE.B"]);
        expect(groups.get("monk").map(card => card.name)).toEqual(["FQCARDTITLE.C"]);
    });

    it("une carte sans system.fq.class atterrit dans le groupe neutral", () => {
        const card = makeCard({name: "FQCARDTITLE.NoClass"});

        const groups = groupCardsByClass([card]);

        expect(groups.get("neutral").map(c => c.name)).toEqual(["FQCARDTITLE.NoClass"]);
    });
});

describe("localizeClassKey", () => {
    it("interroge la clé FQCARDENGINE.Class<PascalCase>", () => {
        const localizeSpy = vi.spyOn(game.i18n, "localize")
            .mockImplementation(key => (key === "FQCARDENGINE.ClassRunicWarrior" ? "Guerrier Runique" : key));

        expect(localizeClassKey("runic-warrior")).toBe("Guerrier Runique");
        expect(localizeSpy).toHaveBeenCalledWith("FQCARDENGINE.ClassRunicWarrior");
    });

    it("renvoie l'identifiant brut quand la localisation renvoie la clé elle-même (clé absente)", () => {
        vi.spyOn(game.i18n, "localize").mockImplementation(key => key);

        expect(localizeClassKey("unknown-class")).toBe("unknown-class");
    });
});

describe("buildSpellbookGroups", () => {
    it("un tableau de cartes vide renvoie isEmpty true et aucun groupe", () => {
        expect(buildSpellbookGroups([], makeDeck([]))).toEqual({isEmpty: true, groups: []});
    });

    it("renvoie des groupes ordonnés par libellé de classe localisé, avec les copies annotées", () => {
        vi.spyOn(game.i18n, "localize").mockImplementation(key => {
            const labels = {
                "FQCARDENGINE.ClassMonk": "Beta",
                "FQCARDENGINE.ClassElementalist": "Alpha"
            };
            return labels[key] ?? key;
        });
        const elementalistCard = makeCard({name: "FQCARDTITLE.E", class: "elementalist", maxSameCard: 2});
        const monkCard = makeCard({name: "FQCARDTITLE.M", class: "monk", maxSameCard: 1});
        const deck = makeDeck([{name: "FQCARDTITLE.E"}]);

        const result = buildSpellbookGroups([monkCard, elementalistCard], deck);

        expect(result.isEmpty).toBe(false);
        expect(result.groups.map(g => g.classKey)).toEqual(["elementalist", "monk"]);
        expect(result.groups.map(g => g.classLabel)).toEqual(["Alpha", "Beta"]);
        expect(result.groups[0].count).toBe(1);
        expect(result.groups[0].entries).toEqual([
            {card: elementalistCard, copies: {count: 1, max: 2, state: "partial"}}
        ]);
        expect(result.groups[1].entries).toEqual([
            {card: monkCard, copies: {count: 0, max: 1, state: "none"}}
        ]);
    });

    it("D-14 : l'ordre des cartes dans un groupe est identique que le deck soit vide ou plein", () => {
        const cardHigh = makeCard({name: "FQCARDTITLE.High", level: 2, class: "monk"});
        const cardLow = makeCard({name: "FQCARDTITLE.Low", level: 1, class: "monk"});
        const namesFor = deck => buildSpellbookGroups([cardHigh, cardLow], deck).groups
            .flatMap(g => g.entries.map(e => e.card.name));

        const emptyDeck = makeDeck([]);
        const fullDeck = makeDeck([{name: "FQCARDTITLE.High"}, {name: "FQCARDTITLE.Low"}]);

        expect(namesFor(emptyDeck)).toEqual(namesFor(fullDeck));
    });
});
