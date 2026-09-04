# TODO — Audit de caractérisation des classes

> Document **généré** (2026-09-04) à partir du croisement de `devNotes/caracterisation.md`,
> `devNotes/TODO.md` et des données réelles des 19 decks patterns
> (`packs/_source/decks-pattern-fq8`, ≈380 cartes : coûts, portées, cibles, effets,
> minions, `customEvals`, réactifs) et de `lang/fr.json`.
>
> Il ne remplace pas `caracterisation.md` : il liste ce qu'il reste à faire pour que
> (1) chaque classe ait des particularités qu'elle seule possède, (2) les sorts ne se
> répètent pas, (3) les cartes soient cohérentes avec les spécifications.

---

## 1. Diagnostic : ce qui casse la différenciation

Le problème n'est pas qu'il manque des mécaniques uniques, c'est que **les mécaniques
uniques existantes sont noyées** : presque chaque classe possède 2 à 4 cartes qui font
ce que fait l'identité d'une autre classe.

### Matrice des mécaniques partagées (nombre de cartes)

| Mécanique | Propriétaire annoncé | Réalité dans les données |
|---|---|---|
| Soins | Mage Blanc (7) | Runique bleu **9**, Illusionniste 5, Gardien 3, Moine 1, Sorcière 1 |
| Critique (buff) | Trapper (2) | Runique rouge **13**, Illusionniste 3, **Moine 3**, Gardien 2 |
| Esquive (buff) | Moine (**0**) | Runique bleu **7**, Illusionniste 2, Gardien 1, Trapper 1 |
| Taunt | Gardien (1) | Runique bleu **6**, Moine 1 |
| Réactifs | Mage Blanc / Moine | Trapper **9**, Mage Blanc 6, Moine 4, Gardien 3, M. d'Armes 3 |
| PV → ressource | Gardien (4) | Sorcière 2, Mage Blanc 2, Runique rouge 2, Élémentaliste 1 |
| Défausse → main | (personne) | Sorcière 3, Runique 2, Trapper 1, plus *Réminiscence* neutre |
| Invulnérabilité 1 tour | (personne) | Illusionniste, Moine, Mage Blanc, Sorcière, Runique rouge |
| Effets élémentaires | Élémentaliste | **Illusionniste applique Burn / Frost / Earth / Air** (Apothicaire I et II) |
| Gain de mana | — | 8 classes sur 9, plus le deck neutre |

### Constat a — Le Guerrier Runique cannibalise les identités

Ses 114 runes reproduisent, mieux que leurs propriétaires, le soin du Mage Blanc, le
critique du Trapper, l'esquive du Moine et le taunt du Gardien. C'est logique pour un
deck-builder, mais sans contrainte il devient « toutes les classes en une ».

**Chantier n° 1.** La contrainte doit être *quantitative*, pas thématique : une rune doit
être plus faible à l'unité que la carte-signature de la classe qu'elle imite, et ne
devenir forte que via les compteurs `@bonus.blueRune` / `@bonus.redRune` /
`@bonus.yellowRune`. C'est déjà le modèle de 4 runes (*Rune de l'éternité*,
*Rune de l'insaisissable*, *Rune d'hécatombe*, *Rune de perfection*) — il faut le
généraliser.

### Constat b — Le déclencheur réactif est saturé

7 classes sur 9 utilisent le même déclencheur : `tookDamageThisRound`. Le moteur expose
pourtant des déclencheurs bien plus caractérisants, chacun utilisé par une seule carte :
`tookSpellThisRound`, `attackEvadedThisRound`, `targetsDealtDamageThisRound`,
`targetsAreCurrentCombatant`, `targetsHaveNotMovedThisTurn`, `targetsClustered`,
`lastCriticalThisTurn`, `hasEquippedShield`.

**Proposition la plus rentable de l'audit : un déclencheur réactif réservé par classe, les
autres lui étant interdits.**

