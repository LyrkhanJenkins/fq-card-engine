import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "node:fs";
import path from "node:path";

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

const {installMacroStub} = await import("./corpus-helpers.js");
installMacroStub();
const Minion = (await import("../../src/domain/engine/shared/minion.js")).default;
const Constants = (await import("../../src/domain/constants.js")).default;
const CardFqSystem = (await import("../../src/domain/system/cards/card-fq-system.mjs")).default;

/**
 * Le CÂBLAGE des rituels d'invocation : une carte qui promet « le prochain sbire
 * naîtra plus fort » écrit un compteur `system.fq.minions.<type>.<stat>` sur son
 * lanceur, et c'est `Minion.statBonus(<type>)` qui le relit à l'invocation.
 *
 * POURQUOI ce fichier existe : les deux moitiés de la promesse sont écrites à des
 * endroits sans lien — la clé d'effet dans le JSON du deck, le type de sbire dans
 * l'entrée `minions[]` d'une AUTRE carte. Rien n'échoue si elles divergent : le
 * compteur est bien alimenté, simplement personne ne vient le lire, et le joueur
 * paie un rituel sans effet. C'est exactement ce qui était arrivé aux rituels de
 * la sorcière, qui dopaient un « Roi Squelette » que le deck n'invoquait nulle part.
 *
 * Le corpus est balayé par glob, jamais par nom de carte.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");
const BONUS_KEY = /^system\.fq\.minions\.([A-Za-z]+)\.(hp|damage|movement)$/;

/** Les cartes de tous les decks pattern, avec leur fichier d'origine. */
function collectCards() {
    return fs.readdirSync(DECKS_DIR).filter(f => f.endsWith(".json")).flatMap(file => {
        const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf-8"));
        return (deck.cards ?? []).map(card => ({file, card}));
    });
}

const corpus = collectCards();

/** Les types de sbires réellement invoqués par une carte du corpus. */
const summonedTypes = new Set(corpus.flatMap(({card}) =>
    (card.system?.fq?.choices ?? []).flatMap(choice =>
        (choice.minions ?? []).map(minion => minion.type).filter(Boolean))));

/** Un rituel : un choix dont un effet alimente un compteur de bonus d'invocation. */
const rituals = corpus.flatMap(({file, card}) =>
    (card.system?.fq?.choices ?? []).flatMap((choice, index) => {
        const bonuses = (choice.applyEffectsFormulas ?? []).flatMap(formula =>
            (formula.effects ?? []).flatMap(effect =>
                (effect.data ?? []).flatMap(data =>
                    (data.changes ?? []).filter(change => BONUS_KEY.test(change.key)))));
        return bonuses.length ? [{file, cardName: card.name, card, index, choice, bonuses}] : [];
    }));

describe("Rituels d'invocation — le bonus promis atteint bien un sbire", () => {

    test("le corpus porte au moins un rituel (garde-fou d'auto-couverture)", () => {
        expect(rituals.length).toBeGreaterThan(0);
    });

    test.each(rituals)("$file :: $cardName :: choix $index — le type dopé est invoqué par le corpus",
        ({bonuses}) => {
            const orphans = bonuses
                .map(change => change.key.match(BONUS_KEY)[1])
                .filter(type => !summonedTypes.has(type));

            expect([...new Set(orphans)]).toEqual([]);
        });
});

/**
 * Un document de jeton de sbire estampillé, tel que `Minion.createActorData` en
 * pose un sur la scène : le type et l'invocateur vivent dans les flags, jamais
 * dans le nom.
 *
 * @param {string} id                 - L'id du jeton.
 * @param {string} type               - Le type de sbire estampillé.
 * @param {string} [summoner]         - L'id de l'invocateur estampillé.
 * @param {number} [hp]               - Les points de vie restants.
 *
 * @returns {object} Le document de jeton.
 */
const stampedToken = (id, type, summoner = "world-character", hp = 10) => ({
    id,
    name: id,
    actorId: id,
    actor: {
        id,
        flags: {"fq-card-engine": {minionType: type, summonerId: summoner}},
        system: {attributes: {hp: {value: hp}}}
    },
    object: {id, name: id}
});

/*
 * Retires : les deux suites qui jouaient les cartes de la Sorciere depuis
 * `witch-base.json` (chaine Eclats d'os -> Squelette Geant, et Hecatombe
 * d'ossements). Cette classe est livree par `fq-card-engine-extended` : ses
 * cartes ne sont plus ici, et un test qui les charge ne peut que casser. Les
 * deux suites conservees ci-dessus et ci-dessous exercent les MECANISMES
 * (bonus promis atteignant un sbire, famille de sbires) sur des donnees
 * fabriquees, sans dependre d'aucune carte livree.
 */

describe("Famille de sbires — le Géant reste un squelette pour les sorts de masse", () => {

    beforeEach(() => {
        globalThis.FqCardEngineModule = {...globalThis.FqCardEngineModule, moduleName: "fq-card-engine"};
        game.user.character = {id: "world-character"};
        vi.clearAllMocks();
    });

    test("le ciblage « Skeletons » prend la piétaille ET le Géant, mais pas la bête", () => {
        game.canvas = {scene: {tokens: [
            stampedToken("bones", "skeleton"),
            stampedToken("giant", "giantSkeleton"),
            stampedToken("wolf", "beast")
        ]}};

        const targeted = Constants.myTargets(CardFqSystem.TARGET_TYPE_SKELETON).map(token => token.id);

        expect(targeted).toEqual(["bones", "giant"]);
    });

    test("le Géant garde malgré tout son propre plafond, distinct de la piétaille", () => {
        game.canvas = {scene: {tokens: [stampedToken("giant", "giantSkeleton")]}};

        // Famille `skeleton` pour les sorts de masse…
        expect(CardFqSystem.minionFamily("giantSkeleton")).toBe("skeleton");
        // …mais type `giantSkeleton` pour le comptage des emplacements.
        expect(Minion.countOnScene("skeleton", "world-character")).toBe(0);
        expect(Minion.countOnScene("giantSkeleton", "world-character")).toBe(1);
    });

    test("le ciblage de masse épargne les morts et l'armée d'autrui", () => {
        game.canvas = {scene: {tokens: [
            stampedToken("mine", "skeleton"),
            stampedToken("dead", "skeleton", "world-character", 0),
            stampedToken("theirs", "skeleton", "someone-else")
        ]}};

        expect(Constants.myTargets(CardFqSystem.TARGET_TYPE_SKELETON).map(t => t.id)).toEqual(["mine"]);
    });
});
