import Constants from "../../constants.js";
import Geometry from "./geometry.js";
import TargetingPredicates from "./targeting-predicates.js";
import TradingCards from "../../trading/trading-cards.js";

/**
 * Conditions personnalisées des cartes : le moteur d'évaluation pur des
 * `customEvals` d'un choix, et les prédicats génériques que les scripts des
 * decks appellent en une ligne via `FqCardEngineModule.cond.*`.
 *
 * Ce module ne publie aucun message : le verdict est consommable aussi bien
 * par le moteur de jeu (`checkIfCanUseCard`, qui traduit et publie les
 * avertissements) que par des évaluations silencieuses comme la mise en
 * évidence des cartes réactives jouables dans la main. Tous les prédicats
 * tolèrent l'absence de combat, de scène ou de personnage (ils répondent
 * simplement false), afin d'être évaluables à tout moment.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class CardCondition {

    /**
     * Évalue tous les scripts `customEvals` d'un contenu de carte, sans publier
     * aucun avertissement.
     *
     * Les scripts sont des expressions JS libres évaluées par `eval()` dans la
     * portée de cette méthode : ils voient `cardContent`, `card` et `to` ainsi
     * que les globaux (`game`, `FqCardEngineModule`…). Un script vide est
     * ignoré. Un script qui lève une exception compte comme un échec — une
     * condition illisible ne doit jamais rendre la carte jouable.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte, déjà préparé.
     * @param {Card}   [card]      - La carte concernée (visible des scripts).
     * @param {Cards}  [to]        - La pile de défausse cible (visible des scripts).
     *
     * @returns {{ok: boolean, failures: {script: string, errorMessages: object[], thrown: Error|null}[]}}
     *          `ok` vaut true si tous les scripts passent. Chaque échec porte le
     *          script concerné, ses messages d'erreur bruts (clé i18n + arg,
     *          non traduits) et, le cas échéant, l'exception levée.
     */
    // eslint-disable-next-line no-unused-vars -- `card` et `to` doivent rester en portée pour l'eval() des scripts.
    static evaluate(cardContent, card, to) {
        const failures = [];
        const customEvals = Array.isArray(cardContent?.customEvals) ? cardContent.customEvals : [];

        customEvals.forEach(customEval => {
            if (!customEval.script) {
                return;
            }
            try {
                if (!eval(customEval.script)) {
                    failures.push({script: customEval.script, errorMessages: customEval.errorMessages ?? [], thrown: null});
                }
            } catch (e) {
                failures.push({script: customEval.script, errorMessages: customEval.errorMessages ?? [], thrown: e});
            }
        });

        return {ok: !failures.length, failures};
    }

    /**
     * Indique si un choix réactif est prêt à être joué — le verdict du glow
     * orange de la main : choix réactif, combat actif, hors du tour du joueur
     * (mêmes règles que `checkIfCanUseCard`), et tous les `customEvals` passent
     * en évaluation silencieuse. Les variables `XXX`/`YYY` des scripts sont
     * évaluées à 1 (valeur minimale) puisqu'aucun formulaire n'est ouvert ;
     * un script en erreur rend le choix non prêt.
     *
     * @param {object} choice - Le choix de la carte (contenu brut, non préparé).
     * @param {Card}   [card] - La carte concernée (visible des scripts).
     *
     * @returns {boolean} True si la carte réactive peut être mise en évidence.
     */
    static isReactiveReady(choice, card) {
        if (!choice?.reactive || !game.combat) {
            return false;
        }
        if (game.combat.combatant?.actor?.id === Constants.myId) {
            return false;
        }
        const substituted = {
            ...choice,
            customEvals: (Array.isArray(choice.customEvals) ? choice.customEvals : []).map(customEval => ({
                ...customEval,
                script: customEval.script?.replaceAll("XXX", "1").replaceAll("YYY", "1")
            }))
        };
        return CardCondition.evaluate(substituted, card).ok;
    }

    /* ------------------------------------------------------------------ */
    /* Accès internes                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * Retourne les logs de combat du round courant (tableau vide hors combat).
     *
     * @returns {object[]} Les entrées de log du round courant.
     */
    static #logsThisRound() {
        const logs = game.combat?.flags?.fq?.logs ?? [];
        return logs.filter(l => l.round === game.combat?.round);
    }

    /**
     * Retourne l'id du token de scène d'un acteur, ou undefined.
     *
     * @param {object} actor - L'acteur recherché.
     *
     * @returns {string|undefined} L'id du token sur la scène active.
     */
    static #tokenIdOf(actor) {
        return Constants.actorToken(actor?.id)?.id;
    }

    /**
     * Extrait d'un log les entrées de dégâts FQ effectifs (valeur > 0) ayant
     * touché le token donné.
     *
     * @param {object} log     - Une entrée de log de combat.
     * @param {string} tokenId - L'id du token visé.
     *
     * @returns {object[]} Les entrées de dégâts subies par ce token.
     */
    static #damageEntriesOnToken(log, tokenId) {
        return Object.values(log.resultArray ?? {})
            .filter(r => r.type === "damageFQ" && r.value > 0 && r.targetTokenId === tokenId);
    }

    /**
     * Retourne la position (px) d'un token, qu'il soit placeable ou document.
     *
     * @param {object} token - Le token.
     *
     * @returns {{x: number, y: number}} La position en pixels.
     */
    static #posOf(token) {
        return {x: token.x ?? token.document?.x, y: token.y ?? token.document?.y};
    }

    /* ------------------------------------------------------------------ */
    /* Prédicats sur les logs de combat (dégâts, sorts, cartes jouées)     */
    /* ------------------------------------------------------------------ */

    /**
     * Indique si l'acteur a subi des dégâts FQ effectifs durant le round courant.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si au moins une entrée de dégâts l'a touché ce round.
     */
    static tookDamageThisRound(actor = Constants.actorCurrent) {
        const tokenId = CardCondition.#tokenIdOf(actor);
        if (!tokenId) {
            return false;
        }
        return CardCondition.#logsThisRound().some(l => CardCondition.#damageEntriesOnToken(l, tokenId).length);
    }

    /**
     * Indique si le dernier assaillant ayant blessé l'acteur ce round se trouve
     * à portée. Sert aux réactifs « contre-attaque » (Riposte, Coup de bouclier).
     *
     * @param {number} maxCases - La distance maximale (en cases) à l'assaillant.
     * @param {object} [actor]  - La victime ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si des dégâts ont été subis ce round et que
     *                    l'assaillant est à `maxCases` ou moins.
     */
    static attackerWithinReach(maxCases, actor = Constants.actorCurrent) {
        const tokenId = CardCondition.#tokenIdOf(actor);
        if (!tokenId) {
            return false;
        }
        const lastHit = CardCondition.#logsThisRound()
            .filter(l => CardCondition.#damageEntriesOnToken(l, tokenId).length)
            .at(-1);
        if (!lastHit) {
            return false;
        }
        const attackerToken = Constants.actorToken(lastHit.actorId);
        const myToken = Constants.actorToken(actor?.id);
        if (!attackerToken || !myToken) {
            return false;
        }
        const dist = Geometry.distanceBetweenTokens(myToken, attackerToken);
        return dist <= maxCases;
    }

    /**
     * Indique si l'acteur a subi un sort durant le round courant — c'est-à-dire
     * une carte à coût de mana (mana négatif) jouée en le ciblant.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si un sort l'a ciblé ce round.
     */
    static tookSpellThisRound(actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        return CardCondition.#logsThisRound()
            .some(l => l.targetsId?.includes(actor.id) && Number(l.cardContent?.mana) < 0);
    }

    /**
     * Indique si une attaque portée par l'acteur a été esquivée ce round.
     *
     * @param {object} [actor] - L'attaquant ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si l'une de ses attaques du round a été esquivée.
     */
    static attackEvadedThisRound(actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        return CardCondition.#logsThisRound()
            .filter(l => l.actorId === actor.id)
            .some(l => Object.values(l.resultArray ?? {}).some(r => r.evasion));
    }

    /**
     * Indique si l'acteur a déjà joué une carte durant le round courant.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si un log du round porte son id.
     */
    static hasPlayedCardThisRound(actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        return CardCondition.#logsThisRound().some(l => l.actorId === actor.id);
    }

    /**
     * Indique si la dernière carte jouée par l'acteur ce round porte le nom donné.
     *
     * @param {string} name    - Le nom attendu (`cardContent.name`).
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si sa dernière carte du round s'appelle `name`.
     */
    static lastPlayedCardIs(name, actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        const last = CardCondition.#logsThisRound().filter(l => l.actorId === actor.id).at(-1);
        return last?.cardContent?.name === name;
    }

    /**
     * Indique si la dernière carte jouée par l'acteur depuis le début du combat
     * (tous rounds confondus) avait un coût de mana — c'est-à-dire était un sort.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si sa dernière carte du combat coûtait du mana.
     */
    static lastPlayedCardCostMana(actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        const logs = game.combat?.flags?.fq?.logs ?? [];
        const last = logs.filter(l => l.actorId === actor.id).at(-1);
        return Number(last?.cardContent?.mana) < 0;
    }

    /**
     * Indique si la dernière carte jouée par l'utilisateur ce round était une
     * attaque mono-cible (dégâts + portée déclarée, sans `nbTargets`) et que la
     * cible actuellement sélectionnée est différente de celle qui l'a subie —
     * la condition de la Propagation de dégâts de l'élémentaliste.
     *
     * @returns {boolean} True si les dégâts précédents peuvent se propager à la
     *                    sélection courante.
     */
    static lastPlayedDamageCardOnOtherTarget() {
        const actor = Constants.actorCurrent;
        if (!actor?.id) {
            return false;
        }
        const last = CardCondition.#logsThisRound().filter(l => l.actorId === actor.id).at(-1);
        const cardContent = last?.cardContent;
        if (!cardContent || cardContent.nbTargets || !cardContent.minReach || !cardContent.damage) {
            return false;
        }
        const targetIds = Constants.currentTargets.map(t => Constants.tokenActorId(t));
        return !targetIds.includes(last.targetsId?.[0]);
    }

    /**
     * Indique si chaque cible sélectionnée a infligé des dégâts FQ effectifs
     * durant le round courant (Bouclier Vengeur).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles ont toutes
     *                    infligé des dégâts ce round.
     */
    static targetsDealtDamageThisRound() {
        const targets = Constants.currentTargets;
        if (!targets.length) {
            return false;
        }
        const logs = CardCondition.#logsThisRound();
        return targets.every(t => {
            const actorId = Constants.tokenActorId(t);
            return logs.filter(l => l.actorId === actorId)
                .some(l => Object.values(l.resultArray ?? {}).some(r => r.type === "damageFQ" && r.value > 0));
        });
    }

    /**
     * Indique si chaque cible sélectionnée a subi des dégâts FQ effectifs durant
     * le round courant (Bouclier Divin, Bouclier Empathique).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles ont toutes
     *                    subi des dégâts ce round.
     */
    static targetsTookDamageThisRound() {
        const targets = Constants.currentTargets;
        if (!targets.length) {
            return false;
        }
        const logs = CardCondition.#logsThisRound();
        return targets.every(t => logs.some(l => CardCondition.#damageEntriesOnToken(l, t.id).length));
    }

    /**
     * Indique si chaque cible sélectionnée est le combattant dont c'est le tour
     * — la garde des réactifs qui punissent la conduite du tour adverse.
     *
     * @returns {boolean} True s'il y a au moins une cible, un combattant courant,
     *                    et que toutes les cibles sont ce combattant.
     */
    static targetsAreCurrentCombatant() {
        const targets = Constants.currentTargets;
        const tokenId = game.combat?.combatant?.tokenId;
        if (!targets.length || !tokenId) {
            return false;
        }
        return targets.every(t => t.id === tokenId);
    }

    /**
     * Indique si chaque cible sélectionnée est restée sur sa case depuis le
     * début de son tour (Piège à Fosse).
     *
     * Le registre est celui de Foundry, pas le nôtre : `Combat` vide
     * l'historique de déplacement de TOUS les combattants au début de chaque
     * tour (`_clearMovementHistoryOnStartTurn`), si bien qu'un historique vide
     * signifie exactement « ce jeton n'a pas bougé depuis le début du tour en
     * cours ». Hors combat, personne ne vide rien : le prédicat est faux.
     *
     * @returns {boolean} True s'il y a au moins une cible, un combat en cours,
     *                    et qu'aucune cible n'a bougé depuis le début du tour.
     */
    static targetsHaveNotMovedThisTurn() {
        const targets = Constants.currentTargets;
        if (!targets.length || !game.combat) {
            return false;
        }
        return targets.every(t => !(t.document?.movementHistory ?? t.movementHistory ?? []).length);
    }

    /* ------------------------------------------------------------------ */
    /* Prédicats de ciblage et de géométrie                                */
    /* ------------------------------------------------------------------ */

    /**
     * Indique si toutes les cibles sélectionnées sont à portée de la carte, la
     * portée étant lue depuis le contenu du choix (`minReach`/`maxReach`) —
     * jamais passée en dur par le script.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte, portées résolues.
     *
     * @returns {boolean} True s'il y a au moins une cible, un token lanceur, une
     *                    portée déclarée, et aucune cible hors portée.
     */
    static targetsWithinReach(cardContent) {
        if (cardContent?.maxReach === "" || cardContent?.maxReach == null) {
            return false;
        }
        const targets = Constants.currentTargets;
        const casterToken = Constants.myToken;
        if (!targets.length || !casterToken) {
            return false;
        }
        const minReach = Number(cardContent.minReach) || 0;
        const maxReach = Number(cardContent.maxReach);
        return !TargetingPredicates.findOutOfReachTargets(casterToken, targets, minReach, maxReach).length;
    }

    /**
     * Indique si toutes les cibles sélectionnées partagent la colonne (même X)
     * ou la ligne (même Y) du token de l'utilisateur.
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles sont toutes
     *                    alignées orthogonalement avec le lanceur.
     */
    static targetsAlignedWithSelf() {
        const targets = Constants.currentTargets;
        const myToken = Constants.myToken;
        if (!targets.length || !myToken) {
            return false;
        }
        return targets.every(t => CardCondition.#posOf(t).x === myToken.x)
            || targets.every(t => CardCondition.#posOf(t).y === myToken.y);
    }

    /**
     * Indique si toutes les cibles sélectionnées sont sur une diagonale du token
     * de l'utilisateur (|Δx| = |Δy|).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles sont toutes
     *                    en diagonale du lanceur.
     */
    static targetsDiagonalWithSelf() {
        const targets = Constants.currentTargets;
        const myToken = Constants.myToken;
        if (!targets.length || !myToken) {
            return false;
        }
        return targets.every(t => {
            const pos = CardCondition.#posOf(t);
            return Math.abs(pos.x - myToken.x) === Math.abs(pos.y - myToken.y);
        });
    }

    /**
     * Indique si toutes les cibles sélectionnées tiennent dans un carré de
     * `side` × `side` cases.
     *
     * @param {number} side - Le côté du carré, en cases.
     *
     * @returns {boolean} True s'il y a au moins une cible et que leurs positions
     *                    tiennent dans le carré.
     */
    static targetsWithinSquare(side) {
        const targets = Constants.currentTargets;
        const squareSize = game.canvas?.scene?.dimensions?.size;
        if (!targets.length || !squareSize) {
            return false;
        }
        const cols = targets.map(t => CardCondition.#posOf(t).x / squareSize);
        const rows = targets.map(t => CardCondition.#posOf(t).y / squareSize);
        return (Math.max(...cols) - Math.min(...cols)) <= side - 1
            && (Math.max(...rows) - Math.min(...rows)) <= side - 1;
    }

    /**
     * Indique si toutes les cibles sélectionnées sont alignées avec le token de
     * l'utilisateur (sa colonne ou sa ligne) et toutes du même côté — la
     * trajectoire d'une charge en ligne droite (Déplacement éclair).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles sont
     *                    toutes sur une même demi-droite orthogonale partant du lanceur.
     */
    static targetsAlignedOnOneSide() {
        const targets = Constants.currentTargets;
        const myToken = Constants.myToken;
        if (!targets.length || !myToken) {
            return false;
        }
        const positions = targets.map(t => CardCondition.#posOf(t));
        const onColumn = positions.every(p => p.x === myToken.x)
            && (positions.every(p => p.y > myToken.y) || positions.every(p => p.y < myToken.y));
        const onRow = positions.every(p => p.y === myToken.y)
            && (positions.every(p => p.x > myToken.x) || positions.every(p => p.x < myToken.x));
        return onColumn || onRow;
    }

    /**
     * Indique si exactement deux cibles sont sélectionnées et orthogonalement
     * adjacentes l'une à l'autre.
     *
     * @returns {boolean} True pour une paire de cibles adjacentes.
     */
    static targetsAdjacentPair() {
        const targets = Constants.currentTargets;
        if (targets.length !== 2) {
            return false;
        }
        return CardCondition.#areOrthogonallyAdjacent(targets[0], targets[1]);
    }

    /**
     * Indique si l'une des cibles sélectionnées est orthogonalement adjacente à
     * toutes les autres (forme en croix autour d'une cible centrale).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'une cible
     *                    centrale touche toutes les autres.
     */
    static targetsClustered() {
        const targets = Constants.currentTargets;
        if (!targets.length) {
            return false;
        }
        return targets.some(center =>
            targets.filter(t => t !== center).every(t => CardCondition.#areOrthogonallyAdjacent(center, t)));
    }

    /**
     * Indique si deux tokens occupent des cases orthogonalement adjacentes.
     *
     * @param {object} a - Le premier token.
     * @param {object} b - Le second token.
     *
     * @returns {boolean} True si les tokens se touchent orthogonalement.
     */
    static #areOrthogonallyAdjacent(a, b) {
        const squareSize = game.canvas?.scene?.dimensions?.size;
        if (!squareSize) {
            return false;
        }
        const posA = CardCondition.#posOf(a);
        const posB = CardCondition.#posOf(b);
        return (Math.abs(posA.x - posB.x) === squareSize && posA.y === posB.y)
            || (Math.abs(posA.y - posB.y) === squareSize && posA.x === posB.x);
    }

    /* ------------------------------------------------------------------ */
    /* Prédicats sur les effets actifs                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Indique si le personnage de l'utilisateur porte un effet actif — l'un des
     * effets nommés si une liste est fournie, n'importe lequel sinon.
     *
     * @param {string[]} [names] - Les noms d'effets acceptés (vide = tout effet).
     *
     * @returns {boolean} True si un effet correspondant est porté.
     */
    static selfHasEffect(names = []) {
        const effects = [...(Constants.actorCurrent?.effects ?? [])];
        if (!names.length) {
            return !!effects.length;
        }
        return effects.some(e => names.includes(e.name));
    }

    /**
     * Compte les effets actifs portés par le personnage de l'utilisateur — parmi
     * les noms donnés si une liste est fournie, tous sinon. Sert aux cartes dont
     * la puissance dépend d'un empilement d'effets sur le lanceur (ex : les
     * malédictions accumulées du Mage Blanc), typiquement via un
     * `xvalue`/`customEvals` `SCRIPT:FqCardEngineModule.cond.selfEffectCount(["Curse"])`.
     *
     * @param {string[]} [names] - Les noms d'effets comptés (vide = tous).
     *
     * @returns {number} Le nombre d'effets correspondants (0 sans acteur).
     */
    static selfEffectCount(names = []) {
        const effects = [...(Constants.actorCurrent?.effects ?? [])];
        return effects.filter(e => !names.length || names.includes(e.name)).length;
    }

    /**
     * Indique si TOUTES les cibles sélectionnées ont des points de vie restants
     * strictement inférieurs au seuil — le prédicat des cartes d'exécution
     * (« inflige N dégâts si et seulement si cela achève la cible »). Faux sans
     * cible sélectionnée ou si une cible n'expose pas ses points de vie.
     *
     * @param {number} threshold - Le seuil de dégâts à comparer aux PV restants.
     *
     * @returns {boolean} True si chaque cible mourrait à `threshold` dégâts.
     */
    static targetsHpBelow(threshold) {
        const targets = Constants.currentTargets;
        return targets.length > 0 && targets.every(t => {
            const hp = t.actor?.system?.attributes?.hp?.value;
            return Number.isFinite(hp) && hp < threshold;
        });
    }

    /**
     * Indique si au moins une cible sélectionnée porte `minCount` effets actifs
     * ou plus parmi les noms donnés (liste vide = n'importe quel effet).
     *
     * @param {string[]} [names]    - Les noms d'effets acceptés (vide = tout effet).
     * @param {number}   [minCount] - Le nombre minimal d'effets correspondants (défaut 1).
     *
     * @returns {boolean} True si une cible porte assez d'effets correspondants.
     */
    static targetsHaveEffect(names = [], minCount = 1) {
        return Constants.currentTargets.some(t => {
            const effects = [...(t.actor?.effects ?? [])];
            return effects.filter(e => !names.length || names.includes(e.name)).length >= minCount;
        });
    }

    /* ------------------------------------------------------------------ */
    /* Prédicats sur l'état du personnage                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Indique si un compteur des flags FQ du personnage, augmenté d'un ajout,
     * reste sous un plafond. Sert aux cartes qui empilent une charge (ex :
     * `bladeCharging`) : le script passe `XXX` comme ajout.
     *
     * @param {string}        name - Le nom du compteur dans `flags.fq`.
     * @param {string|number} add  - La valeur ajoutée (souvent `XXX` substitué).
     * @param {number}        cap  - Le plafond inclus.
     *
     * @returns {boolean} True si compteur + ajout ≤ plafond.
     */
    static counterWithinCap(name, add, cap) {
        const current = Constants.actorCurrent?.flags?.fq?.[name] ?? 0;
        return current + Number(add || 0) <= cap;
    }

    /**
     * Indique si un compteur des flags FQ du personnage vaut exactement une valeur.
     *
     * @param {string} name  - Le nom du compteur dans `flags.fq`.
     * @param {number} value - La valeur attendue.
     *
     * @returns {boolean} True si le compteur vaut `value` (0 si absent).
     */
    static counterEquals(name, value) {
        return (Constants.actorCurrent?.flags?.fq?.[name] ?? 0) === value;
    }

    /**
     * Indique si un compteur de sbires du personnage (`system.fq.minions.*`)
     * atteint un minimum — le squelette sacrifié de la sorcière, par exemple.
     *
     * @param {string} name  - Le nom du compteur.
     * @param {number} [min] - Le minimum requis (défaut 1).
     *
     * @returns {boolean} True si le compteur vaut au moins `min`.
     */
    static minionsAtLeast(name, min = 1) {
        return Number(Constants.actorFQ?.minions?.[name] ?? 0) >= min;
    }

    /**
     * Indique si le personnage dispose d'au moins `n` points de mana.
     *
     * @param {number} [n] - Le minimum requis (défaut 1).
     *
     * @returns {boolean} True si la réserve de mana atteint `n`.
     */
    static hasMana(n = 1) {
        return (Constants.actorFQ?.mana?.value ?? 0) >= n;
    }

    /**
     * Indique si le personnage a du mana manquant (réserve sous son maximum).
     *
     * @returns {boolean} True si mana courant < mana max.
     */
    static missingMana() {
        const mana = Constants.actorFQ?.mana;
        return mana != null && mana.value < mana.max;
    }

    /**
     * Indique si un acteur porte au moins `n` rangs d'épuisement — le prérequis
     * des cartes qui soignent la fatigue, qui ne doivent pas se jouer à vide.
     *
     * @param {number} [n]     - Le minimum requis (défaut 1).
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si l'épuisement de l'acteur atteint `n`.
     */
    static hasExhaustion(n = 1, actor = Constants.actorCurrent) {
        return (Number(actor?.system?.attributes?.exhaustion) || 0) >= n;
    }

    /**
     * Indique si le personnage s'est défaussé d'au moins `n` cartes pendant le
     * tour courant (compteur `fq.cards.currentDrop`, remis à zéro à chaque tour).
     *
     * @param {number} [n] - Le minimum requis (défaut 1).
     *
     * @returns {boolean} True si le nombre de défausses du tour atteint `n`.
     */
    static droppedThisTurn(n = 1) {
        return Number(Constants.actorFQ?.cards?.currentDrop ?? 0) >= n;
    }

    /**
     * Indique si un acteur a des points de vie manquants.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si PV courants < PV max.
     */
    static missingHp(actor = Constants.actorCurrent) {
        const hp = actor?.system?.attributes?.hp;
        return hp != null && hp.value < hp.max;
    }

    /**
     * Indique si un acteur porte un bouclier équipé (équipement dnd5e dont
     * `system.type.value` vaut `shield`) — le prérequis des cartes qui frappent
     * ou parent AVEC le bouclier, pendant du garde-fou d’arme des jetons
     * `@wpnM`/`@wpnR` (cf. `WeaponDamage.getEquippedWeapon`).
     *
     * @param {object} [actor] - L’acteur ; à défaut, le personnage de l’utilisateur.
     *
     * @returns {boolean} True si un bouclier équipé est porté.
     */
    static hasEquippedShield(actor = Constants.actorCurrent) {
        const equipped = actor?.items?.filter(i => i.type === "equipment" && i.system?.equipped) ?? [];
        return equipped.some(i => i.system?.type?.value === "shield");
    }

    /* ------------------------------------------------------------------ */
    /* Prédicats sur la pioche et la main                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Indique si la pioche d'origine d'une carte contient encore au moins `n`
     * cartes non tirées.
     *
     * @param {Card}   card - La carte (sa `source` désigne la pioche).
     * @param {number} [n]  - Le minimum requis (défaut 1).
     *
     * @returns {boolean} True si la pioche peut fournir `n` cartes.
     */
    static deckHasCards(card, n = 1) {
        return TradingCards.countAvailableCards(card?.source) >= n;
    }

    /**
     * Indique si le deck d'origine d'une carte compte au moins `n` cartes, TOUTES
     * cartes confondues : celles qui restent à piocher, celles déjà tirées (elles
     * demeurent dans le deck marquées `drawn` le temps du combat) et les cartes
     * générées qu'un remélange y a recyclées. Mesure donc la taille réelle du deck
     * constitué, et non ce qu'il reste à en tirer
     * (cf. {@link CardCondition.deckHasCards}) : le garde-fou des cartes qu'un deck
     * trop court ne doit pas pouvoir exploiter en boucle.
     *
     * @param {Card}   card - La carte (sa `source` désigne le deck d'origine).
     * @param {number} [n]  - La taille minimale requise (défaut 1).
     *
     * @returns {boolean} True si le deck atteint `n` cartes.
     */
    static deckSizeAtLeast(card, n = 1) {
        return (card?.source?.cards?.size ?? 0) >= n;
    }

    /**
     * Indique si la main contenant une carte compte au moins `n` autres cartes
     * (la carte elle-même exclue).
     *
     * @param {Card}   card - La carte dont on inspecte la main.
     * @param {number} [n]  - Le minimum d'autres cartes requis (défaut 1).
     *
     * @returns {boolean} True si la main contient `n` cartes en plus de celle-ci.
     */
    static handHasOtherCards(card, n = 1) {
        return ((card?.parent?.cards?.size ?? 0) - 1) >= n;
    }
}
