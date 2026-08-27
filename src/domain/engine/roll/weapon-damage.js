import ResourceHandler from "../shared/resource-handler.js";

/**
 * Table des jetons d'arme : jeton → catégories dnd5e acceptées
 * (`weapon.system.type.value`), clé i18n de l'avertissement affiché si aucune
 * arme du type n'est équipée (garde-fou de cartes), et clé i18n de la
 * notification équivalente pour le bouton HUD / la macro.
 * @type {Object<string, {categories: string[], warningKey: string, hudWarningKey: string}>}
 */
export const WEAPON_TOKENS = {
    "@wpnR": {
        categories: ["simpleR", "martialR"],
        warningKey: "FQCARDENGINE.WarningMsgNoRangedWeapon",
        hudWarningKey: "FQCARDENGINE.TokenDamageNoRangedWeaponWarningMsg"
    },
    "@wpnM": {
        categories: ["simpleM", "martialM", "natural"],
        warningKey: "FQCARDENGINE.WarningMsgNoMeleeWeapon",
        hudWarningKey: "FQCARDENGINE.TokenDamageNoMeleeWeaponWarningMsg"
    }
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
     * la calcule via l'activité d'attaque, à une main. Les jetons `@mod` et
     * `@abilities.<abr>.mod` sont résolus ici en valeurs concrètes car le pipeline
     * de dégâts FQ ne dispose pas du `rollData` de l'arme — un jeton laissé
     * littéral s'évaluerait à 0 au jet et ferait échouer le repli d'affichage.
     * Renvoie `"0"` si aucune arme / activité, ou si `getDamageConfig` échoue ;
     * ne lève jamais et n'appelle jamais `activity.use()`.
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
        let formula = (config?.rolls ?? [])
            .map(roll => {
                const data = roll?.data ?? {};
                return roll?.parts?.join(" + ")
                    .replaceAll("@mod", String(data.mod ?? 0))
                    .replace(/@abilities\.(\w+)\.mod/g, (_, abr) => String(data.abilities?.[abr]?.mod ?? 0));
            })
            .filter(part => part)
            .join(" + ");
        if (!formula) {
            return "0";
        }
        // dnd5e n'injecte `system.bonuses.mwak/rwak.damage` que pour les
        // activités d'ATTAQUE (`BaseActivityData.actionType` vaut le type de
        // l'activité — "damage" pour les armes FQ — et `_processDamagePart`
        // lit alors `system.bonuses.damage.damage`, qui n'existe pas). Le
        // bonus d'arme de l'acteur est donc ajouté ici pour ces activités.
        if (activity.type !== "attack") {
            const bonus = WeaponDamage.getActorWeaponDamageBonus(actor, weapon);
            if (bonus) {
                formula = `${formula} + (${bonus})`;
            }
        }
        return formula;
    }

    /**
     * Bonus de dégâts d'arme de l'acteur applicable à une arme : `mwak` pour
     * une arme de mêlée (`simpleM`/`martialM`/`natural`), `rwak` pour une arme à distance
     * (`system.bonuses.<type>.damage`, alimenté notamment par des effets de
     * cartes). Renvoie `""` si le bonus est vide ou nul.
     *
     * @param {object} actor  - L'acteur porteur.
     * @param {object} weapon - L'arme équipée.
     *
     * @returns {string} Le bonus de dégâts (formule), ou `""`.
     */
    static getActorWeaponDamageBonus(actor, weapon) {
        const category = weapon?.system?.type?.value ?? "";
        const actionType = category.endsWith("R") ? "rwak" : "mwak";
        const bonus = actor?.system?.bonuses?.[actionType]?.damage;
        return (bonus && !/^0+$/.test(String(bonus).trim())) ? String(bonus) : "";
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
     * Portée de mêlée de l'acteur, telle que dnd5e la déclare sur l'arme équipée.
     * Renvoie la valeur BRUTE avec son unité, sans conversion : la traduction en
     * cases (géométrie du moteur) appartient à `ReachProfile.reachToCases`. Cette
     * classe reste ainsi dans le domaine dnd5e, et le pipeline de cartes qui en
     * dépend n'embarque rien de la détection de réaction.
     *
     * L'arme retenue est la PREMIÈRE arme de mêlée équipée — la même que celle
     * dont `getEquippedWeaponDamageFormula` tire les dégâts. Portée et dégâts
     * décrivent donc toujours la même arme.
     *
     * Restreinte à la mêlée (`@wpnM`) volontairement, et sans paramètre de
     * catégories : dnd5e peuple `range.reach` à 5 sur TOUTES les armes, y compris
     * les armes à distance (une fronde déclare `{value: 30, long: 120, reach: 5}`).
     * Accepter des catégories à distance rendrait donc une portée de mêlée
     * fantaisiste sans le moindre signe.
     *
     * La portée de l'activité ne l'emporte que si elle est explicitement marquée
     * `override` ; par défaut (`override: false`) elle hérite de celle de l'item,
     * qui est la source à lire.
     *
     * @param {object} actor - L'acteur porteur.
     *
     * @returns {{reach: number, units: (string|null)}} La portée et son unité, ou `{reach: 0, units: null}` si aucune arme de mêlée équipée ou portée inexploitable.
     */
    static getEquippedMeleeReach(actor) {
        const none = {reach: 0, units: null};
        const weapon = WeaponDamage.getEquippedWeapon(actor, WEAPON_TOKENS["@wpnM"].categories);
        if (!weapon) {
            return none;
        }
        const activityRange = WeaponDamage.getAttackActivity(weapon)?.range;
        const range = activityRange?.override === true ? activityRange : weapon.system?.range;
        const reach = Number(range?.reach);
        if (!Number.isFinite(reach) || reach <= 0) {
            return none;
        }
        return {reach, units: range?.units ?? null};
    }

    /**
     * Déclenche l'usage de la première arme équipée d'un acteur du type demandé
     * (`@wpnM` mêlée / `@wpnR` distance), après validation que c'est bien son tour
     * de combat. Avertit si aucune arme du type n'est équipée. Logique partagée
     * entre les boutons du HUD de token (`token-hud.js`) et les macros de
     * combat (`FqCardEngineModule.rollCurrentCombattantWeaponDamage`).
     *
     * @param {object} actor       - L'acteur qui porte les armes.
     * @param {string} weaponToken - Le jeton d'arme (clé de `WEAPON_TOKENS`).
     *
     * @returns {(Promise|void)} La promesse d'usage de l'arme, ou rien si aucun usage n'a été déclenché.
     */
    static useFirstEquippedWeapon(actor, weaponToken) {
        if (!ResourceHandler.validateUseSpellInTurn(actor)) {
            return;
        }
        return WeaponDamage.triggerFirstEquippedWeapon(actor, weaponToken);
    }

    /**
     * Déclenche l'usage de la première arme équipée d'un acteur du type demandé,
     * SANS validation de tour. Avertit si aucune arme du type n'est équipée.
     *
     * Séparée de `useFirstEquippedWeapon` parce que la validation « à son tour »
     * est une précondition des appelants déclenchés par un clic de joueur (HUD,
     * macros), pas une propriété de l'usage de l'arme. Les usages pilotés par le
     * moteur qui se produisent légitimement hors tour — l'attaque d'opportunité —
     * passent directement ici, sans drapeau de contournement à faire circuler.
     *
     * @param {object} actor       - L'acteur qui porte les armes.
     * @param {string} weaponToken - Le jeton d'arme (clé de `WEAPON_TOKENS`).
     *
     * @returns {(Promise|void)} La promesse d'usage de l'arme, ou rien si aucune arme du type n'est équipée.
     */
    static triggerFirstEquippedWeapon(actor, weaponToken) {
        const {categories, hudWarningKey} = WEAPON_TOKENS[weaponToken];
        const arme = WeaponDamage.getEquippedWeapon(actor, categories);
        if (!arme) return ui.notifications.warn(game.i18n.localize(hudWarningKey));
        return arme.use();
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
