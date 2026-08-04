<!-- refreshed: 2026-08-04 -->
# Points de vigilance de la codebase

**Date d'analyse :** 2026-08-04

## Dette technique

**Gestion d'erreur incomplète pour les callbacks de hook non enregistrés :**
- Problème : l'erreur non gérée « Foundry VTT | Unregistered callback for deleteCard hook » apparaît dans les logs (devNotes/TODO.md v2.0.1)
- Fichiers : `src/hook/socket-lib.js` (ligne 20 — TODO sur le déplacement de deleteToken)
- Impact : les callbacks de hook peuvent échouer silencieusement ou lever des erreurs non gérées affectant la stabilité du jeu
- Piste de correction : s'assurer que tous les callbacks socket sont correctement enregistrés et envelopper toutes les invocations de hook dans une gestion d'erreur

**Appels `actor.update()` séquentiels multiples au lieu d'updates groupées :**
- Problème : `src/domain/utils/consumption-utils.js` fait 5 appels `actor.update()` séparés dans `consumeResources()` (lignes 62-99)
- Fichiers : `src/domain/utils/consumption-utils.js` (lignes 62-99)
- Impact : mauvaises performances pendant le jeu de carte, écritures multiples en base au lieu d'une seule update groupée
- Piste de correction : rassembler toutes les updates dans un seul objet et appeler `actor.update()` une fois en fin de `consumeResources()`

**Accès null/undefined non sécurisés, sans garde :**
- Problème : plusieurs fichiers accèdent à `game.canvas?.scene?.tokens` et à des propriétés d'acteur sans vérification null
- Fichiers : `src/domain/utils/consumption-utils.js` (ligne 138), `src/hook/item-use.js` (ligne 74)
- Impact : erreurs de référence nulle potentielles si le canvas/la scène n'est pas chargé
- Piste de correction : ajouter des vérifications null complètes avant d'accéder aux propriétés imbriquées

**État global mutable via l'objet window :**
- Problème : `window.FqCardEngineModule` exposé comme global mutable (lignes 36-75 dans `src/init-engine.js`)
- Fichiers : `src/init-engine.js` (lignes 36-42)
- Impact : n'importe quel code peut modifier le comportement du module ; difficile de tracer les changements d'état
- Piste de correction : restreindre à des exports en lecture seule ou utiliser un meilleur pattern d'encapsulation

**Messages d'erreur non définis pour la validation de formulaire :**
- Problème : la validation de formulaire lève une `FormError` mais des chaînes comme « Parenthèse fermante attendue » et « Expression incomplète » sont codées en dur, sans clés i18n
- Fichiers : `src/domain/utils/display-card.js` (lignes 156, 172, 191, 206)
- Impact : messages d'erreur non localisés ; difficiles à maintenir
- Piste de correction : déplacer toutes les chaînes d'erreur vers `lang/en.json` et `lang/fr.json`

**Enregistrement socket non sécurisé, sans gestion d'erreur :**
- Problème : l'enregistrement socket dans `src/hook/socket-lib.js` (ligne 20) a un commentaire TODO indiquant qu'il devrait être déplacé et n'a aucune gestion d'erreur
- Fichiers : `src/hook/socket-lib.js` (lignes 2, 20)
- Impact : les échecs socket échouent silencieusement ou corrompent l'état de jeu en multijoueur
- Piste de correction : ajouter un try/catch autour de l'enregistrement socket et prévoir un comportement de repli

## Bugs connus

**Callback de hook deleteCard non enregistré :**
- Symptômes : erreur console « Unregistered callback for deleteCard hook » pendant les opérations de carte
- Fichiers : `src/hook/socket-lib.js`
- Déclencheur : supprimer une carte alors que plusieurs clients sont connectés
- Contournement : redémarrer FoundryVTT ou recharger le module

**Absence de gestion des fichiers d'effet visuel introuvables :**
- Problème : aucune validation que les fichiers d'effet visuel existent (référencés dans `src/domain/system/fx/visualEffectData.js`)
- Fichiers : `src/domain/system/fx/visualEffectData.js` (toutes les entrées), `src/hook/item-use.js` (ligne 17)
- Cause : si des fichiers webm manquent, Sequencer échoue silencieusement à l'enregistrement
- Recommandation : ajouter une validation d'existence des fichiers au chargement du module

