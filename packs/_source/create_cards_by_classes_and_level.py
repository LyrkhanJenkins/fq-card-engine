import json
import copy
import secrets
import string
import os


def write_location_decks(originFile, language):
    try:
        with open(originFile, 'r', encoding='utf-8') as cards_json:
            donnees_json = json.load(cards_json)
            new_cards = copy.deepcopy(donnees_json)
            # Define the characters that can be used in the password
            characters = string.ascii_letters + string.digits
            password_length = 16
            deck_id = ''.join(secrets.choice(characters) for _ in range(password_length))
            new_cards['_id'] = deck_id
            new_cards['name'] = new_cards['name'] + " - " + language
            new_cards['_key'] = "!cards!" + deck_id
            new_cards['cards'] = []
            new_cards['img'] = new_cards['img'].replace("/en/", "/" + language + "/")
            for card in donnees_json['cards']:
                new_card = copy.deepcopy(card)
                card_id = ''.join(secrets.choice(characters) for _ in range(password_length))
                new_card['_id'] = card_id
                new_card['_key'] = "!cards.cards!" + deck_id + '.' + card_id
                for face in new_card['faces']:
                    face['img'] = face['img'].replace("/en/", "/" + language + "/")
                new_cards['cards'].append(new_card)
            newligne = json.dumps(new_cards)
            return newligne
    except FileNotFoundError:
        print(f"Le fichier {originFile} n'existe pas.")


def write_generated_decks(name, tableau, cards, targetFolder):
    try:
        with open(targetFolder + cards, 'r', encoding='utf-8') as cards_json:
            donnees_json = json.load(cards_json)
            new_cards = copy.deepcopy(donnees_json)
            # Define the characters that can be used in the password
            characters = string.ascii_letters + string.digits
            password_length = 16
            deck_id = ''.join(secrets.choice(characters) for _ in range(password_length))
            new_cards['name'] = name
            new_cards['_id'] = deck_id
            new_cards['_key'] = "!cards!" + deck_id
            new_cards['cards'] = []
            for mot in tableau:
                for card in donnees_json['cards']:
                    if card.get('name').lower().strip() == mot.lower().strip():
                        new_card = copy.deepcopy(card)
                        card_id = ''.join(secrets.choice(characters) for _ in range(password_length))
                        new_card['_id'] = card_id
                        new_card['_key'] = "!cards.cards!" + deck_id + '.' + card_id
                        new_cards['cards'].append(new_card)
            newligne = json.dumps(new_cards)
            return newligne
    except FileNotFoundError:
        print(f"Le fichier {cards} n'existe pas.")


listes_cards = {
    'Elementalist Lvl1': ["Fireball", "Tornado", "Earth Fracture", "Earth Fracture", "Frost Strike", "Frost Strike",
                          "Mana Recovery III"],
    'Illusionist Lvl1': ["Backflip Strike", "Illusory Strike", "Illusory Strike", "Enchanted Whip", "Enchanted Whip",
                         "Enchanted Whip", "Sung Inspiration", "Magic Reach", "Communicating Vessels",
                         "Poisoned Shuriken"],
    'Trapper Lvl1': ["Precise Shot", "Precise Shot", "Precise Shot", "Double Arrows", "Tamed Wolf", "Elite Marksman",
                     "Rain of Arrows"],
    'White-Mage Lvl1': ["Light Energy", "Light Energy", "Light Energy", "Curse", "Curse", "Magic Shield",
                        "Arcane Explosion"],
    'Monk Lvl1': ["Right Punch", "Right Punch", "Right Punch", "Right Punch", "Right Punch", "Right Punch",
                  "Left Punch", "Left Punch", "Left Punch", "Combo", "Combo", "Mana Recovery III", "Zealous Shield",
                  "Zealous Shield"],
    'Guardian Lvl1': ["Heroic strike", "Heroic strike", "Heroic strike", "Heroic strike", "Sharpening", "Sharpening",
                      "Taunting Strike", "Taunting Strike"],
    'Witch Lvl1': ["Mana Recover II", "Necromancy", "Green-Shadow Bolt", "Green-Shadow Bolt", "Green-Shadow Bolt",
                   "Green-Shadow Bolt", "Green-Shadow Bolt"]
}

