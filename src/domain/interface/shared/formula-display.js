import Constants from "../../constants.js";
import WeaponDamage, {WEAPON_TOKENS} from "../../engine/roll/weapon-damage.js";

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
 * Table emoji → clé i18n de tooltip, dérivée des trois tables sources
 * (caractéristiques, armes, types de dégâts). Consommée par
 * `DisplayCard.wrapEmojiTooltips` pour envelopper chaque emoji d'un
 * `data-tooltip` Foundry (localisé automatiquement par le TooltipManager).
 * @type {Object<string, string>}
 */
export const EMOJI_TOOLTIP_KEYS = {
    ...Object.fromEntries(Object.entries(ABILITY_EMOJIS)
        .map(([ability, emoji]) => [emoji, `FQCARDENGINE.TooltipAbility${capitalize(ability)}`])),
    [WEAPON_EMOJIS["@wpnM"]]: "FQCARDENGINE.TooltipWeaponMelee",
    [WEAPON_EMOJIS["@wpnR"]]: "FQCARDENGINE.TooltipWeaponRanged",
    ...Object.fromEntries(Object.entries(DAMAGE_TYPE_EMOJIS)
        .map(([type, emoji]) => [emoji, `FQCARDENGINE.TooltipDamage${capitalize(type)}`]))
};

const DAMAGE_TYPE_PATTERN = new RegExp(`\\[(${DAMAGE_TYPES.join("|")})]`, "g");

/**
 * Tokenizer du moteur de repli : la notation de dé (`\d*d\d+`) est testée
 * AVANT la notation numérique, sinon `1d6` se découperait en `1`, `d`, `6`
 * (landmine documentée dans 13-PATTERNS.md).
 * @type {RegExp}
 */
const TOKEN_PATTERN = /\d*d\d+|\d+(?:\.\d+)?|[a-zA-Z_]+|[+\-*()]/g;

