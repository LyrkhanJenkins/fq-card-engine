import {describe, expect, it} from "vitest";
import path from "path";
import {SOURCE_DIR, documents} from "./pack-source.js";

/**
 * Cohérence des maîtrises entre les classes et les héros de départ.
 *
 * Une maîtrise vit à DEUX endroits : l'advancement de la classe, qui l'accorde à
 * un niveau donné, et les traits de l'acteur, qui la portent une fois acquise.
 * Les advancements ne s'appliquent qu'à la MONTÉE de niveau : un héros livré
 * niveau 1 doit donc porter lui-même ce que sa classe accorde au niveau 1, sans
 * quoi il arrive dans le monde sans rien maîtriser — et sans que rien ne le dise.
 *
 * L'échelonnement est délibéré (armes simples au 1, armes de guerre au 3, le
 * bouclier plus tard selon la classe) : un passage d'un seul niveau dans une
 * classe ne doit pas offrir tout son arsenal. Ce test ne juge pas l'équilibrage,
 * il vérifie que les deux copies de la donnée racontent la même histoire.
 */

const CLASSES_DIR = path.join(SOURCE_DIR, "classes-fq8");
const HEROES_DIR = path.join(SOURCE_DIR, "starter-heroes");

/** La maîtrise qu'exige chaque catégorie d'armure. L'étoffe n'en exige aucune. */
const ARMOR_PROFICIENCY = Object.freeze({
    light: "lgt",
    medium: "med",
    heavy: "hvy",
    shield: "shl"
});

/**
 * Le tableau d'advancements d'un item de classe, quelle que soit sa forme :
 * les paquets le portent tantôt en tableau, tantôt en objet indexé.
 *
 * @param {object} classItem - L'item de classe.
 *
 * @returns {object[]} Les advancements.
 */
function advancements(classItem) {
    const raw = classItem?.system?.advancement;
    return Array.isArray(raw) ? raw : Object.values(raw ?? {});
}

/**
 * Les maîtrises qu'une classe accorde jusqu'à un niveau donné.
 *
 * @param {object} classItem - L'item de classe.
 * @param {number} level     - Le niveau atteint.
 *
 * @returns {{weapon: string[], armor: string[]}} Les clés acquises, par famille.
 */
function grantedUpTo(classItem, level) {
    const keys = advancements(classItem)
        .filter(a => a.type === "Trait" && Number(a.level) <= level)
        .flatMap(a => a.configuration?.grants ?? []);
    return {
        weapon: keys.filter(k => k.startsWith("weapon:")).map(k => k.split(":")[1]).sort(),
        armor: keys.filter(k => k.startsWith("armor:")).map(k => k.split(":")[1]).sort()
    };
}

const heroes = documents(HEROES_DIR);
const classes = new Map(documents(CLASSES_DIR)
    .filter(doc => doc.type === "class")
    .map(doc => [doc.name, doc]));

