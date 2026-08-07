## V2.x
### Fix Prioritaire

### Fix à prioriser

### Versions prévues

#### 2.0.2
- On consomme les points d'actions mais on les récupère pas si on annule la dialog de dégâts quand on utilise une arme pour attaquer
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- PATCH--> RELEASE

#### 2.0.3
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Passage en typescript?
- Volée de shuriken et shuriken, effet spéciaux à changer
- Rajouter des règles d'architectures
- Tests fonctionnels + montée dernière version
- Bug tornade effet magique
- Revoir les effets visuels et audio
- Devoir des effets visuel arrive avant le reveal des dés et dégâts, des fois non
- Gestions des principales Custom eval dans des méthodes (comme les xvalue)
- Pour les réactifs ptetre travaillé sur des evenements pour pouvoir les jouer ( j'ai subi de dégâts ce tour, ma cible a joué un sort ce tour,
  , ...) et afficher en surbrillance une carte réactive qui peut être jouée -> - Revoir tir reflexe (jouer même si pas attaquer?)
- Un réctif peut être joué à son tour également? Faire un spike des réactifs a qui ça pose problème
- La main ne parait pas entière des fois , besoin de refraichir??? si piocher avant connexion??? --> VOIR SI CA REVIENT SINON FIX MINEUR
- Deplacer les controles d'utilisation d'une carte dans un fichier JS et les tester
- PATCH--> RELEASE

#### 2.1.x
- Se poser pour refelchir la caracterisation :
  - Refaire une passe de toutes els fonctionnalités + celles à venir ET donner plus de cartes qui utilisent ces fonctionnalités
  - QU'est ce qui caractérisent une classe , faire une passe des sorts qui ne caracterise pas la classe
- Des choix de cartes ne sont plus des choix mais des executions après un autre choix 
  OU une transformation à la prochaine execution
    - Filtrer les vrais choix pour la dialog, et executer en queue tous les choix qui se succède
    - Renommer le mot choix c'est plus un effet de la carte mais j'ai déjà effet
    - Dans le formulaire remonté rejouable en haut -> l'encart devient FX de la carte, et en haut avec rejouable, yaura
  aussi lancé dans X tours, génère une autre carte : "Comportement special"
    - Dans le formulaire, plusieurs type de "choix" : Choix (de base), execution après choix, remplacement choix,
    - Dans le formulaire rajouter si un champ execution après choix, remplacement choix, comprenant les autre choix
    -  -> enlever JSON après utilisation?
    - (Facultatif: les noms des choix peuvent être localisé)
    - Peut être qu'une fois que c'est fait, on a pas besoin de plusiuers formules d'application d'effet ( à voir)
- L'esquive fait demi-dégâts
- Plus de carte qui dissipent des effets ou qui ont des chances de dissiper des effets
- Faire des sorts qui s'active au bout du enieme tour, action de la carte au bout d'un certain temps
- Pouvoir générer une carte après utilisation d'une autre à partir d'un modèle
- Utilisation des armes équipés
- Pouvoir faire une lame chargé en une fois ou refonte?- > Remplacer la lame chargée par un sort qui fait plus de dégâts suivant le zèle qu'a la cible plutôt que la chargé
  - Ou découper en plusieurs sorts, ceux qui charge du zèle et ceux qui en utilise?
- Refonte des cartes :
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
- J'ai l'impression que ya pas la bonne couleur de dé quand on fait le roll damage depuis une arme équipé (grave?)
- Si ça devient génant, pour les choix de l'effet de la carte, mettre null de base et empecher de cliquer sur jouer si pas choisi ( comme X et Y)
- Dé à 0 face : les cartes en `1d(expr)` (ex. `1d(2*@str)`, `1d(@str)`, `1d(2*@wis)`, `1d(2*@dex)`) plantent au vrai Roll si le modificateur concerné vaut 0.
- `1d(4-XXX)` (EarthFracture) et `1d(6-XXX)` (GiantStalactite) produisent des faces ≤ 0 (dé invalide) quand XXX est élevé.
- `playDialog` : `firstChoice.replayable` est lu sans garde de nullité (`str.includes` plante si le champ est absent).
- Valeurs sentinelles (`-9999`, `999999999`, `99999999`) utilisées comme drapeaux (pas de crit, cible inesquivable, portée/cibles infinies, rejouable infini) : fragiles, à remplacer par de vrais flags.

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

