import {vi} from "vitest";
import fs from "fs";
import path from "path";
import {forceDie, installDeterministicRoll, pushDie, resetDiceControl} from "./deterministic-roll.js";
import {defaultFdFor} from "./fd-table.js";

/**
 * Socle du driver de test exhaustif (07-02) : monte un `game` Foundry cohérent
 * depuis `tests/decks/world-fixture.json`, enrobe une carte JSON brute en
 * espions, et appelle le VRAI `FqCardEngineModule.playValidatedCard` pour
 * laisser tourner tout le pipeline réel (`callBackplayCard` -> `applyCardEffect`),
 * avec les briques Foundry mockées en espions (socket MJ, `ChatMessage`,
 * `ActiveEffect`, `card.parent.draw`) et un `Roll` déterministe pilotable
 * (`tests/decks/deterministic-roll-service.js`).
 *
 * IMPORTANT — `vi.mock` est hissé PAR FICHIER (limitation Vitest) : chaque fichier
 * de test qui importe ce harnais DOIT déclarer, tout en haut du fichier et AVANT
 * tout import, exactement les mocks listés dans `REQUIRED_MOCKS` ci-dessous
 * (copier-coller depuis `tests/decks/harness.smoke.test.js`) :
 *
 *   vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
 *   vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
 *   vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
 *   vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
 *   vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
 *   vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
 *   vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));
 *
 * Puis `globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};`
 * avant tout appel à `ensureEngineLoaded`/`playChoice` (voir `harness.smoke.test.js`).
 *
 * `playChoice` réinstalle `global.Roll` (déterministe) et remet à zéro les files
 * de dés pilotés à CHAQUE appel — après le `beforeEach` de `tests/setup.js`
 * (l'ordre d'enregistrement Vitest = l'ordre d'exécution), donc sans fuite entre
 * suites ni entre appels successifs au sein d'un même test.
 */

// Liste informative des mocks requis (à déclarer soi-même dans le fichier de test,
// vi.mock ne pouvant pas être appelé indirectement depuis un module importé).
export const REQUIRED_MOCKS = [
    "../../src/domain/interface/sheet/actor/fq-character-sheet.js",
    "../../src/domain/interface/sheet/actor/fq-npc-sheet.js",
    "../../src/domain/interface/sheet/items/fq-item-sheet.js",
    "../../src/domain/interface/sheet/cards/fq-cards-sheet.js",
    "../../src/domain/interface/sheet/cards/fq-card-sheet.js",
    "../../src/domain/interface/window/hand-board.js",
    "../../src/hook/integration/socketlib.hook.js"
];

let enginePromise = null;
let worldFixtureCache = null;
let lastDiscardPile = null;

/**
 * Importe dynamiquement `src/init-engine.js` (une seule fois par process) pour
 * peupler `window.FqCardEngineModule`, après avoir défini `globalThis.socketlib`
 * si besoin. Doit être appelée APRÈS que le fichier de test ait déclaré les
 * `vi.mock` listés dans `REQUIRED_MOCKS`.
 *
 * @returns {Promise<void>}
 */
export async function ensureEngineLoaded() {
    if (!globalThis.socketlib) {
        globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};
    }
    if (!enginePromise) {
        enginePromise = import("../../src/init-engine.js");
    }
    await enginePromise;
}

/**
 * Renvoie l'objet `socket` du module mocké `src/hook/integration/socketlib.hook.js` (l'espion
 * `executeAsGM` assertable). Suppose que le fichier de test appelant a bien
 * déclaré `vi.mock("../../src/hook/integration/socketlib.hook.js", ...)`.
 *
 * @returns {Promise<{executeAsGM: import("vitest").Mock}>} L'objet socket mocké.
 */
export async function getSocketSpy() {
    const mod = await import("../../src/hook/integration/socketlib.hook.js");
    return mod.socket;
}

/**
 * Réinstalle le `Roll` déterministe et vide les files de dés pilotés. Appelée
 * automatiquement par `playChoice` ; exposée séparément pour les fichiers de
 * test qui veulent contrôler ce cycle depuis leur propre `beforeEach`.
 *
 * @returns {void}
 */
export function resetHarness() {
    installDeterministicRoll();
    resetDiceControl();
}

/**
 * Charge (et met en cache) `tests/decks/world-fixture.json`, puis renvoie une
 * COPIE profonde à chaque appel : chaque monde monté doit pouvoir être muté
 * (espions, overrides) sans affecter les autres tests (le module JSON n'est
 * chargé qu'une fois par process Node).
 *
 * @returns {object} Une copie profonde de la fixture monde.
 */
