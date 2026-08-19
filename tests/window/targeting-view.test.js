import {beforeEach, describe, expect, test, vi} from "vitest";

// Mocks requis par le harnais (vi.mock hissé par fichier). targeting-view n'importe
// pas les feuilles/socket, mais on garde le bloc canonique pour la robustesse des
// imports transitifs (card-fq-system, etc.), comme les autres suites du harnais.
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld} = await import("../decks/play-harness.js");
const {installDeterministicRoll, resetDiceControl} = await import("../decks/deterministic-roll.js");
const TargetingView = (await import("../../src/domain/interface/shared/targeting-view.js")).default;
const ZoneTargeting = (await import("../../src/domain/interface/shared/zone-targeting.js")).default;
const {makeChoice} = await import("../factories.js");

/**
 * Monte un monde déterministe (game monté + Roll déterministe pour `evaluateSync`).
 *
 * @param {object} [overrides] - Surcharges transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountDeterministic(overrides) {
    mountWorld(overrides);
    installDeterministicRoll();
    resetDiceControl();
}

describe("TargetingView.build — gating manual (identique au garde-fou Phase 8)", () => {
    beforeEach(() => mountDeterministic());

    test("Default + portée déclarée → manual true", () => {
        expect(TargetingView.build(makeChoice({targetType: "Default", maxReach: "3"})).manual).toBe(true);
    });

    test("Skeletons (auto-ciblage) → manual false", () => {
        expect(TargetingView.build(makeChoice({targetType: "Skeletons", maxReach: "3"})).manual).toBe(false);
    });

    test("aucune portée déclarée → manual false", () => {
        expect(TargetingView.build(makeChoice({targetType: "Default", minReach: "", maxReach: ""})).manual).toBe(false);
    });
});

describe("TargetingView.build — required / count / targets", () => {
    test("required défaut 1 sans nbTargets", () => {
        mountDeterministic();
        expect(TargetingView.build(makeChoice({maxReach: "3"})).required).toBe(1);
    });

    test("required = nbTargets résolu", () => {
        mountDeterministic();
        expect(TargetingView.build(makeChoice({maxReach: "3", nbTargets: "2"})).required).toBe(2);
    });

    test("monde par défaut : count 1, une cible", () => {
        mountDeterministic();
        const view = TargetingView.build(makeChoice({targetType: "Default", maxReach: "3"}));
        expect(view.count).toBe(1);
        expect(view.targets).toHaveLength(1);
    });

    test("aucune cible : count 0, targets vide, mais manual reste vrai (panneau affichable à 0 cible)", () => {
        mountDeterministic({user: {targets: []}});
        const view = TargetingView.build(makeChoice({targetType: "Default", maxReach: "3"}));
        expect(view.count).toBe(0);
        expect(view.targets).toEqual([]);
        expect(view.manual).toBe(true);
    });
});

describe("TargetingView.build — portées résolues", () => {
    test("maxReach résolu, bonus de portée 0", () => {
        mountDeterministic();
        const view = TargetingView.build(makeChoice({minReach: "", maxReach: "3"}));
        expect(view.minReach).toBe(0);
        expect(view.maxReach).toBe(3);
    });

    test("bonus de portée de l'acteur ajouté à maxReach", () => {
        mountDeterministic({character: {system: {fq: {bonus: {range: 2}}}}});
        expect(TargetingView.build(makeChoice({maxReach: "3"})).maxReach).toBe(5);
    });
});

describe("TargetingView.build — hors-portée / PV", () => {
    test("cible à portée → outOfReach false", () => {
        mountDeterministic();
        const view = TargetingView.build(makeChoice({targetType: "Default", maxReach: "3"}));
        expect(view.targets[0].outOfReach).toBe(false);
    });

    test("cible hors portée → outOfReach true + dist numérique", () => {
        mountDeterministic();
        const view = TargetingView.build(makeChoice({targetType: "Default", maxReach: "0"}));
        expect(view.targets[0].outOfReach).toBe(true);
        expect(view.targets[0].dist).toBe(1);
    });

    test("PV de la cible (10/20 → 50%)", () => {
        mountDeterministic({targetActor: {system: {attributes: {hp: {value: 10, max: 20}}}}});
        const view = TargetingView.build(makeChoice({targetType: "Default", maxReach: "3"}));
        expect(view.targets[0].hpValue).toBe(10);
        expect(view.targets[0].hpMax).toBe(20);
        expect(view.targets[0].hpPct).toBe(50);
    });
});

describe("TargetingView.build — ciblage Zone", () => {
    /**
     * Cible synthétique dans la géométrie de world-fixture (0,5) — 1 case du lanceur (5,5).
     *
     * @param {string} name - Nom de la cible.
     *
     * @returns {object} Une cible utilisable dans `game.user.targets`.
     */
    function targetLike(name) {
        return {name, document: {x: 0, y: 5, width: 1, height: 1}};
    }

    test("Zone sans portée déclarée → manual et isZone vrais (la pose remplace le ciblage token)", () => {
        mountDeterministic();
        const view = TargetingView.build(makeChoice({targetType: "Zone", minReach: "", maxReach: ""}));
        expect(view.manual).toBe(true);
        expect(view.isZone).toBe(true);
    });

    test("Zone : nbTargets ne limite pas (required = count, tooMuchTargets false)", () => {
        mountDeterministic({user: {targets: [targetLike("A"), targetLike("B")]}});
        const view = TargetingView.build(makeChoice({targetType: "Zone", maxReach: "3", nbTargets: "1"}));
        expect(view.count).toBe(2);
        expect(view.required).toBe(2);
        expect(view.tooMuchTargets).toBe(false);
    });

    test("Zone : zonePlaced reflète l'état de pose de ZoneTargeting", () => {
        mountDeterministic();
        expect(TargetingView.build(makeChoice({targetType: "Zone", maxReach: "3"})).zonePlaced).toBe(false);
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        expect(TargetingView.build(makeChoice({targetType: "Zone", maxReach: "3"})).zonePlaced).toBe(true);
        vi.restoreAllMocks();
    });

    test("Zone : aucune cible marquée hors-portée (portée contrôlée à la pose)", () => {
        mountDeterministic(); // cible à distance 1, minReach 2 la marquerait en Default
        const view = TargetingView.build(makeChoice({targetType: "Zone", minReach: "2", maxReach: "3"}));
        expect(view.targets).toHaveLength(1);
        expect(view.targets[0].outOfReach).toBe(false);
    });
});

