import fs from "fs";
import path from "path";
import {vi} from "vitest";
import {mountWorld} from "./play-harness.js";
import {DeterministicRoll, resetDiceControl} from "./deterministic-roll.js";
import RollService from "../../src/domain/engine/roll/roll-service.js";

/**
 * Helpers PARTAGÉS des suites « corpus » (damage-heal, resources-targeting,
 * xy-bounds-specifics, destroy/retrieve/duplicate…) : découverte des decks
 * pattern, géométrie de la fixture monde, résolution de formule identique au
 * pipeline réel, et stubs d'environnement communs. À importer DYNAMIQUEMENT
 * (`await import`) après le bloc `vi.mock` du fichier de test, comme
 * `play-harness.js`.
 */

/** Le dossier des decks pattern (source de vérité des cartes du jeu). */
export const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");

/** La fixture monde brute (géométrie, personnage, cible) — lecture unique. */
export const worldFixture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8")
);

/**
 * Indique si une valeur de champ de carte est renseignée (ni vide ni absente).
 *
 * @param {*} value - La valeur à tester.
 *
 * @returns {boolean} True si la valeur est renseignée.
 */
export function isFilled(value) {
    return value !== undefined && value !== null && value !== "";
}

/**
 * Distance (en cases) entre le token du personnage et le token cible de la
 * fixture, calculée depuis la géométrie déclarée dans world-fixture.json
 * (jamais un nombre magique en dur).
 *
 * @returns {number} La distance de la fixture, en cases.
 */
export function fixtureDistance() {
    const dx = Math.abs(worldFixture.myToken.x - worldFixture.target.x);
    const dy = Math.abs(worldFixture.myToken.y - worldFixture.target.y);
    return (dx + dy) / worldFixture.gridSize;
}

/**
 * Résout une formule de carte (arithmétique + dés) EXACTEMENT comme le
 * pipeline réel : substitution des @-caractéristiques par les mods de la
 * fixture (même fonction que `play-card.js`), puis évaluation via le même
 * évaluateur générique de dés que celui installé en `globalThis.Roll`
 * (`DeterministicRoll`, socle 07-02). Les dés non pilotés retombent sur le
 * défaut stable documenté (1), identique au comportement du pipeline quand
 * `opts.dice` n'en fournit pas.
 *
 * @param {string|number} formula - La formule brute du choix (ex. `choice.damage`).
 *
 * @returns {Promise<number>} Le total résolu.
 */
export async function resolveFormula(formula) {
    mountWorld();
    const substituted = RollService.replaceAbilitiesBonus(String(formula ?? "0"));
    resetDiceControl();
    const roll = await new DeterministicRoll(substituted).evaluate();
    resetDiceControl();
    return roll.total;
}

/**
 * Indique si la portée déclarée par un choix (le cas échéant) inclut la
 * distance fixe de la fixture (voir `fixtureDistance`). Absence totale de
 * portée = compatible par construction (le contrôle de portée n'est jamais
 * déclenché).
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {Promise<boolean>} True si la fixture par défaut satisfait la portée.
 */
export async function reachAllowsFixtureDistance(choice) {
    if (!isFilled(choice.minReach) && !isFilled(choice.maxReach)) {
        return true;
    }
    const dist = fixtureDistance();
    const min = isFilled(choice.minReach) ? await resolveFormula(choice.minReach) : 0;
    const max = isFilled(choice.maxReach) ? await resolveFormula(choice.maxReach) : Infinity;
    return min <= dist && dist <= max;
}

/**
 * Installe l'espion `DialogV2.prompt` (absent du socle tests/setup.js) et le renvoie.
 *
 * @param {Promise<string|undefined>} resolution - La promesse renvoyée par le prompt.
 *
 * @returns {import("vitest").Mock} L'espion prompt installé.
 */
export function mockDialogPrompt(resolution) {
    const prompt = vi.fn(() => resolution);
    globalThis.foundry.applications.api = {DialogV2: {prompt}};
    return prompt;
}

/**
 * Installe le stub du global Foundry `Macro`, jamais fourni par le smoke test
 * du socle (07-02) : `Fx.importMacroFromCompendium` (déclenché par tout effet
 * `macro.execute`, ex. PersistAura) appelle `Macro.create(...)` dès que le
 * compendium mocké (`game.packs.get(...).getDocuments()` -> `[]`) ne trouve pas
 * la macro. Sans ce stub, TOUT choix comportant un `macro.execute` lève
 * `ReferenceError: Macro is not defined` — un trou générique du bac à sable de
 * test (pas un bug métier), comblé ici une fois pour toutes les cartes,
 * exactement comme `globalThis.socketlib` (isolation par fichier Vitest : ne
 * fuit jamais vers les autres suites, cf. harness.smoke.test.js).
 *
 * @returns {void}
 */
export function installMacroStub() {
    globalThis.Macro = class {
        static create = vi.fn(async () => ({}));
    };
}
