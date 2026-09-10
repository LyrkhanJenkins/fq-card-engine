import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

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
const {installMacroStub} = await import("./corpus-helpers.js");
installMacroStub();
const {makeCard, makeChoice} = await import("../factories.js");
const {OriginFQEffectLabel} = await import("../../src/domain/constants.js");

/**
 * Avantage, désavantage et défenses tombées, joués avec de VRAIES cartes par le
 * pipeline réel (`playChoice` → `playValidatedCard`) : du choix de carte jusqu'aux
 * dégâts envoyés au MJ et au message de chat.
 *
 * Le monde de la fixture place le lanceur à UNE case de la cible : il est donc au
 * contact, ce qui compte pour une cible à terre. Le lanceur a 3 en Force et pas
 * de bonus de maîtrise : M = 3. Une carte d'attaque oppose `d20 + 3` à la CA de
 * la cible ; une carte de sauvegarde lui impose un DD de `8 + 3 = 11`.
 *
 * Toutes les cartes infligent 10 : 10 quand la cible ne se protège pas, 5 quand
 * elle se protège. Le critique et l'esquive sont mis hors de portée partout, sauf
 * là où c'est l'absence d'esquive qu'on veut voir. Chaque d20 est imposé : un dé
 * de trop dans la file prouve qu'il n'a pas été jeté.
 */

const ATTACK = {hitType: "attack", hitSource: "ability", hitAbility: "str"};
const DEX_SAVE = {hitType: "save", hitSource: "ability", hitAbility: "str", saveAbility: "dex"};

/**
 * Une carte à un seul choix qui inflige 10 points de dégâts.
 *
 * @param {object} [overrides] - Les champs du choix à changer.
 *
 * @returns {object} La carte.
 */
function damageCard(overrides = {}) {
    return makeCard({
        name: "FQCARDTITLE.HitAdvantageHarness",
        faces: [{name: "", img: "", text: ""}],
        system: {
            fq: {
                maxSameCard: 1, class: "neutral", level: 1, isInnate: false,
                choices: [makeChoice({
                    damage: "10", minReach: "1", maxReach: "6",
                    bonusCrit: -999, bonusEva: -9999,
                    ...overrides
                })]
            }
        }
    });
}

/**
 * Une carte qui pose une donnée d'effet sur sa cible.
 *
 * @param {object[]} data - Les données d'effet.
 *
 * @returns {object} La carte.
 */
function effectCard(data) {
    return makeCard({
        name: "FQCARDTITLE.ConditionHarness",
        faces: [{name: "", img: "", text: ""}],
        system: {
            fq: {
                maxSameCard: 1, class: "neutral", level: 1, isInnate: false,
                choices: [makeChoice({
                    minReach: "1", maxReach: "6",
                    applyEffectsFormulas: [{
                        title: "T", formula: "1",
                        effects: [{result: "1", self: false, data, messages: []}]
                    }]
                })]
            }
        }
    });
}

/**
 * Les d20 imposés, dans l'ordre où la résolution les jette.
 *
 * @param {...number} values - Les faces.
 *
 * @returns {object[]} Les dés pilotés.
 */
const d20 = (...values) => values.map(value => ({faces: 20, value}));

/**
 * Joue une carte et rend les dégâts envoyés à la cible et le message de chat.
 *
 * @param {object} card    - La carte.
 * @param {object} [world] - Les surcharges du monde (`character`, `targetActor`).
 * @param {object[]} [dice] - Les dés imposés.
 *
 * @returns {Promise<{damage: ?number, chat: string, result: object}>} Le résultat.
 */
async function play(card, world = {}, dice = []) {
    // Les espions du socket MJ et du chat CUMULENT leurs appels : sans cette
    // remise à zéro, une seconde partie dans le même test relirait la première.
    vi.clearAllMocks();
    const result = await playChoice(card, 0, {world, dice});
    const damage = result.hpCalls.find(call => call.type === "damageFQ")?.value ?? null;
    const chat = result.chatMessages.map(message => message.content ?? "").join("\n");
    return {damage, chat, result};
}

/**
 * La cible de la fixture avec sa CA, ses conditions et le reste.
 *
 * @param {object} [options] - Ce qui la distingue.
 *
 * @returns {object} La surcharge de `targetActor`.
 */
