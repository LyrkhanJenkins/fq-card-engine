import Constants from "../../constants.js";
import WeaponDamage, {WEAPON_TOKENS} from "../../engine/roll/weapon-damage.js";
import {makePill, PILL_SOURCE, PILL_TYPE, sanitizePillInput} from "./formula-pill.js";

/**
 * Emojis de caractéristique, dans l'ordre canonique utilisé pour le groupe de
 * sources de modification (D-06). Copiés caractère pour caractère depuis
 * `DisplayCard.transformForDescription`, seule source de vérité des symboles.
 * @type {Object<string, string>}
 */
export const ABILITY_EMOJIS = {
    str: "💪",
    dex: "🎯",
    con: "❤️",
    int: "🧠",
    wis: "🦉",
    cha: "✨️"
};

/**
 * Emojis d'arme par jeton (D-07) : ⚔️ pour la mêlée (`@wpnM`), 🏹 pour la
 * distance (`@wpnR`).
 * @type {Object<string, string>}
 */
export const WEAPON_EMOJIS = {
    "@wpnM": "⚔️",
    "@wpnR": "🏹"
};

/**
 * Les seuls champs de choix de carte repliés par `FormulaDisplay` : `damage`
 * et `heal` sont interpolés dans les descriptions, `hp` est inclus par
 * cohérence de nature (formule de dégâts/soin).
 * @type {string[]}
 */
export const FORMULA_FIELDS = ["damage", "heal", "hp"];

/**
 * Emojis de type de dégâts, source unique de vérité consommée par
 * `DisplayCard.transformForDescription` (conversion `[fire]`→`[🔥]`) et par la
 * table de tooltips `EMOJI_TOOLTIP_KEYS`.
 * @type {Object<string, string>}
 */
export const DAMAGE_TYPE_EMOJIS = {
    acid: "🧪",
    bludgeoning: "⚒️",
    cold: "🧊",
    fire: "🔥",
    force: "🌀",
    lightning: "🌩️",
    necrotic: "🩸",
    piercing: "🔱",
    poison: "☠️",
    psychic: "👁️",
    radiant: "☀️",
    slashing: "🔪",
    thunder: "🌪️"
};

/**
 * Types de dégâts reconnus dans une formule (dérivés de la table d'emojis).
 * @type {string[]}
 */
const DAMAGE_TYPES = Object.keys(DAMAGE_TYPE_EMOJIS);

/**
 * Met en capitale la première lettre d'un identifiant (`str` → `Str`).
 *
 * @param {string} s - L'identifiant.
 *
 * @returns {string} L'identifiant capitalisé.
 */
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Table jeton → clé i18n du libellé de source utilisé dans le tooltip d'une
 * pastille (`FormulaDisplay.collectSourceDetails`) : les 6 caractéristiques
 * puis les 2 jetons d'arme.
 * @type {Object<string, string>}
 */
export const SOURCE_LABEL_KEYS = {
    str: "FQCARDENGINE.SourceAbilityStr",
    dex: "FQCARDENGINE.SourceAbilityDex",
    con: "FQCARDENGINE.SourceAbilityCon",
    int: "FQCARDENGINE.SourceAbilityInt",
    wis: "FQCARDENGINE.SourceAbilityWis",
    cha: "FQCARDENGINE.SourceAbilityCha",
    "@wpnM": "FQCARDENGINE.SourceWeaponMelee",
    "@wpnR": "FQCARDENGINE.SourceWeaponRanged"
};

/**
 * Table emoji → clé i18n de tooltip, dérivée des trois tables sources
 * (caractéristiques, armes, types de dégâts). Consommée par
 * `DisplayCard.wrapEmojiTooltips` et par `expandPills` (liste blanche
 * d'emojis autorisés à produire une pastille) pour envelopper chaque emoji
 * d'un `data-tooltip` Foundry (localisé automatiquement par le TooltipManager
 * pour les emojis simples ; déjà résolu pour les pastilles de source).
 * Les caractéristiques réutilisent `SOURCE_LABEL_KEYS` : un même libellé sert
 * au survol d'un emoji nu et au tooltip d'une pastille, il n'y a donc qu'UNE
 * clé i18n par caractéristique à traduire et à maintenir.
 * @type {Object<string, string>}
 */
export const EMOJI_TOOLTIP_KEYS = {
    ...Object.fromEntries(Object.entries(ABILITY_EMOJIS)
        .map(([ability, emoji]) => [emoji, SOURCE_LABEL_KEYS[ability]])),
    [WEAPON_EMOJIS["@wpnM"]]: "FQCARDENGINE.TooltipWeaponMelee",
    [WEAPON_EMOJIS["@wpnR"]]: "FQCARDENGINE.TooltipWeaponRanged",
    ...Object.fromEntries(Object.entries(DAMAGE_TYPE_EMOJIS)
        .map(([type, emoji]) => [emoji, `FQCARDENGINE.TooltipDamage${capitalize(type)}`]))
};

/**
 * Table sens `min`/`max` → clé i18n du libellé de plafond français consommé
 * par `FormulaDisplay.foldCap` (D-06), INVERSÉE par rapport au nom
 * mathématique de la fonction : `min(borne, X)` borne le résultat PAR LE HAUT
 * (le résultat ne dépasse jamais la borne), son libellé est donc « max » ;
 * `max(borne, X)` borne PAR LE BAS, son libellé est donc « min ». Exportée
 * pour le test de parité des clés de traduction.
 * @type {Object<string, string>}
 */
export const CAP_LABEL_KEYS = {
    min: "FQCARDENGINE.FormulaCapMax",
    max: "FQCARDENGINE.FormulaCapMin"
};

/**
 * Table caractéristique → nom de variable symbolique interne (D-15), utilisée
 * quand `FormulaDisplay.resolveAbilityMod` ne trouve aucun modificateur fini
 * (aucun personnage assigné — MJ ouvrant un deck, feuille de compendium).
 * Le nom de rendu de cette variable EST son emoji (`ABILITY_EMOJIS`) : elle
 * participe à l'algèbre du repli exactement comme `X`/`Y` (se combine, se
 * multiplie par un scalaire) et se rend à sa place dans l'ordre D-09, sans
 * jamais inventer une valeur numérique. Copie séparée de `ABILITY_EMOJIS`
 * (mêmes valeurs) pour documenter cette utilisation distincte : nom de
 * variable symbolique, pas seulement icône d'affichage.
 * @type {Object<string, string>}
 */
const UNKNOWN_ABILITY_VARS = {...ABILITY_EMOJIS};

const DAMAGE_TYPE_PATTERN = new RegExp(`\\[(${DAMAGE_TYPES.join("|")})]`, "g");

/**
 * Identifiants reconnus par `FormulaDisplay.tokenize`, triés du plus long au
 * plus court : une lecture gloutonne DOIT reconnaître `XXX` avant `X`, sans
 * quoi `XXXd6` se découperait en `X`+`X`+`Xd6` plutôt qu'en `XXX`+`d6`.
 * @type {string[]}
 */
const IDENTIFIERS = [
    "trunc", "floor", "round", "ceil", "XXX", "YYY", "min", "max", "X", "Y",
    // Variables symboliques de caractéristique non résolue (D-15), whitelistées
    // pour que le scanner les traverse comme X/Y.
    ...Object.values(UNKNOWN_ABILITY_VARS)
].sort((a, b) => b.length - a.length);

/** Fonctions transparentes (D-05) : numériques elles s'évaluent et disparaissent. @type {Object<string, Function>} */
const ROUND_FUNCS = {ceil: Math.ceil, trunc: Math.trunc, floor: Math.floor, round: Math.round};

