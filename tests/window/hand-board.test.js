import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import HandBoard from "../../src/domain/interface/window/hand-board.js";
import TradingCards from "../../src/domain/trading/trading-cards.js";

/**
 * Couvre la logique pure de `HandBoard` testable sans DOM/jQuery (voir
 * `<execution_conventions>` des plans 01-01/02-01) : la construction des
 * données de gabarit (`buildTemplateData`), la garde en profondeur de
 * `chooseUserDialog()` (seule action du bouton d'engrenage MJ depuis D2-01),
 * la résolution paresseuse de `update()` (joueur ET MJ) et `restore()`.
 *
 * `HandBoard` n'est JAMAIS instanciée dans ce fichier (`new HandBoard(...)`
 * manipule du jQuery réel absent des mocks de `tests/setup.js`) — seules des
 * méthodes du prototype invoquées via `.call(objet-simple)` sont exercées ici.
 */

let previousPlayerLimitCardsRight;

beforeEach(() => {
    previousPlayerLimitCardsRight = CONFIG.FqCardEngine.options.playerLimitCardsRight;
});

afterEach(() => {
    CONFIG.FqCardEngine.options.playerLimitCardsRight = previousPlayerLimitCardsRight;
});

describe("buildTemplateData", () => {
    it("renvoie isGM: true quand l'utilisateur courant est MJ", () => {
        game.user.isGM = true;

        const data = HandBoard.buildTemplateData(0);

        expect(data.isGM).toBe(true);
    });

    it("distingue isGM de manualActions pour un joueur sous le réglage par défaut", () => {
        game.user.isGM = false;
        CONFIG.FqCardEngine.options.playerLimitCardsRight = false;

        const data = HandBoard.buildTemplateData(0);

        expect(data.isGM).toBe(false);
        expect(data.manualActions).toBe(true);
    });

    it("renvoie manualActions: false pour un joueur sous droits restreints", () => {
        game.user.isGM = false;
        CONFIG.FqCardEngine.options.playerLimitCardsRight = true;

        const data = HandBoard.buildTemplateData(0);

        expect(data.manualActions).toBe(false);
    });
});

describe("chooseUserDialog", () => {
    it("court-circuite avant tout accès à DialogV2 quand l'utilisateur courant n'est pas MJ (D2-12)", async () => {
        game.user.isGM = false;

        await expect(HandBoard.prototype.chooseUserDialog.call({})).resolves.toBeUndefined();
    });
});

describe("update — résolution paresseuse de la main (BAR-01, BAR-03, D1-06)", () => {
    let getFirstDeckSpy;
    let warnSpy;

    beforeEach(() => {
        getFirstDeckSpy = vi.spyOn(TradingCards, "getFirstDeck");
        warnSpy = vi.spyOn(ui.notifications, "warn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("résout la main du joueur COURANT, jamais un identifiant de barre ni de flag", () => {
        game.user.isGM = false;
        const hand = {id: "hand-a"};
        getFirstDeckSpy.mockReturnValue(hand);
        const bar = {id: 3, currentUser: {_id: "un-autre"}};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).toHaveBeenCalledWith(game.user.id, "HAND", false);
        expect(bar.currentCards).toBe(hand);
    });

    it("coupe l'avertissement : une main absente reste silencieuse", () => {
        game.user.isGM = false;
        getFirstDeckSpy.mockReturnValue(undefined);

        HandBoard.prototype.update.call({id: 0});

        expect(getFirstDeckSpy.mock.calls[0][2]).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("une main créée après coup est prise en compte au rendu suivant, sans rechargement", () => {
        game.user.isGM = false;
        const bar = {id: 0};

        getFirstDeckSpy.mockReturnValue(undefined);
        HandBoard.prototype.update.call(bar);
        expect(bar.currentCards).toBeUndefined();

        const hand = {id: "hand-cree-apres"};
        getFirstDeckSpy.mockReturnValue(hand);
        HandBoard.prototype.update.call(bar);

        expect(bar.currentCards).toBe(hand);
    });

    it("ne résout jamais via l'id du joueur courant pour un MJ, même avec une main déjà affichée", () => {
        game.user.isGM = true;
        const bar = {id: 0, currentCards: {id: "main-affichee"}};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).not.toHaveBeenCalled();
    });

    it("une barre retirée ne résout plus rien", () => {
        game.user.isGM = false;
        const bar = {id: 0, _removed: true};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).not.toHaveBeenCalled();
    });
});

