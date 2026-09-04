import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import OpportunityAttack, {OPPORTUNITY_ATTACK_SETTING} from "../../src/domain/engine/reaction/opportunity-attack.js";
import ReactionBudget from "../../src/domain/engine/reaction/reaction-budget.js";
import TargetingPredicates from "../../src/domain/engine/shared/targeting-predicates.js";
import WeaponDamage from "../../src/domain/engine/roll/weapon-damage.js";

// Monde minimal : case de 100 px valant 5 pieds, un MJ désigné, un combat au
// round 1. Les tokens sont des TokenDocuments réduits à ce que la détection lit.

const MODULE = "fq-card-engine";
const SIZE = 100;
const GM_ID = "gm";

const FRIENDLY = 1;
const HOSTILE = -1;

/** Une arme de mêlée équipée de portée `reach` pieds. */
const melee = (reach) => ({
    type: "weapon",
    system: {equipped: true, type: {value: "martialM"}, range: {reach, units: "ft"}, activities: {getByType: () => []}}
});

/**
 * Un TokenDocument minimal, positionné en cases.
 *
 * `hp` est optionnel : omis, l'acteur ne porte aucune donnée de points de vie —
 * le cas permissif attendu par `isStanding`.
 *
 * @param {object} data - `id`, `cx`, `cy`, `disposition`, `items`, `spent`, `hp`.
 *
 * @returns {object} Le TokenDocument.
 */
function makeToken({id, cx = 0, cy = 0, disposition = HOSTILE, items = [melee(5)], spent, hp}) {
    const token = {
        id,
        actorId: `actor-${id}`,
        x: cx * SIZE, y: cy * SIZE, width: 1, height: 1,
        disposition,
        flags: spent ? {[MODULE]: {[ReactionBudget.FLAG_KEY]: spent}} : {},
        actor: {id: `actor-${id}`, items, system: hp === undefined ? {} : {attributes: {hp: {value: hp}}}},
        setFlag: vi.fn(async (scope, key, value) => {
            token.flags[scope] = {...(token.flags[scope] ?? {}), [key]: value};
        }),
    };
    return token;
}

const at = (cx, cy) => ({x: cx * SIZE, y: cy * SIZE});
const movementOf = (origin, ...waypoints) => ({origin, passed: {waypoints}});

/**
 * Monte le monde : MJ désigné actif, combat démarré, tokens sur la scène.
 *
 * Par défaut, TOUS les tokens de la scène sont des combattants — le cas normal
 * d'une rencontre. `combatantIds` permet d'en sortir un du tracker.
 */
function mockWorld(tokens, {userId = GM_ID, activeGM = GM_ID, combat = {id: "c1", round: 1}, enabled = true,
    combatantIds = tokens.map(t => t.id)} = {}) {
    globalThis.FqCardEngineModule = {moduleName: MODULE};
    globalThis.game = {
        userId,
        users: {activeGM: activeGM ? {id: activeGM} : null},
        user: {targets: new Set()},
        combat: combat ? {combatants: combatantIds.map(tokenId => ({tokenId})), ...combat} : combat,
        settings: {get: (scope, key) => (scope === MODULE && key === "OpportunityAttack" ? enabled : undefined)},
        canvas: {scene: {dimensions: {size: SIZE}, grid: {distance: 5, units: "ft"}, tokens}},
    };
}

