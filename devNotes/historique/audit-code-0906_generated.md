# Audit de code — 2026-09-06 (tâche planifiée)

Audit automatique et en lecture seule. **Aucune modification n'a été appliquée** : le
dépôt n'était pas clean au moment de l'audit (voir plus bas), ce qui interdit toute
modification par consigne de la tâche planifiée. Pendant l'audit, l'état du répertoire
de travail a continué à changer (des fichiers modifiés sont revenus à HEAD, un nouveau
fichier a été marqué supprimé) — signe d'un travail en cours en parallèle. Rien n'a été
touché.

## État du dépôt au moment de l'audit

- Branche `final-quest-8`, à jour avec `origin/final-quest-8`.
- `npm run lint` : aucune erreur.
- `npm test` : 104 fichiers, 2861 tests, tous verts (~72s).
- Répertoire de travail non clean : `src/domain/engine/aura.js` et
  `tests/decks/aura-card.test.js` en état ajouté-puis-supprimé (staged add / working
  tree delete), `devNotes/todo_caracterisation_generated.md` supprimé (staged). L'état a
  évolué en cours d'audit (modifications sur `spellbook-window.js/css` et son test vues
  puis disparues) : une session de travail était probablement active en parallèle.

## Audit des commits de la semaine (2026-08-30 → 2026-09-05)

59 commits sur la branche, tous `feat`/`fix`/`chore: 3.0.0`. Volume dominant :
caractérisation/équilibrage des cartes de classe (nombreuses passes), plus deux chantiers
de fond :
- **Refonte du grimoire** (déjà documentée comme terminée dans la mémoire de session) :
  `spellbook-window.js` (+982 lignes, nouveau), `spellbook-grid.js` (+237, nouveau),
  templates associés.
- **Combat/ciblage** : attaque d'opportunité (`opportunity-attack.js`, +159),
  cartes préparées (`prepared-card.js`, +245, nouveau), placement de sbires en zone
  (`minion.js`, +221), distance dans le ciblage, facing automatique
  (`facing.js`, +81, nouveau), `card-condition.js` fortement étendu (+528, plus grosse
  diff de la semaine).

Diffstat complet sur `src/` : 49 fichiers, +3993/-827 lignes.

Point notable : le commit `f73535a "Code mort"` (2026-09-02) a bien supprimé du code et
des clés de traduction inutilisées plutôt que d'en accumuler — bon signe d'hygiène en
cours de sprint. Aucun `TODO`/`FIXME`/`console.log` résiduel trouvé dans `src/`.

Conformément à la consigne mémorisée sur ce projet, aucune donnée de carte (dégâts,
coûts, équilibrage) n'a été auditée en tant que « bug » — seule la qualité du code a été
examinée.

## Constats — qualité du code

Revue ciblée sur les fichiers les plus modifiés cette semaine (`card-condition.js`,
`spellbook-window.js`, `opportunity-attack.js`, `minion.js`, `dnd5e.hook.js`,
`prepared-card.js`, `spellbook-grid.js`, `card-actions.js`). Impression générale : code
en bon état pour un sprint de 59 commits — la nouvelle logique (attaque d'opportunité,
cartes préparées, grille du grimoire, placement de sbires) est bien documentée quant aux
raisons des ordres d'exécution non triviaux. Les deux bugs confirmés ci-dessous
préexistaient et ont simplement été traversés par l'extension de ces fichiers, pas
introduits cette semaine.

### 1. [Confirmé, sévérité haute] Crash si un sbire référencé est absent du compendium