describe("update — résolution paresseuse de la main côté MJ (BAR-04, D2-02)", () => {
    let getFirstDeckSpy;

    beforeEach(() => {
        getFirstDeckSpy = vi.spyOn(TradingCards, "getFirstDeck");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sans joueur suivi : ne résout rien, la barre reste silencieusement vide (D2-04)", () => {
        game.user.isGM = true;
        const bar = {id: 0};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).not.toHaveBeenCalled();
        expect(bar.currentCards).toBeUndefined();
    });

    it("avec un joueur suivi : résout sa main via l'id du joueur suivi, jamais celui du MJ", () => {
        game.user.isGM = true;
        const hand = {id: "hand-du-joueur-suivi"};
        getFirstDeckSpy.mockReturnValue(hand);
        const bar = {id: 0, currentUser: {id: "user-x"}};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).toHaveBeenCalledWith("user-x", "HAND", false);
        expect(bar.currentCards).toBe(hand);
    });

    it("sans joueur suivi, sur une main résiduelle : efface l'ancienne main plutôt que de la conserver", () => {
        game.user.isGM = true;
        const bar = {id: 0, currentCards: {id: "ancienne-main-du-joueur-disparu"}};

        HandBoard.prototype.update.call(bar);

        expect(getFirstDeckSpy).not.toHaveBeenCalled();
        expect(bar.currentCards).toBeUndefined();
    });
});

describe("setUserID — un joueur suivi introuvable vide l'utilisateur courant", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("id introuvable : vide currentUser plutôt que de conserver l'ancien joueur suivi", () => {
        vi.spyOn(game.users, "get").mockReturnValue(undefined);
        const bar = {currentUser: {id: "joueur-disparu"}};

        HandBoard.prototype.setUserID.call(bar, "id-introuvable");

        expect(bar.currentUser).toBeUndefined();
    });

    it("id trouvé : currentUser reçoit l'utilisateur renvoyé", () => {
        const user = {id: "user-trouve"};
        vi.spyOn(game.users, "get").mockReturnValue(user);
        const bar = {currentUser: undefined};

        HandBoard.prototype.setUserID.call(bar, "user-trouve");

        expect(bar.currentUser).toBe(user);
    });
});

describe("restore — un joueur ne relit jamais ses flags de barre (D1-03)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("pour un joueur : rafraîchit sans toucher aux flags mémorisés", () => {
        game.user.isGM = false;
        const bar = {
            setUserID: vi.fn(),
            getStoredUserID: vi.fn(),
            update: vi.fn()
        };

        HandBoard.prototype.restore.call(bar);

        expect(bar.getStoredUserID).not.toHaveBeenCalled();
        expect(bar.setUserID).not.toHaveBeenCalled();
        expect(bar.update).toHaveBeenCalledTimes(1);
    });

    it("pour le MJ : restaure le joueur suivi depuis UserID-*, sans plus jamais lire CardsID-* (D2-03)", () => {
        game.user.isGM = true;
        const bar = {
            setUserID: vi.fn(),
            getStoredUserID: vi.fn(() => "user-1"),
            update: vi.fn()
        };

        HandBoard.prototype.restore.call(bar);

        expect(bar.setUserID).toHaveBeenCalledWith("user-1");
        expect(bar.update).toHaveBeenCalledTimes(1);
    });
});

describe("update — garde de rendu (WR-02)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sans DOM prêt : résout quand même la main, mais ne rend pas", () => {
        game.user.isGM = false;
        const hand = {id: "hand-a"};
        const spy = vi.spyOn(TradingCards, "getFirstDeck").mockReturnValue(hand);
        const renderCards = vi.fn();
        const bar = {id: 0, renderCards};

        HandBoard.prototype.update.call(bar);

        expect(spy).toHaveBeenCalled();
        expect(bar.currentCards).toBe(hand);
        expect(renderCards).not.toHaveBeenCalled();
    });
});
