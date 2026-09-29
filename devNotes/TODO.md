## V2.x
### Fix Prioritaire
- Supprimer les visuals et ne plus utiliser que J2BA
- Montée en version 6.0.5 de dnd5E
- Mise à jour des README de tous les modules + page de foundry
- TODO tests modules importé dans l'ordre : Restrain movement enhanced combat, card engine, et card engine extended
### Fix mineure
- Vérifier la localisation notamment pour les macros
- faire bouger tornade effet magique
- Quand fin du combat, supprimer le dossier temporaire d'acteur et supprimer les tokens (vérifier que c'est pas déjà fait)
- La main ne parait pas entière des fois, besoin de refraichir??? si piocher avant connexion??? --> VOIR SI CA REVIENT SINON FIX MINEUR

### Fix à prioriser
- Problème encore avec le clignotement (Reporté en phases de tests)

### Versions prévues
#### 3.0.0
- Utiliser la portée des armes pour certaines cartes?
- Une rapière pour l'illusionniste de base

#### 3.1.x
- Rajouter des règles d'architectures
- Déplacer la tooltip de distance entre les cibles + Attaques dd'opportunités dans le fq-enhanced-combat
- Valeurs sentinelles (`-9999`, `999999999`, `99999999`) utilisées comme drapeaux (pas de crit, cible inesquivable,
  portée/cibles infinies, rejouable infini) : fragiles, à remplacer par de vrais flags.
- Faire un générateur pour créer son propre start heroes? stats de base?
- Sort qui touche tous les alliés du canvas? tous les ennemis de canvas? (AURA)
- MINOR--> RELEASE

## Backlog
### Fix mineure
- Si ça devient génant, pour les choix de l'effet de la carte, mettre null de base et empecher de cliquer sur jouer si pas choisi ( comme X et Y)

### Chore:
- Migration Eizh complète avec les niveaux

### Feat:
- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Règles sur les repos possible:
  - Après un repos long, la constitution ajoute X points de vie temporaire (X = (niveau * bonus de constitution)) ? (A
  tester)
  - La constitution doit augmenter la récupération des points de vie directement à la fin d’un combat (niveau +
  constitution) ou pendant un repos court (niveau + 1d(2* constitution))
- Plusieurs attaques d'opportunités?
