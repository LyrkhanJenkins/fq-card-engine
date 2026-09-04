import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Minion from "../../src/domain/engine/shared/minion.js";
import CardFqSystem from "../../src/domain/system/cards/card-fq-system.mjs";
import {socket} from "../../src/hook/integration/socketlib.hook.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {executeAsGM: vi.fn()}
}));

/**
 * Plafond d'invocations simultanées par type de sbire : comptage des sbires
 * vivants sur la scène, plafond de base augmenté des bonus de combat, verdict
 * de dépassement, et bonus de caractéristiques appliqués à l'invocation.
 */

const BEAST = CardFqSystem.MINION_TYPE_BEAST;
const SKELETON = CardFqSystem.MINION_TYPE_SKELETON;

/**
 * Construit un document de jeton dont l'acteur porte (ou non) l'estampille de sbire.
 *
 * @param {object}  options            - Les données du jeton.
 * @param {string}  [options.type]     - Le type de sbire estampillé.
 * @param {string}  [options.summoner] - L'id de l'invocateur estampillé.
 * @param {number}  [options.hp]       - Les points de vie restants.
 *
 * @returns {object} Un document de jeton exploitable par `Minion.countOnScene`.
 */
function minionToken({type, summoner = "me", hp = 10} = {}) {
    return {
        actor: {
            flags: type === undefined ? {} : {"fq-card-engine": {minionType: type, summonerId: summoner}},
            system: {attributes: {hp: {value: hp}}}
        }
    };
}

/**
 * Installe la scène et le personnage courant, avec ses données de sbires telles
 * que le schéma les fournit (plafonds de base) et telles que des effets actifs
 * les auraient modifiées.
 *
 * @param {object}   [options]         - Les options de montage.
 * @param {object[]} [options.tokens]  - Les jetons posés sur la scène.
 * @param {object}   [options.minions] - Les surcharges de `system.fq.minions`, par type.
 */
function mountScene({tokens = [], minions = {}} = {}) {
    game.canvas = {scene: {dimensions: {size: 100}, tokens}};
    game.user.character = {
        id: "me",
        system: {fq: {minions: {
            beast: {max: 1, hp: 0, damage: 0, movement: 0, ...(minions.beast ?? {})},
            skeleton: {max: 6, hp: 0, damage: 0, movement: 0, ...(minions.skeleton ?? {})}
        }}}
    };
}

describe("Minion — plafond par type", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        mountScene();
    });

    describe("maxOf", () => {

        it("applique les plafonds de base : une bête, six squelettes", () => {
            expect(Minion.maxOf(BEAST)).toBe(1);
            expect(Minion.maxOf(SKELETON)).toBe(6);
        });

        it("ajoute le bonus de plafond gagné en combat", () => {
            mountScene({minions: {beast: {max: 2}, skeleton: {max: 8}}});

            expect(Minion.maxOf(BEAST)).toBe(2);
            expect(Minion.maxOf(SKELETON)).toBe(8);
        });

        it("ne plafonne pas un sbire sans type, ni un type inconnu", () => {
            expect(Minion.maxOf(CardFqSystem.MINION_TYPE_NONE)).toBe(Infinity);
            expect(Minion.maxOf(undefined)).toBe(Infinity);
            expect(Minion.maxOf("dragon")).toBe(Infinity);
        });
    });

    describe("countOnScene", () => {

        it("compte les sbires vivants du bon type invoqués par l'acteur", () => {
            mountScene({
                tokens: [minionToken({type: BEAST}), minionToken({type: BEAST}), minionToken({type: SKELETON})]
            });

            expect(Minion.countOnScene(BEAST, "me")).toBe(2);
            expect(Minion.countOnScene(SKELETON, "me")).toBe(1);
        });

        it("ignore les sbires d'un autre invocateur, les jetons non estampillés et les sbires à 0 PV", () => {
            mountScene({
                tokens: [
                    minionToken({type: BEAST, summoner: "someoneElse"}),
                    minionToken({type: undefined}),
                    minionToken({type: BEAST, hp: 0})
                ]
            });

            expect(Minion.countOnScene(BEAST, "me")).toBe(0);
        });

        it("renvoie 0 sans type ou sans invocateur, et retombe sur le personnage courant si l'invocateur est omis", () => {
            mountScene({tokens: [minionToken({type: BEAST})]});

            expect(Minion.countOnScene(undefined, "me")).toBe(0);
            expect(Minion.countOnScene(BEAST, null)).toBe(0);
            expect(Minion.countOnScene(BEAST)).toBe(1);
        });
    });

    describe("capVerdict", () => {

        it("laisse passer tant que le plafond n'est pas dépassé", () => {
            expect(Minion.capVerdict([{type: BEAST}])).toBeNull();
        });

        it("dénonce le dépassement en nommant le type, le présent et le plafond", () => {
            mountScene({tokens: [minionToken({type: BEAST})]});

            expect(Minion.capVerdict([{type: BEAST}]))
                .toEqual({type: BEAST, current: 1, max: 1, requested: 1});
        });

        it("prend en compte le bonus de plafond gagné en combat", () => {
            mountScene({tokens: [minionToken({type: BEAST})], minions: {beast: {max: 2}}});

            expect(Minion.capVerdict([{type: BEAST}])).toBeNull();
        });

        it("compte les sbires demandés en une fois : six squelettes passent, sept non", () => {
            const six = Array.from({length: 6}, () => ({type: SKELETON}));

            expect(Minion.capVerdict(six)).toBeNull();
            expect(Minion.capVerdict([...six, {type: SKELETON}]))
                .toEqual({type: SKELETON, current: 0, max: 6, requested: 7});
        });

        it("ne compte que les sbires réellement invoqués, dans la limite fournie", () => {
            const two = [{type: BEAST}, {type: BEAST}];

            expect(Minion.capVerdict(two)).not.toBeNull();
            expect(Minion.capVerdict(two, 1)).toBeNull();
        });

        it("ignore les sbires sans type et la liste vide", () => {
            mountScene({tokens: [minionToken({type: BEAST})]});

            expect(Minion.capVerdict([{type: ""}, {name: "sans type"}])).toBeNull();
            expect(Minion.capVerdict([])).toBeNull();
            expect(Minion.capVerdict(undefined)).toBeNull();
        });
    });

    describe("statBonus", () => {

        it("renvoie des bonus nuls sans donnée, sans type, ou pour un type non concerné", () => {
            const zero = {hp: 0, damageBonus: 0, movement: 0};

            expect(Minion.statBonus(BEAST)).toEqual(zero);
            expect(Minion.statBonus(undefined)).toEqual(zero);

            mountScene({minions: {skeleton: {hp: 5}}});
            expect(Minion.statBonus(BEAST)).toEqual(zero);
        });

        it("lit les bonus du type demandé", () => {
            mountScene({minions: {beast: {hp: 5, damage: 2, movement: 5}}});

            expect(Minion.statBonus(BEAST)).toEqual({hp: 5, damageBonus: 2, movement: 5});
        });
    });
});

