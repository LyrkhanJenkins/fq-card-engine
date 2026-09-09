import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import ResultWindow from "../../src/domain/interface/window/result-window.js";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";

/**
 * Fenêtre de résultat. Les tests la font tourner à vitesse très élevée : ce qui
 * est vérifié ici, c'est ce que la mise en scène POSE dans le DOM et le moment où
 * elle rend la main — pas la durée des transitions, qui relève de l'UAT Foundry.
 */

/**
 * Rapport complet : jet principal, critique, une esquive lancée et une cible sans
 * score, valeurs appliquées, jet de formule d'effets et message de carte.
 *
 * @returns {RollReport} Le rapport.
 */
function fullReport() {
    const report = new RollReport();
    report.setHeader({
        actorName: "Aeliana", cardName: "Nova de givre", deckName: "Élémentaliste",
        choiceName: "Explosion glaciale", xValue: 3,
        targets: [{tokenId: "t1", name: "Gobelin"}, {tokenId: "t2", name: "Rocher"}]
    });
    report.setMainRoll({
        role: ROLL_ROLE.DAMAGE, formula: "2d8",
        dice: [{sides: 8, value: 7}, {sides: 8, value: 2}], total: 9
    });
    report.setCritical({roll: 18, threshold: 17, hit: true});
    report.addEvasion({targetTokenId: "t1", targetName: "Gobelin", roll: 19, threshold: 16, evaded: true});
    report.addEvasion({targetTokenId: "t2", targetName: "Rocher", roll: null, threshold: null, evaded: false});
    report.addResult({targetTokenId: "t1", targetName: "Gobelin", value: 9, type: "damageFQ", critical: true, evasion: true});
    report.addResult({targetTokenId: "t2", targetName: "Rocher", value: 18, type: "damageFQ", critical: true, evasion: false});
    report.addExtraRoll({title: "Gel prolongé", formula: "1d6", dice: [{sides: 6, value: 5}], total: 5, hit: true});
    report.addMessages(["Le terrain devient glissant."]);
    return report;
}

/** @returns {?HTMLElement} Le calque actuellement dans le document. */
const windowEl = () => document.querySelector(".fq-result-window");