function target({ac = 16, statuses = [], immune, abilities, evasion} = {}) {
    const system = {attributes: {ac: {value: ac}}};
    if (abilities) {
        system.abilities = abilities;
    }
    if (immune) {
        system.traits = {ci: {value: new Set(immune)}};
    }
    if (evasion !== undefined) {
        system.fq = {attributes: {evasion}};
    }
    return {statuses: new Set(statuses), system};
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("cartes d'attaque — le jet de référence", () => {

    test("cible ordinaire : un seul d20 ; 4 + 3 = 7 contre CA 16, la cible se protège", async () => {
        const {damage, result} = await play(damageCard(ATTACK), {targetActor: target()}, d20(4, 15));

        expect(result.threw).toBe(false);
        expect(damage).toBe(5);
    });

    test("cible ordinaire : 15 + 3 = 18 contre CA 16, la cible est touchée", async () => {
        const {damage} = await play(damageCard(ATTACK), {targetActor: target()}, d20(15));

        expect(damage).toBe(10);
    });
});

describe("cartes d'attaque — conditions de la cible", () => {

    test("à terre AU CONTACT : avantage — les dés 4 puis 15, le 15 compte", async () => {
        const {damage, chat} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["prone"]})}, d20(4, 15));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.RollModeAdvantage (4 | 15)");
    });

    test("entravée : avantage", async () => {
        const {damage} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["restrained"]})}, d20(4, 15));

        expect(damage).toBe(10);
    });

    test("aveuglée : avantage", async () => {
        const {damage} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["blinded"]})}, d20(4, 15));

        expect(damage).toBe(10);
    });

    test("invisible : désavantage — les dés 15 puis 4, le 4 compte", async () => {
        const {damage, chat} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["invisible"]})}, d20(15, 4));

        expect(damage).toBe(5);
        expect(chat).toContain("FQCARDENGINE.RollModeDisadvantage (15 | 4)");
    });

    test("immunisée à la condition « à terre » : jet normal, le premier dé compte", async () => {
        const {damage} = await play(damageCard(ATTACK),
            {targetActor: target({statuses: ["prone"], immune: ["prone"]})}, d20(4, 15));

        expect(damage).toBe(5);
    });

    test.each(["charmed", "deafened", "frightened", "grappled", "poisoned"])(
        "%s : aucun effet sur le jet qui la vise", async condition => {
            const {damage} = await play(damageCard(ATTACK), {targetActor: target({statuses: [condition]})}, d20(4, 15));

            expect(damage).toBe(5);
        });
});

describe("cartes d'attaque — « Garde brisée » et « En élan »", () => {

    test("cible en « Garde brisée » : avantage — les dés 4 puis 15, le 15 compte", async () => {
        const {damage, chat} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["fqExposed"]})}, d20(4, 15));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.StatusExposed");
    });

    test("lanceur « En élan » : avantage", async () => {
        const {damage, chat} = await play(damageCard(ATTACK),
            {character: {statuses: new Set(["fqEmpowered"])}, targetActor: target()}, d20(4, 15));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.StatusEmpowered");
    });

    test("le jet d'attaque demande au MJ de consommer ces effets, sur le lanceur et la cible visée", async () => {
        const {result} = await play(damageCard(ATTACK), {targetActor: target({statuses: ["fqExposed"]})}, d20(4, 15));

        const {socket} = await import("../../src/hook/integration/socketlib.hook.js");
        const call = socket.executeAsGM.mock.calls.find(entry => entry[0] === "consumeAttackEffects");
        expect(call).toBeDefined();
        expect(call[2]).toHaveLength(1);
        expect(result.threw).toBe(false);
    });

    test("une carte de SAUVEGARDE ne consomme rien : ce n'est pas un jet d'attaque", async () => {
        await play(damageCard(DEX_SAVE), {targetActor: target({abilities: {dex: {save: {value: 2}}}})}, d20(9));

        const {socket} = await import("../../src/hook/integration/socketlib.hook.js");
        expect(socket.executeAsGM.mock.calls.map(entry => entry[0])).not.toContain("consumeAttackEffects");
    });
});

