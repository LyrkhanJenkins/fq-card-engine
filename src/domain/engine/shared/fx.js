import TargetingPredicates from "./targeting-predicates.js";
import {socket} from "../../../hook/integration/socketlib.hook.js";
import {visualEffectData} from "../../system/fx/visualEffectData.js";
import PackUtils from "../../../core/utils/pack.utils.js";

/**
 * Utilitaires d'effets audiovisuels lors du jeu des cartes, s'appuyant sur le
 * module Sequencer et les macros avancées. Gère la sélection des fichiers vidéo
 * (dégâts, soin, buff, esquive, critique) et sonores, et la construction des
 * séquences visuelles vers soi, vers les cibles ou à l'emplacement d'une zone.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Fx {

    static SOUND_PATH = "modules/fq-card-engine/sounds/";

    /**
     * Identifiant du module qui fournit les effets visuels : la bibliothèque JB2A
     * n'est pas redistribuée ici, elle est installée par le joueur. Sans elle,
     * aucun fichier vidéo n'est jouable et les cartes se limitent au son et au
     * clignotement de dégâts.
     */
    static JB2A_MODULE_ID = "JB2A_DnD5e";

    /**
     * Opacité basse du clignotement de dégâts : le token est fortement estompé mais
     * jamais totalement invisible, pour qu'une animation interrompue ne puisse pas
     * le faire disparaître de la scène.
     */
    static BLINK_MIN_OPACITY = 0.15;

    /** Durée (ms) du retour à l'opacité pleine d'un battement de clignotement. */
    static BLINK_STEP_DURATION = 200;

    /** Marge (ms) au-delà du clignotement avant de forcer la restauration d'opacité. */
    static BLINK_SAFETY_MARGIN = 1500;

    /**
     * True si la bibliothèque JB2A est installée et active dans le monde.
     *
     * @returns {boolean}
     */
    static isJb2aAvailable() {
        return !!game.modules.get(Fx.JB2A_MODULE_ID)?.active;
    }

    /**
     * True si le chemin désigne un asset JB2A, qu'il s'agisse d'un chemin de
     * fichier (`modules/JB2A_DnD5e/…`) ou d'une clé de la base Sequencer que le
     * module publie (`jb2a.…`), sous n'importe quelle casse.
     *
     * @param {string} path - Le chemin ou la clé à tester.
     *
     * @returns {boolean}
     */
    static _isJb2aAsset(path) {
        return typeof path === "string" && path.toLowerCase().includes("jb2a");
    }

    /**
     * Filtre un fichier d'effet selon la présence de JB2A : le chemin est renvoyé
     * tel quel s'il est jouable, et `null` si c'est un asset JB2A alors que le
     * module est absent. Les appelants qui reçoivent `null` doivent simplement se
     * passer de visuel — le son et le clignotement, eux, restent joués.
     *
     * @param {string} path - Le chemin du fichier d'effet.
     *
     * @returns {string|null} Le chemin jouable, ou null.
     */
    static _availableFile(path) {
        return Fx._isJb2aAsset(path) && !Fx.isJb2aAvailable() ? null : path;
    }

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
            const compendium = await PackUtils.documentsFrom("macros-sequencer");
            const persistAura = compendium.find(macro => macro.name === macroName);
            await Macro.create(persistAura);
        }
    }

    /**
     * Point d'entrée de la restitution audiovisuelle d'un effet de carte : joue
     * les effets Sequencer (si le module est actif) et le son associé.
     *
     * À défaut de cibles imposées, elles sont résolues par
     * `TargetingPredicates.resolveTargets`, la même résolution que celle des dégâts
     * et du log. Un appelant qui les a figées plus tôt DOIT les passer : la
     * résolution d'une carte attend la fin de l'animation du résultat avant de
     * jouer ses FX, et relire la sélection à cet instant, c'est lire ce qu'elle est
     * devenue pendant ces quelques secondes — pas ce que la carte a frappé.
     *
     * @param {object}   cardContent - Le contenu (choix) de la carte jouée.
     * @param {object[]} resultArray - Les résultats de l'effet (dégâts, critiques, esquives…).
     * @param {object}   myToken     - Le token source (le lanceur).
     * @param {string}   typeEffect  - Le type d'effet/dégâts (fire, cold…) pilotant le visuel/son.
     * @param {object[]} [targets]   - Les cibles figées, à défaut résolues à l'appel.
     *
     * @returns {Promise<void>}
     */
    static async handleSpecialEffect(cardContent, resultArray, myToken, typeEffect,
        targets = TargetingPredicates.resolveTargets(cardContent, myToken?.actor)) {
        const soundPath = await Fx.getSoundEffectPath(cardContent.damage, cardContent.heal, cardContent.sound, typeEffect);

        if (game.modules.get("sequencer")?.active) {
            Fx._handleSequencerEffects(cardContent, myToken, targets, resultArray, typeEffect);
        }

        if (soundPath) {
            setTimeout(_ => {
                Fx._playAudioOnly(soundPath);
            }, 200);
        }
    }

    /**
     * Met en cache, chez tous les clients, le fichier visuel que l'effet jouera.
     *
     * À appeler AVANT l'affichage du résultat : sa mise en scène dure plusieurs
     * secondes, largement de quoi charger la vidéo. Sans ce préchargement, elle
     * n'est cherchée qu'au moment de la jouer et démarre donc en retard, tandis
     * que le son, lui, part sur un délai fixe — d'où un son qui précède son image.
     *
     * Sans effet si Sequencer est absent : c'est lui qui joue et qui met en cache.
     * L'échec du préchargement est sans conséquence — le fichier sera simplement
     * chargé au moment de jouer, comme avant.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {string} typeEffect  - Le type d'effet/dégâts pilotant le fichier visuel.
     *
     * @returns {void}
     */
    static preloadEffectAssets(cardContent, typeEffect) {
        if (!game.modules.get("sequencer")?.active) {
            return;
        }
        try {
            const effectFile = Fx._getEffectFile(cardContent, typeEffect);
            if (effectFile) {
                // Volontairement non attendu : le préchargement accompagne
                // l'animation, il ne doit pas la retarder.
                Sequencer.Preloader.preloadForClients(effectFile);
            }
        } catch (error) {
            console.error(error);
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
        const effectFile = Fx._getEffectFile(cardContent, typeEffect);
        const criticalFile = Fx._availableFile(visualEffectData.generics.other.critical);
        const hasTargets = targets.length > 0;

        [...resultArray].forEach((result) => {
            if (result.critical && criticalFile) {
                new Sequence().effect().file(criticalFile).atLocation(myToken)
                    .size(2.5, {gridUnits: true}).play();
            }
        });

        if (cardContent.zonePlacement) {
            if (effectFile) {
                Fx._createSequenceForZone(effectFile, cardContent.zonePlacement);
            }
            targets.forEach(target => {
                Fx._createTargetFeedback(target, cardContent, [...resultArray].find(res => res.targetTokenId === target.id)?.evasion);
            });
        } else if (hasTargets && cardContent.maxReach) {
            targets.forEach(target => {
                const isEvade = [...resultArray].find(res => res.targetTokenId === target.id)?.evasion;
                if (effectFile) {
                    Fx._createSequenceForTarget(effectFile, myToken, target, cardContent, isEvade);
                } else {
                    // Sans JB2A, il ne reste que le retour visuel propre à la cible.
                    Fx._createTargetFeedback(target, cardContent, isEvade);
                }
            });
        } else if (effectFile) {
            Fx._createSequenceForSelf(effectFile, myToken);
        }
    }

    /**
     * Construit et joue la séquence visuelle unique d'un effet de zone, à
     * l'emplacement et aux dimensions de la zone posée (géométrie précalculée
     * par `ZoneTargeting.buildPlacementFx`) : cercle et rectangle à l'échelle de
     * la forme, cône et ligne étirés vers leur point d'arrivée.
     *
     * @param {string} effectFile - Le chemin du fichier vidéo d'effet.
     * @param {object} placement  - La géométrie de la zone (`{type, x, y, ...}`).
     *
     * @returns {void}
     */
    static _createSequenceForZone(effectFile, placement) {
        const seq = new Sequence().effect().file(effectFile).atLocation({x: placement.x, y: placement.y});

        if (placement.type === "cone" || placement.type === "line") {
            seq.stretchTo({x: placement.endX, y: placement.endY});
        } else if (placement.type === "rectangle") {
            seq.size({width: placement.width, height: placement.height}, {gridUnits: true});
            if (placement.rotation) {
                // Sequencer tourne en sens antihoraire, Foundry en sens horaire.
                seq.rotate(-placement.rotation);
            }
        } else {
            seq.size(placement.size, {gridUnits: true});
        }
        seq.play();
    }

    /**
     * Joue le retour visuel individuel d'une cible couverte par une zone :
     * clignotement si elle encaisse des dégâts, effet et son d'esquive sinon.
     * Le visuel du sort lui-même est porté par la séquence de zone, pas par la cible.
     *
     * @param {object}  target      - Le token cible.
     * @param {object}  cardContent - Le contenu (choix) de la carte jouée.
     * @param {boolean} isEvade     - True si la cible a esquivé l'effet.
     *
     * @returns {void}
     */
    static _createTargetFeedback(target, cardContent, isEvade) {
        if (!isEvade && !cardContent.damage) {
            return;
        }
        const seq = new Sequence();
        Fx.#appendTargetOutcome(seq, target, cardContent, isEvade);
        seq.play();
    }

    /**
     * Ajoute à une séquence le retour visuel individuel d'une cible : clignotement
     * si elle encaisse des dégâts, effet et son d'esquive sinon. Partagé entre le
     * ciblage direct et le ciblage de zone, qui ne diffèrent que par la façon dont
     * l'effet du sort lui-même est positionné.
     *
     * @param {object}  seq         - La séquence Sequencer à enrichir.
     * @param {object}  target      - Le token cible.
     * @param {object}  cardContent - Le contenu (choix) de la carte jouée.
     * @param {boolean} isEvade     - True si la cible a esquivé l'effet.
     *
     * @returns {void}
     */
    static #appendTargetOutcome(seq, target, cardContent, isEvade) {
        if (cardContent.damage && !isEvade) {
            Fx.getBlinkAnimation(seq, target, 100, 8);
        }
        if (isEvade) {
            const evasionFile = Fx._availableFile(visualEffectData.generics.other.evasion);
            if (evasionFile) {
                seq.effect().file(evasionFile).atLocation(target).size(2.5, {gridUnits: true});
            }
            seq.sound().file(this.SOUND_PATH + "evasion/1.mp3");
        }
    }

    /**
     * Détermine le fichier vidéo d'effet à jouer selon le contenu de la carte :
     * visuel personnalisé, soin, dégâts génériques, ou buff par défaut.
     *
     * Les visuels génériques vivent tous dans JB2A : sans ce module, il n'y a
     * plus de repli local et la méthode renvoie `null` plutôt qu'un chemin
     * introuvable. Seul un visuel personnalisé étranger à JB2A reste jouable.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {string} typeEffect  - Le type d'effet/dégâts pilotant le fichier générique.
     *
     * @returns {string|null} Le chemin du fichier vidéo d'effet à jouer, ou null.
     */
    static _getEffectFile(cardContent, typeEffect) {
        return Fx._availableFile(Fx._resolveEffectFile(cardContent, typeEffect));
    }

    /**
     * Choisit le fichier d'effet correspondant au contenu de la carte, sans se
     * soucier de sa disponibilité : visuel personnalisé, soin, dégâts génériques,
     * ou buff par défaut.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {string} typeEffect  - Le type d'effet/dégâts pilotant le fichier générique.
     *
     * @returns {string} Le chemin du fichier vidéo d'effet retenu.
     */
    static _resolveEffectFile(cardContent, typeEffect) {
        if (cardContent.visual?.path) {
            return cardContent.visual.path;
        } else if (cardContent.heal) {
            return visualEffectData.generics.other.heal;
        } else if (cardContent.damage) {
            return Fx.getDamageGenericEffectPath(cardContent.damage, cardContent.maxReach, typeEffect);
        } else {
            return visualEffectData.generics.other.buff;
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

        Fx.#appendTargetOutcome(seq, target, cardContent, isEvade);
        seq.play();
    }

    /**
     * Ajoute à une séquence une animation de clignotement (fondu bas → plein)
     * répétée sur un token, typiquement pour signaler l'encaissement de dégâts.
     *
     * Le clignotement descend jusqu'à {@link Fx.BLINK_MIN_OPACITY} et non jusqu'à
     * zéro, et un filet de sécurité restaure l'opacité pleine même si la séquence
     * n'atteint jamais sa fin : une animation Sequencer sur l'alpha d'un token peut
     * être annulée par une autre séquence lancée sur le même token (enchaînements
     * rapides de dégâts), auquel cas le `waitUntilFinished` qui suit ne se résout
     * plus et le token resterait estompé indéfiniment.
     *
     * @param {object} seq         - La séquence Sequencer à enrichir.
     * @param {object} token       - Le token sur lequel jouer le clignotement.
     * @param {number} fadeIn      - La durée du fondu (ms).
     * @param {number} [repeats=2] - Le nombre de clignotements.
     *
     * @returns {void}
     */
    static getBlinkAnimation(seq, token, fadeIn, repeats = 2) {
        const blinkDuration = repeats * (fadeIn + Fx.BLINK_STEP_DURATION);
        let safetyTimeout = null;

        seq.thenDo(() => {
            safetyTimeout = setTimeout(() => Fx.restoreTokenOpacity(token), blinkDuration + Fx.BLINK_SAFETY_MARGIN);
        });

        for (let i = 0; i < repeats; i++) {
            seq.animation()
                .on(token)
                .fadeIn(fadeIn)
                .opacity(Fx.BLINK_MIN_OPACITY)
                .waitUntilFinished()
                .animation()
                .duration(Fx.BLINK_STEP_DURATION)
                .on(token)
                .fadeIn(fadeIn)
                .opacity(1)
                .waitUntilFinished();
        }

        seq.thenDo(() => {
            clearTimeout(safetyTimeout);
            Fx.restoreTokenOpacity(token);
        });
    }

    /**
     * Redonne son opacité pleine à un token, indépendamment de Sequencer. Sert de
     * filet de sécurité au clignotement : un token dont l'animation a été interrompue
     * ne doit jamais rester estompé sur la scène.
     *
     * @param {object} token - Le token (placeable ou document) à restaurer.
     *
     * @returns {void}
     */
    static restoreTokenOpacity(token) {
        const placeable = token?.object ?? token;
        if (!placeable || placeable.destroyed) {
            return;
        }
        if (typeof placeable.alpha === "number") {
            placeable.alpha = 1;
        }
        if (placeable.mesh && !placeable.mesh.destroyed) {
            placeable.mesh.alpha = 1;
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
        const category = maxReach > 2 ? visualEffectData.generics.range : visualEffectData.generics.melee;
        return category[typeEffect ?? "default"];
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