describe("OpportunityAttack.reachOf", () => {
    afterEach(() => {
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    test("convertit la portée de l'arme équipée en cases", () => {
        mockWorld([]);
        expect(OpportunityAttack.reachOf(makeToken({id: "a", items: [melee(5)]}))).toBe(1);
        expect(OpportunityAttack.reachOf(makeToken({id: "b", items: [melee(10)]}))).toBe(2);
    });

    test("aucune arme de mêlée : portée nulle, donc aucune provocation possible", () => {
        mockWorld([]);
        expect(OpportunityAttack.reachOf(makeToken({id: "a", items: []}))).toBe(0);
        expect(OpportunityAttack.reachOf(undefined)).toBe(0);
    });
});

describe("OpportunityAttack.isPendingFor", () => {
    afterEach(() => {
        OpportunityAttack.pending = null;
    });

    test("ne reconnaît que l'activité de l'acteur réactant en cours", () => {
        OpportunityAttack.pending = {actorId: "actor-obs", targetTokenId: "mover"};
        expect(OpportunityAttack.isPendingFor({actor: {id: "actor-obs"}})).toBe(true);
        expect(OpportunityAttack.isPendingFor({actor: {id: "actor-autre"}})).toBe(false);
        expect(OpportunityAttack.isPendingFor({})).toBe(false);
    });

    test("hors résolution, aucune activité n'est reconnue", () => {
        OpportunityAttack.pending = null;
        expect(OpportunityAttack.isPendingFor({actor: {id: "actor-obs"}})).toBe(false);
    });
});

describe("OpportunityAttack.findProvokers", () => {
    afterEach(() => {
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    /** Un fuyard amical qui part du contact de l'observateur en (0,0) vers (3,0). */
    const flee = () => movementOf(at(1, 0), at(2, 0), at(3, 0));

    test("un ennemi au contact dont on s'éloigne provoque", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        const provoked = OpportunityAttack.findProvokers(flee(), mover, game.combat);
        expect(provoked.map(p => p.observer.id)).toEqual(["obs"]);
        expect(provoked[0].reach).toBe(1);
    });

    test("un allié ne provoque pas, même au contact", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: FRIENDLY});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("deux monstres du même camp ne se provoquent pas", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: HOSTILE});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("un ennemi sans arme de mêlée ne provoque pas", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, items: []});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("une arme à allonge provoque plus loin qu'une arme standard", () => {
        const reach = makeToken({id: "hallebarde", cx: 0, disposition: HOSTILE, items: [melee(10)]});
        const standard = makeToken({id: "epee", cx: 0, cy: 1, disposition: HOSTILE, items: [melee(5)]});
        const mover = makeToken({id: "mover", cx: 2, disposition: FRIENDLY});
        mockWorld([reach, standard, mover]);

        // De (2,0) à (3,0) : l'observateur en (0,0) passe de 2 à 3 cases — il
        // franchit sa portée de 2. Celui en (0,1) était déjà à 3 cases.
        const provoked = OpportunityAttack.findProvokers(movementOf(at(2, 0), at(3, 0)), mover, game.combat);
        expect(provoked.map(p => p.observer.id)).toEqual(["hallebarde"]);
    });

    test("un ennemi ayant déjà réagi ce round ne provoque plus", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, spent: {combat: "c1", round: 1}});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("un ennemi à terre ne provoque pas", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, hp: 0});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("des points de vie négatifs ne réveillent pas davantage le réactant", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, hp: -7});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("un ennemi encore debout provoque toujours", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, hp: 1});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat).map(p => p.observer.id)).toEqual(["obs"]);
    });

    test("des points de vie illisibles valent debout : la règle ne mute pas une fiche inhabituelle", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE, hp: null});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat).map(p => p.observer.id)).toEqual(["obs"]);
    });

    test("un ennemi hors du combat ne réagit pas", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover], {combatantIds: ["mover"]});

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("le décor (token sans acteur) ne provoque pas", () => {
        const decor = makeToken({id: "decor", cx: 0, disposition: HOSTILE});
        decor.actorId = null;
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([decor, mover]);

        expect(OpportunityAttack.findProvokers(flee(), mover, game.combat)).toEqual([]);
    });

    test("un rapprochement ne provoque pas", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 3, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        expect(OpportunityAttack.findProvokers(movementOf(at(3, 0), at(2, 0), at(1, 0)), mover, game.combat))
            .toEqual([]);
    });
});

