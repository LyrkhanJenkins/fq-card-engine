import {vi} from "vitest";

export default function setGlobal() {
    global.foundry = {
        audio: {
            AudioHelper: {
                play: vi.fn()
            }
        }
    };
    global.ui = {
        notifications: {
            error: vi.fn(), warn: vi.fn(),
        },
    };
    global.Cards = {
        deleteDocuments: vi.fn()
    };
    global.ChatMessage = {
        create: vi.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
        getSpeaker: vi.fn().mockResolvedValue(null),
    };
    global.Roll = vi.fn(function (formula) {
        this.formula = formula;
        this.total = Math.floor(Math.random() * 20) + 1;
        this.evaluate = async () => this;
        this.toMessage = vi.fn(async () => ({id: "messageId"}));
    });
    global.game = {
        canvas: {
            scene: {
                dimensions: {size: 5},
                tokens: [
                    {actorId: "userCharacterId", x: 5, y: 5},
                    {actorId: "otherId", x: 0, y: 5}
                ]
            }
        },
        scenes: [{
            active: true,
            tokens: [
                {actorId: "userCharacterId", x: 5, y: 5},
                {actorId: "otherId", x: 0, y: 5}
            ]
        }],
        users: {
            filter: vi.fn((callback) => [{
                id: "parent-id", character: {id: "parent-id"}
            }].filter(callback)),
            get: vi.fn((id) => ({id, character: {id}})),
            find: vi.fn((id) => ({id, character: {id}}))
        },
        cards: [],
        modules: new Map(),
        user: {
            character: {
                _id: "userCharacterId",
                id: "userCharacterId",
                system: {attributes: {}, abilities: {}, fq: {bonus: {range: 0}}}
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
}