| Classe | Déclencheur réservé |
|---|---|
| Gardien | `hasEquippedShield` + `targetsTookDamageThisRound` (protéger un allié) |
| Mage Blanc | `targetsDealtDamageThisRound` (punir l'agresseur d'un allié) |
| Moine | `tookSpellThisRound` (réagir aux sorts, pas aux coups) |
| Trapper | `targetsWithinReach` (approche) + `targetsAreCurrentCombatant` / `targetsHaveNotMovedThisTurn` |
| Maître d'Armes | `attackerWithinReach` (riposte au contact strict) |
| Illusionniste | `attackEvadedThisRound` (réagir à sa propre esquive — colle à *Images Miroir*) |
| Élémentaliste | `targetsHaveEffect` (réaction conditionnée à un élément posé) |
| Sorcière | mort d'un squelette / score de sacrifice |
| Guerrier Runique | **aucun** (déjà acté, à tenir) |

---

## 2. Sorts qui se répètent

### 2.1 Doublons inter-classes

| Doublon | Qui | Décision proposée |
|---|---|---|
| **Virus** (PV max rabattus sur PV restants) | Trapper *Mutation virale* / Mage Blanc *Virulence* | Effet final strictement identique. Garder au **Mage Blanc** (payoff de malédiction). Le Trapper garde le poison propageant, sans finisher. |
| **Duplication de carte en main** | M. d'Armes *Réplique parfaite* (annoncé « le seul ») / Illusionniste *Magie des Arcanes* et *Magie Blanche* | Retirer la copie côté Illusionniste (garder le zèle sur 1d6), ou changer son verbe : l'Illusionniste ne **copie** pas, il **rejoue** (retour depuis la défausse). |
| **Effets élémentaires** | Élémentaliste / Illusionniste *Apothicaire I* et *II* (Earth, Air, Burn, Frost) | Violation frontale. Reskin des potions offensives en effets **d'illusion** (−portée de la cible, −précision, désorientation) plutôt qu'en éléments. |
| **Poison** | Trapper (3) / Illusionniste *Shuriken empoisonné* / Runique rouge *Lame de fiel* | Le poison propageant est une vraie signature Trapper. Le retirer à l'Illusionniste (ses shurikens font déjà Bleeding). |
| **Saignement** | Gardien *Hémorragie* / Illusionniste *Shuriken* | Garder au Gardien (thème blessure / rage). L'Illusionniste pose du DoT « spatial » (*Nuage de dague*, excellent et unique). |
| **Contre-attaque réactive** | 5 classes (*Riposte*, *Miroir*, *Coup de bouclier*, *Tir réflexe*, *Bouclier vengeur*) | Ne pas fusionner : **différencier par le déclencheur** (§ 1, constat b). C'est le même sort 5 fois uniquement parce que la condition est la même. |
| **Invulnérabilité 1 tour** | 4 classes | Trop. Garder le Mage Blanc (*Bouclier Divin*, la version qui **restaure**) et la Sorcière (*Canalisation*, sur les **squelettes**). Moine et Illusionniste ont mieux ailleurs. |
| **Récupération défausse → main** | Sorcière ×3, Runique ×2, Trapper ×1, plus le neutre | En faire la **signature Sorcière** (nécromancie = ramener les morts). Retirer *Rune de sursaut* et *Rune de mémoire* au Runique ; *Étude du point faible* se limite à récupérer la carte esquivée. |

### 2.2 Doublons intra-classe

**Guerrier Runique — 5 paires strictement identiques** (même description, seul le coût
change) :

- *Rune de défi* / *Rune de bravade*
- *Rune de forge* / *Rune de fonte*
- *Rune d'élan* / *Rune de ruée*
- *Rune de vindicte* / *Rune de réprimande*
- *Rune de célérité* / *Rune de hâte*

et *Rune de sérénité* / *Rune de quiétude* ont **exactement le même texte et la même
formule**. Si c'est volontaire (épaissir le pool de gravure), le documenter dans
`caracterisation.md` ; sinon ce sont 6 cartes à réécrire.

**Mage Blanc** — *Sentence maudite* (×2) et *Jugement dernier* (×3) sont la même carte à
un coefficient près : fusionner en une seule carte avec X.

