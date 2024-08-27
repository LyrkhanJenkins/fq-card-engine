import json
import copy
import secrets
import string
import os


def ecrire_nouveaux_deck(name, tableau, cards):
  cardsPackFolder = "./decks-final-quest-8/"
  # Vérifie si le fichier existe
  try:
    with open(cardsPackFolder + cards, 'r', encoding='utf-8') as cards_json:
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
  'Elementaliste Niv1': ["Boule de feu", "Tornade", "Fracture Terrestre", "Fracture Terrestre", "Frappe de givre",
                         "Frappe de givre", "Récupération de mana"],
  'Illusionniste Niv1': ["Frappe avec salto arrière", "Frappe illusoire", "Frappe illusoire", "Fouet Enchantée",
                         "Fouet Enchantée", "Fouet Enchantée", "Inspiration chantée", "Allonge magique",
                         "Vases communicants", "Shuriken empoisonné"],
  'Trappeur Niv1': ["Tir précis", "Tir précis", "Tir précis", "Double flèches", "Louve apprivoisée",
                    "Tireur d'élite", "Pluie de flèches"],
  'MageBlanc Niv1': ["Energie Lumineuse", "Energie Lumineuse", "Energie Lumineuse", "Malédiction", "Malédiction",
                     "Bouclier magique", "Explosion d'arcanes"],
  'Moine Niv1': ["Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup droit", "Coup gauche",
                 "Coup gauche", "Coup gauche", "Combo", "Combo", "Récupération de mana III", "Bouclier zélé",
                 "Bouclier zélé"]
}
listes_cards['Moine Niv2'] = listes_cards['Moine Niv1'] + ["Coup gauche", "Coup gauche", "Cape inhibitrice",
                                                           "Vive-esquive"];
listes_cards['Moine Niv3'] = listes_cards['Moine Niv2'] + ["Booster de Tour V", "Cape inhibitrice", "Méditation Zen",
                                                           "Bouclier zélé", "Récupération de Mana III", "Lame fantôme"];
listes_cards['Moine Niv4'] = listes_cards['Moine Niv3'] + ["Cape inhibitrice", "Combo", "Dissimulation",
                                                           "Conversion", "Souffle de Ki", "Booster de Tour V"];
listes_cards['Moine Niv5'] = listes_cards['Moine Niv4'] + ["Armes secrètes", "Vive-esquive", "Dissimulation",
                                                           "Méditation Zen", "Déplacement éclair", "Lame fantôme"];

listes_cards['MageBlanc Niv2'] = listes_cards['MageBlanc Niv1'] + ["Energie Lumineuse", "Energie Lumineuse",
                                                                   "Malédiction", "Bouclier magique",
                                                                   "Récupération de mana III", "Explosion d'arcanes"];
listes_cards['MageBlanc Niv3'] = listes_cards['MageBlanc Niv2'] + ["Pioche III", "Energie Lumineuse",
                                                                   "Bouclier magique", "Malédiction Instantanée",
                                                                   "Récupération de mana III", "Soins d'urgence",
                                                                   "Infusion de Mana"];
listes_cards['MageBlanc Niv4'] = listes_cards['MageBlanc Niv3'] + ["Bouclier magique", "Exorcisme", "Exorcisme",
                                                                   "Malédiction Instantanée", "Booster de Tour V",
                                                                   "Bouclier vengeur", "Bouclier empathique",
                                                                   "Explosion d'arcanes"];
listes_cards['MageBlanc Niv5'] = listes_cards['MageBlanc Niv4'] + ["Pioche III", "Malédiction Instantanée",
                                                                   "Booster de Tour V", "Epiphanie", "Epiphanie",
                                                                   "Frappe de lumière", "Bouclier divin",
                                                                   "Bouclier de mana"];
listes_cards['Trappeur Niv2'] = listes_cards['Trappeur Niv1'] + ["Pioche II", "Récupération de mana", "Traquenard",
                                                                 "Tir précis", "Tir Réflexe"];
