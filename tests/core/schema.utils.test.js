import {describe, expect, it} from "vitest";
import {mergeSchema} from "../../src/core/utils/schema.utils.js";

describe("mergeSchema", () => {

    it("fusionne les champs disjoints de b dans a", () => {
        const a = {x: 1};
        const r = mergeSchema(a, {y: 2});

        expect(r).toEqual({x: 1, y: 2});
    });

    it("mute a sur place et renvoie la même référence", () => {
        const a = {x: 1};
        const r = mergeSchema(a, {y: 2});

        expect(r).toBe(a);
    });

    it("écrase les champs de a par ceux de b en cas de conflit", () => {
        expect(mergeSchema({k: 1}, {k: 9}).k).toBe(9);
    });
});
