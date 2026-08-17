import ResourceHandler from "../shared/resource-handler.js";

/**
 * Table des jetons d'arme : jeton → catégories dnd5e acceptées
 * (`weapon.system.type.value`) et clé i18n de l'avertissement affiché si aucune
 * arme du type n'est équipée.
 * @type {Object<string, {categories: string[], warningKey: string}>}
 */
export const WEAPON_TOKENS = {
    "@wpnR": {categories: ["simpleR", "martialR"], warningKey: "FQCARDENGINE.WarningMsgNoRangedWeapon"},
    "@wpnM": {categories: ["simpleM", "martialM"], warningKey: "FQCARDENGINE.WarningMsgNoMeleeWeapon"}
};

/**
 * Extraction des dégâts de l'arme équipée d'un acteur, telle que dnd5e la calcule.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class WeaponDamage {

    /**
     * Première arme équipée de l'acteur dont la catégorie (`system.type.value`)
     * figure dans `categories`.
     *
     * @param {object}   actor      - L'acteur porteur.
     * @param {string[]} categories - Les catégories d'arme acceptées.
     *
     * @returns {object|undefined} L'arme, ou undefined si aucune.
     */
    static getEquippedWeapon(actor, categories) {
        const equipped = actor?.items?.filter(i => i.type === "weapon" && i.system?.equipped) ?? [];
        return equipped.find(w => categories.includes(w.system?.type?.value));
    }

    /**
     * Formule de dégâts complète (dé + `@mod` résolu en valeur concrète + bonus
     * magique) de la première arme équipée d'une des `categories`, telle que dnd5e
     * la calcule via l'activité d'attaque, à une main. Le `@mod` est résolu ici car
     * le pipeline de dégâts FQ ne dispose pas du `rollData` de l'arme. Renvoie
     * `"0"` si aucune arme / activité, ou si `getDamageConfig` échoue ; ne lève
     * jamais et n'appelle jamais `activity.use()`.
     *
     * @param {object}   actor      - L'acteur porteur.
     * @param {string[]} categories - Les catégories d'arme acceptées.
     *
     * @returns {string} La formule de dégâts, ou `"0"`.
     */
    static getEquippedWeaponDamageFormula(actor, categories) {
        const weapon = WeaponDamage.getEquippedWeapon(actor, categories);
        if (!weapon) {
            return "0";
        }
        const activity = WeaponDamage.getAttackActivity(weapon);
        if (!activity) {
            return "0";
        }
        let config;
        try {
            config = activity.getDamageConfig({attackMode: "oneHanded"});
        } catch {
            return "0";
        }
        const formula = (config?.rolls ?? [])
            .map(roll => roll?.parts?.join(" + ").replaceAll("@mod", String(roll?.data?.mod ?? 0)))
            .filter(part => part)
            .join(" + ");
        return formula || "0";
    }

    /**
     * Résout l'activité porteuse de dégâts d'une arme : l'activité de dégâts en
     * priorité, sinon l'activité d'attaque (certaines armes n'ont qu'une activité
     * "damage", cf. `dnd5e.rollDamageV2` qui traite les deux types). Chemin
     * principal : l'API dnd5e 5.x `activities.getByType`. Fallback itératif si
     * `getByType` est absent.
     *
     * @param {object} weapon - L'item arme.
     *
     * @returns {object|undefined} L'activité de dégâts ou d'attaque, ou undefined si absente.
     */
    static getAttackActivity(weapon) {
        const activities = weapon.system?.activities;
        for (const type of ["damage","attack"]) {
            const byType = activities?.getByType?.(type)?.[0];
            if (byType) {
                return byType;
            }
        }
        if (activities && typeof activities[Symbol.iterator] === "function") {
            return [...activities].find(a => a?.type === "damage") ??
                [...activities].find(a => a?.type === "attack");
        }
        return undefined;
    }

    /**
     * Déclenche l'usage de toutes les armes équipées d'un acteur, après validation
     * que c'est bien son tour de combat. Avertit si aucune arme n'est équipée.
     * Logique partagée entre le bouton du HUD de token (`shared/token-hud.js`) et
     * la macro de combat (`FqCardEngineModule.rollCurrentCombattantWeaponDamage`).
     *
     * @param {object} actor - L'acteur qui porte les armes.
     *
     * @returns {void}
     */
    static useEquippedWeapons(actor) {
        if (!ResourceHandler.validateUseSpellInTurn(actor)) {
            return;
        }
        const armes = actor.items.filter(i => i.type === "weapon" && i.system.equipped);
        if (!armes.length) return ui.notifications.warn(game.i18n.localize("FQCARDENGINE.TokenDamageNoWeaponWarningMsg"));
        for (let arme of armes) {
            arme.use();
        }
    }

    /**
     * Remplace, dans `cardContent.damage`, chaque jeton d'arme (`@wpnR`/`@wpnM`) par
     * la formule de dégâts de l'arme équipée correspondante. Mute sur place. No-op si
     * `damage` n'est pas une chaîne. L'acteur est passé explicitement.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     * @param {object} actor       - L'acteur lanceur.
     *
     * @returns {void}
     */
    static substituteInDamage(cardContent, actor) {
        if (typeof cardContent?.damage !== "string") {
            return;
        }
        let damage = cardContent.damage;
        for (const [token, {categories}] of Object.entries(WEAPON_TOKENS)) {
            if (damage.includes(token)) {
                damage = damage.replaceAll(token, WeaponDamage.getEquippedWeaponDamageFormula(actor, categories));
            }
        }
        cardContent.damage = damage;
    }

    /**
     * Si `cardContent.damage` requiert un type d'arme (`@wpnR`/`@wpnM`) qu'aucune
     * arme équipée ne satisfait, renvoie la clé i18n de l'avertissement à afficher
     * (première contrainte non satisfaite) ; sinon `null`. Sert au garde-fou de
     * lançabilité (`checkIfCanUseCard`), au même titre que les ressources.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     * @param {object} actor       - L'acteur lanceur.
     *
     * @returns {string|null} La clé i18n d'avertissement, ou null.
     */
    static getMissingWeaponWarningKey(cardContent, actor) {
        if (typeof cardContent?.damage !== "string") {
            return null;
        }
        for (const [token, {categories, warningKey}] of Object.entries(WEAPON_TOKENS)) {
            if (cardContent.damage.includes(token) && !WeaponDamage.getEquippedWeapon(actor, categories)) {
                return warningKey;
            }
        }
        return null;
    }
}
