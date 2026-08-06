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
            const document = {type: "class"};
            const options = {isAdvancement: true, parent: {id: "parent-id"}};

            getHook("preUpdateItem")(document, {}, options, "user-1");
            getHook("preCreateItem")(document, options, "user-1");
            getHook("preDeleteItem")(document, options, "user-1");

            expect(TradingCards.checkIfCanUpdateClasses).toHaveBeenCalledTimes(3);
            expect(TradingCards.checkIfCanUpdateClasses).toHaveBeenCalledWith(document, options);
        });
    });
});
