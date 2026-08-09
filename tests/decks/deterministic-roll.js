import {vi} from "vitest";

/**
 * `Roll` déterministe (test double) pour le socle de tests exhaustifs (07-02) :
 * évalue RÉELLEMENT les formules de carte (arithmétique, fonctions, dés) au lieu
 * du total constant figé par `tests/setup.js`, tout en gardant les dés pilotables
 * (jamais aléatoires) et l'interface `.total`/`.options`/`.dice`/`.evaluate()`/
 * `.toMessage()`/`.isDeterministic` attendue par le pipeline réel (`fq-utils.js`,
 * `damage-utils.js`).
 *
 * Ce n'est PAS une réimplémentation de la logique métier du moteur : c'est un
 * évaluateur générique d'expressions de type « dés de jeu de rôle » (arithmétique,
 * parenthèses, fonctions usuelles, notation NdM), indépendant du domaine FQ.
 *
 * ─── Contrôle des dés ───────────────────────────────────────────────────────
 * `pushDie(value)` empile une valeur forcée dans une file générique, consommée
 * par le PROCHAIN dé évalué (n'importe quelle taille de face). `forceDie(faces,
 * value)` cible une taille de face précise (file dédiée, prioritaire sur la file
 * générique). Sans valeur forcée, un défaut STABLE et documenté est utilisé
 * (jamais `Math.random`) : voir `DEFAULT_DIE_VALUE`.
 *
 * ─── Cycle de vie ───────────────────────────────────────────────────────────
 * `installDeterministicRoll()` affecte `globalThis.Roll = DeterministicRoll`.
 * À appeler dans un `beforeEach` de fichier de test APRÈS celui de
 * `tests/setup.js` (l'ordre d'enregistrement Vitest = l'ordre d'exécution), pour
 * écraser le `Roll` constant. `resetDiceControl()` vide les files de dés pilotés
 * (à appeler en `afterEach`/avant chaque test pour éviter toute fuite entre
 * suites).
 */

// Valeur stable utilisée pour tout dé non piloté : documentée, jamais aléatoire.
export const DEFAULT_DIE_VALUE = 1;

let genericDieQueue = [];
let perFacesDieQueue = new Map();

/**
 * Empile une valeur forcée dans la file générique, consommée par le prochain dé
 * évalué (toute taille de face confondue).
 *
 * @param {number} value - La valeur forcée du prochain dé.
 *
 * @returns {void}
 */
export function pushDie(value) {
    genericDieQueue.push(value);
}

/**
 * Empile une valeur forcée dans la file dédiée à une taille de face précise
 * (prioritaire sur la file générique pour cette taille de face).
 *
 * @param {number} faces - La taille de face ciblée (ex. 20 pour un d20).
 * @param {number} value - La valeur forcée du prochain dé de cette taille.
 *
 * @returns {void}
 */
export function forceDie(faces, value) {
    if (!perFacesDieQueue.has(faces)) {
        perFacesDieQueue.set(faces, []);
    }
    perFacesDieQueue.get(faces).push(value);
}

/**
 * Réinitialise les files de dés pilotés (générique et par taille de face).
 * À appeler avant chaque test pour éviter toute fuite entre suites.
 *
 * @returns {void}
 */
export function resetDiceControl() {
    genericDieQueue = [];
    perFacesDieQueue = new Map();
}

/**
 * Détermine la valeur du prochain dé d'une taille de face donnée : file dédiée
 * en priorité, puis file générique, puis défaut stable documenté.
 *
 * @param {number} faces - La taille de face du dé.
 *
 * @returns {number} La valeur du dé.
 */
function nextDieValue(faces) {
    if (perFacesDieQueue.has(faces) && perFacesDieQueue.get(faces).length) {
        return perFacesDieQueue.get(faces).shift();
    }
    if (genericDieQueue.length) {
        return genericDieQueue.shift();
    }
    return DEFAULT_DIE_VALUE;
}

// ─── Prétraitement de la formule ───────────────────────────────────────────

