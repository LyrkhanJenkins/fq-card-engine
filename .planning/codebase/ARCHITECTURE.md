<!-- refreshed: 2026-08-04 -->
# Architecture

**Date d'analyse :** 2026-08-04

## Vue d'ensemble du système

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Jeu FoundryVTT                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  Couche UI (Feuilles & plateau de main)                                      │
│  ├─ FqCharacterSheet (`src/domain/sheet/actor/fq-character-sheet.js`)        │
│  ├─ FqNpcSheet (`src/domain/sheet/actor/fq-npc-sheet.js`)                    │
│  ├─ FqItemSheet (`src/domain/sheet/items/fq-item-sheet.js`)                  │
│  ├─ FqCardsSheet / FqCardSheet (`src/domain/sheet/cards/`)                   │
│  └─ HandBoard (`src/domain/board/hand-board.js`) - Affichage de la main      │
├──────────────────────────────────────────────────────────────────────────────┤
│  Couche Domaine / Logique métier                                             │
│  ├─ PlayCard (`src/domain/utils/play-card.js`) - Exécution des cartes        │
│  ├─ DeckUtils (`src/domain/utils/deck-utils.js`) - Gestion des decks         │
│  ├─ FQUtils (`src/domain/utils/fq-utils.js`) - Logique FQ cœur               │
│  ├─ DamageUtils (`src/domain/utils/damage-utils.js`) - Dégâts & effets       │
│  ├─ DisplayCard (`src/domain/utils/display-card.js`) - Rendu des cartes       │
│  ├─ ConsumptionUtils (`src/domain/utils/consumption-utils.js`) - Ressources  │
│  ├─ CanvasUtils (`src/domain/utils/canvas-utils.js`) - Effets de dessin       │
│  ├─ FxUtils (`src/domain/utils/fx-utils.js`) - Effets visuels (Sequencer)    │
│  └─ FqConstants (`src/domain/utils/fq-constants.js`) - Constantes de jeu      │
├──────────────────────────────────────────────────────────────────────────────┤
│  Couche Intégration système (Modèles de données & Hooks)                     │
│  ├─ CharacterDataFQ/NPCDataFQ (`src/domain/system/actors/`) - Schéma acteur  │
│  ├─ ActionFQTemplate (`src/domain/system/items/item-action-fq.mjs`) - Objet  │
│  ├─ CardFqSystem/CardsFqSystem (`src/domain/system/cards/`) - Schéma carte    │
│  ├─ Hooks (Combat, Trading Cards, Token, Item Use) (`src/hook/`)            │
│  └─ Communication socket (`src/hook/socket-lib.js`)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Cœur du moteur                                                              │
│  ├─ Initialisation (`src/init-engine.js`) - Setup & cycle de vie du module   │
│  ├─ Configuration (`CONFIG.FqCardEngine`) - Options globales                 │
│  ├─ FormError (`src/core/error/form-error.model.js`) - Erreurs custom       │
│  └─ SchemaUtils (`src/core/utils/schema.utils.js`) - Fusion de schémas        │
├──────────────────────────────────────────────────────────────────────────────┤
│  Système FoundryVTT (dnd5e) & Modules (socketlib, lib-wrapper)              │
│  Documents : Actor, Item, Cards, Card, ChatMessage, User, Combat            │
│  Hooks : init, setup, ready, render*, update*, create*, delete*, etc.       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Responsabilités des composants

