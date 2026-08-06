import {afterEach, describe, expect, it, vi} from "vitest";
import {socket} from "../../src/hook/integration/socketlib.hook.js";

// Les 10 handlers enregistrés côté MJ par socket-lib.js au hook "socketlib.ready".
// Cette liste sert aussi de verrou pour T-04-03 (surface exposée sans auth) :
// tout ajout/retrait de handler doit être reflété ici consciemment.
const HANDLER_NAMES = [
    "addEffectForTarget",
    "drawCard",
    "applyActorHpModification",
    "logCardPlayed",
    "createActorFromData",
    "createTempFold",
    "getRandomFileFromFolder",
    "updateDeckForUser",
    "deleteDeckForUser",
    "deleteToken"
];

describe("socket-lib", () => {
    // Globals locaux (NON déclarés dans tests/setup.js) : nettoyés après chaque
    // test pour ne pas fuiter vers les autres suites (T-04-05).
    afterEach(() => {
        globalThis.socketlib = undefined;
        globalThis.FqCardEngineModule = undefined;
    });

    it("enregistre les 10 handlers socket au hook socketlib.ready", () => {
        const registeredSocket = {register: vi.fn()};
        globalThis.socketlib = {registerModule: vi.fn(() => registeredSocket)};
        globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};

        // L'import du module (en tête de fichier) a déjà enregistré le callback
        // via Hooks.once("socketlib.ready", cb) ; on le capture ici et on
        // l'invoque manuellement pour simuler le hook socketlib.
        const call = Hooks.once.mock.calls.find(c => c[0] === "socketlib.ready");
        expect(call).toBeDefined();
        const callback = call[1];

        callback();

        expect(globalThis.socketlib.registerModule).toHaveBeenCalledWith("fq-card-engine");
        HANDLER_NAMES.forEach(name => {
            expect(registeredSocket.register).toHaveBeenCalledWith(name, expect.any(Function));
        });
        expect(registeredSocket.register).toHaveBeenCalledTimes(HANDLER_NAMES.length);
        // Liaison vive (export let socket) : mise à jour après invocation du callback.
        expect(socket).toBeDefined();
    });
});
