export default function setGlobal() {
    global.foundry = {
        audio: {
            AudioHelper: {
                play: jest.fn()
            }
        }
    };
    global.ui = {
        notifications: {
            error: jest.fn(),
            warn: jest.fn(),
        },
    };
    global.Cards = {
        deleteDocuments: jest.fn()
    };
    global.ChatMessage = {
        create: jest.fn().mockResolvedValue({id: "1234", content: "Mocked message"}),
        getSpeaker: jest.fn().mockResolvedValue(null),
    };
    global.Roll = jest.fn(function (formula) {
        this.formula = formula;
        this.total = Math.floor(Math.random() * 20) + 1; // Mock a random total
        this.evaluate = async () => this;
        this.toMessage = jest.fn(async () => ({id: "messageId"}));
    });
    global.game = {

        canvas: {
            scene: {
                dimensions: {size: 5},
                tokens: [{actorId: "userCharacterId", x: 5, y: 5}, {actorId: "otherId", x: 0, y: 5}]
            }
        },
        scenes: [{active: true, tokens: [{actorId: "userCharacterId", x: 5, y: 5}, {actorId: "otherId", x: 0, y: 5}]}],
        users: {
            filter: jest.fn((callback) => [
                {
                    id: "parent-id",
                    character: {id: "parent-id"}
                }
            ].filter(callback)), // Simulate filter behavior
            get: jest.fn((id) => ({id, character: {id}})), // Simulate get behavior
            find: jest.fn((id) => ({id, character: {id}})) // Simulate get behavior
        },
        cards: [],
        modules: new Map(),
        user: {
            character: {
                _id: "userCharacterId",
                id: "userCharacterId",
                system: {attributes: {}, abilities: {}, fq: {bonus: {range: 0}}}
            },
            targets: new Set([{document: {name: "Target1", actorId: "actor1"}}])
        },
        actors: {
            get: jest.fn(() => ({system: {fq: {attributes: {evasion: 3}}}}))
        },
        dice3d: {
            waitFor3DAnimationByMessageID: jest.fn(async () => {
            })
        },
        combat: {
            combatants: [
                {actorId: "userCharacterId"},   // correspond à game.user.character.id
            ],
        },
        packs: {
            get: jest.fn(() => ({
                getDocuments: jest.fn(() => ([{
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
            localize: jest.fn(str => str),
            format: jest.fn((str, args) => str + JSON.stringify(args))
        }
    };
}