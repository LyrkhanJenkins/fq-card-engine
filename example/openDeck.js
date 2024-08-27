if (!game.user?.character?.name) {
    ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
    return;
}
let mainClass = Object.values(game.user?.character?.classes)?.length ? Object.values(game.user?.character?.classes)[0] : null;
var compendium = await game.packs.get(FqCardEngineModule.moduleName + ".decks-fq8-generated").getDocuments();
var nameOriginDeck = mainClass?.name + " Niv" + (mainClass?.system?.levels > 5 ? 5 : mainClass?.system?.levels)
var originDeck = compendium.find(pack => pack.name === nameOriginDeck);
if (!mainClass || !originDeck) {
    ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoMainClass"));
    return;
}
let deckName = "Deck de " + game.user.character.name;
// TODO gérer les cas de multiples decks / piles ou mains
let deck = game.cards.find(c => c.name === deckName)
if (!deck) {
    // TODO utiliser une socket GM?
    deck = await Cards.create({...originDeck, name: deckName, type: "deck"})
    await deck.createEmbeddedDocuments("Card", [...originDeck.cards] );
}
deck.sheet.render(true, {
    left: 20,
    top: 20
});