/** Longueur maximale d'une expression acceptée par le tokenizer (garde-fou DoS, T-20-04). @type {number} */
const MAX_EXPRESSION_LENGTH = 512;

/** Profondeur maximale d'imbrication de parenthèses/appels de fonction acceptée par le parseur (garde-fou DoS, T-20-04). @type {number} */
const MAX_NESTING_DEPTH = 64;

/**
 * Nombre maximal de termes additifs tolérés dans le rendu d'une taille de dé
 * symbolique avant de la parenthéser (D-07) : `1d(2*XXX)` rend `1d2X` (un seul
 * terme, pas de parenthèses) ; au-delà de ce seuil l'ambiguïté imposerait des
 * parenthèses. Aucune formule des packs n'atteint ce cas à ce jour — la
 * constante documente la règle pour rester non ambiguë si une donnée future
 * en introduisait une.
 * @type {number}
 */
const MAX_SYMBOLIC_DIE_SIZE_TERMS = 1;

/**
 * Identifiants dont la consommation par le scanner interdit, à la position
 * suivante, de reconnaître un « d » immédiatement suivi de chiffres comme une
 * notation de dé à compte implicite 1 (D-08) : `Xd6`/`XXXd6` doivent produire
 * trois jetons (`X`/`XXX`, `d`, `6`), pas `X`/`XXX` + `d6` fusionnés — sans
 * quoi le compte symbolique et la taille numérique ne pourraient jamais être
 * distingués l'un de l'autre. Voir `FormulaDisplay.tokenize`.
 * @type {string[]}
 */
const SYMBOLIC_DIE_COUNT_IDENTIFIERS = ["X", "Y", "XXX", "YYY"];

/**
 * Modèle plié vierge `{const, dice, symDice, vars, atoms}` : la forme unique
 * que produisent et consomment toutes les étapes du repli (parseur, `foldDie`,
 * `foldCap`, `renderFolded`). Une fabrique plutôt qu'une constante partagée :
 * chaque nœud reçoit ses propres conteneurs, que les combinaisons mutent.
 *
 * @returns {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} Un modèle plié neutre.
 */
function emptyModel() {
    return {const: 0, dice: {}, symDice: [], vars: {}, atoms: []};
}

/**
 * Repli d'affichage des formules de dégâts/soin d'une carte, moteur d'ARBRE à
 * repli LOCAL (D-04) : un nœud non repliable (division, `ceil`/`trunc` sur du
 * non-numérique) reste OPAQUE — rendu en `atome` — mais ses propres enfants
 * restent pliés, au lieu de faire échouer tout le sous-arbre. Les sources de
 * modification (arme, caractéristique) et le type de dégâts sortent du texte
 * pour devenir des pastilles (`formula-pill.js`), porteuses d'un tooltip
 * chiffré. N'affecte jamais la formule réellement lancée par le moteur
 * (lecture seule). Toutes les méthodes sont statiques : la classe sert de
 * namespace.
 */
export default class FormulaDisplay {

    /**
     * Normalise les options de `forDisplay`/`foldFormula` : accepte le sac
     * `{actor, xValue, yValue}`, ou — compatibilité ascendante — un acteur
     * passé directement en 2e argument positionnel (les sites d'appel
     * antérieurs au plan 20-01). `xValue`/`yValue` sont consommés par
     * `FormulaDisplay.substituteVariableTokens` (D-02, plan 20-04) : fournis
     * et finis, ils déclenchent une substitution PAR VALEUR ; absents (ou non
     * finis), la variable reste symbolique (`X`/`Y`).
     *
     * @param {object|undefined} options - Le sac d'options, un acteur, ou `undefined`.
     *
     * @returns {{actor: object, xValue: *, yValue: *}} Les options normalisées.
     */
    static normalizeDisplayOptions(options) {
        if (options === undefined || options === null) {
            return {actor: Constants.actorCurrent, xValue: undefined, yValue: undefined};
        }
        if (typeof options === "object") {
            const keys = Object.keys(options);
            const looksLikeOptionsBag = keys.length === 0
                || keys.includes("actor") || keys.includes("xValue") || keys.includes("yValue");
            if (looksLikeOptionsBag) {
                return {
                    actor: options.actor ?? Constants.actorCurrent,
                    xValue: options.xValue,
                    yValue: options.yValue
                };
            }
        }
        return {actor: options, xValue: undefined, yValue: undefined};
    }

    /**
     * Point d'entrée unique du repli d'affichage. Ne lève JAMAIS : toute
     * expression non repliable retombe sur `fallback` — filet de sécurité de
     * dernier recours, qui ne doit plus jamais se déclencher sur les formules
     * des packs une fois la Phase 20 achevée (voir 20-01-PLAN.md,
     * `<assumption_delta_decision>`).
     *
     * @param {*}                             raw               - La valeur brute du champ (souvent une chaîne de formule).
     * @param {{actor: object, xValue: *, yValue: *}|object} [options] - Le sac d'options, ou un acteur (compatibilité ascendante).
     *
     * @returns {*} La formule repliée pour l'affichage (avec marqueurs de pastille), ou `raw` inchangé si non applicable.
     */
    static forDisplay(raw, options) {
        if (typeof raw !== "string" || raw.trim() === "") {
            return raw;
        }
        const {actor, xValue, yValue} = FormulaDisplay.normalizeDisplayOptions(options);
        // Assainir AVANT toute chose (T-20-02) : une donnée de carte ne doit
        // jamais pouvoir forger un marqueur de pastille. Le résultat sanitisé
        // est aussi ce qui alimente `fallback` en cas d'échec, pour que le
        // filet de sécurité ne puisse pas non plus laisser fuiter un marqueur
        // forgé jusqu'au rendu.
        const sanitizedRaw = sanitizePillInput(raw);
        try {
            const segments = FormulaDisplay.foldSegments(sanitizedRaw, actor, xValue, yValue).map(({rawExpr, type, folded}) => ({
                expr: folded,
                type,
                sourceDetails: FormulaDisplay.collectSourceDetails(rawExpr, actor)
            }));
            return FormulaDisplay.assembleFolded(segments);
        } catch {
            return FormulaDisplay.fallback(sanitizedRaw, actor);
        }
    }

    /**
     * API de vérification du corpus (D-04) : replie une formule complète en
     * texte NU (sans pastille, ni jeton de type) et LÈVE si un segment est
     * irrepliable — contrairement à `forDisplay`, qui ne lève jamais. Sert à
     * figer, en test, l'instantané exact du corpus de référence.
     *
     * @param {*}                             raw               - La valeur brute du champ.
     * @param {{actor: object, xValue: *, yValue: *}} [options] - Le sac d'options.
     *
     * @returns {*} La formule repliée (texte nu), ou `raw` inchangé si non applicable.
     *
     * @throws {Error} Si un segment de la formule est irrepliable par l'arbre de repli local.
     */
    static foldFormula(raw, options) {
        if (typeof raw !== "string" || raw.trim() === "") {
            return raw;
        }
        const {actor, xValue, yValue} = FormulaDisplay.normalizeDisplayOptions(options);
        return FormulaDisplay.foldSegments(raw, actor, xValue, yValue).map(({folded}) => folded).join("+");
    }

