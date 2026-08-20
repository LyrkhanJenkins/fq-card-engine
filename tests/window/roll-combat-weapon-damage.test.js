import {afterEach, describe, expect, test, vi} from "vitest";

// ─── Mocks des feuilles Foundry (couplées à dnd5e / DOM, hors périmètre ici) ──
// Couture identique à play-dialog.test.js : vi.mock est hissé PAR FICHIER
// (limitation Vitest), donc redéclaré ici.
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

// Import dynamique APRÈS les mocks : peuple window.FqCardEngineModule sans
// dépendre du rendu DOM réel.
await import("../../src/init-engine.js");
const WeaponDamage = (await import("../../src/domain/engine/roll/weapon-damage.js")).default;

/**
 * Entrée macro `FqCardEngineModule.rollCurrentCombattantWeaponDamage` : ne
 * délègue à `WeaponDamage.useFirstEquippedWeapon` (avec le jeton d'arme reçu)
 * que si un combat est démarré et que le combattant courant est un acteur
 * contrôlé par l'utilisateur ; avertit « hors de son tour » sinon.
 */
describe("FqCardEngineModule.rollCurrentCombattantWeaponDamage", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        game.combat = undefined;
    });

    test("aucun combat démarré : avertit « hors de son tour » sans utiliser d'arme", () => {
        game.combat = undefined;
        const useSpy = vi.spyOn(WeaponDamage, "useFirstEquippedWeapon").mockImplementation(() => {});

        window.FqCardEngineModule.rollCurrentCombattantWeaponDamage();

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgPlayOutOfHisRound");
        expect(useSpy).not.toHaveBeenCalled();
    });

    test("combat créé mais non démarré : avertit « hors de son tour » sans utiliser d'arme", () => {
        game.combat = {started: false, combatant: {actor: {isOwner: true}}};
        const useSpy = vi.spyOn(WeaponDamage, "useFirstEquippedWeapon").mockImplementation(() => {});

        window.FqCardEngineModule.rollCurrentCombattantWeaponDamage();

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgPlayOutOfHisRound");
        expect(useSpy).not.toHaveBeenCalled();
    });

    test("combattant courant non contrôlé par l'utilisateur : avertit « hors de son tour »", () => {
        game.combat = {started: true, combatant: {actor: {isOwner: false}}};
        const useSpy = vi.spyOn(WeaponDamage, "useFirstEquippedWeapon").mockImplementation(() => {});

        window.FqCardEngineModule.rollCurrentCombattantWeaponDamage();

        expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.WarningMsgPlayOutOfHisRound");
        expect(useSpy).not.toHaveBeenCalled();
    });

    test("combat démarré et tour d'un token contrôlé : utilise l'arme du type demandé", () => {
        const actor = {isOwner: true};
        game.combat = {started: true, combatant: {actor}};
        const useSpy = vi.spyOn(WeaponDamage, "useFirstEquippedWeapon").mockImplementation(() => {});

        window.FqCardEngineModule.rollCurrentCombattantWeaponDamage("@wpnM");

        expect(useSpy).toHaveBeenCalledWith(actor, "@wpnM");
        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
});
