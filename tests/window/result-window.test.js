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

        it("porte l'entête : acteur, carte, deck, effet retenu et variable", () => {
            const html = windowEl().innerHTML;
            expect(html).toContain("Aeliana");
            expect(html).toContain("Nova de givre");
            expect(html).toContain("Élémentaliste");
            expect(html).toContain("Explosion glaciale");
            expect(html).toContain("X = 3");
        });

        it("ne répète PAS la liste des cibles dans l'entête", () => {
            // La colonne de défense les nomme déjà une à une, et la ligne de
            // résultat les reprend une troisième fois.
            expect(windowEl().querySelector(".fq-result-targets-line")).toBeNull();
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

        it("donne une ligne de défense à CHAQUE cible, même sans dé d'esquive", () => {
            // « Rocher » n'a aucun score d'esquive : sa ligne existe pour garder
            // les symboles alignés, mais son emplacement reste vide et incolore.
            const lines = windowEl().querySelectorAll("[data-def-line]");
            expect(lines).toHaveLength(2);
            expect(windowEl().querySelector("[data-def-mark=\"0-1\"]").textContent).toBe("19");

            const silent = windowEl().querySelector("[data-def-mark=\"1-1\"]");
            expect(silent.textContent.trim()).toBe("");
            expect(silent.classList.contains("is-success")).toBe(false);
            expect(silent.classList.contains("is-failure")).toBe(false);
        });

        it("colore l'esquive réussie en défense qui a tenu", () => {
            expect(windowEl().querySelector("[data-def-mark=\"0-1\"]").classList)
                .toContain("is-success");
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

    it("montre un soin sans colonne de défense et sous son propre habillage", async () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.HEAL, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});
        report.addResult({targetTokenId: "a1", targetName: "Bruenor", value: 4, type: "healFQ", critical: false, evasion: false});

        await ResultWindow.present(report);

        expect(windowEl().classList).toContain("fq-result-window--heal");
        expect(windowEl().querySelector(".fq-result-col--defense").classList).toContain("is-empty");
    });

    it("estompe les deux encarts d'attaque quand la carte ne jette ni toucher ni critique", async () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 3}], total: 3});

        await ResultWindow.present(report);

        const boxes = windowEl().querySelectorAll(".fq-result-col--attack .fq-result-box");
        expect(boxes).toHaveLength(2);
        expect([...boxes].every(box => box.classList.contains("is-empty"))).toBe(true);
        expect(windowEl().querySelector("[data-crit]")).toBeNull();
        expect(windowEl().querySelector("[data-hit-die]")).toBeNull();
    });

    describe("jet pour toucher", () => {

        /**
         * Rapport portant un jet pour toucher et l'esquive de chaque cible.
         *
         * @param {object[]} hits      - Les jets pour toucher (voir `RollReport.addHit`).
         * @param {object[]} evasions  - Les esquives (voir `RollReport.addEvasion`).
         *
         * @returns {RollReport} Le rapport.
         */
        function reportWith(hits, evasions) {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});
            evasions.forEach(evasion => report.addEvasion(evasion));
            hits.forEach(hit => report.addHit(hit));
            report.addResult({
                targetTokenId: "t1", targetName: "Gobelin", value: 2,
                type: "damageFQ", critical: false, evasion: false, defended: true
            });
            return report;
        }

        /** Une esquive lancée, pour une cible donnée. */
        const evasionOf = (id, name, roll, evaded) =>
            ({targetTokenId: id, targetName: name, roll, threshold: 16, evaded});

        it("un seul dé d'attaque, opposé à la classe d'armure de chaque cible", async () => {
            // Une attaque ne roule qu'une fois : c'est le même total qui affronte
            // les deux armures, et l'encart ne porte donc qu'un dé.
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Gobelin", kind: "ac", roll: 14, modifier: 5, total: 19, threshold: 15, defended: false},
                {targetTokenId: "t2", targetName: "Troll", kind: "ac", roll: 14, modifier: 5, total: 19, threshold: 20, defended: true}
            ], [evasionOf("t1", "Gobelin", 3, false), evasionOf("t2", "Troll", 19, true)]));

            const win = windowEl();
            expect(win.querySelectorAll("[data-hit-die]")).toHaveLength(1);
            expect(win.querySelector("[data-hit-die]").textContent).toBe("19");
        });

        it("le dé porte le total et la ligne du dessous la formule", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Gobelin", kind: "ac", roll: 14, modifier: 5, total: 19, threshold: 15, defended: false}
            ], [evasionOf("t1", "Gobelin", 3, false)]));

            const win = windowEl();
            expect(win.querySelector("[data-hit-die]").textContent).toBe("19");
            expect(win.querySelector("[data-hit-formula]").textContent).toBe("14 + 5");
        });

        it("l'écu porte la classe d'armure, vert quand elle a tenu", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Gobelin", kind: "ac", roll: 14, modifier: 5, total: 19, threshold: 15, defended: false},
                {targetTokenId: "t2", targetName: "Troll", kind: "ac", roll: 14, modifier: 5, total: 19, threshold: 20, defended: true}
            ], [evasionOf("t1", "Gobelin", 3, false), evasionOf("t2", "Troll", 19, true)]));

            const win = windowEl();
            const beaten = win.querySelector("[data-def-mark=\"0-0\"]");
            const held = win.querySelector("[data-def-mark=\"1-0\"]");
            expect(beaten.textContent).toBe("15");
            expect(beaten.classList).toContain("is-failure");
            expect(held.textContent).toBe("20");
            expect(held.classList).toContain("is-success");
            expect(held.classList).toContain("fq-result-mark--shield");
        });

        it("une sauvegarde roule SON dé par cible, et coiffe sa colonne", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Gobelin", kind: "save", roll: 11, modifier: 3, total: 14, threshold: 13, defended: true}
            ], [evasionOf("t1", "Gobelin", 3, false)]));

            const win = windowEl();
            // Aucun dé d'attaque : la sauvegarde appartient à la cible.
            expect(win.querySelector("[data-hit-die]")).toBeNull();
            const save = win.querySelector("[data-def-mark=\"0-0\"]");
            expect(save.textContent).toBe("14");
            expect(save.classList).toContain("is-success");
            expect(win.innerHTML).toContain("FQCARDENGINE.ColumnKeySave");
        });

        it("la colonne de défense se réduit à l'esquive quand rien ne demande de toucher", async () => {
            await ResultWindow.present(reportWith([], [evasionOf("t1", "Gobelin", 18, true)]));

            const win = windowEl();
            expect(win.querySelector("[data-hit-die]")).toBeNull();
            expect(win.querySelector("[data-def-mark=\"0-0\"]")).toBeNull();
            expect(win.querySelector("[data-def-mark=\"0-1\"]").textContent).toBe("18");
            expect(win.innerHTML).toContain("FQCARDENGINE.ColumnKeyEvasion");
            expect(win.innerHTML).not.toContain("FQCARDENGINE.ColumnKeyArmor");
        });

        /** Deux cibles face aux MÊMES deux d20 : la première à l'avantage, l'autre non. */
        const pairHits = () => [
            {targetTokenId: "t1", targetName: "Gobelin", kind: "ac", roll: 17, modifier: 5, total: 22,
                threshold: 15, defended: false, dice: [4, 17], mode: 1,
                advantages: [{side: "target", cause: "restrained"}], disadvantages: [], auto: null, autoCauses: []},
            {targetTokenId: "t2", targetName: "Troll", kind: "ac", roll: 4, modifier: 5, total: 9,
                threshold: 15, defended: true, dice: [4, 17], mode: 0,
                advantages: [], disadvantages: [], auto: null, autoCauses: []}
        ];

        it("avec un mode : DEUX dés d'attaque, chacun montrant sa face, et la note qui l'explique", async () => {
            await ResultWindow.present(reportWith(pairHits(),
                [evasionOf("t1", "Gobelin", 3, false), evasionOf("t2", "Troll", 3, false)]));

            const win = windowEl();
            const dice = win.querySelectorAll("[data-hit-die]");
            expect(dice).toHaveLength(2);
            expect(dice[0].textContent).toBe("4");
            expect(dice[1].textContent).toBe("17");
            // Aucun total commun : seul le modificateur s'écrit sous les dés.
            expect(win.querySelector("[data-hit-formula]").textContent).toBe("+ 5");
            expect(win.innerHTML).toContain("FQCARDENGINE.HitBoxTwoDiceNote");
        });

        it("la flèche d'avantage ne marque que la cible visée avec avantage", async () => {
            await ResultWindow.present(reportWith(pairHits(),
                [evasionOf("t1", "Gobelin", 3, false), evasionOf("t2", "Troll", 3, false)]));

            const wraps = windowEl().querySelectorAll("[data-def-line] .fq-result-mark-wrap");
            // Ligne 0 : [armure, esquive] ; ligne 1 : [armure, esquive].
            expect(wraps[0].classList).toContain("has-advantage");
            expect(wraps[2].classList).not.toContain("has-advantage");
            expect(wraps[2].classList).not.toContain("has-disadvantage");
        });

        it("l'infobulle dit les deux dés, celui retenu et pourquoi", async () => {
            await ResultWindow.present(reportWith(pairHits(),
                [evasionOf("t1", "Gobelin", 3, false), evasionOf("t2", "Troll", 3, false)]));

            const wraps = windowEl().querySelectorAll("[data-def-line] .fq-result-mark-wrap");
            const tooltip = wraps[0].getAttribute("data-tooltip");
            expect(tooltip).toContain("d20 4 | 17 → 17");
            expect(tooltip).toContain("FQCARDENGINE.TooltipAdvantage");
            expect(tooltip).toContain("FQCARDENGINE.ConditionRestrained");
            // Un jet ordinaire n'a rien à expliquer.
            expect(wraps[2].hasAttribute("data-tooltip")).toBe(false);
        });

        it("désavantage : la flèche vers le bas", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Ombre", kind: "ac", roll: 4, modifier: 5, total: 9,
                    threshold: 15, defended: true, dice: [17, 4], mode: -1,
                    advantages: [], disadvantages: [{side: "target", cause: "invisible"}], auto: null, autoCauses: []}
            ], [evasionOf("t1", "Ombre", 3, false)]));

            const wrap = windowEl().querySelector("[data-def-line] .fq-result-mark-wrap");
            expect(wrap.classList).toContain("has-disadvantage");
        });

        it("sauvegarde ratée d'office : une croix rouge, sans dé ni total", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Étourdi", kind: "save", roll: null, modifier: 20, total: null,
                    threshold: 13, defended: false, dice: [], mode: 0, auto: "fail",
                    advantages: [], disadvantages: [], autoCauses: [{side: "target", cause: "stunned"}]}
            ], [evasionOf("t1", "Étourdi", 3, false)]));

            const win = windowEl();
            const save = win.querySelector("[data-def-mark=\"0-0\"]");
            expect(save.textContent).toBe("✕");
            expect(save.classList).toContain("is-failure");
            expect(save.parentElement.getAttribute("data-tooltip")).toContain("FQCARDENGINE.TooltipAutoFail");
        });

        it("cible sans défense : l'esquive porte la même croix rouge", async () => {
            await ResultWindow.present(reportWith([], [{
                targetTokenId: "t1", targetName: "Paralysé", roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]
            }]));

            const evasion = windowEl().querySelector("[data-def-mark=\"0-1\"]");
            expect(evasion.textContent).toBe("✕");
            expect(evasion.classList).toContain("is-failure");
            expect(evasion.parentElement.getAttribute("data-tooltip")).toContain("FQCARDENGINE.TooltipDefenseless");
        });

        it("une cible sans score d'esquive reste un emplacement vide et neutre", async () => {
            await ResultWindow.present(reportWith([],
                [{targetTokenId: "t1", targetName: "Rocher", roll: null, threshold: null, evaded: false}]));

            const evasion = windowEl().querySelector("[data-def-mark=\"0-1\"]");
            expect(evasion.textContent).toBe("");
            expect(evasion.classList).not.toContain("is-failure");
        });

        it("l'infobulle est échappée : une cause inconnue ne peut pas injecter de balise", async () => {
            await ResultWindow.present(reportWith([
                {targetTokenId: "t1", targetName: "Gobelin", kind: "ac", roll: 17, modifier: 5, total: 22,
                    threshold: 15, defended: false, dice: [4, 17], mode: 1,
                    advantages: [{side: "target", cause: "<b>piège</b>"}], disadvantages: [],
                    auto: null, autoCauses: []}
            ], [evasionOf("t1", "Gobelin", 3, false)]));

            const wrap = windowEl().querySelector("[data-def-line] .fq-result-mark-wrap");
            // Aucune balise créée, et le texte revient intact de l'attribut.
            expect(wrap.querySelector("b")).toBeNull();
            expect(wrap.getAttribute("data-tooltip")).toContain("<b>piège</b>");
        });
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
        const first = windowEl();
        await ResultWindow.present(fullReport());

        // L'ancien calque s'efface en fondu (340 ms) avant d'être retiré du
        // document : selon la vitesse de la machine, la seconde résolution peut se
        // terminer avant, et il y est encore. Il ne compte plus pour autant : il
        // est marqué sortant, et un seul calque reste affiché.
        const shown = [...document.querySelectorAll(".fq-result-window")]
            .filter(el => !el.classList.contains("is-out"));
        expect(shown).toHaveLength(1);
        expect(shown[0]).not.toBe(first);
        expect(first.classList.contains("is-out") || !first.isConnected).toBe(true);
        // Et le fondu fini, il quitte bien le document : aucun calque ne s'accumule.
        await vi.waitFor(() => expect(first.isConnected).toBe(false), {timeout: 1000});
    });
});