beforeEach(() => {
    globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    game.settings.get = vi.fn(() => 100); // animation quasi instantanée
    document.body.innerHTML = "";
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("ResultWindow", () => {

    describe("vitesse", () => {
        it("retombe sur 1 quand le réglage est absent ou aberrant", () => {
            game.settings.get = vi.fn(() => undefined);
            expect(ResultWindow.speed).toBe(1);
            expect(ResultWindow.pauseSpeed).toBe(1);

            game.settings.get = vi.fn(() => 0);
            expect(ResultWindow.speed).toBe(1);

            game.settings.get = vi.fn(() => { throw new Error("réglage non enregistré"); });
            expect(ResultWindow.speed).toBe(1);
        });

        it("lit chaque réglage sous sa propre clé : dés et pauses se règlent à part", () => {
            game.settings.get = vi.fn((_module, key) => key === "ResultWindowSpeed" ? 1.6 : 0.3);

            expect(ResultWindow.speed).toBe(1.6);
            expect(ResultWindow.pauseSpeed).toBe(0.3);
        });

        it("accepte la valeur du choix telle que Foundry la rend, même en chaîne", () => {
            game.settings.get = vi.fn(() => "2.5");
            expect(ResultWindow.speed).toBe(2.5);
        });
    });

    describe("son des dés", () => {
        /**
         * Rapport à un seul dé, pour compter les sons sans ambiguïté.
         *
         * @returns {RollReport} Le rapport.
         */
        function oneDie() {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});
            return report;
        }

        beforeEach(() => {
            CONFIG.sounds = {dice: "sounds/dice.wav"};
            // `AudioHelper.play` vient du socle de tests, pas d'un espion local :
            // `restoreAllMocks` ne le vide pas, ses appels s'accumuleraient d'un
            // test à l'autre et fausseraient tous les comptes ci-dessous.
            foundry.audio.AudioHelper.play.mockClear();
        });

        it("joue le son de Foundry une fois par dé lancé, sans le diffuser", async () => {
            const report = new RollReport();
            report.setMainRoll({
                role: ROLL_ROLE.DAMAGE, formula: "2d6",
                dice: [{sides: 6, value: 3}, {sides: 6, value: 5}], total: 8
            });
            report.setCritical({roll: 12, threshold: 17, hit: false});

            await ResultWindow.present(report);

            // Deux dés de dégâts et le d20 de critique.
            expect(foundry.audio.AudioHelper.play).toHaveBeenCalledTimes(3);
            const [payload, broadcast] = foundry.audio.AudioHelper.play.mock.calls[0];
            expect(payload.src).toBe("sounds/dice.wav");
            // Diffuser le ferait entendre autant de fois qu'il y a de joueurs :
            // la fenêtre est déjà rejouée chez chacun.
            expect(broadcast).toBe(false);
        });

        it("suit le volume d'interface de Foundry", async () => {
            game.settings.get = vi.fn((module, key) => {
                if (module === "core" && key === "globalInterfaceVolume") return 0.2;
                return 100;
            });

            await ResultWindow.present(oneDie());

            expect(foundry.audio.AudioHelper.play.mock.calls[0][0].volume).toBe(0.2);
        });

        it("se tait quand le joueur a coupé le son", async () => {
            game.settings.get = vi.fn((_module, key) => key === "ResultWindowDiceSound" ? false : 100);

            await ResultWindow.present(oneDie());

            expect(foundry.audio.AudioHelper.play).not.toHaveBeenCalled();
        });

        it("se tait faute de son de dés configuré, sans interrompre l'animation", async () => {
            CONFIG.sounds = {};

            await ResultWindow.present(oneDie());

            expect(foundry.audio.AudioHelper.play).not.toHaveBeenCalled();
            expect(windowEl().querySelector("[data-die=\"0\"]").textContent).toBe("3");
        });

        it("une lecture audio en échec ne retient pas la résolution", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            foundry.audio.AudioHelper.play.mockImplementationOnce(() => {
                throw new Error("contexte audio verrouillé");
            });

            await expect(ResultWindow.present(oneDie())).resolves.toBeUndefined();
            expect(windowEl().querySelector("[data-die=\"0\"]").textContent).toBe("3");
        });
    });

    describe("temps d'affichage", () => {
        it("convertit le réglage en millisecondes", () => {
            game.settings.get = vi.fn(() => 10);
            expect(ResultWindow.linger).toBe(10000);
        });

        it("rend 0 pour « jusqu'au clic », qui ne programme aucune fermeture", () => {
            game.settings.get = vi.fn(() => 0);
            expect(ResultWindow.linger).toBe(0);
        });

        it("retombe sur six secondes quand le réglage est illisible", () => {
            game.settings.get = vi.fn(() => { throw new Error("réglage non enregistré"); });
            expect(ResultWindow.linger).toBe(6000);
        });

        it("laisse le calque à l'écran quand le joueur a choisi « jusqu'au clic »", async () => {
            game.settings.get = vi.fn((_module, key) => key === "ResultWindowLinger" ? 0 : 100);
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

            await ResultWindow.present(report);
            await new Promise(resolve => setTimeout(resolve, 60));

            expect(windowEl()).not.toBeNull();
            expect(windowEl().dataset.done).toBe("1");
        });

        it("un clic après l'animation referme le calque", async () => {
            game.settings.get = vi.fn((_module, key) => key === "ResultWindowLinger" ? 0 : 100);
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});
            await ResultWindow.present(report);

            windowEl().click();

            expect(windowEl().classList).toContain("is-out");
        });
    });

    it("n'affiche rien pour un rapport sans jet, sans résultat et sans message", async () => {
        await ResultWindow.present(new RollReport());

        expect(windowEl()).toBeNull();
    });

    it("n'affiche rien sans rapport du tout", async () => {
        await ResultWindow.present(null);

        expect(windowEl()).toBeNull();
    });

    describe("une fois la mise en scène terminée", () => {
        beforeEach(async () => {
            await ResultWindow.present(fullReport());
        });

        it("porte l'entête : acteur, carte, deck, effet retenu, variable et cibles", () => {
            const html = windowEl().innerHTML;
            expect(html).toContain("Aeliana");
            expect(html).toContain("Nova de givre");
            expect(html).toContain("Élémentaliste");
            expect(html).toContain("Explosion glaciale");
            expect(html).toContain("X = 3");
            expect(html).toContain("Gobelin, Rocher");
        });

        it("pose chaque dé du jet principal sur sa valeur, et le total", () => {
            const dice = [...windowEl().querySelectorAll("[data-die]")].map(die => die.textContent);
            expect(dice).toEqual(["7", "2"]);
            expect(windowEl().querySelector("[data-total]").textContent).toBe("9");
        });

        it("pose le dé de critique et marque le total comme critique", () => {
            expect(windowEl().querySelector("[data-crit]").textContent).toBe("18");
            expect(windowEl().querySelector("[data-total]").classList).toContain("is-crit");
        });

        it("ne montre une ligne d'esquive que pour la cible qui a lancé un dé", () => {
            const rows = windowEl().querySelectorAll("[data-eva-row]");
            expect(rows).toHaveLength(1);
            expect(windowEl().querySelector("[data-eva=\"0\"]").textContent).toBe("19");
        });

        it("révèle toutes les valeurs appliquées", () => {
            const rows = [...windowEl().querySelectorAll("[data-result]")];
            expect(rows).toHaveLength(2);
            expect(rows.every(row => row.classList.contains("is-on"))).toBe(true);
            expect(windowEl().querySelector("[data-targets]").classList).toContain("is-on");
        });

        it("révèle les jets de formules d'effets et les messages de la carte", () => {
            expect(windowEl().querySelector("[data-extra]").classList).toContain("is-on");
            expect(windowEl().querySelector("[data-extra-die=\"0\"]").textContent).toBe("5");
            expect(windowEl().querySelector("[data-messages]").classList).toContain("is-on");
            expect(windowEl().innerHTML).toContain("Le terrain devient glissant.");
        });
    });

    it("affiche la mention distinguant la résolution, une attaque d'opportunité par exemple", async () => {
        const report = fullReport();
        report.setHeader({tag: "Attaque d'opportunité"});

        await ResultWindow.present(report);

        const chip = windowEl().querySelector(".fq-result-chip.is-tag");
        expect(chip).not.toBeNull();
        expect(chip.textContent).toBe("Attaque d'opportunité");
    });

    it("n'affiche aucune mention quand la résolution est ordinaire", async () => {
        await ResultWindow.present(fullReport());

        expect(windowEl().querySelector(".fq-result-chip.is-tag")).toBeNull();
    });

    it("montre un soin sans colonne d'esquive et sous son propre habillage", async () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.HEAL, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});
        report.addResult({targetTokenId: "a1", targetName: "Bruenor", value: 4, type: "healFQ", critical: false, evasion: false});

        await ResultWindow.present(report);

        expect(windowEl().classList).toContain("fq-result-window--heal");
        expect(windowEl().querySelector(".fq-result-col--eva").classList).toContain("is-empty");
    });

    it("estompe la colonne du critique quand aucun critique n'est possible", async () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

        await ResultWindow.present(report);

        expect(windowEl().querySelector(".fq-result-col--crit").classList).toContain("is-empty");
        expect(windowEl().querySelector("[data-crit]")).toBeNull();
    });

    describe("silhouettes de dés", () => {
        it("taille chaque dé du jet principal selon son nombre de faces", async () => {
            const report = new RollReport();
            report.setMainRoll({
                role: ROLL_ROLE.DAMAGE, formula: "1d4 + 1d6 + 1d8 + 1d10 + 1d12 + 1d20",
                dice: [4, 6, 8, 10, 12, 20].map(sides => ({sides, value: 1})), total: 6
            });

            await ResultWindow.present(report);

            const classes = [...windowEl().querySelectorAll("[data-die]")].map(die => die.className);
            expect(classes[0]).toContain("fq-result-die--d4");
            expect(classes[2]).toContain("fq-result-die--d8");
            expect(classes[3]).toContain("fq-result-die--d10");
            expect(classes[4]).toContain("fq-result-die--d12");
            expect(classes[5]).toContain("fq-result-die--d20");
        });

        it("marque aussi le d6, dont la silhouette est celle par défaut", async () => {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

            await ResultWindow.present(report);

            expect(windowEl().querySelector("[data-die=\"0\"]").className).toContain("fq-result-die--d6");
        });

        it("garde la forme par défaut pour un dé qu'elle ne sait pas dessiner", async () => {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d100", dice: [{sides: 100, value: 73}], total: 73});

            await ResultWindow.present(report);

            expect(windowEl().querySelector("[data-die=\"0\"]").className).not.toMatch(/fq-result-die--d\d/);
        });

        it("ne taille le dé d'une formule d'effets que si elle n'en a jeté qu'un", async () => {
            const report = new RollReport();
            report.addExtraRoll({title: "Un dé", formula: "1d12", dice: [{sides: 12, value: 9}], total: 9, hit: true});
            report.addExtraRoll({
                title: "Deux dés", formula: "2d6",
                dice: [{sides: 6, value: 3}, {sides: 6, value: 4}], total: 7, hit: false
            });

            await ResultWindow.present(report);

            expect(windowEl().querySelector("[data-extra-die=\"0\"]").className).toContain("fq-result-die--d12");
            // Le second affiche un total, pas une face : aucune forme ne le dirait juste.
            expect(windowEl().querySelector("[data-extra-die=\"1\"]").className).not.toMatch(/fq-result-die--d\d/);
        });
    });

    it("un rapport reçu d'un autre client suit la vitesse de son lanceur, pas la locale", async () => {
        game.settings.get = vi.fn(() => 0.5); // réglage local, volontairement lent
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});
        const distant = {...report.toObject(), speed: 100, pauseSpeed: 100};

        const started = Date.now();
        await ResultWindow.present(distant);

        // À la vitesse locale (0,5×) la seule pose du dé dépasserait la seconde.
        expect(Date.now() - started).toBeLessThan(600);
        expect(windowEl().querySelector("[data-die=\"0\"]").textContent).toBe("3");
    });

    it("une seconde résolution remplace la première : un seul calque à l'écran", async () => {
        await ResultWindow.present(fullReport());
        await ResultWindow.present(fullReport());

        expect(document.querySelectorAll(".fq-result-window")).toHaveLength(1);
    });
});
