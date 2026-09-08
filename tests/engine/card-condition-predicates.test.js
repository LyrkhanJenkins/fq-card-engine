import {afterEach, beforeEach, describe, expect, it} from "vitest";
import CardCondition from "../../src/domain/engine/shared/card-condition.js";

/**
 * Prédicats génériques `FqCardEngineModule.cond.*` de CardCondition : logs de
 * combat, portée/géométrie des cibles, effets actifs, état du personnage,
 * pioche/main. Tous silencieux et tolérants à l'absence de combat/scène/acteur.
 */

const GRID = 100;

/** Construit un token canvas-like (avec son document) pour la scène de test. */
function makeToken({id, actorId, x = 0, y = 0, width = 1, height = 1, effects = []}) {
    return {
        id, x, y,
        actor: {id: actorId, effects},
        document: {id, actorId, x, y, width, height}
    };
}

/** Installe une scène, un combat et des cibles de test sur le global `game`. */
function mountScene({tokens = [], targets = [], logs = null, round = 2, character} = {}) {
    game.user.character = character ?? {id: "me"};
    game.user.targets = new Set(targets);
    game.canvas = {scene: {dimensions: {size: GRID}, tokens: tokens.map(t => t.document)}};
    game.combat = logs === null ? null : {round, flags: {fq: {logs}}};
}

/** Construit un token de sbire estampillé (type, invocateur) et vivant ou non. */
function stampedMinionToken({id, type, summoner = "me", hp = 10}) {
    const token = makeToken({id, actorId: id});
    const actor = {
        ...token.actor,
        flags: {"fq-card-engine": {minionType: type, summonerId: summoner}},
        system: {attributes: {hp: {value: hp}}}
    };
    return {...token, actor, document: {...token.document, actor}};
}

const me = () => makeToken({id: "tokMe", actorId: "me", x: 0, y: 0});
const foe = (x = GRID, y = 0) => makeToken({id: "tokFoe", actorId: "foe", x, y});

/** Entrée de log : `attacker` inflige `value` dégâts FQ au token `targetTokenId`. */
function damageLog({attacker = "foe", targetActorId = "me", targetTokenId = "tokMe", value = 5, evasion = false, round = 2, cardContent = {}}) {
    return {
        actorId: attacker,
        targetsId: [targetActorId],
        round,
        resultArray: {0: {type: "damageFQ", value, evasion, targetTokenId}},
        cardContent
    };
}

