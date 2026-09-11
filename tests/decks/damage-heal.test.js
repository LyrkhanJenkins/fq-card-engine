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

const {mountWorld, playChoice} = await import("./play-harness.js");
const Damage = (await import("../../src/domain/engine/roll/damage.js")).default;
const {DECKS_DIR, worldFixture, isFilled, resolveFormula, reachAllowsFixtureDistance} = await import("./corpus-helpers.js");

/**
 * Phase 07 Plan 04 — Task 1 (tracer) : dégâts/soins chiffrés par cible via de
 * vraies cartes du dépôt, dés pilotés pour des valeurs EXACTES [EXHA-02].
 *
 * ⚠️ AUCUNE sélection par nom de carte : chaque choix exercé est découvert par
 * glob puis filtré par PROPRIÉTÉ de ses données (présence de `damage`/`heal`,
 * absence de confondeurs comme `customEvals`/`applyEffectsFormulas`/`xmin`/
 * `xmax`/`ymin`/`ymax`/`xvalue`/`yvalue`/`minions`/`reactive`, ciblage par
 * défaut, portée compatible avec la géométrie de la fixture). Une carte future
 * partageant ces propriétés est couverte automatiquement au prochain run.
 */

/**
 * Un choix est « axe simple » (dégâts/soins) s'il ne comporte aucun
 * confondeur susceptible de perturber la matrice critique/esquive : pas de
 * variables X/Y, pas de script personnalisé, pas de formules d'effets, pas de
 * réactivité (nécessiterait un combat), pas de sbires, ciblage par défaut.
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 * @param {string} field  - Le champ à exiger rempli (`"damage"` ou `"heal"`).
 *
 * @returns {boolean} True si le choix est éligible à la matrice.
 */
function isSimpleAxisChoice(choice, field) {
    const formula = choice[field];
    return isFilled(formula)
        && !/XXX|YYY/.test(String(formula))
        // Cartes à jeton d'arme (@wpnR/@wpnM) : dégâts dépendants de l'arme équipée
        // et injouables sans elle → hors matrice déterministe (couvertes par les
        // tests dédiés tests/{engine,decks}/weapon-damage*.test.js).
        && !/@wpn[RM]/.test(String(choice.damage ?? ""))
        && !(choice.customEvals && choice.customEvals.length)
        && !(choice.applyEffectsFormulas && choice.applyEffectsFormulas.length)
        && !choice.reactive
        && !isFilled(choice.xmin) && !isFilled(choice.xmax)
        && !isFilled(choice.ymin) && !isFilled(choice.ymax)
        && !isFilled(choice.xvalue) && !isFilled(choice.yvalue)
        && !(choice.minions && choice.minions.length)
        && (!isFilled(choice.targetType) || choice.targetType === "Default")
        && Number(choice.bonusCrit || 0) > -100
        && Number(choice.bonusEva || 0) > -100;
}

/**
 * Ressources abondantes (action/mana/zeal/PV) : neutralise l'axe ressources
 * (EXHA-01, traité en 07-04-Task2) pour isoler l'axe dégâts/soins/critique/
 * esquive testé ici.
 *
 * @param {object} [extra] - Surcharges `world` additionnelles à fusionner.
 *
 * @returns {object} Les surcharges `world` à transmettre à `playChoice`.
 */
function abundantResourcesWorld(extra = {}) {
    return {
        character: {
            system: {
                attributes: {hp: {value: 999, max: 999, temp: 0, tempmax: 0}},
                fq: {
                    action: {value: 999, max: 999},
                    mana: {value: 999, max: 999},
                    zeal: {value: 999, max: 999}
                }
            }
        },
        ...extra
    };
}

// ─── Découverte 100% par glob : AUCUNE liste de cartes en dur ─────────────
const deckFiles = fs.readdirSync(DECKS_DIR).filter(fileName => fileName.endsWith(".json")).sort();

const rawDamageEntries = [];
const rawHealEntries = [];
for (const deckFile of deckFiles) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, deckFile), "utf-8"));
    for (const card of deck.cards) {
        card.system.fq.choices.forEach((choice, choiceIndex) => {
            if (isSimpleAxisChoice(choice, "damage")) {
                rawDamageEntries.push({deckFile, cardName: card.name, card, choiceIndex, choice});
            }
            if (isSimpleAxisChoice(choice, "heal")) {
                rawHealEntries.push({deckFile, cardName: card.name, card, choiceIndex, choice});
            }
        });
    }
}

const damageCandidates = [];
for (const entry of rawDamageEntries) {
    if (await reachAllowsFixtureDistance(entry.choice)) {
        damageCandidates.push(entry);
    }
}
const healCandidates = [];
for (const entry of rawHealEntries) {
    if (await reachAllowsFixtureDistance(entry.choice)) {
        healCandidates.push(entry);
    }
}

