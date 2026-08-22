import {afterEach, describe, expect, it, vi} from "vitest";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import {socket} from "../../src/hook/integration/socketlib.hook.js";
import TokenHud from "../../src/domain/interface/shared/token-hud.js";
import "../../src/hook/render-token.hook.js";

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

/**
 * Construit le DOM minimal attendu par le hook renderTokenHUD : un conteneur
 * avec deux colonnes ".col" (dont une ".col.left"), via jsdom (environment
 * "jsdom" déclaré dans vitest.config.js).
 */
function buildHudHtml() {
    const container = document.createElement("div");
    const colLeft = document.createElement("div");
    colLeft.classList.add("col", "left");
    const colRight = document.createElement("div");
    colRight.classList.add("col", "right");
    container.appendChild(colLeft);
    container.appendChild(colRight);
    return {container, colLeft, colRight};
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("render-token", () => {

    describe("deleteToken (exporté, appel direct)", () => {
        it("appelle token.document.delete() pour un token existant", () => {
            const tokenDoc = {delete: vi.fn()};
            game.canvas.tokens = {get: vi.fn(() => ({document: tokenDoc}))};

            TokenHud.deleteToken("token-1");

            expect(game.canvas.tokens.get).toHaveBeenCalledWith("token-1");
            expect(tokenDoc.delete).toHaveBeenCalled();
        });

        it("lève une erreur si le token est introuvable (comportement actuel, non corrigé)", () => {
            game.canvas.tokens = {get: vi.fn(() => undefined)};

            expect(() => TokenHud.deleteToken("missing")).toThrow();
        });
    });

    describe("renderTokenHUD", () => {
        it("vide les contrôles natifs pour un joueur quand la limitation des droits est active", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft, colRight} = buildHudHtml();
            colLeft.innerHTML = "<span>existing-left</span>";
            colRight.innerHTML = "<span>existing-right</span>";
            game.user.isGM = false;
            game.user.character = undefined;
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;

            hook({object: {}}, container, {});

            expect(colLeft.innerHTML).toBe("");
            expect(colRight.innerHTML).toBe("");
        });

        it("laisse les contrôles natifs au joueur quand la limitation des droits est désactivée", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft, colRight} = buildHudHtml();
            colLeft.innerHTML = "<span>existing-left</span>";
            colRight.innerHTML = "<span>existing-right</span>";
            game.user.isGM = false;
            game.user.character = undefined;
            CONFIG.FqCardEngine.options.playerLimitCardsRight = false;

            hook({object: {}}, container, {});

            expect(colRight.innerHTML).toBe("<span>existing-right</span>");
            expect(colLeft.innerHTML).toContain("existing-left");
        });

        it("ajoute les boutons de dégâts sur un token possédé même sans personnage assigné", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            game.user.character = undefined;
            const hudObject = {document: {name: "Goblin"}, name: "Goblin", id: "token-1", actor: {items: [], isOwner: true}};

            hook({object: hudObject}, container, {});

            // Les boutons de dégâts portent sur l'acteur du token, pas sur le
            // personnage de l'utilisateur : ils doivent apparaître quand même.
            expect(colLeft.children.length).toBe(2);
        });

        it("n'ajoute aucun bouton de dégâts sur un token que l'utilisateur ne possède pas", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            const hudObject = {document: {name: "Goblin"}, name: "Goblin", id: "token-1", actor: {items: [], isOwner: false}};

            hook({object: hudObject}, container, {});

            expect(colLeft.children.length).toBe(0);
        });

        it("ajoute les boutons de dégâts mêlée/distance (MJ + personnage) sans bouton squelette pour un token non-squelette", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            // game.user.character est déjà défini par défaut dans tests/setup.js.
            const hudObject = {document: {name: "Goblin"}, name: "Goblin", id: "token-1", actor: {items: [], isOwner: true}};

            hook({object: hudObject}, container, {});

            expect(colLeft.children.length).toBe(2);
            expect(colLeft.querySelector("[data-action='skeleton-sacrificed']")).toBeNull();
        });

        it("ajoute aussi le bouton squelette quand le nom du token contient 'Skeleton'", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            const hudObject = {
                document: {name: "Skeleton lvl 2"}, name: "Skeleton lvl 2", id: "token-2", actor: {items: [], isOwner: true}
            };

            hook({object: hudObject}, container, {});

            expect(colLeft.children.length).toBe(3);
            expect(colLeft.querySelector("[data-action='skeleton-sacrificed']")).not.toBeNull();
        });

        it("le clic sur le bouton squelette publie le message, met à jour le score et supprime le token via socket", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            game.user.character.system.fq.special = {sacrificedSkeleton: 0};
            const hudObject = {
                document: {name: "Skeleton lvl 2"}, name: "Skeleton lvl 2", id: "token-2", actor: {items: [], isOwner: true}
            };

            hook({object: hudObject}, container, {});
            const button = colLeft.querySelector("[data-action='skeleton-sacrificed']");
            button.click();

            expect(ChatMessage.create).toHaveBeenCalled();
            // "Skeleton lvl 2" -> score de sacrifice 2 (getSacrificedScore)
            expect(game.user.character.update).toHaveBeenCalledWith({"system.fq.special.sacrificedSkeleton": 2});
            expect(socket.executeAsGM).toHaveBeenCalledWith("deleteToken", "token-2");
        });
    });
});