function loadWorldFixture() {
    if (!worldFixtureCache) {
        const fixturePath = path.join(process.cwd(), "tests", "decks", "world-fixture.json");
        worldFixtureCache = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    }
    return JSON.parse(JSON.stringify(worldFixtureCache));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fusionne récursivement `source` dans `target` (les objets simples sont
 * fusionnés clé à clé, les tableaux et primitives sont remplacés tels quels).
 *
 * @param {object} target - L'objet de base.
 * @param {object} source - Les valeurs à fusionner par-dessus.
 *
 * @returns {object} Le résultat fusionné (nouvel objet, `target` non muté).
 */
function deepMerge(target, source) {
    if (!isPlainObject(source)) {
        return source;
    }
    const result = isPlainObject(target) ? {...target} : {};
    for (const key of Object.keys(source)) {
        result[key] = isPlainObject(source[key]) && isPlainObject(result[key])
            ? deepMerge(result[key], source[key])
            : source[key];
    }
    return result;
}

/**
 * Monte un `game` Foundry cohérent depuis `world-fixture.json` : un personnage
 * complet (hp/abilities/fq), un token à (5,5), une cible unique à (0,5) — grille
 * de taille 5, distance 1 — et une pile de défausse. `overrides.character` et
 * `overrides.targetActor` sont fusionnés en profondeur dans le personnage/la
 * cible ; `overrides.combat` positionne `game.combat` (`null` par défaut, hors
 * combat) ; tout autre champ de premier niveau est fusionné dans `game`.
 *
 * @param {object} [overrides] - Surcharges (voir description).
 *
 * @returns {object} Le `game` monté (aussi assigné à `globalThis.game`).
 */
export function mountWorld(overrides = {}) {
    const {character: characterOverrides, targetActor: targetActorOverrides, combat, ...gameOverrides} = overrides;
    const fixture = loadWorldFixture();

    let character = {
        _id: fixture.character.id,
        id: fixture.character.id,
        name: fixture.character.name,
        system: fixture.character.system
    };
    character = deepMerge(character, characterOverrides ?? {});
    character.update = vi.fn().mockResolvedValue(null);

    let targetActor = {
        _id: fixture.target.actorId,
        id: fixture.target.actorId,
        name: fixture.target.name,
        system: fixture.target.system
    };
    targetActor = deepMerge(targetActor, targetActorOverrides ?? {});

    const target = {
        id: fixture.target.tokenId,
        actor: targetActor,
        document: {
            name: fixture.target.name,
            actorId: fixture.target.actorId,
            x: fixture.target.x,
            y: fixture.target.y,
            width: fixture.target.width,
            height: fixture.target.height
        }
    };

    const myToken = {
        actorId: character.id,
        x: fixture.myToken.x, y: fixture.myToken.y,
        width: fixture.myToken.width, height: fixture.myToken.height
    };
    const targetToken = {
        actorId: fixture.target.actorId,
        x: fixture.target.x, y: fixture.target.y,
        width: fixture.target.width, height: fixture.target.height
    };

    // ActiveEffect : espion global assertable (createEffectsFromData/playApplyEffectsFormulas).
    globalThis.ActiveEffect = {implementation: {create: vi.fn()}};

    lastDiscardPile = {
        id: fixture.discardPile.id,
        system: {fq: {type: "PILE"}},
        testUserPermission: vi.fn(() => true)
    };

    const base = {
        canvas: {scene: {dimensions: {size: fixture.gridSize}, tokens: [myToken, targetToken]}},
        scenes: [{active: true, tokens: [myToken, targetToken]}],
        folders: [],
        modules: new Map(), // "sequencer" absent -> FX Sequencer inactif par défaut (documenté)
        macros: {getName: vi.fn(() => null)},
        dice3d: {waitFor3DAnimationByMessageID: vi.fn(async () => {})},
        i18n: {
            localize: vi.fn(str => str),
            format: vi.fn((str, args) => `${str} ${JSON.stringify(args)}`)
        },
        settings: {get: vi.fn(() => undefined), register: vi.fn()},
        packs: {get: vi.fn(() => ({getDocuments: vi.fn(async () => [])}))},
        userId: "harness-user",
        user: {
            character,
            isGM: false,
            color: "#ff0000",
            targets: new Set([target])
        },
        combat: combat ?? null,
        cards: []
    };

    globalThis.game = deepMerge(base, gameOverrides);
    return globalThis.game;
}

/**
 * Enrobe une carte JSON brute (telle que trouvée dans
 * `packs/_source/decks-pattern-fq8/*.json`) en objet « carte » espionnable,
 * consommable par le pipeline réel (`callBackplayCard`/`applyCardEffect`).
 *
 * @param {object} rawCard - L'entrée carte brute du deck JSON (`deck.cards[i]`).
 * @param {object} [options] - Options d'enrobage.
 * @param {number} [options.sourceSize=40] - Taille simulée du deck source (pioche).
 * @param {string[]} [options.drawnCards=[]] - Cartes déjà piochées côté source.
 *
 * @returns {object} La carte enrobée (espions `update`/`flip`/`parent.draw`).
 */
export function wrapCard(rawCard, {sourceSize = 40, drawnCards = []} = {}) {
    return {
        _id: rawCard._id,
        id: rawCard._id,
        name: rawCard.name,
        face: rawCard.face ?? 0,
        faces: rawCard.faces,
        back: rawCard.back ?? {img: ""},
        origin: {name: "Harnais"},
        flags: rawCard.flags ?? {},
        system: rawCard.system,
        update: vi.fn().mockResolvedValue(null),
        flip: vi.fn().mockResolvedValue(null),
        parent: {draw: vi.fn().mockResolvedValue([])},
        source: {cards: {size: sourceSize}, drawnCards}
    };
}

/**
 * Applique une liste de dés pilotés avant l'exécution : un nombre pousse une
 * valeur générique (`pushDie`), un objet `{faces, value}` cible une taille de
 * face précise (`forceDie`).
 *
 * @param {Array<number|{faces: number, value: number}>} [dice] - Les dés à piloter.
 *
 * @returns {void}
 */
function applyDiceControl(dice) {
    if (!dice) {
        return;
    }
    for (const entry of dice) {
        if (typeof entry === "number") {
            pushDie(entry);
        } else if (entry && typeof entry === "object") {
            forceDie(entry.faces, entry.value);
        }
    }
}

/**
 * Joue un choix d'une carte brute de bout en bout via le VRAI
 * `FqCardEngineModule.playValidatedCard` : réinstalle le `Roll` déterministe,
 * monte le monde, enrobe la carte, reproduit le préambule de `playDialog`
 * (firstChoice/cardContents/hasVariables), construit un `fd` (défaut auto via
 * `defaultFdFor`, surchargeable), puis délègue au pipeline réel et renvoie un
 * résultat riche extrait des espions.
 *
 * @param {object} rawCard      - L'entrée carte brute du deck JSON.
 * @param {number} [choiceIndex=0] - L'indice du choix à jouer dans `card.system.fq.choices`.
 * @param {object} [opts] - Options.
 * @param {object} [opts.world] - Surcharges transmises à `mountWorld` (`character`, `targetActor`, `combat`…).
 * @param {object} [opts.fd]    - Surcharge des données de formulaire (par-dessus le défaut auto).
 * @param {Array<number|{faces: number, value: number}>} [opts.dice] - Dés pilotés (voir `applyDiceControl`).
 * @param {object} [opts.cardOptions] - Options transmises à `wrapCard`.
 *
 * @returns {Promise<object>} Le résultat riche : `{threw, error, hpCalls, logCalls,
 *          effectsCreated, activeEffectCalls, chatMessages, draws, passCalls,
 *          updates, card, cardContent}`.
 */
export async function playChoice(rawCard, choiceIndex = 0, opts = {}) {
    await ensureEngineLoaded();
    resetHarness();
    applyDiceControl(opts.dice);
    mountWorld(opts.world);

    const card = wrapCard(rawCard, opts.cardOptions);
    const initCardContents = card.system.fq.choices;
    const cardContents = JSON.parse(JSON.stringify(initCardContents));
    const firstChoice = cardContents[0];
    const cardContent = cardContents[choiceIndex];

    const currentCards = {pass: vi.fn().mockResolvedValue(null)};
    const to = lastDiscardPile;

    const firstChoiceString = JSON.stringify(firstChoice);
    const hasXVariable = !firstChoice.xvalue && !!firstChoiceString.match(/XXX/);
    const hasYVariable = !firstChoice.yvalue && !!firstChoiceString.match(/YYY/);
    const hasVariables = hasXVariable || hasYVariable;

    const fd = {
        ...defaultFdFor(rawCard, cardContent),
        to: to.id,
        ...opts.fd
    };

    const socket = await getSocketSpy();

    let threw = false;
    let error = null;
    try {
        await window.FqCardEngineModule.playValidatedCard(to, fd, cardContent, {
            firstChoice, cardContents, hasVariables, initCardContents, currentCards, card
        });
    } catch (e) {
        threw = true;
        error = e;
    }

    const socketCalls = socket.executeAsGM.mock.calls;

    return {
        threw,
        error,
        hpCalls: socketCalls
            .filter(call => call[0] === "applyActorHpModification")
            .map(call => ({targetTokenId: call[1], value: call[2], type: call[3]})),
        logCalls: socketCalls
            .filter(call => call[0] === "logCardPlayed")
            .map(call => ({resultArray: call[1], cardContent: call[2]})),
        effectsCreated: socketCalls
            .filter(call => call[0] === "addEffectForTarget")
            .map(call => ({effect: call[1], targetId: call[2]})),
        activeEffectCalls: globalThis.ActiveEffect.implementation.create.mock.calls,
        chatMessages: globalThis.ChatMessage.create.mock.calls.map(call => call[0]),
        draws: card.parent.draw.mock.calls,
        passCalls: currentCards.pass.mock.calls,
        updates: globalThis.game.user.character.update.mock.calls,
        card,
        cardContent
    };
}