**Fichier :** [src/domain/engine/shared/minion.js:124](src/domain/engine/shared/minion.js#L124)

```js
let actorData = JSON.parse(JSON.stringify(minionPack.find(m => m.name === minion?.name)));
if (actorData) {
```

`find()` renvoie `undefined` si aucun sbire ne correspond au nom. `JSON.stringify(undefined)`
renvoie la valeur `undefined` (pas une chaîne), et `JSON.parse(undefined)` coerce
l'argument en la chaîne `"undefined"`, qui n'est pas du JSON valide → `SyntaxError`. Le
garde `if (actorData)` juste en dessous est clairement prévu pour gérer ce cas (sbire
manquant/mal nommé dans `minions-fq8`), mais il est inatteignable : l'exception est levée
avant. Toute carte référençant un nom de sbire absent ou mal orthographié fait planter la
création de sbire au lieu de ne rien créer silencieusement.

**Correctif suggéré :**
```js
const found = minionPack.find(m => m.name === minion?.name);
if (!found) return;
const actorData = JSON.parse(JSON.stringify(found));
```

### 2. [Confirmé structurellement, sévérité moyenne-haute] Accumulation et ré-application des résultats de dégâts sur plusieurs jets

**Fichier :** [src/hook/integration/dnd5e.hook.js:177-248](src/hook/integration/dnd5e.hook.js#L177)

`resultArray` est déclaré une fois avant la boucle `for (let roll of rolls)` et n'est
jamais réinitialisé ni découpé — seulement alimenté par `push`. À chaque itération, le
code réapplique `applyActorHpModification` sur **toutes** les entrées accumulées
jusque-là (y compris celles des itérations précédentes), et rappelle
`Damage.displayResult` / `logCardPlayed` avec le tableau grandissant. Si le hook
`dnd5e.rollDamageV2` est un jour déclenché avec `rolls.length > 1` (plusieurs jets de
dégâts sur une même activité), les PV des cibles des jets précédents seraient modifiés
plusieurs fois, avec des entrées de journal et de chat dupliquées. Je n'ai pas pu
confirmer si ce système déclenche actuellement ce hook avec plus d'un jet en pratique —
c'est donc un défaut structurel avéré à la lecture, mais son impact réel dépend d'un
scénario dnd5e que je n'ai pas vérifié.

**Correctif suggéré :** ne traiter que les entrées ajoutées durant l'itération courante
(capturer `resultArray.length` avant le `push` puis itérer sur le
`slice(previousLength)`), ou sortir les appels d'application/affichage/journalisation de
la boucle pour qu'ils s'exécutent une seule fois sur le tableau complet.

### 3. [À vérifier, faible priorité] Risque de contenu périmé dans l'aperçu du grimoire

**Fichier :** [src/domain/interface/window/spellbook-window.js:923-964](src/domain/interface/window/spellbook-window.js#L923)

`#schedulePreview` (survol, délai 250ms) et `#showPreview` (focus, immédiat) appellent
tous deux `renderPreviewCard` de façon asynchrone. Le garde existant
(`current !== previewElement`) protège contre le remplacement du conteneur par un
re-rendu de PART, mais pas contre un second déclenchement plus rapide (focus sur la
carte B) qui se résout pendant qu'un rendu plus ancien (survol de la carte A) est encore
en vol et se termine après coup, écrasant l'aperçu de B par le contenu périmé de A.
Correctif suggéré : un jeton/compteur de génération par requête d'aperçu, ignorer un
rendu dont le jeton n'est plus le courant.

### 4. Points de duplication à surveiller (pas des bugs, mais à ne pas laisser diverger)

- [src/domain/interface/window/spellbook-window.js:121-150](src/domain/interface/window/spellbook-window.js#L121) —
  `buildCardRenderData` est une copie assumée et documentée de
  `CardSelection.buildCardRenderData` (pour éviter une dépendance sur
  `socketlib.hook.js`). Toute future évolution du rendu de carte (nouveau badge, nouveau
  champ) devra être répercutée aux deux endroits ; rien ne le garantit automatiquement.
- [src/domain/interface/window/card-actions.js:478-488](src/domain/interface/window/card-actions.js#L478)
  vs [:552-563](src/domain/interface/window/card-actions.js#L552) — la validation du
  nombre d'emplacements de sbires lit `firstChoice.minions` (premier choix de la carte),
  alors que la vérification du plafond et l'invocation elle-même lisent
  `cardContent.minions` (choix effectivement sélectionné). Pas de bug confirmé — il
  faudrait qu'une carte à choix multiples déclare un `minions` différent sur un choix
  non-premier pour que ça diverge, ce que je n'ai pas vérifié côté données de cartes —
  mais l'incohérence de source mérite un contrôle rapide.

### Fichiers examinés sans constat

`card-condition.js` (pourtant la plus grosse diff de la semaine, 528 lignes) tient bien
la route : la logique de bornes de tour/round est correcte, et les prédicats de ciblage
géométriques, bien que structurellement similaires entre eux, encodent chacun une règle
distincte (alignement, diagonale, carré englobant, unilatéral) — pas de duplication à
extraire. `opportunity-attack.js` et `prepared-card.js` sont solides ; leurs mécanismes
de synchronisation (marqueur module-level + `WeakMap` par activité pour l'un, mutex pour
l'autre) sont des solutions déjà réfléchies aux problèmes d'ordonnancement asynchrone
qu'ils documentent eux-mêmes. `spellbook-grid.js` : fonctions pures, rien à signaler.

## À faire au prochain passage (une fois le dépôt clean)

1. Corriger le crash `minion.js:124` (correctif trivial, à faible risque).
2. Vérifier si `dnd5e.rollDamageV2` peut être déclenché avec plusieurs jets ; si oui,
   corriger l'accumulation dans `dnd5e.hook.js:177-248`.
3. Envisager un jeton de génération pour l'aperçu du grimoire
   (`spellbook-window.js:923-964`).
4. Recontrôler `firstChoice.minions` vs `cardContent.minions` dans `card-actions.js` à
   la lumière des données de cartes réelles.
