import {describe, expect, it} from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Garde-fou de pureté des `customEvals` des decks sources : depuis la
 * rationalisation (classe CardCondition), les scripts de condition sont de
 * simples prédicats — appels `FqCardEngineModule.cond.*`/`cst.*` éventuellement
 * composés d'expressions basiques — et ne portent JAMAIS d'effet de bord.
 * Les effets de bord vivent dans `executeEval`, exécuté au jeu de la carte.
 */

const DECKS_DIR = path.resolve(__dirname, "../../packs/_source/decks-pattern-fq8");

/** Motifs interdits dans un prédicat : effets de bord, API dépréciées, closures. */
const FORBIDDEN_PATTERNS = [
    "game.actors",              // interdit aussi par le lint côté src
    "FQLogs",                   // ancien chemin de logs (flags.fq.logs désormais)
    "setTimeout",
    "createEmbeddedDocuments",
    ".update(",
    "ChatMessage",
    "=>",                       // plus aucune closure : la logique vit dans CardCondition
];

function collectChoices() {
    const rows = [];
    for (const file of fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json"))) {
        const doc = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8"));
        const cards = Array.isArray(doc) ? doc : (doc.cards ?? [doc]);
        for (const card of cards) {
            (card?.system?.fq?.choices ?? []).forEach((choice, index) => {
                rows.push({file, card: card.name, index, choice});
            });
        }
    }
    return rows;
}

describe("customEvals des decks — pureté", () => {

    const scripts = collectChoices().flatMap(({file, card, index, choice}) =>
        (choice.customEvals ?? [])
            .filter(e => e.script?.trim())
            .map(e => ({file, card, index, script: e.script})));

    it("aucun script de condition ne porte d'effet de bord ou de motif interdit", () => {
        const offenders = scripts.flatMap(s =>
            FORBIDDEN_PATTERNS.filter(p => s.script.includes(p))
                .map(p => `${s.file} :: ${s.card} [${s.index}] contient « ${p} »`));

        expect(offenders).toEqual([]);
    });

    it("les conditions migrées passent par la classe CardCondition (garde de non-régression)", () => {
        const condCalls = scripts.filter(s => s.script.includes("FqCardEngineModule.cond."));

        expect(condCalls.length).toBeGreaterThanOrEqual(25);
    });

    it("tout choix réactif des decks porte au moins un customEval (condition du glow)", () => {
        const offenders = collectChoices()
            .filter(({choice}) => choice.reactive)
            .filter(({choice}) => !(choice.customEvals ?? []).some(e => e.script?.trim()))
            .map(({file, card, index}) => `${file} :: ${card} [${index}]`);

        expect(offenders).toEqual([]);
    });
});
