import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import CardEffect from "../../src/domain/engine/shared/card-effect.js";
import RollService from "../../src/domain/engine/roll/roll-service.js";
import Minion from "../../src/domain/engine/shared/minion.js";
import ObjectUtils from "../../src/core/utils/object.utils.js";
import Fx from "../../src/domain/engine/shared/fx.js";
import ResourceHandler from "../../src/domain/engine/shared/resource-handler.js";
import Damage from "../../src/domain/engine/roll/damage.js";
import Geometry from "../../src/domain/engine/shared/geometry.js";
import {socket} from "../../src/hook/integration/socketlib.hook.js";
import CombatTurn from "../../src/domain/engine/combat-turn.js";
import Constants from "../../src/domain/constants.js";
import {makeCard, makeChoice} from "../factories.js";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {
        executeAsGM: vi.fn()
    }
}));

vi.mock("../../src/domain/engine/shared/resource-handler.js", () => ({
    default: {
        consumeResources: vi.fn(),
        createUserWarningMessage: vi.fn(),
        checkResources: vi.fn(),
        validateUseSpellInTurn: vi.fn(() => true)
    }
}));

vi.mock("../../src/domain/engine/roll/damage.js", () => ({
    default: {
        buildDamageDiceLauncher: vi.fn(async () => ([])),
        buildHealDiceLauncher: vi.fn(async () => ([])),
        handleSoundEffect: vi.fn(),
        addCriticalEvasionToDamage: vi.fn(),
        applyDiceAppearance: vi.fn(),
        displayResult: vi.fn()
    }
}));

vi.mock("../../src/domain/engine/shared/fx.js", () => ({
    default: {
        handleSpecialEffect: vi.fn(),
        importMacroFromCompendium: vi.fn()
    }
}));

