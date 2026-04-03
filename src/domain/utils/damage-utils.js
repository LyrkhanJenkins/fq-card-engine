import FqConstants, {
    CRITICAL_COLOR,
    CRITICAL_HEAL_COLOR,
    DAMAGES_COLOR,
    EVASION_COLOR,
    FAIL_COLOR,
    HEAL_COLOR,
    SUCCESS_COLOR
} from "./fq-constants.js";

export default class DamageUtils {
    static async buildDamageDiceLauncher(actor, cardContent) {
        let damageFormula = DamageUtils.getDamageWithBonus(actor, cardContent.damage);
        let damages = await DamageUtils.rollWithSuccessValueResultAsync(actor, damageFormula, {
            color: DAMAGES_COLOR,
            title: "Dégâts"
        });
        return DamageUtils.addCriticalEvasionToDamage(actor, damages, cardContent);
    }

    static async buildHealDiceLauncher(actor, cardContent) {
        let healFormula = DamageUtils.getHealWithBonus(actor, cardContent.heal);
        let heal = await DamageUtils.rollWithSuccessValueResultAsync(actor, healFormula,
            {
                color: HEAL_COLOR,
                title: "Soins"
            });
        return DamageUtils.addCriticalToHeal(actor, heal, cardContent);
    }

    static getHealWithBonus(actor, healFormula) {
        let healBonus = "" + actor.system?.fq?.bonus?.heal;
        if (healBonus) {
            if (/^\d/.test(healBonus)) { // vérifie si ça commence par un chiffre
                healBonus = "+" + healBonus;
            }
            healFormula = `(` + healFormula + `) ${healBonus}`;
        }
        return healFormula;
    }

    static async addCriticalToHeal(actor, heal, cardContent) {
        if (heal < 0) {
            heal = 0;
        }
        let critical = false;
        let healArray = [];
        if (actor?.system?.fq.attributes.critical + cardContent.bonusCrit > 0) {
            const critToReach = 20 - actor?.system?.fq.attributes.critical - cardContent.bonusCrit;
            critical = await DamageUtils.rollWithSuccessValueResultAsync(actor, "1d20", {
                color: CRITICAL_HEAL_COLOR, title: "Critique des soins",
                success: critToReach
            }) >= critToReach;
        }
        FqConstants.myTargets(cardContent.targetType).forEach(target => {
            healArray.push({
                key: `Soins totaux sur "${target.document.name}"`,
                value: critical ? heal * 2 : heal,
                type: "healFQ",
                critical,
                targetTokenId: target.id
            });
        });
        return healArray;
    }

    static getDamageWithBonus(actor, damageFormula) {
        let damageBonus = "" + actor.system?.fq?.bonus?.damage;
        if (damageBonus) {
            if (/^\d/.test(damageBonus)) { // vérifie si ça commence par un chiffre
                damageBonus = "+" + damageBonus;
            }
            damageFormula = `(` + damageFormula + `) ${damageBonus}`;
        }
        return damageFormula;
    }

    static async addCriticalEvasionToDamage(actor, damages, cardContent) {
        const myTargets = FqConstants.myTargets(cardContent.targetType);
        if (damages < 0) {
            damages = 0;
        }
        let critical = false;
        let damagesArray = [];
        if (actor?.system?.fq.attributes.critical + cardContent.bonusCrit > 0) {
            const critToReach = 21 - actor?.system?.fq.attributes.critical - cardContent.bonusCrit;
            critical = await DamageUtils.rollWithSuccessValueResultAsync(actor, "1d20", {
                color: CRITICAL_COLOR, title: "Critique",
                success: critToReach
            }) >= critToReach;
        }
        for (let i = 0; i < myTargets.length; i++) {
            const target = myTargets[i];
            const targetActor = target.actor;
            let evaToReach = 21;
            let evasionScore = 0;

            if (targetActor._id !== actor._id // no evasion is possible if self targeting
            ) {
                if (targetActor.system?.fq?.attributes.evasion + cardContent.bonusEva > 0) { // or no evasion from the target
                    evaToReach = 21 - targetActor.system?.fq?.attributes.evasion - cardContent.bonusEva;
                    evasionScore = await DamageUtils.rollWithSuccessValueResultAsync(actor, "1d20", {
                        color: EVASION_COLOR, title: `Esquive de "${target.document.name}"`,
                        success: evaToReach
                    });
                }
                if (evasionScore >= evaToReach) {
                    damagesArray.push({
                        key: `Dégâts totaux sur "${target.document.name}"`,
                        value: critical ? damages : 0,
                        critical,
                        evasion: true,
                        type: "damageFQ",
                        targetTokenId: target.id
                    });
                } else {
                    damagesArray.push({
                        key: `Dégâts totaux sur "${target.document.name}"`,
                        value: critical ? damages * 2 : damages,
                        critical,
                        evasion: false,
                        type: "damageFQ",
                        targetTokenId: target.id
                    });
                }
            }
        }
        return damagesArray;
    }

