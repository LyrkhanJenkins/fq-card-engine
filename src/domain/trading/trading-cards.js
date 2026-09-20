import Constants, {MAX_CLASS_LEVEL, isGeneratedCard} from "../constants.js";
import {sampleItems} from "../../core/utils/random.utils.js";

export const DECK_TYPE = "DECK";
export const HAND_TYPE = "HAND";
export const PILE_TYPE = "PILE";
export const SPELLBOOK_TYPE = "SPELLBOOK";

/**
 * Nom du deck de compendium portant les cartes neutres, communes à toutes les
 * classes FQ : elles se débloquent au niveau global du personnage (somme des
 * niveaux de ses classes FQ), pas au niveau d'une classe particulière.
 */
export const NEUTRAL_PATTERN_DECK_NAME = "Neutral Base";

/**
 * Niveau des cartes de départ : le premier niveau du jeu. Le deck de combat
 * est créé avec tous les exemplaires des cartes de ce niveau appartenant à la
 * classe FQ principale, et le total de ces exemplaires fixe le plancher du
 * deck, figé dans `system.fq.minSize` à sa création (cf.
 * {@link TradingCards.buildStartingCards} et {@link TradingCards.deckMinSize}) :
 * le joueur peut ensuite remplacer ces cartes par d'autres, jamais descendre
 * sous ce nombre. Il n'existe pas de niveau 0.
 */
export const STARTING_CARD_LEVEL = 1;

export default class TradingCards {

    /**
     * Fonctions debounce indexées par userId.
     * Garantit qu'un seul appel à deleteDeckForUser/createDeckForUser est effectué
     * par utilisateur dans une fenêtre de 300 ms, même si updateItem est déclenché
     * plusieurs fois simultanément (cas du multi-classe).
     *
     * @type {Object<string, function>}
     */
    static debouncedUpdateDeckByUser = {};

    /**
     * Vérifie si les cartes à créer peuvent être ajoutées au deck cible,
     * en respectant la limite `maxSameCard` par carte.
     *
     * @param {object} to                              - Le deck cible.
     * @param {object[]} [to.cards]                    - Les cartes déjà présentes dans le deck.
     * @param {object} action                          - L'action contenant les cartes à créer.
     * @param {object[]} [action.toCreate]             - Les cartes à ajouter.
     * @param {object} [action.toCreate[].system.fq.maxSameCard] - Limite d'exemplaires autorisés.
     *
     * @returns {boolean} True si toutes les cartes peuvent être ajoutées, false sinon.
     *
     * @example
     * const canAdd = Deck.canPassCardsToDeck(deck, { toCreate: [card] });
     */
    static canPassCardsToDeck(to, action) {
        if (action?.toCreate && action.toCreate.length > 0) {
            let canAddCard = true;
            action.toCreate.forEach(card => {
                if (card.system?.fq?.maxSameCard && to.cards.filter(c => c.name === card.name).length >= card.system?.fq?.maxSameCard) {
                    canAddCard = false;
                }
            });
            if (!canAddCard) {
                return false;
            }
        }
        return true;
    }

    /**
     * Vérifie si un advancement de classe peut être appliqué pour le document donné.
     *
     * Une classe FQ sans parent (item du répertoire du monde) n'a par construction aucun
     * porteur : elle est refusée, avec un warning, plutôt que de faire lever une erreur
     * au hook appelant. Un personnage attitré d'aucun utilisateur est en revanche
     * accepté : la reconstruction du deck, faute de cible, est reportée au moment où le
     * personnage est attribué à un utilisateur (cf. {@link TradingCards.updateDeckWhenAssigned}).
     *
     * @param {ItemData} document               - Le document item concerné par l'advancement.
     * @param {object}   [options]              - Les options du Hook appelant.
     * @param {boolean}  [options.isAdvancement] - True si la mise à jour est un advancement.
     *
     * @returns {boolean} True si l'advancement peut être appliqué, false sinon.
     *
     * @example
     * Hooks.on("preUpdateItem", (document, changed, options) => {
     *     if (!Deck.checkIfCanUpdateClasses(document, options)) return false;
     * });
     */
    static checkIfCanUpdateClasses(document, options) {
        if (options?.isAdvancement && Constants.isFQClasses(document) && !document.parent?.id) {
            ui.notifications.warn("FQCARDENGINE.NoUserForActor", {localize: true});
            return false;
        }
        return true;
    }

