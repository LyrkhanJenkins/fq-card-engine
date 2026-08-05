import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le commentaire JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/board/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/socket-lib.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

// `Macro` est un global Foundry natif jamais exercé par le smoke test du socle (07-02) :
// `FxUtils.importMacroFromCompendium` (déclenché par tout effet `macro.execute`, ex.
// PersistAura sur les cartes squelette) appelle `Macro.create(...)` dès que le
// compendium mocké ne trouve pas la macro. Sans ce stub, tout choix comportant un
// `macro.execute` lève `ReferenceError: Macro is not defined` — un trou générique du
// bac à sable de test (pas un bug métier), comblé exactement comme dans sweep.test.js.
globalThis.Macro = class {
    static create = vi.fn(async () => ({}));
};

const {mountWorld, playChoice} = await import("./play-harness.js");
const {DeterministicRoll, resetDiceControl} = await import("./deterministic-roll.js");
const FQUtils = (await import("../../src/domain/utils/fq-utils.js")).default;

/**
 * Phase 07 Plan 04 — Task 2 : coûts/ressources consommés + rejets ressources
 * insuffisantes [EXHA-01] ; ciblage/portée + hors-portée [EXHA-04].
 *
 * ⚠️ AUCUNE sélection par nom de carte : chaque choix exercé est découvert par
 * glob puis filtré par PROPRIÉTÉ de ses données (présence d'un coût
 * action/mana/zeal/hp/drop, présence d'une portée, absence de confondeurs).
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

/**
 * Résout une formule de carte exactement comme le pipeline réel (mêmes
 * substitutions @-caractéristiques + même évaluateur générique de dés que le
 * `globalThis.Roll` installé, voir tests/decks/deterministic-roll.js).
 *
 * @param {string|number} formula - La formule brute du choix.
 *
 * @returns {Promise<number>} Le total résolu.
 */
async function resolveFormula(formula) {
    mountWorld();
    const substituted = FQUtils.replaceAbilitiesBonus(String(formula ?? "0"));
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

/**
 * Choix « simple » : aucun confondeur (script personnalisé, formules
 * d'effets, réactivité, variables X/Y, sbires, ciblage non-défaut) — isole
 * l'axe ressources/portée testé ici.
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {boolean} True si le choix est éligible.
 */
function isSimpleChoice(choice) {
    return !(choice.customEvals && choice.customEvals.length)
        && !(choice.applyEffectsFormulas && choice.applyEffectsFormulas.length)
        && !choice.reactive
        && !isFilled(choice.xmin) && !isFilled(choice.xmax)
        && !isFilled(choice.ymin) && !isFilled(choice.ymax)
        && !isFilled(choice.xvalue) && !isFilled(choice.yvalue)
        && !(choice.minions && choice.minions.length)
        && (!isFilled(choice.targetType) || choice.targetType === "Default");
}

function chatText(result) {
    return result.chatMessages.map(message => message.content).join("\n");
}

/**
 * Ressources abondantes sur toutes les jauges — neutralise les autres coûts
 * quand on isole une seule ressource sous test.
 *
 * @param {object} [extra] - Surcharges supplémentaires à fusionner.
 *
 * @returns {object} Les surcharges `world`.
 */
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Set);
}

/**
 * Fusion récursive simple (les objets sont fusionnés clé à clé, tout le reste
 * est remplacé tel quel) — nécessaire ici car un simple spread au premier
 * niveau écraserait ENTIÈREMENT la clé `character` dès qu'un appelant fournit
 * lui-même une surcharge `character` partielle (ex. seulement `fq.mana`),
 * perdant au passage les valeurs abondantes des AUTRES ressources.
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
        }
    }, extra);
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

const simpleReachCompatible = [];
for (const entry of rawEntries) {
    if (isSimpleChoice(entry.choice) && await reachAllowsFixtureDistance(entry.choice)) {
        simpleReachCompatible.push(entry);
    }
}

/**
 * Construit, pour un champ de coût donné (`"action"`/`"mana"`/`"zeal"`/`"hp"`),
 * les choix « simples, à portée compatible » dont le coût résolu (via la
 * fixture) est non nul, enrichis de leur coût résolu.
 *
 * @param {string} field - Le champ de coût (`"action"`, `"mana"`, `"zeal"`, `"hp"`).
 *
 * @returns {Promise<object[]>} Les entrées enrichies de `resolvedCost`.
 */
async function resourceCandidates(field) {
    const out = [];
    for (const entry of simpleReachCompatible) {
        if (!isFilled(entry.choice[field])) {
            continue;
        }
        const resolvedCost = await resolveFormula(entry.choice[field]);
        if (resolvedCost === 0) {
            continue;
        }
        out.push({...entry, resolvedCost});
    }
    return out;
}

