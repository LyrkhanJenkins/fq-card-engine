## V2.0
### Fix Prioritaire
- Revoir l'affichage des cartes rejouable + ne pas retourner la carte 2 fois?
- Le renforcément d'armure n'est pas un passif? Alors que le chargement de lame ou whirlwind si?
- Généraliser la récupération d'un token avec game.canvas.tokens.get("cUb1KOvLxsIS9IuN");
- Revoir Canalisation des Ombres
- Remplacer certaines valeurs sur les cartes par les vrais valeurs (exemple X si xvalue)
- Vérifier tous les sorts passifs

### Priorité
Migration Foundry v14:
- Macro pour générer un deck avec toutes les cartes
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- Mettre à jour des mondes de tests pour plusieurs cas
- Tests fonctionnels 2 + montée de version jusqu'à la dernière v14
- Mettre à jour readme et page Foundry et DONE.md
- MAJOR--> RELEASE

- SPIKE Meilleurs tests à faire pour de la non-regression ?
- Test haut-niveau avec toutes les cartes, Besoin de gros tests de non regression de partout + avec toutes les cartes?
- Couverture de test avec rapport > 80%
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- A partir de là, montée de version majeure possible : Faire un plan de pmontée de version majeure : Mettre à jour les
  cartes dans les compendiums et relance des tests par exemple
- PATCH--> RELEASE

- Ramener toutes les notes écrites
- Revoir css, homogénéiser fonts...
- Redecoupage et vérification CSS
- Repasser sur tous les TODO
- Faire un point sur todos.*
- Tests fonctionnels + montée dernière version
- Comment faire en sorte que les jets de dés aillent plus vite avec dice so nice (module recommandé)
- PATCH--> RELEASE

- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Verifier 
- Passage en typescript?
- Rajouter des règles d'architectures
- Tests fonctionnels + montée dernière version
- PATCH--> RELEASE

- Bug tornade effet magique
- Revoir les effets visuels et audio
- Gestions des principales Custom eval dans des méthodes
- Support avec un FQ Card Viewer
- PATCH--> RELEASE

- Refonte des cartes :
  - Ajout de cartes par classes pour caractérisation + de réactif et de passif?
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
- MINOR--> RELEASE

- Chercher dans votre défausse action
- Gérer les cartes incolores
- Ajouter du ciblage si oublié dans la dialog-play?
- Ne pas cliquer sur dialog-play si pas de cible sur une carte en nécessitant
- Proposer des cibles pas encore choisi 0dans dialog-play
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
- Supprimer la notion de joueur par main?
- Tests fonctionnels + montée dernière version
- MINOR--> RELEASE

- Finir Texte a trou dans la description des cartes remplis par les caractéristiques
- PATCH--> RELEASE

- Prise en compte la classe d'armure de DND5E -> Est que l'esquive devient plus qu'une demi-esquive?
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Ajout de spécialisation pour les 7 classes jusqu'au niveau 10
- Prise en compte des resistances
- MINOR--> RELEASE
### Fix mineure

### Chore:

- Migration Eizh complète avec les niveaux

## Backlog

### High:

- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens
- Gérer un nombre max d'utilisation pour des armes.

### Medium:

- Gladiateur -> resource spécial pour les armes?, renommer en maître d'armes
- Gérer du ciblage speciale : Zone
- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Comment gérer les effets visuels si le fichier n'existe pas?
- Limiter la taille de la main? ne pas piocher si arriver à cette limite


### Low:
- Ajouter également une fleche raccourci pour passer une carte du spellbook vers le deck
- Plus de sound effects differents

### Very Low:

- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
