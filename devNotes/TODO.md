## V2.x
### Fix Prioritaire

### Fix à prioriser

### Versions prévues

#### 2.0.3
- La main ne parait pas entière des fois , besoin de refraichir??? si piocher avant connexion??? --> VOIR SI CA REVIENT SINON FIX MINEUR
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Gestions des principales Custom eval dans des méthodes (comme les xvalue)
- Deplacer les controles d'utilisation d'une carte dans un fichier JS et les tester
- Pour les réactifs ptetre travaillé sur des evenements pour pouvoir les jouer ( j'ai subi de dégâts ce tour, ma cible a joué un sort ce tour,
  , ...) et afficher en surbrillance une carte réactive qui peut être jouée -> - Revoir tir reflexe (jouer même si pas attaquer?)
- Un réactif peut être joué à son tour également? Faire un spike des réactifs a qui ça pose problème
- Rajouter des règles d'architectures
- Généraliser la récupération d'un token avec game.canvas.tokens.get("cUb1KOvLxsIS9IuN");
- Passage en typescript?
  -> Remplacer empty-hand-message.html (par un gros bouton de configuration?) (commit 27 mai 2026)?
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- PATCH--> RELEASE

#### 2.1.0
- Se poser pour refelchir la caractérisation :
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
- Gérer du ciblage speciale : Zone -> utiliser le ciblage de zone avec la dialog-play
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
- Chercher dans votre défausse action
- Afficher d'autres auras (exemple: bouclier magique, nuage de dague...)
- Gérer les cartes incolores
- Déplacer les cibles automatiquement (Example: Tir supersonique, Frappe avec salto arrière...)

- MINOR--> RELEASE

#### 2.1.1
- Revoir les effets visuels et audio
- faire bouger tornade effet magique
- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens (vérifier que c'est pas déjà fait)
- J'ai l'impression que ya pas la bonne couleur de dé quand on fait le roll damage depuis une arme équipé (grave?)
- Valeurs sentinelles (`-9999`, `999999999`, `99999999`) utilisées comme drapeaux (pas de crit, cible inesquivable, portée/cibles infinies, rejouable infini) : fragiles, à remplacer par de vrais flags.
- Supprimer la notion de joueur par main si le joueur n'a qu'une main possible
  -> Si joueur alors ce dernier ne peut avoir qu'une main, pas de configuration
- Volée de shuriken et shuriken, effet spéciaux à changer
- Plus de sound effects et FX differents

#### 2.2.x
- Prise en compte la classe d'armure de DND5E
- Ajout des cartes pour les 9 classes (jusqu'au niveau 10)
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Prise en compte des resistances, absorption des dégâts
- Sort qui touche tous les alliés du canvas? tous les ennemis de canvas? (AURA)
- MINOR--> RELEASE

## Backlog
### Fix mineure
- Si ça devient génant, pour les choix de l'effet de la carte, mettre null de base et empecher de cliquer sur jouer si pas choisi ( comme X et Y)
- Dé à 0 face : les cartes en `1d(expr)` (ex. `1d(2*@str)`, `1d(@str)`, `1d(2*@wis)`, `1d(2*@dex)`) plantent au vrai Roll si le modificateur concerné vaut 0.
- `1d(4-XXX)` (EarthFracture) et `1d(6-XXX)` (GiantStalactite) produisent des faces ≤ 0 (dé invalide) quand XXX est élevé.
- `playDialog` : `firstChoice.replayable` est lu sans garde de nullité (`str.includes` plante si le champ est absent).

### Chore:
- Migration Eizh complète avec les niveaux

### Feat:
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Entrer dans les logs de toutes les autres actions et pas seulement celles des cartes -> Permettra de savoir si des
  dégâts ont été infligés sur une cible par n'importe quelle source par exemple
- Amélioration de cartes? : Faire des cartes dorées (hearthstone) ou des cartes + (SlayTheSpire)
- Est ce qu'on peut faire des cartes qui construisent des tiles infranchissables?

- Règles sur les repos:
  - Après un repos long, la constitution ajoute X points de vie temporaire (X = (niveau * bonus de constitution)) ? (A
  tester)
  - La constitution doit augmenter la récupération des points de vie directement à la fin d’un combat (niveau +
  constitution) ou pendant un repos court (niveau + 1d(2* constitution))