describe("Minion — bonus de caractéristiques à l'invocation", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        mountScene();
        vi.clearAllMocks();
        vi.spyOn(Minion, "getTempActorFolder").mockReturnValue({id: "tmp"});
        game.packs.get.mockReturnValue({
            getDocuments: vi.fn(async () => ([{
                name: "Tamed Wolf",
                ownership: {},
                system: {
                    attributes: {hp: {max: 12, value: 12}, movement: {walk: 30}},
                    fq: {
                        attributes: {critical: 1, evasion: 1},
                        action: {max: 1, value: 1},
                        mana: {max: 1, value: 1},
                        zeal: {max: 8, value: 1},
                        bonus: {damage: 3, heal: 0}
                    }
                }
            }]))
        });
    });

    afterEach(() => {
        Minion.getTempActorFolder.mockRestore();
    });

    /** Les données d'acteur transmises au MJ lors de la dernière invocation. */
    const sentActorData = () => socket.executeAsGM.mock.calls.at(-1)[1];

    it("estampille le sbire créé avec son type et son invocateur", async () => {
        await Minion.createActorData({name: "Tamed Wolf", type: BEAST}, "left");

        expect(sentActorData().flags["fq-card-engine"])
            .toEqual({minionType: BEAST, summonerId: "me"});
    });

    it("estampille un type vide pour un sbire non typé", async () => {
        await Minion.createActorData({name: "Tamed Wolf"}, "left");

        expect(sentActorData().flags["fq-card-engine"].minionType)
            .toBe(CardFqSystem.MINION_TYPE_NONE);
    });

    it("ajoute les bonus de combat aux caractéristiques déclarées par la carte", async () => {
        mountScene({minions: {beast: {hp: 5, damage: 2, movement: 5}}});

        await Minion.createActorData({
            name: "Tamed Wolf", type: BEAST, data: {hp: "1d6", damageBonus: "1", movement: "1"}
        }, "left");

        const actorData = sentActorData();
        // Les formules sont résolues à 10 par le Roll déterministe des tests.
        expect(actorData.system.attributes.hp).toEqual({max: 15, value: 15});
        expect(actorData.system.fq.bonus.damage).toBe(12);
        expect(actorData.system.attributes.movement.walk).toBe(15);
    });

    it("applique les bonus de combat même quand la carte ne surcharge rien : la base est celle du compendium", async () => {
        mountScene({minions: {beast: {hp: 5, damage: 2, movement: 5}}});

        await Minion.createActorData({name: "Tamed Wolf", type: BEAST}, "left");

        const actorData = sentActorData();
        expect(actorData.system.attributes.hp).toEqual({max: 17, value: 17});
        expect(actorData.system.fq.bonus.damage).toBe(5);
        expect(actorData.system.attributes.movement.walk).toBe(35);
    });

    it("n'applique aucun bonus au sbire d'un autre type", async () => {
        mountScene({minions: {skeleton: {hp: 5}}});

        await Minion.createActorData({name: "Tamed Wolf", type: BEAST}, "left");

        expect(sentActorData().system.attributes.hp).toEqual({max: 12, value: 12});
    });
});
