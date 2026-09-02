import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks des feuilles/hand-board/socket (couplées DOM/dnd5e, hors périmètre) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

// Le garde-fou délègue à PlayCard.callBackplayCard quand le ciblage est valide :
// on l'espionne pour prouver « bloqué => non appelé » / « valide => appelé ».
vi.mock("../../src/domain/engine/play-card.js", () => ({
    default: {
        callBackplayCard: vi.fn().mockResolvedValue(null),
        discardCard: vi.fn(),
    },
}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {mountWorld, ensureEngineLoaded} = await import("../decks/play-harness.js");
const {installDeterministicRoll, resetDiceControl} = await import("../decks/deterministic-roll.js");
const PlayCard = (await import("../../src/domain/engine/play-card.js")).default;
const Constants = (await import("../../src/domain/constants.js")).default;
const ZoneTargeting = (await import("../../src/domain/interface/targeting/zone-targeting.js")).default;
const {makeCard, makeChoice} = await import("../factories.js");

await ensureEngineLoaded();

/**
 * Cible synthétique dans la géométrie de world-fixture (0,5) — 1 case du lanceur (5,5).
 *
 * @param {string} name - Nom de la cible.
 *
 * @returns {object} Une cible utilisable dans `game.user.targets`.
 */
function targetLike(name = "Cible") {
    return {name, document: {x: 0, y: 5, width: 1, height: 1}};
}

/**
 * Contexte `ctx` minimal (un seul choix, aucune variable, aucun sbire) attendu
 * par `playValidatedCard`. `firstChoice` (par défaut, sans minions) ≠ `cardContent`
 * (le choix sélectionné soumis au garde-fou) pour prouver que le garde lit bien
 * le CHOIX SÉLECTIONNÉ.
 *
 * @param {object} cardContent - Le choix sélectionné.
 *
 * @returns {object} Le contexte `ctx`.
 */
function makeCtx(cardContent) {
    return {
        firstChoice: makeChoice(),
        cardContents: [cardContent],
        hasVariables: false,
        initCardContents: [cardContent],
        currentCards: {pass: vi.fn()},
        card: makeCard(),
    };
}

/**
 * Monte le monde (avec surcharges) puis installe le `Roll` déterministe pour que
 * la résolution des champs (prepareDataFromCard, via evaluateSync) évalue réellement
 * les formules.
 *
 * @param {object} [overrides] - Surcharges transmises à `mountWorld`.
 *
 * @returns {void}
 */
function mountForGuard(overrides) {
    mountWorld(overrides);
    installDeterministicRoll();
    resetDiceControl();
}

/**
 * Joue le choix via le VRAI `playValidatedCard`.
 *
 * @param {object} cardContent - Le choix sélectionné.
 * @param {object} [fd]        - Les données de formulaire.
 *
 * @returns {*} Le retour de `playValidatedCard`.
 */
function play(cardContent, fd = {}) {
    return window.FqCardEngineModule.playValidatedCard({id: "pile"}, fd, cardContent, makeCtx(cardContent));
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Garde-fou de ciblage — blocage par FormError (dialog non fermée)", () => {
    test("0 cible (Default + portée) → FormErrorNoTarget, callBackplayCard NON appelé", () => {
        mountForGuard({user: {targets: []}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("plusieurs cibles sans nbTargets → FormErrorNoMultipleTarget, non délégué", () => {
        mountForGuard({user: {targets: [targetLike("A"), targetLike("B")]}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoMultipleTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("plus de cibles que nbTargets → FormErrorTooManyTargets, non délégué", () => {
        mountForGuard({user: {targets: [targetLike("A"), targetLike("B")]}});
        const choice = makeChoice({targetType: "Default", maxReach: "3", nbTargets: "1"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorTooManyTargets");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("pas de token du lanceur sur la scène → FormErrorNoTokenOnScene, non délégué", () => {
        mountForGuard({canvas: {scene: {tokens: []}}});
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("cible hors portée → FormErrorOutOfReach, non délégué", () => {
        mountForGuard(); // 1 cible à distance 1 du lanceur
        // Portée résolue [2,3] positive (cible à distance 1 < minReach 2 → hors portée).
        // On garde une portée POSITIVE : depuis la remontée, la garde d'entrée
        // s'évalue sur les valeurs résolues, une portée nulle serait falsy.
        const choice = makeChoice({targetType: "Default", minReach: "2", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorOutOfReach");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });
});

describe("Garde-fou de ciblage — gating", () => {
    test("aucune portée déclarée → garde-fou ignoré, délégation normale", () => {
        mountForGuard({user: {targets: []}});
        const choice = makeChoice({targetType: "Default", minReach: "", maxReach: ""});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });
});

describe("Garde-fou de ciblage — Skeletons contrôlé", () => {
    afterEach(() => vi.restoreAllMocks());

    test("Skeletons + portée + aucun squelette → FormError NoTarget, non délégué", () => {
        mountForGuard();
        vi.spyOn(Constants, "myTargets").mockReturnValue([]);
        const choice = makeChoice({targetType: "Skeletons", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Skeletons + squelette à portée → délègue", () => {
        mountForGuard();
        vi.spyOn(Constants, "myTargets").mockReturnValue([
            {name: "Skeleton", document: {x: 0, y: 5, width: 1, height: 1}}
        ]);
        const choice = makeChoice({targetType: "Skeletons", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });
});

describe("Garde-fou de ciblage — Zone (poser la zone EST la condition de jeu)", () => {
    afterEach(() => vi.restoreAllMocks());

    test("Zone non posée → FormError NoZone, non délégué", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(false);
        const choice = makeChoice({targetType: "Zone", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoZone");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Zone non posée SANS portée déclarée → FormError NoZone (la garde s'applique aussi sans portée)", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(false);
        const choice = makeChoice({targetType: "Zone", minReach: "", maxReach: ""});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoZone");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Zone posée + 0 cible → délègue (la zone peut tomber sur du vide)", () => {
        mountForGuard({user: {targets: []}});
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        const choice = makeChoice({targetType: "Zone", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Zone posée + plusieurs cibles sans nbTargets → délègue (le nombre n'est pas limité)", () => {
        mountForGuard({user: {targets: [targetLike("A"), targetLike("B")]}});
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        const choice = makeChoice({targetType: "Zone", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Invocation en zone sur une case occupée → FormError MinionZoneOccupied, non délégué", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        // La fixture pose un token en (0,5) : la zone tombe dessus.
        vi.spyOn(ZoneTargeting, "getPlacement").mockReturnValue(
            {type: "rectangle", originX: 0, originY: 5, width: 1, height: 1});
        const choice = makeChoice({targetType: "Zone", minionsOnZone: true, minions: [{name: "Skeleton lvl 1"}]});

        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorMinionZoneOccupied");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Invocation en zone 2×2 dont UNE SEULE case est occupée → bloquée", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        // Cases (0,0), (5,0), (0,5), (5,5) : les deux dernières portent des tokens.
        vi.spyOn(ZoneTargeting, "getPlacement").mockReturnValue(
            {type: "rectangle", originX: 0, originY: 0, width: 2, height: 2});
        const choice = makeChoice({
            targetType: "Zone", minionsOnZone: true,
            minions: [{name: "s1"}, {name: "s2"}, {name: "s3"}, {name: "s4"}]
        });

        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorMinionZoneOccupied");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Invocation en zone sur des cases libres → délègue", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        vi.spyOn(ZoneTargeting, "getPlacement").mockReturnValue(
            {type: "rectangle", originX: 100, originY: 100, width: 1, height: 1});
        const choice = makeChoice({targetType: "Zone", minionsOnZone: true, minions: [{name: "Skeleton lvl 1"}]});

        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Zone SANS invocation sur une case occupée → délègue (la garde ne vise que l'invocation)", () => {
        mountForGuard();
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        vi.spyOn(ZoneTargeting, "getPlacement").mockReturnValue(
            {type: "rectangle", originX: 0, originY: 5, width: 1, height: 1});
        // Une zone de dégâts DOIT pouvoir tomber sur des tokens : c'est même le but.
        const choice = makeChoice({targetType: "Zone", damage: "1d6", maxReach: "3"});

        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Zone posée + cible individuellement hors portée → délègue (portée contrôlée à la pose, pas par token)", () => {
        mountForGuard(); // cible à distance 1 < minReach 2 : bloquerait en Default
        vi.spyOn(ZoneTargeting, "hasPlacement").mockReturnValue(true);
        const choice = makeChoice({targetType: "Zone", minReach: "2", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });
});

describe("Garde-fou de ciblage — Adjacent (acquisition automatique autour du lanceur)", () => {
    test("Adjacent + voisin à distance 1 → délègue", () => {
        mountForGuard(); // token cible de la fixture à distance 1 du lanceur
        const choice = makeChoice({targetType: "Adjacent", minReach: "1", maxReach: "1"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Adjacent + anneau vide → FormError NoAdjacentTarget, non délégué", () => {
        mountForGuard(); // la seule cible est à distance 1, hors de l'anneau [2,3]
        const choice = makeChoice({targetType: "Adjacent", minReach: "2", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoAdjacentTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Adjacent + pas de token du lanceur → FormError NoTokenOnScene, non délégué", () => {
        mountForGuard({canvas: {scene: {tokens: []}}});
        const choice = makeChoice({targetType: "Adjacent", maxReach: "1"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });
});

describe("Garde-fou de ciblage — Combat (acquisition automatique des combattants)", () => {
    // Tokens de scène dans la géométrie de world-fixture : lanceur (5,5) allié
    // (disposition 1), ennemi à distance 1 (0,5) — tous deux combattants.
    const combatScene = () => ({
        canvas: {scene: {tokens: [
            {id: "caster", actorId: "world-character", x: 5, y: 5, width: 1, height: 1, disposition: 1, object: {setTarget: vi.fn()}},
            {id: "enemy", actorId: "enemy-actor", x: 0, y: 5, width: 1, height: 1, disposition: -1, object: {setTarget: vi.fn()}},
        ]}},
        combat: {combatants: [{tokenId: "caster"}, {tokenId: "enemy"}]},
    });

    test("CombatEnemies + combattant ennemi à portée → délègue", () => {
        mountForGuard(combatScene());
        const choice = makeChoice({targetType: "CombatEnemies", minReach: "1", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("CombatAllies + minReach 0 → le lanceur lui-même suffit, délègue", () => {
        mountForGuard(combatScene());
        const choice = makeChoice({targetType: "CombatAllies", minReach: "0", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("Combat + aucun combat actif → FormError NoCombat, non délégué", () => {
        const world = combatScene();
        delete world.combat;
        mountForGuard(world); // combat null par défaut dans mountWorld
        const choice = makeChoice({targetType: "CombatEnemies", minReach: "1", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoCombat");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Combat + aucun combattant du bon camp à portée → FormError NoCombatTarget, non délégué", () => {
        mountForGuard(combatScene()); // l'ennemi est à distance 1, hors de l'anneau [2,3]
        const choice = makeChoice({targetType: "CombatEnemies", minReach: "2", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoCombatTarget");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });

    test("Combat + pas de token du lanceur → FormError NoTokenOnScene, non délégué", () => {
        const world = combatScene();
        world.canvas.scene.tokens = world.canvas.scene.tokens.filter(t => t.id !== "caster");
        mountForGuard(world);
        const choice = makeChoice({targetType: "CombatEnemies", maxReach: "3"});
        expect(() => play(choice)).toThrow("FQCARDENGINE.DialogPlayFormErrorNoTokenOnScene");
        expect(PlayCard.callBackplayCard).not.toHaveBeenCalled();
    });
});

describe("Garde-fou de ciblage — cas nominal", () => {
    test("cible unique à portée (Default) délègue à callBackplayCard", () => {
        mountForGuard(); // 1 cible à distance 1
        const choice = makeChoice({targetType: "Default", maxReach: "3"});
        expect(() => play(choice)).not.toThrow();
        expect(PlayCard.callBackplayCard).toHaveBeenCalledTimes(1);
    });

    test("le bloc de recalcul résout le cardContent en place (portées/nbTargets numériques)", () => {
        // La non-mutation appartient désormais à TargetingView.build (plan 11-04) ;
        // ici, playValidatedCard résout le contenu en place avant de déléguer.
        mountForGuard();
        const choice = makeChoice({targetType: "Default", minReach: "1", maxReach: "3", nbTargets: "2"});
        play(choice);
        expect(choice.minReach).toBe(1);
        expect(choice.maxReach).toBe(3);
        expect(choice.nbTargets).toBe(2);
    });
});
