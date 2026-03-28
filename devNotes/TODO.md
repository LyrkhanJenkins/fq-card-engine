## V1.2

Après nouvelle interface :

- Revoir css, homogeneiser fonts...
- changer les noms des templates et supprimer l'inutile

### Fix:

- Migration 14: Problématique au niveau de la génération des decks:
    - Duplication des cartes dans les bibliothèque
    - Problématique sur blank world ?
    - Ajout de macros GM de génération de cartes pour les tests
    - Supprimer la génération jusqu'au niveau 5 monoclassé: comment faire?
    - Ajout de test

### Feature:

- Ajout de spécialisation pour les 7 classes jusqu'au niveau 10
- Faire des cartes qui coutent plus que 10 points d'actions, plus forte
- Faire des synergie de cartes a faible cout
- PLus spécialisés les classes et refonte
- Migrations objets dnd5e v FQ
- Ajout des dégâts armes pour les cartes
- Prise en compte du niveau d'armure
- Gérer les passifs hors de la main, comme les pouvoirs ...
    - Carte Incantation et les passifs en général pas très claire, réécrire ptetre les règle (coute 0 après première
      utilisation), réécriture des passifs
    -
        - Repasse sur toutes les cartes (orthographe, gras, @str ou @for, faire des cartes communes pour points
          d'actions/mana/pioches?)
- Refonte de l'interface de jeu
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
-

### Chore:

- Faire un point sur todos: Ramener toutes les notes écrites pendant les vacances + Tri de priorité et Roadmap
- Nouvelle version Dnd5e et Foundry v14
- Migration Eizh complète avec les niveaux
- Couverture de test 100%
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien

- Moulinette IA des visuels
- Migration des librairies + script dnd5e pour les compendiums a revérifier
- Gestions des principales Custom eval dans des méthodes

## Backlog

### High:

- Au choix du type de carte n'afficher ou pas les choix dans la dialog
- Se renseigner pour les problèmes d'audio de Foundry
- Comment faire en sorte que les jets de dés aillent plus vite

### Medium:

- Cartes niv 7 Gladiateur -> resource spécial pour les armes?, renommer en maître d'armes?
- Ajouter également une fleche raccourci pour passer une carte du spellbook vers le deck
- Ajouts des dégâts de l'arme équipé pour les sorts de CàC
    - Pouvoir choisir l'arme à utiliser pour le sort si utilisation de l'arme en mettant la première arme équipé en
      premier
- Gérer un nombre d'utilisation pour des armes.
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

- QUe faire des cartes communes implémentés?
- Prise en compte des resistances
- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec
  game.dfreds
- Lancez différents sons ci plusieurs cibles touchés
- Logué ou trouver un moyen de logué tous les évenements de combat pour pouvoir les réutiliser dans les customEvals
- Améliorer certaines cartes de mage blanc: light energy (json après utilisation)
- Gérer les nb target infini et les portée infini?, les critique, els esquive? (light strike)
- Gérer les cartes chargées directement dans le code natif et pas en script
- Gérer les dissipation d'effet dans un select qui récupère tous les effets des cibles
- Gérer de l'aléatoire dans les cartes recues en montée de niveau à la manière de booster
- Gestion d'une monnaie entre le spellbook et le deck?

### Very Low:

- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