describe("OpportunityAttack.resolve", () => {
    let trigger;

    beforeEach(() => {
        trigger = vi.spyOn(WeaponDamage, "triggerFirstEquippedWeapon").mockResolvedValue(undefined);
    });

    afterEach(() => {
        trigger.mockRestore();
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    test("consomme la réaction et déclenche l'arme de mêlée du réactant", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        await OpportunityAttack.resolve(mover, [{observer, reach: 1}], game.combat);

        expect(observer.setFlag).toHaveBeenCalledWith(MODULE, ReactionBudget.FLAG_KEY, {combat: "c1", round: 1});
        expect(trigger).toHaveBeenCalledWith(observer.actor, "@wpnM");
        expect(ReactionBudget.isAvailable(observer, game.combat)).toBe(false);
    });

    test("le marqueur `pending` est posé pendant le jet et levé après", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);

        let seen;
        trigger.mockImplementation(async () => {
            seen = OpportunityAttack.pending;
        });

        await OpportunityAttack.resolve(mover, [{observer, reach: 1}], game.combat);

        expect(seen).toEqual({actorId: "actor-obs", sourceTokenId: "obs", targetTokenId: "mover"});
        expect(OpportunityAttack.pending).toBeNull();
    });

    test("le marqueur est levé même si le jet échoue", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);
        trigger.mockRejectedValue(new Error("jet impossible"));

        await expect(OpportunityAttack.resolve(mover, [{observer, reach: 1}], game.combat)).rejects.toThrow();
        expect(OpportunityAttack.pending).toBeNull();
    });

    test("plusieurs provocateurs frappent chacun une fois, séquentiellement", async () => {
        const a = makeToken({id: "a", cx: 0, disposition: HOSTILE});
        const b = makeToken({id: "b", cx: 0, cy: 1, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([a, b, mover]);

        await OpportunityAttack.resolve(mover, [{observer: a, reach: 1}, {observer: b, reach: 1}], game.combat);

        expect(trigger).toHaveBeenCalledTimes(2);
        expect(a.setFlag).toHaveBeenCalledOnce();
        expect(b.setFlag).toHaveBeenCalledOnce();
    });

    test("hors combat exploitable, aucune réaction n'est consommée ni déclenchée", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover], {combat: {id: "c1", round: 0}});

        await OpportunityAttack.resolve(mover, [{observer, reach: 1}], game.combat);

        expect(observer.setFlag).not.toHaveBeenCalled();
        expect(trigger).not.toHaveBeenCalled();
    });
});

describe("OpportunityAttack.onMoveToken", () => {
    let trigger;

    beforeEach(() => {
        trigger = vi.spyOn(WeaponDamage, "triggerFirstEquippedWeapon").mockResolvedValue(undefined);
    });

    afterEach(() => {
        trigger.mockRestore();
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    const scene = (opts) => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover], opts);
        return {observer, mover, movement: movementOf(at(1, 0), at(2, 0))};
    };

    test("chez le MJ désigné, l'attaque part", async () => {
        const {mover, movement} = scene();
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).toHaveBeenCalledOnce();
    });

    test("un mobile à terre ne provoque pas : traîner un corps hors d'une mêlée n'est pas une fuite", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY, hp: 0});
        mockWorld([observer, mover]);

        await OpportunityAttack.onMoveToken(mover, movementOf(at(1, 0), at(2, 0)));

        expect(trigger).not.toHaveBeenCalled();
    });

    test("un mobile encore debout provoque toujours — la garde ne mute pas le cas normal", async () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY, hp: 1});
        mockWorld([observer, mover]);

        await OpportunityAttack.onMoveToken(mover, movementOf(at(1, 0), at(2, 0)));

        expect(trigger).toHaveBeenCalledOnce();
    });

    test("sur un client joueur, rien ne part — `moveToken` est diffusé partout", async () => {
        const {mover, movement} = scene({userId: "joueur", activeGM: GM_ID});
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });

    test("sans MJ connecté, rien ne part et rien n'est notifié", async () => {
        const {mover, movement} = scene({userId: "joueur", activeGM: null});
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });

    test("hors combat, rien ne part", async () => {
        // `null` et non `undefined` : `undefined` déclencherait la valeur par
        // défaut du paramètre et remonterait un combat.
        const {mover, movement} = scene({combat: null});
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });

    test("un mobile hors du combat ne provoque rien", async () => {
        const {mover, movement} = scene({combatantIds: ["obs"]});
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });

    test("un token de décor qui se déplace ne provoque rien", async () => {
        const {mover, movement} = scene();
        mover.actorId = null;
        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });
});

describe("Règle de camp mutualisée", () => {
    test("OpportunityAttack ne redéfinit pas la notion d'ennemi", () => {
        // La règle est celle du ciblage « Combat » des cartes : disposition
        // identique = allié. Un seul endroit la définit.
        expect(OpportunityAttack.areEnemies).toBeUndefined();
        expect(TargetingPredicates.areEnemies({disposition: FRIENDLY}, {disposition: HOSTILE})).toBe(true);
        expect(TargetingPredicates.areEnemies({disposition: HOSTILE}, {disposition: HOSTILE})).toBe(false);
        expect(TargetingPredicates.areAllies({disposition: FRIENDLY}, {disposition: FRIENDLY})).toBe(true);
    });
});