    /**
     * Découpe `raw` en segments de type de dégâts, applique la chaîne de
     * substitution imposée par D-01 (armes → bonus nommés → caractéristiques
     * → `XXX`/`YYY` par valeur) sur chaque segment, puis replie chacun via
     * `foldSegment`. Partagée par `forDisplay` et `foldFormula` : c'est le
     * seul endroit où l'ordre de substitution est encodé.
     *
     * @param {string} raw    - La chaîne brute (déjà assainie côté appelant si nécessaire) à découper et replier.
     * @param {object} actor  - L'acteur pour la résolution des jetons d'arme.
     * @param {*}      xValue - La valeur `X` saisie par le joueur (substituée si finie, sinon `XXX`→`X` symbolique).
     * @param {*}      yValue - La valeur `Y` saisie par le joueur (substituée si finie, sinon `YYY`→`Y` symbolique).
     *
     * @returns {Array<{rawExpr: string, type: string|null, folded: string}>} Les segments repliés, avec leur expression brute d'origine.
     */
    static foldSegments(raw, actor, xValue, yValue) {
        return FormulaDisplay.splitDamageSegments(raw).map(({expr, type}) => {
            const withWeapons = FormulaDisplay.substituteWeaponTokens(expr, actor);
            const withBonuses = FormulaDisplay.substituteNamedBonusTokens(withWeapons, actor);
            const withAbilities = FormulaDisplay.substituteAbilityTokens(withBonuses, actor);
            // XXX/YYY PAR VALEUR (D-02) : après les caractéristiques, avant le
            // repli — l'ordre exact imposé par D-01. C'est cette substitution
            // qui distingue une variable renseignée par le joueur d'une
            // variable non renseignée (sans elle, impossible de savoir si un
            // XXX/YYY vient du joueur) ; c'est aussi elle qui, en rendant la
            // formule entièrement numérique, permet à la règle de
            // simplification unique de faire s'effondrer les cas réputés
            // irréductibles (D-03, ex. `@int*(min(5,XXX))` avec X=7 → `20`).
            const withVariables = FormulaDisplay.substituteVariableTokens(withAbilities, xValue, yValue);
            return {rawExpr: expr, type, folded: FormulaDisplay.foldSegment(withVariables)};
        });
    }

    /**
     * Substitue `XXX`/`YYY` PAR VALEUR (D-02) si et seulement si la valeur
     * correspondante est fournie et finie ; sinon renomme le jeton long en son
     * nom symbolique court (`X`/`Y`), comme avant ce plan. Une chaîne vide,
     * `null`, `undefined` ou une valeur non numérique (`NaN`) valent ABSENCE
     * de valeur ; `0` (et toute valeur négative) valent PRÉSENCE. La valeur
     * numérique substituée est entourée de parenthèses quand elle est
     * négative, pour rester algébriquement correcte au milieu d'une
     * expression (ex. `2*XXX` avec X=-2 → `2*(-2)`, pas `2*-2`). Sémantique
     * de substitution textuelle strictement identique à celle DU MOTEUR
     * (`CardEffect.recalculatedWithWYValue`, `replaceAll`) : aucune
     * interprétation supplémentaire n'est faite ici.
     *
     * @param {string} str    - La chaîne (déjà substituée en armes/bonus/caractéristiques) contenant d'éventuels jetons `XXX`/`YYY`.
     * @param {*}      xValue - La valeur `X` saisie par le joueur, ou absente.
     * @param {*}      yValue - La valeur `Y` saisie par le joueur, ou absente.
     *
     * @returns {string} La chaîne avec `XXX`/`YYY` substitués par valeur ou renommés symboliquement.
     */
    static substituteVariableTokens(str, xValue, yValue) {
        const substituteOne = (source, token, symbol, value) => {
            if (!source.includes(token)) {
                return source;
            }
            const hasValue = value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
            if (!hasValue) {
                return source.replaceAll(token, symbol);
            }
            const num = Number(value);
            const rendered = num < 0 ? `(${num})` : `${num}`;
            return source.replaceAll(token, rendered);
        };
        let result = substituteOne(str, "XXX", "X", xValue);
        result = substituteOne(result, "YYY", "Y", yValue);
        return result;
    }

    /**
     * Replie UN segment déjà découpé (et déjà substitué) en texte nu. LÈVE si
     * le segment est irrepliable par ce plan (fonction non supportée,
     * notation de dé symbolique — peuplée par le plan 20-03, division/`ceil`
     * localement opaques mais correctement repliés).
     *
     * @param {string} expr - L'expression déjà substituée à replier.
     *
     * @returns {string} L'expression repliée (« 0 » si le résultat est vide).
     *
     * @throws {Error} Si l'expression est incomplète, mal parenthésée, contient
     *                 un caractère non reconnu, un jeton non consommé, un dé
     *                 sous multiplication/soustraction, un produit de deux
     *                 variables, une fonction non supportée, ou une notation
     *                 de dé symbolique (hors périmètre de ce plan).
     */
    static foldSegment(expr) {
        const tokens = FormulaDisplay.tokenize(expr);
        if (tokens.length === 0) {
            return expr;
        }
        const parsed = FormulaDisplay.parseExpression(tokens, expr);
        return FormulaDisplay.renderFolded(parsed);
    }

    /**
     * Scanner à LISTE BLANCHE d'identifiants (D-01) : à chaque position,
     * essaie dans l'ordre la notation de dé numérique (`\d*d\d+`, AVANT la
     * notation numérique pure — sinon "1d6" se découperait en "1"+"d"+"6"),
     * un nombre, un identifiant whitelisté (le plus long d'abord — sinon
     * "XXXd6" se découperait en "X"+"X"+"Xd6"), la lettre `d` isolée (dé à
     * taille ou nombre symbolique, D-07/D-08), ou un caractère de ponctuation
     * `+ - * / ( ) ,`. Tout autre caractère LÈVE : aucun jeton non résolu
     * (notamment un `@…` résiduel) n'atteint jamais le parseur (D-01).
     *
     * Cas spécial (D-08) : juste après avoir consommé un identifiant de
     * compte symbolique (`X`/`Y`/`XXX`/`YYY`), la notation de dé numérique
     * N'EST PAS tentée — sinon `Xd6` fusionnerait glouton "d6" (compte
     * implicite 1) au lieu de laisser `d` séparé de la taille `6` : le compte
     * symbolique et la taille numérique doivent rester deux jetons distincts
     * pour que le parseur puisse construire le nœud de dé (`XXXd6` produit
     * trois jetons `XXX`, `d`, `6`, jamais `XXXd` + `6`).
     *
     * @param {string} expr - L'expression à découper en jetons.
     *
     * @returns {string[]} La liste des jetons, dans l'ordre d'apparition.
     *
     * @throws {Error} Si l'expression dépasse 512 caractères, ou contient un
     *                 caractère non reconnu par la liste blanche.
     */
    static tokenize(expr) {
        if (typeof expr !== "string") {
            return [];
        }
        if (expr.length > MAX_EXPRESSION_LENGTH) {
            throw new Error(`Formule trop longue (> ${MAX_EXPRESSION_LENGTH} caractères)`);
        }
        const tokens = [];
        let pos = 0;
        let lastWasSymbolicCount = false;
        while (pos < expr.length) {
            const ch = expr[pos];
            if (/\s/.test(ch)) {
                pos++;
                continue;
            }
            if (!lastWasSymbolicCount) {
                const diceMatch = /^\d*d\d+/.exec(expr.slice(pos));
                if (diceMatch) {
                    tokens.push(diceMatch[0]);
                    pos += diceMatch[0].length;
                    lastWasSymbolicCount = false;
                    continue;
                }
            }
            const numMatch = /^\d+(?:\.\d+)?/.exec(expr.slice(pos));
            if (numMatch) {
                tokens.push(numMatch[0]);
                pos += numMatch[0].length;
                lastWasSymbolicCount = false;
                continue;
            }
            const identMatch = IDENTIFIERS.find(word => expr.slice(pos, pos + word.length) === word);
            if (identMatch) {
                tokens.push(identMatch);
                pos += identMatch.length;
                lastWasSymbolicCount = SYMBOLIC_DIE_COUNT_IDENTIFIERS.includes(identMatch);
                continue;
            }
            if (ch === "d") {
                // "d" isolé (ni notation de dé numérique, ni identifiant) :
                // taille ou compte de dé symbolique/calculé (D-07/D-08),
                // construit par FormulaDisplay.foldDie au parsing.
                tokens.push("d");
                pos++;
                lastWasSymbolicCount = false;
                continue;
            }
            if ("+-*/(),".includes(ch)) {
                tokens.push(ch);
                pos++;
                lastWasSymbolicCount = false;
                continue;
            }
            throw new Error(`Caractère non reconnu dans l'expression "${expr}" (position ${pos})`);
        }
        return tokens;
    }