## Considérations de sécurité

**Aucune validation des expressions `eval` custom :**
- Risque : les choix de carte contiennent des champs `customEval` qui exécutent du JavaScript arbitraire (lignes 313-340 dans `src/domain/utils/fq-utils.js`)
- Fichiers : `src/domain/utils/fq-utils.js` (lignes 316-340), `src/domain/sheet/cards/fq-card-sheet.js` (lignes 525-553)
- Atténuation actuelle : seuls les MJ peuvent éditer les cartes avec des evals custom
- Recommandations :
  - Whitelister les fonctions autorisées dans le scope de l'eval custom
  - Implémenter un bac à sable d'eval ou utiliser un parser d'expression au lieu de `eval()`
  - Valider que seuls les MJ peuvent créer/éditer des cartes avec du code custom

**Messages socket non authentifiés :**
- Risque : les messages socket dans `src/hook/socket-lib.js` (ligne 20) n'ont pas d'authentification ; tout client connecté pourrait déclencher deleteToken
- Fichiers : `src/hook/socket-lib.js`
- Atténuation actuelle : nécessite une connexion socket au monde de jeu
- Recommandations : ajouter des vérifications de permission `game.user` dans les handlers socket

## Goulots d'étranglement de performance

**Opérations de remplacement de chaînes synchrones sur du contenu de carte volumineux :**
- Problème : `replaceCardContentXAndYValue()` parcourt récursivement tout l'objet carte et fait des remplacements de chaînes (lignes 397-403 dans `src/domain/utils/fq-utils.js`)
- Fichiers : `src/domain/utils/fq-utils.js` (lignes 397-503)
- Cause : récursion profonde + opérations regex sans cache
- Piste d'amélioration :
  - Mettre en cache les patterns regex compilés
  - Utiliser un parcours en une seule passe au lieu de la récursion
  - Évaluer paresseusement uniquement les champs contenant des tokens XXX/YYY

**Création de messages de chat sans regroupement :**
- Problème : appels multiples à `ChatMessage.create()` dans les vérifications de validation (lignes 104-164 dans `src/domain/utils/consumption-utils.js`)
- Fichiers : `src/domain/utils/consumption-utils.js`
- Cause : chaque avertissement/erreur crée un message de chat séparé et une écriture en base
- Piste d'amélioration : regrouper les messages, utiliser des notifications toast pour les avertissements non persistants

**Recherche de token sans cache :**
- Problème : `game.canvas?.scene?.tokens?.find()` appelé de façon répétée pendant la validation du jeu de carte
- Fichiers : `src/domain/utils/consumption-utils.js` (ligne 138), `src/hook/item-use.js` (ligne 74)
- Cause : scan linéaire du tableau de tokens à chaque opération
- Piste d'amélioration : mettre en cache la référence de token ou utiliser `game.canvas.tokens.get()`

## Zones fragiles

**Dépendance à l'API FoundryVTT v14 — migration EffectChangeData :**
- Fichiers : `src/domain/system/cards/card-fq-system.mjs` (lignes 29-32, 156-168)
- Pourquoi c'est fragile :
  - Correctif récent (commit 253c2f4) a changé le champ `mode` en `type` + ajouté `priority` pour la compatibilité v14
  - Les fichiers JSON de deck packés ont aussi été mis à jour avec le nouveau schéma (tous les fichiers de `packs/_source/decks-pattern-fq8/`)
  - Tout changement futur de l'API FoundryVTT sur les effets nécessitera une régénération similaire des packs de cartes
- Modification sûre :
  - Mettre à jour le schéma d'abord, avant de changer les données packées
  - Ajouter une fonction de migration convertissant l'ancien schéma vers le nouveau
  - Tester avec les formats de carte ancien et nouveau
- Couverture de test : seul le format actuel est testé ; aucun test de rétrocompatibilité

