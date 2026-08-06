import {beforeEach, describe, expect, test, vi} from "vitest";
import CharGauges from "../../src/domain/interface/window/char-gauges.js";

// `char-gauges.js` lit `game.settings` + `game.user.character` et écrit dans le
// DOM (jsdom). Les deux méthodes référencent le global `FqCardEngineModule`
// (`.moduleName` et `.updateCharGauges`) : on en fournit un minimal ici.
// `game` est fourni par tests/setup.js (beforeEach global) ; on ne surcharge que
// ce qui est spécifique à chaque cas.
describe("CharGauges", () => {
    beforeEach(() => {
        globalThis.FqCardEngineModule = {
            moduleName: "fq-card-engine",
            updateCharGauges: CharGauges.updateCharGauges,
        };
        // setup.js ne définit que game.settings.get/register : on ajoute set.
        game.settings.set = vi.fn().mockResolvedValue(undefined);

        document.body.innerHTML = `
            <div id="fq-char-gauges"></div>
            <div id="fq-char-gauges-toggle"></div>
            <img id="fq-cg-avatar" />
            <div id="fq-cg-hp"></div><span id="fq-cg-hp-val"></span>
            <div id="fq-cg-action"></div><span id="fq-cg-action-val"></span>
            <div id="fq-cg-mana"></div><span id="fq-cg-mana-val"></span>
            <div id="fq-cg-zeal"></div><span id="fq-cg-zeal-val"></span>
        `;
    });

    describe("updateCharGauges", () => {
        test("affiche les jauges et calcule les pourcentages depuis les stats du personnage", () => {
            game.user.character.img = "avatar.png";
            game.user.character.system = {
                attributes: {hp: {value: 30, max: 60}},
                fq: {
                    action: {value: 1, max: 2},
                    mana: {value: 3, max: 4},
                    zeal: {value: 0, max: 8},
                },
            };
            // game.settings.get renvoie undefined par défaut → ShowCharGauges ?? true → visible

            CharGauges.updateCharGauges();

            expect(document.getElementById("fq-char-gauges").style.display).toBe("flex");
            expect(document.getElementById("fq-char-gauges-toggle").style.opacity).toBe("1");
            expect(document.getElementById("fq-cg-avatar").src).toContain("avatar.png");

            expect(document.getElementById("fq-cg-hp").style.width).toBe("50%");
            expect(document.getElementById("fq-cg-hp-val").textContent).toBe("30/60");
            expect(document.getElementById("fq-cg-action").style.width).toBe("50%");
            expect(document.getElementById("fq-cg-action-val").textContent).toBe("1/2");
            expect(document.getElementById("fq-cg-mana").style.width).toBe("75%");
            expect(document.getElementById("fq-cg-mana-val").textContent).toBe("3/4");
            expect(document.getElementById("fq-cg-zeal").style.width).toBe("0%");
            expect(document.getElementById("fq-cg-zeal-val").textContent).toBe("0/8");
        });

        test("masque les jauges quand le réglage ShowCharGauges est false", () => {
            game.settings.get = vi.fn(() => false);

            CharGauges.updateCharGauges();

            expect(document.getElementById("fq-char-gauges").style.display).toBe("none");
            expect(document.getElementById("fq-char-gauges-toggle").style.opacity).toBe("0.35");
            // Sortie anticipée : les barres ne sont pas renseignées
            expect(document.getElementById("fq-cg-hp").style.width).toBe("");
        });

        test("ne renseigne pas les barres en l'absence de personnage", () => {
            game.user.character = null;

            CharGauges.updateCharGauges();

            // Visible mais pas de personnage → conteneur masqué, barres vides
            expect(document.getElementById("fq-char-gauges").style.display).toBe("none");
            expect(document.getElementById("fq-cg-hp-val").textContent).toBe("");
        });

        test("ne fait rien (et ne jette pas) si le conteneur des jauges est absent", () => {
            document.body.innerHTML = "";
            expect(() => CharGauges.updateCharGauges()).not.toThrow();
        });
    });

    describe("toggleCharGauges", () => {
        test("inverse le réglage ShowCharGauges puis rafraîchit l'affichage", async () => {
            game.settings.get = vi.fn(() => true);
            FqCardEngineModule.updateCharGauges = vi.fn();

            CharGauges.toggleCharGauges();

            expect(game.settings.set).toHaveBeenCalledWith("fq-card-engine", "ShowCharGauges", false);
            await vi.waitFor(() => expect(FqCardEngineModule.updateCharGauges).toHaveBeenCalled());
        });
    });
});
