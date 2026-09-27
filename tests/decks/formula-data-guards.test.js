import {describe, expect, test} from "vitest";
import fs from "fs";
import path from "path";
import {FORMULA_FIELDS} from "../../src/domain/interface/card-svg/formula-display.js";

/**
 * Garde de donnée sur les champs de formule (`damage`/`heal`/`hp`, cf.
 * `FORMULA_FIELDS`) du corpus `packs/_source`.
 *
 * POURQUOI cette garde existe : le moteur n'arrondit **nulle part** dans la
 * chaîne dégâts/soins (aucun `Math.floor`/`Math.round`/`Math.ceil`/`Math.trunc`
 * en dehors du tirage de dé de `RollService.replaceDiceByResults`, cf.
 * 20-CONTEXT.md décision D-14). Une division laissée nue dans un champ de
 * `FORMULA_FIELDS` produit donc un résultat décimal appliqué tel quel aux
 * points de vie d'un acteur (ex. 2,5 PV de soin pour `XXX/2` avec X = 5).
 * Toute division doit être enveloppée par `ceil(` ou `trunc(` pour rester
 * fidèle à ce que le moteur appliquera réellement au moment du jet.
 *
 * ⚠️ AUCUNE sélection par nom de carte : le corpus est découvert par glob
 * (répertoire entier), les champs inspectés viennent de `FORMULA_FIELDS`
 * (source de vérité unique, lue depuis `formula-display.js` plutôt que
 * redéclarée ici) et la carte « Levée de bouclier » est localisée par la clé
 * i18n de sa description, jamais par son titre.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const SPELLS_NPC_DIR = path.join(process.cwd(), "packs", "_source", "spells-npc");

/**
 * Repère une barre oblique de division dans une formule déjà nettoyée des
 * portées `ceil(...)`/`trunc(...)`.
 */
const FORMULA_DIVISION_PATTERN = /\//;

/**
 * Retire toutes les portées `ceil(...)`/`trunc(...)` (parenthèses équilibrées,
 * imbrication tolérée) d'une formule, pour ne laisser subsister que les
 * divisions NON enveloppées.
 *
 * @param {string} formula - La formule brute à analyser.
 *
 * @returns {string} La formule avec les portées `ceil`/`trunc` retirées.
 */
function stripRoundedSpans(formula) {
    let result = "";
    let i = 0;
    while (i < formula.length) {
        const match = /^(ceil|trunc)\(/.exec(formula.slice(i));
        if (match) {
            let depth = 1;
            let j = i + match[0].length;
            while (j < formula.length && depth > 0) {
                if (formula[j] === "(") {
                    depth++;
                } else if (formula[j] === ")") {
                    depth--;
                }
                j++;
            }
            i = j;
            continue;
        }
        result += formula[i];
        i++;
    }
    return result;
}

/**
 * Indique si une valeur de champ de formule contient une division NON
 * enveloppée par `ceil(`/`trunc(`. Les valeurs non textuelles (nombre, champ
 * absent) ne peuvent pas porter de division nue et sont ignorées.
 *
 * @param {*} value - La valeur brute du champ (`damage`/`heal`/`hp`).
 *
 * @returns {boolean} True si une division nue est présente.
 */
function hasUnwrappedDivision(value) {
    if (typeof value !== "string") {
        return false;
    }
    return FORMULA_DIVISION_PATTERN.test(stripRoundedSpans(value));
}

/**
 * Collecte les valeurs des champs de `FORMULA_FIELDS` renseignées dans les
 * choix des cartes d'un répertoire de decks (`card.system.fq.choices[]`,
 * forme de `packs/_source/decks-pattern-fq8`).
 *
 * @param {string} dir - Le répertoire à parcourir.
 *
 * @returns {Array<{file: string, cardName: string, field: string, value: *}>}
 */
function collectDeckChoiceFields(dir) {
    const entries = [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
    for (const file of files) {
        const deck = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
        for (const card of deck.cards ?? []) {
            for (const choice of card.system?.fq?.choices ?? []) {
                for (const field of FORMULA_FIELDS) {
                    if (choice[field] !== undefined) {
                        entries.push({file, cardName: card.name, field, value: choice[field]});
                    }
                }
            }
        }
    }
    return entries;
}

/**
 * Collecte les valeurs des champs de `FORMULA_FIELDS` renseignées sous
 * `system.fq` d'un item de sort NPC (forme de `packs/_source/spells-npc`, un
 * fichier JSON = un item).
 *
 * @param {string} dir - Le répertoire à parcourir.
 *
 * @returns {Array<{file: string, cardName: string, field: string, value: *}>}
 */
function collectSpellNpcFields(dir) {
    const entries = [];
    // Le pack peut ne pas etre livre par ce module : les sorts de PNJ sont passes
    // dans `fq-card-engine-extended`. Un dossier absent rend une liste vide, et le
    // garde-fou anti-glob-vide ci-dessous veille sur le total du corpus restant.
    if (!fs.existsSync(dir)) {
        return entries;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
    for (const file of files) {
        const item = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
        for (const field of FORMULA_FIELDS) {
            const value = item.system?.fq?.[field];
            if (value !== undefined) {
                entries.push({file, cardName: item.name, field, value});
            }
        }
    }
    return entries;
}

describe("Garde de donnée : divisions non arrondies dans damage/heal/hp (T-20-06)", () => {
    const entries = [...collectDeckChoiceFields(DECKS_DIR), ...collectSpellNpcFields(SPELLS_NPC_DIR)];

    test("le balayage du corpus inspecte des valeurs de champ (garde-fou anti-glob-vide)", () => {
        // Seuil relatif au contenu livre : il etait de 150 quand ce module portait
        // les neuf classes ET les sorts de PNJ.
        expect(entries.length).toBeGreaterThan(0);
    });

    test("aucune division n'est présente dans un champ damage/heal/hp sans être enveloppée par ceil()/trunc()", () => {
        // Message d'échec explicite : fichier, carte et valeur fautive, pour
        // corriger une future donnée mal formée sans investigation.
        const offenders = entries
            .filter(entry => hasUnwrappedDivision(entry.value))
            .map(({file, cardName, field, value}) => `${file} > ${cardName} > ${field} = "${value}"`);
        expect(offenders).toEqual([]);
    });
});
