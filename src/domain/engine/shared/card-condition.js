import Constants from "../../constants.js";
import Geometry from "./geometry.js";
import TargetingPredicates from "./targeting-predicates.js";
import TradingCards from "../../trading/trading-cards.js";
import WeaponDamage, {WEAPON_TOKENS} from "../roll/weapon-damage.js";

/**
 * Hooks Foundry qui peuvent rendre un choix réactif jouable, donc au terme
 * desquels `isReactiveReady` doit être réévalué : logs de combat (carte jouée,
 * attaque/sort dnd5e via `updateCombat`), changement de combattant, début et
 * fin de combat, changement de cible. Liste unique, partagée par les DEUX
 * consommateurs du verdict — le halo orange de la main (`hand-board.js`) et le
 * déclenchement des cartes préparées (`prepared-card.hook.js`) : ce que le halo
 * promet et ce que la préparation joue ne doivent jamais diverger.
 * @type {string[]}
 */
export const REACTIVE_READY_HOOKS = Object.freeze([
    "updateCombat", "combatTurnChange", "createCombat", "deleteCombat", "targetToken"
]);

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
     * en évaluation silencieuse. Aucune évaluation n'a lieu pendant le tour du
     * joueur : le verdict tombe avant les scripts. Un script en erreur rend le
     * choix non prêt.
     *
     * Les variables `XXX`/`YYY` des scripts valent 1 par défaut (valeur
     * minimale) puisqu'aucun formulaire n'est ouvert. Une carte PRÉPARÉE porte
     * en revanche les valeurs saisies à sa préparation : son déclenchement
     * automatique doit juger les conditions sur les nombres qui seront
     * réellement joués.
     *
     * @param {object} choice             - Le choix de la carte (contenu brut, non préparé).
     * @param {Card}   [card]             - La carte concernée (visible des scripts).
     * @param {object} [options]          - Les valeurs de substitution des variables.
     * @param {number|string} [options.xValue=1] - La valeur substituée à `XXX`.
     * @param {number|string} [options.yValue=1] - La valeur substituée à `YYY`.
     *
     * @returns {boolean} True si la carte réactive peut être mise en évidence.
     */
    static isReactiveReady(choice, card, {xValue = 1, yValue = 1} = {}) {
        if (!choice?.reactive || !game.combat) {
            return false;
        }
        if (CardCondition.reactiveBlockedByOwnTurn(choice)) {
            return false;
        }
        const substituted = {
            ...choice,
            customEvals: (Array.isArray(choice.customEvals) ? choice.customEvals : []).map(customEval => ({
                ...customEval,
                script: customEval.script?.replaceAll("XXX", String(xValue)).replaceAll("YYY", String(yValue))
            }))
        };
        return CardCondition.evaluate(substituted, card).ok;
    }

    /**
     * Indique si un choix réactif est bloqué parce que c'est le tour de son
     * porteur — LA règle « un réactif se joue hors de son tour », définie une
     * seule fois pour ses deux lectures : le garde de jouabilité
     * (`checkIfCanUseCard`, qui publie l'avertissement) et le verdict silencieux
     * du halo de la main ({@link CardCondition.isReactiveReady}). Les deux ne
     * doivent jamais diverger.
     *
     * Un combat dont le combattant actif n'est pas encore désigné ne bloque
     * rien : personne ne joue son tour.
     *
     * @param {object} [cardContent] - Le contenu (choix) de la carte.
     * @param {object} [actor]       - Le porteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si le choix est réactif et que c'est le tour du porteur.
     */
    static reactiveBlockedByOwnTurn(cardContent, actor = Constants.actorCurrent) {
        if (!cardContent?.reactive || !game.combat) {
            return false;
        }
        return game.combat.combatant?.actor?.id === actor?.id;
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
     * Retourne les entrées de log portées par un acteur — celles du round
     * courant, ou celles de tout le combat si `allRounds` est demandé. Tableau
     * vide sans acteur ou hors combat : la garde commune à tous les prédicats
     * qui interrogent « ce que j'ai joué ».
     *
     * @param {object}  actor               - L'acteur dont on lit les logs.
     * @param {object}  [options]           - Les options de fenêtre.
     * @param {boolean} [options.allRounds] - Vrai pour balayer tout le combat.
     *
     * @returns {object[]} Les entrées de log de cet acteur.
     */
    static #logsOf(actor, {allRounds = false} = {}) {
        if (!actor?.id) {
            return [];
        }
        const logs = allRounds ? (game.combat?.flags?.fq?.logs ?? []) : CardCondition.#logsThisRound();
        return logs.filter(l => l.actorId === actor.id);
    }

    /**
     * Retourne la dernière entrée de log d'un acteur dans la fenêtre demandée.
     *
     * @param {object} actor     - L'acteur dont on lit les logs.
     * @param {object} [options] - Les options de fenêtre de {@link CardCondition.#logsOf}.
     *
     * @returns {object|undefined} La dernière entrée, ou undefined.
     */
    static #lastLogOf(actor, options) {
        return CardCondition.#logsOf(actor, options).at(-1);
    }

    /**
     * Extrait d'un log les entrées de dégâts FQ effectifs (valeur > 0), toutes
     * cibles confondues ou limitées au token donné. Définition unique de « des
     * dégâts ont réellement été infligés ».
     *
     * @param {object} log       - Une entrée de log de combat.
     * @param {string} [tokenId] - L'id du token visé ; à défaut, toutes les cibles.
     *
     * @returns {object[]} Les entrées de dégâts effectifs correspondantes.
     */
    static #damageEntries(log, tokenId) {
        return Object.values(log.resultArray ?? {})
            .filter(r => r.type === "damageFQ" && r.value > 0 && (!tokenId || r.targetTokenId === tokenId));
    }

    /**
     * Applique un prédicat à TOUTES les cibles sélectionnées. Faux sans cible :
     * une sélection vide ne satisfait jamais une condition de ciblage.
     *
     * @param {function(object): boolean} predicate - Le prédicat évalué par cible.
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles passent toutes.
     */
    static #everyTarget(predicate) {
        const targets = Constants.currentTargets;
        return targets.length > 0 && targets.every(predicate);
    }

    /**
     * Retourne les effets actifs d'un porteur correspondant aux noms donnés
     * (liste vide = tous ses effets). Tolère l'absence de porteur.
     *
     * @param {object}   holder  - L'acteur porteur des effets.
     * @param {string[]} [names] - Les noms d'effets retenus (vide = tous).
     *
     * @returns {object[]} Les effets correspondants.
     */
    static #effectsNamed(holder, names = []) {
        return [...(holder?.effects ?? [])].filter(e => !names.length || names.includes(e.name));
    }

    /**
     * Retourne un compteur des flags FQ du personnage de l'utilisateur (0 si absent).
     *
     * @param {string} name - Le nom du compteur dans `flags.fq`.
     *
     * @returns {*} La valeur du compteur.
     */
    static #counter(name) {
        return Constants.actorCurrent?.flags?.fq?.[name] ?? 0;
    }

    /**
     * Indique si une réserve `{value, max}` est entamée. Faux si la réserve
     * n'existe pas : on ne restaure pas ce qui n'est pas suivi.
     *
     * @param {?{value: number, max: number}} pool - La réserve inspectée.
     *
     * @returns {boolean} True si la valeur courante est sous le maximum.
     */
    static #belowMax(pool) {
        return pool != null && pool.value < pool.max;
    }

    /**
     * Retourne la borne du dernier tour joué par un acteur dans le combat en
     * cours, sous la forme `{round, turn}` — le repère depuis lequel se mesure
     * la fenêtre « depuis la fin de mon tour ».
     *
     * Le tour d'un combattant est son INDEX dans l'ordre d'initiative : la
     * borne porte donc cet index, et le round de son dernier passage — le round
     * courant si son tour y est déjà passé, le précédent sinon (son propre tour
     * en cours compris, puisque la fenêtre ne s'ouvre qu'à la fin de celui-ci).
     *
     * @param {object} actor - L'acteur dont on cherche le dernier tour.
     *
     * @returns {?{round: number, turn: number}} La borne, ou null hors combat ou
     *                                           si l'acteur n'est pas un combattant.
     */
    static #lastTurnOf(actor) {
        const combat = game.combat;
        const round = Number(combat?.round);
        const turn = Number(combat?.turn);
        const index = (combat?.turns ?? []).findIndex(c => (c.actorId ?? c.actor?.id) === actor?.id);
        if (index < 0 || !Number.isFinite(round) || !Number.isFinite(turn)) {
            return null;
        }
        return {round: turn > index ? round : round - 1, turn: index};
    }

    /**
     * Retourne les entrées de log postérieures à la fin du dernier tour de
     * l'acteur : strictement après sa borne `{round, turn}`, ce qui écarte les
     * cartes jouées pendant son propre tour et couvre le passage de round.
     *
     * @param {object} actor - L'acteur de référence.
     *
     * @returns {object[]} Les entrées de log de la fenêtre (vide hors combat).
     */
    static #logsSinceLastTurnOf(actor) {
        const boundary = CardCondition.#lastTurnOf(actor);
        if (!boundary) {
            return [];
        }
        return (game.combat?.flags?.fq?.logs ?? []).filter(log => {
            const round = Number(log.round);
            return round > boundary.round || (round === boundary.round && Number(log.turn) > boundary.turn);
        });
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
        return CardCondition.damageTakenThisRound(actor) > 0;
    }

    /**
     * Somme des dégâts FQ effectifs encaissés par l'acteur pendant le round
     * courant, toutes sources confondues — le pendant chiffré de
     * {@link CardCondition.tookDamageThisRound}, pour les cartes dont le
     * déclenchement dépend d'un SEUIL de dégâts cumulés et non d'un seul coup.
     * Les dégâts périodiques (`fq.bonus.dot`), appliqués hors du pipeline de
     * cartes, ne sont pas journalisés et n'entrent donc pas dans ce total.
     *
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {number} Le total encaissé ce round (0 sans token, sans combat ou sans dégât).
     */
    static damageTakenThisRound(actor = Constants.actorCurrent) {
        const tokenId = Constants.actorToken(actor?.id)?.id;
        if (!tokenId) {
            return 0;
        }
        return CardCondition.#logsThisRound()
            .flatMap(l => CardCondition.#damageEntries(l, tokenId))
            .reduce((total, entry) => total + Number(entry.value || 0), 0);
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
        const victimToken = Constants.actorToken(actor?.id);
        if (!victimToken) {
            return false;
        }
        const lastHit = CardCondition.#logsThisRound()
            .filter(l => CardCondition.#damageEntries(l, victimToken.id).length)
            .at(-1);
        const attackerToken = lastHit ? Constants.actorToken(lastHit.actorId) : undefined;
        if (!attackerToken) {
            return false;
        }
        return Geometry.distanceBetweenTokens(victimToken, attackerToken) <= maxCases;
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
        return CardCondition.#logsOf(actor)
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
        return CardCondition.#logsOf(actor).length > 0;
    }

    /**
     * Indique si l'acteur a joué au moins `n` cartes RÉACTIVES depuis la fin de
     * son dernier tour — la fenêtre des réactifs qui récompensent une chaîne de
     * ripostes. Elle court d'un tour de l'acteur au suivant et franchit donc le
     * passage de round, contrairement aux prédicats en `ThisRound`.
     *
     * Seules les cartes passées par le moteur sont comptées : le journal de
     * combat n'enregistre que celles-là.
     *
     * @param {number} [n]     - Le minimum requis (défaut 1).
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si la fenêtre contient au moins `n` cartes réactives de l'acteur.
     */
    static reactivesPlayedSinceMyTurn(n = 1, actor = Constants.actorCurrent) {
        if (!actor?.id) {
            return false;
        }
        return CardCondition.#logsSinceLastTurnOf(actor)
            .filter(l => l.actorId === actor.id && !!l.cardContent?.reactive).length >= n;
    }

    /**
     * Indique si la dernière carte jouée par l'acteur ce round est bien celle
     * dont le nom est donné — le nom de la CARTE tel qu'il est journalisé, une
     * clé i18n (`FQCARDTITLE.Ambush`), et non le nom du CHOIX joué : un choix
     * n'en porte le plus souvent aucun, et jamais celui de sa carte.
     *
     * @param {string} name    - Le nom de carte attendu (clé i18n).
     * @param {object} [actor] - L'acteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {boolean} True si sa dernière carte du round est celle-là.
     */
    static lastPlayedCardIs(name, actor = Constants.actorCurrent) {
        return CardCondition.#lastLogOf(actor)?.cardName === name;
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
        return Number(CardCondition.#lastLogOf(actor, {allRounds: true})?.cardContent?.mana) < 0;
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
        const last = CardCondition.#lastLogOf(Constants.actorCurrent);
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
        const logs = CardCondition.#logsThisRound();
        return CardCondition.#everyTarget(t => {
            const actorId = Constants.tokenActorId(t);
            return logs.filter(l => l.actorId === actorId)
                .some(l => CardCondition.#damageEntries(l).length);
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
        const logs = CardCondition.#logsThisRound();
        return CardCondition.#everyTarget(t => logs.some(l => CardCondition.#damageEntries(l, t.id).length));
    }

    /**
     * Indique si chaque cible sélectionnée est le combattant dont c'est le tour
     * — la garde des réactifs qui punissent la conduite du tour adverse.
     *
     * @returns {boolean} True s'il y a au moins une cible, un combattant courant,
     *                    et que toutes les cibles sont ce combattant.
     */
    static targetsAreCurrentCombatant() {
        const tokenId = game.combat?.combatant?.tokenId;
        return !!tokenId && CardCondition.#everyTarget(t => t.id === tokenId);
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
        return !!game.combat
            && CardCondition.#everyTarget(t => !(t.document?.movementHistory ?? t.movementHistory ?? []).length);
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
        const myToken = Constants.myToken;
        if (!myToken) {
            return false;
        }
        return CardCondition.#everyTarget(t => Geometry.positionOf(t).x === myToken.x)
            || CardCondition.#everyTarget(t => Geometry.positionOf(t).y === myToken.y);
    }

    /**
     * Indique si toutes les cibles sélectionnées sont sur une diagonale du token
     * de l'utilisateur (|Δx| = |Δy|).
     *
     * @returns {boolean} True s'il y a au moins une cible et qu'elles sont toutes
     *                    en diagonale du lanceur.
     */
    static targetsDiagonalWithSelf() {
        const myToken = Constants.myToken;
        if (!myToken) {
            return false;
        }
        return CardCondition.#everyTarget(t => {
            const pos = Geometry.positionOf(t);
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
        const cols = targets.map(t => Geometry.positionOf(t).x / squareSize);
        const rows = targets.map(t => Geometry.positionOf(t).y / squareSize);
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
        const positions = targets.map(t => Geometry.positionOf(t));
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
     * Indique si deux tokens occupent des cases orthogonalement adjacentes,
     * c'est-à-dire distantes d'exactement une case en distance de Manhattan :
     * une diagonale en vaut deux, et une grille absente rend la distance non
     * finie, donc la réponse fausse.
     *
     * @param {object} a - Le premier token.
     * @param {object} b - Le second token.
     *
     * @returns {boolean} True si les tokens se touchent orthogonalement.
     */
    static #areOrthogonallyAdjacent(a, b) {
        const posA = Geometry.positionOf(a);
        const posB = Geometry.positionOf(b);
        return Geometry.getDistanceBetweenTwoSquares(posA.x, posA.y, posB.x, posB.y) === 1;
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
        return CardCondition.selfEffectCount(names) >= 1;
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
        return CardCondition.#effectsNamed(Constants.actorCurrent, names).length;
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
        return CardCondition.#everyTarget(t => {
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
        return Constants.currentTargets
            .some(t => CardCondition.#effectsNamed(t.actor, names).length >= minCount);
    }

    /**
     * Compte les effets actifs portés par TOUS les ennemis du combat en cours —
     * parmi les noms donnés si une liste est fournie, tous sinon. Le camp est
     * celui du ciblage « Combat » (`TargetingPredicates.areEnemies` sur la
     * disposition du token, comparée à celle du lanceur) et le corpus celui de
     * `CombatTargeting` : les tokens de la scène active inscrits au combat.
     * Sert aux cartes dont la puissance dépend d'un empilement d'effets RÉPANDU
     * sur le camp adverse (ex : les malédictions semées par le Mage Blanc), là
     * où {@link CardCondition.selfEffectCount} compte celui du lanceur et
     * {@link CardCondition.targetsHaveEffect} celui des seules cibles
     * sélectionnées.
     *
     * @param {string[]} [names] - Les noms d'effets comptés (vide = tous).
     *
     * @returns {number} Le nombre total d'effets correspondants (0 hors combat ou sans token du lanceur).
     */
    static combatEnemiesEffectCount(names = []) {
        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        if (!casterToken) {
            return 0;
        }
        const combatantTokenIds = Constants.combatantTokenIds;
        return [...(game.canvas?.scene?.tokens ?? [])]
            .filter(token => token.actorId && combatantTokenIds.includes(token.id))
            .filter(token => TargetingPredicates.areEnemies(token, casterToken))
            .reduce((total, token) => total + CardCondition.#effectsNamed(token.actor, names).length, 0);
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
        return CardCondition.#counter(name) + Number(add || 0) <= cap;
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
        return CardCondition.#counter(name) === value;
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
     * Les tokens des sbires vivants d'un type donné invoqués par le personnage
     * courant — le repérage que les cartes d'ORDRE consomment : la condition de
     * jouabilité (« au moins un familier en vie ») comme la lecture de son arme
     * ({@link CardCondition.minionWeaponDamageDice}). À ne pas confondre avec
     * {@link CardCondition.minionsAtLeast}, qui lit les compteurs de BONUS
     * d'invocation et non les sbires réellement posés.
     *
     * @param {string} type - Le type de sbire (`beast`, `skeleton`…).
     *
     * @returns {object[]} Les tokens des sbires vivants de ce type (vide si aucun).
     */
    static minionTokensOnScene(type) {
        return TargetingPredicates.livingMinionTokens(type);
    }

    /**
     * Le dé de dégâts de l'arme de mêlée équipée du premier sbire vivant d'un
     * type, décomposé en nombre de dés et nombre de faces — les deux valeurs que
     * les cartes d'ORDRE reprennent dans `xvalue`/`yvalue` pour reconstruire
     * `XXXdYYY` dans leurs dégâts. Seul le dé de l'arme est repris : la carte est
     * jouée par l'invocateur, elle suit donc ses bonus et non ceux du sbire.
     *
     * Renvoie un dé nul si aucun sbire de ce type n'est en jeu, s'il ne porte pas
     * d'arme de mêlée ou si sa formule n'expose aucun dé ; c'est le garde-fou de
     * jouabilité de la carte (`minionTokensOnScene`) qui refuse le jeu dans ce cas.
     *
     * @param {string} type - Le type de sbire (`beast`, `skeleton`…).
     *
     * @returns {{number: number, faces: number}} Le nombre de dés et leur nombre de faces (0 et 0 si aucun dé exploitable).
     */
    static minionWeaponDamageDice(type) {
        const actor = CardCondition.minionTokensOnScene(type)[0]?.actor;
        const formula = WeaponDamage.getEquippedWeaponDamageFormula(actor, WEAPON_TOKENS["@wpnM"].categories);
        const dice = /(\d*)d(\d+)/i.exec(formula);
        return dice ? {number: Number(dice[1] || 1), faces: Number(dice[2])} : {number: 0, faces: 0};
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
        return CardCondition.#belowMax(Constants.actorFQ?.mana);
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
        return CardCondition.#belowMax(actor?.system?.attributes?.hp);
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

    /**
     * Coût en points d'action, en valeur absolue, de la PREMIÈRE arme de mêlée
     * équipée — la même que celle dont le jeton `@wpnM` tire ses dégâts, les
     * catégories venant de `WEAPON_TOKENS` et non d'une liste recopiée. Sert aux
     * cartes qui rendent (ou facturent) « le prix d'un coup d'arme », et vaut
     * garde-fou d'équipement : sans arme de mêlée, le coût est 0.
     *
     * @param {object} [actor] - L'acteur porteur ; à défaut, le personnage de l'utilisateur.
     *
     * @returns {number} Le coût en points d'action de l'arme (0 si aucune arme de mêlée équipée).
     */
    static equippedMeleeWeaponActionCost(actor = Constants.actorCurrent) {
        const weapon = WeaponDamage.getEquippedWeapon(actor, WEAPON_TOKENS["@wpnM"].categories);
        return Math.abs(Number(weapon?.system?.fq?.action ?? 0));
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