describe("Maîtrises des classes et des héros de départ", () => {

    it("balaie effectivement des classes et des héros", () => {
        expect(classes.size).toBe(9);
        expect(heroes.length).toBe(9);
    });

    it("chaque héros porte exactement ce que sa classe accorde à son niveau", () => {
        const mismatches = heroes.flatMap(hero => {
            const classItem = (hero.items ?? []).find(i => i.type === "class");
            if (!classItem) {
                return [`${hero.name} : aucun item de classe`];
            }
            const level = Number(classItem.system?.levels ?? 1);
            const granted = grantedUpTo(classItem, level);
            const carried = {
                weapon: [...(hero.system?.traits?.weaponProf?.value ?? [])].sort(),
                armor: [...(hero.system?.traits?.armorProf?.value ?? [])].sort()
            };
            return ["weapon", "armor"].flatMap(family =>
                JSON.stringify(granted[family]) === JSON.stringify(carried[family]) ? []
                    : [`${hero.name} (niveau ${level}) — ${family} : la classe accorde `
                        + `[${granted[family]}] mais le héros porte [${carried[family]}]`]);
        });

        expect(mismatches).toEqual([]);
    });

    it("la classe embarquée d'un héros accorde la même chose que sa classe de référence", () => {
        // Deux copies de la même classe : celle du compendium et celle que porte
        // le héros. Les faire diverger donnerait deux personnages différents selon
        // qu'on part du héros tout fait ou qu'on crée le sien.
        const divergences = heroes.flatMap(hero => {
            const embedded = (hero.items ?? []).find(i => i.type === "class");
            const reference = classes.get(embedded?.name);
            if (!embedded || !reference) {
                return [];
            }
            const of = item => advancements(item)
                .filter(a => a.type === "Trait")
                .map(a => `${a.level}:${(a.configuration?.grants ?? []).join("+")}`)
                .sort();
            const left = of(embedded);
            const right = of(reference);
            return JSON.stringify(left) === JSON.stringify(right) ? []
                : [`${hero.name} : le héros porte [${left}] et la classe de référence [${right}]`];
        });

        expect(divergences).toEqual([]);
    });

    it("aucun héros ne porte une armure sans l'entraînement correspondant", () => {
        // Porter une armure qu'on ne maîtrise pas n'est pas neutre dans dnd5e :
        // désavantage sur tout ce qui touche à la Force et à la Dextérité, et
        // interdiction d'incanter. Un héros livré ainsi serait handicapé sans
        // que rien sur sa feuille ne l'explique.
        const untrained = heroes.flatMap(hero => {
            const trained = hero.system?.traits?.armorProf?.value ?? [];
            return (hero.items ?? [])
                .filter(i => i.type === "equipment" && ARMOR_PROFICIENCY[i.system?.type?.value])
                .filter(i => !trained.includes(ARMOR_PROFICIENCY[i.system.type.value]))
                .map(i => `${hero.name} porte « ${i.name} » sans l'entraînement `
                    + `« ${ARMOR_PROFICIENCY[i.system.type.value]} »`);
        });

        expect(untrained).toEqual([]);
    });

    it("chaque héros porte une armure ou une étoffe de base", () => {
        const bare = heroes
            .filter(hero => !(hero.items ?? [])
                .some(i => ["equipment", "clothing"].includes(i.type)))
            .map(hero => `${hero.name} n'a rien sur le dos`);

        expect(bare).toEqual([]);
    });

    it("tout l'équipement vient des compendiums dnd5e", () => {
        // Les armes portent une mécanique FQ maison et restent donc dans
        // `items-fq8` ; l'équipement, lui, n'est que de la donnée SRD, et en
        // garder des copies locales revenait à entretenir une divergence.
        const local = heroes.flatMap(hero => (hero.items ?? [])
            .filter(i => ["equipment", "clothing"].includes(i.type))
            .filter(i => !(i._stats?.compendiumSource ?? "").startsWith("Compendium.dnd5e."))
            .map(i => `${hero.name} porte « ${i.name} » venu de `
                + `${i._stats?.compendiumSource || "nulle part"}`));

        expect(local).toEqual([]);
    });

    it("l'équipement de départ des classes pointe vers les compendiums dnd5e", () => {
        const broken = [...classes.values()].flatMap(classItem =>
            (classItem.system?.startingEquipment ?? [])
                .filter(entry => entry.type === "linked")
                .filter(entry => !(entry.key ?? "").startsWith("Compendium.dnd5e."))
                .map(entry => `${classItem.name} référence ${entry.key || "rien"}`));

        // Et personne ne reste sans rien : la garde ci-dessus serait verte à vide.
        const empty = [...classes.values()]
            .filter(classItem => !(classItem.system?.startingEquipment ?? []).length)
            .map(classItem => `${classItem.name} n'a aucun équipement de départ`);

        expect([...broken, ...empty]).toEqual([]);
    });
});
