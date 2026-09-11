import ResourceHandler from "../../domain/engine/shared/resource-handler.js";
import Damage from "../../domain/engine/roll/damage.js";
import HitProfile from "../../domain/engine/roll/hit-profile.js";
import RollReport, {ROLL_ROLE} from "../../domain/engine/roll/roll-report.js";
import ResultChatLog from "../../domain/engine/roll/result-chat-log.js";
import {presentResult} from "../../domain/engine/roll/result-presenter.js";
import {socket} from "./socketlib.hook.js";
import Constants from "../../domain/constants.js";
import Facing from "../../domain/engine/shared/facing.js";
import Fx from "../../domain/engine/shared/fx.js";
import TargetingPredicates from "../../domain/engine/shared/targeting-predicates.js";
import OpportunityAttack from "../../domain/engine/reaction/opportunity-attack.js";
import TradingCards, {DECK_TYPE, SPELLBOOK_TYPE} from "../../domain/trading/trading-cards.js";
import SpellbookWindow from "../../domain/interface/window/spellbook-window.js";
import {stripEditingContextOptions} from "../../domain/interface/sheet/sheet-play-mode.js";

/**
 * Types d'activité qui INFLIGENT des dégâts, et dont la résolution passe donc
 * par l'échelle de dégâts du moteur — jet pour toucher, esquive, critique.
 *
 * La sauvegarde en fait partie : son jet est celui de la CIBLE contre le DD de
 * l'activité, mais il se résout au même endroit et se lit dans la même fenêtre
 * qu'une attaque. L'exclure laisserait tous les sorts à sauvegarde hors du
 * moteur, avec leur propre message et sans demi-dégâts.
 *
 * @type {string[]}
 */
const DAMAGING_TYPES = Object.freeze(["attack", "damage", "save"]);

/**
 * Types d'activité dont le coût FQ est prélevé au JET DE DÉS (`rollDamageV2`),
 * et non à l'usage.
 *
 * La distinction est délibérée : pour un soin comme pour une activité qui
 * inflige des dégâts, le coût ne doit être payé qu'une fois tous les dés lancés
 * — un usage abandonné en cours de résolution ne coûte rien. Les autres types
 * d'activité n'atteignent jamais `rollDamageV2` : sans prélèvement à l'usage,
 * leur coût ne serait jamais payé et l'activité resterait indéfiniment jouable.
 *
 * Liste unique, partagée par les deux points de prélèvement : deux listes
 * jumelles finiraient par diverger, et la divergence se paierait en ressources
 * prélevées deux fois ou jamais.
 *
 * @type {string[]}
 */
const ROLL_CONSUMING_TYPES = Object.freeze(["heal", ...DAMAGING_TYPES]);

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
    if (!activity.actor && !ROLL_CONSUMING_TYPES.includes(activity.type)) {
        return true;
    }
};

/**
 * Prélève le coût FQ d'une activité qu'aucun jet de dés ne viendra facturer.
 *
 * Appelée sur les seuls chemins d'APPROBATION du garde d'usage, jamais sur un
 * refus : une activité écartée pour ciblage invalide ou ressources
 * insuffisantes ne coûte rien. Les types de `ROLL_CONSUMING_TYPES` sont laissés
 * à `rollDamageV2`, qui garde sa règle du prélèvement après les dés.
 *
 * @param {object} activity - L'activité dnd5e approuvée (`type`, `item`, `actor`).
 *
 * @returns {void}
 */
const consumeUnlessRolled = (activity) => {
    if (ROLL_CONSUMING_TYPES.includes(activity.type)) {
        return;
    }
    ResourceHandler.consumeResources(activity.item?.system?.fq, activity.actor);
};

/**
 * Portées d'une activité dnd5e converties dans l'unité du moteur (les cases) :
 * une portée exprimée en distance (`range.value`) part de la case adjacente,
 * une allonge de mêlée (`range.reach`) part de 0. Lecture unique partagée par
 * le garde de ciblage (`preUseActivity`) et la résolution des dégâts
 * (`rollDamageV2`), qui doivent voir exactement la même portée.
 *
 * @param {object} range - Le bloc `range` de l'activité (`value`, `reach`).
 *
 * @returns {{minReach: number, maxReach: number}} Les portées en cases.
 */
const activityReachInCases = (range, actor) => {
    const squareDistance = game.system.grid.distance;
    // Bonus de portée de l'ACTEUR QUI AGIT, jamais `Constants.rangeBonus` :
    // celui-ci lit le personnage de l'utilisateur courant, ce qui donnerait à
    // un PNJ joué par le MJ le bonus du personnage du MJ. Le bonus s'exprime en
    // cases et ne s'ajoute qu'à la portée MAXIMALE, comme partout ailleurs.
    const rawBonus = Number(actor?.system?.fq?.bonus?.range ?? 0);
    const bonus = Number.isFinite(rawBonus) ? rawBonus : 0;
    return {
        minReach: Math.trunc((range.value ? squareDistance : range.reach) ?? 0) / squareDistance,
        maxReach: (Math.trunc((range.value ?? range.reach) ?? 0) / squareDistance) + bonus
    };
};

