import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import {SOURCE_DIR} from "./pack-source.js";

/**
 * Garde d'intégrité des decks de classe et des pools de stats, pendant la passe
 * de rééquilibrage (devNotes/CLASSES.md).
 *
 * POURQUOI cette garde existe : la passe crée, déplace et supprime une centaine
 * de cartes. Les erreurs typiques ne lèvent aucune erreur en jeu, elles
 * dégradent silencieusement le deck : carte à un niveau jamais atteint, nombre
 * d'exemplaires absent, carte rangée dans la mauvaise classe, image dont la
 * casse diffère (invisible sous Windows, cassée sur un serveur Linux), pool de
 * stats vide ou pointant vers un objet disparu.
 *
 * Les clés de traduction sont déjà couvertes par `deck-references.test.js`.
 *
 * ⚠️ Fichier temporaire : à supprimer à la fin du rééquilibrage, avec
 * `utils/class-report.mjs` (voir « Fin de chantier » dans CLASSES.md).
 *
 * `KNOWN_ISSUES` liste les anomalies connues au démarrage de la passe : elles
 * ne font pas échouer la suite, mais une entrée corrigée DOIT être retirée de la
 * liste (le dernier test l'exige), jusqu'à ce qu'elle soit vide.
 */

const ROOT = process.cwd();
const DECKS_DIR = path.join(SOURCE_DIR, "decks-pattern-fq8");
const CLASSES_DIR = path.join(SOURCE_DIR, "classes-fq8");
const STATS_DIR = path.join(SOURCE_DIR, "classes-stats-fq8");
const MODULE_PREFIX = "modules/fq-card-engine/";
/**
 * Niveau maximum admis pour une carte : celui d'un personnage dnd5e au plafond.
 *
 * À ne pas confondre avec le N13, niveau de PARKING des cartes de classe non
 * encore rangées : le deck neutre, lui, monte délibérément jusqu'à N20 — une
 * carte par niveau de personnage — et ses cartes N14 à N20 ne sont donc pas des
 * anomalies. Au-delà de 20, un niveau reste hors de toute progression jouable
 * et continue d'être signalé (cf. `PreciseShotII :: 21`).
 */
const MAX_LEVEL = 20;
/** Decks de test, hors des patterns livrés. */
const IGNORED_DECKS = new Set(["draft.json"]);

const KNOWN_ISSUES = new Set([
    // Pools de stats
    "pool vide :: witch.json :: AQmRm5kfcKCJcGxS",
]);

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

/**
 * Un identifiant Foundry valide : EXACTEMENT 16 caractères alphanumériques
 * (`foundry.data.validators.isValidId`). Un `_id` d'une autre longueur est
 * silencieusement rejeté à l'import : le document se charge sans `id`, et le
 * premier `update()` de sa feuille échoue sur « You must provide an _id for
 * every object in the update data Array » — sans jamais nommer le coupable.
 */
const VALID_ID = /^[a-zA-Z0-9]{16}$/;

/** La classe attendue d'un deck pattern, déduite de son nom de fichier. */
const deckClass = file => file.replace(/-(base|generated|blue-runes|red-runes|yellow-runes)\.json$/, "");

const listings = new Map();
/**
 * Vrai si le fichier existe avec EXACTEMENT cette casse, chaque segment étant
 * comparé au contenu réel de son dossier (Windows ignore la casse, pas Linux).
 */
function existsWithCase(modulePath) {
    let dir = ROOT;
    for (const segment of modulePath.replace(MODULE_PREFIX, "").split("/")) {
        if (!listings.has(dir)) {
            listings.set(dir, fs.existsSync(dir) ? fs.readdirSync(dir) : []);
        }
        if (!listings.get(dir).includes(segment)) {
            return false;
        }
        dir = path.join(dir, segment);
    }
    return true;
}

const decks = fs.readdirSync(DECKS_DIR)
    .filter(file => file.endsWith(".json") && !IGNORED_DECKS.has(file))
    .map(file => ({file, deck: readJson(path.join(DECKS_DIR, file))}));
const cards = decks.flatMap(({file, deck}) => (deck.cards ?? []).map(card => ({file, card})));

