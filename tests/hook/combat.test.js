import {beforeEach, describe, expect, it, vi} from "vitest";
import {socket} from "../../src/hook/integration/socketlib.hook.js";
import TradingCards, {DECK_TYPE, HAND_TYPE} from "../../src/domain/trading/trading-cards.js";
import {OriginFQEffectLabel} from "../../src/domain/constants.js";
import {makeCard, makeDeck} from "../factories.js";
import {dnd5eDamage, stubRolls} from "../engine/roll-fixtures.js";

// ─── Mocks de modules ──────────────────────────────────────────────────────
//
// L'export réel `socket` de socket-lib.js reste `undefined` tant que le hook
// `socketlib.ready` n'a pas été invoqué. combat.hook.js déréférence pourtant
// `socket.executeAsUser`/`executeAsGM` dans drawHand/drawPick : sans ce mock,
// ces appels planteraient. Suit le même pattern que
// tests/utils/fq-utils.test.js et tests/window/play-card.test.js.
vi.mock("../../src/hook/integration/socketlib.hook.js", () => ({
    default: {},
    socket: {
        executeAsUser: vi.fn(),
        executeAsGM: vi.fn(),
        executeForEveryone: vi.fn()
    }
}));

// Importer le module sous test : enregistre les 5 hooks inline via
// `Hooks.on` (globalThis.Hooks.on est un vi.fn() défini une seule fois par
// tests/setup.js — zone 1, non réinitialisé en beforeEach) et définit la
// classe `Combat`, module-privée. Ses méthodes statiques ne sont atteignables
// que via les callbacks capturés ci-dessous.
import "../../src/hook/combat.hook.js";

/**
 * Renvoie le dernier callback enregistré par `Hooks.on(name, cb)` pour le nom
 * de hook donné. `Hooks.on.mock.calls` n'est jamais vidé dans ce fichier
 * (aucun vi.clearAllMocks()/resetAllMocks() global) : les 5 hooks de
 * combat.hook.js n'étant enregistrés qu'une seule fois à l'import du module, les
 * vider casserait la capture pour tous les tests suivants.
 */
function getHook(name) {
    const calls = Hooks.on.mock.calls.filter(call => call[0] === name);
    return calls.at(-1)?.[1];
}

const GM_ID = "gm-user-id";

/**
 * Construit un combattant de test avec un acteur minimal aligné sur les
 * champs `system.fq`/`system.attributes` consommés par combat.hook.js
 * (action/zeal/bonus.dot/cards, attributes.exhaustion/hp). `actor.update`
 * est un vi.fn espionnable.
 */
function makeCombatant({actorId = "actor-1", fq = {}, attributes = {}, effects} = {}) {
    const actor = {
        id: actorId,
        _id: actorId,
        name: actorId,
        update: vi.fn().mockResolvedValue(undefined),
        system: {
            fq: {
                action: {value: 0, max: 5},
                zeal: {value: 0, max: 8, init: 2},
                bonus: {range: 0, damage: "", heal: "", dot: 0},
                cards: {hand: 2, pick: 1},
                ...fq
            },
            attributes: {
                exhaustion: 0,
                hp: {value: 10, max: 10},
                ...attributes
            }
        }
    };
    if (effects !== undefined) {
        actor.effects = effects;
    }
    return {actor};
}

beforeEach(() => {
    // Défaut : utilisateur local premier MJ actif, condition requise par
    // CombatTurn.isLocalUserFirstActiveGM() pour exécuter les opérations
    // partagées. setup.js ne fournit ni game.userId ni game.users.activeGM.
    // game.users doit rester itérable (forEach/filter/find, utilisés
    // respectivement par drawInnateCards/drawHand/combatTurnChange) : on le
    // remplace par un tableau (les méthodes natives suffisent) auquel on
    // attache `.activeGM`, comme le fait la vraie Collection Foundry.
    game.userId = GM_ID;
    game.users = Object.assign([], {activeGM: {id: GM_ID}});

    socket.executeAsUser.mockReset();
    socket.executeAsGM.mockReset();
    socket.executeForEveryone.mockReset();
});

