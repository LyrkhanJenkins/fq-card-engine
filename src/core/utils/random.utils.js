/**
 * Helpers de tirage aléatoire, sans logique métier FQ ni dépendance module.
 */

/**
 * Tire au hasard `count` éléments DISTINCTS d'un vivier, par mélange de
 * Fisher-Yates partiel : seuls les `count` premiers rangs sont mélangés, le
 * reste du vivier n'est jamais parcouru. Le vivier fourni n'est pas modifié.
 * Un `count` négatif, nul ou supérieur à la taille du vivier est ramené aux
 * bornes (`0` … taille du vivier).
 *
 * @param {*[]}    items - Le vivier de départ.
 * @param {number} count - Le nombre d'éléments souhaité.
 *
 * @returns {*[]} Les éléments tirés (au plus `count`, sans doublon).
 */
export function sampleItems(items, count) {
    const pool = [...items];
    const n = Math.max(0, Math.min(count, pool.length));
    for (let i = 0; i < n; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}
