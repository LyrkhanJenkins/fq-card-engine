import {beforeEach, vi} from "vitest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockField = () => vi.fn().mockImplementation((opts = {}) => ({...opts}));

// ─── Foundry core — chargé une seule fois ────────────────────────────────────

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
    data: {
        fields: {
            SchemaField: mockField(),
            StringField: mockField(),
            NumberField: mockField(),
            BooleanField: mockField(),
            ArrayField: mockField(),
            FilePathField: mockField(),
        }
    },
    audio: {
        AudioHelper: {play: vi.fn()}
    }
};

globalThis.Hooks = {
    on: vi.fn(), once: vi.fn(), call: vi.fn(), callAll: vi.fn(),
};

globalThis.CONFIG = {FQ: {}};

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

globalThis.canvas = {scene: null, tokens: {get: vi.fn()}};

// ─── Globals réinitialisés avant chaque test ─────────────────────────────────

beforeEach(() => {
    globalThis.ui = {
        notifications: {
            error: vi.fn(),
            warn: vi.fn(),
        },
    };

    globalThis.Cards = {
        deleteDocuments: vi.fn()
    };

    globalThis.ChatMessage = {
        create: vi.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
        getSpeaker: vi.fn().mockResolvedValue(null),
    };

    globalThis.Roll = vi.fn(function (formula) {
        this.formula = formula;
        this.total = Math.floor(Math.random() * 20) + 1;
        this.evaluate = async () => this;
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
        }
    };
});