const manaCosts = await resourceCandidates("mana");
const actionCosts = await resourceCandidates("action");
const zealCosts = await resourceCandidates("zeal");
const hpCosts = await resourceCandidates("hp");

const negativeMana = manaCosts.filter(entry => entry.resolvedCost < 0);
const positiveMana = manaCosts.filter(entry => entry.resolvedCost > 0);
const negativeAction = actionCosts.filter(entry => entry.resolvedCost < 0);
const positiveAction = actionCosts.filter(entry => entry.resolvedCost > 0);
const negativeZeal = zealCosts.filter(entry => entry.resolvedCost < 0);
const positiveZeal = zealCosts.filter(entry => entry.resolvedCost > 0);
const negativeHp = hpCosts.filter(entry => entry.resolvedCost < 0);

const dropCandidates = simpleReachCompatible.filter(entry => isFilled(entry.choice.drop));

const reachCandidatesInRange = simpleReachCompatible.filter(entry =>
    isFilled(entry.choice.minReach) || isFilled(entry.choice.maxReach));

const rawReachCandidates = rawEntries.filter(entry =>
    isSimpleChoice(entry.choice) && (isFilled(entry.choice.minReach) || isFilled(entry.choice.maxReach)));

const outOfRangeCandidates = [];
for (const entry of rawReachCandidates) {
    if (!(await reachAllowsFixtureDistance(entry.choice))) {
        outOfRangeCandidates.push(entry);
    }
}

const noNbTargetsReachCandidates = reachCandidatesInRange.filter(entry => !isFilled(entry.choice.nbTargets));

const skeletonEntries = rawEntries.filter(entry => entry.choice.targetType === "Skeletons"
    && !(entry.choice.customEvals && entry.choice.customEvals.length)
    && !isFilled(entry.choice.xmin) && !isFilled(entry.choice.xmax)
    && !isFilled(entry.choice.ymin) && !isFilled(entry.choice.ymax)
    && !(entry.choice.minions && entry.choice.minions.length));

/**
 * Construit un token/cible synthétique, dans la géométrie de la fixture,
 * réutilisable pour simuler plusieurs cibles simultanées.
 *
 * @param {string} suffix - Un suffixe pour distinguer l'id du token.
 *
 * @returns {object} Une cible utilisable dans `game.user.targets`.
 */
function targetLike(suffix) {
    return {
        id: worldFixture.target.tokenId + suffix,
        actor: {
            _id: worldFixture.target.actorId + suffix,
            id: worldFixture.target.actorId + suffix,
            name: worldFixture.target.name,
            system: worldFixture.target.system
        },
        document: {
            name: worldFixture.target.name,
            actorId: worldFixture.target.actorId + suffix,
            x: worldFixture.target.x,
            y: worldFixture.target.y,
            width: worldFixture.target.width,
            height: worldFixture.target.height
        }
    };
}

describe("EXHA-01 : consommation exacte des coûts (ressources suffisantes)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(negativeMana)(
        "$deckFile :: $cardName :: choix $choiceIndex — mana consommé exactement (coût=$resolvedCost)",
        async ({card, choiceIndex, resolvedCost}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {mana: {value: 50, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            const manaUpdate = result.updates.find(call => "system.fq.mana.value" in call[0]);
            expect(manaUpdate).toBeDefined();
            expect(manaUpdate[0]["system.fq.mana.value"]).toBe(50 + resolvedCost);
        }
    );

    test.each(negativeAction)(
        "$deckFile :: $cardName :: choix $choiceIndex — action consommée exactement (coût=$resolvedCost)",
        async ({card, choiceIndex, resolvedCost}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {action: {value: 50, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            const actionUpdate = result.updates.find(call => "system.fq.action.value" in call[0]);
            expect(actionUpdate).toBeDefined();
            expect(actionUpdate[0]["system.fq.action.value"]).toBe(50 + resolvedCost);
        }
    );

    test.each(negativeZeal)(
        "$deckFile :: $cardName :: choix $choiceIndex — zèle consommé exactement (coût=$resolvedCost)",
        async ({card, choiceIndex, resolvedCost}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {zeal: {value: 50, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            const zealUpdate = result.updates.find(call => "system.fq.zeal.value" in call[0]);
            expect(zealUpdate).toBeDefined();
            expect(zealUpdate[0]["system.fq.zeal.value"]).toBe(50 + resolvedCost);
        }
    );

    test.each(negativeHp)(
        "$deckFile :: $cardName :: choix $choiceIndex — PV consommés exactement (coût=$resolvedCost)",
        async ({card, choiceIndex, resolvedCost}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {attributes: {hp: {value: 50, max: 200, temp: 0, tempmax: 0}}}}})
            });
            expect(result.threw).toBe(false);
            const hpUpdate = result.updates.find(call => "system.attributes.hp.value" in call[0]);
            expect(hpUpdate).toBeDefined();
            expect(hpUpdate[0]["system.attributes.hp.value"]).toBe(50 + resolvedCost);
        }
    );
});

