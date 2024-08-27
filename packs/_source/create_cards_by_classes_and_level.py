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
    'Elementalist Lvl1': ["Boule de feu", "Tornade", "Fracture Terrestre", "Fracture Terrestre", "Frappe de givre",
                          "Frappe de givre", "Récupération de mana"],
    'Illusionist Lvl1': ["Frappe avec salto arrière", "Frappe illusoire", "Frappe illusoire", "Fouet Enchantée",
                         "Fouet Enchantée", "Fouet Enchantée", "Inspiration chantée", "Allonge magique",
                         "Vases communicants", "Shuriken empoisonné"],
    'Trapper Lvl1': ["Tir précis", "Tir précis", "Tir précis", "Double flèches", "Louve apprivoisée",
                     "Tireur d'élite", "Pluie de flèches"],
    'White-Mage Lvl1': ["Energie Lumineuse", "Energie Lumineuse", "Energie Lumineuse", "Malédiction", "Malédiction",
                        "Bouclier magique", "Explosion d'arcanes"],
    'Monk Lvl1': ["Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup gauche",
                  "Coup gauche", "Coup gauche", "Combo", "Combo", "Récupération de mana III", "Bouclier zélé",
                  "Bouclier zélé"]
}
listes_cards['Monk Lvl2'] = listes_cards['Monk Lvl1'] + ["Coup gauche", "Coup gauche", "Cape inhibitrice",
                                                         "Vive-esquive"];
listes_cards['Monk Lvl3'] = listes_cards['Monk Lvl2'] + ["Booster de Tour V", "Cape inhibitrice", "Méditation Zen",
                                                         "Bouclier zélé", "Récupération de Mana III", "Lame fantôme"];
listes_cards['Monk Lvl4'] = listes_cards['Monk Lvl3'] + ["Cape inhibitrice", "Combo", "Dissimulation",
                                                         "Conversion", "Souffle de Ki", "Booster de Tour V"];
listes_cards['Monk Lvl5'] = listes_cards['Monk Lvl4'] + ["Armes secrètes", "Vive-esquive", "Dissimulation",
                                                         "Méditation Zen", "Déplacement éclair", "Lame fantôme"];

listes_cards['White-Mage Lvl2'] = listes_cards['White-Mage Lvl1'] + ["Energie Lumineuse", "Energie Lumineuse",
                                                                     "Malédiction", "Bouclier magique",
                                                                     "Récupération de mana III", "Explosion d'arcanes"];
listes_cards['White-Mage Lvl3'] = listes_cards['White-Mage Lvl2'] + ["Pioche III", "Energie Lumineuse",
                                                                     "Bouclier magique", "Malédiction Instantanée",
                                                                     "Récupération de mana III", "Soins d'urgence",
                                                                     "Infusion de Mana"];
listes_cards['White-Mage Lvl4'] = listes_cards['White-Mage Lvl3'] + ["Bouclier magique", "Exorcisme", "Exorcisme",
                                                                     "Malédiction Instantanée", "Booster de Tour V",
                                                                     "Bouclier vengeur", "Bouclier empathique",
                                                                     "Explosion d'arcanes"];
listes_cards['White-Mage Lvl5'] = listes_cards['White-Mage Lvl4'] + ["Pioche III", "Malédiction Instantanée",
                                                                     "Booster de Tour V", "Epiphanie", "Epiphanie",
                                                                     "Frappe de lumière", "Bouclier divin",
                                                                     "Bouclier de mana"];
listes_cards['Trapper Lvl2'] = listes_cards['Trapper Lvl1'] + ["Pioche II", "Récupération de mana", "Traquenard",
                                                               "Tir précis", "Tir Réflexe"];
listes_cards['Trapper Lvl3'] = listes_cards['Trapper Lvl2'] + ["Tir empoisonné", "Tir empoisonné", "Tir transperçant",
                                                               "Pioche II", "Tir précis", "Booster de Tour"];
