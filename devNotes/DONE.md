v2.0.2:
Feat :
- Animation de pioche de carte
- Affichage de la carte au clic dans les decks/bibliotheques
- Message de chat consolidé (choix + résultats) + clic → carte SVG
- Choix des cartes localisé et traduit en français
- Affichage des resources spécifiques (critique, défausse, ...etc ) dans la main ou la dialog play
- Ciblage possible depuis la dialog-play et erreur remonté avant de jouer la carte

Fix :
- Correction affichage dos de carte dans la dialog-play
- Correction macro create deck utilise le owner fq

Chore :
- Redécoupage et suppression du code mort CSS
- Refacto architecture et todo techniques en suspens

v2.0.1:
Feat :
- Illustration de carte pas défaut et Logo FQ pour la mise en pause
- Génération des decks à la volée suivant les cartes correspondant aux classes et niveaux (1/2 du nombre max par défaut) et plus à partir de deck générés
- Ajout une fleche raccourci pour passer une carte du spellbook vers le deck + grisage des cartes déjà distribué dans le deck
- Support Dice So Nice: Jets de dés simultanés

Chore :
- Couverture des tests unitaires >50% et >80% pour les méthodes utils
- Tests de Non-Regression sur toutes les cartes du jeu
- Documentations complètes des méthodes
- Fin recommandation card viewer
- Mise à jour et figer les versions de dépendances du package.json
- Mise en place de GSD avec claude code

Fix :
- Correction traduction fr.json et en.json
- Correction mauvais controle des variables Y
- Correction des modificateurs d'attributs traduit en français à tord (@for -> @str)
- Enlever l'ajout de main dans le container si les droits des joueurs sont limités
- Correction, pour les cartes, du breaking change v13 -> v14 pour la structure de EffectChangeData
- Correction du double comptage des dégâts quand les PV temporaires absorbent tout
- Empêcher le crash si l'évaluation du xyvalue rate et renvoie 0 plutôt

v2.0.0:

Feat :
- Refonte de l'UI de la main d'un joueur
- Ajout des ressources FQ sur la main du joueur
- Refonte de l'UI de la dialog pour jouer une carte
- Ajout des ressources FQ et des cibles dans la dialog pour jouer une carte
- Afficher les ressources FQ Directement dans la play dialog et dans la hand-container
- Les cartes sont générés dynamiquement avec le formulaire des cartes FQ via un SVG
- Les cartes ont une classe définie qui change la texture
- Localisation (FR et EN) de toutes les cartes
- Refonte des illustrations de toutes les cartes à jouer
- Nouvelles gestions FX (avec JB2A) et sons originaux (plusieurs sons par type de dégâts)
- Un sort passif ne peut être joué qu'une fois par tour
- Un sort de base ne reste pas forcément en main -> Couplé avec replayable
- Macro GM pour générer un deck avec toutes les cartes

Chore :
- Montée de version 14.365
- Refacto des templates et objets FQ raccordé aux object DND5E (Feuilles de personnage) et Foundry (carte et decks)
- Refacto des classes et méthodes statiques pour ne garder que le strict nécessaire
- Macro pour générer un deck avec toutes les cartes
- Migration Vitest

Fix :
- Correction création d'un deck unique par joueur avec les cartes de ses classes
- Correction invocation des minions
- Corrections de plusieurs cartes : 'Fouet Enchanté', 'Jet de Roche', 'Sortilège d'ombre'

v1.1.1:
Chore :

- Montée de version 13.350
  Fix :
- Les joueurs ne peuvent plus jouer leurs armes hors de leur tour
- Si xvalue ou yvalue est positionné sur currentDrop, on le vide pour le personnage
- Ne plus utiliser game.actors.get pour éviter la décorélation, utiliser que les ids de token pour les targets
- Correction de la Charge: ne fonctionne pas .from() is deprecated, please use .copySprite() + utilise les targets du
  GM
- Rajout de messages des effets manquants pour Guardian et Elementalist
- Correction Open/Create Deck Macros
- Fix cartes de base dans les decks générés

v1.1:

- Gestion des avancements des classes même en multiclassing
- Rajouter des armes aux starters heroes
- Tests Passe 1
- Implémentation des cartes 6/7/base
- Gérer le module Card Viewer pour qu'il ne s'affiche au joueur que lorsqu'il pioche -> Preset les options à l'init?
- Exposition des constantes à la racine de FqCardEngineModule
- Supprimer le repertoire d'assets et le gérer directement dans le module pour tout ce qui est sorts de base
- Gérer plusieurs sons pour chaque type de dégâts libre de droit
- Correction bug des passifs et carte rejouable qui traine depuis longtemps
- Gestion de modules optionnels pour les effets spéciaux (Sequencer, j2ba, DAE, Card Viewer)
- Correction des familiers pour utiliser leurs attaques
- Ne plus commiter les cartes générées
- Refacto : ne plus utiliser le script python pour générer les cartes
- Gérer l'invulnérabilité
- Implémenter des cartes utilisables hors des combats et qui ne se défausse jamais (1/2 par classe + les communs,
  les communs apparaissent avec un niveau d'attributs)
- Implémentation de deux nouvelles classes : Gardien et Sorcière
- Créer un sort passif qui sacrifie des squelettes, et gérer une bar spécial pour les squelettes ?
- Gérer du ciblage spécial : Skeletons
- Droits joueurs limités
- Afficher le nombre max et les niveaux des cartes dans les decks
- tagué les cartes et le nombre max
- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs
- Empêcher le drag and drop autre que d'un deck vers une bibliothèque
- Empêcher une carte d'une bibliothèque d'aller ailleurs que dans le deck
- Quand une carte va d'une bibliothèque à un deck, en créer une nouvelle à la place (sauf si on dépasse le nombre
  max)
- Créer une bibliothèque à partir du pattern et non pas du niveau 5.
- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliothèque (et de supprimer)
- Automatiser la montée de niveau jusqu'au niveau 5 (utiliser la macro )
- Gestion d'animations spéciales pour certaines cartes.
- CurrentDrop utilisable hors combat sans drop de card
- Formulaire de création de carte plutôt qu'une string transformé en JSON

v1.0:

- Protéger l'utilisation de carte si pas de token contrôlé par le joueur
- Support v12

v0.1:

- Support v9
