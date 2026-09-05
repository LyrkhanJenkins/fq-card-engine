## V2.x
### Fix Prioritaire

### Fix à prioriser

### Versions prévues
#### 3.0.0
- Lancer les dé auto save et passe son tour throw par un module ou par le module ET supprimer les minions qui sont mort?
- Est ce qu'on redivise pas en plusieurs modules : FX, Dégâts... avant de release?

#### 3.0.1
- L'esquive fait demi-dégâts (Esquive critique? Double-critique?)
- faire bouger tornade effet magique
- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens (vérifier que c'est pas déjà fait)
- J'ai l'impression que ya pas la bonne couleur de dé quand on fait le roll damage depuis une arme équipé (grave?)
- Valeurs sentinelles (`-9999`, `999999999`, `99999999`) utilisées comme drapeaux (pas de crit, cible inesquivable, 
 portée/cibles infinies, rejouable infini) : fragiles, à remplacer par de vrais flags.
- Supprimer la notion de joueur par main si le joueur n'a qu'une main possible
  -> Si joueur alors ce dernier ne peut avoir qu'une main, pas de configuration
- Volée de shuriken et shuriken, effet spéciaux à changer
- Revoir createEffectsFromData a simplifier -> Pas de transformation spécifiques
- La main ne parait pas entière des fois , besoin de refraichir??? si piocher avant connexion??? --> VOIR SI CA REVIENT SINON FIX MINEUR
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Rajouter des règles d'architectures
- Généraliser la récupération d'un token avec game.canvas.tokens.get("cUb1KOvLxsIS9IuN");
- Remplacer empty-hand-message.html (par un gros bouton de configuration?) (commit 27 mai 2026)?
- Tests fonctionnels + montée de version jusqu'à la dernière v14
- Plus de sound effects et FX differents

#### 3.1.x
- Prise en compte la classe d'armure de DND5E
- Ajout des cartes pour les 9 classes (jusqu'au niveau 10)
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Prise en compte des resistances, absorption des dégâts
- Prise en compte des jet d'attaque (pour toucher les monstres)?
- Sort qui touche tous les alliés du canvas? tous les ennemis de canvas? (AURA)
- MINOR--> RELEASE

## Backlog
### Fix mineure
- Si ça devient génant, pour les choix de l'effet de la carte, mettre null de base et empecher de cliquer sur jouer si pas choisi ( comme X et Y)
- Dé à 0 face : les cartes en `1d(expr)` (ex. `1d(2*@str)`, `1d(@str)`, `1d(2*@wis)`, `1d(2*@dex)`) plantent au vrai Roll si le modificateur concerné vaut 0.
- `1d(4-XXX)` (EarthFracture) et `1d(6-XXX)` (GiantStalactite) produisent des faces ≤ 0 (dé invalide) quand XXX est élevé.
- `playDialog` : `firstChoice.replayable` est lu sans garde de nullité (`str.includes` plante si le champ est absent).
- Est ce que l'animation de pioche de carte est trops rapide?

### Chore:
- Migration Eizh complète avec les niveaux

### Feat:
- Est ce qu'on limite le nombre de carte de base max?
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
