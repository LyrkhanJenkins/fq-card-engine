/**
 * Les types de dégâts du moteur et leur libellé.
 *
 * Module de DONNÉES sans aucune dépendance, comme `abilities.js` : les
 * identifiants sont ceux de `CONFIG.DND5E.damageTypes`, que les formules des
 * cartes portent entre crochets (`(1d8)[fire]`). dnd5e ne nomme ses types
 * qu'en anglais : ces libellés sont les nôtres, pour la fenêtre et le chat.
 *
 * @type {Object<string, string>}
 */
export const DAMAGE_TYPE_LABELS = Object.freeze({
    acid: "FQCARDENGINE.DamageTypeAcid",
    bludgeoning: "FQCARDENGINE.DamageTypeBludgeoning",
    cold: "FQCARDENGINE.DamageTypeCold",
    fire: "FQCARDENGINE.DamageTypeFire",
    force: "FQCARDENGINE.DamageTypeForce",
    lightning: "FQCARDENGINE.DamageTypeLightning",
    necrotic: "FQCARDENGINE.DamageTypeNecrotic",
    piercing: "FQCARDENGINE.DamageTypePiercing",
    poison: "FQCARDENGINE.DamageTypePoison",
    psychic: "FQCARDENGINE.DamageTypePsychic",
    radiant: "FQCARDENGINE.DamageTypeRadiant",
    slashing: "FQCARDENGINE.DamageTypeSlashing",
    thunder: "FQCARDENGINE.DamageTypeThunder"
});