describe("CardCondition — prédicats de logs de combat", () => {

    it("tookDamageThisRound : vrai si une entrée de dégâts effectifs touche mon token ce round", () => {
        mountScene({tokens: [me(), foe()], logs: [damageLog({value: 5})]});

        expect(CardCondition.tookDamageThisRound()).toBe(true);
    });

    it("tookDamageThisRound : faux si les dégâts sont à 0 (esquive), d'un autre round, ou hors combat", () => {
        mountScene({tokens: [me(), foe()], logs: [damageLog({value: 0, evasion: true})]});
        expect(CardCondition.tookDamageThisRound()).toBe(false);

        mountScene({tokens: [me(), foe()], logs: [damageLog({round: 1})]});
        expect(CardCondition.tookDamageThisRound()).toBe(false);

        mountScene({tokens: [me(), foe()], logs: null});
        expect(CardCondition.tookDamageThisRound()).toBe(false);
    });

    it("tookDamageThisRound : faux sans token du personnage sur la scène", () => {
        mountScene({tokens: [foe()], logs: [damageLog({})]});

        expect(CardCondition.tookDamageThisRound()).toBe(false);
    });

    it("damageTakenThisRound : somme les dégâts effectifs du round, en ignorant les autres rounds", () => {
        mountScene({
            tokens: [me(), foe()],
            logs: [damageLog({value: 5}), damageLog({value: 7}), damageLog({value: 4, round: 1})]
        });

        expect(CardCondition.damageTakenThisRound()).toBe(12);
    });

    it("damageTakenThisRound : 0 sur esquive, hors combat, ou sans token du personnage", () => {
        mountScene({tokens: [me(), foe()], logs: [damageLog({value: 0, evasion: true})]});
        expect(CardCondition.damageTakenThisRound()).toBe(0);

        mountScene({tokens: [me(), foe()], logs: null});
        expect(CardCondition.damageTakenThisRound()).toBe(0);

        mountScene({tokens: [foe()], logs: [damageLog({})]});
        expect(CardCondition.damageTakenThisRound()).toBe(0);
    });

    it("attackerWithinReach : vrai si le dernier assaillant du round est à portée", () => {
        mountScene({tokens: [me(), foe(GRID, 0)], logs: [damageLog({})]});

        expect(CardCondition.attackerWithinReach(1)).toBe(true);
        expect(CardCondition.attackerWithinReach(6)).toBe(true);
    });

    it("attackerWithinReach : faux si l'assaillant est trop loin ou si aucun dégât subi", () => {
        mountScene({tokens: [me(), foe(3 * GRID, 0)], logs: [damageLog({})]});
        expect(CardCondition.attackerWithinReach(1)).toBe(false);
        expect(CardCondition.attackerWithinReach(3)).toBe(true);

        mountScene({tokens: [me(), foe()], logs: []});
        expect(CardCondition.attackerWithinReach(1)).toBe(false);
    });

    it("tookSpellThisRound : vrai si une carte à coût de mana m'a ciblé ce round", () => {
        mountScene({tokens: [me()], logs: [damageLog({cardContent: {mana: -1}})]});
        expect(CardCondition.tookSpellThisRound()).toBe(true);

        mountScene({tokens: [me()], logs: [damageLog({cardContent: {mana: 2}})]});
        expect(CardCondition.tookSpellThisRound()).toBe(false);

        mountScene({tokens: [me()], logs: [{actorId: "foe", targetsId: ["autre"], round: 2, cardContent: {mana: -1}}]});
        expect(CardCondition.tookSpellThisRound()).toBe(false);
    });

    it("attackEvadedThisRound : vrai si l'une de mes attaques du round a été esquivée", () => {
        mountScene({tokens: [me(), foe()], logs: [damageLog({attacker: "me", targetActorId: "foe", targetTokenId: "tokFoe", value: 0, evasion: true})]});
        expect(CardCondition.attackEvadedThisRound()).toBe(true);

        mountScene({tokens: [me(), foe()], logs: [damageLog({attacker: "me", targetActorId: "foe", targetTokenId: "tokFoe"})]});
        expect(CardCondition.attackEvadedThisRound()).toBe(false);
    });

    it("hasPlayedCardThisRound / lastPlayedCardIs : basés sur mes logs du round", () => {
        mountScene({tokens: [me()], logs: [
            {actorId: "me", targetsId: [], round: 2, resultArray: {}, cardName: "FQCARDTITLE.Ambush", cardContent: {}},
            {actorId: "foe", targetsId: [], round: 2, resultArray: {}, cardName: "FQCARDTITLE.Other", cardContent: {}}
        ]});

        expect(CardCondition.hasPlayedCardThisRound()).toBe(true);
        expect(CardCondition.lastPlayedCardIs("FQCARDTITLE.Ambush")).toBe(true);
        expect(CardCondition.lastPlayedCardIs("FQCARDTITLE.Other")).toBe(false);

        mountScene({tokens: [me()], logs: []});
        expect(CardCondition.hasPlayedCardThisRound()).toBe(false);
        expect(CardCondition.lastPlayedCardIs("FQCARDTITLE.Ambush")).toBe(false);
    });

    // Le NOM DE CARTE, pas le nom du choix : un choix n'en porte le plus souvent
    // aucun (`name: ""`), si bien qu'une comparaison sur `cardContent.name` ne
    // reconnaîtrait jamais la carte que la condition vise.
    it("lastPlayedCardIs : ignore le nom du choix et une attaque dnd5e (sans carte)", () => {
        mountScene({tokens: [me()], logs: [
            {actorId: "me", targetsId: [], round: 2, resultArray: {}, cardName: null,
                cardContent: {name: "FQCARDTITLE.Ambush"}}
        ]});

        expect(CardCondition.lastPlayedCardIs("FQCARDTITLE.Ambush")).toBe(false);
    });

    it("lastPlayedCardCostMana : ma dernière carte du combat (tous rounds) coûtait du mana", () => {
        mountScene({tokens: [me()], logs: [
            {actorId: "me", targetsId: [], round: 1, resultArray: {}, cardContent: {mana: -2}}
        ]});
        expect(CardCondition.lastPlayedCardCostMana()).toBe(true);

        mountScene({tokens: [me()], logs: [
            {actorId: "me", targetsId: [], round: 1, resultArray: {}, cardContent: {mana: -2}},
            {actorId: "me", targetsId: [], round: 2, resultArray: {}, cardContent: {mana: ""}}
        ]});
        expect(CardCondition.lastPlayedCardCostMana()).toBe(false);

        mountScene({tokens: [me()], logs: []});
        expect(CardCondition.lastPlayedCardCostMana()).toBe(false);
    });

    it("lastPlayedDamageCardOnOtherTarget : dernière carte = attaque mono-cible sur une autre cible", () => {
        const enemy = foe();
        const propagationReady = {actorId: "me", targetsId: ["autre"], round: 2, resultArray: {},
            cardContent: {damage: "1d6", minReach: "1", nbTargets: ""}};

        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [propagationReady]});
        expect(CardCondition.lastPlayedDamageCardOnOtherTarget()).toBe(true);

        // même cible que la carte précédente → pas de propagation
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [{...propagationReady, targetsId: ["foe"]}]});
        expect(CardCondition.lastPlayedDamageCardOnOtherTarget()).toBe(false);

        // carte multi-cibles, sans dégâts ou sans portée → non éligible
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [{...propagationReady, cardContent: {damage: "1d6", minReach: "1", nbTargets: "3"}}]});
        expect(CardCondition.lastPlayedDamageCardOnOtherTarget()).toBe(false);
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [{...propagationReady, cardContent: {damage: "", minReach: "1", nbTargets: ""}}]});
        expect(CardCondition.lastPlayedDamageCardOnOtherTarget()).toBe(false);

        // aucune carte jouée ce round
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: []});
        expect(CardCondition.lastPlayedDamageCardOnOtherTarget()).toBe(false);
    });

    it("targetsDealtDamageThisRound : vrai si chaque cible a infligé des dégâts ce round", () => {
        const enemy = foe();
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [damageLog({attacker: "foe"})]});
        expect(CardCondition.targetsDealtDamageThisRound()).toBe(true);

        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [damageLog({attacker: "autre"})]});
        expect(CardCondition.targetsDealtDamageThisRound()).toBe(false);

        mountScene({tokens: [me(), enemy], targets: [], logs: [damageLog({attacker: "foe"})]});
        expect(CardCondition.targetsDealtDamageThisRound()).toBe(false);
    });

    it("targetsTookDamageThisRound : vrai si chaque cible a subi des dégâts ce round", () => {
        const enemy = foe();
        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [damageLog({attacker: "me", targetActorId: "foe", targetTokenId: "tokFoe"})]});
        expect(CardCondition.targetsTookDamageThisRound()).toBe(true);

        mountScene({tokens: [me(), enemy], targets: [enemy], logs: [damageLog({})]});
        expect(CardCondition.targetsTookDamageThisRound()).toBe(false);
    });
});

