import {afterEach, describe, expect, it, vi} from "vitest";
import TradingCards from "../../src/domain/trading/trading-cards.js";

import "../../src/hook/item.hook.js";

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("hook/item", () => {
    describe("hooks CRUD d'objet (délégation vers TradingCards)", () => {
        it("updateItem/createItem/deleteItem délèguent à TradingCards.updateDeckWhenChange(document, options)", () => {
            vi.spyOn(TradingCards, "updateDeckWhenChange").mockImplementation(() => {});
            const document = {type: "class"};
            const options = {isAdvancement: true, parent: {id: "parent-id"}};

            getHook("updateItem")(document, {}, options, "user-1");
            getHook("createItem")(document, options, "user-1");
            getHook("deleteItem")(document, options, "user-1");

            expect(TradingCards.updateDeckWhenChange).toHaveBeenCalledTimes(3);
            expect(TradingCards.updateDeckWhenChange).toHaveBeenCalledWith(document, options);
        });

        it("preUpdateItem/preCreateItem/preDeleteItem délèguent à TradingCards.checkIfCanUpdateClasses(document, options)", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(true);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(true);
            const document = {type: "class"};
            const options = {isAdvancement: true, parent: {id: "parent-id"}};

            // preCreateItem reçoit (document, data, options, userId) : les options
            // sont en troisième position, pas en deuxième.
            getHook("preUpdateItem")(document, {}, options, "user-1");
            getHook("preCreateItem")(document, {name: "Classe"}, options, "user-1");
            getHook("preDeleteItem")(document, options, "user-1");

            expect(TradingCards.checkIfCanUpdateClasses).toHaveBeenCalledTimes(3);
            expect(TradingCards.checkIfCanUpdateClasses).toHaveBeenCalledWith(document, options);
        });
    });

    describe("personnage sans utilisateur porteur", () => {
        it("preUpdateItem refuse la mise à jour et n'évalue pas le plafond", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(false);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(true);

            expect(getHook("preUpdateItem")({type: "class"}, {}, {isAdvancement: true}, "user-1")).toBe(false);
            expect(TradingCards.checkClassLevelCap).not.toHaveBeenCalled();
        });

        it("preCreateItem refuse la création et n'évalue pas le plafond", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(false);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(true);

            expect(getHook("preCreateItem")({type: "class"}, {}, {isAdvancement: true}, "user-1")).toBe(false);
            expect(TradingCards.checkClassLevelCap).not.toHaveBeenCalled();
        });

        it("preDeleteItem refuse la suppression", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(false);

            expect(getHook("preDeleteItem")({type: "class"}, {isAdvancement: true}, "user-1")).toBe(false);
        });

        it("preDeleteItem laisse passer quand le personnage a bien un porteur", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(true);

            expect(getHook("preDeleteItem")({type: "class"}, {isAdvancement: true}, "user-1")).toBe(true);
        });
    });

    describe("plafond de niveau de classe", () => {
        it("preUpdateItem refuse la mise à jour quand le plafond est dépassé", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(true);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(false);
            const document = {type: "class"};
            const changed = {system: {levels: 13}};

            expect(getHook("preUpdateItem")(document, changed, {}, "user-1")).toBe(false);
            expect(TradingCards.checkClassLevelCap).toHaveBeenCalledWith(document, changed);
        });

        it("preCreateItem refuse la création d'une classe déjà au-delà du plafond", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(true);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(false);
            const document = {type: "class", system: {levels: 13}};

            expect(getHook("preCreateItem")(document, {}, {}, "user-1")).toBe(false);
            expect(TradingCards.checkClassLevelCap).toHaveBeenCalledWith(document, document);
        });

        it("preUpdateItem laisse passer sous le plafond", () => {
            vi.spyOn(TradingCards, "checkIfCanUpdateClasses").mockReturnValue(true);
            vi.spyOn(TradingCards, "checkClassLevelCap").mockReturnValue(true);

            expect(getHook("preUpdateItem")({type: "class"}, {system: {levels: 12}}, {}, "user-1")).toBe(true);
        });
    });
});
