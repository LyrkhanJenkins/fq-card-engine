import {describe, expect, it, vi} from "vitest";
import CardCondition from "../../src/domain/engine/shared/card-condition.js";
import {makeChoice} from "../factories.js";

/**
 * `CardCondition.evaluate` : évaluation pure des `customEvals` d'un choix.
 * Contrat : aucun message publié (le verdict est silencieux), messages d'erreur
 * renvoyés bruts (clé + arg), script qui lève = échec.
 */
describe("CardCondition.evaluate", () => {

    describe("sans condition", () => {
        it("renvoie ok sans customEvals, avec un tableau vide, ou une valeur non-tableau", () => {
            expect(CardCondition.evaluate(makeChoice()).ok).toBe(true);
            expect(CardCondition.evaluate(makeChoice({customEvals: []})).ok).toBe(true);
            expect(CardCondition.evaluate(makeChoice({customEvals: "pas un tableau"})).ok).toBe(true);
            expect(CardCondition.evaluate(undefined).ok).toBe(true);
        });

        it("ignore les scripts vides", () => {
            const choice = makeChoice({customEvals: [{script: ""}, {script: undefined}]});

            const verdict = CardCondition.evaluate(choice);

            expect(verdict).toEqual({ok: true, failures: []});
        });
    });

    describe("verdicts", () => {
        it("script vrai : ok, aucun échec", () => {
            const choice = makeChoice({customEvals: [{script: "1+1===2"}]});

            expect(CardCondition.evaluate(choice)).toEqual({ok: true, failures: []});
        });

        it("script faux : échec portant le script et ses errorMessages bruts", () => {
            const errorMessages = [{key: "FQCARDENGINE.Test", arg: "{\"a\":1}"}];
            const choice = makeChoice({customEvals: [{script: "1===2", errorMessages}]});

            const verdict = CardCondition.evaluate(choice);

            expect(verdict.ok).toBe(false);
            expect(verdict.failures).toEqual([{script: "1===2", errorMessages, thrown: null}]);
        });

        it("script sans errorMessages : l'échec porte un tableau vide", () => {
            const choice = makeChoice({customEvals: [{script: "false"}]});

            expect(CardCondition.evaluate(choice).failures[0].errorMessages).toEqual([]);
        });

        it("script qui lève : échec avec l'exception dans thrown", () => {
            const choice = makeChoice({customEvals: [{script: "nExistePas("}]});

            const verdict = CardCondition.evaluate(choice);

            expect(verdict.ok).toBe(false);
            expect(verdict.failures[0].thrown).toBeInstanceOf(Error);
        });

        it("plusieurs scripts : tous évalués, les échecs sont collectés dans l'ordre", () => {
            const choice = makeChoice({customEvals: [
                {script: "true"},
                {script: "1===2"},
                {script: "nExistePas("},
                {script: "true"}
            ]});

            const verdict = CardCondition.evaluate(choice);

            expect(verdict.ok).toBe(false);
            expect(verdict.failures.map(f => f.script)).toEqual(["1===2", "nExistePas("]);
            expect(verdict.failures[0].thrown).toBeNull();
            expect(verdict.failures[1].thrown).toBeInstanceOf(Error);
        });
    });

    describe("portée des scripts", () => {
        it("les scripts voient cardContent, card et to", () => {
            const choice = makeChoice({
                mana: "3",
                customEvals: [{script: "cardContent.mana === \"3\" && card.id === \"c1\" && to.id === \"pile1\""}]
            });

            const verdict = CardCondition.evaluate(choice, {id: "c1"}, {id: "pile1"});

            expect(verdict.ok).toBe(true);
        });

        it("les scripts voient les globaux (game)", () => {
            const choice = makeChoice({customEvals: [{script: "!!game.user.character"}]});

            expect(CardCondition.evaluate(choice).ok).toBe(true);
        });
    });

    describe("silence", () => {
        it("ne publie aucun message, même en échec ou en erreur", () => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => {
            });
            const choice = makeChoice({customEvals: [{script: "false"}, {script: "nExistePas("}]});

            CardCondition.evaluate(choice);

            expect(ChatMessage.create).not.toHaveBeenCalled();
            expect(ui.notifications.warn).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });
});
