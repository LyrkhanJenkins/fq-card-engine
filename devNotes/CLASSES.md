# Caractérisation des classes

Document de référence design : ce qui définit chaque classe (identité dnd5e, stats FQ, rôle, mécaniques signature, spécialisations, contraintes), établi à partir des données réelles (`packs/_source/classes-fq8`, `decks-pattern-fq8`, `classes-stats-fq8`, `starter-heroes`, `lang/fr.json`) et du code (`src/domain`, `src/hook`).
Chiffres mis à jour le 2026-09-16 (après la migration dnd5e 6.0.0).

---

> ⚠️ **Document de travail temporaire.** Une fois toutes les étapes du TODO réalisées, on retire tout ce qui relève des questionnements et des TODO : ce fichier devient une **aide pour les joueurs** qui décrit chaque classe avec ses points forts et ses points faibles (voir « Fin de chantier » en bas du TODO).

## TODO — Passe de rééquilibrage (30 à 40 cartes par classe, hors Guerrier Runique)

### Outils de la passe (temporaires)
Deux outils ont été ajoutés pour cette passe. **Ils seront supprimés à la fin du rééquilibrage** (voir « Fin de chantier »).

| Outil | Commande | Rôle |
|---|---|---|
| Rapport des classes (`utils/class-report.mjs`) | `npm run report:classes` | Affiche en markdown les tableaux de ce fichier : stats moyennes, vue d'ensemble des cartes, exemplaires, caracs utilisées, rendement des cartes (dégâts/soins par PA). |
| | `npm run report:classes -- --out devNotes/rapport-classes.md` | Écrit le même rapport dans un fichier, pour copier les tableaux dans CLASSES.md. |
| | `npm run report:classes -- --check` | Contrôle les cibles de la passe : 30‑40 cartes distinctes N0‑N12, aucune carte hors N0‑N12, et exemplaires par niveau une fois la cible fixée (`TARGETS` en tête du script). Code de sortie 1 s'il reste des écarts. |
| Test d'intégrité (`tests/decks/class-deck-integrity.test.js`) | `npx vitest run tests/decks` | Tests des decks : intégrité (niveau, exemplaires, classe, image avec la bonne casse, portée, pools de stats), clés de traduction (`deck-references`), clés de paquet (`pack-keys`)… Les anomalies déjà connues sont listées dans `KNOWN_ISSUES` : **retirer chaque entrée corrigée**, le test l'exige. |
| Suite complète | `npm test` | Toute la suite (~2 min), à lancer en fin d'étape. |

### Ordre conseillé : une classe pilote d'abord
- [ ] Faire les étapes 1 à 6 en entier sur **la Sorcière** avant les autres classes : c'est la plus contrainte (budget de départ 3, aucune carte à moins de 5 PA, 2,5 mana au N1), donc celle qui éprouve le mieux la grille de coûts, la cible d'exemplaires et le pool de stats réduit.
- [ ] Ajuster les règles (grille, cibles) d'après la pilote, puis dérouler les étapes pour les 7 autres classes.

