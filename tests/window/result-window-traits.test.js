import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import ResultWindow from "../../src/domain/interface/window/result-window.js";
import ResultChatLog from "../../src/domain/engine/roll/result-chat-log.js";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";

/**
 * Les puces de résistance, d'immunité et de vulnérabilité du récapitulatif :
 * dans la fenêtre de résultat comme dans le message de chat, une puce par
 * trait et par élément, le coefficient de l'élément au survol.
 */

/**
 * Un rapport à trois cibles : sans trait, immunisée au feu, vulnérable au feu
 * et résistante au froid.
 *
 * @returns {RollReport} Le rapport.
 */
function reportWithTraits() {
    const report = new RollReport();
    report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "(1d4)[fire]+(4+1d6)[cold]",
        dice: [{sides: 4, value: 3}, {sides: 6, value: 4}], total: 12});
    report.addResult({targetTokenId: "t1", targetName: "Gobelin", value: 12, type: "damageFQ",
        critical: false, evasion: false});
    report.addResult({targetTokenId: "t2", targetName: "Salamandre", value: 6, type: "damageFQ",
        critical: false, evasion: false, traits: [{type: "fire", kinds: ["immune"], factor: 0.5}]});
    report.addResult({targetTokenId: "t3", targetName: "Élémentaire", value: 12, type: "damageFQ",
        critical: false, evasion: false, traits: [
            {type: "fire", kinds: ["vulnerable"], factor: 2},
            {type: "cold", kinds: ["resist"], factor: 0.5}
        ]});
    return report;
}

beforeEach(() => {
    globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
    game.settings.get = vi.fn(() => 100);
    document.body.innerHTML = "";
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("Rapport — le détail des traits", () => {

    it("n'est posé que s'il y en a : un résultat ordinaire garde sa forme de toujours", () => {
        const report = reportWithTraits();

        expect(report.results[0]).not.toHaveProperty("traits");
        expect(report.results[1].traits).toHaveLength(1);
    });

    it("toObject le copie en profondeur", () => {
        const report = reportWithTraits();
        const plain = report.toObject();
        plain.results[2].traits[0].kinds.push("muté");
        plain.results[2].traits[1].factor = 99;

        expect(report.results[2].traits[0].kinds).toEqual(["vulnerable"]);
        expect(report.results[2].traits[1].factor).toBe(0.5);
    });
});

describe("Fenêtre de résultat — puces des traits", () => {

    it("une puce par trait et par élément, à la couleur de son trait", async () => {
        await ResultWindow.present(reportWithTraits());

        const rows = document.querySelectorAll("[data-result]");
        expect(rows[0].querySelectorAll(".fq-result-badge")).toHaveLength(0);
        expect(rows[1].querySelector(".fq-result-badge.is-immune").textContent)
            .toContain("FQCARDENGINE.ChatMessagePartImmune");
        expect(rows[1].querySelector(".fq-result-badge.is-immune").textContent)
            .toContain("FQCARDENGINE.DamageTypeFire");
        expect(rows[2].querySelector(".is-vulnerable")).not.toBeNull();
        expect(rows[2].querySelector(".is-resist")).not.toBeNull();
    });

    it("le coefficient de l'élément est au survol", async () => {
        await ResultWindow.present(reportWithTraits());

        const immune = document.querySelector("[data-result=\"1\"] .is-immune").getAttribute("data-tooltip");
        const vulnerable = document.querySelector("[data-result=\"2\"] .is-vulnerable").getAttribute("data-tooltip");
        expect(immune).toContain("FQCARDENGINE.TraitDetail");
        expect(immune).toContain("\"factor\":\"0.5\"");
        expect(vulnerable).toContain("\"factor\":\"2\"");
    });
});

describe("Message de chat — puces des traits", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("les mêmes puces, aux classes du chat, avec le coefficient au survol", () => {
        ResultChatLog.publish({name: "Aeliana"}, reportWithTraits());

        const content = ChatMessage.create.mock.calls.at(-1)[0].content;
        expect(content).toContain("fq-result-badge--immune");
        expect(content).toContain("fq-result-badge--resist");
        expect(content).toContain("fq-result-badge--vulnerable");
        expect(content).toMatch(/fq-result-badge--resist" data-tooltip="[^"]*FQCARDENGINE\.TraitDetail/);
    });

    it("une cible sans trait n'a aucune de ces puces", () => {
        const report = new RollReport();
        report.addResult({targetTokenId: "t1", targetName: "Gobelin", value: 11, type: "damageFQ",
            critical: false, evasion: false});

        ResultChatLog.publish({name: "Aeliana"}, report);

        const content = ChatMessage.create.mock.calls.at(-1)[0].content;
        expect(content).not.toMatch(/fq-result-badge--(resist|immune|vulnerable)/);
    });
});
