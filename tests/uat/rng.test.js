import {describe, expect, it} from "vitest";
import {createRng} from "../script/uat/rng.mjs";

/**
 * Couvre le contrat de déterminisme du PRNG (UAT-01, D-04) : deux
 * `createRng(seed)` égaux produisent des suites strictement identiques, et
 * chaque primitive respecte ses bornes.
 */

describe("createRng", () => {
    it("est déterministe : deux flux amorcés par la même graine sont identiques", () => {
        const a = createRng(4242);
        const b = createRng(4242);

        const sequenceA = Array.from({length: 100}, () => a.next());
        const sequenceB = Array.from({length: 100}, () => b.next());

        expect(sequenceA).toEqual(sequenceB);
    });

    it("produit des suites différentes pour deux graines différentes", () => {
        const a = createRng(4242);
        const b = createRng(1337);

        const sequenceA = Array.from({length: 20}, () => a.next());
        const sequenceB = Array.from({length: 20}, () => b.next());

        expect(sequenceA).not.toEqual(sequenceB);
    });

    it("int() reste dans [min, max] et atteint les deux bornes", () => {
        const rng = createRng(4242);
        const min = 3;
        const max = 7;
        let sawMin = false;
        let sawMax = false;

        for (let i = 0; i < 10000; i++) {
            const value = rng.int(min, max);
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(max);
            if (value === min) sawMin = true;
            if (value === max) sawMax = true;
        }

        expect(sawMin).toBe(true);
        expect(sawMax).toBe(true);
    });

    it("sample() ne rend jamais de doublon et jamais plus de n éléments", () => {
        const rng = createRng(4242);
        const source = Array.from({length: 12}, (_, i) => i);

        const result = rng.sample(source, 5);

        expect(result.length).toBeLessThanOrEqual(5);
        expect(new Set(result).size).toBe(result.length);
        for (const value of result) {
            expect(source).toContain(value);
        }
    });

    it("sample() rend au plus la longueur du tableau source, sans erreur", () => {
        const rng = createRng(4242);
        const result = rng.sample(["a", "b"], 5);

        expect(result.length).toBe(2);
        expect(new Set(result).size).toBe(2);
    });

    it("shuffle() ne mute pas l'entrée et conserve le multi-ensemble", () => {
        const rng = createRng(4242);
        const source = [1, 2, 3, 4, 5];
        const original = source.slice();

        const shuffled = rng.shuffle(source);

        expect(source).toEqual(original);
        expect(shuffled.slice().sort()).toEqual(original.slice().sort());
    });

    it("float() reste dans [min, max)", () => {
        const rng = createRng(4242);
        for (let i = 0; i < 1000; i++) {
            const value = rng.float(2, 5);
            expect(value).toBeGreaterThanOrEqual(2);
            expect(value).toBeLessThan(5);
        }
    });

    it("bool() rend toujours false à probabilité 0 et toujours true à probabilité 1", () => {
        const rng = createRng(4242);
        for (let i = 0; i < 50; i++) {
            expect(rng.bool(0)).toBe(false);
            expect(rng.bool(1)).toBe(true);
        }
    });

    it("weighted() ne rend que des valeurs présentes dans les entrées", () => {
        const rng = createRng(4242);
        const entries = [{value: "a", weight: 1}, {value: "b", weight: 3}];

        for (let i = 0; i < 100; i++) {
            expect(["a", "b"]).toContain(rng.weighted(entries));
        }
    });
});
