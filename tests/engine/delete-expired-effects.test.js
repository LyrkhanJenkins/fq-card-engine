import {describe, expect, it, vi} from "vitest";
import CombatTurn from "../../src/domain/engine/combat-turn.js";

/**
 * `CombatTurn.deleteExpiredEffects(actor)` : suppression des effets temporaires
 * expirés, SCOPÉE à l'acteur fourni (le combattant courant). Appelé au début de
 * son tour, il retire ainsi les effets au tour de l'acteur affecté (pas au round).
 * On vérifie le filtrage (isTemporary + duration.remaining ≤ 0) et le no-op sans acteur.
 */
describe("CombatTurn.deleteExpiredEffects — scopé à l'acteur", () => {

    function effect({remaining, temporary = true}) {
        return {
            isTemporary: temporary,
            duration: {remaining},
            delete: vi.fn().mockResolvedValue(undefined),
        };
    }

    it("supprime uniquement les effets temporaires expirés (remaining ≤ 0) de l'acteur", async () => {
        const expired = effect({remaining: 0});
        const alsoExpired = effect({remaining: -2});
        const stillActive = effect({remaining: 3});
        const nonTemporary = effect({remaining: 0, temporary: false});
        const actor = {appliedEffects: [expired, alsoExpired, stillActive, nonTemporary]};

        await CombatTurn.deleteExpiredEffects(actor);

        expect(expired.delete).toHaveBeenCalledTimes(1);
        expect(alsoExpired.delete).toHaveBeenCalledTimes(1);
        expect(stillActive.delete).not.toHaveBeenCalled();
        expect(nonTemporary.delete).not.toHaveBeenCalled();
    });

    it("ignore les effets dont remaining est null (durée non bornée)", async () => {
        const unbounded = effect({remaining: null});
        const actor = {appliedEffects: [unbounded]};

        await CombatTurn.deleteExpiredEffects(actor);

        expect(unbounded.delete).not.toHaveBeenCalled();
    });

    it("no-op si aucun acteur (combattant sans acteur)", async () => {
        await expect(CombatTurn.deleteExpiredEffects(undefined)).resolves.toBeUndefined();
        await expect(CombatTurn.deleteExpiredEffects(null)).resolves.toBeUndefined();
    });
});