| Composant | Responsabilité | Fichier |
|-----------|----------------|---------|
| **HandBoard** | Affiche la main de cartes du joueur, rend l'UI des cartes, gère l'interaction (clic/glisser-déposer) | `src/domain/board/hand-board.js` |
| **PlayCard** | Exécute les effets de carte : valide l'usage, calcule les valeurs (X/Y), applique dégâts/soins, gère la défausse | `src/domain/utils/play-card.js` |
| **DeckUtils** | Gère les decks/mains/piles des joueurs : création, mises à jour, synchro entre utilisateurs | `src/domain/utils/deck-utils.js` |
| **FQUtils** | Logique de jeu FQ cœur : bonus de caractéristiques, validation du contenu de carte, application d'effets, vérifs de compétences passives | `src/domain/utils/fq-utils.js` |
| **DamageUtils** | Calcule et applique dégâts/soins aux acteurs, crée des sbires temporaires, ajoute des effets actifs | `src/domain/utils/damage-utils.js` |
| **DisplayCard** | Extrait et formate les données d'affichage de carte : image, nom, description, bulles de stats pour le rendu SVG | `src/domain/utils/display-card.js` |
| **Classes de feuilles** | UI personnalisée pour la config acteur/objet/carte via le pattern ApplicationV2 de FoundryVTT | `src/domain/sheet/actor/`, `src/domain/sheet/items/`, `src/domain/sheet/cards/` |
| **Modèles de données** | Définitions de schéma pour étendre les documents FoundryVTT avec des champs FQ (actions, mana, zèle) | `src/domain/system/` |
| **Gestionnaires de hooks** | Écouteurs d'événements pour les tours de combat, échanges de cartes, rendu de token, usage d'objet | `src/hook/` |
| **Socket Lib** | Enregistre les handlers socket.io pour la communication multi-clients (mises à jour MJ → joueurs) | `src/hook/socket-lib.js` |

## Aperçu du pattern

**Global :** Architecture événementielle basée sur les Hooks, avec des utilitaires de domaine

**Caractéristiques clés :**
- **Les Hooks FoundryVTT** pilotent tous les changements d'état : tours de combat, usage d'objet, création/suppression de carte
- **Les classes utilitaires** contiennent la logique métier pour l'exécution de carte, la gestion de deck, le calcul de dégâts
- **La communication socket** coordonne les jeux de carte et mises à jour de deck multi-utilisateurs
- **L'extension de schéma** (via lib-wrapper) injecte les champs FQ dans les documents Actor/Item/Card de dnd5e
- **Le feedback UI immédiat** via re-rendu de HandBoard sur mise à jour des documents
- **Les instances HandBoard à état** conservent une référence à la main du joueur courant (document Cards)

## Couches

**Couche UI :**
- Rôle : afficher et interagir avec les cartes, stats d'acteur, dialogues
- Emplacement : `src/domain/board/`, `src/domain/sheet/`, `src/templates/`
- Contient : classe HandBoard, classes de feuilles, templates Handlebars, gestionnaires d'événements
- Dépend de : DisplayCard, FQUtils (pour les données), APIs UI de FoundryVTT
- Utilisée par : les Hooks (ready, updateCard, createCard), les clics/glissers de l'utilisateur

**Couche Domaine / Logique métier :**
- Rôle : mécaniques de jeu FQ cœur (effets de carte, dégâts, gestion de deck, validation)
- Emplacement : `src/domain/utils/`, `src/domain/system/`
- Contient : PlayCard, DeckUtils, FQUtils, DamageUtils, DisplayCard, ConsumptionUtils, FxUtils
- Dépend de : FqConstants, documents FoundryVTT (Actor, Item, Cards, Card)
- Utilisée par : les Hooks, les dialogues de HandBoard, les boutons de PlayDialog

**Couche Intégration système :**
- Rôle : faire le pont entre le système dnd5e de FoundryVTT et les mécaniques FQ
- Emplacement : `src/hook/`, `src/domain/system/`, `src/init-engine.js`
- Contient : gestionnaires de hooks, schémas de modèles de données, enregistrement socket, fusion de config
- Dépend de : l'API Hooks de FoundryVTT, lib-wrapper pour le patching de schéma
- Utilisée par : le moteur FoundryVTT pendant le cycle de vie des documents

**Couche Cœur :**
- Rôle : utilitaires fondamentaux et gestion d'erreurs
- Emplacement : `src/core/`
- Contient : FormError, SchemaUtils
- Dépend de : rien
- Utilisée par : PlayCard (FormError), init-engine (SchemaUtils)

## Flux de données

### Chemin principal : jouer une carte

1. **Clic sur une carte en main** (`src/domain/board/hand-board.js:cardClicked`)
   - L'utilisateur clique une carte dans l'UI HandBoard
   - Dispatch selon `CONFIG.FqCardEngine.options.cardClick` (play_card, open_hand, card_image)

2. **Ouverture du dialogue de jeu** (`src/init-engine.js:playDialog`)
   - Rend le dialogue avec image, nom, effets du premier choix, cibles, stats du personnage
   - Calcule les modificateurs X/Y d'après les bonus de caractéristiques
   - Pré-charge les piles de défausse disponibles

