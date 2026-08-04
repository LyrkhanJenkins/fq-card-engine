# Patterns de test

**Date d'analyse :** 2026-08-04

## Framework de test

**Runner :**
- Vitest 4.1.0
- Config : `vitest.config.js`
- Environnement : jsdom (simule le DOM pour tester les feuilles FoundryVTT)
- Globals activés : `describe`, `it`, `expect`, `test` (aucun import nécessaire)

**Bibliothèque d'assertions :**
- Intégrée à Vitest (compatible Chai)
- `.toEqual()`, `.toBe()`, `.toHaveBeenCalledWith()`, etc.

**Commandes d'exécution :**
```bash
npm test                  # Lance tous les tests une fois
npm run test:watch       # Mode watch (relance à chaque changement)
npm run test:coverage    # Lance avec rapport de couverture (provider v8)
npm run test:ui          # Mode UI interactif
```

**Couverture :**
- Provider : v8
- Reporters : text (console) + html (dossier `coverage/`)
- Inclut : `src/**/*.js` uniquement
- Aucun seuil minimum de couverture imposé (configuré mais non requis)

## Organisation des fichiers de test

**Emplacement :**
- Structure parallèle co-localisée
- Les tests dans `tests/` reflètent la structure de `src/`
- Exemple : `src/domain/utils/canvas-utils.js` → `tests/utils/canvas-utils.test.js`

**Nommage :**
- Fichiers de test : suffixes `*.test.js` ou `*.spec.js`
- Exemples :
  - `tests/utils/canvas-utils.test.js`
  - `tests/utils/damage-utils.test.js`
  - `tests/check-imports.spec.js`
  - `tests/window/play-card.test.js`

**Structure du répertoire :**
```
tests/
├── setup.js                    # Setup global (mocks Foundry)
├── check-imports.spec.js       # Validation des imports
├── utils/
│   ├── canvas-utils.test.js
│   ├── consumption-utils.test.js
│   ├── damage-utils.test.js
│   ├── deck-utils.test.js
│   └── fq-utils.test.js
├── window/
│   └── play-card.test.js
└── script/
    └── copy-world.mjs
```

## Structure d'un test

**Organisation de base d'une suite :**
```javascript
import {beforeEach, describe, expect, test, vi} from "vitest";
import CanvasUtils from "../../src/domain/utils/canvas-utils.js";

describe("CanvasUtils", () => {
    const token = {actorId: "charId", x: 5, y: 5};
    const squareSize = 5;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("getAllSquaresOccupiedByToken", () => {
        const result = CanvasUtils.getAllSquaresOccupiedByToken(0, 0, 2, 2);
        expect(result).toEqual([
            {x: 0, y: 0},
            {x: 0, y: 5},
            {x: 5, y: 0},
            {x: 5, y: 5},
        ]);
    });
});
```

**Éléments clés :**
- `describe()` pour regrouper des tests liés (imbrication supportée)
- `test()` ou `it()` pour les assertions individuelles (les deux sont utilisés indifféremment)
- `beforeEach()` s'exécute avant chaque test de la suite
- Constantes locales de suite définies au niveau suite pour réutilisation

**Patterns :**

1. **Pattern de setup :**
```javascript
beforeEach(() => {
    vi.clearAllMocks();  // Réinitialise les compteurs d'appels de mocks
});
```

2. **Pattern de teardown :**
```javascript
// Implicite — vitest gère le nettoyage entre les tests
// vi.resetAllMocks() utilisé pour garder les implémentations mais réinitialiser les compteurs
```

3. **Pattern d'assertion :**
```javascript
expect(result).toEqual([{x: 0, y: 0}]);
expect(result).toBe(true);
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
```

## Mocking

**Framework :** Vitest (namespace `vi`)

**Mocks de fonctions :**
```javascript
const mockFn = vi.fn();                           // Mock simple
const mockFn = vi.fn().mockResolvedValue(data);  // Mock async
const mockFn = vi.fn().mockImplementation((x) => x * 2); // Implémentation custom
```

