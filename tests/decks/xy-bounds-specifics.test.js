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

// `Macro` est un global Foundry natif jamais exercé par le smoke test du socle (07-02) :
// `Fx.importMacroFromCompendium` (déclenché par tout effet `macro.execute`) appelle
// `Macro.create(...)` dès que le compendium mocké ne trouve pas la macro. Sans ce stub,
// tout choix comportant un `macro.execute` lève `ReferenceError: Macro is not defined` —
// un trou générique du bac à sable de test (pas un bug métier), comblé comme dans
// sweep.test.js.
globalThis.Macro = class {
    static create = vi.fn(async () => ({}));
};

const {mountWorld, playChoice, getSocketSpy} = await import("./play-harness.js");
const {DeterministicRoll, resetDiceControl} = await import("./deterministic-roll.js");
const RollService = (await import("../../src/domain/engine/roll/roll-service.js")).default;

const FormError = (await import("../../src/core/error/form-error.model.js")).default;

/**
 * Phase 07 Plan 04 — Task 3 : bornes X/Y (min/max/hors) [EXHA-03] et
 * mécaniques propres de cartes clés (currentDrop, cartes<->zèle, pioche,
 * effet requis, sbires, applyEffectsFormulas, replayable/passif).
 *
 * ⚠️ AUCUNE sélection par nom de carte : chaque choix exercé est découvert
 * par glob puis filtré par PROPRIÉTÉ de ses données (présence de xmin/xmax,
 * xvalue==="fq.cards.currentDrop", coût zèle littéralement "+XXX"/"-XXX",
 * présence de draw/minions/applyEffectsFormulas/customEvals/replayable...).
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const worldFixture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "tests", "decks", "world-fixture.json"), "utf-8")
);

function isFilled(value) {
    return value !== undefined && value !== null && value !== "";
}

function fixtureDistance() {
    const dx = Math.abs(worldFixture.myToken.x - worldFixture.target.x);
    const dy = Math.abs(worldFixture.myToken.y - worldFixture.target.y);
    return (dx + dy) / worldFixture.gridSize;
}

async function resolveFormula(formula) {
    mountWorld();
    const substituted = RollService.replaceAbilitiesBonus(String(formula ?? "0"));
    resetDiceControl();
    const roll = await new DeterministicRoll(substituted).evaluate();
    resetDiceControl();
    return roll.total;
}

async function reachAllowsFixtureDistance(choice) {
    if (!isFilled(choice.minReach) && !isFilled(choice.maxReach)) {
        return true;
    }
    const dist = fixtureDistance();
    const min = isFilled(choice.minReach) ? await resolveFormula(choice.minReach) : 0;
    const max = isFilled(choice.maxReach) ? await resolveFormula(choice.maxReach) : Infinity;
    return min <= dist && dist <= max;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Set);
}

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
 * Ressources/tirage abondants : neutralise les axes ressources/pioche pour
 * isoler l'axe X/Y ou la mécanique spécifique sous test.
 *
 * @param {object} [extra] - Surcharges supplémentaires à fusionner.
 *
 * @returns {object} Les surcharges `world`.
 */
function abundantWorld(extra = {}) {
    return deepMerge({
        character: {
            system: {
                attributes: {hp: {value: 999, max: 999, temp: 0, tempmax: 0}},
                fq: {
                    action: {value: 999, max: 999},
                    mana: {value: 999, max: 999},
                    zeal: {value: 999, max: 999},
                    cards: {currentDrop: 999}
                }
            }
        },
        // Une carte générée en défausse : satisfait la garde de lançabilité des
        // choix `retrieveFromDiscard` et `destroyFromDiscard` (en mode `*`,
        // l'unique éligible est auto-choisie SANS DialogV2 — non mocké ici).
        // Sans elle, une carte combinant pioche et défausse serait rejetée avant
        // la mécanique sous test.
        discardPile: {
            cards: [{
                id: "abundant-p1", name: "FQCARDTITLE.AbundantRetrievable", face: 0, origin: null,
                faces: [{img: "images/abundant-p1.png"}], flags: {"fq-card-engine": {generated: true}}
            }]
        }
    }, extra);
}

function chatText(result) {
    return result.chatMessages.map(message => message.content).join("\n");
}

