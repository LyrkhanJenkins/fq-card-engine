import {beforeEach, describe, expect, test, vi} from "vitest";
import {createWarning} from "../../src/core/utils/chat.utils.js";
import {ERROR_COLOR, WARNING_COLOR} from "../../src/core/constants.js";

describe("createWarning", () => {
    beforeEach(() => vi.clearAllMocks());

    test("publie un span WARNING_COLOR italique contenant le message (sans préfixe par défaut)", () => {
        createWarning("Attention", {actor: {name: "Héros"}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        const content = ChatMessage.create.mock.calls[0][0].content;
        expect(content).toContain(WARNING_COLOR);
        expect(content).toContain("font-style: italic");
        expect(content).toContain("Attention");
        expect(content).not.toContain("Héros");
    });

    test("color override utilise la couleur fournie (ERROR_COLOR)", () => {
        createWarning("Erreur", {actor: {name: "H"}, color: ERROR_COLOR});
        expect(ChatMessage.create.mock.calls[0][0].content).toContain(ERROR_COLOR);
    });

    test("prependActorName préfixe le message du nom de l'acteur", () => {
        createWarning("plus assez de mana", {actor: {name: "Héros"}, prependActorName: true});
        expect(ChatMessage.create.mock.calls[0][0].content).toContain("Héros plus assez de mana");
    });

    test("fonctionne sans options (aucun acteur)", () => {
        createWarning("msg");
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(ChatMessage.create.mock.calls[0][0].content).toContain("msg");
    });
});