    /**
     * Vérifie qu'une classe FQ ne dépasse pas le plafond de niveau du jeu
     * ({@link MAX_CLASS_LEVEL}). Affiche un avertissement et refuse l'opération
     * au-delà : la progression d'un personnage passe alors obligatoirement par
     * une autre classe.
     *
     * Le niveau demandé n'est lu que sur le porteur fourni — jamais sur le
     * document lui-même lors d'une mise à jour — pour qu'un personnage déjà
     * au-delà du plafond (partie antérieure au plafond, correction du MJ) reste
     * modifiable sur tout le reste de sa fiche.
     *
     * @param {ItemData} document - Le document item concerné.
     * @param {object}   source   - Le porteur du niveau demandé : le delta de
     *                              mise à jour, ou le document lui-même à la création.
     *
     * @returns {boolean} True si le niveau demandé est acceptable, false sinon.
     *
     * @example
     * Hooks.on("preUpdateItem", (document, changed) => TradingCards.checkClassLevelCap(document, changed));
     */
    static checkClassLevelCap(document, source) {
        if (!Constants.isFQClasses(document)) return true;

        // Le delta d'une mise à jour Foundry arrive imbriqué ou aplati selon l'appelant.
        const requested = source?.system?.levels ?? source?.["system.levels"];
        if (requested === undefined || requested === null) return true;

        if (Number(requested) <= MAX_CLASS_LEVEL) return true;

        ui.notifications.warn(game.i18n.format("FQCARDENGINE.MaxClassLevelReached", {max: MAX_CLASS_LEVEL}));
        return false;
    }

    /**
     * Gère la mise à jour du deck d'un utilisateur lors d'un changement de niveau (advancement).
     *
     * Foundry déclenche `updateItem` autant de fois qu'il y a de classes sur le personnage
     * lors d'un advancement. Pour éviter de recréer le deck N fois, un debounce par userId
     * est maintenu dans `debouncedUpdateDeckByUser` : seul le dernier événement dans la
     * fenêtre de 300 ms déclenche effectivement le delete + create.
     * Plusieurs utilisateurs sont gérés indépendamment grâce au Map.
     * Une fois le rebuild réellement résolu, émet un hook custom local (`Hooks.callAll`)
     * portant l'id de l'utilisateur : c'est l'unique signal fiable de fin de reconstruction
     * (D4-07), consommé par `src/hook/integration/dnd5e.hook.js` pour ouvrir automatiquement
     * le grimoire du déclencheur d'un advancement (LEVEL-04) sans jamais l'ouvrir avant que
     * les nouvelles cartes ne soient réellement en place.
     *
     * @example
     * // Déclaration du Hook au chargement du module
     * Hooks.on("updateItem", (document, changed, options, _userId) => {
     *     Deck.updateDeckWhenChange(document, options);
     * });
     *
     * @param {ItemData} document  - Le document item mis à jour par Foundry.
     * @param {object}   options   - Les options passées par le Hook updateItem.
     * @param {boolean}  options.isAdvancement - True si la mise à jour provient d'un advancement.
     * @param {object}   options.parent        - Le parent de l'item (le personnage).
     * @param {string}   options.parent.id     - L'id du personnage concerné par l'advancement.
     *
     * @returns {void}
     */
    static updateDeckWhenChange(document, options) {
        if (!options.isAdvancement || !Constants.isFQClasses(document)) return;

        const user = game.users.find(u => u.character?.id === options.parent?.id);
        if (!user?.id) return;

        if (!TradingCards.debouncedUpdateDeckByUser[user.id]) {
            TradingCards.debouncedUpdateDeckByUser[user.id] = foundry.utils.debounce(async (userId) => {
                // Le signal part dans tous les cas, échec compris : les
                // consommateurs qui attendent la fin de la reconstruction
                // resteraient sinon armés indéfiniment, sans jamais rien
                // recevoir ni pouvoir se désarmer.
                try {
                    await TradingCards.updateDeckForUser(userId);
                } catch (err) {
                    ui.notifications.error(err.message);
                } finally {
                    Hooks.callAll("fq-card-engine.deckRebuilt", userId);
                }
            }, 300);
        }

        TradingCards.debouncedUpdateDeckByUser[user.id](user.id);
    }

