import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock hissé PAR FICHIER) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice, makeEquippedWeapon} = await import("./play-harness.js");

/**
 * Bonus d'arme de l'acteur (`system.bonuses.mwak/rwak.damage`) sur les cartes
 * `@wpnM`/`@wpnR`, via le VRAI `playValidatedCard`. Les armes FQ portent des
 * activités de type « damage », pour lesquelles dnd5e n'injecte JAMAIS ces
 * bonus (`BaseActivityData.actionType` vaut « damage ») : c'est
 * `WeaponDamage.getActorWeaponDamageBonus` qui les ajoute, selon la catégorie
 * de l'arme (mêlée → mwak, distance → rwak). Les activités de type « attack »
 * en sont exclues (dnd5e les gère déjà) pour ne pas doubler le bonus.
 * Arme à 1d8 + @mod (mod = 3, EXCLU des jetons d'arme : seule 1d8 traverse) ;
 * dés pilotés : d8 = 5, d20 critique et d20 esquive = 19 (seuils 20 → ni
 * critique ni esquive).
 */
function makeWeapon({category, activityType}) {
    return makeEquippedWeapon(category, undefined, {parts: ["1d8", "@mod"], data: {mod: 3}, activityType});
}

function makeCard(damage) {
    return {
        _id: "wpn-bonus-card",
        name: "FQCARDTITLE.WpnBonusTracer",
        face: 0,
        system: {fq: {choices: [{damage, minReach: "1", maxReach: "1", bonusCrit: "0", bonusEva: "0"}]}}
    };
}

const DICE = [{faces: 8, value: 5}, {faces: 20, value: 19}, {faces: 20, value: 19}];

describe("system.bonuses.mwak/rwak.damage — bonus d'arme sur les cartes @wpn (bout en bout)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("le bonus mwak s'ajoute aux dégâts d'une carte @wpnM (activité damage)", async () => {
        const result = await playChoice(makeCard("@wpnM"), 0, {
            world: {
                character: {
                    items: [makeWeapon({category: "simpleM", activityType: "damage"})],
                    system: {bonuses: {mwak: {damage: "2"}}}
                }
            },
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        // 1d8(5) + bonus mwak(2) = 7
        expect(result.hpCalls[0].value).toBe(7);
    });

    test("le bonus rwak ne s'applique pas à une arme de mêlée", async () => {
        const result = await playChoice(makeCard("@wpnM"), 0, {
            world: {
                character: {
                    items: [makeWeapon({category: "simpleM", activityType: "damage"})],
                    system: {bonuses: {rwak: {damage: "2"}}}
                }
            },
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].value).toBe(5);
    });

    test("le bonus rwak s'ajoute aux dégâts d'une carte @wpnR (arme simpleR)", async () => {
        const result = await playChoice(makeCard("@wpnR"), 0, {
            world: {
                character: {
                    items: [makeWeapon({category: "simpleR", activityType: "damage"})],
                    system: {bonuses: {rwak: {damage: "2"}}}
                }
            },
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        expect(result.hpCalls[0].value).toBe(7);
    });

    test("le bonus mwak s'applique à une arme naturelle (carte @wpnM)", async () => {
        const result = await playChoice(makeCard("@wpnM"), 0, {
            world: {
                character: {
                    items: [makeWeapon({category: "natural", activityType: "damage"})],
                    system: {bonuses: {mwak: {damage: "2"}}}
                }
            },
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        // 1d8(5) + bonus mwak(2) = 7
        expect(result.hpCalls[0].value).toBe(7);
    });

    test("une activité d'attaque n'ajoute pas le bonus une seconde fois (dnd5e le gère)", async () => {
        const result = await playChoice(makeCard("@wpnM"), 0, {
            world: {
                character: {
                    items: [makeWeapon({category: "simpleM", activityType: "attack"})],
                    system: {bonuses: {mwak: {damage: "2"}}}
                }
            },
            dice: DICE
        });

        expect(result.threw).toBe(false);
        expect(result.hpCalls).toHaveLength(1);
        // Le mock d'activité d'attaque ne pousse pas le bonus lui-même : la
        // formule reste 1d8(5) — aucune injection côté module.
        expect(result.hpCalls[0].value).toBe(5);
    });
});
