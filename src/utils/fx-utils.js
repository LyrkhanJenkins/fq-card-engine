import FqConstants from "./fq-constants.js";
import {socket} from "../hook/socket-lib.js";

/**
 * Based on Sequencer and advanced macros
 */
export default class FxUtils {

    static SOUND_PATH = "modules/fq-card-engine/sounds/";
    static VISUAL_PATH = "modules/fq-card-engine/visuals/";
    static GENERIC_VISUAL_PATH = this.VISUAL_PATH + "generics/";

    static async importMacroFromCompendium(executeMacro) {
        const macroName = executeMacro.split(" ")[0];
        let existing = game.macros.getName(macroName);
        if (!existing) {
            const compendium = await game.packs.get(FqCardEngineModule.moduleName + ".macros-sequencer").getDocuments();
            const persistAura = compendium.find(macro => macro.name === macroName);
            await Macro.create(persistAura);
        }
    }

    static async handleSpecialEffect(cardContent, resultArray, myToken, typeEffect) {
        const targets = FqConstants.myTargets(cardContent.targetType);
        const soundPath = await FxUtils.getSoundEffectPath(cardContent.damage, cardContent.heal, cardContent.sound, typeEffect);

        if (game.modules.get("sequencer")?.active) {
            FxUtils._handleSequencerEffects(cardContent, myToken, targets, resultArray, typeEffect);
        }

        if (soundPath) {
            setTimeout(_ => {
                FxUtils._playAudioOnly(soundPath);
            }, 200);
        }
    }

    static _handleSequencerEffects(cardContent, myToken, targets, resultArray, typeEffect) {
        const effectFile = FxUtils._getEffectFile(cardContent, typeEffect);
        const hasTargets = targets.length > 0;

        [...resultArray].forEach((result) => {
            if (result.critical) {
                new Sequence().effect().file(this.GENERIC_VISUAL_PATH + "other/critical.webm").atLocation(myToken)
                    .size(2.5, {gridUnits: true}).play();
            }
        });

        if (hasTargets && cardContent.maxReach) {
            targets.forEach(target => {
                FxUtils._createSequenceForTarget(effectFile, myToken, target, cardContent, [...resultArray].find(res => res.targetTokenId === target.id)?.evasion);
            });
        } else {
            FxUtils._createSequenceForSelf(effectFile, myToken);
        }
    }

    static _getEffectFile(cardContent, typeEffect) {
        if (cardContent.visual?.path && (!cardContent.visual?.path.includes("jb2a") || game.modules.get("JB2A_DnD5e")?.active)) {
            return cardContent.visual?.path;
        } else if (cardContent.heal) {
            return this.GENERIC_VISUAL_PATH + "other/heal.webm";
        } else if (cardContent.damage) {
            return FxUtils.getDamageGenericEffectPath(cardContent.damage, cardContent.maxReach, typeEffect);
        } else {
            return this.GENERIC_VISUAL_PATH + "other/buff.webm";
        }
    }

    static _createSequenceForTarget(effectFile, myToken, target, cardContent, isEvade) {
        let seq = new Sequence();
        seq.effect().file(effectFile);

        if ((cardContent.visual?.path || cardContent.damage) && cardContent.maxReach > 2 && !cardContent.visual?.onTarget) {
            seq.atLocation(myToken).stretchTo(target).waitUntilFinished();
        } else {
            seq.atLocation(target)
                .size(2, {gridUnits: true}).waitUntilFinished(-500);
        }

        if (cardContent.damage && !isEvade) {
            FxUtils.getBlinkAnimation(seq, target, 100, 8);
        }

        if (isEvade) {
            seq.effect().file(this.GENERIC_VISUAL_PATH + "other/evasion.webm").atLocation(target)
                .size(2.5, {gridUnits: true}).sound().file(this.SOUND_PATH + "evasion/1.mp3");
        }
        seq.play();
    }

    static getBlinkAnimation(seq, token, fadeIn, repeats = 2) {
        for (let i = 0; i < repeats; i++) {
            seq.animation()
                .on(token)
                .fadeIn(fadeIn)
                .opacity(0)
                .waitUntilFinished()
                .animation()
                .duration(200)
                .on(token)
                .fadeIn(fadeIn)
                .opacity(1)
                .waitUntilFinished();
        }
    }

    static _createSequenceForSelf(effectFile, myToken) {
        let seq = new Sequence().effect()
            .file(effectFile)
            .atLocation(myToken)
            .size(2, {gridUnits: true});
        seq.play();
    }

    static _playAudioOnly(soundPath) {
        foundry.audio.AudioHelper.play({
            src: soundPath,
            volume: 0.5,
            autoplay: true,
            loop: false
        }, true);
    }

    static getDamageGenericEffectPath(damageFormula, maxReach, typeEffect) {
        const basePath = this.GENERIC_VISUAL_PATH + (maxReach > 2 ? "range/" : "melee/");

        const visualMap = {
            "acid": "acid.webm",
            "bludgeoning": "bludgeoning.webm",
            "cold": "cold.webm",
            "fire": "fire.webm",
            "force": "force.webm",
            "lightning": "lightning.webm",
            "necrotic": "necrotic.webm",
            "piercing": "piercing.webm",
            "poison": "poison.webm",
            "psychic": "psychic.webm",
            "radiant": "radiant.webm",
            "slashing": "slashing.webm",
            "thunder": "thunder.webm"
        };
        return basePath + (typeEffect ? visualMap[typeEffect] : "default.webm");
    }

    static async getSoundEffectPath(damageFormula, healFormula, customSound, firstType) {
        if (customSound) {
            return this.SOUND_PATH + customSound;
        }

        if (damageFormula) {
            return await socket.executeAsGM("getRandomFileFromFolder", this.SOUND_PATH + (firstType ?? "default"));
        }

        if (healFormula) {
            return await socket.executeAsGM("getRandomFileFromFolder", this.SOUND_PATH + "heal");
        }

        return null;
    }

}