const actorCritical = Number(worldFixture.character.system.fq.attributes.critical);
const targetEvasion = Number(worldFixture.target.system.fq.attributes.evasion);

/**
 * Seuils de réussite (1d20) pour le critique de dégâts et l'esquive de la
 * cible, dérivés des formules RÉELLES du moteur (`damage-utils.js`) et des
 * valeurs de la fixture — jamais un nombre magique en dur.
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {{crit: number, eva: number}} Les seuils de réussite.
 */
function damageThresholds(choice) {
    return {
        crit: 21 - actorCritical - Number(choice.bonusCrit || 0),
        eva: 21 - targetEvasion - Number(choice.bonusEva || 0)
    };
}

/**
 * Les d20 imposés d'un jeu de carte, dans l'ordre où le moteur les jette : le
 * critique, puis le dé d'ATTAQUE d'un choix qui en demande un (jeté une seule
 * fois pour la carte), puis l'esquive de la cible. La cible de la fixture n'a
 * pas de classe d'armure : l'attaque ne la protège jamais, mais son dé est
 * bien jeté et doit figurer dans la séquence, sans quoi il avalerait celui de
 * l'esquive. Les sauvegardes n'entrent pas ici : un choix de zone ou à effets
 * n'est pas éligible à la matrice.
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 * @param {number} crit   - Le d20 du critique.
 * @param {number} eva    - Le d20 de l'esquive.
 *
 * @returns {Array<{faces: number, value: number}>} Les dés pilotés.
 */
function d20s(choice, crit, eva) {
    const attack = choice.hitType === "attack" ? [{faces: 20, value: 20}] : [];
    return [{faces: 20, value: crit}, ...attack, {faces: 20, value: eva}];
}

/**
 * Seuil de réussite (1d20) pour le critique de soin.
 *
 * @param {object} choice - Le choix (contenu) de la carte.
 *
 * @returns {number} Le seuil de réussite.
 */
function healCritThreshold(choice) {
    return 21 - actorCritical - Number(choice.bonusCrit || 0);
}

describe("Dégâts chiffrés : valeur de base exacte hors critique/esquive (EXHA-02)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(damageCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — dégâts = valeur de base exacte",
        async ({card, choiceIndex, choice}) => {
            const expectedBase = await resolveFormula(choice.damage);
            const {crit, eva} = damageThresholds(choice);

            const result = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: d20s(choice, Math.max(1, crit - 1), Math.max(1, eva - 1))
            });

            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(1);
            expect(result.hpCalls[0].type).toBe("damageFQ");
            expect(Number.isFinite(result.hpCalls[0].value)).toBe(true);
            expect(result.hpCalls[0].value).toBe(expectedBase);
        }
    );
});

describe("Dégâts chiffrés : matrice critique/esquive (EXHA-02)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(damageCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — critique double, esquive fait demi-dégâts, critique+esquive repasse la valeur de base",
        async ({card, choiceIndex, choice}) => {
            const expectedBase = await resolveFormula(choice.damage);
            const {crit, eva} = damageThresholds(choice);

            const critOnly = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: d20s(choice, crit, Math.max(1, eva - 1))
            });
            expect(critOnly.hpCalls).toHaveLength(1);
            expect(critOnly.hpCalls[0].value).toBe(expectedBase * 2);

            // `playChoice` dérive son résultat des appels CUMULÉS de l'espion socket
            // (`socket.executeAsGM.mock.calls`) : sans ce nettoyage, un second appel
            // dans le même `test` verrait aussi les hpCalls du premier.
            vi.clearAllMocks();

            const evaOnly = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: d20s(choice, Math.max(1, crit - 1), eva)
            });
            expect(evaOnly.hpCalls).toHaveLength(1);
            // Une seule défense réussie fait descendre d'un cran sur l'échelle
            // `0 → ½ → normal → ×2` : l'esquive protège, elle n'annule plus.
            expect(evaOnly.hpCalls[0].value).toBe(Math.floor(expectedBase / 2));

            vi.clearAllMocks();

            const critAndEva = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: d20s(choice, crit, eva)
            });
            expect(critAndEva.hpCalls).toHaveLength(1);
            expect(critAndEva.hpCalls[0].value).toBe(expectedBase);
        }
    );
});

describe("Dégâts : bizarrerie caractérisée — ciblage sur soi-même (structure réelle du moteur, NON corrigée)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Comportement VOULU (pas un bug) : dans `Damage.addCriticalEvasionToDamage`,
    // tout le bloc qui pousse le résultat dans `damagesArray` est imbriqué dans
    // `if (targetActor._id !== actor._id)`. En auto-ciblage, ce bloc est sauté :
    // aucune entrée n'est poussée, donc `hpCalls` reste VIDE (on ne se cible pas
    // soi-même avec un sort de dégâts).
    test.each(damageCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — cible = lanceur -> aucun hpCalls (quel que soit le dé)",
        async ({card, choiceIndex}) => {
            const result = await playChoice(card, choiceIndex, {
                world: {
                    ...abundantResourcesWorld(),
                    targetActor: {_id: worldFixture.character.id, id: worldFixture.character.id}
                },
                dice: [{faces: 20, value: 20}, {faces: 20, value: 1}]
            });

            expect(result.threw).toBe(false);
            expect(result.hpCalls).toHaveLength(0);
        }
    );
});

