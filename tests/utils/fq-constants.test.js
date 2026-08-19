import {beforeEach, describe, expect, it} from "vitest";
import Constants, {
    CRITICAL_COLOR,
    CRITICAL_HEAL_COLOR,
    HEAL_COLOR,
    DAMAGES_COLOR,
    EVASION_COLOR,
    OTHER_ROLL_COLOR,
    SUCCESS_COLOR,
    FAIL_COLOR,
    OriginFQEffectLabel,
    DEFAULT_MAX_ZEAL
} from "../../src/domain/constants.js";

describe("Constants", () => {

    describe("constantes exportées", () => {
        it("couleurs et labels ont les valeurs attendues", () => {
            expect(CRITICAL_COLOR).toBe("#C0392B");
            expect(CRITICAL_HEAL_COLOR).toBe("#c39f43");
            expect(HEAL_COLOR).toBe("#10911A");
            expect(DAMAGES_COLOR).toBe("#F1C40F");
            expect(EVASION_COLOR).toBe("#4B8AF1");
            expect(OTHER_ROLL_COLOR).toBe("#34CBE3");
            expect(SUCCESS_COLOR).toBe("green");
            expect(FAIL_COLOR).toBe("red");
            expect(OriginFQEffectLabel).toBe("FQ Effect");
        });

        it("DEFAULT_MAX_ZEAL vaut 8", () => {
            expect(DEFAULT_MAX_ZEAL).toBe(8);
        });
    });

    describe("getters personnage", () => {
        it("actorAttr/actorAbi/actorFQ renvoient les blocs system.* du personnage courant", () => {
            expect(Constants.actorAttr).toBe(game.user.character.system.attributes);
            expect(Constants.actorAbi).toBe(game.user.character.system.abilities);
            expect(Constants.actorFQ).toBe(game.user.character.system.fq);
        });

        it("actorAttr/actorAbi/actorFQ renvoient undefined quand game.user.character est null", () => {
            game.user.character = null;

            expect(Constants.actorAttr).toBeUndefined();
            expect(Constants.actorAbi).toBeUndefined();
            expect(Constants.actorFQ).toBeUndefined();
        });

        it("myId renvoie l'id du personnage courant", () => {
            expect(Constants.myId).toBe("userCharacterId");
        });

        it("myId renvoie undefined quand game.user.character est null", () => {
            game.user.character = null;

            expect(Constants.myId).toBeUndefined();
        });

        it("myToken renvoie le token dont actorId correspond au personnage courant", () => {
            expect(Constants.myToken).toEqual(expect.objectContaining({actorId: "userCharacterId"}));
        });

        it("isActorInCombat vaut true quand le personnage courant est combattant", () => {
            expect(Constants.isActorInCombat).toBe(true);
        });

        it("isActorInCombat vaut false quand le personnage courant n'est pas combattant", () => {
            game.combat.combatants = [{actorId: "someoneElse"}];

            expect(Constants.isActorInCombat).toBe(false);
        });

        it("actorCurrent tolère l'absence de game.user", () => {
            game.user = undefined;

            expect(Constants.actorCurrent).toBeUndefined();
        });

        it("actorToken renvoie le token de l'acteur demandé, ou undefined", () => {
            expect(Constants.actorToken("userCharacterId")).toEqual(expect.objectContaining({actorId: "userCharacterId"}));
            expect(Constants.actorToken("inconnu")).toBeUndefined();
            expect(Constants.actorToken(undefined)).toBeUndefined();
        });

        it("currentTargets renvoie les cibles sélectionnées, ou un tableau vide sans cibles", () => {
            expect(Constants.currentTargets).toEqual([...game.user.targets]);

            game.user.targets = new Set();
            expect(Constants.currentTargets).toEqual([]);

            game.user = undefined;
            expect(Constants.currentTargets).toEqual([]);
        });
    });

    describe("logique métier", () => {
        it("isFQClasses est true pour un document de classe FQ", () => {
            expect(Constants.isFQClasses({system: {source: {label: "FQ"}}, type: "class"})).toBe(true);
        });

        it("isFQClasses est false pour un type différent de class", () => {
            expect(Constants.isFQClasses({system: {source: {label: "FQ"}}, type: "weapon"})).toBe(false);
        });

        it("isFQClasses est false pour un label différent de FQ", () => {
            expect(Constants.isFQClasses({system: {source: {label: "Other"}}, type: "class"})).toBe(false);
        });

        it("isFQClasses est false pour un document null", () => {
            expect(Constants.isFQClasses(null)).toBe(false);
        });

        it("myTargets() (défaut) renvoie une copie de game.user.targets", () => {
            const targets = Constants.myTargets();

            expect(targets).toHaveLength(1);
            expect(targets).not.toBe(game.user.targets);
        });

        it("userFQClasses filtre les classes FQ des classes de l'utilisateur", () => {
            const user = {
                character: {
                    classes: {
                        fighter: {system: {source: {label: "FQ"}}, type: "class"},
                        cleric: {system: {source: {label: "Other"}}, type: "class"},
                        notAClass: {system: {source: {label: "FQ"}}, type: "weapon"}
                    }
                }
            };

            const result = Constants.userFQClasses(user);

            expect(result).toEqual([{system: {source: {label: "FQ"}}, type: "class"}]);
        });
    });

    describe("logs de combat", () => {
        beforeEach(() => {
            game.combat.round = 1;
        });

        it("lastDamageThisTurn renvoie la dernière valeur de dégâts FQ du round pour la cible", () => {
            game.combat.flags = {
                fq: {
                    logs: [{
                        targetsId: ["userCharacterId"],
                        round: 1,
                        resultArray: [
                            {type: "damageFQ", value: 3, critical: false},
                            {type: "damageFQ", value: 7, critical: true}
                        ]
                    }]
                }
            };

            expect(Constants.lastDamageThisTurn()).toBe(7);
        });

        it("lastDamageThisTurn renvoie 0 quand aucun log ne concorde", () => {
            game.combat.flags = {fq: {logs: []}};

            expect(Constants.lastDamageThisTurn()).toBe(0);
        });

        it("lastCriticalThisTurn renvoie le dernier critical du round pour l'acteur", () => {
            game.combat.flags = {
                fq: {
                    logs: [{
                        actorId: "userCharacterId",
                        round: 1,
                        resultArray: [
                            {type: "damageFQ", value: 3, critical: false},
                            {type: "damageFQ", value: 7, critical: true}
                        ]
                    }]
                }
            };

            expect(Constants.lastCriticalThisTurn()).toBe(true);
        });

        it("lastCriticalThisTurn renvoie false quand aucun log ne concorde", () => {
            game.combat.flags = {fq: {logs: []}};

            expect(Constants.lastCriticalThisTurn()).toBe(false);
        });
    });
});
