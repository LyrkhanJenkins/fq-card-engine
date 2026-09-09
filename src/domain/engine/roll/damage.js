import Constants from "../../constants.js";
import Geometry from "../shared/geometry.js";
import TargetingPredicates from "../shared/targeting-predicates.js";
import RollReport, {ROLL_ROLE} from "./roll-report.js";

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
     * Détermine si les dégâts sont critiques (jet 1d20) et, pour chaque cible,
     * si elle esquive (jet 1d20 selon son score d'esquive + bonus). Construit le
     * tableau des dégâts par cible : doublés si critique, annulés si esquive
     * (sauf critique qui passe outre l'esquive). Aucune esquive n'est possible en
     * cas d'auto-ciblage.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {number} damages     - Le montant de dégâts de base (borné à 0 minimum).
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusCrit`, `bonusEva`, `targetType`).
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
        for (let i = 0; i < myTargets.length; i++) {
            const target = myTargets[i];
            const targetActor = target.actor;
            let evaToReach = 21;
            let evasionScore = 0;

            if (targetActor?._id !== actor?._id // no evasion is possible if self targeting
            ) {
                if (targetActor?.system?.fq?.attributes.evasion + cardContent.bonusEva > 0) { // or no evasion from the target
                    evaToReach = 21 - targetActor?.system?.fq?.attributes.evasion - cardContent.bonusEva;
                    evasionScore = await Damage.rollTotalAsync("1d20");
                }
                const evaded = evasionScore >= evaToReach;
                const targetName = Constants.tokenName(target);
                // Le critique passe outre l'esquive (sans doubler) ; sinon esquive = 0.
                const value = evaded ? (critical ? damages : 0) : (critical ? damages * 2 : damages);
                damagesArray.push({
                    key: `Dégâts totaux sur "${targetName}"`,
                    value,
                    critical,
                    evasion: evaded,
                    type: "damageFQ",
                    targetTokenId: target.id
                });
                // Un seuil resté à 21 signale qu'aucun dé n'a été lancé : la cible
                // n'a pas de score d'esquive, elle figure au rapport sans jet.
                report?.addEvasion({
                    targetTokenId: target.id, targetName,
                    roll: evaToReach <= 20 ? evasionScore : null,
                    threshold: evaToReach <= 20 ? evaToReach : null,
                    evaded
                });
                report?.addResult({
                    targetTokenId: target.id, targetName, value,
                    type: "damageFQ", critical, evasion: evaded
                });
            }
        }
        return damagesArray;
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
        if (!(actor?.system?.fq.attributes.critical + cardContent.bonusCrit > 0)) {
            return false;
        }
        const critToReach = 21 - actor?.system?.fq.attributes.critical - cardContent.bonusCrit;
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