describe("CardCondition — portée et géométrie des cibles", () => {

    it("targetsWithinReach : lit la portée depuis le contenu de la carte", () => {
        const enemy = foe(2 * GRID, 0);
        mountScene({tokens: [me(), enemy], targets: [enemy]});

        expect(CardCondition.targetsWithinReach({minReach: "1", maxReach: "3"})).toBe(true);
        expect(CardCondition.targetsWithinReach({minReach: "1", maxReach: "1"})).toBe(false);
        expect(CardCondition.targetsWithinReach({minReach: "3", maxReach: "6"})).toBe(false);
    });

    it("targetsWithinReach : faux sans portée déclarée, sans cible ou sans token lanceur", () => {
        const enemy = foe();
        mountScene({tokens: [me(), enemy], targets: [enemy]});
        expect(CardCondition.targetsWithinReach({minReach: "", maxReach: ""})).toBe(false);
        expect(CardCondition.targetsWithinReach(undefined)).toBe(false);

        mountScene({tokens: [me()], targets: []});
        expect(CardCondition.targetsWithinReach({minReach: "1", maxReach: "3"})).toBe(false);

        mountScene({tokens: [enemy], targets: [enemy]});
        expect(CardCondition.targetsWithinReach({minReach: "1", maxReach: "3"})).toBe(false);
    });

    it("targetsWithinReach : une portée démarrant à 0 est déclarée (maxReach porte la décision)", () => {
        const enemy = foe(GRID, 0);
        mountScene({tokens: [me(), enemy], targets: [enemy]});

        expect(CardCondition.targetsWithinReach({minReach: "0", maxReach: "6"})).toBe(true);
    });

    it("targetsAlignedWithSelf : toutes les cibles sur ma colonne ou ma ligne", () => {
        const a = makeToken({id: "a", actorId: "a", x: 0, y: 2 * GRID});
        const b = makeToken({id: "b", actorId: "b", x: 0, y: 5 * GRID});
        mountScene({tokens: [me(), a, b], targets: [a, b]});
        expect(CardCondition.targetsAlignedWithSelf()).toBe(true);

        const c = makeToken({id: "c", actorId: "c", x: GRID, y: 2 * GRID});
        mountScene({tokens: [me(), a, c], targets: [a, c]});
        expect(CardCondition.targetsAlignedWithSelf()).toBe(false);

        mountScene({tokens: [me()], targets: []});
        expect(CardCondition.targetsAlignedWithSelf()).toBe(false);
    });

    it("targetsDiagonalWithSelf : toutes les cibles à |Δx| = |Δy| de mon token", () => {
        const diag = makeToken({id: "d", actorId: "d", x: 2 * GRID, y: 2 * GRID});
        mountScene({tokens: [me(), diag], targets: [diag]});
        expect(CardCondition.targetsDiagonalWithSelf()).toBe(true);

        const off = makeToken({id: "o", actorId: "o", x: 2 * GRID, y: GRID});
        mountScene({tokens: [me(), off], targets: [off]});
        expect(CardCondition.targetsDiagonalWithSelf()).toBe(false);
    });

    it("targetsWithinSquare : toutes les cibles dans un carré de n×n cases", () => {
        const a = makeToken({id: "a", actorId: "a", x: 0, y: 0});
        const b = makeToken({id: "b", actorId: "b", x: 2 * GRID, y: 2 * GRID});
        mountScene({tokens: [a, b], targets: [a, b]});
        expect(CardCondition.targetsWithinSquare(3)).toBe(true);
        expect(CardCondition.targetsWithinSquare(2)).toBe(false);

        mountScene({tokens: [], targets: []});
        expect(CardCondition.targetsWithinSquare(3)).toBe(false);
    });

    it("targetsAlignedOnOneSide : cibles sur ma colonne/ligne et toutes du même côté", () => {
        const myTok = me();
        const near = makeToken({id: "n", actorId: "n", x: 0, y: 2 * GRID});
        const far = makeToken({id: "f", actorId: "f", x: 0, y: 4 * GRID});
        mountScene({tokens: [myTok, near, far], targets: [near, far]});
        expect(CardCondition.targetsAlignedOnOneSide()).toBe(true);

        // de part et d'autre de mon token → refusé
        const behind = makeToken({id: "b", actorId: "b", x: 0, y: -2 * GRID});
        mountScene({tokens: [myTok, near, behind], targets: [near, behind]});
        expect(CardCondition.targetsAlignedOnOneSide()).toBe(false);

        // hors de ma colonne/ligne → refusé
        const offAxis = makeToken({id: "o", actorId: "o", x: GRID, y: 2 * GRID});
        mountScene({tokens: [myTok, offAxis], targets: [offAxis]});
        expect(CardCondition.targetsAlignedOnOneSide()).toBe(false);

        mountScene({tokens: [myTok], targets: []});
        expect(CardCondition.targetsAlignedOnOneSide()).toBe(false);
    });

    it("targetsAdjacentPair : exactement deux cibles orthogonalement adjacentes", () => {
        const a = makeToken({id: "a", actorId: "a", x: 0, y: 0});
        const b = makeToken({id: "b", actorId: "b", x: GRID, y: 0});
        mountScene({tokens: [a, b], targets: [a, b]});
        expect(CardCondition.targetsAdjacentPair()).toBe(true);

        const diag = makeToken({id: "d", actorId: "d", x: GRID, y: GRID});
        mountScene({tokens: [a, diag], targets: [a, diag]});
        expect(CardCondition.targetsAdjacentPair()).toBe(false);

        mountScene({tokens: [a], targets: [a]});
        expect(CardCondition.targetsAdjacentPair()).toBe(false);
    });

    it("targetsClustered : une cible centrale touche toutes les autres", () => {
        const center = makeToken({id: "c", actorId: "c", x: GRID, y: GRID});
        const up = makeToken({id: "u", actorId: "u", x: GRID, y: 0});
        const left = makeToken({id: "l", actorId: "l", x: 0, y: GRID});
        mountScene({tokens: [center, up, left], targets: [center, up, left]});
        expect(CardCondition.targetsClustered()).toBe(true);

        const far = makeToken({id: "f", actorId: "f", x: 5 * GRID, y: 5 * GRID});
        mountScene({tokens: [center, up, far], targets: [center, up, far]});
        expect(CardCondition.targetsClustered()).toBe(false);

        mountScene({tokens: [center], targets: [center]});
        expect(CardCondition.targetsClustered()).toBe(true);
    });
});

