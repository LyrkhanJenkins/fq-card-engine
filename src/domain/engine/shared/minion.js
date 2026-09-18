import RollService from "../roll/roll-service.js";
import Geometry from "./geometry.js";
import TargetingPredicates from "./targeting-predicates.js";
import Constants, {DEFAULT_MAX_ZEAL} from "../../constants.js";
import CardFqSystem from "../../system/cards/card-fq-system.mjs";
import {socket} from "../../../hook/integration/socketlib.hook.js";

/**
 * Service de gestion des sbires (minions) : création de l'acteur et de son token
 * à partir du compendium, dossier temporaire dédié et comptage des emplacements
 * d'apparition sélectionnés.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Minion {


    /**
     * Crée un sbire (minion) : s'assure de l'existence du dossier temporaire
     * (créé côté MJ si besoin), puis prépare et instancie l'acteur.
     *
     * @param {object} minion   - Les données du sbire à créer.
     * @param {string} location - La direction d'apparition adjacente (« left », « right », « up », « down »).
     *
     * @returns {Promise<void>}
     */
    static async createActor(minion, location) {
        if (!Minion.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        await Minion.createActorData(minion, location);

    }

    /**
     * Les cases (coins supérieurs-gauches, en pixels) couvertes par une zone
     * posée, dans l'ordre de lecture depuis son coin d'origine.
     *
     * Seul le rectangle se découpe en cases entières : c'est la forme qui porte
     * des dimensions en cases (`width`/`height`). Toute autre forme n'offre, pour
     * l'invocation, que sa case d'origine — un cercle ou un cône ne dit pas
     * lesquelles de ses cases accueilleraient un sbire.
     *
     * @param {object} [zonePlacement] - La géométrie de la zone posée.
     *
     * @returns {{x: number, y: number}[]} Les cases disponibles (vide sans zone exploitable).
     */
    static zoneSquares(zonePlacement) {
        const {originX, originY, type, width, height} = zonePlacement ?? {};
        if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
            return [];
        }
        const gridSize = game.canvas?.scene?.dimensions?.size || 100;
        const cols = type === "rectangle" ? Math.max(1, Math.round(width ?? 1)) : 1;
        const rows = type === "rectangle" ? Math.max(1, Math.round(height ?? 1)) : 1;
        const squares = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                squares.push({x: originX + (col * gridSize), y: originY + (row * gridSize)});
            }
        }
        return squares;
    }

    /**
     * Les cases de la zone posée déjà occupées par un token.
     *
     * Un sbire ne se pose JAMAIS sur un jeton existant : c'est la contrepartie,
     * pour l'invocation en zone, de l'exclusion des directions occupées dans
     * l'invocation au contact.
     *
     * @param {object} [zonePlacement] - La géométrie de la zone posée.
     *
     * @returns {{x: number, y: number}[]} Les cases occupées de la zone.
     */
    static occupiedZoneSquares(zonePlacement) {
        return Minion.zoneSquares(zonePlacement).filter(square => Geometry.squareIsOccupied(square));
    }

    /**
     * Crée les sbires sur les cases de la zone posée, plutôt qu'à côté du lanceur :
     * un sbire par case, dans l'ordre de lecture, jusqu'à épuisement des sbires
     * déclarés ou des cases de la zone.
     *
     * Sans géométrie de zone exploitable — la carte a été jouée sans pose, ou la
     * pose a été annulée — aucun sbire n'est créé : mieux vaut pas de sbire qu'un
     * sbire aux pieds du lanceur, à l'opposé de ce que la carte annonce.
     *
     * @param {object[]} [minions]      - Les sbires déclarés par le choix.
     * @param {object} [zonePlacement]  - La géométrie de la zone posée (`originX`/`originY`, dimensions).
     *
     * @returns {Promise<number>} Le nombre de sbires effectivement demandés.
     */
    static async createActorsOnZone(minions, zonePlacement) {
        const squares = Minion.zoneSquares(zonePlacement);
        const toCreate = (minions ?? []).filter(Boolean).slice(0, squares.length);
        if (!toCreate.length) {
            return 0;
        }
        if (!Minion.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }
        for (let i = 0; i < toCreate.length; i++) {
            await Minion.createActorData(toCreate[i], null, squares[i]);
        }
        return toCreate.length;
    }

    /**
     * Construit les données d'un sbire à partir du compendium des sbires, applique
     * les surcharges éventuelles (PV, critique, esquive, action, mana, zèle,
     * bonus, déplacement), attribue la propriété au joueur, puis délègue la
     * création de l'acteur et de son token au MJ via socket.
     *
     * Un sbire de type fantôme ne vient PAS du compendium : sa source est la cible
     * visée, et sa création part sur {@link Minion.createGhostActorData}.
     *
     * @param {object} minion     - Les données du sbire (`name`, `data`…).
     * @param {string} location   - La direction d'apparition adjacente.
     * @param {object} [position] - La position absolue (px) où poser le sbire ;
     *                              à défaut, la case adjacente au lanceur.
     *
     * @returns {Promise<void>}
     */
    static async createActorData(minion, location, position) {
        // Le fantôme ne vient pas du compendium : sa source est la cible visée.
        if (CardFqSystem.isGhostType(minion?.type)) {
            return Minion.createGhostActorData(minion);
        }

        const minionPack = await game.packs.get(FqCardEngineModule.moduleName + ".minions-fq8").getDocuments();

        const foundMinion = minionPack.find(m => m.name === minion?.name);

        if (foundMinion) {
            let actorData = JSON.parse(JSON.stringify(foundMinion));
            actorData.folder = Minion.getTempActorFolder().id;
            actorData.name = actorData.name + "_" + Math.floor(Math.random() * 1000000);
            Minion.applyStatOverrides(actorData, minion);
            Minion.stampSummoner(actorData, minion);

            await socket.executeAsGM("createActorFromData", actorData, game.userId, location, position,
                Minion.summonedInitiative(Constants.myId));
        }
    }

    /**
     * Applique à des données d'acteur les surcharges de caractéristiques déclarées
     * par le choix de carte (PV, bonus de dégâts, déplacement, critique, esquive,
     * action, mana, zèle, bonus de soin), augmentées des bonus d'invocation gagnés
     * en combat pour le type de sbire.
     *
     * Partagée par les deux sources d'invocation — le compendium des sbires et la
     * copie d'une cible (fantôme) — pour qu'un `damageBonus` déclaré sur une carte
     * produise le même effet, quelle que soit l'origine de la créature.
     *
     * @param {object} actorData - Les données d'acteur à modifier EN PLACE.
     * @param {object} minion    - Les données du sbire déclarées par le choix.
     *
     * @returns {void}
     */
    static applyStatOverrides(actorData, minion) {
        // Les bonus gagnés en combat s'ajoutent aux surcharges déclarées par la
        // carte, et s'appliquent même si la carte ne surcharge pas la
        // caractéristique : la base est alors celle de la source.
        const bonus = Minion.statBonus(minion?.type);
        if (minion?.data?.hp || bonus.hp) {
            // Un seul jet pour le maximum ET la valeur courante : une formule à dés
            // donnerait sinon deux totaux différents, et le sbire naîtrait blessé.
            const hp = Number(minion.data?.hp
                ? RollService.rollResultSync(minion.data.hp)
                : actorData.system.attributes.hp.max) + bonus.hp;
            actorData.system.attributes.hp.max = hp;
            actorData.system.attributes.hp.value = hp;
        }
        if (minion?.data?.damageBonus || bonus.damageBonus) {
            actorData.system.fq.bonus.damage = Number(minion.data?.damageBonus
                ? RollService.rollResultSync(minion.data.damageBonus)
                : actorData.system.fq.bonus.damage) + bonus.damageBonus;
        }
        if (minion?.data?.movement || bonus.movement) {
            const speeds = actorData.system.attributes.movement.speeds;
            speeds.walk = Number(minion.data?.movement
                ? RollService.rollResultSync(minion.data.movement)
                : speeds.walk) + bonus.movement;
        }
        if (minion?.data) {
            if (minion.data.critical) {
                actorData.system.fq.attributes.critical = RollService.rollResultSync(minion.data.critical);
            }
            if (minion.data.evasion) {
                actorData.system.fq.attributes.evasion = RollService.rollResultSync(minion.data.evasion);
            }
            if (minion.data.action) {
                actorData.system.fq.action.max = RollService.rollResultSync(minion.data.action);
                actorData.system.fq.action.value = RollService.rollResultSync(minion.data.action);
            }
            if (minion.data.mana) {
                actorData.system.fq.mana.max = RollService.rollResultSync(minion.data.mana);
                actorData.system.fq.mana.value = RollService.rollResultSync(minion.data.mana);
            }
            if (minion.data.zeal) {
                actorData.system.fq.zeal.max = DEFAULT_MAX_ZEAL;
                actorData.system.fq.zeal.value = RollService.rollResultSync(minion.data.zeal);
            }
            if (minion.data.healBonus) {
                actorData.system.fq.bonus.heal = RollService.rollResultSync(minion.data.healBonus);
            }
        }
    }

    /**
     * Confie la créature au joueur qui l'invoque et l'estampille à son invocateur.
     *
     * Sans cette estampille, rien ne relie un sbire posé sur la scène à son
     * invocateur : c'est elle, et elle seule, qui rend le plafond comptable.
     *
     * @param {object} actorData - Les données d'acteur à modifier EN PLACE.
     * @param {object} minion    - Les données du sbire déclarées par le choix.
     * @param {object} [extra]   - Les estampilles supplémentaires à fusionner
     *                             (l'origine d'un fantôme, par exemple).
     *
     * @returns {void}
     */
    static stampSummoner(actorData, minion, extra = {}) {
        actorData.ownership = actorData.ownership ?? {};
        actorData.ownership[game.userId] = 3;
        actorData.flags = actorData.flags ?? {};
        actorData.flags[FqCardEngineModule.moduleName] = {
            ...(actorData.flags[FqCardEngineModule.moduleName] ?? {}),
            minionType: minion?.type ?? CardFqSystem.MINION_TYPE_NONE,
            summonerId: Constants.myId ?? null,
            ...extra
        };
    }

    /**
     * Crée un fantôme : la COPIE de la cible visée — son acteur et l'apparence de
     * son jeton — posée sur SA case et confiée au lanceur.
     *
     * Copier plutôt que prêter la cible est ce qui rend la prise de contrôle sans
     * danger : le jeton d'origine n'est jamais touché, sa fiche n'est jamais
     * ouverte au joueur, et aucune propriété n'est accordée sur un acteur que
     * d'autres jetons de la scène pourraient partager.
     *
     * La copie naît SANS effet actif : les marques portées par la cible — hantises
     * comprises — appartiennent à l'original et n'ont aucun sens sur une créature
     * qui ne vivra qu'un tour ; un poison hérité tuerait le fantôme avant qu'il
     * n'agisse. Ses points de vie, eux, sont ceux de la cible AU MOMENT de la
     * copie : le fantôme d'un ennemi à l'agonie naît à l'agonie.
     *
     * La DISPOSITION de la cible est conservée : pour le ciblage du moteur, le
     * fantôme reste du camp dont il est la copie. C'est un ennemi possédé, pas un
     * allié de plus — les cartes du lanceur qui frappent « les ennemis du combat »
     * le prennent donc lui aussi.
     *
     * Sans cible sélectionnée, rien n'est créé : mieux vaut pas de fantôme qu'un
     * fantôme de personne.
     *
     * @param {object} minion   - Les données du sbire déclarées par le choix (`data`).
     * @param {object} [target] - Le jeton copié (défaut : la première cible visée).
     *
     * @returns {Promise<void>}
     */
    static async createGhostActorData(minion, target = Constants.currentTargets[0]) {
        const tokenDocument = target?.document ?? target;
        const sourceActor = target?.actor;
        if (!sourceActor || !tokenDocument) {
            ui.notifications.warn("FQCARDENGINE.WarningMsgGhostNeedsTarget", {localize: true});
            return;
        }

        if (!Minion.getTempActorFolder()) {
            await socket.executeAsGM("createTempFold");
        }

        const actorData = typeof sourceActor.toObject === "function"
            ? sourceActor.toObject()
            : JSON.parse(JSON.stringify(sourceActor));
        delete actorData._id;
        actorData.folder = Minion.getTempActorFolder()?.id;
        actorData.name = game.i18n.format("FQCARDENGINE.GhostName",
            {name: Constants.tokenName(target) ?? actorData.name});
        actorData.effects = [];
        // L'apparence du fantôme est celle du JETON de la cible, pas celle du
        // prototype de son acteur : un jeton non lié peut avoir été retouché sur
        // la scène, et c'est cette image-là que la table reconnaît. Le jeton du
        // fantôme est construit par `createActorFromData` depuis le prototype de
        // l'acteur créé — c'est donc ici que l'apparence se pose.
        actorData.prototypeToken = {
            ...(actorData.prototypeToken ?? {}),
            name: actorData.name,
            texture: tokenDocument.texture
                ? {...tokenDocument.texture}
                : actorData.prototypeToken?.texture,
            width: tokenDocument.width ?? actorData.prototypeToken?.width,
            height: tokenDocument.height ?? actorData.prototypeToken?.height,
            disposition: tokenDocument.disposition ?? actorData.prototypeToken?.disposition,
            actorLink: false
        };

        Minion.applyStatOverrides(actorData, minion);
        Minion.stampSummoner(actorData, minion, {
            // L'origine du fantôme : de quel jeton il est la copie. Ce que la table
            // lit sur la fiche, et ce qui rattache une copie à sa cible si une carte
            // vient un jour à en avoir besoin.
            ghostOfTokenId: tokenDocument.id ?? null,
            ghostOfActorId: sourceActor.id ?? null
        });

        await socket.executeAsGM("createActorFromData", actorData, game.userId, null,
            {x: tokenDocument.x, y: tokenDocument.y}, Minion.summonedInitiative(Constants.myId));
    }

    /**
     * Indique si un jeton est celui d'un fantôme — l'estampille posée à
     * l'invocation, seule marque fiable : le nom d'un jeton se change, pas son
     * flag.
     *
     * @param {object} [token] - Le jeton (placeable ou document).
     *
     * @returns {boolean} True si le jeton porte l'estampille d'un fantôme.
     */
    static isGhostToken(token) {
        return CardFqSystem.isGhostType(
            token?.actor?.flags?.[FqCardEngineModule.moduleName]?.minionType);
    }

    /**
     * Dissipe un fantôme : son combattant, son jeton, puis l'acteur temporaire
     * créé pour le porter. L'acteur part en DERNIER — le supprimer d'abord
     * laisserait un jeton orphelin, privé de la fiche qu'il référence.
     *
     * Opération de MJ : appelée depuis les hooks de combat, côté premier MJ actif,
     * là où les documents de la scène et du combat sont modifiables.
     *
     * @param {object} [token] - Le jeton du fantôme (placeable ou document).
     *
     * @returns {Promise<void>}
     */
    static async dismissGhost(token) {
        const tokenDocument = token?.document ?? token;
        if (!tokenDocument) {
            return;
        }
        const actor = tokenDocument.actor;
        const combatant = [...(game.combat?.combatants ?? [])]
            .find(c => c.tokenId === tokenDocument.id);

        await combatant?.delete();
        await tokenDocument.delete();
        await actor?.delete();
    }

    /**
     * Dissipe le fantôme dont le tour vient de s'achever, s'il y en avait un.
     *
     * Un fantôme ne vit QUE le tour qu'on lui a volé : sa disparition à la fin de
     * ce tour n'est pas un nettoyage, c'est la règle — c'est elle qui empêche la
     * prise de contrôle de devenir une invocation permanente.
     *
     * @param {string} [tokenId] - L'id du jeton dont le tour s'achève
     *        (`prior.tokenId` du hook de changement de tour).
     *
     * @returns {Promise<void>}
     */
    static async dismissGhostOfTurn(tokenId) {
        if (!tokenId) {
            return;
        }
        const token = game.canvas?.scene?.tokens?.get?.(tokenId)
            ?? [...(game.canvas?.scene?.tokens ?? [])].find(t => t.id === tokenId);
        if (Minion.isGhostToken(token)) {
            await Minion.dismissGhost(token);
        }
    }

    /**
     * Dissipe TOUS les fantômes encore posés sur la scène active — le filet de la
     * fin de combat, pour ceux que la fin de leur tour n'a pas emportés : un
     * fantôme créé dans le dernier tour, ou dont le tour n'est jamais venu.
     *
     * @returns {Promise<void>}
     */
    static async dismissAllGhosts() {
        for (const token of [...(game.canvas?.scene?.tokens ?? [])].filter(t => Minion.isGhostToken(t))) {
            await Minion.dismissGhost(token);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Plafond d'invocations simultanées, par type de sbire                 */
    /* ------------------------------------------------------------------ */

    /**
     * Les bonus de caractéristiques gagnés en combat pour un type de sbire, tels
     * qu'ils s'ajouteront à CHAQUE invocation suivante. Toujours un objet complet,
     * pour que l'appelant additionne sans garde.
     *
     * @param {string}  [type]  - Le type de sbire.
     * @param {Actor}   [actor] - L'invocateur (défaut : le personnage courant).
     *
     * @returns {{hp: number, damageBonus: number, movement: number}} Les bonus (0 par défaut).
     */
    static statBonus(type, actor = Constants.actorCurrent) {
        const stored = type ? actor?.system?.fq?.minions?.[type] : null;
        return {
            hp: Number(stored?.hp ?? 0) || 0,
            damageBonus: Number(stored?.damage ?? 0) || 0,
            movement: Number(stored?.movement ?? 0) || 0
        };
    }

    /**
     * Le nombre de sbires d'un type qu'un invocateur peut tenir en jeu : le
     * plafond de base du type, augmenté du bonus gagné en combat.
     *
     * Un type non plafonné (type vide, ou type inconnu de la table) renvoie
     * l'infini : la garde ne s'y applique jamais.
     *
     * @param {string} [type]  - Le type de sbire.
     * @param {Actor}  [actor] - L'invocateur (défaut : le personnage courant).
     *
     * @returns {number} Le plafond effectif, ou Infinity si le type n'est pas plafonné.
     */
    static maxOf(type, actor = Constants.actorCurrent) {
        const max = type ? actor?.system?.fq?.minions?.[type]?.max : undefined;
        return Number.isFinite(max) ? max : Infinity;
    }

    /**
     * Compte les sbires d'un type déjà en jeu pour un invocateur : les jetons
     * VIVANTS de la scène active portant l'estampille posée à l'invocation.
     *
     * Un sbire à 0 PV ne compte plus — son jeton peut rester sur la scène le
     * temps que le MJ le retire, sans pour autant bloquer une nouvelle invocation.
     *
     * @param {string} type         - Le type de sbire compté.
     * @param {string} [summonerId] - L'id de l'acteur invocateur (défaut : le personnage courant).
     *
     * @returns {number} Le nombre de sbires vivants de ce type invoqués par cet acteur.
     */
    static countOnScene(type, summonerId = Constants.myId) {
        return TargetingPredicates.livingMinionTokens(type, summonerId).length;
    }

    /**
     * L'écart d'initiative qui sépare une créature invoquée de son invocateur.
     * Assez petit pour ne jamais franchir l'initiative du combattant suivant,
     * assez grand pour rester lisible dans le compteur de combat.
     * @type {number}
     */
    static SUMMON_INITIATIVE_STEP = 0.01;

    /**
     * L'initiative à donner à une créature invoquée : juste SOUS celle de son
     * invocateur, pour qu'elle agisse immédiatement après lui.
     *
     * C'est la règle d'invocation du jeu — un sbire appelé pendant le tour de son
     * maître agit dans la foulée, et non à un moment tiré au sort du round
     * suivant. Elle vaut pour toutes les créatures invoquées, le fantôme compris :
     * lui en dépend entièrement, puisque le tour qu'on lui vole n'a de sens
     * qu'immédiatement après le sort qui l'a créé.
     *
     * Plusieurs créatures invoquées dans le même tour partagent la même initiative
     * et s'enchaînent donc dans l'ordre où le compteur les a inscrites.
     *
     * Sans invocateur au combat, ou sans initiative jetée pour lui, renvoie `null` :
     * le combattant est créé sans initiative, et le jet automatique du module
     * (`rollAll` au hook `createCombatant`) lui en donnera une comme avant.
     *
     * @param {string} [summonerActorId] - L'id de l'acteur invocateur.
     * @param {object} [combat]          - Le combat en cours (défaut : `game.combat`).
     *
     * @returns {number|null} L'initiative à poser, ou null si elle ne peut pas se déduire.
     */
    static summonedInitiative(summonerActorId, combat = game.combat) {
        if (!summonerActorId) {
            return null;
        }
        const summoner = [...(combat?.combatants ?? [])].find(c => c.actorId === summonerActorId);
        // `Number(null)` vaut 0 : sans cette garde, un invocateur dont l'initiative
        // n'est pas encore jetée en donnerait une NÉGATIVE à son sbire, qui jouerait
        // alors bon dernier au lieu de se faire jeter une initiative comme les autres.
        if (summoner?.initiative === null || summoner?.initiative === undefined) {
            return null;
        }
        const initiative = Number(summoner.initiative);
        return Number.isFinite(initiative) ? initiative - Minion.SUMMON_INITIATIVE_STEP : null;
    }

    /**
     * Les fantômes déclarés par un choix : ceux qui naissent sur la case de leur
     * cible, sans emplacement à choisir.
     *
     * @param {object[]} [minions] - Les sbires déclarés par le choix.
     *
     * @returns {object[]} Les sbires de type fantôme (vide si aucun).
     */
    static ghostMinions(minions) {
        return (minions ?? []).filter(minion => minion && CardFqSystem.isGhostType(minion.type));
    }

    /**
     * Les sbires déclarés par un choix qui réclament un EMPLACEMENT — les cases
     * cochées dans la croix directionnelle, ou celles couvertes par la zone posée.
     * C'est cette liste, et non tous les sbires déclarés, que les gardes
     * d'emplacement du dialogue de jeu doivent mesurer.
     *
     * @param {object[]} [minions] - Les sbires déclarés par le choix.
     *
     * @returns {object[]} Les sbires à poser (vide si aucun).
     */
    static placedMinions(minions) {
        return (minions ?? []).filter(minion => minion && !CardFqSystem.isGhostType(minion.type));
    }

    /**
     * Juge si les sbires qu'un choix s'apprête à invoquer tiennent sous les
     * plafonds de leurs types. Ne publie rien et ne lève rien : renvoie un verdict
     * que l'appelant traduit en `FormError`, sur le même patron que les gardes de
     * ciblage.
     *
     * `limit` reproduit ce que le moteur créera réellement : les emplacements
     * sélectionnés pour une invocation au contact, les cases couvertes pour une
     * invocation en zone. Sans limite, tous les sbires déclarés sont comptés.
     *
     * @param {object[]} [minions] - Les sbires déclarés par le choix.
     * @param {number}   [limit]   - Le nombre de sbires réellement créés.
     * @param {Actor}    [actor]   - L'invocateur (défaut : le personnage courant).
     *
     * @returns {{type: string, current: number, max: number, requested: number}|null}
     *          Le premier type en dépassement, ou null si tout tient.
     */
    static capVerdict(minions, limit = Infinity, actor = Constants.actorCurrent) {
        const requestedByType = {};
        // Un fantôme ne consomme aucun emplacement d'invocation — il naît sur la
        // case de sa cible : la limite de pose ne s'applique qu'aux autres sbires,
        // et lui est toujours compté, sans quoi son plafond ne vaudrait rien.
        for (const minion of [...Minion.ghostMinions(minions),
            ...Minion.placedMinions(minions).slice(0, limit)]) {
            if (!minion.type) {
                continue;
            }
            requestedByType[minion.type] = (requestedByType[minion.type] ?? 0) + 1;
        }
        for (const [type, requested] of Object.entries(requestedByType)) {
            const max = Minion.maxOf(type, actor);
            const current = Minion.countOnScene(type, actor?.id);
            if (current + requested > max) {
                return {type, current, max, requested};
            }
        }
        return null;
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés ET libres (non
     * occupés) parmi les quatre directions.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements valides sélectionnés (0 à 4).
     */
    static getNbValideMinionLocationSelected(fd) {
        return Minion.LOCATION_FIELDS
            .filter(([field, location]) => fd[field] && !Geometry.locationIsOccupied(location))
            .length;
    }

    /**
     * Compte le nombre d'emplacements de sbire sélectionnés parmi les quatre
     * directions, qu'ils soient libres ou non.
     *
     * @param {object} fd - Les données du formulaire (`minionUp`, `minionDown`, `minionLeft`, `minionRight`).
     *
     * @returns {number} Le nombre d'emplacements sélectionnés (0 à 4).
     */
    static getNbMinionLocationSelected(fd) {
        return Minion.LOCATION_FIELDS.filter(([field]) => fd[field]).length;
    }

    /**
     * Les quatre emplacements d'apparition d'un sbire, appariant le champ du
     * formulaire de jeu à la direction consommée par `Geometry`. Source unique
     * des deux comptages ci-dessus ; l'ordre EST celui dans lequel l'occupation
     * des cases est interrogée.
     * @type {ReadonlyArray<[string, string]>}
     */
    static LOCATION_FIELDS = Object.freeze([
        ["minionUp", "up"],
        ["minionDown", "down"],
        ["minionLeft", "left"],
        ["minionRight", "right"],
    ]);


    /**
     * Retourne le dossier d'acteurs temporaire (nommé « Temporaire »), s'il existe.
     *
     * @returns {object|undefined} Le dossier « Temporaire », ou undefined.
     */
    static getTempActorFolder() {
        return game.folders.find(fol => fol.type === "Actor" && fol.name === "Temporaire");
    }

    /**
     * Crée le dossier d'acteurs temporaire « Temporaire ». Exécutée côté MJ via socket.
     *
     * @returns {Promise<void>}
     */
    static async createTempFold() {
        await Folder.create({
            name: "Temporaire", type: "Actor"
        });
    }
}
