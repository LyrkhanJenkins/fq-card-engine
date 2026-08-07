import {beforeEach, vi} from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fabrique passthrough pour les DataField Foundry : renvoie simplement les options
// reçues, ce qui suffit pour les tests unitaires (on ne valide pas le schéma ici).
// NB : implémentation en `function` (et non fléchée) pour rester **constructible**
// via `new SchemaField(...)` — les tests de schéma (system/) instancient les champs avec `new`.
const mockField = () => vi.fn().mockImplementation(function (opts = {}) {
    return {...opts};
});

// ════════════════════════════════════════════════════════════════════════════
// ZONE 1 — Foundry chargé une seule fois (globals stables, non réinitialisés
// entre les tests : constantes, classes document, helpers utilitaires).
// ════════════════════════════════════════════════════════════════════════════

globalThis.CONST = {
    ACTIVE_EFFECT_CHANGE_TYPES: {
        custom: 0,
        multiply: 10,
        add: 20,
        downgrade: 30,
        upgrade: 40,
        override: 50,
        subtract: 60
    }
};
globalThis.foundry = {
    applications: {
        handlebars: {
            renderTemplate : async (template, data) => `<div>${template} - ${JSON.stringify(data)}</div>`
        }
    },
    utils: {
        debounce: (fn, delay) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), delay);
            };
        },
        mergeObject: (a, b) => ({...a, ...b}),
        deepClone: (o) => JSON.parse(JSON.stringify(o)),
        randomID: () => Math.random().toString(36).slice(2),
    },
    abstract: {
        TypeDataModel: class {
            static defineSchema() {
                return {};
            }

            static getChoiceSchema() {
                return {};
            }

            static getApplyEffectsFormulaSchema() {
                return {};
            }

            static getMessageSchema() {
                return {};
            }
        }
    },
    // foundry.data.fields : chaque DataField est un passthrough (mockField) qui
    // renvoie ses options telles quelles ; suffisant pour les tests unitaires,
    // qui n'ont pas besoin de la validation réelle du schéma Foundry.
    data: {
        fields: {
            SchemaField: mockField(),
            StringField: mockField(),
            NumberField: mockField(),
            BooleanField: mockField(),
            ArrayField: mockField(),
            FilePathField: mockField(),
            ObjectField: mockField(),
            HTMLField: mockField(),
        }
    },
    audio: {
        AudioHelper: {play: vi.fn()}
    }
};

globalThis.Hooks = {
    on: vi.fn(), once: vi.fn(), call: vi.fn(), callAll: vi.fn(),
};

// CONFIG est chargé une seule fois (pas de réinitialisation en beforeEach) :
// on y ajoute un socle par défaut pour FqCardEngine.options, sans écraser FQ.
// Note : tests/window/play-card.test.js surcharge localement `global.CONFIG`
// (au chargement du fichier, donc après ce bloc) ; ce défaut ne sert donc que
// de socle pour les futures suites qui n'écrasent pas CONFIG elles-mêmes.
globalThis.CONFIG = {
    FQ: {},
    FqCardEngine: {
        options: {
            GMUsingCards: false,
            hideMessages: false,
            betterChatMessages: true,
        }
    }
};

globalThis.Actor = class {
    constructor(data) {
        this.data = data;
        this.system = data.system ?? {};
    }

    get name() {
        return this.data.name;
    }

    update(d) {
        Object.assign(this.system, d);
        return Promise.resolve(this);
    }
};

globalThis.Item = class {
    constructor(data) {
        this.data = data;
        this.system = data.system ?? {};
    }

    get name() {
        return this.data.name;
    }
};

// canvas (scène/tokens) : mock minimal, complété par game.canvas dans la zone
// beforeEach ci-dessous pour les besoins spécifiques de Geometry/Damage.
globalThis.canvas = {scene: null, tokens: {get: vi.fn()}};

