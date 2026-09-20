import {beforeEach, describe, it} from "vitest";
import fs from "fs";
import path from "path";
import DisplayCard from "../../src/domain/interface/card-svg/display-card.js";
import FormulaDisplay from "../../src/domain/interface/card-svg/formula-display.js";
import RollService from "../../src/domain/engine/roll/roll-service.js";
import Constants from "../../src/domain/constants.js";
import {makeReferenceActor} from "./formula-fixtures.js";

const BUBBLE_FIELDS = ["action", "mana", "zeal", "minReach", "maxReach", "replayable"];
const ROOT = path.join(process.cwd(), "packs", "_source");

function collect() {
    const out = new Map();
    const walk = dir => {
        for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith(".json")) {
                let j;
                try { j = JSON.parse(fs.readFileSync(p, "utf-8")); } catch { continue; }
                for (const card of j.cards ?? []) {
                    for (const ch of card.system?.fq?.choices ?? []) {
                        for (const f of BUBBLE_FIELDS) {
                            const v = ch[f];
                            if (typeof v === "string" && v.trim() !== "" && !out.has(`${f}|${v}`)) {
                                out.set(`${f}|${v}`, {field: f, value: v, card: card.name, file: e.name});
                            }
                        }
                    }
                }
            }
        }
    };
    walk(ROOT);
    return [...out.values()];
}

describe("SONDE bulles", () => {
    let actor;
    beforeEach(() => {
        actor = makeReferenceActor();
        Object.defineProperty(Constants, "actorCurrent", {get: () => actor, configurable: true});
    });

    it("compare ancien et nouveau repli", () => {
        // Le repli n'est atteint que par les valeurs à variable libre : sous le mock
        // de `Roll`, `rollResultSync` ne lève jamais, on sélectionne donc sur XXX/YYY
        // (la seule famille présente dans les packs, cf. sonde bubbles2.mjs).
        const entries = collect().filter(e => /XXX|YYY/.test(e.value));
        const lines = [];
        let reachesFallback = 0;
        for (const e of entries) {
            const str = e.value;
            const afterAbilities = RollService.replaceAbilitiesBonus(str);
            reachesFallback++;
            let oldOut, newOut;
            try {
                oldOut = DisplayCard.simplifyExpression(
                    afterAbilities.replaceAll("XXX", "X").replaceAll("YYY", "Y"));
            } catch (err) { oldOut = `THROW(${err.message.slice(0, 40)})`; }
            try {
                newOut = FormulaDisplay.foldFormula(str, {actor});
            } catch (err) { newOut = `THROW(${err.message.slice(0, 40)})`; }
            const flag = String(oldOut) === String(newOut) ? "  =  " : " DIFF ";
            lines.push(`${flag} ${e.field}="${e.value}" old="${oldOut}" new="${newOut}"  [${e.card}]`);
        }
        console.log(`TOTAL distinctes=${entries.length} atteignent-le-repli=${reachesFallback}`);
        console.log(lines.sort().join("\n"));

        const CAS = ["XXX/2", "floor(XXX/2)", "ceil(XXX/2)", "XXX*YYY", "1d4", "XXXd6",
            "(1+2", "1)", "1+", "min(3,XXX)", "-max(5, 35-XXX)", "@int+XXX", "2*XXX+@wis"];
        const synth = [];
        for (const c of CAS) {
            let o, n;
            try { o = DisplayCard.simplifyExpression(
                RollService.replaceAbilitiesBonus(c).replaceAll("XXX", "X").replaceAll("YYY", "Y"));
            } catch (err) { o = `THROW(${err.message.slice(0, 32)})`; }
            try { n = FormulaDisplay.foldFormula(c, {actor}); }
            catch (err) { n = `THROW(${err.message.slice(0, 32)})`; }
            synth.push(`  "${c}"  old="${o}"  new="${n}"`);
        }
        console.log("\n--- cas de défaut et cas limites ---\n" + synth.join("\n"));
    });
});