**Logique d'exécution des choix/effets de carte avec eval custom :**
- Fichiers : `src/domain/utils/fq-utils.js` (tout le fichier, 638 lignes), `src/domain/utils/play-card.js` (137 lignes)
- Pourquoi c'est fragile :
  - Forte dépendance à des propriétés dynamiques (`cardContent.xvalue`, `cardContent.yvalue`, remplacements `XXX`/`YYY`)
  - Multiples marqueurs TODO (lignes 17, 84, 135, 138, 155, 165, 190, 310) indiquant un refactoring incomplet
  - Les erreurs d'eval custom sont attrapées mais seulement loguées en console (ligne 336)
- Modification sûre :
  - Isoler chaque exécution de choix dans un try/catch avec messages d'erreur visibles par l'utilisateur
  - Utiliser des copies immuables de carte pendant le traitement
  - Ajouter un logging détaillé pour chaque étape d'exécution
- Couverture de test : `tests/utils/fq-utils.test.js` (158 lignes) a un peu de couverture mais des lacunes sur les cas d'erreur

**Couplage fort du système de hooks :**
- Fichiers : `src/hook/item-use.js`, `src/hook/combat.js`, `src/hook/trading-cards.js`, `src/hook/render-token.js`
- Pourquoi c'est fragile :
  - Les hooks sont directement importés dans les points d'entrée de `module.json`
  - Les hooks du système D&D5e (`dnd5e.preUseActivity`, `dnd5e.activityConsumption`, `dnd5e.rollDamageV2`) cassent si le système change
  - Aucune validation de hook ni vérification de version
- Modification sûre :
  - Ajouter des vérifications d'existence de hook avant l'enregistrement
  - Envelopper tous les handlers de hook dans un try/catch avec repli
  - Documenter la version minimale de d&d5e requise (actuellement 5.3.0-5.9.99)
- Couverture de test : aucun test du comportement des hooks ; risque élevé de régression

**Gestion de l'état de l'UI du plateau de main (hand board) :**
- Fichiers : `src/domain/board/hand-board.js` (568 lignes)
- Pourquoi c'est fragile :
  - Manipulation DOM complexe avec des sélecteurs façon jQuery
  - Commentaire ligne 178 : « //TODO Faire mieux que ça » — indice de code smell
  - Aucune validation des limites de taille de main (`handMax: 10` codé en dur dans `src/init-engine.js` ligne 42)
  - Accès DOM direct sans framework ; vulnérable aux changements d'UI Foundry
- Modification sûre :
  - Ajouter des tests unitaires pour les transitions d'état de la main
  - Utiliser FormData ou un état structuré au lieu de requêtes DOM
  - Valider la taille de main avant d'ajouter des cartes
- Couverture de test : aucun test unitaire ; seulement le test d'intégration dans `tests/window/play-card.test.js`

**Calcul des valeurs d'affichage de carte :**
- Fichiers : `src/domain/utils/display-card.js` (227 lignes)
- Pourquoi c'est fragile :
  - Parser d'expression complexe avec appariement manuel des parenthèses (lignes 100-210)
  - Multiples messages d'erreur codés en dur sans i18n
  - Remplacement de variables XXX/YYY mélangé à l'évaluation arithmétique
  - Commentaire ligne 111 : « TODO Utiliser une librairie externe »
- Modification sûre :
  - Remplacer le parser custom par une bibliothèque d'expressions mathématiques (ex. mathjs)
  - Extraire les messages d'erreur vers l'i18n
  - Ajouter des tests unitaires complets pour les cas limites
- Couverture de test : aucun test dédié ; logique testée indirectement via les tests fq-utils

## Lacunes de couverture de test

**Les classes de feuilles (actor/item/cards) n'ont pas de tests :**
- Non testé : rendu de feuille, soumission de formulaire, mises à jour acteur/objet
- Fichiers :
  - `src/domain/sheet/actor/fq-character-sheet.js` (44 lignes)
  - `src/domain/sheet/actor/fq-npc-sheet.js` (36 lignes)
  - `src/domain/sheet/cards/fq-card-sheet.js` (560 lignes)
  - `src/domain/sheet/cards/fq-cards-sheet.js` (123 lignes)
  - `src/domain/sheet/items/fq-item-sheet.js` (15 lignes)
