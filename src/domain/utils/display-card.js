import FqConstants from "./fq-constants.js";
import FQUtils from "./fq-utils.js";

export default class DisplayCard {
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

    static getDescriptionSizeForCardSvg(description) {
        let descriptionSize = {1: 40, 80: 36, 110: 34, 145: 30, 200: 26, 290: 22, 340: 20, 440: 18, 9999: 16};
        return descriptionSize[Object.keys(descriptionSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => description.length <= limit)];
    }

    static getTitleSizeForCardSvg(title) {
        let titleSize = {1: 34, 20: 32, 25: 28, 30: 24, 9999: 20};

        return titleSize[Object.keys(titleSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => title.length <= limit)];
    }

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

    static getNameFromCard(c) {
        let name = (c.face !== null) ? c.name : "FQCARDENGINE.CardBack";
        return game.i18n.localize(name);
    }

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