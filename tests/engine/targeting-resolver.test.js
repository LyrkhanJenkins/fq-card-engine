import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld} = await import("../decks/play-harness.js");
const {installDeterministicRoll, resetDiceControl} = await import("../decks/deterministic-roll.js");
const TargetingResolver = (await import("../../src/domain/engine/shared/targeting-resolver.js")).default;
const CardEffect = (await import("../../src/domain/engine/shared/card-effect.js")).default;
const {makeChoice} = await import("../factories.js");

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");

function isFilled(value) {
    return value !== undefined && value !== null && value !== "";
}

/**
 * Prépare un monde déterministe : `game` monté depuis world-fixture (abilities
 * str=3/dex=2, bonus.range=0) et `Roll` déterministe évaluant réellement les
 * formules (dont `evaluateSync`).
 *
 * @param {object} [overrides] - Surcharges transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountDeterministic(overrides) {
    mountWorld(overrides);
    installDeterministicRoll();
    resetDiceControl();
}

describe("TargetingResolver.resolveField", () => {
    beforeEach(() => mountDeterministic());

    test("évalue une constante", () => {
        expect(TargetingResolver.resolveField("2", {})).toBe(2);
    });

    test("substitue les caractéristiques (@dex = 2) avant d'évaluer", () => {
        expect(TargetingResolver.resolveField("2+@dex", {})).toBe(4);
    });

    test("substitue XXX depuis le formulaire", () => {
        expect(TargetingResolver.resolveField("XXX+1", {XXX: 3})).toBe(4);
    });
});

describe("TargetingResolver.resolveReach", () => {
    test("ajoute le bonus de portée de l'acteur à maxReach uniquement", () => {
        mountDeterministic({character: {system: {fq: {bonus: {range: 3}}}}});
        expect(TargetingResolver.resolveReach({minReach: "1", maxReach: "2"}, {})).toEqual({minReach: 1, maxReach: 5});
    });

    test("aucune portée déclarée → renvoie les champs bruts (gating minReach || maxReach)", () => {
        mountDeterministic();
        const choice = makeChoice({minReach: "", maxReach: ""});
        expect(TargetingResolver.resolveReach(choice, {})).toEqual({minReach: "", maxReach: ""});
    });
});

describe("TargetingResolver.resolveNbTargets", () => {
    beforeEach(() => mountDeterministic());

    test("résout une valeur renseignée", () => {
        expect(TargetingResolver.resolveNbTargets({nbTargets: "1+1"}, {})).toBe(2);
    });

    test("non renseigné → renvoie la valeur brute", () => {
        expect(TargetingResolver.resolveNbTargets({nbTargets: ""}, {})).toBe("");
    });
});

describe("TargetingResolver — non-mutation du cardContent", () => {
    beforeEach(() => mountDeterministic());

    test("resolveReach/resolveNbTargets ne modifient pas le choix reçu", () => {
        const choice = makeChoice({minReach: "1", maxReach: "2", nbTargets: "3"});
        TargetingResolver.resolveReach(choice, {});
        TargetingResolver.resolveNbTargets(choice, {});
        expect(choice.minReach).toBe("1");
        expect(choice.maxReach).toBe("2");
        expect(choice.nbTargets).toBe("3");
    });
});

// ─── Équivalence avec le VRAI pipeline moteur (prepareDataFromCard) ──────────
// Découverte 100 % par glob : tous les choix des 7 decks dont un champ de
// portée/nbTargets est renseigné.
const deckFiles = fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json")).sort();
const reachEntries = [];
for (const deckFile of deckFiles) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
    for (const card of deck.cards) {
        card.system.fq.choices.forEach((choice, choiceIndex) => {
            if (isFilled(choice.minReach) || isFilled(choice.maxReach) || isFilled(choice.nbTargets)) {
                reachEntries.push({deckFile, cardName: card.name, choiceIndex, choice});
            }
        });
    }
}

describe("TargetingResolver — équivalence avec prepareDataFromCard (7 decks)", () => {
    test.each(reachEntries)(
        "$deckFile :: $cardName :: choix $choiceIndex — reach/nbTargets identiques au pipeline",
        async ({choice}) => {
            mountDeterministic();

            // Résolveur : sur le choix BRUT (il substitue @ + X/Y lui-même).
            const resolverReach = TargetingResolver.resolveReach(choice, {});
            const resolverNb = TargetingResolver.resolveNbTargets(choice, {});

            // Pipeline réel : sur un CLONE, en reproduisant l'ordre du pipeline
            // (substitution abilities + X/Y AVANT prepareDataFromCard, car
            // rollResultAsync n'effectue pas ces substitutions lui-même).
            const clone = JSON.parse(JSON.stringify(choice));
            CardEffect.replaceCardContentAbilitiesBonus(clone);
            CardEffect.recalculatedWithWYValue(clone, 0, 0);
            await CardEffect.prepareDataFromCard(clone);

            if (isFilled(choice.minReach) || isFilled(choice.maxReach)) {
                expect(resolverReach.minReach).toBe(clone.minReach);
                expect(resolverReach.maxReach).toBe(clone.maxReach);
            }
            if (isFilled(choice.nbTargets)) {
                expect(resolverNb).toBe(clone.nbTargets);
            }
        }
    );

    test("garde-fou d'auto-couverture : au moins un choix à portée/nbTargets a été découvert", () => {
        expect(reachEntries.length).toBeGreaterThanOrEqual(1);
    });
});
