import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le commentaire JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice} = await import("./play-harness.js");
const {installMacroStub, sweepWorldOverridesFor} = await import("./corpus-helpers.js");
installMacroStub();
const FormError = (await import("../../src/core/error/form-error.model.js")).default;

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");


// ─── Découverte 100% par glob : AUCUNE liste de cartes en dur. Toute carte
// ajoutée à un deck JSON du dépôt est balayée automatiquement au prochain run. ──
const deckFiles = fs.readdirSync(DECKS_DIR).filter(fileName => fileName.endsWith(".json")).sort();

const sweepEntries = [];
for (const deckFile of deckFiles) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
    for (const card of deck.cards) {
        card.system.fq.choices.forEach((_choice, choiceIndex) => {
            sweepEntries.push({deckFile, cardName: card.name, card, choiceIndex});
        });
    }
}

describe("Balayage global des decks pattern fq8 (07-03 — EXHA-05)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Un `it` par choix découvert par glob (test.each générique — aucun cas codé
    // en dur par nom de carte). game.combat reste à `null` par défaut (voir
    // `referencesCombatApi`) : les cas combat complets sont traités en 07-04.
    test.each(sweepEntries)(
        "$deckFile :: $cardName :: choix $choiceIndex",
        async ({card, choiceIndex}) => {
            const choice = card.system.fq.choices[choiceIndex];

            const result = await playChoice(card, choiceIndex, {world: sweepWorldOverridesFor(choice)});

            // Invariant (a) : 0 exception non maîtrisée. Une `FormError` (ex.
            // sélection d'emplacements de sbires invalide face à la géométrie du
            // monde) est un rejet PROPRE du dialogue — signalé par exception plutôt
            // que par un booléen de retour — et non une régression : documenté ici
            // générique (par TYPE d'erreur, jamais par nom de carte), conformément
            // au point (c) du plan.
            if (result.threw) {
                expect(result.error).toBeInstanceOf(FormError);
            } else {
                expect(result.threw).toBe(false);
            }

            // Invariant (b) : tout `applyActorHpModification` capturé est bien formé.
            for (const hpCall of result.hpCalls) {
                expect(Number.isFinite(hpCall.value)).toBe(true);
                expect(hpCall.value).toBeGreaterThanOrEqual(0);
                expect(["damageFQ", "healFQ"]).toContain(hpCall.type);
            }
        }
    );

    // Invariant (c) / garde-fou d'auto-couverture : le compte est calculé
    // dynamiquement depuis le glob — une carte ajoutée au JSON du deck-pattern
    // fait mécaniquement grimper ce total, sans toucher à ce fichier.
    test("balaie au moins 330 choix des 21 decks pattern fq8 (garde-fou d'auto-couverture)", () => {
        expect(deckFiles.length).toBe(21);
        expect(sweepEntries.length).toBeGreaterThanOrEqual(330);
    });
});