listes_cards['Witch Lvl2'] = listes_cards['Witch Lvl1'] + ["Life Surge", "Mana Surge", "Square of Skeletons",
                                                           "Turn Booster IV", "Bone Shield", "Green-Shadow Bolt"]
listes_cards['Witch Lvl3'] = listes_cards['Witch Lvl2'] + ["Life Surge", "Mana Recover II", "Shadow Explosion",
                                                           "Necromancy", "Draw II", "Giant Skeleton",
                                                           "Green-Shadow Bolt"]
listes_cards['Witch Lvl4'] = listes_cards['Witch Lvl3'] + ["Life Surge", "Shadow Channeling", "Shadow Channeling",
                                                           "Square of Skeletons", "Turn Booster IV", "Necromancy",
                                                           "Giant Skeleton", "Green-Shadow Bolt"]
listes_cards['Witch Lvl5'] = listes_cards['Witch Lvl4'] + ["Mana Surge", "Power Surge", "Shadow Form", "Shadow Form",
                                                           "Agility Surge", "Bone Shield", "Draw II",
                                                           "Green-Shadow Bolt"]

listes_cards['Guardian Lvl2'] = listes_cards['Guardian Lvl1'] + ["Charge", "Charge", "Draw II", "Turn Booster IV",
                                                                 "Hemorrhage", "Hemorrhage"]
listes_cards['Guardian Lvl3'] = listes_cards['Guardian Lvl2'] + ["Heroic strike", "Heroic strike", "Mana Surge",
                                                                 "Mana Recover I", "Blade Charging",
                                                                 "Armor Reinforcement", "Blade Whirlwind"]
listes_cards['Guardian Lvl4'] = listes_cards['Guardian Lvl3'] + ["Mana Surge", "Draw II", "Turn Booster IV",
                                                                 "Shield Bash", "Shield Bash", "Hemorrhage",
                                                                 "Hemorrhage", "Ultimate Rage"]
listes_cards['Guardian Lvl5'] = listes_cards['Guardian Lvl4'] + ["Mana Surge", "Mana Recover I", "Rage Surge",
                                                                 "Powerful Strike", "Powerful Strike",
                                                                 "Armor Reinforcement", "Blade Whirlwind"]

listes_cards['Monk Lvl2'] = listes_cards['Monk Lvl1'] + ["Left Punch", "Left Punch", "Inhibiting Cape", "Quick Dodge"]
listes_cards['Monk Lvl3'] = listes_cards['Monk Lvl2'] + ["Turn Booster V", "Inhibiting Cape", "Zen Meditation",
                                                         "Zealous Shield", "Mana Recovery III", "Phantom Blade"]
listes_cards['Monk Lvl4'] = listes_cards['Monk Lvl3'] + ["Inhibiting Cape", "Combo", "Concealment", "Conversion",
                                                         "Ki Breath", "Turn Booster V"]
listes_cards['Monk Lvl5'] = listes_cards['Monk Lvl4'] + ["Secret Weapons", "Quick Dodge", "Concealment",
                                                         "Zen Meditation", "Flash Move", "Phantom Blade"]

listes_cards['White-Mage Lvl2'] = listes_cards['White-Mage Lvl1'] + ["Light Energy", "Light Energy", "Curse",
                                                                     "Magic Shield", "Mana Recovery III",
                                                                     "Arcane Explosion"]
listes_cards['White-Mage Lvl3'] = listes_cards['White-Mage Lvl2'] + ["Draw III", "Light Energy", "Magic Shield",
                                                                     "Instant Curse", "Mana Recovery III",
                                                                     "Emergency Healing", "Mana Infusion"]
listes_cards['White-Mage Lvl4'] = listes_cards['White-Mage Lvl3'] + ["Magic Shield", "Exorcism", "Exorcism",
                                                                     "Instant Curse", "Turn Booster V",
                                                                     "Vengeful Shield", "Empathetic Shield",
                                                                     "Arcane Explosion"]
listes_cards['White-Mage Lvl5'] = listes_cards['White-Mage Lvl4'] + ["Draw III", "Instant Curse", "Turn Booster V",
                                                                     "Epiphany", "Epiphany", "Light Strike",
                                                                     "Divine Shield", "Mana Shield"]