describe("CardCondition — effets actifs", () => {

    it("selfHasEffect : sans liste, vrai dès qu'un effet est porté ; avec liste, filtre par nom", () => {
        mountScene({character: {id: "me", effects: [{name: "Burn"}]}});
        expect(CardCondition.selfHasEffect()).toBe(true);
        expect(CardCondition.selfHasEffect(["Burn"])).toBe(true);
        expect(CardCondition.selfHasEffect(["Frost"])).toBe(false);

        mountScene({character: {id: "me", effects: []}});
        expect(CardCondition.selfHasEffect()).toBe(false);
    });

    it("targetsHaveEffect : au moins une cible portant minCount effets parmi les noms", () => {
        const cursed = makeToken({id: "a", actorId: "a", effects: [{name: "Curse"}]});
        const clean = makeToken({id: "b", actorId: "b", effects: []});
        mountScene({tokens: [cursed, clean], targets: [cursed, clean]});
        expect(CardCondition.targetsHaveEffect(["Curse"])).toBe(true);
        expect(CardCondition.targetsHaveEffect(["Burn"])).toBe(false);

        const doubly = makeToken({id: "d", actorId: "d", effects: [{name: "Burn"}, {name: "Frost"}]});
        mountScene({tokens: [doubly], targets: [doubly]});
        expect(CardCondition.targetsHaveEffect(["Burn", "Frost", "Curse"], 2)).toBe(true);
        expect(CardCondition.targetsHaveEffect(["Burn", "Frost", "Curse"], 3)).toBe(false);

        mountScene({tokens: [], targets: []});
        expect(CardCondition.targetsHaveEffect(["Curse"])).toBe(false);
    });

    it("targetsHaveAllEffects : une même cible doit porter tous les effets nommés", () => {
        const burning = makeToken({id: "a", actorId: "a", effects: [{name: "Burn"}]});
        const earthed = makeToken({id: "b", actorId: "b", effects: [{name: "Earth Effect"}]});
        mountScene({tokens: [burning, earthed], targets: [burning, earthed]});
        // Les deux éléments sont présents dans la sélection, mais séparément :
        // c'est précisément ce que la garde de combinaison doit refuser.
        expect(CardCondition.targetsHaveAllEffects(["Burn", "Earth Effect"])).toBe(false);

        const both = makeToken({id: "c", actorId: "c", effects: [{name: "Burn"}, {name: "Earth Effect"}]});
        mountScene({tokens: [both], targets: [both]});
        expect(CardCondition.targetsHaveAllEffects(["Burn", "Earth Effect"])).toBe(true);

        // Un empilement du même élément ne remplace jamais l'élément manquant.
        const twice = makeToken({id: "d", actorId: "d", effects: [{name: "Burn"}, {name: "Burn"}]});
        mountScene({tokens: [twice], targets: [twice]});
        expect(CardCondition.targetsHaveAllEffects(["Burn", "Earth Effect"])).toBe(false);

        mountScene({tokens: [], targets: []});
        expect(CardCondition.targetsHaveAllEffects(["Burn"])).toBe(false);
    });

    it("targetsHaveEffect sans liste : n'importe quel effet porté par une cible", () => {
        const buffed = makeToken({id: "a", actorId: "a", effects: [{name: "Quelconque"}]});
        mountScene({tokens: [buffed], targets: [buffed]});
        expect(CardCondition.targetsHaveEffect()).toBe(true);

        const clean = makeToken({id: "b", actorId: "b", effects: []});
        mountScene({tokens: [clean], targets: [clean]});
        expect(CardCondition.targetsHaveEffect()).toBe(false);
    });

    it("selfEffectCount : compte les effets du lanceur, filtrés par nom si une liste est fournie", () => {
        mountScene({character: {id: "me", effects: [{name: "Curse"}, {name: "Curse"}, {name: "Burn"}]}});
        expect(CardCondition.selfEffectCount(["Curse"])).toBe(2);
        expect(CardCondition.selfEffectCount()).toBe(3);
        expect(CardCondition.selfEffectCount(["Frost"])).toBe(0);

        mountScene({character: {id: "me", effects: []}});
        expect(CardCondition.selfEffectCount(["Curse"])).toBe(0);
    });
});

describe("CardCondition — seuil de PV des cibles (exécution)", () => {

    /** Cible avec des PV restants explicites (le prédicat lit system.attributes.hp.value). */
    function targetWithHp(id, hp) {
        return {id, actor: {id, system: {attributes: {hp: {value: hp}}}}};
    }

    it("targetsHpBelow : vrai si CHAQUE cible mourrait au seuil donné (strictement supérieur aux PV)", () => {
        mountScene({targets: [targetWithHp("a", 5)]});
        expect(CardCondition.targetsHpBelow(6)).toBe(true);
        // Égalité : 5 dégâts sur 5 PV restants ne satisfont pas « supérieur aux PV ».
        expect(CardCondition.targetsHpBelow(5)).toBe(false);

        mountScene({targets: [targetWithHp("a", 5), targetWithHp("b", 10)]});
        expect(CardCondition.targetsHpBelow(6)).toBe(false);
        expect(CardCondition.targetsHpBelow(11)).toBe(true);
    });

    it("targetsHpBelow : faux sans cible sélectionnée ou sans PV lisibles", () => {
        mountScene({targets: []});
        expect(CardCondition.targetsHpBelow(999)).toBe(false);

        mountScene({targets: [{id: "x", actor: {id: "x"}}]});
        expect(CardCondition.targetsHpBelow(999)).toBe(false);
    });
});

