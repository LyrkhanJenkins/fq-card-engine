import {describe, expect, it, vi} from "vitest";
import {
    buildLevelOptions, buildSpellbookGroups, computeCopyState, computeDeckMinSize, computeDeckSize,
    computeIncrementAction, computeToggleAction, groupCardsByClass, localizeClassKey, matchesSpellbookFilters,
    sortCardsByLevelThenName
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

/**
 * Fabrique un deck minimal : un tableau de cartes exposé sous `.cards`, et le
 * plancher du deck là où il est porté en jeu (`system.fq.minSize`). Un deck
 * fabriqué sans plancher n'en a pas : tout y est retirable, comme avant la
 * règle de taille minimale.
 */
function makeDeck(cards, minSize = 0) {
    return {cards, system: {fq: {type: "DECK", minSize}}};
}

describe("computeCopyState", () => {
    it("0 exemplaire sur maxSameCard 3 : state none", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([]);

        expect(computeCopyState(card, deck)).toEqual({count: 0, max: 3, state: "none", locked: false, min: 0});
    });

    it("1 exemplaire sur maxSameCard 3 : state partial", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([{name: "FQCARDTITLE.Card"}]);

        expect(computeCopyState(card, deck)).toEqual({count: 1, max: 3, state: "partial", locked: false, min: 0});
    });

    it("3 exemplaires sur maxSameCard 3 : state full", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}
        ]);

        expect(computeCopyState(card, deck)).toEqual({count: 3, max: 3, state: "full", locked: false, min: 0});
    });

    it("4 exemplaires sur maxSameCard 3 (deck hérité incohérent) : full, compte réel affiché sans écrêtage", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});
        const deck = makeDeck([
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"},
            {name: "FQCARDTITLE.Card"}, {name: "FQCARDTITLE.Card"}
        ]);

        expect(computeCopyState(card, deck)).toEqual({count: 4, max: 3, state: "full", locked: false, min: 0});
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

        expect(computeCopyState(card, undefined)).toEqual({count: 0, max: 3, state: "none", locked: false, min: 0});
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

describe("computeDeckMinSize", () => {
    it("lit le plancher porté par le deck", () => {
        expect(computeDeckMinSize(makeDeck([], 14))).toBe(14);
    });

    it("plancher absent, nul, négatif ou non numérique : aucun plancher", () => {
        expect(computeDeckMinSize(makeDeck([]))).toBe(0);
        expect(computeDeckMinSize({cards: []})).toBe(0);
        expect(computeDeckMinSize({cards: [], system: {fq: {minSize: null}}})).toBe(0);
        expect(computeDeckMinSize({cards: [], system: {fq: {minSize: -3}}})).toBe(0);
        expect(computeDeckMinSize({cards: [], system: {fq: {minSize: "abc"}}})).toBe(0);
        expect(computeDeckMinSize(undefined)).toBe(0);
    });
});

