import Constants from "../constants.js";
import {sampleItems} from "../../core/utils/random.utils.js";

export const DECK_TYPE = "DECK";
export const HAND_TYPE = "HAND";
export const PILE_TYPE = "PILE";
export const SPELLBOOK_TYPE = "SPELLBOOK";

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
     * Contrôle que le personnage parent est bien possédé par un utilisateur connecté.
     * Affiche un warning si ce n'est pas le cas.
     *
     * @param {ItemData} document               - Le document item concerné par l'advancement.
     * @param {object}   options                - Les options du Hook updateItem.
     * @param {boolean}  options.isAdvancement  - True si la mise à jour est un advancement.
     *
     * @returns {boolean} True si l'advancement peut être appliqué, false sinon.
     *
     * @example
     * Hooks.on("preUpdateItem", (document, changed, options) => {
     *     if (!Deck.checkIfCanUpdateClasses(document, options)) return false;
     * });
     */
    static checkIfCanUpdateClasses(document, options) {
        if (options.isAdvancement && Constants.isFQClasses(document)) {
            const ownedCharacters = game.users.filter(u => !!u.character).map(u => u.character?.id);
            if (ownedCharacters.includes(document.parent.id)) {
                return true;
            }
            ui.notifications.warn("FQCARDENGINE.NoUserForActor", {localize: true});
            return false;
        }
        return true;
    }

    /**
     * Gère la mise à jour du deck d'un utilisateur lors d'un changement de niveau (advancement).
     *
     * Foundry déclenche `updateItem` autant de fois qu'il y a de classes sur le personnage
     * lors d'un advancement. Pour éviter de recréer le deck N fois, un debounce par userId
     * est maintenu dans `debouncedUpdateDeckByUser` : seul le dernier événement dans la
     * fenêtre de 300 ms déclenche effectivement le delete + create.
     * Plusieurs utilisateurs sont gérés indépendamment grâce au Map.
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
            TradingCards.debouncedUpdateDeckByUser[user.id] = foundry.utils.debounce((userId) => {
                TradingCards.updateDeckForUser(userId);
            }, 300);
        }

        TradingCards.debouncedUpdateDeckByUser[user.id](user.id);
    }

    /**
     * Met à jour l'ensemble des decks (Deck, Hand, Pile, et éventuellement Spellbook)
     * pour un utilisateur donné, à partir des compendiums FQ.
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

        // --- Calcul du delta (cartes gagnées / perdues) par classe ---
        let cardsToAdd = [];
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

            if (newLevel > oldLevel) {
                // Cartes débloquées entre l'ancien niveau (exclu) et le nouveau (inclus)
                cardsToAdd = cardsToAdd.concat(
                    classeCards.filter(c => c.system.fq.level > oldLevel && c.system.fq.level <= newLevel)
                );
            } else {
                // Classe rétrogradée ou disparue : cartes perdues entre le nouveau niveau (exclu) et l'ancien (inclus)
                cardsToRemove = cardsToRemove.concat(
                    classeCards.filter(c => c.system.fq.level > newLevel && c.system.fq.level <= oldLevel)
                );
            }
        }

        // Create deck if not exist
        let deck = TradingCards.getFirstDeck(user.id, DECK_TYPE, false);
        if (!deck) {
            let deckName = game.i18n.localize("FQCARDENGINE.DeckPrefixName") + user.character.name;
            deck = await Cards.create({
                ...originDeck,
                name: deckName,
                type: "deck",
                cards: [],
                system: {...originDeck?.system, fq: {type: "DECK", owner: user.id}},
                ownership
            });
        }

        // Retire du deck uniquement les cartes concernées par la baisse de niveau
        if (cardsToRemove.length) {
            const removeNames = new Set(cardsToRemove.map(rc => rc.name));
            const removeInDeck = deck.cards.filter(c => removeNames.has(c.name));
            await TradingCards.deleteCardsForDeck(deck, removeInDeck);
        }

        // Ajoute au deck uniquement les nouvelles cartes gagnées, si pas déjà présentes
        if (cardsToAdd.length) {
            const deckNames = new Set(deck.cards.map(c => c.name));
            let newCards = [];
            cardsToAdd.forEach(card => {
                if (!deckNames.has(card.name)) {
                    for (let i = 0; i < (Math.ceil((card?.system?.fq?.maxSameCard ?? 1) / 2)); i++) {
                        newCards.push({...card});
                    }
                }
            });
            if (newCards.length) {
                await TradingCards.createCardsForDeck(deck, newCards);
            }
        }

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
     * Supprime les carte d'un deck via `deleteEmbeddedDocuments`
     *
     * @param {Cards}    deck     - Le deck Foundry dans lequel créer les cartes.
     * @param {object[]} cards    - Les cartes à supprimer.
     *
     * @returns {Promise<Cards>}
     */
    static async deleteCardsForDeck(deck, cards) {
        return await deck.deleteEmbeddedDocuments("Card", cards.map(c => c.id), {});
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
        const moduleName = globalThis.FqCardEngineModule?.moduleName;
        return game.cards.filter(c => c.system.fq.type === PILE_TYPE)
            .map(pile => ({
                pile,
                pileCards: pile.cards.filter(c => c.origin?.id === deck.id),
                generated: pile.system.fq.owner === deck.system.fq.owner
                    ? pile.cards.filter(c => c.flags?.[moduleName]?.generated && c.origin?.type !== "deck")
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
