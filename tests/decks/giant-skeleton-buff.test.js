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

const {playChoice} = await import("./play-harness.js");
const {installMacroStub} = await import("./corpus-helpers.js");
installMacroStub();
const Minion = (await import("../../src/domain/engine/shared/minion.js")).default;
const Constants = (await import("../../src/domain/constants.js")).default;
const CardFqSystem = (await import("../../src/domain/system/cards/card-fq-system.mjs")).default;
const {socket} = await import("../../src/hook/integration/socketlib.hook.js");

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

/** Le monde minimal d'un rituel : un score de sacrifice à dépenser, un dossier de sbires. */
const ritualWorld = (sacrificedMinion = 4) => ({
    world: {
        character: {system: {fq: {minions: {sacrificedMinion}}}},
        folders: [{type: "Actor", name: "Temporaire", id: "ritual-temp-folder"}],
        canvas: {scene: {grid: {distance: 1, size: 5}, tokens: []}}
    }
});

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

describe("Éclats d'os → Squelette Géant — la chaîne complète", () => {

    const witch = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, "witch-base.json"), "utf-8"));
    const cardNamed = name => witch.cards.find(c => c.name === "FQCARDTITLE." + name);
    /** L'entrée de sbire du Squelette Géant, telle que sa carte d'invocation la déclare. */
    const giantEntry = cardNamed("GiantSkeleton").system.fq.choices[0].minions[0];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("le rituel écrit le compteur du Géant, proportionnel au sacrifice dépensé", async () => {
        // xmax vaut 2 : deux points de sacrifice au plus, soit 4 PV × 2.
        const result = await playChoice(cardNamed("BoneShards"), 0, ritualWorld(4));

        expect(result.threw).toBe(false);
        const changes = result.activeEffectCalls.flatMap(call => call[0].changes ?? []);
        expect(changes).toContainEqual(expect.objectContaining({
            key: "system.fq.minions.giantSkeleton.hp", value: 8
        }));
    });

    test("le compteur ainsi écrit est celui que lit l'invocation du Géant", async () => {
        globalThis.FqCardEngineModule = {...globalThis.FqCardEngineModule, moduleName: "fq-card-engine"};
        game.user.character = {
            id: "witch",
            system: {fq: {minions: {giantSkeleton: {max: 1, hp: 8, damage: 3, movement: 5}}}}
        };
        game.canvas = {scene: {dimensions: {size: 100}, tokens: []}};
        vi.spyOn(Minion, "getTempActorFolder").mockReturnValue({id: "tmp"});
        game.packs.get.mockReturnValue({
            getDocuments: vi.fn(async () => ([{
                name: "Giant Skeleton",
                ownership: {},
                system: {
                    attributes: {hp: {max: 25, value: 25}, movement: {walk: 20}},
                    fq: {
                        attributes: {critical: 2, evasion: 1},
                        action: {max: 10, value: 10},
                        mana: {max: 0, value: 0},
                        zeal: {max: 0, value: 0},
                        bonus: {damage: 0, heal: 0}
                    }
                }
            }]))
        });

        await Minion.createActorData({name: "Giant Skeleton", type: giantEntry.type, data: giantEntry.data}, "left");

        const summoned = socket.executeAsGM.mock.calls.at(-1)[1];
        // Les formules du sbire sont résolues à 10 par le Roll déterministe des tests :
        // seuls comptent ici les +8 / +3 / +5 rendus par les compteurs du rituel.
        expect(summoned.system.attributes.hp).toEqual({max: 18, value: 18});
        expect(summoned.system.fq.bonus.damage).toBe(13);
        expect(summoned.system.attributes.movement.walk).toBe(15);
        expect(summoned.flags["fq-card-engine"].minionType).toBe("giantSkeleton");

        Minion.getTempActorFolder.mockRestore();
    });
});

describe("Hécatombe d'ossements — l'armée sacrifiée convertie en Géant", () => {

    const witchDeck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, "witch-base.json"), "utf-8"));
    const hecatomb = witchDeck.cards.find(c => c.name === "FQCARDTITLE.BoneHecatomb");

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("dépense le score de sacrifice jusqu'à son plafond et dope le Géant à proportion", async () => {
        // Un score de 12 : la carte n'en prend que 8 (xmax), soit 6 PV et 2 dégâts par point.
        const result = await playChoice(hecatomb, 0, ritualWorld(12));

        expect(result.threw).toBe(false);
        const changes = result.activeEffectCalls.flatMap(call => call[0].changes ?? []);
        expect(changes).toContainEqual(expect.objectContaining({
            key: "system.fq.minions.giantSkeleton.hp", value: 48
        }));
        expect(changes).toContainEqual(expect.objectContaining({
            key: "system.fq.minions.giantSkeleton.damage", value: 16
        }));

        // Le reliquat reste disponible pour la carte suivante : le score est déduit, pas vidé.
        expect(result.updates).toContainEqual([{"system.fq.minions.sacrificedMinion": 4}]);
    });

    test("sous le minimum de sacrifice, la carte est refusée et rien n'est appliqué", async () => {
        const result = await playChoice(hecatomb, 0, ritualWorld(4));

        // Une condition non remplie n'est pas une exception : la carte est refusée,
        // un avertissement part au chat, et rien du tout n'est appliqué.
        expect(result.threw).toBe(false);
        expect(result.activeEffectCalls).toEqual([]);
        expect(JSON.stringify(result.chatMessages)).toContain("CardWarningMsgNoSacrificedMinion");
    });

    test("aucune carte du corpus ne supprime de jetons : le charnier reste au HUD du joueur", () => {
        const scripts = JSON.stringify(corpus);

        expect(scripts).not.toContain("consumeOnScene");
        expect(scripts).not.toContain("deleteToken");
    });
});

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