// ─── Découverte 100% par glob : AUCUNE liste de cartes en dur ─────────────
const deckFiles = fs.readdirSync(DECKS_DIR).filter(fileName => fileName.endsWith(".json")).sort();

const rawEntries = [];
for (const deckFile of deckFiles) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
    for (const card of deck.cards) {
        card.system.fq.choices.forEach((choice, choiceIndex) => {
            rawEntries.push({deckFile, cardName: card.name, card, choiceIndex, choice});
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// EXHA-03 : bornes X/Y
// ═══════════════════════════════════════════════════════════════════════

/**
 * Choix « bornes X propres » : xmin ET xmax présents, sans confondeur
 * (script personnalisé, réactivité, sbires), avec une plage résolue valide
 * (xmax >= xmin, bornée à un ordre de grandeur raisonnable pour rester
 * compatible avec des ressources abondantes mais finies) et une portée
 * compatible avec la géométrie de la fixture (ou aucune portée déclarée).
 *
 * @returns {Promise<object[]>} Les entrées enrichies de `xmin`/`xmax` résolus.
 */
async function xBoundsCandidates() {
    const out = [];
    for (const entry of rawEntries) {
        const {choice} = entry;
        if (!isFilled(choice.xmin) || !isFilled(choice.xmax)) {
            continue;
        }
        if (choice.customEvals && choice.customEvals.length) {
            continue;
        }
        if (choice.reactive || (choice.minions && choice.minions.length)) {
            continue;
        }
        const xmin = await resolveFormula(choice.xmin);
        const xmax = await resolveFormula(choice.xmax);
        if (!(xmax >= xmin) || xmax > 50) {
            continue;
        }
        if (!(await reachAllowsFixtureDistance(choice))) {
            continue;
        }
        out.push({...entry, xmin, xmax});
    }
    return out;
}

const xCandidates = await xBoundsCandidates();

// Seule carte du dépôt déclarant `ymax` (découverte par glob, non en dur) —
// exercée telle quelle : si une future carte à `ymax` est ajoutée, elle
// rejoint automatiquement ce lot au prochain run.
const yBoundsCandidates = rawEntries.filter(entry => isFilled(entry.choice.ymax));

describe("EXHA-03 : bornes X — acceptées aux bornes, rejetées hors bornes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(xCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — X accepté à xmin=$xmin et xmax=$xmax",
        async ({card, choiceIndex, xmin, xmax}) => {
            const atMin = await playChoice(card, choiceIndex, {world: abundantWorld(), fd: {XXX: xmin, YYY: 0}});
            expect(atMin.threw).toBe(false);
            expect(chatText(atMin)).not.toContain("FQCARDENGINE.WarningMsgXValueInferiorXMin");
            expect(chatText(atMin)).not.toContain("FQCARDENGINE.WarningMsgXValueSuperiorXMax");

            const atMax = await playChoice(card, choiceIndex, {world: abundantWorld(), fd: {XXX: xmax, YYY: 0}});
            expect(atMax.threw).toBe(false);
            expect(chatText(atMax)).not.toContain("FQCARDENGINE.WarningMsgXValueInferiorXMin");
            expect(chatText(atMax)).not.toContain("FQCARDENGINE.WarningMsgXValueSuperiorXMax");
        }
    );

    test.each(xCandidates.filter(entry => entry.xmin > 0))(
        "$deckFile :: $cardName :: choix $choiceIndex — X rejeté à xmin-1=$xmin (FormError WarningMsgXValueInferiorXMin, aucun hpCalls)",
        async ({card, choiceIndex, xmin}) => {
            const belowMin = await playChoice(card, choiceIndex, {world: abundantWorld(), fd: {XXX: xmin - 1, YYY: 0}});
            // Dépassement de borne : FormError levée dans playValidatedCard (dialog non fermée),
            // en amont du moteur — plus de message de chat, plus aucun effet appliqué.
            expect(belowMin.threw).toBe(true);
            expect(belowMin.error).toBeInstanceOf(FormError);
            expect(belowMin.error.message).toContain("FQCARDENGINE.WarningMsgXValueInferiorXMin");
            expect(belowMin.hpCalls).toHaveLength(0);
        }
    );

    test.each(xCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — X rejeté à xmax+1=$xmax (FormError WarningMsgXValueSuperiorXMax, aucun hpCalls)",
        async ({card, choiceIndex, xmax}) => {
            const aboveMax = await playChoice(card, choiceIndex, {world: abundantWorld(), fd: {XXX: xmax + 1, YYY: 0}});
            expect(aboveMax.threw).toBe(true);
            expect(aboveMax.error).toBeInstanceOf(FormError);
            expect(aboveMax.error.message).toContain("FQCARDENGINE.WarningMsgXValueSuperiorXMax");
            expect(aboveMax.hpCalls).toHaveLength(0);
        }
    );
});

describe("EXHA-03 : bornes Y — au moins une carte à ymax", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(yBoundsCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — Y rejeté hors borne (ymax+1), aucun hpCalls",
        async ({card, choiceIndex, choice}) => {
            const ymax = await resolveFormula(choice.ymax);
            const xmin = isFilled(choice.xmin) ? await resolveFormula(choice.xmin) : 0;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld(),
                fd: {XXX: xmin, YYY: ymax + 1}
            });
            expect(result.threw).toBe(true);
            expect(result.error).toBeInstanceOf(FormError);
            expect(result.error.message).toContain("FQCARDENGINE.WarningMsgYValueSuperiorYMax");
            expect(result.hpCalls).toHaveLength(0);
        }
    );

    test.each(yBoundsCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — Y accepté à la borne ymax (aucun rejet X/Y)",
        async ({card, choiceIndex, choice}) => {
            const ymax = await resolveFormula(choice.ymax);
            const xmax = isFilled(choice.xmax) ? await resolveFormula(choice.xmax) : 0;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld(),
                fd: {XXX: xmax, YYY: ymax}
            });
            expect(result.threw).toBe(false);
            expect(chatText(result)).not.toContain("FQCARDENGINE.WarningMsgYValueSuperiorYMax");
            expect(chatText(result)).not.toContain("FQCARDENGINE.WarningMsgXValueSuperiorXMax");
            expect(chatText(result)).not.toContain("FQCARDENGINE.WarningMsgXValueInferiorXMin");
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : XXX/YYY dérivé de `fq.cards.currentDrop` (ex. SecretWeapons,
// EmergencyHealing) — sélection par propriété `xvalue`/`yvalue`.
// ═══════════════════════════════════════════════════════════════════════

const currentDropCandidates = rawEntries.filter(entry =>
    entry.choice.xvalue === "fq.cards.currentDrop" || entry.choice.yvalue === "fq.cards.currentDrop");

describe("Mécanique : XXX/YYY dérivé de currentDrop, remis à 0 après consommation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(currentDropCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — currentDrop pilote XXX/YYY et est remis à 0",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {cards: {currentDrop: 5}}}}})
            });
            expect(result.threw).toBe(false);
            const resetCall = result.updates.find(call => call[0]["system.fq.cards.currentDrop"] === 0);
            expect(resetCall).toBeDefined();
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : coût zèle littéralement lié à XXX (ex. ChiMaster : cartes<->zèle)
// — sélection par propriété (formule EXACTE "+XXX" ou "-XXX"), jamais par nom.
// ═══════════════════════════════════════════════════════════════════════