describe("CardCondition — état du personnage", () => {

    it("counterWithinCap / counterEquals : compteurs des flags FQ", () => {
        mountScene({character: {id: "me", flags: {fq: {bladeCharging: 10}}}});
        expect(CardCondition.counterWithinCap("bladeCharging", 2, 12)).toBe(true);
        expect(CardCondition.counterWithinCap("bladeCharging", "3", 12)).toBe(false);
        expect(CardCondition.counterEquals("bladeCharging", 10)).toBe(true);
        expect(CardCondition.counterEquals("bladeCharging", 12)).toBe(false);

        mountScene({character: {id: "me"}});
        expect(CardCondition.counterWithinCap("bladeCharging", 12, 12)).toBe(true);
        expect(CardCondition.counterEquals("bladeCharging", 0)).toBe(true);
    });

    it("targetsAreMinionType : les cibles sont toutes des sbires vivants du type demandé", () => {
        globalThis.FqCardEngineModule = {...globalThis.FqCardEngineModule, moduleName: "fq-card-engine"};
        const giant = stampedMinionToken({id: "tokGiant", type: "giantSkeleton"});
        const bones = stampedMinionToken({id: "tokBones", type: "skeleton"});
        const dead = stampedMinionToken({id: "tokDead", type: "giantSkeleton", hp: 0});
        const other = stampedMinionToken({id: "tokOther", type: "giantSkeleton", summoner: "someoneElse"});

        mountScene({tokens: [giant, bones, dead, other], targets: [giant]});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(true);

        // Une cible de la mauvaise élite, morte, ou invoquée par autrui : la carte reste fermée.
        mountScene({tokens: [giant, bones, dead, other], targets: [bones]});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(false);

        mountScene({tokens: [giant, bones, dead, other], targets: [dead]});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(false);

        mountScene({tokens: [giant, bones, dead, other], targets: [other]});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(false);

        // Une seule cible hors du lot suffit à refuser, et l'absence de cible aussi.
        mountScene({tokens: [giant, bones, dead, other], targets: [giant, bones]});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(false);

        mountScene({tokens: [giant, bones, dead, other], targets: []});
        expect(CardCondition.targetsAreMinionType("giantSkeleton")).toBe(false);
    });

    it("minionsAtLeast : compteur de sbires au minimum requis", () => {
        mountScene({character: {id: "me", system: {fq: {minions: {sacrificedMinion: 2}}}}});
        expect(CardCondition.minionsAtLeast("sacrificedMinion")).toBe(true);
        expect(CardCondition.minionsAtLeast("sacrificedMinion", 3)).toBe(false);

        mountScene({character: {id: "me"}});
        expect(CardCondition.minionsAtLeast("sacrificedMinion")).toBe(false);
    });

    it("hasMana / missingMana : réserve de mana", () => {
        mountScene({character: {id: "me", system: {fq: {mana: {value: 2, max: 5}}}}});
        expect(CardCondition.hasMana()).toBe(true);
        expect(CardCondition.hasMana(3)).toBe(false);
        expect(CardCondition.missingMana()).toBe(true);

        mountScene({character: {id: "me", system: {fq: {mana: {value: 5, max: 5}}}}});
        expect(CardCondition.missingMana()).toBe(false);

        mountScene({character: {id: "me"}});
        expect(CardCondition.hasMana()).toBe(false);
        expect(CardCondition.missingMana()).toBe(false);
    });

    it("missingHp : points de vie manquants", () => {
        mountScene({character: {id: "me", system: {attributes: {hp: {value: 3, max: 10}}}}});
        expect(CardCondition.missingHp()).toBe(true);

        mountScene({character: {id: "me", system: {attributes: {hp: {value: 10, max: 10}}}}});
        expect(CardCondition.missingHp()).toBe(false);

        expect(CardCondition.missingHp({system: {attributes: {hp: {value: 1, max: 2}}}})).toBe(true);
        expect(CardCondition.missingHp(undefined)).toBe(false);
    });

    it("hasExhaustion : rangs d'épuisement portés par le personnage", () => {
        mountScene({character: {id: "me", system: {attributes: {exhaustion: 2}}}});
        expect(CardCondition.hasExhaustion()).toBe(true);
        expect(CardCondition.hasExhaustion(2)).toBe(true);
        expect(CardCondition.hasExhaustion(3)).toBe(false);

        mountScene({character: {id: "me", system: {attributes: {exhaustion: 0}}}});
        expect(CardCondition.hasExhaustion()).toBe(false);

        mountScene({character: {id: "me"}});
        expect(CardCondition.hasExhaustion()).toBe(false);
    });

    it("hasEquippedShield : un bouclier équipé, et rien d’autre, satisfait la condition", () => {
        const shield = {type: "equipment", system: {equipped: true, type: {value: "shield"}}};
        const armor = {type: "equipment", system: {equipped: true, type: {value: "heavy"}}};
        const stowedShield = {type: "equipment", system: {equipped: false, type: {value: "shield"}}};
        const shieldWeapon = {type: "weapon", system: {equipped: true, type: {value: "shield"}}};

        mountScene({character: {id: "me", items: [armor, shield]}});
        expect(CardCondition.hasEquippedShield()).toBe(true);

        mountScene({character: {id: "me", items: [armor, stowedShield, shieldWeapon]}});
        expect(CardCondition.hasEquippedShield()).toBe(false);

        expect(CardCondition.hasEquippedShield({items: [shield]})).toBe(true);
        expect(CardCondition.hasEquippedShield({items: []})).toBe(false);
        expect(CardCondition.hasEquippedShield(undefined)).toBe(false);
    });

    it("equippedMeleeWeaponActionCost : coût de la première arme de mêlée équipée, 0 sans arme", () => {
        const sword = {type: "weapon", system: {equipped: true, type: {value: "simpleM"}, fq: {action: -9}}};
        const bow = {type: "weapon", system: {equipped: true, type: {value: "simpleR"}, fq: {action: -10}}};
        const stowedAxe = {type: "weapon", system: {equipped: false, type: {value: "martialM"}, fq: {action: -12}}};

        mountScene({character: {id: "me", items: [bow, sword]}});
        expect(CardCondition.equippedMeleeWeaponActionCost()).toBe(9);

        mountScene({character: {id: "me", items: [bow, stowedAxe]}});
        expect(CardCondition.equippedMeleeWeaponActionCost()).toBe(0);

        expect(CardCondition.equippedMeleeWeaponActionCost({items: [sword]})).toBe(9);
        expect(CardCondition.equippedMeleeWeaponActionCost(undefined)).toBe(0);
    });
});