    /**
     * Parseur descendant récursif produisant directement le modèle plié
     * `{const, dice, symDice, vars, atoms}` (repli LOCAL, D-04) :
     * `expr := term (('+'|'-') term)*` ; `term := unary (('*'|'/'|implicite) unary)*` ;
     * `unary := ('+'|'-') unary | primary` ; `primary := num | dé | ident |
     * appel de fonction | '(' expr ')'`. La multiplication implicite ne se
     * déclenche jamais sur `d`, `,` ou `/`.
     *
     * Modèle de valeur pliée : `dice` porte les dés numériques déjà fusionnés
     * par taille ; `symDice` porte les dés à taille et/ou nombre symbolique
     * (D-07/D-08, construits par `FormulaDisplay.foldDie`), déjà rendus dans
     * l'ordre d'apparition ; `vars` porte les coefficients de `X`/`Y` ;
     * `atoms` porte les nœuds OPAQUES déjà rendus (division, plafond
     * `min`/`max`, notamment) avec leur coefficient numérique — c'est ce qui
     * rend le repli LOCAL : un nœud opaque n'empêche plus ses enfants de se
     * plier, il devient lui-même un terme de plus haut niveau.
     *
     * @param {string[]} tokens - Les jetons produits par `tokenize`.
     * @param {string}   expr   - L'expression d'origine (pour les messages d'erreur).
     *
     * @returns {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} Le modèle plié.
     *
     * @throws {Error} Si l'expression est incomplète, mal parenthésée, contient
     *                 un produit de deux variables, une variable/fonction non
     *                 supportée, des jetons non consommés, un dé sous
     *                 multiplication/soustraction, ou une profondeur
     *                 d'imbrication excessive (> 64).
     */
    static parseExpression(tokens, expr) {
        let pos = 0;
        let depth = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];
        const isDiceToken = t => /^\d*d\d+$/.test(t);
        const isNumToken = t => /^\d+(?:\.\d+)?$/.test(t);

        const enterGroup = () => {
            depth++;
            if (depth > MAX_NESTING_DEPTH) {
                throw new Error(`Profondeur d'imbrication excessive (> ${MAX_NESTING_DEPTH}) dans "${expr}"`);
            }
        };
        const exitGroup = () => {
            depth--;
        };

        const startsFactorImplicit = () => {
            const t = peek();
            return t !== undefined && t !== "+" && t !== "-" && t !== "*" && t !== "/" && t !== ")" && t !== "," && t !== "d";
        };

        function numberValue(n) {
            return {...emptyModel(), const: n};
        }

        // wrap() n'ajoute des parenthèses que si le rendu de l'enfant compte
        // plus d'un terme additif (D-05) : "X" reste "X÷2", mais "1d8+7"
        // devient "(1d8+7)÷2".
        function wrap(v) {
            const rendered = FormulaDisplay.renderFolded(v);
            return FormulaDisplay.renderTermCount(v) > 1 ? `(${rendered})` : rendered;
        }

        function combine(a, b, sign) {
            if (sign === -1 && (Object.keys(b.dice).length || b.symDice.length)) {
                // La soustraction de dés ne se simplifie pas en un nombre de
                // dés : "2d6-1d6" n'a pas la distribution de "1d6" (fidélité au jet).
                throw new Error(`Soustraction de dés non supportée dans "${expr}"`);
            }
            const result = {
                const: a.const + sign * b.const,
                dice: {...a.dice},
                symDice: [...a.symDice],
                vars: {...a.vars},
                atoms: [...a.atoms]
            };
            for (const size in b.dice) {
                result.dice[size] = (result.dice[size] || 0) + sign * b.dice[size];
            }
            for (const v in b.vars) {
                result.vars[v] = (result.vars[v] || 0) + sign * b.vars[v];
            }
            for (const atom of b.atoms) {
                result.atoms.push({coeff: sign * atom.coeff, render: atom.render});
            }
            for (const sd of b.symDice) {
                result.symDice.push(sd);
            }
            return result;
        }

        function multiply(a, b) {
            const aIsPureNum = FormulaDisplay.isPureNumber(a);
            const bIsPureNum = FormulaDisplay.isPureNumber(b);

            if (aIsPureNum && bIsPureNum) {
                return numberValue(a.const * b.const);
            }

            if (aIsPureNum || bIsPureNum) {
                // Un côté est un SCALAIRE pur (aucun dé, aucune variable,
                // aucun atome) : c'est le seul cas où une multiplication peut
                // se simplifier davantage qu'un atome générique.
                const scalarSide = aIsPureNum ? a : b;
                const otherSide = aIsPureNum ? b : a;
                const scalar = scalarSide.const;

                if (Object.keys(otherSide.dice).length === 0 && otherSide.symDice.length === 0 && otherSide.atoms.length === 0) {
                    // Combinaison linéaire de variables (et/ou constante),
                    // SANS dé ni atome (D-03, chemin historique) : distribue
                    // le scalaire terme à terme ("2*(X+3)" -> "2X+6").
                    const result = {const: scalar * otherSide.const, dice: {}, symDice: [], vars: {}, atoms: []};
                    for (const v in otherSide.vars) {
                        result.vars[v] = otherSide.vars[v] * scalar;
                    }
                    return result;
                }

                const otherIsPureAtom = otherSide.const === 0 && Object.keys(otherSide.vars).length === 0
                    && Object.keys(otherSide.dice).length === 0 && otherSide.symDice.length === 0;
                if (otherIsPureAtom) {
                    // L'autre côté N'EST QU'UN (ou plusieurs) atome(s) DÉJÀ
                    // rendu(s) (D-03, chemin historique optimisé) : multiplie
                    // directement leur coefficient plutôt que de les
                    // ré-envelopper ("@int*(min(5,XXX))" -> "4×X (max 5)").
                    return {
                        ...emptyModel(),
                        atoms: otherSide.atoms.map(atom => ({coeff: atom.coeff * scalar, render: atom.render}))
                    };
                }

                // Cas générique (D-04, repli LOCAL) : un dé (seul ou mêlé à
                // une constante/variable/atome) multiplié par un scalaire ne
                // se simplifie jamais dans un bucket numérique — "2*1d6" tire
                // UN dé et double le résultat, ce n'est pas "2d6" (deux dés) ;
                // il devient un ATOME opaque de coefficient `scalar`,
                // exactement comme la division (D-05) : "2*(1d8+3)" ->
                // "2×(1d8+3)".
                return {...emptyModel(), atoms: [{coeff: scalar, render: wrap(otherSide)}]};
            }

            // Ni l'un ni l'autre n'est un scalaire pur (produit de deux dés,
            // deux variables, dé × variable, atome × variable…) : générique,
            // JAMAIS simplifié — ATOME opaque de coefficient 1 portant
            // "{wrap(a)}×{wrap(b)}" (D-04, repli LOCAL). Aucune formule des
            // packs n'atteint plus jamais le filet de sécurité global pour ce
            // motif (balayage du corpus, plan 20-05).
            return {...emptyModel(), atoms: [{coeff: 1, render: `${wrap(a)}×${wrap(b)}`}]};
        }

