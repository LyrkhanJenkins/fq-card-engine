import TradingCards from "../domain/trading/trading-cards.js";

// Synchronisation des decks lors des opérations CRUD sur les objets (classes).
// Les hooks `pre*` renvoient un verdict : Foundry annule l'opération sur un
// retour false. Deux gardes s'y enchaînent — la présence d'un utilisateur
// porteur du personnage, puis le plafond de niveau de classe FQ — et la
// première qui refuse court-circuite la suivante.
// Attention aux signatures Foundry : `preCreateItem` reçoit
// `(document, data, options, userId)`, les options sont donc en troisième
// position, alors que `preDeleteItem` les reçoit en deuxième.
Hooks.on("preUpdateItem", (document, changed, options, _userId) => {
    if (!TradingCards.checkIfCanUpdateClasses(document, options)) return false;
    return TradingCards.checkClassLevelCap(document, changed);
});
Hooks.on("updateItem", (document, changed, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
Hooks.on("preCreateItem", (document, _data, options, _userId) => {
    if (!TradingCards.checkIfCanUpdateClasses(document, options)) return false;
    return TradingCards.checkClassLevelCap(document, document);
});
Hooks.on("createItem", (document, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
Hooks.on("preDeleteItem", (document, options, _userId) => {
    return TradingCards.checkIfCanUpdateClasses(document, options);
});
Hooks.on("deleteItem", (document, options, _userId) => {
    TradingCards.updateDeckWhenChange(document, options);
});
