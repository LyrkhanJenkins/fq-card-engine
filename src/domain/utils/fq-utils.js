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

export default class FQUtils {

    // TODO: A finir de dispatché pour tout ce qui n'est pas du utils genre applyCardEffect
    /**
     * Roll dice and wait for the result
     *
     * @param formula
     * @param display Display in a chat message the result
     * @returns {Promise<*>}
     */
    static async rollResultAsync(formula, display = false) {
        const roll = await new Roll(formula.toString()).evaluate();
        if (display === false) {
            return roll.total;
        }
        const msg = await roll.toMessage();
        if (game.dice3d && roll.isDeterministic === false) {
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }
        return roll.total;
    }

    static generateRandomId(length) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters.charAt(randomIndex);
        }

        return result;
    }

    static async applyCardEffect(cardContent, card, fd) {
        let resultArray = [];

        if (cardContent) {
            ConsumptionUtils.consumeResources(cardContent, game.user?.character);
            if (cardContent.damage) {
                resultArray.push(...await DamageUtils.buildDamageDiceLauncher(game.user.character, cardContent));
            }
            if (cardContent.heal) {
                resultArray.push(...await DamageUtils.buildHealDiceLauncher(game.user.character, cardContent));
            }
            if (cardContent.draw) {
                card.parent.draw(card.source, cardContent.draw, {chatNotification: false, how: 2});
            }
            if (cardContent.minions && Array.isArray(cardContent.minions)) {
                for (const minion of cardContent.minions) {
                    if (fd.minionLeft) {
                        await FQUtils.createActor(minion, "left");
                        fd.minionLeft = false;
                    }
                    if (fd.minionUp) {
                        await FQUtils.createActor(minion, "up");
                        fd.minionUp = false;
                    }
                    if (fd.minionRight) {
                        await FQUtils.createActor(minion, "right");
                        fd.minionRight = false;
                    }
                    if (fd.minionDown) {
                        await FQUtils.createActor(minion, "down");
                        fd.minionDown = false;
                    }
                }
            }
            if (cardContent.executeEval) {
                // TODO refacto
                cardContent.executeEval = cardContent.executeEval?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");
                eval(cardContent.executeEval);
            }

            let cardMessages = FQUtils.translateMessages(cardContent.messages);
            if (cardContent.applyEffectsFormulas) {
                for (let i = 0; i < cardContent.applyEffectsFormulas.length; i++) {
                    const applyEffectsFormulas = cardContent.applyEffectsFormulas[i];
                    const message = await FQUtils.playApplyEffectsFormulas(applyEffectsFormulas, cardContent);
                    cardMessages = cardMessages.concat(message);
                }
            }

            const match = cardContent.damage.match(/\[([a-z]+)\]/i);
            await FxUtils.handleSpecialEffect(cardContent, resultArray, FqConstants.myToken, match ? match[1] : null);

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            DamageUtils.displayResult(game.user.character, resultArray, cardMessages);
            await socket.executeAsGM("logCardPlayed", resultArray, cardContent);
        } else {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<div style='font-style: italic'>${game.i18n.localize("FQCARDENGINE.InfoMsgNoAddedEffect")}</div>`
            });
        }
    }


    static async createEffectsFromData(currentEffect) {
        return Promise.all(currentEffect.data.map(async effect => {
            effect = await FQUtils.numerizeEffectObjValue(effect);
            if (!effect.name) {
                effect.name = effect.label;
            }
            if (effect.duration) {
                const {startTime, rounds, turns} = effect.duration;
                effect.startTime = startTime;
                effect.rounds = rounds;
                effect.origin = OriginFQEffectLabel;
                effect.turns = turns;
            }
            for (let changeKey in effect.changes) {
                if (effect.changes[changeKey].key === "macro.execute") {
                    await FxUtils.importMacroFromCompendium(effect.changes[changeKey].value);
                }
                let value = effect.changes[changeKey].value;
                // TODO constantes ?
                if (!["system.fq.bonus.damage", "system.fq.bonus.heal"].includes(effect.changes[changeKey].key)) {
                    try {
                        // TODO A factoriser?
                        const roll = await new Roll(effect.changes[changeKey].value.toString()).evaluate();
                        if (!roll) {
                            throw new Error();
                        }
                        value = Number(roll.total);
                    } catch (e) {
                        value = effect.changes[changeKey].value;
                    }
                }
                effect.changes[changeKey].value = value;
            }
            return effect;
        }));
    }

    static rewriteCardContent(card, cardContents, newValue) {
        //TODO pour le moment réécris chaque choix, à voir si on le fait que par choix
        cardContents = cardContents.map(content => {
            if (content.afterFirstPlay) {
                content = JSON.parse(content.afterFirstPlay);
            }
            return (FQUtils.stringifyObjValue({...content, ...newValue}));
        });
        card.update({
            "system.fq.choices": cardContents
        });
        //TODO peut mieux faire pour rafraichir le carte
        card.flip().then(() => card.flip(0));
    }

    static stringifyObjValue(cardContent) {
        for (const key in cardContent) {
            if (cardContent.hasOwnProperty(key)) {
                if (typeof cardContent[key] === "object") {
                    cardContent[key] = FQUtils.stringifyObjValue(cardContent[key]);
                } else {
                    cardContent[key] = cardContent[key]?.toString();
                }
            }
        }
        return cardContent;
    }

    static async numerizeEffectObjValue(content) {
        for (const key in Object.values(content)) {
            if (content.hasOwnProperty(key)) {
                if (typeof content[key] === "object") {
                    content[key] = await FQUtils.numerizeEffectObjValue(content[key]);
                } else if (!isNaN(content[key])) {
                    content[key] = Number(content[key]);
                } else if (typeof content[key] === "string" && content[key][0] === "+") {
                    // Do nothing TODO: peut être géré dans une fonction (form()) par exemple
                } else {
                    try {
                        content[key] = await FQUtils.rollResultAsync(content[key]);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        }
        return content;
    }


    //Display damage dices and manual actions
    static async playApplyEffectsFormulas(applyEffectsFormulas, cardContent) {
        const roll = await new Roll(applyEffectsFormulas.formula).evaluate();
        for (let i = 0; i < applyEffectsFormulas.effects.length; i++) {
            applyEffectsFormulas.effects[i].result = await FQUtils.rollResultAsync(applyEffectsFormulas.effects[i].result);
        }

        let effectMessages = null;
        let message = `<h2 style='color: ${OTHER_ROLL_COLOR}'>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulas",
            {applyEffectsFormulasTitle: applyEffectsFormulas.title})}`;
        if (applyEffectsFormulas.effects && applyEffectsFormulas.effects.map(effect => effect.result).includes(roll.total)) {
            const currentEffectData = applyEffectsFormulas.effects.find(effect => effect.result === roll.total);
            message += `: <b>${game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulasSuccess")}</b> `;
            effectMessages = FQUtils.translateMessages(currentEffectData.messages);
            const effects = await FQUtils.createEffectsFromData(currentEffectData);
            for (const effectsKey in effects) {
                if (!currentEffectData.self && (cardContent?.minReach || cardContent?.maxReach ||
                    cardContent.targetType === CardFqSystem.TARGET_TYPE_SKELETON)) {
                    const myTargets = FqConstants.myTargets(cardContent.targetType);
                    for (let i = 0; i < myTargets.length; i++) {
                        await socket.executeAsGM("addEffectForTarget", effects[effectsKey], myTargets[i].id);
                    }
                } else {
                    ActiveEffect.implementation.create(effects[effectsKey], {parent: game.user.character});
                }
            }
        }

        message += `</h2>`;

        const msg = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
            flavor: message
        });

        if (game.dice3d && roll.isDeterministic === false) {
            await game.dice3d.waitFor3DAnimationByMessageID(msg.id);
        }
        return effectMessages ? effectMessages : [];
    }

    static translateMessages(messages) {
        let translations = [];
        if (messages) {
            messages.forEach(message => {
                translations.push(game.i18n.format(message.key,
                    message?.arg ? JSON.parse(message?.arg) : {}));
            });
        }
        return translations;
    }

    static async prepareDataFromCard(cardContent) {
        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            cardContent.minReach = await FQUtils.rollResultAsync(cardContent.minReach);
            cardContent.maxReach = await FQUtils.rollResultAsync(cardContent.maxReach) + Number(FqConstants.actorFQ.bonus.range);
        }
        if (cardContent?.nbTargets) {
            cardContent.nbTargets = await FQUtils.rollResultAsync(cardContent.nbTargets);
        }

        // COST HP
        if (cardContent?.hp) {
            cardContent.hp = await FQUtils.rollResultAsync(cardContent.hp);
        }

        // COST ACTION
        if (cardContent?.action) {
            cardContent.action = await FQUtils.rollResultAsync(cardContent.action);
        }

        // COST MANA
        if (cardContent?.mana) {
            cardContent.mana = await FQUtils.rollResultAsync(cardContent.mana);
        }

        // COST ZEAL
        if (cardContent?.zeal) {
            cardContent.zeal = await FQUtils.rollResultAsync(cardContent.zeal);
        }

        // COST DRAW
        if (cardContent?.draw) {
            cardContent.draw = await FQUtils.rollResultAsync(cardContent.draw);
        }
        // COST DROP
        if (cardContent?.drop) {
            cardContent.drop = await FQUtils.rollResultAsync(cardContent.drop);
        }

        // BONUSES
        if (cardContent.bonusCrit) {
            cardContent.bonusCrit = await FQUtils.rollResultAsync(cardContent.bonusCrit);
        }
        if (cardContent.bonusEva) {
            cardContent.bonusEva = await FQUtils.rollResultAsync(cardContent.bonusEva);
        }
    }

    //Display damage dices
    static checkIfCanUseCard(cardContent, card) {

        if (cardContent.customEvals && Array.isArray(cardContent.customEvals)) {
            let iscustomEvals = true;
            cardContent.customEvals.forEach(customEval => {
                // TODO Encore necessaire après refacto?
                customEval.script = customEval.script?.replaceAll("&gt;", ">").replaceAll("&lt;", "<")
                    .replaceAll("&amp;", "&");

                // Contrôle de la carte personnalisée
                if (customEval.script) {
                    try {
                        if (!eval(customEval.script)) {
                            let cardMessages = FQUtils.translateMessages(customEval.errorMessages);
                            if (cardMessages?.length) {
                                cardMessages.forEach(warningMsg => {
                                    ChatMessage.create({
                                        speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                                        content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>${warningMsg}</span>`
                                    });
                                });
                            } else {
                                ChatMessage.create({
                                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                                        ${game.i18n.localize("FQCARDENGINE.WarningMsgCardConditionNotMet")}</span>`
                                });
                            }
                            iscustomEvals = false;
                        }
                    } catch (e) {
                        console.error(e);
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                            content: `<span style='color: ${ERROR_COLOR}; font-style: italic'>
                            ${game.i18n.localize("FQCARDENGINE.WarningMsgErrorReadingCardSpecialCondition")}</span>`
                        });
                    }
                }
            });
            if (!iscustomEvals) {
                return false;
            }
        }

        if (game.combat != null) {
            if (cardContent?.replayable === "passif" && cardContent?.hasBeenPlayed && cardContent?.passivePlayedRound === game.combat?.round.toString()) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                       ${game.i18n.localize("FQCARDENGINE.WarningMsgPassiveSpellAlreadyUsed")}</span>`
                });
                return false;
            }
            // S'agit t-il d'un sort réactive et peut on la jouer?
            if (cardContent && !cardContent.reactive && !ConsumptionUtils.validateUseSpellInTurn(game.user?.character)) {
                return false;
            } else if (cardContent?.reactive && (!game.combat || game.combat.combatant.actor?.id === game.user?.character?.id)) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
            ${game.i18n.localize("FQCARDENGINE.WarningMsgPlayReactiveCard")}</span>`
                });
                return false;
            }
        }

        // TARGETING
        if (cardContent?.minReach || cardContent?.maxReach) {
            if (!ConsumptionUtils.checkIfCanCardCanReachTargets(
                game.user.character,
                cardContent.nbTargets,
                cardContent.minReach,
                cardContent.maxReach,
                cardContent.targetType)
            ) {
                return false;
            }
        }

        // COST DRAW
        if (cardContent?.draw) {
            if ((card.source.cards.size - card.source.drawnCards.length) < cardContent.draw) {
                ConsumptionUtils.createUserWarningMessage(game.i18n.localize("FQCARDENGINE.WarningMsgNotEnoughDraw"), game.user.character);
                return false;
            }
        }

        return ConsumptionUtils.checkResources(cardContent, game.user.character);
    }


    static recalculatedWithWYValue(cardContent, XXX, YYY) {
        const keys = Object.keys(cardContent);
        keys.forEach(k => {
            if (cardContent[k] && typeof cardContent[k] === "object") FQUtils.recalculatedWithWYValue(cardContent[k], XXX, YYY);
            else if (typeof cardContent[k] === "string") {
                cardContent[k] = cardContent[k].replaceAll("XXX", XXX).replaceAll("YYY", YYY);
            }
        });
    }

    static replaceCardContentAbilitiesBonus(cardContent) {
        const keys = Object.keys(cardContent);
        keys.forEach(k => {
            if (cardContent[k] && typeof cardContent[k] === "object") FQUtils.replaceCardContentAbilitiesBonus(cardContent[k]);
            else if (typeof cardContent[k] === "string") {
                cardContent[k] = FQUtils.replaceAbilitiesBonus(cardContent[k]);
            }
        });
    }

    static replaceAbilitiesBonus(str) {
        return str.replaceAll("@str", FqConstants.actorAbi.str.mod.toString())
            .replaceAll("@dex", FqConstants.actorAbi.dex.mod.toString())
            .replaceAll("@con", FqConstants.actorAbi.con.mod.toString())
            .replaceAll("@int", FqConstants.actorAbi.int.mod.toString())
            .replaceAll("@wis", FqConstants.actorAbi.wis.mod.toString())
            .replaceAll("@cha", FqConstants.actorAbi.cha.mod.toString());
    }

    static hasAbilitiesBonus(str) {
        return (str.includes("@str") && FqConstants.actorAbi.str.mod > 0) ||
         (str.includes("@dex") && FqConstants.actorAbi.dex.mod > 0) ||
         (str.includes("@con") && FqConstants.actorAbi.con.mod > 0) ||
         (str.includes("@int") && FqConstants.actorAbi.int.mod > 0) ||
         (str.includes("@wis") && FqConstants.actorAbi.wis.mod > 0) ||
         (str.includes("@cha") && FqConstants.actorAbi.cha.mod > 0);
    }

    static async replaceCardContentXAndYValue(cardContent, hasVariables, XXX, YYY) {
        //Recalculate xmax and ymax before checking it and replace XXX and YYY value
        //The others value are recalculated in checkIfCanUseCardAndPrepareDataFromIt
        if (cardContent?.xmax) {
            cardContent.xmax = await FQUtils.rollResultAsync(cardContent.xmax);
        }
        if (cardContent?.ymax) {
            cardContent.ymax = await FQUtils.rollResultAsync(cardContent.ymax);
        }

        if (cardContent?.xmax) {
            if (XXX > Number(cardContent?.xmax) || XXX < 0) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgXValueSuperiorXMax", {xmax: cardContent.xmax})}</span>`
                });
                return false;
            }
        }

        if (cardContent?.xmin && XXX < Number(cardContent?.xmin)) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgXValueInferiorXMin", {xmin: cardContent.xmin})}</span>`
            });
            return false;
        }

        if (cardContent?.ymax) {
            if (YYY > Number(cardContent?.ymax) || YYY < 0) {
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                    content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                      ${game.i18n.format("FQCARDENGINE.WarningMsgYValueSuperiorYMax", {ymax: cardContent.ymax})}</span>`
                });
                return false;
            }
        }

        if (cardContent?.ymin && XXX < Number(cardContent?.ymin)) {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor: game.user.character}),
                content: `<span style='color: ${WARNING_COLOR}; font-style: italic'>
                            ${game.i18n.format("FQCARDENGINE.WarningMsgYValueInferiorYMin", {ymin: cardContent.ymin})}</span>`
            });
            return false;
        }

        if (hasVariables) {
            FQUtils.recalculatedWithWYValue(cardContent, XXX ? XXX : 0, YYY ? YYY : 0);
        } else if (cardContent && (cardContent.xvalue || cardContent.yvalue)) {
            FQUtils.recalculatedWithWYValue(cardContent, await FQUtils.getXYValue(cardContent.xvalue, FqConstants.myTargets(cardContent.targetType)),
                await FQUtils.getXYValue(cardContent.yvalue, FqConstants.myTargets(cardContent.targetType)));
        }
        return true;
    }

    static async getXYValue(value, myTargets) {
        if (value === "nbTargets") {
            return myTargets.length ? myTargets.length : 0;
        } else if (myTargets.length === 1 && value === "reach") {
            const myToken = game.canvas?.scene?.tokens?.find(t => t.actorId === game.user?.character?.id);
            const target = myTargets[0].document;
            return CanvasUtils.getMinDistanceBetweenTwoToken(myToken.x, myToken.y, target.x, target.y,
                myToken.width, target.width, myToken.height, target.height);
        } else if (value.startsWith("SCRIPT:")) {
            // TODO A voir si on fait mieux et on protège
            return eval(value.substring(7));
        } else {
            // Sinon ça concerne le systeme du personnage
            return FQUtils.getNestedAttribute(game.user.character?.system, value);
        }
    }

    static async getNestedAttribute(obj, key) {
        if (!key) {
            return 0;
        }
        const keys = key.split(".");
        let value = obj;
        for (const k of keys) {

            if (value.hasOwnProperty(k)) {
                value = value[k];
            } else {
                return 0;
            }
        }
        return await FQUtils.rollResultAsync(value.toString());
    }

    static async createActor(minion, location) {
        if (!FQUtils.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        await FQUtils.createActorData(minion, location);

    }

    static async createActorData(minion, location) {
        const minionPack = await game.packs.get(FqCardEngineModule.moduleName + ".minions-fq8").getDocuments();

        let actorData = JSON.parse(JSON.stringify(minionPack.find(m => m.name === minion?.name)));

        if (actorData) {
            actorData.folder = FQUtils.getTempActorFolder().id;
            actorData.name = actorData.name + "_" + Math.floor(Math.random() * 1000000);
            if (minion.data) {
                if (minion.data.hp) {
                    actorData.system.attributes.hp.max = await FQUtils.rollResultAsync(minion.data.hp);
                    actorData.system.attributes.hp.value = await FQUtils.rollResultAsync(minion.data.hp);
                }
                if (minion.data.critical) {
                    actorData.system.fq.attributes.critical = await FQUtils.rollResultAsync(minion.data.critical);
                }
                if (minion.data.evasion) {
                    actorData.system.fq.attributes.evasion = await FQUtils.rollResultAsync(minion.data.evasion);
                }
                if (minion.data.action) {
                    actorData.system.fq.action.max = await FQUtils.rollResultAsync(minion.data.action);
                    actorData.system.fq.action.value = await FQUtils.rollResultAsync(minion.data.action);
                }
                if (minion.data.mana) {
                    actorData.system.fq.mana.max = await FQUtils.rollResultAsync(minion.data.mana);
                    actorData.system.fq.mana.value = await FQUtils.rollResultAsync(minion.data.mana);
                }
                if (minion.data.zeal) {
                    actorData.system.fq.zeal.max = DEFAULT_MAX_ZEAL;
                    actorData.system.fq.zeal.value = await FQUtils.rollResultAsync(minion.data.zeal);
                }
                if (minion.data.damageBonus) {
                    actorData.system.fq.bonus.damage = await FQUtils.rollResultAsync(minion.data.damageBonus);
                }
                if (minion.data.healBonus) {
                    actorData.system.fq.bonus.heal = await FQUtils.rollResultAsync(minion.data.healBonus);
                }
                if (minion.data.movement) {
                    actorData.system.attributes.movement.walk = await FQUtils.rollResultAsync(minion.data.movement);
                }
            }
            actorData.ownership[game.userId] = 3;

            await socket.executeAsGM("createActorFromData", actorData, game.userId, location);
        }
    }

    static getNbValideMinionLocationSelected(fd) {
        return (fd.minionUp && !CanvasUtils.locationIsOccupied("up") ? 1 : 0) +
            (fd.minionDown && !CanvasUtils.locationIsOccupied("down") ? 1 : 0) +
            (fd.minionLeft && !CanvasUtils.locationIsOccupied("left") ? 1 : 0) +
            (fd.minionRight && !CanvasUtils.locationIsOccupied("right") ? 1 : 0);
    }

    static getNbMinionLocationSelected(fd) {
        return (fd.minionUp ? 1 : 0) +
            (fd.minionDown ? 1 : 0) +
            (fd.minionLeft ? 1 : 0) +
            (fd.minionRight ? 1 : 0);
    }


    static getTempActorFolder() {
        return game.folders.find(fol => fol.type === "Actor" && fol.name === "Temporaire");
    }

    static async createTempFold() {
        await Folder.create({
            name: "Temporaire", type: "Actor"
        });
    }

    static deepCopy(obj) {
        if (obj === null || typeof obj !== "object") return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => FQUtils.deepCopy(item));
        }

        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, FQUtils.deepCopy(value)])
        );
    }

    /**
     * MUST BE EXECUTE AS A GM
     * Retourne un chemin de fichier aléatoire depuis un dossier virtuel de Foundry
     * @param {string} folderPath - Le chemin virtuel (ex: "modules/mon-module/images")
     * @returns {Promise<string|null>}
     */
    static async getRandomFileFromFolder(folderPath) {
        try {
            const response = await foundry.applications.apps.FilePicker.implementation.browse("data", folderPath);

            if (!response.files.length) return null;

            const randomIndex = Math.floor(Math.random() * response.files.length);
            return response.files[randomIndex];
        } catch (err) {
            console.error("Erreur lors du browse :", err);
            return null;
        }
    }
}