### Étape 1 — Première passe des cartes : niveaux, cartes manquantes, 30 à 40 cartes par classe
- [ ] ▶️ Avant de commencer : `npm run report:classes -- --check` pour voir, par classe, le nombre de cartes et la liste des cartes hors N0‑N12.
- [ ] Remplir à la main, pour chaque classe, les blocs **Spécificités / Spécialisations / Contraintes** (section « À définir à la main »), en s'appuyant sur les tableaux « Spécialisations proposées ».
- [ ] Viser **30 à 40 cartes distinctes jouables entre N0 et N12** par classe. Proposition : ~7 cartes N0‑N1, puis ~3 cartes par niveau N2‑N12 (environ une carte par spécialisation et par niveau).
- [ ] Écrire les nouvelles cartes avec la **grille de coûts provisoire** (section « Règles d'équilibrage (provisoires) »), pour ne pas tout réécrire à l'étape 4.
- [ ] **Mettre les cartes aux bons niveaux** :
  - [ ] Trier les cartes **N13** (« en attente », 128 au total) : leur donner un niveau (1 à 12), les fusionner ou les supprimer.
  - [ ] Trapper : *Tir Précis II* est au **niveau 21**.
  - [ ] Décider des **cartes obligatoires (N0)** : aucune classe n'en a aujourd'hui (`MANDATORY_CARD_LEVEL = 0`).
- [ ] **Supprimer ou fusionner les cartes redondantes** (listes « Redondances à trancher » de chaque classe). L'Élémentaliste (47 cartes) et le Maître d'Armes (38 jouables) sont surtout à élaguer.
- [ ] **Écrire les cartes manquantes** :
  - [ ] Niveaux **8 à 12 vides** pour Moine, Gardien, Mage Blanc, Élémentaliste, Trapper et Sorcière ; 8 à 11 pour l'Illusionniste ; 11 et 12 pour le Maître d'Armes.
  - [ ] Mage Blanc : **aucune carte au niveau 7**.
  - [ ] Cartes **peu chères** (1 à 4 PA) pour la Sorcière (0), le Mage Blanc (2), l'Élémentaliste (3) et le Trapper (3).
  - [ ] Sorts de rang 2 (versions plus fortes, ex. *Trait de feu II*) pour les niveaux supérieurs ou les trous.
  - [ ] Combos : si certaines actions réussissent, rendre tous les PA ou ramener le coût d'une carte à 0.
- [ ] Revoir les `maxSameCard` excessifs (Trait d'Ombre-Verte ×9, Coup Droit ×6, Uppercut ×6, Frappe Héroïque ×6, Énergie Lumineuse ×6).
- [ ] Nouvelles cartes : clés de localisation FR/EN, illustrations, sons et visuels.
- [ ] ▶️ **Après chaque lot de cartes** (création, suppression, changement de niveau) : `npx vitest run tests/decks`. Si une anomalie connue a été corrigée au passage (ex. *Tir Précis II*), retirer sa ligne de `KNOWN_ISSUES`.
- [ ] ▶️ **Fin de l'étape** : `npm run report:classes -- --check` ne doit plus signaler d'écart sur le nombre de cartes ni sur les niveaux, puis `npm test`.
- [ ] 📝 **Mettre à jour CLASSES.md**, dans chaque classe :
  - [ ] « À définir à la main » : spécificités, spécialisations et contraintes arrêtées.
  - [ ] « Spécialisations proposées » : cartes ajoutées, supprimées, fusionnées ; vider la colonne « Manques » traitée.
  - [ ] « Redondances à trancher » : retirer les points tranchés.
  - [ ] « Constat des cartes » et « Mécaniques signature » : nombres de cartes et noms de cartes à jour (chiffres : `npm run report:classes`, section « Vue d'ensemble des cartes »).
  - [ ] Cocher dans l'étape 5 les incohérences corrigées au passage (ex. *Tir Précis II*).

### Étape 2 — Retirer des choix de stats pour chaque classe
- [ ] Aujourd'hui, le **pool de stats est identique** pour les 9 classes (95 objets) : retirer, par classe, les stats qui ne correspondent pas à son identité (ex. critique pour le Moine, esquive pour le Trapper…). Le script lit les pools de chaque classe (`classes-fq8/*.json`) : il suivra ces changements sans modification.
- [ ] Revoir en même temps le **budget des Start stats** : Sorcière 3 points contre Moine 14 et Élémentaliste 12 (les autres entre 7 et 8).
- [ ] Points de vigilance issus du tableau des moyennes :
  - [ ] **Mana de départ vs coûts** : Sorcière et Gardien à 2,5 mana au N1 ; Maître d'Armes et Trapper à 3,5, alors que leurs attaques de base coûtent 1 mana.
  - [ ] **Main de départ** : Trapper à 0 (0,1 en moyenne au N1), il ne pioche rien au début du combat.
  - [ ] **Dés de vie** : Élémentaliste (d4) à 52 PV au N12 contre 164 pour le Gardien.
- [ ] Nettoyer l'`ItemChoice` vide de la Sorcière (`classes-fq8/witch.json`), puis retirer la ligne `pool vide :: witch.json` de `KNOWN_ISSUES`.
- [ ] ▶️ **Après chaque modification d'une classe** : `npx vitest run tests/decks/class-deck-integrity.test.js` (pools non vides, objets de stats existants, un seul objet de Start stats par classe).
- [ ] ▶️ **Fin de l'étape** : `npm test`, puis `npm run build` pour recompiler les compendiums et vérifier en jeu une montée de niveau.
- [ ] 📝 **Mettre à jour CLASSES.md** :
  - [ ] « Stats FQ du personnage » : colonne « Montable via carte de stat » et section « Distribution » (pools par classe).
  - [ ] « Vue d'ensemble » : colonne « Start stats » si les budgets de départ ont changé, et paragraphe « Stats de départ notables ».
  - [ ] Dans chaque classe : paragraphes « Stats FQ » et « Faiblesses ».

### Étape 3 — Refaire le calcul des stats moyennes
- [ ] ▶️ `npm run report:classes -- --out devNotes/rapport-classes.md` : le rapport tient compte des nouveaux pools (étape 2) et des nouveaux decks (étape 1).
- [ ] Vérifier les hypothèses du rapport (base du starter hero, répartition des ASI, CA) : si un starter hero ou un équipement de départ a changé, adapter `starterBase` ou `ARMORS` dans `utils/class-report.mjs`.
- [ ] 📝 **Mettre à jour CLASSES.md** en copiant les tableaux du rapport :
  - [ ] « Stats moyennes par classe » : tableau complet, hypothèses de calcul et date en tête de fichier.
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
  - [ ] Contenu de test du `draft.json` (9 cartes sans `maxSameCard`) : à sortir des patterns livrés.
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
| Budget Start stats | 14 | 7 | 8 | 12 | 7 | **3** | 8 | 7 | 7 |
| Choix de stats cumulés | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 | 2 / 15 / 30 |
| Points d'action | 10,5 / 13,8 / 17,6 | 9,5 / 12,8 / 16,6 | 10,5 / 13,8 / 17,6 | 9,5 / 12,8 / 16,6 | 10,5 / 13,8 / 17,6 | 8,5 / 11,8 / 15,6 | **7,5** / 10,8 / 14,6 | 8,5 / 11,8 / 15,6 | 10,5 / 13,8 / 17,6 |
| Mana | 5,5 / 8,8 / 12,6 | **2,5** / 5,8 / 9,6 | 6,5 / 9,8 / 13,6 | 6,5 / 9,8 / 13,6 | 3,5 / 6,8 / 10,6 | **2,5** / 5,8 / 9,6 | 3,5 / 6,8 / 10,6 | 3,5 / 6,8 / 10,6 | 4,5 / 7,8 / 11,6 |
| Zèle initial | 1,2 / 2,3 / 3,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 | 0,2 / 1,3 / 2,5 |
| Critique | 0,2 / 1,6 / 3,2 | 0,2 / 1,6 / 3,2 | 0,2 / 1,6 / 3,2 | **3,2** / 4,6 / 6,2 | 2,2 / 3,6 / 5,2 | 0,2 / 1,6 / 3,2 | 2,2 / 3,6 / 5,2 | 1,2 / 2,6 / 4,2 | 0,2 / 1,6 / 3,2 |
| Esquive | 2,2 / 3,6 / 5,2 | 0,2 / 1,6 / 3,2 | 0,2 / 1,6 / 3,2 | 1,2 / 2,6 / 4,2 | 0,2 / 1,6 / 3,2 | 0,2 / 1,6 / 3,2 | 2,2 / 3,6 / 5,2 | 1,2 / 2,6 / 4,2 | 0,2 / 1,6 / 3,2 |
| Main (début de combat) | 2,1 / 3,1 / 4,2 | **4,1** / 5,1 / 6,2 | 1,1 / 2,1 / 3,2 | 1,1 / 2,1 / 3,2 | **0,1** / 1,1 / 2,2 | 1,1 / 2,1 / 3,2 | 1,1 / 2,1 / 3,2 | 1,1 / 2,1 / 3,2 | 1,1 / 2,1 / 3,2 |
| Pioche (par tour) | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 | 1,1 / 1,6 / 2,3 |
| Déplacement (cases) | **8,2** / 9,3 / 10,5 | 6,2 / 7,3 / 8,5 | 5,2 / 6,3 / 7,5 | 6,2 / 7,3 / 8,5 | 6,2 / 7,3 / 8,5 | 6,2 / 7,3 / 8,5 | 7,2 / 8,3 / 9,5 | 7,2 / 8,3 / 9,5 | 6,2 / 7,3 / 8,5 |
| **dnd5e** | | | | | | | | | |
| Dé de vie | d8 | d12 | d6 | d4 | d8 | d6 | d6 | d10 | d10 |
| PV moyens | 23 / 48 / 78 | 29 / 80 / **164** | 24 / 65 / 125 | **18 / 28 / 52** | 23 / 48 / 90 | 19 / 29 / 53 | 20 / 35 / 53 | 24 / 49 / 79 | 27 / 67 / 115 |
| Caracs primaires | FOR + DEX | FOR + CON | CON + SAG | INT + SAG | DEX + SAG | INT + CHA | DEX + CHA | FOR + DEX | FOR + INT |
| FOR | 12(+1) / 15(+2) / 20(+5) | 16(+3) / 19(+4) / 20(+5) | 6(-2) | 6(-2) | 6(-2) | 10(+0) | 8(-1) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) |
| DEX | 16(+3) / 19(+4) / 20(+5) | 10(+0) / 10(+0) / 12(+1) | 6(-2) / 6(-2) / 10(+0) | 12(+1) | 16(+3) / 19(+4) / 20(+5) | 6(-2) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 8(-1) |
| CON | 10(+0) | 14(+2) / 17(+3) / 20(+5) | 16(+3) / 19(+4) / 20(+5) | 8(-1) / 8(-1) / 10(+0) | 10(+0) / 10(+0) / 12(+1) | 6(-2) / 6(-2) / 8(-1) | 8(-1) | 8(-1) | 14(+2) |
| INT | 10(+0) | 6(-2) | 14(+2) | 16(+3) / 19(+4) / 20(+5) | 12(+1) | 14(+2) / 17(+3) / 20(+5) | 10(+0) | 8(-1) | 12(+1) / 15(+2) / 18(+4) |
| SAG | 8(-1) | 6(-2) | 16(+3) / 19(+4) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 12(+1) | 10(+0) | 8(-1) | 10(+0) |
| CHA | 8(-1) | 12(+1) | 6(-2) | 8(-1) | 6(-2) | 16(+3) / 19(+4) / 20(+5) | 14(+2) / 17(+3) / 20(+5) | 12(+1) | 6(-2) |
| Maîtrise | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 | +2 / +3 / +4 |
| Bonus d'attaque (meilleure carac primaire) | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +5 / +7 / +9 | +4 / +6 / +9 | +4 / +6 / +9 | +4 / +6 / +9 |
| CA (équipement de départ) | 14 / 15 / 16 | **18** | 8 / 8 / 10 | 11 | 14 / 15 / 16 | **8** | 13 / 14 / 16 | 13 / 14 / 16 | 10 |
| Équipement de départ | Cuir, mains nues | Cotte de mailles, bouclier, masse | Robe, masse | Robe, bâton | Cuir, arc court | Robe, bâton | Cuir, dague | Cuir, lance, arc court | Cuir, hachette |
| **Cartes** | | | | | | | | | |
| Cartes débloquées (distinctes / exemplaires) | 4/17 · 17/45 · 19/48 | 3/12 · 18/42 · 20/44 | 4/16 · 20/44 · 20/44 | 4/19 · 19/45 · 20/46 | 5/13 · 19/40 · 21/42 | 2/12 · 18/43 · 19/44 | 6/14 · 24/41 · 27/46 | 5/14 · 30/64 · 38/76 | 3/9 · 4/10 · 5/11 (+ runes) |

**Hypothèses de calcul** (script sur les données, pas de mesure en partie) :
- **Base commune** (starter heroes) : PA 7, mana 2, zèle 0, critique 0, esquive 0, main 0, pioche 1, déplacement 5 cases, +15 PV fixes. S'y ajoutent les *Start stats* de la classe (`classes-stats-fq8/start-stats-*.json`).
- **Choix de stats** : 2 aux niveaux impairs, 3 aux niveaux pairs, dans un **pool commun aux 9 classes** de 95 objets (PA 24, mana 24, critique 10, esquive 10, zèle 8, déplacement 8, main 7, pioche 4). La moyenne est l'espérance d'un tirage proportionnel au pool. Chaque choix vaut en moyenne +0,25 PA, +0,25 mana, +0,11 critique, +0,11 esquive, +0,08 zèle, +0,08 déplacement, +0,07 main et +0,04 pioche. **Le gain est identique pour toutes les classes** : seuls les Start stats, le dé de vie et les caracs les différencient.
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
| Moine | FOR + DEX | 7 | 13 | 4 | – | 3 | 2 | – | DEX 6, FOR 4, SAG 1, CHA 1 |
| Gardien | FOR + CON | 14 | – | 14 | – | – | 4 | 6 | arme 9, FOR 3, CHA 2, CON 1 |
| Mage Blanc | CON + SAG | – | – | 5 | 8 | 12 | 1 | – | SAG 13, INT 4 |
| Élémentaliste | INT + SAG | – | 1 | – | 26 | 19 | 1 | – | INT 28, SAG 13, DEX 1 |
| Trapper | DEX + SAG | 1 | 16 | – | 3 | 5 | **7** | 10 | arme 10, SAG 6, DEX 4, CHA 2, INT 1 |
| Sorcière | INT + CHA | – | – | – | **3** | **9** | 11 | – | SAG 4, INT 1 |
| Illusionniste | DEX + CHA | 2 | 6 | 1 | 1 | 7 | 7 | 2 | **INT 17**, DEX 2, arme 2 |
| Maître d'Armes | FOR + DEX | 5 | 9 | – | – | – | 3 | 13 | arme 13, DEX 4, FOR 1 |

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
| Défausse courante | `fq.cards.currentDrop` | Compteur de défausses du round, payable via `drop` | Non |
| DOT/HOT | `fq.bonus.dot` | Dégâts (ou soins si négatif) par tour | Non |

8 types de cartes de stats existent : `action-point`, `mana`, `critical`, `evasion`, `hand`, `pick`, `moving`, `zeal`. Il n'existe **ni carte PV ni carte portée**.

**Distribution** : chaque classe reçoit au N1 ses *Start stats* (stats FQ et caracs), puis choisit 2 stats aux niveaux impairs et 3 aux niveaux pairs dans **le même pool commun de 95 objets** (sans remise). ASI de +2 à chaque niveau pair. L'ancien système « pool primaire / pool secondaire -M » n'existe plus : **l'identité FQ d'une classe tient désormais uniquement à ses Start stats**.

### Niveaux des cartes
- `level` 1 à 12 : débloquée quand le niveau de la classe atteint cette valeur (les cartes neutres suivent le niveau global, somme des niveaux de classes).
- `level` 0 : carte **obligatoire**, ajoutée automatiquement au deck (aucune classe n'en a aujourd'hui).
- `level` 13 : hors campagne, jamais débloquée. Sert aujourd'hui de réserve de cartes « en attente ».

### Types de rôles utilisés dans ce document

- **Tank** : encaisse, provoque, protège (PV, taunt, réactions défensives)
- **DPS mêlée / distance** : dégâts directs, mono ou multi-cibles
- **Contrôle / debuff** : entraves, malus, DoT, zones
- **Soutien / soins** : buffs d'équipe, soins, boucliers
- **Invocateur** : joue à travers ses sbires
- **Moteur / scaling** : classe faible au départ qui construit sa puissance en cours de combat (ressource cumulative, deck-building, compteurs)

### Vue d'ensemble

| Classe | Dé de vie | Caracs dnd5e | Start stats (bonus FQ au N1) | Rôle | Signature |
|---|---|---|---|---|---|
| Élémentaliste | d4 | INT + SAG | mana 4, crit 3, action 2, esq 1, main 1, dépl 1 | DPS burst + debuff | 4 effets élémentaires prérequis des combos |
| Gardien | d12 | FOR + CON | main 4, action 2, dépl 1 | Tank offensif | PV comme monnaie, zèle, charges de lame |
| Mage Blanc | d6 | CON + SAG | mana 4, action 3, main 1 | Soigneur / contrôleur DoT | Malédictions + boucliers réactifs + auras |
| Trapper | d8 | DEX + SAG | action 3, crit 2, mana 1, dépl 1 | DPS distance / sniper | Critique-ressource, pièges réactifs, bêtes |
| Moine | d8 | FOR + DEX | action 3, mana 3, dépl 3, esq 2, main 2, zèle 1 | Bruiser à tempo | Flux de cartes ↔ zèle, rejouable conditionnel |
| Sorcière | d6 | INT + CHA | action 1, main 1, dépl 1 | Invocatrice | Armée de squelettes + score de sacrifice |
| Illusionniste | d6 | DEX + CHA | crit 2, esq 2, dépl 2, mana 1, main 1 | Contrôle / soutien hybride | Portée cumulative dépensable |
| Maître d'Armes | d10 | FOR + DEX | dépl 2, action 1, mana 1, crit 1, esq 1, main 1 | DPS martial polyvalent | Armes équipées (`@wpnM`/`@wpnR`), armes de jet |
| Guerrier Runique | d10 | FOR + INT | action 3, mana 2, main 1, dépl 1 | Moteur / late-game carry | Deck-building en combat (runes) |

Stats de départ notables : **critique** de départ nul pour Moine, Gardien, Mage Blanc, Sorcière et Guerrier Runique (le meilleur critique de départ est celui de l'Élémentaliste, 3) ; **esquive** de départ nulle pour Gardien, Mage Blanc, Trapper, Sorcière et Guerrier Runique. Comme le pool est commun, toutes ces stats restent montables.

### Vue d'ensemble des cartes (decks de base)

| Classe | N1 | N2 | N3 | N4 | N5 | N6 | N7 | N8‑12 | N13 (en attente) | Total distinctes / exemplaires | Coût moyen PA | Cartes à 1‑4 PA | Réactives | Zèle + / zèle − | Innées |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Moine | 4 | 2 | 3 | 3 | 2 | 3 | 2 | 0 | 17 | 36 / 73 | 5,9 | 4 | 4 | 17 / 13 | 1 |
| Gardien | 3 | 1 | 7 | 2 | 2 | 3 | 2 | 0 | 10 | 30 / 57 | 6,1 | 4 | 4 | 6 / 15 | 1 |
| Mage Blanc | 4 | 2 | 3 | 3 | 5 | 3 | **0** | 0 | 11 | 31 / 62 | 6,1 | 2 | 8 | 9 / 10 | 2 |
| Élémentaliste | 4 | 4 | 1 | 4 | 2 | 4 | 1 | 0 | **27** | 47 / 94 | 7,3 | 3 | 2 | **9 / 28** | 1 |
| Trapper | 5 | 2 | 2 | 2 | 4 | 4 | 2 | 0 | 16 (+1 au N21) | 38 / 70 | 7,5 | 3 | 9 | 7 / 18 | 1 |
| Sorcière | 2 | 6 | 3 | 1 | 3 | 3 | 1 | 0 | 19 | 38 / 79 | **8,1** | **0** | 1 | 4 / 11 | 2 |
| Illusionniste | 6 | 2 | 4 | 4 | 4 | 4 | 1 | N12 : 2 | 10 | 37 / 61 | 4,8 | 11 | 2 | 6 / 18 | 2 |
| Maître d'Armes | 5 | 5 | 4 | 4 | 5 | 7 | 2 | N8 : 3, N9 : 1, N10 : 2 | 1 | 39 / 77 (+12 générées) | 5,1 | 18 | 3 | 14 / 14 | 5 |
| Guerrier Runique | 3 | 1 | – | – | – | – | – | N11 : 1 | – | 5 / 11 (+117 runes, 17 générées) | – | – | – | – | – |

Coût moyen et cartes peu chères calculés sur les cartes N1‑N12 à coût fixe (les coûts en X sont exclus).

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
| N1‑N3 | ≈ 0,9 | ≈ 1 | ≈ 5 dégâts (*Attaque Simple* : 7 PA, 1 mana, 5,5 dégâts) | 36 choix de dégâts, 2 de soins |
| N4‑N7 | ≈ 1,2 | ≈ 1 | ≈ 7 dégâts | 21 / 3 |
| N8‑N12 | ≈ 1,5 (à confirmer) | ≈ 1,2 (à confirmer) | ≈ 9 dégâts | 4 / 1 : trop peu de cartes, valeur extrapolée |

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

**Autres cibles** (à fixer à l'étape 4) : ratio générateurs / consommateurs de zèle par classe ; nombre d'exemplaires par tranche de niveau (`TARGETS.copies` dans `utils/class-report.mjs`).

---

## Gardien

> « Le plus grand nombre de points de vie du jeu. Peut puiser dans ses points de vie pour améliorer ses dégâts ou soutenir ses alliés. »

**Identité dnd5e** : d12, FOR + CON. CHA sert aux cartes de provocation, au Coup de bouclier, à Garde Absolue et au Cri de Ralliement — elle reste plate à 12 (+1), jamais montée par les ASI : à trancher (basculer sur CON, ou l'assumer).

**Stats FQ** : la **plus grosse main du jeu, pioche très faible**, peu de mana.
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
- **41 cartes, toutes au niveau 13** : le deck entier est en réserve, aucune carte n'est débloquable tant que les niveaux N1‑N12 n'ont pas été réattribués. `npm run report:classes -- --check` signale donc le Gardien à 0 carte jouable : c'est voulu, pas une régression.
- 3 cartes **générées** dans `guardian-generated.json` (Lame Chargée, Tourbillon Déchaîné, Bénédiction du Rempart), toutes éphémères.
- Exemplaires : 75 au total, plus 32 exemplaires générés.
- Zèle : 13 générateurs pour 17 consommateurs (contre 6/15 avant le lot), grâce aux réactifs de l'Ange Gardien et aux petites frappes.
- Aucun soin réel ni HOT dans le deck : les 11 cartes qui rendent des PV les rendent toutes en **temporaires**.
- Beaucoup de cartes coûtent 1 mana (Frappe Héroïque ×6, Hémorragie ×4, Brèche, Égide, Coup Puissant…) : l'alternative PV est indispensable avec 2,5 mana au N1.

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

**Stats FQ** : **mana le plus haut** (4 de départ, à égalité avec l'Élémentaliste), action 3. **Déplacement le plus faible** (5 cases), aucun critique ni esquive de départ, CA 8. Zèle généré en jeu par la moitié du deck.

**Spécialisations validées** :

| Spécialisation | Principe | Nombres de cartes |
|---|---|---|
| Mage Blanc (healeur et soutien) | Fais des soins et utilise des aura pour soigner et buffé ces alliés |  |
| Malédictions (dps) | utilise des stacks de malédictions pour faire d'importants dégâts |  |
| Hanteur (dps spécial) | Consomme les malédictions et/ou réduits ses stats de dégâts et de heal pour contrôler d'autres tokens dans un tour bonus  |  |

**Mécaniques signature** :
- **Malédiction (`Curse`)** : pose plusieurs stacks sur des cibles, permet d'utiliser d'autres sorts efficaces avec beaucoup de stacks. Tue une cible ayant suffisamment de malédictions (Jugement Dernier).
- **Hantise (`Haunt`)** : seconde marque empilable, distincte de la malédiction et qui ne se confond jamais avec elle. Elle ne fait aucun dégât : elle ouvre la **prise de contrôle**. À 5 hantises, le *Fantôme* — une COPIE de la cible, sur sa case, jouée par le Mage Blanc le temps d'un seul tour puis dissipée. *Profanation* convertit les malédictions en hantises, une pour une, ce qui relie les deux spécialisations.
- **Suite de boucliers réactifs** : 8 cartes réactives (Bouclier de Mana, Divin, Vengeur, Empathique, Réprouver, Soins d'Urgence, Ange Gardien, Absorption de Sort), Bouclier de Mana avec `replayable: @wis`. Trois modèles de mitigation distincts : PV temporaires, soin réactif répété, invulnérabilité + restauration (Bouclier Divin).
- **Transmutation de ressources** : Sang Bleu (2 PV → 1 mana), Le Bien Et Le Mal (transfert de PV à portée quasi illimitée), Soins d'Urgence (défausse → soin), Infusion de Mana (source de mana passive permanente), Absorption de Sort.
- **Générateur de mana** : Infusion de Mana.
- **Beaucoup de cartes automatiques** : les auras qui coûtent 1 mana par tour, à combiner avec les infusions de mana.

**Boucle de jeu** : maudire tôt → laisser tourner les DoT en soignant/réagissant → détoner ; alimenter le tout par conversion de ressources.

**Faiblesses** :
- Lent (5 cases), fragile au contact (CA 8)

### Constat des cartes (données)
- 39 cartes : 20 débloquables (N1‑N6), **aucune au N7**, rien aux N8‑N12, 19 au N13 (dont les 5 auras, la moitié des malédictions et **toute la spécialisation Hantise**).
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

**Identité dnd5e** : d8, FOR + DEX. CON alimente les soins et coûts, SAG/CHA les plafonds de X.

**Stats FQ** : le plus gros budget de départ (14) : **meilleur déplacement** (8 cases au N1), la seule classe avec du **zèle initial**, esquive de départ à égalité avec l'Illusionniste (2), bonne main (2). **Aucun critique de départ** — il joue le volume, pas le burst (le critique reste montable via le pool commun).

**Rôle** : bruiser mobile à tempo, duelliste corps à corps, avec appoints tank (taunt Uppercut, Interruption) et soins (Vive-Esquive, Méditation Zen, Paume Curative).
- Healeur fort mais corps à corps
- Duelliste corps à corps ultra mobile
- Tank spé esquive

**Mécaniques signature** :
- **Économie de zèle fermée** : générateurs spammables (Coup Droit ×6, Coup Gauche ×5, Uppercut ×6, +1 chacun) → consommateurs scalables (Combo, Combo 2 non borné, Souffle de Ki, Méditation Zen, Paume Curative).
  - Poing Rouge est la seule carte du jeu qui monte `zeal.max` (+5, permanent).
- **Flux de cartes** : Souffle de Ki (zèle → X cartes **et** 2X actions), Maître Du Chi (carte innée passive bidirectionnelle : défausse ↔ zèle ↔ pioche), Armes Secrètes (monétise la défausse en dégâts inesquivables).
- **Rejouable conditionnel scripté** (unique au Moine) : Coup Droit/Gauche rejouables **une fois** seulement si assez de PA ont déjà été dépensés ce tour (4 / 5) — récompense l'**ordonnancement** des cartes.
- **Défense réactive** : 4 réactives (Bouclier Zélé sur sort subi, Vive-Esquive sur dégâts, Armes Secrètes, Interruption qui retire 1d6 PA et entrave) + Dissimulation (intouchable 1 tour au prix de dégâts nuls, puis fenêtre offensive).
- **Déplacement améliorable** : dégâts et déplacement (Déplacement Éclair, Pas du vide, Charge) (le seul avec le Gardien ? Enlever le gardien ?)
  - Le seul à faire plus de dégâts avec toutes les cartes en main
  - Le seul à pouvoir augmenter son zèle max
- Les heals uniquement pour les autres (comme l'illusionniste ?)

**Boucle de jeu** : enchaîner les petites frappes → zèle → convertir en cartes/actions/burst ; l'ordre de jeu dans le tour est la compétence clé.

**Faiblesses** :
- Aucun critique de départ

### Constat des cartes (données)
- 36 cartes : 19 débloquables (N1‑N7), **17 en attente au N13**, rien aux N8‑N12.
- Économie de zèle saine (17 générateurs / 13 consommateurs). Coût moyen 5,9 PA.
- Deux axes opposés apparaissent dans les cartes N13 : « **main pleine** » (X = cartes en main) et « **cadence** » (X = cartes déjà jouées ce round).
- `maxSameCard` lourds : Coup Droit ×6, Uppercut ×6, Coup Gauche ×5, Paume Curative ×4.
- Mana : 5,5 au N1 alors que Coup Gauche, Combo, Uppercut, Lame Fantôme, Dissimulation coûtent du mana.

### Spécialisations proposées (à valider)
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Enchaînement** (cadence, frappes) | Coup Droit, Coup Gauche, Combo, Combo 2, Lame Fantôme, Uppercut, Cadence, Élan Martial, Cycle du Souffle, Vacuité, Gant de Fer | Finisher N10‑12 |
| **Main pleine** (garde les cartes) | Poings des Cent Formes, Paume des Mille Feuilles, Sérénité Pleine, Ferveur Intérieure, Hyperactivité, Lecture du Souffle, Second Souffle, Maître du Chi | Carte défensive qui scale sur la main |
| **Paume / soins au contact** | Paume Curative, Bague de Soins, Transfert de Soins, Méditation Zen, Vive-Esquive | Soin de groupe au contact, N8+ |
| **Tank esquive / mobilité** (transverse) | Dissimulation, Bouclier Zélé, Interruption, Déplacement Éclair, Pas du Vide, Charge, Souffle de Ki, Poing Rouge, Souffle Perpétuel, Armes Secrètes, Cape Inhibitrice, Conversion | Provocation + buff d'esquive (la spé « tank esquive » annoncée n'a presque aucune carte dédiée) |

### Redondances à trancher
- Gain de PA : Hyperactivité / Vacuité / Souffle de Ki.
- Gain de zèle : Ferveur Intérieure / Élan Martial / Maître du Chi / Souffle Perpétuel (+ Montée de Zèle générée).
- Soin personnel : Sérénité Pleine / Méditation Zen / Vive-Esquive.
- Pioche : Cycle du Souffle / Second Souffle / Lecture du Souffle / Souffle de Ki.

### Incohérences relevées
- Uppercut : « piochez une carte » absent des données.
- Poing Rouge coûte 14 PA : injouable avant le N6 en moyenne.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**
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

**Stats FQ** : 2e plus gros budget de départ (12) : **mana le plus haut** (4, à égalité avec le Mage Blanc) et **meilleur critique de départ du jeu** (3). **Les PV les plus bas** (18 / 28 / 52).

**Rôle** : DPS magique « glass cannon », mono-cible burst avec pivot AoE (Météore, Onde glacée, Choc de feu), contrôle/debuff en sous-produit.

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
- **47 cartes, la classe la plus fournie** : 20 débloquables (N1‑N7), **27 au N13**, rien aux N8‑N12. Il faut **en retirer**, pas en ajouter.
- **16 cartes de combo bi-élémentaire** + 4 cartes utilitaires « nécessite 1 élément » + 4 ultimes mono-élément.
- Zèle déséquilibré : **9 générateurs pour 28 consommateurs**, avec un zèle initial de 0,2 au N1.
- Seulement 3 cartes à 1‑4 PA ; coût moyen 7,3 PA ; 6 cartes à 9 PA ou plus.
- Défense quasi absente : Plastron Magique, Repli du Souffle, Captation de Mana.

### Spécialisations proposées (à valider)
| Spé | Cartes mono-élément | Ultime |
|---|---|---|
| **Feu** | Trait de Feu, Main Brûlante, Brasier Ardent, Boule de Feu, Traînée Ardente, Attiser les Braises | Immolation Absolue |
| **Givre** | Frappe de Givre, Stalactite Géante, Zéro Absolu, Mur de Givre | Éternité Glaciaire |
| **Terre** | Fracture Terrestre, Jet de Roche, Colosse de Pierre | Sépulcre de Pierre |
| **Air** | Tornade, Tourbillon, Bourrasque de Dégâts, Bourrasque de Répulsion | Cyclone |

Combos par paire d'éléments (à réduire à ~2 par paire) :

| Paire | Cartes |
|---|---|
| Feu + Givre | Givrefeu, Fusion des Extrêmes, Sceau Thermique |
| Feu + Terre | Météore, Calcination, Cœur du Volcan |
| Feu + Air | Choc de Feu, Nuée Incandescente, Brasier Tournant |
| Terre + Air | Brouillard (air **ou** terre), Vent de Gravats, Convergence Tellurique |
| Terre + Givre | Permafrost, Plastron Magique (terre **ou** givre) |
| Givre + Air | Onde Glacée, Givre des Synapses, Nécrose Blanche |

Utilitaires / transverses : Magie des Éléments (innée), Captation de Mana, Incantation, Propagation des Dégâts, Assassin du Néant, Missiles Magiques +, Lecture des Courants, Repli du Souffle, Chaleur Résiduelle.

### Redondances à trancher
- Paires à 3 cartes (Feu+Givre, Feu+Terre, Feu+Air, Givre+Air) : garder 2 par paire.
- Utilitaires N13 qui se recoupent : Lecture des Courants (pioche) / Chaleur Résiduelle (mana) / Captation de Mana.
- Ultimes (Immolation, Éternité, Sépulcre, Cyclone) : bons candidats pour les N10‑N12, un par élément.

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

**Stats FQ** : action 3, critique 2 (2e meilleur critique de départ après l'Élémentaliste), mana 1. **Aucune esquive de départ** : la classe doit rester loin. **Main de départ à 0** : il ne pioche rien au début du combat.

**Rôle** : archer/DPS très longue portée, sous-thèmes invocateur (Louve N1, Ours N7) et contrôleur de terrain (pièges, entraves).

**Mécaniques signature** :
- **Le critique comme ressource** : buffs (Tireur d'Élite, Ajustage de Tir inné), conversion (Retrouver des Forces vend du critique contre du mana), et surtout les **pièges dont les dégâts scalent sur le score de critique** (`2d(critique)`) tout en étant incritiquables.
- **Portée extrême** : `maxReach` formulés (`10+@dex`, `7+@dex`), Tir Supersonique à portée illimitée ; **coût en action = distance** (`xvalue: reach`) sur Tir Précis et Supersonique.
- **Spécialiste du réactif** (9 réactives, record du jeu) : Piège à Pointes / Empoisonné — 0 action, 1 mana, déclenchés par `targetsWithinReach` quand un ennemi approche.
- **Auto-handicap comme ressource** : Embuscade (vide tous les PA → +@wis dégâts cumulable), Tir Enraciné (convertit le déplacement en dégâts + auto-immobilisation).
- **Bêtes** : Louve Apprivoisée, Ours Enragé, Faucon de Chasse, Tortue Géante, jouant après le tour du Trapper, scaling `@cha`.
- Zones distance (rectangle 3×3, ligne, cercle), entraves (Traquenard, repoussée du Tir Supersonique), DoT poison.

**Boucle de jeu** : préparer le tir (buffs de critique, embuscade), sécuriser la zone (pièges), déléguer le contact aux bêtes, décharger à longue portée.

**Faiblesses** :
- Pas d'esquive
- Pas d'attaque corps à corps

### Constat des cartes (données)
- 38 cartes : 21 débloquables (N1‑N7), 16 au N13, **Tir Précis II au N21**, rien aux N8‑N12.
- 7 générateurs de zèle pour 18 consommateurs ; coût moyen 7,5 PA ; 3 cartes à 1‑4 PA.
- Les trois spécialisations sont déjà bien identifiables dans les cartes.

### Spécialisations proposées (à valider)
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Sniper / critique** | Tir Précis, Tir Précis II, Tireur d'Élite, Ajustage de Tir, Tir Supersonique, Tir Enraciné, Tir Transperçant, Embuscade, Retrouver des Forces, Étude du Point Faible, Chasseur Solitaire, Double Flèche, Pluie de Flèches, Tir Explosif | Finisher N10‑12 |
| **Pièges** (réactifs, poison) | Piège à Pointes, Piège Empoisonné, Piège en Chaîne, Collet Mortel, Piège d'Affût, Piège à Fosse, Hallali, Réserve de Pièges, Traquenard, Tir Réflexe, Tir Empoisonné, Mutation Virale | Carte peu chère de pose |
| **Maître des bêtes** | Louve Apprivoisée, Ours Enragé, Faucon de Chasse, Tortue Géante, Sifflet du Chasseur, Meute, Dressage, Crocs Affûtés, Instinct de Chasse, Ordre d'Attaquer, Saignée du Fauve, Offrande Sauvage | Caractéristique à trancher (CHA -2) |

### Redondances à trancher
- Dressage / Crocs Affûtés / Instinct de Chasse : même structure (bonus aux prochaines bêtes) → une carte à 3 choix ?
- Tir Précis / Tir Précis II : rang 2 à placer au bon niveau.
- Poison : Tir Empoisonné / Piège Empoisonné.

### Incohérences relevées
- Tir Précis II au niveau 21.
- Pluie de Flèches « incritiquable » sans `bonusCrit`.
- Ours Enragé (16 PA) et Tireur d'Élite (10 PA pour un buff) très chers au regard des 10,5 PA du N1.

### À définir à la main
- **Spécificités** :
- **Spécialisations** :
- **Contraintes** :

**Questionnement et TODO :**

---

## Sorcière

> « Un mage puissant. Sa force réside dans le nombre de squelettes qu'elle ranime pour détruire ses adversaires. »

**Identité dnd5e** : d6, INT + CHA. **SAG est plus utilisée que INT dans les cartes** (9 contre 3 : Afflux, Mauvais Œil, Sortilège d'Ombre, Explosion d'Ombre…) : écart fiche/deck à trancher.

**Stats FQ** : **le plus petit budget de départ du jeu (3)** : action 1, main 1, déplacement 1, rien d'autre. Mana à 2,5 au N1 (le plus bas, avec le Gardien), CA 8, 19 PV. Coûts d'action réduits par les caracs (`−8+@cha`, `−7+@wis`) : les caracs rendent le kit moins cher.

**Rôle** : invocatrice / commandante d'armée à montée en puissance exponentielle — faible au premier tour, écrasante en fin de combat.

**Mécaniques signature** :
- **Armée** : quasiment chaque carte offensive invoque un squelette en plus de son effet (Trait D'Ombre-Verte ×9 en deck). Paliers : Skeleton lvl 1‑2 → Giant Skeleton → Skeleton Sorcerer (capstone N7, mini-nécromancien autonome). Piétaille plafonnée à 6 ; le Sorcier en fait partie.
- **Le squelette géant** : a son propre TYPE de sbire (`giantSkeleton`), donc son propre plafond de 1 hors des 6 de la piétaille, et il est le seul bénéficiaire des cartes de rituel. Mais il reste de FAMILLE `skeleton` (`CardFqSystem.MINION_FAMILY`) : les sorts qui dopent « tous vos squelettes » le prennent, et les comptages d'armée le comptent. Type = emplacement d'invocation, famille = genre de créature — c'est la seule créature où les deux divergent.
- **Rituels d'invocation** : des cartes qui ne font RIEN sur le champ de bataille — elles alimentent `system.fq.minions.giantSkeleton.{hp,damage,movement}`, compteurs que `Minion.statBonus` relit à l'invocation SUIVANTE du Squelette Géant. Faible coût (Éclats d'os, Crocs d'ivoire, Talons d'ossements : 1‑2 points de sacrifice), moyen (Onction de moelle : 2‑3), élevé (Couronne d'ossements, Sceptre de l'ossuaire, Marche funèbre : 3‑4, avec une seconde face jouable sur le Géant DÉJÀ en jeu ; Hécatombe d'ossements : 5‑8, soit une armée entière passée au charnier). Ces bonus tombent avec les effets FQ à la fin du combat.
- **Le charnier reste manuel** : aucune carte ne détruit de sbire (hors Déplacement Morbide qui l'exige). Le joueur sacrifie ses squelettes au bouton du HUD de jeton, ce qui alimente `fq.minions.sacrificedMinion` — remis à zéro au début de chacun de ses tours. Réduire son armée pour dépenser gros est donc un choix de tour, jamais un effet de carte.
- **Score de sacrifice** (`fq.minions.sacrificedMinion`) : détruire ses squelettes alimente un compteur-ressource consommé par Ostéologie (invoque un squelette de niveau = sacrifices, cap 4), Afflux De Vie/Mana, Déplacement Morbide, Récolte Macabre et les rituels.
- **Comptage de l'armée** (`SCRIPT:` sur les tokens « Skeleton ») : Afflux D'Agilité (esquive), Afflux De Pouvoir (actions), Rituel Du Sang (zèle) — plus l'armée est grande, plus la sorcière est forte.
- **`targetType: Skeletons`** : buffs de masse dédiés (Bouclier D'Os, Canalisation Des Ombres — invulnérabilité 1 round —, Forme d'Ombre, Déplacement Morbide, Ossature Renforcée, Fureur des Morts, Apothéose Macabre).
- Défausse en coût d'appoint (Sortilège d'Ombre, Rituel Du Sang) et en ressource (Offrande de Cendres) — la ressource centrale reste le **sacrifice**.

**Boucle de jeu** : invoquer en attaquant → sacrifier → recycler en mana/PV/actions/zèle → réinvoquer plus gros. Aucune défense personnelle : l'armée est le rempart.

**Faiblesses** :
- Vite à court de mana ? → **confirmé par les chiffres** : 2,5 mana au N1, alors que Trait d'Ombre-Verte (×9) coûte 1 mana et 7 PA pour 8,5 PA disponibles.
- Peu de points de vie

### Constat des cartes (données)
- 38 cartes : 19 débloquables (N1‑N7), 19 au N13, rien aux N8‑N12.
- **Aucune carte à 1‑4 PA** parmi les débloquables ; coût moyen 8,1 PA (le plus élevé) pour 8,5 PA au N1 : **une carte par tour au N1**.
- Seulement 2 cartes distinctes au N1 (Nécromancie, Trait d'Ombre-Verte ×9).
- 4 générateurs de zèle pour 11 consommateurs.

### Spécialisations proposées (à valider)
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
- Trait d'Ombre-Verte ×9.
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

**Stats FQ** : budget 7, étalé : déplacement 2, puis 1 en action, mana, critique, esquive et main.

**Rôle** : DPS martial polyvalent sur deux rails parallèles — mêlée (`@wpnM`) et distance (`@wpnR`) — plus un rail d'armes de jet.

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
- **La classe la plus avancée** : 39 cartes, dont 38 débloquables jusqu'au N10 ; N11‑N12 vides ; une seule carte au N13 (Reprise de garde).
- 12 cartes générées (couteaux, étapes des forges).
- 18 cartes à 1‑4 PA : la plus grande densité de cartes peu chères. Zèle équilibré (14 / 14).
- Déjà dans la cible des 30‑40 cartes : la passe consiste surtout à **élaguer** et à compléter N11‑N12.

### Spécialisations proposées (à valider)
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Mêlée** | Attaque Simple, Fente Précise, Frappe Double, Frappe Triple, Huile d'Affûtage, Riposte, Attaque Latérale, Attaque Diagonale, Attaque en Cercle, Forge Spectrale, Forge Astrale, Reprise de Garde | Finisher N11‑12 |
| **Distance** | Tir Simple, Visée Posée, Tir Appuyé, Prise Équilibrée, Riposte à Distance, Pluie d'Acier, Forge Éthérée, Forge Arcanique | Finisher N11‑12 |
| **Armes de jet** | Ceinture de Couteaux, Affûtage des Couteaux, Fourreau Caché, Sang-froid, Volée de Couteaux, Momentum, Lancer Lesté, Prise Inversée, Javelot, Plumbata, Chakram, Filet de Rétiaire, Kpinga, Choix de l'Arsenal | |
| **Instructeur** (soutien CHA) | Leçon d'Esquive, Leçon d'Estoc, Leçon de Visée, Maîtrise des Armes, Réplique Parfaite | Cartes N7+ |

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

**Stats FQ** : budget 8 : critique 2, esquive 2, déplacement 2, mana 1, main 1. **Aucun PA de départ : 7,5 PA au N1, le plus bas du jeu.** La **portée n'est achetable nulle part** — c'est précisément sa mécanique : elle se construit en combat.

**Rôle** :
- Dégâts corps à corps (bonus de portée)
- Soutien hybride (bonus de portée), sorts qui marchent avec toutes les classes
- Healeur à réaction et spé HOT (derniers dégâts)

**Mécaniques signature** :
- **Bonus de portée**
- **Cartes de manipulation d'espace** : peut bouger des cibles autres que lui (Passage éthéré, Cage de Rappel, Illusion de Maître de Jeu, Illusion Infranchissable)
- **Cartes de manipulation temporelle** : soins des derniers dégâts subis, soins HOT ? (Frappe Temporelle, Miroir, Bombe à Retardement, Piège de Retour dans le Temps, Soins Expansifs)
- **La portée comme ressource cumulative** (`fq.bonus.range`) : gains fiables (Allonge magique, Fouet Enchanté, Salto Arrière), aléatoires (Rapière Enchantée 1d2), temporaires (Potion d'allonge). Puis des cartes la dépensent ou la scalent : dégâts (Frappe Illusoire, Volée de shuriken, Prise En Traître), DoT (Nuage de dague), conversion (Illusion De Caractéristiques : portée → critique/soins/mana).
- **Trois `xvalue` distincts** : bonus de portée, distance réelle à la cible (Orbe Grandissante `XXXd6`, Passage éthéré, Bombe à Retardement), nombre de cibles (Succion De Mana).
- **Soutien d'équipe réel** : Inspiration Chantée (+crit, rejouable @cha fois), Danse Enfiévrée (+esquive), Inspiration Effrénée, Apothicaire I/II (potions), Immatérialité (invulnérabilité 1 tour).
- **Manipulation d'effets** : Peste Noire (duplique tous les effets FQ de la cible), Contagion (échange les effets de deux cibles), Images Miroir (esquive +@dex jusqu'au premier coup).
- **Contrôle** : Regard Envoûtant (charme), Berceuse (sommeil).
- Conversions : Vases communicants (mana ↔ 4 actions), zèle généré par 6 cartes et dépensé par 18.

**Boucle de jeu** : empiler la portée avec des cartes bon marché qui rendent du zèle → encaisser les payoffs → soutenir l'équipe en continu.

**Problème de caractérisation**
- Soutien un peu trop similaire au maître d'armes
- ~~Attaque latérale et en cercle à déplacer vers le maître d'armes~~ → fait (Attaque Latérale, Diagonale et En Cercle sont chez le Maître d'Armes)
- Bien différencier les soins des autres soigneurs : Moine (corps à corps) et Mage Blanc (soins directs et bouclier)

**Faiblesses** :
- Moins de dégâts ?
- Le moins de PA au N1

### Constat des cartes (données)
- 37 cartes : 25 débloquables aux N1‑N7, 2 au N12 (Magie des Arcanes, Magie Blanche), 10 au N13, rien aux N8‑N11.
- 11 cartes à 1‑4 PA ; coût moyen 4,8 PA (le plus bas, cohérent avec ses 7,5 PA).
- 6 générateurs de zèle pour 18 consommateurs.
- Magie des Arcanes / Magie Blanche (N12) : identité floue, elles ressemblent à des cartes neutres génériques.

### Spécialisations proposées (à valider)
| Spé | Cartes existantes | Manques |
|---|---|---|
| **Lame d'allonge** (mêlée qui scale sur la portée) | Fouet Enchanté, Frappe avec Salto Arrière, Frappe Illusoire, Allonge Magique, Rapière Enchantée, Prise en Traître, Volée de Shuriken, Nuage de Dague, Orbe Grandissante, Shuriken, Shuriken Empoisonné, Illusion de Caractéristiques | Finisher N8‑12 |
| **Barde** (soutien) | Inspiration Chantée, Danse Enfiévrée, Inspiration Effrénée, Apothicaire I, Apothicaire II, Immatérialité, Vases Communicants, Succion de Mana, Soins Expansifs | Sorts d'assistance (voir TODO) |
| **Chronomancien / manipulateur** | Passage vers le Plan Éthéré, Peste Noire, Contagion, Frappe Temporelle, Miroir, Distorsion, Bombe à Retardement, Cage de Rappel, Illusion de Maître de Jeu, Piège de Retour dans le Temps, Illusion Infranchissable, Regard Envoûtant, Berceuse, Images Miroir | Cartes N8‑N11 |
| À reclasser | Magie des Arcanes, Magie Blanche | |

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

**Stats FQ prioritaires** : pioche, main, mana, génère et utilise beaucoup de zèle et d'action. Start stats : action 3, mana 2, main 1, déplacement 1 (la pioche n'a plus de bonus propre depuis le pool commun).

**Rôle** : moteur / late-game carry. Départ délibérément faible (deck de base : 5 cartes distinctes, 11 exemplaires), montée en puissance par deck-building en cours de combat.

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
