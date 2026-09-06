import {afterEach, describe, expect, it, vi} from "vitest";

vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    socket: {
        executeAsGM: vi.fn()
    }
}));

import {socket} from "../../src/hook/integration/socketlib.hook.js";
import TokenHud from "../../src/domain/interface/token-hud.js";
import "../../src/hook/render-token.hook.js";

// Le prédicat d'estampille de sbire lit le nom du module sur la façade globale.
globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};

function getHook(name) {
    const call = Hooks.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : undefined;
}

/**
 * Construit le DOM minimal attendu par le hook renderTokenHUD : un conteneur
 * avec deux colonnes ".col" (dont une ".col.left"), via jsdom (environment
 * "jsdom" déclaré dans vitest.config.js).
 */
function minionHudObject({name = "Skeleton lvl 2", id = "token-2", type = "skeleton", summoner = "userCharacterId", hp = 10} = {}) {
    return {
        document: {name}, name, id,
        actor: {
            items: [], isOwner: true,
            flags: {"fq-card-engine": {minionType: type, summonerId: summoner}},
            system: {attributes: {hp: {value: hp}}}
        }
    };
}

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
        it("ne conserve que le ciblage et l'action de mouvement pour un joueur quand la limitation des droits est active", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft, colRight} = buildHudHtml();
            // DOM calqué sur le template natif v14 (templates/hud/token-hud.hbs).
            colLeft.innerHTML = "<div class='attribute elevation'></div><button data-action='sort'></button>";
            colRight.innerHTML =
                "<button data-action='togglePalette' data-palette='effects'></button>" +
                "<div class='palette status-effects' data-palette='effects'></div>" +
                "<button data-action='togglePalette' data-palette='movementActions'></button>" +
                "<div class='palette palette-list' data-palette='movementActions'></div>" +
                "<button data-action='target'></button>" +
                "<button data-action='combat'></button>";
            game.user.isGM = false;
            game.user.character = undefined;
            CONFIG.FqCardEngine.options.playerLimitCardsRight = true;

            hook({object: {}}, container, {});

            expect(colLeft.children.length).toBe(0);
            expect(colRight.querySelector("[data-action='target']")).not.toBeNull();
            // Bouton d'ouverture + palette de l'action de mouvement conservés.
            expect(colRight.querySelectorAll("[data-palette='movementActions']").length).toBe(2);
            expect(colRight.querySelector("[data-palette='effects']")).toBeNull();
            expect(colRight.querySelector("[data-action='combat']")).toBeNull();
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

        it("ajoute les boutons de dégâts mêlée/distance (MJ + personnage) sans bouton de sacrifice pour un token qui n'est pas un sbire", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            // game.user.character est déjà défini par défaut dans tests/setup.js.
            const hudObject = {document: {name: "Goblin"}, name: "Goblin", id: "token-1", actor: {items: [], isOwner: true}};

            hook({object: hudObject}, container, {});

            expect(colLeft.children.length).toBe(2);
            expect(colLeft.querySelector("[data-action='minion-sacrificed']")).toBeNull();
        });

        it("ajoute le bouton de sacrifice sur un sbire estampillé du personnage, quel que soit son type", () => {
            const hook = getHook("renderTokenHUD");
            game.user.isGM = true;

            for (const type of ["skeleton", "beast"]) {
                const {container, colLeft} = buildHudHtml();

                hook({object: minionHudObject({type})}, container, {});

                expect(colLeft.children.length).toBe(3);
                expect(colLeft.querySelector("[data-action='minion-sacrificed']")).not.toBeNull();
            }
        });

        it("n'ajoute pas le bouton de sacrifice sur le sbire d'un autre invocateur, ni sur un sbire mort", () => {
            const hook = getHook("renderTokenHUD");
            game.user.isGM = true;

            for (const options of [{summoner: "someoneElse"}, {hp: 0}]) {
                const {container, colLeft} = buildHudHtml();

                hook({object: minionHudObject(options)}, container, {});

                expect(colLeft.querySelector("[data-action='minion-sacrificed']")).toBeNull();
            }
        });

        it("le clic sur le bouton de sacrifice publie le message, met à jour le score et supprime le token via socket", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            game.user.character.system.fq.minions = {sacrificedMinion: 0};

            hook({object: minionHudObject()}, container, {});
            const button = colLeft.querySelector("[data-action='minion-sacrificed']");
            button.click();

            expect(ChatMessage.create).toHaveBeenCalled();
            expect(game.user.character.update).toHaveBeenCalledWith({
                "system.fq.minions.sacrificedMinion": TokenHud.SACRIFICE_SCORES["Skeleton lvl 2"]
            });
            expect(socket.executeAsGM).toHaveBeenCalledWith("deleteToken", "token-2");
        });

        it("un familier suit le score par défaut : il est absent de la table des scores", () => {
            const hook = getHook("renderTokenHUD");
            const {container, colLeft} = buildHudHtml();
            game.user.isGM = true;
            game.user.character.system.fq.minions = {sacrificedMinion: 0};

            hook({object: minionHudObject({name: "Tamed Wolf_4213", type: "beast"})}, container, {});
            colLeft.querySelector("[data-action='minion-sacrificed']").click();

            expect(game.user.character.update).toHaveBeenCalledWith({
                "system.fq.minions.sacrificedMinion": TokenHud.getSacrificedScore("Créature hors table")
            });
        });
    });

    describe("TokenHud.getSacrificedScore", () => {

        // Les scores eux-mêmes sont de l'équilibrage : c'est la LECTURE de la
        // table qui est vérifiée ici, jamais ses valeurs.
        it("lit la table par préfixe : le jeton d'un sbire porte un suffixe aléatoire", () => {
            for (const [minion, score] of Object.entries(TokenHud.SACRIFICE_SCORES)) {
                expect(TokenHud.getSacrificedScore(`${minion}_428913`)).toBe(score);
            }
        });

        it("retombe sur le score par défaut pour un sbire absent de la table (familiers compris), et sans nom", () => {
            const byDefault = TokenHud.getSacrificedScore("Créature hors table");

            expect(Object.values(TokenHud.SACRIFICE_SCORES)).not.toContain(undefined);
            expect(TokenHud.getSacrificedScore("Tamed Wolf_4213")).toBe(byDefault);
            expect(TokenHud.getSacrificedScore("Enraged Bear_88")).toBe(byDefault);
            expect(TokenHud.getSacrificedScore("Squelette du MJ")).toBe(byDefault);
            expect(TokenHud.getSacrificedScore(undefined)).toBe(byDefault);
        });
    });
});