**Illusionniste** — *Apothicaire I* et *II* partagent 3 potions sur 5 ; *Peste Noire* et
*Contagion* sont deux variantes de duplication d'effets ; *Magie des Arcanes* et
*Magie Blanche* sont la même carte (dégâts / soins).

**Deck neutre** — *Récupération de mana I/II/III*, *Booster de tour III/VI/IX* et
*Pioche II/III* forment 8 cartes vanille sans identité.
**Recommandation : les supprimer.** Une carte neutre « +3 mana » retire à chaque classe
l'occasion d'avoir *sa* façon de regagner du mana (le Gardien paie en PV, le Moine
convertit le zèle, l'Illusionniste convertit des actions, la Sorcière sacrifie). Ne garder
que *Réminiscence* et le *Dash*.

---

## 3. Incohérences doc ↔ données

À corriger dans `caracterisation.md`, ou dans les cartes selon l'arbitrage.

| Affirmation de la doc | Donnée réelle |
|---|---|
| Moine : « **Jamais de critique** » | *Lame Fantôme* (`crit=@str`) et *Combo 2* (`crit=2X`) |
| Gardien : « seule carte de provocation du jeu avec l'Uppercut » | 6 cartes de taunt côté runes bleues |
| M. d'Armes : « le seul à pouvoir dupliquer une carte » | Illusionniste *Magie des Arcanes* / *Magie Blanche* |
| M. d'Armes : « Stats FQ : **zèle** + action + critique + main » | Le tableau de synthèse de la même doc indique action 5 / crit 4 / esq 4 / main 3 — pas de zèle |
| Runique : « pas de sort multi-cible (très peu d'exception) » | *Frappe vindicative* I/II (2 cibles), *Rune de vendetta* (2), *Rune de clameur* (tous les ennemis) |
| Runique : « seules les frappes runiques consomment de la mana » | *Communion Runique* coûte 6 mana |
| Élémentaliste : « Feu : dégâts de durée sur 5-6 tours » | Burn dure **3 tours** partout |
| Élémentaliste : « Givre : réduire l'esquive » puis « Terre : −esquive » | La doc se contredit ; dans les données Givre = −PA max, Terre = −esquive / −critique |
| Moine : « esquive la mieux dotée du jeu » | Vrai via les cartes de **stats**, mais **aucune carte de sort** ne monte son esquive |

Le dernier point demande une décision. Le TODO Moine propose « deuxième tank : augmente
l'esquive, combo d'esquive, ne peut plus gagner de zèle en mode esquive ».
**À retenir** : cela règle à la fois le trou d'identité et le fait que le Runique bleu est
aujourd'hui meilleur esquiveur que le Moine. Le trade-off « esquive ⇄ zèle » est le genre
de tension que seule cette classe posséderait.

---

## 4. Avis sur les TODO déjà prévus

### À faire tel quel

- **Moine** — dégâts scalant sur les cartes en main ou jouées ce round. Six cartes
  existent déjà au niveau 11 (*Cadence*, *Poings des cent formes*, *Vacuité*,
  *Hyperactivité*, *Ferveur intérieure*, *Sérénité pleine*). Vraie signature mécanique que
  personne d'autre n'a : **les descendre aux niveaux 3 à 8** plutôt que de les laisser
  garées au 11.
- **Mage Blanc** — malédictions en stacks sans durée, relâchées avec un payoff
  quadratique. À moitié en place (*Pacte maudit*, *Sentence*, *Jugement*, *Virulence*).
  Terminer, et **transférer le bouclier de PV temporaires au Gardien** comme prévu : le
  Mage Blanc prévient ou annule, le Gardien absorbe.
- **Gardien** — « plus de dégâts quand moins de PV » et « zèle non dépensé = dégâts ».
  Ferme sa boucle PV ↔ zèle et remplace avantageusement *Chargement des lames* (compteur à
  12 lourd, et son message de chat réutilise le mauvais seuil pour *Tourbillon de Lame*).
- **Illusionniste** — « +1 portée sur critique / sur esquive ». Transforme sa ressource en
  récompense passive plutôt qu'en taxe de setup, et n'empiète sur personne.
- **Sorcière** — Roi Squelette (fusionner des squelettes, conserver le score de sacrifice).
  Seul vrai capstone d'invocateur encore manquant.

### À retravailler

- **Trapper — « transférer des caractéristiques ×2 ou ×3 sur une bête »** : c'est un buff
  de minion, or la Sorcière possède déjà *Bouclier d'os* et *Forme d'ombre*. Faire plutôt
  du Trapper le **dresseur qui joue avec sa bête** (cartes conditionnées à la bête
  adjacente à la cible, ou qui font agir la bête hors de son tour) : la Sorcière buffe une
  masse, le Trapper coordonne un binôme.
- **Illusionniste — « Maître du temps »** : *Frappe temporelle*, *Bombe à retardement*,
  *Soins expansifs* et *Miroir* existent déjà. Le thème est bon mais entre en collision
  avec le constat « soutien trop similaire au Maître d'Armes ». Choisir :
  **temps / espace** (et alors déplacer *Attaque latérale* et *Attaque en cercle* vers le
  Maître d'Armes, comme prévu — à retenir) **ou** apothicaire-barde. Les deux à la fois,
  c'est ce qui le rend flou.
- **Élémentaliste — « générer des boules de feu au bout de X tours »** : la génération de
  cartes est déjà la signature du Maître d'Armes (forges) et du Runique (gravures). Trois
  classes qui génèrent des cartes, c'est une de trop. Renforcer plutôt le modèle
  « prérequis d'effets », **déjà unique et efficace** (9 cartes sur 23 verrouillées par
  `targetsHaveEffect`).

### À abandonner

- Le **virus côté Trapper** (doublon Mage Blanc).
- Les **cartes neutres de ressources** (§ 2.2).

---

## 5. Ordre de travail proposé

1. **Vider le parking niveau 11/12.** 37 cartes y sont garées (Moine 13, Illusionniste 8,
   Trapper 6, Élémentaliste 5, Mage Blanc 4, Sorcière 4). Six classes n'ont **rien entre
   les niveaux 8 et 10** alors que le Maître d'Armes et le Guerrier Runique y montent.
   C'est le trou le plus visible en jeu.

   | Deck | Répartition actuelle des niveaux |
   |---|---|
   | Élémentaliste | 1:4 2:4 3:1 4:4 5:2 6:4 7:1 **11:5** |
   | Gardien | 1:3 2:2 3:5 4:2 5:2 6:3 7:2 |
   | Mage Blanc | 1:4 2:1 3:3 4:3 5:5 6:3 7:1 **11:4** |
   | Trapper | 1:5 2:2 3:2 4:2 5:3 6:4 7:1 **11:6** |
   | Moine | 1:4 2:2 3:3 4:3 5:2 6:3 7:2 **11:12 12:1** |
   | Sorcière | 1:2 2:5 3:3 4:1 5:3 6:3 7:1 **11:4** |
   | Illusionniste | 1:6 2:2 3:4 4:3 5:4 6:3 7:1 **11:6 12:2** |
   | Maître d'Armes | 1:5 2:5 3:4 4:3 5:4 6:6 7:2 8:3 9:1 10:2 |
   | Runique (par couleur) | 1:7 2:6-7 3:3-4 4:5-7 5:4-5 6:3 7:2-3 8:2 9:1 10:2 |

2. **Poser les verrous d'identité** dans `caracterisation.md` : un tableau
   « mécanique → classe propriétaire → classes interdites », et le tableau des déclencheurs
   réactifs du § 1. Sans ce tableau, chaque nouvelle carte recréera le problème.
3. **Passer le Guerrier Runique au filtre** : toute rune qui imite une signature d'une
   autre classe doit scaler sur un compteur de runes.
4. **Traiter les doublons du § 2**, puis corriger les incohérences du § 3.
5. **Alors seulement** ajouter les nouvelles cartes des TODO validés au § 4.
