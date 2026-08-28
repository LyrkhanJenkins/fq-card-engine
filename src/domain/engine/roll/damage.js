import Constants, {
    buildDiceAppearance,
    CRITICAL_COLOR,
    CRITICAL_DICE_APPEARANCE,
    CRITICAL_HEAL_COLOR,
    DAMAGES_COLOR,
    EVASION_COLOR,
    EVASION_DICE_APPEARANCE,
    FAIL_COLOR,
    HEAL_COLOR,
    SUCCESS_COLOR
} from "../../constants.js";
import Geometry from "../shared/geometry.js";
import TargetingPredicates from "../shared/targeting-predicates.js";

/**
 * Utilitaires de calcul et d'application des dégâts et des soins FQ : jets de dés
 * avec bonus, gestion des critiques et esquives, affichage des résultats, et
 * application des modifications de points de vie et effets sur les cibles.
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
     * @param {Promise[]} [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice (affichage simultané).
     *
     * @returns {Promise<object[]>} Le tableau des résultats de dégâts par cible.
     */
    static async buildDamageDiceLauncher(actor, cardContent, dsnAnimations = []) {
        let damageFormula = Damage.getDamageWithBonus(actor, cardContent.damage);
        let damages = await Damage.rollWithSuccessValueResultAsync(actor, damageFormula, {
            color: DAMAGES_COLOR,
            title: "Dégâts"
        }, dsnAnimations);
        return Damage.addCriticalEvasionToDamage(actor, damages, cardContent, dsnAnimations);
    }

    /**
     * Lance le jet de soins d'une carte : applique le bonus de soin de l'acteur,
     * effectue le jet, puis calcule les critiques de soin par cible.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {object} cardContent - Le contenu (choix) de la carte (`heal`, `bonusCrit`, `targetType`).
     * @param {Promise[]} [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice (affichage simultané).
     *
     * @returns {Promise<object[]>} Le tableau des résultats de soins par cible.
     */
    static async buildHealDiceLauncher(actor, cardContent, dsnAnimations = []) {
        let healFormula = Damage.getHealWithBonus(actor, cardContent.heal);
        let heal = await Damage.rollWithSuccessValueResultAsync(actor, healFormula,
            {
                color: HEAL_COLOR,
                title: "Soins"
            }, dsnAnimations);
        return Damage.addCriticalToHeal(actor, heal, cardContent, dsnAnimations);
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
     * @param {Promise[]} [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice (affichage simultané).
     *
     * @returns {Promise<object[]>} Le tableau des résultats de soin par cible.
     */
    static async addCriticalToHeal(actor, heal, cardContent, dsnAnimations = []) {
        if (heal < 0) {
            heal = 0;
        }
        let healArray = [];
        const critical = await Damage.#rollCritical(actor, cardContent,
            {color: CRITICAL_HEAL_COLOR, title: "Critique des soins"}, dsnAnimations);
        TargetingPredicates.resolveTargets(cardContent, actor).forEach(target => {
            healArray.push({
                key: `Soins totaux sur "${target.document?.name ?? target.name}"`,
                value: critical ? heal * 2 : heal,
                type: "healFQ",
                critical,
                targetTokenId: target.id
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
     * @param {Promise[]} [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice (affichage simultané).
     *
     * @returns {Promise<object[]>} Le tableau des résultats de dégâts par cible.
     */
    static async addCriticalEvasionToDamage(actor, damages, cardContent, dsnAnimations = []) {
        const myTargets = TargetingPredicates.resolveTargets(cardContent, actor);
        if (damages < 0) {
            damages = 0;
        }
        let damagesArray = [];
        const critical = await Damage.#rollCritical(actor, cardContent,
            {color: CRITICAL_COLOR, title: "Critique"}, dsnAnimations);
        for (let i = 0; i < myTargets.length; i++) {
            const target = myTargets[i];
            const targetActor = target.actor;
            let evaToReach = 21;
            let evasionScore = 0;

            if (targetActor?._id !== actor?._id // no evasion is possible if self targeting
            ) {
                if (targetActor?.system?.fq?.attributes.evasion + cardContent.bonusEva > 0) { // or no evasion from the target
                    evaToReach = 21 - targetActor?.system?.fq?.attributes.evasion - cardContent.bonusEva;
                    evasionScore = await Damage.rollWithSuccessValueResultAsync(actor, "1d20", {
                        color: EVASION_COLOR, title: `Esquive de "${target.document?.name ?? target.name}"`,
                        success: evaToReach,
                        appearance: EVASION_DICE_APPEARANCE // dé bleu pour l'esquive
                    }, dsnAnimations);
                }
                const evaded = evasionScore >= evaToReach;
                damagesArray.push({
                    key: `Dégâts totaux sur "${target.document?.name ?? target.name}"`,
                    // Le critique passe outre l'esquive (sans doubler) ; sinon esquive = 0.
                    value: evaded ? (critical ? damages : 0) : (critical ? damages * 2 : damages),
                    critical,
                    evasion: evaded,
                    type: "damageFQ",
                    targetTokenId: target.id
                });
            }
        }
        return damagesArray;
    }

    /**
     * Jette le critique du lanceur (1d20 contre `21 - critique - bonusCrit`)
     * avec l'apparence de dé critique. Aucun jet si le score total est nul.
     *
     * @param {object} actor       - L'acteur lanceur.
     * @param {object} cardContent - Le contenu (choix) de la carte (`bonusCrit`).
     * @param {{color: string, title: string}} display - Couleur et titre du jet.
     * @param {Promise[]} dsnAnimations - Collecteur des promesses d'animations Dice So Nice.
     *
     * @returns {Promise<boolean>} True si le jet atteint le seuil de critique.
     */
    static async #rollCritical(actor, cardContent, {color, title}, dsnAnimations) {
        if (!(actor?.system?.fq.attributes.critical + cardContent.bonusCrit > 0)) {
            return false;
        }
        const critToReach = 21 - actor?.system?.fq.attributes.critical - cardContent.bonusCrit;
        return await Damage.rollWithSuccessValueResultAsync(actor, "1d20", {
            color, title,
            success: critToReach,
            appearance: CRITICAL_DICE_APPEARANCE // dé rouge pour le critique
        }, dsnAnimations) >= critToReach;
    }

    /**
     * Construit l'apparence Dice So Nice des dés « ordinaires » du module (dégâts,
     * soins…) à partir de la couleur du joueur courant dans Foundry
     * (`game.user.color`). Comme le critique et l'esquive, on force le préréglage
     * standard pour que la couleur s'affiche de façon fiable ; seule la couleur de
     * fond change. Poser une apparence explicite sur chaque dé évite aussi toute
     * fuite de couleur entre jets lors de l'affichage simultané.
     *
     * @returns {object|undefined} L'apparence basée sur la couleur du joueur, ou undefined si indisponible.
     */
    static getPlayerDiceAppearance() {
        const color = game.user?.color?.css ?? game.user?.color;
        return color ? buildDiceAppearance(color) : undefined;
    }

    /**
     * Applique une apparence Dice So Nice sur CHAQUE dé d'un jet (avant `toMessage`).
     * À utiliser sur tous les jets visibles du module pour garantir la couleur et
     * éviter toute fuite entre jets lors de l'affichage simultané. Par défaut,
     * utilise la couleur du joueur ; passer une `appearance` pour forcer une couleur
     * spécifique (ex. critique = rouge, esquive = bleu).
     *
     * @param {Roll}   roll                                        - Le jet déjà évalué.
     * @param {object} [appearance=Damage.getPlayerDiceAppearance()] - L'apparence à poser.
     *
     * @returns {void}
     */
    static applyDiceAppearance(roll, appearance = Damage.getPlayerDiceAppearance()) {
        if (!appearance || !roll?.dice) {
            return;
        }
        for (const die of roll.dice) {
            die.options.appearance = appearance;
        }
    }

    /**
     * Effectue un jet de dés, publie le résultat dans le chat (avec titre et
     * couleur, et éventuellement un libellé SUCCÈS/échec selon un seuil), attend
     * l'animation Dice So Nice si présente, puis retourne le total du jet.
     *
     * @param {object} actor           - L'acteur à qui attribuer le message.
     * @param {string} formula         - La formule de jet (ex. « 1d20 », « 2d6+3 »).
     * @param {object} options         - Les options d'affichage du jet.
     * @param {string} options.color   - La couleur du titre.
     * @param {string} options.title   - Le titre affiché.
     * @param {number} [options.success] - Le seuil de succès ; si fourni, affiche SUCCÈS/échec.
     * @param {object} [options.appearance] - Apparence DSN forcée pour ce jet (ex. critique/esquive) ;
     *        si absente, l'apparence du joueur est réappliquée explicitement.
     * @param {Promise[]} [dsnAnimations=[]] - Collecteur des promesses d'animations Dice So Nice :
     *        la promesse de ce jet y est empilée (au lieu d'être attendue) pour un affichage
     *        simultané ; l'appelant attend l'ensemble via `Promise.all` au bon moment.
     *
     * @returns {Promise<number>} Le total du jet.
     */
    static async rollWithSuccessValueResultAsync(actor, formula, options, dsnAnimations = []) {
        const roll = await new Roll(formula).evaluate();

        // Apparence explicite sur chaque dé : critique/esquive = couleur forcée
        // (options.appearance), sinon couleur du joueur. Évite toute fuite en affichage simultané.
        Damage.applyDiceAppearance(roll, options.appearance);
        // Entête discrète : ces jets ne sont que des étapes intermédiaires, le
        // récapitulatif final (`displayResult`) doit rester le message dominant du chat.
        let message = `<div class="fq-roll-flavor" style="color: ${options.color}">`
            + `<span class="fq-roll-flavor-title">${options.title}</span>`;

        if (options.success != null && roll.total >= options.success) {
            message += `<span class="fq-roll-outcome" style="color: ${SUCCESS_COLOR};">SUCCÈS !</span>`;
        } else if (options.success != null) {
            message += `<span class="fq-roll-outcome" style="color: ${FAIL_COLOR};">échec...</span>`;
        }

        message += `</div>`;

        // Send chat message
        const msg = await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor}),
            flavor: message
        });

        // On N'ATTEND PAS l'animation ici : on empile la promesse dans le collecteur
        // fourni pour que tous les dés du même jet partent simultanément. L'appelant
        // attendra l'ensemble (Promise.all) avant d'appliquer les PV / d'afficher le
        // récap. `roll.total` est déjà disponible après evaluate(), donc la logique
        // métier (critique, esquive…) peut s'enchaîner immédiatement sans attente visuelle.
        if (game.dice3d && roll.isDeterministic === false) {
            dsnAnimations.push(game.dice3d.waitFor3DAnimationByMessageID(msg.id));
        }
        return roll.total;
    }


    //Display damage dices and manual actions
    /**
     * Publie dans le chat un récapitulatif des résultats de l'effet (dégâts/soins
     * par cible) et, le cas échéant, la liste des actions manuelles à effectuer.
     *
     * @param {object}        actor         - L'acteur à qui attribuer le message.
     * @param {object[]}      resultArray   - Les résultats à afficher (`key`, `value`).
     * @param {string[]|null} manualActions - Les actions manuelles à lister, ou null.
     *
     * @returns {void}
     */
    static displayResult(actor, resultArray, manualActions) {
        if (resultArray.length > 0 || manualActions?.length > 0) {
            let message = `<div class="fq-card-engine-result">`;
            if (resultArray.length !== 0) {
                message += `<div class="fq-card-engine-result-title">${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardResult")}</div>`;
                message += `<ul class="fq-card-engine-result-list">`;
                resultArray.forEach(result => {
                    const modifier = result.type === "healFQ" ? "fq-result--heal"
                        : result.type === "damageFQ" ? "fq-result--damage" : "";
                    let badges = "";
                    if (result.critical) {
                        badges += `<span class="fq-result-badge fq-result-badge--crit">${game.i18n.localize("FQCARDENGINE.ChatMessagePartCritical")}</span>`;
                    }
                    if (result.evasion) {
                        badges += `<span class="fq-result-badge fq-result-badge--eva">${game.i18n.localize("FQCARDENGINE.ChatMessagePartEvasion")}</span>`;
                    }
                    message += `<li class="fq-card-engine-result-line ${modifier}">`
                        + `<span class="fq-result-key">${result.key}</span>`
                        + `<span class="fq-result-value"><b>${result.value}</b>${badges}</span>`
                        + `</li>`;
                });
                message += `</ul>`;
            }
            if (manualActions && manualActions.length > 0) {
                message += `<div class="fq-card-engine-result-subtitle">${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardOtherEffect")}</div>`;
                message += `<ul class="fq-card-engine-result-manual">`;
                manualActions.forEach(manualAction => message += `<li>${manualAction}</li>`);
                message += `</ul>`;
            }
            message += `</div>`;
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}),
                content: message
            });
        }
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
     *
     * @returns {Promise<void>}
     */
    static async createActorFromData(actorData, currentUserId, location) {
        const currentUser = game.users.get(currentUserId);
        await Actor.create(actorData).then(async newActor => {
            // Ajouter le jeton à la scène active
            const scene = game.scenes.active;

            const tokenData = {
                ...newActor.prototypeToken,
                actorId: newActor._id,
                effects: [],
                x: Geometry.getXAdjacentLocation(Constants.actorToken(currentUser?.character?.id), location),
                y: Geometry.getYAdjacentLocation(Constants.actorToken(currentUser?.character?.id), location)
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
