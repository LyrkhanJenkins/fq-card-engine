import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

/**
 * Macro de compendium FQPoisonSpread (propagation du poison normalisé) : DAE la
 * ré-exécute à chaque fin de tour de l'acteur affecté (`flags.dae.macroRepeat =
 * "endEveryTurn"`, `args[0] === "each"`). Chaque effet Poison se duplique UNE
 * seule fois (flag `hasReplicated`), la copie vierge se dupliquant au tour
 * suivant : dégâts 1, 2, 3, 4… par tour, cumul quadratique.
 *
 * Le code testé est la VRAIE commande du document macro de
 * `packs/_source/macros-sequencer/fqpoisonspread.json` — évaluée ici avec les
 * globaux DAE/Foundry mockés (args, fromUuid, foundry.utils.setProperty).
 */
const MACRO_PATH = path.join(process.cwd(), "packs", "_source", "macros-sequencer", "fqpoisonspread.json");
const macroDoc = JSON.parse(fs.readFileSync(MACRO_PATH, "utf-8"));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function setProperty(obj, key, value) {
    const parts = key.split(".");
    let node = obj;
    for (const part of parts.slice(0, -1)) {
        if (typeof node[part] !== "object" || node[part] === null) {
            node[part] = {};
        }
        node = node[part];
    }
    node[parts.at(-1)] = value;
    return true;
}

function runMacro(args, fromUuid) {
    const fn = new AsyncFunction("args", "fromUuid", "foundry", macroDoc.command);
    return fn(args, fromUuid, {utils: {setProperty}});
}

const MODULE_NAME = "fq-card-engine";

function makeWorld({replicated = false, effectFound = true} = {}) {
    const flags = {[MODULE_NAME]: {hasReplicated: replicated}};
    const effect = {
        id: "poison-1",
        getFlag: vi.fn((scope, key) => flags[scope]?.[key]),
        setFlag: vi.fn(async (scope, key, value) => {
            flags[scope] = {...flags[scope], [key]: value};
        }),
        toObject: () => JSON.parse(JSON.stringify({
            _id: "poison-1",
            name: "Poison",
            changes: [{key: "system.fq.bonus.dot", value: 1, type: "add"}],
            flags
        }))
    };
    const actor = {
        effects: {get: vi.fn(id => (effectFound && id === "poison-1" ? effect : undefined))},
        createEmbeddedDocuments: vi.fn(async (_name, data) => data)
    };
    const fromUuid = vi.fn(async uuid => (uuid === "Actor.a1" ? actor : null));
    const lastArg = {turn: "endTurn", actorUuid: "Actor.a1", effectId: "poison-1"};
    return {effect, actor, fromUuid, lastArg};
}

describe("FQPoisonSpread — duplication du poison en fin de tour", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("fin de tour, effet vierge : marque l'original répliqué et crée une copie vierge sans _id", async () => {
        const {effect, actor, fromUuid, lastArg} = makeWorld();

        await runMacro(["each", lastArg], fromUuid);

        expect(effect.setFlag).toHaveBeenCalledWith(MODULE_NAME, "hasReplicated", true);
        expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        const [embeddedName, [copy]] = actor.createEmbeddedDocuments.mock.calls[0];
        expect(embeddedName).toBe("ActiveEffect");
        expect(copy._id).toBeUndefined();
        expect(copy.name).toBe("Poison");
        // La copie naît VIERGE : elle se dupliquera à son tour (quadratique).
        expect(copy.flags[MODULE_NAME].hasReplicated).toBe(false);
    });

    test("effet déjà répliqué : aucune nouvelle copie (chaque effet ne se duplique qu'une fois)", async () => {
        const {effect, actor, fromUuid, lastArg} = makeWorld({replicated: true});

        await runMacro(["each", lastArg], fromUuid);

        expect(effect.setFlag).not.toHaveBeenCalled();
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("exécutions DAE hors répétition (application « on » / retrait « off ») : no-op", async () => {
        const {actor, fromUuid, lastArg} = makeWorld();

        await runMacro(["on", lastArg], fromUuid);
        await runMacro(["off", lastArg], fromUuid);

        expect(fromUuid).not.toHaveBeenCalled();
        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("répétition en DÉBUT de tour : no-op (la duplication n'arrive qu'en fin de tour)", async () => {
        const {actor, fromUuid, lastArg} = makeWorld();

        await runMacro(["each", {...lastArg, turn: "startTurn"}], fromUuid);

        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("effet introuvable (déjà retiré par un antidote) : no-op sans erreur", async () => {
        const {actor, fromUuid, lastArg} = makeWorld({effectFound: false});

        await expect(runMacro(["each", lastArg], fromUuid)).resolves.toBeUndefined();

        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    test("acteur introuvable : no-op sans erreur", async () => {
        const {actor, lastArg} = makeWorld();
        const fromUuid = vi.fn(async () => null);

        await expect(runMacro(["each", lastArg], fromUuid)).resolves.toBeUndefined();

        expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
});