// ════════════════════════════════════════════════════════════════════════════
// ZONE 2 — Globals réinitialisés avant chaque test (mocks à compteur d'appels :
// ui, Cards, Card, ChatMessage, Roll, game).
// ════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
    globalThis.ui = {
        notifications: {
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
        },
    };

    // Classe document Cards (deck/main/pile/spellbook) : opérations de base
    // consommées par deck-utils (deleteDocuments) et les futures suites (get/
    // getDocuments pour lire le contenu d'un deck ou d'un compendium de cartes).
    globalThis.Cards = {
        deleteDocuments: vi.fn(),
        getDocuments: vi.fn(() => ([])),
        get: vi.fn(),
    };

    // Classe document Card minimale : stocke data/system, suffisant pour les
    // suites qui manipulent une carte sans dépendre du modèle Foundry complet.
    globalThis.Card = class {
        constructor(data) {
            this.data = data;
            this.system = data?.system ?? {};
        }

        get name() {
            return this.data?.name;
        }
    };

    globalThis.ChatMessage = {
        create: vi.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
        getSpeaker: vi.fn().mockResolvedValue(null),
    };

    // Roll déterministe : reste un vi.fn espionnable (global.Roll.mock.calls),
    // mais son total est fixé à une constante documentée (10, choisie dans
    // l'intervalle 1..20) afin de rendre les assertions reproductibles sans
    // casser les tests qui vérifient une plage 1..20.
    const DETERMINISTIC_ROLL_TOTAL = 10;
    globalThis.Roll = vi.fn(function (formula) {
        this.formula = formula;
        this.total = DETERMINISTIC_ROLL_TOTAL;
        this.options = {}; // le vrai Roll de Foundry possède toujours un objet options
        this.dice = [{options: {}}]; // le vrai Roll expose ses DiceTerm (avec leurs propres options)
        this.evaluate = async () => this;
        this.evaluateSync = () => this; // variante synchrone (miroir d'evaluate) pour TargetingResolver
        this.toMessage = vi.fn(async () => ({id: "messageId"}));
    });

    globalThis.game = {
        canvas: {
            scene: {
                dimensions: {size: 5},
                tokens: [
                    {actorId: "userCharacterId", x: 5, y: 5},
                    {actorId: "otherId", x: 0, y: 5},
                ]
            }
        },
        scenes: [{
            active: true,
            tokens: [
                {actorId: "userCharacterId", x: 5, y: 5},
                {actorId: "otherId", x: 0, y: 5},
            ]
        }],
        users: {
            filter: vi.fn((callback) => [
                {id: "parent-id", character: {id: "parent-id"}}
            ].filter(callback)),
            get: vi.fn((id) => ({id, character: {id}})),
            find: vi.fn((fn) => [
                {id: "userCharacterId", character: {id: "userCharacterId"}}
            ].find(fn)),
        },
        cards: [],
        modules: new Map(),
        user: {
            character: {
                _id: "userCharacterId",
                id: "userCharacterId",
                update: vi.fn().mockResolvedValue(null),
                system: {
                    attributes: {},
                    abilities: {},
                    fq: {
                        bonus: {range: 0},
                        cards: {currentDrop: 0}
                    }
                }
            },
            targets: new Set([{
                id: "token1",
                actor: {id: "actor1", _id: "actor1", system: {fq: {attributes: {evasion: 3}}}},
                document: {name: "Target1", actorId: "actor1"}
            }])
        },
        actors: {
            get: vi.fn(() => ({id: "actor1", _id: "actor1", system: {fq: {attributes: {evasion: 3}}}}))
        },
        dice3d: {
            waitFor3DAnimationByMessageID: vi.fn(async () => {
            })
        },
        combat: {
            combatants: [{actorId: "userCharacterId"}],
        },
        packs: {
            get: vi.fn(() => ({
                getDocuments: vi.fn(() => ([{
                    name: "minionName",
                    system: {
                        attributes: {hp: {max: 10, value: 10}},
                        fq: {
                            attributes: {critical: 1, evasion: 1},
                            action: {max: 1, value: 1},
                            mana: {max: 1, value: 1},
                            zeal: {max: 8, value: 1}
                        }
                    }
                }]))
            }))
        },
        i18n: {
            localize: vi.fn(str => str),
            format: vi.fn((str, args) => str + JSON.stringify(args))
        },
        // game.settings : socle pour les couches système/hooks des phases 2 à 6
        // (lecture/écriture de réglages module). `get` renvoie undefined par
        // défaut ; chaque suite peut surcharger via mockReturnValue au besoin.
        settings: {
            get: vi.fn(() => undefined),
            register: vi.fn(),
        },
        // game.socket : socle pour les appels socketlib côté GM/joueurs (voir
        // src/hook/integration/socketlib.hook.js), nécessaire aux futures suites de hooks.
        socket: {
            executeAsGM: vi.fn(),
            executeForEveryone: vi.fn(),
            register: vi.fn(),
        },
    };
});