listes_cards['Trapper Lvl2'] = listes_cards['Trapper Lvl1'] + ["Draw II", "Mana Recovery II", "Trap", "Precise Shot",
                                                               "Reflex Shot"]
listes_cards['Trapper Lvl3'] = listes_cards['Trapper Lvl2'] + ["Poisoned Shot", "Poisoned Shot", "Piercing Shot",
                                                               "Draw II", "Precise Shot", "Turn Booster IV"]
listes_cards['Trapper Lvl4'] = listes_cards['Trapper Lvl3'] + ["Elite Marksman", "Turn Booster IV", "Double Arrows",
                                                               "Precise Shot", "Mana Recovery II", "Ambush", "Ambush",
                                                               "Trap", "Rain of Arrows"]
listes_cards['Trapper Lvl5'] = listes_cards['Trapper Lvl4'] + ["Reflex Shot", "Supersonic Shot", "Supersonic Shot",
                                                               "Explosive Shot", "Explosive Shot", "Precise Shot",
                                                               "Tamed Wolf", "Poisoned Shot", "Weak Point Study"]

listes_cards['Illusionist Lvl2'] = listes_cards['Illusionist Lvl1'] + ["Mirror Images", "Sung Inspiration",
                                                                       "Side Attack", "Draw II"]
listes_cards['Illusionist Lvl3'] = listes_cards['Illusionist Lvl2'] + ["Draw III", "Mana Drain",
                                                                       "Ethereal Plane Passage", "Shuriken", "Shuriken",
                                                                       "Poisoned Shuriken"]
listes_cards['Illusionist Lvl4'] = listes_cards['Illusionist Lvl3'] + ["Magic Reach", "Magic Reach", "Apothecary I",
                                                                       "Diagonal Attack", "Black Plague",
                                                                       "Communicating Vessels", "Fevered Dance",
                                                                       "Mirror Images"]
listes_cards['Illusionist Lvl5'] = listes_cards['Illusionist Lvl4'] + ["Fevered Dance", "Dagger Cloud",
                                                                       "Shuriken Volley", "Apothecary II",
                                                                       "Backflip Strike", "Circle Attack",
                                                                       "Illusory Strike", "Backstab"]

listes_cards['Elementalist Lvl2'] = listes_cards['Elementalist Lvl1'] + ["Draw III", "Mana Capture", "Frostfire", "Fog",
                                                                         "Tornado"]
listes_cards['Elementalist Lvl3'] = listes_cards['Elementalist Lvl2'] + ["Turn Booster IV", "Tornado", "Fireball",
                                                                         "Meteor", "Frost Strike", "Mana Capture"]
listes_cards['Elementalist Lvl4'] = listes_cards['Elementalist Lvl3'] + ["Earth Fracture", "Incantation", "Incantation",
                                                                         "Draw III", "Fireball", "Ice Wave",
                                                                         "Damage Propagation", "Fire Shock"]
listes_cards['Elementalist Lvl5'] = listes_cards['Elementalist Lvl4'] + ["Turn Booster IV", "Mana Capture", "Tornado",
                                                                         "Earth Fracture", "Frost Strike", "Fireball",
                                                                         "Mana Recovery III", "Void Assassin",
                                                                         "Incantation", "Magic Plastron"]

cardsGeneratedPackFolder = "./decks-fq8-generated/"
cardsPackFolder = "./decks-fq8/"
cardsOriginPackFolder = "./decks-pattern-fq8/"
supportedLanguages = ["en", "fr"]

os.makedirs(cardsPackFolder, exist_ok=True)
os.makedirs(cardsGeneratedPackFolder, exist_ok=True)
for language in supportedLanguages:
    for filename in os.listdir(cardsOriginPackFolder):
        with open(cardsPackFolder + filename[:-5] + "-" + language + ".json", 'w',
                  encoding="utf-8") as new_file:
            new_file.writelines(write_location_decks(cardsOriginPackFolder + filename, language))

    for cle, liste in listes_cards.items():
        name_file = cle.lower().split(" ")[0] + "-base-" + language + ".json"
        with open(cardsGeneratedPackFolder + cle.lower().replace(" ", "-") + "-" + language + ".json", 'w',
                  encoding="utf-8") as new_file:
            new_file.writelines(write_generated_decks(cle + " - " + language, liste, name_file, cardsPackFolder))