/**
 * Retire le flavor `[type]` d'une formule (ex. `"(4)[bludgeoning]"` -> `"(4)"`)
 * et remplace toute `@`-référence non résolue (ex. `@for`, `@sag`) par `0`
 * (défaut de données documenté : ces abréviations FR ne sont pas gérées par le
 * moteur — voir 07-CONTEXT.md).
 *
 * @param {string|number} formula - La formule brute.
 *
 * @returns {string} La formule prétraitée, prête à être tokenisée.
 */
function preprocessFormula(formula) {
    let str = String(formula ?? "");
    str = str.replace(/\[[a-zA-Z]+\]/g, "");
    str = str.replace(/@[a-zA-Z0-9_]+/g, "0");
    return str;
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(formula) {
    const tokens = [];
    let i = 0;
    while (i < formula.length) {
        const c = formula[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (/[0-9.]/.test(c)) {
            const start = i;
            while (i < formula.length && /[0-9.]/.test(formula[i])) i++;
            tokens.push({type: "NUMBER", value: parseFloat(formula.slice(start, i))});
            continue;
        }
        if (/[a-zA-Z]/.test(c)) {
            const start = i;
            while (i < formula.length && /[a-zA-Z]/.test(formula[i])) i++;
            const word = formula.slice(start, i);
            if (word.toLowerCase() === "d") {
                tokens.push({type: "DICE"});
            } else {
                tokens.push({type: "IDENT", value: word.toLowerCase()});
            }
            continue;
        }
        if (c === "+") {
            tokens.push({type: "PLUS"});
            i++;
            continue;
        }
        if (c === "-") {
            tokens.push({type: "MINUS"});
            i++;
            continue;
        }
        if (c === "*") {
            tokens.push({type: "STAR"});
            i++;
            continue;
        }
        if (c === "/") {
            tokens.push({type: "SLASH"});
            i++;
            continue;
        }
        if (c === "(") {
            tokens.push({type: "LPAREN"});
            i++;
            continue;
        }
        if (c === ")") {
            tokens.push({type: "RPAREN"});
            i++;
            continue;
        }
        if (c === ",") {
            tokens.push({type: "COMMA"});
            i++;
            continue;
        }
        // Caractère non reconnu : ignoré (jamais d'exception à la tokenisation).
        i++;
    }
    tokens.push({type: "EOF"});
    return tokens;
}

// ─── Fonctions supportées ───────────────────────────────────────────────────

const FUNCTIONS = {
    ceil: args => Math.ceil(args[0]),
    floor: args => Math.floor(args[0]),
    round: args => Math.round(args[0]),
    abs: args => Math.abs(args[0]),
    trunc: args => Math.trunc(args[0]),
    min: args => Math.min(...args),
    max: args => Math.max(...args)
};

// ─── Analyseur syntaxique récursif descendant ──────────────────────────────
// expr := add
// add  := mul (('+' | '-') mul)*
// mul  := dice (('*' | '/') dice)*
// dice := unary ('d' unary)?     (compte par défaut 1 si 'd' immédiat, ex. "d20")
// unary:= ('+' | '-') unary | primary
// primary := NUMBER | '(' expr ')' | IDENT '(' expr (',' expr)* ')'

class Parser {
    constructor(tokens, diceEntries) {
        this.tokens = tokens;
        this.pos = 0;
        this.diceEntries = diceEntries;
    }

    peek() {
        return this.tokens[this.pos];
    }

    next() {
        return this.tokens[this.pos++];
    }

    expect(type) {
        const t = this.next();
        if (t.type !== type) {
            throw new Error(`Jeton inattendu ${t.type}, attendu ${type}`);
        }
        return t;
    }

    parseAdd() {
        let value = this.parseMul();
        while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
            const op = this.next().type;
            const rhs = this.parseMul();
            value = op === "PLUS" ? value + rhs : value - rhs;
        }
        return value;
    }

    parseMul() {
        let value = this.parseDice();
        while (this.peek().type === "STAR" || this.peek().type === "SLASH") {
            const op = this.next().type;
            const rhs = this.parseDice();
            value = op === "STAR" ? value * rhs : value / rhs;
        }
        return value;
    }

    parseDice() {
        const hasCount = this.peek().type !== "DICE";
        const count = hasCount ? this.parseUnary() : 1;
        if (this.peek().type === "DICE") {
            this.next();
            const faces = this.parseUnary();
            const n = Math.max(0, Math.round(count));
            const f = Math.max(1, Math.round(faces));
            let total = 0;
            for (let k = 0; k < n; k++) {
                total += nextDieValue(f);
                this.diceEntries.push({options: {}});
            }
            return total;
        }
        return count;
    }

    parseUnary() {
        if (this.peek().type === "PLUS") {
            this.next();
            return this.parseUnary();
        }
        if (this.peek().type === "MINUS") {
            this.next();
            return -this.parseUnary();
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const t = this.peek();
        if (t.type === "NUMBER") {
            this.next();
            return t.value;
        }
        if (t.type === "LPAREN") {
            this.next();
            const value = this.parseAdd();
            this.expect("RPAREN");
            return value;
        }
        if (t.type === "IDENT") {
            this.next();
            const fn = FUNCTIONS[t.value];
            this.expect("LPAREN");
            const args = [this.parseAdd()];
            while (this.peek().type === "COMMA") {
                this.next();
                args.push(this.parseAdd());
            }
            this.expect("RPAREN");
            if (!fn) {
                throw new Error(`Fonction inconnue : ${t.value}`);
            }
            return fn(args);
        }
        throw new Error(`Jeton inattendu dans la formule : ${t.type}`);
    }
}

/**
 * Test double de la classe `Roll` de Foundry : évalue réellement la formule
 * (arithmétique, fonctions, dés pilotables) au lieu d'un total constant, tout en
 * exposant l'interface consommée par le pipeline réel.
 */
export class DeterministicRoll {
    /**
     * @param {string|number} formula - La formule à évaluer.
     * @param {object} [data={}]      - Données de contexte (non utilisées par l'évaluateur générique).
     * @param {object} [options={}]   - Options du jet (conservées telles quelles).
     */
    constructor(formula, data = {}, options = {}) {
        this.formula = formula;
        this.data = data;
        this.options = options ?? {};
        this.dice = [];
        this.total = 0;
        this.isDeterministic = true;
        this.toMessage = vi.fn(async () => ({id: "deterministic-roll-message"}));
    }

    /**
     * Évalue la formule : jamais de rejet, jamais de `NaN` — toute expression non
     * parsable retombe sur un total fini documenté (0).
     *
     * @returns {Promise<DeterministicRoll>} L'instance elle-même (comme le vrai `Roll`).
     */
    async evaluate() {
        return this.evaluateSync();
    }

    /**
     * Variante synchrone d'`evaluate()` : même évaluation (déjà synchrone en
     * interne), exposée pour la résolution synchrone des champs de carte
     * (`TargetingView.build` et la chaîne de résolution de `playValidatedCard`, qui
     * doit rester synchrone pour que le garde-fou de la dialog garde celle-ci ouverte).
     *
     * @returns {DeterministicRoll} L'instance elle-même (comme le vrai `Roll`).
     */
    evaluateSync() {
        const clean = preprocessFormula(this.formula);
        const diceEntries = [];
        try {
            const tokens = tokenize(clean);
            const parser = new Parser(tokens, diceEntries);
            const value = parser.parseAdd();
            this.total = Number.isFinite(value) ? value : 0;
        } catch {
            this.total = 0;
        }
        // Le vrai Roll de Foundry expose toujours au moins un DiceTerm.
        this.dice = diceEntries.length ? diceEntries : [{options: {}}];
        return this;
    }
}

/**
 * Installe le `Roll` déterministe sur `globalThis.Roll`, à appeler dans un
 * `beforeEach` de fichier de test APRÈS celui de `tests/setup.js` (ordre
 * d'enregistrement = ordre d'exécution Vitest) pour écraser le `Roll` constant.
 *
 * @returns {void}
 */
export function installDeterministicRoll() {
    globalThis.Roll = DeterministicRoll;
}
