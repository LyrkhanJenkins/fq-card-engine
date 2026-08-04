import FqConstants from "./fq-constants.js";

export const DECK_TYPE = "DECK";
export const HAND_TYPE = "HAND";
export const PILE_TYPE = "PILE";
export const SPELLBOOK_TYPE = "SPELLBOOK";

export default class DeckUtils {

    /**
     * Map des fonctions debounce indexées par userId.
     * Garantit qu'un seul appel à deleteDeckForUser/createDeckForUser est effectué
     * par utilisateur dans une fenêtre de 300 ms, même si updateItem est déclenché
     * plusieurs fois simultanément (cas du multi-classe).
     *
     * @type {Map<string, function>}
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
     * const canAdd = DeckUtils.canPassCardsToDeck(deck, { toCreate: [card] });
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
     *     if (!DeckUtils.checkIfCanUpdateClasses(document, options)) return false;
     * });
     */
    static checkIfCanUpdateClasses(document, options) {
        if (options.isAdvancement && FqConstants.isFQClasses(document)) {
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
     *     DeckUtils.updateDeckWhenChange(document, options);
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
        if (!options.isAdvancement || !FqConstants.isFQClasses(document)) return;

        const user = game.users.find(u => u.character?.id === options.parent?.id);
        if (!user?.id) return;

        if (!DeckUtils.debouncedUpdateDeckByUser[user.id]) {
            DeckUtils.debouncedUpdateDeckByUser[user.id] = foundry.utils.debounce((userId) => {
                DeckUtils.updateDeckForUser(userId);
            }, 300);
        }

        DeckUtils.debouncedUpdateDeckByUser[user.id](user.id);
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
     * await DeckUtils.updateDeckForUser(game.user.id);
     */
    static async updateDeckForUser(currentUserId) {
        const user = game.users.get(currentUserId);

        if (!user?.character?.name) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }

        let ownership = {default: 0};
        ownership[user.id] = 3;
        const allFQClasses = FqConstants.userFQClasses(user);
        const mainClass = allFQClasses.find(c => c.system.isOriginalClass);

        const compendium = await game.packs.get(FqCardEngineModule.moduleName + ".decks-pattern-fq8").getDocuments();
        const nameOriginDeck = mainClass?.name + " Base";
        const originDeck = compendium.find(pack => pack.name === nameOriginDeck);
        if (!mainClass || !originDeck) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoMainClass"));
            return;
        }
        // Create Hand if not exist
        let hand = DeckUtils.getFirstDeck(user.id, HAND_TYPE, false);
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
        let pile = DeckUtils.getFirstDeck(user.id, PILE_TYPE, false);
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
        let spellBook = DeckUtils.getFirstDeck(user.id, SPELLBOOK_TYPE, false);
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
            const patternCompendium = await game.packs.get(FqCardEngineModule.moduleName + ".decks-pattern-fq8").getDocuments();
            const nameOriginPatternDeck = classe?.name + " Base";
            const deckCompendium = patternCompendium.find(pack => pack.name === nameOriginPatternDeck);
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
        await DeckUtils.createCardsForDeck(spellBook, allCards);

        // --- Calcul du delta (cartes gagnées / perdues) par classe ---
        let cardsToAdd = [];
        let cardsToRemove = [];
        const patternCompendium = await game.packs.get(FqCardEngineModule.moduleName + ".decks-pattern-fq8").getDocuments();

        const allClassNames = new Set([...Object.keys(oldClassLevels), ...Object.keys(newClassLevels)]);
        for (const className of allClassNames) {
            const oldLevel = oldClassLevels[className] ?? 0;
            const newLevel = newClassLevels[className] ?? 0;
            if (newLevel === oldLevel) continue;

            const nameOriginPatternDeck = className + " Base";
            const deckCompendium = patternCompendium.find(pack => pack.name === nameOriginPatternDeck);
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
        let deck = DeckUtils.getFirstDeck(user.id, DECK_TYPE, false);
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
            const removeInDeck = deck.cards.filter(c => cardsToRemove.find(rc => rc.name === c.name));
            await DeckUtils.deleteCardsForDeck(deck, removeInDeck);
        }

        // Ajoute au deck uniquement les nouvelles cartes gagnées, si pas déjà présentes
        if (cardsToAdd.length) {
            let newCards = [];
            cardsToAdd.forEach(card => {
                if (!deck.cards.find(cardInDeck => cardInDeck.name === card.name)) {
                    for (let i = 0; i < (Math.ceil((card?.system?.fq?.maxSameCard ?? 1) / 2)); i++) {
                        newCards.push({...card});
                    }
                }
            });
            if (newCards.length) {
                await DeckUtils.createCardsForDeck(deck, newCards);
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
     * await DeckUtils.deleteDeckForUser(game.user.id);
     */
    static async deleteDeckForUser(currentUserId) {
        const user = game.users.get(currentUserId);
        if (!user?.character?.name) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoOwnedCharacter"));
            return;
        }
        const allFQClasses = FqConstants.userFQClasses(user);
        let mainClass = allFQClasses.find(c => c.system.isOriginalClass);
        if (!mainClass) {
            if (!user.isGM) ui.notifications.warn(game.i18n.localize("FQCARDENGINE.NoMainClass"));
            return;
        }

        let deck = DeckUtils.getFirstDeck(user.id, DECK_TYPE, false);
        // On ne détruit le deck que si on sait le reconstruire (niveau1 à 5, monoclasse)
        if (deck && mainClass?.system?.levels <= 5 && allFQClasses.length === 1) {
            await Cards.deleteDocuments([deck.id]);
        }
        let spellBook = DeckUtils.getFirstDeck(user.id, SPELLBOOK_TYPE, false);
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
     * await DeckUtils.createCardsForDeck(deck, originDeck.cards);
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
     * const hand = DeckUtils.getFirstDeck(game.user.id, HAND_TYPE);
     */
    static getFirstDeck(userId, typeFq, warning = true) {
        let deck = game.cards.filter(cards => cards.ownership[userId] === 3 && cards.system.fq.type === typeFq && cards.system.fq.owner === userId);
        if (!deck?.length && warning) {
            if (typeFq === HAND_TYPE) {
                ui.notifications.warn("FQCARDENGINE.WarningHandMissingForPlayer", {localize: true});
            } else if (typeFq === DECK_TYPE) {
                ui.notifications.warn("FQCARDENGINE.WarningDeckMissingForPlayer", {localize: true});
            } else if (typeFq === PILE_TYPE) {
                ui.notifications.warn("FQCARDENGINE.WarningPileMissingForPlayer", {localize: true});
            } else if (typeFq === SPELLBOOK_TYPE) {
                ui.notifications.warn("FQCARDENGINE.WarningSpellBookMissingForPlayer", {localize: true});
            }
        }
        return deck[0];
    }


    /**
     * Pioche des cartes depuis un deck vers une main.
     *
     * @param {string} handId    - L'id du jeu de type « hand » qui reçoit les cartes.
     * @param {string} deckId    - L'id du deck source.
     * @param {number} drawScore - Le nombre de cartes à piocher.
     *
     * @returns {void}
     */
    static drawCard(handId, deckId, drawScore) {
        const hand = game.cards.get(handId);
        const deck = game.cards.get(deckId);
        hand.draw(deck, drawScore, {
            chatNotification: false, how: 2
        });
    }

    /**
     * Enregistre dans les flags du combat actif une entrée de log décrivant la
     * carte jouée : acteur, cibles, round/tour, résultats et contenu de la carte.
     * N'a aucun effet hors combat.
     *
     * @param {object[]} initResultatArray - Le tableau des résultats de l'effet joué.
     * @param {object}   cardContent       - Le contenu (choix) de la carte jouée.
     *
     * @returns {void}
     */
    static logCardPlayed(initResultatArray, cardContent) {
        if (game.combat) {
            let FQLogs = game.combat.flags.fq?.logs ? game.combat.flags.fq?.logs : [];
            let resultArray = [...initResultatArray];
            FQLogs.push({
                "actorId": game.user.character.id,
                "targetsId": FqConstants.myTargets(cardContent.targetType).map(t => t.document.actorId),
                "round": game.combat.round,
                "turn": game.combat.turn,
                resultArray: {...resultArray},
                "cardContent": {...cardContent}
            });

            game.combat.update({
                "flags.fq": {logs: FQLogs}
            });
        }
    }
}
