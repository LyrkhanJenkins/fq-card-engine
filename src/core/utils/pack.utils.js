/**
 * Résolution des compendiums FQ à travers les modules.
 *
 * Le moteur ne suppose pas que son propre module fournit tout le contenu : un
 * module de contenu peut livrer des decks, des sbires ou des macros sous LE MÊME
 * nom de compendium (`decks-pattern-fq8`, `minions-fq8`, …). Chercher le pack par
 * son identifiant complet ne trouverait que celui du moteur, et les cartes d'une
 * classe apportée par un autre module resteraient invisibles — un joueur de cette
 * classe n'aurait simplement pas de deck.
 *
 * Le module du moteur passe TOUJOURS en premier : en cas d'homonymie entre deux
 * documents (deux « Witch Base »), c'est le sien qui gagne, et l'ordre ne dépend
 * pas de l'ordre de chargement des modules.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class PackUtils {

    /**
     * Les compendiums portant ce nom, dans tous les modules qui en fournissent
     * un : celui du moteur d'abord, les autres ensuite dans leur ordre de
     * déclaration.
     *
     * @param {string} packName - Le nom du compendium (`"decks-pattern-fq8"`).
     *
     * @returns {object[]} Les compendiums trouvés, éventuellement aucun.
     */
    static packsNamed(packName) {
        const ownCollection = `${FqCardEngineModule.moduleName}.${packName}`;
        const own = game.packs.get(ownCollection);
        const others = game.packs.filter(
            pack => pack.metadata?.name === packName && pack.collection !== ownCollection);
        return [own, ...others].filter(Boolean);
    }

    /**
     * Les documents de tous les compendiums portant ce nom, concaténés dans
     * l'ordre de `packsNamed`.
     *
     * Remplace `game.packs.get(moduleName + "." + packName).getDocuments()` :
     * même résultat quand le moteur est seul, et les documents des modules de
     * contenu en plus quand il y en a.
     *
     * @param {string} packName - Le nom du compendium (`"minions-fq8"`).
     *
     * @returns {Promise<object[]>} Les documents trouvés, éventuellement aucun.
     */
    static async documentsFrom(packName) {
        const documents = [];
        for (const pack of PackUtils.packsNamed(packName)) {
            documents.push(...await pack.getDocuments());
        }
        return documents;
    }
}