    /**
     * Reconstruit le deck d'un utilisateur quand on lui attribue un personnage portant
     * une classe FQ. Complète {@link TradingCards.checkIfCanUpdateClasses}, qui laisse
     * monter de niveau un personnage attitré d'aucun utilisateur : son deck, sans cible
     * jusque-là, n'a pas pu être construit. `updateUser` se déclenchant sur tous les
     * clients, seul celui à l'origine de l'attribution reconstruit.
     *
     * @example
     * Hooks.on("updateUser", (user, changed, _options, userId) => {
     *     TradingCards.updateDeckWhenAssigned(user, changed, userId);
     * });
     *
     * @param {User}   user    - L'utilisateur mis à jour.
     * @param {object} changed - Le delta de la mise à jour.
     * @param {string} userId  - L'id de l'utilisateur à l'origine de la mise à jour.
     *
     * @returns {Promise<void>}
     */
    static async updateDeckWhenAssigned(user, changed, userId) {
        if (userId !== game.user?.id || !changed?.character || !user?.character) return;
        if (Constants.userFQClasses(user).length === 0) return;

        try {
            await TradingCards.updateDeckForUser(user.id);
        } catch (err) {
            ui.notifications.error(err.message);
        }
    }

    /**
     * Met à jour l'ensemble des decks (Deck, Hand, Pile, et éventuellement Spellbook)
     * pour un utilisateur donné, à partir des compendiums FQ.
     * Les cartes de classe se débloquent au niveau de leur classe ; les cartes du deck
     * neutre (cf. {@link NEUTRAL_PATTERN_DECK_NAME}) se débloquent au niveau global du
     * personnage — somme des niveaux de ses classes FQ — dès qu'il en a au moins une.
     *
     * À sa création — c'est-à-dire quand le personnage reçoit sa première
     * classe FQ — le deck de combat reçoit les cartes de départ de la classe
     * principale (cf. {@link TradingCards.buildStartingCards}) et fige leur
     * nombre comme plancher (`system.fq.minSize`). C'est le seul peuplement
     * automatique du deck ET le seul calcul du plancher : un deck existant
     * n'est plus jamais ni rempli ni recalculé, quoi qu'il arrive ensuite aux
     * classes du personnage. Perdre toutes ses classes FQ n'est pas un cas
     * géré : faute de classe principale, la reconstruction s'arrête avant
     * d'arriver ici.
     *
     * @param {string} currentUserId - L'id Foundry de l'utilisateur cible.
     *
     * @returns {Promise<void>}
     *
     * @example
     * await Deck.updateDeckForUser(game.user.id);
     */
    static async updateDeckForUser(currentUserId) {
        const user = game.users.get(currentUserId);

        if (!user?.character?.name) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }

        let ownership = {default: 0};
        ownership[user.id] = 3;
        const allFQClasses = Constants.userFQClasses(user);
        const mainClass = allFQClasses.find(c => c.system.isOriginalClass);