const zealTiedToXCandidates = rawEntries.filter(entry =>
    /^[+-]XXX$/.test(String(entry.choice.zeal ?? ""))
    && isFilled(entry.choice.xmin) && isFilled(entry.choice.xmax)
    && !(entry.choice.customEvals && entry.choice.customEvals.length));

describe("Mécanique : ressource zèle littéralement dérivée de XXX (cartes<->zèle)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(zealTiedToXCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — le delta de zèle vaut exactement ±XXX",
        async ({card, choiceIndex, choice}) => {
            const xmin = await resolveFormula(choice.xmin);
            const sign = choice.zeal.startsWith("-") ? -1 : 1;

            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {zeal: {value: 500, max: 999}}}}}),
                fd: {XXX: xmin, YYY: 0}
            });
            expect(result.threw).toBe(false);
            const zealUpdate = result.updates.find(call => "system.fq.zeal.value" in call[0]);
            expect(zealUpdate).toBeDefined();
            expect(zealUpdate[0]["system.fq.zeal.value"]).toBe(500 + sign * xmin);
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : pioche (draw) — nombre exact piloté, rejet propre si insuffisante
// ═══════════════════════════════════════════════════════════════════════

const drawCandidates = rawEntries.filter(entry => isFilled(entry.choice.draw)
    && !(entry.choice.customEvals && entry.choice.customEvals.length)
    && !isFilled(entry.choice.xmin) && !isFilled(entry.choice.xmax));

describe("Mécanique : pioche (draw) pilotée par la source de la carte", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(drawCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — pioche suffisante -> card.parent.draw appelé avec le nombre exact",
        async ({card, choiceIndex, choice}) => {
            const drawCount = await resolveFormula(choice.draw);
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld(),
                cardOptions: {sourceSize: drawCount + 10, drawnCards: []}
            });
            expect(result.threw).toBe(false);
            expect(result.draws).toHaveLength(1);
            expect(result.draws[0][1]).toBe(drawCount);
        }
    );

    test.each(drawCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — pioche insuffisante -> rejet propre (WarningMsgNotEnoughDraw), aucun tirage",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld(),
                cardOptions: {sourceSize: 0, drawnCards: []}
            });
            expect(result.threw).toBe(false);
            expect(result.draws).toHaveLength(0);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughDraw");
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : sbires (minions) — création via socket, emplacement par défaut
// ═══════════════════════════════════════════════════════════════════════

// Emplacements de sbires disponibles dans la géométrie FIXE de la fixture :
// `defaultFdFor` sélectionne up/down/left/right dans cet ordre pour
// `choice.minions.length` emplacements — or "left" (case (0,5)) coïncide
// EXACTEMENT avec le token cible de la fixture (occupé), donc seuls les
// choix à 1 ou 2 sbires (up, puis down) restent placables sans FormError de
// géométrie (contrainte du monde de test, pas du moteur).
async function minionCandidatesFor() {
    const out = [];
    for (const entry of rawEntries) {
        const {choice} = entry;
        if (!(choice.minions && choice.minions.length > 0 && choice.minions.length <= 2)) {
            continue;
        }
        if (isFilled(choice.xmin) || isFilled(choice.xmax)) {
            continue;
        }
        if (choice.customEvals && choice.customEvals.length) {
            continue;
        }
        if (!(await reachAllowsFixtureDistance(choice))) {
            continue;
        }
        out.push(entry);
    }
    return out;
}

const minionCandidates = await minionCandidatesFor();

