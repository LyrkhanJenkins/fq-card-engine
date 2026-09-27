import {beforeEach, describe, expect, it, vi} from "vitest";
import PackUtils from "../../src/core/utils/pack.utils.js";

// ─── Résolution des compendiums à travers les modules ─────────────────────────
//
// Ce que ces tests verrouillent, et pourquoi : le moteur cherchait ses documents
// dans `<son module>.<pack>`, en dur. Un module de contenu qui livre ses decks
// sous le même nom de compendium restait alors invisible, et un joueur de la
// classe qu'il apporte n'avait pas de deck du tout.
//
// La priorité du moteur n'est pas cosmétique : deux modules peuvent nommer un
// deck « Witch Base », et `find(deck => deck.name === …)` chez l'appelant prend le
// premier. Sans ordre garanti, le deck servi dépendrait de l'ordre de chargement
// des modules.

/**
 * Fabrique un faux compendium.
 *
 * @param {string} collection - L'identifiant complet (`"module.pack"`).
 * @param {string} name - Le nom du compendium (`"decks-pattern-fq8"`).
 * @param {object[]} documents - Les documents que rend `getDocuments`.
 *
 * @returns {object} Le compendium simulé.
 */
function packOf(collection, name, documents) {
    return {collection, metadata: {name}, getDocuments: vi.fn(async () => documents)};
}

/**
 * Installe `game.packs` à partir d'une liste de compendiums, avec le `get` par
 * identifiant complet et le `filter` d'une Collection Foundry.
 *
 * @param {object[]} packs - Les compendiums présents dans le monde.
 *
 * @returns {void}
 */
function givenPacks(packs) {
    game.packs = {
        get: vi.fn(collection => packs.find(pack => pack.collection === collection)),
        filter: vi.fn(predicate => packs.filter(predicate))
    };
}

describe("PackUtils.packsNamed", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    });

    it("rend le compendium du moteur quand il est seul", () => {
        const own = packOf("fq-card-engine.minions-fq8", "minions-fq8", []);
        givenPacks([own]);

        expect(PackUtils.packsNamed("minions-fq8")).toEqual([own]);
    });

    it("rend le moteur EN PREMIER, puis les modules de contenu", () => {
        const own = packOf("fq-card-engine.decks-pattern-fq8", "decks-pattern-fq8", []);
        const extended = packOf("fq-card-engine-extended.decks-pattern-fq8", "decks-pattern-fq8", []);
        givenPacks([extended, own]);

        expect(PackUtils.packsNamed("decks-pattern-fq8")).toEqual([own, extended]);
    });

    it("ne compte pas deux fois le compendium du moteur", () => {
        const own = packOf("fq-card-engine.decks-pattern-fq8", "decks-pattern-fq8", []);
        givenPacks([own]);

        expect(PackUtils.packsNamed("decks-pattern-fq8")).toHaveLength(1);
    });

    it("rend le compendium d'un module de contenu même sans celui du moteur", () => {
        // Le cas d'une classe entièrement déportée : le moteur n'a plus ce pack.
        const extended = packOf("fq-card-engine-extended.decks-pattern-fq8", "decks-pattern-fq8", []);
        givenPacks([extended]);

        expect(PackUtils.packsNamed("decks-pattern-fq8")).toEqual([extended]);
    });

    it("ignore les compendiums portant un autre nom", () => {
        const own = packOf("fq-card-engine.minions-fq8", "minions-fq8", []);
        const other = packOf("autre-module.items-fq8", "items-fq8", []);
        givenPacks([own, other]);

        expect(PackUtils.packsNamed("minions-fq8")).toEqual([own]);
    });

    it("rend une liste vide quand aucun module ne fournit ce compendium", () => {
        givenPacks([]);

        expect(PackUtils.packsNamed("inexistant")).toEqual([]);
    });
});

describe("PackUtils.documentsFrom", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    });

    it("concatène les documents des deux modules, le moteur d'abord", async () => {
        givenPacks([
            packOf("fq-card-engine-extended.decks-pattern-fq8", "decks-pattern-fq8", [{name: "Witch Base"}]),
            packOf("fq-card-engine.decks-pattern-fq8", "decks-pattern-fq8", [{name: "Monk Base"}])
        ]);

        expect(await PackUtils.documentsFrom("decks-pattern-fq8")).toEqual([
            {name: "Monk Base"}, {name: "Witch Base"}
        ]);
    });

    it("laisse l'appelant résoudre une homonymie en faveur du moteur", async () => {
        // `find` chez l'appelant prend le premier : celui du moteur.
        givenPacks([
            packOf("fq-card-engine-extended.decks-pattern-fq8", "decks-pattern-fq8", [{name: "Witch Base", from: "ext"}]),
            packOf("fq-card-engine.decks-pattern-fq8", "decks-pattern-fq8", [{name: "Witch Base", from: "core"}])
        ]);

        const documents = await PackUtils.documentsFrom("decks-pattern-fq8");

        expect(documents.find(doc => doc.name === "Witch Base").from).toBe("core");
    });

    it("rend une liste vide sans compendium, sans lever", async () => {
        givenPacks([]);

        expect(await PackUtils.documentsFrom("minions-fq8")).toEqual([]);
    });
});
