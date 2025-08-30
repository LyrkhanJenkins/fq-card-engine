// create_cards_by_classes_and_level.js
const fs = require("fs");
const path = require("path");

// 🔑 Génération d’ID aléatoire
function randomId(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// 📦 Génère un deck localisé à partir d’un fichier modèle
function writeLocationDecks(originFile, language) {
    try {
        const raw = fs.readFileSync(originFile, "utf-8");
        const donneesJson = JSON.parse(raw);
        const newCards = structuredClone(donneesJson);

        const deckId = randomId();
        newCards._id = deckId;
        newCards.name = `${newCards.name} - ${language}`;
        newCards._key = `!cards!${deckId}`;
        newCards.cards = [];
        newCards.img = newCards.img.replace("/en/", `/${language}/`);

        for (const card of donneesJson.cards) {
            const newCard = structuredClone(card);
            const cardId = randomId();
            newCard._id = cardId;
            newCard._key = `!cards.cards!${deckId}.${cardId}`;

            for (const face of newCard.faces) {
                face.img = face.img.replace("/en/", `/${language}/`);
            }
            newCards.cards.push(newCard);
        }

        return JSON.stringify(newCards);
    } catch (err) {
        console.error(`Le fichier ${originFile} n'existe pas ou est invalide.`);
    }
}

// 📦 Génère un deck filtré selon une liste de noms
function writeGeneratedDecks(name, tableau, cards, targetFolder) {
    try {
        const filePath = path.join(targetFolder, cards);
        const raw = fs.readFileSync(filePath, "utf-8");
        const donneesJson = JSON.parse(raw);
        const newCards = structuredClone(donneesJson);

        const deckId = randomId();
        newCards.name = name;
        newCards._id = deckId;
        newCards._key = `!cards!${deckId}`;
        newCards.cards = [];

        for (const mot of tableau) {
            for (const card of donneesJson.cards) {
                if (card.name.toLowerCase().trim() === mot.toLowerCase().trim()) {
                    const newCard = structuredClone(card);
                    const cardId = randomId();
                    newCard._id = cardId;
                    newCard._key = `!cards.cards!${deckId}.${cardId}`;
                    newCards.cards.push(newCard);
                }
            }
        }

        return JSON.stringify(newCards);
    } catch (err) {
        console.error(`Le fichier ${cards} n'existe pas ou est invalide.`);
    }
}

// ⚙️ Définition des listes (copiées depuis ton script Python)
let listesCards = {
    "Elementalist Lvl1": ["Fireball", "Tornado", "Earth Fracture", "Earth Fracture", "Frost Strike", "Frost Strike", "Mana Recovery III"],
    "Illusionist Lvl1": ["Backflip Strike", "Illusory Strike", "Illusory Strike", "Enchanted Whip", "Enchanted Whip", "Enchanted Whip", "Sung Inspiration", "Magic Reach", "Communicating Vessels", "Poisoned Shuriken"],
    "Trapper Lvl1": ["Precise Shot", "Precise Shot", "Precise Shot", "Double Arrows", "Tamed Wolf", "Elite Marksman", "Rain of Arrows"],
    "White-Mage Lvl1": ["Light Energy", "Light Energy", "Light Energy", "Curse", "Curse", "Magic Shield", "Arcane Explosion"],
    "Monk Lvl1": ["Right Punch", "Right Punch", "Right Punch", "Right Punch", "Right Punch", "Right Punch", "Left Punch", "Left Punch", "Left Punch", "Combo", "Combo", "Mana Recovery III", "Zealous Shield", "Zealous Shield"],
    "Guardian Lvl1": ["Heroic strike", "Heroic strike", "Heroic strike", "Heroic strike", "Sharpening", "Sharpening", "Taunting Strike", "Taunting Strike"],
    "Witch Lvl1": ["Mana Recover II", "Necromancy", "Green-Shadow Bolt", "Green-Shadow Bolt", "Green-Shadow Bolt", "Green-Shadow Bolt", "Green-Shadow Bolt"]
};

listesCards["Witch Lvl2"] = listesCards["Witch Lvl1"].concat(["Life Surge", "Mana Surge", "Square of Skeletons", "Turn Booster IV", "Bone Shield", "Green-Shadow Bolt"]);
listesCards["Witch Lvl3"] = listesCards["Witch Lvl2"].concat(["Life Surge", "Mana Recover II", "Shadow Explosion", "Necromancy", "Draw II", "Giant Skeleton", "Green-Shadow Bolt"]);
listesCards["Witch Lvl4"] = listesCards["Witch Lvl3"].concat(["Life Surge", "Shadow Channeling", "Shadow Channeling", "Square of Skeletons", "Turn Booster IV", "Necromancy", "Giant Skeleton", "Green-Shadow Bolt"]);
listesCards["Witch Lvl5"] = listesCards["Witch Lvl4"].concat(["Mana Surge", "Power Surge", "Shadow Form", "Shadow Form", "Agility Surge", "Bone Shield", "Draw II", "Green-Shadow Bolt"]);

listesCards["Guardian Lvl2"] = listesCards["Guardian Lvl1"].concat(["Charge", "Charge", "Draw II", "Turn Booster IV", "Hemorrhage", "Hemorrhage"]);
listesCards["Guardian Lvl3"] = listesCards["Guardian Lvl2"].concat(["Heroic strike", "Heroic strike", "Mana Surge", "Mana Recover I", "Blade Charging", "Armor Reinforcement", "Blade Whirlwind"]);
listesCards["Guardian Lvl4"] = listesCards["Guardian Lvl3"].concat(["Mana Surge", "Draw II", "Turn Booster IV", "Shield Bash", "Shield Bash", "Hemorrhage", "Hemorrhage", "Ultimate Rage"]);
listesCards["Guardian Lvl5"] = listesCards["Guardian Lvl4"].concat(["Mana Surge", "Mana Recover I", "Rage Surge", "Powerful Strike", "Powerful Strike", "Armor Reinforcement", "Blade Whirlwind"]);

listesCards["Monk Lvl2"] = listesCards["Monk Lvl1"].concat(["Left Punch", "Left Punch", "Inhibiting Cape", "Quick Dodge"]);
listesCards["Monk Lvl3"] = listesCards["Monk Lvl2"].concat(["Turn Booster V", "Inhibiting Cape", "Zen Meditation", "Zealous Shield", "Mana Recovery III", "Phantom Blade"]);
listesCards["Monk Lvl4"] = listesCards["Monk Lvl3"].concat(["Inhibiting Cape", "Combo", "Concealment", "Conversion", "Ki Breath", "Turn Booster V"]);
listesCards["Monk Lvl5"] = listesCards["Monk Lvl4"].concat(["Secret Weapons", "Quick Dodge", "Concealment", "Zen Meditation", "Flash Move", "Phantom Blade"]);

listesCards["White-Mage Lvl2"] = listesCards["White-Mage Lvl1"].concat(["Light Energy", "Light Energy", "Curse", "Magic Shield", "Mana Recovery III", "Arcane Explosion"]);
listesCards["White-Mage Lvl3"] = listesCards["White-Mage Lvl2"].concat(["Draw III", "Light Energy", "Magic Shield", "Instant Curse", "Mana Recovery III", "Emergency Healing", "Mana Infusion"]);
listesCards["White-Mage Lvl4"] = listesCards["White-Mage Lvl3"].concat(["Magic Shield", "Exorcism", "Exorcism", "Instant Curse", "Turn Booster V", "Vengeful Shield", "Empathetic Shield", "Arcane Explosion"]);
listesCards["White-Mage Lvl5"] = listesCards["White-Mage Lvl4"].concat(["Draw III", "Instant Curse", "Turn Booster V", "Epiphany", "Epiphany", "Light Strike", "Divine Shield", "Mana Shield"]);

listesCards["Trapper Lvl2"] = listesCards["Trapper Lvl1"].concat(["Draw II", "Mana Recovery II", "Trap", "Precise Shot", "Reflex Shot"]);
listesCards["Trapper Lvl3"] = listesCards["Trapper Lvl2"].concat(["Poisoned Shot", "Poisoned Shot", "Piercing Shot", "Draw II", "Precise Shot", "Turn Booster IV"]);
listesCards["Trapper Lvl4"] = listesCards["Trapper Lvl3"].concat(["Elite Marksman", "Turn Booster IV", "Double Arrows", "Precise Shot", "Mana Recovery II", "Ambush", "Ambush", "Trap", "Rain of Arrows"]);
listesCards["Trapper Lvl5"] = listesCards["Trapper Lvl4"].concat(["Reflex Shot", "Supersonic Shot", "Supersonic Shot", "Explosive Shot", "Explosive Shot", "Precise Shot", "Tamed Wolf", "Poisoned Shot", "Weak Point Study"]);

listesCards["Illusionist Lvl2"] = listesCards["Illusionist Lvl1"].concat(["Mirror Images", "Sung Inspiration", "Side Attack", "Draw II"]);
listesCards["Illusionist Lvl3"] = listesCards["Illusionist Lvl2"].concat(["Draw III", "Mana Drain", "Ethereal Plane Passage", "Shuriken", "Shuriken", "Poisoned Shuriken"]);
listesCards["Illusionist Lvl4"] = listesCards["Illusionist Lvl3"].concat(["Magic Reach", "Magic Reach", "Apothecary I", "Diagonal Attack", "Black Plague", "Communicating Vessels", "Fevered Dance", "Mirror Images"]);
listesCards["Illusionist Lvl5"] = listesCards["Illusionist Lvl4"].concat(["Fevered Dance", "Dagger Cloud", "Shuriken Volley", "Apothecary II", "Backflip Strike", "Circle Attack", "Illusory Strike", "Backstab"]);

listesCards["Elementalist Lvl2"] = listesCards["Elementalist Lvl1"].concat(["Draw III", "Mana Capture", "Frostfire", "Fog", "Tornado"]);
listesCards["Elementalist Lvl3"] = listesCards["Elementalist Lvl2"].concat(["Turn Booster IV", "Tornado", "Fireball", "Meteor", "Frost Strike", "Mana Capture"]);
listesCards["Elementalist Lvl4"] = listesCards["Elementalist Lvl3"].concat(["Earth Fracture", "Incantation", "Incantation", "Draw III", "Fireball", "Ice Wave", "Damage Propagation", "Fire Shock"]);
listesCards["Elementalist Lvl5"] = listesCards["Elementalist Lvl4"].concat(["Turn Booster IV", "Mana Capture", "Tornado", "Earth Fracture", "Frost Strike", "Fireball", "Mana Recovery III", "Void Assassin", "Incantation", "Magic Plastron"]);


// 📂 Répertoires
const packsSource = "./packs/_source/";
const cardsGeneratedPackFolder = packsSource + "./decks-fq8-generated/";
const cardsPackFolder = packsSource + "./decks-fq8/";
const cardsOriginPackFolder = packsSource + "./decks-pattern-fq8/";
const supportedLanguages = ["en", "fr"];

// Assure que les dossiers existent
fs.mkdirSync(cardsPackFolder, {recursive: true});
fs.mkdirSync(cardsGeneratedPackFolder, {recursive: true});
// 🔄 Boucle principale
for (const language of supportedLanguages) {
    for (const filename of fs.readdirSync(cardsOriginPackFolder)) {
        const originPath = path.join(cardsOriginPackFolder, filename);
        const outputPath = path.join(cardsPackFolder, `${filename.slice(0, -5)}-${language}.json`);
        const data = writeLocationDecks(originPath, language);
        fs.writeFileSync(outputPath, data, "utf-8");
    }

    for (const [cle, liste] of Object.entries(listesCards)) {
        const nameFile = `${cle.toLowerCase().split(" ")[0]}-base-${language}.json`;
        const outputPath = path.join(cardsGeneratedPackFolder, `${cle.toLowerCase().replace(/ /g, "-")}-${language}.json`);
        const data = writeGeneratedDecks(`${cle} - ${language}`, liste, nameFile, cardsPackFolder);
        fs.writeFileSync(outputPath, data, "utf-8");
    }
}

console.log("✅ Decks générés !");
