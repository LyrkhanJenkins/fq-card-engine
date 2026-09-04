import ReachProfile from "./reach-profile.js";
import ReachRules from "./reach-rules.js";
import ReactionBudget from "./reaction-budget.js";
import WeaponDamage from "../roll/weapon-damage.js";
import TargetingPredicates from "../shared/targeting-predicates.js";

/**
 * Clé du réglage de monde qui active la fonctionnalité. Exportée pour que
 * `config/register-settings.js` et la lecture ci-dessous partagent la même
 * chaîne — comme `WEAPON_TOKENS` l'est pour les jetons d'arme.
 * @type {string}
 */
export const OPPORTUNITY_ATTACK_SETTING = "OpportunityAttack";

/**
 * Attaque d'opportunité : orchestration entre la détection de sortie de portée
 * (`reach-profile.js` / `reach-rules.js`), le budget de réaction
 * (`reaction-budget.js`) et la résolution.
 *
 * La résolution ne calcule RIEN elle-même : elle déclenche l'arme de mêlée
 * équipée du réactant via `WeaponDamage.triggerFirstEquippedWeapon` — le même
 * déclenchement que le bouton du HUD de token et les macros de combat, à la
 * validation de tour près — et laisse le pont `dnd5e.hook.js` appliquer toute la
 * chaîne FQ (bonus de dégâts, critique, esquive, FX, PV, récap chat, log de
 * combat). Aucun chemin de résolution parallèle n'est introduit.
 *
 * La notion de camp n'est pas redéfinie ici : elle vient de
 * `TargetingPredicates.areEnemies`, partagée avec le ciblage « Combat » des
 * cartes, pour qu'« ennemi » veuille dire la même chose partout dans le module.
 *
 * L'attaque est AUTOMATIQUE : aucun prompt, aucun refus possible. Tout se joue
 * sur le client du MJ désigné, qui est le seul à détecter et à résoudre.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class OpportunityAttack {

    /**
     * Attaque en cours de résolution, ou `null` :
     * `{actorId, sourceTokenId, targetTokenId}`.
     *
     * Durée de vie VOLONTAIREMENT COURTE : ce marqueur ne sert qu'à `preUseActivity`,
     * qui est synchrone et se produit forcément dans la chaîne attendue de
     * `activity.use()`. Il ne doit RIEN porter au-delà — voir `rememberTargetFor`.
     * Portée par l'acteur réactant plutôt que par un simple booléen, afin qu'un
     * usage concurrent d'une carte ne bénéficie pas du contournement de portée.
     *
     * Le token réactant est mémorisé en plus de son acteur : plusieurs jetons
     * peuvent partager le même acteur (une horde de squelettes), et la recherche
     * par acteur rendrait toujours le premier de la scène — les FX partiraient
     * alors du mauvais token.
     *
     * @type {?{actorId: string, sourceTokenId: string, targetTokenId: string}}
     */
    static pending = null;

    /**
     * Contextes d'attaque (`{source, target}`) imposés, indexés par ACTIVITÉ dnd5e.
     *
     * Le marqueur `pending` ne peut pas porter la cible jusqu'au jet de dégâts :
     * quand le réglage `BypassWeaponAttackRoll` est actif, `preRollAttackV2`
     * appelle `activity.rollDamage()` SANS l'attendre et annule le jet d'attaque.
     * `activity.use()` rend alors la main avant que `dnd5e.rollDamageV2` ne se
     * produise, et tout marqueur global serait déjà levé — la cible se perdrait,
     * la résolution ne trouverait personne, et aucun dégât ne serait appliqué.
     *
     * La cible voyage donc AVEC l'activité, mémorisée par `preUseActivity` (qui est
     * synchrone et précède tous les jets) et consommée par `rollDamageV2`. Plus
     * aucune dépendance à un ordre d'exécution. Le token réactant voyage par le même
     * chemin, pour la même raison.
     *
     * `WeakMap` : une activité oubliée n'empêche pas sa collecte, aucune fuite
     * possible même si un usage est annulé avant tout jet de dégâts.
     *
     * @type {WeakMap<object, object>}
     */
    static #contextByActivity = new WeakMap();

    /**
     * Mémorise le contexte imposé de l'attaque d'opportunité en cours pour une
     * activité. À appeler depuis `preUseActivity`, tant que `pending` est encore posé.
     *
     * @param {object} activity - L'activité dnd5e en cours d'usage.
     *
     * @returns {?{source: object, target: object}} Le contexte mémorisé, ou `null` si aucune attaque en cours pour cette activité.
     */
    static rememberContextFor(activity) {
        const context = OpportunityAttack.contextFor(activity);
        if (!context) {
            return null;
        }
        OpportunityAttack.#contextByActivity.set(activity, context);
        return context;
    }

    /**
     * Consomme le contexte imposé mémorisé pour une activité : le rend et l'oublie,
     * afin qu'un usage ultérieur de la même activité reprenne un ciblage normal.
     *
     * @param {object} activity - L'activité dnd5e dont on résout les dégâts.
     *
     * @returns {?{source: object, target: object}} Le contexte imposé, ou `null` si l'activité n'en porte pas.
     */
    static consumeContextFor(activity) {
        if (!activity || !OpportunityAttack.#contextByActivity.has(activity)) {
            return null;
        }
        const context = OpportunityAttack.#contextByActivity.get(activity);
        OpportunityAttack.#contextByActivity.delete(activity);
        return context;
    }

    /**
     * Cette activité dnd5e est-elle celle de l'attaque d'opportunité en cours ?
     *
     * @param {object} activity - L'activité dnd5e en cours d'usage.
     *
     * @returns {boolean} `true` si l'activité appartient au réactant en cours de résolution.
     */
    static isPendingFor(activity) {
        const actorId = activity?.actor?.id;
        return Boolean(actorId && actorId === OpportunityAttack.pending?.actorId);
    }

    /**
     * Le token de la scène active portant cet identifiant, ou `null`.
     *
     * Rend le placeable quand il est monté sur le canvas, comme le fait
     * `Constants.myTargets`, avec repli sur le document de scène.
     *
     * @param {?string} tokenId - L'identifiant du token cherché.
     *
     * @returns {?object} Le token, ou `null`.
     */
    static sceneToken(tokenId) {
        const token = [...(game.canvas?.scene?.tokens ?? [])].find(t => t.id === tokenId);
        return token?.object ?? token ?? null;
    }

    /**
     * Contexte imposé du jet d'attaque d'opportunité en cours (`{source, target}`),
     * ou `null` : `source` est le token réactant, `target` le fuyard désigné par la
     * détection.
     *
     * À lire SYNCHRONEMENT en tête d'un handler de hook dnd5e : Foundry n'attend
     * pas les handlers asynchrones, donc `pending` peut être levé avant que le
     * corps du handler n'y arrive. C'est aussi pourquoi la cible ne peut pas
     * passer par la sélection de l'utilisateur — elle serait restaurée trop tôt,
     * et la résolution ne trouverait plus personne à blesser.
     *
     * @param {object} activity - L'activité dnd5e en cours d'usage.
     *
     * @returns {?{source: object, target: object}} Le contexte, ou `null`.
     */
    static contextFor(activity) {
        if (!OpportunityAttack.isPendingFor(activity)) {
            return null;
        }
        const target = OpportunityAttack.sceneToken(OpportunityAttack.pending?.targetTokenId);
        if (!target) {
            return null;
        }
        return {source: OpportunityAttack.sceneToken(OpportunityAttack.pending?.sourceTokenId), target};
    }

    /**
     * Cible imposée du jet d'attaque d'opportunité en cours, ou `null` — la seule
     * part du contexte dont le ciblage a besoin.
     *
     * @param {object} activity - L'activité dnd5e en cours d'usage.
     *
     * @returns {?object} Le token cible, ou `null`.
     */
    static forcedTargetFor(activity) {
        return OpportunityAttack.contextFor(activity)?.target ?? null;
    }

    /**
     * Portée de mêlée d'un token, en cases : composition de la lecture dnd5e et
     * de la conversion vers la géométrie du moteur. `0` si le token n'a aucune
     * arme de mêlée équipée — armes naturelles incluses, qui sont des items
     * `weapon` de catégorie `natural` marqués équipés.
     *
     * @param {object} token - Le TokenDocument observateur.
     *
     * @returns {number} La portée en cases, ou `0`.
     */
    static reachOf(token) {
        const {reach, units} = WeaponDamage.getEquippedMeleeReach(token?.actor);
        return ReachProfile.reachToCases(reach, units);
    }

    /**
     * Tokens provoqués par un déplacement.
     *
     * Le préfiltre ne retient que des critères structurels et bon marché : ni le
     * mobile lui-même, ni le décor (token sans acteur), ni un token absent du
     * combat, ni un combattant à terre, ni un réactant ayant déjà consommé sa
     * réaction ce round. Hostilité et portée sont ensuite appliquées par
     * `ReachRules.provokers`, à qui elles sont injectées.
     *
     * @param {object} movement - Le mouvement livré par le hook `moveToken`.
     * @param {object} mover    - Le TokenDocument qui se déplace.
     * @param {object} combat   - Le combat en cours.
     *
     * @returns {Array<{observer: object, reach: number}>} Les tokens provoqués.
     */
    static findProvokers(movement, mover, combat) {
        const observers = [...(game.canvas?.scene?.tokens ?? [])].filter(token =>
            token.id !== mover?.id
            && token.actorId
            && OpportunityAttack.isCombatant(token, combat)
            && OpportunityAttack.isStanding(token)
            && ReactionBudget.isAvailable(token, combat));
        const profiles = ReachProfile.buildDistanceProfiles(movement, mover, observers);
        return ReachRules.provokers(
            profiles,
            (observer) => OpportunityAttack.reachOf(observer),
            (observer) => TargetingPredicates.areEnemies(mover, observer));
    }

    /**
     * Résout une attaque : pose le marqueur, déclenche l'arme, lève le marqueur.
     *
     * La sélection de cibles de l'utilisateur n'est PAS touchée. La cible voyage
     * par `pending.targetTokenId`, que `dnd5e.hook.js` lit synchronément pour la
     * poser en `forcedTargets`. Retargeter serait à la fois inutilement intrusif
     * (la sélection du MJ change alors qu'il n'a rien demandé) et inopérant : la
     * restauration se produirait avant que le handler de dégâts, asynchrone et non
     * attendu par Foundry, ait résolu ses cibles — les dégâts ne toucheraient
     * personne.
     *
     * Le déplacement étant déjà appliqué quand `moveToken` se déclenche, la cible
     * est hors de portée au moment du jet ; `pending` sert aussi à laisser passer
     * la validation de portée pour ce jet précis.
     *
     * @param {object} observer - Le TokenDocument réactant.
     * @param {object} mover    - Le TokenDocument cible.
     *
     * @returns {Promise<void>}
     */
    static async strike(observer, mover) {
        OpportunityAttack.pending = {
            actorId: observer.actorId, sourceTokenId: observer.id, targetTokenId: mover.id};
        try {
            await WeaponDamage.triggerFirstEquippedWeapon(observer.actor, "@wpnM");
        } finally {
            OpportunityAttack.pending = null;
        }
    }

    /**
     * Résout toutes les attaques provoquées par un déplacement, séquentiellement.
     *
     * Le budget est consommé AVANT le jet : une attaque qui échouerait en cours de
     * résolution ne redonne pas sa réaction au réactant, ce qui évite qu'une erreur
     * ouvre la porte à des attaques en boucle sur un même round.
     *
     * @param {object}   mover    - Le TokenDocument qui se déplace.
     * @param {Array<{observer: object}>} provoked - Les tokens provoqués.
     * @param {object}   combat   - Le combat en cours.
     *
     * @returns {Promise<void>}
     */
    static async resolve(mover, provoked, combat) {
        for (const {observer} of provoked) {
            if (!await ReactionBudget.consume(observer, combat)) {
                continue;
            }
            await OpportunityAttack.strike(observer, mover);
        }
    }

    /**
     * Ce token participe-t-il au combat donné ?
     *
     * La scène porte bien plus de tokens que le combat n'a de combattants : PNJ
     * décoratifs, monstres d'une autre rencontre, montures. Aucun d'eux n'a de
     * réaction à dépenser — la réaction se compte par round, et un token hors du
     * tracker n'a pas de round. Sans ce filtre, c'est toute la scène qui réagit.
     *
     * @param {object}  token    - Le TokenDocument à tester.
     * @param {?object} [combat] - Le combat de référence.
     *
     * @returns {boolean} `true` si le token est un combattant du combat.
     */
    static isCombatant(token, combat) {
        return Boolean(token?.id) && [...(combat?.combatants ?? [])].some(c => c.tokenId === token.id);
    }

    /**
     * Ce token tient-il encore debout ?
     *
     * Un combattant à zéro point de vie ou moins reste dans le tracker, garde son
     * arme équipée et conserve sa réaction du round : rien dans les autres gardes
     * ne l'empêche de frapper quelqu'un qui s'éloigne de son cadavre.
     *
     * La lecture est VOLONTAIREMENT permissive : seul un total de points de vie
     * réellement numérique ET inférieur ou égal à zéro fait taire le réactant. Des
     * points de vie absents, nuls au sens de `null`, ou illisibles — véhicule, token
     * sans données d'acteur exploitables — valent « debout », pour qu'une fiche
     * inhabituelle perde une règle de combat plutôt que d'être silencieusement
     * exclue de toutes. La conversion implicite est évitée pour cette raison
     * précise : `Number(null)` vaut `0` et condamnerait une fiche muette.
     *
     * @param {object} token - Le TokenDocument à tester.
     *
     * @returns {boolean} `false` si les points de vie du token sont connus et nuls
     *   ou négatifs, `true` dans tous les autres cas.
     */
    static isStanding(token) {
        const hp = token?.actor?.system?.attributes?.hp?.value;
        return typeof hp !== "number" || !Number.isFinite(hp) || hp > 0;
    }

    /**
     * La fonctionnalité est-elle activée dans ce monde ?
     *
     * Lecture défensive : ce prédicat est évalué à CHAQUE déplacement de token.
     * Si le réglage n'était pas encore enregistré, `game.settings.get` lèverait —
     * et lèverait donc en boucle. Une lecture impossible vaut « désactivé », ce
     * qui est aussi le défaut annoncé de la fonctionnalité.
     *
     * @returns {boolean} `true` si les attaques d'opportunité sont activées.
     */
    static isEnabled() {
        try {
            return game.settings.get(
                globalThis.FqCardEngineModule?.moduleName, OPPORTUNITY_ATTACK_SETTING) === true;
        } catch {
            return false;
        }
    }

    /**
     * Handler du hook `moveToken` : détecte et résout les attaques d'opportunité
     * provoquées par un déplacement.
     *
     * La garde du MJ désigné est SILENCIEUSE, contrairement à
     * `CombatTurn.isLocalUserFirstActiveGM` qui notifie : ce handler se déclenche
     * sur tous les clients, à chaque pas de chaque token, et une notification y
     * serait du spam permanent. `moveToken` étant diffusé partout, sans cette
     * garde chaque client résoudrait la même attaque.
     *
     * @param {object} mover    - Le TokenDocument qui vient de se déplacer.
     * @param {object} movement - Le mouvement livré par le hook.
     *
     * @returns {Promise<void>}
     */
    static async onMoveToken(mover, movement) {
        if (!OpportunityAttack.isEnabled()) {
            return;
        }
        if (!game.users?.activeGM || game.users.activeGM.id !== game.userId) {
            return;
        }
        const combat = game.combat;
        if (!combat?.id || !(combat.round >= 1)) {
            return;
        }
        // Le décor ne provoque pas.
        if (!mover?.actorId) {
            return;
        }
        // Un mobile hors du tracker non plus : l'attaque d'opportunité se joue
        // entre combattants. Sans cette garde, déplacer un PNJ de décor au milieu
        // d'une mêlée déclencherait toute la table.
        if (!OpportunityAttack.isCombatant(mover, combat)) {
            return;
        }
        // Un mobile à terre ne provoque pas : traîner un corps hors d'une mêlée
        // n'est pas une fuite. Symétrique de la garde posée sur l'observateur
        // dans `findProvokers`, et de même prédicat — la règle vaut pour un PNJ
        // mort qu'on range comme pour un personnage inconscient qu'un allié tire
        // hors de portée.
        if (!OpportunityAttack.isStanding(mover)) {
            return;
        }
        const provoked = OpportunityAttack.findProvokers(movement, mover, combat);
        if (provoked.length === 0) {
            return;
        }
        await OpportunityAttack.resolve(mover, provoked, combat);
    }
}
