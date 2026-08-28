import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock est hissé PAR FICHIER,
// voir le commentaire JSDoc en tête de play-harness.js pour la liste canonique) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice} = await import("./play-harness.js");
const {installMacroStub} = await import("./corpus-helpers.js");
installMacroStub();
const {makeCard, makeChoice} = await import("../factories.js");
const {OriginFQEffectLabel} = await import("../../src/domain/constants.js");

/**
 * Statuts normalisés — expansion par le VRAI pipeline (`playValidatedCard` ->
 * `createEffectsFromData`) : une donnée d'effet `{status: "clé"}` est remplacée
 * par les données canoniques du registre (un statut peut poser PLUSIEURS
 * effets), un blob sans statut reste le comportement historique.
 */
function cardWithEffectData(data) {
    return makeCard({
        name: "FQCARDTITLE.StatusHarness",
        faces: [{name: "", img: "", text: ""}],
        system: {
            fq: {
                maxSameCard: 1, class: "neutral", level: 1, isBase: false,
                choices: [makeChoice({
                    minReach: "1",
                    maxReach: "6",
                    applyEffectsFormulas: [{
                        title: "T", formula: "1",
                        effects: [{result: "1", self: false, data, messages: []}]
                    }]
                })]
            }
        }
    });
}

describe("statuts normalisés — pipeline réel via playChoice", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("status poison : un effet Poison illimité, dot numérisé, flags DAE et macro de propagation", async () => {
        const result = await playChoice(cardWithEffectData([{status: "poison"}]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.name).toBe("Poison");
        // Le champ de référence du registre ne doit pas fuiter dans l'ActiveEffect.
        expect(effect.status).toBeUndefined();
        // Durée vide -> illimitée : le bloc duration est supprimé, l'origine FQ
        // posée (purge en fin de combat par le hook deleteCombat).
        expect(effect.duration).toBeUndefined();
        expect(effect.origin).toBe(OriginFQEffectLabel);
        // Dégâts par tour : valeur numérisée par le pipeline.
        const dotChange = effect.changes.find(c => c.key === "system.fq.bonus.dot");
        expect(dotChange.value).toBe(1);
        // Propagation : macro conservée telle quelle + flag DAE de ré-exécution
        // en fin de tour, tous deux intacts après la pose des flags module.
        const macroChange = effect.changes.find(c => c.key === "macro.execute");
        expect(macroChange.value).toBe("FQPoisonSpread");
        expect(effect.flags.dae.macroRepeat).toBe("endEveryTurn");
        const moduleName = globalThis.FqCardEngineModule.moduleName;
        expect(effect.flags[moduleName].expireOnDamage).toBe(false);
    });

    test("status acid : PLUSIEURS effets Acid empilés, durées échelonnées et dot dégressif", async () => {
        const result = await playChoice(cardWithEffectData([{status: "acid"}]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated.length).toBeGreaterThan(1);
        const effects = result.effectsCreated.map(call => call.effect);
        expect(new Set(effects.map(e => e.name))).toEqual(new Set(["Acid"]));
        // Durées croissantes et finies : chaque expiration fait baisser le total.
        const durations = effects.map(e => e.duration.value);
        for (let i = 1; i < durations.length; i++) {
            expect(durations[i]).toBeGreaterThan(durations[i - 1]);
        }
        // Le premier tour cumule le dot de TOUS les effets empilés.
        const totalDot = effects
            .flatMap(e => e.changes.filter(c => c.key === "system.fq.bonus.dot"))
            .reduce((sum, c) => sum + Number(c.value), 0);
        expect(totalDot).toBe(4);
    });

    test("status curse : marque illimitée sans aucun change de dégâts", async () => {
        const result = await playChoice(cardWithEffectData([{status: "curse"}]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.name).toBe("Curse");
        expect(effect.duration).toBeUndefined();
        expect(effect.origin).toBe(OriginFQEffectLabel);
        expect(effect.changes.some(c => c.key === "system.fq.bonus.dot")).toBe(false);
    });

    test("status virus : la référence @attributes.hp.value de l'override survit au pipeline (résolution DAE)", async () => {
        const result = await playChoice(cardWithEffectData([{status: "virus"}]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.name).toBe("Virus");
        expect(effect.duration).toBeUndefined();
        expect(effect.origin).toBe(OriginFQEffectLabel);
        // La numérisation du pipeline doit échouer proprement sur la référence @
        // et la conserver LITTÉRALE : c'est le contrat avec DAE.
        const override = effect.changes.find(c => c.key === "system.attributes.hp.max");
        expect(override.value).toBe("@attributes.hp.value");
        expect(override.type).toBe("override");
    });

    test("entrées de statut dupliquées : chaque entrée pose son propre effet (empilement de malédictions)", async () => {
        const result = await playChoice(cardWithEffectData([
            {status: "curse"}, {status: "curse"}, {status: "curse"}
        ]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(3);
        expect(new Set(result.effectsCreated.map(call => call.effect.name))).toEqual(new Set(["Curse"]));
    });

    test("blob personnalisé avec statuses : le marqueur de condition à durée limitée survit au pipeline", async () => {
        const result = await playChoice(cardWithEffectData([{
            status: "",
            name: "Restrained",
            img: "systems/dnd5e/icons/svg/statuses/restrained.svg",
            statuses: ["restrained"],
            changes: [],
            duration: {value: "1", units: "rounds"},
            expireOnDamage: false,
            showIcon: 2
        }]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.statuses).toEqual(["restrained"]);
        expect(effect.duration).toEqual({value: 1, units: "rounds"});
    });

    test("blob personnalisé (sans statut) : comportement historique inchangé", async () => {
        const result = await playChoice(cardWithEffectData([{
            status: "",
            name: "Mon Effet Libre",
            img: "icons/svg/aura.svg",
            changes: [{key: "system.fq.bonus.dot", value: "2", type: "add", priority: null}],
            duration: {value: "2", units: "rounds"},
            expireOnDamage: false
        }]), 0);

        expect(result.threw).toBe(false);
        expect(result.effectsCreated).toHaveLength(1);
        const effect = result.effectsCreated[0].effect;
        expect(effect.name).toBe("Mon Effet Libre");
        expect(effect.duration).toEqual({value: 2, units: "rounds"});
        expect(effect.changes[0].value).toBe(2);
        expect(effect.status).toBeUndefined();
    });

    test("mixte : un statut et un blob libre dans la même donnée d'effets coexistent", async () => {
        const result = await playChoice(cardWithEffectData([
            {status: "poison"},
            {
                name: "Bonus Libre",
                img: "icons/svg/aura.svg",
                changes: [{key: "system.fq.attributes.evasion", value: "1", type: "add", priority: null}],
                duration: {value: "1", units: "rounds"},
                expireOnDamage: false
            }
        ]), 0);

        expect(result.threw).toBe(false);
        const names = result.effectsCreated.map(call => call.effect.name);
        expect(names).toContain("Poison");
        expect(names).toContain("Bonus Libre");
    });
});