        function divide(a, b) {
            if (FormulaDisplay.isPureNumber(a) && FormulaDisplay.isPureNumber(b) && b.const !== 0) {
                return numberValue(a.const / b.const);
            }
            // Division opaque (D-05) : ni évaluable, ni simplifiable — seule
            // elle subsiste comme atome, mais ses DEUX opérandes ont été
            // pliés localement avant d'arriver ici (repli LOCAL, D-04).
            return {...emptyModel(), atoms: [{coeff: 1, render: `${wrap(a)}÷${wrap(b)}`}]};
        }

        function applyRoundingFunc(name, value) {
            if (FormulaDisplay.isPureNumber(value)) {
                return numberValue(ROUND_FUNCS[name](value.const));
            }
            // Transparent (D-05) : ceil/trunc/floor/round ne sont JAMAIS
            // affichés. Non-numérique, seul l'enfant (typiquement une
            // division opaque) subsiste.
            return value;
        }

        function parseExpr() {
            let terms = parseTerm();
            while (peek() === "+" || peek() === "-") {
                const op = next();
                terms = combine(terms, parseTerm(), op === "-" ? -1 : 1);
            }
            return terms;
        }

        function parseTerm() {
            let factors = parseUnary();
            while (peek() === "*" || peek() === "/" || startsFactorImplicit()) {
                if (peek() === "*") {
                    next();
                    factors = multiply(factors, parseUnary());
                } else if (peek() === "/") {
                    next();
                    factors = divide(factors, parseUnary());
                } else {
                    factors = multiply(factors, parseUnary());
                }
            }
            return factors;
        }

        function parseUnary() {
            if (peek() === "+") {
                next();
                return parseUnary();
            }
            if (peek() === "-") {
                next();
                return multiply(parseUnary(), numberValue(-1));
            }
            return parseFactorWithDie();
        }

        // Reconnaît le jeton "d" JUSTE APRÈS un facteur déjà parsé (D-07/D-08) :
        // le compte (déjà plié) et la taille (parsée puis pliée) sont transmis
        // à FormulaDisplay.foldDie, qui décide de la fusion numérique
        // (bucket `dice`) ou du rendu symbolique (bucket `symDice`). Le "d"
        // n'apparaît jamais en tête d'un facteur (voir le garde-fou de
        // parseFactor) : il est toujours en position infixe, entre un compte
        // déjà consommé et une taille à consommer.
        function parseFactorWithDie() {
            const count = parseFactor();
            if (peek() === "d") {
                next();
                const size = parseFactor();
                return FormulaDisplay.foldDie(count, size, expr);
            }
            return count;
        }

        function parseFactor() {
            if (peek() === "(") {
                next();
                enterGroup();
                const val = parseExpr();
                if (peek() !== ")") {
                    throw new Error(`Parenthèse fermante attendue dans "${expr}"`);
                }
                next();
                exitGroup();
                return val;
            }
            const tok = next();
            if (tok === undefined) {
                throw new Error(`Expression incomplète: "${expr}"`);
            }
            if (isDiceToken(tok)) {
                const [countStr, sizeStr] = tok.split("d");
                const count = countStr ? parseInt(countStr, 10) : 1;
                const size = parseInt(sizeStr, 10);
                return {...emptyModel(), dice: {[size]: count}};
            }
            if (isNumToken(tok)) {
                return numberValue(parseFloat(tok));
            }
            if (tok === "X" || tok === "Y") {
                return {...emptyModel(), vars: {[tok]: 1}};
            }
            if (tok === "XXX" || tok === "YYY") {
                // Robustesse : la substitution XXX→X/YYY→Y (par valeur ou
                // symbolique) a lieu avant le repli (foldSegments) ; ce cas ne
                // devrait plus survenir ici.
                return {...emptyModel(), vars: {[tok === "XXX" ? "X" : "Y"]: 1}};
            }
            if (Object.values(UNKNOWN_ABILITY_VARS).includes(tok)) {
                // Caractéristique non résolue (D-15) : variable symbolique
                // dont le nom de rendu est l'emoji de la caractéristique — se
                // combine et se multiplie par un scalaire exactement comme
                // X/Y (voir FormulaDisplay.substituteAbilityTokens).
                return {...emptyModel(), vars: {[tok]: 1}};
            }
            if (Object.prototype.hasOwnProperty.call(ROUND_FUNCS, tok)) {
                if (peek() !== "(") {
                    throw new Error(`Appel de fonction "${tok}" mal formé dans "${expr}"`);
                }
                next();
                enterGroup();
                const arg = parseExpr();
                if (peek() !== ")") {
                    throw new Error(`Parenthèse fermante attendue dans "${expr}"`);
                }
                next();
                exitGroup();
                return applyRoundingFunc(tok, arg);
            }
            if (tok === "min" || tok === "max") {
                // min/max sont CONSERVÉS par la Phase 20 (D-06) : ce sont des
                // plafonds porteurs de sens, reformulés en français par
                // FormulaDisplay.foldCap plutôt qu'évalués/masqués comme
                // ceil/trunc.
                if (peek() !== "(") {
                    throw new Error(`Appel de fonction "${tok}" mal formé dans "${expr}"`);
                }
                next();
                enterGroup();
                const left = parseExpr();
                if (peek() !== ",") {
                    throw new Error(`Argument manquant pour "${tok}" dans "${expr}"`);
                }
                next();
                const right = parseExpr();
                if (peek() !== ")") {
                    throw new Error(`Parenthèse fermante attendue dans "${expr}"`);
                }
                next();
                exitGroup();
                return FormulaDisplay.foldCap(tok, left, right, expr);
            }
            if (tok === "d") {
                // "d" en tête d'un facteur (aucun compte n'a été consommé
                // avant lui) : entrée malformée. La notation de dé légitime
                // (compte puis "d" puis taille) est reconnue en position
                // infixe par parseFactorWithDie, jamais ici.
                throw new Error(`Notation de dé mal formée dans "${expr}"`);
            }
            throw new Error(`Variable non supportée "${tok}" dans "${expr}"`);
        }

