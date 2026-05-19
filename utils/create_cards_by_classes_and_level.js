// create_cards_by_classes_and_level.js
const fs = require("fs");
const path = require("path");

// 🔑 Génération d’ID aléatoire
function randomId(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
                if (card.name === mot) {
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
        console.error(err);
    }
}

let listesCards = {
    "Elementalist Lvl1": [
        "FQCARDTITLE.Fireball",
        "FQCARDTITLE.Tornado",
        "FQCARDTITLE.EarthFracture",
        "FQCARDTITLE.EarthFracture",
        "FQCARDTITLE.FrostStrike",
        "FQCARDTITLE.FrostStrike",
        "FQCARDTITLE.ManaRecoveryIII"
    ],

    "Illusionist Lvl1": [
        "FQCARDTITLE.BackflipStrike",
        "FQCARDTITLE.IllusoryStrike",
        "FQCARDTITLE.IllusoryStrike",
        "FQCARDTITLE.EnchantedWhip",
        "FQCARDTITLE.EnchantedWhip",
        "FQCARDTITLE.EnchantedWhip",
        "FQCARDTITLE.SungInspiration",
        "FQCARDTITLE.MagicReach",
        "FQCARDTITLE.CommunicatingVessels",
        "FQCARDTITLE.PoisonedShuriken"
    ],

    "Trapper Lvl1": [
        "FQCARDTITLE.PreciseShot",
        "FQCARDTITLE.PreciseShot",
        "FQCARDTITLE.PreciseShot",
        "FQCARDTITLE.DoubleArrows",
        "FQCARDTITLE.TamedWolf",
        "FQCARDTITLE.EliteMarksman",
        "FQCARDTITLE.RainOfArrows"
    ],

    "White-Mage Lvl1": [
        "FQCARDTITLE.LightEnergy",
        "FQCARDTITLE.LightEnergy",
        "FQCARDTITLE.LightEnergy",
        "FQCARDTITLE.Curse",
        "FQCARDTITLE.Curse",
        "FQCARDTITLE.MagicShield",
        "FQCARDTITLE.ArcaneExplosion"
    ],

    "Monk Lvl1": [
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.RightPunch",
        "FQCARDTITLE.LeftPunch",
        "FQCARDTITLE.LeftPunch",
        "FQCARDTITLE.LeftPunch",
        "FQCARDTITLE.Combo",
        "FQCARDTITLE.Combo",
        "FQCARDTITLE.ManaRecoveryIII",
        "FQCARDTITLE.ZealousShield",
        "FQCARDTITLE.ZealousShield"
    ],

    "Guardian Lvl1": [
        "FQCARDTITLE.HeroicStrike",
        "FQCARDTITLE.HeroicStrike",
        "FQCARDTITLE.HeroicStrike",
        "FQCARDTITLE.HeroicStrike",
        "FQCARDTITLE.Sharpening",
        "FQCARDTITLE.Sharpening",
        "FQCARDTITLE.TauntingStrike",
        "FQCARDTITLE.TauntingStrike"
    ],

    "Witch Lvl1": [
        "FQCARDTITLE.ManaRecoveryII",
        "FQCARDTITLE.Necromancy",
        "FQCARDTITLE.GreenShadowBolt",
        "FQCARDTITLE.GreenShadowBolt",
        "FQCARDTITLE.GreenShadowBolt",
        "FQCARDTITLE.GreenShadowBolt",
        "FQCARDTITLE.GreenShadowBolt"
    ]
};

// WITCH
listesCards["Witch Lvl2"] = listesCards["Witch Lvl1"].concat([
    "FQCARDTITLE.ShadowSpell",
    "FQCARDTITLE.LifeInflux",
    "FQCARDTITLE.ManaInflux",
    "FQCARDTITLE.SquareOfSkeletons",
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.BoneShield",
    "FQCARDTITLE.GreenShadowBolt"
]);

listesCards["Witch Lvl3"] = listesCards["Witch Lvl2"].concat([
    "FQCARDTITLE.Osteology",
    "FQCARDTITLE.LifeInflux",
    "FQCARDTITLE.ManaRecoveryII",
    "FQCARDTITLE.ShadowExplosion",
    "FQCARDTITLE.Necromancy",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.GiantSkeleton",
    "FQCARDTITLE.GreenShadowBolt"
]);

