import {describe, expect, test} from "vitest";
import fs from "fs";
import path from "path";

/**
 * Garde-fou de cohérence des encarts 🃏 « Proposer des cartes » des decks
 * pattern : une référence `chooseCardsList` ou `chooseCardsFrom` qui ne résout
 * plus vers un deck/une carte existants, ou des filtres de niveaux qui ne
 * matchent plus aucune rune, dégénèrent en silence en jeu (warning « aucune
 * candidate ») — ce test casse à la place.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const PACK_ID = "fq-card-engine.decks-pattern-fq8";

const decks = fs.readdirSync(DECKS_DIR)
    .filter(fileName => fileName.endsWith(".json"))
    .map(fileName => JSON.parse(fs.readFileSync(path.join(DECKS_DIR, fileName), "utf-8")));
const decksByName = new Map(decks.map(deck => [deck.name, deck]));

const chooseEntries = [];
const listEntries = [];
for (const deck of decks) {
    for (const card of deck.cards) {
        card.system.fq.choices.forEach((choice, choiceIndex) => {
            // Une source par entrée : un encart multi-sources (`;`) est vérifié
            // source par source, comme le moteur les déroule.
            for (const source of (choice.chooseCardsFrom ?? "").split(";").map(part => part.trim()).filter(Boolean)) {
                chooseEntries.push({deckName: deck.name, cardName: card.name, choiceIndex, choice, source});
            }
            for (const reference of (choice.chooseCardsList ?? "").split(",").map(part => part.trim()).filter(Boolean)) {
                listEntries.push({deckName: deck.name, cardName: card.name, choiceIndex, reference});
            }
        });
    }
}

describe("Références des encarts 🃏 des decks pattern fq8", () => {
    test("au moins un encart 🃏 est découvert (auto-couverture)", () => {
        expect(chooseEntries.length).toBeGreaterThanOrEqual(1);
    });

    test.each(chooseEntries)(
        "$deckName :: $cardName :: choix $choiceIndex",
        ({choice, source}) => {
            // La source désigne un deck du pack pattern, par son id complet.
            expect(source.startsWith(`${PACK_ID}.`)).toBe(true);
            const targetName = source.slice(PACK_ID.length + 1);
            const target = decksByName.get(targetName);
            expect(target, `deck source introuvable : ${targetName}`).toBeDefined();

            // Les filtres de niveaux laissent au moins autant de candidates
            // que de cartes à choisir (sinon le voile n'a rien à proposer).
            const levels = (choice.chooseCardsLevels ?? "").split(",")
                .map(part => part.trim())
                .filter(Boolean)
                .map(Number);
            const candidates = target.cards.filter(card =>
                !levels.length || levels.includes(Number(card.system.fq.level)));
            const wanted = Number(choice.chooseCardsCount) || 1;
            expect(candidates.length).toBeGreaterThanOrEqual(wanted);

            // Le nombre proposé couvre le nombre à choisir.
            const proposed = Number(choice.chooseCardsProposed) || 0;
            if (proposed) {
                expect(proposed).toBeGreaterThanOrEqual(wanted);
            }
        }
    );

    test("au moins une référence de liste est découverte (auto-couverture)", () => {
        expect(listEntries.length).toBeGreaterThanOrEqual(1);
    });

    test.each(listEntries)(
        "$deckName :: $cardName :: choix $choiceIndex → $reference",
        ({reference}) => {
            // Chaque référence de liste désigne une carte d'un deck du pack pattern, par id complet.
            expect(reference.startsWith(`${PACK_ID}.`)).toBe(true);
            const rest = reference.slice(PACK_ID.length + 1);
            const targetDeck = decks.find(deck => rest.startsWith(`${deck.name}.`));
            expect(targetDeck, `deck introuvable pour « ${reference} »`).toBeDefined();
            const targetName = rest.slice(targetDeck.name.length + 1);
            expect(targetDeck.cards.some(card => card.name === targetName),
                `carte « ${targetName} » absente du deck « ${targetDeck.name} »`).toBe(true);
        }
    );
});
