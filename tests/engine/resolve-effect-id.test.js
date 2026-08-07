import {afterEach, describe, expect, it, vi} from "vitest";
import CardEffect from "../../src/domain/engine/shared/card-effect.js";

// card-effect.js importe `{socket}` depuis socketlib.hook.js (qui enregistre un
// hook et tire une chaîne d'imports au chargement) : on le neutralise. La
// résolution testée ici n'utilise pas le socket.
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {executeAsGM: vi.fn()}
}));

/**
 * Phase 10 — `CardEffect.resolveEffectIdToRemove` : résolution de l'id de l'effet
 * à retirer, isolée de `removeEffectOnTargets`. Branche nom exact = pure et
 * testable sans DOM ; branche « @choose » testée en stubbant `DialogV2.prompt`.
 */
describe("CardEffect.resolveEffectIdToRemove", () => {
    const effects = [{id: "a", name: "X"}, {id: "b", name: "Y"}];

    describe("mode nom exact", () => {
        it("renvoie l'id de l'effet dont le name correspond exactement", async () => {
            expect(await CardEffect.resolveEffectIdToRemove(effects, "Y")).toBe("b");
        });

        it("renvoie undefined si aucun name ne correspond", async () => {
            expect(await CardEffect.resolveEffectIdToRemove(effects, "Z")).toBeUndefined();
        });

        it("renvoie undefined sur une liste d'effets vide", async () => {
            expect(await CardEffect.resolveEffectIdToRemove([], "X")).toBeUndefined();
        });
    });

    describe("mode @choose", () => {
        afterEach(() => {
            delete globalThis.foundry;
        });

        it("ouvre la dialog et renvoie l'id choisi (DialogV2.prompt stubbé)", async () => {
            const prompt = vi.fn(async () => "b");
            globalThis.foundry = {applications: {api: {DialogV2: {prompt}}}};
            globalThis.game = {i18n: {localize: vi.fn(str => str)}};

            expect(await CardEffect.resolveEffectIdToRemove(effects, "@choose")).toBe("b");
            expect(prompt).toHaveBeenCalledOnce();
        });

        it("renvoie undefined si la dialog est annulée (prompt rejeté)", async () => {
            const prompt = vi.fn(async () => {
                throw new Error("dismissed");
            });
            globalThis.foundry = {applications: {api: {DialogV2: {prompt}}}};
            globalThis.game = {i18n: {localize: vi.fn(str => str)}};

            expect(await CardEffect.resolveEffectIdToRemove(effects, "@choose")).toBeUndefined();
        });
    });
});
