import {afterEach, describe, expect, it, vi} from "vitest";
import {
    presentResult, registerResultBroadcaster, registerResultPresenter
} from "../../src/domain/engine/roll/result-presenter.js";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";

/**
 * Point d'entrée de l'affichage du résultat. Sa seule règle dure : il ne doit
 * JAMAIS lever ni bloquer — les dégâts, les effets et les points de vie sont
 * appliqués juste après, et une animation défaillante ne doit pas les retenir.
 */

/**
 * Rapport porteur d'un jet : un rapport vide n'est ni diffusé ni présenté, ce
 * que vérifie son propre test plus bas.
 *
 * @returns {RollReport} Le rapport.
 */
function reportWithRoll() {
    const report = new RollReport();
    report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});
    return report;
}

afterEach(() => {
    registerResultPresenter(null);
    registerResultBroadcaster(null);
    vi.restoreAllMocks();
});

describe("presentResult", () => {

    it("ne fait rien tant qu'aucune interface ne s'est annoncée", async () => {
        await expect(presentResult(reportWithRoll())).resolves.toBeUndefined();
    });

    it("passe le rapport au présentateur enregistré et attend sa fin", async () => {
        const order = [];
        registerResultPresenter(async (report) => {
            order.push(["debut", report]);
            await new Promise(resolve => setTimeout(resolve, 5));
            order.push(["fin"]);
        });
        const report = reportWithRoll();

        await presentResult(report);

        expect(order[0][1]).toBe(report);
        expect(order.at(-1)[0]).toBe("fin");
    });

    it("avale l'erreur d'un présentateur défaillant : la résolution continue", async () => {
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        registerResultPresenter(async () => {
            throw new Error("le calque a explosé");
        });

        await expect(presentResult(reportWithRoll())).resolves.toBeUndefined();
        expect(logged).toHaveBeenCalled();
    });

    it("n'ouvre ni fenêtre ni socket pour un rapport sans jet ni résultat", async () => {
        const presented = vi.fn();
        const broadcast = vi.fn();
        registerResultPresenter(presented);
        registerResultBroadcaster(broadcast);

        await presentResult(new RollReport());

        expect(presented).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
    });

    describe("diffusion aux autres joueurs", () => {

        it("envoie le rapport sous sa forme nue, jamais l'instance", async () => {
            const sent = [];
            registerResultBroadcaster(payload => sent.push(payload));
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

            await presentResult(report);

            expect(sent).toHaveLength(1);
            expect(sent[0]).not.toBe(report);
            expect(sent[0]).toEqual(JSON.parse(JSON.stringify(sent[0])));
            expect(sent[0].mainRoll.total).toBe(3);
        });

        it("diffuse avant de jouer l'animation locale : les autres absorbent la latence", async () => {
            const order = [];
            registerResultBroadcaster(() => order.push("diffusion"));
            registerResultPresenter(async () => order.push("animation"));

            await presentResult(reportWithRoll());

            expect(order).toEqual(["diffusion", "animation"]);
        });

        it("une diffusion en échec n'empêche pas le lanceur de voir son jet", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            let presented = false;
            registerResultBroadcaster(() => {
                throw new Error("socket injoignable");
            });
            registerResultPresenter(async () => {
                presented = true;
            });

            await presentResult(reportWithRoll());

            expect(presented).toBe(true);
        });
    });
});