describe("plancher du deck : verrou de retrait", () => {
    /** Fabrique un deck de `size` cartes portant toutes le même nom. */
    function deckOf(name, size, minSize) {
        return makeDeck(Array.from({length: size}, (_, i) => ({id: `c${i}`, name})), minSize);
    }

    it("deck exactement au plancher : les cartes présentes sont verrouillées", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 3});

        expect(computeCopyState(card, deckOf("FQCARDTITLE.Card", 3, 3)))
            .toEqual({count: 3, max: 3, state: "full", locked: true, min: 3});
    });

    it("retrait qui laisse le deck pile au plancher : autorisé", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 2});
        const deck = makeDeck([
            {id: "a", name: "FQCARDTITLE.Card"}, {id: "b", name: "FQCARDTITLE.Card"},
            {id: "c", name: "FQCARDTITLE.Other"}, {id: "d", name: "FQCARDTITLE.Other"},
            {id: "e", name: "FQCARDTITLE.Other"}
        ], 3);

        expect(computeCopyState(card, deck))
            .toEqual({count: 2, max: 2, state: "full", locked: false, min: 3});
    });

    it("retrait qui ferait passer sous le plancher d'une seule carte : verrouillé", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 2});
        const deck = makeDeck([
            {id: "a", name: "FQCARDTITLE.Card"}, {id: "b", name: "FQCARDTITLE.Card"},
            {id: "c", name: "FQCARDTITLE.Other"}, {id: "d", name: "FQCARDTITLE.Other"}
        ], 3);

        expect(computeCopyState(card, deck).locked).toBe(true);
    });

    it("carte absente du deck : jamais verrouillée, il n'y a rien à en retirer", () => {
        const card = makeCard({name: "FQCARDTITLE.Absent", maxSameCard: 2});

        expect(computeCopyState(card, deckOf("FQCARDTITLE.Other", 3, 3)).locked).toBe(false);
    });

    it("deck sans plancher : rien n'est jamais verrouillé", () => {
        const card = makeCard({name: "FQCARDTITLE.Card", maxSameCard: 2});

        expect(computeCopyState(card, deckOf("FQCARDTITLE.Card", 2, 0)).locked).toBe(false);
    });

    it("computeToggleAction refuse le retrait d'une carte complète verrouillée", () => {
        expect(computeToggleAction({count: 2, max: 2, state: "full", locked: true}))
            .toEqual({action: "locked", count: 0});
    });

    it("computeToggleAction complète une carte partielle, verrou ou non", () => {
        expect(computeToggleAction({count: 1, max: 3, state: "partial", locked: true}))
            .toEqual({action: "create", count: 2});
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
            {card: elementalistCard, copies: {count: 1, max: 2, state: "partial", locked: false, min: 0}}
        ]);
        expect(result.groups[1].entries).toEqual([
            {card: monkCard, copies: {count: 0, max: 1, state: "none", locked: false, min: 0}}
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

describe("matchesSpellbookFilters", () => {
    it("critères tous vides : vraie pour n'importe quelle carte", () => {
        const meta = {classKey: "monk", level: 2, name: "Boule de feu"};

        expect(matchesSpellbookFilters(meta, {classKey: "", level: "", search: ""})).toBe(true);
    });

    it("critère de classe différent : renvoie faux", () => {
        const meta = {classKey: "monk", level: 2, name: "Boule de feu"};

        expect(matchesSpellbookFilters(meta, {classKey: "trapper", level: "", search: ""})).toBe(false);
    });

    it("critère de niveau égal : renvoie vrai, niveau carte numérique, critère chaîne", () => {
        const meta = {classKey: "monk", level: 2, name: "Boule de feu"};

        expect(matchesSpellbookFilters(meta, {classKey: "", level: "2", search: ""})).toBe(true);
    });

    it("critère de recherche en majuscules retrouve un nom en minuscules, et réciproquement", () => {
        const meta = {classKey: "monk", level: 2, name: "boule de feu"};

        expect(matchesSpellbookFilters(meta, {classKey: "", level: "", search: "BOULE"})).toBe(true);
        expect(matchesSpellbookFilters({...meta, name: "BOULE DE FEU"}, {classKey: "", level: "", search: "boule"})).toBe(true);
    });

    it("critère de recherche correspondant à une sous-chaîne au milieu du nom : renvoie vrai", () => {
        const meta = {classKey: "monk", level: 2, name: "Boule de feu ardent"};

        expect(matchesSpellbookFilters(meta, {classKey: "", level: "", search: "de feu"})).toBe(true);
    });

    it("combine en ET : deux critères sur trois satisfaits renvoie faux", () => {
        const meta = {classKey: "monk", level: 2, name: "Boule de feu"};

        expect(matchesSpellbookFilters(meta, {classKey: "monk", level: "2", search: "éclair"})).toBe(false);
    });
});

describe("buildLevelOptions", () => {
    it("trie les niveaux distincts par ordre croissant", () => {
        const cards = [makeCard({level: 3}), makeCard({level: 1}), makeCard({level: 2})];

        expect(buildLevelOptions(cards)).toEqual([1, 2, 3]);
    });

    it("un même niveau partagé par plusieurs cartes n'apparaît qu'une fois", () => {
        const cards = [makeCard({level: 1}), makeCard({level: 1}), makeCard({level: 2})];

        expect(buildLevelOptions(cards)).toEqual([1, 2]);
    });

    it("un niveau absent, null ou non numérique compte comme zéro, une seule entrée pour les trois", () => {
        const cards = [makeCard({}), makeCard({level: null}), makeCard({level: "abc"})];

        expect(buildLevelOptions(cards)).toEqual([0]);
    });

    it("un tableau vide renvoie un tableau vide", () => {
        expect(buildLevelOptions([])).toEqual([]);
    });
});

describe("computeDeckSize", () => {
    it("un deck de cinq cartes renvoie cinq, quels que soient noms et états de pioche", () => {
        const deck = makeDeck([
            {name: "A", drawn: true}, {name: "A", drawn: false}, {name: "B"}, {name: "B"}, {name: "C"}
        ]);

        expect(computeDeckSize(deck)).toBe(5);
    });

    it("un deck vide renvoie zéro", () => {
        expect(computeDeckSize(makeDeck([]))).toBe(0);
    });

    it("sans deck : renvoie zéro", () => {
        expect(computeDeckSize(undefined)).toBe(0);
    });

    it("compte les exemplaires, pas les cartes distinctes : trois exemplaires du même nom comptent pour trois", () => {
        const deck = makeDeck([{name: "A"}, {name: "A"}, {name: "A"}]);

        expect(computeDeckSize(deck)).toBe(3);
    });

    it("collection Foundry (héritée de Map, donc size et non length) : compte quand même", () => {
        const collection = new Map([["a", {name: "A"}], ["b", {name: "A"}], ["c", {name: "B"}]]);

        expect(computeDeckSize({cards: collection})).toBe(3);
    });
});
