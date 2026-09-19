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
const {DECKS_DIR, installMacroStub} = await import("./corpus-helpers.js");
// La hantise porte une aura persistante (`macro.execute`) : sans ce stub, la
// pose du statut échoue sur un `Macro` absent du bac à sable.
installMacroStub();
const fs = (await import("fs")).default;
const path = (await import("path")).default;

/**
 * « Profanation » (Mage Blanc) — la conversion des malédictions en hantises,
 * jouée par le VRAI pipeline sur la carte TELLE QU'ELLE EST DANS LE DECK.
 *
 * Ce qui se vérifie ici est la construction en données qui rend la conversion
 * honnête, sans une ligne de moteur : `xvalue` compte les malédictions de la
 * cible, et chacune des cinq entrées d'`applyEffectsFormulas` ne se déclenche
 * qu'à partir de son rang. Une cible à deux malédictions ne doit donc recevoir
 * QUE deux hantises — la faute que guette ce test est celle d'une carte qui
 * poserait ses cinq hantises sans avoir de malédiction à consommer.
 *
 * Limite connue du harnais : les effets de la cible sont un tableau figé, que le
 * retrait ne vide pas. Les retraits comptés portent donc tous le même id, là où
 * le jeu réel retire cinq effets distincts. C'est le NOMBRE de conversions qui
 * est vérifié, pas l'identité des effets retirés.
 */

const WHITE_MAGE = JSON.parse(
    fs.readFileSync(path.join(DECKS_DIR, "white-mage-base.json"), "utf8"));

const DESECRATION = WHITE_MAGE.cards.find(card => card.name === "FQCARDTITLE.Desecration");

/**
 * Les effets d'un acteur comme Foundry les expose : une collection ITÉRABLE qui
 * porte aussi `.contents`. Les deux formes servent — le comptage des conditions
 * itère, le retrait d'effet lit `.contents` — et un mock qui n'offrirait que la
 * seconde ferait silencieusement retomber `targetEffectCount` à zéro.
 */
function effectsCollection(list) {
    const collection = [...list];
    collection.contents = collection;
    return collection;
}

/** Une cible portant `count` malédictions, plus un effet étranger à ne pas toucher. */
function targetCursed(count) {
    const curses = Array.from({length: count}, (_, i) => ({id: `curse-${i}`, name: "Curse"}));
    return {world: {targetActor: {effects: effectsCollection([...curses, {id: "frost", name: "Frost"}])}}};
}

/** Le nombre de hantises réellement posées sur la cible par le jeu de la carte. */
function hauntsCreated(result) {
    return result.effectsCreated.filter(({effect}) => effect?.name === "Haunt").length;
}

describe("Profanation — conversion malédiction → hantise, une pour une", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("la carte existe dans le deck du Mage Blanc, avec ses cinq conversions", () => {
        expect(DESECRATION).toBeDefined();
        expect(DESECRATION.system.fq.choices[0].applyEffectsFormulas).toHaveLength(5);
        expect(DESECRATION.system.fq.choices[0].xvalue)
            .toBe("SCRIPT:FqCardEngineModule.cond.targetEffectCount([\"Curse\"])");
    });

    test("une seule malédiction : une seule hantise, un seul retrait", async () => {
        const result = await playChoice(DESECRATION, 0, targetCursed(1));

        expect(result.threw).toBe(false);
        expect(hauntsCreated(result)).toBe(1);
        expect(result.effectsRemoved).toHaveLength(1);
    });

    test("trois malédictions : trois hantises, trois retraits", async () => {
        const result = await playChoice(DESECRATION, 0, targetCursed(3));

        expect(result.threw).toBe(false);
        expect(hauntsCreated(result)).toBe(3);
        expect(result.effectsRemoved).toHaveLength(3);
    });

    test("au-delà du plafond, la conversion s'arrête à cinq", async () => {
        const result = await playChoice(DESECRATION, 0, targetCursed(8));

        expect(result.threw).toBe(false);
        expect(hauntsCreated(result)).toBe(5);
        expect(result.effectsRemoved).toHaveLength(5);
    });

    test("aucune malédiction : aucune hantise posée", async () => {
        // La carte est de toute façon injouable (son `customEval` l'interdit),
        // mais la construction elle-même ne doit rien poser à vide — c'est ce qui
        // interdit à une hantise d'apparaître sans malédiction consommée.
        const result = await playChoice(DESECRATION, 0, targetCursed(0));

        expect(hauntsCreated(result)).toBe(0);
        expect(result.effectsRemoved).toEqual([]);
    });

    test("ne retire que des malédictions, jamais l'effet étranger de la cible", async () => {
        const result = await playChoice(DESECRATION, 0, targetCursed(2));

        expect(result.effectsRemoved.every(({effectId}) => effectId.startsWith("curse-"))).toBe(true);
    });
});