describe("OpportunityAttack.contextFor", () => {
    afterEach(() => {
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    test("rend le token réactant qui a frappé, pas le premier token de son acteur", () => {
        // Une horde : deux jetons, un seul acteur. Chercher par acteur rendrait
        // toujours le premier — et les FX partiraient du mauvais squelette.
        const premier = makeToken({id: "sque1", cx: 5, disposition: HOSTILE});
        const frappeur = makeToken({id: "sque2", cx: 0, disposition: HOSTILE});
        frappeur.actorId = premier.actorId;
        frappeur.actor = premier.actor;
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([premier, frappeur, mover]);
        OpportunityAttack.pending = {
            actorId: premier.actorId, sourceTokenId: "sque2", targetTokenId: "mover"};

        const context = OpportunityAttack.contextFor({actor: {id: premier.actorId}});
        expect(context.source).toBe(frappeur);
        expect(context.target).toBe(mover);
    });

    test("rend une source nulle si le token réactant a disparu de la scène", () => {
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([mover]);
        OpportunityAttack.pending = {
            actorId: "actor-obs", sourceTokenId: "disparu", targetTokenId: "mover"};

        expect(OpportunityAttack.contextFor({actor: {id: "actor-obs"}}))
            .toEqual({source: null, target: mover});
    });
});

describe("OpportunityAttack.forcedTargetFor", () => {
    afterEach(() => {
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    test("rend le token désigné par la détection pendant la résolution", () => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);
        OpportunityAttack.pending = {actorId: "actor-obs", targetTokenId: "mover"};

        expect(OpportunityAttack.forcedTargetFor({actor: {id: "actor-obs"}})).toBe(mover);
    });

    test("rend null pour l'activité d'un autre acteur, ou hors résolution", () => {
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([mover]);

        OpportunityAttack.pending = {actorId: "actor-obs", targetTokenId: "mover"};
        expect(OpportunityAttack.forcedTargetFor({actor: {id: "actor-autre"}})).toBeNull();

        OpportunityAttack.pending = null;
        expect(OpportunityAttack.forcedTargetFor({actor: {id: "actor-obs"}})).toBeNull();
    });

    test("rend null si le token cible a disparu de la scène", () => {
        mockWorld([]);
        OpportunityAttack.pending = {actorId: "actor-obs", targetTokenId: "disparu"};
        expect(OpportunityAttack.forcedTargetFor({actor: {id: "actor-obs"}})).toBeNull();
    });
});

describe("TargetingPredicates.resolveTargets — cibles imposées", () => {
    afterEach(() => {
        delete globalThis.game;
    });

    test("forcedTargets court-circuite la sélection de l'utilisateur", () => {
        const cible = makeToken({id: "cible"});
        globalThis.game = {user: {targets: new Set()}, canvas: {scene: {tokens: []}}};

        // Sans cibles sélectionnées, un contenu avec portée rendrait une liste vide.
        expect(TargetingPredicates.resolveTargets({minReach: 1, maxReach: 1})).toEqual([]);
        // Avec forcedTargets, la cible est imposée quoi qu'il arrive à la sélection.
        expect(TargetingPredicates.resolveTargets({minReach: 1, maxReach: 1, forcedTargets: [cible]}))
            .toEqual([cible]);
    });

    test("la sélection reste la source par défaut quand forcedTargets est absent", () => {
        const selectionne = makeToken({id: "selectionne"});
        globalThis.game = {user: {targets: new Set([selectionne])}, canvas: {scene: {tokens: []}}};

        expect(TargetingPredicates.resolveTargets({minReach: 1, maxReach: 1})).toEqual([selectionne]);
    });
});

describe("OpportunityAttack — le contexte voyage avec l'activité", () => {
    afterEach(() => {
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    /** Monte une scène et pose le marqueur comme le fait `strike`. */
    function pendingScene() {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover]);
        OpportunityAttack.pending = {
            actorId: "actor-obs", sourceTokenId: "obs", targetTokenId: "mover"};
        return {observer, mover, activity: {actor: {id: "actor-obs"}}};
    }

    test("le contexte reste consommable APRÈS la levée du marqueur", () => {
        const {observer, mover, activity} = pendingScene();

        // `preUseActivity`, synchrone, mémorise pendant que le marqueur est posé.
        expect(OpportunityAttack.rememberContextFor(activity)).toEqual({source: observer, target: mover});

        // `activity.use()` a rendu la main, `strike` a levé le marqueur — c'est ce
        // qui se produit quand `preRollAttackV2` détache le jet de dégâts.
        OpportunityAttack.pending = null;
        expect(OpportunityAttack.forcedTargetFor(activity)).toBeNull();

        // Le jet de dégâts, arrivé plus tard, retrouve quand même sa cible et son
        // token source — celui qui portera les FX.
        expect(OpportunityAttack.consumeContextFor(activity)).toEqual({source: observer, target: mover});
    });

    test("le contexte n'est consommable qu'une fois", () => {
        const {mover, activity} = pendingScene();
        OpportunityAttack.rememberContextFor(activity);

        expect(OpportunityAttack.consumeContextFor(activity).target).toBe(mover);
        expect(OpportunityAttack.consumeContextFor(activity)).toBeNull();
    });

    test("une activité hors attaque d'opportunité ne mémorise ni ne consomme rien", () => {
        pendingScene();
        const autre = {actor: {id: "actor-autre"}};

        expect(OpportunityAttack.rememberContextFor(autre)).toBeNull();
        expect(OpportunityAttack.consumeContextFor(autre)).toBeNull();
        expect(OpportunityAttack.consumeContextFor(undefined)).toBeNull();
    });

    test("deux réactants successifs gardent chacun sa cible", () => {
        const a = makeToken({id: "a", cx: 0, disposition: HOSTILE});
        const b = makeToken({id: "b", cx: 0, cy: 1, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([a, b, mover]);

        const actA = {actor: {id: "actor-a"}};
        const actB = {actor: {id: "actor-b"}};

        OpportunityAttack.pending = {actorId: "actor-a", sourceTokenId: "a", targetTokenId: "mover"};
        OpportunityAttack.rememberContextFor(actA);
        OpportunityAttack.pending = {actorId: "actor-b", sourceTokenId: "b", targetTokenId: "mover"};
        OpportunityAttack.rememberContextFor(actB);
        OpportunityAttack.pending = null;

        expect(OpportunityAttack.consumeContextFor(actA)).toEqual({source: a, target: mover});
        expect(OpportunityAttack.consumeContextFor(actB)).toEqual({source: b, target: mover});
    });
});

describe("OpportunityAttack — réglage d'activation", () => {
    let trigger;

    beforeEach(() => {
        trigger = vi.spyOn(WeaponDamage, "triggerFirstEquippedWeapon").mockResolvedValue(undefined);
    });

    afterEach(() => {
        trigger.mockRestore();
        OpportunityAttack.pending = null;
        delete globalThis.game;
        delete globalThis.FqCardEngineModule;
    });

    const scene = (opts) => {
        const observer = makeToken({id: "obs", cx: 0, disposition: HOSTILE});
        const mover = makeToken({id: "mover", cx: 1, disposition: FRIENDLY});
        mockWorld([observer, mover], opts);
        return {mover, movement: movementOf(at(1, 0), at(2, 0))};
    };

    test("réglage éteint : aucune attaque, même quand tout le reste est réuni", async () => {
        const {mover, movement} = scene({enabled: false});
        expect(OpportunityAttack.isEnabled()).toBe(false);

        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).not.toHaveBeenCalled();
    });

    test("réglage allumé : l'attaque part", async () => {
        const {mover, movement} = scene({enabled: true});
        expect(OpportunityAttack.isEnabled()).toBe(true);

        await OpportunityAttack.onMoveToken(mover, movement);
        expect(trigger).toHaveBeenCalledOnce();
    });

    test("réglage illisible : désactivé, et aucune levée en boucle sur chaque déplacement", async () => {
        const {mover, movement} = scene();
        globalThis.game.settings = {
            get: () => {
                throw new Error("réglage non enregistré");
            }
        };

        expect(() => OpportunityAttack.isEnabled()).not.toThrow();
        expect(OpportunityAttack.isEnabled()).toBe(false);
        await expect(OpportunityAttack.onMoveToken(mover, movement)).resolves.toBeUndefined();
        expect(trigger).not.toHaveBeenCalled();
    });

    test("`game.settings` absent : désactivé sans lever", () => {
        scene();
        delete globalThis.game.settings;
        expect(OpportunityAttack.isEnabled()).toBe(false);
    });

    test("la clé du réglage est partagée, pas dupliquée", () => {
        expect(OPPORTUNITY_ATTACK_SETTING).toBe("OpportunityAttack");
    });
});
