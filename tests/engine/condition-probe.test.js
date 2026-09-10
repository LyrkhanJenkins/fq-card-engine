import {afterEach, describe, expect, it, vi} from "vitest";
import ConditionProbe from "../../src/domain/engine/roll/condition-probe.js";

/**
 * `ConditionProbe` : la seule couche qui lit un acteur pour les règles
 * d'avantage. dnd5e doit y rester juge quand il est là (`hasConditionEffect`
 * connaît les immunités et l'épuisement « legacy ») ; sans lui, la table suffit.
 */

const originalDnd5e = globalThis.CONFIG.DND5E;

afterEach(() => {
    globalThis.CONFIG.DND5E = originalDnd5e;
    vi.restoreAllMocks();
});

describe("ConditionProbe.of", () => {

    it("sans acteur : aucune sonde", () => {
        expect(ConditionProbe.of(null)).toBeNull();
        expect(ConditionProbe.of(undefined)).toBeNull();
    });

    it("dnd5e présent : c'est hasConditionEffect qui répond, et à lui seul", () => {
        const actor = {statuses: new Set(), hasConditionEffect: vi.fn(key => key === "fqDefenseless")};
        const probe = ConditionProbe.of(actor);

        expect(probe.has("fqDefenseless")).toBe(true);
        expect(probe.has("attackDisadvantage")).toBe(false);
        expect(actor.hasConditionEffect).toHaveBeenCalledWith("fqDefenseless");
    });

    it("sans dnd5e : les conditions portées déclenchent les règles de la table du moteur", () => {
        globalThis.CONFIG.DND5E = undefined;
        const probe = ConditionProbe.of({statuses: new Set(["prone"])});

        expect(probe.has("attackDisadvantage")).toBe(true);
        expect(probe.has("fqProneTarget")).toBe(true);
        expect(probe.has("fqDefenseless")).toBe(false);
        expect(probe.causes("attackDisadvantage")).toEqual(["prone"]);
    });

    it("les conditions peuvent aussi arriver en tableau", () => {
        globalThis.CONFIG.DND5E = undefined;

        expect(ConditionProbe.of({statuses: ["paralyzed"]}).has("fqDefenseless")).toBe(true);
    });

    it("une immunité retire la condition de ses causes", () => {
        globalThis.CONFIG.DND5E = undefined;
        const probe = ConditionProbe.of({
            statuses: new Set(["prone", "poisoned"]),
            system: {traits: {ci: {value: new Set(["poisoned"])}}}
        });

        expect(probe.causes("attackDisadvantage")).toEqual(["prone"]);
    });

    it("immunisé à sa seule condition : la règle ne se déclenche plus", () => {
        globalThis.CONFIG.DND5E = undefined;
        const probe = ConditionProbe.of({statuses: new Set(["paralyzed"]), system: {traits: {ci: {value: ["paralyzed"]}}}});

        expect(probe.has("fqDefenseless")).toBe(false);
    });

    it("la table de CONFIG.DND5E fait foi quand elle existe : une règle d'un autre module compte", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: {attackDisadvantage: new Set(["surprised"])}};
        const probe = ConditionProbe.of({statuses: new Set(["surprised"])});

        expect(probe.causes("attackDisadvantage")).toEqual(["surprised"]);
    });

    it("une règle absente de CONFIG.DND5E retombe sur la table du moteur", () => {
        globalThis.CONFIG.DND5E = {conditionEffects: {}};

        expect(ConditionProbe.of({statuses: new Set(["unconscious"])}).causes("fqDefenseless"))
            .toEqual(["unconscious"]);
    });

    it("les causes restent nommées même quand hasConditionEffect répond", () => {
        globalThis.CONFIG.DND5E = undefined;
        const actor = {statuses: new Set(["blinded"]), hasConditionEffect: () => true};

        expect(ConditionProbe.of(actor).causes("attackDisadvantage")).toEqual(["blinded"]);
    });
});

describe("ConditionProbe — armure non maîtrisée", () => {

    /**
     * @param {object} ac - Les pièces équipées.
     *
     * @returns {object} La sonde de l'acteur qui les porte.
     */
    const wearing = ac => ConditionProbe.of({statuses: new Set(), system: {attributes: {ac}}});

    it("armure équipée non maîtrisée : oui", () => {
        expect(wearing({equippedArmor: {system: {proficiencyMultiplier: 0}}}).untrainedArmor).toBe(true);
    });

    it("bouclier équipé non maîtrisé : oui", () => {
        expect(wearing({
            equippedArmor: {system: {proficiencyMultiplier: 1}},
            equippedShield: {system: {proficiencyMultiplier: 0}}
        }).untrainedArmor).toBe(true);
    });

    it("tout est maîtrisé : non", () => {
        expect(wearing({
            equippedArmor: {system: {proficiencyMultiplier: 1}},
            equippedShield: {system: {proficiencyMultiplier: 1}}
        }).untrainedArmor).toBe(false);
    });

    it("rien d'équipé : non", () => {
        expect(wearing({}).untrainedArmor).toBe(false);
        expect(ConditionProbe.of({statuses: new Set()}).untrainedArmor).toBe(false);
    });

    it("un multiplicateur illisible n'est pas un défaut de maîtrise", () => {
        expect(wearing({equippedArmor: {system: {}}}).untrainedArmor).toBe(false);
    });
});

describe("ConditionProbe.saveMode", () => {

    /**
     * @param {*} mode - Le mode posé sur la feuille.
     *
     * @returns {object} L'acteur.
     */
    const sheet = mode => ({system: {abilities: {dex: {save: {roll: {mode}}}}}});

    it("reprend le mode que dnd5e a calculé", () => {
        expect(ConditionProbe.saveMode(sheet(1), "dex")).toBe(1);
        expect(ConditionProbe.saveMode(sheet(-1), "dex")).toBe(-1);
        expect(ConditionProbe.saveMode(sheet(0), "dex")).toBe(0);
    });

    it("ramène toute valeur à son signe", () => {
        expect(ConditionProbe.saveMode(sheet(2), "dex")).toBe(1);
        expect(ConditionProbe.saveMode(sheet(-3), "dex")).toBe(-1);
    });

    it("absent ou illisible : jet normal", () => {
        expect(ConditionProbe.saveMode(sheet(undefined), "dex")).toBe(0);
        expect(ConditionProbe.saveMode(sheet("n'importe quoi"), "dex")).toBe(0);
        expect(ConditionProbe.saveMode(sheet(1), "wis")).toBe(0);
        expect(ConditionProbe.saveMode(null, "dex")).toBe(0);
    });
});
