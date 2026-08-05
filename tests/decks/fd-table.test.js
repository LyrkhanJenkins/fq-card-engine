import {describe, expect, test} from "vitest";
import fs from "fs";
import path from "path";
import {defaultFdFor} from "./fd-table.js";

describe("defaultFdFor — saisies dialogue par défaut auto", () => {
    test("fd.XXX égale xmin quand la carte en déclare une borne", () => {
        const choice = {xmin: "2", xmax: "5", minions: []};
        const fd = defaultFdFor({name: "Carte Test"}, choice);
        expect(fd.XXX).toBe(2);
    });

    test("fd.XXX vaut 0 par défaut quand aucune borne xmin n'est déclarée", () => {
        const choice = {xmin: "", minions: []};
        const fd = defaultFdFor({name: "Carte Test"}, choice);
        expect(fd.XXX).toBe(0);
    });

    test("fd.YYY égale ymin quand la carte en déclare une borne", () => {
        const choice = {ymin: "3", minions: []};
        const fd = defaultFdFor({name: "Carte Test"}, choice);
        expect(fd.YYY).toBe(3);
    });

    test("sélectionne exactement choice.minions.length emplacements de sbire (up/down/left/right)", () => {
        const choiceOne = {minions: [{name: "Squelette"}]};
        const fdOne = defaultFdFor({name: "Carte Test"}, choiceOne);
        const selectedOne = ["minionUp", "minionDown", "minionLeft", "minionRight"].filter(k => fdOne[k]);
        expect(selectedOne).toHaveLength(1);

        const choiceTwo = {minions: [{name: "Squelette"}, {name: "Gobelin"}]};
        const fdTwo = defaultFdFor({name: "Carte Test"}, choiceTwo);
        const selectedTwo = ["minionUp", "minionDown", "minionLeft", "minionRight"].filter(k => fdTwo[k]);
        expect(selectedTwo).toHaveLength(2);
    });

    test("aucun emplacement de sbire sélectionné quand la carte n'en déclare pas", () => {
        const fd = defaultFdFor({name: "Carte Test"}, {minions: []});
        expect(fd.minionUp).toBe(false);
        expect(fd.minionDown).toBe(false);
        expect(fd.minionLeft).toBe(false);
        expect(fd.minionRight).toBe(false);
    });

    test("fd.down vaut toujours false par défaut", () => {
        const fd = defaultFdFor({name: "Carte Test"}, {minions: []});
        expect(fd.down).toBe(false);
    });

    test("fd.nameContent reprend le nom du choix quand il est renseigné", () => {
        const fd = defaultFdFor({name: "Carte Test"}, {name: "ChoixA", minions: []});
        expect(fd.nameContent).toBe("ChoixA");
    });

    test("un override explicite de CARD_OVERRIDES prime sur le défaut auto", async () => {
        const {CARD_OVERRIDES} = await import("./fd-table.js");
        CARD_OVERRIDES["Carte Overridée"] = () => ({XXX: 42});
        const fd = defaultFdFor({name: "Carte Overridée"}, {xmin: "2", minions: []});
        expect(fd.XXX).toBe(42);
        delete CARD_OVERRIDES["Carte Overridée"];
    });
});

describe("world-fixture.json — monde partagé", () => {
    test("est un JSON valide, parsable, avec la géométrie attendue (distance 1)", () => {
        const fixturePath = path.join(process.cwd(), "tests", "decks", "world-fixture.json");
        const raw = fs.readFileSync(fixturePath, "utf-8");
        const fixture = JSON.parse(raw);

        expect(fixture.gridSize).toBe(5);
        expect(fixture.myToken).toEqual({x: 5, y: 5, width: 1, height: 1});
        expect(fixture.target.x).toBe(0);
        expect(fixture.target.y).toBe(5);

        const dist = (Math.abs(fixture.myToken.x - fixture.target.x) + Math.abs(fixture.myToken.y - fixture.target.y)) / fixture.gridSize;
        expect(dist).toBe(1);
    });
});