/**
 * Repli d'affichage des formules de dégâts/soin d'une carte : résolution des
 * jetons d'arme équipée (@wpnM/@wpnR) et de caractéristique (@str…), fusion
 * des dés et constantes, groupe d'icônes de sources de modification, symbole
 * de type laissé intact pour `DisplayCard.transformForDescription`.
 * N'affecte jamais la formule réellement lancée par le moteur (lecture seule).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class FormulaDisplay {

    /**
     * Point d'entrée unique du repli d'affichage. Ne lève jamais : toute
     * expression non repliable retombe sur l'affichage transformé actuel
     * (jetons d'arme substitués, jetons de caractéristique intacts) plutôt
     * que de faire remonter une exception jusqu'à la vue.
     *
     * @param {*}      raw            - La valeur brute du champ (souvent une chaîne de formule).
     * @param {object} [actor]        - L'acteur pour la résolution des jetons d'arme (défaut : personnage de l'utilisateur courant).
     *
     * @returns {*} La formule repliée pour l'affichage, ou `raw` inchangé si non applicable.
     */
    static forDisplay(raw, actor = Constants.actorCurrent) {
        if (typeof raw !== "string" || raw.trim() === "") {
            return raw;
        }
        try {
            const segments = FormulaDisplay.splitDamageSegments(raw).map(({expr, type}) => {
                // Le découpage en segments et la collecte des sources se font sur
                // la chaîne BRUTE : c'est ce qui rattache chaque icône au groupe de
                // dégâts où son jeton a été écrit. Les formules d'arme substituées
                // ne portent jamais de jeton de type, le découpage est donc le même
                // avant et après substitution.
                const sources = FormulaDisplay.collectSources(expr);
                const withWeapons = FormulaDisplay.substituteWeaponTokens(expr, actor);
                const withBonuses = FormulaDisplay.substituteNamedBonusTokens(withWeapons, actor);
                const normalized = withBonuses.replaceAll("XXX", "X").replaceAll("YYY", "Y");
                const withAbilities = FormulaDisplay.substituteAbilityTokens(normalized);
                return {expr: FormulaDisplay.foldExpression(withAbilities), type, sources};
            });
            return FormulaDisplay.assembleFolded(segments);
        } catch {
            return FormulaDisplay.fallback(raw, actor);
        }
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
     * par la valeur `system.fq.bonus.cards.<nom>` de l'acteur, ou `0` si aucune
     * valeur n'est déclarée. Sémantique identique à
     * `RollService.replaceNamedBonus`, appliquée AVANT la simplification pour
     * que le jeton n'atteigne jamais `foldExpression`.
     *
     * @param {string} str   - La chaîne contenant d'éventuels jetons `@bonus.<nom>`.
     * @param {object} actor - L'acteur porteur des bonus nommés.
     *
     * @returns {string} La chaîne avec les bonus nommés substitués.
     */
    static substituteNamedBonusTokens(str, actor) {
        return str.replace(/@bonus\.(\w+)/g, (_, name) => {
            const bonus = Number(actor?.system?.fq?.bonus?.cards?.[name]);
            return Number.isFinite(bonus) ? bonus.toString() : "0";
        });
    }

    /**
     * Remplace, dans une chaîne, chaque jeton de caractéristique (`@str`…) par
     * le modificateur numérique nu du personnage de l'utilisateur courant
     * (aucun emoji inline produit ici, D-05 : le détail se déplace dans le
     * groupe de sources du segment).
     *
     * @param {string} str - La chaîne contenant d'éventuels jetons de caractéristique.
     *
     * @returns {string} La chaîne avec les modificateurs substitués.
     *
     * @throws {Error} Si un jeton est présent et que le modificateur correspondant n'est pas un nombre fini.
     */
    static substituteAbilityTokens(str) {
        let result = str;
        for (const ability of Object.keys(ABILITY_EMOJIS)) {
            const token = `@${ability}`;
            if (result.includes(token)) {
                const mod = Constants.actorAbi?.[ability]?.mod;
                if (!Number.isFinite(mod)) {
                    throw new Error(`Modificateur de caractéristique indisponible pour "${token}"`);
                }
                result = result.replaceAll(token, mod.toString());
            }
        }
        return result;
    }

    /**
     * Liste dédupliquée des emojis de source de modification présents dans une
     * chaîne BRUTE (avant substitution) : d'abord les icônes d'arme (jetons
     * `@wpnM`/`@wpnR`), puis les icônes de caractéristique dans l'ordre
     * canonique `str, dex, con, int, wis, cha`. Détection par simple présence
     * du jeton, indépendamment du signe du modificateur (D-06). Appelée par
     * `forDisplay` sur CHAQUE segment de type de dégâts, la déduplication est
     * donc locale au segment : un même jeton présent dans deux groupes de
     * dégâts affiche son icône dans chacun.
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
     * Découpe une chaîne de formule en segments `{expr, type}` sur les jetons
     * de type de dégâts (`[slashing]`…). Chaque segment porte l'expression qui
     * précède son jeton (un `+` de liaison en tête est retiré) et le jeton de
     * type INTACT (crochets compris — la conversion en emoji reste la
     * responsabilité de `DisplayCard.transformForDescription`). Le reste après
     * le dernier jeton devient un segment de type `null` (omis s'il est vide).
     * Une chaîne sans aucun jeton donne un unique segment `{expr: str, type: null}`.
     *
     * @param {string} str - La chaîne (déjà substituée) à découper.
     *
     * @returns {Array<{expr: string, type: string|null}>} Les segments dans l'ordre d'apparition.
     */
    static splitDamageSegments(str) {
        const segments = [];
        let lastIndex = 0;
        let match;
        DAMAGE_TYPE_PATTERN.lastIndex = 0;
        while ((match = DAMAGE_TYPE_PATTERN.exec(str)) !== null) {
            let expr = str.slice(lastIndex, match.index);
            if (expr.startsWith("+")) {
                expr = expr.slice(1);
            }
            segments.push({expr, type: match[0]});
            lastIndex = DAMAGE_TYPE_PATTERN.lastIndex;
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
     * Replie une expression algébrique en un modèle dés + constante +
     * variables symboliques (D-01), puis la rend dans l'ordre dés (taille
     * décroissante) → constante → variables X puis Y (D-02/D-04). Descente
     * récursive calquée sur `DisplayCard.simplifyExpression`, étendue avec un
     * terme de dé de première classe (`NdX`) et restreinte aux variables `X`
     * et `Y` : toute autre variable alphabétique (fonction `ceil`/`min`, `d`
     * isolé d'un dé à taille variable) est un cas non supporté par ce plan et
     * lève, pour retomber sur le fallback de `forDisplay`. Les garde-fous
     * stricts de fidélité au jet (dé multiplié/soustrait, caractères non
     * couverts) sont complétés par un plan ultérieur.
     *
     * @param {string} expr - L'expression à replier.
     *
     * @returns {string} L'expression repliée (« 0 » si le résultat est vide).
     *
     * @throws {Error} Si l'expression est incomplète, mal parenthésée, contient
     *                 un produit de deux variables, une variable non supportée,
     *                 des tokens non consommés, un caractère non reconnu par le
     *                 tokenizer (division, virgule, jeton `@` résiduel), un dé
     *                 sous multiplication, ou un dé sous signe négatif/soustraction.
     */
    static foldExpression(expr) {
        const tokens = expr.match(TOKEN_PATTERN);
        if (!tokens) {
            return expr;
        }
        if (tokens.join("") !== expr.replace(/\s+/g, "")) {
            // Garde-fou le plus important : sans lui, un caractère non géré par
            // le tokenizer (division, virgule d'appel de fonction, jeton `@`
            // résiduel) serait silencieusement ignoré et le repli mentirait sur
            // la formule réelle (ex. "XXX/2" deviendrait "2X").
            throw new Error(`Caractère non reconnu dans l'expression "${expr}"`);
        }

        let pos = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];
        const isDiceToken = (t) => /^\d*d\d+$/.test(t);

        const startsFactorImplicit = () => {
            const t = peek();
            return t !== undefined && t !== "+" && t !== "-" && t !== "*" && t !== ")";
        };

        function parseExpr() {
            let terms = parseTerm();
            while (peek() === "+" || peek() === "-") {
                const op = next();
                const rhs = parseTerm();
                terms = combine(terms, rhs, op === "-" ? -1 : 1);
            }
            return terms;
        }

        function parseTerm() {
            let factors = parseFactor();
            while (peek() === "*" || startsFactorImplicit()) {
                if (peek() === "*") next();
                const rhs = parseFactor();
                factors = multiply(factors, rhs);
            }
            return factors;
        }

        function parseFactor() {
            if (peek() === "(") {
                next();
                const val = parseExpr();
                if (peek() !== ")") {
                    throw new Error(`Parenthèse fermante attendue dans "${expr}"`);
                }
                next();
                return val;
            }
            if (peek() === "+") {
                next();
                return parseFactor();
            }
            if (peek() === "-") {
                next();
                const val = parseFactor();
                return multiply(val, {const: -1, dice: {}, vars: {}});
            }
            const tok = next();
            if (tok === undefined) {
                throw new Error(`Expression incomplète: "${expr}"`);
            }
            if (isDiceToken(tok)) {
                const [countStr, sizeStr] = tok.split("d");
                const count = countStr ? parseInt(countStr, 10) : 1;
                const size = parseInt(sizeStr, 10);
                return {const: 0, dice: {[size]: count}, vars: {}};
            }
            if (/^\d/.test(tok)) {
                return {const: parseFloat(tok), dice: {}, vars: {}};
            }
            if (tok !== "X" && tok !== "Y") {
                throw new Error(`Variable non supportée "${tok}" dans "${expr}"`);
            }
            return {const: 0, dice: {}, vars: {[tok]: 1}};
        }

        function combine(a, b, sign) {
            if (sign === -1 && Object.keys(b.dice).length) {
                // La soustraction de dés ne se simplifie pas en un nombre de
                // dés : "2d6-1d6" n'a pas la distribution de "1d6" (fidélité au jet).
                throw new Error(`Soustraction de dés non supportée dans "${expr}"`);
            }
            const result = {const: a.const + sign * b.const, dice: {...a.dice}, vars: {...a.vars}};
            for (const size in b.dice) {
                result.dice[size] = (result.dice[size] || 0) + sign * b.dice[size];
            }
            for (const v in b.vars) {
                result.vars[v] = (result.vars[v] || 0) + sign * b.vars[v];
            }
            return result;
        }

        function multiply(a, b) {
            if (Object.keys(a.dice).length || Object.keys(b.dice).length) {
                // Un dé multiplié ne se simplifie jamais : "2*1d6" tire un seul
                // dé et double le résultat, alors que "2d6" en tire deux — les
                // replier l'un en l'autre ferait mentir l'affichage sur le jet réel.
                throw new Error(`Dé sous multiplication non supporté dans "${expr}"`);
            }
            if (Object.keys(a.vars).length && Object.keys(b.vars).length) {
                throw new Error(`Produit de deux variables non supporté dans "${expr}"`);
            }
            const varsSource = Object.keys(a.vars).length ? a.vars : b.vars;
            const scalar = Object.keys(a.vars).length ? b.const : a.const;
            const result = {const: a.const * b.const, dice: {}, vars: {}};
            for (const v in varsSource) {
                result.vars[v] = varsSource[v] * scalar;
            }
            return result;
        }

        const parsed = parseExpr();

        if (pos < tokens.length) {
            throw new Error(`Tokens non consommés dans "${expr}": [${tokens.slice(pos).join(", ")}]`);
        }

        return FormulaDisplay.renderFolded(parsed);
    }

    /**
     * Rend le modèle interne `{const, dice, vars}` en chaîne, dans l'ordre
     * D-02/D-04 : dés par taille décroissante, puis la constante (omise si
     * nulle et que quelque chose d'autre est rendu), puis les variables `X`
     * avant `Y` (ordre canonique fixe) avec la convention de coefficient de
     * `DisplayCard.simplifyExpression` (`X`, `-X`, `2X`).
     *
     * @param {{const: number, dice: Object<number, number>, vars: Object<string, number>}} parsed - Le modèle replié.
     *
     * @returns {string} La formule rendue (« 0 » si rien à afficher).
     */
    static renderFolded(parsed) {
        const diceParts = Object.keys(parsed.dice)
            .map(Number)
            .filter(size => parsed.dice[size])
            .sort((a, b) => b - a)
            .map(size => `${parsed.dice[size]}d${size}`);

        const varParts = ["X", "Y"]
            .filter(v => parsed.vars[v])
            .map(v => {
                const coeff = parsed.vars[v];
                if (coeff === 1) return v;
                if (coeff === -1) return `-${v}`;
                return `${coeff}${v}`;
            });

        const constPart = (parsed.const !== 0 || (diceParts.length === 0 && varParts.length === 0))
            ? [parsed.const.toString()]
            : [];

        const parts = [...diceParts, ...constPart, ...varParts];

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
     * Assemble les segments repliés, chacun avec SON propre groupe de sources
     * et son symbole de type (D-03/D-05) : aucune parenthèse autour de la
     * formule repliée, groupe de sources inséré entre la formule et le symbole
     * de type, segments joints par `+`. Chaque icône reste ainsi accolée au
     * groupe de dégâts dans lequel son jeton a été écrit, au lieu d'être
     * reportée dans un groupe unique en fin de chaîne.
     *
     * @param {Array<{expr: string, type: string|null, sources: string[]}>} segments - Les segments déjà repliés, chacun porteur de ses propres emojis de source.
     *
     * @returns {string} La formule assemblée, prête à l'affichage.
     */
    static assembleFolded(segments) {
        if (!segments.length) {
            return "0";
        }
        return segments
            .map(({expr, type, sources}) => {
                const sourceGroup = sources?.length ? ` (${sources.join("")})` : "";
                return `${expr}${sourceGroup}${type ? ` ${type}` : ""}`;
            })
            .join("+");
    }

    /**
     * Repli gracieux (D-04) déclenché quand le chemin optimal de `forDisplay`
     * échoue : renvoie la chaîne d'origine avec UNIQUEMENT les jetons d'arme
     * substitués (les jetons de caractéristique restent intacts, c'est
     * `DisplayCard.transformForDescription` qui les rendra comme aujourd'hui),
     * suivie du groupe d'icônes d'ARME (pas de caractéristique) si au moins un
     * jeton d'arme était présent. Si la substitution d'arme elle-même échoue,
     * renvoie la chaîne brute d'origine, inchangée.
     *
     * @param {string} raw   - La chaîne brute d'origine (avant toute transformation).
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