describe("hook/combat.hook.js", () => {

    // ─── Tâche 1 : harnais + tranche end-to-end ────────────────────────────

    describe("harnais", () => {
        it("capture les 5 hooks inline enregistrés par le module", () => {
            expect(getHook("deleteCombat")).toBeTypeOf("function");
            expect(getHook("createCombatant")).toBeTypeOf("function");
            expect(getHook("createCombat")).toBeTypeOf("function");
            expect(getHook("userConnected")).toBeTypeOf("function");
            expect(getHook("combatTurnChange")).toBeTypeOf("function");
        });
    });

    describe("createCombat -> CombatTurn.resetCards", () => {
        it("rappelle chaque deck FQ (recall) quand l'utilisateur local est premier MJ actif", () => {
            const deck = {system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            game.cards = [deck];

            getHook("createCombat")();

            expect(deck.recall).toHaveBeenCalledWith({chatNotification: false});
        });

        it("ne rappelle aucun deck si l'utilisateur local n'est pas premier MJ actif", () => {
            const deck = {system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            game.cards = [deck];
            game.users.activeGM = {id: "other-gm"};

            getHook("createCombat")();

            expect(deck.recall).not.toHaveBeenCalled();
        });

        it("supprime des mains/piles les cartes orphelines (sans origin), que recall ne rapatrie pas", async () => {
            const deck = {id: "deck-1", type: "deck", system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            const hand = {
                system: {fq: {type: HAND_TYPE}},
                cards: [
                    {id: "generated-card", origin: null},
                    {id: "normal-card", origin: deck}
                ],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.cards = [deck, hand];

            // deleteCombat attend resetCards : permet d'asserter après la purge
            await getHook("deleteCombat")({combatants: []}, {});

            expect(deck.recall).toHaveBeenCalledWith({chatNotification: false});
            expect(hand.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["generated-card"]);
        });

        it("supprime aussi les cartes dont l'origine n'est pas un deck (générée défaussée : origin = la main)", async () => {
            // Cards#pass estampille la main quittée comme origine des cartes générées
            // défaussées : elles ne sont plus `origin: null` mais restent orphelines.
            const deck = {id: "deck-1", type: "deck", system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            const hand = {type: "hand", system: {fq: {type: HAND_TYPE}}, cards: [], deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])};
            const pile = {
                system: {fq: {type: "PILE"}},
                cards: [
                    {id: "generated-discarded", origin: hand},
                    {id: "normal-card", origin: deck}
                ],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.cards = [deck, hand, pile];

            await getHook("deleteCombat")({combatants: []}, {});

            expect(pile.deleteEmbeddedDocuments).toHaveBeenCalledWith("Card", ["generated-discarded"]);
        });

        it("ne balaie jamais les spellbooks ni les decks importés (leurs cartes sont chez elles, origin nul)", async () => {
            const deck = {id: "deck-1", type: "deck", system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            const spellbook = {
                type: "deck",
                system: {fq: {type: "SPELLBOOK"}},
                cards: [{id: "spellbook-card", origin: null}],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            const importedDeck = {
                type: "deck",
                system: {fq: {type: ""}},
                cards: [{id: "imported-card", origin: null}],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.cards = [deck, spellbook, importedDeck];

            await getHook("deleteCombat")({combatants: []}, {});

            expect(spellbook.deleteEmbeddedDocuments).not.toHaveBeenCalled();
            expect(importedDeck.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });

        it("supprime des decks les cartes générées qui y ont été recyclées en cours de combat", async () => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            const deck = {
                id: "deck-1", type: "deck", system: {fq: {type: DECK_TYPE}},
                recall: vi.fn().mockResolvedValue(undefined),
                cards: [
                    {id: "gen-recycled", flags: {"fq-card-engine": {generated: true, generatedAt: 1}}},
                    {id: "normal-card", flags: {}}
                ],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.cards = [deck];

            await getHook("deleteCombat")({combatants: []}, {});

            expect(deck.deleteEmbeddedDocuments)
                .toHaveBeenCalledWith("Card", ["gen-recycled"], {fqAllowBelowMin: true});
        });

        it("ne touche pas aux mains/piles sans carte orpheline", async () => {
            const deck = {id: "deck-1", type: "deck", system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            const hand = {
                system: {fq: {type: HAND_TYPE}},
                cards: [{id: "normal-card", origin: deck}],
                deleteEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            game.cards = [deck, hand];

            await getHook("deleteCombat")({combatants: []}, {});

            expect(hand.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });
    });

    // ─── Tâche 2 : hooks de cycle de vie + garde MJ + drawInnateCards ────────

    describe("deleteCombat", () => {
        it("MJ : reset les decks, remet l'exhaustion à 0 et supprime les effets FQ", async () => {
            const deck = {system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            game.cards = [deck];

            const fqEffect = {origin: OriginFQEffectLabel, delete: vi.fn()};
            const otherEffect = {origin: "Some Other Origin", delete: vi.fn()};
            const effects = Object.assign([fqEffect, otherEffect], {size: 2});
            const combatant = makeCombatant({
                actorId: "c1",
                attributes: {exhaustion: 2, hp: {value: 10, max: 10}},
                effects
            });

            await getHook("deleteCombat")({combatants: [combatant]}, {});

            expect(deck.recall).toHaveBeenCalledWith({chatNotification: false});
            expect(combatant.actor.update).toHaveBeenCalledWith({"system.attributes.exhaustion": 0});
            expect(fqEffect.delete).toHaveBeenCalled();
            expect(otherEffect.delete).not.toHaveBeenCalled();
        });

        it("MJ : laisse à dnd5e les effets FQ déjà expirés, qu'il retire lui-même à la sortie du combat", async () => {
            game.cards = [];
            const expiredEffect = {origin: OriginFQEffectLabel, duration: {expired: true}, delete: vi.fn()};
            const activeEffect = {origin: OriginFQEffectLabel, duration: {expired: false}, delete: vi.fn()};
            const effects = Object.assign([expiredEffect, activeEffect], {size: 2});
            const combatant = makeCombatant({actorId: "c1", effects});

            await getHook("deleteCombat")({combatants: [combatant]}, {});

            expect(expiredEffect.delete).not.toHaveBeenCalled();
            expect(activeEffect.delete).toHaveBeenCalled();
        });

        it("non-MJ : n'effectue aucune mise à jour", async () => {
            const deck = {system: {fq: {type: DECK_TYPE}}, recall: vi.fn().mockResolvedValue(undefined)};
            game.cards = [deck];
            game.users.activeGM = {id: "other-gm"};

            const fqEffect = {origin: OriginFQEffectLabel, delete: vi.fn()};
            const effects = Object.assign([fqEffect], {size: 1});
            const combatant = makeCombatant({actorId: "c1", effects});

            await getHook("deleteCombat")({combatants: [combatant]}, {});

            expect(deck.recall).not.toHaveBeenCalled();
            expect(combatant.actor.update).not.toHaveBeenCalled();
            expect(fqEffect.delete).not.toHaveBeenCalled();
        });
    });

    describe("createCombatant", () => {
        it("MJ + rollInitiative actif : déclenche game.combat.rollAll", async () => {
            CONFIG.FqCardEngine.options.rollInitiative = true;
            game.combat.rollAll = vi.fn().mockResolvedValue(undefined);

            await getHook("createCombatant")({}, {}, {});

            expect(game.combat.rollAll).toHaveBeenCalled();
        });

        it("rollInitiative inactif : n'appelle pas game.combat.rollAll", async () => {
            CONFIG.FqCardEngine.options.rollInitiative = false;
            game.combat.rollAll = vi.fn().mockResolvedValue(undefined);

            await getHook("createCombatant")({}, {}, {});

            expect(game.combat.rollAll).not.toHaveBeenCalled();
        });
    });

    describe("userConnected -> CombatTurn.drawInnateCards", () => {
        it("passe uniquement les cartes innées non piochées de chaque utilisateur, de son deck vers sa main", () => {
            game.users = Object.assign([{id: "user-1"}], {activeGM: {id: GM_ID}});

            const baseUndrawn1 = makeCard({id: "base-1", system: {fq: {isInnate: true}}, drawn: false});
            const baseUndrawn2 = makeCard({id: "base-2", system: {fq: {isInnate: true}}, drawn: false});
            const baseDrawn = makeCard({id: "base-3", system: {fq: {isInnate: true}}, drawn: true});
            const nonBase = makeCard({id: "other-1", system: {fq: {isInnate: false}}, drawn: false});

            const deck = makeDeck(DECK_TYPE, {cards: [baseUndrawn1, baseUndrawn2, baseDrawn, nonBase]});
            const hand = makeDeck(HAND_TYPE);

            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => {
                if (typeFq === DECK_TYPE) return deck;
                if (typeFq === HAND_TYPE) return hand;
                return undefined;
            });

            getHook("userConnected")({id: "user-1"}, true);

            expect(deck.pass).toHaveBeenCalledWith(hand, ["base-1", "base-2"], {chatNotification: false});
        });

        it("garde MJ : activeGM null -> avertit et n'effectue aucune opération partagée", () => {
            game.users = Object.assign([{id: "user-1"}], {activeGM: null});
            const deck = makeDeck(DECK_TYPE, {cards: [makeCard({id: "base-1", system: {fq: {isInnate: true}}, drawn: false})]});
            const hand = makeDeck(HAND_TYPE);
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);

            getHook("userConnected")({id: "user-1"}, true);

            expect(ui.notifications.warn).toHaveBeenCalledWith("FQCARDENGINE.GMMustBeConnected");
            expect(deck.pass).not.toHaveBeenCalled();
        });
    });

    // ─── Tâche 3 : combatTurnChange ─────────────────────────────────────────

    describe("combatTurnChange", () => {

        it("garde retour arrière (round inférieur) : aucun effet", async () => {
            const combatant = makeCombatant({actorId: "c1"});
            const combat = {
                round: 1, turn: 0,
                previous: {round: 2, turn: 0},
                current: {round: 1, turn: 0},
                combatants: [combatant],
                combatant: null
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(combatant.actor.update).not.toHaveBeenCalled();
            expect(socket.executeAsUser).not.toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalled();
            expect(ui.notifications.warn).not.toHaveBeenCalled();
        });

        it("garde retour arrière (même round, turn inférieur) : aucun effet", async () => {
            const combatant = makeCombatant({actorId: "c1"});
            const combat = {
                round: 2, turn: 0,
                previous: {round: 2, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant: null
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(combatant.actor.update).not.toHaveBeenCalled();
        });

        it("combattant sans acteur : avertit", async () => {
            const combat = {
                round: 1, turn: 0,
                previous: {round: 1, turn: 0},
                current: {round: 1, turn: 0},
                combatants: [{actor: null}],
                combatant: null
            };
            game.users.activeGM = {id: "other-gm"}; // isole l'avertissement, sans dérouler la branche MJ

            await getHook("combatTurnChange")(combat, {}, {});

            expect(ui.notifications.warn).toHaveBeenCalledWith(
                "FQCARDENGINE.WarningCombattantsWithNoActor", {localize: true}
            );
        });

        it("nouveau round (pas le premier) : resetAction seul", async () => {
            const combatant = makeCombatant({actorId: "c1", fq: {action: {value: 0, max: 7}}});
            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant: null
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(combatant.actor.update).toHaveBeenCalledTimes(1);
            expect(combatant.actor.update).toHaveBeenCalledWith({"system.fq.action.value": 7});
        });

        it("premier round : resetAction + resetZeal + drawHand + resetSacrificedMinion", async () => {
            const activeCombatant = makeCombatant({
                actorId: "active-actor",
                fq: {action: {value: 0, max: 6}, zeal: {value: 0, max: 8, init: 3}, cards: {hand: 4, pick: 1}}
            });
            const inactiveCombatant = makeCombatant({
                actorId: "inactive-actor",
                fq: {action: {value: 0, max: 6}, zeal: {value: 0, max: 8, init: 1}, cards: {hand: 2, pick: 1}}
            });

            game.users = Object.assign([
                {id: "active-user", character: {id: "active-actor"}, active: true},
                {id: "inactive-user", character: {id: "inactive-actor"}, active: false}
            ], {activeGM: {id: GM_ID}});

            const activeDeck = {id: "deck-active"};
            const activeHand = {id: "hand-active"};
            const inactiveDeck = {id: "deck-inactive"};
            const inactiveHand = {id: "hand-inactive"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => {
                if (userId === "active-user") return typeFq === DECK_TYPE ? activeDeck : activeHand;
                if (userId === "inactive-user") return typeFq === DECK_TYPE ? inactiveDeck : inactiveHand;
                return undefined;
            });

            const combat = {
                round: 1, turn: 0,
                previous: {round: 0, turn: 0},
                current: {round: 1, turn: 0},
                combatants: [activeCombatant, inactiveCombatant],
                combatant: null
            };

            await getHook("combatTurnChange")(combat, {}, {});

            // resetAction
            expect(activeCombatant.actor.update).toHaveBeenCalledWith({"system.fq.action.value": 6});
            expect(inactiveCombatant.actor.update).toHaveBeenCalledWith({"system.fq.action.value": 6});
            // resetZeal
            expect(activeCombatant.actor.update).toHaveBeenCalledWith({"system.fq.zeal.value": 3});
            expect(inactiveCombatant.actor.update).toHaveBeenCalledWith({"system.fq.zeal.value": 1});
            // resetSacrificedMinion
            expect(activeCombatant.actor.update).toHaveBeenCalledWith({"system.fq.minions.sacrificedMinion": 0});
            // drawHand : utilisateur actif -> executeAsUser ; utilisateur inactif -> executeAsGM
            expect(socket.executeAsUser).toHaveBeenCalledWith("drawCard", "active-user", "hand-active", "deck-active", 4);
            expect(socket.executeAsGM).toHaveBeenCalledWith("drawCard", "hand-inactive", "deck-inactive", 2);
        });

        it("premier round : un personnage déjà à terre ne reçoit pas de main de départ", async () => {
            globalThis.FqCardEngineModule = {moduleName: "fq-card-engine"};
            game.settings.get = vi.fn(() => true);
            const deboutCombatant = makeCombatant({
                actorId: "debout-actor",
                fq: {action: {value: 0, max: 6}, zeal: {value: 0, max: 8, init: 3}, cards: {hand: 4, pick: 1}}
            });
            const aTerreCombatant = makeCombatant({
                actorId: "a-terre-actor",
                fq: {action: {value: 0, max: 6}, zeal: {value: 0, max: 8, init: 1}, cards: {hand: 4, pick: 1}},
                attributes: {exhaustion: 0, hp: {value: 0, max: 12}}
            });

            game.users = Object.assign([
                {id: "debout-user", character: {id: "debout-actor"}, active: true},
                {id: "a-terre-user", character: {id: "a-terre-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) => (
                {id: `${typeFq === DECK_TYPE ? "deck" : "hand"}-${userId}`}
            ));

            const combat = {
                round: 1, turn: 0,
                previous: {round: 0, turn: 0},
                current: {round: 1, turn: 0},
                combatants: [deboutCombatant, aTerreCombatant],
                combatant: null
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(socket.executeAsUser)
                .toHaveBeenCalledWith("drawCard", "debout-user", "hand-debout-user", "deck-debout-user", 4);
            expect(socket.executeAsUser).toHaveBeenCalledTimes(1);
        });

        it("dégâts de poison (dot) hors premier round, sans tour de joueur associé", async () => {
            const combatant = makeCombatant({
                actorId: "dot-actor",
                fq: {bonus: {range: 0, damage: "", heal: "", dot: 3}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            const combat = {
                round: 1, turn: 1,
                previous: {round: 1, turn: 0},
                current: {round: 1, turn: 1},
                combatants: [combatant],
                combatant
            };
            // Aucun utilisateur ne correspond à cet acteur : isole la branche dot de la
            // branche "tour d'un joueur".
            game.users = Object.assign([], {activeGM: {id: GM_ID}});

            await getHook("combatTurnChange")(combat, {}, {});

            expect(combatant.actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 7});
        });

        /**
         * Un tour de combat pour un porteur de dégâts par tour typés, sans joueur associé.
         *
         * @param {string} dot      - La formule des dégâts par tour.
         * @param {number} total    - Le total que son jet imposé rendra.
         * @param {object} [traits] - Les traits dnd5e du porteur.
         *
         * @returns {Promise<object>} Le combattant, après le changement de tour.
         */
        async function typedDotTurn(dot, total, traits) {
            const combatant = makeCombatant({
                actorId: "dot-actor",
                fq: {bonus: {range: 0, damage: "", heal: "", dot}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            if (traits) {
                combatant.actor.calculateDamage = dnd5eDamage(traits);
            }
            const combat = {
                round: 1, turn: 1,
                previous: {round: 1, turn: 0},
                current: {round: 1, turn: 1},
                combatants: [combatant],
                combatant
            };
            game.users = Object.assign([], {activeGM: {id: GM_ID}});

            const originalRoll = globalThis.Roll;
            stubRolls([{total}]);
            try {
                await getHook("combatTurnChange")(combat, {}, {});
            } finally {
                globalThis.Roll = originalRoll;
            }
            return combatant;
        }

        it("dégâts par tour typés : poison et brûlure sur un immunisé au poison font ×½", async () => {
            const combatant = await typedDotTurn("+1[poison]+1[poison]+2[fire]", 4, {di: ["poison"]});

            expect(combatant.actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 8});
        });

        it("dégâts par tour typés : la résistance divise la brûlure", async () => {
            const combatant = await typedDotTurn("+4[fire]", 4, {dr: ["fire"]});

            expect(combatant.actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 8});
        });

        it("un soin par tour (dot négatif) rend des points de vie", async () => {
            const combatant = await typedDotTurn("-3", -3, {});

            expect(combatant.actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 13});
        });

        it("tout effacé par une immunité : aucune écriture de points de vie", async () => {
            const combatant = await typedDotTurn("+2[poison]", 2, {di: ["poison"]});

            expect(combatant.actor.update).not.toHaveBeenCalledWith(
                expect.objectContaining({"system.attributes.hp.value": expect.anything()}));
        });

        it("tour d'un joueur, deck suffisant : drawPick pioche pickScore cartes", async () => {
            const combatant = makeCombatant({
                actorId: "player-actor",
                fq: {cards: {hand: 2, pick: 2}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            game.users = Object.assign([
                {id: "player-user", character: {id: "player-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            const deck = {id: "deck-1", availableCards: [{}, {}, {}, {}, {}]}; // 5 cartes dispo > pick(2)
            const hand = {id: "hand-1"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);
            const recallSpy = vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(undefined);

            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(combatant.actor.update).toHaveBeenCalledWith({"system.fq.minions.sacrificedMinion": 0});
            expect(socket.executeAsUser).toHaveBeenCalledWith("drawCard", "player-user", "hand-1", "deck-1", 2);
            expect(recallSpy).not.toHaveBeenCalled();
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("tour d'un joueur, deck insuffisant (mais non vide) : pioche le reste sans épuisement, message d'alerte, défausse rappelée dans le deck", async () => {
            const combatant = makeCombatant({
                actorId: "player-actor",
                fq: {cards: {hand: 2, pick: 3}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            game.users = Object.assign([
                {id: "player-user", character: {id: "player-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            const deck = {id: "deck-1", availableCards: [{id: "r1"}]}; // 1 carte dispo <= pick(3), mais > 0
            const hand = {id: "hand-1"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);
            // Le recyclage regarnit le deck avec 3 cartes défaussées (la restante
            // r1 n'est pas encore piochée : elle est toujours disponible)
            const recallSpy = vi.spyOn(TradingCards, "recallCardsFromPiles").mockImplementation(async () => {
                deck.availableCards = [{id: "r1"}, {id: "p1"}, {id: "p2"}, {id: "p3"}];
                return 3;
            });
            const sampleSpy = vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue(["p2", "p1"]);

            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant
            };

            await getHook("combatTurnChange")(combat, {}, {});

            // Une SEULE pioche : la restante garantie + 2 recyclées au hasard (pick 3)
            expect(recallSpy).toHaveBeenCalledWith(deck);
            expect(sampleSpy).toHaveBeenCalledWith([{id: "p1"}, {id: "p2"}, {id: "p3"}], 2);
            expect(socket.executeAsUser).toHaveBeenCalledTimes(1);
            expect(socket.executeAsUser).toHaveBeenCalledWith("passCards", "player-user", "hand-1", "deck-1", ["r1", "p2", "p1"]);
            // Remélanger coûte un rang d'épuisement et son carré en points de vie.
            expect(combatant.actor.update).toHaveBeenCalledWith({
                "system.attributes.exhaustion": 1,
                "system.attributes.hp.value": 8
            });
            // L'alerte « deck mélangé » est diffusée à tous, plus de message de chat
            expect(socket.executeForEveryone).toHaveBeenCalledWith("deckShuffledAlert", "player-user",
                "player-actor", {level: 1, damage: 2});
            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("tour d'un joueur, deck vide, recyclage partiel : pioche plafonnée aux cartes recyclées", async () => {
            const combatant = makeCombatant({
                actorId: "player-actor",
                fq: {cards: {hand: 2, pick: 3}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            game.users = Object.assign([
                {id: "player-user", character: {id: "player-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            const deck = {id: "deck-1", availableCards: []}; // deck vide
            const hand = {id: "hand-1"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);
            // Une seule carte défaussée à recycler : la pioche est plafonnée à 1 (pick 3)
            const recallSpy = vi.spyOn(TradingCards, "recallCardsFromPiles").mockImplementation(async () => {
                deck.availableCards = [{id: "p1"}];
                return 1;
            });
            vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue(["p1"]);

            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(recallSpy).toHaveBeenCalledWith(deck);
            expect(socket.executeAsUser).toHaveBeenCalledTimes(1);
            expect(socket.executeAsUser).toHaveBeenCalledWith("passCards", "player-user", "hand-1", "deck-1", ["p1"]);
            // Remélanger coûte un rang d'épuisement et son carré en points de vie.
            expect(combatant.actor.update).toHaveBeenCalledWith({
                "system.attributes.exhaustion": 1,
                "system.attributes.hp.value": 8
            });
            expect(socket.executeForEveryone).toHaveBeenCalledWith("deckShuffledAlert", "player-user",
                "player-actor", {level: 1, damage: 2});
        });

        it("tour d'un joueur, deck vide et rien à recycler : aucune pioche, aucun épuisement", async () => {
            const combatant = makeCombatant({
                actorId: "player-actor",
                fq: {cards: {hand: 2, pick: 3}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            game.users = Object.assign([
                {id: "player-user", character: {id: "player-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            const deck = {id: "deck-1", availableCards: []}; // deck vide, défausses vides
            const hand = {id: "hand-1"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);
            const recallSpy = vi.spyOn(TradingCards, "recallCardsFromPiles").mockResolvedValue(0);
            vi.spyOn(TradingCards, "sampleCardIds").mockReturnValue([]);

            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(recallSpy).toHaveBeenCalledWith(deck);
            expect(socket.executeAsUser).not.toHaveBeenCalled();
            // Aucun remélange n'a eu lieu (défausses vides) : pas de fatigue à payer.
            expect(combatant.actor.update.mock.calls.flat()
                .some(update => "system.attributes.exhaustion" in update)).toBe(false);
            // Rien recyclé : pas d'alerte « deck mélangé »
            expect(socket.executeForEveryone).not.toHaveBeenCalled();
        });

        it("drawPick avec pickScore <= 0 (cards.pick négatif) : alerte sans appel socket", async () => {
            // actor.system.fq.cards?.pick doit être truthy pour entrer dans le bloc
            // (garde falsy-zero réelle du code) : un pick négatif est truthy en JS et
            // reste le seul moyen d'atteindre la branche pickScore<=0 de drawPick via
            // combatTurnChange (0 est filtré par cette même garde).
            const combatant = makeCombatant({
                actorId: "player-actor",
                fq: {cards: {hand: 2, pick: -1}},
                attributes: {exhaustion: 0, hp: {value: 10, max: 10}}
            });
            game.users = Object.assign([
                {id: "player-user", character: {id: "player-actor"}, active: true}
            ], {activeGM: {id: GM_ID}});

            const deck = {id: "deck-1", availableCards: [{}, {}]};
            const hand = {id: "hand-1"};
            vi.spyOn(TradingCards, "getFirstDeck").mockImplementation((userId, typeFq) =>
                typeFq === DECK_TYPE ? deck : hand);

            const combat = {
                round: 2, turn: 0,
                previous: {round: 1, turn: 3},
                current: {round: 2, turn: 0},
                combatants: [combatant],
                combatant
            };

            await getHook("combatTurnChange")(combat, {}, {});

            expect(socket.executeAsUser).not.toHaveBeenCalled();
            expect(socket.executeAsGM).not.toHaveBeenCalled();
            expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining("FQCARDENGINE.WarningMsgNoPickScore")
            }));
        });
    });
});
