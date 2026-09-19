import {vi} from "vitest";

// ─── Fabriques de données de test réutilisables (SETUP-02) ────────────────────
//
// Chaque fabrique reconstruit ses valeurs par défaut à l'intérieur de la
// fonction (aucune référence partagée entre deux appels) et applique la
// surcharge (`overrides`) par un merge SUPERFICIEL de premier niveau
// (`{...defauts, ...overrides}`). Une clé de premier niveau fournie dans
// `overrides` remplace ENTIÈREMENT le défaut correspondant (ex : fournir
// `system` remplace tout `system` par défaut, pas seulement une sous-clé).
//
// Les défauts sont alignés sur les schémas source :
// - src/domain/system/actors/creature-fq.mjs (action/mana/zeal/attributes/bonus)
// - src/domain/system/actors/character-fq.mjs (cards.hand/pick)
// - src/domain/system/cards/card-fq-system.mjs (fq de carte + getChoiceSchema)
// - src/domain/system/cards/cards-fq-system.mjs (fq de deck)
//
// Aucune fabrique ne lit `game` ni `game.actors` : elles renvoient des objets
// simples (plain objects), consommables sans dépendre du socle Foundry mocké.

/**
 * Construit un acteur dnd5e minimal avec un `system.fq` par défaut aligné
 * sur les schémas communs (creature-fq) et personnage (character-fq).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un objet acteur simple.
 */
export function makeActor(overrides = {}) {
    const defaults = {
        system: {
            fq: {
                action: {value: 10, max: 10},
                mana: {value: 5, max: 5},
                zeal: {value: 0, max: 8, init: 0},
                attributes: {critical: 1, evasion: 1},
                bonus: {range: 0, damage: "", heal: "", dot: 0},
                cards: {hand: 1, pick: 1}
            }
        }
    };
    return {...defaults, ...overrides};
}

/**
 * Construit un choix de carte aligné sur `CardFqSystem.getChoiceSchema()`.
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un objet choix simple.
 */
export function makeChoice(overrides = {}) {
    const defaults = {
        action: "",
        mana: "",
        zeal: "",
        hp: "",
        damage: "",
        heal: "",
        minReach: "",
        maxReach: "",
        nbTargets: "",
        targetType: "Default",
        minions: [],
        applyEffectsFormulas: [],
        messages: [],
        customEvals: []
    };
    return {...defaults, ...overrides};
}

/**
 * Construit un document carte avec un `system.fq` par défaut aligné sur
 * `CardFqSystem.defineSchema()`, plus les champs de surface observés dans
 * `tests/window/play-card.test.js` (id, _id, name, back, origin, flags).
 *
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un objet carte simple.
 */
export function makeCard(overrides = {}) {
    const defaults = {
        id: "card-1",
        _id: "card-1",
        name: "Card",
        back: {img: ""},
        origin: {name: ""},
        flags: {},
        system: {
            fq: {
                maxSameCard: 1,
                class: "neutral",
                level: 1,
                isInnate: false,
                choices: [makeChoice()]
            }
        }
    };
    return {...defaults, ...overrides};
}

/**
 * Construit un document Cards (deck/main/pile/spellbook) avec un `system.fq`
 * par défaut aligné sur `CardsFqSystem.defineSchema()`. Les méthodes
 * `createEmbeddedDocuments` et `pass` sont des `vi.fn()` mockées, permettant
 * aux suites consommatrices d'asserter les appels de deck.
 *
 * @param {string} type Le type FQ du deck (`hand`/`deck`/`pile`/`spellbook`).
 * @param {object} [overrides] Surcharge de premier niveau (merge superficiel).
 * @returns {object} Un objet deck simple.
 */
export function makeDeck(type, overrides = {}) {
    const defaults = {
        system: {
            fq: {
                type,
                owner: "",
                classLevels: {}
            }
        },
        cards: [],
        ownership: {},
        createEmbeddedDocuments: vi.fn(),
        pass: vi.fn()
    };
    return {...defaults, ...overrides};
}
