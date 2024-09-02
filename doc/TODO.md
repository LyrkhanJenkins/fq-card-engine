## V1.1
- Implémentation de deux nouvelles classes : Gardien et Sorcière
- Implémenter les cartes communes pour le niveau 6 + 4 Sorts Ultime par classes OU que les boosters
- Implémenter des cartes utilisable hors des combats et qui ne se défausse jamais (1/2 par classe ? + les communs,
les communs apparaissent avec un niveau d'attributs ) 
- Les sorts communs apparaissent au changement de niveau dans la bibliothèque
- tagué les cartes et le nombre max
- Afficher le nombre max dans les decks
- Migrations objets dnd5e v FQ
- Droits joueurs limités (avec option?):

~~- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs~~

- Empêcher le drag and drop autre que d'un deck vers une bibliothèque
- Empêcher toute creation dans une bibliothèque ?
- Empêcher une carte d'une bibliothèque d'aller ailleurs que dans le deck
- Quand une carte va d'une bibliothèque à un deck, en créer une nouvelle à la place (sauf si on dépasse le nombre max)
- Créer une bibliothèque à partir du pattern et non pas du niveau 5.
- Ajouter des cartes aléatoires d'un compendium vers une bibliothèque + cardViewer
- Possibilité de choisir des cartes dans un changement de niveau

~~- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliothèque (et de supprimer)~~

~~- Automatiser la montée de niveau jusqu'au niveau 5 (utiliser la macro )~~

## Backlog

### High:
- Macro pour piocher un booster et le mettre dans la bibliotheque du joueur
- Gestion de plusieurs modules pour les effets magiques de combat

### Medium:

- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)
- Retrocompatibilité des feuilles : n'ajouter que la partie fq ou  toute la feuille?

### Low:

- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec game.dfreds
- Lancez des sons différents ci plusieurs cibles touchés

Clem problems non reproduit :

- Problème de range sur les token trop gros
- Probleme de decorerelation actor/token,

### Very Low:

- Effet de mort à appliquer automatiquement ---> Existe un module pour ça : Memento Mori
