import {beforeAll, describe, expect, it} from "vitest";
import path from "node:path";
import {buildUatPlan, loadDeckVariants, loadMinions} from "../script/uat/plan.mjs";
import {loadClassCatalog} from "../script/uat/classes.mjs";
import {loadMonsterIndex} from "../script/uat/monsters.mjs";

/**
 * Couvre l'assemblage complet du plan UAT (UAT-01, UAT-03) : déterminisme à
 * l'octet près, priorité systématique des sept surcharges sur le tirage,
 * multi-classe, ordre de combat stable, et les quatre bornes qui doivent
 * lever une erreur explicite avant toute écriture sur disque.
 */

const REPO_ROOT = process.cwd();
const INDEX_PATH = path.join(REPO_ROOT, "tests", "script", "uat", "monsters-index.json");

let catalog;
let monsterIndex;
let minions;
let deckVariants;

beforeAll(async () => {
    catalog = await loadClassCatalog(REPO_ROOT);
    monsterIndex = loadMonsterIndex(INDEX_PATH);
    minions = await loadMinions(REPO_ROOT);
    deckVariants = await loadDeckVariants(REPO_ROOT);
});

function build(seed, options = {}) {
    return buildUatPlan({seed, options, catalog, monsterIndex, minions, deckVariants});
}

describe("buildUatPlan — déterminisme", () => {
    it("deux plans de même graine et mêmes options sont identiques à l'octet près", () => {
        const options = {class: "witch", level: 5, difficulty: "hard", placement: "line", allies: 1, regions: 2};
        const a = JSON.stringify(build(4242, options));
        const b = JSON.stringify(build(4242, options));
        expect(a).toBe(b);
    });

    it("un plan entièrement tiré (aucune surcharge) est lui aussi identique à l'octet près à graine égale", () => {
        const a = JSON.stringify(build(777));
        const b = JSON.stringify(build(777));
        expect(a).toBe(b);
    });

    it("ne contient aucune clé d'horodatage", () => {
        const serialized = JSON.stringify(build(1));
        expect(serialized).not.toMatch(/generatedAt/i);
        expect(serialized).not.toMatch(/timestamp/i);
        expect(serialized).not.toMatch(/createdAt/i);
    });
});

describe("buildUatPlan — priorité des surcharges (les sept axes)", () => {
    it("class: la classe imposée se retrouve en classe principale", () => {
        const plan = build(1, {class: "guardian", level: 4});
        expect(plan.hero.classes[0].slug).toBe("guardian");
        expect(plan.overrides.class).toBe("guardian:4");
    });

    it("level: le niveau imposé se retrouve dans overrides et dans la somme des classes", () => {
        const plan = build(1, {class: "witch", level: 17});
        expect(plan.overrides.level).toBe(17);
        expect(plan.hero.classes.reduce((sum, c) => sum + c.level, 0)).toBe(17);
    });

    it("enemies (compté): le nombre imposé se retrouve exactement", () => {
        const plan = build(1, {enemies: 4});
        expect(plan.enemies).toHaveLength(4);
        expect(plan.overrides.enemies).toBe(4);
    });

    it("enemies (liste explicite): les ennemis nommés se retrouvent tels quels", () => {
        const plan = build(1, {enemies: "Goblin x2, Ogre"});
        expect(plan.enemies.map(e => e.name).sort()).toEqual(["Goblin", "Goblin", "Ogre"].sort());
        expect(plan.overrides.enemies).toBe("Goblin x2, Ogre x1");
    });

    it("difficulty: la difficulté imposée se retrouve dans overrides", () => {
        const plan = build(1, {difficulty: "deadly"});
        expect(plan.overrides.difficulty).toBe("deadly");
    });

    it("placement: le motif imposé se retrouve dans overrides et dans plan.placement", () => {
        const plan = build(1, {placement: "melee"});
        expect(plan.overrides.placement).toBe("melee");
        expect(plan.placement.pattern).toBe("melee");
    });

    it("allies: le nombre imposé se retrouve exactement", () => {
        const plan = build(1, {allies: 2});
        expect(plan.allies).toHaveLength(2);
        expect(plan.overrides.allies).toBe(2);
    });

    it("regions: le nombre imposé se retrouve exactement", () => {
        const plan = build(1, {regions: 0});
        expect(plan.regions).toHaveLength(0);
        expect(plan.overrides.regions).toBe(0);

        const plan2 = build(1, {regions: 2});
        expect(plan2.regions).toHaveLength(2);
    });
});

describe("buildUatPlan — multi-classe", () => {
    it("deux entrées de hero.classes dont la somme des niveaux vaut le niveau total", () => {
        const plan = build(9001, {class: "witch:5,guardian:3"});
        expect(plan.hero.classes).toHaveLength(2);
        expect(plan.hero.classes[0].slug).toBe("witch");
        expect(plan.hero.classes[1].slug).toBe("guardian");
        expect(plan.hero.classes[0].level + plan.hero.classes[1].level).toBe(8);
        expect(plan.overrides.level).toBe(8);
    });
});

describe("buildUatPlan — picks de stats", () => {
    it("toutes les entrées de hero.picks référencent le compendium des stats de classe", () => {
        const plan = build(42, {class: "runic-warrior", level: 20});
        expect(plan.hero.picks.length).toBeGreaterThan(0);
        for (const pick of plan.hero.picks) {
            expect(pick.uuid).toMatch(/^Compendium\.fq-card-engine\.classes-stats-fq8\.Item\./);
            expect(pick.slug).toBe("runic-warrior");
        }
    });
});

describe("buildUatPlan — combat.order", () => {
    it("trié par initiative décroissante, égalité départagée par l'ordre d'apparition", () => {
        const plan = build(2, {allies: 2});
        const order = plan.combat.order;

        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].initiative).toBeGreaterThanOrEqual(order[i].initiative);
        }

        // Reconstruit l'ordre d'apparition attendu (héros, ennemis, alliés).
        const appearance = [
            "hero",
            ...plan.enemies.map((_, i) => `enemy:${i}`),
            ...plan.allies.map((_, i) => `ally:${i}`)
        ];
        for (let i = 1; i < order.length; i++) {
            if (order[i - 1].initiative === order[i].initiative) {
                const a = appearance.indexOf(order[i - 1].ref);
                const b = appearance.indexOf(order[i].ref);
                expect(a).toBeLessThan(b);
            }
        }
    });

    it("contient exactement une entrée par combattant, sans référence orpheline", () => {
        const plan = build(2, {allies: 2, enemies: 3});
        const expectedRefs = new Set([
            "hero",
            ...plan.enemies.map((_, i) => `enemy:${i}`),
            ...plan.allies.map((_, i) => `ally:${i}`)
        ]);
        const actualRefs = new Set(plan.combat.order.map(c => c.ref));
        expect(actualRefs).toEqual(expectedRefs);
        expect(plan.combat.order).toHaveLength(expectedRefs.size);
    });
});

describe("buildUatPlan — combat.start", () => {
    it("n'est pas demandé par défaut", () => {
        const plan = build(2);
        expect(plan.combat.start).toBe(false);
        expect(plan.overrides.combat).toBe(false);
    });

    it("est demandé quand l'option combat est vraie", () => {
        const plan = build(2, {combat: true});
        expect(plan.combat.start).toBe(true);
        expect(plan.overrides.combat).toBe(true);
    });

    it("ne consomme aucune étape d'aléatoire : le reste du plan est identique dans les deux cas", () => {
        const withoutCombat = build(2, {allies: 2});
        const withCombat = build(2, {allies: 2, combat: true});

        expect(withCombat.combat.order).toEqual(withoutCombat.combat.order);
        expect(withCombat.enemies).toEqual(withoutCombat.enemies);
        expect(withCombat.allies).toEqual(withoutCombat.allies);
        expect(withCombat.regions).toEqual(withoutCombat.regions);
        expect(withCombat.hero).toEqual(withoutCombat.hero);
    });

    it("l'ordre d'initiative reste calculé même sans combat", () => {
        const plan = build(2, {allies: 2, enemies: 3});
        expect(plan.combat.start).toBe(false);
        expect(plan.combat.order).toHaveLength(1 + plan.enemies.length + plan.allies.length);
    });
});

describe("buildUatPlan — journal.regenerateCommand", () => {
    it("contient la graine et chaque surcharge effective", () => {
        const plan = build(4242, {class: "witch", level: 5, difficulty: "hard", placement: "line", allies: 1, regions: 2});
        const cmd = plan.journal.regenerateCommand;

        expect(cmd).toContain("--seed=4242");
        expect(cmd).toContain("--class=witch:5");
        expect(cmd).toContain("--level=5");
        expect(cmd).toContain("--difficulty=hard");
        expect(cmd).toContain("--placement=line");
        expect(cmd).toContain("--allies=1");
        expect(cmd).toContain("--regions=2");
        expect(cmd).toContain("--combat=false");
    });

    it("rejoue le combat quand il a été demandé", () => {
        const plan = build(4242, {class: "witch", level: 5, combat: true});
        expect(plan.journal.regenerateCommand).toContain("--combat=true");
    });
});

describe("buildUatPlan — bornes invalides", () => {
    it("rejette un niveau total de 0", () => {
        expect(() => build(1, {level: 0})).toThrow(/Niveau hors intervalle/);
    });

    it("rejette un niveau total de 21", () => {
        expect(() => build(1, {level: 21})).toThrow(/Niveau hors intervalle/);
    });

    it("rejette un identifiant de classe inconnu", () => {
        expect(() => build(1, {class: "not-a-class"})).toThrow(/Classe FQ inconnue/);
    });

    it("rejette un motif de placement inconnu", () => {
        expect(() => build(1, {placement: "not-a-pattern"})).toThrow(/Motif de placement inconnu/);
    });

    it("rejette une difficulté inconnue", () => {
        expect(() => build(1, {difficulty: "not-a-difficulty"})).toThrow(/Difficulté inconnue/);
    });
});
