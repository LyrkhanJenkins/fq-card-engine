import {beforeEach, describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import FormulaDisplay, {ABILITY_EMOJIS, FORMULA_FIELDS} from "../../src/domain/interface/card-svg/formula-display.js";
import {PILL_END, PILL_SEP, PILL_START} from "../../src/domain/interface/card-svg/formula-pill.js";
import {
    makeReferenceActor, REFERENCE_ABILITIES, REFERENCE_WEAPON_FORMULA
} from "./formula-fixtures.js";

/**
 * Traduction exécutable du tableau « Corpus de référence — instantané attendu »
 * de `20-CONTEXT.md` (décisions verrouillées, gelées en discussion le
 * 2026-08-22 — ne pas rouvrir) et de l'invariant D-04 (« le repli LOCAL, pas
 * global, ne doit plus jamais faire retomber une formule des packs sur le
 * filet de sécurité global »).
 *
 * Toute modification d'une ligne de `CORPUS_SNAPSHOT` est un CHANGEMENT DE
 * DESIGN (le tableau de 20-CONTEXT.md doit être mis à jour EN PREMIER, en
 * discussion avec l'utilisateur), jamais une simple correction de test :
 * c'est cette table qui prouve que la promesse de sortie de la phase (« ne
 * plus avoir que des `1d6+2` à la fin ») est une propriété exécutable et
 * durable du dépôt, et non une affirmation de plan.
 *
 * Ce fichier est en deux parties :
 *  - l'instantané ligne par ligne des 16 cartes du corpus de référence
 *    (Task 1) ;
 *  - l'invariant central de la phase : `FormulaDisplay.foldFormula` ne lève
 *    JAMAIS sur une valeur réelle de `packs/_source`, quel que soit le
 *    contexte d'acteur (Task 2).
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const SPELLS_NPC_DIR = path.join(process.cwd(), "packs", "_source", "spells-npc");

/**
 * Les 16 lignes du tableau « Corpus de référence — instantané attendu » de
 * `20-CONTEXT.md`, RECOPIÉES telles quelles (même carte, même formule brute,
 * même sortie attendue). Acteur de référence : `REFERENCE_ABILITIES`
 * (💪+3 🎯+2 ❤️+1 🧠+4 🦉+3 ✨️+2), arme de mêlée équipée `REFERENCE_WEAPON_FORMULA`
 * (`1d8 + 3`, « Épée longue »).
 * @type {Array<[string, string, string]>}
 */
export const CORPUS_SNAPSHOT = [
    ["Frappe héroïque / Tourbillon de lames", "(@wpnM + 1d(2*@str))[slashing]", "1d8+1d6+3"],
    ["Frappe runique rouge / bleue / jaune", "(ceil((@wpnM + @int)/2))[slashing]", "(1d8+7)÷2"],
    ["Magie élémentaire (4 choix)", "@int+1d(2*@wis)[fire]", "1d6+4"],
    ["Coup du gauche", "(1+ ceil(@str/2) + 1d4)[bludgeoning]", "1d4+3"],
    ["Coup du droit", "(2 + ceil(@str/3))[bludgeoning]", "3"],
    ["Orbe grandissante", "@dex+@wis+@int+XXXd6[force]", "Xd6+9"],
    ["Salve II", "(XXXd8 + @int)[lightning]", "Xd8+4"],
    ["Jet de rocher", "(XXX*@wis +XXXd6)[bludgeoning]", "Xd6+3X"],
    ["Piège à pointes", "@wis+2dXXX[piercing]", "2dX+3"],
    // "(max 5)" est le libellé RÉEL sous Foundry (game.i18n.localize traduit
    // FQCARDENGINE.FormulaCapMax) ; sous le mock d'identité de
    // game.i18n.localize (tests/setup.js), la clé ressort non traduite —
    // convention déjà établie par 20-03-SUMMARY.md pour ce même libellé,
    // voir TEST_MOCK_EXPECTED_OVERRIDES ci-dessous.
    ["Soin d'urgence", "@int*(min(5,XXX))", "4×X (max 5)"],
    ["Levée de bouclier", "ceil(XXX/2)", "X÷2"],
    ["Explosion arcanique c0", "((3*XXX)+1d(2*@wis))[force]", "1d6+3X"],
    ["Explosion arcanique c1", "((2*XXX)+1d(@wis))[force]", "1d3+2X"],
    ["Combo 2", "2*XXX+1d(3*@dex)", "1d6+2X"],
    ["Soin", "@con+1d(2*@wis)", "1d6+1"],
    ["Assassin du vide", "((2*@dex+3*YYY)+1d(2*XXX))[psychic]", "1d2X+4+3Y"]
];

/**
 * Sous le mock d'identité de `game.i18n.localize` (`tests/setup.js`,
 * `vi.fn(str => str)`), un libellé de plafond `min`/`max` (`FormulaDisplay.foldCap`,
 * D-06) ressort avec sa CLÉ i18n non traduite plutôt que le mot français
 * (« max »/« min ») — convention déjà établie par 20-03-SUMMARY.md pour ce
 * même mécanisme. `CORPUS_SNAPSHOT` reste la RECOPIE EXACTE de
 * `20-CONTEXT.md` (fidélité de documentation, « (max 5) », l'expérience
 * utilisateur réelle sous Foundry) ; cette table ne réécrit QUE l'assertion
 * exécutable pour les lignes concernées, sans toucher au texte documentaire.
 * @type {Object<string, string>}
 */
const TEST_MOCK_EXPECTED_OVERRIDES = {
    "Soin d'urgence": "4×X (FQCARDENGINE.FormulaCapMax 5)"
};

describe("FormulaDisplay — instantané des 16 lignes du corpus de référence (20-CONTEXT.md, Task 1)", () => {
    let actor;

    beforeEach(() => {
        actor = makeReferenceActor();
        game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
    });

    it("CORPUS_SNAPSHOT compte exactement 16 entrées", () => {
        expect(CORPUS_SNAPSHOT.length).toBe(16);
    });

    it.each(CORPUS_SNAPSHOT)("%s : foldFormula(%j) === %j", (label, raw, expected) => {
        expect(FormulaDisplay.foldFormula(raw, {actor})).toBe(TEST_MOCK_EXPECTED_OVERRIDES[label] ?? expected);
    });

    it("l'arme de mêlée de référence produit bien REFERENCE_WEAPON_FORMULA (1d8 + 3, « Épée longue »)", () => {
        expect(FormulaDisplay.foldFormula("@wpnM", {actor})).toBe(
            FormulaDisplay.foldFormula(REFERENCE_WEAPON_FORMULA, {actor})
        );
    });

    it("aucune des 16 sorties attendues ne contient de caractère sentinelle de pastille (l'API nue foldFormula ne produit pas de markup)", () => {
        const SENTINELS = [PILL_START, PILL_SEP, PILL_END];
        for (const [, , expected] of CORPUS_SNAPSHOT) {
            for (const sentinel of SENTINELS) {
                expect(expected.includes(sentinel)).toBe(false);
            }
        }
    });
});

/**
 * Collecte les valeurs des champs `FORMULA_FIELDS` (`damage`/`heal`/`hp`)
 * renseignées dans `dirs` — répertoires de decks (`card.system.fq.choices[]`,
 * forme de `packs/_source/decks-pattern-fq8`) OU de sorts NPC (`system.fq.<field>`
 * directement sur l'item, forme de `packs/_source/spells-npc`). Le format est
 * détecté par la présence de `deck.cards` (decks) plutôt que par le nom du
 * répertoire, pour rester robuste à un futur répertoire de forme inconnue.
 * Filtrage par PROPRIÉTÉ PRÉSENTE (`field !== undefined`), pas par valeur non
 * vide : une chaîne vide traverse `foldFormula` sans effet (retour anticipé),
 * la garde reste donc valable même sur ces entrées. Même convention que
 * `tests/decks/formula-data-guards.test.js#collectDeckChoiceFields` — jamais
 * de sélection par nom de carte.
 *
 * @param {string[]} dirs - Les répertoires à parcourir.
 *
 * @returns {Array<{file: string, cardName: string, field: string, value: *}>} Les entrées collectées.
 */
export function collectPackFormulaValues(dirs) {
    const entries = [];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            continue;
        }
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
            if (Array.isArray(data.cards)) {
                // Forme deck : une valeur par choix de carte.
                for (const card of data.cards) {
                    for (const choice of card.system?.fq?.choices ?? []) {
                        for (const field of FORMULA_FIELDS) {
                            if (choice[field] !== undefined) {
                                entries.push({file, cardName: card.name, field, value: choice[field]});
                            }
                        }
                    }
                }
            } else {
                // Forme sort NPC : un seul item par fichier.
                for (const field of FORMULA_FIELDS) {
                    const value = data.system?.fq?.[field];
                    if (value !== undefined) {
                        entries.push({file, cardName: data.name, field, value});
                    }
                }
            }
        }
    }
    return entries;
}