listes_cards['Trapper Lvl4'] = listes_cards['Trapper Lvl3'] + ["Tireur d'élite", "Booster de tour", "Double flèches",
                                                               "Tir précis", "Récupération de mana", "Embuscade",
                                                               "Embuscade", "Traquenard", "Pluie de flèches"];
listes_cards['Trapper Lvl5'] = listes_cards['Trapper Lvl4'] + ["Tir Réflexe", "Tir supersonique", "Tir supersonique",
                                                               "Tir explosif", "Tir explosif", "Tir précis",
                                                               "Louve apprivoisée", "Tir empoisonné",
                                                               "Etude du point faible"];

listes_cards['Illusionist Lvl2'] = listes_cards['Illusionist Lvl1'] + ["Images Miroir", "Inspiration chantée",
                                                                       "Attaque latérale", "Pioche II"];
listes_cards['Illusionist Lvl3'] = listes_cards['Illusionist Lvl2'] + ["Pioche III", "Succion de mana",
                                                                       "Passage vers le plan éthéré", "Shuriken",
                                                                       "Shuriken", "Shuriken empoisonné"];
listes_cards['Illusionist Lvl4'] = listes_cards['Illusionist Lvl3'] + ["Allonge magique", "Allonge magique",
                                                                       "Apothicaire 1", "Attaque diagonale",
                                                                       "Peste Noire", "Vases Communicants",
                                                                       "Danse enfiévrée", "Images Miroir"];
listes_cards['Illusionist Lvl5'] = listes_cards['Illusionist Lvl4'] + ["Danse enfiévrée", "Nuage de dague",
                                                                       "Volée de shuriken", "Apothicaire 2",
                                                                       "Frappe avec salto arrière",
                                                                       "Attaque en cercle", "Frappe illusoire",
                                                                       "Prise en traitre"];

listes_cards['Elementalist Lvl2'] = listes_cards['Elementalist Lvl1'] + ["Pioche III", "Captation de mana",
                                                                         "Givrefeu", "Brouillard", "Tornade"];
listes_cards['Elementalist Lvl3'] = listes_cards['Elementalist Lvl2'] + ["Booster de Tour", "Tornade", "Boule de feu",
                                                                         "Météore", "Frappe de givre",
                                                                         "Captation de mana"];
listes_cards['Elementalist Lvl4'] = listes_cards['Elementalist Lvl3'] + ["Fracture Terrestre", "Incantation",
                                                                         "Incantation", "Pioche III", "Boule de feu",
                                                                         "Onde glacée", "Propagation des dégâts",
                                                                         "Choc de feu"];
listes_cards['Elementalist Lvl5'] = listes_cards['Elementalist Lvl4'] + ["Booster de Tour", "Captation de mana",
                                                                         "Tornade", "Fracture Terrestre",
                                                                         "Frappe de givre", "Boule de feu",
                                                                         "Récupération de mana", "Assassin du néant",
                                                                         "Incantation", "Plastron Magique"];

cardsGeneratedPackFolder = "./decks-fq8-generated/"
cardsPackFolder = "./decks-fq8/"
cardsOriginPackFolder = "./decks-pattern-fq8/"
supportedLanguages = ["en", "fr"]

os.makedirs(cardsGeneratedPackFolder, exist_ok=True)
for language in supportedLanguages:
    for filename in os.listdir(cardsOriginPackFolder):
        with open(cardsPackFolder + filename[:-5] + "-" + language + ".json", 'w',
                  encoding="utf-8") as new_file:
            new_file.writelines(write_location_decks(cardsOriginPackFolder + filename, language))

    for cle, liste in listes_cards.items():
        name_file = cle.lower().split(" ")[0] + "-all-" + language + ".json"
        with open(cardsGeneratedPackFolder + cle.lower().replace(" ", "-") + "-" + language + ".json", 'w',
                  encoding="utf-8") as new_file:
            new_file.writelines(write_generated_decks(cle + " - " + language, liste, name_file, cardsPackFolder))