vi.mock("../../src/domain/engine/shared/geometry.js", () => ({
    default: {
        locationIsOccupied: vi.fn(),
        getMinDistanceBetweenTwoToken: vi.fn(),
        distanceBetweenTokens: vi.fn()
    }
}));
describe("CardEffect / RollService / Minion / ObjectUtils", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // Façade globale du module, référencée par CardEffect.createEffectsFromData
        // (`FqCardEngineModule.moduleName`, portée des flags d'effet). Reposée avant
        // chaque test pour neutraliser l'`afterEach` d'un sous-describe qui l'annule.
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    });

    it("rollResultSync : évalue une formule et renvoie son total (synchrone)", () => {
        const result = RollService.rollResultSync("1d20");
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it("should prepare data from card", async () => {
        const cardContent = {minReach: "1", maxReach: "1+1d6", nbTargets: "1d3"};
        await CardEffect.prepareDataFromCard(cardContent);

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

        CardEffect.replaceCardContentAbilitiesBonus(cardContent);

        expect(cardContent.key1).toBe("some text with 2 modifier");
        expect(cardContent.key2.nestedKey).toBe("3 modifier");
    });

    it("should handle sound effect in applyCardEffect", async () => {
        const cardContent = {damage: "1d6", heal: "3+1d4", sound: "sound.mp3"};
        await CardEffect.applyCardEffect(cardContent, {}, {});
        expect(Fx.handleSpecialEffect).toHaveBeenCalledWith(cardContent, expect.any(Array), {
            "actorId": "userCharacterId",
            "x": 5,
            "y": 5
        }, null);
    });

    it("applyCardEffect - cas nominal : applique les effets quand cardContent est présent", async () => {
        const cardContent = makeChoice({damage: "1d6", heal: "3"});
        const card = makeCard();

        await CardEffect.applyCardEffect(cardContent, card, {});

        expect(ResourceHandler.consumeResources).toHaveBeenCalled();
        expect(Damage.buildDamageDiceLauncher).toHaveBeenCalled();
        expect(Damage.buildHealDiceLauncher).toHaveBeenCalled();
        expect(Damage.displayResult).toHaveBeenCalled();
        expect(socket.executeAsGM).toHaveBeenCalledWith("logCardPlayed", expect.any(Array), cardContent,
            expect.any(String), expect.any(Array));
    });

    it("applyCardEffect - branche cardContent null : publie InfoMsgNoAddedEffect", async () => {
        await CardEffect.applyCardEffect(null, makeCard(), {});

        expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining("FQCARDENGINE.InfoMsgNoAddedEffect")
        }));
    });

    it("préserve les champs déjà alignés v14 (name/img/showIcon) sans les transformer", async () => {
        const input = {
            data: [
                {name: "Effet A", img: "icons/x.webp", showIcon: 2, changes: []},
            ],
        };

        const [res] = await CardEffect.createEffectsFromData(input);

        expect(res.name).toBe("Effet A");
        expect(res.img).toBe("icons/x.webp");
        expect(res.showIcon).toBe(2);
    });

    it("porte expireOnDamage dans flags[fq-card-engine] et retire le champ à plat", async () => {
        const input = {
            data: [
                {name: "Expirable", expireOnDamage: true, changes: []},
                {name: "Persistant", expireOnDamage: false, changes: []},
            ],
        };

        const [expirable, persistant] = await CardEffect.createEffectsFromData(input);

        expect(expirable.flags["fq-card-engine"].expireOnDamage).toBe(true);
        expect(persistant.flags["fq-card-engine"].expireOnDamage).toBe(false);
        expect(expirable).not.toHaveProperty("expireOnDamage");
        expect(persistant).not.toHaveProperty("expireOnDamage");
    });

    it("résout la durée v14 {value, units} et définit origin ; pas de start ni résidu", async () => {
        const input = {
            data: [
                {
                    name: "Durée",
                    duration: {value: "2", units: "rounds"},
                    changes: [],
                },
            ],
        };

        const [res] = await CardEffect.createEffectsFromData(input);

        // rollResultSync (Roll mocké) renvoie le total déterministe (10) pour value="2".
        expect(res.duration).toEqual({value: 10, units: "rounds"});
        expect(res.origin).toBe("FQ Effect");
        // Aucun `start` fourni (Foundry le fixe au round/tour courant dans _preCreate).
        expect(res.start).toBeUndefined();
    });

    it("préserve l'unité turns du schéma", async () => {
        const input = {
            data: [{name: "Turns", duration: {value: "3", units: "turns"}, changes: []}],
        };

        const [res] = await CardEffect.createEffectsFromData(input);

        expect(res.duration).toEqual({value: 10, units: "turns"});
    });

    it("durée vide (value \"\") → effet permanent : duration retirée, origin défini", async () => {
        const input = {
            data: [
                {
                    name: "Permanent",
                    duration: {value: "", units: "rounds"},
                    changes: [],
                },
            ],
        };

        const [res] = await CardEffect.createEffectsFromData(input);

        expect(res.duration).toBeUndefined();
        expect(res.origin).toBe("FQ Effect");
    });

    it("resolveDurationComponent : vide→0, non-finie→0, formule→total du jet", () => {
        expect(CardEffect.resolveDurationComponent("")).toBe(0);
        expect(CardEffect.resolveDurationComponent("   ")).toBe(0);
        expect(CardEffect.resolveDurationComponent(undefined)).toBe(0);
        expect(CardEffect.resolveDurationComponent(null)).toBe(0);
        // Roll mocké → total déterministe (10) pour toute formule non vide.
        expect(CardEffect.resolveDurationComponent("2")).toBe(10);
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

        const [res] = await CardEffect.createEffectsFromData(input);

        expect(res.changes[0].value).toBe("1+2");
        expect(res.changes[1].value).toBe("2+3");

        const calls = global.Roll.mock.calls.map((c) => c[0]);
        expect(calls).not.toContain("1+2");
        expect(calls).not.toContain("2+3");
    });

    describe("checkIfCanUseCard — eval custom", () => {
        // ISOLE la branche eval : sans ceci, `game.combat` non-null (défaut de
        // tests/setup.js) ferait aussi traverser les contrôles de combat
        // (épuisement, sort réactif, tour du joueur), hors sujet ici.
        beforeEach(() => {
            game.combat = null;
            ResourceHandler.checkResources.mockReturnValue(true);
        });

        it("script vrai : renvoie true et ne publie aucun message", () => {
            const cardContent = makeChoice({customEvals: [{script: "1+1===2"}]});
            const card = makeCard();

            const result = CardEffect.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(true);
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("script faux : renvoie false et publie WarningMsgCardConditionNotMet", () => {
            const cardContent = makeChoice({customEvals: [{script: "1===2"}]});
            const card = makeCard();

            const result = CardEffect.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("#E36934")
            }));
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgCardConditionNotMet")
            }));
        });

        it("script qui lève : carte injouable, logue console.error et publie WarningMsgErrorReadingCardSpecialCondition", () => {
            const cardContent = makeChoice({customEvals: [{script: "nExistePas("}]});
            const card = makeCard();
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });

            // Une condition illisible ne doit jamais rendre la carte jouable.
            const result = CardEffect.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(false);
            expect(spy).toHaveBeenCalled();
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("#C04200")
            }));
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition")
            }));

            spy.mockRestore();
        });
    });

    describe("evaluateXYBounds", () => {
        it("dans les bornes : renvoie null et résout xmax/ymax en place", () => {
            const cardContent = makeChoice({xmax: "10", ymax: "10"});

            const verdict = CardEffect.evaluateXYBounds(cardContent, 3, 2);

            expect(verdict).toBeNull();
            // Roll déterministe (total 10) : xmax/ymax résolus en place à 10.
            expect(cardContent.xmax).toBe(10);
            expect(cardContent.ymax).toBe(10);
        });

        it("XXX négatif (sous garde xmax) : verdict WarningMsgXValueSuperiorXMax", () => {
            const cardContent = makeChoice({xmax: "10", ymax: "10"});

            const verdict = CardEffect.evaluateXYBounds(cardContent, -1, 2);

            expect(verdict).toEqual({messageKey: "FQCARDENGINE.WarningMsgXValueSuperiorXMax", format: {xmax: 10}});
        });

        it("XXX > xmax : verdict WarningMsgXValueSuperiorXMax", () => {
            const cardContent = makeChoice({xmax: "10"}); // résolu à 10

            const verdict = CardEffect.evaluateXYBounds(cardContent, 11, 0);

            expect(verdict.messageKey).toBe("FQCARDENGINE.WarningMsgXValueSuperiorXMax");
        });

        it("XXX < xmin : verdict WarningMsgXValueInferiorXMin (xmin résolu en place)", () => {
            const cardContent = makeChoice({xmin: "5"});

            const verdict = CardEffect.evaluateXYBounds(cardContent, 2, 2);

            // xmin est résolu en place (Roll déterministe → 10) : le verdict porte la valeur résolue.
            expect(cardContent.xmin).toBe(10);
            expect(verdict).toEqual({messageKey: "FQCARDENGINE.WarningMsgXValueInferiorXMin", format: {xmin: 10}});
        });

        it("YYY > ymax : verdict WarningMsgYValueSuperiorYMax", () => {
            const cardContent = makeChoice({xmax: "10", ymax: "5"}); // ymax résolu à 10

            const verdict = CardEffect.evaluateXYBounds(cardContent, 3, 11);

            expect(verdict.messageKey).toBe("FQCARDENGINE.WarningMsgYValueSuperiorYMax");
        });

        it("YYY < ymin : verdict WarningMsgYValueInferiorYMin (ymin résolu en place)", () => {
            const cardContent = makeChoice({ymin: "5"});

            const verdict = CardEffect.evaluateXYBounds(cardContent, 100, 2);

            // ymin est résolu en place (Roll déterministe → 10) : le verdict porte la valeur résolue.
            expect(cardContent.ymin).toBe(10);
            expect(verdict).toEqual({messageKey: "FQCARDENGINE.WarningMsgYValueInferiorYMin", format: {ymin: 10}});
        });
    });

    describe("substituteXAndYValue", () => {
        it("hasVariables=true : substitue XXX/YYY par les valeurs saisies", () => {
            const cardContent = makeChoice({damage: "XXX+YYY"});

            CardEffect.substituteXAndYValue(cardContent, true, 3, 2);

            expect(cardContent.damage).toBe("3+2");
        });

        it("hasVariables=false mais xvalue/yvalue définis : calcule via getXYValue", () => {
            const spy = vi.spyOn(CardEffect, "getXYValue").mockReturnValueOnce(7).mockReturnValueOnce(2);
            const cardContent = makeChoice({damage: "XXX+YYY", xvalue: "nbTargets", yvalue: "nbTargets"});

            CardEffect.substituteXAndYValue(cardContent, false, undefined, undefined);

            expect(spy).toHaveBeenCalledWith("nbTargets", expect.any(Array));
            expect(cardContent.damage).toBe("7+2");
            spy.mockRestore();
        });
    });

    // ─── Tâche 1 (tracer) : création de sbires de bout en bout ─────────────────
    //
    // Globals locaux NON fournis par tests/setup.js (FqCardEngineModule,
    // game.folders, game.userId, globalThis.Folder) : posés en beforeEach et
    // nettoyés en afterEach, patron T-04-05 (tests/hook/socket-lib.test.js).
    describe("Minion — création de sbires", () => {
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

            expect(Minion.getTempActorFolder()).toBe(tempFolder);
        });

        it("getTempActorFolder renvoie undefined si absent", () => {
            game.folders.find = vi.fn((fn) => [].find(fn));

            expect(Minion.getTempActorFolder()).toBeUndefined();
        });

        it("createTempFold crée le dossier Temporaire de type Actor", async () => {
            await Minion.createTempFold();

            expect(Folder.create).toHaveBeenCalledWith({name: "Temporaire", type: "Actor"});
        });

        it("createActor SANS dossier Temporaire : demande sa création au MJ puis délègue à createActorData", async () => {
            game.folders.find = vi.fn(() => undefined);
            const spy = vi.spyOn(Minion, "createActorData").mockResolvedValue(undefined);

            await Minion.createActor({name: "minionName"}, "left");

            expect(socket.executeAsGM).toHaveBeenCalledWith("createTempFold");
            expect(spy).toHaveBeenCalledWith({name: "minionName"}, "left");

            spy.mockRestore();
        });

        it("createActor AVEC dossier Temporaire déjà présent : ne demande pas sa création au MJ", async () => {
            game.folders.find = vi.fn((fn) => [{id: "tmp", type: "Actor", name: "Temporaire"}].find(fn));
            const spy = vi.spyOn(Minion, "createActorData").mockResolvedValue(undefined);

            await Minion.createActor({name: "minionName"}, "left");

            expect(socket.executeAsGM).not.toHaveBeenCalledWith("createTempFold");
            expect(spy).toHaveBeenCalledWith({name: "minionName"}, "left");

            spy.mockRestore();
        });

        describe("createActorData", () => {
            beforeEach(() => {
                vi.spyOn(Minion, "getTempActorFolder").mockReturnValue({id: "tmp"});
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
                Minion.getTempActorFolder.mockRestore();
            });

            it("construit actorData depuis le compendium, applique toutes les surcharges de minion.data et délègue au MJ via socket", async () => {
                const minion = {
                    name: "minionName",
                    data: {
                        hp: "1d6", critical: "1", evasion: "1", action: "1", mana: "1",
                        zeal: "1", damageBonus: "1", healBonus: "1", movement: "1"
                    }
                };

                await Minion.createActorData(minion, "left");

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
                await Minion.createActorData({name: "minionName"}, "up");

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
        it("draw : délègue à CombatTurn.drawWithRecall (même pioche qu'en début de tour)", async () => {
            const spy = vi.spyOn(CombatTurn, "drawWithRecall").mockResolvedValue(2);
            const hand = {draw: vi.fn()};
            const card = makeCard({parent: hand, source: "sourceRef"});
            const cardContent = makeChoice({draw: 2});

            await CardEffect.applyCardEffect(cardContent, card, {});

            expect(spy).toHaveBeenCalledWith(game.user, Constants.actorCurrent, hand, "sourceRef", 2);
        });

        it("minions : un seul sbire pour une seule direction sélectionnée", async () => {
            const spy = vi.spyOn(Minion, "createActor").mockResolvedValue(undefined);
            const minion = {name: "goblin"};
            const cardContent = makeChoice({minions: [minion]});
            const fd = {minionDown: true};

            await CardEffect.applyCardEffect(cardContent, makeCard(), fd);

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(minion, "down");

            spy.mockRestore();
        });

        it("minions : un sbire DISTINCT par emplacement sélectionné (minion[i] → i-ème direction)", async () => {
            const spy = vi.spyOn(Minion, "createActor").mockResolvedValue(undefined);
            const m1 = {name: "goblin"};
            const m2 = {name: "orc"};
            const m3 = {name: "kobold"};
            const cardContent = makeChoice({minions: [m1, m2, m3]});
            // 2 directions sélectionnées (ordre parcouru : left, up, right, down).
            const fd = {minionLeft: true, minionUp: false, minionRight: true, minionDown: false};

            await CardEffect.applyCardEffect(cardContent, makeCard(), fd);

            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy).toHaveBeenNthCalledWith(1, m1, "left");
            expect(spy).toHaveBeenNthCalledWith(2, m2, "right");

            spy.mockRestore();
        });

        it("executeEval : décode les entités HTML (&gt;/&lt;/&amp;) puis exécute le script", async () => {
            globalThis.__evalProbe = 0;
            const cardContent = makeChoice({executeEval: "globalThis.__evalProbe = (1 &gt; 0 &amp;&amp; 2 &lt; 3) ? 42 : 0;"});

            await CardEffect.applyCardEffect(cardContent, makeCard(), {});

            expect(cardContent.executeEval).toBe("globalThis.__evalProbe = (1 > 0 && 2 < 3) ? 42 : 0;");
            expect(globalThis.__evalProbe).toBe(42);

            delete globalThis.__evalProbe;
        });

        it("executeEval qui lève : logue console.error et le jeu de la carte continue", async () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });
            const cardContent = makeChoice({executeEval: "nExistePas("});

            await expect(CardEffect.applyCardEffect(cardContent, makeCard(), {})).resolves.not.toThrow();

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it("applyEffectsFormulas non vide : appelle playApplyEffectsFormulas et concatène les messages", async () => {
            const spy = vi.spyOn(CardEffect, "playApplyEffectsFormulas").mockResolvedValue(["Message effet déclenché"]);
            const cardContent = makeChoice({applyEffectsFormulas: [{formula: "1d20", title: "T", effects: []}]});

            await CardEffect.applyCardEffect(cardContent, makeCard(), {});

            expect(spy).toHaveBeenCalledWith(cardContent.applyEffectsFormulas[0], cardContent);
            expect(Damage.displayResult).toHaveBeenCalledWith(
                game.user.character, expect.any(Array), expect.arrayContaining(["Message effet déclenché"])
            );

            spy.mockRestore();
        });

        it("resultArray non vide : applique les PV via socket.executeAsGM('applyActorHpModification', ...) par résultat", async () => {
            Damage.buildDamageDiceLauncher.mockResolvedValueOnce([
                {targetTokenId: "token1", value: 5, type: "damageFQ"},
                {targetTokenId: "token2", value: 3, type: "healFQ"}
            ]);
            const cardContent = makeChoice({damage: "1d6"});

            await CardEffect.applyCardEffect(cardContent, makeCard(), {});

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

            const messages = await CardEffect.playApplyEffectsFormulas(applyEffectsFormulas, makeChoice());

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

            await CardEffect.playApplyEffectsFormulas(applyEffectsFormulas, cardContent);

            expect(socket.executeAsGM).toHaveBeenCalledWith("addEffectForTarget", expect.any(Object), "token1");
            expect(ActiveEffect.implementation.create).not.toHaveBeenCalled();
        });

        it("no match (aucun effet ne correspond au total du jet) : ne crée aucun effet et renvoie []", async () => {
            const applyEffectsFormulas = {formula: "1d20", title: "T", effects: []};

            const messages = await CardEffect.playApplyEffectsFormulas(applyEffectsFormulas, makeChoice());

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

            await CardEffect.prepareDataFromCard(cardContent);

            expect(cardContent.hp).toBe(10);
            expect(cardContent.action).toBe(10);
            expect(cardContent.mana).toBe(10);
            expect(cardContent.zeal).toBe(10);
            expect(cardContent.draw).toBe(10);
            expect(cardContent.drop).toBe(10);
            expect(cardContent.bonusCrit).toBe(10);
            expect(cardContent.bonusEva).toBe(10);
        });

        it("maxReach ajoute le bonus de portée de l'acteur (Constants.actorFQ.bonus.range)", async () => {
            // minReach doit être présent : la branche évalue minReach ET maxReach
            // dès que l'un des deux est truthy (fq-utils.js:356-358).
            game.user.character.system.fq.bonus.range = 3;
            const cardContent = {minReach: "1", maxReach: "1"};

            await CardEffect.prepareDataFromCard(cardContent);

            expect(cardContent.minReach).toBe(10);
            expect(cardContent.maxReach).toBe(13); // 10 (roll déterministe) + 3 (bonus.range)
        });
    });

    describe("checkIfCanUseCard — branches combat et validations", () => {
        beforeEach(() => {
            game.combat = null;
            ResourceHandler.checkResources.mockReturnValue(true);
        });

        it("passif déjà rejoué ce round : renvoie false et publie WarningMsgCardAlreadyPlayedThisTurn", () => {
            game.combat = {round: 3};
            const cardContent = makeChoice({replayable: "passif", hasBeenPlayed: true, playedRound: "3"});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgCardAlreadyPlayedThisTurn")
            }));
        });

        // Le blocage ne dépend plus du seul `replayable: "passif"` : une carte
        // éphémère générée déjà marquée jouée arrive en main épuisée pour le round
        // de sa création, et redevient jouable au round suivant.
        it("choix éphémère déjà joué ce round : renvoie false", () => {
            game.combat = {round: 3};
            const cardContent = makeChoice({replayable: "ephemere", hasBeenPlayed: true, playedRound: "3"});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
        });

        it("choix éphémère joué à un round antérieur : redevient jouable", () => {
            game.combat = {round: 4};
            const cardContent = makeChoice({replayable: "ephemere", hasBeenPlayed: true, playedRound: "3"});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(true);
        });

        // Garde-fou : un `replayable` NUMÉRIQUE porte des charges. La carte est
        // marquée jouée à chaque usage mais doit rester rejouable dans le tour où
        // elle vient de l'être, tant qu'il lui reste des charges.
        it("carte à charges déjà jouée ce round : reste jouable", () => {
            game.combat = {round: 3};
            const cardContent = makeChoice({replayable: "2", hasBeenPlayed: true, playedRound: "3"});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(true);
        });

        it("carte réactive jouée hors du tour de l'acteur : renvoie false et publie WarningMsgPlayReactiveCard", () => {
            game.combat = {round: 1, combatant: {actor: {id: "userCharacterId"}}};
            const cardContent = makeChoice({reactive: true});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(false);
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgPlayReactiveCard")
            }));
        });

        // v2.0.2 : le moteur ne contrôle PLUS DU TOUT le ciblage. Tout le contrôle
        // (Default ET Skeletons) est remonté en amont, dans playValidatedCard, avant
        // callBackplayCard (via ResourceHandler.evaluateTargeting).
        it("le moteur ne bloque plus sur le ciblage : une carte à portée n'est pas rejetée par checkIfCanUseCard", () => {
            ResourceHandler.checkResources.mockReturnValue(true);
            const cardContent = makeChoice({minReach: 1, maxReach: 3, nbTargets: 1, targetType: "Default"});

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(true);
        });

        it("pioche insuffisante : publie WarningMsgNotEnoughDraw et renvoie false", () => {
            const card = makeCard({source: {cards: {size: 1}, drawnCards: []}});
            const cardContent = makeChoice({draw: 2});

            const result = CardEffect.checkIfCanUseCard(cardContent, card);

            expect(result).toBe(false);
            expect(ResourceHandler.createUserWarningMessage).toHaveBeenCalledWith(
                "FQCARDENGINE.WarningMsgNotEnoughDraw", game.user.character
            );
        });

        it("cas nominal : aucune condition bloquante, renvoie le résultat de checkResources", () => {
            const cardContent = makeChoice();

            const result = CardEffect.checkIfCanUseCard(cardContent, makeCard());

            expect(result).toBe(true);
            expect(ResourceHandler.checkResources).toHaveBeenCalledWith(cardContent, game.user.character);
        });
    });

    // ─── Tâche 3 : helpers restants (X/Y, résolution d'attributs, purs) ────────

    describe("getXYValue", () => {
        it("nbTargets : renvoie la longueur des cibles (0 si vide)", async () => {
            expect(await CardEffect.getXYValue("nbTargets", [])).toBe(0);
            expect(await CardEffect.getXYValue("nbTargets", [{}, {}])).toBe(2);
        });

        it("reach avec une seule cible : délègue à Geometry.distanceBetweenTokens", async () => {
            Geometry.distanceBetweenTokens.mockReturnValue(4);
            const target = {document: {x: 0, y: 5, width: 1, height: 1}};

            const result = await CardEffect.getXYValue("reach", [target]);

            expect(result).toBe(4);
            expect(Geometry.distanceBetweenTokens).toHaveBeenCalledWith(
                expect.objectContaining({x: 5, y: 5}), target
            );
        });

        it("SCRIPT: : évalue le script après le préfixe", async () => {
            const result = await CardEffect.getXYValue("SCRIPT:2+2", []);
            expect(result).toBe(4);
        });

        it("SCRIPT: qui lève une exception (ex. game.combat null) : renvoie 0 sans planter", async () => {
            const result = await CardEffect.getXYValue("SCRIPT:game.combat.flags.fq.logs", []);
            expect(result).toBe(0);
        });

        it("SCRIPT: dont le résultat n'est pas un nombre fini (undefined/NaN) : renvoie 0", async () => {
            expect(await CardEffect.getXYValue("SCRIPT:undefined", [])).toBe(0);
            expect(await CardEffect.getXYValue("SCRIPT:-2*undefined", [])).toBe(0);
        });

        it("défaut : délègue à getNestedAttribute sur le système du personnage", async () => {
            game.user.character.system.attributes.hp = {value: "5"};

            const result = await CardEffect.getXYValue("attributes.hp.value", []);

            expect(result).toBe(10); // rollResultSync("5") -> total déterministe
        });
    });

    describe("getNestedAttribute", () => {
        it("clé vide : renvoie 0", async () => {
            expect(await CardEffect.getNestedAttribute({foo: "bar"}, "")).toBe(0);
        });

        it("chemin présent : renvoie le total du jet (roll déterministe)", async () => {
            expect(await CardEffect.getNestedAttribute({a: {b: "3"}}, "a.b")).toBe(10);
        });

        it("chemin absent : renvoie 0", async () => {
            expect(await CardEffect.getNestedAttribute({a: {}}, "a.c")).toBe(0);
        });

        it("maillon intermédiaire null : renvoie 0 sans lever", async () => {
            expect(() => CardEffect.getNestedAttribute({a: null}, "a.b")).not.toThrow();
            expect(await CardEffect.getNestedAttribute({a: null}, "a.b")).toBe(0);
        });

        it("objet racine null/undefined (personnage absent) : renvoie 0 sans lever", async () => {
            expect(await CardEffect.getNestedAttribute(undefined, "a.b")).toBe(0);
            expect(await CardEffect.getNestedAttribute(null, "a")).toBe(0);
        });

        it("valeur finale résolue à null : renvoie 0 sans lever", async () => {
            expect(await CardEffect.getNestedAttribute({a: {b: null}}, "a.b")).toBe(0);
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

            CardEffect.recalculatedWithWYValue(cardContent, 5, 3);

            expect(cardContent.top).toBe("5 dégâts, 3 portée");
            expect(cardContent.nested.inner).toBe("encore 5");
            expect(cardContent.untouched).toBe(42);
            expect(cardContent.flag).toBe(true);
        });
    });

    describe("stringifyObjValue", () => {
        it("convertit récursivement les valeurs primitives en chaînes", () => {
            const result = CardEffect.stringifyObjValue({a: 1, b: true, nested: {c: 2}});

            expect(result.a).toBe("1");
            expect(result.b).toBe("true");
            expect(result.nested.c).toBe("2");
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
            const result = RollService.replaceAbilitiesBonus("@str/@dex/@con/@int/@wis/@cha");
            expect(result).toBe("2/0/-1/0/0/0");
        });

        it("hasAbilitiesBonus : true si au moins une référence a un modificateur strictement positif", () => {
            expect(RollService.hasAbilitiesBonus("bonus @str")).toBe(true);
        });

        it("hasAbilitiesBonus : false si aucune référence n'a de modificateur positif", () => {
            expect(RollService.hasAbilitiesBonus("bonus @dex @con")).toBe(false);
        });

        it("hasAbilitiesBonus : false sans lever sur une valeur non-string (carte à 0 choix → undefined)", () => {
            expect(() => RollService.hasAbilitiesBonus(undefined)).not.toThrow();
            expect(RollService.hasAbilitiesBonus(undefined)).toBe(false);
            expect(RollService.hasAbilitiesBonus(null)).toBe(false);
        });
    });

    describe("getNbValideMinionLocationSelected / getNbMinionLocationSelected", () => {
        it("getNbMinionLocationSelected compte tous les emplacements sélectionnés (occupés ou non)", () => {
            const fd = {minionUp: true, minionDown: true, minionLeft: false, minionRight: true};
            expect(Minion.getNbMinionLocationSelected(fd)).toBe(3);
        });

        it("getNbValideMinionLocationSelected exclut les emplacements occupés (Geometry.locationIsOccupied)", () => {
            Geometry.locationIsOccupied.mockImplementation(loc => loc === "up");
            const fd = {minionUp: true, minionDown: true, minionLeft: true, minionRight: false};

            const result = Minion.getNbValideMinionLocationSelected(fd);

            expect(result).toBe(2); // up exclu (occupé) ; down + left valides
            expect(Geometry.locationIsOccupied).toHaveBeenCalledWith("up");
        });
    });

    describe("deepCopy", () => {
        it("primitive/null renvoyés tels quels", () => {
            expect(ObjectUtils.deepCopy(null)).toBeNull();
            expect(ObjectUtils.deepCopy(42)).toBe(42);
            expect(ObjectUtils.deepCopy("abc")).toBe("abc");
        });

        it("copie un tableau en profondeur : mutation de la copie n'affecte pas l'original", () => {
            const original = [{a: 1}, {a: 2}];
            const copy = ObjectUtils.deepCopy(original);

            copy[0].a = 999;

            expect(original[0].a).toBe(1);
            expect(copy).toEqual([{a: 999}, {a: 2}]);
        });

        it("copie un objet en profondeur : mutation de la copie n'affecte pas l'original", () => {
            const original = {nested: {value: 1}};
            const copy = ObjectUtils.deepCopy(original);

            copy.nested.value = 999;

            expect(original.nested.value).toBe(1);
        });
    });

    describe("translateMessages", () => {
        it("liste vide/undefined : renvoie []", () => {
            expect(CardEffect.translateMessages(undefined)).toEqual([]);
            expect(CardEffect.translateMessages([])).toEqual([]);
        });

        it("message avec arg JSON : appelle game.i18n.format avec l'objet parsé", () => {
            const messages = [{key: "FQCARDENGINE.SomeKey", arg: JSON.stringify({value: 5})}];

            CardEffect.translateMessages(messages);

            expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.SomeKey", {value: 5});
        });

        it("message sans arg : appelle game.i18n.format avec un objet vide", () => {
            const messages = [{key: "FQCARDENGINE.NoArg"}];

            CardEffect.translateMessages(messages);

            expect(game.i18n.format).toHaveBeenCalledWith("FQCARDENGINE.NoArg", {});
        });
    });

    describe("rewriteCardContent", () => {
        it("fusionne newValue dans chaque choix (stringifié) et met à jour la carte", () => {
            const card = {update: vi.fn()};
            const cardContents = [{a: 1}];

            CardEffect.rewriteCardContent(card, cardContents, {b: 2});

            expect(card.update).toHaveBeenCalledWith({
                "system.fq.choices": [{a: "1", b: "2"}]
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

            const result = await ObjectUtils.getRandomFileFromFolder("modules/fq/images");

            expect(["a.png", "b.png"]).toContain(result);
        });

        it("liste vide : renvoie null", async () => {
            foundry.applications.apps.FilePicker.implementation.browse.mockResolvedValue({files: []});

            const result = await ObjectUtils.getRandomFileFromFolder("modules/fq/images");

            expect(result).toBeNull();
        });

        it("browse qui rejette : logue l'erreur et renvoie null", async () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });
            foundry.applications.apps.FilePicker.implementation.browse.mockRejectedValue(new Error("boom"));

            const result = await ObjectUtils.getRandomFileFromFolder("modules/fq/images");

            expect(result).toBeNull();
            expect(spy).toHaveBeenCalled();

            spy.mockRestore();
        });
    });
});
