/**
 * Exécuté dans le contexte navigateur de Foundry (chargé dynamiquement par la
 * macro « Deck aléatoire » du template `uat-base`). Remplit le deck du joueur
 * en tirant au sort dans sa bibliothèque (jeu de cartes de type FQ
 * `SPELLBOOK`), pour disposer en un geste d'une composition à éprouver.
 *
 * Contrairement au plan de monde (`uat-seed.json`), ce tirage n'est PAS
 * déterministe : la macro est faite pour être rejouée jusqu'à tomber sur une
 * composition intéressante, une graine figée la rendrait sans objet.
 *
 * N'importe rien du module : uniquement les API Foundry et le nom du module via
 * la façade globale, comme `uat-seeder.mjs`. Un chemin de fichier interne au
 * module casserait la macro au premier déplacement de source, sans qu'aucun
 * test hors Foundry ne puisse le voir.
 *
 * Non testable hors Foundry (game, documents, notifications) : la validation de
 * ce fichier est l'UAT elle-même.
 */

/**
 * Nombre d'exemplaires visé par défaut. Les decks de patron committés en pèsent
 * entre 19 et 23 : 20 place le deck tiré dans le même ordre de grandeur, donc
 * comparable à ce qu'un joueur compose à la main.
 *
 * @type {number}
 */
const DEFAULT_TARGET_SIZE = 20;

/**
 * Point d'entrée de la macro « Deck aléatoire ». Vide le deck du joueur puis le
 * regarnit depuis sa bibliothèque, sans jamais dépasser le nombre d'exemplaires
 * autorisé par carte (`system.fq.maxSameCard`).
 *
 * @param {object} [options]
 * @param {number} [options.targetSize=20] - Le nombre d'exemplaires visé.
 * @param {string} [options.userId]        - Le joueur ciblé (défaut : le premier
 *   user non-MJ du monde, c'est-à-dire « UAT Player »).
 *
 * @returns {Promise<void>}
 */
export async function generateRandomDeck({targetSize = DEFAULT_TARGET_SIZE, userId} = {}) {
    let step = "résolution du joueur";
    try {
        const user = userId ? game.users.get(userId) : game.users.find(candidate => !candidate.isGM);
        if (!user) {
            throw new Error("Aucun user joueur trouvé dans ce monde (attendu : UAT Player).");
        }

        step = "garde de combat";
        // Même règle que la bibliothèque du module : la composition d'un deck ne se
        // touche pas une fois le combat engagé. La macro n'a aucune raison d'y déroger.
        if (game.combat) {
            throw new Error("Un combat est en cours : terminez-le avant de recomposer le deck.");
        }

        step = "résolution de la bibliothèque et du deck";
        const spellBook = findFqDeck(user.id, "SPELLBOOK");
        if (!spellBook) {
            throw new Error(`${user.name} n'a pas de bibliothèque configurée.`);
        }
        const deck = findFqDeck(user.id, "DECK");
        if (!deck) {
            throw new Error(`${user.name} n'a pas de deck configuré.`);
        }

        const library = spellBook.cards.contents;
        if (library.length === 0) {
            throw new Error(`La bibliothèque de ${user.name} est vide : rien à tirer.`);
        }

        step = "vidage du deck";
        if (deck.cards.size > 0) {
            await deck.deleteEmbeddedDocuments("Card", deck.cards.map(card => card.id));
        }

        step = "tirage";
        const draw = drawRandomDeck(library, targetSize);

        step = "création des cartes";
        // `keepId: false` : chaque exemplaire doit recevoir son propre identifiant,
        // sans quoi les copies d'une même carte de bibliothèque entreraient en collision.
        await deck.createEmbeddedDocuments("Card", [...draw.cards], {keepId: false});

        ui.notifications.info(
            `Deck aléatoire de ${user.name} : ${draw.cards.length} exemplaire(s) `
            + `pour ${draw.titles} titre(s), tirés d'une bibliothèque de ${library.length} carte(s).`
        );
    } catch (err) {
        ui.notifications.error(`Deck aléatoire interrompu à l'étape « ${step} » : ${err.message}`);
        console.error(`fq-card-engine | uat-random-deck (étape: ${step})`, err);
    }
}

/**
 * Retrouve le jeu de cartes d'un type FQ appartenant à un joueur. Même prédicat
 * que la résolution de decks du module, réécrit ici pour que la macro ne dépende
 * d'aucun chemin de source interne.
 *
 * @param {string} userId - L'id du joueur propriétaire.
 * @param {string} typeFq - Le type FQ recherché (`SPELLBOOK`, `DECK`).
 *
 * @returns {object|undefined} Le jeu de cartes trouvé, ou `undefined`.
 */
function findFqDeck(userId, typeFq) {
    return game.cards.find(cards =>
        cards.ownership[userId] === 3
        && cards.system?.fq?.type === typeFq
        && cards.system?.fq?.owner === userId);
}

/**
 * Tire une composition au sort dans une bibliothèque : les titres sont parcourus
 * dans un ordre mélangé, et chacun apporte entre un exemplaire et son maximum,
 * jusqu'à atteindre la taille visée. Un titre n'est donc jamais dupliqué au-delà
 * de son `maxSameCard`, et la bibliothèque est parcourue au plus une fois — un
 * deck plus court que la cible signifie simplement qu'elle est trop petite.
 *
 * @param {object[]} library    - Les cartes de la bibliothèque.
 * @param {number}   targetSize - Le nombre d'exemplaires visé.
 *
 * @returns {{cards: object[], titles: number}} Les exemplaires tirés et le nombre de titres distincts.
 */
function drawRandomDeck(library, targetSize) {
    const cards = [];
    let titles = 0;

    for (const card of shuffle(library)) {
        const remaining = targetSize - cards.length;
        if (remaining <= 0) break;

        const rawMax = card.system?.fq?.maxSameCard;
        const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
        const copies = Math.min(max, remaining, 1 + Math.floor(Math.random() * max));

        for (let i = 0; i < copies; i++) cards.push(card);
        titles++;
    }

    return {cards, titles};
}

/**
 * Mélange une copie d'un tableau (Fisher-Yates). L'original n'est jamais muté :
 * `library` est la collection vivante du jeu de cartes de la bibliothèque.
 *
 * @param {object[]} items - Les éléments à mélanger.
 *
 * @returns {object[]} Un nouveau tableau, mélangé.
 */
function shuffle(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
