import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import FQUtils from "../../src/domain/utils/fq-utils.js";
import FxUtils from "../../src/domain/utils/fx-utils.js";
import ConsumptionUtils from "../../src/domain/utils/consumption-utils.js";
import DamageUtils from "../../src/domain/utils/damage-utils.js";
import CanvasUtils from "../../src/domain/utils/canvas-utils.js";
import {socket} from "../../src/hook/socket-lib.js";
import {makeCard, makeChoice} from "../factories.js";

vi.mock("../../src/hook/socket-lib.js", () => ({
    default: {},
    socket: {
        executeAsGM: vi.fn()
    }
}));

vi.mock("../../src/domain/utils/consumption-utils.js", () => ({
    default: {
        consumeResources: vi.fn(),
        checkIfCanCardCanReachTargets: vi.fn(),
        createUserWarningMessage: vi.fn(),
        checkResources: vi.fn()
    }
}));

vi.mock("../../src/domain/utils/damage-utils.js", () => ({
    default: {
        buildDamageDiceLauncher: vi.fn(async () => ([])),
        buildHealDiceLauncher: vi.fn(async () => ([])),
        handleSoundEffect: vi.fn(),
        addCriticalEvasionToDamage: vi.fn(),
        applyDiceAppearance: vi.fn(),
        displayResult: vi.fn()
    }
}));

vi.mock("../../src/domain/utils/fx-utils.js", () => ({
    default: {
        handleSpecialEffect: vi.fn(),
        importMacroFromCompendium: vi.fn()
    }
}));

