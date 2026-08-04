# Conventions de code

**Date d'analyse :** 2026-08-04

## Patterns de nommage

**Fichiers :**
- kebab-case avec extension `.js`
- Exemples : `canvas-utils.js`, `consumption-utils.js`, `hand-board.js`, `form-error.model.js`
- Pattern : noms descriptifs correspondant à l'export principal

**Fonctions :**
- camelCase
- Exemples : `buildDamageDiceLauncher()`, `checkResources()`, `getDistanceBetweenTwoSquares()`
- Noms descriptifs, verbe en premier

**Variables :**
- camelCase
- Exemples : `resultArray`, `healFormula`, `myTargets`, `currentCards`
- Sans préfixe (underscore réservé aux variables ignorées dans les paramètres de fonction)

**Types / Classes :**
- PascalCase pour les noms de classe
- Exemples : `ConsumptionUtils`, `DamageUtils`, `HandBoard`, `FormError`
- Pattern de classe utilitaire statique pour les classes de type service

**Constantes :**
- UPPER_CASE avec underscores
- Exemples : `CRITICAL_COLOR`, `DAMAGES_COLOR`, `DEFAULT_MAX_ZEAL`, `WARNING_COLOR`
- Définies au niveau module, souvent exportées

## Style de code

**Formatage :**
- Indentation : 4 espaces (imposée par ESLint)
- Guillemets : doubles (`"`) sauf quand des template literals sont nécessaires
- Point-virgules : toujours requis (imposé par ESLint)
- Longueur de ligne : aucune limite explicite imposée
- Pas de configuration Prettier ; ESLint est l'outil de style principal

**Linting :**
- ESLint avec flat config (`eslint.config.js`)
- Règles de base : recommandations `@eslint/js`
- Règles désactivées : `no-undef`, `no-prototype-builtins`
- Règle custom : restreindre l'accès à `game.actors` (toutes variantes : direct, crochets, chaînage optionnel)
  - Raison : l'accès à l'état de jeu doit être contrôlé ; utiliser les patterns FoundryVTT à la place
  - Message d'erreur en français : « L'accès à game.actors est interdit. »

**Variables inutilisées :**
- Les variables/paramètres commençant par `_` sont explicitement ignorés
- Pattern : `function(opts = {})`, `_*` dans les blocs catch
- Utilisé pour les paramètres de fonction volontairement non traités

**Lancer le linting :**
```bash
npm run lint                # Vérifie tous les fichiers de src/ et tests/
npm run lint:fix            # Corrige automatiquement
npm run lint:html           # Génère un rapport HTML (eslint-report.html)
```

## Organisation des imports

**Ordre :** (imposé par le test `check-imports.spec.js`)
1. Modules et bibliothèques cœur de FoundryVTT
2. Modules locaux domaine/utilitaires
3. Modules hook et système

**Exemples de la codebase :**
```javascript
import ConsumptionUtils from "./consumption-utils.js";
import DamageUtils from "./damage-utils.js";
import CanvasUtils from "./canvas-utils.js";
import FqConstants, {
    DEFAULT_MAX_ZEAL,
    ERROR_COLOR,
    OriginFQEffectLabel,
    OTHER_ROLL_COLOR,
    WARNING_COLOR
} from "./fq-constants.js";
import FxUtils from "./fx-utils.js";
import CardFqSystem from "../system/cards/card-fq-system.mjs";
import {socket} from "../../hook/socket-lib.js";
```

**Règle critique :**
- TOUS les imports doivent inclure l'extension `.js` ou `.mjs` (vérifié par `tests/check-imports.spec.js`)
- Aucun import « nu » comme `import X from "./module"` autorisé
- Imposé par le test : toute extension manquante fait échouer la CI

**Exports de module :**
- Export par défaut pour la classe/utilitaire principal : `export default class Utils {}`
- Exports nommés pour les constantes : `export const CONSTANT_NAME = "value"`
- Pattern de ré-export utilisé dans les fichiers utilitaires

## Gestion des erreurs

**Stratégie :** retours conditionnels + notifications utilisateur

**Pattern 1 : vérifier et retourner**
```javascript
static checkResources(resources, actor) {
    if (!actor) {
        return true;
    }
    
    if (resources?.hp) {
        if (actor.system?.attributes.hp.value + resources?.hp < 0) {
            ConsumptionUtils.createUserWarningMessage(
                game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughHp"), 
                actor
            );
            return false;
        }
    }
    return true;
}
```
- Fichier : `src/domain/utils/consumption-utils.js`

**Pattern 2 : classe d'erreur custom**
```javascript
export default class FormError extends Error {
    constructor(...args) {
        super(...args);
        this.name = game.i18n.localize("FQCARDENGINE.DialogPlayFormError");
    }
}
```
- Fichier : `src/core/error/form-error.model.js`
- Utilisé pour les erreurs de mise à jour d'advancement