describe("cartes d'attaque — conditions et équipement du lanceur", () => {

    test("lanceur empoisonné : désavantage", async () => {
        const {damage} = await play(damageCard(ATTACK),
            {character: {statuses: new Set(["poisoned"])}, targetActor: target()}, d20(15, 4));

        expect(damage).toBe(5);
    });

    test("lanceur effrayé : désavantage", async () => {
        const {damage} = await play(damageCard(ATTACK),
            {character: {statuses: new Set(["frightened"])}, targetActor: target()}, d20(15, 4));

        expect(damage).toBe(5);
    });

    test("lanceur invisible : avantage", async () => {
        const {damage} = await play(damageCard(ATTACK),
            {character: {statuses: new Set(["invisible"])}, targetActor: target()}, d20(4, 15));

        expect(damage).toBe(10);
    });

    test("lanceur invisible contre cible invisible : ils s'annulent, UN SEUL dé — le 15", async () => {
        const {damage, chat} = await play(damageCard(ATTACK),
            {character: {statuses: new Set(["invisible"])}, targetActor: target({statuses: ["invisible"]})},
            d20(15, 4));

        expect(damage).toBe(10);
        expect(chat).not.toContain("FQCARDENGINE.RollModeAdvantage");
        expect(chat).not.toContain("FQCARDENGINE.RollModeDisadvantage");
        expect(chat).toContain("FQCARDENGINE.TooltipCancelled");
    });

    test("attaque de Force en armure non maîtrisée : désavantage", async () => {
        const {damage, chat} = await play(damageCard(ATTACK), {
            character: {system: {attributes: {ac: {equippedArmor: {system: {proficiencyMultiplier: 0}}}}}},
            targetActor: target()
        }, d20(15, 4));

        expect(damage).toBe(5);
        expect(chat).toContain("FQCARDENGINE.ReasonArmor");
    });

    test("armure maîtrisée : aucun effet", async () => {
        const {damage} = await play(damageCard(ATTACK), {
            character: {system: {attributes: {ac: {equippedArmor: {system: {proficiencyMultiplier: 1}}}}}},
            targetActor: target()
        }, d20(15, 4));

        expect(damage).toBe(10);
    });
});

describe("cartes de sauvegarde (DD 11)", () => {

    test("sauvegarde ordinaire : 9 + 2 = 11, la cible se protège", async () => {
        const {damage} = await play(damageCard(DEX_SAVE),
            {targetActor: target({abilities: {dex: {save: {value: 2}}}})}, d20(9));

        expect(damage).toBe(5);
    });

    test("entravée : dnd5e pose le désavantage sur la feuille — 18 puis 4, le 4 compte", async () => {
        const {damage, chat} = await play(damageCard(DEX_SAVE), {
            targetActor: target({statuses: ["restrained"], abilities: {dex: {save: {value: 2, roll: {mode: -1}}}}})
        }, d20(18, 4));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.RollModeDisadvantage (18 | 4)");
    });

    test("avantage posé sur la feuille : 4 puis 18, le 18 compte", async () => {
        const {damage} = await play(damageCard(DEX_SAVE),
            {targetActor: target({abilities: {dex: {save: {value: 2, roll: {mode: 1}}}}})}, d20(4, 18));

        expect(damage).toBe(5);
    });

    test("étourdie, sauvegarde de Dextérité : ratée d'office — le 20 imposé n'est jamais jeté", async () => {
        const {damage, chat} = await play(damageCard(DEX_SAVE), {
            targetActor: target({statuses: ["stunned"], abilities: {dex: {save: {value: 20}}}})
        }, d20(20));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.RollAutoFail");
    });

    test("pétrifiée, sauvegarde de Force : ratée d'office", async () => {
        const {damage} = await play(damageCard({...DEX_SAVE, saveAbility: "str"}), {
            targetActor: target({statuses: ["petrified"], abilities: {str: {save: {value: 20}}}})
        }, d20(20));

        expect(damage).toBe(10);
    });

    test("étourdie, sauvegarde de Sagesse : jet ordinaire", async () => {
        const {damage} = await play(damageCard({...DEX_SAVE, saveAbility: "wis"}), {
            targetActor: target({statuses: ["stunned"], abilities: {wis: {save: {value: 0}}}})
        }, d20(15));

        expect(damage).toBe(5);
    });

    test("armure non maîtrisée de la cible : désavantage à sa sauvegarde de Dextérité", async () => {
        const {damage} = await play(damageCard(DEX_SAVE), {
            targetActor: {
                ...target({abilities: {dex: {save: {value: 2}}}}),
                system: {
                    attributes: {ac: {value: 16, equippedArmor: {system: {proficiencyMultiplier: 0}}}},
                    abilities: {dex: {save: {value: 2}}}
                }
            }
        }, d20(18, 4));

        expect(damage).toBe(10);
    });
});