describe("EXHA-01 : plafonnement au maximum (mana/zeal) vs non-plafonnement (action)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("mana : un gain est plafonné au maximum", async () => {
        expect(positiveMana.length).toBeGreaterThanOrEqual(1);
        const {card, choiceIndex, resolvedCost} = positiveMana[0];
        const result = await playChoice(card, choiceIndex, {
            world: abundantWorld({character: {system: {fq: {mana: {value: 9, max: 10}}}}})
        });
        expect(result.threw).toBe(false);
        const manaUpdate = result.updates.find(call => "system.fq.mana.value" in call[0]);
        expect(manaUpdate).toBeDefined();
        const naive = 9 + resolvedCost;
        expect(manaUpdate[0]["system.fq.mana.value"]).toBe(naive > 10 ? 10 : naive);
    });

    test("zèle : un gain est plafonné au maximum", async () => {
        expect(positiveZeal.length).toBeGreaterThanOrEqual(1);
        const {card, choiceIndex, resolvedCost} = positiveZeal[0];
        const result = await playChoice(card, choiceIndex, {
            world: abundantWorld({character: {system: {fq: {zeal: {value: 9, max: 10}}}}})
        });
        expect(result.threw).toBe(false);
        const zealUpdate = result.updates.find(call => "system.fq.zeal.value" in call[0]);
        expect(zealUpdate).toBeDefined();
        const naive = 9 + resolvedCost;
        expect(zealUpdate[0]["system.fq.zeal.value"]).toBe(naive > 10 ? 10 : naive);
    });

    test("action : un gain N'EST PAS plafonné au maximum (seule ressource à pouvoir le dépasser)", async () => {
        expect(positiveAction.length).toBeGreaterThanOrEqual(1);
        const {card, choiceIndex, resolvedCost} = positiveAction[0];
        const result = await playChoice(card, choiceIndex, {
            world: abundantWorld({character: {system: {fq: {action: {value: 9, max: 10}}}}})
        });
        expect(result.threw).toBe(false);
        const actionUpdate = result.updates.find(call => "system.fq.action.value" in call[0]);
        expect(actionUpdate).toBeDefined();
        expect(actionUpdate[0]["system.fq.action.value"]).toBe(9 + resolvedCost);
        expect(actionUpdate[0]["system.fq.action.value"]).toBeGreaterThan(10);
    });
});

describe("EXHA-01 : rejet propre quand une ressource est insuffisante", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(negativeMana)(
        "$deckFile :: $cardName :: choix $choiceIndex — mana insuffisant -> rejet, aucun hpCalls",
        async ({card, choiceIndex, resolvedCost}) => {
            const insufficientValue = Math.abs(resolvedCost) - 1;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {mana: {value: insufficientValue, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughMana");
            expect(result.updates.some(call => "system.fq.mana.value" in call[0])).toBe(false);
        }
    );

    test.each(negativeAction)(
        "$deckFile :: $cardName :: choix $choiceIndex — action insuffisante -> rejet, aucun hpCalls",
        async ({card, choiceIndex, resolvedCost}) => {
            const insufficientValue = Math.abs(resolvedCost) - 1;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {action: {value: insufficientValue, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughAction");
        }
    );

    test.each(negativeZeal)(
        "$deckFile :: $cardName :: choix $choiceIndex — zèle insuffisant -> rejet, aucun hpCalls",
        async ({card, choiceIndex, resolvedCost}) => {
            const insufficientValue = Math.abs(resolvedCost) - 1;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {fq: {zeal: {value: insufficientValue, max: 200}}}}})
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughZeal");
        }
    );

    test.each(negativeHp)(
        "$deckFile :: $cardName :: choix $choiceIndex — PV insuffisants -> rejet, aucun hpCalls",
        async ({card, choiceIndex, resolvedCost}) => {
            const insufficientValue = Math.abs(resolvedCost) - 1;
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({character: {system: {attributes: {hp: {value: insufficientValue, max: 200, temp: 0, tempmax: 0}}}}})
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughHp");
        }
    );
});

