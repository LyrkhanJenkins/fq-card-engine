import {beforeEach, describe, expect, test, vi} from "vitest";

// ─── Mocks requis par tests/decks/play-harness.js (vi.mock hissé PAR FICHIER) ──
vi.mock("../../src/domain/interface/sheet/actor/fq-character-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/actor/fq-npc-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/items/fq-item-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-cards-sheet.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/window/hand-board.js", () => ({default: class {}}));
vi.mock("../../src/domain/interface/sheet/cards/fq-card-sheet.js", () => ({default: class {}}));
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({socket: {executeAsGM: vi.fn()}}));

globalThis.socketlib = {registerModule: vi.fn(() => ({register: vi.fn()}))};

const {playChoice} = await import("./play-harness.js");
const {default: CardEffect} = await import("../../src/domain/engine/shared/card-effect.js");

/**
 * Cartes éphémères (`replayable: "ephemere"`), jouées via le VRAI
 * `playValidatedCard`. Une carte éphémère ne rejoint jamais la pile de défausse :
 * au terme de l'application de ses effets, la copie de la main ET l'exemplaire
 * resté dans le deck (même id, marqué « pioché » par Foundry) sont supprimés —
 * ni le rappel de la défausse ni le remélange ne peuvent la ramener. Une carte
 * générée en cours de partie n'a pas d'exemplaire de deck : seule la copie de la
 * main disparaît.
 */

const EPHEMERAL_CARD_ID = "ephemeral-card";

/**
 * Construit une carte de main minimale infligeant 3 dégâts à la cible unique.
 *
 * @param {string} [replayable] - La valeur du champ `replayable` du choix.
 *
 * @returns {object} La carte brute consommable par `playChoice`.
 */
function makeCard(replayable = "ephemere") {
    return {
        _id: EPHEMERAL_CARD_ID,
        name: "FQCARDTITLE.Ephemere",
        face: 0,
        system: {
            fq: {
                choices: [{
                    action: "-1", targetType: "Default", minReach: "1", maxReach: "1",
                    damage: "3[bludgeoning]", bonusCrit: "0", bonusEva: "0", replayable
                }]
            }
        }
    };
}

describe("Carte éphémère — détruite au jeu, jamais défaussée", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Les espions posés sur le moteur (effet en échec) ne doivent pas fuiter
        // d'un test à l'autre, y compris quand une assertion casse avant leur retrait.
        vi.restoreAllMocks();
    });

    test("la carte n'est pas passée à la défausse et est supprimée de la main ET du deck", async () => {
        const result = await playChoice(makeCard(), 0);

        expect(result.threw).toBe(false);
        expect(result.passCalls).toHaveLength(0);
        expect(result.handDestroyCalls).toEqual([["Card", [EPHEMERAL_CARD_ID]]]);
        expect(result.deckDestroyCalls).toEqual([["Card", [EPHEMERAL_CARD_ID]]]);
    });

    test("les effets de la carte sont appliqués avant sa destruction", async () => {
        const result = await playChoice(makeCard(), 0);

        expect(result.hpCalls).toEqual([
            {targetTokenId: "world-target-token", value: 3, type: "damageFQ"}
        ]);
        expect(result.handDestroyCalls).toHaveLength(1);
    });

    test("un message de chat annonce la destruction définitive", async () => {
        const result = await playChoice(makeCard(), 0);

        expect(result.chatMessages.some(msg => msg.content?.includes("FQCARDENGINE.InfoMsgEphemeralSpell"))).toBe(true);
    });

    test("une carte générée (sans deck d'origine) ne détruit que la copie de la main", async () => {
        const result = await playChoice(makeCard(), 0, {cardOptions: {fromDeck: false}});

        expect(result.threw).toBe(false);
        expect(result.handDestroyCalls).toEqual([["Card", [EPHEMERAL_CARD_ID]]]);
        expect(result.deckDestroyCalls).toHaveLength(0);
    });

    test("un effet qui échoue ne laisse pas en main une carte annoncée détruite", async () => {
        const applyCardEffect = vi.spyOn(CardEffect, "applyCardEffect")
            .mockRejectedValue(new Error("effet en échec"));

        const result = await playChoice(makeCard(), 0);

        expect(applyCardEffect).toHaveBeenCalled();
        expect(result.handDestroyCalls).toEqual([["Card", [EPHEMERAL_CARD_ID]]]);
        expect(result.deckDestroyCalls).toEqual([["Card", [EPHEMERAL_CARD_ID]]]);
        applyCardEffect.mockRestore();
    });

    test("une carte NON éphémère garde le comportement historique : défaussée, jamais détruite", async () => {
        const result = await playChoice(makeCard(""), 0);

        expect(result.threw).toBe(false);
        expect(result.passCalls).toHaveLength(1);
        expect(result.handDestroyCalls).toHaveLength(0);
        expect(result.deckDestroyCalls).toHaveLength(0);
        expect(result.chatMessages.some(msg => msg.content?.includes("FQCARDENGINE.InfoMsgEphemeralSpell"))).toBe(false);
    });

    test("« ephemere » n'est pas interprété comme un nombre de charges : aucun message de charge restante", async () => {
        const result = await playChoice(makeCard(), 0);

        const chargeMessages = result.chatMessages
            .filter(msg => msg.content?.includes("FQCARDENGINE.InfoMsgRemainingCharge")
                || msg.content?.includes("FQCARDENGINE.InfoMsgReplayableSpell")
                || msg.content?.includes("FQCARDENGINE.InfoMsgPassiveSpell"));
        expect(chargeMessages).toHaveLength(0);
        // Et la carte n'est pas réécrite en main (pas de charge décrémentée).
        expect(result.handCardUpdates).toHaveLength(0);
    });
});