describe("cible sans défense (paralysée, inconsciente)", () => {

    test("attaque contre une cible paralysée : touchée malgré CA 30, et elle n'esquive pas", async () => {
        const {damage, chat} = await play(damageCard({...ATTACK, bonusEva: 0}),
            {targetActor: target({ac: 30, statuses: ["paralyzed"], evasion: 20})}, d20(1, 20));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.RollDefenseless");
        expect(chat).toContain("FQCARDENGINE.RollAttackTouched");
    });

    test("sauvegarde d'une cible inconsciente : aucun dé, dégâts pleins", async () => {
        const {damage, chat} = await play(damageCard({...DEX_SAVE, bonusEva: 0}), {
            targetActor: target({statuses: ["unconscious"], evasion: 20, abilities: {dex: {save: {value: 20}}}})
        }, d20(20, 20));

        expect(damage).toBe(10);
        expect(chat).toContain("FQCARDENGINE.RollDefenseless");
    });

    test("carte SANS jet pour toucher : une cible paralysée n'esquive plus", async () => {
        const paralysed = await play(damageCard({bonusEva: 0}),
            {targetActor: target({statuses: ["paralyzed"], evasion: 20})}, d20(20));
        const alert = await play(damageCard({bonusEva: 0}),
            {targetActor: target({evasion: 20})}, d20(20));

        expect(paralysed.damage).toBe(10);
        expect(alert.damage).toBe(5);
    });

    test("immunisée à la paralysie : elle se défend", async () => {
        const {damage} = await play(damageCard(ATTACK),
            {targetActor: target({ac: 30, statuses: ["paralyzed"], immune: ["paralyzed"]})}, d20(1));

        expect(damage).toBe(5);
    });
});

describe("cartes qui posent une condition dnd5e", () => {

    afterEach(() => {
        delete globalThis.CONFIG.statusEffects;
    });

    test("« à terre » : un effet porteur du statut, d'origine FQ, sans durée — purgé en fin de combat", async () => {
        const result = await playChoice(effectCard([{status: "prone"}]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.statuses).toEqual(["prone"]);
        expect(effect.origin).toBe(OriginFQEffectLabel);
        expect(effect.duration).toBeUndefined();
        expect(effect.changes).toEqual([]);
        // Le champ de référence du registre ne doit pas fuiter dans l'ActiveEffect.
        expect(effect.status).toBeUndefined();
    });

    test("le nom et l'icône sont ceux que dnd5e donne à la condition", async () => {
        globalThis.CONFIG.statusEffects = [
            {id: "blinded", name: "Blinded", img: "systems/dnd5e/icons/svg/statuses/blinded.svg"}
        ];

        const result = await playChoice(effectCard([{status: "blinded"}]), 0);

        const effect = result.effectsCreated[0].effect;
        expect(effect.name).toBe("Blinded");
        expect(effect.img).toBe("systems/dnd5e/icons/svg/statuses/blinded.svg");
    });

    test("paralysie : la condition induite (neutralisé) entre dans le même effet", async () => {
        globalThis.CONFIG.statusEffects = [
            {id: "paralyzed", name: "Paralyzed", img: "p.svg", riders: ["incapacitated"]}
        ];

        const result = await playChoice(effectCard([{status: "paralyzed"}]), 0);

        expect(result.effectsCreated[0].effect.statuses).toEqual(["paralyzed", "incapacitated"]);
    });

    test("une condition posée SANS durée : le chat l'explique sans durée", async () => {
        const result = await playChoice(effectCard([{status: "prone"}]), 0);

        const chat = result.chatMessages.map(message => String(message.content ?? "")).join("\n");
        expect(chat).toContain("FQCARDENGINE.CardMsgConditionApplied ");
        expect(chat).not.toContain("FQCARDENGINE.CardMsgConditionAppliedFor");
        expect(chat).toContain("FQCARDENGINE.RuleProne");
    });

    test("une condition et un statut FQ sur la même carte : deux effets, chacun le sien", async () => {
        const result = await playChoice(effectCard([{status: "poisoned"}, {status: "burn"}]), 0);

        const effects = result.effectsCreated.map(call => call.effect);
        expect(effects).toHaveLength(2);
        expect(effects[0].statuses).toEqual(["poisoned"]);
        expect(effects[1].name).toBe("Burn");
        expect(effects[1].statuses).toBeUndefined();
    });
});
