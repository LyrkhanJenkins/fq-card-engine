## V1.1.0

- Implémentation cartes 6/7/base: Elementaliste et Gardien et Illusioniste Terminé
- Au choix du type de carte n'afficher ou pas les choix dans la dialog
- Rajouter des armes aux starters heroes
- Carte Incantation et les passifs en général pas très claire, réécrire ptetre les règle (coute 0 après première
  utilisation)
- Tests Passe 1
- Tests Passe 2

## V1.1.1 (Stabilisation et refacto)

- Nouvelle version Dnd5e et Foundry v13
- Rendre le cardContent accessible de partout
- Faire un point sur todos: Ramener toutes les notes écrites pendant les vacances + Tri de priorité et Roadmap
- Refacto pour s'affranchir du code de fq-card-engine
- Repasse sur toutes les cartes (orthographe, gras, @str ou @for, faire des cartes communes pour points
  d'actions/mana/pioches?)
- Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Moulinette IA des visuels
- Tests Passe 1
- Tests Passe 2
- Tests Passe 3
- Tests Passe 4

## V1.2

- Faire des cartes qui coutent plus que 10 points d'actions, plus forte
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
- Gérer les cibles après coup?
- Gérer jusqu'au niveau 10 les 7 classes
- Migrations objets dnd5e v FQ
- Gérer les auras avec une portée?

## Backlog

### High:

- Se renseigner pour les problèmes d'audio de Foundry
- Comment faire en sorte que les jets de dés aillent plus vite

### Medium:

- Gérer du ciblage speciale : Zone
- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)
- Rétrocompatibilité des feuilles : n'ajouter que la partie fq ou toute la feuille ?
- Permettre de remonter les points de vie/mana/zele courant même si éléments actifs
- Supprimer les familier en fin de combat
- Comment gérer les effets visuels si le fichier n'existe pas?
- Limiter la taille de la main? ne pas piocher si arriver à cette limite

### Low:

- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec
  game.dfreds
- Lancez différents sons ci plusieurs cibles touchés
- Logué ou trouver un moyen de logué tous les évenements de combat pour pouvoir les réutiliser dans les customEvals
- Améliorer certaines cartes de mage blanc: light energy (json après utilisation)
- Gérer les nb target infini et les portée infini?, les critique, els esquive? (light strike)
- Gérer les cartes chargées directement dans le code natif et pas en script
- Gérer les dissipation d'effet dans un select qui récupère tous les effets des cibles
- Gérer de l'aléatoire dans les cartes recues en montée de niveau à la manière de booster

### Very Low:

- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