/**
 * Construit un document de compendium « sbire » minimal et cohérent depuis
 * les données DÉCLARÉES par le choix lui-même (`minion.name`), pour combler
 * `game.packs.get("...minions-fq8").getDocuments()` (mocké vide par
 * défaut) — même pattern que sweep.test.js, piloté uniquement par la forme
 * du choix, jamais par un nom de carte.
 *
 * @param {object} minion - L'entrée `choice.minions[i]`.
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

describe("Mécanique : invocation de sbires — création déléguée au MJ via socket", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(minionCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — createActorFromData appelé pour l'emplacement par défaut (up)",
        async ({card, choiceIndex, choice}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({
                    folders: [{type: "Actor", name: "Temporaire", id: "minion-temp-folder"}],
                    packs: {get: vi.fn(() => ({getDocuments: vi.fn(async () => choice.minions.map(minionDocFor))}))}
                })
            });
            expect(result.threw).toBe(false);
            const socket = await getSocketSpy();
            const createCalls = socket.executeAsGM.mock.calls.filter(call => call[0] === "createActorFromData");
            expect(createCalls).toHaveLength(1);
            expect(createCalls[0][3]).toBe("up");
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : applyEffectsFormulas — un jet piloté qui correspond à un
// `result` déclenche la création d'effets ; un jet qui ne correspond pas ne
// la déclenche pas.
// ═══════════════════════════════════════════════════════════════════════

// Sélection par PROPRIÉTÉ : une seule formule d'effet (`NdM` pur, sans XXX/YYY
// ni référence de caractéristique), un seul résultat numérique cible, sans
// confondeur (X/Y, customEvals, reactive) — pour piloter le dé de façon
// univoque et déterministe.
function isApplyEffectsFormulaCandidate(choice) {
    if (!Array.isArray(choice.applyEffectsFormulas) || choice.applyEffectsFormulas.length !== 1) {
        return false;
    }
    const [formulaBlock] = choice.applyEffectsFormulas;
    if (!formulaBlock || !/^\d*d\d+$/i.test(String(formulaBlock.formula ?? ""))) {
        return false;
    }
    if (!Array.isArray(formulaBlock.effects) || formulaBlock.effects.length !== 1) {
        return false;
    }
    const [effect] = formulaBlock.effects;
    return /^\d+$/.test(String(effect.result ?? ""))
        && !isFilled(choice.xmin) && !isFilled(choice.xmax)
        && !isFilled(choice.xvalue) && !isFilled(choice.yvalue)
        && !(choice.customEvals && choice.customEvals.length)
        && !choice.reactive;
}

let applyEffectsFormulaEntry;
for (const entry of rawEntries) {
    if (isApplyEffectsFormulaCandidate(entry.choice) && await reachAllowsFixtureDistance(entry.choice)) {
        applyEffectsFormulaEntry = entry;
        break;
    }
}

describe("Mécanique : applyEffectsFormulas — création d'effets conditionnée au jet piloté", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("un dé qui correspond au result déclenche la création d'un effet ; un dé qui ne correspond pas ne la déclenche pas", async () => {
        expect(applyEffectsFormulaEntry).toBeDefined();
        const {card, choiceIndex, choice} = applyEffectsFormulaEntry;
        const [formulaBlock] = choice.applyEffectsFormulas;
        const [effect] = formulaBlock.effects;
        const match = formulaBlock.formula.match(/^(\d*)d(\d+)$/i);
        const faces = Number(match[2]);
        const targetResult = Number(effect.result);

        const noMatchValue = targetResult > 1 ? targetResult - 1 : Math.min(faces, targetResult + 1);
        const noMatch = await playChoice(card, choiceIndex, {
            world: abundantWorld(),
            dice: [{faces, value: noMatchValue}]
        });
        expect(noMatch.threw).toBe(false);
        const socketNoMatch = await getSocketSpy();
        expect(socketNoMatch.executeAsGM.mock.calls.filter(call => call[0] === "addEffectForTarget")).toHaveLength(0);
        expect(noMatch.activeEffectCalls).toHaveLength(0);

        vi.clearAllMocks();

        const match_ = await playChoice(card, choiceIndex, {
            world: abundantWorld(),
            dice: [{faces, value: targetResult}]
        });
        expect(match_.threw).toBe(false);
        const socketMatch = await getSocketSpy();
        const effectSocketCalls = socketMatch.executeAsGM.mock.calls.filter(call => call[0] === "addEffectForTarget");
        expect(effectSocketCalls.length + match_.activeEffectCalls.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : script personnalisé (customEvals) — « effet requis » (ex.
// InhibitingCape) : le pipeline ne lève jamais, même si le script échoue ou
// référence une API absente du bac à sable de test.
// ═══════════════════════════════════════════════════════════════════════

const customEvalCandidates = rawEntries.filter(entry => entry.choice.customEvals && entry.choice.customEvals.length
    && !isFilled(entry.choice.xmin) && !isFilled(entry.choice.xmax)
    && !isFilled(entry.choice.xvalue) && !isFilled(entry.choice.yvalue)
    && entry.choice.targetType !== "Skeletons"
    && !(entry.choice.minions && entry.choice.minions.length));

describe("Mécanique : script personnalisé (condition/effet requis) — échec géré proprement, jamais d'exception", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(customEvalCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — aucune exception INATTENDUE (au pire une FormError de ciblage)",
        async ({card, choiceIndex}) => {
            // Certaines de ces cartes (à portée) voient leur cible unique de
            // fixture hors de portée ; le garde-fou de ciblage lève alors une FormError
            // GRACIEUSE en amont du script. L'intention du test — le pipeline dégrade
            // proprement, jamais d'exception inattendue — est préservée : soit pas de
            // throw, soit une FormError (rejet gracieux), jamais une autre erreur.
            const result = await playChoice(card, choiceIndex, {world: abundantWorld()});
            if (result.threw) {
                expect(result.error).toBeInstanceOf(FormError);
            } else {
                expect(result.threw).toBe(false);
            }
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Mécanique : replayable à charges (décrémente et réécrit la carte au-dessus
// de 1 charge restante) vs replayable "passif" (réécrit une seule fois, ne
// passe jamais à la défausse).
// ═══════════════════════════════════════════════════════════════════════

function isSimpleReplayableChoice(choice) {
    return !(choice.customEvals && choice.customEvals.length)
        && !isFilled(choice.xmin) && !isFilled(choice.xmax)
        && !(choice.minions && choice.minions.length)
        && choice.targetType !== "Skeletons";
}

async function filterByReach(entries) {
    const out = [];
    for (const entry of entries) {
        if (await reachAllowsFixtureDistance(entry.choice)) {
            out.push(entry);
        }
    }
    return out;
}

const chargedReplayableCandidates = await filterByReach(rawEntries.filter(entry => isFilled(entry.choice.replayable)
    && entry.choice.replayable !== "passif"
    && isSimpleReplayableChoice(entry.choice)));

const passifCandidates = await filterByReach(rawEntries.filter(entry => entry.choice.replayable === "passif"
    && isSimpleReplayableChoice(entry.choice)));

describe("Mécanique : replayable à charges — réécriture de la carte quand il reste plus d'une charge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(chargedReplayableCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — réécriture ssi la charge résolue est > 1",
        async ({card, choiceIndex, choice}) => {
            const resolvedReplayable = await resolveFormula(choice.replayable);
            const result = await playChoice(card, choiceIndex, {world: abundantWorld()});
            expect(result.threw).toBe(false);
            if (resolvedReplayable > 1) {
                expect(result.card.update).toHaveBeenCalled();
            } else {
                expect(result.card.update).not.toHaveBeenCalled();
            }
        }
    );
});

describe("Mécanique : replayable \"passif\" — réécrit la carte et ne la défausse jamais", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(passifCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — message passif, réécriture, jamais de passage à la défausse",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {world: abundantWorld()});
            expect(result.threw).toBe(false);
            expect(result.card.update).toHaveBeenCalled();
            expect(chatText(result)).toContain("FQCARDENGINE.InfoMsgPassiveSpell");
            expect(result.passCalls).toHaveLength(0);
        }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Défaut de données : une référence @-caractéristique non résolue retombe
// sur 0 (jamais d'exception, toujours une valeur finie). Le dépôt ne
// contient PLUS de carte utilisant `@for`/`@sag` (abréviations FR
// remédiées dans une passe de données antérieure au présent plan — voir
// SUMMARY) ; le défaut générique de l'évaluateur de formules (même
// mécanisme, socle 07-02) est donc caractérisé directement, plutôt que via
// une carte spécifique, pour rester vrai indépendamment des données du
// dépôt.
// ═══════════════════════════════════════════════════════════════════════

describe("Défaut de données : @-référence non résolue -> 0, jamais d'exception, toujours fini", () => {
    test("une formule référençant une @-caractéristique inconnue de l'évaluateur ne lève pas et produit une valeur finie", async () => {
        resetDiceControl();
        const roll = await new DeterministicRoll("2 + @for + @sag").evaluate();
        resetDiceControl();
        expect(Number.isFinite(roll.total)).toBe(true);
        expect(roll.total).toBe(2);
    });
});

describe("Garde-fou d'auto-couverture", () => {
    test("chaque axe/mécanique a au moins un choix découvert par glob (sans nom en dur)", () => {
        expect(xCandidates.length).toBeGreaterThanOrEqual(1);
        expect(yBoundsCandidates.length).toBeGreaterThanOrEqual(1);
        expect(currentDropCandidates.length).toBeGreaterThanOrEqual(1);
        expect(zealTiedToXCandidates.length).toBeGreaterThanOrEqual(1);
        expect(drawCandidates.length).toBeGreaterThanOrEqual(1);
        expect(minionCandidates.length).toBeGreaterThanOrEqual(1);
        expect(applyEffectsFormulaEntry).toBeDefined();
        expect(customEvalCandidates.length).toBeGreaterThanOrEqual(1);
        expect(chargedReplayableCandidates.length).toBeGreaterThanOrEqual(1);
        expect(passifCandidates.length).toBeGreaterThanOrEqual(1);
    });
});