listesCards["Witch Lvl4"] = listesCards["Witch Lvl3"].concat([
    "FQCARDTITLE.LifeInflux",
    "FQCARDTITLE.ShadowChanneling",
    "FQCARDTITLE.ShadowChanneling",
    "FQCARDTITLE.SquareOfSkeletons",
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.Necromancy",
    "FQCARDTITLE.GiantSkeleton",
    "FQCARDTITLE.GreenShadowBolt"
]);

listesCards["Witch Lvl5"] = listesCards["Witch Lvl4"].concat([
    "FQCARDTITLE.ManaInflux",
    "FQCARDTITLE.PowerInflux",
    "FQCARDTITLE.ShadowForm",
    "FQCARDTITLE.ShadowForm",
    "FQCARDTITLE.AgilityInflux",
    "FQCARDTITLE.BoneShield",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.Green-ShadowBolt"
]);

// GUARDIAN
listesCards["Guardian Lvl2"] = listesCards["Guardian Lvl1"].concat([
    "FQCARDTITLE.Charge",
    "FQCARDTITLE.Charge",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.Hemorrhage",
    "FQCARDTITLE.Hemorrhage"
]);

listesCards["Guardian Lvl3"] = listesCards["Guardian Lvl2"].concat([
    "FQCARDTITLE.StanceShift",
    "FQCARDTITLE.HeroicStrike",
    "FQCARDTITLE.HeroicStrike",
    "FQCARDTITLE.ManaSurge",
    "FQCARDTITLE.ManaRecoveryI",
    "FQCARDTITLE.BladeCharging",
    "FQCARDTITLE.ArmorReinforcement",
    "FQCARDTITLE.BladeWhirlwind"
]);

listesCards["Guardian Lvl4"] = listesCards["Guardian Lvl3"].concat([
    "FQCARDTITLE.ManaSurge",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.ShieldBash",
    "FQCARDTITLE.ShieldBash",
    "FQCARDTITLE.Hemorrhage",
    "FQCARDTITLE.Hemorrhage",
    "FQCARDTITLE.UltimateRage"
]);

listesCards["Guardian Lvl5"] = listesCards["Guardian Lvl4"].concat([
    "FQCARDTITLE.ManaSurge",
    "FQCARDTITLE.ManaRecoveryI",
    "FQCARDTITLE.RageSurge",
    "FQCARDTITLE.PowerfulStrike",
    "FQCARDTITLE.PowerfulStrike",
    "FQCARDTITLE.ArmorReinforcement",
    "FQCARDTITLE.BladeWhirlwind"
]);

// MONK
listesCards["Monk Lvl2"] = listesCards["Monk Lvl1"].concat([
    "FQCARDTITLE.LeftPunch",
    "FQCARDTITLE.LeftPunch",
    "FQCARDTITLE.InhibitingCape",
    "FQCARDTITLE.QuickDodge"
]);

listesCards["Monk Lvl3"] = listesCards["Monk Lvl2"].concat([
    "FQCARDTITLE.TurnBoosterV",
    "FQCARDTITLE.InhibitingCape",
    "FQCARDTITLE.ZenMeditation",
    "FQCARDTITLE.ZealousShield",
    "FQCARDTITLE.ManaRecoveryIII",
    "FQCARDTITLE.PhantomBlade"
]);

listesCards["Monk Lvl4"] = listesCards["Monk Lvl3"].concat([
    "FQCARDTITLE.ChiMaster",
    "FQCARDTITLE.InhibitingCape",
    "FQCARDTITLE.Combo",
    "FQCARDTITLE.Concealment",
    "FQCARDTITLE.Conversion",
    "FQCARDTITLE.KiBreath",
    "FQCARDTITLE.TurnBoosterV"
]);

listesCards["Monk Lvl5"] = listesCards["Monk Lvl4"].concat([
    "FQCARDTITLE.SecretWeapons",
    "FQCARDTITLE.QuickDodge",
    "FQCARDTITLE.Concealment",
    "FQCARDTITLE.ZenMeditation",
    "FQCARDTITLE.FlashMove",
    "FQCARDTITLE.PhantomBlade"
]);