vi.mock("../../src/domain/utils/canvas-utils.js", () => ({
    default: {
        locationIsOccupied: vi.fn(),
        getMinDistanceBetweenTwoToken: vi.fn()
    }
}));
describe("FQUtils", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should roll a dice and return result", async () => {
        const result = await FQUtils.rollResultAsync("1d20");
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it("should generate a random ID", () => {
        const id = FQUtils.generateRandomId(10);
        expect(id).toHaveLength(10);
    });

    it("should prepare data from card", async () => {
        const cardContent = {minReach: "1", maxReach: "1+1d6", nbTargets: "1d3"};
        await FQUtils.prepareDataFromCard(cardContent);

        expect(cardContent.minReach).toBeGreaterThanOrEqual(1);
        expect(cardContent.maxReach).toBeGreaterThanOrEqual(1);
        expect(cardContent.nbTargets).toBeGreaterThanOrEqual(1);
    });

    it("should replace card content abilities bonus", () => {
        const cardContent = {
            key1: "some text with @str modifier",
            key2: {
                nestedKey: "@dex modifier"
            }
        };

        game.user.character.system.abilities = {
            str: {mod: 2},
            dex: {mod: 3},
            con: {mod: 1},
            int: {mod: 4},
            wis: {mod: 1},
            cha: {mod: 3}
        };

        FQUtils.replaceCardContentAbilitiesBonus(cardContent);

        expect(cardContent.key1).toBe("some text with 2 modifier");
        expect(cardContent.key2.nestedKey).toBe("3 modifier");
    });

    it("should handle sound effect in applyCardEffect", async () => {
        const cardContent = {damage: "1d6", heal: "3+1d4", sound: "sound.mp3"};
        await FQUtils.applyCardEffect(cardContent, {}, {});
        expect(FxUtils.handleSpecialEffect).toHaveBeenCalledWith(cardContent, expect.any(Array), {
            "actorId": "userCharacterId",
            "x": 5,
            "y": 5
        }, null);
    });

    it("applyCardEffect - cas nominal : applique les effets quand cardContent est présent", async () => {
        const cardContent = makeChoice({damage: "1d6", heal: "3"});
        const card = makeCard();

        await FQUtils.applyCardEffect(cardContent, card, {});

        expect(ConsumptionUtils.consumeResources).toHaveBeenCalled();
        expect(DamageUtils.buildDamageDiceLauncher).toHaveBeenCalled();
        expect(DamageUtils.buildHealDiceLauncher).toHaveBeenCalled();
        expect(DamageUtils.displayResult).toHaveBeenCalled();
        expect(socket.executeAsGM).toHaveBeenCalledWith("logCardPlayed", expect.any(Array), cardContent);
    });

    it("applyCardEffect - branche cardContent null : publie InfoMsgNoAddedEffect", async () => {
        await FQUtils.applyCardEffect(null, makeCard(), {});

        expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining("FQCARDENGINE.InfoMsgNoAddedEffect")
        }));
    });

    it("appelle numerizeEffectObjValue pour chaque effet et recopie label → name si manquant", async () => {
        const input = {
            data: [
                {label: "Effet A", changes: []},
                {label: "Ignoré", name: "Déjà nommé", changes: []},
            ],
        };

        const result = await FQUtils.createEffectsFromData(input);

        expect(result[0].name).toBe("Effet A");
        expect(result[1].name).toBe("Déjà nommé");
    });

    it("mappe duration (startTime/rounds/turns) et définit origin", async () => {
        const input = {
            data: [
                {
                    label: "Durée",
                    duration: {startTime: 10, rounds: 2, turns: 1},
                    changes: [],
                },
            ],
        };

        const [res] = await FQUtils.createEffectsFromData(input);

        expect(res.startTime).toBe(10);
        expect(res.rounds).toBe(2);
        expect(res.turns).toBe(1);
        expect(res.origin).toBe("FQ Effect");
    });

    it("n'évalue pas quand key ∈ [\"system.fq.bonus.damage\",\"system.fq.bonus.heal\"]", async () => {
        const input = {
            data: [
                {
                    label: "NoEval",
                    changes: [
                        {key: "system.fq.bonus.damage", value: "1+2"},
                        {key: "system.fq.bonus.heal", value: "2+3"},
                    ],
                },
            ],
        };

        const [res] = await FQUtils.createEffectsFromData(input);

        expect(res.changes[0].value).toBe("1+2");
        expect(res.changes[1].value).toBe("2+3");

        const calls = global.Roll.mock.calls.map((c) => c[0]);
        expect(calls).not.toContain("1+2");
        expect(calls).not.toContain("2+3");
    });

    describe("checkIfCanUseCard — eval custom", () => {
        // ISOLE la branche eval : sans ceci, `game.combat` non-null (défaut de
        // tests/setup.js) fait passer la ligne 469 de fq-utils.js, qui appelle
        // ConsumptionUtils.validateUseSpellInTurn — absent du mock de
        // consumption-utils.js — ce qui lèverait une erreur non désirée.
        beforeEach(() => {
            game.combat = null;
            ConsumptionUtils.checkResources.mockReturnValue(true);
        });

        it("script vrai : renvoie true et ne publie aucun message", () => {
            const cardContent = makeChoice({customEvals: [{script: "1+1===2"}]});
            const card = makeCard();

            const result = FQUtils.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(true);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("script faux : renvoie false et publie WarningMsgCardConditionNotMet", () => {
            const cardContent = makeChoice({customEvals: [{script: "1===2"}]});
            const card = makeCard();

            const result = FQUtils.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("#E36934")
            }));
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgCardConditionNotMet")
            }));
        });

        it("script qui lève : logue console.error et publie WarningMsgErrorReadingCardSpecialCondition", () => {
            const cardContent = makeChoice({customEvals: [{script: "nExistePas("}]});
            const card = makeCard();
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });

            // NOTE : la branche catch ne met PAS iscustomEvals à false — on ne
            // se prononce donc pas sur la valeur de retour ici, uniquement sur
            // le logging et le message publié.
            FQUtils.checkIfCanUseCard(cardContent, card);

            expect(spy).toHaveBeenCalled();
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("#C04200")
            }));
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition")
            }));

            spy.mockRestore();
        });

        it("décode les entités HTML du script sur place", () => {
            const cardContent = makeChoice({customEvals: [{script: "1&gt;0"}]});
            const card = makeCard();

            FQUtils.checkIfCanUseCard(cardContent, card);

            expect(cardContent.customEvals[0].script).toBe("1>0");
        });
    });

    describe("replaceCardContentXAndYValue", () => {
        it("substitution nominale : remplace XXX/YYY et renvoie true", async () => {
            const cardContent = makeChoice({damage: "XXX+YYY", xmax: "10", ymax: "10"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, true, 3, 2);

            expect(ok).toBe(true);
            expect(cardContent.damage).toBe("3+2");
        });

        it("hors bornes : rejette (false) une valeur XXX négative et publie WarningMsgXValueSuperiorXMax", async () => {
            const cardContent = makeChoice({damage: "XXX+YYY", xmax: "10", ymax: "10"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, true, -1, 2);

            expect(ok).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("#E36934")
            }));
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgXValueSuperiorXMax")
            }));
        });
    });

    // ─── Tâche 1 (tracer) : création de sbires de bout en bout ─────────────────
    //
    // Globals locaux NON fournis par tests/setup.js (FqCardEngineModule,
    // game.folders, game.userId, globalThis.Folder) : posés en beforeEach et
    // nettoyés en afterEach, patron T-04-05 (tests/hook/socket-lib.test.js).
    describe("FQUtils — création de sbires", () => {
        beforeEach(() => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            game.userId = "userCharacterId";
            game.folders = {find: vi.fn(() => undefined)};
            globalThis.Folder = {create: vi.fn()};
        });

        afterEach(() => {
            globalThis.FqCardEngineModule = undefined;
            globalThis.Folder = undefined;
            game.folders = undefined;
            game.userId = undefined;
        });

        it("getTempActorFolder renvoie le dossier Temporaire quand présent", () => {
            const tempFolder = {id: "tmp", type: "Actor", name: "Temporaire"};
            game.folders.find = vi.fn((fn) => [tempFolder].find(fn));

            expect(FQUtils.getTempActorFolder()).toBe(tempFolder);
        });

        it("getTempActorFolder renvoie undefined si absent", () => {
            game.folders.find = vi.fn((fn) => [].find(fn));

            expect(FQUtils.getTempActorFolder()).toBeUndefined();
        });

        it("createTempFold crée le dossier Temporaire de type Actor", async () => {
            await FQUtils.createTempFold();

            expect(Folder.create).toHaveBeenCalledWith({name: "Temporaire", type: "Actor"});
        });

        it("createActor SANS dossier Temporaire : demande sa création au MJ puis délègue à createActorData", async () => {
            game.folders.find = vi.fn(() => undefined);
            const spy = vi.spyOn(FQUtils, "createActorData").mockResolvedValue(undefined);

            await FQUtils.createActor({name: "minionName"}, "left");

            expect(socket.executeAsGM).toHaveBeenCalledWith("createTempFold");
            expect(spy).toHaveBeenCalledWith({name: "minionName"}, "left");

            spy.mockRestore();
        });

        it("createActor AVEC dossier Temporaire déjà présent : ne demande pas sa création au MJ", async () => {
            game.folders.find = vi.fn((fn) => [{id: "tmp", type: "Actor", name: "Temporaire"}].find(fn));
            const spy = vi.spyOn(FQUtils, "createActorData").mockResolvedValue(undefined);

            await FQUtils.createActor({name: "minionName"}, "left");

            expect(socket.executeAsGM).not.toHaveBeenCalledWith("createTempFold");
            expect(spy).toHaveBeenCalledWith({name: "minionName"}, "left");

            spy.mockRestore();
        });

        describe("createActorData", () => {
            beforeEach(() => {
                vi.spyOn(FQUtils, "getTempActorFolder").mockReturnValue({id: "tmp"});
                // Doc de compendium complet (bonus/movement inclus) pour couvrir
                // toutes les branches de surcharge de minion.data sans planter
                // sur les clés absentes du doc minimal de tests/setup.js.
                game.packs.get.mockReturnValue({
                    getDocuments: vi.fn(async () => ([{
                        name: "minionName",
                        ownership: {},
                        system: {
                            attributes: {hp: {max: 10, value: 10}, movement: {walk: 0}},
                            fq: {
                                attributes: {critical: 1, evasion: 1},
                                action: {max: 1, value: 1},
                                mana: {max: 1, value: 1},
                                zeal: {max: 8, value: 1},
                                bonus: {damage: 0, heal: 0}
                            }
                        }
                    }]))
                });
            });

            afterEach(() => {
                FQUtils.getTempActorFolder.mockRestore();
            });

            it("construit actorData depuis le compendium, applique toutes les surcharges de minion.data et délègue au MJ via socket", async () => {
                const minion = {
                    name: "minionName",
                    data: {
                        hp: "1d6", critical: "1", evasion: "1", action: "1", mana: "1",
                        zeal: "1", damageBonus: "1", healBonus: "1", movement: "1"
                    }
                };

                await FQUtils.createActorData(minion, "left");

                expect(game.packs.get).toHaveBeenCalledWith("fq-card-engine.minions-fq8");
                expect(socket.executeAsGM).toHaveBeenCalledWith(
                    "createActorFromData",
                    expect.objectContaining({
                        folder: "tmp",
                        ownership: {userCharacterId: 3},
                        system: expect.objectContaining({
                            attributes: expect.objectContaining({
                                hp: {max: 10, value: 10},
                                movement: {walk: 10}
                            }),
                            fq: expect.objectContaining({
                                attributes: {critical: 10, evasion: 10},
                                action: {max: 10, value: 10},
                                mana: {max: 10, value: 10},
                                zeal: {max: 8, value: 10}, // zeal.max reste DEFAULT_MAX_ZEAL, pas la valeur roulée
                                bonus: {damage: 10, heal: 10}
                            })
                        })
                    }),
                    "userCharacterId",
                    "left"
                );
            });

            it("sans minion.data : n'applique aucune surcharge mais crée quand même l'acteur (ownership + socket)", async () => {
                await FQUtils.createActorData({name: "minionName"}, "up");

                expect(socket.executeAsGM).toHaveBeenCalledWith(
                    "createActorFromData",
                    expect.objectContaining({
                        folder: "tmp",
                        ownership: {userCharacterId: 3},
                        system: expect.objectContaining({
                            attributes: expect.objectContaining({hp: {max: 10, value: 10}})
                        })
                    }),
                    "userCharacterId",
                    "up"
                );
            });
        });
    });

    // ─── Tâche 2 : branches profondes applyCardEffect / playApplyEffectsFormulas
    // / prepareDataFromCard / checkIfCanUseCard ─────────────────────────────────

    describe("applyCardEffect — branches draw/minions/executeEval/applyEffectsFormulas/HP", () => {
        it("draw : délègue à card.parent.draw(card.source, draw, {chatNotification:false, how:2})", async () => {
            const draw = vi.fn();
            const card = makeCard({parent: {draw}, source: "sourceRef"});
            const cardContent = makeChoice({draw: 2});

            await FQUtils.applyCardEffect(cardContent, card, {});

            expect(draw).toHaveBeenCalledWith("sourceRef", 2, {chatNotification: false, how: 2});
        });

        it("minions : appelle createActor par emplacement sélectionné et repasse chaque flag à false", async () => {
            const spy = vi.spyOn(FQUtils, "createActor").mockResolvedValue(undefined);
            const minion = {name: "goblin"};
            const cardContent = makeChoice({minions: [minion]});
            const fd = {minionLeft: true, minionUp: true, minionRight: true, minionDown: true};

            await FQUtils.applyCardEffect(cardContent, makeCard(), fd);

            expect(spy).toHaveBeenCalledWith(minion, "left");
            expect(spy).toHaveBeenCalledWith(minion, "up");
            expect(spy).toHaveBeenCalledWith(minion, "right");
            expect(spy).toHaveBeenCalledWith(minion, "down");
            expect(fd.minionLeft).toBe(false);
            expect(fd.minionUp).toBe(false);
            expect(fd.minionRight).toBe(false);
            expect(fd.minionDown).toBe(false);

            spy.mockRestore();
        });

        it("executeEval : décode les entités HTML (&gt;/&lt;/&amp;) puis exécute le script", async () => {
            globalThis.__evalProbe = 0;
            const cardContent = makeChoice({executeEval: "globalThis.__evalProbe = (1 &gt; 0 &amp;&amp; 2 &lt; 3) ? 42 : 0;"});

            await FQUtils.applyCardEffect(cardContent, makeCard(), {});

            expect(cardContent.executeEval).toBe("globalThis.__evalProbe = (1 > 0 && 2 < 3) ? 42 : 0;");
            expect(globalThis.__evalProbe).toBe(42);

            delete globalThis.__evalProbe;
        });

        it("applyEffectsFormulas non vide : appelle playApplyEffectsFormulas et concatène les messages", async () => {
            const spy = vi.spyOn(FQUtils, "playApplyEffectsFormulas").mockResolvedValue(["Message effet déclenché"]);
            const cardContent = makeChoice({applyEffectsFormulas: [{formula: "1d20", title: "T", effects: []}]});

            await FQUtils.applyCardEffect(cardContent, makeCard(), {});

            expect(spy).toHaveBeenCalledWith(cardContent.applyEffectsFormulas[0], cardContent);
            expect(DamageUtils.displayResult).toHaveBeenCalledWith(
                game.user.character, expect.any(Array), expect.arrayContaining(["Message effet déclenché"])
            );

            spy.mockRestore();
        });

        it("resultArray non vide : applique les PV via socket.executeAsGM('applyActorHpModification', ...) par résultat", async () => {
            DamageUtils.buildDamageDiceLauncher.mockResolvedValueOnce([
                {targetTokenId: "token1", value: 5, type: "damageFQ"},
                {targetTokenId: "token2", value: 3, type: "healFQ"}
            ]);
            const cardContent = makeChoice({damage: "1d6"});

            await FQUtils.applyCardEffect(cardContent, makeCard(), {});

            expect(socket.executeAsGM).toHaveBeenCalledWith("applyActorHpModification", "token1", 5, "damageFQ");
            expect(socket.executeAsGM).toHaveBeenCalledWith("applyActorHpModification", "token2", 3, "healFQ");
        });
    });

    describe("playApplyEffectsFormulas", () => {
        // ActiveEffect n'est pas fourni par tests/setup.js : posé localement et
        // nettoyé en afterEach (patron T-04-05).
        beforeEach(() => {
            globalThis.ActiveEffect = {implementation: {create: vi.fn()}};
        });

        afterEach(() => {
            globalThis.ActiveEffect = undefined;
        });

        it("match (self) : crée l'effet via ActiveEffect.implementation.create et renvoie les messages traduits", async () => {
            const applyEffectsFormulas = {
                formula: "1d20",
                title: "Effet spécial",
                effects: [{
                    result: "10", self: true,
                    messages: [{key: "FQCARDENGINE.SomeMsg"}],
                    data: [{label: "Effet A", changes: []}]
                }]
            };

            const messages = await FQUtils.playApplyEffectsFormulas(applyEffectsFormulas, makeChoice());

            expect(ActiveEffect.implementation.create).toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalledWith("addEffectForTarget", expect.anything(), expect.anything());
            expect(messages).toEqual(expect.arrayContaining([expect.stringContaining("FQCARDENGINE.SomeMsg")]));
        });

        it("match, cible (self=false + minReach défini) : crée l'effet pour chaque cible via socket addEffectForTarget", async () => {
            const applyEffectsFormulas = {
                formula: "1d20",
                title: "T",
                effects: [{
                    result: "0", self: false,
                    messages: [],
                    data: [{label: "Effet Cible", changes: []}]
                }]
            };
            const cardContent = makeChoice({minReach: 1});

            await FQUtils.playApplyEffectsFormulas(applyEffectsFormulas, cardContent);

            expect(socket.executeAsGM).toHaveBeenCalledWith("addEffectForTarget", expect.any(Object), "token1");
            expect(ActiveEffect.implementation.create).not.toHaveBeenCalled();
        });

        it("no match (aucun effet ne correspond au total du jet) : ne crée aucun effet et renvoie []", async () => {
            const applyEffectsFormulas = {formula: "1d20", title: "T", effects: []};

            const messages = await FQUtils.playApplyEffectsFormulas(applyEffectsFormulas, makeChoice());

            expect(ActiveEffect.implementation.create).not.toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalledWith("addEffectForTarget", expect.anything(), expect.anything());
            expect(messages).toEqual([]);
        });
    });

    describe("prepareDataFromCard — coûts et bonus restants", () => {
        it("résout hp/action/mana/zeal/draw/drop/bonusCrit/bonusEva par jets de dés", async () => {
            const cardContent = {
                hp: "1d6", action: "1", mana: "1", zeal: "1",
                draw: "1", drop: "1", bonusCrit: "1", bonusEva: "1"
            };

            await FQUtils.prepareDataFromCard(cardContent);

            expect(cardContent.hp).toBe(10);
            expect(cardContent.action).toBe(10);
            expect(cardContent.mana).toBe(10);
            expect(cardContent.zeal).toBe(10);
            expect(cardContent.draw).toBe(10);
            expect(cardContent.drop).toBe(10);
            expect(cardContent.bonusCrit).toBe(10);
            expect(cardContent.bonusEva).toBe(10);
        });

        it("maxReach ajoute le bonus de portée de l'acteur (FqConstants.actorFQ.bonus.range)", async () => {
            // minReach doit être présent : la branche évalue minReach ET maxReach
            // dès que l'un des deux est truthy (fq-utils.js:356-358).
            game.user.character.system.fq.bonus.range = 3;
            const cardContent = {minReach: "1", maxReach: "1"};

            await FQUtils.prepareDataFromCard(cardContent);

            expect(cardContent.minReach).toBe(10);
            expect(cardContent.maxReach).toBe(13); // 10 (roll déterministe) + 3 (bonus.range)
        });
    });

    describe("checkIfCanUseCard — branches combat et validations", () => {
        beforeEach(() => {
            game.combat = null;
            ConsumptionUtils.checkResources.mockReturnValue(true);
        });

        it("passif déjà rejoué ce round : renvoie false et publie WarningMsgPassiveSpellAlreadyUsed", () => {
            game.combat = {round: 3};
            const cardContent = makeChoice({replayable: "passif", hasBeenPlayed: true, passivePlayedRound: "3"});

            const result = FQUtils.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgPassiveSpellAlreadyUsed")
            }));
        });

        it("carte réactive jouée hors du tour de l'acteur : renvoie false et publie WarningMsgPlayReactiveCard", () => {
            game.combat = {round: 1, combatant: {actor: {id: "userCharacterId"}}};
            const cardContent = makeChoice({reactive: true});

            const result = FQUtils.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgPlayReactiveCard")
            }));
        });

        it("portée insuffisante : délègue à checkIfCanCardCanReachTargets et renvoie false s'il échoue", () => {
            ConsumptionUtils.checkIfCanCardCanReachTargets.mockReturnValue(false);
            const cardContent = makeChoice({minReach: 1, maxReach: 3, nbTargets: 1, targetType: "Default"});

            const result = FQUtils.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
            expect(ConsumptionUtils.checkIfCanCardCanReachTargets).toHaveBeenCalledWith(
                game.user.character, 1, 1, 3, "Default"
            );
        });

        it("pioche insuffisante : publie WarningMsgNotEnoughDraw et renvoie false", () => {
            const card = makeCard({source: {cards: {size: 1}, drawnCards: []}});
            const cardContent = makeChoice({draw: 2});

            const result = FQUtils.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(false);
            expect(ConsumptionUtils.createUserWarningMessage).toHaveBeenCalledWith(
                "FQCARDENGINE.WarningMsgNotEnoughDraw", game.user.character
            );
        });

        it("cas nominal : aucune condition bloquante, renvoie le résultat de checkResources", () => {
            const cardContent = makeChoice();

            const result = FQUtils.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(true);
            expect(ConsumptionUtils.checkResources).toHaveBeenCalledWith(cardContent, game.user.character);
        });
    });

    // ─── Tâche 3 : helpers restants (X/Y, résolution d'attributs, purs) ────────

    describe("rollResultAsync — display", () => {
        it("display=true, isDeterministic (défaut) : publie via roll.toMessage, n'appelle pas l'animation 3D", async () => {
            const result = await FQUtils.rollResultAsync("1d20", true);

            expect(result).toBe(10);
            expect(game.dice3d.waitFor3DAnimationByMessageID).not.toHaveBeenCalled();
        });

        it("display=true, isDeterministic=false : joue l'animation 3D via game.dice3d", async () => {
            Roll.mockImplementationOnce(function (formula) {
                this.formula = formula;
                this.total = 10;
                this.isDeterministic = false;
                this.evaluate = async () => this;
                this.toMessage = vi.fn(async () => ({id: "msg-3d"}));
            });

            const result = await FQUtils.rollResultAsync("1d20", true);

            expect(result).toBe(10);
            expect(game.dice3d.waitFor3DAnimationByMessageID).toHaveBeenCalledWith("msg-3d");
        });
    });

    describe("replaceCardContentXAndYValue — bornes restantes", () => {
        it("ymax dépassé : rejette (false) et publie WarningMsgYValueSuperiorYMax", async () => {
            // Quirk caractérisé (fq-utils.js:598-599) : xmax/ymax sont d'abord
            // recalculés via rollResultAsync — avec le Roll déterministe (total
            // toujours 10), leur valeur numérique finale est donc TOUJOURS 10,
            // quelle que soit la chaîne "xmax"/"ymax" d'origine. XXX doit donc
            // rester <= 10 et YYY doit dépasser 10 pour déclencher cette branche.
            const cardContent = makeChoice({damage: "XXX+YYY", xmax: "10", ymax: "5"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, true, 3, 11);

            expect(ok).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgYValueSuperiorYMax")
            }));
        });

        it("xmin non respecté : rejette (false) et publie WarningMsgXValueInferiorXMin", async () => {
            const cardContent = makeChoice({damage: "XXX+YYY", xmin: "5"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, true, 2, 2);

            expect(ok).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgXValueInferiorXMin")
            }));
        });

        it("ymin non respecté : rejette (false) quand YYY < ymin et publie WarningMsgYValueInferiorYMin", async () => {
            const cardContent = makeChoice({damage: "XXX+YYY", ymin: "5"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, true, 100, 2);

            expect(ok).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgYValueInferiorYMin")
            }));
        });

        it("sans variables saisies (hasVariables=false) mais xvalue/yvalue définis : calcule via getXYValue", async () => {
            const spy = vi.spyOn(FQUtils, "getXYValue").mockResolvedValueOnce(7).mockResolvedValueOnce(2);
            const cardContent = makeChoice({damage: "XXX+YYY", xvalue: "nbTargets", yvalue: "nbTargets"});

            const ok = await FQUtils.replaceCardContentXAndYValue(cardContent, false, undefined, undefined);

            expect(ok).toBe(true);
            expect(spy).toHaveBeenCalledWith("nbTargets", expect.any(Array));
            expect(cardContent.damage).toBe("7+2");

            spy.mockRestore();
        });
    });

    describe("getXYValue", () => {
        it("nbTargets : renvoie la longueur des cibles (0 si vide)", async () => {
            expect(await FQUtils.getXYValue("nbTargets", [])).toBe(0);
            expect(await FQUtils.getXYValue("nbTargets", [{}, {}])).toBe(2);
        });

        it("reach avec une seule cible : délègue à CanvasUtils.getMinDistanceBetweenTwoToken", async () => {
            CanvasUtils.getMinDistanceBetweenTwoToken.mockReturnValue(4);
            const target = {document: {x: 0, y: 5, width: 1, height: 1}};

            const result = await FQUtils.getXYValue("reach", [target]);

            expect(result).toBe(4);
            expect(CanvasUtils.getMinDistanceBetweenTwoToken).toHaveBeenCalledWith(
                5, 5, 0, 5, undefined, 1, undefined, 1
            );
        });

        it("SCRIPT: : évalue le script après le préfixe", async () => {
            const result = await FQUtils.getXYValue("SCRIPT:2+2", []);
            expect(result).toBe(4);
        });

        it("SCRIPT: qui lève une exception (ex. game.combat null) : renvoie 0 sans planter", async () => {
            const result = await FQUtils.getXYValue("SCRIPT:game.combat.flags.fq.logs", []);
            expect(result).toBe(0);
        });

        it("SCRIPT: dont le résultat n'est pas un nombre fini (undefined/NaN) : renvoie 0", async () => {
            expect(await FQUtils.getXYValue("SCRIPT:undefined", [])).toBe(0);
            expect(await FQUtils.getXYValue("SCRIPT:-2*undefined", [])).toBe(0);
        });

        it("défaut : délègue à getNestedAttribute sur le système du personnage", async () => {
            game.user.character.system.attributes.hp = {value: "5"};

            const result = await FQUtils.getXYValue("attributes.hp.value", []);

            expect(result).toBe(10); // rollResultAsync("5") -> total déterministe
        });
    });

    describe("getNestedAttribute", () => {
        it("clé vide : renvoie 0", async () => {
            expect(await FQUtils.getNestedAttribute({foo: "bar"}, "")).toBe(0);
        });

        it("chemin présent : renvoie le total du jet (roll déterministe)", async () => {
            expect(await FQUtils.getNestedAttribute({a: {b: "3"}}, "a.b")).toBe(10);
        });

        it("chemin absent : renvoie 0", async () => {
            expect(await FQUtils.getNestedAttribute({a: {}}, "a.c")).toBe(0);
        });
    });

    describe("recalculatedWithWYValue", () => {
        it("remplace XXX/YYY dans les chaînes imbriquées, laisse les non-chaînes intactes", () => {
            const cardContent = {
                top: "XXX dégâts, YYY portée",
                nested: {inner: "encore XXX"},
                untouched: 42,
                flag: true
            };

            FQUtils.recalculatedWithWYValue(cardContent, 5, 3);

            expect(cardContent.top).toBe("5 dégâts, 3 portée");
            expect(cardContent.nested.inner).toBe("encore 5");
            expect(cardContent.untouched).toBe(42);
            expect(cardContent.flag).toBe(true);
        });
    });

    describe("stringifyObjValue", () => {
        it("convertit récursivement les valeurs primitives en chaînes", () => {
            const result = FQUtils.stringifyObjValue({a: 1, b: true, nested: {c: 2}});

            expect(result.a).toBe("1");
            expect(result.b).toBe("true");
            expect(result.nested.c).toBe("2");
        });
    });

    describe("numerizeEffectObjValue — comportement RÉEL (itère Object.values(content) comme des clés)", () => {
        it("clés non-numériques : la boucle `for...in Object.values(content)` itère des index absents de content -> rien n'est modifié", async () => {
            // Quirk caractérisé (fq-utils.js:250) : `Object.values(content)` = un
            // tableau ; `for (const key in ...)` itère ses index "0","1","2"...
            // `content.hasOwnProperty("0")` est FALSE pour un objet à clés
            // nommées -> la boucle ne fait rien, quelles que soient les valeurs.
            const content = {five: 5, plus: "+2", roll: "1d6"};

            const result = await FQUtils.numerizeEffectObjValue(content);

            expect(result).toEqual({five: 5, plus: "+2", roll: "1d6"});
        });

        it("clés numériques alignées (0..n-1) : nombre -> Number, chaîne '+...' non numérique inchangée, autre chaîne -> rollResultAsync", async () => {
            // "+2" est numériquement valide (isNaN("+2")===false) : il est donc
            // converti en Number, PAS préservé par la branche "+..." — seule une
            // chaîne "+..." non numérique (ex: "+1d6") atteint cette branche.
            const content = {0: "5", 1: "+1d6", 2: "1d6"};

            const result = await FQUtils.numerizeEffectObjValue(content);

            expect(result[0]).toBe(5);
            expect(result[1]).toBe("+1d6");
            expect(result[2]).toBe(10); // rollResultAsync déterministe
        });

        it("valeur imbriquée sous une clé alignée : récursion", async () => {
            const content = {0: {0: "5"}};

            const result = await FQUtils.numerizeEffectObjValue(content);

            expect(result[0][0]).toBe(5);
        });
    });

    describe("hasAbilitiesBonus / replaceAbilitiesBonus", () => {
        beforeEach(() => {
            game.user.character.system.abilities = {
                str: {mod: 2}, dex: {mod: 0}, con: {mod: -1},
                int: {mod: 0}, wis: {mod: 0}, cha: {mod: 0}
            };
        });

        it("replaceAbilitiesBonus substitue chaque référence @xxx par le modificateur correspondant", () => {
            const result = FQUtils.replaceAbilitiesBonus("@str/@dex/@con/@int/@wis/@cha");
            expect(result).toBe("2/0/-1/0/0/0");
        });

        it("hasAbilitiesBonus : true si au moins une référence a un modificateur strictement positif", () => {
            expect(FQUtils.hasAbilitiesBonus("bonus @str")).toBe(true);
        });

        it("hasAbilitiesBonus : false si aucune référence n'a de modificateur positif", () => {
            expect(FQUtils.hasAbilitiesBonus("bonus @dex @con")).toBe(false);
        });
    });

    describe("getNbValideMinionLocationSelected / getNbMinionLocationSelected", () => {
        it("getNbMinionLocationSelected compte tous les emplacements sélectionnés (occupés ou non)", () => {
            const fd = {minionUp: true, minionDown: true, minionLeft: false, minionRight: true};
            expect(FQUtils.getNbMinionLocationSelected(fd)).toBe(3);
        });

        it("getNbValideMinionLocationSelected exclut les emplacements occupés (CanvasUtils.locationIsOccupied)", () => {
            CanvasUtils.locationIsOccupied.mockImplementation(loc => loc === "up");
            const fd = {minionUp: true, minionDown: true, minionLeft: true, minionRight: false};

            const result = FQUtils.getNbValideMinionLocationSelected(fd);

            expect(result).toBe(2); // up exclu (occupé) ; down + left valides
            expect(CanvasUtils.locationIsOccupied).toHaveBeenCalledWith("up");
        });
    });

    describe("deepCopy", () => {
        it("primitive/null renvoyés tels quels", () => {
            expect(FQUtils.deepCopy(null)).toBeNull();
            expect(FQUtils.deepCopy(42)).toBe(42);
            expect(FQUtils.deepCopy("abc")).toBe("abc");
        });

        it("copie un tableau en profondeur : mutation de la copie n'affecte pas l'original", () => {
            const original = [{a: 1}, {a: 2}];
            const copy = FQUtils.deepCopy(original);

            copy[0].a = 999;

            expect(original[0].a).toBe(1);
            expect(copy).toEqual([{a: 999}, {a: 2}]);
        });

        it("copie un objet en profondeur : mutation de la copie n'affecte pas l'original", () => {
            const original = {nested: {value: 1}};
            const copy = FQUtils.deepCopy(original);

            copy.nested.value = 999;

            expect(original.nested.value).toBe(1);
        });
    });

    describe("translateMessages", () => {
        it("liste vide/undefined : renvoie []", () => {
            expect(FQUtils.translateMessages(undefined)).toEqual([]);
            expect(FQUtils.translateMessages([])).toEqual([]);
        });

        it("message avec arg JSON : appelle game.i18n.format avec l'objet parsé", () => {
            const messages = [{key: "FQCARDENGINE.SomeKey", arg: JSON.stringify({value: 5})}];

            FQUtils.translateMessages(messages);

            expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.SomeKey", {value: 5});
        });

        it("message sans arg : appelle game.i18n.format avec un objet vide", () => {
            const messages = [{key: "FQCARDENGINE.NoArg"}];

            FQUtils.translateMessages(messages);

            expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.NoArg", {});
        });
    });

    describe("rewriteCardContent", () => {
        it("fusionne newValue dans chaque choix (stringifié), met à jour la carte et enchaîne flip", () => {
            const card = {update: vi.fn(), flip: vi.fn().mockReturnValue(Promise.resolve())};
            const cardContents = [{a: 1}];

            FQUtils.rewriteCardContent(card, cardContents, {b: 2});

            expect(card.update).toHaveBeenCalledWith({
                "system.fq.choices": [{a: "1", b: "2"}]
            });
            expect(card.flip).toHaveBeenCalled();
        });

        it("content.afterFirstPlay (JSON) remplace le contenu d'origine avant la fusion", () => {
            const card = {update: vi.fn(), flip: vi.fn().mockReturnValue(Promise.resolve())};
            const cardContents = [{afterFirstPlay: JSON.stringify({c: 3})}];

            FQUtils.rewriteCardContent(card, cardContents, {d: 4});

            expect(card.update).toHaveBeenCalledWith({
                "system.fq.choices": [{c: "3", d: "4"}]
            });
        });
    });

    describe("getRandomFileFromFolder", () => {
        // foundry.applications.apps n'existe pas dans tests/setup.js : posé
        // localement et nettoyé en afterEach (patron T-04-05).
        beforeEach(() => {
            globalThis.foundry.applications.apps = {
                FilePicker: {implementation: {browse: vi.fn()}}
            };
        });

        afterEach(() => {
            delete globalThis.foundry.applications.apps;
        });

        it("renvoie un fichier de la liste retournée par browse", async () => {
            foundry.applications.apps.FilePicker.implementation.browse.mockResolvedValue({files: ["a.png", "b.png"]});

            const result = await FQUtils.getRandomFileFromFolder("modules/fq/images");

            expect(["a.png", "b.png"]).toContain(result);
        });

        it("liste vide : renvoie null", async () => {
            foundry.applications.apps.FilePicker.implementation.browse.mockResolvedValue({files: []});

            const result = await FQUtils.getRandomFileFromFolder("modules/fq/images");

            expect(result).toBeNull();
        });

        it("browse qui rejette : logue l'erreur et renvoie null", async () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });
            foundry.applications.apps.FilePicker.implementation.browse.mockRejectedValue(new Error("boom"));

            const result = await FQUtils.getRandomFileFromFolder("modules/fq/images");

            expect(result).toBeNull();
            expect(spy).toHaveBeenCalled();

            spy.mockRestore();
        });
    });
});