**Pattern 3 : notifications utilisateur**
- Utiliser `ui.notifications.warn(i18nKey)` pour les avertissements
- Utiliser `ChatMessage.create({...})` pour les messages en jeu
- Utiliser `game.i18n.localize()` pour tout texte visible par l'utilisateur

**Vérifications null/undefined :**
- Chaînage optionnel : `actor.system?.fq?.bonus?.damage`
- Coalescence nulle : `value ?? defaultValue`
- Toujours vérifier l'existence de l'acteur avant d'accéder à system : `if (!actor) return`

## Logging

**Framework :** `console` natif (pas de bibliothèque de logging)

**Patterns :**
- `console.info()` — informations de debug (utilisé dans les tests)
- `console.error()` — logging d'erreurs (utilisé dans le vérificateur d'imports)
- Messages d'erreur écrits en français quand visibles par l'utilisateur

**Intégration FoundryVTT :**
- `ui.notifications.error()` pour les erreurs d'UI
- `ui.notifications.warn()` pour les avertissements d'UI
- `ChatMessage.create()` pour les notifications en jeu avec info de speaker

**Exemple issu des tests :**
```javascript
console.info("user retourné:", game.users.get("user1"));
console.info("warn appelé:", ui.notifications.warn.mock.calls);
```

## Commentaires

**Style JSDoc :**
Utilisé pour les méthodes publiques avec paramètres et types de retour.

```javascript
/**
 * Roll dice and wait for the result
 *
 * @param formula - Dice formula to roll
 * @param display - Display in a chat message the result
 * @returns {Promise<*>} The total rolled value
 */
static async rollResultAsync(formula, display = false) {
    // ...
}
```
- Fichier : `src/domain/utils/fq-utils.js`

**Commentaires en ligne :**
- Expliquent le POURQUOI, pas le QUOI (le code doit être auto-documenté)
- Souvent en français, cohérent avec la langue du jeu
- Exemple : `// vérifie si ça commence par un chiffre`
- Exemple : `// L'action est la seule ressource qui peut monter au-dessus de son max`

**Séparateurs de section :**
Organisation visuelle dans les fichiers de test :

```javascript
// ─── canPassCardsToDeck ───────────────────────────────────────────────────

// ─── checkIfCanUpdateClasses ──────────────────────────────────────────────
```
- Utilisé dans : `tests/utils/deck-utils.test.js`

**Commentaires TODO :**
Présents mais à traiter :
- `// TODO: A finir de dispatché pour tout ce qui n'est pas du utils`
- `// TODO refacto` (dans la gestion de executeEval)
- `// TODO Rendre ces constantes utilisables de partout`

## Conception des fonctions

**Taille :** garder les fonctions centrées sur une responsabilité unique
- Fonctions utilitaires typiquement 20-50 lignes
- Les fonctions async traitent des opérations et retournent des résultats
- Méthodes statiques sur les classes utilitaires

**Paramètres :**
- Ordonnés : requis d'abord, puis optionnels
- Déstructuration peu utilisée ; passage direct des paramètres
- Pas de longues listes de paramètres ; utiliser des objets pour plusieurs params liés

**Valeurs de retour :**
- Booléen pour les vérifications : `checkResources()`, `canPassCardsToDeck()`
- Tableaux pour les résultats multi-valeurs : `addCriticalToHeal()` retourne un tableau
- Promises pour l'async : `buildDamageDiceLauncher()` retourne une Promise
- Void pour les effets de bord : `consumeResources()` modifie l'acteur sur place

**Exemple : fonction utilitaire multi-étapes**
```javascript
static async buildDamageDiceLauncher(actor, cardContent) {
    let damageFormula = DamageUtils.getDamageWithBonus(actor, cardContent.damage);
    let damages = await DamageUtils.rollWithSuccessValueResultAsync(actor, damageFormula, {
        color: DAMAGES_COLOR,
        title: "Dégâts"
    });
    return DamageUtils.addCriticalEvasionToDamage(actor, damages, cardContent);
}
```

## Conception des modules

**Exports :**
- Une classe par défaut par module (utilitaire/service)
- Exports de constantes nommées dans le même module
- Ré-exports depuis des fichiers d'index si besoin

**Barrel files :**
- Peu présents dans la codebase
- Import direct depuis les fichiers source dans la plupart des cas

**Pattern singleton :**
- `FqConstants` agit comme un singleton avec des getters statiques :
  ```javascript
  static get actorAttr() {
      return game.user.character?.system?.attributes;
  }
  ```
- Accède à l'objet global `game` de FoundryVTT

**Exemple de structure de classe :**
```javascript
export default class DamageUtils {
    static async buildDamageDiceLauncher(actor, cardContent) {
        // Implémentation
    }

    static async buildHealDiceLauncher(actor, cardContent) {
        // Implémentation
    }

    static getHealWithBonus(actor, healFormula) {
        // Implémentation
    }

    // Méthodes d'aide privées (pas de préfixe underscore utilisé)
    static getDamageWithBonus(actor, damageFormula) {
        // Implémentation
    }
}
```

---

*Analyse des conventions : 2026-08-04*
