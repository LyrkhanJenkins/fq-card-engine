# État des lieux des cartes par classe

Topo chiffré établi à partir des données réelles (`packs/_source/decks-pattern-fq8`, `classes-fq8`, `classes-stats-fq8`) au 2026-08-28, en préparation du travail « cartes jusqu'au niveau 10 + spécialisations » (voir [caracterisation.md](../CLASSES.md)).

Lecture des chiffres : **distinctes** = nombre de cartes différentes dans le pattern ; **avec dup.** = somme des `maxSameCard` (nombre maximum d'exemplaires jouables de chaque carte).

---

## Vue d'ensemble (decks de base)

| Classe | Distinctes | Avec dup. | Niveau max atteint | Cartes générées en jeu (distinctes / avec dup.) |
|---|---|---|---|---|
| Élémentaliste | 23 | 52 | 7 | 2 / 4 (Incantation, Propagation) |
| Gardien | 22 | 48 | 7 | — |
| Mage Blanc | 23 | 49 | 7 | 2 / 4 (Infusion de Mana, Frappe de Lumière) |
| Trapper | 22 | 47 | 7 | — |
| Moine | 21 | 52 | 7 | — |
| Sorcière | 21 | 48 | 7 | 1 / 3 (Nécromancie) |
| Illusionniste | 28 | 44 | 7 | — |
| Maître d'Armes | 25 | 51 | 7 (aucune carte niv. 6 !) | 13 / 70 (couteaux ×24 ×2, forge spectrale…) |
| Guerrier Runique | 3 | 6 | 1 (base) / **10** (runes) | 17 / 408 (frappes forgées, runes éphémères) |

Le Guerrier Runique est à part : son deck de base ne contient que les 3 Frappes Runiques (×2 chacune), tout le reste vit dans les trois decks de runes (cartes obtenues par gravure) :

| Deck de runes | Distinctes | Avec dup. |
|---|---|---|
| Runes rouges | 38 | 193 |
| Runes jaunes | 38 | 193 |
| Runes bleues | 38 | 193 |
| **Union des 3 couleurs** | **114** (aucune carte commune aux 3) | **579** |

À noter : `draft.json` (9 cartes de test, sans `maxSameCard`) est hors décompte, et `decks-fq8-generated` (45 decks pré-construits lvl 1‑5 par classe) est dérivé des patterns, pas une source.

---

## Détail par niveau (distinctes / avec dup.)

| Classe | Niv 1 | Niv 2 | Niv 3 | Niv 4 | Niv 5 | Niv 6 | Niv 7 | Niv 8‑10 |
|---|---|---|---|---|---|---|---|---|
| Élémentaliste | 5 / 21 | 5 / 9 | 2 / 4 | 4 / 7 | 2 / 2 | 4 / 8 | 1 / 1 | — |
| Gardien | 3 / 12 | 4 / 10 | 6 / 11 | 2 / 3 | 2 / 3 | 3 / 7 | 2 / 2 | — |
| Mage Blanc | 4 / 16 | 2 / 3 | 4 / 9 | 4 / 6 | 5 / 6 | 3 / 8 | 1 / 1 | — |
| Trapper | 5 / 15 | 4 / 7 | 3 / 6 | 2 / 4 | 3 / 5 | 4 / 9 | 1 / 1 | — |
| Moine | 4 / 17 | 4 / 9 | 3 / 5 | 3 / 4 | 2 / 2 | 3 / 12 | 2 / 3 | — |
| Sorcière | 3 / 14 | 6 / 12 | 4 / 6 | 1 / 2 | 3 / 4 | 3 / 9 | 1 / 1 | — |
| Illusionniste | 6 / 14 | 4 / 5 | 5 / 8 | 4 / 5 | 5 / 5 | 3 / 6 | 1 / 1 | — |
| Maître d'Armes | 5 / 14 | 4 / 10 | 4 / 7 | 6 / 12 | 4 / 6 | **0 / 0** | 2 / 2 | — |
| Runes rouges | 7 / 42 | 7 / 37 | 4 / 24 | 5 / 20 | 5 / 25 | 3 / 13 | 2 / 12 | 5 / 20 |
| Runes jaunes | 7 / 42 | 7 / 37 | 4 / 24 | 6 / 26 | 4 / 19 | 3 / 13 | 2 / 12 | 5 / 20 |
| Runes bleues | 7 / 42 | 6 / 31 | 3 / 18 | 7 / 32 | 4 / 19 | 3 / 13 | 3 / 18 | 5 / 20 |

Constats pour le chantier « niveau 10 » :
- **Toutes les classes s'arrêtent au niveau 7** (sauf les runes du Guerrier Runique, déjà au niveau 10 : 2/7 au niv. 8, 1/6 au niv. 9, 2/7 au niv. 10 par couleur).
- Le niveau 7 est presque partout un capstone unique (1 à 2 cartes) ; les niveaux 8‑10 sont entièrement à créer.
- Trou à combler : le Maître d'Armes n'a **aucune carte de niveau 6**.
- Les niveaux creux (2 cartes ou moins) : Élém. 3/5/7, Gardien 4/5, Mage Blanc 2, Trapper 4, Moine 5, Sorcière 4, Maître d'Armes 6.

---

## Main et pioche : min / max avec les montées de niveau

Rappels du système :
- Sémantique (code) : la main (`fq.cards.hand`) est tirée au début du combat (`combat-turn.js`), la pioche (`fq.cards.pick`) à chaque tour (`combat.hook.js`). Aucune base cachée ajoutée ailleurs.
- La **base varie selon le starter hero** : certains surchargent `fq.cards` (Gardien 4/0, Moine 2/1, Trapper 0/1), les autres restent sur les valeurs par défaut du schéma `character-fq.mjs` (1/1). Chaque carte de stat vaut **+1**.
- Choix de stats en classe principale : pool primaire aux niv. 2‑7 (3+3+3+2+2+2 = 15 choix), puis pool étendu (variantes « ‑M », 30 items) à 2 choix/niveau à partir du niv. 8 (soit 6 choix aux niv. 8‑10). Sans remise dans chaque pool.
- Le **min = la base** du starter hero : tous les pools contiennent assez d'items non-main/non-pioche pour ne jamais en prendre.

Maximums atteignables au **niveau 10** en classe principale (base du starter hero + items « main »/« pioche » du pool primaire + ceux du pool étendu, tous prenables avec les 15 + 6 choix disponibles) :

| Classe | Main base (starter hero) | Main dans pools (prim. + ‑M) | **Main min–max niv 10** | Pioche base | Pioche dans pools (prim. + ‑M) | **Pioche min–max niv 10** |
|---|---|---|---|---|---|---|
| Élémentaliste | 1 (défaut) | 1 + 2 | **1–4** | 1 (défaut) | 1 + 1 | **1–3** |
| Gardien | **4** | 4 + 3 | **4–11** | **0** | 1 + 0 | **0–1** |
| Mage Blanc | 1 (défaut) | 1 + 3 | **1–5** | 1 (défaut) | 1 + 1 | **1–3** |
| Trapper | **0** | 1 + 2 | **0–3** | 1 (défaut) | 1 + 1 | **1–3** |
| Moine | **2** | 3 + 2 | **2–7** | 1 (défaut) | 0 + 1 | **1–2** |
| Sorcière | 1 | 2 + 3 | **1–6** | 1 | 1 + 1 | **1–3** |
| Illusionniste | 1 (défaut) | 3 + 1 | **1–5** | 1 (défaut) | 1 + 1 | **1–3** |
| Maître d'Armes | 1 | 3 + 3 | **1–7** | 1 | 1 + 0 | **1–2** |
| Guerrier Runique | 1 | 4 + 3 | **1–8** | 1 | 2 + 2 | **1–5** |

Remarques :
- Avec 6 choix seulement aux niv. 8‑10, maximiser à la fois main et pioche dans le pool ‑M reste possible partout (au plus 3 + 2 = 5 items ≤ 6 choix).
- En **classe secondaire** (pool ‑M à 2 choix/niveau dès le niv. 1, 14 choix aux niv. 1‑7), les plafonds « ‑M » ci-dessus s'appliquent seuls : par ex. un Gardien secondaire n'apporte que +3 main.
- Profils marquants : le Gardien démarre main 4 mais **pioche 0** (et ne peut monter qu'à 1) — il joue sur sa grosse main de départ ; le Trapper démarre **main 0** (main max 3, la plus faible du jeu) ; le Guerrier Runique garde la meilleure pioche (5, cohérent avec le deck-building).

---

## Anomalies relevées en passant

- La **Sorcière** a un `ItemChoice` vide (id `AQmRm5kfcKCJcGxS`, aucun niveau, pool vide) dans `classes-fq8/witch.json` — vestige à nettoyer.
- `draft.json` : les 9 cartes de test n'ont pas de `maxSameCard` (null) — sans impact en jeu, mais à garder hors des patterns livrés.
- Tailles des pools primaires légèrement inégales : 22 items pour la plupart, 23 (Sorcière), 24 (Maître d'Armes), 25 (Moine).
- Starter heroes hétérogènes sur `fq.cards` : 3 surchargent (Gardien, Moine, Trapper), 3 écrivent explicitement 1/1 (Maître d'Armes, Sorcière, Guerrier Runique), 3 ne définissent rien et reposent sur le défaut du schéma (Élémentaliste, Illusionniste, Mage Blanc) — si le défaut change un jour, seuls ces trois derniers bougeront.
