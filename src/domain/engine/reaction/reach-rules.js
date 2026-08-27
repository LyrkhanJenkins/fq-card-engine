/**
 * Règles de franchissement de portée : prédicats PURS appliqués à un profil de
 * distances (produit par `reach-profile.js`). Aucune lecture de `game`, de
 * `canvas`, d'acteur ni d'item — tout ce qui dépend du monde est injecté par
 * l'appelant sous forme de callbacks. C'est ce qui rend ces règles testables
 * sans Foundry, et indépendantes de la source des distances.
 *
 * UNITÉ : distances ET portées sont exprimées en CASES — géométrie Manhattan
 * multi-cases du moteur FQ (cf. `Geometry`), la même que celle du ciblage des
 * cartes. Jamais en pieds. La conversion depuis la portée d'arme dnd5e est
 * faite en amont par `ReachProfile.reachToCases`.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ReachRules {

    /**
     * Franchissement SORTANT d'une portée : le mobile était à portée au départ du
     * trajet et ne l'est plus à l'arrivée. C'est le déclencheur de l'attaque
     * d'opportunité.
     *
     * Le prédicat ne regarde que les EXTRÉMITÉS du profil, jamais les points
     * intermédiaires. Deux conséquences voulues :
     * - un trajet qui sort de la portée puis y revient ne provoque pas, puisque
     *   le mobile termine au contact ;
     * - un éloignement découpé en plusieurs déplacements ne déclenche qu'UNE
     *   fois, sur celui où la limite est effectivement franchie.
     *
     * Vérifié en jeu dans les deux modes d'entrée : au glisser (Foundry livre le
     * profil complet en un seul événement) comme au clavier (un événement par
     * pas, profil à deux points).
     *
     * @param {number[]} distances - Le profil de distances (en cases) le long du trajet, origine incluse.
     * @param {number}   reach     - La portée (en cases). Nulle, négative ou non finie = aucun franchissement.
     *
     * @returns {boolean} `true` si le trajet fait sortir le mobile de la portée.
     */
    static crossedOutward(distances, reach) {
        if (!Array.isArray(distances) || distances.length < 2) {
            return false;
        }
        if (!Number.isFinite(reach) || reach <= 0) {
            return false;
        }
        const from = distances[0];
        const to = distances[distances.length - 1];
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
            return false;
        }
        return from <= reach && to > reach;
    }

    /**
     * Observateurs provoqués par un déplacement : ceux qui sont hostiles au mobile
     * ET dont le trajet franchit leur portée vers l'extérieur.
     *
     * L'hostilité et la portée sont injectées plutôt que déduites ici, pour deux
     * raisons distinctes :
     * - la disposition Foundry est relative au groupe des joueurs, pas pairwise :
     *   deux tokens hostiles ne sont pas hostiles entre eux. La règle appartient
     *   donc à l'appelant, pas à ce prédicat ;
     * - la portée suppose de résoudre l'arme équipée, donc de lire des items.
     *
     * `isHostile` est évalué AVANT `reachOf` : le filtre le moins coûteux d'abord,
     * la résolution d'arme n'étant tentée que sur les observateurs retenus.
     *
     * Ni `isHostile` ni `reachOf` ne sont protégés contre une exception : c'est à
     * l'appelant (handler de hook) d'isoler la levée, pour ne pas masquer ici une
     * erreur de configuration du monde.
     *
     * @param {Array<{observer: object, distances: number[]}>} profiles - Les profils de distance par observateur.
     * @param {function(object): number}  reachOf   - La portée (en cases) d'un observateur.
     * @param {function(object): boolean} isHostile - L'hostilité d'un observateur envers le mobile.
     *
     * @returns {Array<{observer: object, reach: number}>} Les observateurs provoqués et la portée retenue.
     */
    static provokers(profiles, reachOf, isHostile) {
        if (!Array.isArray(profiles)) {
            return [];
        }
        const provoked = [];
        for (const profile of profiles) {
            if (!profile || !isHostile(profile.observer)) {
                continue;
            }
            const reach = reachOf(profile.observer);
            if (ReachRules.crossedOutward(profile.distances, reach)) {
                provoked.push({observer: profile.observer, reach});
            }
        }
        return provoked;
    }
}
