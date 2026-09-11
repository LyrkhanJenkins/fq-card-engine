/**
 * Registre central des effets de statut normalisés (poison, acide, brûlure,
 * gel, malédiction, terre, air) : pour chaque clé, les données d'effets actifs
 * canoniques (nom, icône, changements, durée, flags) prêtes à être consommées
 * par `CardEffect.createEffectsFromData`. Une carte référence un statut par le
 * champ `status` d'une donnée d'effet (`applyEffectsFormulas[].effects[].data[]`)
 * au lieu d'un blob libre : la sémantique du statut vit ici, en un seul endroit,
 * et toutes les cartes la partagent — rééquilibrage central, retrait
 * (`removeEffectName`) et conditions de combo (`targetsHaveEffect`) fiables car
 * le NOM de l'effet est canonique.
 *
 * Les noms d'effets restent en anglais (« Poison », « Burn »…) : ce sont des
 * identifiants de gameplay déjà référencés par les scripts de condition des
 * cartes existantes, pas des libellés localisés.
 *
 * Une durée à valeur vide signifie « illimitée » : `createEffectsFromData`
 * supprime le bloc duration mais pose l'origine FQ, donc l'effet persiste
 * jusqu'à la purge de fin de combat (hook `deleteCombat`).
 *
 * Les 14 conditions dnd5e du PHB s'y ajoutent comme statuts à part entière :
 * elles ne portent aucun changement, seulement leur identifiant dans `statuses`,
 * qui suffit à dnd5e (`actor.statuses`, `hasConditionEffect`) comme aux règles
 * d'avantage du moteur. Leur retrait n'est pas géré : posées sans durée, elles
 * tombent avec la purge de fin de combat, comme les autres statuts illimités.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 * Ce module ne doit importer AUCUN autre module du moteur (il est consommé à la
 * fois par le schéma de carte et par le pipeline de jeu) — hormis le module de
 * données `conditions.js`, lui-même sans aucune dépendance.
 */

import {DND5E_CONDITIONS, STATUS_RULES} from "../../conditions.js";

export default class StatusEffects {

    /**
     * Nom de la macro de compendium (macros-sequencer) qui propage le poison :
     * référencée par le change `macro.execute` de l'entrée `poison`, elle est
     * importée dans le monde à la première application (cf.
     * `Fx.importMacroFromCompendium`) puis ré-exécutée par DAE à chaque fin de
     * tour de l'acteur affecté (`flags.dae.macroRepeat`).
     */
    static POISON_SPREAD_MACRO = "FQPoisonSpread";

    /**
     * Choix du select « Statut normalisé » du formulaire de carte : la clé vide
     * est le mode « Personnalisé » (blob d'effet libre, comportement historique).
     * Les statuts FQ viennent d'abord, les conditions dnd5e ensuite.
     */
    static STATUS_CHOICES = {
        "": "FQCARDENGINE.StatusCustom",
        poison: "FQCARDENGINE.StatusPoison",
        acid: "FQCARDENGINE.StatusAcid",
        burn: "FQCARDENGINE.StatusBurn",
        frost: "FQCARDENGINE.StatusFrost",
        curse: "FQCARDENGINE.StatusCurse",
        virus: "FQCARDENGINE.StatusVirus",
        earth: "FQCARDENGINE.StatusEarth",
        air: "FQCARDENGINE.StatusAir",
        empowered: "FQCARDENGINE.StatusEmpowered",
        exposed: "FQCARDENGINE.StatusExposed",
        warded: "FQCARDENGINE.StatusWarded",
        shaken: "FQCARDENGINE.StatusShaken",
        ...DND5E_CONDITIONS
    };

    /**
     * Les statuts du registre dont la DURÉE et le retrait sur dégâts se règlent
     * carte par carte, comme ceux des conditions : leur effet est le même d'une
     * carte à l'autre, seul le temps qu'il dure est affaire de design. Les autres
     * statuts FQ gardent la durée du registre, qui fait partie de leur équilibre.
     */
    static #TIMED_BY_CARD = new Set(["empowered", "exposed", "warded", "shaken"]);

