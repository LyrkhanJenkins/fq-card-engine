# Structure de la codebase

**Date d'analyse :** 2026-08-04

## Disposition des répertoires

```
fq-card-engine/                         # Racine du module FoundryVTT
├── src/                                # Code source (tout en JavaScript)
│   ├── init-engine.js                  # Initialisation & cycle de vie du module
│   ├── hook/                           # Gestionnaires de hooks FoundryVTT
│   │   ├── socket-lib.js               # Enregistrement Socket.io
│   │   ├── combat.js                   # Changements de tour/round de combat
│   │   ├── trading-cards.js            # Mises à jour de deck (changements de classe)
│   │   ├── render-token.js             # Effets de rendu de token
│   │   └── item-use.js                 # Hooks d'utilisation d'objet
│   ├── domain/                         # Couche domain-driven design
│   │   ├── board/                      # Composant UI d'affichage de main
│   │   │   └── hand-board.js           # Classe HandBoard (UI de la main)
│   │   ├── sheet/                      # Classes de feuilles FoundryVTT personnalisées
│   │   │   ├── actor/
│   │   │   │   ├── fq-character-sheet.js   # Feuille de personnage joueur
│   │   │   │   └── fq-npc-sheet.js        # Feuille de PNJ
│   │   │   ├── items/
│   │   │   │   └── fq-item-sheet.js       # Feuille d'objet (armes, sorts, etc.)
│   │   │   └── cards/
│   │   │       ├── fq-cards-sheet.js      # Feuille de deck (plusieurs cartes)
│   │   │       └── fq-card-sheet.js       # Éditeur de carte unique
│   │   ├── system/                     # Schémas des modèles de données
│   │   │   ├── actors/
│   │   │   │   ├── character-fq.mjs    # Modèle de données personnage (champs FQ)
│   │   │   │   ├── creature-fq.mjs     # Modèle de créature de base
│   │   │   │   └── npc-fq.mjs          # Modèle de données PNJ (champs FQ)
│   │   │   ├── items/
│   │   │   │   └── item-action-fq.mjs  # Template d'activité/action d'objet
│   │   │   ├── cards/
│   │   │   │   ├── card-fq-system.mjs  # Modèle de données carte unique
│   │   │   │   └── cards-fq-system.mjs # Modèle de données deck de cartes
│   │   │   └── fx/
│   │   │       └── visualEffectData.js  # Configuration des effets visuels
│   │   └── utils/                      # Utilitaires de logique métier
│   │       ├── fq-constants.js         # Constantes de jeu (couleurs, textes)
│   │       ├── fq-utils.js             # Logique de jeu FQ cœur
│   │       ├── play-card.js            # Exécution & effets de carte
│   │       ├── deck-utils.js           # Gestion deck/main/pile
│   │       ├── display-card.js         # Extraction des données d'affichage de carte
│   │       ├── damage-utils.js         # Application dégâts/soin
│   │       ├── consumption-utils.js    # Consommation de ressources (action/mana)
│   │       ├── canvas-utils.js         # Effets sur le plateau de dessin
│   │       └── fx-utils.js             # Effets visuels Sequencer
│   ├── core/                           # Code fondamental cœur
│   │   ├── error/
│   │   │   └── form-error.model.js     # Erreur custom pour validation de formulaire
│   │   └── utils/
│   │       └── schema.utils.js         # Utilitaire de fusion de schéma
│   └── templates/                      # Templates Handlebars (HTML)
│       ├── actors/                     # Sections de feuille d'acteur
│       │   ├── fq-character-sidebar.hbs
│       │   ├── fq-npc-header.hbs
│       │   └── fq-npc-sidebar.hbs
│       ├── board/                      # Rendu main/carte
│       │   ├── hand-container.hbs      # Conteneur du panneau de main
│       │   ├── hand.hbs                # Disposition d'une main
│       │   └── card.hbs                # SVG d'une carte individuelle
│       ├── items/
│       │   └── fq-item-tabs.hbs        # Onglets de la feuille d'objet
│       ├── fq-form/                    # Templates de dialogue/formulaire
│       │   ├── card/
│       │   │   └── attributes.hbs      # Champs d'attributs de carte
│       │   └── cards/
│       │       └── cards.hbs           # Éditeur de deck de cartes
│       ├── partials/
│       │   └── card-svg.hbs            # Partial SVG de carte réutilisable
│       ├── chat-message.hbs            # Rendu des messages de chat
│       └── dialog-play.hbs             # Dialogue de jeu de carte
├── utils/                              # Scripts de build & utilitaires (Node.js)
│   ├── create_generated_decks.js       # Génère les decks des joueurs depuis les classes
│   └── packs.mjs                       # Compilation des packs de compendium
├── styles/                             # Feuilles de style CSS
│   ├── globals.css                     # Styles globaux
│   ├── fq-card-engine.css              # Styles main/carte
│   └── fq-dnd5e-sheet.css              # Personnalisation des feuilles
├── lang/                               # JSON de localisation
│   ├── en.json                         # Chaînes anglaises
│   └── fr.json                         # Chaînes françaises
├── packs/                              # Données de compendium FoundryVTT
│   ├── _source/                        # Source JSON (lisible par un humain)
│   │   ├── classes-fq8/
│   │   ├── classes-stats-fq8/
│   │   ├── decks-fq8-generated/
│   │   ├── decks-pattern-fq8/          # Templates de deck par classe
│   │   ├── items-fq8/
│   │   ├── macros-fq8/
│   │   ├── macros-gm-fq8/
│   │   ├── macros-sequencer/
│   │   ├── minions-fq8/
│   │   ├── spells-npc/
│   │   └── starter-heroes/
│   └── [packs-compilés]/               # Fichiers .db binaires (lus par Foundry)
├── images/                             # Assets de jeu (PNG/WebP)
│   ├── cards/                          # Illustrations de cartes par classe
│   ├── classes/                        # Icônes de classe
│   ├── token/                          # Illustrations de token
│   ├── doc/                            # Images de documentation
│   └── logo.png
├── sounds/                             # Effets audio (par type de dégâts)
│   ├── acid/, bludgeoning/, cold/, fire/, etc.
│   └── specific_spells/
├── assets/                             # Assets externes (sous-module)
│   └── fq-card-assets/                 # Dépôt d'illustrations de cartes
├── visuals/                            # Définitions d'effets visuels
│   ├── elementalist/
│   ├── generics/                       # Effets génériques mêlée/distance
│   └── [spécifiques-par-classe]/
├── devNotes/                           # Notes de développement (non committées)
├── tests/                              # Fichiers de test
│   ├── setup.js                        # Setup Vitest
│   ├── check-imports.spec.js           # Validation des imports
│   ├── utils/                          # Tests unitaires des utilitaires
│   │   ├── canvas-utils.test.js
│   │   ├── consumption-utils.test.js
│   │   ├── damage-utils.test.js
│   │   ├── deck-utils.test.js
│   │   └── fq-utils.test.js
│   ├── window/                         # Tests de fenêtre/composant
│   │   └── play-card.test.js
│   └── script/                         # Scripts de build
│       └── test-world/                 # Monde FoundryVTT de test
├── .planning/                          # Planification & analyse GSD
│   └── codebase/                       # Docs de cartographie de la codebase
├── module.json                         # Manifeste FoundryVTT (config du point d'entrée)
├── package.json                        # Scripts NPM & dépendances
├── vitest.config.js                    # Configuration Vitest
├── eslint.config.js                    # Configuration ESLint
└── .gitignore                          # Règles d'exclusion Git
```