describe("CardCondition.isReactiveReady — verdict du glow des réactifs", () => {

    function reactiveChoice(overrides = {}) {
        return {reactive: true, customEvals: [], ...overrides};
    }

    it("faux si le choix n'est pas réactif ou hors combat", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "foe"}};
        expect(CardCondition.isReactiveReady(reactiveChoice({reactive: false}))).toBe(false);
        expect(CardCondition.isReactiveReady(undefined)).toBe(false);

        mountScene({tokens: [me()], logs: null});
        expect(CardCondition.isReactiveReady(reactiveChoice())).toBe(false);
    });

    it("faux pendant mon propre tour, vrai hors de mon tour", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "me"}};
        expect(CardCondition.isReactiveReady(reactiveChoice())).toBe(false);

        game.combat.combatant = {actor: {id: "foe"}};
        expect(CardCondition.isReactiveReady(reactiveChoice())).toBe(true);
    });

    it("vrai quand le combat n'a pas encore de combattant actif", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = undefined;

        expect(CardCondition.isReactiveReady(reactiveChoice())).toBe(true);
    });

    it("reactiveBlockedByOwnTurn : la règle partagée avec le garde de jouabilité", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "me"}};
        expect(CardCondition.reactiveBlockedByOwnTurn(reactiveChoice())).toBe(true);
        expect(CardCondition.reactiveBlockedByOwnTurn(reactiveChoice({reactive: false}))).toBe(false);
        expect(CardCondition.reactiveBlockedByOwnTurn(undefined)).toBe(false);

        game.combat.combatant = {actor: {id: "foe"}};
        expect(CardCondition.reactiveBlockedByOwnTurn(reactiveChoice())).toBe(false);

        game.combat.combatant = undefined;
        expect(CardCondition.reactiveBlockedByOwnTurn(reactiveChoice())).toBe(false);

        mountScene({tokens: [me()], logs: null});
        expect(CardCondition.reactiveBlockedByOwnTurn(reactiveChoice())).toBe(false);
    });

    it("suit le verdict des customEvals : échec ou erreur = non prêt", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "foe"}};

        expect(CardCondition.isReactiveReady(reactiveChoice({customEvals: [{script: "true"}]}))).toBe(true);
        expect(CardCondition.isReactiveReady(reactiveChoice({customEvals: [{script: "false"}]}))).toBe(false);
        expect(CardCondition.isReactiveReady(reactiveChoice({customEvals: [{script: "nExistePas("}]}))).toBe(false);
    });

    it("évalue les variables XXX/YYY à 1 sans muter le choix d'origine", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "foe"}};
        const choice = reactiveChoice({customEvals: [{script: "XXX + YYY === 2"}]});

        expect(CardCondition.isReactiveReady(choice)).toBe(true);
        expect(choice.customEvals[0].script).toBe("XXX + YYY === 2");
    });

    it("substitue les valeurs demandées à XXX/YYY — celles d'une carte préparée", () => {
        mountScene({tokens: [me()], logs: []});
        game.combat.combatant = {actor: {id: "foe"}};
        const choice = reactiveChoice({customEvals: [{script: "XXX + YYY === 7"}]});

        expect(CardCondition.isReactiveReady(choice, undefined, {xValue: 3, yValue: 4})).toBe(true);
        expect(CardCondition.isReactiveReady(choice, undefined, {xValue: 1, yValue: 4})).toBe(false);
        expect(choice.customEvals[0].script).toBe("XXX + YYY === 7");
    });
});

describe("CardCondition — pioche et main", () => {

    it("deckHasCards : cartes restantes dans la pioche d'origine", () => {
        const card = {source: {cards: {size: 10}, drawnCards: [1, 2, 3]}};
        expect(CardCondition.deckHasCards(card)).toBe(true);
        expect(CardCondition.deckHasCards(card, 7)).toBe(true);
        expect(CardCondition.deckHasCards(card, 8)).toBe(false);
        expect(CardCondition.deckHasCards(undefined)).toBe(false);
    });

    it("deckSizeAtLeast : taille du deck constitué, cartes déjà tirées comprises", () => {
        // `deckHasCards` ne verrait ici que 7 cartes piochables ; la taille du deck,
        // elle, en compte 10 — les 3 déjà tirées y restent le temps du combat.
        const card = {source: {cards: {size: 10}, drawnCards: [1, 2, 3]}};
        expect(CardCondition.deckSizeAtLeast(card, 10)).toBe(true);
        expect(CardCondition.deckSizeAtLeast(card, 11)).toBe(false);
        expect(CardCondition.deckHasCards(card, 10)).toBe(false);
        expect(CardCondition.deckSizeAtLeast(undefined, 1)).toBe(false);
    });

    it("handHasOtherCards : autres cartes dans la main (la carte exclue)", () => {
        const card = {parent: {cards: {size: 3}}};
        expect(CardCondition.handHasOtherCards(card)).toBe(true);
        expect(CardCondition.handHasOtherCards(card, 2)).toBe(true);
        expect(CardCondition.handHasOtherCards(card, 3)).toBe(false);
        expect(CardCondition.handHasOtherCards({parent: {cards: {size: 1}}})).toBe(false);
    });
});