        const parsed = parseExpr();
        if (pos < tokens.length) {
            throw new Error(`Tokens non consommés dans "${expr}": [${tokens.slice(pos).join(", ")}]`);
        }
        return parsed;
    }

    /**
     * Un modèle plié est « purement numérique » quand il ne porte aucun dé
     * (numérique ou symbolique), aucune variable `X`/`Y`, et aucun atome
     * opaque : seule sa `const` compte. Utilisé partout où une évaluation
     * numérique directe (division, `ceil`/`trunc`, plafond `min`/`max`,
     * taille/compte de dé) doit décider entre repli exact et repli symbolique.
     *
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} v - Le modèle plié à tester.
     *
     * @returns {boolean} `true` si le modèle ne porte qu'une constante.
     */
    static isPureNumber(v) {
        return Object.keys(v.dice).length === 0 && v.symDice.length === 0
            && Object.keys(v.vars).length === 0 && v.atoms.length === 0;
    }

    /**
     * Compte les termes additifs que produirait le rendu d'un modèle plié
     * (un par taille de dé, un par entrée `symDice`, un par variable non
     * nulle, un par atome non nul, et un pour la constante si elle est non
     * nulle ou si rien d'autre n'est présent). Décide du parenthésage : un
     * numérateur/dénominateur de division (D-05) ou une taille de dé
     * symbolique (D-07) à UN SEUL terme n'est jamais parenthésé.
     *
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} parsed - Le modèle plié.
     *
     * @returns {number} Le nombre de termes additifs de son rendu.
     */
    static renderTermCount(parsed) {
        const diceCount = Object.keys(parsed.dice).filter(size => parsed.dice[size]).length;
        const symDiceCount = parsed.symDice.length;
        const varCount = Object.keys(parsed.vars).filter(name => parsed.vars[name]).length;
        const atomCount = parsed.atoms.filter(atom => atom.coeff !== 0).length;
        const hasOther = diceCount || symDiceCount || varCount || atomCount;
        const constCount = (parsed.const !== 0 || !hasOther) ? 1 : 0;
        return diceCount + symDiceCount + varCount + atomCount + constCount;
    }

    /**
     * Construit un terme de dé (repli LOCAL, D-04) à partir de ses deux
     * enfants DÉJÀ pliés — compte et taille — produits par
     * `parseExpression`/`parseFactorWithDie` : nombre ET taille purement
     * numériques (`FormulaDisplay.isPureNumber`) → le dé rejoint le bucket
     * `dice` existant, résolu EXACTEMENT (D-07), fusionné par taille comme un
     * dé numérique ordinaire ; une taille calculée ≤ 0 est ramenée à 0 et
     * s'affiche littéralement `{compte}d0` (choix explicite de l'utilisateur :
     * fidélité à ce que le moteur recevra, plutôt que masquer un état mal
     * calibré). Sinon (compte OU taille symbolique) un élément est poussé
     * dans `symDice`, rendu `{rendu du compte}d{rendu de la taille}` — sans
     * parenthèses autour d'une taille symbolique à un seul terme additif
     * (D-07, `FormulaDisplay.renderTermCount`/`MAX_SYMBOLIC_DIE_SIZE_TERMS`).
     *
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} countNode - Le modèle plié du nombre de dés.
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} sizeNode  - Le modèle plié de la taille de dé.
     * @param {string} expr - L'expression d'origine (non utilisée directement, conservée pour la cohérence des signatures d'aide au repli).
     *
     * @returns {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} Un modèle plié portant le dé dans `dice` (numérique) ou `symDice` (symbolique).
     */
    static foldDie(countNode, sizeNode, _expr) {
        const countIsNum = FormulaDisplay.isPureNumber(countNode);
        const sizeIsNum = FormulaDisplay.isPureNumber(sizeNode);

        if (countIsNum && sizeIsNum) {
            const model = emptyModel();
            model.dice[Math.max(0, Math.trunc(sizeNode.const))] = Math.trunc(countNode.const);
            return model;
        }

        const countRender = countIsNum
            ? Math.trunc(countNode.const).toString()
            : FormulaDisplay.renderFolded(countNode);
        let sizeRender;
        if (sizeIsNum) {
            sizeRender = Math.max(0, Math.trunc(sizeNode.const)).toString();
        } else {
            const rendered = FormulaDisplay.renderFolded(sizeNode);
            sizeRender = FormulaDisplay.renderTermCount(sizeNode) > MAX_SYMBOLIC_DIE_SIZE_TERMS
                ? `(${rendered})` : rendered;
        }
        const model = emptyModel();
        model.symDice.push({render: `${countRender}d${sizeRender}`});
        return model;
    }

    /**
     * Construit un plafond `min`/`max` (D-06) à partir de ses deux opérandes
     * DÉJÀ pliés : les deux purement numériques → évalués par `Math.min`/
     * `Math.max`, le nœud disparaît (comme `ceil`/`trunc` sur du numérique) ;
     * un opérande numérique (la borne) et un opérande symbolique → un ATOME
     * de coefficient 1 dont le rendu vaut `{rendu du symbolique} ({libellé
     * INVERSÉ, CAP_LABEL_KEYS} {borne})` — `4×X (max 5)` pour
     * `@int*(min(5,XXX))` une fois multiplié par le coefficient scalaire
     * (`multiply`, D-03) ; les deux symboliques (aucune formule des packs
     * n'atteint ce cas) → un atome conservant la forme fonctionnelle
     * `{nom}({gauche} ; {droite})`.
     *
     * @param {"min"|"max"} kind - La fonction d'origine.
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} left  - Le modèle plié du premier opérande.
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} right - Le modèle plié du second opérande.
     * @param {string} expr - L'expression d'origine (non utilisée directement, conservée pour la cohérence des signatures d'aide au repli).
     *
     * @returns {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} Un modèle plié : constante (numérique) ou atome (plafond français).
     */
    static foldCap(kind, left, right, _expr) {
        const leftIsNum = FormulaDisplay.isPureNumber(left);
        const rightIsNum = FormulaDisplay.isPureNumber(right);

        if (leftIsNum && rightIsNum) {
            const model = emptyModel();
            model.const = kind === "min" ? Math.min(left.const, right.const) : Math.max(left.const, right.const);
            return model;
        }

        const model = emptyModel();
        if (leftIsNum !== rightIsNum) {
            const bound = leftIsNum ? left : right;
            const symbolic = leftIsNum ? right : left;
            const label = game.i18n.localize(CAP_LABEL_KEYS[kind]);
            model.atoms.push({coeff: 1, render: `${FormulaDisplay.renderFolded(symbolic)} (${label} ${bound.const})`});
            return model;
        }

        model.atoms.push({
            coeff: 1,
            render: `${kind}(${FormulaDisplay.renderFolded(left)} ; ${FormulaDisplay.renderFolded(right)})`
        });
        return model;
    }

    /**
     * Rend le modèle plié `{const, dice, symDice, vars, atoms}` en chaîne,
     * dans l'ordre D-09 : dés numériques par taille décroissante, puis
     * `symDice` dans l'ordre d'apparition, puis la constante (omise si nulle
     * ET si autre chose est rendu), puis `X` puis `Y`, puis toute variable
     * symbolique de caractéristique non résolue (D-15, `UNKNOWN_ABILITY_VARS`,
     * ordre canonique str/dex/con/int/wis/cha), puis les atomes (`render` si
     * coeff 1, `-render` si coeff -1, sinon `{coeff}×{render}`).
     *
     * @param {{const: number, dice: Object<number, number>, symDice: Array<{render: string}>, vars: Object<string, number>, atoms: Array<{coeff: number, render: string}>}} parsed - Le modèle plié.
     *
     * @returns {string} La formule rendue (« 0 » si rien à afficher).
     */
    static renderFolded(parsed) {
        const diceParts = Object.keys(parsed.dice)
            .map(Number)
            .filter(size => parsed.dice[size])
            .sort((a, b) => b - a)
            .map(size => `${parsed.dice[size]}d${size}`);

        const symDiceParts = parsed.symDice.map(sd => sd.render);

        const varParts = ["X", "Y", ...Object.values(UNKNOWN_ABILITY_VARS)]
            .filter(v => parsed.vars[v])
            .map(v => {
                const coeff = parsed.vars[v];
                if (coeff === 1) return v;
                if (coeff === -1) return `-${v}`;
                return `${coeff}${v}`;
            });

        const atomParts = parsed.atoms
            .filter(atom => atom.coeff !== 0)
            .map(atom => {
                if (atom.coeff === 1) return atom.render;
                if (atom.coeff === -1) return `-${atom.render}`;
                return `${atom.coeff}×${atom.render}`;
            });

        const hasOther = diceParts.length || symDiceParts.length || varParts.length || atomParts.length;
        const constPart = (parsed.const !== 0 || !hasOther) ? [parsed.const.toString()] : [];

        const parts = [...diceParts, ...symDiceParts, ...constPart, ...varParts, ...atomParts];

        let out = "";
        for (const part of parts) {
            if (out === "") {
                out = part;
            } else if (part.startsWith("-")) {
                out += part;
            } else {
                out += `+${part}`;
            }
        }
        return out || "0";
    }

    /**
     * Remplace, dans une chaîne, chaque jeton d'arme (`@wpnR`/`@wpnM`) présent
     * par la formule de dégâts de l'arme équipée correspondante. Sémantique
     * strictement identique à `WeaponDamage.substituteInDamage` : aucune
     * parenthèse n'est ajoutée autour de la formule d'arme substituée.
     *
     * @param {string} str   - La chaîne contenant d'éventuels jetons d'arme.
     * @param {object} actor - L'acteur porteur de l'arme.
     *
     * @returns {string} La chaîne avec les jetons d'arme substitués.
     */
    static substituteWeaponTokens(str, actor) {
        let result = str;
        for (const [token, {categories}] of Object.entries(WEAPON_TOKENS)) {
            if (result.includes(token)) {
                result = result.replaceAll(token, WeaponDamage.getEquippedWeaponDamageFormula(actor, categories));
            }
        }
        return result;
    }

    /**
     * Remplace, dans une chaîne, chaque jeton de bonus nommé (`@bonus.<nom>`)
     * par la valeur `system.fq.cardBonus.<nom>` de l'acteur, ou `0` si aucune
     * valeur n'est déclarée. Sémantique identique à
     * `RollService.replaceNamedBonus`, appliquée AVANT la simplification pour
     * que le jeton n'atteigne jamais le parseur. Aucune pastille n'est jamais
     * produite pour un bonus nommé (D-12) : il reste fondu dans la constante.
     *
     * @param {string} str   - La chaîne contenant d'éventuels jetons `@bonus.<nom>`.
     * @param {object} actor - L'acteur porteur des bonus nommés.
     *
     * @returns {string} La chaîne avec les bonus nommés substitués.
     */
    static substituteNamedBonusTokens(str, actor) {
        return str.replace(/@bonus\.(\w+)/g, (_, name) => {
            const bonus = Number(actor?.system?.fq?.cardBonus?.[name]);
            return Number.isFinite(bonus) ? bonus.toString() : "0";
        });
    }

    /**
     * Modificateur de caractéristique du personnage de l'utilisateur courant,
     * ou `null` si indisponible (aucun personnage assigné — MJ ouvrant un
     * deck, feuille de compendium — ou caractéristique absente du système).
     * Ne lève JAMAIS (D-15) : c'est `substituteAbilityTokens` qui décide quoi
     * faire d'un modificateur indisponible.
     *
     * @param {string} ability - La clé de caractéristique (`str`…`cha`).
     *
     * @returns {number|null} Le modificateur, ou `null` si non résolu.
     */
    static resolveAbilityMod(ability, actor) {
        // L'acteur explicite prime (cohérence avec la résolution d'arme, qui le
        // reçoit déjà) ; sans lui on retombe sur l'accesseur de projet, seule
        // source pour les appels qui ne threadent pas d'acteur.
        const abilities = actor?.system?.abilities ?? Constants.actorAbi;
        const mod = abilities?.[ability]?.mod;
        return Number.isFinite(mod) ? mod : null;
    }

    /**
     * Remplace, dans une chaîne, chaque jeton de caractéristique (`@str`…) par
     * le modificateur numérique nu du personnage de l'utilisateur courant
     * (aucun emoji inline produit ici pour une caractéristique RÉSOLUE : le
     * détail se déplace dans la pastille de source du segment, voir
     * `collectSourceDetails`). Ne lève JAMAIS (D-15, correction du bug
     * `undefined(🧠)`) : un modificateur indisponible fait passer le jeton en
     * VARIABLE SYMBOLIQUE dont le nom de rendu est l'emoji de la
     * caractéristique (`UNKNOWN_ABILITY_VARS`) — elle participe à l'algèbre du
     * repli exactement comme `X`/`Y` (se combine, se multiplie par un
     * scalaire) plutôt que de faire échouer tout le segment ou d'inventer un
     * `0` qui mentirait sur la formule réellement reçue par le moteur.
     *
     * @param {string} str - La chaîne contenant d'éventuels jetons de caractéristique.
     *
     * @returns {string} La chaîne avec les modificateurs substitués (numériques ou symboliques).
     */
    static substituteAbilityTokens(str, actor) {
        let result = str;
        for (const ability of Object.keys(ABILITY_EMOJIS)) {
            const token = `@${ability}`;
            if (result.includes(token)) {
                const mod = FormulaDisplay.resolveAbilityMod(ability, actor);
                const replacement = mod !== null ? mod.toString() : UNKNOWN_ABILITY_VARS[ability];
                result = result.replaceAll(token, replacement);
            }
        }
        return result;
    }

    /**
     * Liste dédupliquée des emojis de source de modification présents dans une
     * chaîne BRUTE (avant substitution) : d'abord les icônes d'arme (jetons
     * `@wpnM`/`@wpnR`), puis les icônes de caractéristique dans l'ordre
     * canonique `str, dex, con, int, wis, cha`. Détection par simple présence
     * du jeton, indépendamment du signe du modificateur. Conservée pour
     * `fallback` (qui n'a pas de pastille, donc pas besoin du détail chiffré)
     * et pour les tests existants ; `forDisplay` utilise désormais
     * `collectSourceDetails`, qui porte en plus le tooltip chiffré.
     *
     * @param {string} raw - La chaîne brute (non transformée) à inspecter.
     *
     * @returns {string[]} Les emojis de source, dans l'ordre arme puis caractéristiques.
     */
    static collectSources(raw) {
        if (typeof raw !== "string") {
            return [];
        }
        const sources = [];
        for (const token of Object.keys(WEAPON_EMOJIS)) {
            if (raw.includes(token)) {
                sources.push(WEAPON_EMOJIS[token]);
            }
        }
        for (const ability of Object.keys(ABILITY_EMOJIS)) {
            if (raw.includes(`@${ability}`)) {
                sources.push(ABILITY_EMOJIS[ability]);
            }
        }
        return sources;
    }

    /**
     * Liste des sources de modification présentes dans une chaîne BRUTE
     * (avant substitution), chacune porteuse d'un tooltip DÉJÀ localisé et
     * chiffré (D-11) : pour un jeton d'arme, `` `{libellé} — {nom de l'arme}
     * ({formule})` ``, ou le libellé « aucune arme équipée » sans arme
     * correspondante ; pour une caractéristique RÉSOLUE,
     * `` `{libellé} ({signe}{valeur})` ``. Aucune entrée n'est jamais produite
     * pour un bonus nommé (D-12), NI pour une caractéristique NON résolue
     * (D-15, discrétion du planificateur documentée, à vérifier humainement
     * en fin de phase — plan 20-05) : une pastille de source annonce une
     * contribution CHIFFRÉE, or il n'y en a pas ; cette caractéristique est à
     * la place rendue EN LIGNE comme variable symbolique dans la formule
     * elle-même (voir `substituteAbilityTokens`), avec son propre tooltip
     * porté par `EMOJI_TOOLTIP_KEYS` (`DisplayCard.wrapEmojiTooltips`), pas par
     * ce groupe. Les tooltips sont assemblés par concaténation de chaînes déjà
     * localisées (pas `game.i18n.format`) pour rester déterministes en test.
     *
     * @param {string} raw   - La chaîne brute (non transformée) à inspecter.
     * @param {object} actor - L'acteur pour la résolution de l'arme équipée.
     *
     * @returns {Array<{emoji: string, tooltip: string}>} Les sources détaillées, dans l'ordre arme puis caractéristiques.
     */
    static collectSourceDetails(raw, actor) {
        if (typeof raw !== "string") {
            return [];
        }
        const details = [];
        for (const token of Object.keys(WEAPON_TOKENS)) {
            if (raw.includes(token)) {
                const {emoji, tooltip} = FormulaDisplay.weaponSourceDetail(token, actor);
                details.push({emoji, tooltip});
            }
        }
        for (const ability of Object.keys(ABILITY_EMOJIS)) {
            if (!raw.includes(`@${ability}`)) {
                continue;
            }
            const detail = FormulaDisplay.abilitySourceDetail(ability, actor);
            // D-15 : une caractéristique NON résolue n'entre pas dans le groupe
            // de sources d'une formule — le groupe annonce des contributions
            // chiffrées, et il n'y en a pas. Elle est rendue en ligne comme
            // variable symbolique par `substituteAbilityTokens`.
            if (detail.mod !== null) {
                // Le `mod` reste interne aux fabriques : le contrat public de
                // `collectSourceDetails` est `{emoji, tooltip}`, consommé tel
                // quel par `assembleFolded`.
                details.push({emoji: detail.emoji, tooltip: detail.tooltip});
            }
        }
        return details;
    }

    /**
     * Détail de pastille de source pour UNE caractéristique : emoji, valeur du
     * modificateur (`null` si non résolue) et tooltip chiffré. Source unique
     * du format de tooltip de caractéristique, consommée par
     * `collectSourceDetails` (formules repliées) ET par
     * `DisplayCard.transformForDescription` (jetons écrits à même la prose) —
     * sans quoi les deux chemins d'affichage divergeraient sur le format ou
     * sur l'accesseur de modificateur.
     *
     * @param {string} ability - La clé de caractéristique (`str`…`cha`).
     * @param {object} [actor] - L'acteur porteur du modificateur.
     *
     * @returns {{emoji: string, mod: number|null, tooltip: string}} Le détail de la pastille.
     */
    static abilitySourceDetail(ability, actor) {
        const mod = FormulaDisplay.resolveAbilityMod(ability, actor);
        const label = game.i18n.localize(SOURCE_LABEL_KEYS[ability]);
        const sign = mod !== null && mod >= 0 ? "+" : "";
        return {
            emoji: ABILITY_EMOJIS[ability],
            mod,
            tooltip: mod === null ? label : `${label} (${sign}${mod})`
        };
    }

    /**
     * Détail de pastille de source pour UN jeton d'arme : emoji et tooltip
     * nommant l'arme équipée et sa formule de dégâts, ou le libellé « aucune
     * arme équipée ». Pendant de `abilitySourceDetail`, même rôle de source
     * unique de format.
     *
     * @param {string} token   - Le jeton d'arme (`@wpnM` ou `@wpnR`).
     * @param {object} [actor] - L'acteur porteur de l'arme.
     *
     * @returns {{emoji: string, mod: null, tooltip: string}} Le détail de la pastille.
     */
    static weaponSourceDetail(token, actor) {
        const {categories} = WEAPON_TOKENS[token];
        const label = game.i18n.localize(SOURCE_LABEL_KEYS[token]);
        const weapon = WeaponDamage.getEquippedWeapon(actor, categories);
        const tooltip = weapon
            ? `${label} — ${weapon.name} (${WeaponDamage.getEquippedWeaponDamageFormula(actor, categories)})`
            : game.i18n.localize("FQCARDENGINE.SourceWeaponNone");
        return {emoji: WEAPON_EMOJIS[token], mod: null, tooltip};
    }

    /**
     * Découpe une chaîne de formule en segments `{expr, type}` sur les jetons
     * de type de dégâts (`[slashing]`…). Chaque segment porte l'expression qui
     * précède son jeton (un `+` de liaison en tête est retiré) et le jeton de
     * type INTACT (crochets compris). Le reste après le dernier jeton devient
     * un segment de type `null` (omis s'il est vide). Une chaîne sans aucun
     * jeton donne un unique segment `{expr: str, type: null}`.
     *
     * @param {string} str - La chaîne (déjà substituée) à découper.
     *
     * @returns {Array<{expr: string, type: string|null}>} Les segments dans l'ordre d'apparition.
     */
    static splitDamageSegments(str) {
        const segments = [];
        let lastIndex = 0;
        let match;
        // Instance locale : une regex `g` partagée au niveau module exposerait
        // son `lastIndex` mutable à toute utilisation concurrente.
        const pattern = new RegExp(DAMAGE_TYPE_PATTERN.source, "g");
        while ((match = pattern.exec(str)) !== null) {
            let expr = str.slice(lastIndex, match.index);
            if (expr.startsWith("+")) {
                expr = expr.slice(1);
            }
            segments.push({expr, type: match[0]});
            lastIndex = pattern.lastIndex;
        }
        const remainder = str.slice(lastIndex);
        if (remainder) {
            const expr = remainder.startsWith("+") ? remainder.slice(1) : remainder;
            segments.push({expr, type: null});
        }
        if (segments.length === 0) {
            segments.push({expr: str, type: null});
        }
        return segments;
    }

    /**
     * Assemble les segments repliés en formule d'affichage (D-11) : chaque
     * segment rend `{formule}{" " si au moins une pastille}{pastilles de
     * source}{pastille de type}`, segments joints par `+`. Les pastilles de
     * source sont produites par `makePill(PILL_SOURCE, …)` ; la pastille de
     * type, en teinte neutre unique pour les 13 types, par
     * `makePill(PILL_TYPE, …)` avec pour tooltip la CLÉ i18n (localisée par le
     * TooltipManager de Foundry à l'affichage, pas ici).
     *
     * @param {Array<{expr: string, type: string|null, sourceDetails: Array<{emoji: string, tooltip: string}>}>} segments - Les segments déjà repliés.
     *
     * @returns {string} La formule assemblée, prête à l'affichage (avec marqueurs de pastille).
     */
    static assembleFolded(segments) {
        if (!segments.length) {
            return "0";
        }
        return segments.map(({expr, type, sourceDetails}) => {
            const typeName = type ? type.slice(1, -1) : null;
            const typeEmoji = typeName ? DAMAGE_TYPE_EMOJIS[typeName] : null;
            const sourcePills = (sourceDetails ?? [])
                .map(({emoji, tooltip}) => makePill(PILL_SOURCE, emoji, tooltip))
                .join("");
            const typePill = typeEmoji ? makePill(PILL_TYPE, typeEmoji, EMOJI_TOOLTIP_KEYS[typeEmoji]) : "";
            const pills = `${sourcePills}${typePill}`;
            return pills ? `${expr} ${pills}` : expr;
        }).join("+");
    }

    /**
     * Repli gracieux déclenché quand le chemin optimal de `forDisplay`
     * échoue : renvoie la chaîne d'origine avec UNIQUEMENT les jetons d'arme
     * substitués (les jetons de caractéristique restent intacts, c'est
     * `DisplayCard.transformForDescription` qui les rendra comme aujourd'hui),
     * suivie du groupe d'icônes d'ARME (pas de caractéristique) si au moins un
     * jeton d'arme était présent. Si la substitution d'arme elle-même échoue,
     * renvoie la chaîne brute d'origine, inchangée. Filet de sécurité de
     * dernier recours : ne doit plus jamais se déclencher sur les formules des
     * packs une fois la Phase 20 achevée.
     *
     * @param {string} raw   - La chaîne brute d'origine (avant toute transformation, déjà assainie côté appelant).
     * @param {object} actor - L'acteur pour la résolution des jetons d'arme.
     *
     * @returns {string} La chaîne dégradée, jamais une exception.
     */
    static fallback(raw, actor) {
        let withWeapons;
        try {
            withWeapons = FormulaDisplay.substituteWeaponTokens(raw, actor);
        } catch {
            return raw;
        }
        const weaponSources = Object.keys(WEAPON_EMOJIS)
            .filter(token => raw.includes(token))
            .map(token => WEAPON_EMOJIS[token]);
        return weaponSources.length ? `${withWeapons} (${weaponSources.join("")})` : withWeapons;
    }
}