## Rôle des répertoires

**src/ (43 fichiers source au total)**
- **Rôle :** tout le code source du module (modules JavaScript)
- **Contient :** initialisation, hooks, logique de domaine, modèles de données, templates
- **Fichiers clés :** init-engine.js (entrée), hand-board.js (UI), play-card.js (logique cœur)

**src/hook/**
- **Rôle :** Hooks FoundryVTT — écouteurs d'événements pour le cycle de vie du jeu et les changements de document
- **Contient :** suivi des tours de combat, génération de deck, effets de token, usage d'objet
- **Fichiers clés :** combat.js (pioche/reset pendant les tours), trading-cards.js (montée de niveau)

**src/domain/board/**
- **Rôle :** composant UI d'affichage de main — rend la main du joueur et gère l'interaction
- **Contient :** classe HandBoard qui écoute les Hooks et re-rend les cartes
- **Fichiers clés :** hand-board.js (~300 lignes, composant UI cœur)

**src/domain/sheet/**
- **Rôle :** classes de feuilles FoundryVTT personnalisées — surchargent les feuilles dnd5e par défaut pour ajouter l'UI FQ
- **Contient :** feuilles d'acteur (personnage/PNJ), feuilles d'objet, feuilles carte/deck
- **Fichiers clés :** fq-character-sheet.js, fq-card-sheet.js
- **Pattern :** étendre les classes de feuilles dnd5e, surcharger `_prepareSidebarContext` pour ajouter le contexte FQ

**src/domain/system/**
- **Rôle :** schémas de modèles de données — définissent les champs présents sur les documents FoundryVTT
- **Contient :** données d'acteur personnage/PNJ, template d'action d'objet, données de carte
- **Fichiers clés :** character-fq.mjs (réserves action/mana/zèle), card-fq-system.mjs (tableau choices)
- **Pattern :** utiliser `foundry.data.fields.SchemaField` pour définir le schéma, exporté via `static defineSchema()`

**src/domain/utils/**
- **Rôle :** utilitaires de logique métier — fonctions de domaine pures pour les mécaniques de jeu
- **Contient :** exécution de carte, gestion de deck, calcul de dégâts, logique d'affichage
- **Fichiers clés :** play-card.js (exécute une carte), deck-utils.js (gère les decks), fq-utils.js (logique cœur)
- **Pattern :** classes statiques avec méthodes async ; pas d'état d'instance ; dépendent de game.actors/game.cards/game.users

**src/core/**
- **Rôle :** code fondamental utilisé par la couche domaine
- **Contient :** exception custom FormError, utilitaire de fusion de schéma
- **Fichiers clés :** form-error.model.js, schema.utils.js

**src/templates/ (12 templates)**
- **Rôle :** templates HTML Handlebars rendus par le JavaScript
- **Contient :** sections de feuille d'acteur, affichage de carte, disposition de main, dialogues
- **Fichiers clés :** board/card.hbs (carte SVG), dialog-play.hbs (dialogue de jeu)
- **Pattern :** rendu via `foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/...")`

**utils/ (2 scripts de build)**
- **Rôle :** utilitaires Node.js au moment du build
- **Contient :** script de génération de deck, compilation des packs de compendium
- **Fichiers clés :** create_generated_decks.js (génère les decks des joueurs depuis les classes)
- **Exécution via :** npm run build:generateDecks, npm run build:db

**styles/ (3 fichiers CSS)**
- **Rôle :** style du module
- **Contient :** disposition du panneau de main, affichage de carte, personnalisation des feuilles
- **Fichiers clés :** fq-card-engine.css (styles main/carte), fq-dnd5e-sheet.css (surcharges de feuilles)

**packs/ (11 compendiums)**
- **Rôle :** données de compendium FoundryVTT (cartes, classes, macros, etc.)
- **Contient :** templates de cartes par classe, définitions de classes, sbires PNJ, macros
- **Packs clés :** decks-pattern-fq8 (templates de cartes), classes-fq8 (définitions de classes)
- **Généré :** decks-fq8-generated (decks de joueurs créés à la montée de niveau)
- **Format :** _source/JSON (lisible) compilé en .db (format binaire Foundry)

**tests/ (9 fichiers de test)**
- **Rôle :** tests unitaires des utilitaires
- **Contient :** tests pour fq-utils, deck-utils, damage-utils, etc.
- **Exécution via :** npm test (une fois), npm run test:watch (mode watch)

## Emplacements de fichiers clés

**Points d'entrée :**
- `module.json` — manifeste FoundryVTT ; spécifie esmodules, styles, packs
- `src/init-engine.js` — initialisation du module ; exporte le global FqCardEngineModule
- `src/hook/socket-lib.js` — enregistrement des handlers d'événements socket

**Configuration :**
- `module.json` — métadonnées, version, dépendances, packs du module
- `package.json` — scripts NPM (build, test, lint)
- `vitest.config.js` — configuration du runner de tests
- `eslint.config.js` — règles de linting

**Logique cœur :**
- `src/init-engine.js` — point d'entrée, réglages, enregistrement des feuilles, init de la main
- `src/domain/board/hand-board.js` — composant UI de la main (300 lignes)
- `src/domain/utils/play-card.js` — pipeline d'exécution de carte
- `src/domain/utils/deck-utils.js` — création/mise à jour de deck aux changements de classe
- `src/domain/utils/fq-utils.js` — mécaniques FQ cœur (appliquer effets, valider cartes)

**Modèles de données :**
- `src/domain/system/actors/character-fq.mjs` — schéma des champs FQ du personnage
- `src/domain/system/cards/card-fq-system.mjs` — schéma choix/effets de carte
- `src/domain/system/items/item-action-fq.mjs` — template d'action d'objet

**Templates :**
- `src/templates/board/card.hbs` — rendu SVG d'une carte individuelle
- `src/templates/board/hand.hbs` — disposition du panneau de main
- `src/templates/board/hand-container.hbs` — conteneur de tous les panneaux de main
- `src/templates/dialog-play.hbs` — dialogue de jeu avec cibles/stats

**Tests :**
- `tests/setup.js` — setup de l'environnement Vitest (globals FoundryVTT)
- `tests/utils/*.test.js` — tests unitaires de chaque classe utilitaire
- `tests/window/play-card.test.js` — test d'intégration pour l'exécution de carte

## Conventions de nommage

**Fichiers :**
- **Utilitaires :** kebab-case (ex. `play-card.js`, `deck-utils.js`)
- **Classes :** kebab-case pour les fichiers, mais noms de classe en PascalCase (ex. fichier `fq-character-sheet.js` exporte la classe `FqCharacterSheet`)
- **Modèles de données :** kebab-case avec extension `.mjs` (ex. `character-fq.mjs`)
- **Hooks :** kebab-case reflétant la responsabilité (ex. `combat.js`, `trading-cards.js`)
- **Templates :** kebab-case `.hbs` (ex. `card.hbs`, `hand-container.hbs`)

**Répertoires :**
- **Regroupement domaine :** par préoccupation (board, sheet, system, utils)
- **Regroupement système :** par type d'entité (actors, items, cards, fx)
- **Regroupement templates :** par composant rendu (actors, board, items, fq-form, partials)

**Classes CSS :**
- **Préfixe :** `fq-card-engine-` pour le spécifique au module, `fq-` pour les noms courts
- **Exemples :** `.fq-card`, `.fq-hand-panel`, `.fq-card-engine-hand`, `.fq-card-engine-container`
- **Sémantique :** `.fq-card-zone`, `.fq-card-engine-card-container`, `.fq-size-slider`

**Objets de jeu :**
- **Decks :** Main préfixée « Hand: », Deck préfixé « Deck: », Défausse préfixée « Discard: »
- **Cartes :** nommées d'après les capacités (ex. « Boule de feu », « Toucher curatif »)
- **Acteurs (sbires) :** préfixés du nom de classe (ex. « Elementalist Minion »)

## Où ajouter du nouveau code

**Nouvelle fonctionnalité (ex. « Ajouter un nouvel effet de sort ») :**
- **Logique d'effet :** `src/domain/utils/fq-utils.js` — ajouter à `FQUtils.applyCardEffect`
- **Données de carte :** `packs/_source/decks-fq8-generated/` — ajouter le JSON de la nouvelle carte
- **Affichage :** `src/templates/board/card.hbs` — ajouter l'UI si nécessaire
- **Tests :** `tests/utils/fq-utils.test.js` — tester l'application de l'effet

**Nouveau composant/module (ex. « Ajouter une UI de réserve de main ») :**
- **Classe de composant :** `src/domain/board/hand-stash.js` — nouvelle classe
- **Template :** `src/templates/board/hand-stash.hbs` — HTML du composant
- **Initialisation :** `src/init-engine.js` — ajouter au hook ready après HandBoard
- **Styles :** `styles/fq-card-engine.css` — ajouter le CSS du composant
- **Tests :** `tests/window/hand-stash.test.js` — nouveau fichier de test

**Nouvel onglet de feuille (ex. « Ajouter un onglet deck-builder à la feuille d'acteur ») :**
- **Surcharge de feuille :** `src/domain/sheet/actor/fq-character-sheet.js` — ajouter des PARTS
- **Template :** `src/templates/actors/fq-deck-builder.hbs` — nouveau template d'onglet
- **Logique :** `src/domain/utils/deck-utils.js` — réutiliser la logique de construction de deck
- **Styles :** `styles/fq-dnd5e-sheet.css` — ajouter le CSS de l'onglet

**Utilitaires (ex. « Ajouter une validation des effets de carte ») :**
- **Helpers partagés :** `src/domain/utils/validation-utils.js` — nouveau fichier
- **Imports chez les consommateurs :** `src/domain/utils/play-card.js`, `src/domain/utils/fq-utils.js`
- **Tests :** `tests/utils/validation-utils.test.js`

**Hooks (ex. « Écouter les mises à jour d'acteur pour des effets spéciaux ») :**
- **Handler de hook :** `src/hook/actor-effects.js` — nouveau fichier
- **Enregistrement :** import dans `src/init-engine.js`
- **Tests :** `tests/hook/actor-effects.test.js`

**Extension de modèle de données (ex. « Ajouter un attribut personnalisé aux cartes ») :**
- **Schéma :** `src/domain/system/cards/card-fq-system.mjs` — étendre `getChoiceSchema`
- **Affichage :** `src/templates/fq-form/card/attributes.hbs` — ajouter un champ de formulaire
- **Logique :** référencer dans `src/domain/utils/display-card.js` ou `fq-utils.js`
- **Migration :** ajouter un script de migration si les données existantes doivent être mises à jour

## Répertoires spéciaux

**packs/_source/**
- **Rôle :** source JSON lisible pour les données de compendium
- **Généré :** compilé en fichiers .db binaires via `npm run build:db`
- **Committé :** oui, dans le contrôle de version
- **Édition :** éditer le JSON ici, puis lancer `npm run build:db` pour mettre à jour le .db

**tests/script/test-world/**
- **Rôle :** monde FoundryVTT de test pour les tests d'intégration
- **Généré :** créé par `npm run testWorld:test`
- **Committé :** non, dans `.gitignore`
- **But :** environnement de test isolé avec des données de test

**devNotes/**
- **Rôle :** notes de développement et brouillons
- **Généré :** écrit à la main
- **Committé :** non, dans `.gitignore`

**visuals/[nom-de-classe]/**
- **Rôle :** définitions d'effets visuels Sequencer (module Sequencer optionnel)
- **Généré :** JSON écrit à la main
- **Committé :** oui (si utilisé)
- **Format :** définitions d'effets pour l'intégration Sequencer (ligne 39 de module.json recommande Sequencer)

---

*Analyse de la structure : 2026-08-04*
