# Stack technique

**Date d'analyse :** 2026-08-04

## Langages

**Principal :**
- JavaScript (modules ES modernes) — Tout le code source et les utilitaires de build

## Runtime

**Environnement :**
- Node.js 20 — Scripts de build et tests

**Gestionnaire de paquets :**
- npm — Version figée dans `package-lock.json`
- Lockfile : `package-lock.json` (présent)

## Frameworks

**Cœur :**
- FoundryVTT v14 (minimum v14, vérifié v14.365) — Plateforme de table de jeu virtuelle (VTT)
- Système dnd5e v5.3.0-5.9.99 — Intégration du système de jeu D&D 5e

**Build / Dev :**
- Babel 7.25.2 — Transpilation JavaScript pour compatibilité module/commonjs
  - Config : `.babelrc` (preset-env ciblant le Node.js courant)
- ESLint 9.26.0 — Linting et application des règles de qualité
  - Config : `eslint.config.js` (format flat config)

**Tests :**
- Vitest 4.1.0 — Framework de tests unitaires
  - Environnement : jsdom pour la simulation du DOM
  - Couverture : provider v8 avec rapports HTML
  - Config : `vitest.config.js`

## Dépendances clés

**Critiques :**
- socketlib 1.1.0-1.9.99 — Module requis pour la communication socket entre clients
- lib-wrapper 1.13.4.0-1.99.99.99 — Module requis pour le wrapping/patching sûr de fonctions

**Build & CLI :**
- @foundryvtt/foundryvtt-cli 1.0.0-rc.4 — Outils CLI officiels FoundryVTT pour la gestion du module

**Opérations fichiers :**
- fs-extra 11.2.0 — Utilitaires système de fichiers étendus pour les scripts de build

**Tests & couverture :**
- @vitest/coverage-v8 4.1.0 — Rapports de couverture de code
- jsdom 29.0.1 — Implémentation du DOM pour les tests

**Utilitaires de développement :**
- @types/node 24.3.1 — Définitions de types TypeScript pour Node.js
- @babel/core 7.25.2 — Cœur de transpilation Babel
- yargs 17.7.2 — Parsing d'arguments en ligne de commande pour les scripts de build
- fancy-log 2.0.0 — Logs colorés pour la sortie de build
- eslint-formatter-html 2.7.2 — Génération de rapports HTML pour les résultats ESLint

## Configuration

**Environnement :**
- Aucun `.env` externe requis — la configuration FoundryVTT est fournie au runtime par la plateforme
- Artefacts de build générés : le dossier `packs/` contient les données de compendium LevelDB

**Build :**
- Babel : `.babelrc` — Transpile vers CommonJS pour compatibilité Node.js pendant le build
- ESLint : `eslint.config.js` — Applique le style de code et interdit certains patterns (ex. accès direct à `game.actors`)
- FoundryVTT : `module.json` — Manifeste du module définissant métadonnées, dépendances, packs et points d'entrée

**Manifeste & points d'entrée :**
- `module.json` — Manifeste de module FoundryVTT (v2)
- ESModules : 6 points d'entrée dans `src/hook/` et `src/init-engine.js`
- Styles : 3 fichiers CSS pour le thème de l'interface

## Prérequis de plateforme

**Développement :**
- Node.js 20 ou supérieur
- npm (version cohérente avec `package-lock.json`)
- Une instance FoundryVTT v14+ pour tester

**Production :**
- Serveur FoundryVTT v14+
- Système dnd5e v5.3.0+ installé
- Modules socketlib et lib-wrapper installés
- Optionnel : modules Sequencer, JB2A_DnD5e, DAE pour les fonctionnalités enrichies

---

*Analyse du stack : 2026-08-04*