// WHITE MAGE
listesCards["White-Mage Lvl2"] = listesCards["White-Mage Lvl1"].concat([
    "FQCARDTITLE.Heal",
    "FQCARDTITLE.LightEnergy",
    "FQCARDTITLE.LightEnergy",
    "FQCARDTITLE.Curse",
    "FQCARDTITLE.MagicShield",
    "FQCARDTITLE.ManaRecoveryIII",
    "FQCARDTITLE.ArcaneExplosion"
]);

listesCards["White-Mage Lvl3"] = listesCards["White-Mage Lvl2"].concat([
    "FQCARDTITLE.DrawIII",
    "FQCARDTITLE.LightEnergy",
    "FQCARDTITLE.MagicShield",
    "FQCARDTITLE.InstantCurse",
    "FQCARDTITLE.ManaRecoveryIII",
    "FQCARDTITLE.EmergencyHealing",
    "FQCARDTITLE.ManaInfusion"
]);

listesCards["White-Mage Lvl4"] = listesCards["White-Mage Lvl3"].concat([
    "FQCARDTITLE.MagicShield",
    "FQCARDTITLE.Exorcism",
    "FQCARDTITLE.Exorcism",
    "FQCARDTITLE.InstantCurse",
    "FQCARDTITLE.TurnBoosterV",
    "FQCARDTITLE.VengefulShield",
    "FQCARDTITLE.EmpatheticShield",
    "FQCARDTITLE.ArcaneExplosion"
]);

listesCards["White-Mage Lvl5"] = listesCards["White-Mage Lvl4"].concat([
    "FQCARDTITLE.GoodAndEvil",
    "FQCARDTITLE.DrawIII",
    "FQCARDTITLE.InstantCurse",
    "FQCARDTITLE.TurnBoosterV",
    "FQCARDTITLE.Epiphany",
    "FQCARDTITLE.Epiphany",
    "FQCARDTITLE.LightStrike",
    "FQCARDTITLE.DivineShield",
    "FQCARDTITLE.ManaShield"
]);

// TRAPPER
listesCards["Trapper Lvl2"] = listesCards["Trapper Lvl1"].concat([
    "FQCARDTITLE.AdjustedShot",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.ManaRecoveryII",
    "FQCARDTITLE.Trap",
    "FQCARDTITLE.PreciseShot",
    "FQCARDTITLE.ReflexShot"
]);

listesCards["Trapper Lvl3"] = listesCards["Trapper Lvl2"].concat([
    "FQCARDTITLE.PoisonedShot",
    "FQCARDTITLE.PoisonedShot",
    "FQCARDTITLE.PiercingShot",
    "FQCARDTITLE.DrawII",
    "FQCARDTITLE.PreciseShot",
    "FQCARDTITLE.TurnBoosterIV"
]);

listesCards["Trapper Lvl4"] = listesCards["Trapper Lvl3"].concat([
    "FQCARDTITLE.EliteMarksman",
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.DoubleArrows",
    "FQCARDTITLE.PreciseShot",
    "FQCARDTITLE.ManaRecoveryII",
    "FQCARDTITLE.Ambush",
    "FQCARDTITLE.Ambush",
    "FQCARDTITLE.Trap",
    "FQCARDTITLE.RainOfArrows"
]);

listesCards["Trapper Lvl5"] = listesCards["Trapper Lvl4"].concat([
    "FQCARDTITLE.ReflexShot",
    "FQCARDTITLE.SupersonicShot",
    "FQCARDTITLE.SupersonicShot",
    "FQCARDTITLE.ExplosiveShot",
    "FQCARDTITLE.ExplosiveShot",
    "FQCARDTITLE.PreciseShot",
    "FQCARDTITLE.TamedWolf",
    "FQCARDTITLE.PoisonedShot",
    "FQCARDTITLE.WeakPointStudy"
]);

// ILLUSIONIST
listesCards["Illusionist Lvl2"] = listesCards["Illusionist Lvl1"].concat([
    "FQCARDTITLE.EnchantedRapier",
    "FQCARDTITLE.MirrorImages",
    "FQCARDTITLE.SungInspiration",
    "FQCARDTITLE.SideAttack",
    "FQCARDTITLE.DrawII"
]);

