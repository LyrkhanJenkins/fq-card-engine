# Intégrations externes

**Date d'analyse :** 2026-08-04

## Intégration plateforme & système

**FoundryVTT :**
- Version : 14+ (minimum 14, vérifié 14.365)
- Points d'intégration :
  - Système de Hooks : 6 gestionnaires de hooks dans `src/hook/`
  - Feuilles (Sheets) : feuilles personnalisées personnage, PNJ, objet et carte
  - Communication socket pour la synchro temps réel multi-clients
  - Système de compendiums (packs) pour la gestion des données
  - Extensions de rendu du canvas et des tokens

**Système D&D 5e :**
- ID système : dnd5e
- Compatibilité : v5.3.0-5.9.99
- Points d'intégration :
  - Classes d'acteurs personnalisées (personnage, PNJ, créature)
  - Templates d'actions d'objet personnalisés
  - Systèmes de decks de cartes personnalisés
  - Gestion des `EffectChangeData` (changement cassant en v14)

## Modules FoundryVTT requis

**socketlib :**
- Rôle : fournit l'abstraction des événements socket et la communication multijoueur
- ID module : socketlib
- Version : 1.1.0-1.9.99 (vérifié 1.1.4)
- Utilisé par : `src/hook/socket-lib.js` — gère les événements socket pour les mises à jour multijoueurs
- Critique : Oui — le module ne peut pas fonctionner sans cette dépendance

**lib-wrapper :**
- Rôle : fournit un wrapping/patching de fonctions sûr, sans conflit
- ID module : lib-wrapper
- Version : 1.13.4.0-1.99.99.99 (vérifié 1.13.5.1)
- Utilisé par : les hooks de combat et d'utilisation d'objet, pour modifier des fonctions cœur en toute sécurité
- Critique : Oui — le module ne peut pas fonctionner sans cette dépendance

## Modules FoundryVTT recommandés

**Sequencer :**
- Rôle : fournit les effets visuels et animations pour les actions de carte
- ID module : sequencer
- Utilisé par : configuration `sequencer.json` pour les effets visuels des cartes FQ
- Intégration : `src/domain/system/fx/visualEffectData.js`
- Config : `sequencer.json` — définit les chemins des effets visuels de mêlée

**JB2A_DnD5e :**
- Rôle : bibliothèque d'effets de sorts animés pour Sequencer
- ID module : JB2A_DnD5e
- Utilisé avec : le module Sequencer pour enrichir le feedback visuel

**Dynamic Active Effects (DAE) :**
- Rôle : gestion des effets actifs avec intégration des FX visuels
- ID module : dae
- Utilisé pour : la gestion des effets d'acteur avec améliorations visuelles

## Stockage des données

**Packs FoundryVTT (compendiums LevelDB) :**

Situés dans `packs/`, au format base de données LevelDB :

- **Decks & cartes :**
  - `decks-pattern-fq8` — Modèles (templates) de cartes
  - `decks-fq8-generated` — Decks de cartes auto-générés (produits par le script de build)
  - Type de compendium : Cards
  - Système : dnd5e
  - Script de build : `utils/create_generated_decks.js` génère les decks depuis le spellbook

- **Classes & stats :**
  - `classes-fq8` — Définitions des classes de personnage FQ8
  - `classes-stats-fq8` — Statistiques et progression des personnages
  - `starter-heroes` — Modèles de personnages pré-construits
  - Type de compendium : Item/Actor
  - Système : dnd5e

- **Objets & sorts :**
  - `items-fq8` — Objets personnalisés pour Final Quest 8
  - `spells-npc` — Définitions de sorts de PNJ
  - Type de compendium : Item
  - Système : dnd5e

- **Acteurs :**
  - `minions-fq8` — Modèles de créatures/sbires
  - Type de compendium : Actor
  - Système : dnd5e

- **Macros :**
  - `macros-fq8` — Macros accessibles aux joueurs
  - `macros-gm-fq8` — Macros réservées au MJ (accès JOUEUR : AUCUN)
  - `macros-sequencer` — Macros d'effets Sequencer
  - Type de compendium : Macro
  - Système : dnd5e

**Gestion des packs :**
- Commande de build : `npm run build` exécute `npm run build:db`
- Packaging : `utils/packs.mjs package pack` — compile le JSON source vers LevelDB
- Dépackaging : `utils/packs.mjs package unpack` — extrait le LevelDB vers JSON pour édition
- Génération de decks : `utils/create_generated_decks.js` — crée les decks de cartes depuis les définitions de classes

## Communication socket

**Implémentation :**
- Emplacement : `src/hook/socket-lib.js`
- Framework : intégration socket.io de FoundryVTT via le module socketlib
- Rôle : synchro temps réel de l'état des cartes, des mises à jour de deck et des changements de combat entre clients connectés
- Protocole : événements socket personnalisés pour le jeu de carte, la manipulation de deck et l'application d'effets

**Événements socket :**
- État de jeu : changements d'état de combat des tokens
- Opérations de carte : jeu de carte, pioche/mélange de deck
- Mises à jour d'UI : synchro de la fenêtre de main
- Exécution de macro : déclenchement de macros inter-clients

## Build & déploiement

**Pipeline CI/CD :**
- Plateforme : GitLab CI/CD
- Config : `.gitlab-ci.yml`
- Version Node.js : 20
- Étapes :
  1. **build** — `npm install && npm run build` — génère les packs et artefacts de build
  2. **test** — `npm run test` — exécute la suite Vitest
  3. **lint** — `npm run lint` — validation ESLint
  4. **release** — les tags de release créent un paquet ZIP

**Distribution des releases :**
- Format : archive ZIP contenant le module compilé
- Emplacement : releases GitLab, avec URL de téléchargement dans `module.json`
- URL de manifeste : `https://gitlab.com/final-quest/fq-card-engine/-/raw/final-quest-8/module.json`
- URL de téléchargement : artefacts de la pipeline CI GitLab

**Sorties de build :**
- Artefacts principaux : packs compilés au format LevelDB
- Fichiers générés : `packs/decks-fq8-generated/` (créé au moment du build)
- Distribution : dépouillée des fichiers de dev (node_modules, .git, tests, utils, config)

## Internationalisation

**Langues supportées :**
- Anglais : `lang/en.json`
- Français : `lang/fr.json`

**Points de localisation :**
- Chaînes d'UI dans le code applicatif
- Libellés de métadonnées des packs
- Messages d'erreur en français (visibles dans `eslint.config.js`)

## Aucune dépendance à un service externe direct

- Aucune clé d'API requise
- Aucun appel d'API tiers (toute communication est interne à FoundryVTT)
- Aucun système d'authentification (repose sur la gestion des utilisateurs de FoundryVTT)
- Aucune base de données externe (utilise le stockage LevelDB local de FoundryVTT)
- Aucun récepteur de webhook ni webhook sortant configuré

---

*Audit des intégrations : 2026-08-04*
