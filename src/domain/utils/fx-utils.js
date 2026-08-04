import FqConstants from "./fq-constants.js";
import {socket} from "../../hook/socket-lib.js";

/**
 * Utilitaires d'effets audiovisuels lors du jeu des cartes, s'appuyant sur le
 * module Sequencer et les macros avancées. Gère la sélection des fichiers vidéo
 * (dégâts, soin, buff, esquive, critique) et sonores, et la construction des
 * séquences visuelles vers soi ou vers les cibles.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class FxUtils {

    static SOUND_PATH = "modules/fq-card-engine/sounds/";
    static VISUAL_PATH = "modules/fq-card-engine/visuals/";
    static GENERIC_VISUAL_PATH = this.VISUAL_PATH + "generics/";

    /**
     * Importe une macro depuis le compendium `macros-sequencer` si elle n'existe
     * pas déjà dans le monde. Le nom de la macro est le premier mot de la chaîne.
     *
     * @param {string} executeMacro - La commande d'exécution dont le premier mot est le nom de la macro.
     *
     * @returns {Promise<void>}
     */
    static async importMacroFromCompendium(executeMacro) {
        const macroName = executeMacro.split(" ")[0];
        let existing = game.macros.getName(macroName);
        if (!existing) {
            const compendium = await game.packs.get(FqCardEngineModule.moduleName + ".macros-sequencer").getDocuments();
            const persistAura = compendium.find(macro => macro.name === macroName);
            await Macro.create(persistAura);
        }
    }

    /**
     * Point d'entrée de la restitution audiovisuelle d'un effet de carte : joue
     * les effets Sequencer (si le module est actif) et le son associé.
     *
     * @param {object}   cardContent - Le contenu (choix) de la carte jouée.
     * @param {object[]} resultArray - Les résultats de l'effet (dégâts, critiques, esquives…).
     * @param {object}   myToken     - Le token source (le lanceur).
     * @param {string}   typeEffect  - Le type d'effet/dégâts (fire, cold…) pilotant le visuel/son.
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Construit et joue les séquences Sequencer d'un effet de carte : effet de
     * critique sur le lanceur, puis un effet par cible (si portée) ou un effet
     * sur soi à défaut.
     *
     * @param {object}   cardContent - Le contenu (choix) de la carte jouée.
     * @param {object}   myToken     - Le token source (le lanceur).
     * @param {object[]} targets     - Les tokens ciblés.
     * @param {object[]} resultArray - Les résultats de l'effet (critiques, esquives par cible…).
     * @param {string}   typeEffect  - Le type d'effet/dégâts pilotant le fichier visuel.
     *
     * @returns {void}
     */
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

    /**
     * Détermine le fichier vidéo d'effet à jouer selon le contenu de la carte :
     * visuel personnalisé (hors jb2a si le module est absent), soin, dégâts
     * génériques, ou buff par défaut.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {string} typeEffect  - Le type d'effet/dégâts pilotant le fichier générique.
     *
     * @returns {string} Le chemin du fichier vidéo d'effet à jouer.
     */
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

    /**
     * Construit et joue la séquence visuelle d'un effet dirigé vers une cible :
     * projection depuis le lanceur ou effet à l'emplacement de la cible, animation
     * de clignotement en cas de dégâts, effet et son d'esquive le cas échéant.
     *
     * @param {string}  effectFile  - Le chemin du fichier vidéo d'effet.
     * @param {object}  myToken     - Le token source (le lanceur).
     * @param {object}  target      - Le token cible.
     * @param {object}  cardContent - Le contenu (choix) de la carte jouée.
     * @param {boolean} isEvade     - True si la cible a esquivé l'effet.
     *
     * @returns {void}
     */
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

    /**
     * Ajoute à une séquence une animation de clignotement (fondu 0 → 1) répétée
     * sur un token, typiquement pour signaler l'encaissement de dégâts.
     *
     * @param {object} seq         - La séquence Sequencer à enrichir.
     * @param {object} token       - Le token sur lequel jouer le clignotement.
     * @param {number} fadeIn      - La durée du fondu (ms).
     * @param {number} [repeats=2] - Le nombre de clignotements.
     *
     * @returns {void}
     */
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

    /**
     * Construit et joue la séquence visuelle d'un effet centré sur le lanceur
     * lui-même (sans cible).
     *
     * @param {string} effectFile - Le chemin du fichier vidéo d'effet.
     * @param {object} myToken    - Le token source (le lanceur).
     *
     * @returns {void}
     */
    static _createSequenceForSelf(effectFile, myToken) {
        let seq = new Sequence().effect()
            .file(effectFile)
            .atLocation(myToken)
            .size(2, {gridUnits: true});
        seq.play();
    }

    /**
     * Joue un fichier audio seul (sans effet visuel), diffusé à tous les clients.
     *
     * @param {string} soundPath - Le chemin du fichier audio à jouer.
     *
     * @returns {void}
     */
    static _playAudioOnly(soundPath) {
        foundry.audio.AudioHelper.play({
            src: soundPath,
            volume: 0.5,
            autoplay: true,
            loop: false
        }, true);
    }

    /**
     * Retourne le chemin du fichier vidéo générique de dégâts, choisi selon la
     * portée (mêlée si `maxReach` ≤ 2, sinon distance) et le type de dégâts.
     *
     * @param {string} damageFormula - La formule de dégâts (non utilisée pour le choix, présente pour cohérence d'API).
     * @param {number} maxReach      - La portée maximale de l'effet.
     * @param {string} typeEffect    - Le type de dégâts (acid, fire, cold…).
     *
     * @returns {string} Le chemin du fichier vidéo générique correspondant.
     */
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

    /**
     * Détermine le chemin du son à jouer : son personnalisé s'il est fourni,
     * sinon un son aléatoire du dossier correspondant au type de dégâts, ou au
     * soin, ou null si aucun son ne s'applique.
     *
     * @param {string} damageFormula - La formule de dégâts (déclenche un son de dégâts si présente).
     * @param {string} healFormula   - La formule de soin (déclenche un son de soin si présente).
     * @param {string} customSound   - Un chemin de son personnalisé (relatif au dossier des sons).
     * @param {string} firstType     - Le type de dégâts, servant à choisir le sous-dossier de sons.
     *
     * @returns {Promise<string|null>} Le chemin du son à jouer, ou null si aucun.
     */
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
