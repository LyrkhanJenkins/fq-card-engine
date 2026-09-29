import {afterEach, describe, expect, it, vi} from "vitest";
import {socket} from "../../src/hook/integration/socketlib.hook.js";

// Les 17 handlers enregistrés côté MJ par socket-lib.js au hook "socketlib.ready".
// Cette liste sert aussi de verrou pour T-04-03 (surface exposée sans auth) :
// tout ajout/retrait de handler doit être reflété ici consciemment.
const HANDLER_NAMES = [
    "addEffectForTarget",
    "removeEffectForTarget",
    "consumeAttackEffects",
    "drawCard",
    "applyActorHpModification",
    "logCardPlayed",
    "createActorFromData",
    "createTempFold",
    "getRandomFileFromFolder",
    "updateDeckForUser",
    "deleteDeckForUser",
    "deleteToken",
    "deckShuffledAlert",
    "passCards",
    // Pose des murs et du dessin d'un ouvrage de carte : n'écrit que des
    // murs et un dessin marqués du module, jamais d'acteur ni de carte.
    "createZoneWalls",
    // Purement visuel : fait battre l'opacité d'un token dans le canvas de chaque
    // client pour signaler des dégâts, sans jamais écrire sur son document.
    "blinkToken",
    // Purement visuel : n'écrit rien, se contente d'afficher chez les spectateurs
    // le rapport de jet que le lanceur vient de leur diffuser.
    "showResultWindow"
];

describe("socket-lib", () => {
    // Globals locaux (NON déclarés dans tests/setup.js) : nettoyés après chaque
    // test pour ne pas fuiter vers les autres suites (T-04-05).
    afterEach(() => {
        globalThis.socketlib = undefined;
        globalThis.FqCardEngineModule = undefined;
    });

    it("enregistre les 17 handlers socket au hook socketlib.ready", () => {
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