const statIds = new Set(fs.readdirSync(STATS_DIR).filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(STATS_DIR, f)))
    .filter(item => (item.effects ?? []).some(e => (e.system?.changes ?? e.changes ?? []).length))
    .map(item => item._id));
const classes = fs.readdirSync(CLASSES_DIR).filter(f => f.endsWith(".json"))
    .map(file => ({file, cls: readJson(path.join(CLASSES_DIR, file))}));

/** Toutes les anomalies détectées, sous la forme des clés de `KNOWN_ISSUES`. */
function detectIssues() {
    const issues = [];
    for (const {file, deck} of decks) {
        if (deck.img && !existsWithCase(deck.img)) {
            issues.push(`image :: ${file} :: (dos du deck)`);
        }
        if (!VALID_ID.test(deck._id ?? "")) {
            issues.push(`identifiant :: ${file} :: (deck) :: ${deck._id}`);
        }
        const seen = new Set();
        for (const card of deck.cards ?? []) {
            if (!VALID_ID.test(card._id ?? "")) {
                issues.push(`identifiant :: ${file} :: ${card.name} :: ${card._id}`);
            }
            const fq = card.system?.fq ?? {};
            const label = `${file} :: ${card.name}`;
            const expectedClass = deckClass(file);
            if (fq.class !== expectedClass) {
                issues.push(`classe :: ${label} :: ${fq.class} (attendu ${expectedClass})`);
            }
            if (!Number.isInteger(fq.level) || fq.level < 1 || fq.level > MAX_LEVEL) {
                issues.push(`niveau :: ${label} :: ${fq.level}`);
            }
            const copies = Number(fq.maxSameCard);
            if (!Number.isInteger(copies) || copies < 1) {
                issues.push(`exemplaires :: ${label} :: ${fq.maxSameCard}`);
            }
            if (!(fq.choices ?? []).length) {
                issues.push(`choix :: ${label} :: aucun choix`);
            }
            if (seen.has(card.name)) {
                issues.push(`doublon :: ${label}`);
            }
            seen.add(card.name);
            const img = card.faces?.[0]?.img;
            if (!img || !existsWithCase(img)) {
                issues.push(`image :: ${label}`);
            }
            for (const [index, choice] of (fq.choices ?? []).entries()) {
                const min = Number(choice.minReach);
                const max = Number(choice.maxReach);
                if (choice.minReach !== "" && choice.maxReach !== "" && min > max) {
                    issues.push(`portée :: ${label} :: choix ${index + 1} (${min} > ${max})`);
                }
            }
        }
    }
    for (const {file, cls} of classes) {
        const advancement = Object.values(cls.system?.advancement ?? {});
        const grants = advancement.filter(a => a.type === "ItemGrant" && Number(a.level) === 1)
            .flatMap(a => a.configuration?.items ?? [])
            .filter(i => i.uuid.includes("classes-stats-fq8"));
        if (grants.length !== 1) {
            issues.push(`start stats :: ${file} :: ${grants.length} objet(s) de stats de départ`);
        }
        for (const choice of advancement.filter(a => a.type === "ItemChoice")) {
            const pool = choice.configuration?.pool ?? [];
            if (!pool.length) {
                issues.push(`pool vide :: ${file} :: ${choice._id}`);
            }
            for (const entry of [...grants, ...pool]) {
                const id = entry.uuid.split(".").pop();
                if (!statIds.has(id)) {
                    issues.push(`stat introuvable :: ${file} :: ${entry.uuid}`);
                }
            }
        }
    }
    return issues;
}

const issues = detectIssues();

describe("Intégrité des decks de classe et des pools de stats", () => {

    it("balaie effectivement des cartes et des classes", () => {
        expect(cards.length).toBeGreaterThan(200);
        expect(classes.length).toBeGreaterThanOrEqual(9);
    });

    it("aucune anomalie nouvelle (niveau, exemplaires, classe, image, portée, pools de stats)", () => {
        expect(issues.filter(issue => !KNOWN_ISSUES.has(issue))).toEqual([]);
    });

    it("chaque anomalie connue existe encore (retirer de KNOWN_ISSUES celles corrigées)", () => {
        const found = new Set(issues);
        expect([...KNOWN_ISSUES].filter(issue => !found.has(issue))).toEqual([]);
    });
});
