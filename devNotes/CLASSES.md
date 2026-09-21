# Caractérisation des classes

Document de référence design : ce qui définit chaque classe (identité dnd5e, stats FQ, rôle, mécaniques signature, spécialisations, contraintes), établi à partir des données réelles (`packs/_source/classes-fq8`, `decks-pattern-fq8`, `classes-stats-fq8`, `starter-heroes`, `lang/fr.json`) et du code (`src/domain`, `src/hook`).
Chiffres mis à jour le 2026-09-21 : rééquilibrage des stats de départ et des pools de stats (étape 2), puis répartition des 323 cartes des huit classes sur les niveaux N1 à N12 et lot de 4 cartes (étape 1). `npm test` est vert.

---

> ⚠️ **Document de travail temporaire.** Une fois toutes les étapes du TODO réalisées, on retire tout ce qui relève des questionnements et des TODO : ce fichier devient une **aide pour les joueurs** qui décrit chaque classe avec ses points forts et ses points faibles (voir « Fin de chantier » en bas du TODO).

## TODO — Passe de rééquilibrage (30 à 40 cartes par classe, hors Guerrier Runique)

### Outils de la passe (temporaires)
Deux outils ont été ajoutés pour cette passe. **Ils seront supprimés à la fin du rééquilibrage** (voir « Fin de chantier »).

| Outil | Commande | Rôle |
|---|---|---|
| Rapport des classes (`utils/class-report.mjs`) | `npm run report:classes` | Affiche en markdown les tableaux de ce fichier : stats moyennes, vue d'ensemble des cartes, exemplaires, caracs utilisées, rendement des cartes (dégâts/soins par PA). |
| | `npm run report:classes -- --out devNotes/rapport-classes.md` | Écrit le même rapport dans un fichier, pour copier les tableaux dans CLASSES.md. |
| | `npm run report:classes -- --check` | Contrôle les cibles de la passe : 30‑40 cartes distinctes N1‑N12, aucune carte hors N1‑N12, et exemplaires par niveau une fois la cible fixée (`TARGETS` en tête du script). Code de sortie 1 s'il reste des écarts. |
| Test d'intégrité (`tests/decks/class-deck-integrity.test.js`) | `npx vitest run tests/decks` | Tests des decks : intégrité (niveau, exemplaires, classe, image avec la bonne casse, portée, pools de stats), clés de traduction (`deck-references`), clés de paquet (`pack-keys`)… Les anomalies déjà connues sont listées dans `KNOWN_ISSUES` : **retirer chaque entrée corrigée**, le test l'exige. |
| Suite complète | `npm test` | Toute la suite (~2 min), à lancer en fin d'étape. |

### Ordre conseillé : une classe pilote d'abord
- [ ] Faire les étapes 1 à 6 en entier sur **la Sorcière** avant les autres classes : c'est la plus contrainte (aucune carte à moins de 5 PA, 8,5 PA au N1, déplacement figé à 6 cases), donc celle qui éprouve le mieux la grille de coûts, la cible d'exemplaires et le pool de stats réduit.
- [ ] Ajuster les règles (grille, cibles) d'après la pilote, puis dérouler les étapes pour les 7 autres classes.

