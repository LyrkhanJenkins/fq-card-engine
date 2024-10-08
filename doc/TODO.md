## V1.1
- Implémentation de deux nouvelles classes: Gardien et Sorcière
- Implémenter les cartes communes pour le niveau 6 + 4 Sorts Ultime par classes OU que les boosters
- tagué les cartes et le nombre max
- Afficher le nombre max dans les decks
- Migrations objets et sorts passifs dnd5e v FQ
- Droits joueurs limités (avec option?):
- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs
- Tagué les bibliothèque (spellbook): le flag 'fqType' a déjà été créé
- Répercussion sur toutes les méthodes déjà existantes
- Empêcher le drag and drop autre que d'un deck vers une bibliotheque
- Empécher une carte d'une bibliothèque d'aller ailleurs que dans le deck
- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliotheque (et de supprimer)
- Correctement créer les bibliothèques/decks/main et pile avec le fqType
- Automatiser la montée de niveau jusqu'au niveau 5 (utiliser la macro )

## 1.0.0
- Règles du jeu et readme complété
- Mettre au propre la CI et les commits
- Rebase sur le main de lyrkhan et virer le code inutile
- Proteger les branches principales
- Ajouter des tests unitaires ( ajouter le tests des cartes )
- Rédigé le "Get Started"
- Recette globale avec utilisateurs et MJs
- Suppression de tous les Warnings/ tous les bugs pour 1.0.0 sans utilisateur

## Backlog

### High:
- Macro pour piocher un booster et le mettre dans la bibliotheque du joueur

### Medium:

- Ne pas utiliser de points d'actions quand hors combat
- Gestion de plusieurs modules pour les effets magiques de combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)
- Retrocompatibilité des feuilles: n'ajouter que la partie fq ou  toute la feuille?

### Low:

- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec game.dfreds
- Lancez des sons différents ci plusieurs cibles touchés

Clem problems non reproduit :

- Problème de range sur les token trop gros
- Probleme de decorerelation actor/token,

### Very Low:

- Effet de mort à appliquer automatiquement ---> Existe un module pour ça : Memento Mori