describe("EXHA-01 : la défausse (drop) n'est vérifiée qu'en combat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(dropCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — hors combat : pas de vérification du solde de défausse",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({
                    character: {system: {fq: {cards: {currentDrop: 0}}}},
                    combat: null
                })
            });
            expect(result.threw).toBe(false);
            expect(chatText(result)).not.toContain("FQCARDENGINE.WarningMsgNotEnoughDrop");
        }
    );

    test.each(dropCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — en combat, solde de défausse insuffisant : rejet propre",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({
                    character: {system: {fq: {cards: {currentDrop: 0}}}},
                    combat: {
                        round: 1,
                        combatant: {actor: {id: worldFixture.character.id}},
                        combatants: [{actorId: worldFixture.character.id}],
                        flags: {fq: {logs: []}}
                    }
                })
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNotEnoughDrop");
        }
    );
});

describe("EXHA-04 : ciblage/portée", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(reachCandidatesInRange)(
        "$deckFile :: $cardName :: choix $choiceIndex — cible à portée : jeu accepté (pas de rejet de portée)",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {world: abundantWorld()});
            expect(result.threw).toBe(false);
            expect(chatText(result)).not.toContain("FQCARDENGINE.WarningMsgCantReachTarget");
        }
    );

    test.each(outOfRangeCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — cible hors portée : rejet propre, aucun hpCalls",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {world: abundantWorld()});
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgCantReachTarget");
        }
    );

    test("aucune cible sélectionnée -> rejet propre (WarningMsgNoTarget)", async () => {
        expect(reachCandidatesInRange.length).toBeGreaterThanOrEqual(1);
        const {card, choiceIndex} = reachCandidatesInRange[0];
        const result = await playChoice(card, choiceIndex, {
            // NOTE : `mountWorld` (play-harness.js) fusionne `world.user.targets` via son
            // propre `deepMerge`, qui ne distingue pas `Set` d'un objet simple — fusionner
            // un `Set` source dans un `Set` de base y perd son itérabilité (`Object.keys`
            // d'un `Set` est vide). On passe donc un TABLEAU (remplacé tel quel par ce
            // `deepMerge`, jamais fusionné clé à clé) — `FqConstants.myTargets` fait
            // `[...game.user.targets]`, qui fonctionne aussi bien sur un tableau.
            world: abundantWorld({user: {targets: []}})
        });
        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(0);
        expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNoTarget");
    });

    test.each(noNbTargetsReachCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — plusieurs cibles sans nbTargets -> rejet propre (WarningMsgNoMultipleTarget)",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({user: {targets: [targetLike("-a"), targetLike("-b")]}})
            });
            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
            expect(chatText(result)).toContain("FQCARDENGINE.WarningMsgNoMultipleTarget");
        }
    );
});

describe("EXHA-04 : ciblage squelette (targetType Skeletons)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(skeletonEntries)(
        "$deckFile :: $cardName :: choix $choiceIndex — ciblage squelette via la fixture (combat, token squelette)",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: abundantWorld({
                    folders: [{type: "Actor", name: "Temporaire", id: "skeleton-temp-folder"}],
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
                                    object: {id: "skeleton-my-object-token", name: worldFixture.character.name}
                                },
                                {
                                    actorId: worldFixture.target.actorId,
                                    name: "Skeleton lvl 1",
                                    x: worldFixture.target.x,
                                    y: worldFixture.target.y,
                                    width: worldFixture.target.width,
                                    height: worldFixture.target.height,
                                    object: {id: "skeleton-target-token", name: "Skeleton lvl 1"}
                                }
                            ]
                        }
                    },
                    combat: {
                        round: 1,
                        combatant: {actor: {id: worldFixture.character.id}},
                        combatants: [{tokenId: "skeleton-target-token"}, {actorId: worldFixture.character.id}],
                        flags: {fq: {logs: []}}
                    },
                    packs: {get: vi.fn(() => ({getDocuments: vi.fn(async () => [])}))}
                })
            });
            expect(result.threw).toBe(false);
        }
    );
});

describe("Garde-fou d'auto-couverture", () => {
    test("au moins un choix par axe a été découvert par glob (sans nom en dur)", () => {
        expect(negativeMana.length).toBeGreaterThanOrEqual(1);
        expect(negativeAction.length).toBeGreaterThanOrEqual(1);
        expect(negativeZeal.length).toBeGreaterThanOrEqual(1);
        expect(dropCandidates.length).toBeGreaterThanOrEqual(1);
        expect(reachCandidatesInRange.length).toBeGreaterThanOrEqual(1);
        expect(outOfRangeCandidates.length).toBeGreaterThanOrEqual(1);
        expect(skeletonEntries.length).toBeGreaterThanOrEqual(1);
    });
});
