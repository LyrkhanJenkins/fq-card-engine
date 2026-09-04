v3.0.0:
Feat :
- Ajout des dégâts de l'arme équipée aux cartes concernées
- Option pour bypassé les modales d'attaque et de dégâts (pas de classe d'armure)
- Ajout d'une macro raccourci pour lancer les dégâts de l'arme du combattant courant
- Quand le deck est vidé, la défausse est repioché
- Simplifier les formules à l'affichage sur les cartes + tooltips
- Suppression du "JSON Après utilisation" -> Remplacer par les cartes générées
- Génère des cartes dans la main avec un choix possible proposé au joueur
- Possibilité de supprimer des cartes générés dans la défausse
- Possibilité de dupliquer des cartes de la main.
- Pouvoir récupérer une carte de la défausse dans la main (toutes ou une liste donnée)
- Pouvoir récupérer une carte du deck dans la main (toutes ou une liste donnée)
- Cartes éphémères : jouer la carte la détruit définitivement.
- Creation des classes et token du Guerrier Runique et du Maître d'Armes
- Premières cartes du Guerrier Runique et du Maître d'Armes (En cours...)
- Ajout d'un score de bonus pour tout type de carte
- Pris en compte de rwak et mwark dans les jets de dégâts sans attaque
- Affichage d'une surbrillance aux réactifs lorsque ceux-ci sont utilisables
- Ciblage de zone (cercle/cône/rectangle/ligne) : pose d'une zone sur le canvas depuis la dialog-play, les tokens couverts deviennent les cibles
- Ciblage de tous les adjacents
- Ciblage de tous les alliés, ciblage de tous les ennemis
- Gestion des fx pour les zones
- Macro et hud pour utiliser la première arme à distance équipée
- Les chat messages mettent plus l'accent sur le résultat final
- Implémentation des Attaques d'Opportunités (AO) avec la première arme équipée et dégâts automatique
- Macro pour faire fin du tour
- Effets Rationalisé (Terre, Air, Feu, Malédiction, Poison...etc) + Conditions dnd5e
- Les cartes de base deviennent "innés" et peuvent être supprimer
- La fatigue fais des dégâts à chaque fois que l'on repioche sa défausse dans son deck. -> le guerrier runique a une carte pour se proteger de la fatigue
- Rework design du SpellBook
- Les cartes neutres deviennent communes et sont automatiquement rajouté dans les spellbooks aux bons niveaux
- Permet de poser des minions dans une zone plutôt que sur une case adjacente
- Nb max de familier par type et buff pour les familier

Fix :
- Correction du bouton OpenDeck dans la main du joueur
- Carte triée par niveau puis par nom dans les decks , le bouton cassé est supprimé
- Limitation des droits des joueurs n'enlève plus le ciblage et le choix du mouvement sur les tokens
- Les coordonnées d'un token dans le moteur sont simplifié à la case qui contient le centre du token

Chore :
- Support de la version 14.366, 14.367

v2.0.2:
Feat :
- Animation de pioche de carte
- Affichage de la carte au clic dans les decks/bibliotheques
- Message de chat consolidé (choix + résultats) + clic → carte SVG
- Choix des cartes localisé et traduit en français
- Affichage des resources spécifiques (critique, défausse, ...etc ) dans la main ou la dialog play
- Ciblage possible depuis la dialog-play et erreur de ciblage remonté avant de jouer la carte
- Implémentation de la dissipation d'effet
- Erreur de valeur X et Y (dépassements) bloquant avant de jouer la carte sur dialog-play

Fix :
- Correction affichage dos de carte dans la dialog-play
- Correction macro create deck utilise le owner fq
- Affichage des FX après les lancer de dés
- Correction aura frost
- Macro GM "create all decks" arrête d'ouvrir tous les decks
- Pas d'animation a la pioche des cartes de base
- Si applyEffectsFormulas.formula vaut 1, ne pas appliquer le roll et tout de suite valider
- Dialog-play doit se fermer si on ouvre une autre dialog-play (problème avec ciblage)
- On consomme les ressources FQ au bon moment quand on lance les dégâts de l'arme
- Plus d'affichage de 'S' dans les bulles ( temporaire ? )
- Correction de plusieurs cartes : Frappe Solaire, Attaque en cercle, Secret Weapons, Malédiction, Magie des Elements, Tornade, Fracture Terrestre
- Font size des bulles variables
- Correction de l'expiration des effets.
- Affichage des malus/bonus temporaire ou forcé à être visible

- Chore :
- Redécoupage et suppression du code mort CSS
- Refacto architecture et todo techniques en suspens
- Variabiliser toutes les couleurs dans le css
- Ajout de la recommandation du module "FQ Restrain movement"
- Suppression code mort, dépendance inutiles, passe de simplification et de factorisation

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

[//]: # (TODO)
v1.0:

- Protéger l'utilisation de carte si pas de token contrôlé par le joueur
- Support v12

# Réalisations :
## Saison 1:
- Score de défausse de carte à utiliser. réinitialiser à chaque round.
- Ajouter d'autres consommations dans les sorts passifs de Foundry (comme la défausse)
- Notamment pour les cartes qu'il faut uniquement révélé (cf White-Mage) -> Ne pas défausser la carte mais appliquer les
  effets
- Portée gérée cartes + sorts passifs
- Permettre d'appliquer un effet directement au joueur
- Permettre d'appliquer un effet directement à la cible d'un joueur
- Gestion de la fatigue et des repos
- Permettre de lancer des effets depuis les cartes
- Permettre de lancer des macros depuis les objets
- Implémentation de tous les objets D&D pour les butins
- Déplacement limité par tour (sauf familiers)

## Saison 2:

- Ajout de messages dans le chat pour les repos
- Les repos rendent l'intégralité des points de vie max + temporaires max
- Les items ne donnent plus de points de vie max, mais des points de vie temporaires max
- La duplication de carte force la nouvelle carte à avoir comme origine le deck en duquel on a dupliqué
- Tous les effets des cartes se réinitialisent à la fin du combat
- Gestion des cartes passives ou réutilisables + cout différent quand elles sont utilisés une première fois
- Gérer le fait qu'une carte passive ne peut être jouée qu'une fois par tour
- Définition des sorts D&D accessibles pour toutes les classes
- Possibilité d'implémenter du code spécifique dans une carte
- Gestion des bonus de dégâts/heal globaux
- Gérer les conditions spéciales pour lancer les sorts, macro intégré au Json? (la cible est maudite, à un effet de
  brulure ...etx)
- Gérer les DOTS et HOTS en début de tour --> Réécriture de l'élémentaliste
- Version simplifiée des personnages jusqu'au niveau 5
- Cartes communes du niveau 6
- Les cartes peuvent chacune avoir du code spécifique et des contraintes spécifiques.
- Création dynamique des familiers et serviteurs
- La plupart des conditions particulières des cartes sont vérifié (sauf La cible qui a subi des dégâts )
- 5 Classes implémentées jusqu'au niveau 5
- Ajout des bruitages suivant le type de dégâts
- Dégâts typés (feu, froid, acid...etc)
- Pioche aléatoire corrigée
- Découpage et rajout de musique suivant les régions
- 5 Sorts de bases pour tous les personnages: Dégainer, Rengainer, Courir, Bousculer ou Maîtriser (Macros)


v0.1:

- Support v9
