import fs from "fs";
import path from "path";
import {vi} from "vitest";
import {makeEquippedWeapon, mountWorld} from "./play-harness.js";
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

/* ------------------------------------------------------------------ */
/* Monde cohérent pour jouer N'IMPORTE QUEL choix des decks pattern.    */
/* Partagé par le balayage (`sweep.test.js`) et les tests de cartes    */
/* qui ont besoin du même monde (ciblage « Combat », sbires…).         */
/* ------------------------------------------------------------------ */

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
export function minionDocFor(minion) {
    return {
        name: minion.name,
        system: {
            attributes: {hp: {max: 1, value: 1}, movement: {speeds: {walk: 0}}},
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
export function referencesCombatApi(choice) {
    const text = JSON.stringify(choice);
    return text.includes("game.combat") || text.includes("lastDamageThisTurn") || text.includes("lastCriticalThisTurn");
}

/**
 * Indique si un choix utilise un ciblage « Combat » (`CombatEnemies`/
 * `CombatAllies`) : son garde-fou de jeu exige un combat actif dont les
 * combattants correspondent aux tokens de la scène (avec disposition).
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {boolean} True si le choix cible les combattants du combat actif.
 */
export function usesCombatTargeting(choice) {
    return choice.targetType === "CombatEnemies" || choice.targetType === "CombatAllies";
}

/**
 * Dérive les surcharges `opts.world` (transmises à `mountWorld` par
 * `playChoice`) nécessaires pour qu'un « game cohérent » puisse évaluer
 * N'IMPORTE QUEL choix des decks pattern sans exception non maîtrisée, en ne
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
 *   - `character.items` : une arme équipée de chaque type, sans quoi tout choix
 *     à jeton d'arme (`@wpnM`/`@wpnR`) serait refusé avant d'être joué.
 *   - `combat` : voir `referencesCombatApi` (uniquement si nécessaire).
 *
 * @param {object} choice - Le choix (contenu) de la carte à jouer.
 *
 * @returns {object} Les surcharges `world` à transmettre à `playChoice`.
 */
export function sweepWorldOverridesFor(choice) {
    const world = {
        // Une arme de chaque type équipée : sans elle, tout choix dont les dégâts
        // portent un jeton d'arme (`@wpnM`/`@wpnR`) est refusé par le garde-fou de
        // lançabilité et ne serait jamais réellement joué par le balayage.
        character: {items: [makeEquippedWeapon("martialM"), makeEquippedWeapon("martialR")]},
        folders: [{type: "Actor", name: "Temporaire", id: "sweep-temp-folder"}],
        canvas: {
            scene: {
                grid: {distance: 1, size: worldFixture.gridSize},
                tokens: [
                    {
                        id: "sweep-my-token",
                        actorId: worldFixture.character.id,
                        name: worldFixture.character.name,
                        disposition: 1,
                        x: worldFixture.myToken.x,
                        y: worldFixture.myToken.y,
                        width: worldFixture.myToken.width,
                        height: worldFixture.myToken.height,
                        // Le placeable du lanceur porte acteur et document : c'est la
                        // forme rendue par la résolution « sans portée = sur soi ».
                        object: {
                            id: "sweep-my-object-token",
                            name: worldFixture.character.name,
                            actor: {_id: worldFixture.character.id, id: worldFixture.character.id},
                            document: {name: worldFixture.character.name, actorId: worldFixture.character.id}
                        }
                    },
                    {
                        id: worldFixture.target.tokenId,
                        actorId: worldFixture.target.actorId,
                        name: worldFixture.target.name,
                        disposition: -1,
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

    if (referencesCombatApi(choice) || usesCombatTargeting(choice)) {
        world.combat = {
            round: 1,
            combatant: {actor: {id: worldFixture.character.id}},
            // Les deux tokens de la scène sont combattants : un choix « Combat »
            // trouve ainsi son ennemi (le token cible, disposition opposée) ou
            // son allié (le token du lanceur lui-même).
            combatants: usesCombatTargeting(choice)
                ? [{tokenId: "sweep-my-token"}, {tokenId: worldFixture.target.tokenId}]
                : [],
            flags: {fq: {logs: []}}
        };
    }

    return world;
}
