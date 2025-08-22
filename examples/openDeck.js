socket = socketlib.registerModule(FqCardEngineModule.moduleName);
socket.executeAsGM("createDeckForUser", game.userId);

let deckName = "Deck de " + game.user.character.name;
let deck = game.cards.find(c => c.name === deckName);
if (deck) {
    deck.sheet.render(true, {
        left: 110,
        top: 100
    });
}
game.user.character.update({"flags.fq": { ...game.user.character.flags.fq, ...{ bladeCharging: charging } }})

let spellBookName = "Bibliothèque de " + game.user.character.name;
let spellBook = game.cards.find(c => c.name === spellBookName);
if (spellBook) {
    spellBook.sheet.render(true, {
        left: 110 + deck.sheet.position.width,
        top: 100
    });
}