listes_cards['Trappeur Niv3'] = listes_cards['Trappeur Niv2'] + ["Tir empoisonné", "Tir empoisonné", "Tir transperçant",
                                                                 "Pioche II", "Tir précis", "Booster de Tour"];
listes_cards['Trappeur Niv4'] = listes_cards['Trappeur Niv3'] + ["Tireur d'élite", "Booster de tour", "Double flèches",
                                                                 "Tir précis", "Récupération de mana", "Embuscade",
                                                                 "Embuscade", "Traquenard", "Pluie de flèches"];
listes_cards['Trappeur Niv5'] = listes_cards['Trappeur Niv4'] + ["Tir Réflexe", "Tir supersonique", "Tir supersonique",
                                                                 "Tir explosif", "Tir explosif", "Tir précis",
                                                                 "Louve apprivoisée", "Tir empoisonné",
                                                                 "Etude du point faible"];

listes_cards['Illusionniste Niv2'] = listes_cards['Illusionniste Niv1'] + ["Images Miroir", "Inspiration chantée",
                                                                           "Attaque latérale", "Pioche II"];
listes_cards['Illusionniste Niv3'] = listes_cards['Illusionniste Niv2'] + ["Pioche III", "Succion de mana",
                                                                           "Passage vers le plan éthéré", "Shuriken",
                                                                           "Shuriken", "Shuriken empoisonné"];
listes_cards['Illusionniste Niv4'] = listes_cards['Illusionniste Niv3'] + ["Allonge magique", "Allonge magique",
                                                                           "Apothicaire 1", "Attaque diagonale",
                                                                           "Peste Noire", "Vases Communicants",
                                                                           "Danse enfiévrée", "Images Miroir"];
listes_cards['Illusionniste Niv5'] = listes_cards['Illusionniste Niv4'] + ["Danse enfiévrée", "Nuage de dague",
                                                                           "Volée de shuriken", "Apothicaire 2",
                                                                           "Frappe avec salto arrière",
                                                                           "Attaque en cercle", "Frappe illusoire",
                                                                           "Prise en traitre"];

listes_cards['Elementaliste Niv2'] = listes_cards['Elementaliste Niv1'] + ["Pioche III", "Captation de mana",
                                                                           "Givrefeu", "Brouillard", "Tornade"];
listes_cards['Elementaliste Niv3'] = listes_cards['Elementaliste Niv2'] + ["Booster de Tour", "Tornade", "Boule de feu",
                                                                           "Météore", "Frappe de givre",
                                                                           "Captation de mana"];
listes_cards['Elementaliste Niv4'] = listes_cards['Elementaliste Niv3'] + ["Fracture Terrestre", "Incantation",
                                                                           "Incantation", "Pioche III", "Boule de feu",
                                                                           "Onde glacée", "Propagation des dégâts",
                                                                           "Choc de feu"];
listes_cards['Elementaliste Niv5'] = listes_cards['Elementaliste Niv4'] + ["Booster de Tour", "Captation de mana",
                                                                           "Tornade", "Fracture Terrestre",
                                                                           "Frappe de givre", "Boule de feu",
                                                                           "Récupération de mana", "Assassin du néant",
                                                                           "Incantation", "Plastron Magique"];

cardsPackFolder = "./decks-fq8-generated/"
cardsOriginPackFolder = "./decks-fq8-generated/"

lignes_a_recopier = []

os.makedirs(cardsPackFolder, exist_ok=True)

for cle, liste in listes_cards.items():
  name_file = cle.lower().split(" ")[0] + "-all.json"
  with open(cardsPackFolder + cle.lower().replace(" ", "-") + ".json", 'w', encoding="utf-8") as nouveau_fichier:
    nouveau_fichier.writelines(ecrire_nouveaux_deck(cle, liste, name_file))
