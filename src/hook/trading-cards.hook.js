import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../domain/trading/trading-cards.js";

Hooks.on("passCards", (from, to, action) => {
    if (from.system.fq.type === "SPELLBOOK" && to.system.fq.type !== "DECK") {
        ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningOnlyCopyCardFromSpellBookToDeck"));
        return false;
    }
    if (from.type === "deck" && to.type === "deck" && (to.system.fq.type || from.system.fq.type)) {
        if (to.system.fq.type !== DECK_TYPE && from.system.fq.type !== SPELLBOOK_TYPE) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningOnlyCopyCardFromSpellBookToDeck"));
        } else if (!TradingCards.canPassCardsToDeck(to, action)) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningReachMaxCardsForDeck"));
        } else {
            to.createEmbeddedDocuments("Card", [...action.toCreate], {keepId: false});
        }
        return false;
    }
    return true;
});

Hooks.on("preDeleteCard", (card, options, _userId) => TradingCards.canDeleteDeckCard(card, options));

Hooks.on("updateUser", (user, changed, _options, userId) => TradingCards.updateDeckWhenAssigned(user, changed, userId));

Hooks.on("preCreateCard",(card, data, _options, _userId) => {
    const faces = foundry.utils.deepClone(data.faces ?? []);

    if (faces[0]?.img === foundry.documents.BaseCard.DEFAULT_ICON) {
        faces[0].img = "modules/fq-card-engine/images/cards/in_progress.png";
        card.updateSource({ faces });
    }
});