3. **Soumission du formulaire par le joueur** (callback du dialogue)
   - Extrait les données du formulaire (pile de défausse choisie, choix d'effet, valeurs X/Y)
   - Valide les emplacements de sbires et les variables

4. **Exécution de l'effet de carte** (`src/domain/utils/play-card.js:callBackplayCard`)
   - Remplace les valeurs de bonus de caractéristiques dans le contenu de carte
   - Remplace les valeurs X/Y fournies par l'utilisateur
   - Valide que la carte peut être utilisée (a des choix, coûts abordables)
   - Vérifie si la carte est rejouable (modifie les charges)
   - Rend un message de chat notifiant le jeu de carte

5. **Application des effets aux cibles** (`src/domain/utils/fq-utils.js:applyCardEffect`)
   - Calcule les valeurs réelles de dégâts/soin/action/mana/zèle
   - Applique aux acteurs ciblés via socket (pour le multi-utilisateur)
   - Crée des sbires temporaires si la carte le spécifie
   - Ajoute les effets actifs (buffs/debuffs)
   - Joue les effets sonores

6. **Déplacement de la carte vers la défausse** (`src/domain/utils/play-card.js` puis `Card.pass()`)
   - L'objet Card appelle la méthode `pass(to, cardIds)` (API FoundryVTT)
   - La carte est retirée de la main, ajoutée à la pile de défausse
   - Notification de chat (sauf si `hideMessages` est vrai)

7. **Mise à jour de l'UI** (`Hooks.on("createCard", "updateCard", "deleteCard")`)
   - HandBoard écoute création/mise à jour/suppression de carte sur son deck `currentCards`
   - Appelle `update()` → `restore()` → `renderCards()`
   - Re-rend toutes les cartes en main, mettant à jour l'affichage

### Flux secondaire : gestion de deck (montée de niveau de classe)

1. **Progression de classe** (déclenchée par le système dnd5e)
2. **Hook : updateItem** (`src/hook/trading-cards.js`)
3. **DeckUtils.updateDeckWhenChange** — reconstruction de deck débouncée pour l'utilisateur
4. **DeckUtils.updateDeckForUser** :
   - Trouve le personnage possédé par l'utilisateur
   - Charge les decks du compendium selon les classes actuelles
   - Crée/met à jour Main, Deck, Pile avec les bonnes cartes
   - Met à jour les permissions de propriété du deck
5. **Diffusion socket** vers le MJ (si joueur)
6. **Mise à jour UI** via le Hook updateUser

### Flux secondaire : changement de tour de combat

1. **Hook : combatTurnChange** (`src/hook/combat.js`)
2. **Combat.drawBaseCards** — réinitialise les états de carte au début du combat
3. **Combat.resetAction / resetZeal** — réinitialise les réserves de ressources
4. **Combat.drawHand** — pioche des cartes du deck vers la main (début de tour du joueur)
5. **Combat.drawPick** — pioche des cartes supplémentaires en cours de tour si une capacité est utilisée
6. **Combat.resetCurrentDropCard** — réinitialise le compteur de défausse
7. **Diffusion socket** des mises à jour à tous les clients

**Gestion de l'état :**
- **État HandBoard** : référence à `currentCards` (document Cards), `currentUser`, drapeau `updating`
- **État global** : `FqCardEngineModule.handMiniBarList` (tableau d'instances HandBoard)
- **Réglages** : paramètres de jeu pour le nombre de mains, options d'affichage, position, échelle
- **Les Hooks propagent les changements** : les mises à jour de document déclenchent des écouteurs qui actualisent l'UI et l'état local

## Abstractions clés

**Card (document Card de FoundryVTT) :**
- Rôle : représente une carte jouable avec effets et choix
- Exemples : cartes du deck nommées « Boule de feu », « Toucher curatif »
- Pattern : étend le Card de FoundryVTT via le modèle de données CardFqSystem
- Schéma : `system.fq` contient maxSameCard, class, level, isBase, tableau `choices`
- Chaque choix a : coûts action/mana/zèle, valeurs dégâts/soin, portée, sbires, effets

**Hand (deck de type « HAND ») :**
- Rôle : cartes actuellement disponibles au joueur en combat
- Emplacement : une par joueur et par session de jeu
- Pattern : document Cards de type `hand`, possédé par le joueur
- Usage : ajout via DeckUtils.drawHand, retrait via `card.pass()` vers la défausse

**Deck (deck de type « DECK ») :**
- Rôle : réserve de cartes dans laquelle le joueur pioche (25-30 cartes par classe)
- Emplacement : un par joueur et par session
- Pattern : document Cards de type `deck`, possédé par le joueur
- Usage : source de pioche vers la main ; réapprovisionné à la progression de classe via compendium

**Pile / Défausse (deck de type « PILE ») :**
- Rôle : pile de défausse pour les cartes jouées/défaussées
- Emplacement : une par joueur et par session
- Pattern : document Cards de type `pile`, possédé par le joueur
- Usage : destination lors de `card.pass()` ; accumule les cartes jouées

**Spellbook (deck de type « SPELLBOOK ») :**
- Rôle : deck de référence contenant toutes les cartes possibles d'une classe (non utilisé en combat)
- Emplacement : un par classe dans le compendium
- Pattern : document Cards dans les packs de compendium
- Usage : modèle pour générer les decks des joueurs via DeckUtils lors du choix de classe

**Caractéristiques du personnage FQ (Actor `system.fq`) :**
- Rôle : étendre le personnage dnd5e avec des ressources spécifiques FQ
- Champs : action (réserve), mana (réserve), zèle (réserve), cards (pioche/pick/défausse), bonus (dégâts dans le temps)
- Pattern : injecté via le schéma CharacterDataFQ avec lib-wrapper
- Usage : consommé par les effets de carte, suivi par les jauges de la barre latérale du personnage

## Points d'entrée

**Init du module (`src/init-engine.js`) :**
- Emplacement : `src/init-engine.js` — point d'entrée principal du module
- Déclencheurs : `Hooks.on("init", "setup", "ready", "renderGamePause")`
- Responsabilités :
  - Enregistrer les `game.settings` (nombre de mains, draggable, comportement du clic sur carte, etc.)
  - Patcher les modèles de données dnd5e via lib-wrapper pour ajouter les champs FQ
  - Enregistrer les classes de feuilles personnalisées pour Actor/Item/Card
  - Créer et rendre les instances HandBoard

**Hook : init** (ligne 664) :
- Enregistre tous les `game.settings`
- Patche les schémas des modèles de données
- Enregistre les classes de feuilles
- Définit les valeurs par défaut de `CONFIG.FqCardEngine`

**Hook : setup** (ligne 907) :
- Pré-charge les templates Handlebars
- Enregistre les surcharges de feuilles pour les acteurs/objets dnd5e et Cards

**Hook : ready** (ligne 898) :
- Ajoute les attributs FQ à `Actor.trackableAttributes` (action, mana, zèle)

**Hook : suite de ready** (à partir de la ligne 1017) :
- Rend le conteneur de main dans l'UI
- Crée les instances HandBoard selon le réglage HandCount
- Met en place les écouteurs d'événements de l'UI de main (ajouter/retirer, afficher/masquer)
- Restaure l'état de la main depuis les flags de l'utilisateur
- Attache le gestionnaire DragDrop
- Écoute `game.socket` pour les mises à jour multi-utilisateurs
- Initialise l'affichage des jauges du personnage

## Contraintes architecturales

- **Threading :** boucle d'événements mono-thread (JavaScript navigateur). Toutes les opérations async utilisent Promises/async-await.
- **État global :** l'objet `FqCardEngineModule` détient l'état à l'échelle du module :
  - `handMiniBarList` : tableau des instances HandBoard actives
  - `options` : configuration des réglages utilisateur
  - Handlers d'événements socket enregistrés à la portée du module
- **Imports circulaires :** aucun détecté ; la hiérarchie descend (init-engine → hooks → couche domaine → utils)
- **Responsabilité unique :** chaque classe utilitaire (PlayCard, DeckUtils, etc.) gère une seule préoccupation métier
- **Version FoundryVTT :** requiert v14+ (vérifié v14.365). Utilise le pattern de feuilles ApplicationV2.
- **Dépendance système :** requiert le système dnd5e v5.3+. Schémas patchés via lib-wrapper.
- **Dépendances de modules :** socketlib (événements socket multi-utilisateurs), lib-wrapper (patching de schéma), optionnel : Sequencer (effets visuels)

## Anti-patterns

### Détecter quand la main est « sale » (dirty)

**Ce qui se passe :** HandBoard écoute des Hooks génériques (updateCard, deleteCard, createCard) et vérifie si la cible appartient à son deck `currentCards` en comparant les IDs.

**Pourquoi c'est problématique :** si plusieurs cartes sont créées/supprimées rapidement (ex. piocher 5 cartes), `HandBoard.update()` est appelé 5 fois, déclenchant 5 cycles complets de `renderCards()` alors que seul l'état final compte.

**À faire plutôt :** grouper les mises à jour de document via `update({}, {}, {noHook: true})` puis émettre une seule mise à jour, ou débouncer `HandBoard.update()` pour fusionner les appels de hook sous 50 ms (voir `src/domain/board/hand-board.js:update` pour l'amélioration).

### Passer des données de carte par des chaînes

**Ce qui se passe :** des effets de carte comme « XXX » et « YYY » sont stockés comme placeholders textuels, puis remplacés par les vraies valeurs via un find-replace de chaîne dans `FQUtils.replaceCardContentXAndYValue()`.

**Pourquoi c'est problématique :** le templating par chaînes est fragile (les fautes passent inaperçues) et rend le flux de données difficile à tracer. Si « XXX » apparaît à plusieurs endroits, tous sont remplacés d'un coup.

**À faire plutôt :** utiliser des templates structurés (objets avec champs `{type: "variable", name: "X"}`) résolus à l'exécution. Le contrat devient explicite et mieux validable.

### Appels socket directs dans les fonctions utilitaires

**Ce qui se passe :** `DamageUtils.createActorFromData()`, `DamageUtils.applyActorHpModification()` sont enregistrés comme handlers socket et appelés directement depuis `PlayCard`, en attendant un contexte socket.

**Pourquoi c'est problématique :** couplage fort entre la couche transport socket et la logique métier. Difficile à tester unitairement sans mocker le socket. Si le protocole socket change, la logique métier casse.

**À faire plutôt :** faire appeler par PlayCard des fonctions utilitaires pures, puis une couche « sync » séparée décide si diffuser via socket. Cela sépare la logique métier (comment appliquer les dégâts) de la distribution (qui doit être informé).

## Gestion des erreurs

**Stratégie :** lever une `FormError` avec des messages localisés pour les échecs de validation ; laisser les exceptions non gérées remonter à la console Foundry.

**Patterns :**
- **Erreurs de validation** : PlayCard lève une FormError si la carte ne peut être utilisée (lignes 499-502 dans init-engine.js)
- **Erreurs de permission** : retour anticipé avec `ui.notifications.warn()` si l'utilisateur n'a pas la permission (lignes 378-379, 394-395)
- **Erreurs de récupération de données** : DeckUtils retourne tôt si personnage/classe/deck introuvable (lignes 131, 144)
- **Catches de Promise** : `PlayCard.callBackplayCard()` enveloppe `card.pass()` dans un `.catch()` pour afficher `ui.notifications.error()` (ligne 87)

## Préoccupations transverses

**Logging :** `console.info` utilisé avec parcimonie (ligne 922 « Better Hand templates preloaded »). Pas de logging structuré ; ajouter un utilitaire de log si nécessaire pour déboguer les mises à jour de deck.

**Validation :**
- Carte utilisable : `FQUtils.checkIfCanUseCard()` vérifie rejouable, contraintes maxSameCard
- Progression de classe : `DeckUtils.checkIfCanUpdateClasses()` s'assure que le personnage est possédé par l'utilisateur connecté
- Carte ajoutable au deck : `DeckUtils.canPassCardsToDeck()` respecte la limite maxSameCard

**Authentification / autorisation :**
- Appels socket faits uniquement par le MJ (premier MJ actif vérifié via `Combat.isLocalUserFirstActiveGM()`)
- Les opérations de carte en main requièrent que le joueur possède le personnage (permission OWNER)
- La création de carte par glisser-déposer requiert la permission OBSERVER+ sur le deck source
- Édition de feuille restreinte via `getCanModifyFQ()` — bloque l'édition des champs FQ si des effets actifs modifient `system.fq`

---

*Analyse de l'architecture : 2026-08-04*
