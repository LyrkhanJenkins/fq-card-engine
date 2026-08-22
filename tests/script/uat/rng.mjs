/**
 * PRNG déterministe local (algorithme mulberry32), sans dépendance externe (D-04).
 * Amorcé par une graine entière, il garantit qu'une même graine produit toujours
 * la même séquence — c'est cette propriété qui rend un plan UAT reproductible.
 */

/**
 * Construit un générateur mulberry32 amorcé par `seed`.
 *
 * @param {number} seed - La graine entière (tronquée en 32 bits non signés).
 *
 * @returns {function(): number} Une fonction produisant un flottant dans [0, 1) à chaque appel.
 */
export function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Construit un objet RNG déterministe amorcé par `seed`, exposant les primitives
 * de tirage utilisées par le générateur de mondes UAT.
 *
 * Toutes les méthodes consomment le même flux `next()` sous-jacent : l'ORDRE
 * dans lequel elles sont appelées fait donc partie intégrante du contrat de
 * déterminisme. Deux appelants qui invoquent les primitives dans un ordre
 * différent, même à graine égale, obtiennent des résultats différents.
 *
 * @param {number} seed - La graine entière du générateur.
 *
 * @returns {{
 *   next: function(): number,
 *   int: function(number, number): number,
 *   pick: function(Array): *,
 *   float: function(number, number): number,
 *   bool: function(number=): boolean,
 *   sample: function(Array, number): Array,
 *   shuffle: function(Array): Array,
 *   weighted: function(Array<{value: *, weight: number}>): *
 * }} Un objet RNG dont chaque méthode consomme l'état interne du PRNG.
 */
export function createRng(seed) {
    const next = mulberry32(seed);

    return {
        next,

        /**
         * Tire un entier dans [min, max], bornes incluses.
         *
         * @param {number} min - La borne basse (incluse).
         * @param {number} max - La borne haute (incluse).
         *
         * @returns {number} L'entier tiré.
         */
        int(min, max) {
            return min + Math.floor(next() * (max - min + 1));
        },

        /**
         * Tire un élément au hasard dans un tableau non vide.
         *
         * @param {Array} array - Le tableau candidat.
         *
         * @returns {*} L'élément tiré.
         */
        pick(array) {
            return array[this.int(0, array.length - 1)];
        },

        /**
         * Tire un flottant dans [min, max).
         *
         * @param {number} min - La borne basse (incluse).
         * @param {number} max - La borne haute (exclue).
         *
         * @returns {number} Le flottant tiré.
         */
        float(min, max) {
            return min + next() * (max - min);
        },

        /**
         * Tire un booléen, vrai avec la probabilité `probability`.
         *
         * @param {number} [probability=0.5] - La probabilité de rendre `true`, dans [0, 1].
         *
         * @returns {boolean} Le booléen tiré.
         */
        bool(probability = 0.5) {
            return next() < probability;
        },

        /**
         * Tire sans remise jusqu'à `n` éléments distincts d'un tableau, sans muter l'entrée.
         * Rend un tableau plus court que `n` si le tableau source est plus petit — jamais d'erreur.
         *
         * @param {Array} array - Le tableau source (non muté).
         * @param {number} n    - Le nombre d'éléments souhaités.
         *
         * @returns {Array} Un tableau d'au plus `n` éléments, sans doublon d'index source.
         */
        sample(array, n) {
            const remaining = array.slice();
            const result = [];
            const count = Math.min(n, remaining.length);
            for (let i = 0; i < count; i++) {
                const index = this.int(0, remaining.length - 1);
                result.push(remaining[index]);
                remaining.splice(index, 1);
            }
            return result;
        },

        /**
         * Mélange de Fisher-Yates : rend une copie mélangée du tableau, sans muter l'entrée.
         *
         * @param {Array} array - Le tableau source (non muté).
         *
         * @returns {Array} Une copie mélangée, de même multi-ensemble d'éléments.
         */
        shuffle(array) {
            const copy = array.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = this.int(0, i);
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },

        /**
         * Tirage pondéré sur une liste d'entrées `{value, weight}`. Les poids n'ont pas
         * besoin de sommer à 1 : ils sont normalisés par leur somme totale.
         *
         * @param {Array<{value: *, weight: number}>} entries - Les entrées candidates (non vide, poids positifs).
         *
         * @returns {*} La `value` de l'entrée tirée.
         */
        weighted(entries) {
            const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
            let roll = next() * total;
            for (const entry of entries) {
                roll -= entry.weight;
                if (roll <= 0) return entry.value;
            }
            return entries[entries.length - 1].value;
        }
    };
}
