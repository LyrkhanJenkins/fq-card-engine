## V1.1
- Gérer du ciblage speciale : Zone , et surtout skeleton pour la witch
- Créer un sort passif qui sacrifie des squelettes, et gérer une bar spécial pour les squelettes?
- Faire un point sur todos: Ramener toutes les notes écrites pendant les vacances + Tri de priorité et Roadmap
- Supprimer le repertoire d'assets et le gérer directement dans le module pour tout ce qui est sorts de base
  - Pour le reste utiliser JB2A, gérer les sons et les jouer également si pas le module sequencer
- Refacto pour s'affranchir du code de fq-card-engine
- Gerer le module Card Viewer pour qu'il ne s'affiche au joueur que lorsqu'il pioche -> Preset les options à l'init?
- Rajouter 1 ou 2 cartes de bases par classes + 2 ou 3 cartes sup dans le deck niveau 1 (pour arriver à 40 cartes niveau 5)
- Créer les classe Guardian et witch + 
- Implémentation de deux nouvelles classes : Gardien et Sorcière
- Implémenter les cartes communes pour le niveau 6 + 4 Sorts Ultime par classes ? OU que les boosters
- Implémenter des cartes utilisable hors des combats et qui ne se défausse jamais (1/2 par classe ? + les communs,
les communs apparaissent avec un niveau d'attributs ) 
- Les sorts communs apparaissent au changement de niveau dans la bibliothèque
- Migrations objets dnd5e v FQ
- Gérer le bonus de dégâts pour gérer l'invulnérabilité (ou autre solution)
- Refacto : ne plus utiliser le script python pour générer les cartes
- Ajouter des cartes aléatoires d'un compendium vers une bibliothèque
- Possibilité de choisir des cartes dans un changement de niveau
- Card Viewer option
- Faire un json avec tous les possibilité pour une classe
- Carte Incantation et les passifs en générale pas très clair, réécrire ptetre les règle (coute 0 après première utilisation)
- Migration des sons des macros avec les assets
- Correction des familiers pour utiliser leurs attaques
- Macro pour piocher un booster et le mettre dans la bibliotheque du joueur
- Gestion de plusieurs modules pour les effets magiques de combat
- Gérer des macros d'animations spéciales genre par exemple la téléportation autre que les auras
- Permettre d'avoir un raccourci de partout fq. pour les effets récupérer comme j2ba.
- Repasse sur toutes les cartes (orthographe, gras, @str ou @for, faire des cartes communes pour points d'actions/mana/pioches?)
- Protéger l'utilisation de carte si pas de token controlé par le joueur
- Le renforcément d'armure n'est pas un passif? Alors que le chargement de lame ou whirlwind si?
- Au choix du type de carte n'afficher ou pas les choix dans la dialog
- Verifier si currentDrop utilisable hors combat sans drop de card et checker si SecretWeapons du moine enlève bien le score de current Drop

## V1.2
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
- Gérer les cibles après coup?
- Gérer jusqu'au niveau 10 les 7 classes

~~- Droits joueurs limités~~

~~- Afficher le nombre max dans les decks~~

~~- tagué les cartes et le nombre max~~

~~- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs~~

~~- Empêcher le drag and drop autre que d'un deck vers une bibliothèque~~

~~- Empêcher une carte d'une bibliothèque d'aller ailleurs que dans le deck~~

~~- Quand une carte va d'une bibliothèque à un deck, en créer une nouvelle à la place (sauf si on dépasse le nombre max)~~

~~- Créer une bibliothèque à partir du pattern et non pas du niveau 5.~~

~~- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliothèque (et de supprimer)~~

~~- Automatiser la montée de niveau jusqu'au niveau 5 (utiliser la macro )~~

## Backlog

### High:

- Se renseigner pour les problèmes d'audio de Foundry

### Medium:

- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)
- Rétrocompatibilité des feuilles : n'ajouter que la partie fq ou toute la feuille ?
- Permettre de remonter les points de vie/mana/zele courant même si éléments actifs
- Supprimer les familier en fin de combat

### Low:

- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec game.dfreds
- Lancez différents sons ci plusieurs cibles touchés
- Logué ou trouver un moyen de logué tous les évenements de combat pour pouvoir les réutiliser dans les customEvals
- Améliorer certaines cartes de mage blanc: light energy (json après utilisation)
- Gérer les nb target infini et les portée infini?, les critique, els esquive? (light strike)
- Gérer les cartes chargées directement dans le code natif et pas en script
- Gérer les dissipation d'effet dans un select qui récupère tous les effets des cibles

### Very Low:

- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
