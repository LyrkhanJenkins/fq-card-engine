import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import WeaponDamage from "./weapon-damage.js";
import RollService from "./roll-service.js";
import {WEAPON_TOKENS} from "../../weapon-tokens.js";

/**
 * Le profil de TOUCHER d'un choix de carte : ce qu'il faut battre, et avec quoi.
 *
 * Un seul modificateur — noté M — sert aux deux façons de toucher :
 *
 * - ATTAQUE    : `d20 + M` contre la classe d'armure de la cible ;
 * - SAUVEGARDE : DD = `8 + M`, que la cible oppose avec sa propre sauvegarde.
 *
 * Ce n'est pas une simplification maison : le DD d'un sort en D&D vaut
 * `8 + maîtrise + caractéristique d'incantation`, soit exactement `8 + son
 * modificateur d'attaque`, et le DD de maîtrise d'arme 2024 vaut de même
 * `8 + le modificateur d'attaque de l'arme`. Une seule formule couvre les deux,
 * et le seul champ `hitSource` décide de la source du modificateur.
 *
 * Le module ne lance PAS le d20 et ne touche à aucun dégât : il ne fait que le
 * calcul, pour que la résolution (et ses tests) n'aient plus qu'à comparer.
 *
 * L'acteur est TOUJOURS un paramètre : jamais `Constants.actorCurrent` ni
 * `Constants.actorAbi`. Lire le personnage de l'utilisateur courant donnerait à
 * un PNJ joué par le MJ les caractéristiques du personnage du MJ — la panne déjà
 * documentée côté portée dans `hook/integration/dnd5e.hook.js`.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class HitProfile {

    /** La part fixe du DD d'une sauvegarde, avant le modificateur. */
    static DC_BASE = 8;

    /**
     * Ce qu'une sauvegarde RÉUSSIE vaut sur l'échelle des dégâts, d'après ce que
     * l'activité dnd5e annonce subir en cas de réussite (`damage.onSave`) :
     * demi-dégâts descend d'un cran, aucun dégât en descend deux, dégâts pleins
     * n'en descend aucun.
     *
     * Les cartes n'ont pas ce réglage et valent toujours un cran — la règle FQ.
     *
     * @type {Object<string, number>}
     */
    static DEFENSES_ON_SAVE = Object.freeze({half: 1, none: 2, full: 0});

    /**
     * Construit le profil de toucher du LANCEUR pour un choix de carte.
     *
     * À n'appeler QU'UNE FOIS par jeu de carte : si le bonus de carte porte
     * encore un dé, il est tiré ici, et le profil transporte ensuite sa valeur —
     * un appel par cible ferait varier le modificateur d'une cible à l'autre.
     *
     * @param {object} actor    - L'acteur qui joue la carte.
     * @param {object} [choice] - Le choix (contenu) de la carte.
     *
     * @returns {?{type: string, source: string, ability: ?string, attackAbility: ?string,
     *             modifier: number, dc: ?number, saveAbility: ?string}} Le profil, ou
     *          null si le choix ne demande aucun jet pour toucher (le cas de toutes
     *          les cartes antérieures) ou si sa configuration est incohérente.
     *          `attackAbility` est la caractéristique par laquelle passe une
     *          ATTAQUE — celle que l'armure non maîtrisée pénalise.
     */
    static of(actor, choice) {
        if (!actor || !CardFqSystem.hasHitRoll(choice)) {
            return null;
        }
        const type = choice.hitType;
        const source = choice.hitSource ?? CardFqSystem.HIT_SOURCE_NONE;
        const ability = choice.hitAbility || null;
        const saveAbility = choice.saveAbility || null;

        if (source === CardFqSystem.HIT_SOURCE_NONE) {
            return HitProfile.#incomplete(choice, "aucune source de modificateur");
        }
        if (source === CardFqSystem.HIT_SOURCE_ABILITY && !ability) {
            return HitProfile.#incomplete(choice, "source « caractéristique » sans caractéristique");
        }
        if (type === CardFqSystem.HIT_TYPE_SAVE && !saveAbility) {
            return HitProfile.#incomplete(choice, "sauvegarde sans caractéristique de sauvegarde");
        }

        const base = HitProfile.#baseAttack(actor, source, ability);
        const modifier = base.modifier + HitProfile.#numberOf(choice.hitBonus);
        const dc = type === CardFqSystem.HIT_TYPE_SAVE
            ? (choice.saveDc ? HitProfile.#numberOf(choice.saveDc) : HitProfile.DC_BASE + modifier)
            : null;

        return {
            type,
            source,
            ability: source === CardFqSystem.HIT_SOURCE_ABILITY ? ability : null,
            attackAbility: type === CardFqSystem.HIT_TYPE_ATTACK ? base.ability : null,
            modifier,
            dc,
            saveAbility: type === CardFqSystem.HIT_TYPE_SAVE ? saveAbility : null,
            defensesOnSuccess: 1
        };
    }

    /**
     * Le profil de toucher à AFFICHER sur la face d'une carte, pour l'acteur qui
     * la tient : la caractéristique par laquelle passe l'attaque — celle de
     * l'arme équipée pour une carte d'arme —, le modificateur d'attaque et le DD.
     *
     * Même calcul que {@link HitProfile.of}, sans rien jeter ni rien journaliser :
     * la carte se redessine à chaque rendu de la main. Un bonus de carte qui
     * porte un dé ne compte donc pas ici — il n'est connu qu'au jeu —, et une
     * référence de caractéristique (`@dex`) s'y lit sur l'acteur passé.
     *
     * @param {?object} actor    - L'acteur qui tient la carte.
     * @param {object}  [choice] - Le choix (contenu) de la carte.
     *
     * @returns {?{type: string, attackAbility: ?string, weapon: ?string, modifier: number,
     *             dc: ?number, saveAbility: ?string}} Le profil affiché, ou null sans
     *          acteur, sans jet pour toucher, ou pour une configuration incomplète.
     */
    static preview(actor, choice) {
        if (!actor || !CardFqSystem.hasHitRoll(choice)) {
            return null;
        }
        const type = choice.hitType;
        const source = choice.hitSource ?? CardFqSystem.HIT_SOURCE_NONE;
        const ability = choice.hitAbility || null;
        const saveAbility = choice.saveAbility || null;
        const save = type === CardFqSystem.HIT_TYPE_SAVE;
        if (source === CardFqSystem.HIT_SOURCE_NONE
            || (source === CardFqSystem.HIT_SOURCE_ABILITY && !ability)
            || (save && !saveAbility)) {
            return null;
        }
        const base = HitProfile.#baseAttack(actor, source, ability);
        const modifier = base.modifier + HitProfile.#fixedNumberOf(choice.hitBonus, actor);
        return {
            type,
            attackAbility: save ? null : base.ability,
            weapon: base.weapon ?? null,
            modifier,
            dc: save
                ? (choice.saveDc ? HitProfile.#fixedNumberOf(choice.saveDc, actor) : HitProfile.DC_BASE + modifier)
                : null,
            saveAbility: save ? saveAbility : null
        };
    }

    /**
     * Construit le profil de toucher d'une ACTIVITÉ dnd5e, pour que la résolution
     * d'une activité passe par la même échelle de dégâts qu'une carte.
     *
     * Une activité d'ATTAQUE fournit son modificateur complet ; une activité de
     * SAUVEGARDE fournit son DD déjà calculé (`save.dc.value`), la caractéristique
     * que la cible jette, et ce que sa réussite vaut (`damage.onSave`).
     *
     * Les types d'activité dnd5e (« attack », « save ») portent les mêmes chaînes
     * que les types de toucher des cartes : c'est une coïncidence heureuse, pas un
     * contrat — la correspondance est donc écrite ici plutôt que supposée.
     *
     * @param {object} [activity] - L'activité dnd5e en cours.
     *
     * @returns {?object} Le profil, ou null si l'activité ne demande aucun jet pour
     *          toucher (dégâts nus, soin) ou si sa configuration est inexploitable.
     */
    static ofActivity(activity) {
        if (activity?.type === "attack") {
            return {
                type: CardFqSystem.HIT_TYPE_ATTACK, source: null, ability: null,
                attackAbility: HitProfile.#abilityOf(activity),
                modifier: HitProfile.#attackModifierOf(activity),
                dc: null, saveAbility: null, defensesOnSuccess: 1
            };
        }
        if (activity?.type !== "save") {
            return null;
        }
        // `save.ability` est un ENSEMBLE : dnd5e autorise plusieurs sauvegardes au
        // choix. Le moteur en retient la première, faute de joueur à interroger.
        const saveAbility = [...(activity.save?.ability ?? [])][0] ?? null;
        const dc = Number(activity.save?.dc?.value);
        if (!saveAbility || !Number.isFinite(dc)) {
            return HitProfile.#incomplete(activity, "activité de sauvegarde sans DD ni caractéristique");
        }
        return {
            type: CardFqSystem.HIT_TYPE_SAVE, source: null, ability: null, attackAbility: null,
            modifier: 0, dc, saveAbility,
            defensesOnSuccess: HitProfile.DEFENSES_ON_SAVE[activity.damage?.onSave] ?? 1
        };
    }

    /**
     * La valeur qu'une cible oppose à ce profil : sa classe d'armure face à une
     * attaque, son modificateur de sauvegarde face à une sauvegarde.
     *
     * Les deux valeurs portent DÉJÀ la couverture : dnd5e injecte le bonus des
     * statuts de couverture dans `ac.value` comme dans le bonus de sauvegarde de
     * Dextérité. Rien à ajouter ici, et surtout rien à recalculer.
     *
     * @param {object} token     - Le jeton ciblé.
     * @param {object} [profile] - Le profil rendu par {@link HitProfile.of}.
     *
     * @returns {?{value: number, kind: string}} La valeur à battre et sa nature
     *          (« ac » ou « save »), ou null si la cible ne l'expose pas.
     */
    static defenseOf(token, profile) {
        const system = token?.actor?.system;
        if (!system || !profile) {
            return null;
        }
        const raw = profile.type === CardFqSystem.HIT_TYPE_ATTACK
            ? system.attributes?.ac?.value
            : system.abilities?.[profile.saveAbility]?.save?.value;
        const value = Number(raw);
        if (!Number.isFinite(value)) {
            return null;
        }
        return {
            value,
            kind: profile.type === CardFqSystem.HIT_TYPE_ATTACK ? "ac" : "save"
        };
    }

    /**
     * Si le choix tire son modificateur d'un type d'arme qu'aucune arme équipée
     * ne satisfait, rend la clé i18n de l'avertissement à afficher ; sinon null.
     * Sert au garde-fou de lançabilité, au même titre que les ressources : une
     * carte « attaque à l'arme de mêlée » ne doit pas être jouable les mains vides.
     *
     * Pendant de `WeaponDamage.getMissingWeaponWarningKey`, qui pose la même
     * garde sur les DÉGÂTS de la carte.
     *
     * @param {object} [choice] - Le choix (contenu) de la carte.
     * @param {object} actor    - L'acteur qui joue la carte.
     *
     * @returns {?string} La clé i18n d'avertissement, ou null.
     */
    static missingWeaponWarningKey(choice, actor) {
        if (!CardFqSystem.hasHitRoll(choice)) {
            return null;
        }
        return WeaponDamage.missingWeaponWarningKeyFor(choice.hitSource, actor);
    }

    /**
     * La base de l'attaque, avant le bonus de carte : son modificateur, et la
     * caractéristique par laquelle elle passe.
     *
     * @param {object}  actor     - L'acteur qui joue la carte.
     * @param {string}  source    - La source du modificateur (`hitSource`).
     * @param {?string} [ability] - La caractéristique, pour la source `ability`.
     *
     * @returns {{modifier: number, ability: ?string, weapon?: ?string}} La base de
     *          l'attaque, et le nom de l'arme pour une attaque à l'arme.
     */
    static #baseAttack(actor, source, ability) {
        if (source === CardFqSystem.HIT_SOURCE_ABILITY) {
            const mod = Number(actor.system?.abilities?.[ability]?.mod ?? 0);
            const prof = Number(actor.system?.attributes?.prof ?? 0);
            // La maîtrise s'ajoute toujours : c'est la règle des attaques de sort.
            return {
                modifier: (Number.isFinite(mod) ? mod : 0) + (Number.isFinite(prof) ? prof : 0),
                ability
            };
        }
        return HitProfile.#weaponAttack(actor, source);
    }

    /**
     * L'attaque de la première arme équipée du type demandé : trouve l'arme et
     * son activité d'attaque, puis délègue le modificateur à
     * {@link HitProfile.#attackModifierOf} et la caractéristique à
     * {@link HitProfile.#abilityOf}.
     *
     * Seule l'activité d'ATTAQUE porte `getAttackData` : contrairement aux
     * dégâts, l'activité de dégâts ne peut pas servir de repli.
     *
     * Rend un modificateur nul et aucune caractéristique si aucune arme n'est
     * équipée ou si l'arme n'a pas d'activité d'attaque.
     *
     * @param {object} actor - L'acteur porteur.
     * @param {string} token - Le jeton d'arme (clé de `WEAPON_TOKENS`).
     *
     * @returns {{modifier: number, ability: ?string, weapon: ?string}} L'attaque de l'arme,
     *          et son nom.
     */
    static #weaponAttack(actor, token) {
        const none = {modifier: 0, ability: null, weapon: null};
        const categories = WEAPON_TOKENS[token]?.categories;
        if (!categories) {
            return none;
        }
        const weapon = WeaponDamage.getEquippedWeapon(actor, categories);
        if (!weapon) {
            return none;
        }
        const activity = WeaponDamage.getAttackActivity(weapon, ["attack"]);
        if (typeof activity?.getAttackData !== "function") {
            // Une arme sans activité d'attaque ne peut pas dire son modificateur.
            // Le silence coûterait des heures à diagnostiquer en jeu, d'où
            // l'avertissement nommant l'arme fautive.
            console.warn(`fq-card-engine | « ${weapon.name} » n'a pas d'activité d'attaque :`
                + " modificateur de toucher nul (ajouter l'activité d'attaque à l'arme).");
            return none;
        }
        return {
            modifier: HitProfile.#attackModifierOf(activity),
            ability: HitProfile.#abilityOf(activity),
            weapon: weapon.name ?? null
        };
    }

    /**
     * La caractéristique d'une activité d'attaque, telle que dnd5e la choisit :
     * celle de l'activité si elle en impose une, sinon la meilleure de celles que
     * l'arme autorise (Force ou Dextérité pour une arme de finesse).
     *
     * Renvoie null — sans jamais lever — si l'activité ne sait pas la dire.
     *
     * @param {object} [activity] - L'activité d'attaque dnd5e.
     *
     * @returns {?string} La caractéristique, ou null.
     */
    static #abilityOf(activity) {
        try {
            return activity?.ability ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Le modificateur d'attaque d'une activité, tel que dnd5e le construit.
     *
     * Tout vient de `activity.getAttackData()` : caractéristique, bonus de
     * maîtrise (VIDE si l'arme n'est pas maîtrisée — la règle D&D fait perdre le
     * bonus, elle n'inflige pas de désavantage), bonus magique de l'arme et des
     * munitions, `system.rolls.attack.mwak|rwak|msak|rsak.bonus`, et la réduction
     * d'épuisement 2024. Rien n'est réécrit ici.
     *
     * Renvoie 0 — sans jamais lever — si l'activité ne sait pas construire sa
     * donnée d'attaque.
     *
     * @param {object} [activity] - L'activité d'attaque dnd5e.
     *
     * @returns {number} Le modificateur d'attaque, ou 0.
     */
    static #attackModifierOf(activity) {
        if (typeof activity?.getAttackData !== "function") {
            return 0;
        }
        try {
            const {parts, data} = activity.getAttackData() ?? {};
            const formula = (parts ?? [])
                .map(part => String(part ?? "").trim())
                .filter(part => part)
                .join(" + ");
            if (!formula) {
                return 0;
            }
            const total = new Roll(formula, data ?? {}).evaluateSync().total;
            return Number.isFinite(total) ? total : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Réduit une valeur de champ de carte à un nombre. Les champs de toucher sont
     * normalement déjà résolus par `CardEffect.prepareDataFromCard` : le cas
     * courant est donc une valeur déjà numérique, et le jet ne sert que de repli.
     *
     * Volontairement pas `RollService.resolveOrZero`, qui LÈVE sur un dé comme
     * sur une expression inévaluable : un bonus mal saisi rendrait la carte
     * injouable au lieu de coûter son seul bonus.
     *
     * @param {string|number} [value] - La valeur brute du champ.
     *
     * @returns {number} La valeur numérique, ou 0.
     */
    static #numberOf(value) {
        const direct = Number(value ?? 0);
        if (Number.isFinite(direct)) {
            return direct;
        }
        try {
            const rolled = Number(RollService.rollDiceSync(value));
            return Number.isFinite(rolled) ? rolled : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Réduit une valeur de champ de carte à un nombre SANS rien jeter, pour
     * l'affichage : une valeur numérique telle quelle, une expression évaluée
     * avec les modificateurs de caractéristique de l'acteur (`@dex`), et 0 pour
     * ce qui porte un dé ou ne s'évalue pas.
     *
     * @param {string|number} [value] - La valeur brute du champ.
     * @param {object}        actor   - L'acteur dont les caractéristiques sont lues.
     *
     * @returns {number} La valeur numérique, ou 0.
     */
    static #fixedNumberOf(value, actor) {
        const direct = Number(value ?? 0);
        if (Number.isFinite(direct)) {
            return direct;
        }
        const text = String(value);
        if (/\d*d\d/i.test(text)) {
            return 0;
        }
        const mods = Object.fromEntries(Object.entries(actor.system?.abilities ?? {})
            .map(([key, entry]) => [key, Number(entry?.mod ?? 0)]));
        try {
            const total = Number(new Roll(text, {...(actor.getRollData?.() ?? {}), ...mods}).evaluateSync().total);
            return Number.isFinite(total) ? total : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Journalise une source dont la configuration de toucher est incomplète — un
     * choix de carte ou une activité dnd5e — et rend null. Le jet est abandonné
     * plutôt que deviné : un modificateur inventé fausserait silencieusement toute
     * la résolution. La saisie est gardée en amont par le formulaire de carte.
     *
     * @param {object} source - Le choix ou l'activité fautive.
     * @param {string} reason - Ce qui manque.
     *
     * @returns {null} Toujours null.
     */
    static #incomplete(source, reason) {
        console.warn(`fq-card-engine | jet pour toucher ignoré (${reason})`, source);
        return null;
    }
}
