import ResourceHandler from "../../domain/engine/shared/resource-handler.js";
import Damage from "../../domain/engine/roll/damage.js";
import {socket} from "./socketlib.hook.js";
import Constants from "../../domain/constants.js";
import Fx from "../../domain/engine/shared/fx.js";
import TargetingPredicates from "../../domain/engine/shared/targeting-predicates.js";
import OpportunityAttack from "../../domain/engine/reaction/opportunity-attack.js";

/**
 * Indique si la logique FQ ne doit PAS s'appliquer à une activité dnd5e donnée :
 * c'est le cas lorsqu'il n'y a pas d'acteur et que l'activité n'est ni un soin,
 * ni une attaque, ni des dégâts.
 *
 * @param {object} activity - L'activité dnd5e en cours (`actor`, `type`…).
 *
 * @returns {boolean|undefined} True si la logique FQ doit être ignorée, undefined sinon.
 */
const notApplyFQOnActivity = (activity) => {
    if (!activity.actor && !["heal", "attack", "damage"].includes(activity.type)) {
        return true;
    }
};

Hooks.on("dnd5e.shortRest", (actor, _config) => {
    actor.update({"system.fq.action.value": actor.system.fq.action.max});
    actor.update({"system.fq.zeal.value": actor.system.fq.zeal.init});
    let manaRest = Math.max(actor.system.abilities.wis.mod, actor.system.abilities.int.mod);
    if (manaRest < 1) {
        manaRest = 1;
    }
    actor.update({"system.fq.mana.value": (actor.system.fq.mana.value + manaRest > actor.system.fq.mana.max) ? actor.system.fq.mana.max : actor.system.fq.mana.value + manaRest});
});

Hooks.on("dnd5e.longRest", (actor, _config) => {
    actor.update({"system.fq.action.value": actor.system.fq.action.max});
    actor.update({"system.fq.zeal.value": actor.system.fq.zeal.init});
    actor.update({"system.fq.mana.value": actor.system.fq.mana.max});
});


Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
    // Filter Activities
    if (notApplyFQOnActivity(activity)) {
        return true;
    }

    // Attaque d'opportunité. Trois choses se jouent ici, et ce hook est le seul
    // endroit où elles peuvent se jouer : il est SYNCHRONE et précède tous les jets.
    // D'où sa position AVANT toute autre garde — chacune bloquerait l'attaque.
    //
    // 1. Mémoriser la cible SUR l'activité. Elle ne peut pas passer par un marqueur
    //    global : avec `BypassWeaponAttackRoll`, `preRollAttackV2` lance
    //    `activity.rollDamage()` sans l'attendre, donc `dnd5e.rollDamageV2` se
    //    produit après que `activity.use()` a rendu la main et que le marqueur a
    //    été levé. La cible serait perdue et aucun dégât ne serait appliqué.
    // 2. Ne RIEN faire payer. Une attaque d'opportunité est gratuite. Les points
    //    d'action sont une ressource par TOUR (remise au max par
    //    `CombatTurn.resetAction`) : hors de son tour, un réactant les a déjà
    //    dépensés, et `checkResources` refuserait systématiquement l'attaque avec
    //    « pas assez de points d'action ». La consommation est symétriquement
    //    sautée dans `dnd5e.rollDamageV2`.
    // 3. Court-circuiter la validation de portée : `moveToken` étant post-déplacement,
    //    le fuyard est déjà sorti et l'attaque se bloquerait elle-même.
    //
    // Le contournement reste limité au réactant en cours (`OpportunityAttack.pending`) :
    // l'usage concurrent d'une carte n'en bénéficie pas.
    if (OpportunityAttack.rememberTargetFor(activity)) {
        return true;
    }

    if (!ResourceHandler.checkResources(activity.item.system?.fq, activity.actor)) {
        return false;
    }
    const squareDistance = game.system.grid.distance;
    const minRange = Math.trunc((activity.range.value ? squareDistance : activity.range.reach) ?? 0) / squareDistance;
    const maxRange = Math.trunc((activity.range.value ?? activity.range.reach) ?? 0) / squareDistance;
    const itemNbTargets = ResourceHandler.determineNbTargets(activity.target);
    // Use on yourself
    if (!Constants.myTargets()?.length && minRange === 0) {
        return true;
    }

    const {verdict, outOfReach} = ResourceHandler.evaluateTargeting(activity.actor, itemNbTargets, minRange, maxRange);
    if (verdict === ResourceHandler.TARGETING_VERDICT.OK) {
        return true;
    }
    ResourceHandler.warnTargeting(activity.actor, {verdict, nbTargets: itemNbTargets, minReach: minRange, maxReach: maxRange, outOfReach});
    return false;

});

Hooks.on("dnd5e.preRollAttackV2", (config, _dialog, _message) => {
    // Réglage "BypassWeaponAttackRoll" (monde, défaut false) : le jet d'attaque des
    // armes est court-circuité et remplacé par un jet de dégâts normal lancé
    // directement (sans modale de configuration ni critique), comme si l'attaque
    // réussissait toujours (pas de classe d'armure).
    if (!game.settings.get(FqCardEngineModule.moduleName, "BypassWeaponAttackRoll")) {
        return true;
    }
    const activity = config.subject;
    if (activity?.item?.type !== "weapon") {
        return true;
    }
    activity.rollDamage({}, {configure: false});
    return false;
});

