## V2.x
### Fix Prioritaire

### Fix à prioriser
- No spellbook après montée jusqu'au niveau 4
- Frappe arcanique cassé?
- Bug avec le squelette géant
- Ne pas publier gratuitement tous les decks? toutes les fonctionnalités?

### Questionnement
- Reactif jouable a son tour?
- Guerrier Runique
  - Point de zèle trop au niveau 1?
  - Trop de pick pour le runic warrior? Pioche à 1 pour commencer? (Ou assumer et réduire le cout en action des sorts)
    - Bug de pioche (Runic-Warrior n'a pas assez de carte à piocher dans son deck)
  - La rune de célérité est ptetre trop forte

- « Un point de zèle au début de chaque tour » n'a pas de déclencheur de tour côté données — seul le DOT est appelé au tour,
et il ne touche que les PV ; un flags.dae.macroRepeat n'est pas exprimable depuis une carte (le schéma d'effet n'a pas de champ flags).
Je l'ai donc rendu comme carte passive gratuite, rejouable une fois par round : le joueur clique une fois par tour. Si tu veux le vrai automatisme, 
- il faudra une entrée dans le registre StatusEffects — donc du moteur.
  Le 1d6 de Magie Des Arcanes / Magie Blanche est tiré via Math.ceil(Math.random()*6) dans executeEval et annoncé dans le chat,
- pas via un Roll Foundry : ce Foundry refuse d'évaluer un dé en synchrone (cf. RollService.rollDiceSync), 
- et applyEffectsFormulas — le seul endroit qui roule proprement — ne sait poser que des effets actifs, 
- jamais du zèle ni une carte générée. Conséquence : pas d'animation Dice So Nice sur ce dé.

### Versions prévues
#### 3.0.0
- A relire et caractériser :
  Ajout de cartes par classes pour caractérisation (+ de réactif et de passif?) (Des cartes de bases ne sont pas forcément passive)
    - Relire et faire un point sur la caracterisation avant tout
  - Se poser pour refraichir la caractérisation :
    - Refaire une passe de toutes els fonctionnalités + celles à venir ET donner plus de cartes qui utilisent ces fonctionnalités
    - QU'est ce qui caractérisent une classe , faire une passe des sorts qui ne caracterise pas la class
      - Refaire des cartes pour chacune des classes qui ont trop de sorts les mêmes et bien les diviser par chaque niveau
        et en distribuer la moitié du nombre max. Bien faire la différenceciation des classes
      - Plus de carte qui dissipent des effets ou qui ont des chances de dissiper des effets
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
    - Pouvoir faire une lame chargé en une fois ou refonte?- > Remplacer la lame chargée par un sort qui fait plus de dégâts
      suivant le zèle qu'a la cible plutôt que la chargé Ou découper en plusieurs sorts, ceux qui charge du zèle et ceux qui en utilise?
    - Refaire un rééquilibrage des cartes après réécriture
    - Faire un inventaire des types de dégâts
    - Gérer les cartes incolores
    - Déplacer les cibles automatiquement (Example: Tir supersonique, Frappe avec salto arrière...)
- Est ce qu'on redivise pas en plusieurs modules : FX, Dégâts... avant de release?

Refonte des Cartes : 

    - Faire les nouvelles cartes pour Guerrier Runique
    - Faire les nouvelles cartes pour Maître d'Armes
    - Finaliser la doc pour la caractérisation
    - Feature manquantes?
    - Identifier cartes ne correspondant pas a la caractérisation. (Modifier ET/OU déplacer)
    - Ajouter les nouvelles caractérisations pour chaque classe
    - Faire un tour des features et en implémenter pour les classes en manquant (comme la cardSelection par exemple avec des cartes générés) (Si ça respecte la caractérisation)
    - Equilibrage du nombre de cartes par deck et par niveau jusqu'au 10
    - Equilibrage et tests
    - Dernier tour pour les abilities 

- Le tri dans les decks sont cassés
##### Backlog par classe
**Élémentaliste** : RAS notable.

**Gardien** :
- *Affutage* : le texte dit « +2X critique », le change applique `2*@cha` (X ne module que le coût).
- *Montée de mana* : le texte mentionne « −1 action par @wis », coût fixe −1 dans les données.
- *Renfort d'Armure* : durée illimitée dans les données vs « @con tours » dans le texte ; soigne @con/tour vs « 1 PV/tour ».
- *Tourbillon De Lame* : message de chargement réutilise le seuil 12 du Chargement Des Lames alors que son cap est 8.
- *Frappe provocatrice* : le texte propose « 4 PV si pas de mana », la 2ᵉ option coûte mana **et** PV.

**Mage Blanc** :
- *Exorcisme* : « coûte @cha en moins » non implémenté (coût fixe −7).
- *Bouclier magique* : le texte (prévention de blessures, cumul ×2) ne correspond pas à l'implémentation (tempmax + soin).
- *Frappe Solaire* : « réduit à 0 » vs override à 10 (mod 0) — cohérent en pratique, texte ambigu.

**Trapper** :
- *Tireur d'Élite* : texte « @int+7 » vs effet `10+@str` ; effet `self: false` sur un buff personnel.
- *Ajustage de Tir* : texte « +@int », valeur appliquée +1.
- *Pluie de Flèches* : annoncée incritiquable, `bonusCrit` vide.
- `enraged-bear.json` : résidu `special.sacrificedSkeleton` copié des squelettes.

**Moine** :
- *Uppercut* : « piochez une carte » non implémenté (`draw` vide).
- *Bouclier Zélé* : texte « 2+@cha zèle » vs `zeal: 1`.
- *Déplacement Éclair* : texte « 7+@dex » vs données `6+@dex`.
- Plusieurs effets auto-ciblés marqués `self: false` (Dissimulation, Bouclier Zélé).

**Sorcière** :
- SAG massivement utilisé par le deck mais absent de `primaryAbility` (INT+CHA).
- Invulnérabilité par override `hp.value` (Canalisation) : fragile si l'effet expire mal.

**Illusionniste** :
- *Frappe Illusoire* : formule `(@wpnM + @str XXX)` — opérateur manquant, plantage probable au parsing.
- *Passage éthéré* : `@wis` annoncé absent de la formule ; « incritiquable » non implémenté ; le swap de position est une action MJ manuelle.
- *Shuriken* : message « 2 tours » vs durée 3 tours.
- *Peste Noire* : `executeEval` sans garde sur acteur nul / doublons.

**Maître d'Armes** :
- Item `+1 mana (13) - M` résiduel dans les pools d'une classe sans mana (même anomalie chez le Gardien).
- Chevauchement pools A (niv. 2‑7) et B (niv. 1‑7) : 4‑5 choix de stats par niveau aux niv. 2‑7. À confirmer.
- Une seule arme `simpleR` existe (Arc de trappeur), aucune arme martiale : `@wpnR` sous-servi.

**Guerrier Runique** :
- *Rune de givre* : décrite « Réactive » mais `reactive: false` ; gain de zèle non documenté.
- *Rune de glacier* : seule rune offensive à scaler sur @con — intentionnel ?
- Critique absent des pools : choix de design ou oubli ?
- Trous de niveaux dans les decks de runes (jaune sans niv. 5, bleu sans niv. 4, rouge sans niv. 3) : Gravure parfaite (niv. 4‑6) ne peut proposer que 2 runes bleues distinctes sur 3 demandées.
- 20 cartes sur 21 en image placeholder `in_progress.png`.
- Plus de taunt, des sorts qui génère des cartes de dégâts spécifique
- Vérifier que les runes doivent augmenter les score de runes
- MINOR--> RELEASE

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
