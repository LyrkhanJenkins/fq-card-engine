import {describe, expect, it} from "vitest";
import {makeActor, makeCard, makeChoice, makeDeck} from "./factories.js";

describe("factories", () => {

    // ─── makeActor ──────────────────────────────────────────────────────────

    describe("makeActor", () => {
        it("returns default fq values aligned with creature-fq/character-fq schemas", () => {
            const actor = makeActor();
            expect(actor.system.fq.action.value).toBe(10);
            expect(actor.system.fq.action.max).toBe(10);
            expect(actor.system.fq.mana.value).toBe(5);
            expect(actor.system.fq.zeal.max).toBe(8);
            expect(actor.system.fq.attributes.critical).toBe(1);
            expect(actor.system.fq.cards.currentDrop).toBe(0);
        });

        it("applies a shallow override on name while preserving other defaults", () => {
            const actor = makeActor({name: "Héros"});
            expect(actor.name).toBe("Héros");
            expect(actor.system.fq.action.value).toBe(10);
        });

        it("applies a shallow override on _id", () => {
            const actor = makeActor({_id: "hero-1"});
            expect(actor._id).toBe("hero-1");
        });

        it("returns a fresh object on each call (no shared reference)", () => {
            const first = makeActor();
            const second = makeActor();
            expect(first).not.toBe(second);
            expect(first.system).not.toBe(second.system);
            first.system.fq.action.value = 999;
            expect(second.system.fq.action.value).toBe(10);
        });
    });

    // ─── makeChoice ─────────────────────────────────────────────────────────

    describe("makeChoice", () => {
        it("returns default fields aligned with CardFqSystem.getChoiceSchema", () => {
            const choice = makeChoice();
            expect(choice.action).toBe("");
            expect(choice.mana).toBe("");
            expect(choice.zeal).toBe("");
            expect(choice.hp).toBe("");
            expect(choice.damage).toBe("");
            expect(choice.heal).toBe("");
            expect(choice.minReach).toBe("");
            expect(choice.maxReach).toBe("");
            expect(choice.nbTargets).toBe("");
            expect(choice.targetType).toBe("Default");
            expect(choice.minions).toEqual([]);
            expect(choice.applyEffectsFormulas).toEqual([]);
            expect(choice.messages).toEqual([]);
            expect(choice.customEvals).toEqual([]);
        });

        it("applies a shallow override while preserving other defaults", () => {
            const choice = makeChoice({damage: "1d6"});
            expect(choice.damage).toBe("1d6");
            expect(choice.targetType).toBe("Default");
        });
    });

    // ─── makeCard ───────────────────────────────────────────────────────────

    describe("makeCard", () => {
        it("returns default fq values aligned with CardFqSystem.defineSchema", () => {
            const card = makeCard();
            expect(card.system.fq.class).toBe("neutral");
            expect(card.system.fq.isInnate).toBe(false);
            expect(Array.isArray(card.system.fq.choices)).toBe(true);
            expect(card.system.fq.choices.length).toBeGreaterThanOrEqual(1);
            expect(card).toHaveProperty("id");
            expect(card).toHaveProperty("_id");
            expect(card).toHaveProperty("name");
            expect(card).toHaveProperty("back");
            expect(card).toHaveProperty("origin");
            expect(card).toHaveProperty("flags");
        });

        it("applies a shallow override on the system key", () => {
            const card = makeCard({system: {fq: {isInnate: true, choices: []}}});
            expect(card.system.fq.isInnate).toBe(true);
        });
    });

    // ─── makeDeck ───────────────────────────────────────────────────────────

    describe("makeDeck", () => {
        it("respects the type parameter and exposes mocked methods", () => {
            const deck = makeDeck("hand");
            expect(deck.system.fq.type).toBe("hand");
            expect(Array.isArray(deck.cards)).toBe(true);
            expect(typeof deck.createEmbeddedDocuments).toBe("function");
            expect(typeof deck.pass).toBe("function");
        });

        it("applies a shallow override on the system key", () => {
            const deck = makeDeck("spellbook", {system: {fq: {owner: "user1"}}});
            expect(deck.system.fq.owner).toBe("user1");
        });
    });
});