    /**
     * Données d'effets actifs canoniques par statut. Chaque entrée est un
     * TABLEAU : un statut peut poser plusieurs effets (l'acide en empile trois
     * à durées échelonnées pour obtenir des dégâts dégressifs).
     */
    static #REGISTRY = {
        // Poison : 1 dégât par tour, durée illimitée, et chaque effet se
        // duplique UNE fois (à sa première fin de tour) via la macro
        // FQPoisonSpread ré-exécutée par DAE — la copie, vierge, se dupliquera
        // au tour suivant : dégâts 1, 2, 3, 4… (cumul quadratique). La
        // duplication en fin de tour garantit que la copie ne compte qu'à
        // partir du tour suivant, quel que soit l'ordre des hooks de tour.
        poison: [{
            name: "Poison",
            img: "icons/skills/toxins/poison-bottle-corked-fire-green.webp",
            changes: [
                {key: "system.fq.bonus.dot", value: "+1[poison]", type: "add", priority: null},
                {key: "macro.execute", value: "FQPoisonSpread", type: "custom", priority: null}
            ],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1,
            flags: {dae: {macroRepeat: "endEveryTurn"}}
        }],
        // Acide : 4 dégâts au prochain tour, puis 2, puis 1 — trois effets
        // empilés (dot 2+1+1) dont les expirations échelonnées produisent la
        // décroissance. Seul l'effet le plus long porte l'icône de token.
        acid: [
            {
                name: "Acid",
                img: "icons/magic/acid/dissolve-bone-white.webp",
                changes: [{key: "system.fq.bonus.dot", value: "+2[acid]", type: "add", priority: null}],
                duration: {value: "1", units: "rounds"},
                expireOnDamage: false,
                showIcon: 0
            },
            {
                name: "Acid",
                img: "icons/magic/acid/dissolve-bone-white.webp",
                changes: [{key: "system.fq.bonus.dot", value: "+1[acid]", type: "add", priority: null}],
                duration: {value: "2", units: "rounds"},
                expireOnDamage: false,
                showIcon: 0
            },
            {
                name: "Acid",
                img: "icons/magic/acid/dissolve-bone-white.webp",
                changes: [{key: "system.fq.bonus.dot", value: "+1[acid]", type: "add", priority: null}],
                duration: {value: "3", units: "rounds"},
                expireOnDamage: false,
                showIcon: 1
            }
        ],
        // Brûlure : 1 dégât par tour pendant 3 tours, aura de feu.
        burn: [{
            name: "Burn",
            img: "icons/magic/fire/explosion-embers-evade-silhouette.webp",
            changes: [
                {key: "system.fq.bonus.dot", value: "+1[fire]", type: "add", priority: null},
                {key: "macro.execute", value: "PersistAura jb2a.fire_ring", type: "custom", priority: null}
            ],
            duration: {value: "3", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // Gel : -1 point d'action max pendant 3 tours, aura de froid.
        frost: [{
            name: "Frost",
            img: "icons/magic/water/barrier-ice-crystal-wall-faceted.webp",
            changes: [
                {key: "system.fq.action.max", value: "-1", type: "add", priority: null},
                {key: "macro.execute", value: "PersistAura jb2a.aura_themed.01.orbit.loop.cold", type: "custom", priority: null}
            ],
            duration: {value: "3", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // Malédiction : aucun effet mécanique direct — une marque persistante
        // (durée illimitée) que les cartes combo exploitent par son nom.
        curse: [{
            name: "Curse",
            img: "icons/magic/death/skull-energy-light-purple.webp",
            changes: [
                {key: "macro.execute", value: "PersistAura jb2a.condition.curse.01", type: "custom", priority: null}
            ],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // Virus : la cible ne peut plus se soigner — ses PV max sont rabattus
        // (override) sur ses PV restants, jusqu'à la fin du combat. La valeur
        // `@attributes.hp.value` reste littérale à la création (la numérisation
        // du pipeline échoue dessus et la conserve telle quelle) : c'est DAE qui
        // la résout dynamiquement sur l'ACTEUR PORTEUR à chaque préparation de
        // données — les PV max suivent donc les PV restants, et la suppression
        // de l'effet restaure les PV max d'elle-même.
        virus: [{
            name: "Virus",
            img: "icons/svg/biohazard.svg",
            changes: [
                {key: "system.attributes.hp.max", value: "@attributes.hp.value", type: "override", priority: 20},
                {key: "macro.execute", value: "PersistAura jb2a.aura_themed.01.orbit.loop.nature", type: "custom", priority: null}
            ],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // Terre : -1 d'esquive pendant 4 tours, aura de bois.
        earth: [{
            name: "Earth Effect",
            img: "icons/magic/earth/barrier-stone-explosion-debris.webp",
            changes: [
                {key: "system.fq.attributes.evasion", value: "-1", type: "add", priority: null},
                {key: "macro.execute", value: "PersistAura jb2a.aura_themed.01.orbit.loop.wood", type: "custom", priority: null}
            ],
            duration: {value: "4", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // En élan : le porteur attaque avec avantage (règle `fqAttackAdvantage`),
        // jusqu'à son PROCHAIN jet d'attaque, qui consomme l'effet. Sans durée
        // saisie sur la carte, il attend ce jet jusqu'à la fin du combat.
        empowered: [{
            name: "Empowered",
            img: "icons/skills/melee/hand-grip-sword-strike-orange.webp",
            statuses: ["fqEmpowered"],
            changes: [],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            expireOnAttack: "made",
            showIcon: 1
        }],
        // Garde brisée : on attaque le porteur avec avantage (règle
        // `fqAttackedAdvantage`), jusqu'au PROCHAIN jet d'attaque qui le vise,
        // de qui qu'il vienne : c'est ce jet qui consomme l'effet.
        exposed: [{
            name: "Broken Guard",
            img: "icons/magic/defensive/shield-barrier-glowing-triangle-red.webp",
            statuses: ["fqExposed"],
            changes: [],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            expireOnAttack: "received",
            showIcon: 1
        }],
        // Sous égide : on attaque le porteur avec désavantage (règle
        // `fqAttackedDisadvantage`). Aucun jet ne le consomme : il protège de
        // TOUTES les attaques pendant la durée saisie sur la carte.
        warded: [{
            name: "Warded",
            img: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
            statuses: ["fqWarded"],
            changes: [],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }],
        // Ébranlé : le porteur jette sa PROCHAINE sauvegarde avec désavantage
        // (règle `fqSaveDisadvantage`) ; c'est ce jet qui consomme l'effet.
        shaken: [{
            name: "Shaken",
            img: "icons/magic/control/debuff-energy-snare-purple-blue.webp",
            statuses: ["fqShaken"],
            changes: [],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            expireOnSave: true,
            showIcon: 1
        }],
        // Air : -5 de déplacement pendant 2 tours, aura de métal.
        air: [{
            name: "Air Effect",
            img: "icons/magic/air/wind-tornado-spiral-teal-green.webp",
            changes: [
                {key: "system.attributes.movement.walk", value: "-5", type: "add", priority: null},
                {key: "macro.execute", value: "PersistAura jb2a.aura_themed.01.orbit.loop.metal", type: "custom", priority: null}
            ],
            duration: {value: "2", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        }]
    };

    /**
     * Indique si une valeur est une clé de statut normalisé du registre. La
     * chaîne vide (mode « Personnalisé » du formulaire) n'en est pas une.
     *
     * @param {string} [key] - La valeur du champ `status` d'une donnée d'effet.
     *
     * @returns {boolean} True si la clé désigne un statut du registre.
     */
    static isStatusKey(key) {
        return typeof key === "string" && key !== ""
            && (Object.hasOwn(StatusEffects.#REGISTRY, key) || StatusEffects.isCondition(key));
    }

    /**
     * Indique si une clé de statut désigne une condition dnd5e plutôt qu'un
     * statut FQ du registre.
     *
     * @param {string} [key] - La valeur du champ `status` d'une donnée d'effet.
     *
     * @returns {boolean} True pour une des 14 conditions du PHB.
     */
    static isCondition(key) {
        return typeof key === "string" && Object.hasOwn(DND5E_CONDITIONS, key);
    }

    /**
     * Indique si la durée et le retrait sur dégâts d'un statut se règlent sur la
     * carte : vrai pour les conditions dnd5e et pour « En élan » / « Garde
     * brisée », faux pour les statuts FQ dont la durée fait partie de l'équilibre.
     *
     * @param {string} [key] - La clé de statut.
     *
     * @returns {boolean} True si la carte peut régler sa durée.
     */
    static isTimedByCard(key) {
        return StatusEffects.isCondition(key) || StatusEffects.#TIMED_BY_CARD.has(key);
    }

    /**
     * Les statuts FQ dont la durée est FIXÉE par le registre. Le formulaire de
     * carte en masque le champ durée, qui y serait sans effet ; un test garde la
     * feuille de style d'accord avec cette liste.
     *
     * @returns {string[]} Les clés de statut.
     */
    static fixedDurationKeys() {
        return Object.keys(StatusEffects.#REGISTRY).filter(key => !StatusEffects.isTimedByCard(key));
    }

    /**
     * Renvoie les données d'effets actifs d'un statut, en COPIE profonde à
     * chaque appel : le pipeline de jeu mute les données (numérisation des
     * valeurs, résolution de durée, flags) et ne doit jamais altérer le registre.
     *
     * Pour un statut réglé par la carte (voir {@link StatusEffects.isTimedByCard}),
     * la durée saisie sur la carte — quand elle n'est pas vide — et son retrait
     * sur dégâts l'emportent sur ceux du registre.
     *
     * @param {string} [key]    - La clé de statut à expanser.
     * @param {object} [source] - La donnée d'effet de la carte, dont on reprend la
     *        durée et le retrait sur dégâts pour un statut réglé par la carte.
     *
     * @returns {object[]|null} Les données d'effets clonées, ou null si la clé n'est pas un statut.
     */
    static expand(key, source = null) {
        if (!StatusEffects.isStatusKey(key)) {
            return null;
        }
        const effects = StatusEffects.isCondition(key)
            ? [StatusEffects.#conditionData(key)]
            : JSON.parse(JSON.stringify(StatusEffects.#REGISTRY[key]));
        if (StatusEffects.#TIMED_BY_CARD.has(key)) {
            effects.forEach(effect => {
                effect.description = StatusEffects.#description(key);
            });
        }
        if (source && StatusEffects.isTimedByCard(key)) {
            effects.forEach(effect => StatusEffects.#applyCardTiming(effect, source));
        }
        return effects;
    }

    /**
     * La clé i18n de ce qu'un statut fait en jeu, pour les statuts réglés par la
     * carte (conditions dnd5e, « En élan », « Garde brisée »).
     *
     * @param {string} [key] - La clé de statut.
     *
     * @returns {?string} La clé i18n de la règle, ou null.
     */
    static ruleKey(key) {
        return (typeof key === "string" && Object.hasOwn(STATUS_RULES, key)) ? STATUS_RULES[key] : null;
    }

    /**
     * La description d'un effet de statut : ce qu'il fait en jeu, puis, pour une
     * condition dnd5e, sa règle officielle intégrée — exactement ce que dnd5e
     * écrit lui-même quand il pose une condition (`@Embed[<référence> inline]`).
     *
     * @param {string}  key         - La clé de statut.
     * @param {?string} [reference] - L'UUID de la page de règles de dnd5e.
     *
     * @returns {string} La description HTML.
     */
    static #description(key, reference = null) {
        const rule = StatusEffects.ruleKey(key);
        const text = rule ? `<p>${globalThis.game?.i18n?.localize?.(rule) ?? rule}</p>` : "";
        return text + (reference ? `@Embed[${reference} inline]` : "");
    }

    /**
     * Reporte sur un effet la durée et le retrait sur dégâts saisis sur la carte.
     * Une durée vide garde celle du registre (illimitée pour une condition).
     *
     * @param {object} effect - La donnée d'effet, déjà clonée.
     * @param {object} source - La donnée d'effet de la carte.
     *
     * @returns {void}
     */
    static #applyCardTiming(effect, source) {
        const value = String(source.duration?.value ?? "").trim();
        if (value !== "") {
            effect.duration = {value, units: source.duration?.units || "rounds"};
        }
        if (source.expireOnDamage !== undefined) {
            effect.expireOnDamage = !!source.expireOnDamage;
        }
    }

    /**
     * Les données d'effet d'une condition dnd5e, lues À LA DEMANDE dans
     * `CONFIG.statusEffects` : dnd5e y range son nom (déjà localisé), son icône
     * et ses conditions induites (`riders` — paralysé entraîne neutralisé).
     *
     * Les conditions induites entrent dans les `statuses` du MÊME effet : dnd5e
     * les poserait comme effets séparés, mais c'est la présence du statut qui
     * compte pour `actor.statuses`, et un effet unique tombe d'un bloc.
     *
     * La durée vide vaut « illimitée » : `createEffectsFromData` pose alors
     * l'origine FQ, et la purge de fin de combat la retire.
     *
     * @param {string} id - L'identifiant de la condition.
     *
     * @returns {object} Les données d'effet actif.
     */
    static #conditionData(id) {
        const config = (globalThis.CONFIG?.statusEffects ?? []).find(effect => effect.id === id);
        return {
            name: config?.name ?? id,
            img: config?.img ?? "icons/svg/aura.svg",
            description: StatusEffects.#description(id, config?.reference ?? null),
            statuses: [...new Set([id, ...(config?.riders ?? [])])],
            changes: [],
            duration: {value: "", units: "rounds"},
            expireOnDamage: false,
            showIcon: 1
        };
    }
}
