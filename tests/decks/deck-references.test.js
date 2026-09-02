import {describe, expect, it} from "vitest";
import fs from "node:fs";
import path from "node:path";
import CardCondition from "../../src/domain/engine/shared/card-condition.js";
import Constants from "../../src/domain/constants.js";

/**
 * Garde-fou des RÉFÉRENCES sortantes des decks sources : une carte ne cite ni
 * un prédicat, ni une clé de traduction qui n'existe pas.
 *
 * POURQUOI cette garde existe : un `customEval` est une expression évaluée par
 * `eval()` dont l'échec vaut « condition non remplie » — une faute de frappe
 * sur `FqCardEngineModule.cond.xxx` ne lève donc aucune erreur visible, elle
 * rend simplement la carte injouable pour toujours, silencieusement. Même
 * silence pour une clé i18n absente : `game.i18n.localize` rend la clé brute,
 * et c'est elle que le joueur lit.
 *
 * Le corpus est balayé par glob de répertoire
 * (`packs/_source/decks-pattern-fq8`), jamais par nom de carte.
 */

const DECKS_DIR = path.resolve(__dirname, "../../packs/_source/decks-pattern-fq8");
const LANG_DIR = path.resolve(__dirname, "../../lang");

const fr = JSON.parse(fs.readFileSync(path.join(LANG_DIR, "fr.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(LANG_DIR, "en.json"), "utf8"));

/** Les cartes de tous les decks pattern, avec leur fichier d'origine. */
function collectCards() {
    return fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json")).flatMap(file => {
        const doc = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8"));
        const cards = Array.isArray(doc) ? doc : (doc.cards ?? [doc]);
        return cards.map(card => ({file, card}));
    });
}

/**
 * Parcourt récursivement une valeur de carte et collecte, dans les accumulateurs
 * fournis, les membres `FqCardEngineModule.cond.*`/`cst.*` cités par ses chaînes
 * et les clés i18n portées par ses champs `key`.
 */
function harvest(value, {members, keys}) {
    if (!value || typeof value !== "object") {
        return;
    }
    for (const [field, child] of Object.entries(value)) {
        if (typeof child !== "string") {
            harvest(child, {members, keys});
        } else if (field === "key" && child.startsWith("FQ")) {
            keys.add(child);
        } else {
            for (const [, name] of child.matchAll(/FqCardEngineModule\.cond\.(\w+)/g)) {
                members.add(`cond.${name}`);
            }
            for (const [, name] of child.matchAll(/FqCardEngineModule\.cst\.(\w+)/g)) {
                members.add(`cst.${name}`);
            }
        }
    }
}

const members = new Set();
const keys = new Set();
for (const {card} of collectCards()) {
    if (card?.name?.startsWith("FQ")) {
        keys.add(card.name);
    }
    for (const face of card?.faces ?? []) {
        if (face?.text?.startsWith("FQ")) {
            keys.add(face.text);
        }
    }
    harvest(card?.system, {members, keys});
}

describe("Références des decks pattern fq8", () => {

    it("tout membre FqCardEngineModule.cond/cst cité par un deck existe", () => {
        const namespaces = {cond: CardCondition, cst: Constants};
        // `in` plutôt qu'un accès : les membres de `cst` sont des getters statiques,
        // dont l'évaluation exigerait un `game` monté.
        const offenders = [...members]
            .filter(member => !(member.split(".")[1] in namespaces[member.split(".")[0]]))
            .sort();

        expect(offenders).toEqual([]);
    });

    it("toute clé i18n citée par un deck (titre, description, message) existe en fr et en en", () => {
        const offenders = [...keys].flatMap(key => [
            ...(key in fr ? [] : [`fr.json :: ${key}`]),
            ...(key in en ? [] : [`en.json :: ${key}`])
        ]).sort();

        expect(offenders).toEqual([]);
    });

    it("le corpus balayé n'est pas vide (garde-fou d'auto-couverture)", () => {
        expect(members.size).toBeGreaterThan(0);
        expect(keys.size).toBeGreaterThan(0);
    });
});