describe("Soins chiffrés : valeur de base exacte, doublée en critique (EXHA-02)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each(healCandidates)(
        "$deckFile :: $cardName :: choix $choiceIndex — soin de base hors critique, doublé en critique",
        async ({card, choiceIndex, choice}) => {
            const expectedBase = await resolveFormula(choice.heal);
            const critThreshold = healCritThreshold(choice);

            const noCrit = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: [{faces: 20, value: Math.max(1, critThreshold - 1)}]
            });
            expect(noCrit.threw).toBe(false);
            expect(noCrit.hpCalls).toHaveLength(1);
            expect(noCrit.hpCalls[0].type).toBe("healFQ");
            expect(noCrit.hpCalls[0].value).toBe(expectedBase);

            vi.clearAllMocks();

            const crit = await playChoice(card, choiceIndex, {
                world: abundantResourcesWorld(),
                dice: [{faces: 20, value: critThreshold}]
            });
            expect(crit.hpCalls).toHaveLength(1);
            expect(crit.hpCalls[0].value).toBe(expectedBase * 2);
        }
    );
});

describe("Application directe des PV (socket MJ, EXHA-02) — PV temporaires et plafond de soin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Quand les PV temporaires absorbent ENTIÈREMENT le coup
    // (`temp > value`), `value` est remis à 0 → les PV normaux ne sont PAS
    // touchés (plus de double comptage). Un seul appel `update` est émis.
    test("dégâts : quand les PV temporaires absorbent tout le coup, seuls les PV temporaires sont réduits (pas de double comptage)", () => {
        const update = vi.fn();
        const targetActor = {system: {attributes: {hp: {value: 20, max: 20, temp: 10, tempmax: 0}}}, update};
        mountWorld({canvas: {tokens: {get: vi.fn(() => ({actor: targetActor}))}}});

        Damage.applyActorHpModification("target-token", 6, "damageFQ");

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenNthCalledWith(1, {"system.attributes.hp.temp": 4});
    });

    test("dégâts : quand les PV temporaires sont insuffisants, ils sont consommés entièrement et le reliquat s'applique aux PV normaux", () => {
        const update = vi.fn();
        const targetActor = {system: {attributes: {hp: {value: 20, max: 20, temp: 4, tempmax: 0}}}, update};
        mountWorld({canvas: {tokens: {get: vi.fn(() => ({actor: targetActor}))}}});

        Damage.applyActorHpModification("target-token", 6, "damageFQ");

        expect(update).toHaveBeenCalledTimes(2);
        expect(update).toHaveBeenNthCalledWith(1, {"system.attributes.hp.temp": 0});
        expect(update).toHaveBeenNthCalledWith(2, {"system.attributes.hp.value": 18});
    });

    test("dégâts : sans PV temporaires, les PV normaux sont bornés à 0 minimum", () => {
        const update = vi.fn();
        const targetActor = {system: {attributes: {hp: {value: 20, max: 20, temp: 0, tempmax: 0}}}, update};
        mountWorld({canvas: {tokens: {get: vi.fn(() => ({actor: targetActor}))}}});

        Damage.applyActorHpModification("target-token", 25, "damageFQ");

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith({"system.attributes.hp.value": 0});
    });

    test("soins : plafonné à max + tempmax", () => {
        const update = vi.fn();
        const targetActor = {system: {attributes: {hp: {value: 18, max: 20, temp: 0, tempmax: 5}}}, update};
        mountWorld({canvas: {tokens: {get: vi.fn(() => ({actor: targetActor}))}}});

        Damage.applyActorHpModification("target-token", 10, "healFQ");

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith({"system.attributes.hp.value": 25});
    });

    test("soins : sous le plafond, la valeur totale est appliquée sans écrêtage", () => {
        const update = vi.fn();
        const targetActor = {system: {attributes: {hp: {value: 10, max: 20, temp: 0, tempmax: 0}}}, update};
        mountWorld({canvas: {tokens: {get: vi.fn(() => ({actor: targetActor}))}}});

        Damage.applyActorHpModification("target-token", 5, "healFQ");

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith({"system.attributes.hp.value": 15});
    });
});

describe("Garde-fou d'auto-couverture", () => {
    test("au moins un choix dégâts et un choix soin sont couverts (découverte par glob, sans nom en dur)", () => {
        expect(damageCandidates.length).toBeGreaterThanOrEqual(1);
        expect(healCandidates.length).toBeGreaterThanOrEqual(1);
    });
});
