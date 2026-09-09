/**
 * Les six caractéristiques dnd5e : source unique du module, pour les jetons
 * `@<abi>` des formules de carte comme pour les listes déroulantes du formulaire.
 *
 * Ce module ne doit importer AUCUN autre module du moteur. Il est consommé à la
 * fois par le SCHÉMA de carte (`card-fq-system.mjs`) et par le MOTEUR
 * (`roll-service.js`) : tout import ferait un cycle, le schéma étant lui-même
 * atteint depuis `domain/constants.js` dont dépend le moteur.
 */

/**
 * Les abréviations dnd5e des six caractéristiques.
 * @type {ReadonlyArray<string>}
 */
export const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/**
 * Les caractéristiques en table de choix pour un champ de schéma : abréviation
 * dnd5e vers clé de localisation. Table écrite EN TOUTES LETTRES, comme
 * `SOURCE_LABEL_KEYS` (`card-svg/formula-display.js`) : une clé construite par
 * concaténation serait introuvable à la recherche dans le dépôt.
 *
 * Le libellé est le nom nu de la caractéristique, là où `SOURCE_LABEL_KEYS`
 * porte une phrase de tooltip (« Modifié par la Force ») : les deux tables se
 * ressemblent mais ne servent pas au même endroit.
 * @type {Object<string, string>}
 */
/**
 * Les caractéristiques en abrégé (trois lettres), pour les emplacements qui
 * n'ont pas la place du nom complet — la bulle de toucher de la face de carte.
 * @type {Object<string, string>}
 */
export const ABILITY_SHORT = Object.freeze({
    str: "FQCARDENGINE.AbilityShortStr",
    dex: "FQCARDENGINE.AbilityShortDex",
    con: "FQCARDENGINE.AbilityShortCon",
    int: "FQCARDENGINE.AbilityShortInt",
    wis: "FQCARDENGINE.AbilityShortWis",
    cha: "FQCARDENGINE.AbilityShortCha"
});

export const ABILITY_CHOICE = Object.freeze({
    "": "FQCARDENGINE.AbilityNone",
    str: "FQCARDENGINE.AbilityStr",
    dex: "FQCARDENGINE.AbilityDex",
    con: "FQCARDENGINE.AbilityCon",
    int: "FQCARDENGINE.AbilityInt",
    wis: "FQCARDENGINE.AbilityWis",
    cha: "FQCARDENGINE.AbilityCha"
});
