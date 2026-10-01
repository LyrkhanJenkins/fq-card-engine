import Constants from "../../constants.js";
import RollService from "../../engine/roll/roll-service.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import FormulaDisplay, {
    ABILITY_EMOJIS, DAMAGE_TYPE_EMOJIS, EMOJI_TOOLTIP_KEYS, FORMULA_FIELDS, WEAPON_EMOJIS
} from "./formula-display.js";
import {WEAPON_TOKENS} from "../../engine/roll/weapon-damage.js";
import HitProfile from "../../engine/roll/hit-profile.js";
import {expandPills, makePill, PILL_SOURCE, sanitizePillInput, stripPills} from "./formula-pill.js";
import {escapeHtml} from "../../../core/utils/html.utils.js";
import {fqSpecLabelKey, sortCardSpecs} from "../../classes.js";

/**
 * La caractéristique d'un jet pour toucher telle que l'infobulle de la bulle la
 * nomme (« sur la Force ») : l'article change d'une caractéristique à l'autre,
 * d'où une clé par caractéristique.
 * @type {Object<string, string>}
 */
const HIT_ON_KEYS = Object.freeze({
    str: "FQCARDENGINE.HitOnStr", dex: "FQCARDENGINE.HitOnDex", con: "FQCARDENGINE.HitOnCon",
    int: "FQCARDENGINE.HitOnInt", wis: "FQCARDENGINE.HitOnWis", cha: "FQCARDENGINE.HitOnCha"
});

/**
 * L'arme d'une attaque dont la caractéristique n'est pas connue — aucun acteur,
 * ou aucune arme équipée du bon type.
 * @type {Object<string, string>}
 */
const HIT_WITH_WEAPON_KEYS = Object.freeze({
    "@wpnM": "FQCARDENGINE.HitWithMeleeWeapon", "@wpnR": "FQCARDENGINE.HitWithRangedWeapon"
});

/** Seuils (longueur max → taille de police en px), triés par longueur croissante. */
const DESCRIPTION_SIZE_STEPS = [[1, 40], [80, 36], [110, 34], [145, 30], [200, 26], [290, 22], [340, 20], [440, 18], [9999, 16]];
const TITLE_SIZE_STEPS = [[1, 34], [20, 32], [25, 28], [30, 24], [9999, 20]];
const BUBBLE_SIZE_STEPS = [[2, 36], [3, 30], [4, 25], [5, 21], [6, 18], [9999, 15]];
const REACH_SIZE_STEPS = [[6, 28], [8, 23], [10, 19], [12, 16], [9999, 13]];

/**
 * La gemme de spécialisations : la pierre posée dans le coin inférieur droit du
 * cadre de description (`card-svg.hbs`), partagée en autant de quartiers que la
 * carte porte de spés.
 *
 * Un disque cerclé de noir et bombé comme les bulles de coût : la carte ne parle
 * que cette langue-là. Elle est dessinée APRÈS le texte de la description, qui
 * est centré dans son cadre et ne l'atteint qu'en débordant.
 *
 * La géométrie vit ici et non dans le gabarit : Handlebars ne calcule pas, et
 * l'angle d'un quartier dépend du nombre de spés.
 * @type {Readonly<object>}
 */
const SPEC_GEM = Object.freeze({cx: 453, cy: 638, radius: 22});

/**
 * Retourne la taille associée au premier seuil de longueur atteint.
 *
 * @param {Array<[number, number]>} steps - Paires [longueur max, taille px] triées.
 * @param {number} length - La longueur du texte à dimensionner.
 *
 * @returns {number} La taille de police (px) à appliquer.
 */
function sizeForLength(steps, length) {
    return steps.find(([limit]) => length <= limit)?.[1] ?? steps[steps.length - 1][1];
}

/**
 * Arrondit une coordonnée SVG au centième : le bord d'un quartier de gemme tombe
 * rarement juste (360 / 3), et un flottant à quinze décimales dans le balisage
 * ne se relit pas.
 *
 * @param {number} value - La coordonnée à arrondir.
 *
 * @returns {number} La coordonnée arrondie au centième.
 */
function roundCoordinate(value) {
    return Math.round(value * 100) / 100;
}

