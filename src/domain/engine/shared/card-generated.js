/**
 * Cartes de compendium : résolution d'une référence `compendium.deck.carte` et
 * fabrication de copies « générées ». Module dédié, sans dépendance moteur ni
 * interface
 */
export default class CardGenerated {

    /**
     * Résout une référence `compendium.deck.carte` et renvoirt la carte concerné
     *
     * @param {string} reference - La référence `compendium.deck.carte`.
     *
     * @returns {Promise<Card|null>} La carte trouvée, ou null si la référence est irrésoluble.
     */
    static async resolveCompendiumCard(reference) {
        const parts = reference.split(".").map(part => part.trim());
        const byFullId = parts.length > 3 ? game.packs.get(parts.slice(0, 2).join(".")) : null;
        const pack = byFullId ?? (parts.length > 2 ? game.packs.find(p => p.metadata?.name === parts[0]) : null);
        const deckIndex = byFullId ? 2 : 1;
        const deck = pack ? (await pack.getDocuments()).find(doc => doc.name === parts[deckIndex]) : null;
        return deck?.cards.find(c => c.name === parts.slice(deckIndex + 1).join(".")) ?? null;
    }

    /**
     * Construit les données d'une copie « générée » d'une carte de compendium
     *
     * @param {Card} compendiumCard - La carte de compendium à copier.
     *
     * @returns {object} Les données prêtes pour `createEmbeddedDocuments("Card", …)`.
     */
    static buildGeneratedCardData(compendiumCard) {
        const data = compendiumCard.toObject();
        delete data._id;
        data.drawn = false;
        data.origin = null;
        data.face = data.face ?? 0;
        // Foundry n'écrit pas le dos d'une carte : il le dérive de son deck porteur
        // (`Card#prepareDerivedData`, via `origin`), et retombe sur son joker par
        // défaut à défaut de deck. Une copie générée n'a justement pas de deck
        // d'origine (`origin: null`) : le dos du deck de compendium copié est donc
        // figé ici, sans quoi la carte porterait le joker en main comme en défausse.
        data.back = {
            ...data.back,
            img: data.back?.img || compendiumCard.source?.img || compendiumCard.parent?.img || null
        };
        CardGenerated.stampGeneratedPassives(data.system?.fq?.choices);
        const moduleName = globalThis.FqCardEngineModule?.moduleName;
        data.flags = {...data.flags, [moduleName]: {...data.flags?.[moduleName], generated: true, generatedAt: Date.now()}};
        return data;
    }

    /**
     * Horodate au round courant les choix passifs d'une carte générée
     *
     * @param {object[]} [choices] - Les choix de la carte générée, modifiés sur place.
     *
     * @returns {void}
     */
    static stampGeneratedPassives(choices) {
        for (const choice of choices ?? []) {
            if (choice?.replayable === "passif" && choice?.hasBeenPlayed) {
                choice.passivePlayedRound = game.combat?.round?.toString() ?? "";
            }
        }
    }
}
