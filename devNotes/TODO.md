## V2.0
### Fix Prioritaire

### Fix à prioriser
Choisir entre -er et -ez dans les descriptions des cartes
Sélectionner une cible après coup
Enlever les + et - si joueurs droits limiteés
Volée de shuriken et shuriken, effet speciaux à changer
Afficher les éléments actifs de l'elementaliste, généralement afficherf tous les effets sur une sicble
Pouvoir faire une lame chargé en une fois
Priorisé les protections avant de faire jouer la carte
Revoir cape inhibitrice (enlever quel effet?)
Revoir tir reflexe (jouer même si pas attaquer?)

### Priorité
#### 2.0.1
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- SPIKE Meilleurs tests à faire pour de la non-regression ?
- Test haut-niveau avec toutes les cartes, Besoin de gros tests de non regression de partout + avec toutes les cartes?
- Couverture de test avec rapport > 80%
- Remplacer la lame chargée par un sort qui fait plus de dégâts suivant le zèle qu'a la cible plutôt que la chargé
  - Ou découper en plusieurs sorts, ceux qui charge du zèle et ceux qui en utilise?
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- Comment faire en sorte que les jets de dés aillent plus vite avec dice so nice (module recommandé)
- Comment faire en sorte que card viewer affiche le svg?
- Mettre a jour les versions des plugins nécessaire dans module.json
- A partir de là, montée de version majeure possible : Faire un plan de pmontée de version majeure : Mettre à jour les
  cartes dans les compendiums et relance des tests par exemple
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- Ameliorer macro create unique cards pour donner l'ownership aux joueurs dans le monde de test
- Première passe de suppression code inutile sans risque

#### 2.0.2
- Ramener toutes les notes écrites
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- Revoir css, homogénéiser fonts...
- Redécoupage et vérification CSS
- Repasser sur tous les TODO
- Faire un point sur todos.*
- Afficher les barres spécifiques
- Tests fonctionnels + montée dernière version
- PATCH--> RELEASE

#### 2.0.3
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Verifier 
- Passage en typescript?
- Rajouter des règles d'architectures
- Tests fonctionnels + montée dernière version
- PATCH--> RELEASE

#### 2.0.4
- Bug tornade effet magique
- Revoir les effets visuels et audio
- Gestions des principales Custom eval dans des méthodes (comme les xvalue)
- Support avec un FQ Card Viewer
- PATCH--> RELEASE

#### 2.1.x
- Ajouter également une fleche raccourci pour passer une carte du spellbook vers le deck
- L'esquive fait demi-dégâts
- Faire des sorts qui s'active au bout du enieme tour, action de la carte au bout d'un certain temps
- Pouvoir générer une carte après utilisation d'une autre à partir d'un modèle
- Utilisation des armes équipés
- Est ce qu'il faut pas qu'on puisse joueru plusieurs choix d'une carte en même temps (pas vraiment de choix (boolean))?
- Refonte des cartes :
  - Création des decks se fait automatiquement à chaque montée de niveau où on rajoute ceil(nbmaxSameCard/2) cartes dans 
  le deck de la classe et le niveau choisi ---> Suppression des cartes générés et refacto des levels des cartes +  
  Ajout de cartes par classes pour caractérisation (+ de réactif et de passif?) (Des cartes de bases ne sont pas forcément passive)
    - Refaire des cartes pour chacune des classes qui ont trop de sorts les mêmes et bien les diviser par chaque niveau
      et en distribuer la moitié du nombre max. Bien faire la différenceciation des classes
    - Les spécificités des classes doivent être plus marqués et ne pas retrouvé trop les mêmes sorts pour chacunes des classes
    - Ajout des dégâts armes pour les cartes :
      - Ajouts des dégâts de l'arme équipé pour les sorts de CàC
      - Pouvoir choisir l'arme à utiliser pour le sort si utilisation de l'arme en mettant la première arme équipé en premier
      - Afficher sur la carte
    - Gérer les passifs hors de la main, comme les pouvoirs ...
      - Carte Incantation et les passifs en général pas très claire, réécrire ptetre les règle (coute 0 après première
        utilisation), réécriture des passifs
      - Repasse sur toutes les cartes (orthographe, gras, @str ou @for, faire des cartes communes pour points
        d'actions/mana/pioches?)

- Première carte du Maître d'Armes et du Guerrier Runique
- MINOR--> RELEASE

#### 2.2.x
- Chercher dans votre défausse action
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
- Afficher des auras avec un autre module (exemple: bouclier magique, nuage de dague...)
- Déplacer les cibles automatiquement (Example: Tir supersonique, Frappe avec salto arrière...)
- Gérer les cartes incolores
- Ajouter du ciblage si oublié dans la dialog-play?
- Ne pas cliquer sur dialog-play si pas de cible sur une carte en nécessitant
- Proposer des cibles pas encore choisi 0dans dialog-play
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
- Supprimer la notion de joueur par main si le joueur n'a qu'une main possible
  -> Si joueur alors ce dernier ne peut avoir qu'une main, pas de configuration
  -> Remplacer empty-hand-message.html (par un gros bouton de configuration?) (commit 27 mai 2026)?
- Tests fonctionnels + montée dernière version
- Améliorer le message du chat quand une carte est jouée ou défaussé
- MINOR--> RELEASE

#### 2.2.x+1
- Finir Texte a trou dans la description des cartes remplis par les caractéristiques
- Généraliser la récupération d'un token avec game.canvas.tokens.get("cUb1KOvLxsIS9IuN");
- PATCH--> RELEASE

#### 2.3.x
- Prise en compte la classe d'armure de DND5E
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Ajout de spécialisation pour les 7 classes jusqu'au niveau 10
- Prise en compte des resistances
- MINOR--> RELEASE


## Backlog

### Fix mineure

### Chore:

- Migration Eizh complète avec les niveaux

### Feat:

- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens
- Gérer un nombre max d'utilisation pour des armes.
- Implémentation du Gladiateur -> resource spécial pour les armes?, renommer en maître d'armes?
- Gérer du ciblage speciale : Zone
- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Comment gérer les effets visuels si le fichier n'existe pas?
- Plus de sound effects differents
- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie

