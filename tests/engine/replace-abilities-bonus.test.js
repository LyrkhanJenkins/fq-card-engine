import {afterEach, beforeEach, describe, expect, it} from "vitest";
import RollService from "../../src/domain/engine/roll/roll-service.js";

/**
 * `RollService.replaceAbilitiesBonus` : substitution des jetons `@str`, `@dex`…
 * par le modificateur du personnage de l'utilisateur COURANT.
 *
 * Le cas critique est l'absence de personnage — typiquement le MJ qui affiche la
 * main d'un joueur. La substitution lit les six caractéristiques pour TOUTE chaîne
 * non vide, donc un déréférencement non protégé y lève un TypeError : l'exception
 * remonte jusqu'à `renderCards`, dont la promesse est rejetée sans `catch`, et la
 * main entière cesse de s'afficher sans le moindre message.
 */

let previousCharacter;

beforeEach(() => {
    previousCharacter = game.user.character;
});

afterEach(() => {
    game.user.character = previousCharacter;
});

describe("replaceAbilitiesBonus", () => {
    it("substitue les modificateurs du personnage assigné", () => {
        game.user.character = {
            system: {
                abilities: {
                    str: {mod: 3}, dex: {mod: -1}, con: {mod: 0},
                    int: {mod: 2}, wis: {mod: 1}, cha: {mod: 4}
                }
            }
        };

        expect(RollService.replaceAbilitiesBonus("1d6+@str")).toBe("1d6+3");
        expect(RollService.replaceAbilitiesBonus("@dex")).toBe("-1");
        expect(RollService.replaceAbilitiesBonus("@int+@cha")).toBe("2+4");
    });

    it("substitue 0 quand l'utilisateur n'a aucun personnage assigné, sans lever", () => {
        game.user.character = undefined;

        expect(() => RollService.replaceAbilitiesBonus("1d6+@str")).not.toThrow();
        expect(RollService.replaceAbilitiesBonus("1d6+@str")).toBe("1d6+0");
        expect(RollService.replaceAbilitiesBonus("@str+@dex+@con+@int+@wis+@cha")).toBe("0+0+0+0+0+0");
    });

    it("substitue 0 quand le personnage n'expose aucune caractéristique", () => {
        game.user.character = {system: {}};

        expect(RollService.replaceAbilitiesBonus("@wis")).toBe("0");
    });

    it("laisse intacte une chaîne sans jeton de caractéristique", () => {
        game.user.character = undefined;

        expect(RollService.replaceAbilitiesBonus("2d8+4")).toBe("2d8+4");
    });
});