describe("CardCondition — tour et immobilité des cibles", () => {

    /**
     * Installe une scène de combat où `combatantTokenId` est le combattant dont
     * c'est le tour, et pose sur le document de chaque cible l'historique de
     * déplacement fourni (celui que Foundry vide au début de chaque tour).
     */
    function mountTurn({targets = [], combatantTokenId, moved = false, round = 2} = {}) {
        for (const target of targets) {
            target.document.movementHistory = moved ? [{x: target.x, y: target.y}] : [];
        }
        mountScene({tokens: targets, targets, logs: [], round});
        game.combat = {id: "c1", round, combatant: {tokenId: combatantTokenId}, flags: {fq: {logs: []}}};
    }

    it("targetsAreCurrentCombatant : vrai quand la cible est le combattant dont c'est le tour", () => {
        const target = foe();
        mountTurn({targets: [target], combatantTokenId: target.id});

        expect(CardCondition.targetsAreCurrentCombatant()).toBe(true);
    });

    it("targetsAreCurrentCombatant : faux pour un autre combattant, sans cible ou hors combat", () => {
        const target = foe();
        mountTurn({targets: [target], combatantTokenId: "tokAutre"});
        expect(CardCondition.targetsAreCurrentCombatant()).toBe(false);

        mountTurn({targets: [], combatantTokenId: target.id});
        expect(CardCondition.targetsAreCurrentCombatant()).toBe(false);

        mountTurn({targets: [target], combatantTokenId: target.id});
        game.combat = null;
        expect(CardCondition.targetsAreCurrentCombatant()).toBe(false);
    });

    it("targetsHaveNotMovedThisTurn : vrai tant que l'historique de déplacement de la cible est vide", () => {
        const target = foe();
        mountTurn({targets: [target], combatantTokenId: target.id});

        expect(CardCondition.targetsHaveNotMovedThisTurn()).toBe(true);
    });

    it("targetsHaveNotMovedThisTurn : faux dès que la cible a laissé une trace de déplacement", () => {
        const target = foe();
        mountTurn({targets: [target], combatantTokenId: target.id, moved: true});

        expect(CardCondition.targetsHaveNotMovedThisTurn()).toBe(false);
    });

    it("targetsHaveNotMovedThisTurn : faux si une seule des cibles a bougé", () => {
        const immobile = foe();
        const mobile = makeToken({id: "tokFoe2", actorId: "foe2", x: 2 * GRID, y: 0});
        mountTurn({targets: [immobile, mobile], combatantTokenId: immobile.id});
        mobile.document.movementHistory = [{x: 0, y: 0}];

        expect(CardCondition.targetsHaveNotMovedThisTurn()).toBe(false);
    });

    it("targetsHaveNotMovedThisTurn : faux sans cible et hors combat (personne ne vide l'historique)", () => {
        const target = foe();
        mountTurn({targets: [], combatantTokenId: "tokFoe"});
        expect(CardCondition.targetsHaveNotMovedThisTurn()).toBe(false);

        mountTurn({targets: [target], combatantTokenId: target.id});
        game.combat = null;
        expect(CardCondition.targetsHaveNotMovedThisTurn()).toBe(false);
    });
});

describe("CardCondition — fenêtre « depuis la fin de mon tour »", () => {

    /**
     * Installe un combat dont l'ordre d'initiative est `me` (index 0) puis deux
     * adversaires, positionné au round et au tour donnés, avec les logs fournis.
     */
    function mountWindow({round = 3, turn = 1, logs = []} = {}) {
        game.user.character = {id: "me"};
        game.combat = {
            id: "c1", round, turn,
            turns: [{actorId: "me"}, {actorId: "foe"}, {actorId: "foe2"}],
            flags: {fq: {logs}}
        };
    }

    /** Entrée de log : `actorId` joue une carte réactive ou non, à ce round et ce tour. */
    function playLog({actorId = "me", reactive = true, round = 3, turn = 1}) {
        return {actorId, targetsId: [], round, turn, resultArray: {}, cardContent: {reactive}};
    }

    it("compte les réactifs joués après mon tour dans le round courant", () => {
        mountWindow({round: 3, turn: 2, logs: [playLog({turn: 1}), playLog({turn: 2})]});

        expect(CardCondition.reactivesPlayedSinceMyTurn(2)).toBe(true);
        expect(CardCondition.reactivesPlayedSinceMyTurn(3)).toBe(false);
    });

    it("franchit le passage de round : les réactifs du round précédent, après mon tour, comptent", () => {
        mountWindow({round: 4, turn: 0, logs: [playLog({round: 3, turn: 1}), playLog({round: 3, turn: 2})]});

        expect(CardCondition.reactivesPlayedSinceMyTurn(2)).toBe(true);
    });

    it("écarte les cartes jouées pendant mon propre tour", () => {
        mountWindow({round: 3, turn: 2, logs: [playLog({turn: 0}), playLog({turn: 0}), playLog({turn: 2})]});

        expect(CardCondition.reactivesPlayedSinceMyTurn(2)).toBe(false);
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(true);
    });

    it("écarte les cartes antérieures à mon dernier tour", () => {
        mountWindow({round: 3, turn: 2, logs: [playLog({round: 2, turn: 2}), playLog({round: 3, turn: 1})]});

        expect(CardCondition.reactivesPlayedSinceMyTurn(2)).toBe(false);
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(true);
    });

    it("ne compte ni les cartes non réactives, ni celles des autres combattants", () => {
        mountWindow({round: 3, turn: 2, logs: [
            playLog({turn: 1, reactive: false}),
            playLog({turn: 1, actorId: "foe"}),
            playLog({turn: 2})
        ]});

        expect(CardCondition.reactivesPlayedSinceMyTurn(2)).toBe(false);
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(true);
    });

    it("faux hors combat, sans personnage, ou si le personnage ne combat pas", () => {
        mountWindow({logs: [playLog({turn: 1})]});
        game.combat = null;
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(false);

        mountWindow({logs: [playLog({turn: 1})]});
        game.user.character = null;
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(false);

        mountWindow({logs: [playLog({turn: 1})]});
        game.combat.turns = [{actorId: "foe"}, {actorId: "foe2"}];
        expect(CardCondition.reactivesPlayedSinceMyTurn(1)).toBe(false);
    });
});