/**
 * Indique si la résolution FQ prendra ce jet de dégâts en charge, et publiera donc
 * son propre message de résultat.
 *
 * Lecture unique, partagée par la suppression du message de dnd5e et par la
 * résolution elle-même : deux conditions jumelles finiraient par diverger, et la
 * divergence se paierait en jet muet — message supprimé sans rien pour le
 * remplacer — ou en message publié deux fois.
 *
 * @param {object} activity - L'activité dnd5e dont les dégâts sont jetés.
 *
 * @returns {boolean} True si le moteur FQ publiera le résultat de ce jet.
 */
const fqPublishesDamageRoll = (activity) => !!activity?.item?.actor
    && ROLL_CONSUMING_TYPES.includes(activity?.type);

// Sous « Limitation des droits du joueur », les menus contextuels des feuilles
// ne proposent plus ce que le mode jeu verrouillé interdit déjà : modifier,
// dupliquer ou supprimer un objet, un effet ou une activité.
Hooks.on("dnd5e.getItemContextOptions", (_item, menuItems) => stripEditingContextOptions(menuItems));
Hooks.on("dnd5e.getActiveEffectContextOptions", (_effect, menuItems) => stripEditingContextOptions(menuItems));
Hooks.on("dnd5e.getItemActivityContext", (_activity, _target, menuItems) => stripEditingContextOptions(menuItems));

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


Hooks.on("dnd5e.preUseActivity", (activity, _usageConfig, _dialogConfig, messageConfig) => {
    // Filter Activities
    if (notApplyFQOnActivity(activity)) {
        return true;
    }

    // Carte d'usage de dnd5e supprimée pour tout ce que le moteur résout : ses
    // boutons [Attaque], [Dégâts] et [Sauvegarde DD] rejoueraient à la main des
    // dés déjà lancés — le moteur a résolu l'activité d'un seul tenant, par
    // cible, et publie son propre message. Un usage refusé plus bas emporte
    // cette configuration avec lui, il n'y a donc rien à défaire.
    if (messageConfig && fqPublishesDamageRoll(activity)) {
        messageConfig.create = false;
    }

    if (OpportunityAttack.rememberContextFor(activity)) {
        return true;
    }

    if (!ResourceHandler.checkResources(activity.item.system?.fq, activity.actor)) {
        return false;
    }
    const {minReach: minRange, maxReach: maxRange} = activityReachInCases(activity.range, activity.actor);
    const itemNbTargets = ResourceHandler.determineNbTargets(activity.target);
    // Use on yourself
    if (!Constants.myTargets()?.length && minRange === 0) {
        consumeUnlessRolled(activity);
        TargetingPredicates.rememberTargetsFor(activity);
        return true;
    }

    const {verdict, outOfReach} = ResourceHandler.evaluateTargeting(activity.actor, itemNbTargets, minRange, maxRange);
    if (verdict === ResourceHandler.TARGETING_VERDICT.OK) {
        consumeUnlessRolled(activity);
        TargetingPredicates.rememberTargetsFor(activity);
        return true;
    }
    ResourceHandler.warnTargeting(activity.actor, {verdict, nbTargets: itemNbTargets, minReach: minRange, maxReach: maxRange, outOfReach});
    return false;

});

Hooks.on("dnd5e.postUseActivity", (activity) => {
    // dnd5e enchaîne seul sur le jet après l'usage (`_triggerSubsequentActions`)
    // pour une attaque, des dégâts ou un soin — mais PAS pour une sauvegarde,
    // qui attend un clic sur le bouton [Dégâts] de sa carte d'usage. Cette carte
    // n'étant plus publiée, le moteur déclenche le jet lui-même : sans quoi un
    // sort à sauvegarde ne se résoudrait jamais.
    if (activity?.type === "save" && fqPublishesDamageRoll(activity)) {
        activity.rollDamage({}, {configure: false});
    }
});

Hooks.on("dnd5e.preRollAttackV2", (config, _dialog, _message) => {
    // Le jet d'attaque de dnd5e est TOUJOURS écarté quand le moteur prend la
    // résolution en charge : ce n'est plus une option. dnd5e ne jette qu'UNE
    // fois pour toute la sélection, là où le moteur jette PAR CIBLE et présente
    // le résultat dans sa fenêtre, avec l'esquive et l'échelle de dégâts. Deux
    // jets d'attaque pour la même attaque n'auraient aucun sens.
    const activity = config.subject;
    if (!fqPublishesDamageRoll(activity)) {
        return true;
    }
    activity.rollDamage({}, {configure: false});
    return false;
});