- Risque : régressions d'UI, corruption de données de formulaire, rupture silencieuse du rendu
- Priorité : **Haute** — les feuilles sont visibles par l'utilisateur et critiques pour la saisie de données

**Les implémentations de hooks n'ont pas de tests :**
- Non testé : exécution de hook, intégration dnd5e, communication socket
- Fichiers :
  - `src/hook/item-use.js` (139 lignes)
  - `src/hook/combat.js` (226 lignes)
  - `src/hook/render-token.js` (110 lignes)
  - `src/hook/trading-cards.js` (50 lignes)
  - `src/hook/socket-lib.js` (21 lignes)
- Risque : échecs silencieux en jeu, désync multi-clients, perte de données
- Priorité : **Haute** — les hooks sont des systèmes de gameplay cœur

**L'état de l'UI du hand board n'a pas de tests :**
- Non testé : ajout/retrait de carte, dimensionnement de main, réordonnancement, glisser-déposer
- Fichiers : `src/domain/board/hand-board.js` (568 lignes)
- Risque : rupture de l'UI de main, cartes perdues, régression du glisser-déposer
- Priorité : **Moyenne** — partiellement couvert par le test play-card mais nécessite une suite dédiée

**Les modèles système (actors/items/cards) n'ont pas de tests de schéma :**
- Non testé : validation de schéma, valeurs par défaut, migrations
- Fichiers :
  - `src/domain/system/actors/character-fq.mjs`
  - `src/domain/system/actors/npc-fq.mjs`
  - `src/domain/system/actors/creature-fq.mjs`
  - `src/domain/system/items/item-action-fq.mjs`
  - `src/domain/system/cards/card-fq-system.mjs` (186 lignes)
  - `src/domain/system/cards/cards-fq-system.mjs` (28 lignes)
- Risque : acceptation de données invalides, échecs de migration après mises à jour Foundry
- Priorité : **Haute** — le changement EffectChangeData v14 montre que c'est critique

