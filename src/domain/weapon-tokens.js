/**
 * Table des jetons d'arme : jeton → catégories dnd5e acceptées
 * (`weapon.system.type.value`), clé i18n de l'avertissement affiché si aucune
 * arme du type n'est équipée (garde-fou de cartes), et clé i18n de la
 * notification équivalente pour le bouton HUD / la macro.
 *
 * Ce module ne doit importer AUCUN autre module du moteur. Il est consommé à la
 * fois par le SCHÉMA de carte (`card-fq-system.mjs`) et par le MOTEUR
 * (`roll/weapon-damage.js`, qui le réexporte) : tout import ferait un cycle, le
 * schéma étant lui-même atteint depuis les services dont dépend le moteur.
 *
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
 * Les jetons d'arme en table de choix pour un champ de schéma : jeton vers clé
 * de localisation.
 * @type {Object<string, string>}
 */
export const WEAPON_TOKEN_CHOICE = Object.freeze({
    "@wpnM": "FQCARDENGINE.HitSourceWeaponMelee",
    "@wpnR": "FQCARDENGINE.HitSourceWeaponRanged"
});