Hooks.on("dnd5e.preRollDamageV2", (config, dialog, message) => {
    // Le message de dnd5e ferait doublon avec le message unique publié en fin de
    // résolution, qui porte déjà le détail de ces dés — et ses jets seraient
    // animés en 3D alors que le moteur affiche les siens dans sa propre fenêtre.
    if (!fqPublishesDamageRoll(config.subject)) {
        return true;
    }
    if (message) {
        message.create = false;
    }
    // Résolution d'un seul tenant : aucun dialogue de configuration ne
    // s'interpose entre le jeu de l'activité et son résultat.
    dialog.configure = false;
    return true;
});

Hooks.on("dnd5e.rollDamageV2", async (rolls, {subject}) => {
    const opportunity = OpportunityAttack.consumeContextFor(subject);
    const opportunityTarget = opportunity?.target ?? null;
    const item = subject.item;
    const {minReach, maxReach} = activityReachInCases(subject.range, subject.actor);

    const token = opportunity?.source ?? Constants.actorToken(subject.actor.id);
    if (!subject.item) {
        return;
    }

    if (!opportunityTarget && ROLL_CONSUMING_TYPES.includes(subject.type)) {
        ResourceHandler.consumeResources(item.system?.fq, subject.actor);
    }
    // Le profil de toucher de l'activité voyage avec le contenu, comme les
    // cibles imposées : c'est l'activité qui porte le modificateur d'attaque ou
    // le DD de sauvegarde, pas des champs de carte.
    let cardContent = {
        heal: 0, damage: 0, minReach, maxReach, bonusCrit: 0, bonusEva: 0,
        hitProfile: HitProfile.ofActivity(subject)
    };
    if (opportunityTarget) {
        cardContent.forcedTargets = [opportunityTarget];
    } else {
        // Sélection figée à l'usage (voir `TargetingPredicates#targetsByActivity`).
        // Une sélection vide n'est pas imposée : la résolution garde alors son
        // chemin normal, dont l'auto-ciblage d'un sort sans portée.
        const remembered = TargetingPredicates.consumeTargetsFor(subject);
        if (remembered?.length) {
            cardContent.forcedTargets = remembered;
        }
    }
    for (let roll of rolls) {
        if (item.actor) {
            let resultArray = [];
            const report = new RollReport();
            report.setHeader({
                actorName: item.actor?.name ?? null,
                cardName: item.name ?? null,
                // `opportunityTarget` n'est posé que par la résolution d'attaque
                // d'opportunité : sans cette mention, une AO serait indiscernable
                // d'une attaque ordinaire, dans la fenêtre comme dans le chat.
                tag: opportunityTarget
                    ? game.i18n.localize("FQCARDENGINE.ChatMessagePartOpportunityAttack") : null,
                targets: TargetingPredicates.resolveTargetLabels(cardContent, item.actor)
            });
            let fxType;
            let playFx = false;
            if (subject.type === "heal") {
                cardContent.heal = roll.formula;
                // Détail des dés relevé AVANT le jet de bonus : celui-ci repart du seul
                // total et n'a plus de dés, alors que ce sont ceux de dnd5e qu'il faut montrer.
                const rolled = {formula: roll.formula, dice: RollReport.diceOf(roll)};
                // Type relevé AVANT le jet de bonus, comme le détail des dés : ce jet
                // reconstruit ne repart que d'un total et a perdu les options de dnd5e,
                // dont le type de dégâts qui choisit les FX.
                fxType = roll.options?.type;
                const healBonus = item.actor.system?.fq?.bonus?.heal;
                if (healBonus) {
                    roll = await new Roll(Damage.getHealWithBonus(item.actor, roll.total)).evaluate();
                }
                report.setMainRoll({role: ROLL_ROLE.HEAL, ...rolled, total: roll.total, bonus: healBonus || null});
                resultArray.push(...await Damage.addCriticalToHeal(item.actor, roll.total, cardContent, report));
                playFx = true;
            } else if (DAMAGING_TYPES.includes(subject.type)) {
                cardContent.damage = roll.formula;
                const rolled = {formula: roll.formula, dice: RollReport.diceOf(roll)};
                fxType = roll.options?.type;
                // Les propriétés (magique, argenté…) sont relevées, comme le type,
                // AVANT le jet de bonus qui repart d'un simple total.
                const properties = [...(roll.options?.properties ?? [])];
                const damageBonus = item.actor.system?.fq?.bonus?.damage;
                if (damageBonus) {
                    roll = await new Roll(Damage.getDamageWithBonus(item.actor, roll.total)).evaluate();
                }
                report.setMainRoll({role: ROLL_ROLE.DAMAGE, ...rolled, total: roll.total, bonus: damageBonus || null});
                // Un jet d'activité dnd5e porte un seul type : ses dégâts, bonus
                // compris, sont de cet élément.
                resultArray.push(...await Damage.addCriticalEvasionToDamage(item.actor, roll.total, cardContent, report,
                    {types: fxType ? [fxType] : [], properties}));
                playFx = true;
            }
            // Cibles figées avant l'animation. `forcedTargets` en porte déjà la
            // plupart — sélection retenue à l'usage, cible d'une attaque
            // d'opportunité — mais pas le cas d'un sort sans portée, qui retombe
            // sur la sélection vivante : après plusieurs secondes d'affichage,
            // celle-ci n'est plus forcément celle qui a été frappée.
            const frozenTargets = cardContent.forcedTargets ?? Constants.myTargets();

            // Lancé avant l'animation, jamais attendu : la vidéo de l'effet se
            // charge pendant que les dés roulent, et démarre donc sans retard une
            // fois le résultat affiché.
            if (playFx) {
                Fx.preloadEffectAssets(cardContent, fxType);
            }

            // Le rapport est complet : on le montre, et RIEN ne change dans la
            // partie tant que le joueur ne l’a pas vu. Les FX et les points de vie
            // attendent la fin de l’animation.
            await presentResult(report);

            // Le jet d'attaque a eu lieu : les effets « à la prochaine attaque »
            // du lanceur et des cibles visées tombent (voir Damage.consumeAttackEffects).
            const consumption = Damage.attackConsumption(item.actor, report);
            if (consumption) {
                await socket.executeAsGM("consumeAttackEffects", ...consumption);
            }

            if (token && playFx) {
                await Fx.handleSpecialEffect(cardContent, resultArray, token, fxType, frozenTargets);
            }

            for (const res of resultArray) {
                await socket.executeAsGM("applyActorHpModification", res.targetTokenId, res.value, res.type);
            }

            // Orientation vers la cible : le token attaquant regarde ce qu'il
            // frappe. La première cible fait foi — une attaque de zone n'a pas
            // de direction unique, et suivre la première reste plus lisible que
            // ne pas bouger du tout.
            Facing.faceTarget(token, frozenTargets?.[0]);

            ResultChatLog.publish(item.actor, report);
            const {forcedTargets: _forcedTargets, hitProfile: _hitProfile, ...loggedContent} = cardContent;
            // Nom de carte null : une attaque dnd5e n'est pas une carte, et le journal
            // ne doit pas la faire reconnaître comme telle par les conditions de carte.
            await socket.executeAsGM("logCardPlayed", resultArray, loggedContent, item.actor.id,
                TargetingPredicates.resolveTargetActorIds(cardContent, item.actor), null);
        }
    }
});

