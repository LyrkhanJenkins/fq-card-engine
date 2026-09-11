/**
 * Les conditions dnd5e que le moteur connaît, et les règles qu'il en tire.
 *
 * Module de DONNÉES sans aucune dépendance, comme `abilities.js` : il est lu à
 * la fois par le schéma de carte (menu « Statut normalisé »), par le registre
 * des statuts et par les prédicats d'avantage — les faire dépendre les uns des
 * autres fabriquerait un import circulaire.
 */

/**
 * Les 14 conditions du PHB que le menu « Statut normalisé » propose, avec leur
 * libellé. L'épuisement n'y est pas : il se compte en niveaux, et le moteur le
 * remet déjà à zéro en fin de combat.
 *
 * @type {Object<string, string>}
 */
export const DND5E_CONDITIONS = Object.freeze({
    blinded: "FQCARDENGINE.ConditionBlinded",
    charmed: "FQCARDENGINE.ConditionCharmed",
    deafened: "FQCARDENGINE.ConditionDeafened",
    frightened: "FQCARDENGINE.ConditionFrightened",
    grappled: "FQCARDENGINE.ConditionGrappled",
    incapacitated: "FQCARDENGINE.ConditionIncapacitated",
    invisible: "FQCARDENGINE.ConditionInvisible",
    paralyzed: "FQCARDENGINE.ConditionParalyzed",
    petrified: "FQCARDENGINE.ConditionPetrified",
    poisoned: "FQCARDENGINE.ConditionPoisoned",
    prone: "FQCARDENGINE.ConditionProne",
    restrained: "FQCARDENGINE.ConditionRestrained",
    stunned: "FQCARDENGINE.ConditionStunned",
    unconscious: "FQCARDENGINE.ConditionUnconscious"
});

/**
 * Ce que chaque statut réglé par la carte fait RÉELLEMENT en jeu, en une phrase,
 * par clé de statut. C'est ce que le chat dit quand le statut est posé.
 *
 * Volontairement pas le texte de dnd5e : sa page de règles n'existe qu'en
 * anglais, et elle décrit aussi ce que le moteur n'applique pas (un charmé ne
 * peut pas attaquer son charmeur, un effrayé ne peut pas s'approcher…). La règle
 * officielle reste jointe à la description de l'effet, comme dnd5e le fait.
 *
 * @type {Object<string, string>}
 */
export const STATUS_RULES = Object.freeze({
    blinded: "FQCARDENGINE.RuleBlinded",
    charmed: "FQCARDENGINE.RuleCharmed",
    deafened: "FQCARDENGINE.RuleDeafened",
    frightened: "FQCARDENGINE.RuleFrightened",
    grappled: "FQCARDENGINE.RuleGrappled",
    incapacitated: "FQCARDENGINE.RuleIncapacitated",
    invisible: "FQCARDENGINE.RuleInvisible",
    paralyzed: "FQCARDENGINE.RuleParalyzed",
    petrified: "FQCARDENGINE.RulePetrified",
    poisoned: "FQCARDENGINE.RulePoisoned",
    prone: "FQCARDENGINE.RuleProne",
    restrained: "FQCARDENGINE.RuleRestrained",
    stunned: "FQCARDENGINE.RuleStunned",
    unconscious: "FQCARDENGINE.RuleUnconscious",
    empowered: "FQCARDENGINE.RuleEmpowered",
    exposed: "FQCARDENGINE.RuleExposed",
    warded: "FQCARDENGINE.RuleWarded",
    shaken: "FQCARDENGINE.RuleShaken"
});

/**
 * Les statuts FQ qui jouent sur l'avantage ou le désavantage, avec leur
 * libellé. Ce ne sont pas des conditions dnd5e : aucune des 14 ne donne
 * l'avantage sans contrepartie (l'invisible est aussi attaqué avec
 * désavantage). Leur identifiant de statut porte le préfixe `fq` pour ne jamais
 * croiser un statut de dnd5e.
 *
 * - `fqEmpowered` (« En élan ») : son porteur attaque avec avantage ;
 * - `fqExposed` (« Garde brisée ») : on attaque son porteur avec avantage ;
 * - `fqWarded` (« Sous égide ») : on attaque son porteur avec désavantage ;
 * - `fqShaken` (« Ébranlé ») : son porteur sauvegarde avec désavantage.
 *
 * @type {Object<string, string>}
 */
export const FQ_ADVANTAGE_STATUSES = Object.freeze({
    fqEmpowered: "FQCARDENGINE.StatusEmpowered",
    fqExposed: "FQCARDENGINE.StatusExposed",
    fqWarded: "FQCARDENGINE.StatusWarded",
    fqShaken: "FQCARDENGINE.StatusShaken"
});

/**
 * Les règles d'avantage et de défense, exprimées dans le format de
 * `CONFIG.DND5E.conditionEffects` : une clé de règle → les conditions qui la
 * déclenchent. Elles y sont versées au `init` (voir
 * `config/register-condition-effects.js`), si bien que `actor.hasConditionEffect`
 * les évalue comme les siennes — immunités aux conditions (`traits.ci`) comprises.
 *
 * `attackDisadvantage` existe déjà dans dnd5e (empoisonné, épuisement 3) mais le
 * système ne le consomme nulle part : on le complète. `poisoned` y est répété
 * pour que la règle tienne même là où la table dnd5e n'existe pas.
 *
 * Effrayé, agrippé et charmé dépendent d'une SOURCE que le moteur ne suit pas :
 * effrayé donne toujours le désavantage (la source est supposée en vue), agrippé
 * et charmé n'influent sur aucun jet.
 *
 * Toutes les nouvelles clés portent le préfixe `fq` pour ne jamais entrer en
 * collision avec une clé qu'une version future de dnd5e ajouterait.
 *
 * @type {Object<string, string[]>}
 */
export const CONDITION_EFFECTS = Object.freeze({
    /** Le LANCEUR attaque avec désavantage. */
    attackDisadvantage: Object.freeze(["blinded", "frightened", "poisoned", "prone", "restrained"]),
    /** Le LANCEUR attaque avec avantage. */
    fqAttackAdvantage: Object.freeze(["invisible", "fqEmpowered"]),
    /** On attaque la CIBLE avec avantage. */
    fqAttackedAdvantage: Object.freeze(["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious",
        "fqExposed"]),
    /** On attaque la CIBLE avec désavantage. */
    fqAttackedDisadvantage: Object.freeze(["invisible", "fqWarded"]),
    /** La CIBLE jette ses sauvegardes avec désavantage, quelle que soit la caractéristique. */
    fqSaveDisadvantage: Object.freeze(["fqShaken"]),
    /** Cible à terre : avantage au contact, désavantage à distance. */
    fqProneTarget: Object.freeze(["prone"]),
    /** La cible rate d'office ses sauvegardes de Force et de Dextérité. */
    fqStrDexSaveFail: Object.freeze(["paralyzed", "petrified", "stunned", "unconscious"]),
    /** La cible n'oppose plus AUCUNE défense : ni esquive, ni armure, ni sauvegarde. */
    fqDefenseless: Object.freeze(["paralyzed", "unconscious"])
});