/**
 * Le tracé d'un quartier de gemme : le `d` d'un `<path>`, en part de camembert
 * depuis le centre, dans le sens des aiguilles d'une montre à partir de midi.
 *
 * Une spé seule n'a pas de part : deux arcs en font un disque plein. Un arc `A`
 * ne sait pas dessiner un cercle entier — ses deux extrémités se confondraient
 * et le navigateur n'en tracerait rien.
 *
 * @param {number} index - Le rang du quartier (0 pour le premier).
 * @param {number} count - Le nombre de quartiers à découper.
 *
 * @returns {string} L'attribut `d` du quartier.
 */
function gemFacet(index, count) {
    const {cx, cy, radius} = SPEC_GEM;
    if (count <= 1) {
        return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0`
            + ` a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    }
    const angle = 360 / count;
    const point = degrees => {
        const radians = (degrees - 90) * Math.PI / 180;
        return `${roundCoordinate(cx + (radius * Math.cos(radians)))}`
            + ` ${roundCoordinate(cy + (radius * Math.sin(radians)))}`;
    };
    const sweep = angle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${point(index * angle)}`
        + ` A ${radius} ${radius} 0 ${sweep} 1 ${point((index + 1) * angle)} Z`;
}

/**
 * Utilitaires de présentation d'une carte : extraction du titre, de la
 * description et de l'image, dimensionnement du texte pour le rendu SVG,
 * transformation des tokens (@abilities, [types de dégâts]) en symboles lisibles,
 * et évaluation des valeurs affichées dans les bulles — dont le repli symbolique
 * passe par `FormulaDisplay`, seul arbre de repli du module.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DisplayCard {
    /**
     * Calcule la valeur à afficher dans une bulle de carte (action, mana, portée…).
     * Renvoie « 0 » si vide, « ∞ » au-delà de 99, la valeur évaluée du jet, ou
     * l'expression symbolique repliée si des variables subsistent (XXX→X, YYY→Y).
     *
     * @param {string} str - L'expression brute de la bulle (peut contenir des bonus/variables).
     *
     * @returns {string|number} La valeur ou le symbole à afficher.
     */
    static getNumberForBubbleCardSvg(str) {
        if (str === "" || !str) {
            return "0";
        }
        const match = str.match(/-?\d+/g);
        if (match?.length && match[0] > 99) return "∞";
        const result = RollService.replaceAbilitiesBonus(str);
        try {
            return RollService.rollResultSync(result);
        } catch {
            // Variables libres : le jet est impossible, la bulle montre l'expression.
            return DisplayCard.#foldBubbleExpression(result);
        }
    }

    /**
     * Replie pour l'affichage l'expression d'une bulle que le jet n'a pas pu
     * évaluer — celle dont une variable `XXX`/`YYY` reste libre.
     *
     * Le repli est celui de {@link FormulaDisplay}, seul arbre de repli du module :
     * la bulle ronde avait le sien, un analyseur réduit qui ne connaissait ni la
     * division ni les arrondis et les lisait comme des multiplications implicites
     * (`XXX/2` s'affichait « 2X », `XXXd6` « 6Xd », `floor(XXX/2)` levait). Deux
     * grammaires pour une même notation de carte, c'était la garantie qu'une
     * formule de bulle finisse par mentir.
     *
     * L'expression reçue a DÉJÀ traversé `replaceAbilitiesBonus` : ses jetons de
     * caractéristique et de bonus nommé sont donc des nombres, et le repli n'a
     * aucune pastille ni émoji à poser — la bulle reste ce qu'elle a toujours été,
     * un nombre ou une expression courte, sa couleur verte disant à elle seule
     * qu'un bonus de caractéristique s'y applique.
     *
     * Ne lève jamais : `foldFormula` lève sur une expression irrepliable (une
     * parenthèse non fermée saisie dans la fiche de carte), et une bulle ne doit
     * pas pouvoir annuler le rendu de la carte qui la porte. Le dernier recours
     * affiche l'expression telle quelle, variables rendues lisibles.
     *
     * @param {string} expr - L'expression de la bulle, caractéristiques déjà substituées.
     *
     * @returns {string} L'expression repliée, prête pour la bulle.
     */
    static #foldBubbleExpression(expr) {
        try {
            return FormulaDisplay.foldFormula(expr);
        } catch {
            return expr.replaceAll("XXX", "X").replaceAll("YYY", "Y");
        }
    }

    /**
     * Retourne la taille de police adaptée à la longueur de la description, pour
     * que le texte tienne dans la carte SVG. La mesure porte sur le texte
     * VISIBLE (`stripPills`), pas sur le markup de pastille : sinon ajouter
     * une pastille ferait artificiellement basculer toute description vers la
     * plus petite police (critère de sortie 5, Phase 20).
     *
     * @param {string} description - Le texte de description de la carte (peut contenir des marqueurs de pastille).
     *
     * @returns {number} La taille de police (px) à appliquer.
     */
    static getDescriptionSizeForCardSvg(description) {
        // Protège contre une valeur non-chaîne, comme aujourd'hui.
        const visible = typeof description === "string" ? stripPills(description) : (description ?? "").toString();
        return sizeForLength(DESCRIPTION_SIZE_STEPS, visible.length);
    }

    /**
     * Passe de correction APRÈS rendu : réduit la taille de police d'une
     * description tant que son texte déborde réellement de sa boîte.
     * `getDescriptionSizeForCardSvg` (table empirique sur la longueur) reste le
     * point de départ, mais la longueur ne capture ni les métriques de la
     * police effectivement rendue (fallback si Lucida Calligraphy est absente),
     * ni les emojis/pastilles, ni les retours à la ligne : sur certains écrans
     * le texte peut donc dépasser d'une ligne. Ici on mesure le rendu réel
     * (hauteur/largeur du span vs sa boîte, en pixels de layout — le
     * `foreignObject` est mis en page à taille fixe puis mis à l'échelle avec
     * le SVG, la mesure est donc indépendante de la taille d'affichage).
     * Ne fait jamais grossir : seule la table décide de la taille maximale.
     * Boîte non affichée (jsdom, `display:none`) : aucune mesure possible, no-op.
     *
     * @param {ParentNode|Element} root - L'élément contenant une ou plusieurs `.fq-card-description-box` (peut être la boîte elle-même).
     * @param {{minSize?: number}} [options] - `minSize` : plancher de taille de police (px).
     *
     * @returns {void}
     */
    static fitDescriptionSize(root, {minSize = 10} = {}) {
        if (!root?.querySelectorAll) {
            return;
        }
        const boxes = root.matches?.(".fq-card-description-box")
            ? [root]
            : [...root.querySelectorAll(".fq-card-description-box")];
        for (const box of boxes) {
            const span = box.querySelector(".fq-card-description");
            if (!span || !box.clientHeight) {
                continue;
            }
            let size = parseFloat(box.style.fontSize);
            if (!Number.isFinite(size)) {
                continue;
            }
            while (size > minSize
                && (span.offsetHeight > box.clientHeight || span.offsetWidth > box.clientWidth)) {
                size -= 1;
                box.style.fontSize = `${size}px`;
            }
        }
        // La police de la carte peut finir de charger après ce premier passage,
        // ce qui change les métriques : re-mesure une fois les fontes prêtes.
        if (document.fonts?.status === "loading") {
            document.fonts.ready.then(() => DisplayCard.fitDescriptionSize(root, {minSize}));
        }
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
        return sizeForLength(TITLE_SIZE_STEPS, title.length);
    }

    /**
     * Retourne la taille de police adaptée à la longueur de la valeur affichée
     * dans une bulle ronde (action, mana, zèle, rejouable), pour que le texte
     * tienne dans le cercle même quand la valeur est une expression (ex. « 2X+2Y »).
     *
     * @param {string|number} value - La valeur affichée dans la bulle.
     *
     * @returns {number} La taille de police (px) à appliquer.
     */
    static getBubbleSizeForCardSvg(value) {
        return sizeForLength(BUBBLE_SIZE_STEPS, (value ?? "").toString().length);
    }

    /**
     * Retourne la taille de police adaptée à la longueur du texte de portée
     * (« minReach | maxReach »), pour que les deux valeurs tiennent dans la bulle
     * de portée même quand ce sont des expressions.
     *
     * @param {string|number} minReach - La portée minimale affichée.
     * @param {string|number} maxReach - La portée maximale affichée.
     *
     * @returns {number} La taille de police (px) à appliquer.
     */
    static getReachSizeForCardSvg(minReach, maxReach) {
        return sizeForLength(REACH_SIZE_STEPS, `${minReach ?? ""} | ${maxReach ?? ""}`.length);
    }

    /**
     * Extrait et met en forme la description d'une carte à partir de sa face
     * visible, en interpolant les valeurs des choix (`system.fq.choices`) et en
     * transformant les tokens en symboles lisibles.
     *
     * @param {Card} c - La carte dont on extrait la description.
     * @param {number|null} [faceIndex] - Index de face à présenter (par défaut la face courante `c.face`). Permet de forcer la face avant lors d'une révélation.
     * @param {{xValue: *, yValue: *}} [options] - Valeurs `X`/`Y` de la dialog de jeu, transmises à `FormulaDisplay.forDisplay` (symboliques si absentes).
     *
     * @returns {string} La description formatée, prête à l'affichage (peut contenir des marqueurs de pastille).
     */
    static getDescriptionFromCard(c, faceIndex = c.face, options = {}) {
        let description = "";
        if (faceIndex != null) {
            if (!c.faces) {
                description = undefined;
            } else {
                description = c.faces[faceIndex].text;
            }
        }
        // Un seul acteur pour toute la description : les formules repliées et
        // les jetons écrits dans la prose doivent parler du même personnage.
        const actor = options.actor ?? Constants.actorCurrent;
        const flat = Object.fromEntries(
            c.system?.fq?.choices?.flatMap((choice, i) =>
                Object.entries(choice).map(([k, v]) =>
                    [`${i}_${k}`, FORMULA_FIELDS.includes(k)
                        ? FormulaDisplay.forDisplay(v, {...options, actor})
                        : v])
            ) ?? []
        );
        const sanitizedDescription = sanitizePillInput(description);
        return DisplayCard.transformForDescription(game.i18n.format(sanitizedDescription, flat), actor);
    }

    /**
     * Retourne le nom localisé de la carte, ou le libellé du dos si la carte est
     * face cachée.
     *
     * @param {Card} c - La carte dont on extrait le nom.
     * @param {number|null} [faceIndex] - Index de face à présenter (par défaut la face courante `c.face`). Permet de forcer la face avant lors d'une révélation.
     *
     * @returns {string} Le nom localisé de la carte (ou du dos).
     */
    static getNameFromCard(c, faceIndex = c.face) {
        let name = (faceIndex !== null) ? c.name : "FQCARDENGINE.CardBack";
        return game.i18n.localize(name);
    }

    /**
     * Retourne l'image à afficher pour la carte : l'image de la face visible, ou
     * l'image du dos si la carte est face cachée.
     *
     * @param {Card} c - La carte dont on extrait l'image.
     * @param {number|null} [faceIndex] - Index de face à présenter (par défaut la face courante `c.face`). Permet de forcer la face avant lors d'une révélation.
     *
     * @returns {string|undefined} Le chemin de l'image, ou undefined si indisponible.
     */
    static getImgFromCard(c, faceIndex = c.face) {
        let img = c.back.img;
        if (faceIndex != null) {
            if (!c.faces) {
                img = undefined;
            } else {
                img = c.faces[faceIndex].img;
            }
        }
        return img;
    }

    /**
     * Transforme une chaîne de description en remplaçant les variables (XXX/YYY),
     * les références de caractéristiques (@int, @str…) par leur modificateur et
     * un emoji, et les types de dégâts ([fire], [cold]…) par leur symbole. La
     * table de caractéristiques (`ABILITY_EMOJIS`, `formula-display.js`) est
     * la source unique de vérité, consommée aussi par le groupe d'indicateurs
     * de `FormulaDisplay.collectSources` (D-06).
     *
     * @param {string} val - La chaîne à transformer (renvoyée telle quelle si non-string).
     *
     * @returns {string} La chaîne transformée, prête à l'affichage.
     */
    static transformForDescription(val, actor = Constants.actorCurrent) {
        if (typeof val === "string") {
            let result = val.replaceAll("XXX", "X").replaceAll("YYY", "Y");
            for (const token of Object.keys(WEAPON_TOKENS)) {
                if (result.includes(token)) {
                    const {emoji, tooltip} = FormulaDisplay.weaponSourceDetail(token, actor);
                    result = result.replaceAll(token, makePill(PILL_SOURCE, emoji, tooltip));
                }
            }
            for (const ability of Object.keys(ABILITY_EMOJIS)) {
                const token = `@${ability}`;
                if (!result.includes(token)) {
                    continue;
                }
                const {emoji, mod, tooltip} = FormulaDisplay.abilitySourceDetail(ability, actor);
                const replacement = mod === null
                    ? makePill(PILL_SOURCE, emoji, tooltip)
                    : `${mod} ${makePill(PILL_SOURCE, emoji, tooltip)}`;
                result = result.replaceAll(token, replacement);
            }
            for (const [type, emoji] of Object.entries(DAMAGE_TYPE_EMOJIS)) {
                result = result.replaceAll(`[${type}]`, `[${emoji}]`);
            }
            return result;
        }
        return val;
    }

    /**
     * Enveloppe chaque emoji connu (caractéristiques, armes, types de dégâts)
     * d'un `<span data-tooltip="…">` pour le tooltip natif Foundry, localisé
     * automatiquement par le TooltipManager, ET développe les marqueurs de
     * pastille produits par `FormulaDisplay.forDisplay` en `<span
     * class="fq-formula-pill …">`. Le texte est d'abord échappé HTML EN
     * ENTIER (la description devient du markup via le helper `fqEmojiTooltips`
     * de `card-svg.hbs`) — ORDRE NON NÉGOCIABLE : échapper d'abord, produire
     * le markup ensuite. C'est cet ordre qui garantit qu'un nom d'arme ou une
     * donnée de carte contenue dans le tooltip d'un marqueur ressort échappée
     * (jamais de balise injectable) : `expandPills` lit le tooltip DÉJÀ
     * échappé et le place tel quel dans l'attribut `data-tooltip`.
     *
     * @param {*} text - La description transformée (renvoyée telle quelle si non-string).
     *
     * @returns {*} Le HTML avec les emojis et pastilles porteurs de tooltip, ou `text` inchangé.
     */
    static wrapEmojiTooltips(text) {
        if (typeof text !== "string") {
            return text;
        }
        const escaped = escapeHtml(text);
        return expandPills(escaped, Object.keys(EMOJI_TOOLTIP_KEYS), chunk => {
            let result = chunk;
            for (const [emoji, key] of Object.entries(EMOJI_TOOLTIP_KEYS)) {
                result = result.replaceAll(emoji, `<span data-tooltip="${key}">${emoji}</span>`);
            }
            return result;
        });
    }

    /**
     * Indique si un bonus « string » (dégâts / soin) est renseigné, c.-à-d. non
     * vide et différent de « 0 » — utilisé pour n'afficher la pastille que si le
     * bonus est supérieur à 0.
     *
     * @param {string|null|undefined} str - La valeur brute du bonus.
     *
     * @returns {boolean} Vrai si le bonus doit être affiché.
     */
    static hasBonusStr(str) {
        const s = (str ?? "").toString().trim();
        return s !== "" && s !== "0";
    }

    /**
     * Clé de localisation du tooltip expliquant la bulle de rejouabilité, choisie
     * selon ce que la bulle affiche : « P » passif, « A » automatique, « E » éphémère,
     * « ∞ » rejouable sans limite, ou un nombre de charges restantes.
     *
     * @param {string|number|null} replayable - La valeur affichée dans la bulle.
     *
     * @returns {string|null} La clé du tooltip, ou null si la carte n'a pas de bulle.
     */
    static getReplayableTooltipKey(replayable) {
        if (replayable === null || replayable === undefined || replayable === "") {
            return null;
        }
        if (replayable === "P") {
            return "FQCARDENGINE.TooltipReplayablePassive";
        }
        if (replayable === "E") {
            return "FQCARDENGINE.TooltipReplayableEphemeral";
        }
        if (replayable === "A") {
            return "FQCARDENGINE.TooltipReplayableAuto";
        }
        if (replayable === "∞") {
            return "FQCARDENGINE.TooltipReplayableInfinite";
        }
        return "FQCARDENGINE.TooltipReplayableCharges";
    }

    /**
     * Ce qu'affiche la bulle de TOUCHER — la septième, après réactif et
     * rejouabilité : ce que la carte oppose à sa cible, pour l'acteur qui la tient.
     *
     * Sa FORME dit le type : un écu pour un jet d'attaque, un d20 pour une
     * sauvegarde, une étoile d'impact pour des dégâts SANS jet pour toucher — ni
     * armure ni sauvegarde ne les réduisent. Dans l'écu : l'icône de la
     * caractéristique par laquelle passe l'attaque — celle de l'arme équipée pour
     * une carte d'arme, qui change donc avec l'arme — et le bonus d'attaque. Dans
     * le d20 : l'icône de la caractéristique que la CIBLE jette, et le DD. Sans
     * acteur, ou sans arme équipée du bon type, l'écu d'une carte d'arme montre
     * l'icône de l'arme et aucun chiffre : rien ne permet de les connaître.
     *
     * Une sauvegarde sans caractéristique n'a pas de bulle : sa configuration est
     * incomplète, et le moteur ne la jettera pas.
     *
     * @param {object}  [choice] - Le choix (contenu) de la carte.
     * @param {?object} [actor]  - L'acteur qui tient la carte.
     *
     * @returns {?{kind: string, icon: string, number: ?string, tooltip: string}} Le type
     *          de bulle (« attack », « save », « raw »), l'icône (le « ! » des dégâts
     *          bruts), le chiffre éventuel et le tooltip (texte, ou clé pour les
     *          dégâts bruts) ; null si la carte n'a pas cette bulle.
     */
    static getHitBubble(choice, actor = null) {
        if (choice?.hitType === CardFqSystem.HIT_TYPE_ATTACK) {
            const profile = HitProfile.preview(actor, choice);
            const ability = profile?.attackAbility
                ?? (choice.hitSource === CardFqSystem.HIT_SOURCE_ABILITY ? choice.hitAbility : null);
            const icon = ABILITY_EMOJIS[ability] ?? WEAPON_EMOJIS[choice.hitSource];
            if (!icon) {
                return null;
            }
            const number = profile && ABILITY_EMOJIS[ability] ? DisplayCard.#signed(profile.modifier) : null;
            const how = ABILITY_EMOJIS[ability]
                ? DisplayCard.#hitOn(ability, [number, profile?.weapon])
                : game.i18n.localize(HIT_WITH_WEAPON_KEYS[choice.hitSource]);
            return {kind: "attack", icon, number, tooltip: game.i18n.format("FQCARDENGINE.TooltipHitAttack", {how})};
        }
        if (choice?.hitType === CardFqSystem.HIT_TYPE_SAVE) {
            const icon = ABILITY_EMOJIS[choice.saveAbility];
            if (!icon) {
                return null;
            }
            const dc = HitProfile.preview(actor, choice)?.dc ?? null;
            const how = DisplayCard.#hitOn(choice.saveAbility,
                [dc === null ? null : game.i18n.format("FQCARDENGINE.HitDc", {dc})]);
            return {
                kind: "save", icon, number: dc === null ? null : String(dc),
                tooltip: game.i18n.format("FQCARDENGINE.TooltipHitSave", {how})
            };
        }
        return String(choice?.damage ?? "").trim()
            ? {
                kind: "raw", icon: game.i18n.localize("FQCARDENGINE.HitBubbleRaw"), number: null,
                tooltip: "FQCARDENGINE.TooltipHitRaw"
            }
            : null;
    }

    /**
     * La caractéristique d'un jet pour toucher, suivie de ses précisions entre
     * parenthèses : « sur la Force (+5, Épée longue) », « sur la Dextérité (DD 13) ».
     *
     * @param {string}           ability - La caractéristique.
     * @param {Array<?string>}   details - Les précisions ; les absentes sont omises.
     *
     * @returns {string} Le texte localisé.
     */
    static #hitOn(ability, details) {
        const on = game.i18n.localize(HIT_ON_KEYS[ability]);
        const shown = details.filter(detail => detail !== null && detail !== undefined && detail !== "");
        return shown.length ? `${on} (${shown.join(", ")})` : on;
    }

    /**
     * @param {number} value - Un modificateur.
     *
     * @returns {string} Le modificateur signé : « +5 », « -1 », « +0 ».
     */
    static #signed(value) {
        return value < 0 ? String(value) : `+${value}`;
    }

    /**
     * Construit les données de bulle communes à toutes les vues d'une carte (main,
     * dialogue « Jouer la carte », voile plein écran) : coûts, portées, réactivité,
     * rejouabilité (« P » passif, « A » automatique, « E » éphémère, ou le nombre de charges),
     * limite d'exemplaires, classe, et les indicateurs de modificateur
     * (`*Mod`) signalant qu'un coût/portée dépend d'une caractéristique (@str, @int…),
     * et la gemme de spécialisations (`buildSpecGem`).
     * Le voile plein écran ignore simplement les `*Mod` qu'il n'affiche pas.
     *
     * @param {object}  [choice={}] - Le choix (contenu) de la carte.
     * @param {Card}    [card=null] - La carte (pour `maxSameCard`/`class`/`specs`).
     * @param {?object} [actor]     - L'acteur qui tient la carte, pour la bulle de toucher ;
     *        le personnage de l'utilisateur par défaut, comme les descriptions.
     *
     * @returns {object} Les données de bulle communes.
     */
    static buildBubbleData(choice = {}, card = null, actor = Constants.actorCurrent) {
        const action = DisplayCard.getNumberForBubbleCardSvg(choice.action);
        const mana = DisplayCard.getNumberForBubbleCardSvg(choice.mana);
        const zeal = DisplayCard.getNumberForBubbleCardSvg(choice.zeal);
        const minReach = DisplayCard.getNumberForBubbleCardSvg(choice.minReach);
        const maxReach = DisplayCard.getNumberForBubbleCardSvg(choice.maxReach);
        const replayable = choice?.replayable === CardFqSystem.REPLAYABLE_PASSIVE ? "P"
            : CardFqSystem.isAutoChoice(choice) ? "A"
                : CardFqSystem.isEphemeralChoice(choice) ? "E"
                    : !choice?.replayable ? null : DisplayCard.getNumberForBubbleCardSvg(choice?.replayable);
        const actionMod = RollService.hasAbilitiesBonus(choice.action);
        const manaMod = RollService.hasAbilitiesBonus(choice.mana);
        const zealMod = RollService.hasAbilitiesBonus(choice.zeal);
        const reachMod = RollService.hasAbilitiesBonus(choice.minReach) || RollService.hasAbilitiesBonus(choice.maxReach);
        const replayableMod = RollService.hasAbilitiesBonus(choice.replayable);
        const hit = DisplayCard.getHitBubble(choice, actor);
        return {
            action,
            mana,
            zeal,
            minReach,
            maxReach,
            reactive: choice.reactive,
            replayable,
            maxSameCard: card?.system?.fq?.maxSameCard,
            fqClass: card?.system?.fq?.class,
            ...DisplayCard.buildSpecGem(card),
            actionMod,
            manaMod,
            zealMod,
            reachMod,
            replayableMod,
            // Couleur du texte des bulles : vert quand un bonus de caractéristique
            // s'applique, noir sinon (cf. `card-svg.hbs`).
            reachFill: reachMod ? "green" : "black",
            actionFill: actionMod ? "green" : "black",
            manaFill: manaMod ? "green" : "black",
            zealFill: zealMod ? "green" : "black",
            replayableFill: replayableMod ? "green" : "black",
            replayableTooltip: DisplayCard.getReplayableTooltipKey(replayable),
            // La bulle de toucher (cf. `card-svg.hbs`) : son icône, son chiffre (bonus
            // d'attaque ou DD), son tooltip, et sa forme — écu, d20 ou étoile d'impact.
            hit: hit?.icon ?? null,
            hitNumber: hit?.number ?? null,
            hitTooltip: hit?.tooltip ?? null,
            hitShield: hit?.kind === "attack",
            hitDie: hit?.kind === "save",
            hitBurst: hit?.kind === "raw",
            actionSize: DisplayCard.getBubbleSizeForCardSvg(action),
            manaSize: DisplayCard.getBubbleSizeForCardSvg(mana),
            zealSize: DisplayCard.getBubbleSizeForCardSvg(zeal),
            replayableSize: DisplayCard.getBubbleSizeForCardSvg(replayable),
            reachSize: DisplayCard.getReachSizeForCardSvg(minReach, maxReach),
        };
    }

    /**
     * Construit la gemme de spécialisations d'une carte : un quartier par spé,
     * dans le sens des aiguilles d'une montre à partir de midi, et dans l'ordre de
     * déclaration des spés de sa classe (`sortCardSpecs`). Une seule spé : la
     * pierre est d'un bloc ; quatre : quatre quarts.
     *
     * Aucune COULEUR ici : chaque quartier porte son identifiant de spé en
     * `data-fq-spec`, et c'est la feuille de style
     * (`styles/card-engine/specializations.css`) qui le peint — le même sélecteur
     * habille la gemme de la carte SVG et celle des vignettes de la liste d'un
     * deck, qui ne sont pas du même langage.
     *
     * @param {?Card} [card=null] - La carte, pour ses `system.fq.specs`.
     *
     * @returns {{specs: {id: string, label: string, facet: string}[], gem: object}}
     *   Les quartiers — vide si la carte ne porte aucune spé déclarée — et la pierre
     *   elle-même, que le gabarit cercle et fait briller.
     */
    static buildSpecGem(card = null) {
        const specs = DisplayCard.cardSpecs(card);
        return {
            gem: SPEC_GEM,
            specs: specs.map((spec, index) => ({
                ...spec,
                facet: gemFacet(index, specs.length)
            }))
        };
    }

    /**
     * Les spécialisations d'une carte, prêtes à peindre : identifiant (pour le
     * sélecteur de style) et clé de libellé (pour l'infobulle), dans l'ordre de
     * déclaration de la classe — et seulement celles de SA classe, c'est elle
     * qui fait foi (`sortCardSpecs`).
     *
     * Sans géométrie, contrairement à `buildSpecGem` : la liste des cartes d'un deck
     * peint ses gemmes en HTML, où c'est la feuille de style qui en découpe les
     * quartiers. C'est aussi ce que rend le helper Handlebars `fqCardSpecs`
     * (`setup.hook.js`) — `system.fq.specs` est un `Set`, sur lequel `{{#each}}`
     * ne sait pas boucler.
     *
     * @param {?Card} [card=null] - La carte, pour ses `system.fq.specs`.
     *
     * @returns {{id: string, label: string}[]} Les spés déclarées de la carte, ordonnées.
     */
    static cardSpecs(card = null) {
        return sortCardSpecs(card?.system?.fq?.specs, card?.system?.fq?.class)
            .map(specId => ({id: specId, label: fqSpecLabelKey(specId)}));
    }

    /**
     * Construit le socle commun des données de rendu d'une carte pour le
     * template `card.hbs` : image, nom, description (et sa taille), bulles de
     * la carte, marque « innée » et uuid. Partagé par `HandBoard`,
     * `SpellbookWindow` et `CardSelection`, qui y ajoutent chacun leurs champs
     * propres (états de main, `cardsid`, `back`…) — les trois vues restent
     * volontairement indépendantes les unes des autres (aucun import croisé
     * entre fichiers de `interface/window/`), seul ce socle est partagé via
     * `display-card.js`, déjà une dépendance commune aux trois.
     *
     * @param {Card}   card      - La carte à rendre.
     * @param {number} faceIndex - L'indice de face déjà résolu par l'appelant.
     *
     * @returns {object} Le socle des données consommables par `card.hbs`.
     */
    static buildBaseCardRenderData(card, faceIndex) {
        const img = DisplayCard.getImgFromCard(card, faceIndex);
        const name = DisplayCard.getNameFromCard(card, faceIndex);
        const cardContent = card.system.fq?.choices?.length ? card.system.fq.choices[0] : {};
        const description = DisplayCard.getDescriptionFromCard(card, faceIndex);
        return {
            id: card._id ?? card.id,
            description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            ...DisplayCard.buildBubbleData(cardContent, card),
            isFQInnate: card.system?.fq?.isInnate,
            uuid: card.uuid,
            img,
            name,
        };
    }

    /**
     * Monte un voile noir plein écran affichant une carte en grand : le rendu SVG
     * complet (`card-svg.hbs`) pour une carte visible, ou simplement l'image de dos
     * pour une carte face cachée. Aucun impact moteur ; clic n'importe où = fermeture.
     * Réutilisé par la feuille de deck et par le clic sur une carte de message de chat.
     *
     * @param {Card} card - La carte à afficher en grand.
     *
     * @returns {Promise<void>}
     */
    static async showCardOverlay(card) {
        const overlay = document.createElement("div");
        overlay.className = "fq-card-view-overlay";
        const wrap = document.createElement("div");
        wrap.className = "fq-card-view-card";
        overlay.appendChild(wrap);

        const back = (card.face == null);
        const firstChoice = card.system.fq?.choices?.length ? card.system.fq.choices[0] : null;

        if (back || !firstChoice) {
            // Face cachée (ou carte sans contenu jouable) : juste l'image.
            wrap.classList.add("fq-card-view-card--back");
            const face = document.createElement("div");
            face.className = "fq-card-face";
            face.style.backgroundImage = `url('${DisplayCard.getImgFromCard(card)}')`;
            wrap.appendChild(face);
        } else {
            const name = DisplayCard.getNameFromCard(card);
            const description = DisplayCard.getDescriptionFromCard(card);
            const renderData = {
                img: DisplayCard.getImgFromCard(card),
                name: name,
                description: description,
                descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
                titleSize: DisplayCard.getTitleSizeForCardSvg(name),
                ...DisplayCard.buildBubbleData(firstChoice, card),
            };
            wrap.innerHTML = await foundry.applications.handlebars.renderTemplate(
                "modules/fq-card-engine/src/templates/partials/card-svg.hbs", renderData);
        }

        overlay.addEventListener("click", () => overlay.remove());
        document.body.appendChild(overlay);
        DisplayCard.fitDescriptionSize(wrap);
    }
}