### Étape 1 — Première passe des cartes : niveaux, cartes manquantes, 30 à 40 cartes par classe
- [x] ▶️ `npm run report:classes -- --check` : plus aucune carte hors N1‑N12. Restent 3 écarts, tous sur le nombre de cartes (Gardien 41, Mage Blanc 41, Élémentaliste 43 pour une cible de 30‑40) : c'est l'élagage ci‑dessous.
- [ ] Remplir à la main, pour chaque classe, les blocs **Spécificités / Spécialisations / Contraintes** (section « À définir à la main »), en s'appuyant sur les tableaux « Spécialisations proposées ».
- [ ] Viser **30 à 40 cartes distinctes jouables entre N1 et N12** par classe. Réalisé : 3 cartes au N1 (4 pour l'Élémentaliste), puis 3 à 4 par niveau, une par spécialisation ouverte quand le compte le permet.
- [ ] Écrire les nouvelles cartes avec la **grille de coûts provisoire** (section « Règles d'équilibrage (provisoires) »), pour ne pas tout réécrire à l'étape 4.
- [x] **Mettre les cartes aux bons niveaux** — les **319 cartes** des huit classes ont reçu un niveau N1‑N12 le 2026‑09‑21, et plus aucune n'est hors de cette plage (`npm run report:classes -- --check`). Les paliers d'ouverture des spécialisations sont dans « Spécialisations par niveau » ci‑dessous ; le détail par niveau se lit dans « Vue d'ensemble des cartes » et dans les decks eux‑mêmes (`system.fq.level`).
  - [x] *Lecture Du Souffle* (Moine, N8), qui pioche dans le deck par niveau, a été recalée sur la plage jouable : elle propose maintenant des cartes N1‑N7 (elle pointait encore vers les anciens niveaux de garage).
  - [ ] **Plancher du deck à revoir** : les exemplaires des cartes N1 (`maxSameCard` cumulé) valent 7 (Illusionniste) à 19 (Élémentaliste), contre 5 pour le Guerrier Runique. Cible ~7‑8 partout, à trancher avec les `maxSameCard` de l'étape 4 : Élémentaliste 19, Sorcière 14, Moine et Mage Blanc 13, Gardien 12.
- [ ] **Supprimer ou fusionner les cartes redondantes** (listes « Redondances à trancher » de chaque classe) : l'Élémentaliste (43 cartes), le Gardien et le Mage Blanc (41) dépassent la cible de 40.
- [ ] **Écrire les cartes manquantes** :
  - [ ] Cartes **peu chères** (1 à 4 PA) pour le Mage Blanc et l'Élémentaliste (7 chacun), le Trapper et la Sorcière (5 chacun) — contre 18 pour le Maître d'Armes et 15 pour le Moine.
  - [ ] Une **frappe à 2 PA pour le Moine** : ses trois cartes N1 sont à 3 PA, soit 9 PA pour 10,2 disponibles, alors que la classe vit du nombre de cartes jouées par tour.
  - [ ] Sorts de rang 2 (versions plus fortes, ex. *Trait de feu II*) pour les niveaux supérieurs ou les trous.
  - [ ] Combos : si certaines actions réussissent, rendre tous les PA ou ramener le coût d'une carte à 0.
- [ ] Revoir les `maxSameCard` excessifs : Coup Droit ×6, Uppercut ×6, Frappe Héroïque ×6, Énergie Lumineuse ×6. *(~~Trait d'Ombre-Verte ×9~~ → ramené à ×3 le 2026‑09‑21, doublé par une version mineure ×5.)*
- [ ] Nouvelles cartes : clés de localisation FR/EN, illustrations, sons et visuels. **En attente** : *Lien du Fauve*, *Rémission Illusoire*, *Écho de Convalescence*, *Estoc Perçant*, *Refrain Vivifiant*, *Crescendo* et *Trait d'Ombre-Verte Mineur* sont encore sur `in_progress.png`.
- [x] ▶️ `npx vitest run tests/decks` après la répartition : **vert**, et `npm test` aussi (3865 tests). Les deux clés de traduction sans carte (*ScytheStrike*, *MassedVolley*) ont été supprimées de `lang/fr.json` et `lang/en.json`, avec `CardWarningMsgTargetsInSquare` qui n'était écrite que pour elles.
- [ ] ▶️ **Fin de l'étape** : `npm run report:classes -- --check` ne doit plus signaler d'écart sur le nombre de cartes (les niveaux sont faits), puis `npm test`.
- [ ] 📝 **Mettre à jour CLASSES.md**, dans chaque classe :
  - [ ] « À définir à la main » : spécificités, spécialisations et contraintes arrêtées.
  - [ ] « Spécialisations proposées » : cartes ajoutées, supprimées, fusionnées ; vider la colonne « Manques » traitée.
  - [ ] « Redondances à trancher » : retirer les points tranchés.
  - [x] « Constat des cartes » : nombres de cartes, coût moyen et cartes à 1‑4 PA à jour pour les neuf classes (chiffres : `npm run report:classes`).
  - [ ] « Mécaniques signature » : noms de cartes à revoir après l'élagage.
  - [ ] Cocher dans l'étape 5 les incohérences corrigées au passage (ex. *Tir Précis II*).

### Étape 2 — Retirer des choix de stats pour chaque classe ✅
- [x] **Pool des points d'action porté de 24 à 30 objets**, pour qu'il couvre les 30 choix cumulés d'un personnage de niveau 12 : les six nouveaux vont aux N10 à N12, et la courbe des prérequis suit désormais exactement le cumul des choix.
- [x] **Choix de stats inversés** : 3 aux niveaux impairs, 2 aux pairs (au lieu de 2/3).
- [x] **Pioche ramenée de 4 à 3 objets** (niveaux 3, 5 et 8) et retirée de la base des starter heroes (1 → 0).
- [x] **Budget des Start stats uniformisé à 10 points** pour les 9 classes (il allait de 3 pour la Sorcière à 14 pour le Moine). Tableau dans « Stats de départ ».
- [x] **Pool différencié par classe** : 70 objets hors pioche pour chacune, plus 1 à 3 objets de pioche — 30 objets retirés par classe selon son identité. Tableau dans « Pool de stats par classe ».
- [x] Points de vigilance du tableau des moyennes traités : le mana de la Sorcière passe de 2,5 à 5,8 au N1 ; le Gardien assume au contraire le mana le plus bas (2,2) avec son alternative en PV.
- [ ] Reste ouvert : **la main du Trapper** (0,1 au N1, 0,8 au N12) — il ne commence pratiquement jamais un combat avec une carte, à confirmer comme identité ou à corriger.
- [ ] Reste ouvert : **dés de vie**, Élémentaliste (d4) à 52 PV au N12 contre 164 pour le Gardien.
- [ ] Reste ouvert : nettoyer l'`ItemChoice` vide de la Sorcière (`classes-fq8/witch.json`), puis retirer la ligne `pool vide :: witch.json` de `KNOWN_ISSUES`.
- [ ] Reste ouvert : le **pool de mana est resté à 24 objets** alors que celui des PA est à 30. Un personnage ne peut donc pas mettre ses 3 choix du N1 en mana, et le pool de mana s'épuise au N10 — à étendre à 30 comme les PA, ou à assumer.
- [x] ▶️ `npx vitest run tests/decks/class-deck-integrity.test.js` : vert (pools non vides, objets de stats existants, un seul objet de Start stats par classe).
- [ ] ▶️ **Fin de l'étape** : `npm test`, puis `npm run build` pour recompiler les compendiums et vérifier en jeu une montée de niveau.
- [x] 📝 **CLASSES.md à jour** : « Distribution », « Stats de départ », « Pool de stats par classe », tableau des stats moyennes, « Stats de départ notables », paragraphes « Stats FQ » des 9 classes, et colonne « Start stats » retirée de la « Vue d'ensemble » (redondante avec le nouveau tableau).

### Étape 3 — Refaire le calcul des stats moyennes
- [x] ▶️ `npm run report:classes -- --out devNotes/rapport-classes.md` : le rapport tient compte des nouveaux pools (étape 2) et des niveaux de cartes (étape 1). **À relancer après l'élagage et l'équilibrage.**
- [x] Vérifier les hypothèses du rapport (base du starter hero, répartition des ASI, CA) : le rapport lit les starter heroes et les pools sur les données, il a suivi les changements de l'étape 2 sans modification.
- [ ] 📝 **Mettre à jour CLASSES.md** en copiant les tableaux du rapport :
  - [x] « Stats moyennes par classe » : tableau complet, hypothèses de calcul et date en tête de fichier.
  - [ ] « Vue d'ensemble des cartes » et « Caracs utilisées par les cartes ».
  - [ ] Étape 4 : tableau des exemplaires par deck (section « Exemplaires débloqués » du rapport).
  - [ ] « Règles d'équilibrage (provisoires) » : chiffres de rendement (section « Rendement des cartes » du rapport).
  - [ ] Revoir les chiffres cités dans les étapes 4 à 6 (ratio de zèle, coûts, nombres de jets par carac).

### Étape 4 — Rééquilibrer les cartes (avec Claude)
- [ ] Transformer la grille provisoire en **grille de coûts** définitive : dégâts ou soins attendus pour X PA / 1 mana / 1 zèle, par tranche de niveau (N1, N6, N12), à partir du rapport recalculé.
- [ ] Définir le ratio **générateurs / consommateurs de zèle** attendu par classe (l'Élémentaliste a aujourd'hui 9 générateurs pour 28 consommateurs).
- [ ] Équilibrage manuel de chaque classe, puis relecture IA : dégâts, coûts (si trop de sorts coûteux, ajouter des sorts peu chers), nombre de cartes, synergies.
- [ ] **Équilibrer le nombre d'exemplaires par deck** (somme des `maxSameCard`, et pas seulement le nombre de cartes distinctes) : fixer une cible d'exemplaires par tranche de niveau, commune à toutes les classes, puis ajuster les `maxSameCard`. Point de départ actuel (exemplaires débloqués N1 / N6 / N12, cartes générées exclues) :

  | Moine | Gardien | Mage Blanc | Élémentaliste | Trapper | Sorcière | Illusionniste | Maître d'Armes |
  |---|---|---|---|---|---|---|---|
  | 17 / 45 / 48 | 12 / 42 / 44 | 16 / 44 / 44 | 19 / 45 / 46 | 13 / 40 / 42 | 12 / 43 / 44 | 14 / 41 / 46 | 14 / 64 / **76** |

  - [ ] Reporter la cible choisie dans `TARGETS.copies` en tête de `utils/class-report.mjs` (ex. `{1: [12, 16], 6: [40, 45], 12: [48, 55]}`).
  - [ ] Tenir compte des cartes **générées en combat**, qui gonflent le deck réel (Maître d'Armes : couteaux ×24 et étapes de forge ; Sorcière : Nécromancie ; Mage Blanc : Infusion de Mana, Frappe de Lumière ; Élémentaliste : Incantation, Propagation des dégâts).
  - [ ] Tenir compte de la pioche : plus le deck est gros, moins une carte donnée sort souvent (pioche ≈ 1,1 au N1 et 2,3 au N12).
- [ ] Repérer les cartes trop chères pour leur niveau (ex. Poing Rouge 14 PA, Essor Vital 16 PA, Sorcier Squelette 15 PA, Orbe Grandissante 14 PA).
- [ ] ▶️ **Pendant l'équilibrage** : `npm run report:classes` (section « Rendement des cartes ») pour comparer chaque classe à la grille, et `npx vitest run tests/decks` après chaque lot de modifications.
- [ ] ▶️ **Fin de l'étape** : `npm run report:classes -- --check` ne doit plus signaler aucun écart (exemplaires compris), puis `npm test`.
- [ ] 📝 **Mettre à jour CLASSES.md** :
  - [ ] Passer « Règles d'équilibrage (provisoires) » en version définitive : grille de coûts, ratio de zèle cible et cible d'exemplaires par tranche de niveau.
  - [ ] « Vue d'ensemble des cartes » (exemplaires, coûts, zèle) et « Constat des cartes » de chaque classe (chiffres : `npm run report:classes`).
  - [ ] « Incohérences relevées » de chaque classe : retirer les cartes trop chères corrigées.

### Étape 5 — Chercher les erreurs
- [ ] Incohérences déjà relevées :
  - [ ] Moine : *Uppercut* annonce « piochez une carte » mais n'a pas de `draw`.
  - [ ] Gardien : *Frappe provocatrice*, le choix « -4 PV » coûte **aussi** 1 mana.
  - [ ] Mage Blanc : *Maudire* a `mana: 1` (gain au lieu d'un coût ?).
  - [ ] Mage Blanc : *Exorcisme* annonce « coûte @cha PA en moins » mais le coût est fixe (-7).
  - [ ] Trapper : *Pluie de flèches* annonce « incritiquable » sans `bonusCrit` (à vérifier).
  - [ ] **Casse des images** : 30 cartes et le dos du deck Moine généré pointent vers un fichier dont la casse diffère (`.png` / `.PNG`, dossier `Illusionist` au lieu de `illusionist`). Invisible sous Windows, image cassée sur un serveur Linux. Liste complète dans `KNOWN_ISSUES` du test d'intégrité.
  - [x] ~~Contenu de test du `draft.json` (9 cartes sans `maxSameCard`) : à sortir des patterns livrés.~~ → fait, le fichier est retiré du pack. Le garde-fou de `tests/decks/sweep.test.js` est passé de 21 à 20 decks.
- [ ] Comparer chaque description à ses données (coûts, dégâts, effets), puis relecture IA des descriptions.
- [ ] Vérifier chaque fonctionnalité du moteur utilisée par chaque classe (tests / UAT).
- [ ] ▶️ **Après chaque correction** : `npx vitest run tests/decks`, et retirer de `KNOWN_ISSUES` les lignes corrigées.
- [ ] ▶️ **Fin de l'étape** : `KNOWN_ISSUES` doit être **vide**, puis `npm test`.
- [ ] 📝 **Mettre à jour CLASSES.md** :
  - [ ] « Incohérences relevées » de chaque classe : retirer les erreurs corrigées, ajouter les nouvelles trouvées.
  - [ ] « Mécaniques signature » si une correction change le comportement d'une carte.

### Étape 6 — Vérifier la correspondance avec la caractérisation des classes
- [ ] ▶️ Avant de commencer : `npm run report:classes` (section « Caracs utilisées par les cartes ») pour la liste à jour des caracs citées et des jets par carac.
- [ ] Contrôler que chaque carte sert une spécificité ou une spécialisation de sa classe et respecte ses contraintes.
- [ ] Caractéristiques dnd5e (tableau « Caracs utilisées par les cartes ») :
  - [ ] Illusionniste : 17 jets de toucher/sauvegarde sur **INT**, qui n'est ni primaire ni montée (INT 10).
  - [ ] Sorcière : les formules utilisent SAG 9 fois contre INT 3 fois, alors que INT est primaire.
  - [ ] Trapper : la spé bêtes scale sur **CHA** (7 formules) alors que le Trapper démarre à CHA 6 (-2).
  - [ ] Mage Blanc : *Aura de Force* et *Exorcisme* scalent sur CHA, alors que le Mage Blanc a CHA 6 (-2).
- [ ] Faire un inventaire des types de dégâts par classe.
- [ ] ▶️ **Fin de l'étape** : `npx vitest run tests/decks`, puis `npm test`.
- [ ] 📝 **Mettre à jour CLASSES.md** :
  - [ ] « Caracs utilisées par les cartes » (copie du rapport) et « Rôle des caractéristiques dnd5e ».
  - [ ] Dans chaque classe : « Identité dnd5e », « Rôle », « Problème de caractérisation » et « Questionnement et TODO ».
  - [ ] Ajouter l'inventaire des types de dégâts (nouveau tableau dans « Rappel système »).

### Ensuite — Finitions
- [ ] Régénérer `decks-fq8-generated` et mettre à jour les `starter-heroes`.
- [ ] ▶️ `npm run report:classes -- --check` (aucun écart), `npm test` (suite verte), puis `npm run build`.
- [ ] 📝 **Mettre à jour CLASSES.md** : dernier `npm run report:classes -- --out devNotes/rapport-classes.md` pour les tableaux, relecture complète, date en tête de fichier, puis écrire un nouvel état des lieux dans `historique/` (y archiver ce TODO une fois terminé).

### Fin de chantier — Transformer ce fichier en aide de jeu pour les joueurs
Une fois **toutes les étapes ci-dessus réalisées**, ce document cesse d'être une note de conception et devient une **aide pour les joueurs** qui décrit chaque classe.
- [ ] Archiver dans `historique/` la version de travail complète (avant nettoyage) et le dernier `rapport-classes.md`.
- [ ] **Supprimer les outils temporaires de la passe** :
  - [ ] `utils/class-report.mjs` et le script `report:classes` de `package.json` ;
  - [ ] `tests/decks/class-deck-integrity.test.js` ;
  - [ ] `devNotes/rapport-classes.md` ;
  - [ ] ▶️ puis `npm test` pour vérifier que la suite reste verte.
- [ ] Supprimer tout ce qui relève du travail en cours :
  - [ ] ce TODO (outils et commandes compris) ;
  - [ ] les blocs « Questionnement et TODO », « À définir à la main », « Redondances à trancher », « Incohérences relevées », « Problème de caractérisation » et les mentions « À revoir » ;
  - [ ] les tableaux et sections techniques (chemins de fichiers, clés de données, hypothèses de calcul, « Constat des cartes », « Vue d'ensemble des cartes », « Caracs utilisées par les cartes », « Règles d'équilibrage »).
- [ ] Réécrire chaque classe pour un joueur : présentation, rôle, spécialisations, **points forts**, **points faibles**, caractéristiques à privilégier, style de jeu et cartes emblématiques.
- [ ] Garder un rappel des règles utile aux joueurs (stats FQ, rôle des caractéristiques) et, si utile, un tableau comparatif simple des classes.

---

## Stats moyennes par classe (niveaux 1 / 6 / 12)

Chaque case donne **N1 / N6 / N12**. Scores de caractéristique suivis du modificateur entre parenthèses.

| Stat | Moine | Gardien | Mage Blanc | Élémentaliste | Trapper | Sorcière | Illusionniste | Maître d'Armes | Guerrier Runique |
|---|---|---|---|---|---|---|---|---|---|
| **FQ** | | | | | | | | | |
| Budget Start stats | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Choix de stats cumulés | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 | 3 / 15 / 30 |
| Points d'action | 10,2 / 15,2 / 21,3 | 10,3 / 15,3 / 21,7 | 11,2 / 16,3 / 22,5 | 10,2 / 15,3 / 21,5 | 12,2 / 17,3 / 23,5 | 10,2 / 15,3 / 21,5 | 8,3 / 13,3 / 19,5 | 11,2 / 16,3 / 22,5 | 9,2 / 14,2 / 20,3 |
| Mana | 4,4 / 6,1 / 8,1 | 2,2 / 3,1 / 4,1 | 6,8 / 10,2 / 14,3 | 7,0 / 11,0 / 16,0 | 3,7 / 6,3 / 9,7 | 5,8 / 8,7 / 12,5 | 3,7 / 6,7 / 10,5 | 3,7 / 6,3 / 9,7 | 4,5 / 6,5 / 8,9 |
| Zèle initial | 0,3 / 1,6 / 3,3 | 0,3 / 1,7 / 3,4 | 0,2 / 0,8 / 1,7 | 0,1 / 0,6 / 1,3 | 0,2 / 0,8 / 1,7 | 0,2 / 1,3 / 2,5 | 0,1 / 0,6 / 1,3 | 0,2 / 0,8 / 1,7 | 0,2 / 1,2 / 2,5 |
| Critique | 0 / 0 / 0 | 1,3 / 2,7 / 4,4 | 0,2 / 1,0 / 2,1 | 1,1 / 1,6 / 2,3 | 2,4 / 4,1 / 6,2 | 0,2 / 1,3 / 2,5 | 2,1 / 2,6 / 3,2 | 1,3 / 2,7 / 4,3 | 1,2 / 1,8 / 2,6 |
| Esquive | 2,4 / 4,1 / 6,1 | 1,3 / 2,7 / 4,4 | 1,2 / 2,0 / 3,1 | 0,1 / 0,6 / 1,3 | 0 / 0 / 0 | 1,2 / 1,8 / 2,7 | 2,2 / 3,3 / 4,5 | 1,2 / 1,8 / 2,7 | 1,3 / 2,4 / 3,9 |
| Main (début de combat) | 2,2 / 2,8 / 3,6 | 5,3 / 6,5 / 8,0 | 1,2 / 1,8 / 2,7 | 1,1 / 1,6 / 2,3 | 0,1 / 0,4 / 0,8 | 2,2 / 3,3 / 4,5 | 2,2 / 2,8 / 3,7 | 1,2 / 1,8 / 2,7 | 2,2 / 3,2 / 4,5 |
| Pioche (par tour) | 1,1 / 1,6 / 2,2 | 0,0 / 0,2 / 0,4 | 1,1 / 1,4 / 1,8 | 1,1 / 1,4 / 1,8 | 1,1 / 1,4 / 1,8 | 1,1 / 1,4 / 1,8 | 1,1 / 1,4 / 1,8 | 1,1 / 1,4 / 1,8 | 2,1 / 2,6 / 3,2 |
| Déplacement (cases) | 6,3 / 7,6 / 9,3 | 6,2 / 6,8 / 7,7 | 5,1 / 5,4 / 5,8 | 6,2 / 6,8 / 7,7 | 7,3 / 8,7 / 10,3 | 6 / 6 / 6 | 7,3 / 8,2 / 9,5 | 7,2 / 7,8 / 8,7 | 6,2 / 7,0 / 8,1 |
| **dnd5e** | | | | | | | | | |
| Dé de vie | d8 | d12 | d6 | d4 | d8 | d6 | d6 | d10 | d10 |
| PV moyens | 23 / 48 / 78 | 29 / 80 / 164 | 24 / 65 / 125 | 18 / 28 / 52 | 23 / 48 / 90 | 19 / 29 / 53 | 20 / 35 / 53 | 24 / 49 / 79 | 27 / 67 / 115 |
| Caracs primaires | FOR + DEX | FOR + CON | CON + SAG | INT + SAG | DEX + SAG | INT + CHA | DEX + CHA | FOR + DEX | FOR + INT |
| FOR | 12(+1) / 15(+2) / 20(+5) | 16(+3) / 19(+4) / 20(+5) | 6(-2) / 6(-2) / 6(-2) | 6(-2) / 6(-2) / 6(-2) | 6(-2) / 6(-2) / 6(-2) | 10(+0) / 10(+0) / 10(+0) | 8(-1) / 8(-1) / 8(-1) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) |
| DEX | 16(+3) / 19(+4) / 20(+5) | 10(+0) / 10(+0) / 12(+1) | 6(-2) / 6(-2) / 10(+0) | 12(+1) / 12(+1) / 12(+1) | 16(+3) / 19(+4) / 20(+5) | 6(-2) / 6(-2) / 6(-2) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 8(-1) / 8(-1) / 8(-1) |
| CON | 10(+0) / 10(+0) / 10(+0) | 14(+2) / 17(+3) / 20(+5) | 16(+3) / 19(+4) / 20(+5) | 8(-1) / 8(-1) / 10(+0) | 10(+0) / 10(+0) / 12(+1) | 6(-2) / 6(-2) / 8(-1) | 8(-1) / 8(-1) / 8(-1) | 8(-1) / 8(-1) / 8(-1) | 14(+2) / 14(+2) / 14(+2) |
| INT | 10(+0) / 10(+0) / 10(+0) | 6(-2) / 6(-2) / 6(-2) | 14(+2) / 14(+2) / 14(+2) | 16(+3) / 19(+4) / 20(+5) | 12(+1) / 12(+1) / 12(+1) | 14(+2) / 17(+3) / 20(+5) | 10(+0) / 10(+0) / 10(+0) | 8(-1) / 8(-1) / 8(-1) | 12(+1) / 15(+2) / 18(+4) |
| SAG | 8(-1) / 8(-1) / 8(-1) | 6(-2) / 6(-2) / 6(-2) | 16(+3) / 19(+4) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 12(+1) / 12(+1) / 12(+1) | 10(+0) / 10(+0) / 10(+0) | 8(-1) / 8(-1) / 8(-1) | 10(+0) / 10(+0) / 10(+0) |
| CHA | 8(-1) / 8(-1) / 8(-1) | 12(+1) / 12(+1) / 12(+1) | 6(-2) / 6(-2) / 6(-2) | 8(-1) / 8(-1) / 8(-1) | 6(-2) / 6(-2) / 6(-2) | 16(+3) / 19(+4) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 12(+1) / 12(+1) / 12(+1) | 6(-2) / 6(-2) / 6(-2) |
| Maîtrise | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 |
| Bonus d'attaque (meilleure carac primaire) | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +4 / +6 / +9 | +4 / +6 / +9 | +4 / +6 / +9 |
| CA (équipement de départ) | 14 / 15 / 16 | 18 / 18 / 18 | 8 / 8 / 10 | 11 / 11 / 11 | 14 / 15 / 16 | 8 / 8 / 8 | 13 / 14 / 16 | 13 / 14 / 16 | 10 / 10 / 10 |
| Équipement de départ | Cuir, mains nues | Cotte de mailles, bouclier, masse | Robe, masse | Robe, bâton | Cuir, arc court | Robe, bâton | Cuir, dague | Cuir, lance, arc court | Cuir, hachette |
| **Cartes** | | | | | | | | | |
| Cartes débloquées (distinctes/exemplaires) | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 0/0 / 0/0 / 0/0 | 4/5 / 9/10 / 15/16 |

**Hypothèses de calcul** (script sur les données, pas de mesure en partie) :
- **Base commune** (starter heroes) : PA 7, mana 2, zèle 0, critique 0, esquive 0, main 0, pioche 0, déplacement 5 cases, +15 PV fixes. S'y ajoutent les *Start stats* de la classe (voir « Stats de départ » ci-dessous).
- **Choix de stats** : 3 aux niveaux impairs, 2 aux niveaux pairs, dans le **pool propre à chaque classe** (70 objets hors pioche, plus 1 à 3 objets de pioche). La moyenne est l'espérance d'un tirage proportionnel au pool : elle diffère donc d'une classe à l'autre, puisque les pools diffèrent. Voir « Pool de stats par classe ».
- **ASI** : +2 points à chaque niveau pair, répartis alternativement sur les deux caracs primaires (plafond 20, surplus sur l'autre primaire puis CON).
- **PV** : dé max au N1, puis moyenne dnd5e (d/2 + 1), plus le modificateur de CON par niveau.
- **CA** : équipement de départ conservé, seule la DEX évolue.

---

## Rappel système

### Rôle des caractéristiques dnd5e

Chaque carac a un usage dominant bien tranché dans les formules de cartes. Dans les formules, `@str`, `@dex`, etc. désignent le **modificateur**.

| Carac | Usage principal | Usages secondaires |
|---|---|---|
| **@str** | **Dégâts de mêlée physiques** | Autre sort augmentant les dégâts, Critique |
| **@dex** | **Dégâts des attaques rapides et à distance** | **Portée**, Esquive, recul/déplacement, dés variables, bornes X de pioche/conversion |
| **@con** | **Points de vie** : réduction des coûts en PV, auto-soins | Régénération, résistance aux altérations d'état |
| **@int** | **Dégâts magiques directs** | Taille de zone, portée de sort, dégâts des invocations (Sorcier Squelette, Ours) |
| **@wis** | **Tout ce qui dure : DoT, effets appliqués et soins** | **Rejouabilité** (`replayable: @wis` des boucliers du Mage Blanc), durées d'effets |
| **@cha** | **Invocations**, **durée des effets** | Taunt |

#### Caracs utilisées par les cartes (decks de base, nombre de cartes qui citent la carac)

| Classe | Primaires | FOR | DEX | CON | INT | SAG | CHA | Arme (`@wpnM`/`@wpnR`) | Jets (toucher/sauvegarde) |
|---|---|---|---|---|---|---|---|---|---|
| Moine | FOR + DEX | 7 | 15 | 4 | – | 3 | 2 | – | DEX 6, FOR 4, CHA 1, SAG 1 |
| Gardien | FOR + CON | 15 | – | 19 | – | – | 3 | 7 | arme 9, FOR 3, CHA 2, CON 1 |
| Mage Blanc | CON + SAG | – | – | 5 | 8 | 15 | 1 | – | SAG 18, INT 4 |
| Élémentaliste | INT + SAG | – | 1 | – | 25 | 18 | 1 | – | INT 25, SAG 13, DEX 1 |
| Trapper | DEX + SAG | 1 | 16 | – | 3 | 6 | **7** | 10 | arme 10, SAG 6, DEX 4, CHA 2, INT 1 |
| Sorcière | INT + CHA | – | – | – | **3** | **9** | 11 | – | SAG 4, INT 1 |
| Illusionniste | DEX + CHA | 2 | 6 | 1 | 1 | 7 | 8 | 2 | **INT 17**, DEX 2, arme 2 |
| Maître d'Armes | FOR + DEX | 5 | 9 | – | – | – | 3 | 13 | arme 13, DEX 4, FOR 1 |
| Guerrier Runique | FOR + INT | 4 | – | 4 | 4 | – | – | 12 | arme 12 |

Écarts à traiter : INT pour l'Illusionniste, SAG/INT pour la Sorcière, CHA pour la spé bêtes du Trapper.

### Stats FQ du personnage

| Stat | Chemin | Rôle | Montable via carte de stat |
|---|---|---|---|
| PV | `attributes.hp` | Vie ; dé de vie propre à la classe (d4 → d12) | Non (dé de vie) |
| Points d'action | `fq.action` | Capacité d'agir, remis au max à chaque round | Oui (`action-point`) |
| Mana | `fq.mana` | Ressource limitée, non régénérée par tour (repos court : + max(SAG, INT, 1) ; repos long : plein) | Oui (`mana`) |
| Zèle | `fq.zeal` | Monte en jouant des petites cartes, se dépense sur les grosses ; remis à `zeal.init` **au début du combat uniquement**, puis se cumule d'un tour à l'autre (max 8) | Oui (`zeal` → monte `init`) |
| Critique | `fq.attributes.critical` | Seuil `21 - crit - bonusCrit` sur 1d20 ; réussite = dégâts/soins doublés | Oui (`critical`) |
| Esquive | `fq.attributes.evasion` | Seuil `21 - eva - bonusEva` sur le d20 de la cible ; annule les dégâts (sauf critique adverse : dégâts simples) | Oui (`evasion`) |
| Main | `fq.cards.hand` | Cartes piochées au début du combat | Oui (`hand`) |
| Pioche | `fq.cards.pick` | Cartes piochées chaque tour | Oui (`pick`) |
| Déplacement | `movement.walk` | Mouvement (1 carte = +5 ft = +1 case) | Oui (`moving`) |
| Bonus de portée | `fq.bonus.range` | Ajouté au `maxReach` de toutes les cartes — **jamais montable**, uniquement en combat | Non |
| DOT/HOT | `fq.bonus.dot` | Dégâts (ou soins si négatif) par tour | Non |

8 types de cartes de stats existent : `action-point`, `mana`, `critical`, `evasion`, `hand`, `pick`, `moving`, `zeal`. Il n'existe **ni carte PV ni carte portée**.

**Distribution** : chaque classe reçoit au N1 ses *Start stats* (stats FQ et caracs), puis choisit **3 stats aux niveaux impairs et 2 aux niveaux pairs** (sans remise), dans **son propre pool** — 70 objets hors pioche, plus 1 à 3 objets de pioche. ASI de +2 à chaque niveau pair. L'identité FQ d'une classe tient donc à deux choses : ses *Start stats*, et ce qu'elle peut monter ou non au fil des niveaux.

Cumul des choix : 3 au N1, 5 au N2, 8 au N3, 10 au N4, 13 au N5, 15 au N6, 18 au N7, 20 au N8, 23 au N9, 25 au N10, 28 au N11, **30 au N12**.

### Stats de départ

Les neuf *starter heroes* sont strictement identiques (toutes caractéristiques à 10) ; seuls les *Start stats* de la classe (`classes-stats-fq8/start-stats-*.json`) les différencient. Budget de **10 points pour toutes les classes**.

| Classe | PA | Mana | Zèle | Crit | Esq | Main | Pioche | Dépl | Budget |
|---|---|---|---|---|---|---|---|---|---|
| **Starter hero (base)** | **7** | **2** | **0** | **0** | **0** | **0** | **0** | **5** | — |
| Moine | +2 | +2 | 0 | 0 | +2 | +2 | +1 | +1 | 10 |
| Gardien | +2 | 0 | 0 | +1 | +1 | +5 | 0 | +1 | 10 |
| Mage Blanc | +3 | +4 | 0 | 0 | +1 | +1 | +1 | 0 | 10 |
| Élémentaliste | +2 | +4 | 0 | +1 | 0 | +1 | +1 | +1 | 10 |
| Trapper | +4 | +1 | 0 | +2 | 0 | 0 | +1 | +2 | 10 |
| Sorcière | +2 | +3 | 0 | 0 | +1 | +2 | +1 | +1 | 10 |
| Illusionniste | 0 | +1 | 0 | +2 | +2 | +2 | +1 | +2 | 10 |
| Maître d'Armes | +3 | +1 | 0 | +1 | +1 | +1 | +1 | +2 | 10 |
| Guerrier Runique | +1 | +2 | 0 | +1 | +1 | +2 | +2 | +1 | 10 |

Le déplacement se compte en cases (l'effet vaut +5 ft). **Aucune classe ne démarre avec du zèle** ; le **Gardien** est le seul à ne pas piocher en début de partie, compensé par la plus grosse main du jeu (5).

### Pool de stats par classe

Le pool complet compte **100 objets** : PA 30, mana 24, critique 10, esquive 10, zèle 8, déplacement 8, main 7, pioche 3. Chaque classe en garde **70 hors pioche**, plus les objets de pioche qui lui sont laissés — les 30 retirés sont ce qu'elle ne peut pas monter, ou plus difficilement.

| Classe | PA /30 | Mana /24 | Crit /10 | Esq /10 | Zèle /8 | Dépl /8 | Main /7 | Pioche N3 | N5 | N8 | Pool |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Moine | 30 | 10 | **0** | 10 | 8 | 8 | 4 | ✓ | ✓ | ✓ | 73 |
| Gardien | 30 | 5 | 8 | 8 | 8 | 4 | 7 | ✓ | — | — | 71 |
| Mage Blanc | 30 | 20 | 5 | 5 | 4 | 2 | 4 | ✓ | — | ✓ | 72 |
| Élémentaliste | 30 | 24 | 3 | 3 | 3 | 4 | 3 | ✓ | — | ✓ | 72 |
| Trapper | 30 | 16 | 10 | **0** | 4 | 8 | 2 | ✓ | ✓ | — | 72 |
| Sorcière | 30 | 18 | 6 | 4 | 6 | **0** | 6 | ✓ | ✓ | — | 72 |
| Illusionniste | 30 | 18 | 3 | 6 | 3 | 6 | 4 | ✓ | — | ✓ | 72 |
| Maître d'Armes | 30 | 16 | 8 | 4 | 4 | 4 | 4 | ✓ | ✓ | — | 72 |
| Guerrier Runique | 30 | 12 | 4 | 7 | 6 | 5 | 6 | ✓ | ✓ | ✓ | 73 |

Trois portes sont complètement fermées : le **Moine** ne monte jamais son critique, le **Trapper** jamais son esquive, la **Sorcière** jamais son déplacement (elle reste à 6 cases toute la campagne).

**Niveau minimum de chaque objet** (`system.prerequisites.level`) — le pool des PA suit exactement le cumul des choix, pour qu'un personnage puisse toujours tout mettre en points d'action :

| Stat | Objets | Répartition par niveau |
|---|---|---|
| Points d'action | 30 | 3 aux niveaux impairs, 2 aux pairs (N1 → N12) |
| Mana | 24 | N1:2 N2:2 N3:3 N4:2 N5:3 N6:3 N7:2 N8:3 N9:2 N10:2 |
| Critique, esquive | 10 chacun | 1 par niveau, N1 → N10 |
| Zèle, déplacement | 8 chacun | N1, N2, N4, N5, N6, N7, N9, N10 |
| Main | 7 | N1, N3, N4, N6, N7, N9, N10 |
| Pioche | 3 | N3, N5, N8 |

Quand une classe ne garde qu'une partie d'une stat, les objets retenus sont **répartis uniformément sur l'échelle des niveaux** (pour k objets sur n, on garde les indices `⌊j·n/k⌋`) : le premier reste accessible au N1 et les suivants s'étalent jusqu'au plafond de la stat, sans créer de trou en début de campagne.

### Niveaux des cartes
- `level` 1 à 12 : débloquée quand le niveau de la classe atteint cette valeur (les cartes neutres suivent le niveau global, somme des niveaux de classes).
- `level` 1 : en plus, **cartes de départ**. À la création du deck — quand le personnage reçoit sa première classe FQ — celles de la classe FQ **principale** y sont posées en tous leurs exemplaires ; leur total est figé comme **plancher du deck** (`system.fq.minSize`), en dessous duquel il ne peut plus descendre, et n'est plus jamais recalculé. Rien n'est verrouillé carte par carte : le joueur peut remplacer n'importe laquelle, à condition d'ajouter avant de retirer.
- **Il n'y a pas de niveau 0.** L'ancienne notion de « carte obligatoire » (N0, indéboulonnable du deck) a été remplacée par ce plancher.
- `level` 13 : hors campagne, jamais débloquée. Sert aujourd'hui de réserve de cartes « en attente ».

### Types de rôles utilisés dans ce document

- **Tank** : encaisse, provoque, protège (PV, taunt, réactions défensives)
- **DPS mêlée / distance** : dégâts directs, mono ou multi-cibles
- **Contrôle / debuff** : entraves, malus, DoT, zones
- **Soutien / soins** : buffs d'équipe, soins, boucliers
- **Invocateur** : joue à travers ses sbires
- **Moteur / scaling** : classe faible au départ qui construit sa puissance en cours de combat (ressource cumulative, deck-building, compteurs)

### Vue d'ensemble

| Classe | Dé de vie | Caracs dnd5e | Rôle | Signature |
|---|---|---|---|---|
| Élémentaliste | d4 | INT + SAG | DPS burst + debuff | 4 effets élémentaires prérequis des combos |
| Gardien | d12 | FOR + CON | Tank offensif | PV comme monnaie, zèle, charges de lame |
| Mage Blanc | d6 | CON + SAG | Soigneur / contrôleur DoT | Malédictions + boucliers réactifs + auras |
| Trapper | d8 | DEX + SAG | DPS distance / sniper | Critique-ressource, pièges réactifs, bêtes |
| Moine | d8 | FOR + DEX | Bruiser à tempo / soigneur de mêlée | Flux de cartes ↔ zèle, rejouable conditionnel, paumes de soin au contact |
| Sorcière | d6 | INT + CHA | Invocatrice | Armée de squelettes + score de sacrifice |
| Illusionniste | d6 | DEX + CHA | Contrôle / soutien hybride | Portée cumulative dépensable |
| Maître d'Armes | d10 | FOR + DEX | DPS martial polyvalent | Armes équipées (`@wpnM`/`@wpnR`), armes de jet |
| Guerrier Runique | d10 | FOR + INT | Moteur / late-game carry | Deck-building en combat (runes) |

Stats de départ notables (détail dans « Stats de départ ») : **critique** de départ nul pour Moine, Mage Blanc et Sorcière — et le Moine ne peut pas le monter du tout ; **esquive** nulle pour Trapper et Élémentaliste, le Trapper ne pouvant pas la monter non plus ; **zèle** nul pour toutes les classes ; **pioche** nulle pour le Gardien, qui n'a qu'un objet de pioche dans son pool ; **aucun point d'action** pour l'Illusionniste, qui compense par les cartes les moins chères du jeu.

### Vue d'ensemble des cartes (decks de base)

| Classe | N1 | N2 | N3 | N4 | N5 | N6 | N7 | N8 | N9 | N10 | N11 | N12 | Hors N1‑12 | Plancher deck | Total distinctes / exemplaires | Générées (dist./ex.) | Coût moyen PA | Cartes 1‑4 PA | Réactives | Zèle + / − | Innées |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Moine | 3 | 3 | 4 | 3 | 3 | 4 | 3 | 3 | 3 | 4 | 3 | 3 | 0 | 13 | 39 / 79 | 1 / 1 | 5,2 | 15 | 4 | 20 / 13 | 1 |
| Gardien | 3 | 4 | 3 | 3 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 0 | 12 | 41 / 75 | 3 / 32 | 5,1 | 11 | 6 | 13 / 17 | 1 |
| Mage Blanc | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 3 | 0 | 13 | 41 / 79 | 2 / 4 | 6,0 | 7 | 9 | 12 / 12 | 3 |
| Élémentaliste | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3 | 3 | 3 | 3 | 0 | 19 | 43 / 86 | 2 / 4 | 7,8 | 7 | 2 | 9 / 25 | 1 |
| Trapper | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 3 | 3 | 3 | 3 | 0 | 9 | 39 / 72 | 0 / 0 | 7,9 | 5 | 9 | 8 / 18 | 1 |
| Sorcière | 4 | 3 | 3 | 3 | 4 | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 0 | 13 | 39 / 78 | 1 / 3 | 6,8 | 5 | 1 | 5 / 11 | 2 |
| Illusionniste | 4 | 4 | 4 | 3 | 3 | 4 | 3 | 3 | 4 | 3 | 4 | 3 | 0 | 9 | 42 / 70 | 0 / 0 | 5,2 | 13 | 2 | 8 / 20 | 2 |
| Maître d'Armes | 3 | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 4 | 3 | 4 | 3 | 0 | 10 | 39 / 77 | 12 / 46 | 5,1 | 18 | 3 | 14 / 14 | 5 |
| Guerrier Runique | 4 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 5 | 15 / 16 | 17 / 408 | 5,9 | 1 | 0 | 12 / 0 | 0 |

**Hors N1‑12** : plus aucune carte, les neuf decks sont rangés. **Plancher deck** : exemplaires des cartes N1, figés comme `minSize` du deck de départ — il reste à le ramener autour de 7‑8 partout (étape 4), l'Élémentaliste à 19 et la Sorcière à 13 étant les plus lourds. Tableau copié de `npm run report:classes`.

### Spécialisations par niveau

Les 319 cartes des huit classes ont été réparties sur les niveaux N1 à N12 le 2026‑09‑21 (le Guerrier Runique garde ses niveaux et ses 117 runes). Chaque classe ouvre deux spécialisations au N1 et garde la troisième pour plus tard :

| Classe | Ouvre au N1 | Ouvre plus tard |
|---|---|---|
| Gardien | Berzerker, Sac à PV temp | Ange Gardien → N4 |
| Mage Blanc | Soutien/healeur, Malédictions | Hanteur (fantômes) → N7 |
| Moine | Enchaînement, Paume, transverse | Main pleine → N3 |
| Élémentaliste | Feu, Givre, Terre, Air | combos « ou » → N4, combos « et » → N7 |
| Trapper | Sniper | Pièges → N4, Bêtes → N6 |
| Sorcière | Armée, Charnier | Colosse → N6 |
| Illusionniste | Lame d'allonge, Barde | Chronomancien → N5 |
| Maître d'Armes | Mêlée, Distance | Armes de jet → N3, Instructeur → N5 |

Cinq règles encadrent la répartition :

| # | Règle | Pourquoi |
|---|---|---|
| **N1 minimal** | 3 cartes (4 pour l'Élémentaliste, une par élément ; 4 aussi pour la Sorcière et l'Illusionniste depuis le lot du 2026‑09‑21) | Le N1 est aussi le **plancher du deck** : tout ce qu'on y met est posé en tous ses exemplaires à la création du personnage. |
| **3 à 4 par niveau** ensuite | une carte par spécialisation ouverte quand le compte le permet | La montée de niveau fait progresser tous les axes du personnage, pas un seul. |
| **Aucune innée avant le N3** | la première innée de chaque classe est au N3 ou au N4 | Les innées sont distribuées d'office en main au début de chaque combat (`combat-turn.js`) : les donner plus tôt figerait la main de départ. |
| **Aucun coût en zèle au N1** | les cartes N1 en **rendent** ; les consommateurs commencent au N2‑N3 | Le zèle initial vaut 0,1 à 0,3 selon la classe — aucune n'en a au départ : une carte qui en coûte serait injouable au premier tour. |
| **Prérequis = niveau tardif** | stacks (3 brûlures, 5 hantises, 4 effets de terre), défausse de 3‑4 cartes, « après 2 autres réactives » | Une carte n'arrive qu'après celles qui produisent sa condition. Les ultimes et les cartes « tout ou rien » ferment les N10‑N12. |

Le coût tient dans les ressources du niveau : N1‑N2 ≤ 7 PA / 1 mana ; N3‑N5 ≤ 9 PA / 2 mana ; N6‑N8 ≤ 12 PA / 3 mana ; N9‑N12 le reste. Rapportés aux cartes réellement en main au premier tour (main + pioche), les N1 tombent juste partout : Mage Blanc, Maître d'Armes et Élémentaliste à 4,6‑4,9 PA par carte disponible pour des cartes à 4‑6 PA, et le **Trapper** à 12,2 PA pour une seule carte par tour (main 0,1), ce qui valide exactement *Tir Précis* et *Embuscade*, dont le coût est la distance ou tout le budget du tour.

### Lot de cartes du 2026‑09‑21

| Carte | Classe | Niv. | Ex. | Coûts | Effet |
|---|---|---|---|---|---|
| **Estoc perçant** | Illusionniste (Lame d'allonge) | N1 | ×2 | 7 PA, 1 mana, **+1 zèle** | `(@dex + @cha + 1d4)` perçant, portée 1‑1 ; **1d2 de chance de +1 portée** (patron de la Rapière Enchantée) |
| **Refrain Vivifiant** | Illusionniste (Barde) | N2 | ×2 | **−4 + 1d6 PA** | HOT : `-(1 + ceil(@cha/2))` PV par tour pendant 2 tours, portée 0‑2. Aucun soin immédiat, et 1d6 des 4 PA revient — la seule carte du jeu dont le coût en action porte un dé |
| **Crescendo** | Illusionniste (Barde) | N3 | ×2 | 1 zèle | **+1 au maximum de zèle, définitivement**. Deuxième carte du jeu à toucher `zeal.max` après Poing Rouge (+5) |
| **Trait d'Ombre-Verte Mineur** | Sorcière (Charnier) | N1 | ×5 | 5 PA, 1 mana, **+1 zèle** | `@int` acide + rongement, portée 2‑8, **sans squelette** ; **1 chance sur 2 d'augmenter le score de sacrifice de 1** — la première carte du jeu qui l'alimente, les autres ne font que le consommer |

Deux ajustements du même lot : ***Trait d'Ombre-Verte*** passe de **9 à 3 exemplaires**, doublé par sa version mineure — le spam du N1 de la Sorcière alimente désormais le charnier autant que l'armée ; et ***Magie Blanche*** est renommée ***Magie Verte*** (clé `FQCARDTITLE.GreenMagic`, image `images/cards/illusionist/GreenMagic.png`), son `_id` technique `illWhiteMagic001` étant conservé pour ne pas casser les decks existants.

L'Illusionniste passe à **42 cartes** et rejoint les classes à élaguer. Les quatre nouvelles cartes sont sur `in_progress.png` : illustrations à faire.

---

**Questionnement et TODO générique :**
- Combos : si certaines actions réussissent → redonne tous les points d'action pour jouer d'autres cartes, ou réduit le coût d'une carte à 0.

**Dernière passe pour chaque classe :** (détaillée dans le TODO en tête de fichier)
- Environ 40 cartes par classe : 7 aux niveaux 0 et 1, environ 3 cartes par niveau pour chaque spécialisation
- Vérifier la caractérisation des autres classes
- Équilibrage de la classe manuel puis IA : dégâts, coûts (si trop de sorts coûtent cher, rajouter quelques sorts peu chers), nombre de cartes, synergies
- Vérifier la caractérisation des abilities dnd
- Vérifier chaque fonctionnalité du moteur pour chaque classe
- Faire un inventaire des types de dégâts
- Faire vérifier les descriptions par une IA
- Compléter avec des sorts de rang 2 (juste des sorts plus forts, par exemple Trait de feu II) pour les niveaux supérieurs OU les trous

### Règles générales sur les cartes
- Les dégâts de zone ne font pas beaucoup moins de dégâts que les sorts monocibles (on ne divise pas les dégâts entre les cibles)

### Règles d'équilibrage (provisoires)

*Grille de départ pour écrire les cartes de l'étape 1 ; elle sera recalibrée à l'étape 4. Source : `npm run report:classes`, section « Rendement des cartes » (médiane des cartes existantes à coût et formule fixes, caracs moyennes de la classe au niveau de la carte, arme d6).*

**Dégâts et soins moyens attendus par PA dépensé** (carte coûtant en plus 0 à 1 mana, comme la plupart des cartes mesurées) :

| Tranche | Dégâts / PA | Soins / PA | Exemple (carte à 6 PA) | Échantillon mesuré |
|---|---|---|---|---|
| N1‑N3 | ≈ 0,9 | ≈ 1 | ≈ 5 dégâts (*Attaque Simple* : 7 PA, 1 mana, 5,5 dégâts) | 33 choix de dégâts, 2 de soins |
| N4‑N7 | ≈ 1,2 | ≈ 1 | ≈ 7 dégâts | 24 / 5 |
| N8‑N12 | ≈ 1,5 (à confirmer) | ≈ 1,2 (à confirmer) | ≈ 9 dégâts | 8 / 2 : trop peu de cartes, valeur extrapolée |

**Mesure actuelle** (médiane toutes classes, `npm run report:classes`) : **0,9 / 0,9 / 0,6** dégâts par PA et **1 / 1 / 0,8** soins par PA sur les trois tranches. Les cibles ci-dessus restent au-dessus du mesuré aux tranches hautes : c'est voulu — les N4‑N12 sont encore à écrire.

À ajouter à la valeur de base, puis à compenser par le coût :
- **Effet** (DoT, état, debuff) : l'équivalent d'environ 1 à 2 PA selon sa durée.
- **Zone ou multi-cible** : dégâts proches du monocible (règle générale ci-dessus), le surcoût passe par le PA, le mana ou le zèle.
- **Carte réactive (0 PA)** : se paie en mana et/ou en zèle.
- **Critique et esquive** ne sont pas comptés dans la grille : une carte inesquivable ou incritiquable doit le compenser.

**Équivalences de ressources, à valider** (tirées des conversions déjà présentes dans les cartes) :

| Échange | Valeur provisoire | Cartes de référence |
|---|---|---|
| 1 mana ↔ PA | 1 mana ≈ 3 PA | *Vases communicants* (1 mana ⇄ 4 PA), *Récupération de mana* I à III (1 à 1,7 PA par mana) |
| 1 mana ↔ PV | 1 mana ≈ 4 PV | *Frappe Héroïque* (6 − CON PV), *Frappe provocatrice* (4 PV), *Sang Bleu* (2 PV par mana, plus généreux) |
| 1 zèle dépensé | ≈ 1 mana ≈ 3 PA | *Conversion* (1 zèle → 1 mana), *Souffle de Ki* (1 zèle → 1 carte + 2 PA) |
| 1 carte piochée | ≈ 1 à 2 PA | *Pioche II* (2 PA → 2 cartes), *Pioche III* (3 PA → 3 cartes) |
| 1 carte défaussée | ≈ coût d'une petite carte | *Magie des Éléments*, *Soin*, *Sortilège d'Ombre* (défausse en coût d'appoint) |

> **Le coût `drop` se paie en cartes, pas en score.** Une carte qui déclare `drop` ouvre, au moment du jeu, le voile de sélection sur la main : le joueur y désigne exactement les cartes exigées, et valider les envoie à la défausse en même temps que la carte se joue. Hors combat, aucune défausse n'est jamais exigée ; en combat, une main trop courte (la carte jouée non comptée) rend la carte injouable, sans même ouvrir le voile.

**Autres cibles** (à fixer à l'étape 4) : ratio générateurs / consommateurs de zèle par classe ; nombre d'exemplaires par tranche de niveau (`TARGETS.copies` dans `utils/class-report.mjs`).

---

## Gardien

> « Le plus grand nombre de points de vie du jeu. Peut puiser dans ses points de vie pour améliorer ses dégâts ou soutenir ses alliés. »

**Identité dnd5e** : d12, FOR + CON. CHA sert aux cartes de provocation, au Coup de bouclier, à Garde Absolue et au Cri de Ralliement — elle reste plate à 12 (+1), jamais montée par les ASI : à trancher (basculer sur CON, ou l'assumer).

**Stats FQ** : la **plus grosse main du jeu** (5 au N1, 8 au N12) et **aucune pioche** — un seul objet de pioche dans son pool, au N3 : il joue sa main de départ, ses réactives et ses cartes générées. **Le moins de mana du jeu** (2,2 au N1, 4,1 au N12, 5 objets de mana seulement) : l'alternative en points de vie n'est pas un confort, c'est sa ressource. Mobilité bridée (4 objets de déplacement). Sa vraie ressource est le couple PV + zèle, avec **les PV et la CA les plus élevés** (164 PV au N12, CA 18).
Sa vraie ressource est le couple PV + zèle. **Les PV et la CA les plus élevés** (164 PV au N12, CA 18).

**Spécialisations validées** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Berzerker (dps) | utilise ses pvs pour devenir un dps redoutable | 16 |
| Sac à PV temp (tank) | A besoin de pas trop sacrifier ses pvs, Gros tank qui taunt ses ennemis | 16 |
| Ange Gardien (soutien) | Utilise surtout ses PVs pour buff ses alliés, Fais plus de dégâts si ses alliés réussissent | 11 |
| *(transverse)* | Changement de Posture, la seule innée | 1 |

**Mécaniques signature** :
- **PV comme monnaie** : Frappe Héroïque (−(6−@con) PV au lieu du mana), Frappe provocatrice, Montée de la rage (PV → mana), Offrande de Sang, Fureur Sacrificielle, et tout le versant Ange Gardien (Cri de Ralliement, Chœur de Guerre, Transmission de Rage, Sacrifice du Gardien, Aura du Gardien).
- **Chargement** : trois cartes à compteur, une par spécialisation, toutes bâties sur le même patron — un seul choix, `replayable: "99999999"` (rechargeable **plusieurs fois par tour**, contrairement à `passif`), compteur dans `flags.fq`, et au cap le script **défausse la carte** et **génère une carte éphémère** du deck `Guardian Generated`. Le surplus de charge est perdu.
  - Chargement Des Lames — charge en **PA**, cap 12 → *Lame Chargée* (grosse frappe au contact).
  - Tourbillon De Lame — charge en **PA**, cap 8 → *Tourbillon Déchaîné* (AoE adjacente).
  - Serment de Sang — charge en **points de vie**, cap 20 → *Bénédiction du Rempart* (PV temporaires à tous les alliés).
- **Avantage plutôt que critique** : Affûtage (sur soi) et Élan Partagé (sur un allié qui vient de frapper), via le statut `empowered`.
- **PV temporaires, et rien d'autre** : Renfort d'Armure, Chair de Titan, Intervention, Levée de Bouclier, Rempart Magique, Vigueur Intacte, Essor Vital, Baroud d'Honneur, Frappe d'Ancrage, Agrippe Salvatrice, Bouclier Partagé, Sacrifice du Gardien, Bénédiction du Rempart. Les deux formules à dé (Essor Vital, Baroud d'Honneur) tirent leur dé **une seule fois** dans l'`executeEval`, qui écrit le même total dans le soin et dans le `tempmax` — sans quoi les deux se désynchronisent.
- **Agripper des alliés ou des ennemis** (pas de déplacement supplémentaire, plutôt des choses pour attraper) : Chaîne de Fer (ennemi) et Agrippe Salvatrice (allié), toutes deux via la macro `IronChain`.
- **Écho des alliés** : le Gardien tire sa puissance des réussites de son équipe. Réactifs déclenchés pendant les tours des autres — Écho du Sang (`targetsDealtDamageThisRound`), Élan Partagé, Bouclier Partagé (`targetsTookDamageThisRound`), Intervention : ce sont eux qui redressent l'économie de zèle de la classe. Et **Frappe Inspirée**, la seule carte à dégâts de la classe dont la puissance dépend des autres : `xvalue` compte, dans les logs du round, les combattants **de votre camp** (le lanceur exclu) ayant infligé des dégâts FQ effectifs, et ajoute 3 par allié.
- **Réactions défensives** : Coup de bouclier (contre-charge), Intervention (prend les dégâts d'un allié à sa place), Levée De Bouclier (récupère la moitié des dégâts subis), Bouclier Partagé (prend la moitié à la place d'un allié), Garde Absolue.
- **Sous égide / garde brisée** : `warded` (Égide, Agrippe Salvatrice, Sacrifice du Gardien, Aura du Gardien) et `exposed` (Brèche).
- **Postures et trade-off crit ↔ esquive** : Changement De Posture (innée, rejouable à l'infini) — **la seule carte de la classe qui touche encore au critique ou à l'esquive**. Posture De Berzerker et Rage Ultime (puissance contre auto-DoT), Chair de Titan / Chair de Berzerker.
- **Taunt** : Frappe provocatrice, Onde de Choc (et hors classe : Uppercut du Moine, runes bleues du Guerrier Runique). ⚠️ Le taunt n'est aujourd'hui **qu'un message de chat** (`FQCARDENGINE.CardMsgTaunting`) : aucune contrainte mécanique, c'est le MJ qui l'applique.

**Boucle de jeu** : frapper pour générer du zèle, payer en PV ce que le mana ne couvre pas, encaisser/réagir hors tour, basculer protecteur (Rempart Magique, Intervention, Essor Vital) en fin de combat.

**Faiblesses** :
- Le moins de points de mana
- Pas de critique ou d'esquive bonus dans les cartes hormis le trade-off de *Changement de Posture*
- Tank qui ne se soigne pas (uniquement PV temporaires), les pv perdus sont perdus.
- A du mal à arriver au contact d'une cible (pas de sort pour augmenter le déplacement, uniquement pour agripper des ennemis)

### Constat des cartes (données)
- **41 cartes réparties sur N1‑N12** (3 à 4 par niveau), coût moyen 5,1 PA et 11 cartes à 1‑4 PA. Deux cartes de trop pour la cible de 30‑40 : l'élagage reste à faire.
- 3 cartes **générées** dans `guardian-generated.json` (Lame Chargée, Tourbillon Déchaîné, Bénédiction du Rempart), toutes éphémères.
- Exemplaires : 75 au total, plus 32 exemplaires générés.
- Zèle : 13 générateurs pour 17 consommateurs (contre 6/15 avant le lot), grâce aux réactifs de l'Ange Gardien et aux petites frappes.
- Aucun soin réel ni HOT dans le deck : les 12 cartes du deck de base qui rendent des PV les rendent toutes en **temporaires** (13 avec la Bénédiction du Rempart, générée).
- Beaucoup de cartes coûtent 1 mana (Frappe Héroïque ×6, Hémorragie ×4, Brèche, Égide, Coup Puissant…) : l'alternative PV est indispensable avec 2,2 mana au N1 et 4,1 au N12 (5 objets de mana dans son pool).

### Cartes N13 à placer (lot du 2026-09-18)
**Tout le deck est au niveau 13** : il reste à donner un niveau N1‑N12 aux 41 cartes et à équilibrer les `maxSameCard`. 11 cartes ont été écrites dans ce lot.

### Redondances à trancher
- Bonus de dégâts contre auto-dégâts : Posture de Berzerker / Chair de Berzerker / Rage Ultime / Soif de Sang.
- Payer en PV : Offrande de Sang / choix PV de Frappe Héroïque.

### Incohérences relevées
- Essor Vital coûte 16 PA : injouable avant le N6‑N7 en moyenne (le soin est devenu temporaire, le coût reste à revoir).
- L'image d'Essor Vital est référencée avec une casse qui ne correspond pas au fichier (`KNOWN_ISSUES`).

**Questionnement et TODO :**
- Berzerker utilise des pv pour s'approcher d'une cible?
- Lui rajouter des PVs dans les stats FQ?
- Sorts de tank plus fort si PV élevés? bouclier temporaire automatiques?
- **Donner un niveau N1‑N12 aux 41 cartes** (tout le deck est au N13) et fixer les `maxSameCard` (cible proposée : 14 exemplaires au N1, ~40 au N6, ~58 au N12 — incompatible avec `TARGETS.copies = {12: [48,55]}`, qu'il faudra relever).
- Illustrations des cartes nouvelles restées sur `in_progress.png`.
---

## Mage Blanc

> « Le meilleur soigneur et protecteur, mais ses malédictions peuvent infliger d'importants dégâts également. »

**Identité dnd5e** : d6, CON + SAG (les deux requises) ; INT s'ajoute en pratique (dégâts radiants, boucliers réactifs, 8 cartes) — classe structurellement étalée sur 3 caracs. CHA à 6 (-2).

**Stats FQ** : **le 2e meilleur mana du jeu** (6,8 au N1, 14,3 au N12, 20 objets de mana) et le meilleur budget d'action de départ (+3). **Déplacement le plus faible et quasi figé** (5,1 au N1, 5,8 au N12 : 2 objets de déplacement seulement) — il ne bougera jamais. Peu de zèle montable (4 objets), CA 8.

**Spécialisations validées** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Mage Blanc (healeur et soutien) | Fais des soins et utilise des aura pour soigner et buffé ces alliés | 16 |
| Malédictions (dps) | utilise des stacks de malédictions pour faire d'importants dégâts | 12 |
| Hanteur (dps spécial) | Consomme les malédictions et/ou réduits ses stats de dégâts et de heal pour contrôler d'autres tokens dans un tour bonus | 8 |
| *(transverse)* | Exorcisme, Infusion de Mana, Sang Bleu, Absorption de Sort, Lumière Révélatrice | 5 |

**Mécaniques signature** :
- **Malédiction (`Curse`)** : pose plusieurs stacks sur des cibles, permet d'utiliser d'autres sorts efficaces avec beaucoup de stacks. Tue une cible ayant suffisamment de malédictions (Jugement Dernier).
- **Hantise (`Haunt`)** : seconde marque empilable, distincte de la malédiction et qui ne se confond jamais avec elle. Elle ne fait aucun dégât : elle ouvre la **prise de contrôle**. À 5 hantises, le *Fantôme* — une COPIE de la cible, sur sa case, jouée par le Mage Blanc le temps d'un seul tour puis dissipée. *Profanation* convertit les malédictions en hantises, une pour une, ce qui relie les deux spécialisations.
- **Suite de boucliers réactifs** : 8 des 9 réactives de la classe (Bouclier de Mana, Divin, Vengeur, Empathique, Réprouver, Soins d'Urgence, Ange Gardien, Absorption de Sort ; la neuvième, Voile de Cendres, relève de la Hantise), Bouclier de Mana avec `replayable: @wis`. Trois modèles de mitigation distincts : PV temporaires, soin réactif répété, invulnérabilité + restauration (Bouclier Divin).
- **Transmutation de ressources** : Sang Bleu (2 PV → 1 mana), Le Bien Et Le Mal (transfert de PV à portée quasi illimitée), Soins d'Urgence (défausse → soin), Infusion de Mana (source de mana passive permanente), Absorption de Sort.
- **Générateur de mana** : Infusion de Mana.
- **Beaucoup de cartes automatiques** : les auras qui coûtent 1 mana par tour, à combiner avec les infusions de mana.

**Boucle de jeu** : maudire tôt → laisser tourner les DoT en soignant/réagissant → détoner ; alimenter le tout par conversion de ressources.

**Faiblesses** :
- Lent (5 cases), fragile au contact (CA 8)

### Constat des cartes (données)
- **41 cartes réparties sur N1‑N12**, coût moyen 6,0 PA et 7 cartes à 1‑4 PA. Deux cartes de trop pour la cible de 30‑40 : l'élagage reste à faire.
- Seulement 2 cartes à 1‑4 PA.
- Soin direct faible : Soin (innée), Énergie Lumineuse, Soins d'Urgence ; le reste est réactif ou bouclier.

### Redondances à trancher
- Bouclier Vengeur / Bouclier Empathique (même déclencheur, dégâts ou soin) : fusionner en une carte à deux choix ?
- Pacte Maudit / Sentence Maudite (malédictions sur soi → dégâts).

### Incohérences relevées
- Maudire : `mana: 1` (gain).
- Exorcisme : réduction « @cha » annoncée mais absente des données.
- Aura de Force : scale sur CHA (-2 pour le Mage Blanc).
- Effet Ange et Démon : 16 PA, 4 mana, 4 zèle.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**


---

## Moine

> « Adepte d'un jeu très dynamique : joue beaucoup de cartes différentes pour monter rapidement son zèle. Robuste, score d'esquive élevé. »

**Identité dnd5e** : d8, FOR + DEX. CON alimente les coûts et les PV temporaires. ⚠️ **SAG reste plate à 8 (−1)** et n'est jamais montée par les ASI : toute formule en `@wis` rend *moins que rien* au Moine. Les soins du lot 2026‑09‑20 sont donc écrits en **DEX**, la vraie carac de la classe ; ne restent en `@wis` que l'appoint historique de Paume De Jade et le `@wis` de Sérénité Pleine, tous deux à reprendre.

**Stats FQ** : **la meilleure esquive du jeu** (2,4 au N1, 6,1 au N12) et de quoi jouer plusieurs petites cartes par tour (10,2 PA au N1, 21,3 au N12, 30 objets d'action dans son pool, 41 % du total). **Aucun critique, jamais** : c'est la seule classe dont le pool n'en contient aucun — il joue le volume, pas le burst. Déplacement correct mais plus le meilleur du jeu (6,3 au N1, 9,3 au N12) ; mana bridé (10 objets).

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Enchaînement (dps tempo) | Enchaîne des petites frappes rejouables pour monter son zèle, puis le dépense dans des cartes qui scalent | 11 |
| Main pleine (dps de ressource) | Garde ses cartes au lieu de les jouer : plus la main est pleine, plus ses cartes frappent | 8 |
| Paume (soutien) | Soigne au contact en frappant, à portée 1, sans jamais quitter la mêlée | 7 |
| *(transverse)* | Tank esquive et mobilité : encaisse en esquivant plutôt qu'en PV, et se replace sans cesse | 13 |

Détail des cartes :

| Spécialisation | Principe | Cartes existantes | Manques |
|---|---|---|---|
| **Enchaînement** (cadence, frappes) | Petites frappes rejouables qui montent le zèle, puis consommateurs scalables | Coup Droit, Coup Gauche, Combo, Combo 2, Lame Fantôme, Uppercut, Cadence, Élan Martial, Cycle du Souffle, Vacuité, Gant de Fer | Finisher N10‑12 |
| **Main pleine** (garde les cartes) | X = cartes restant en main : plus la main est pleine, plus les cartes frappent | Poings des Cent Formes, Paume des Mille Feuilles, Sérénité Pleine, Ferveur Intérieure, Hyperactivité, Lecture du Souffle, Second Souffle, Maître du Chi | Carte défensive qui scale sur la main |
| **Paume / soins au contact** | Soigne en frappant, à portée 1, sans jamais quitter la mêlée | Paume Curative, Paume De Jade, Sillage Curatif, Bague de Soins, Transfert de Soins, Méditation Zen, Vive-Esquive | Soin de groupe au contact, N8+ |
| **Tank esquive / mobilité** *(transverse)* | Encaisse en esquivant plutôt qu'en PV, et se replace sans cesse | Posture du Roseau, Sérénité Pleine, Dissimulation, Bouclier Zélé, Interruption, Déplacement Éclair, Sillage Curatif, Pas du Vide, Charge, Souffle de Ki, Poing Rouge, Souffle Perpétuel, Armes Secrètes, Cape Inhibitrice, Conversion | Provocation autre qu'Uppercut |

**Mécaniques signature** :
- **Économie de zèle fermée** : générateurs spammables (Coup Droit ×6, Coup Gauche ×5, Uppercut ×6, Paume Curative ×4, Posture du Roseau ×3, +1 chacun) → consommateurs scalables (Combo, Combo 2 non borné, Souffle de Ki, Méditation Zen, Paume De Jade).
  - Poing Rouge monte `zeal.max` (+5, permanent) ; depuis le 2026‑09‑21, *Crescendo* (Illusionniste, N3) fait de même pour +1 contre 1 zèle.
- **Soigner au contact, en frappant** : c'est le seul soigneur de mêlée du jeu, tous ses soins sont à portée 1 (Paume Curative, Paume De Jade, Bague de Soins, Transfert de Soins) ou sur la trajectoire d'un déplacement (Sillage Curatif). Depuis le lot 2026‑09‑20, deux étages : **Paume Curative** (3 PA, aucun mana, petit soin fixe, **+1 zèle**) est un générateur spammable au même tempo que Coup Droit ; **Paume De Jade** (l'ancienne Paume Curative, améliorée : X jusqu'à 3, +2 au soin de base, et le Moine se soigne de SAG au passage) est le gros soin à zèle dépensé.
- **Le pendant soin du déplacement** : Déplacement Éclair (dégâts) et **Sillage Curatif** (soins) partagent la macro `FlashMove` et le même `customEval` d'alignement — deux faces d'une même mécanique, l'une traverse des ennemis, l'autre des alliés.
- **PV temporaires, et rien d'autre, pour l'auto-soin de tempo** : Méditation Zen rend ses PV en **temporaires pendant 1 tour** (patron du Gardien : le `hp` soigne, l'effet monte `hp.tempmax` de la même formule). Le vrai soin personnel passe par Vive-Esquive (réactif), Sérénité Pleine, Sillage Curatif et l'appoint en X de Paume De Jade.
- **Flux de cartes** : Souffle de Ki (zèle → X cartes **et** 2X actions), Maître Du Chi (carte innée passive bidirectionnelle : défausse ↔ zèle ↔ pioche), Armes Secrètes (X cartes défaussées → autant de dégâts inesquivables).
- **Rejouable conditionnel scripté** (unique au Moine) : Coup Droit/Gauche rejouables **une fois** seulement si assez de PA ont déjà été dépensés ce tour (4 / 5) — récompense l'**ordonnancement** des cartes.
- **Esquive plutôt que PV** : c'est la seule classe à gagner de l'esquive **définitivement** (Posture du Roseau, +1 par exemplaire, sans durée comme le Poing Rouge), au prix de −1 à tous ses dégâts pendant 1 tour. Sérénité Pleine y ajoute un pic d'esquive égal à la main restante jusqu'au prochain tour : les deux axes « main pleine » et « tank esquive » se rejoignent enfin sur une carte.
- **Défense réactive** : 4 réactives (Bouclier Zélé sur sort subi, Vive-Esquive sur dégâts, Armes Secrètes, Interruption qui retire 1d6 PA et entrave) + Dissimulation (intouchable 1 tour au prix de dégâts nuls, puis fenêtre offensive).
- **Déplacement améliorable** : Déplacement Éclair, Sillage Curatif, Pas du Vide, Charge.
- **Taunt** : Uppercut seul (⚠️ comme chez le Gardien, le taunt n'est qu'un message de chat, appliqué par le MJ).

**Boucle de jeu** : enchaîner les petites frappes et les petites paumes → zèle → convertir en cartes/actions/burst ou en gros soin ; l'ordre de jeu dans le tour est la compétence clé.

**Faiblesses** :
- **Aucun critique, et aucun moyen d'en gagner** : son pool n'en contient pas un seul.
- Son déplacement de départ est tombé à 6,3 cases : il ne survole plus le terrain, il doit monter la stat pour retrouver sa mobilité.
- Sérénité Pleine (et l'appoint `@wis` de Paume De Jade) scalent encore sur SAG, sa caractéristique la plus basse (−1) et jamais montée : ils rendent moins que leur libellé ne le laisse croire.
- Doit rester au contact pour soigner : aucun soin à distance, aucun soin de zone.
- Son auto-soin de tempo (Méditation Zen) ne rend plus que des PV temporaires : ce qui dépasse est perdu au bout d'un tour.

### Constat des cartes (données)
- **39 cartes réparties sur N1‑N12**, coût moyen 5,2 PA et 15 cartes à 1‑4 PA — la 2e plus grande densité de cartes peu chères, cohérent avec son jeu de volume.
- Économie de zèle : 20 générateurs / 13 consommateurs (contre 17/13 avant le lot), grâce à Paume Curative et Posture du Roseau. Coût moyen 5,6 PA.
- 79 exemplaires. `maxSameCard` lourds : Coup Droit ×6, Uppercut ×6, Coup Gauche ×5, Paume Curative ×4, Posture du Roseau ×3.
- Deux axes opposés apparaissent dans les cartes N13 : « **main pleine** » (X = cartes en main) et « **cadence** » (X = cartes déjà jouées ce round).
- Mana : 5,5 au N1 alors que Coup Gauche, Combo, Uppercut, Lame Fantôme, Dissimulation, Sillage Curatif coûtent du mana.

### Cartes du lot 2026‑09‑20
- **Paume Curative** (N6, ×4) — nouvelle carte, reprend le nom et l'illustration de l'ancienne : petit soin au contact (`1 + ceil(@dex/2)`, calibré sur la grille ≈ 1 soin/PA), **+1 zèle**, 3 PA, sans mana. Le pendant soin de Coup Droit, même coût et même patron de formule.
- **Paume De Jade** (N13, ×2) — l'ancienne Paume Curative, conservée et améliorée (X max 2 → 3, soin +2, et X PV de soin personnel). **Illustration à faire** (sur `in_progress.png`).
- **Sillage Curatif** (N13, ×1) — le pendant soin de Déplacement Éclair. **Illustration à faire**.
- **Posture Du Roseau** (N13, ×3) — +1 esquive définitive et +1 zèle, contre −1 dégâts pendant 1 tour. **Illustration à faire**.
- **Méditation Zen** — les PV rendus deviennent temporaires pendant 1 tour.
- **Sérénité Pleine** — ajoute X en esquive jusqu'au prochain tour, X = cartes restant en main.

### Redondances à trancher
- Gain de PA : Hyperactivité / Vacuité / Souffle de Ki.
- Gain de zèle : Ferveur Intérieure / Élan Martial / Maître du Chi / Souffle Perpétuel (+ Montée de Zèle générée).
- Pioche : Cycle du Souffle / Second Souffle / Lecture du Souffle / Souffle de Ki.
- Soin au contact à portée 1 : Paume Curative / Paume De Jade / Bague de Soins / Transfert de Soins — quatre cartes pour le même geste, à différencier ou à fusionner.
- *(résolue par le lot)* Soin personnel : Sérénité Pleine (soin + esquive) / Méditation Zen (PV temporaires) / Vive-Esquive (réactif) sont maintenant trois effets distincts.

### Incohérences relevées
- Uppercut : « piochez une carte » absent des données.
- Poing Rouge coûte 14 PA : injouable avant le N6 en moyenne.
- Posture du Roseau ×3 donne **+3 d'esquive permanents** sur la durée d'une partie : à mesurer avant de valider le nombre d'exemplaires.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**
- Reprendre les deux formules en `@wis` qui restent (Sérénité Pleine, appoint de Paume De Jade), ou monter SAG dans les Start stats ?
- Donner un niveau N1‑N12 aux 20 cartes garées au N13.
- Illustrations de Paume De Jade, Sillage Curatif et Posture Du Roseau (restées sur `in_progress.png`).
---

## Élémentaliste

> « Allie des effets de feu, de givre, d'air et de terre pour infliger d'importants dégâts. Fragile mais possède les plus gros dégâts bruts du jeu. »

À revoir :

| Élément ou statut | Sauvegarde |
|---|---|
| feu, foudre, acide, force, radiant, tranchant, perforant ; brûlure | DEX |
| froid, tonnerre, poison, nécrotique ; givre, virus, poison | CON |
| psychique ; malédiction, charmé, inconscient | SAG |
| contondant ; agrippé, marque d'air | FOR |

**Identité dnd5e** : d4, INT + SAG (les deux requises). INT pour les dégâts directs, givre et terre ; SAG pour le feu et l'air. Assassin du Néant utilise DEX (12).

**Stats FQ** : **le meilleur mana du jeu** (7,0 au N1, 16,0 au N12, les 24 objets de mana) — c'est la seule classe qui garde le pool de mana en entier. En échange, presque tout le reste est rogné : critique, esquive, zèle et main à 3 objets chacun, et **les PV les plus bas** (18 / 28 / 52).

**Rôle** : DPS magique « glass cannon », mono-cible burst avec pivot AoE (Météore, Onde glacée, Choc de feu), contrôle/debuff en sous-produit.

**Spécialisations proposées (à valider)** — **la seule classe à 4 spécialisations, une par élément** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Feu (dps sur la durée) | Empile les effets de brûlure : peu de dégâts directs, beaucoup de dégâts par tour cumulés | 5 |
| Givre (contrôle de tempo) | Gèle une cible unique : ses sorts coûtent plus cher, elle perd ses points d'action | 5 |
| Terre (dps mono-cible) | Les plus gros dégâts sur une seule cible, qu'il cloue au sol en lui retirant son esquive | 4 |
| Air (dps multi-cible) | Frappe plusieurs cibles à la fois, les repousse et leur retire du déplacement | 5 |
| *(combos)* | Les 6 paires d'éléments : 10 cartes exigent les **deux** éléments sur la même cible, 6 acceptent l'un **ou** l'autre | 16 |
| *(transverse)* | Utilitaires : mana, pioche, report d'action, seule défense de la classe | 8 |

**Les spés se combinent, c'est la particularité de la classe** : 16 cartes sur 43 — plus du tiers du deck — sont des cartes de paire, dont 10 restent injouables tant que les deux éléments ne sont pas actifs sur la même cible. Un Élémentaliste ne joue donc jamais une seule spé : il en amorce deux au premier tour pour ouvrir la troisième carte. Détail élément par élément et paire par paire plus bas.

**Mécaniques signature** :
- Feu : plus de dégâts sur la durée, plus de cumul avec xvalue : dégâts de durée sur 5‑6 tours. Petits dégâts, plein de DoT (2 effets en moyenne)
- Givre : réduire les points d'action : faible chance de placer un effet de givre, mono-cible (0,33 effet en moyenne)
- Terre : réduire l'esquive, bloquer, réduire la portée : gros dégâts mono-cible (1 effet en moyenne)
- Air : réduire le déplacement des cibles : dégâts multicibles (0,67 effet en moyenne)
- Feu + Terre : les plus gros dégâts mono-cible ou quelques cibles
- Feu + Air : plein d'effets de brûlure et d'air
- Feu + Givre : mono-cible, transfert d'effets ?
- Terre + Air : plein de dégâts à plein de cibles accentués
- Terre + Givre : plein de dégâts à ceux qui ont des effets de givre en priorité
- Givre + Air : altération d'état (Brouillard)

**Boucle de jeu** : tours 1‑2 amorçage (poser les éléments, accumuler zèle) → tours 3+ détonation (combos verrouillés par prérequis).

**Faiblesses** :
- Le moins de points de vie (d4)
- Faible déplacement et esquive, doit rester à distance

### Constat des cartes (données)
- **43 cartes, la classe la plus fournie**, réparties sur N1‑N12 (4 par niveau jusqu'au N8) : coût moyen 7,8 PA, seulement 7 cartes à 1‑4 PA. Trois cartes de trop pour la cible de 30‑40 : il faut **continuer à en retirer**, pas en ajouter.
- **16 cartes de paire d'éléments** : 10 exigent deux éléments actifs sur la MÊME cible, 6 acceptent l'un ou l'autre (Brouillard, Givrefeu, Météore, Plastron Magique, Onde Glacée, Choc de Feu). S'y ajoutent 3 utilitaires « nécessite 1 élément parmi 3 », 4 ultimes mono-élément, et 2 cartes conditionnées au NOMBRE d'effets (Assassin du Néant, Missiles Magiques +).
- Zèle déséquilibré : **9 générateurs pour 25 consommateurs**, avec un zèle initial de 0,1 au N1 et 1,3 au N12 (3 objets de zèle dans son pool).
- Seulement 3 cartes à 1‑4 PA ; coût moyen 7,3 PA ; 6 cartes à 9 PA ou plus.
- Défense quasi absente : Plastron Magique, Repli du Souffle, Captation de Mana.

### Spécialisations — cartes par spé
| Spé | Cartes mono-élément | Ultime |
|---|---|---|
| **Feu** | Trait de Feu, Main Brûlante, Traînée Ardente, Attiser les Braises | Boule de Feu *(promue)* |
| **Givre** | Frappe de Givre, Stalactite Géante, Zéro Absolu, Mur de Givre | Éternité Glaciaire |
| **Terre** | Fracture Terrestre, Jet de Roche, Colosse de Pierre | Sépulcre de Pierre |
| **Air** | Tornade, Tourbillon, Bourrasque de Dégâts, Bourrasque de Répulsion | Cyclone |

Combos par paire d'éléments (à réduire à ~2 par paire) :

| Paire | Cartes |
|---|---|
| Feu + Givre | Givrefeu, Fusion des Extrêmes |
| Feu + Terre | Météore, Calcination, Cœur du Volcan |
| Feu + Air | Choc de Feu, Nuée Incandescente, Brasier Tournant |
| Terre + Air | Brouillard (air **ou** terre), Vent de Gravats, Convergence Tellurique |
| Terre + Givre | Permafrost, Plastron Magique (terre **ou** givre) |
| Givre + Air | Onde Glacée, Givre des Synapses, Nécrose Blanche |

Utilitaires / transverses : Magie des Éléments (innée), Captation de Mana, Incantation, Propagation des Dégâts, Assassin du Néant, Missiles Magiques +, Lecture des Courants, Repli du Souffle.

### Cartes retirées (élagage du 2026‑09‑20)
Quatre cartes supprimées du deck, des `lang/fr.json` et `lang/en.json` (**47 → 43 cartes, 94 → 86 exemplaires**) :
- **Sceau Thermique** (N13, ×2) — troisième carte de la paire Feu + Givre, ramenée à 2 comme les autres paires.
- **Chaleur Résiduelle** (N13, ×3) — quatrième carte du moule « nécessite 1 élément parmi 3 », doublon de Captation de Mana, et la seule des quatre à **coûter** du zèle dans une classe qui en manque.
- **Brasier Ardent** (N13, ×2) — 1d4 de dégâts : son seul métier réel était d'empiler de la brûlure, ce qu'Attiser les Braises fait pour 3 PA fixes, sans mana et en rendant 2 zèle ; comme amorce, Main Brûlante fait mieux pour moins cher, en piochant en plus.
- **Immolation Absolue** (N13, ×1) — l'ultime du Feu, exigeait **8 effets de brûlure** sur une seule cible et la défausse de 4 cartes pour 12 PA / 3 mana / 2 zèle.

**Boule de Feu est promue ultime du Feu** à la place d'Immolation Absolue, sur le gabarit de Cyclone (l'autre ultime de zone) : porte à **3 effets de brûlure sur une cible de la zone** — trois fois moins exigeante que les 8 d'Immolation, et atteignable dès un Trait de Feu ou un Attiser les Braises —, défausse de 3 cartes, **14 PA / 4 mana / 2 zèle** (la plus chère des quatre), dégâts portés de `2*@wis + 2d8` à `4*@wis + 3d10`, et **4 effets de brûlure** au lieu de 3. Les quatre éléments ont de nouveau leur ultime.

D'autres coupes ont été proposées et **non retenues pour l'instant** : Missiles Magiques + (aucun élément, 16 PA / 4 mana / 4 zèle), Assassin du Néant (scale sur DEX, jamais montée), Givrefeu (condition en OU, 9 PA au N2), Traînée Ardente (cône partant de sa propre case, pour un personnage à d4 de PV), Mur de Givre (mur permanent arbitré par le MJ), Incantation (banque de PA sans élément).

**Illustrations récupérées** : les deux images des cartes supprimées ont été renommées et réaffectées à des cartes qui étaient restées sur `in_progress.png` —
- `burningtrail.png` → `burning_trail.png`, donnée à **Traînée Ardente** (l'image montre un cône de feu projeté depuis les mains du lanceur : c'est exactement sa zone) ;
- `AbsoluteImmolation.png` → `whirling_blaze.png`, donnée à **Brasier Tournant** (l'image est une tornade de feu au-dessus d'un sol en fusion : c'est le brasier qui se rattise seul et frappe tout le champ de bataille). Cœur du Volcan était l'autre candidate, mais l'image n'a rien de localisé sous une cible unique.

### Redondances à trancher
- Paires à 3 cartes (Feu+Terre, Feu+Air, Givre+Air) : garder 2 par paire. *(Feu+Givre : fait)*
- Utilitaires N13 qui se recoupent : Lecture des Courants (pioche) / Captation de Mana (mana). *(Chaleur Résiduelle retirée)*
- Ultimes (Boule de Feu, Éternité, Sépulcre, Cyclone) : bons candidats pour les N10‑N12, un par élément.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**
- TROP DE SORTS générés : à réduire ?

---

## Trapper

> « Classe à distance spécialisée dans les attaques critiques, accompagnée de son familier, ou qui peut poser des pièges redoutables. »

**Identité dnd5e** : d8, DEX + SAG. CHA est le levier du build « maître des bêtes » (stats des minions, 7 cartes), alors que le Trapper démarre à CHA 6 (-2). INT reste marginal.

**Stats FQ** : **le plus de points d'action du jeu** (12,2 au N1, 23,5 au N12) et **le meilleur critique** (2,4 / 6,2, les 10 objets) : le sniper transforme les deux en portée et en dégâts. **Aucune esquive, jamais** — son pool n'en contient aucune, la classe doit rester loin. **Main quasi nulle** (0,1 au N1, 0,8 au N12, 2 objets) : il ne commence pratiquement jamais un combat avec une carte, tout passe par la pioche.

**Rôle** : archer/DPS très longue portée, sous-thèmes invocateur (Louve N1, Ours N7) et contrôleur de terrain (pièges, entraves).

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Sniper (dps critique) | Transforme son score de critique en ressource et tire de très loin, d'autant plus fort qu'il reste immobile et seul | 14 |
| Pièges (contrôle) | Pose des réactifs qui se déclenchent hors de son tour quand l'ennemi approche, entravent et empoisonnent | 12 |
| Maître des bêtes (invocateur) | Joue à travers son familier : l'améliore avant de l'invoquer, le soigne pour le garder en vie, ou le saigne pour frapper lui-même | 13 |

**Mécaniques signature** :
- **Le critique comme ressource** : buffs (Tireur d'Élite, Ajustage de Tir inné), conversion (Retrouver des Forces vend du critique contre du mana), et surtout les **pièges dont les dégâts scalent sur le score de critique** (`2d(critique)`) tout en étant incritiquables.
- **Portée extrême** : `maxReach` formulés (`10+@dex`, `7+@dex`), Tir Supersonique à portée illimitée ; **coût en action = distance** (`xvalue: reach`) sur Tir Précis et Supersonique.
- **Spécialiste du réactif** (9 réactives, record du jeu) : Piège à Pointes / Empoisonné — 0 action, 1 mana, déclenchés par `targetsWithinReach` quand un ennemi approche.
- **Auto-handicap comme ressource** : Embuscade (vide tous les PA → +@wis dégâts cumulable), Tir Enraciné (convertit le déplacement en dégâts + auto-immobilisation).
- **Bêtes** : Louve Apprivoisée, Ours Enragé, Faucon de Chasse, Tortue Géante, jouant après le tour du Trapper, scaling `@cha`. **Lien du Fauve** (lot du 2026‑09‑20) est la seule carte de la classe qui rende des points de vie — à une bête, jamais au Trapper.
- Zones distance (rectangle 3×3, ligne, cercle), entraves (Traquenard, repoussée du Tir Supersonique), DoT poison.

**Boucle de jeu** : préparer le tir (buffs de critique, embuscade), sécuriser la zone (pièges), déléguer le contact aux bêtes, décharger à longue portée.

**Faiblesses** :
- Pas d'esquive
- Pas d'attaque corps à corps
- **Aucun soin ni PV temporaire sur lui-même** : avec le Maître d'Armes, la seule classe dont le deck ne protège jamais ses propres points de vie (Lien du Fauve ne soigne que la bête).

### Constat des cartes (données)
- **39 cartes réparties sur N1‑N12** : le Sniper occupe seul les N1‑N3, les pièges ouvrent au N4 et les bêtes au N6. Coût moyen 7,9 PA — le plus élevé du jeu — et seulement 5 cartes à 1‑4 PA, ce qui colle à ses 12,2 PA et à sa carte unique par tour.
- 8 générateurs de zèle pour 18 consommateurs (7/18 avant le lot du 2026‑09‑20) ; 72 exemplaires.
- **Asymétrie avec l'autre invocateur** : la Sorcière entretient son armée (Bouclier d'Os, Ossature Renforcée, Canalisation des Ombres, seconde face soignante de Couronne d'Ossements), le Trapper n'avait rien — ses bêtes coûtent 8 à 16 PA et mouraient sans recours. *Lien du Fauve* ouvre ce versant.
- Les trois spécialisations sont déjà bien identifiables dans les cartes.

### Spécialisations — cartes par spé
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Sniper / critique** | Tir Précis, Tir Précis II, Tireur d'Élite, Ajustage de Tir, Tir Supersonique, Tir Enraciné, Tir Transperçant, Embuscade, Retrouver des Forces, Étude du Point Faible, Chasseur Solitaire, Double Flèche, Pluie de Flèches, Tir Explosif | Finisher N10‑12 |
| **Pièges** (réactifs, poison) | Piège à Pointes, Piège Empoisonné, Piège en Chaîne, Collet Mortel, Piège d'Affût, Piège à Fosse, Hallali, Réserve de Pièges, Traquenard, Tir Réflexe, Tir Empoisonné, Mutation Virale | Carte peu chère de pose |
| **Maître des bêtes** | Louve Apprivoisée, Ours Enragé, Faucon de Chasse, Tortue Géante, Sifflet du Chasseur, Meute, Dressage, Crocs Affûtés, Instinct de Chasse, Ordre d'Attaquer, Saignée du Fauve, Offrande Sauvage, **Lien du Fauve** | Caractéristique à trancher (CHA -2) |

### Carte du lot 2026‑09‑20
- **Lien du Fauve** (N15, ×2) — 4 PA, aucun mana, **+1 zèle**, portée 1‑10, 1 cible. Rend `2 + 2*@wis` PV à une de vos bêtes ; le garde-fou `targetsAreMinionType("beast")` refuse toute autre cible. Elle répond à deux manques d'un coup : la spé bêtes n'avait **aucun moyen d'entretenir** ce qu'elle paie 8 à 16 PA, et la classe manquait de **petites cartes qui rendent du zèle** (7 générateurs pour 18 consommateurs). Écrite en **SAG** et non en CHA, comme la Paume Curative du Moine l'a été en DEX : c'est la carac primaire, la seule que les ASI montent (+2 → +5), tandis que le CHA du Trapper reste à −2. **Illustration à faire** (sur `in_progress.png`).

### Redondances à trancher
- Dressage / Crocs Affûtés / Instinct de Chasse : même structure (bonus aux prochaines bêtes) → une carte à 3 choix ?
- Tir Précis / Tir Précis II : rang 2 à placer au bon niveau.
- Poison : Tir Empoisonné / Piège Empoisonné.

### Incohérences relevées
- ~~Tir Précis II au niveau 21.~~ → fait : redescendu au N13 avec la spé Sniper, et retiré de `KNOWN_ISSUES`.
- Pluie de Flèches « incritiquable » sans `bonusCrit`.
- Ours Enragé (16 PA) et Tireur d'Élite (10 PA pour un buff) très chers au regard des 12,2 PA du N1.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**

---

## Sorcière

> « Un mage puissant. Sa force réside dans le nombre de squelettes qu'elle ranime pour détruire ses adversaires. »

**Identité dnd5e** : d6, INT + CHA. **SAG est plus utilisée que INT dans les cartes** (9 contre 3 : Afflux, Mauvais Œil, Sortilège d'Ombre, Explosion d'Ombre…) : écart fiche/deck à trancher.

**Stats FQ** : **déplacement figé à 6 cases pour toute la campagne** — son pool n'a aucun objet de déplacement, elle reste derrière son armée. Bon mana (5,8 au N1, 12,5 au N12, 18 objets) et bonne main (2,2 / 4,5), CA 8, 19 PV. Coûts d'action réduits par les caracs (`−8+@cha`, `−7+@wis`) : les caracs rendent le kit moins cher.

**Rôle** : invocatrice / commandante d'armée à montée en puissance exponentielle — faible au premier tour, écrasante en fin de combat.

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Armée (invocateur) | Invoque de la piétaille en attaquant, puis buffe la masse : plus il y a de squelettes en jeu, plus elle est forte | 17 |
| Colosse (invocateur solo) | Passe son armée au charnier en rituels pour faire naître un Squelette Géant de plus en plus gros | 9 |
| Charnier (dps) | Sacrifie squelettes et défausse pour lancer elle-même des sorts directs et récupérer ses cartes | 12 |

**Mécaniques signature** :
- **Armée** : quasiment chaque carte offensive invoque un squelette en plus de son effet (Trait D'Ombre-Verte ×9 en deck). Paliers : Skeleton lvl 1‑2 → Giant Skeleton → Skeleton Sorcerer (capstone N7, mini-nécromancien autonome). Piétaille plafonnée à 6 ; le Sorcier en fait partie.
- **Le squelette géant** : a son propre TYPE de sbire (`giantSkeleton`), donc son propre plafond de 1 hors des 6 de la piétaille, et il est le seul bénéficiaire des cartes de rituel. Mais il reste de FAMILLE `skeleton` (`CardFqSystem.MINION_FAMILY`) : les sorts qui dopent « tous vos squelettes » le prennent, et les comptages d'armée le comptent. Type = emplacement d'invocation, famille = genre de créature — c'est la seule créature où les deux divergent.
- **Rituels d'invocation** : des cartes qui ne font RIEN sur le champ de bataille — elles alimentent `system.fq.minions.giantSkeleton.{hp,damage,movement}`, compteurs que `Minion.statBonus` relit à l'invocation SUIVANTE du Squelette Géant. Faible coût (Éclats d'os, Crocs d'ivoire, Talons d'ossements : 1‑2 points de sacrifice), moyen (Onction de moelle : 2‑3), élevé (Couronne d'ossements, Sceptre de l'ossuaire, Marche funèbre : 3‑4, avec une seconde face jouable sur le Géant DÉJÀ en jeu ; Hécatombe d'ossements : 5‑8, soit une armée entière passée au charnier). Ces bonus tombent avec les effets FQ à la fin du combat.
- **Le charnier reste manuel** : aucune carte ne détruit de sbire (hors Déplacement Morbide qui l'exige). Le joueur sacrifie ses squelettes au bouton du HUD de jeton, ce qui alimente `fq.minions.sacrificedMinion` — remis à zéro au début de chacun de ses tours. Réduire son armée pour dépenser gros est donc un choix de tour, jamais un effet de carte.
- **Score de sacrifice** (`fq.minions.sacrificedMinion`) : détruire ses squelettes alimente un compteur-ressource consommé par Ostéologie (invoque un squelette de niveau = sacrifices, cap 4), Afflux De Vie/Mana, Déplacement Morbide, Récolte Macabre et les rituels.
- **Comptage de l'armée** (`SCRIPT:` sur les tokens « Skeleton ») : Afflux D'Agilité (esquive), Afflux De Pouvoir (actions), Rituel Du Sang (zèle) — plus l'armée est grande, plus la sorcière est forte.
- **`targetType: Skeletons`** : buffs de masse dédiés (Bouclier D'Os, Canalisation Des Ombres — invulnérabilité 1 round —, Forme d'Ombre, Déplacement Morbide, Ossature Renforcée, Fureur des Morts, Apothéose Macabre).
- Défausse en coût d'appoint (Sortilège d'Ombre, Rituel Du Sang) et en carburant (Offrande de Cendres : X cartes défaussées → dégâts) — la ressource centrale reste le **sacrifice**.

**Boucle de jeu** : invoquer en attaquant → sacrifier → recycler en mana/PV/actions/zèle → réinvoquer plus gros. Aucune défense personnelle : l'armée est le rempart.

**Faiblesses** :
- ~~Vite à court de mana~~ → corrigé par le rééquilibrage des stats de départ : 5,8 mana au N1 (contre 2,5 avant) et 18 objets de mana dans son pool. Reste le coût en action : Trait d'Ombre-Verte (×9) coûte 7 PA pour 10,2 PA disponibles au N1.
- **Déplacement figé à 6 cases** sur toute la campagne : aucun objet de déplacement dans son pool.
- Peu de points de vie

### Constat des cartes (données)
- **39 cartes réparties sur N1‑N12**, le Colosse n'ouvrant qu'au N6 : coût moyen 6,8 PA et 5 cartes à 1‑4 PA (elle n'en avait aucune avant la passe). *Trait d'Ombre-Verte* est passé de 9 à 3 exemplaires, doublé par un *Trait d'Ombre-Verte Mineur* (×5) qui alimente le charnier au lieu de l'armée.
- **Aucune carte à 1‑4 PA** parmi les débloquables ; coût moyen 8,1 PA (le plus élevé) pour 8,5 PA au N1 : **une carte par tour au N1**.
- Seulement 2 cartes distinctes au N1 (Nécromancie, Trait d'Ombre-Verte ×9).
- 4 générateurs de zèle pour 11 consommateurs.

### Spécialisations — cartes par spé
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Armée** (piétaille) | Nécromancie, Trait d'Ombre-Verte, Croix de Squelettes, Carré de Squelettes, Levée d'Ossements, Fosse Commune, Bouclier d'Os, Canalisation des Ombres, Forme d'Ombre, Ossature Renforcée, Fureur des Morts, Apothéose Macabre, Déplacement Morbide, Afflux d'Agilité, Afflux de Pouvoir, Rituel du Sang, Sorcier Squelette | Invocation peu chère |
| **Colosse** (squelette géant) | Squelette Géant, Couronne d'Ossements, Sceptre de l'Ossuaire, Marche Funèbre, Éclats d'Os, Crocs d'Ivoire, Talons d'Ossements, Onction de Moelle, Hécatombe d'Ossements | Version haut niveau du Géant |
| **Charnier** (sacrifice, défausse, sorts directs) | Ostéologie, Afflux de Vie, Afflux de Mana, Sortilège d'Ombre, Mauvais Œil, Explosion d'Ombre, Frappe Arcanique, Offrande de Cendres, Rappel d'Outre-Tombe, Pacte d'Ossements, Récolte Macabre, Exhumation | Défense personnelle ? |

### Redondances à trancher
- Récupération de défausse : Rappel d'Outre-Tombe / Pacte d'Ossements / Récolte Macabre / Exhumation (4 cartes).
- Rituels du Géant : 8 cartes sur 3 paliers × 3 stats → garder un palier par stat, ou fusionner en cartes à choix.
- Ossature Renforcée + Fureur des Morts = Apothéose Macabre.
- Croix de Squelettes / Carré de Squelettes.

### Incohérences relevées
- `ItemChoice` vide dans `classes-fq8/witch.json`.
- ~~Trait d'Ombre-Verte ×9~~ → ×3, avec une version mineure ×5 qui alimente le score de sacrifice.
- Sorcier Squelette (15 PA, 4 mana, 4 zèle) et Apothéose Macabre (14 PA) hors de portée avant le N6‑N7.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**
- Une des cartes du squelette géant permet d'aller chercher la carte dans le deck en deuxième choix ?

---

## Maître d'Armes

> « Expert de tout l'arsenal : ses cartes frappent avec l'arme du moment, au corps à corps comme à distance. »

**Identité dnd5e** : d10, FOR + DEX (3e : CHA). DEX domine (tirs, armes de jet), FOR sur les frappes de mêlée.

**Stats FQ** : le profil le plus étalé du jeu — un point dans presque tout au départ (+3 action, +2 déplacement, +1 mana, critique, esquive, main et pioche), et un pool sans trou : 8 objets de critique, 4 d'esquive, de zèle, de déplacement et de main, 16 de mana.

**Rôle** : DPS martial polyvalent sur deux rails parallèles — mêlée (`@wpnM`) et distance (`@wpnR`) — plus un rail d'armes de jet.

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Mêlée (dps contact) | Frappe avec l'arme de mêlée équipée, en mono-cible ou sur toutes les cases autour de lui | 12 |
| Distance (dps distance) | Le même kit reporté sur l'arme à distance équipée : tirs lents, lourds, et une zone | 8 |
| Armes de jet (dps de ressource) | Fabrique des couteaux gratuits et les gonfle sans limite, plus cinq armes de jet uniques | 14 |
| *(transverse)* | Instructeur : porte les dégâts d'arme ou l'esquive d'un allié à un plancher fixe | 5 |

**Mécaniques signature** :
- **Coût en mana** : la plupart des attaques coûtent 1 mana (Attaque Simple, Tir Simple, Fente Précise, Visée Posée, Frappe Double…), alors que la classe n'a que 3,5 mana au N1.
- **Buffs d'arme fenêtrés** : Huile d'affûtage (mêlée), Prise équilibrée (distance), Maîtrise des armes (les deux, 3 rounds) — tour de setup puis burst.
- **Carte qui s'améliore en carte coûtant de plus en plus cher jusqu'à faire de gros dégâts** (Forges spectrale, éthérée, astrale, arcanique)
- **Carte qui duplique une autre carte en main** (Réplique parfaite, le seul à pouvoir faire ça)
- **Tous les buffs/malus durent 1 tour**
- **Moteur couteaux de lancer** : Ceinture de couteaux (−3 PA, −1 zèle) fabrique 3 cartes *Couteau de lancer* **gratuites** (jusqu'à ×24), boostées par Affûtage des couteaux (`@bonus.knife`, cumulable), Sang-froid, Momentum, Lancer lesté, Prise inversée, Volée de couteaux.
- **Armes de jet uniques** (5 innées, une fois par combat, malus de PA au tour suivant) : Javelot, Plumbata, Chakram, Filet de rétiaire, Kpinga ; Choix de l'Arsenal en fait revenir une.
- **Soutien (Charisme)** : Leçons d'estoc / de visée (dégâts d'arme d'un allié portés à 5 + CHA, plus fort pour les faibles jets), Leçon d'esquive (esquive portée à 7) + réduit l'esquive à 0 ?
- Le seul à avoir des sorts faisant des dégâts d'armes touchant plusieurs cibles (Attaque Latérale, Diagonale, En Cercle, Pluie d'acier) — à vérifier : Illusionniste (Volée de shuriken, sans arme), Guerrier Runique (Frappe vindicative) et Gardien (Tourbillon de Lame, `@wpnM`).

**Boucle de jeu** : réunir les bonnes cartes pour faire de gros dégâts au corps à corps OU à distance OU monter les couteaux de lancer OU …

**Faiblesses** :
- Pas de heal personnel
- Pas d'amélioration personnelle d'esquive par les cartes (⚠️ Leçon d'esquive a une portée minimale de 0 : elle peut se cibler soi-même)

### Constat des cartes (données)
- **39 cartes réparties sur N1‑N12** : les deux rails d'arme au N1, les armes de jet au N3, l'instructeur au N5, et les cinq armes innées tous les deux niveaux (N3, N5, N7, N9, N11). Coût moyen 5,1 PA et **18 cartes à 1‑4 PA, la plus grande densité du jeu**.
- 12 cartes générées (couteaux, étapes des forges).
- 18 cartes à 1‑4 PA : la plus grande densité de cartes peu chères. Zèle 14 générateurs / 16 consommateurs (14 / 14 avant le lot du 2026‑09‑20, les deux finishers en consommant 2 chacun) ; 79 exemplaires.
- Déjà dans la cible des 30‑40 cartes : la passe consiste surtout à **élaguer** et à compléter N11‑N12 — les deux finishers du lot du 2026‑09‑20 couvrent ce second point.

### Spécialisations — cartes par spé
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Mêlée** | Attaque Simple, Fente Précise, Frappe Double, Frappe Triple, Huile d'Affûtage, Riposte, Attaque Latérale, Attaque Diagonale, Attaque en Cercle, Forge Spectrale, Forge Astrale, Reprise de Garde | |
| **Distance** | Tir Simple, Visée Posée, Tir Appuyé, Prise Équilibrée, Riposte à Distance, Pluie d'Acier, Forge Éthérée, Forge Arcanique | |
| **Armes de jet** | Ceinture de Couteaux, Affûtage des Couteaux, Fourreau Caché, Sang-froid, Volée de Couteaux, Momentum, Lancer Lesté, Prise Inversée, Javelot, Plumbata, Chakram, Filet de Rétiaire, Kpinga, Choix de l'Arsenal | |
| **Instructeur** (soutien CHA) | Leçon d'Esquive, Leçon d'Estoc, Leçon de Visée, Maîtrise des Armes, Réplique Parfaite | Cartes N7+ |

### Deux finishers abandonnés (2026‑09‑21)
*Coup de Faux* (mêlée) et *Salve Groupée* (distance) avaient été annoncées dans le lot du 2026‑09‑20 avec leurs clés de traduction FR/EN et leurs messages d'erreur, mais **aucune carte ne les a jamais portées** : deux tests restaient rouges sur des placeholders de description sans carte. Décision du 2026‑09‑21 : **les traductions ont été supprimées** plutôt que les cartes écrites. La classe reste à 39 cartes, sans finisher de mêlée ni de distance au-delà de *Frappe triple* (N12) et *Pluie d'acier* (N11). Les conditions `targetsAdjacentPair` et `targetsWithinSquare` restent dans le moteur, testées, sans carte qui les utilise.

### Redondances à trancher
- Attaque Simple / Fente Précise et Tir Simple / Visée Posée (même dégâts, +1 PA pour un bonus au toucher).
- Six buffs de couteaux sur le même axe : Sang-froid, Momentum, Lancer Lesté, Prise Inversée, Affûtage, Volée.
- Quatre chaînes de forge (2 mêlée, 2 distance).

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**

---

## Illusionniste

> « Un combattant et soutien/healeur qui ne cesse d'augmenter sa portée au cours du combat. »

**Identité dnd5e** : d6, DEX + CHA. Classe la plus multi-carac du jeu : SAG (potions, mana), FOR/`@wpnM` (frappes), CON (Peste Noire). **17 jets de toucher/sauvegarde utilisent INT**, qui n'est pas primaire (INT 10) : à corriger ou à assumer.

**Stats FQ** : **aucun point d'action de départ**, ce qui en fait la classe qui en a le moins (8,3 au N1, 19,5 au N12) — ses cartes sont aussi les moins chères du jeu. En échange, **le meilleur couple critique + esquive de départ** (+2 et +2, soit 2,1 et 2,2 au N1) et une bonne mobilité (7,3 / 9,5). Critique et zèle bridés à 3 objets dans le pool. La **portée n'est achetable nulle part** — c'est précisément sa mécanique : elle se construit en combat.

**Rôle** :
- Dégâts corps à corps (bonus de portée)
- Soutien hybride (bonus de portée), sorts qui marchent avec toutes les classes
- Healeur à réaction et spé HOT (derniers dégâts)

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Lame d'allonge (dps) | Empile du bonus de portée avec des cartes bon marché, puis le convertit en dégâts | 13 |
| Barde (soutien, **healeur**) | Buffe l'équipe en continu — critique, esquive, dégâts, potions, invulnérabilité — et la maintient debout avec des **soins sur la durée** (HOT) plutôt qu'avec des gros soins d'urgence | 12 |
| Chronomancien (contrôle et soins) | Manipule l'espace, le temps et les effets : renvoie les dégâts subis, déplace les figurines, copie les effets | 14 |

**Mécaniques signature** :
- **Bonus de portée**
- **Cartes de manipulation d'espace** : peut bouger des cibles autres que lui (Passage éthéré, Cage de Rappel, Illusion de Maître de Jeu, Illusion Infranchissable)
- **Cartes de manipulation temporelle** : soins des derniers dégâts subis, soins HOT (Frappe Temporelle, Miroir, Bombe à Retardement, Piège de Retour dans le Temps, Soins Expansifs, Rémission Illusoire, Écho de Convalescence)
- **La portée comme ressource cumulative** (`fq.bonus.range`) : gains fiables (Allonge magique, Fouet Enchanté, Salto Arrière), aléatoires (Rapière Enchantée 1d2), temporaires (Potion d'allonge). Puis des cartes la dépensent ou la scalent : dégâts (Frappe Illusoire, Volée de shuriken, Prise En Traître), DoT (Nuage de dague), conversion (Illusion De Caractéristiques : portée → critique/soins/mana).
- **Trois `xvalue` distincts** : bonus de portée, distance réelle à la cible (Orbe Grandissante `XXXd6`, Passage éthéré, Bombe à Retardement), nombre de cibles (Succion De Mana).
- **Soutien d'équipe réel** : Inspiration Chantée (+crit, rejouable @cha fois), Danse Enfiévrée (+esquive), Inspiration Effrénée, Apothicaire I/II (potions), Immatérialité (invulnérabilité 1 tour).
- **Soins sur la durée (HOT)** : le Barde ne soigne pas d'un coup, il **installe la guérison**. Le patron est toujours le même — aucun soin immédiat, un effet qui pose `system.fq.bonus.dot` en **négatif** (un DoT retourné) pour quelques rounds : Soins Expansifs (`-(6+2*@wis)` sur 1 round), Rémission Illusoire (`-(ceil(@cha/2))` sur 3 rounds), Écho de Convalescence (`-(1 + portée)` sur 2 rounds, jusqu'à 3 cibles). C'est le pendant exact de Nuage de Dague, le DoT de la classe, qui utilise le même champ en positif.
- **Manipulation d'effets** : Peste Noire (duplique tous les effets FQ de la cible), Contagion (échange les effets de deux cibles), Images Miroir (esquive +@dex jusqu'au premier coup).
- **Contrôle** : Regard Envoûtant (charme), Berceuse (sommeil).
- Conversions : Vases communicants (mana ↔ 4 actions), zèle généré par 7 cartes et dépensé par 19.

**Boucle de jeu** : empiler la portée avec des cartes bon marché qui rendent du zèle → encaisser les payoffs → soutenir l'équipe en continu.

**Problème de caractérisation**
- Soutien un peu trop similaire au maître d'armes
- ~~Attaque latérale et en cercle à déplacer vers le maître d'armes~~ → fait (Attaque Latérale, Diagonale et En Cercle sont chez le Maître d'Armes)
- Bien différencier les soins des autres soigneurs : Moine (corps à corps) et Mage Blanc (soins directs et bouclier)

**Faiblesses** :
- Moins de dégâts ?
- Le moins de PA au N1

### Constat des cartes (données)
- **42 cartes réparties sur N1‑N12**, le Chronomancien ouvrant au N5 : coût moyen 5,2 PA et 13 cartes à 1‑4 PA. Deux cartes de trop pour la cible de 30‑40 depuis le lot du 2026‑09‑21 (*Estoc perçant*, *Refrain Vivifiant*, *Crescendo*).
- 12 cartes à 1‑4 PA ; coût moyen 4,8 PA, le plus bas du jeu — cohérent avec ses 8,3 PA au N1, le plus bas aussi.
- 7 générateurs de zèle pour 19 consommateurs.
- *(résolu par le lot du 2026‑09‑20)* Magie des Arcanes est rattachée au dps (Lame d'allonge), **Magie Verte** au soutien (Barde) : elles ne sont plus « à reclasser ». *Magie Blanche* a été renommée **Magie Verte** le 2026‑09‑21 (clé `FQCARDTITLE.GreenMagic`, image `GreenMagic.png`) ; son `_id` technique `illWhiteMagic001` est conservé.

### Cartes du lot 2026‑09‑20
Le Barde devient explicitement le **healeur HOT** de la classe. Deux cartes ajoutées, toutes deux sans soin immédiat, et les deux cartes N12 rangées dans une spé.
- **Rémission Illusoire** (N8, ×2) — 4 PA, 1 mana, **+1 zèle**, portée 0‑2. La cible récupère `ceil(@cha/2)` PV au début de chacun de ses tours pendant 3 tours. Petite carte, générateur de zèle : la classe en manquait (6 générateurs pour 18 consommateurs avant le lot). **Illustration à faire** (sur `in_progress.png`).
- **Écho de Convalescence** (N9, ×1) — 6 PA, 1 mana, 1 zèle, jusqu'à 3 cibles à 4 cases. Chacune récupère `1 + bonus de portée` PV par tour pendant 2 tours. Elle branche le soin sur la **ressource signature** de la classe : nulle au premier tour, forte une fois la portée empilée. **Illustration à faire**.
- ⚠️ Les deux sont écrites en **@cha**, pas en `@wis` : la SAG de l'Illusionniste reste plate à 10 (+0) et n'est jamais montée, alors que le CHA passe de +2 à +5. Les soins historiques (Soins Expansifs, potions de vie de l'Apothicaire) scalent encore sur `@wis` et rendent donc moins que leur libellé ne le laisse croire — même piège que le `@wis` du Moine, à reprendre.

### Spécialisations — cartes par spé
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Lame d'allonge** (mêlée qui scale sur la portée) | Fouet Enchanté, Frappe avec Salto Arrière, Frappe Illusoire, Allonge Magique, Rapière Enchantée, Prise en Traître, Volée de Shuriken, Nuage de Dague, Orbe Grandissante, Shuriken, Shuriken Empoisonné, Illusion de Caractéristiques, Magie des Arcanes, **Estoc Perçant** | Finisher N8‑12 |
| **Barde** (soutien, healeur HOT) | Inspiration Chantée, Danse Enfiévrée, Inspiration Effrénée, Apothicaire I, Apothicaire II, Immatérialité, Vases Communicants, Succion de Mana, Soins Expansifs, Magie Verte, Rémission Illusoire, Écho de Convalescence, **Refrain Vivifiant**, **Crescendo** | Sorts d'assistance (voir TODO) |
| **Chronomancien / manipulateur** | Passage vers le Plan Éthéré, Peste Noire, Contagion, Frappe Temporelle, Miroir, Distorsion, Bombe à Retardement, Cage de Rappel, Illusion de Maître de Jeu, Piège de Retour dans le Temps, Illusion Infranchissable, Regard Envoûtant, Berceuse, Images Miroir | Cartes N8‑N11 |

### Redondances à trancher
- Peste Noire / Contagion.
- Apothicaire I / II (3 potions sur 5 identiques).
- Inspiration Chantée / Danse Enfiévrée (même gabarit).
- Placement : Passage Éthéré / Illusion de Maître de Jeu / Cage de Rappel.

### Incohérences relevées
- Jets sur INT (non primaire).
- Orbe Grandissante coûte 14 PA : hors de portée avant le N6‑N7 en moyenne.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**
- Reprendre en `@cha` les soins historiques restés en `@wis` (Soins Expansifs, potion de vie de l'Apothicaire I et II) : SAG 10 plate, jamais montée.
- Si vous faites un critique, vous pouvez augmenter votre bonus de portée de 1 ?
- Si vous faites une esquive, vous pouvez augmenter votre bonus de portée de 1 ?
- Sort d'assistance : (2 de portée) (coût : 1 point de zèle ou 1 carte défaussée) (doublon avec le moine, ou seulement sur les alliés alors ça va ?)
  - Peut agripper quelqu'un pour le ramener sur une case adjacente, lui rend 1d4 points de vie.
  - Peut pousser quelqu'un de X cases dans un sens (X étant le bonus de portée), lui rend 1d4 points de vie.
  - Peut se téléporter vers une case adjacente d'un allié (2 de portée), lui rend 1d4 points de vie.

---

## Guerrier Runique

> « DeckBuilder : entre en combat avec très peu de cartes ; ses runes en génèrent de nouvelles au fil de l'affrontement, rendant son deck de plus en plus puissant. »

*Hors périmètre de la passe 30‑40 cartes (structure particulière).*

**Identité dnd5e** : d10, FOR + INT (3e : CON) — frontliner qui frappe au corps à corps (`@wpnM`).

**Stats FQ prioritaires** : **la meilleure pioche et la 2e meilleure main du jeu** (2,1 / 3,2 de pioche, les 3 objets de pioche gardés ; 2,2 / 4,5 de main) — c'est ce qui alimente son deck-building en combat. Un point de critique et d'esquive au départ, mais peu montables (4 et 7 objets) ; PA modestes (9,2 au N1) et mana bridé à 12 objets.

**Rôle** : moteur / late-game carry. Départ délibérément faible (deck de base : 15 cartes distinctes, 16 exemplaires), montée en puissance par deck-building en cours de combat.

**Spécialisations proposées (à valider)** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Rouge (dps) | Dégâts et critique, améliorés par la Force ; ultime : immortel à 1 PV | 43 (4 frappes runiques + 39 runes) |
| Jaune (tempo) | Actions et déplacement, améliorés par l'Intelligence ; ultime : 35 d'action, réduits par les runes jaunes déjà jouées | 43 (4 frappes runiques + 39 runes) |
| Bleu (tank) | Soins personnels, esquive et regain de mana, améliorés par la Constitution ; ultime : régénération par rune bleue jouée | 43 (4 frappes runiques + 39 runes) |
| *(transverse)* | Rune du Hasard, Marche du Nord (seule carte à dissiper la fatigue), Appel des Runes | 3 |

Soit **132 cartes distinctes** : les 15 du deck de base et les 39 runes de chacune des 3 couleurs (N1 à N12).

**Mécaniques signature** :
- **Seules les frappes runiques qui génèrent des runes consomment du mana**
- **Gravure = deck-building en combat** : les cartes de gravure proposent N runes d'une couleur au choix
- Seule classe à pouvoir diminuer la fatigue (Marche du Nord) (la fatigue augmente et provoque des dégâts quand on repioche)
- **Identité des trois couleurs** (39 cartes par couleur, N1 à N12) :
  - **Rouge** = dégâts ET critique ; abilité améliorante : Force
    - Ulti : immortel avec 1 PV, dégâts augmentés par les runes rouges, coûtant 8 de zèle
  - **Jaune** = actions ET déplacement ; abilité améliorante : Intelligence
    - Ulti : coûtant 35 d'action, réduit par le nombre de runes jaunes jouées
  - **Bleu** = tank : soins personnels et esquive + regain de mana ; abilité améliorante : Constitution
    - Ulti : regagne X points de vie par tour, X étant le nombre de runes bleues jouées, coûtant 6 de mana

**Faiblesses** :
- Pas de sort de dégâts à distance (hors Rune de mort, portée 2)
- Pas de sort multi-cible (très peu d'exceptions)
- Pas de réactif
- Aucune pioche hormis des pioches en défaussant sur 3 runes jaunes

**Questionnement et TODO :**

---