**Mock de module (niveau supérieur) :**
```javascript
vi.mock("../../src/domain/utils/fq-utils.js", () => ({
    default: {
        replaceCardContentAbilitiesBonus: vi.fn(),
        prepareDataFromCard: vi.fn(),
        applyCardEffect: vi.fn(),
        replaceCardContentXAndYValue: vi.fn().mockResolvedValue(true),
        checkIfCanUseCard: vi.fn().mockResolvedValue(true),
    }
}));
```
- Fichier : `tests/window/play-card.test.js`
- Utilisé pour isoler le code testé de ses dépendances

**Pattern de spy :**
```javascript
const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
DeckUtils.updateDeckWhenChange(fqDocument, options);
expect(deleteSpy).not.toHaveBeenCalled();
```
- Fichier : `tests/utils/deck-utils.test.js`
- Spy sur des méthodes réelles pour vérifier les appels

**Stratégies de réinitialisation des mocks :**

1. `vi.clearAllMocks()` — réinitialise les compteurs mais garde les implémentations
```javascript
beforeEach(() => {
    vi.clearAllMocks();
});
```

2. `vi.resetAllMocks()` — comme clearAllMocks mais aussi pour les spies
```javascript
beforeEach(() => {
    vi.resetAllMocks(); // remet les compteurs d'appels à zéro mais garde les implémentations
});
```

3. Réinitialisation manuelle pour le debounce
```javascript
beforeEach(() => {
    vi.resetAllMocks();
    DeckUtils.debouncedUpdateDeckByUser = {}; // reset du debounce entre chaque test
});
```

**Mocks globaux (fichier de setup) :**
Fichier : `tests/setup.js`

Fournit les objets Foundry globaux mockés pour tous les tests :
- `globalThis.CONST` — constantes de jeu (ACTIVE_EFFECT_CHANGE_TYPES)
- `globalThis.foundry` — APIs cœur FoundryVTT
- `globalThis.Hooks` — système de hooks (mocké)
- `globalThis.CONFIG` — configuration de jeu
- `globalThis.Actor`, `globalThis.Item` — classes de document
- `globalThis.canvas` — accès scène/token
- `globalThis.ui` — système de notifications UI (réinitialisé à chaque test)
- `globalThis.Cards`, `globalThis.ChatMessage` — APIs de données de jeu
- `globalThis.Roll` — lancer de dés (mocké avec aléatoire)
- `globalThis.game` — objet game principal (largement mocké)

