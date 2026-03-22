const mockField = (defaults = {}) => vi.fn().mockImplementation((opts = {}) => ({...defaults, ...opts}));

// Mock des globals FoundryVTT absents dans Node/jsdom
globalThis.game = {
    settings: {get: vi.fn(), set: vi.fn(), register: vi.fn()},
    actors: {get: vi.fn()},
    items: {get: vi.fn()},
    user: {id: "test-user", isGM: false},
    i18n: {localize: vi.fn((k) => k), format: vi.fn((k) => k)},
};

globalThis.Hooks = {
    on: vi.fn(), once: vi.fn(), call: vi.fn(), callAll: vi.fn(),
};

globalThis.CONFIG = {FQ: {}};

globalThis.foundry = {
    utils: {
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

// Classe Actor de base mockée
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

// Classe Item de base mockée
globalThis.Item = class {
    constructor(data) {
        this.data = data;
        this.system = data.system ?? {};
    }

    get name() {
        return this.data.name;
    }
};

globalThis.ChatMessage = {create: vi.fn().mockResolvedValue({})};
globalThis.canvas = {scene: null, tokens: {get: vi.fn()}};

// Reset entre chaque test
afterEach(() => {
    vi.clearAllMocks();
});