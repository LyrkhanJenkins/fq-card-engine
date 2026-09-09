import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import {SOURCE_DIR, jsonFiles} from "./pack-source.js";

/**
 * Intégrité des CLÉS des paquets source.
 *
 * `_key` est la clé primaire LevelDB d'un document : c'est elle, et non `_id`,
 * que `build:db` utilise pour écrire l'entrée. Deux documents qui la partagent
 * ne cohabitent pas — le second écrase le premier à la compilation, et le
 * paquet compilé sort incohérent : des cartes disparaissent, le deck qui les
 * référence ne se charge plus, et Foundry rend les documents inutilisables.
 *
 * Le piège est traître parce qu'il ne se voit PAS dans les sources : le JSON
 * reste valide, les `_id` peuvent être uniques, et tout se passe bien jusqu'à
 * la compilation. Copier une carte existante pour en fabriquer une nouvelle
 * suffit à le déclencher si l'on ne reprend que son `_id`.
 *
 * Ce test balaie donc TOUS les paquets source, pas seulement les decks.
 */

/**
 * Les documents porteurs d'une clé d'un fichier de paquet : le document
 * lui-même, et les cartes qu'il embarque le cas échéant.
 *
 * @param {object} doc  - Le document racine du fichier.
 * @param {string} file - Le chemin du fichier, pour les messages d'échec.
 *
 * @returns {Array<{label: string, id: string, key: string}>} Les documents à contrôler.
 */
function keyedDocuments(doc, file) {
    const name = path.basename(file);
    const documents = [{label: `${name} (racine)`, id: doc._id, key: doc._key}];
    for (const card of doc.cards ?? []) {
        documents.push({label: `${name} :: carte ${card.name ?? card._id}`, id: card._id, key: card._key});
    }
    return documents.filter(entry => entry.key);
}

const documents = jsonFiles(SOURCE_DIR).flatMap(file =>
    keyedDocuments(JSON.parse(fs.readFileSync(file, "utf8")), file));

describe("Intégrité des clés des paquets source", () => {

    it("balaie effectivement des documents", () => {
        // Garde du garde : un chemin de source cassé rendrait tous les autres
        // tests de ce fichier verts sans rien avoir vérifié.
        expect(documents.length).toBeGreaterThan(100);
    });

    it("chaque `_key` désigne le `_id` de son propre document", () => {
        const mismatched = documents
            .filter(entry => entry.id && !entry.key.endsWith(`.${entry.id}`) && !entry.key.endsWith(`!${entry.id}`))
            .map(entry => `${entry.label} : _id ${entry.id} mais _key ${entry.key}`);

        expect(mismatched).toEqual([]);
    });

    it("aucune `_key` n'est portée par deux documents", () => {
        const seen = new Map();
        const duplicates = [];
        for (const entry of documents) {
            if (seen.has(entry.key)) {
                duplicates.push(`${entry.key} : ${seen.get(entry.key)} et ${entry.label}`);
            }
            seen.set(entry.key, entry.label);
        }

        expect(duplicates).toEqual([]);
    });
});