Hooks.on("dnd5e.preRollDamageV2", (config, dialog, _message) => {
    // Réglage "BypassWeaponAttackRoll" : supprime aussi la modale de configuration
    // des dégâts des armes.
    if (!game.settings.get(FqCardEngineModule.moduleName, "BypassWeaponAttackRoll")) {
        return true;
    }
    if (config.subject?.item?.type !== "weapon") {
        return true;
    }
    dialog.configure = false;
    return true;
});

Hooks.on("dnd5e.rollDamageV2", async (rolls, {subject}) => {
    // Attaque d'opportunité : la cible est celle désignée par la détection, pas
    // celle sélectionnée par l'utilisateur. Elle a été mémorisée SUR l'activité par
    // `preUseActivity` ; on la consomme ici, sans dépendre du moment où ce handler
    // s'exécute — il peut être très postérieur à `activity.use()` (jet de dégâts
    // détaché par `preRollAttackV2`, handlers de hook non attendus par Foundry).
    const opportunityTarget = OpportunityAttack.consumeTargetFor(subject);
    const item = subject.item;
    const squareDistance = game.system.grid.distance;
    const minReach = Math.trunc((subject.range.value ? squareDistance : subject.range.reach) ?? 0) / squareDistance;
    const maxReach = Math.trunc((subject.range.value ?? subject.range.reach) ?? 0) / squareDistance;
    const token = Constants.actorToken(subject.actor.id);
    if (!subject.item) {
        return;
    }
    // Une attaque d'opportunité est gratuite : symétrique du saut de
    // `checkResources` dans `preUseActivity`. Sans ce garde-fou, elle serait
    // vérifiée nulle part et payée quand même.
    if (!opportunityTarget && ["heal", "damage", "attack"].includes(subject.type)) {
        ResourceHandler.consumeResources(item.system?.fq, subject.actor);
    }
    let resultArray = [];
    let cardContent = {heal: 0, damage: 0, minReach, maxReach, bonusCrit: 0, bonusEva: 0};
    if (opportunityTarget) {
        // Impose la cible à toute l'aval : critique/esquive, application des PV et
        // log de combat passent tous par `TargetingPredicates.resolveTargets`.
        cardContent.forcedTargets = [opportunityTarget];
    }
    // Collecteur local des animations Dice So Nice de ce jet, passé aux méthodes de jet
    // pour un affichage simultané des dés (voir Damage.rollWithSuccessValueResultAsync).
    const dsnAnimations = [];
    for (let roll of rolls) {
        if (item.actor) {
            // Type d'effet (issu du dé) pour les FX, capté au moment du jet mais joué
            // seulement après l'attente des dés (voir plus bas) ; playFx distingue les
            // types traités (heal/damage/attack) des autres, qui ne déclenchent pas de FX.
            let fxType;
            let playFx = false;
            if (subject.type === "heal") {
                cardContent.heal = roll.formula;
                if (item.actor.system?.fq?.bonus?.heal) {
                    roll = await new Roll(Damage.getHealWithBonus(item.actor, roll.total)).evaluate();
                    Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgHealBonus", {heal: item.actor.system?.fq?.bonus?.heal})
                    });
                }
                resultArray.push(...await Damage.addCriticalToHeal(item.actor, roll.total, cardContent, dsnAnimations));
                fxType = roll.options.type;
                playFx = true;
            } else if (subject.type === "damage" || subject.type === "attack") {
                cardContent.damage = roll.formula;
                if (item.actor.system?.fq?.bonus?.damage) {
                    roll = await new Roll(Damage.getDamageWithBonus(item.actor, roll.total)).evaluate();
                    Damage.applyDiceAppearance(roll); // dés à la couleur du joueur
                    await roll.toMessage({
                        speaker: ChatMessage.getSpeaker({actor: item.actor}),
                        flavor: game.i18n.format("FQCARDENGINE.InfoMsgDamageBonus", {damage: item.actor.system?.fq?.bonus?.damage})
                    });
                }
                resultArray.push(...await Damage.addCriticalEvasionToDamage(item.actor, roll.total, cardContent, dsnAnimations));
                fxType = roll.options.type;
                playFx = true;
            }

            // Attente unique de toutes les animations Dice So Nice du jet (dégâts/soin
            // + critique + esquives partis simultanément) avant de jouer les FX puis
            // d'infliger les PV — même ordre que lors du jeu d'une carte.
            await Promise.all(dsnAnimations);

            if (token && playFx) {
                await Fx.handleSpecialEffect(cardContent, resultArray, token, fxType);
            }

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            Damage.displayResult(item.actor, resultArray, null);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent, item.actor.id,
                TargetingPredicates.resolveTargetActorIds(cardContent, item.actor));
        }
    }
});
