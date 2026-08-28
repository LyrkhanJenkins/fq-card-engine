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
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 * Ce module ne doit importer AUCUN autre module du moteur (il est consommé à la
 * fois par le schéma de carte et par le pipeline de jeu).
 */

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
        air: "FQCARDENGINE.StatusAir"
    };

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
                {key: "system.fq.bonus.dot", value: "1", type: "add", priority: null},
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
                changes: [{key: "system.fq.bonus.dot", value: "2", type: "add", priority: null}],
                duration: {value: "1", units: "rounds"},
                expireOnDamage: false,
                showIcon: 0
            },
            {
                name: "Acid",
                img: "icons/magic/acid/dissolve-bone-white.webp",
                changes: [{key: "system.fq.bonus.dot", value: "1", type: "add", priority: null}],
                duration: {value: "2", units: "rounds"},
                expireOnDamage: false,
                showIcon: 0
            },
            {
                name: "Acid",
                img: "icons/magic/acid/dissolve-bone-white.webp",
                changes: [{key: "system.fq.bonus.dot", value: "1", type: "add", priority: null}],
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
                {key: "system.fq.bonus.dot", value: "1", type: "add", priority: null},
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
        return typeof key === "string" && key !== "" && Object.hasOwn(StatusEffects.#REGISTRY, key);
    }

    /**
     * Renvoie les données d'effets actifs d'un statut, en COPIE profonde à
     * chaque appel : le pipeline de jeu mute les données (numérisation des
     * valeurs, résolution de durée, flags) et ne doit jamais altérer le registre.
     *
     * @param {string} [key] - La clé de statut à expanser.
     *
     * @returns {object[]|null} Les données d'effets clonées, ou null si la clé n'est pas un statut.
     */
    static expand(key) {
        if (!StatusEffects.isStatusKey(key)) {
            return null;
        }
        return JSON.parse(JSON.stringify(StatusEffects.#REGISTRY[key]));
    }
}
