## V2.x
### Fix Prioritaire

### Fix mineure
- Vérifier la localisation notamment pour les macros

### Fix à prioriser
- Problème encore avec le clignotement
- Un joueur peut encore amener des cartes de son deck vers sa main avec la limitation des droits des joueurs
- Changer les valeurs par défaut de l'animations de la fenetre de résultats
- Vérifier formulaire, certaines mise en forme ont sautés...
- Jets de sauvegarde contre la mort optiona mettre à true par défaut dans les mondes générés 

### Versions prévues
#### 3.0.0
- Rajouter que les cartes de niveau 1 sont obligatoires dans les decks? OU deck minimum?
- L'esquive fait demi-dégâts
- Prise en compte la classe d'armure de DND5E, chaque sort demande soit une classe d'armure soit des jés de sauvegarde soit rien
  - Rajouter la classe d'armure Aux attaques -> La classe d'armure surpassant le jet d'attaque fait demi-dégâts?
  - Rajoute des dés de sauvegarde à ceux configurés dans les sorts ou les cartes : Prérequis: comment prendre 
  - Le Raccourci pour ne pas lancer l'attaque à enlever
  - Décidé : sur une défense réussie (esquive, sauvegarde, armure), les effets/statuts de la carte sont TOUJOURS appliqués. À revoir plus tard : rendre ça configurable carte par carte (drapeau "effets annulés sur défense réussie").
  - Décidé : entraînement aux armures CONSERVÉ, sur le référentiel dnd5e (system.traits.armorProf : lgt/med/hvy/shl). Aucune mécanique nouvelle : dnd5e calcule déjà proficiencyMultiplier, le moteur applique la conséquence (désavantage For/Dex) que le système laisse non implémentée.
  - Décidé : maîtrise des armes ET des armures à renseigner sur les 9 classes et les héros de départ (weaponProf + armorProf) + advancements de maîtrise à la montée de niveau.
  - À discuter en fin de chantier : revue générale des advancements des classes.
  - À REPRENDRE dans une phase à part : le DESIGN de la 7e bulle (bulle de toucher) sur la face
    de carte. Elle fonctionne — « CA » pour une attaque, l'abrégé de la caractéristique pour une
    sauvegarde, dans le trou déjà découpé du socle — mais son dessin reste à retravailler.
  - À REPRENDRE : refonte de la fenêtre de résultat en colonnes Attaque / Défense (maquette
    validée en discussion, pas encore implémentée).

#### 3.0.1
  
- faire bouger tornade effet magique
- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens (vérifier que c'est pas déjà fait)
- J'ai l'impression que ya pas la bonne couleur de dé quand on fait le roll damage depuis une arme équipé (grave?)
- Valeurs sentinelles (`-9999`, `999999999`, `99999999`) utilisées comme drapeaux (pas de crit, cible inesquivable, 
 portée/cibles infinies, rejouable infini) : fragiles, à remplacer par de vrais flags.
- Revoir createEffectsFromData a simplifier -> Pas de transformation spécifiques
- La main ne parait pas entière des fois , besoin de refraichir??? si piocher avant connexion??? --> VOIR SI CA REVIENT SINON FIX MINEUR
- Rajouter des règles d'architectures
- Généraliser la récupération d'un token avec game.canvas.tokens.get("cUb1KOvLxsIS9IuN");
- Plus de sound effects et FX differents

#### 3.1.x
- Faire un générateur pour créer son propre start heroes? stats de base?
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Prise en compte des resistances, absorption des dégâts
- Prise en compte des jet d'attaque (pour toucher les monstres)?
- Sort qui touche tous les alliés du canvas? tous les ennemis de canvas? (AURA)
- MINOR--> RELEASE

## Backlog
### Fix mineure
- Si ça devient génant, pour les choix de l'effet de la carte, mettre null de base et empecher de cliquer sur jouer si pas choisi ( comme X et Y)

### Chore:
- Migration Eizh complète avec les niveaux

### Feat:
- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Est ce qu'on peut faire des cartes qui construisent des tiles infranchissables?
- Règles sur les repos possible:
  - Après un repos long, la constitution ajoute X points de vie temporaire (X = (niveau * bonus de constitution)) ? (A
  tester)
  - La constitution doit augmenter la récupération des points de vie directement à la fin d’un combat (niveau +
  constitution) ou pendant un repos court (niveau + 1d(2* constitution))
- Plusieurs attaques d'opportunités?
