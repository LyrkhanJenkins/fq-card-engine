import fs from "fs";
import path from "path";

/**
 * Lecture des paquets SOURCE, partagée par les gardes de données.
 *
 * Ces gardes (`pack-keys`, `weapon-attack-activity`, `class-proficiencies`)
 * lisent le JSON du dépôt tel quel, sans monter de monde ni simuler Foundry :
 * elles n'ont donc rien à voir avec `corpus-helpers.js`, qui traîne tout le
 * harnais de jeu et s'importe dynamiquement après les `vi.mock`. D'où ce module
 * minuscule, sans dépendance, importable normalement.
 */

/** La racine des paquets source. */
export const SOURCE_DIR = path.join(process.cwd(), "packs", "_source");

/**
 * Tous les fichiers JSON d'un dossier de paquet, en descendant les sous-dossiers.
 *
 * @param {string} dir - Le dossier à parcourir.
 *
 * @returns {string[]} Les chemins des fichiers JSON.
 */
export function jsonFiles(dir) {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? jsonFiles(full) : entry.name.endsWith(".json") ? [full] : [];
    });
}

/**
 * Les documents d'un dossier de paquet, désérialisés.
 *
 * @param {string} dir - Le dossier à parcourir.
 *
 * @returns {object[]} Les documents.
 */
export function documents(dir) {
    return jsonFiles(dir).map(file => JSON.parse(fs.readFileSync(file, "utf8")));
}
