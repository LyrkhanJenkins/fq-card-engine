import Constants from "../../constants.js";
import Geometry from "../shared/geometry.js";
import TargetingPredicates from "../shared/targeting-predicates.js";
import RollReport, {ROLL_ROLE} from "./roll-report.js";
import HitProfile from "./hit-profile.js";
import Advantage from "./advantage.js";
import ConditionProbe from "./condition-probe.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";

/**
 * Utilitaires de calcul et d'application des dégâts et des soins FQ : jets de dés
 * avec bonus, gestion des critiques et esquives, et application des modifications
 * de points de vie et effets sur les cibles. Les jets ne publient rien eux-mêmes :
 * ils consignent au rapport, dont `ResultChatLog` tire le message unique du chat.
 * Certaines méthodes sont exécutées côté MJ via socket (voir `hook/integration/socketlib.hook.js`).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Damage {
    /**
     * Lance le jet de dégâts d'une carte : applique le bonus de dégâts de l'acteur,
     * effectue le jet, puis calcule critiques et esquives par cible.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {object} cardContent - Le contenu (choix) de la carte (`damage`, `bonusCrit`, `bonusEva`, `targetType`).
     * @param {RollReport} [report] - Le rapport où consigner les jets et les résultats.
     *
     * @returns {Promise<object[]>} Le tableau des résultats de dégâts par cible.
     */
    static async buildDamageDiceLauncher(actor, cardContent, report = new RollReport()) {
        let damageFormula = Damage.getDamageWithBonus(actor, cardContent.damage);
        let damages = await Damage.rollTotalAsync(damageFormula, ROLL_ROLE.DAMAGE, report);
        return Damage.addCriticalEvasionToDamage(actor, damages, cardContent, report);
    }

    /**
     * Lance le jet de soins d'une carte : applique le bonus de soin de l'acteur,
     * effectue le jet, puis calcule les critiques de soin par cible.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {object} cardContent - Le contenu (choix) de la carte (`heal`, `bonusCrit`, `targetType`).
     * @param {RollReport} [report] - Le rapport où consigner les jets et les résultats.
     *
     * @returns {Promise<object[]>} Le tableau des résultats de soins par cible.
     */
    static async buildHealDiceLauncher(actor, cardContent, report = new RollReport()) {
        let healFormula = Damage.getHealWithBonus(actor, cardContent.heal);
        let heal = await Damage.rollTotalAsync(healFormula, ROLL_ROLE.HEAL, report);
        return Damage.addCriticalToHeal(actor, heal, cardContent, report);
    }

    /**
     * Enrichit une formule de soin avec le bonus de soin de l'acteur (en
     * préfixant d'un « + » si le bonus commence par un chiffre).
     *
     * @param {object} actor       - L'acteur portant le bonus de soin.
     * @param {string} healFormula - La formule de soin de base.
     *
     * @returns {string} La formule de soin enrichie du bonus.
     */
    static getHealWithBonus(actor, healFormula) {
        return Damage.getFormulaWithBonus(healFormula, actor.system?.fq?.bonus?.heal);
    }

    /**
     * Enrichit une formule avec un bonus (en préfixant d'un « + » si le bonus
     * commence par un chiffre). Le bonus vide/absent laisse la formule inchangée.
     *
     * @param {string} formula - La formule de base.
     * @param {string} bonus   - Le bonus à intégrer.
     *
     * @returns {string} La formule enrichie du bonus.
     */
    static getFormulaWithBonus(formula, bonus) {
        let bonusStr = "" + bonus;
        if (bonusStr) {
            if (/^\d/.test(bonusStr)) { // vérifie si ça commence par un chiffre
                bonusStr = "+" + bonusStr;
            }
            formula = `(` + formula + `) ${bonusStr}`;
        }
        return formula;
    }

    /**
     * Détermine si le soin est critique (jet 1d20 selon le score de critique de
     * l'acteur + bonus) et construit le tableau des soins par cible (doublés si
     * critique).
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {number} heal        - Le montant de soin de base (borné à 0 minimum).
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusCrit`, `targetType`).
     * @param {RollReport} [report] - Le rapport où consigner les jets et les résultats.
     *
     * @returns {Promise<object[]>} Le tableau des résultats de soin par cible.
     */
    static async addCriticalToHeal(actor, heal, cardContent, report = new RollReport()) {
        if (heal < 0) {
            heal = 0;
        }
        let healArray = [];
        const critical = await Damage.#rollCritical(actor, cardContent, report);
        TargetingPredicates.resolveTargets(cardContent, actor).forEach(target => {
            const targetName = Constants.tokenName(target);
            const value = critical ? heal * 2 : heal;
            healArray.push({
                key: `Soins totaux sur "${targetName}"`,
                value,
                type: "healFQ",
                critical,
                targetTokenId: target.id
            });
            report?.addResult({
                targetTokenId: target.id, targetName, value,
                type: "healFQ", critical, evasion: false
            });
        });
        return healArray;
    }

    /**
     * Enrichit une formule de dégâts avec le bonus de dégâts de l'acteur (en
     * préfixant d'un « + » si le bonus commence par un chiffre).
     *
     * @param {object} actor         - L'acteur portant le bonus de dégâts.
     * @param {string} damageFormula - La formule de dégâts de base.
     *
     * @returns {string} La formule de dégâts enrichie du bonus.
     */
    static getDamageWithBonus(actor, damageFormula) {
        return Damage.getFormulaWithBonus(damageFormula, actor.system?.fq?.bonus?.damage);
    }

    /**
     * L'échelle des dégâts : chaque défense réussie fait descendre d'un cran, le
     * critique fait monter d'un cran.
     *
     * `0 → demi-dégâts → dégâts normaux → dégâts doublés`
     *
     * @type {ReadonlyArray<number>}
     */
    static DAMAGE_STEPS = Object.freeze([0, 0.5, 1, 2]);

    /**
     * Le multiplicateur de dégâts pour une cible, d'après le nombre de défenses
     * qu'elle a réussies et le critique du lanceur.
     *
     * Une cible oppose DEUX défenses indépendantes : l'esquive FQ, et la
     * protection — sauvegarde réussie, ou classe d'armure strictement au-dessus
     * du jet d'attaque. Elles ne se multiplient jamais entre elles : chacune fait
     * descendre d'UN cran sur l'échelle, si bien que les deux réunies annulent
     * les dégâts sans jamais produire de quart.
     *
     * | Défenses réussies | Sans critique | Avec critique |
     * |---|---|---|
     * | 0 | normal | ×2 |
     * | 1 | demi-dégâts | normal |
     * | 2 | 0 | demi-dégâts |
     *
     * @param {number}  defenses - Le nombre de défenses réussies (0 à 2).
     * @param {boolean} critical - True si le jet du lanceur est critique.
     *
     * @returns {number} Le multiplicateur à appliquer aux dégâts.
     */
    static damageMultiplier(defenses, critical) {
        const index = 2 - defenses + (critical ? 1 : 0);
        return Damage.DAMAGE_STEPS[Math.min(Math.max(index, 0), Damage.DAMAGE_STEPS.length - 1)];
    }

    /**
     * Détermine si les dégâts sont critiques (jet 1d20), puis, pour chaque cible,
     * combien de défenses elle réussit — son esquive, et la protection que lui
     * donne sa classe d'armure ou sa sauvegarde quand la carte demande un jet
     * pour toucher. Construit le tableau des dégâts par cible en appliquant
     * {@link Damage.damageMultiplier}, arrondi à l'inférieur.
     *
     * Aucune défense n'est opposée en cas d'auto-ciblage : la cible est alors
     * absente du résultat, comme avant l'introduction du jet pour toucher.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {number} damages     - Le montant de dégâts de base (borné à 0 minimum).
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusCrit`, `bonusEva`,
     *        `targetType`, et les champs de toucher lus par `HitProfile`).
     * @param {RollReport} [report] - Le rapport où consigner les jets et les résultats.
     *
     * @returns {Promise<object[]>} Le tableau des résultats de dégâts par cible.
     */
    static async addCriticalEvasionToDamage(actor, damages, cardContent, report = new RollReport()) {
        const myTargets = TargetingPredicates.resolveTargets(cardContent, actor);
        if (damages < 0) {
            damages = 0;
        }
        let damagesArray = [];
        const critical = await Damage.#rollCritical(actor, cardContent, report);
        // Profil calculé UNE fois pour toute la carte : le bonus de toucher ne
        // doit pas varier d'une cible à l'autre. Null quand la carte ne demande
        // aucun jet pour toucher — le cas de toutes les cartes antérieures.
        //
        // Une résolution d'ACTIVITÉ dnd5e pose son profil déjà construit dans
        // `cardContent`, comme elle y pose déjà ses `forcedTargets` : son
        // modificateur et son DD viennent de l'activité, pas de champs de carte.
        const profile = cardContent.hitProfile ?? HitProfile.of(actor, cardContent);
        // No evasion is possible if self targeting : le lanceur ne se défend pas
        // contre sa propre carte.
        const opponents = myTargets.filter(target => target.actor?._id !== actor?._id);
        // Les défenses de chaque cible sont PRÉPARÉES avant tout jet : le dé
        // d'attaque est commun à toute la carte, et il faut savoir si une seule
        // cible y gagne un avantage ou un désavantage pour jeter le second d20.
        const caster = ConditionProbe.of(actor);
        // Le jeton PROPRE d'un acteur synthétique d'abord : un PNJ non lié (sbire,
        // monstre en plusieurs exemplaires) partage son id d'acteur avec ses
        // jumeaux, et la recherche par id rendrait le premier venu.
        const casterToken = actor?.token ?? Constants.actorToken(actor?.id);
        const plans = opponents.map(target => Damage.#planDefense(target, profile, caster, casterToken));
        // Le dé d'ATTAQUE est jeté UNE fois pour toute la carte, avant la boucle :
        // c'est le même jet que chaque classe d'armure vient affronter. Une
        // sauvegarde, elle, appartient à la cible et se jette dans la boucle.
        const attackDice = await Damage.#rollAttackDice(profile, plans);
        for (let i = 0; i < opponents.length; i++) {
            const target = opponents[i];
            const targetName = Constants.tokenName(target);
            // Le toucher AVANT l'esquive : le lanceur agit d'abord, la cible
            // esquive ensuite. Le rapport, le chat et la fenêtre présentent les
            // jets dans l'ordre où ils tombent.
            const protection = await Damage.#rollHit(target, targetName, profile, attackDice, plans[i], report);
            const evaded = await Damage.#rollEvasion(target, targetName, cardContent, plans[i], report);
            const value = Math.floor(
                damages * Damage.damageMultiplier((evaded ? 1 : 0) + protection, critical));
            damagesArray.push({
                key: `Dégâts totaux sur "${targetName}"`,
                value,
                critical,
                evasion: evaded,
                type: "damageFQ",
                targetTokenId: target.id
            });
            report?.addResult({
                targetTokenId: target.id, targetName, value,
                type: "damageFQ", critical, evasion: evaded, defended: protection > 0
            });
        }
        return damagesArray;
    }

    /**
     * Prépare les défenses d'une cible AVANT tout jet : si elle en a encore, et
     * avec quel mode le jet pour toucher la visera.
     *
     * Une cible sans défense (paralysée, inconsciente) le reste pour toute la
     * résolution, jet pour toucher ou non : elle n'esquive pas non plus.
     *
     * @param {object}  target      - Le jeton ciblé.
     * @param {?object} profile     - Le profil de toucher, ou null.
     * @param {?object} caster      - La sonde du lanceur (voir `ConditionProbe`).
     * @param {?object} casterToken - Le jeton du lanceur, pour le contact.
     *
     * @returns {{defenseless: boolean, defenselessCauses: object[], verdict: ?object}}
     *          Le plan de défense ; `verdict` est celui d'`Advantage.attack` ou
     *          d'`Advantage.save`, null sans jet pour toucher.
     */
    static #planDefense(target, profile, caster, casterToken) {
        const probe = ConditionProbe.of(target.actor);
        const defenselessCauses = Advantage.defenselessCauses(probe);
        const plan = {defenseless: defenselessCauses.length > 0, defenselessCauses, verdict: null};
        if (!profile) {
            return plan;
        }
        if (profile.type === CardFqSystem.HIT_TYPE_ATTACK) {
            plan.verdict = Advantage.attack(caster, probe, {
                ability: profile.attackAbility ?? null,
                adjacent: Damage.#isAdjacent(casterToken, target)
            });
        } else {
            plan.verdict = Advantage.save(probe, {
                ability: profile.saveAbility,
                systemMode: ConditionProbe.saveMode(target.actor, profile.saveAbility)
            });
        }
        return plan;
    }

    /**
     * Le lanceur est-il au contact de la cible ? Une case d'écart au plus, comme
     * les « 5 pieds » de D&D. Faute de jeton mesurable, la réponse est non.
     *
     * @param {?object} casterToken - Le jeton du lanceur.
     * @param {?object} target      - Le jeton ciblé.
     *
     * @returns {boolean} True au contact.
     */
    static #isAdjacent(casterToken, target) {
        if (!casterToken || !target) {
            return false;
        }
        try {
            return Geometry.distanceBetweenTokens(casterToken, target) <= 1;
        } catch {
            return false;
        }
    }

    /**
     * Jette le dé d'ATTAQUE de la carte : un d20, ou deux dès qu'une seule cible
     * encore défendue est visée avec avantage ou désavantage. Les deux dés sont
     * jetés UNE fois ; chaque cible garde ensuite celui que lui vaut son propre
     * mode (voir `Advantage.keep`).
     *
     * @param {?object}  profile - Le profil de toucher, ou null.
     * @param {object[]} plans   - Les plans de défense des cibles.
     *
     * @returns {Promise<?number[]>} Les d20 jetés, ou null sans jet d'attaque.
     */
    static async #rollAttackDice(profile, plans) {
        if (profile?.type !== CardFqSystem.HIT_TYPE_ATTACK) {
            return null;
        }
        const twoDice = plans.some(plan => !plan.defenseless && plan.verdict?.mode !== Advantage.NORMAL);
        return Damage.#rollD20s(twoDice ? 2 : 1);
    }

    /**
     * Jette des d20 un par un. Deux `1d20` plutôt qu'un `2d20` : chaque face doit
     * rester lisible, pour que le rapport montre les deux dés et celui retenu.
     *
     * @param {number} count - Le nombre de d20.
     *
     * @returns {Promise<number[]>} Les d20 jetés, dans l'ordre.
     */
    static async #rollD20s(count) {
        const dice = [];
        for (let i = 0; i < count; i++) {
            dice.push(await Damage.rollTotalAsync("1d20"));
        }
        return dice;
    }

    /**
     * Jette l'esquive d'une cible (1d20 contre `21 - esquive - bonusEva`) et la
     * consigne au rapport. Aucun dé n'est lancé si la cible n'a aucun score
     * d'esquive : elle figure quand même au rapport, sans jet, pour que l'absence
     * d'esquive se lise. Une cible sans défense n'esquive pas : elle figure au
     * rapport comme telle.
     *
     * @param {object} target      - Le jeton ciblé.
     * @param {string} targetName  - Le nom affiché du jeton.
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusEva`).
     * @param {object} plan        - Le plan de défense de la cible.
     * @param {RollReport} [report] - Le rapport où consigner le jet.
     *
     * @returns {Promise<boolean>} True si la cible esquive.
     */
    static async #rollEvasion(target, targetName, cardContent, plan, report) {
        if (plan?.defenseless) {
            report?.addEvasion({
                targetTokenId: target.id, targetName, roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: plan.defenselessCauses
            });
            return false;
        }
        const evaToReach = Damage.#scoreThreshold(
            target.actor?.system?.fq?.attributes.evasion, cardContent.bonusEva);
        const evasionScore = evaToReach === null ? 0 : await Damage.rollTotalAsync("1d20");
        const evaded = evaToReach !== null && evasionScore >= evaToReach;
        // Un seuil nul signale qu'aucun dé n'a été lancé : la cible n'a pas de
        // score d'esquive, elle figure au rapport sans jet.
        report?.addEvasion({
            targetTokenId: target.id, targetName,
            roll: evaToReach === null ? null : evasionScore,
            threshold: evaToReach,
            evaded
        });
        return evaded;
    }

    /**
     * Le seuil qu'un score FQ (critique, esquive) impose au d20, ou `null` quand
     * le score total est nul — aucun dé n'est alors lancé, et l'absence de seuil
     * se lit comme « cet événement n'était pas possible ».
     *
     * Un score de 1 doit se gagner sur un 20, un score de 20 sur n'importe quel
     * dé : le seuil est donc `21 - score`, et le 21 vaut « hors d'atteinte ».
     *
     * @param {number} score - Le score FQ de l'acteur (critique ou esquive).
     * @param {number} bonus - Le bonus de la carte pour ce score.
     *
     * @returns {?number} Le seuil à atteindre au d20, ou null si l'événement est impossible.
     */
    static #scoreThreshold(score, bonus) {
        const total = score + bonus;
        return total > 0 ? 21 - total : null;
    }

    /**
     * Jette le toucher contre une cible, et rend sa PROTECTION — la seconde
     * défense, indépendante de l'esquive.
     *
     * - ATTAQUE : le lanceur jette `1d20 + modificateur`. La cible est protégée
     *   si sa classe d'armure passe STRICTEMENT au-dessus du total : à égalité,
     *   l'attaque touche, comme en D&D.
     * - SAUVEGARDE : la cible jette `1d20 + sa sauvegarde` et se protège en
     *   atteignant le DD.
     *
     * Le 1 et le 20 naturels n'ont aucun effet particulier — décision de règle
     * du moteur, qui garde le critique sur son propre jet.
     *
     * Avec avantage ou désavantage, deux d20 comptent et le mode de LA cible
     * choisit lequel (voir `Advantage.keep`). Une cible sans défense, ou qui rate
     * d'office sa sauvegarde, n'est jamais protégée et ne jette aucun dé.
     *
     * Le jet est fait par le client du LANCEUR, y compris la sauvegarde de la
     * cible : toute la résolution reste un bloc unique, sans attendre le joueur
     * d'en face.
     *
     * @param {object}    target     - Le jeton ciblé.
     * @param {string}    targetName - Le nom affiché du jeton.
     * @param {?object}   profile    - Le profil de toucher (voir `HitProfile.of`), ou null.
     * @param {?number[]} attackDice - Les d20 d'attaque de la carte, déjà jetés une fois
     *        pour toutes, ou null pour une sauvegarde (que chaque cible jette pour elle-même).
     * @param {object}    plan       - Le plan de défense de la cible (voir `#planDefense`).
     * @param {RollReport} [report]  - Le rapport où consigner le jet.
     *
     * @returns {Promise<number>} Le nombre de crans de défense que la cible gagne :
     *          0 si elle n'est pas protégée, 1 en général, et 2 quand une activité
     *          dnd5e annonce ne rien infliger sur une sauvegarde réussie.
     */
    static async #rollHit(target, targetName, profile, attackDice, plan, report) {
        const defense = HitProfile.defenseOf(target, profile);
        if (!defense) {
            return 0;
        }
        const attack = profile.type === CardFqSystem.HIT_TYPE_ATTACK;
        const modifier = attack ? profile.modifier : defense.value;
        const threshold = attack ? defense.value : profile.dc;
        const verdict = plan?.verdict ?? {mode: Advantage.NORMAL, advantages: [], disadvantages: []};
        const auto = plan?.defenseless ? "defenseless" : (verdict.auto ?? null);
        // Une ATTAQUE ne roule qu'une fois pour toute la carte : ce sont les mêmes
        // dés qui sont opposés à chaque classe d'armure, et ils restent montrés
        // même contre une cible qui ne se défend plus. Une SAUVEGARDE, elle, est
        // jetée par chaque cible — sauf celle qui la rate d'office.
        const mode = auto ? Advantage.NORMAL : verdict.mode;
        const dice = attack ? attackDice : (auto ? [] : await Damage.#rollD20s(mode === Advantage.NORMAL ? 1 : 2));
        const roll = dice.length ? Advantage.keep(dice, mode) : null;
        const total = roll === null ? null : roll + modifier;
        const defended = !auto && (attack ? total < threshold : total >= threshold);
        report?.addHit({
            targetTokenId: target.id, targetName,
            kind: defense.kind, roll, modifier, total, threshold, defended,
            dice, mode, auto,
            advantages: auto ? [] : verdict.advantages,
            disadvantages: auto ? [] : verdict.disadvantages,
            autoCauses: auto === "defenseless" ? plan.defenselessCauses : (verdict.autoCauses ?? [])
        });
        return defended ? (profile.defensesOnSuccess ?? 1) : 0;
    }

    /**
     * Jette le critique du lanceur (1d20 contre `21 - critique - bonusCrit`).
     * Aucun jet si le score total est nul : le rapport reste alors sans critique,
     * ce qui se lit comme « aucun critique n'était possible ».
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusCrit`).
     * @param {RollReport} report - Le rapport où consigner le jet de critique.
     *
     * @returns {Promise<boolean>} True si le jet atteint le seuil de critique.
     */
    static async #rollCritical(actor, cardContent, report) {
        const critToReach = Damage.#scoreThreshold(
            actor?.system?.fq.attributes.critical, cardContent.bonusCrit);
        if (critToReach === null) {
            return false;
        }
        const score = await Damage.rollTotalAsync("1d20");
        const hit = score >= critToReach;
        report?.setCritical({roll: score, threshold: critToReach, hit});
        return hit;
    }

    /**
     * Effectue un jet de dés et rend son total. Le jet ne publie rien : le détail
     * des dés est consigné au rapport quand il porte un rôle, et c’est le message
     * unique de fin de résolution (`ResultChatLog`) qui en rend compte au chat.
     *
     * @param {string} formula   - La formule de jet (ex. « 1d20 », « 2d6+3 »).
     * @param {?string} [role]   - Le rôle du jet (`ROLL_ROLE`) ; posé pour le seul jet
     *        principal, dont le rapport garde le détail des dés. Le critique et l’esquive
     *        sont consignés par leurs appelants, qui seuls connaissent le sens de leur seuil.
     * @param {RollReport} [report] - Le rapport où consigner le jet principal.
     *
     * @returns {Promise<number>} Le total du jet.
     */
    static async rollTotalAsync(formula, role = null, report = null) {
        const roll = await new Roll(formula).evaluate();
        if (role) {
            report?.setMainRoll({role, formula, dice: RollReport.diceOf(roll), total: roll.total});
        }
        return roll.total;
    }


    /**
     * Crée un effet actif sur l'acteur du token cible. Exécutée côté MJ via socket.
     *
     * @param {object} effect   - Les données de l'effet actif à créer.
     * @param {string} targetId - L'id du token cible.
     *
     * @returns {void}
     */
    static addEffectForTarget(effect, targetId) {
        ActiveEffect.implementation.create(effect, {parent: game.canvas.tokens.get(targetId).actor});
    }

    /**
     * Supprime un effet actif sur l'acteur du token cible. Symétrique de
     * `addEffectForTarget` : exécutée côté MJ via socket car la cible peut appartenir
     * à un autre joueur. Tolérante à l'absence de token/acteur/effet.
     *
     * @param {string} targetId - L'id du token cible.
     * @param {string} effectId - L'id de l'effet actif à retirer.
     *
     * @returns {Promise<void>}
     */
    static async removeEffectForTarget(targetId, effectId) {
        const actor = game.canvas.tokens.get(targetId)?.actor;
        if (actor && effectId) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        }
    }

    /**
     * Applique une modification de points de vie sur l'acteur du token cible.
     * Pour des dégâts, consomme d'abord les PV temporaires, borne à 0, et supprime
     * les effets marqués `expireOnDamage` ; pour un soin, plafonne au max (max +
     * tempmax). Exécutée côté MJ via socket.
     *
     * @param {string} targetId   - L'id du token cible.
     * @param {number} value      - Le montant à appliquer (positif).
     * @param {string} typeAction - Le type d'action (« damageFQ » ou « healFQ »).
     *
     * @returns {void}
     */
    static applyActorHpModification(targetId, value, typeAction) {
        const targetActor = game.canvas.tokens.get(targetId)?.actor;
        if (!targetActor) return;
        if (typeAction === "damageFQ") {
            if (targetActor.system.attributes.hp.temp > value) {
                targetActor.update({"system.attributes.hp.temp": targetActor.system.attributes.hp.temp - value});
                value = 0;
            } else if (targetActor.system.attributes.hp.temp > 0) {
                value -= targetActor.system.attributes.hp.temp;
                targetActor.update({"system.attributes.hp.temp": 0});
            }
            if (value > 0) {
                if ((targetActor.system.attributes.hp.value) - value >= 0) {
                    targetActor.update({
                        "system.attributes.hp.value": targetActor.system.attributes.hp.value - value
                    });
                } else {
                    targetActor.update({
                        "system.attributes.hp.value": 0
                    });
                }
            }
            if (targetActor?.effects && targetActor.effects.size > 0) {
                targetActor.effects.filter(effect => effect?.flags?.[FqCardEngineModule.moduleName]?.expireOnDamage).forEach(effect => {
                    effect.delete();
                });
            }
        } else if (typeAction === "healFQ") {
            const max = targetActor.system.attributes.hp.max + targetActor.system.attributes.hp.tempmax;
            if (max >= (targetActor.system.attributes.hp.value + value)) {
                targetActor.update({"system.attributes.hp.value": targetActor.system.attributes.hp.value + value});
            } else {
                targetActor.update({"system.attributes.hp.value": max});
            }
        }
    }

    /**
     * Crée un acteur à partir de données, place son token sur une case adjacente
     * au personnage de l'utilisateur (selon `location`) dans la scène active, et
     * l'ajoute au combat en cours le cas échéant. Exécutée côté MJ via socket.
     *
     * @param {object} actorData     - Les données de l'acteur à créer.
     * @param {string} currentUserId - L'id de l'utilisateur dont le personnage sert de référence de position.
     * @param {string} location      - La direction d'apparition adjacente (« left », « right », « up », « down »).
     * @param {object} [position]    - La position absolue (px) imposée (invocation dans une zone posée) ;
     *                                 à défaut, la case adjacente au personnage.
     *
     * @returns {Promise<void>}
     */
    static async createActorFromData(actorData, currentUserId, location, position) {
        const currentUser = game.users.get(currentUserId);
        await Actor.create(actorData).then(async newActor => {
            // Ajouter le jeton à la scène active
            const scene = game.scenes.active;
            const casterToken = Constants.actorToken(currentUser?.character?.id);

            const tokenData = {
                ...newActor.prototypeToken,
                actorId: newActor._id,
                effects: [],
                x: position?.x ?? Geometry.getXAdjacentLocation(casterToken, location),
                y: position?.y ?? Geometry.getYAdjacentLocation(casterToken, location)
            };
            await scene.createEmbeddedDocuments("Token", [tokenData]).then(async t => {
                const token = t[0];
                if (game.combat) {
                    await game.combat.createEmbeddedDocuments("Combatant", [{
                        tokenId: token?.id, sceneId: scene.id, actorId: token?.actorId, hidden: false
                    }]);
                }
            });
        });
    }

}