**Quoi mocker :**
- Services/APIs externes
- État de jeu FoundryVTT (sauf si on teste les interactions avec l'état)
- Opérations async (utiliser `.mockResolvedValue()`)
- Gestionnaires d'événements et callbacks

**Quoi NE PAS mocker :**
- Fonctions utilitaires pures (tester directement)
- Constantes et enums
- Logique de gestion d'erreurs (tester les vraies erreurs)
- Logique métier sous test

## Fixtures et factories

**Pattern de données de test :**
```javascript
const actor = {
    _id: "targetActorId",
    system: {
        fq: {
            bonus: {
                damage: 5,
                heal: 10
            },
            attributes: {
                critical: 1,
                evasion: 2
            }
        }
    }
};
```
- Fichier : `tests/utils/damage-utils.test.js`
- Défini au niveau suite, mis à jour dans `beforeEach()` si besoin

**Pattern de factory en ligne :**
```javascript
const mockField = () => vi.fn().mockImplementation((opts = {}) => ({...opts}));

foundry.data.fields = {
    SchemaField: mockField(),
    StringField: mockField(),
    NumberField: mockField(),
};
```
- Fichier : `tests/setup.js`
- Les factories créent des structures de mock réutilisables

**Emplacement :**
- Données de test définies au niveau suite pour un test unique
- Données de test partagées dans `tests/setup.js` pour usage global
- Pas de répertoire de fixtures séparé ; approche en ligne

## Couverture

**Exigences :** aucun seuil minimum de couverture imposé

**Voir la couverture :**
```bash
npm run test:coverage    # Génère coverage/index.html
```

**Sortie de couverture :**
- Résumé texte en console
- Rapport HTML dans le dossier `coverage/`
- Inclut couverture de lignes, branches, fonctions
- Configuré pour n'inclure que `src/**/*.js`

**Couverture actuelle :**
- Aucune métrique de couverture spécifiée dans les exigences
- Tests d'intégration lancés via `npm run testWorlds`
- Test manuel sur des mondes de test : `tests/script/copy-world.mjs`

## Types de tests

**Tests unitaires (principaux) :**
- Emplacement : `tests/utils/*.test.js`
- Portée : fonctions utilitaires individuelles
- Approche : imports directs, mock des dépendances
- Exemples :
  - `canvas-utils.test.js` — teste les calculs de distance sur grille
  - `consumption-utils.test.js` — teste la logique de vérification des ressources
  - `damage-utils.test.js` — teste l'application des formules de dégâts

**Tests d'intégration (implicites) :**
- Via l'environnement Vitest + jsdom
- Testent l'interaction entre classes utilitaires
- Exemple : `deck-utils.test.js` teste le debounce + les mises à jour de classe

**Tests E2E (manuels) :**
- Non automatisés
- Test manuel sur des mondes de test : `npm run testWorlds`
- Utilise `tests/script/copy-world.mjs` pour préparer les environnements de test

**Test de validation des imports :**
- Fichier : `tests/check-imports.spec.js`
- Portée : garantit que tous les imports ont une extension `.js`/`.mjs`
- Type : intégration/linting

## Patterns courants

**Test async :**
```javascript
it("should build damage dice launcher with bonus", async () => {
    const result = await DamageUtils.buildDamageDiceLauncher(actor, "1d8", 1, -9999);
    expect(result).toBeDefined();
    expect(result[0].value).toBeGreaterThan(0);
});
```

**Test d'erreur :**
```javascript
test("checkResourcesNotEnoughHp", () => {
    const result = ConsumptionUtils.checkResources(
        {hp: -7},
        {system: {attributes: {hp: {value: 6}}}});
    expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual(false);
});
```

**Test de debounce (fake timers) :**
```javascript
it("should debounce and call delete then create once despite 7 triggers", async () => {
    vi.useFakeTimers();

    const deleteSpy = vi.spyOn(DeckUtils, "deleteDeckForUser").mockResolvedValue();
    const updateSpy = vi.spyOn(DeckUtils, "updateDeckForUser").mockResolvedValue();

    for (let i = 0; i < 7; i++) {
        DeckUtils.updateDeckWhenChange(fqDocument, options);
    }

    expect(deleteSpy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(deleteSpy).toHaveBeenCalledTimes(0);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
});
```
- Fichier : `tests/utils/deck-utils.test.js`

**Test conditionnel (when/if) :**
```javascript
it("should return false when cards to create exceed the max same card limit", () => {
    const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
    const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 2}}}]};
    expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(false);
});

it("should return true when maxSameCard is not reached", () => {
    const to = {cards: [{name: "Card1"}, {name: "Card1"}, {name: "Card2"}]};
    const action = {toCreate: [{name: "Card1", system: {fq: {maxSameCard: 3}}}]};
    expect(DeckUtils.canPassCardsToDeck(to, action)).toBe(true);
});
```

**Mock de module avec vi.mock() de niveau supérieur :**
```javascript
vi.mock("../../src/hook/socket-lib.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

const FQUtils = await import("../../src/domain/utils/fq-utils.js");
vi.mock("../../src/domain/utils/fq-utils.js", () => ({
    default: {
        replaceCardContentAbilitiesBonus: vi.fn(),
        prepareDataFromCard: vi.fn(),
        // ... plus de mocks
    }
}));
```
- Fichier : `tests/window/play-card.test.js`
- Note : import dynamique après la définition du mock

## Utilitaires de test

**Aucune bibliothèque d'utilitaires de test custom** — tous les tests utilisent les patterns Vitest standards

**Utilitaires de mocking manuels dans setup.js :**
```javascript
const mockField = () => vi.fn().mockImplementation((opts = {}) => ({...opts}));
```

---

*Analyse des tests : 2026-08-04*