describe("CardCondition — effets portés par le camp adverse", () => {

    /** Document token de scène : camp (disposition), inscription au combat et effets portés. */
    function combatToken({id, actorId, disposition, effects = []}) {
        return {id, actorId, disposition, actor: {id: actorId, effects}};
    }

    /** Installe une scène dont TOUS les tokens donnés sont inscrits au combat. */
    function mountSides(tokens, {combatants = tokens} = {}) {
        game.user.character = {id: "me"};
        game.canvas = {scene: {dimensions: {size: GRID}, tokens}};
        game.combat = {round: 1, combatants: combatants.map(t => ({tokenId: t.id}))};
    }

    const caster = () => combatToken({id: "tokMe", actorId: "me", disposition: 1});

    it("combatEnemiesEffectCount : additionne les effets nommés de tous les ennemis du combat", () => {
        mountSides([
            caster(),
            combatToken({id: "tokFoe1", actorId: "foe1", disposition: -1, effects: [{name: "Curse"}, {name: "Curse"}]}),
            combatToken({id: "tokFoe2", actorId: "foe2", disposition: -1, effects: [{name: "Curse"}, {name: "Burn"}]})
        ]);

        expect(CardCondition.combatEnemiesEffectCount(["Curse"])).toBe(3);
        expect(CardCondition.combatEnemiesEffectCount()).toBe(4);
        expect(CardCondition.combatEnemiesEffectCount(["Frost"])).toBe(0);
    });

    it("combatEnemiesEffectCount : ignore les alliés, le lanceur et les tokens hors combat", () => {
        const outsider = combatToken({id: "tokFoe3", actorId: "foe3", disposition: -1, effects: [{name: "Curse"}]});
        const ally = combatToken({id: "tokAlly", actorId: "ally", disposition: 1, effects: [{name: "Curse"}]});
        const cursedCaster = combatToken({id: "tokMe", actorId: "me", disposition: 1, effects: [{name: "Curse"}]});
        const foe = combatToken({id: "tokFoe1", actorId: "foe1", disposition: -1, effects: [{name: "Curse"}]});
        mountSides([cursedCaster, ally, foe, outsider], {combatants: [cursedCaster, ally, foe]});

        expect(CardCondition.combatEnemiesEffectCount(["Curse"])).toBe(1);
    });

    it("combatEnemiesEffectCount : 0 sans token du lanceur sur la scène et hors combat", () => {
        mountSides([combatToken({id: "tokFoe1", actorId: "foe1", disposition: -1, effects: [{name: "Curse"}]})]);
        expect(CardCondition.combatEnemiesEffectCount(["Curse"])).toBe(0);

        mountSides([caster(), combatToken({id: "tokFoe1", actorId: "foe1", disposition: -1, effects: [{name: "Curse"}]})]);
        game.combat = null;
        expect(CardCondition.combatEnemiesEffectCount(["Curse"])).toBe(0);
    });
});

/**
 * Construit un document de jeton de sbire estampillé, dont l'acteur porte (ou
 * non) une arme de mêlée équipée exposant une activité de dégâts.
 *
 * @param {object}  [options]
 * @param {string}  [options.formula]  - La formule de dégâts de l'activité.
 * @param {string}  [options.type]     - Le type de sbire estampillé.
 * @param {string}  [options.summoner] - L'id de l'invocateur estampillé.
 * @param {number}  [options.hp]       - Les points de vie restants.
 * @param {boolean} [options.weapon]   - False pour un sbire sans arme équipée.
 *
 * @returns {object} Le document de jeton.
 */
function minionToken({formula = "1d6", type = "beast", summoner = "me", hp = 10, weapon = true} = {}) {
    const activity = {type: "damage", getDamageConfig: () => ({rolls: [{parts: [formula]}]})};
    const items = weapon ? [{
        type: "weapon",
        system: {
            equipped: true,
            type: {value: "natural"},
            activities: {getByType: t => (t === "damage" ? [activity] : [])}
        }
    }] : [];
    return {
        actor: {
            items,
            flags: {"fq-card-engine": {minionType: type, summonerId: summoner}},
            system: {attributes: {hp: {value: hp}}}
        }
    };
}

describe("CardCondition — dé d'arme du sbire", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
        game.user.character = {id: "me"};
    });

    afterEach(() => {
        delete globalThis.FqCardEngineModule;
    });

    it("décompose le dé de l'arme du sbire vivant : 2d8 → 2 dés de 8 faces", () => {
        game.canvas = {scene: {tokens: [minionToken({formula: "2d8"})]}};

        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 2, faces: 8});
    });

    it("compte un seul dé quand la formule n'en précise pas la quantité", () => {
        game.canvas = {scene: {tokens: [minionToken({formula: "d10"})]}};

        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 1, faces: 10});
    });

    it("ignore un sbire mort, d'un autre type ou d'un autre invocateur", () => {
        game.canvas = {scene: {tokens: [minionToken({hp: 0})]}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});

        game.canvas = {scene: {tokens: [minionToken({type: "skeleton"})]}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});

        game.canvas = {scene: {tokens: [minionToken({summoner: "someoneElse"})]}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});
    });

    it("renvoie un dé nul sans sbire, sans arme équipée, ou sans dé dans la formule", () => {
        game.canvas = {scene: {tokens: []}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});

        game.canvas = {scene: {tokens: [minionToken({weapon: false})]}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});

        game.canvas = {scene: {tokens: [minionToken({formula: "4"})]}};
        expect(CardCondition.minionWeaponDamageDice("beast")).toEqual({number: 0, faces: 0});
    });
});