describe("TargetingView.build — ciblage Adjacent", () => {
    test("Adjacent → manual/isAdjacent vrais, nbTargets ne limite pas, pas de hors-portée", () => {
        mountDeterministic({user: {targets: [
            {name: "A", document: {x: 0, y: 5, width: 1, height: 1}},
            {name: "B", document: {x: 0, y: 5, width: 1, height: 1}},
        ]}});
        const view = TargetingView.build(makeChoice({targetType: "Adjacent", minReach: "1", maxReach: "1", nbTargets: "1"}));
        expect(view.manual).toBe(true);
        expect(view.isAdjacent).toBe(true);
        expect(view.count).toBe(2);
        expect(view.required).toBe(2);
        expect(view.tooMuchTargets).toBe(false);
        expect(view.targets.every(t => !t.outOfReach)).toBe(true);
    });
});

describe("TargetingView.build — non-mutation du cardContent", () => {
    test("le choix passé n'est pas modifié", () => {
        mountDeterministic();
        const choice = makeChoice({targetType: "Default", minReach: "1", maxReach: "3", nbTargets: "2"});
        TargetingView.build(choice);
        expect(choice.minReach).toBe("1");
        expect(choice.maxReach).toBe("3");
        expect(choice.nbTargets).toBe("2");
        expect(choice.targetType).toBe("Default");
    });
});
