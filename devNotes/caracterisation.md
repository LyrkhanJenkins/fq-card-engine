# Caractérisation des classes

Document de référence design : ce qui définit chaque classe (identité dnd5e, stats FQ, rôle, mécaniques signature), établi à partir des données réelles (`packs/_source/classes-fq8`, `decks-pattern-fq8`, `classes-stats-fq8`, `lang/fr.json`) et du code (`src/domain`).

---

## Rappel système

### Rôle des caractéristiques dnd5e

Chaque carac a un usage dominant bien tranché dans les formules de cartes (comptage sur l'ensemble des decks patterns) :

| Carac | Usage principal                                          | Usages secondaires                                                                  |
|---|----------------------------------------------------------|-------------------------------------------------------------------------------------|
| **@str** | **Dégâts de mêlée physiques**                            | Autre sort augmentant les dégâts, Critique                                          |
| **@dex** | **Dégâts des attaques rapides et à distance**            | **Portée** , Esquive, recul/déplacement, dés variables , bornes X de pioche/conversion |
| **@con** | **Points de vie**: réduction des coûts en PV, auto-soins | Régénération , resistance altération d'état                                         |
| **@int** | **Dégâts magiques directs**                              | Taille de zone , portée de sort, dégâts des invocations (Skeleton Sorcerer, Ours)   |
| **@wis** | **Tout ce qui dure : DoT, effets appliqués et soins**    | **Rejouabilité** (`replayable: @wis` des boucliers du Mage Blanc), durées d'effets  |
| **@cha** | **Invocations** **Durée des effets**                     | Taunt                                                                        |


### Stats FQ du personnage

| Stat | Chemin | Rôle | Montable via carte de stat |
|---|---|---|---|
| PV | `attributes.hp` | Vie ; dé de vie propre à la classe (d4 → d12) | Non (dé de vie) |
| Points d'action | `fq.action` | Capacité d'agir, remis au max chaque tour | Oui (`action-point`) |
| Mana | `fq.mana` | Ressource limitée, non régénérée par tour | Oui (`mana`) |
| Zèle | `fq.zeal` | Monte en jouant des petites cartes, se dépense sur les grosses ; remis à `zeal.init` chaque tour (max global 8) | Oui (`zeal` → monte `init`) |
| Critique | `fq.attributes.critical` | Seuil `21 - crit - bonusCrit` sur 1d20 ; réussite = dégâts/soins doublés | Oui (`critical`) |
| Esquive | `fq.attributes.evasion` | Seuil `21 - eva - bonusEva` sur le d20 de la cible ; annule les dégâts (sauf critique adverse : dégâts simples) | Oui (`evasion`) |
| Main | `fq.cards.hand` | Cartes piochées au début du combat | Oui (`hand`) |
| Pioche | `fq.cards.pick` | Cartes piochées chaque tour | Oui (`pick`) |
| Déplacement | `movement.walk` | Mouvement | Oui (`moving`) |
| Bonus de portée | `fq.bonus.range` | Ajouté au `maxReach` de toutes les cartes — **jamais montable**, uniquement en combat | Non |
| Défausse courante | `fq.cards.currentDrop` | Compteur de défausses du round, payable via `drop` | Non |
| DOT/HOT | `fq.bonus.dot` | Dégâts (ou soins si négatif) par tour | Non |

8 types de cartes de stats existent : `action-point`, `mana`, `critical`, `evasion`, `hand`, `pick`, `moving`, `zeal`. Il n'existe **ni carte PV ni carte portée**.

Distribution : pool **primaire** (classe principale) = 3 choix aux niv. 2‑4 puis 2 aux niv. 5‑7 (15 stats) ; pool **secondaire** (variantes « - M ») = 2/niveau aux niv. 1‑7 ; même pool sans restriction 2/niveau aux niv. 8‑20. ASI +2 à chaque niveau pair. **La composition du pool primaire est le marqueur d'identité le plus fiable d'une classe** (voir tableau ci-dessous).

### Types de rôles utilisés dans ce document

- **Tank** : encaisse, provoque, protège (PV, taunt, réactions défensives)
- **DPS mêlée / distance** : dégâts directs, mono ou multi-cibles
- **Contrôle / debuff** : entraves, malus, DoT, zones
- **Soutien / soins** : buffs d'équipe, soins, boucliers
- **Invocateur** : joue à travers ses sbires
- **Moteur / scaling** : classe faible au départ qui construit sa puissance en cours de combat (ressource cumulative, deck-building, compteurs)

### Vue d'ensemble

| Classe | Dé de vie | Caracs dnd5e | Pool primaire (dominantes) | Rôle | Signature |
|---|---|---|---|---|---|
| Élémentaliste | d4 | INT + SAG | mana 12, action 4 | DPS burst + debuff | 4 effets élémentaires prérequis des combos |
| Gardien | d12 | FOR + CON | action 5, main 4, esq 4, crit 4 | Tank offensif | PV comme monnaie, zèle, charges de lame |
| Mage Blanc | d6 | CON + SAG | mana 8, crit 4, esq 4, action 4 | Soigneur / contrôleur DoT | Malédictions + boucliers réactifs |
| Trapper | d8 | DEX + SAG | crit 6, mana 6, action 4 | DPS distance / sniper | Critique-ressource, pièges réactifs, bêtes |
| Moine | d8 | FOR + DEX | esq 6, action 4, zèle 4, dépl 4 | Bruiser à tempo | Flux de cartes ↔ zèle, rejouable conditionnel |
| Sorcière | d6 | INT + CHA | mana 8, action 6, esq 4 | Invocatrice | Armée de squelettes + score de sacrifice |
| Illusionniste | d6 | DEX + CHA | action 6, mana 4, main 3 | Contrôle / soutien hybride | Portée cumulative dépensable |
| Maître d'Armes | d10 | FOR + DEX | action 5, crit 4, esq 4, main 3 | DPS martial polyvalent | Armes équipées (`@wpnM`/`@wpnR`), sans mana |
| Guerrier Runique | d10 | FOR + INT | action 6, main 4, mana 4, pioche 2 | Moteur / late-game carry | Deck-building en combat (runes) |

Stats absentes notables : **critique** jamais montable pour Moine, Sorcière et Guerrier Runique ; **esquive** absente du pool primaire de l'Élémentaliste et du Trapper.

---
### Règles générales sur les cartes
- Les dégâts de zone ne font pas beaucoup moins de dégâts que les sorts monocibles (ne divise pas les dégâts entre les cibles)

**Questionnement et TODO Générique :** 
- Supprimer les cartes neutre pour le moment et faire des mécaniques différentes pour récupérer action mana ou pioche?
OU - Assumer jusqu'au bout des cartes neutres
  - Neutre? Dash -> défaussez 2 cartes, 10 actions -> double le déplacement
- TODO Virus à partir de poison?
- TODO Poison (dégâts et duplication)
- TODO Malédiction sans dégâts
- Plusieurs attaques d'opportunités?
- L'esquive fait demi-dégâts?

# Élémentaliste

> « Allie des effets de feu, de givre, d'air et de terre pour infliger d'importants dégâts. Fragile mais possède les plus gros dégâts bruts du jeu. »

**Identité dnd5e** : d4 , INT + SAG (les deux requises). Deux cartes hors-thème récompensent DEX (Assassin du néant) et CHA (Plastron magique).

**Stats FQ** : mana écrasant (12/22 du pool primaire), puis points d'action. **Aucune esquive en primaire** : la survie n'est pas une option de build, c'est la portée qui protège.

**Rôle** : DPS magique « glass cannon », mono-cible burst avec pivot AoE (Météore, Onde glacée, Choc de feu), contrôle/debuff en sous-produit.

**Mécaniques signature** :
- Feu : plus de dégâts sur la durée, plus de cumul avec xvalue : Dégâts de durée sur 5 6 tours
- Givre : Réduire l'esquive, Augmenter fortement l'esquive : Dégâts en 2 tours, 3 tours
- Terre : Réduire le déplacement, Bloquer, Réduire la portée : Gros dégâts monocible
- Air : Réduire le critique, Augmenter fortement le critique : Dégâts multicibles
- **Les 4 effets élémentaires** : Brûlure (DoT), Givre (−PA max de la cible), Air (−déplacement, jusqu'à immobilisation), Terre (−esquive / −critique). Posés en proc (`1d2`, `1d3`…) par les cartes de niveau 1 et par la carte de base *Magie Des Éléments* (4 choix, passive, coût = 1 défausse).
- **Payoff à étages** : 9 cartes sur 23 exigent des effets actifs via `targetsHaveEffect` — 1 effet (Givrefeu, Météore, Brouillard…), 2 effets différents (Assassin du néant), 4 effets (Missiles Magiques +, le finisher).
- **X à risque/récompense** : plus X monte, plus les dégâts montent mais plus la chance d'appliquer l'effet baisse (`1d(4−X)`).
- **Zèle bidirectionnel** : les cartes de pose génèrent du zèle, les finishers le consomment (jusqu'à −4).
- Dégâts multi-types systématiques (6 types) pour contourner les résistances. Aucun minion, une seule réactive (Captation de mana).

**Boucle de jeu** : tours 1‑2 amorçage (poser les éléments, accumuler zèle) → tours 3+ détonation (combos verrouillés par prérequis).

**Faiblesse**:
- Le moins de point de vie (d4)

**Questionnement et TODO :**
- Cartes qui génére des boules de feu, de givre ...etc au bout de tant de tour?.
- Changement de boule de feu en trait de feu pour coller a dnd5e, la boule de feu fait de gros dégâts de zone
---

# Gardien

> « Le plus grand nombre de points de vie du jeu. Peut puiser dans ses points de vie pour améliorer ses dégâts. »

**Identité dnd5e** : d12, FOR + CON. CHA sert aux cartes de provocation et au Coup de bouclier.

**Stats FQ** : profil équilibré tourné vers l'action et la main (la plus grosse main du jeu selon l'historique), quasi **aucun mana** (1 item résiduel). Sa vraie ressource est le couple PV + zèle.

**Rôle** : tank offensif / bruiser « sustain-tank », protecteur d'équipe à partir du niveau 6.

**Mécaniques signature** :
- **PV comme monnaie** : Frappe Héroïque (−(6−@con) PV au lieu du mana), Frappe provocatrice, Tourbillon de Lame, Montée de la rage (PV → mana).
- **Zèle bidirectionnel** : généré en frappant (+1 sur les attaques de base), dépensé sur les gros coups et toutes les réactions.
- **Charges de lame** : Chargement Des Lames (cap 12 → dégâts ×2) et Tourbillon De Lame (cap 8 → AoE adjacente), via compteurs `flags.fq` + `counterWithinCap`/`counterEquals`.
- **Réactions défensives** : Coup de bouclier (contre-charge), Intervention (prend les dégâts d'un allié à sa place), Levée De Bouclier (récupère la moitié des dégâts subis).
- **Postures et trade-off crit ↔ esquive** : Changement De Posture (rejouable à l'infini), Posture De Berzerker et Rage Ultime (puissance contre auto-DoT).
- **Taunt** : Frappe provocatrice, seule carte de provocation du jeu avec l'Uppercut du Moine.

**Boucle de jeu** : frapper pour générer du zèle, payer en PV ce que le mana ne couvre pas, encaisser/réagir hors tour, basculer protecteur (Rempart Magique, Intervention, Essor Vital) en fin de combat.

**Faiblesse**:
- Le moins de point de mana

**Questionnement et TODO :**
- Ange Gardien : Générer un bouclier qui regagne des points de vie chaque tour (Tisse-mort de slay the spire?)
  Sort pour l'améliorer, ou pour taunt ou pour toucher plusieurs cibles
  - Berzerk : Sort qui enlève des points de vie + Sort qui font plus de dégâts si moins de vie ou qui fait piocher en
    enlevant des points de vie
  - Rage : Sort pour monter le zèle, sort qui fait plus de dégâts plus on a de zèle pas dépenser,
    sort qui fait gagner du zèle max: Remplacer par exemple la lame chargée par ça
  - Transfert de pv vers des alliés
---

# Mage Blanc

> « Le meilleur soigneur et protecteur, mais ses malédictions peuvent infliger d'importants dégâts également. »

**Identité dnd5e** : d6, CON + SAG (les deux requises) ; INT s'ajoute en pratique (dégâts radiants, boucliers réactifs) — classe structurellement étalée sur 3 caracs.

**Stats FQ** : mana très dominant (8 paliers en primaire + 10 en secondaire), points d'action ensuite. Zèle réservé aux hauts niveaux mais **généré en jeu** par la moitié du deck.

**Rôle** : soigneur-protecteur **réactif** doublé d'un contrôleur DoT — sa valeur se mesure pendant les tours adverses.

**Mécaniques signature** :
- **Malédiction (`Curse`)** : Pose plusieurs stacks sur des cibles, permets d'utiliser d'autre sort efficaces avec bc de stack. Tue une cible ayant suffisament de malédiction 
- Le pendant positif `Bless` (DoT négatif = régénération) arrive au niveau 7.
- **Suite de boucliers réactifs** : 5 cartes `reactive` (Bouclier de Mana, Divin, Vengeur, Empathique, Malédiction Instantanée) avec `replayable` indexé sur `@wis` — la sagesse fixe le nombre de réactions. Trois modèles de mitigation distincts : PV temporaires, soin réactif répété, invulnérabilité + restauration (Bouclier Divin).
- **Transmutation de ressources** : Sang Bleu (2 PV → 1 mana), Le Bien Et Le Mal (transfert de PV à portée quasi illimitée), Soins d'Urgence (défausse → soin), Infusion de Mana (génère une source de mana passive permanente).
- **Cartes génératives** : Infusion de Mana et Frappe de Lumière (AoE ennemis qui débloque un soin de groupe gratuit).
- **Auto-sabotage assumé** : Frappe Solaire neutralise CON et SAG 3 tours après le nuke.

**Boucle de jeu** : maudire tôt → laisser tourner les DoT en soignant/réagissant → détoner ; alimenter le tout par conversion de ressources.

**Faiblesse**:

**Questionnement et TODO :**
- Soins: De plus gros soins avec le zèle
- Mana : De plus gros bouclier avec du mana ou plus de malédiction (ou dégâts?)
- Malédiction: Stack plein de malediction qui n'ont plus de durée, et les releases plus il ya de stack plus ça fait mal
- Des cartes qui ont beaucoup de charges couplé avec des cartes a petit coût (Refonte malédiction?)
- Suppression des bouclier temporaire -> Gardien, plutôt des soins?
- Rituel lumineux : Chercher dans votre deck une carte de soins ou de bouclier et mettez la dans votre main (5 points
d’actions ou 1 point de zèle, 1 fois par tour)
- Rituel sombre : Chercher dans votre cimetière une carte de soins ou de bouclier et mettez la dans votre main (5 points
d’actions ou 1 point de zèle, 1 fois par tour)
- Aura ou Buff qui affecte tous les alliées ou tous les ennemis (utile avec la portée)?

---

# Trapper

> « Classe à distance spécialisée dans les attaques critiques, accompagnée de son familier, ou qui peut poser des pièges redoutables. »

**Identité dnd5e** : d8, DEX + SAG. CHA est le levier du build « maître des bêtes » (stats des minions), INT reste marginal.

**Stats FQ** : **critique le mieux doté du jeu** (6 paliers primaires), mana et action larges, **aucune esquive montable** : la classe doit rester loin.

**Rôle** : archer/DPS très longue portée, sous-thèmes invocateur (Louve niv. 1, Ours niv. 7) et contrôleur de terrain (pièges, entraves).

**Mécaniques signature** :
- **Le critique comme ressource** : buffs (Tireur d'Élite, Ajustage de Tir passif), conversion (Retrouver des Forces vend du critique contre du mana), et surtout les **pièges dont les dégâts scalent sur le score de critique** (`2d(critique)`) tout en étant incritiquables.
- **Portée extrême** : `maxReach` formulés (`10+@dex`, `7+@dex`), Tir Supersonique à portée illimitée ; **coût en action = distance** (`xvalue: reach`) sur Tir Précis et Supersonique.
- **Pièges réactifs** : Piège à Pointes / Empoisonné — 0 action, 1 mana, déclenchés par `targetsWithinReach` quand un ennemi approche.
- **Auto-handicap comme ressource** : Embuscade (vide tous les PA → +@wis dégâts cumulable), Tir Enraciné (convertit le déplacement en dégâts + auto-immobilisation).
- **Bêtes** : Tamed Wolf et Enraged Bear, jouant après le tour du Trapper, scaling `@cha`.
- Zones distance (rectangle 3×3, ligne, cercle), entraves (Traquenard, repoussée du Tir Supersonique), DoT poison.

**Boucle de jeu** : préparer le tir (buffs de critique, embuscade), sécuriser la zone (pièges), déléguer le contact aux bêtes, décharger à longue portée.

**Faiblesse**:
- Pas d'esquive
- Pas d'attaque corps à corps

**Questionnement et TODO :**
- Bêtes : sorts qui permettent de générer des bêtes plus puissantes, transferez des caractéristiques X 2 ou 3 sur une bête?
---

# Moine

> « Adepte d'un jeu très dynamique : joue beaucoup de cartes différentes pour monter rapidement son zèle. Robuste, score d'esquive élevé. »

**Identité dnd5e** : d8, FOR + DEX. CON alimente les soins et coûts, SAG/CHA les plafonds de X.

**Stats FQ** : **esquive la mieux dotée du jeu**, zèle et déplacement bien fournis. **Jamais de critique** — il joue le volume, pas le burst.

**Rôle** : bruiser mobile à tempo, duelliste corps à corps, avec appoints tank (taunt Uppercut, Interruption) et soins (Vive-Esquive, Méditation Zen, Paume Curative).

**Mécaniques signature** :
- **Économie de zèle fermée** : générateurs spammables (Coup Droit ×6, Coup Gauche ×5, Uppercut ×6, +1 chacun) → consommateurs scalables (Combo, Combo 2 non borné, Souffle de Ki, Méditation Zen, Paume Curative).
    - Poing Rouge est la seule carte du jeu qui monte `zeal.max` (+5, permanent).
- **Flux de cartes** : Souffle de Ki (zèle → X cartes **et** 2X actions), Maître Du Chi (carte de base passive bidirectionnelle : défausse ↔ zèle ↔ pioche), Armes Secrètes (monétise la défausse en dégâts inesquivables).
- **Rejouable conditionnel scripté** (unique au Moine) : Coup Droit/Gauche rejouables 2× seulement si assez de PA déjà dépensés ce tour — récompense l'**ordonnancement** des cartes.
- **Défense réactive** : 4 réactives (Bouclier Zélé sur sort subi, Vive-Esquive sur dégâts, Armes Secrètes, Interruption qui divise par 2 les PA adverses) + Dissimulation (intouchable 1 tour au prix de dégâts nuls, puis fenêtre offensive).
- **Déplacement améliorable**: Dégâts et déplacement (déplacement éclair) (le seul avec le Gardien ? ENlever le gardien?)
Le seul a faire plus de dégâts avec toutes les cartes en main
Le seul a pouvoir augmenter son zèle max
**Boucle de jeu** : enchaîner les petites frappes → zèle → convertir en cartes/actions/burst ; l'ordre de jeu dans le tour est la compétence clé.

**Faiblesses** :
- Aucun Critique

**Questionnement et TODO :**
- Permettre de piochez plus de cartes, et faire plus de dégâts avec le nombre de carte dans la main, utilisez des xvalue préfini
- Combo avec plein de zèle, utilisez le zèle, chargez vite le zèle
- Deuxième tank : augmente l'esquive , combo d'esquive ou de réactif, ne peut plus gagner de zèle si en mode esquive?

---

# Sorcière

> « Un mage puissant. Sa force réside dans le nombre de squelettes qu'elle ranime pour détruire ses adversaires. »

**Identité dnd5e** : d6, INT + CHA. SAG est massivement utilisé par les cartes Afflux (écart fiche/deck à surveiller).

**Stats FQ** : mana + action + esquive. **Jamais de critique**. Coûts d'action réduits par les caracs (`−8+@cha`, `−7+@wis`) : les caracs rendent le kit moins cher.

**Rôle** : invocatrice / commandante d'armée à montée en puissance exponentielle — faible au premier tour, écrasante en fin de combat.

**Mécaniques signature** :
- **Armée** : quasiment chaque carte offensive invoque un squelette en plus de son effet (Trait D'Ombre-Verte ×9 en deck). Paliers : Skeleton lvl 1‑2 → Giant Skeleton → Skeleton Sorcerer (capstone niv. 7, mini-nécromancien autonome).
- **Score de sacrifice** (`fq.special.sacrificedSkeleton`) : détruire ses squelettes alimente un compteur-ressource consommé par Ostéologie (invoque un squelette de niveau = sacrifices, cap 3), Afflux De Vie/Mana, Déplacement Morbide.
- **Comptage de l'armée** (`SCRIPT:` sur les tokens « Skeleton ») : Afflux D'Agilité (esquive), Afflux De Pouvoir (actions), Rituel Du Sang (zèle) — plus l'armée est grande, plus la sorcière est forte.
- **`targetType: Skeletons`** : buffs de masse dédiés (Bouclier D'Os, Canalisation Des Ombres — invulnérabilité 1 round —, Forme d'Ombre, Déplacement Morbide).
- Défausse en coût d'appoint (Sortilège d'Ombre, Rituel Du Sang) — la ressource centrale est le **sacrifice**, pas la défausse.

**Boucle de jeu** : invoquer en attaquant → sacrifier → recycler en mana/PV/actions/zèle → réinvoquer plus gros. Aucune défense personnelle : l'armée est le rempart.

**Faiblesse**:
- Vite à cours de mana?
- Peu de point de vie

**Questionnement et TODO :**
- Squelette trop faible?
- Armée des morts: plus on a de squelette, plus on peut faire des choses
  - Roi Squelette : Construire un super squelette: Essayer de merger le plus de squelette pour en faire un puissant, permetre de garder
    le score de sacrifice après
  - Nécromancie: Aller chercher des cartes spécifiques dans la défausse, jouer des cartes depuis la défausse
---

# Illusionniste

> « Un combattant et soutien/healeur qui ne cesse d'augmenter sa portée au cours du combat. »

**Identité dnd5e** : d6, DEX + CHA. Classe la plus multi-carac du jeu : SAG (potions, mana), FOR/`@wpnM` (frappes), INT (orbe), CON (Peste Noire).

**Stats FQ** : action + mana + main. La **portée n'est achetable nulle part** — c'est précisément sa mécanique : elle se construit en combat.

**Rôle** : Contrôleur de portée / Soutien hybride (presque un barde-apothicaire)/ Healeur, Possède des sorts matchant avec toutes les autres classes?

**Mécaniques signature** :
- **Cartes de manipulation d'espace**: peut bouger des cibles autre que lui
- **Cartes de manipulation temporaire**: Soins des derniers dégâts subit, soins HOT?
- **La portée comme ressource cumulative** (`fq.bonus.range`) : gains fiables (Allonge magique, Fouet Enchanté, Salto Arrière), aléatoires (Rapière Enchantée 1d2), massifs temporaires (Potion d'allonge +@wis). Puis **8 cartes la dépensent ou la scalent** : dégâts (Frappe Illusoire, Volée de shuriken, Prise En Traître), nombre de cibles (Attaque Latérale `2*(1+X)`, Diagonale `4*(1+X/2)`), DoT (Nuage de dague), portée min (Attaque En Cercle), conversion (Illusion De Caractéristiques : portée → critique/soins/mana).
- **Trois `xvalue` distincts** : bonus de portée, distance réelle à la cible (Orbe Grandissante `XXXd6`, Passage éthéré), nombre de cibles (Succion De Mana).
- **Ciblage géométrique** : `targetsAlignedWithSelf`, `targetsDiagonalWithSelf`, cône, couronne adjacente — les AoE exigent du placement.
- **Soutien d'équipe réel** : Inspiration Chantée (+crit global, rejouable @cha fois), Danse Enfiévrée (+esquive), Inspiration Effrénée, Apothicaire I/II (10 potions), Immatérialité (invulnérabilité 1 tour).
- **Manipulation d'effets** : Peste Noire (duplique tous les effets FQ de la cible, buffs et debuffs), Images Miroir (esquive +@dex jusqu'au premier coup, `expireOnDamage`).
- Conversions : Vases communicants (mana ↔ 4 actions), zèle généré par 8 cartes et dépensé par les grosses.

**Boucle de jeu** : empiler la portée avec des cartes bon marché qui rendent du zèle → encaisser les payoffs multicibles → soutenir l'équipe en continu.

**Problème de caractérisation**
- Soutien un peu trop similaire au maitre d'arme
- Attaque latérale et en cercle à déplacer vers le maître d'arme
- Bien différencier les soins des autres soigneurs: Moine ( corps à corps) et Mage Blanc (soins directs et bouclier)

**Faiblesse**:
- Moins de dégâts?

**Questionnement et TODO :**
- Maitre du temps : Change les dés, permet de revenir à son point d'origine ou dans le temps
- Si vous faites un critique, vous pouvez augmenter votre bonus de portée de 1. ?
- Si vous faites une esquive, vous pouvez augmenter votre bonus de portée de 1. ?
- Sort d’assistances : (2 de portée) (Coût : 1 point de zèle ou 1 carte défaussée)
  o Peut agripper quelqu’un pour le ramener sur une case adjacente, lui rend 1d4 points de vie.
  o Peut pousser quelqu’un de X cases dans un sens (X étant le bonus de portée), lui rend 1d4 points de vie.
  o Peut se téléporter vers une case adjacente d’un allié (2 de portée), lui rend 1d4 point de vie.
---

# Maître d'Armes

> « Expert de tout l'arsenal : ses cartes frappent avec l'arme du moment, au corps à corps comme à distance. »

**Identité dnd5e** : d10, FOR + DEX (3eme: CHA). DEX domine (tirs, finishers), FOR sur les gros coups de mêlée (`2*@str`).

**Stats FQ** : zèle+ action + critique + main. 

**Rôle** : DPS martial polyvalent sur deux rails parallèles — mêlée (`@wpnM`) et distance (`@wpnR`) — chacun avec sa version rapide (−3), standard (−6, +1 zèle), lourde (−11/−12, +1 zèle) et son finisher niv. 7 (−13, −2 zèle : Ouragan de lames mono / Pluie d'acier en zone).

**Mécaniques signature** :
- **Buffs d'arme fenêtrés** : Huile d'affûtage (mêlée), Prise équilibrée (distance), Maîtrise des armes (les deux, 3 rounds) — tour de setup puis burst.
- **Carte qui s'améliore en carte coutant de plus en plus cher jusqu'a faire de gros dégâts**
- **Carte qui duplique une autre carte en main (Le seul a pouvoir faire ça)**
- **Tous les buffs/malus dure 1 tour**
- **Moteur couteaux de lancer** : Ceinture de couteaux (−2 action) fabrique une carte *Couteau de lancer* **gratuite** (jusqu'à ×24), boostée en permanence et cumulativement par Affûtage des couteaux (`@bonus.knife`).
- **Soutien (Charisme)** : Buff des dégâts des armes des autres (+ fort pour les faibles jets) + Réduit l'esquive a 0? **
- Le seul a avoir des sort faisant des dégâts d'armes touchants plusieurs cibles (A vérifier illusionniste, guerrier runique et gardien?)
**Boucle de jeu** : Réunir les bonnes cartes pour faire de gros dégâts corps à corps OU distance OU build les couteaux de lancer OU ...

**Faiblesses** :
- Pas de heal personnel
- Pas d'amélioration personnel d'esquive par les cartes

**Questionnement et TODO :**
- Combos: si réussi certaines actions -> redonnes tous les points d'actions pour jouer d'autre carte ou réduit le coup
  de carte à 0
---

# Guerrier Runique

> « DeckBuilder: entre en combat avec très peu de cartes ; ses runes en génèrent de nouvelles au fil de l'affrontement, rendant son deck de plus en plus puissant. »

**Identité dnd5e** : d10, FOR + INT (3eme: CON) — Frontliner qui frappe au corps à corps (`@wpnM`).

**Stats FQ Prioritaire** : pioche, main, mana, génère et utilise beaucoup de zèle et d'action.

**Rôle** : moteur / late-game carry. Départ délibérément faible (deck de base max 6 cartes), 
montée en puissance par deck-building en cours de combat.

**Mécaniques signature** :
- **Seul les frappes runiques pour généré des runes consomme de la mana**
- **Gravure = deck-building en combat** : les cartes de gravure proposent N runes d'une couleur au choix
- **Identité des trois couleurs** : 
  - **Rouge** = dégâts ET critique ; abilité améliorants : Force
    - Ulti : Immortel avec 1 pv, dégâts augmentés par les runes rouges. coutant 8 de zèle
  - **Jaune** = actions ET déplacement ; abilité améliorants : Intelligence
    - Ulti : coutant 35 d'action, réduit par le nombre de rune jaune joué.
  - **Bleu** = tank: soins personnels et esquive + regain de mana ; abilité améliorants : Constitution
    - Ulti : Regagne x points de vie par tour, x étant le nombre de runes bleues joué. coutant 6 de mana

**Faiblesses** :
- Pas de sort de dégâts à distance
- Pas de sort multi-cible (très peu d'exception)
- Pas de réactif
- Aucune pioche hormis des pioche en défaussant sur 3 runes jaunes

**Questionnement et TODO :**
---