import {describe, expect, it} from "vitest";
import path from "path";
import {SOURCE_DIR, documents} from "./pack-source.js";

/**
 * Cohérence des maîtrises entre les classes et les héros de départ.
 *
 * Une maîtrise vit à DEUX endroits : l'advancement de la classe, qui l'accorde à
 * un niveau donné, et les traits de l'acteur, qui la portent une fois acquise.
 * Les héros de départ sont livrés vierges, SANS classe : c'est l'ajout de leur
 * classe (du même nom) qui joue les advancements et leur accorde stats de
 * départ et maîtrises. Un héros qui porterait déjà une maîtrise la cumulerait.
 *
 * L'échelonnement est délibéré (armes simples au 1, armes de guerre au 3, le
 * bouclier plus tard selon la classe) : un passage d'un seul niveau dans une
 * classe ne doit pas offrir tout son arsenal. Ce test ne juge pas l'équilibrage,
 * il vérifie que les deux copies de la donnée racontent la même histoire.
 */

const CLASSES_DIR = path.join(SOURCE_DIR, "classes-fq8");
/** Le titre de l'octroi de niveau 1 qui porte armure et armes de départ. */
const STARTING_EQUIPMENT_TITLE = "Équipement de départ";
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

    it("les héros de départ sont livrés sans classe ni maîtrise", () => {
        const loaded = heroes.flatMap(hero => {
            const issues = [];
            if ((hero.items ?? []).some(i => i.type === "class")) {
                issues.push(`${hero.name} porte déjà une classe`);
            }
            const carried = [
                ...(hero.system?.traits?.weaponProf?.value ?? []),
                ...(hero.system?.traits?.armorProf?.value ?? [])
            ];
            if (carried.length > 0) {
                issues.push(`${hero.name} porte déjà les maîtrises [${carried}]`);
            }
            return issues;
        });

        expect(loaded).toEqual([]);
    });

    it("les héros de départ ne portent ni arme ni équipement : ils viennent de l'octroi de départ de leur classe", () => {
        const carried = heroes.flatMap(hero => (hero.items ?? [])
            .filter(i => ["weapon", "equipment", "clothing"].includes(i.type))
            .map(i => `${hero.name} porte « ${i.name} »`));

        expect(carried).toEqual([]);
    });

    it("chaque héros a une classe de référence du même nom", () => {
        const orphans = heroes.filter(hero => !classes.has(hero.name)).map(hero => hero.name);

        expect(orphans).toEqual([]);
    });

    it("une fois sa classe ajoutée, aucun héros ne porte une armure sans l'entraînement correspondant", () => {
        // Porter une armure qu'on ne maîtrise pas n'est pas neutre dans dnd5e :
        // désavantage sur tout ce qui touche à la Force et à la Dextérité, et
        // interdiction d'incanter. Le héros vierge reçoit l'entraînement de sa
        // classe au niveau 1 : l'équipement qu'il porte doit s'y conformer.
        const untrained = heroes.flatMap(hero => {
            const trained = [
                ...(hero.system?.traits?.armorProf?.value ?? []),
                ...grantedUpTo(classes.get(hero.name), 1).armor
            ];
            return (hero.items ?? [])
                .filter(i => i.type === "equipment" && ARMOR_PROFICIENCY[i.system?.type?.value])
                .filter(i => !trained.includes(ARMOR_PROFICIENCY[i.system.type.value]))
                .map(i => `${hero.name} porte « ${i.name} » sans l'entraînement `
                    + `« ${ARMOR_PROFICIENCY[i.system.type.value]} »`);
        });

        expect(untrained).toEqual([]);
    });

    it("chaque classe octroie un équipement de départ à sa classe principale, dès le niveau 1", () => {
        const bare = [...classes.values()]
            .filter(classItem => !advancements(classItem).some(a => a.type === "ItemGrant"
                && a.title === STARTING_EQUIPMENT_TITLE && Number(a.level) === 1
                && a.classRestriction === "primary" && (a.configuration?.items ?? []).length > 0))
            .map(classItem => `${classItem.name} n'octroie aucun équipement de départ`);

        expect(bare).toEqual([]);
    });

    it("tout l'équipement de départ octroyé vient des compendiums dnd5e", () => {
        // L'équipement n'est que de la donnée SRD : en garder des copies locales
        // revenait à entretenir une divergence.
        const local = [...classes.values()].flatMap(classItem => advancements(classItem)
            .filter(a => a.type === "ItemGrant" && a.title === STARTING_EQUIPMENT_TITLE)
            .flatMap(a => a.configuration?.items ?? [])
            .filter(entry => !(entry.uuid ?? "").startsWith("Compendium.dnd5e."))
            .map(entry => `${classItem.name} octroie ${entry.uuid || "rien"}`));

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
