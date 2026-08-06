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
vi.mock("../../src/domain/interface/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

// `Macro` est un global Foundry natif jamais exercé par le smoke test du socle
// (07-02) : `Fx.importMacroFromCompendium` (déclenché par tout effet
// `macro.execute`, ex. PersistAura) appelle `Macro.create(...)` dès que le
// compendium mocké (`game.packs.get(...).getDocuments()` -> `[]`) ne trouve pas
// la macro. Sans ce stub, TOUT choix comportant un `macro.execute` lève
// `ReferenceError: Macro is not defined` — un trou générique du bac à sable de
// test (pas un bug métier), comblé ici une fois pour toutes les cartes,
// exactement comme `globalThis.socketlib` ci-dessus (isolation par fichier
// Vitest : ne fuit jamais vers les autres suites, cf. harness.smoke.test.js).
globalThis.Macro = class {
    static create = vi.fn(async () => ({}));
};

const {playChoice} = await import("./play-harness.js");
const FormError = (await import("../../src/core/error/form-error.model.js")).default;

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const worldFixture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8")
);

/**
 * Construit un document de compendium « sbire » minimal et cohérent à partir
 * des données DÉCLARÉES par le choix lui-même (`choice.minions[]`), pour
 * combler `game.packs.get("...minions-fq8").getDocuments()` (mocké vide par
 * le socle) : sans ce document, `Minion.createActorData` calcule
 * `JSON.parse(JSON.stringify(undefined))` (`.find` ne trouve rien) et lève
 * `"undefined" is not valid JSON` pour TOUT choix qui invoque un sbire, quel
 * qu'il soit. Piloté uniquement par la forme du choix (`minion.name`), jamais
 * par un nom de carte.
 *
 * @param {object} minion - L'entrée `choice.minions[i]` (nom + surcharges).
 *
 * @returns {object} Un document de compendium minimal portant le même `name`.
 */
function minionDocFor(minion) {
    return {
        name: minion.name,
        system: {
            attributes: {hp: {max: 1, value: 1}, movement: {walk: 0}},
            fq: {
                attributes: {critical: 1, evasion: 1},
                action: {max: 1, value: 1},
                mana: {max: 1, value: 1},
                zeal: {max: 1, value: 1},
                bonus: {damage: 0, heal: 0}
            }
        },
        ownership: {}
    };
}

/**
 * Indique si un choix référence une API dépendant d'un combat actif
 * (`game.combat.flags.fq.logs` via `Constants.lastDamageThisTurn`/
 * `lastCriticalThisTurn`, appelées directement ou via
 * `FqCardEngineModule.cst.*` dans un `xvalue`/`yvalue`/`customEvals`).
 * Détection purement textuelle sur le contenu du choix — aucune référence à
 * un nom de carte — afin de fournir un `game.combat` synthétique UNIQUEMENT
 * aux choix qui en ont réellement besoin pour s'évaluer sans exception, tout
 * en laissant `game.combat` à `null` par défaut pour tous les autres (décision
 * de cadrage : les cas combat complets restent traités en 07-04).
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {boolean} True si le choix référence une API dépendant du combat.
 */
function referencesCombatApi(choice) {
    const text = JSON.stringify(choice);
    return text.includes("game.combat") || text.includes("lastDamageThisTurn") || text.includes("lastCriticalThisTurn");
}

/**
 * Dérive les surcharges `opts.world` (transmises à `mountWorld` par
 * `playChoice`) nécessaires pour qu'un « game cohérent » puisse évaluer
 * N'IMPORTE QUEL choix des 7 decks sans exception non maîtrisée, en ne
 * s'appuyant QUE sur la forme du choix — jamais sur son nom ou celui de sa
 * carte. Ce n'est PAS une réimplémentation de logique métier : c'est la
 * complétion, au niveau du monde de test, de champs Foundry génériques que le
 * socle (07-02) ne peuplait pas encore parce que son smoke test (une seule
 * carte) ne les exerçait pas :
 *   - `folders` : un dossier « Temporaire » (sinon `getTempActorFolder().id`
 *     casse pour tout choix invoquant un sbire, le socket `createTempFold`
 *     étant mocké et ne mutant jamais `game.folders`).
 *   - `canvas.scene.grid.distance` : absent du socle (qui n'expose que
 *     `dimensions`), nécessaire à tout choix référençant
 *     `game.canvas.scene.grid.distance` (ex. calcul de portée en cases).
 *   - `canvas.scene.tokens[].name`/`.object` : le socle n'attribue ni nom, ni
 *     `.object` (placeable) aux tokens ; `Constants.myTargets("Skeletons")`
 *     fait `.map(t => t.object).filter(t => t.name...)`, qui casse dès que
 *     `.object` est `undefined` — ce qui se produit pour TOUT choix quel que
 *     soit son `targetType` puisque `Fx.handleSpecialEffect` appelle
 *     `myTargets(cardContent.targetType)` pour CHAQUE choix joué. Réutilise
 *     les noms déjà présents dans `world-fixture.json` (aucune invention).
 *   - `packs.get(...).getDocuments()` : voir `minionDocFor`.
 *   - `combat` : voir `referencesCombatApi` (uniquement si nécessaire).
 *
 * @param {object} choice - Le choix (contenu) de la carte à jouer.
 *
 * @returns {object} Les surcharges `world` à transmettre à `playChoice`.
 */
function sweepWorldOverridesFor(choice) {
    const world = {
        folders: [{type: "Actor", name: "Temporaire", id: "sweep-temp-folder"}],
        canvas: {
            scene: {
                grid: {distance: 1, size: worldFixture.gridSize},
                tokens: [
                    {
                        actorId: worldFixture.character.id,
                        name: worldFixture.character.name,
                        x: worldFixture.myToken.x,
                        y: worldFixture.myToken.y,
                        width: worldFixture.myToken.width,
                        height: worldFixture.myToken.height,
                        object: {id: "sweep-my-object-token", name: worldFixture.character.name}
                    },
                    {
                        actorId: worldFixture.target.actorId,
                        name: worldFixture.target.name,
                        x: worldFixture.target.x,
                        y: worldFixture.target.y,
                        width: worldFixture.target.width,
                        height: worldFixture.target.height,
                        object: {id: worldFixture.target.tokenId, name: worldFixture.target.name}
                    }
                ]
            }
        },
        packs: {get: vi.fn(() => ({getDocuments: vi.fn(async () => (choice.minions ?? []).map(minionDocFor))}))}
    };

    if (referencesCombatApi(choice)) {
        world.combat = {
            round: 1,
            combatant: {actor: {id: worldFixture.character.id}},
            combatants: [],
            flags: {fq: {logs: []}}
        };
    }

    return world;
}

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
    test("balaie au moins 187 choix des 7 decks pattern fq8 (garde-fou d'auto-couverture)", () => {
        expect(deckFiles.length).toBe(7);
        expect(sweepEntries.length).toBeGreaterThanOrEqual(187);
    });
});
