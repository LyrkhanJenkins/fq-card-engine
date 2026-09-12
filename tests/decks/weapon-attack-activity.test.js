import {describe, expect, it} from "vitest";
import fs from "fs";
import path from "path";
import {SOURCE_DIR, jsonFiles} from "./pack-source.js";

/**
 * Toute arme doit porter une activité d'ATTAQUE.
 *
 * C'est elle, et elle seule, qui expose `getAttackData` — la donnée dont
 * `HitProfile` tire le modificateur de toucher. Une arme restée sur une simple
 * activité de dégâts rend donc un modificateur de 0, silencieusement : le jet se
 * fait à `1d20 + 0` contre la classe d'armure, et personne ne touche plus rien.
 *
 * Le piège de ce dépôt est que les armes existent en PLUSIEURS exemplaires : la
 * référence dans `items-fq8` et les copies embarquées dans l'inventaire des
 * sbires. Convertir la référence sans ses copies laisse
 * le jeu à moitié réparé — c'est arrivé deux fois. Ce test balaie donc tous les
 * paquets et tous les inventaires embarqués.
 */

/**
 * Toutes les armes d'un document : le document lui-même s'il en est une, et
 * celles que porte son inventaire.
 *
 * @param {object} doc  - Le document racine du fichier.
 * @param {string} file - Le chemin du fichier, pour nommer les échecs.
 *
 * @returns {Array<{label: string, weapon: object}>} Les armes trouvées.
 */
function weaponsOf(doc, file) {
    const name = path.basename(file);
    const found = [];
    if (doc.type === "weapon") {
        found.push({label: `${name} :: ${doc.name}`, weapon: doc});
    }
    for (const item of doc.items ?? []) {
        if (item.type === "weapon") {
            found.push({label: `${name} :: ${doc.name} porte « ${item.name} »`, weapon: item});
        }
    }
    return found;
}

const weapons = jsonFiles(SOURCE_DIR).flatMap(file =>
    weaponsOf(JSON.parse(fs.readFileSync(file, "utf8")), file));

describe("Armes des paquets source", () => {

    it("balaie effectivement des armes", () => {
        // Garde du garde : un chemin cassé rendrait le test suivant vert à vide.
        expect(weapons.length).toBeGreaterThan(10);
    });

    it("chaque arme porte une activité d'attaque", () => {
        const orphans = weapons
            .filter(({weapon}) => !Object.values(weapon.system?.activities ?? {})
                .some(activity => activity.type === "attack"))
            .map(({label, weapon}) => {
                const types = Object.values(weapon.system?.activities ?? {}).map(a => a.type);
                return `${label} — activités : ${types.join(", ") || "aucune"}`;
            });

        expect(orphans).toEqual([]);
    });
});