        const compendium = await game.packs.get(FqCardEngineModule.moduleName + ".decks-pattern-fq8").getDocuments();
        const nameOriginDeck = mainClass?.name + " Base";
        const originDeck = compendium.find(pack => pack.name === nameOriginDeck);
        if (!mainClass || !originDeck) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoMainClass"));
            return;
        }
        // Create Hand if not exist
        let hand = TradingCards.getFirstDeck(user.id, HAND_TYPE, false);
        if (!hand) {
            let handName = game.i18n.localize("FQCARDENGINE.HandPrefixName") + user.character.name;
            await Cards.create({
                name: handName,
                type: "hand",
                system: {...originDeck?.system, fq: {type: "HAND", owner: user.id}},
                ownership
            });
        }

        // Create Pile if not exist
        let pile = TradingCards.getFirstDeck(user.id, PILE_TYPE, false);
        if (!pile) {
            let pileName = game.i18n.localize("FQCARDENGINE.PilePrefixName") + user.character.name;
            await Cards.create({
                name: pileName,
                type: "pile",
                system: {...originDeck?.system, fq: {type: "PILE", owner: user.id}},
                ownership
            });
        }

        // --- Calcul des niveaux actuels par classe et recréation du spellbook ---
        let spellBook = TradingCards.getFirstDeck(user.id, SPELLBOOK_TYPE, false);
        const oldClassLevels = spellBook?.system?.fq?.classLevels ?? {};
        const newClassLevels = {};
        allFQClasses.forEach(c => {
            newClassLevels[c.name] = Number(c.system.levels) ? Number(c.system.levels) : 0;
        });
        if (spellBook) {
            await Cards.deleteDocuments([spellBook.id]);
        }

        let allCards = [];
        for (const i in allFQClasses) {
            const classe = allFQClasses[i];
            const level = Number(classe.system.levels) ? Number(classe.system.levels) : 0;
            const nameOriginPatternDeck = classe?.name + " Base";
            const deckCompendium = compendium.find(pack => pack.name === nameOriginPatternDeck);
            let classeCards = deckCompendium ? [...deckCompendium.cards] : [];
            allCards = allCards.concat(classeCards.filter(c => c.system.fq.level <= level));
        }
        // Cartes neutres : débloquées au niveau global (somme des niveaux des classes
        // FQ), indépendamment de la classe. Deck absent du compendium => ignoré,
        // comme un deck de classe manquant.
        const neutralDeck = compendium.find(pack => pack.name === NEUTRAL_PATTERN_DECK_NAME);
        const neutralCards = neutralDeck ? [...neutralDeck.cards] : [];
        const newGlobalLevel = Object.values(newClassLevels).reduce((sum, level) => sum + level, 0);
        allCards = allCards.concat(neutralCards.filter(c => c.system.fq.level <= newGlobalLevel));
        let spellBookName = game.i18n.localize("FQCARDENGINE.SpellBookPrefixName") + user.character.name;
        spellBook = await Cards.create({
            ...originDeck,
            name: spellBookName,
            type: "deck",
            cards: [],
            system: {...originDeck?.system, fq: {type: "SPELLBOOK", owner: user.id, classLevels: newClassLevels}},
            ownership
        });
        await TradingCards.createCardsForDeck(spellBook, allCards);

        // --- Calcul du delta des cartes perdues par classe (D4-01/D4-02 : le
        // deck de combat n'est jamais peuplé automatiquement, hors cartes
        // obligatoires ; le retrait des cartes devenues indisponibles reste
        // nécessaire) ---
        let cardsToRemove = [];

        const allClassNames = new Set([...Object.keys(oldClassLevels), ...Object.keys(newClassLevels)]);
        for (const className of allClassNames) {
            const oldLevel = oldClassLevels[className] ?? 0;
            const newLevel = newClassLevels[className] ?? 0;
            if (newLevel === oldLevel) continue;

            const nameOriginPatternDeck = className + " Base";
            const deckCompendium = compendium.find(pack => pack.name === nameOriginPatternDeck);
            if (!deckCompendium) continue;
            const classeCards = [...deckCompendium.cards];

            if (newLevel < oldLevel) {
                // Classe rétrogradée : cartes perdues entre le nouveau niveau (exclu) et l'ancien (inclus).
                // Classe disparue : ses cartes de départ partent aussi, d'où la borne sous le premier niveau.
                const lowerBound = className in newClassLevels ? newLevel : STARTING_CARD_LEVEL - 1;
                cardsToRemove = cardsToRemove.concat(
                    classeCards.filter(c => c.system.fq.level > lowerBound && c.system.fq.level <= oldLevel)
                );
            }
        }

        // Delta des cartes perdues neutres : même mécanique que les classes,
        // appliquée au niveau global (sommes des snapshots de niveaux avant/après).
        const oldGlobalLevel = Object.values(oldClassLevels).reduce((sum, level) => sum + level, 0);
        if (newGlobalLevel < oldGlobalLevel) {
            cardsToRemove = cardsToRemove.concat(
                neutralCards.filter(c => c.system.fq.level > newGlobalLevel && c.system.fq.level <= oldGlobalLevel)
            );
        }

        // Create deck if not exist
        let deck = TradingCards.getFirstDeck(user.id, DECK_TYPE, false);
        if (!deck) {
            // Cartes de départ et plancher ne sont calculés QUE sur ce chemin :
            // un deck déjà né n'y repasse jamais.
            const startingCards = TradingCards.buildStartingCards(originDeck.cards ? [...originDeck.cards] : []);
            let deckName = game.i18n.localize("FQCARDENGINE.DeckPrefixName") + user.character.name;
            deck = await Cards.create({
                ...originDeck,
                name: deckName,
                type: "deck",
                cards: [],
                system: {...originDeck?.system, fq: {type: "DECK", owner: user.id, minSize: startingCards.length}},
                ownership
            });
            // Unique peuplement automatique du deck, et unique calcul de son
            // plancher : les cartes de départ de la classe principale, posées
            // une seule fois à la création. Tout le reste de la construction
            // appartient ensuite au joueur.
            if (startingCards.length) {
                await TradingCards.createCardsForDeck(deck, startingCards);
            }
        }

        // Retire du deck uniquement les cartes concernées par la baisse de niveau
        if (cardsToRemove.length) {
            const removeNames = new Set(cardsToRemove.map(rc => rc.name));
            const removeInDeck = deck.cards.filter(c => removeNames.has(c.name));
            await TradingCards.deleteCardsForDeck(deck, removeInDeck);
        }
    }

    /**
     * Cartes de départ d'un deck de combat : tous les exemplaires
     * (`maxSameCard`, 1 à défaut) de chaque carte de niveau
     * {@link STARTING_CARD_LEVEL} du patron fourni — celui de la classe FQ
     * principale. Le tableau renvoyé porte une entrée PAR EXEMPLAIRE : c'est
     * exactement ce qui est créé dans le deck, et sa longueur est le plancher
     * du deck. Un patron sans carte de premier niveau donne un tableau vide,
     * donc aucun plancher.
     *
     * @param {Card[]|object[]} patternCards - Les cartes du deck patron de la classe principale.
     *
     * @returns {object[]} Les cartes de départ, un élément par exemplaire.
     */
    static buildStartingCards(patternCards) {
        const startingCards = [];
        for (const card of patternCards ?? []) {
            if (Number(card?.system?.fq?.level) !== STARTING_CARD_LEVEL) continue;
            const rawMax = card.system.fq.maxSameCard;
            const max = Number.isFinite(rawMax) ? rawMax : 1;
            for (let i = 0; i < max; i++) {
                startingCards.push(card);
            }
        }
        return startingCards;
    }

    /**
     * Supprime le Deck principal et le Spellbook d'un utilisateur.
     * Le Deck n'est supprimé que si l'utilisateur est monoclasse de niveau 5 ou moins
     * (cas où il peut être reconstruit automatiquement).
     *
     * @param {string} currentUserId - L'id Foundry de l'utilisateur cible.
     *
     * @returns {Promise<void>}
     *
     * @example
     * await Deck.deleteDeckForUser(game.user.id);
     */
    static async deleteDeckForUser(currentUserId) {
        const user = game.users.get(currentUserId);
        if (!user?.character?.name) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }
        const allFQClasses = Constants.userFQClasses(user);
        let mainClass = allFQClasses.find(c => c.system.isOriginalClass);
        if (!mainClass) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoMainClass"));
            return;
        }

        let deck = TradingCards.getFirstDeck(user.id, DECK_TYPE, false);
        // On ne détruit le deck que si on sait le reconstruire (niveau1 à 5, monoclasse)
        if (deck && mainClass?.system?.levels <= 5 && allFQClasses.length === 1) {
            await Cards.deleteDocuments([deck.id]);
        }
        let spellBook = TradingCards.getFirstDeck(user.id, SPELLBOOK_TYPE, false);
        if (spellBook) {
            await Cards.deleteDocuments([spellBook.id]);
        }
    }

    /**
     * Crée les cartes dans un deck via `createEmbeddedDocuments`.
     * Pour un deck de type SPELLBOOK, filtre les doublons déjà présents.
     *
     * @param {Cards}    deck     - Le deck Foundry dans lequel créer les cartes.
     * @param {object[]} cards    - Les cartes à insérer.
     *
     * @returns {Promise<Cards>}
     *
     * @example
     * await Deck.createCardsForDeck(deck, originDeck.cards);
     */
    static async createCardsForDeck(deck, cards) {
        return await deck.createEmbeddedDocuments("Card", [...cards], {keepId: false});
    }

    /**
     * Supprime les cartes d'un deck via `deleteEmbeddedDocuments`. Chemin
     * interne au moteur : il lève le plancher du deck (option
     * `fqAllowBelowMin`, lue par le hook `preDeleteCard`), les appelants
     * d'interface filtrant eux-mêmes ce que le joueur a le droit de retirer.
     *
     * @param {Cards}    deck     - Le deck Foundry dont on retire les cartes.
     * @param {object[]} cards    - Les cartes à supprimer.
     *
     * @returns {Promise<Cards>}
     */
    static async deleteCardsForDeck(deck, cards) {
        return await deck.deleteEmbeddedDocuments("Card", cards.map(c => c.id), {fqAllowBelowMin: true});
    }

    /**
     * Garde du plancher du deck de combat : refuse (et avertit) toute
     * suppression qui ferait passer le deck sous son nombre minimal de cartes
     * (`system.fq.minSize`) sans passer par un chemin interne du moteur
     * (option `fqAllowBelowMin`). Couvre la feuille du deck, y compris le
     * bouton natif du MJ. La garde raisonne sur la taille AVANT suppression :
     * un deck strictement au-dessus du plancher laisse passer la suppression,
     * ce hook ne voyant jamais qu'une carte à la fois — les retraits groupés
     * du grimoire sont, eux, décidés en amont sur le lot entier
     * (cf. `computeToggleAction`).
     *
     * @param {Card}   card      - La carte en cours de suppression.
     * @param {object} [options] - Les options de suppression Foundry.
     *
     * @returns {boolean} False pour bloquer la suppression, true sinon.
     */
    static canDeleteDeckCard(card, options) {
        if (options?.fqAllowBelowMin) return true;
        const parent = card?.parent;
        if (parent?.system?.fq?.type !== DECK_TYPE) return true;
        const min = TradingCards.deckMinSize(parent);
        if (TradingCards.countDeckCards(parent) > min) return true;
        ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningDeckMinSize", {min}));
        return false;
    }

    /**
     * Nombre de cartes que porte un jeu, exemplaires piochés compris — même
     * discipline de comptage que le badge du grimoire (BOOK-07). `Cards#cards`
     * est une `Collection` Foundry (donc `size`) ; le repli sur `length` couvre
     * les collections simulées sous forme de tableau.
     *
     * @param {Cards} [stack] - Le jeu inspecté.
     *
     * @returns {number} Le nombre de cartes (0 sans jeu).
     */
    static countDeckCards(stack) {
        return stack?.cards?.size ?? stack?.cards?.length ?? 0;
    }

    /**
     * Plancher d'un deck de combat : le nombre de cartes sous lequel il ne peut
     * pas descendre, figé une fois pour toutes dans `system.fq.minSize` à sa
     * création, sur le total des exemplaires de départ de la classe FQ
     * principale (cf. {@link TradingCards.buildStartingCards}). Jamais recalculé
     * après coup : la valeur lue est celle du document, pour que la grille du
     * grimoire, l'indicateur de taille et le garde de suppression parlent
     * toujours du même nombre, sans lecture de compendium sur un chemin
     * synchrone.
     *
     * Une valeur absente, nulle ou non numérique vaut zéro — un deck sans
     * plancher, où tout se retire (decks d'avant la règle).
     *
     * @param {Cards} [deck] - Le deck inspecté (absent = pas de plancher).
     *
     * @returns {number} Le nombre minimal de cartes du deck.
     */
    static deckMinSize(deck) {
        const raw = Number(deck?.system?.fq?.minSize);
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
    }

    /**
     * Retourne le premier deck correspondant au type FQ et appartenant à l'utilisateur.
     * Affiche un warning si aucun deck n'est trouvé (sauf si `warning` est false).
     *
     * @param {string}  userId   - L'id de l'utilisateur propriétaire.
     * @param {string}  typeFq   - Le type FQ du deck (DECK, HAND, PILE, SPELLBOOK).
     * @param {boolean} [warning=true] - Si true, affiche un warning quand le deck est absent.
     *
     * @returns {Cards|undefined} Le premier deck trouvé, ou undefined.
     *
     * @example
     * const hand = Deck.getFirstDeck(game.user.id, HAND_TYPE);
     */
    static getFirstDeck(userId, typeFq, warning = true) {
        const deck = game.cards.find(cards => cards.ownership[userId] === 3 && cards.system.fq.type === typeFq && cards.system.fq.owner === userId);
        if (!deck && warning) {
            const warningKey = {
                [HAND_TYPE]: "FQCARDENGINE.WarningHandMissingForPlayer",
                [DECK_TYPE]: "FQCARDENGINE.WarningDeckMissingForPlayer",
                [PILE_TYPE]: "FQCARDENGINE.WarningPileMissingForPlayer",
                [SPELLBOOK_TYPE]: "FQCARDENGINE.WarningSpellBookMissingForPlayer"
            }[typeFq];
            if (warningKey) {
                ui.notifications.warn(warningKey, {localize: true});
            }
        }
        return deck;
    }



    /**
     * Nombre de cartes encore piochables dans un deck : ses cartes moins celles
     * déjà tirées. Définition unique de « ce que la pioche peut encore fournir »,
     * partagée par le garde de lançabilité d'une carte qui fait piocher et par le
     * prédicat de condition `deckHasCards`.
     *
     * @param {Cards} [deck] - Le deck inspecté.
     *
     * @returns {number} Le nombre de cartes disponibles (0 sans deck).
     */
    static countAvailableCards(deck) {
        return (deck?.cards?.size ?? 0) - (deck?.drawnCards?.length ?? 0);
    }

    /**
     * Liste, pile par pile, les cartes qu'un rappel ramènerait dans le deck :
     * les cartes du deck qui y sont défaussées, et les cartes GÉNÉRÉES présentes
     * dans la pile du même propriétaire (elles n'ont pas d'originale dans le
     * deck, et leur origine éventuelle n'est jamais un deck). Source unique de
     * sélection du rappel (cf. {@link TradingCards.recallCardsFromPiles}) et de
     * son décompte (cf. {@link TradingCards.countRecallableCards}).
     *
     * @param {Cards} deck - Le deck FQ concerné.
     *
     * @returns {{pile: Cards, pileCards: Card[], generated: Card[]}[]} Les piles porteuses et leurs cartes rappelables.
     */
    static getRecallableCardsByPile(deck) {
        return game.cards.filter(c => c.system.fq.type === PILE_TYPE)
            .map(pile => ({
                pile,
                pileCards: pile.cards.filter(c => c.origin?.id === deck.id),
                generated: pile.system.fq.owner === deck.system.fq.owner
                    ? pile.cards.filter(c => isGeneratedCard(c) && c.origin?.type !== "deck")
                    : []
            }))
            .filter(entry => entry.pileCards.length || entry.generated.length);
    }

    /**
     * Compte les cartes qu'un rappel ramènerait dans le deck, sans rien déplacer.
     * Sert aux gardes de lançabilité : une pioche est possible tant que le deck
     * ET sa défausse réunis contiennent assez de cartes.
     *
     * @param {Cards} deck - Le deck FQ concerné.
     *
     * @returns {number} Le nombre de cartes rappelables.
     */
    static countRecallableCards(deck) {
        return TradingCards.getRecallableCardsByPile(deck)
            .reduce((total, {pileCards, generated}) => total + pileCards.length + generated.length, 0);
    }

    /**
     * Ramène dans le deck toutes ses cartes actuellement défaussées, en balayant
     * TOUTES les piles FQ : le dialogue de jeu permet de défausser dans une autre
     * pile que la sienne (cas du MJ qui a permission sur toutes les piles), les
     * cartes d'un deck peuvent donc être dispersées. Même mécanique que
     * `Cards#recall` d'une pile : l'originale du deck est remarquée non piochée,
     * la copie défaussée est supprimée. Les cartes GÉNÉRÉES (flag `generated`,
     * sans deck d'origine) défaussées dans la pile du même joueur sont quant à
     * elles DÉPLACÉES dans le deck — elles redeviennent piochables le temps du
     * combat, avant leur destruction au nettoyage (`deleteGeneratedDeckCards`).
     *
     * @param {Cards} deck - Le deck FQ dont on récupère les cartes défaussées.
     *
     * @returns {Promise<number>} Le nombre de cartes ramenées dans le deck.
     */
    static async recallCardsFromPiles(deck) {
        let recalled = 0;
        for (const {pile, pileCards, generated} of TradingCards.getRecallableCardsByPile(deck)) {
            const toUpdate = pileCards.filter(c => deck.cards.get(c.id))
                .map(c => ({_id: c.id, drawn: false}));
            if (toUpdate.length) {
                await deck.updateEmbeddedDocuments("Card", toUpdate);
            }
            if (generated.length) {
                const data = generated.map(c => {
                    const d = c.toObject();
                    delete d._id;
                    d.drawn = false;
                    d.origin = null;
                    return d;
                });
                await deck.createEmbeddedDocuments("Card", data, {keepId: false});
            }
            await pile.deleteEmbeddedDocuments("Card", pileCards.concat(generated).map(c => c.id));
            recalled += pileCards.length + generated.length;
        }
        return recalled;
    }

    /**
     * Pioche des cartes depuis un deck vers une main. La pioche est attendue :
     * l'appelant (y compris via socket) n'est libéré qu'une fois les cartes
     * effectivement transférées, ce qui permet d'enchaîner sans course une
     * seconde pioche après recyclage de la défausse.
     *
     * @param {string} handId    - L'id du jeu de type « hand » qui reçoit les cartes.
     * @param {string} deckId    - L'id du deck source.
     * @param {number} drawScore - Le nombre de cartes à piocher.
     *
     * @returns {Promise<void>}
     */
    static async drawCard(handId, deckId, drawScore) {
        const hand = game.cards.get(handId);
        const deck = game.cards.get(deckId);
        await hand.draw(deck, drawScore, {
            chatNotification: false, how: 2
        });
    }

    /**
     * Pioche des cartes désignées par leurs ids depuis un deck vers une main, en
     * un seul transfert. Contrairement à `drawCard` (tirage aléatoire), les
     * cartes sont choisies par l'appelant — utilisé pour regrouper en une seule
     * pioche (donc une seule animation de révélation) les cartes restantes du
     * deck et celles issues du recyclage de la défausse.
     *
     * @param {string}   handId  - L'id du jeu de type « hand » qui reçoit les cartes.
     * @param {string}   deckId  - L'id du deck source.
     * @param {string[]} cardIds - Les ids des cartes du deck à piocher.
     *
     * @returns {Promise<void>}
     */
    static async passCards(handId, deckId, cardIds) {
        const hand = game.cards.get(handId);
        const deck = game.cards.get(deckId);
        await deck.pass(hand, cardIds, {chatNotification: false});
    }

    /**
     * Tire au hasard jusqu'à `count` ids parmi les cartes fournies
     * (mélange de Fisher-Yates partiel, sans doublon).
     *
     * @param {object[]} cards - Les cartes candidates.
     * @param {number}   count - Le nombre d'ids souhaité.
     *
     * @returns {string[]} Les ids tirés (moins si le vivier est plus petit).
     */
    static sampleCardIds(cards, count) {
        return sampleItems(cards.map(c => c.id), count);
    }
}