    /**
     * Roll
     * @param actor
     * @param formula
     * @param options
     * @returns {Promise<*>}
     */
    static async rollWithSuccessValueResultAsync(actor, formula, options) {
        // Check whether the dice formula is "1dX" or "dX" to assure that both ways work
        // if (dice.charAt(0) == "d") dice = "1" + dice;
        // Roll dice
        const roll = await new Roll(formula).evaluate();
        // Add reroll button
        let message = `<h2 style='color: ${options.color}'>${options.title}`;

        if (options.success != null && roll.total >= options.success) {
            message += `: <b style="color: ${SUCCESS_COLOR};">SUCCÈS !</b> `;
        } else if (options.success != null) {
            message += `: <i style="color: ${FAIL_COLOR};">échec...</i> `;
        }

        message += `</h2>`;

        // Send chat message
        const msg = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor}),
            flavor: message
        });

        //TODO pas mal mais si probleme peut être récupérer plutôt le message et voir si il est déjà display
        if (game.dice3d && roll.isDeterministic === false) {
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }
        return roll.total;
    }


    //Display damage dices and manual actions
    static displayResult(actor, resultArray, manualActions) {
        if (resultArray.length > 0 || manualActions) {
            let message = "";
            if (resultArray.length !== 0) {
                message = `<h1>${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardResult")}</h1>`;
                resultArray.forEach(result => {
                    message += `<div>${result.key} : <b>${result.value}</b></div>`;
                });
            }
            if (manualActions && manualActions.length > 0) {
                message += `<h2>${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardOtherEffect")}</h2><ul>`;
                manualActions.forEach(manualAction => message += `<li>${manualAction}</li>`);
                message += `</ul>`;
            }
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}),
                content: message
            });
        }
    }

    static addEffectForTarget(effect, targetId) {
        ActiveEffect.implementation.create(effect, {parent: game.canvas.tokens.get(targetId).actor});
    }

    static applyActorHpModification(targetId, value, typeAction) {
        const targetActor = game.canvas.tokens.get(targetId).actor;
        if (typeAction === "damageFQ") {
            if (targetActor.system.attributes.hp.temp > value) {
                targetActor.update({"system.attributes.hp.temp": targetActor.system.attributes.hp.temp - value});
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
                targetActor.effects.filter(effect => effect?.flags?.expireOnDamage).forEach(effect => {
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

    static async createActorFromData(actorData, currentUserId, location) {
        const currentUser = game.users.get(currentUserId);
        await Actor.create(actorData).then(async newActor => {
            // Ajouter le jeton à la scène active
            const scene = game.scenes.active;

            const tokenData = {
                ...newActor.prototypeToken,
                actorId: newActor._id,
                effects: [],
                x: CanvasUtils.getXAdjacentLocation(game.canvas?.scene?.tokens?.find(t => t.actorId === currentUser?.character?.id), location),
                y: CanvasUtils.getYAdjacentLocation(game.canvas?.scene?.tokens?.find(t => t.actorId === currentUser?.character?.id), location)
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