describe("FormulaDisplay — l'invariant D-04 : aucune formule des packs n'atteint le filet de sécurité global (Task 2)", () => {
    const entries = collectPackFormulaValues([DECKS_DIR, SPELLS_NPC_DIR]);
    const ABILITY_EMOJI_VALUES = Object.values(ABILITY_EMOJIS);
    const EMPTY_PARENS_PATTERN = /\(\)/;
    const DOUBLE_SPACE_PATTERN = / {2}/;
    const DIGIT_FOLLOWED_BY_ABILITY_EMOJI_PAREN_PATTERN = new RegExp(
        `\\d\\((?:${ABILITY_EMOJI_VALUES.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\)`
    );

    it("collecte au moins 150 valeurs de champ (garde-fou anti-glob-vide)", () => {
        expect(entries.length).toBeGreaterThanOrEqual(150);
    });

    describe("passe 1 : acteur de référence (20-CONTEXT.md)", () => {
        let actor;

        beforeEach(() => {
            actor = makeReferenceActor();
            game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
        });

        it("FormulaDisplay.foldFormula ne lève sur AUCUNE valeur du corpus", () => {
            const offenders = [];
            for (const entry of entries) {
                try {
                    FormulaDisplay.foldFormula(entry.value, {actor});
                } catch (error) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} = "${entry.value}" (${error.message})`);
                }
            }
            expect(offenders).toEqual([]);
        });

        it("aucune sortie ne contient ceil/trunc/min(/max(/@/XXX résiduels, de parenthèses vides, de double espace, ni de chiffre suivi d'une parenthèse d'emoji de caractéristique (non-régression du contrat de la Phase 13)", () => {
            const offenders = [];
            for (const entry of entries) {
                const result = FormulaDisplay.foldFormula(entry.value, {actor});
                if (typeof result !== "string") {
                    // Valeur de champ non-chaîne (ex. `hp: 0` d'un sort NPC) :
                    // foldFormula la renvoie inchangée (retour anticipé), rien
                    // à inspecter côté texte.
                    continue;
                }
                const forbidden = ["ceil", "trunc", "min(", "max(", "@", "XXX"];
                for (const token of forbidden) {
                    if (result.includes(token)) {
                        offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} : sortie "${result}" contient "${token}"`);
                    }
                }
                if (EMPTY_PARENS_PATTERN.test(result)) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} : sortie "${result}" contient des parenthèses vides`);
                }
                if (DOUBLE_SPACE_PATTERN.test(result)) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} : sortie "${result}" contient un double espace`);
                }
                if (DIGIT_FOLLOWED_BY_ABILITY_EMOJI_PAREN_PATTERN.test(result)) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} : sortie "${result}" contient un chiffre suivi d'une parenthèse d'emoji de caractéristique`);
                }
            }
            expect(offenders).toEqual([]);
        });
    });

    describe("passe 2 : X et Y fournis (X = 3, Y = 2)", () => {
        let actor;

        beforeEach(() => {
            actor = makeReferenceActor();
            game.user.character = {items: actor.items, system: {abilities: {...REFERENCE_ABILITIES}}};
        });

        it("FormulaDisplay.foldFormula ne lève sur AUCUNE valeur du corpus, X et Y fournis", () => {
            const offenders = [];
            for (const entry of entries) {
                try {
                    FormulaDisplay.foldFormula(entry.value, {actor, xValue: 3, yValue: 2});
                } catch (error) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} = "${entry.value}" (${error.message})`);
                }
            }
            expect(offenders).toEqual([]);
        });
    });

    describe("passe 3 : SANS personnage assigné (D-15)", () => {
        beforeEach(() => {
            game.user.character = undefined;
        });

        it("FormulaDisplay.foldFormula ne lève sur AUCUNE valeur du corpus, sans acteur", () => {
            const offenders = [];
            for (const entry of entries) {
                try {
                    FormulaDisplay.foldFormula(entry.value, {actor: undefined});
                } catch (error) {
                    offenders.push(`${entry.file} > ${entry.cardName} > ${entry.field} = "${entry.value}" (${error.message})`);
                }
            }
            expect(offenders).toEqual([]);
        });
    });
});
