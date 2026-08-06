import TradingCards from "../domain/trading/trading-cards.js";

// Synchronisation des decks lors des opérations CRUD sur les objets (classes).
Hooks.on("preUpdateItem", (document, changed, options, _userId) => {
    TradingCards.checkIfCanUpdateClasses(document, options);
});
Hooks.on("updateItem", (document, changed, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
Hooks.on("preCreateItem", (document, options, _userId) => {
    TradingCards.checkIfCanUpdateClasses(document, options);
});
Hooks.on("createItem", (document, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
Hooks.on("preDeleteItem", (document, options, _userId) => {
    TradingCards.checkIfCanUpdateClasses(document, options);
});
Hooks.on("deleteItem", (document, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