listesCards["Illusionist Lvl3"] = listesCards["Illusionist Lvl2"].concat([
    "FQCARDTITLE.DrawIII",
    "FQCARDTITLE.ManaDrain",
    "FQCARDTITLE.EtherealPlanePassage",
    "FQCARDTITLE.Shuriken",
    "FQCARDTITLE.Shuriken",
    "FQCARDTITLE.PoisonedShuriken"
]);

listesCards["Illusionist Lvl4"] = listesCards["Illusionist Lvl3"].concat([
    "FQCARDTITLE.MagicReach",
    "FQCARDTITLE.MagicReach",
    "FQCARDTITLE.ApothecaryI",
    "FQCARDTITLE.DiagonalAttack",
    "FQCARDTITLE.BlackPlague",
    "FQCARDTITLE.CommunicatingVessels",
    "FQCARDTITLE.FeveredDance",
    "FQCARDTITLE.MirrorImages"
]);

listesCards["Illusionist Lvl5"] = listesCards["Illusionist Lvl4"].concat([
    "FQCARDTITLE.FeveredDance",
    "FQCARDTITLE.DaggerCloud",
    "FQCARDTITLE.ShurikenVolley",
    "FQCARDTITLE.ApothecaryII",
    "FQCARDTITLE.BackflipStrike",
    "FQCARDTITLE.CircleAttack",
    "FQCARDTITLE.IllusoryStrike",
    "FQCARDTITLE.Backstab"
]);

// ELEMENTALIST
listesCards["Elementalist Lvl2"] = listesCards["Elementalist Lvl1"].concat([
    "FQCARDTITLE.ElementalMagic",
    "FQCARDTITLE.DrawIII",
    "FQCARDTITLE.ManaCapture",
    "FQCARDTITLE.Frostfire",
    "FQCARDTITLE.Fog",
    "FQCARDTITLE.Tornado"
]);

listesCards["Elementalist Lvl3"] = listesCards["Elementalist Lvl2"].concat([
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.Tornado",
    "FQCARDTITLE.Fireball",
    "FQCARDTITLE.Meteor",
    "FQCARDTITLE.FrostStrike",
    "FQCARDTITLE.ManaCapture"
]);

listesCards["Elementalist Lvl4"] = listesCards["Elementalist Lvl3"].concat([
    "FQCARDTITLE.EarthFracture",
    "FQCARDTITLE.Incantation",
    "FQCARDTITLE.Incantation",
    "FQCARDTITLE.DrawIII",
    "FQCARDTITLE.Fireball",
    "FQCARDTITLE.IceWave",
    "FQCARDTITLE.DamagePropagation",
    "FQCARDTITLE.FireShock"
]);

listesCards["Elementalist Lvl5"] = listesCards["Elementalist Lvl4"].concat([
    "FQCARDTITLE.TurnBoosterIV",
    "FQCARDTITLE.ManaCapture",
    "FQCARDTITLE.Tornado",
    "FQCARDTITLE.EarthFracture",
    "FQCARDTITLE.FrostStrike",
    "FQCARDTITLE.Fireball",
    "FQCARDTITLE.ManaRecoveryIII",
    "FQCARDTITLE.VoidAssassin",
    "FQCARDTITLE.Incantation",
    "FQCARDTITLE.MagicPlastron"
]);

// 📂 Répertoires
const packsSource = "./packs/_source/";
const cardsGeneratedPackFolder = packsSource + "./decks-fq8-generated/";
const cardsOriginPackFolder = packsSource + "./decks-pattern-fq8/";

// Assure que les dossiers existent
fs.mkdirSync(cardsGeneratedPackFolder, {recursive: true});

for (const [cle, liste] of Object.entries(listesCards)) {
    const nameFile = `${cle.toLowerCase().split(" ")[0]}-base.json`;
    const outputPath = path.join(cardsGeneratedPackFolder, `${cle.toLowerCase().replace(/ /g, "-")}.json`);
    const data = writeGeneratedDecks(`${cle}`, liste, nameFile, cardsOriginPackFolder);
    fs.writeFileSync(outputPath, data, "utf-8");
}
console.info("✅ Decks générés !");