/**
 * Identifiants utilisateur en attente d'ouverture automatique du grimoire
 * (LEVEL-04, D4-04) : un `Set`, jamais un scalaire, pour que deux advancements
 * entrelacés de deux utilisateurs différents n'effacent jamais l'attente l'un
 * de l'autre. Armé par le hook système d'avancement de dnd5e ci-dessous — un
 * hook système local au SEUL client qui a fait tourner l'`AdvancementManager`
 * jusqu'au bout, contrairement aux hooks de document CRUD (`updateItem`…)
 * rejoués sur chaque client connecté : c'est ce qui garantit que la fenêtre
 * ne s'ouvre jamais que chez le déclencheur, sans avoir besoin de comparer un
 * `userId` de socket. Consommé par le signal explicite de fin de rebuild émis
 * par `TradingCards.updateDeckWhenChange` une fois celui-ci réellement résolu :
 * un délai calé sur la durée du debounce serait non déterministe face aux
 * `await Cards.create`/`deleteDocuments` réseau qu'il enchaîne.
 *
 * @type {Set<string>}
 */
const pendingSpellbookOpens = new Set();

Hooks.on("dnd5e.advancementManagerComplete", (manager) => {
    const user = game.users.find(u => u.character?.id === manager.actor?.id);
    if (!user?.id) return;
    pendingSpellbookOpens.add(user.id);
});

Hooks.on("fq-card-engine.deckRebuilt", (userId) => {
    if (!pendingSpellbookOpens.has(userId)) return;
    pendingSpellbookOpens.delete(userId);

    // Sans avertissement : une reconstruction interrompue en a déjà émis un,
    // le joueur en recevrait un second pour la même cause.
    const spellBook = TradingCards.getFirstDeck(userId, SPELLBOOK_TYPE, false);
    const deck = TradingCards.getFirstDeck(userId, DECK_TYPE, false);
    if (spellBook && deck) {
        SpellbookWindow.open(spellBook, deck);
    }
});
