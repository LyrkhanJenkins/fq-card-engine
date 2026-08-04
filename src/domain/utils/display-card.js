import FqConstants from "./fq-constants.js";
import FQUtils from "./fq-utils.js";

/**
 * Utilitaires de présentation d'une carte : extraction du titre, de la
 * description et de l'image, dimensionnement du texte pour le rendu SVG,
 * transformation des tokens (@abilities, [types de dégâts]) en symboles lisibles,
 * et évaluation/simplification des valeurs affichées dans les bulles.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DisplayCard {
    /**
     * Calcule la valeur à afficher dans une bulle de carte (action, mana, portée…).
     * Renvoie « 0 » si vide, « ∞ » au-delà de 99, « S » si une variable spéciale
     * (X/Y) est renseignée, la valeur évaluée du jet sinon, ou l'expression
     * algébrique simplifiée si des variables subsistent.
     *
     * @param {string} str         - L'expression brute de la bulle (peut contenir des bonus/variables).
     * @param {object} cardContent - Le contenu (choix) de la carte, portant `xvalue`/`yvalue`.
     *
     * @returns {string|number} La valeur ou le symbole à afficher.
     */
    static getNumberForBubbleCardSvg(str, cardContent) {
        if (str === "" || !str) {
            return "0";
        }
        const match = str.match(/-?\d+/g);
        if (match?.length && match[0] > 99) return "∞";
        let result = FQUtils.replaceAbilitiesBonus(str);
        if ((result.includes("XXX") && cardContent.xvalue) || (result.includes("YYY") && cardContent.yvalue)) {
            return "S";
        }
        try {
            const roll = new Roll(result).evaluateSync();
            return roll.total;
        } catch (error) {
            // Dans le cas ou il y a des variables
            result = result.replace("XXX", "X").replace("YYY", "Y");
            result = DisplayCard.simplifyExpression(result);
            return result;
        }
    }

    /**
     * Retourne la taille de police adaptée à la longueur de la description, pour
     * que le texte tienne dans la carte SVG.
     *
     * @param {string} description - Le texte de description de la carte.
     *
     * @returns {number} La taille de police (px) à appliquer.
     */
    static getDescriptionSizeForCardSvg(description) {
        let descriptionSize = {1: 40, 80: 36, 110: 34, 145: 30, 200: 26, 290: 22, 340: 20, 440: 18, 9999: 16};
        return descriptionSize[Object.keys(descriptionSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => description.length <= limit)];
    }

    /**
     * Retourne la taille de police adaptée à la longueur du titre, pour que le
     * titre tienne dans la carte SVG.
     *
     * @param {string} title - Le titre de la carte.
     *
     * @returns {number} La taille de police (px) à appliquer.
     */
    static getTitleSizeForCardSvg(title) {
        let titleSize = {1: 34, 20: 32, 25: 28, 30: 24, 9999: 20};

        return titleSize[Object.keys(titleSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => title.length <= limit)];
    }

    /**
     * Extrait et met en forme la description d'une carte à partir de sa face
     * visible, en interpolant les valeurs des choix (`system.fq.choices`) et en
     * transformant les tokens en symboles lisibles.
     *
     * @param {Card} c - La carte dont on extrait la description.
     *
     * @returns {string} La description formatée, prête à l'affichage.
     */
    static getDescriptionFromCard(c) {
        let description = "";
        if (c.face != null) {
            if (!c.faces) {
                description = undefined;
            } else {
                description = c.faces[c.face].text;
            }
        }
        if (c.face && !description) {
            description = c.data.faces[c.data.face].text;
        }
        const flat = Object.fromEntries(
            c.system.fq?.choices.flatMap((choice, i) =>
                Object.entries(choice).map(([k, v]) => [`${i}_${k}`, v])
            )
        );
        return DisplayCard.transformForDescription(game.i18n.format(description, flat));
    }

    /**
     * Retourne le nom localisé de la carte, ou le libellé du dos si la carte est
     * face cachée.
     *
     * @param {Card} c - La carte dont on extrait le nom.
     *
     * @returns {string} Le nom localisé de la carte (ou du dos).
     */
    static getNameFromCard(c) {
        let name = (c.face !== null) ? c.name : "FQCARDENGINE.CardBack";
        return game.i18n.localize(name);
    }

    /**
     * Retourne l'image à afficher pour la carte : l'image de la face visible, ou
     * l'image du dos si la carte est face cachée.
     *
     * @param {Card} c - La carte dont on extrait l'image.
     *
     * @returns {string|undefined} Le chemin de l'image, ou undefined si indisponible.
     */
    static getImgFromCard(c) {
        let img = c.back.img;
        if (c.face != null) {
            if (!c.faces) {
                img = undefined;
            } else {
                img = c.faces[c.face].img;
            }
        }
        if (c.face && !img) {
            img = c.data.faces[c.data.face].img;
        }
        return img;
    }

    /**
     * Transforme une chaîne de description en remplaçant les variables (XXX/YYY),
     * les références de caractéristiques (@int, @str…) par leur modificateur et
     * un emoji, et les types de dégâts ([fire], [cold]…) par leur symbole.
     *
     * @param {string} val - La chaîne à transformer (renvoyée telle quelle si non-string).
     *
     * @returns {string} La chaîne transformée, prête à l'affichage.
     */
    static transformForDescription(val) {
        const abilities = FqConstants.actorAbi;
        if (typeof val === "string") {
            return  val.replace("XXX","X").replace("YYY","Y")
                .replace(/@int/g, abilities?.int?.mod + "(🧠)")
                .replace(/@wis/g, abilities?.wis?.mod + "(🦉)")
                .replace(/@cha/g, abilities?.cha?.mod + "(✨️)")
                .replace(/@str/g, abilities?.str?.mod + "(💪)")
                .replace(/@dex/g, abilities?.dex?.mod + "(🎯)")
                .replace(/@con/g, abilities?.con?.mod + "(❤️)")
                .replace(/\[acid]/g, "[🧪]")
                .replace(/\[bludgeoning]/g, "[⚒️]")
                .replace(/\[cold]/g, "[🧊]")
                .replace(/\[fire]/g, "[🔥]")
                .replace(/\[force]/g, "[🌀]")
                .replace(/\[lightning]/g, "[🌩️]")
                .replace(/\[necrotic]/g, "[🩸]")
                .replace(/\[piercing]/g, "[🏹]")
                .replace(/\[poison]/g, "[☠️]")
                .replace(/\[psychic]/g, "[👁️]")
                .replace(/\[radiant]/g, "[☀️]")
                .replace(/\[slashing]/g, "[🗡️]")
                .replace(/\[thunder]/g, "[🌪️]");
        }
        return val;
    }

    /**
     * TODO Utiliser une librairie externe
     * Simplifie une expression algébrique linéaire simple.
     * Supporte : +, -, *, parenthèses, variables alphabétiques.
     * Exemples : "5 + 3 + 4*X" -> "8+4X" ; "1+5" -> "6"
     *
     * @param {string} expr - L'expression algébrique à simplifier.
     *
     * @returns {string} L'expression simplifiée (« 0 » si le résultat est nul).
     *
     * @throws {Error} Si l'expression est incomplète, mal parenthésée, contient
     *                 un produit de deux variables, ou des tokens non consommés.
     */
    static simplifyExpression(expr) {
        const tokens = expr.match(/\d+(\.\d+)?|[a-zA-Z_]+|[+\-*()]/g);
        if (!tokens) return expr;

        let pos = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];

        // Un token qui peut démarrer un nouveau facteur (donc multiplication implicite possible)
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
            // multiplication explicite OU implicite
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
            if (peek() === "+") {          // <-- AJOUT : + unaire, on l'ignore simplement
                next();
                return parseFactor();
            }
            if (peek() === "-") {
                next();
                const val = parseFactor();
                return multiply(val, { const: -1, vars: {} });
            }
            const tok = next();
            if (tok === undefined) {
                throw new Error(`Expression incomplète: "${expr}"`);
            }
            if (/^\d/.test(tok)) {
                return { const: parseFloat(tok), vars: {} };
            } else {
                return { const: 0, vars: { [tok]: 1 } };
            }
        }

        function combine(a, b, sign) {
            const result = { const: a.const + sign * b.const, vars: { ...a.vars } };
            for (const v in b.vars) {
                result.vars[v] = (result.vars[v] || 0) + sign * b.vars[v];
            }
            return result;
        }

        function multiply(a, b) {
            if (Object.keys(a.vars).length && Object.keys(b.vars).length) {
                throw new Error(`Produit de deux variables non supporté dans "${expr}"`);
            }
            const varsSource = Object.keys(a.vars).length ? a.vars : b.vars;
            const scalar = Object.keys(a.vars).length ? b.const : a.const;
            const result = { const: a.const * b.const, vars: {} };
            for (const v in varsSource) {
                result.vars[v] = varsSource[v] * scalar;
            }
            return result;
        }

        const parsed = parseExpr();

        // *** Vérification cruciale ***
        if (pos < tokens.length) {
            throw new Error(
                `Tokens non consommés dans "${expr}": [${tokens.slice(pos).join(", ")}] ` +
                `(reste à la position ${pos})`
            );
        }

        let out = "";
        if (parsed.const !== 0 || Object.keys(parsed.vars).length === 0) {
            out += parsed.const;
        }
        for (const v in parsed.vars) {
            const coeff = parsed.vars[v];
            if (coeff === 0) continue;
            let part;
            if (coeff === 1) part = v;
            else if (coeff === -1) part = `-${v}`;
            else part = `${coeff}${v}`;
            if (out && coeff > 0 && !part.startsWith("-")) out += "+";
            out += part;
        }
        return out || "0";
    }
}