**Le chemin de code eval custom n'a pas de tests :**
- Non testé : succès/échec de l'eval, rendu des messages d'erreur, substitution de variables
- Fichiers : `src/domain/utils/fq-utils.js` (lignes 313-340, exécution de l'eval custom)
- Risque : les erreurs d'eval custom font planter l'exécution de carte, le joueur ne voit aucun retour
- Priorité : **Moyenne** — n'affecte que les MJ mais bloque les fonctionnalités de carte avancées

**Les interactions canvas/token n'ont pas de tests :**
- Non testé : sélection de token, calcul de distance, ciblage
- Fichiers : `src/domain/utils/canvas-utils.js` (48 lignes), `src/domain/utils/consumption-utils.js` (lignes 138-165)
- Risque : la validation de ciblage casse, cartes jouées à des distances impossibles
- Priorité : **Moyenne** — affecte l'équilibrage du gameplay

**Exigence de couverture complète pour la v2.0.1 :**
- Fichiers de test actuels : 7 (seulement 7 suites de test)
- Couverture de lignes actuelle : ~30 % (5529 lignes au total, ~1700 lignes testées)
- Objectif du milestone de durcissement : 80 %+ de couverture unitaire OU des tests de non-régression à haute confiance
- Manquant : 30 fichiers source, seulement 7 ont une couverture
- Bloquant : impossible de passer à v2.0.2+ tant que les lacunes ne sont pas comblées (voir devNotes/TODO.md lignes 10-12)

## Limites de mise à l'échelle

**Représentation de la main en mémoire :**
- Capacité actuelle : max 10 cartes par main (codé en dur dans `src/init-engine.js` ligne 42)
- Limite : les performances UI se dégradent avec l'animation en éventail au-delà de 10 cartes
- Piste de mise à l'échelle :
  - Rendre `handMax` configurable via les réglages du module
  - Virtualiser le rendu des cartes si la taille dépasse un seuil
  - Utiliser une vue paginée pour les grandes mains

**Remplacement de chaînes de carte sans bornes :**
- Capacité actuelle : non testé sur des cartes aux propriétés profondément imbriquées ou aux longues expressions XXX/YYY
- Limite : le parcours récursif dans `recalculatedWithWYValue()` pourrait provoquer un stack overflow sur des données de carte malformées
- Piste de mise à l'échelle :
  - Ajouter une limite de profondeur à la récursion
  - Valider le schéma de carte avant traitement
  - Utiliser un parcours itératif avec pile au lieu de la récursion

## Dépendances à risque

**Compatibilité socketlib :**
- Risque : l'implémentation de communication socket (lignes 2, 20 dans `src/hook/socket-lib.js`) utilise `socketlib` mais il n'est enregistré qu'en « requires »
- Impact : le jeu casse si socketlib manque ; le jeu de carte multi-clients échoue silencieusement
- Plan de migration :
  - Ajouter un repli pour socketlib absent (mode mono-client MJ seulement)
  - Ajouter une validation au démarrage que socketlib est chargé
  - Documenter que socketlib est obligatoire pour le multijoueur

**Dépendance lib-wrapper :**
- Risque : probablement utilisé pour le hooking de méthode (importé mais usage peu clair)
- Impact : si lib-wrapper n'est pas chargé, les hooks peuvent ne pas se déclencher
- Plan de migration : documenter les dépendances de bibliothèques et les exigences de version

**Compatibilité dnd5e 5.3.0-5.9.99 :**
- Risque : plage de compatibilité très large ; les futures versions 6.0+ casseront
- Impact : nécessite un plan de migration pour dnd5e v6+ à sa sortie
- Plan de migration :
  - Restreindre à une plage plus étroite pour 2.0.x (ex. 5.3.0-5.3.x)
  - Suivre le changelog de dnd5e pour les changements de hooks
  - Établir une branche v3.x séparée pour les futures versions majeures de Foundry

**Sequencer optionnel mais recommandé :**
- Risque : effets visuels silencieusement désactivés si Sequencer manque ; peu clair pour les utilisateurs
- Impact : joueurs déconcertés par l'absence d'animations de sort
- Plan de migration : ajouter des avertissements clairs en console si Sequencer n'est pas installé mais que des cartes FQ utilisent des effets

## Fonctionnalités critiques manquantes

**Aucun système de migration pour les mises à jour de deck packé :**
- Problème : chaque mise à jour v13→v14 nécessite un re-packaging manuel des fichiers JSON de deck
- Bloque : mises à jour automatisées, patching sans interruption
- Impact sur les utilisateurs actuels : doivent régénérer manuellement les decks si un correctif nécessite un changement de schéma

**Aucune rétrocompatibilité pour l'ancien schéma de carte :**
- Problème : les cartes sauvegardées au format v13 ne se chargeront pas en v14
- Bloque : le chemin de mise à jour pour les mondes existants
- Impact : perte de données si l'utilisateur met à jour le module sans régénération préalable des decks

**Aucune récupération d'erreur dans le jeu de carte :**
- Problème : si l'exécution d'une carte échoue (erreur d'eval custom, cible manquante, etc.), l'état de la carte peut être corrompu
- Bloque : gestion d'erreur robuste, expérience joueur
- Impact : les joueurs sont forcés de recharger ou redémarrer le jeu

**Aucun système d'annulation (undo) pour les jeux de carte :**
- Problème : l'exécution d'une carte est immédiate et irréversible
- Bloque : récupération d'erreur du joueur, fluidité du gameplay
- Impact : les jeux de carte accidentels causent des délais de session pour la récupération par le MJ

## FAIT / Problèmes connus issus des devNotes

Depuis `devNotes/TODO.md` :
- Items bloquants v2.0.1 (lignes 8-21) :
  - Erreur de hook deleteCard non enregistré à corriger
  - Couverture de tests de non-régression nécessaire (pas encore de cible précise)
  - Tests de haut niveau avec toutes les combinaisons de cartes nécessaires
  - Objectif de couverture unitaire >80 % OU suite de non-régression complète
  - Vérification de compatibilité v14 incomplète
  - Affichage SVG du visualiseur de carte non implémenté
  - Versions des dépendances de modules à mettre à jour (ligne 16)

---

*Audit des points de vigilance : 2026-08-04*
