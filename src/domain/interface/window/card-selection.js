import CardGenerated from "../../engine/shared/card-generated.js";
import TradingCards, {DECK_TYPE, PILE_TYPE, SPELLBOOK_TYPE} from "../../trading/trading-cards.js";
import DisplayCard from "../shared/display-card.js";
import {createWarning} from "../../../core/utils/chat.utils.js";

/** Les destinations acceptées par {@link CardSelection.chooseCards}. */
export const SELECTION_DESTINATIONS = ["discard", "deck"];

/**
 * Sélection de cartes proposées : à partir d'une liste de références de
 * compendium, présente les cartes dans un voile plein écran (même pattern
 * visuel que la révélation de pioche) où le joueur en sélectionne un nombre
 * exact, puis les ajoute à sa défausse (copies générées, nettoyées en combat)
 * ou à son deck + spellbook (acquisition permanente). Point d'entrée macro :
 * `FqCardEngineModule.chooseCards`.
 */
export default class CardSelection {

    /**
     * Résout une liste de références `compendium.deck.carte` vers les cartes de
     * compendium correspondantes. Les références irrésolubles sont rapportées
     * dans `missing` sans bloquer les autres.
     *
     * @param {string[]} references - Les références à résoudre.
     *
     * @returns {Promise<{cards: Card[], missing: string[]}>} Les cartes résolues et les références manquantes.
     */
    static async resolveCardPool(references) {
        const cards = [];
        const missing = [];
        for (const reference of references ?? []) {
            const card = await CardGenerated.resolveCompendiumCard(reference);
            if (card) {
                cards.push(card);
            } else {
                missing.push(reference);
            }
        }
        return {cards, missing};
    }

    /**
     * Résout une source `compendium` ou `compendium.deck` vers ses decks : le
     * pack est résolu par id complet (`scope.nom`) ou par nom seul, le segment
     * restant éventuel désigne un deck précis (sinon tous les decks du pack).
     *
     * @param {string} from - La source (`compendium` ou `compendium.deck`).
     *
     * @returns {Promise<{pack: object, decks: object[]}|null>} Le pack et ses decks retenus, ou null si irrésoluble.
     */
    static async resolveCardSource(from) {
        const parts = (from ?? "").split(".").map(part => part.trim()).filter(Boolean);
        if (!parts.length) {
            return null;
        }
        const byFullId = parts.length > 1 ? game.packs.get(parts.slice(0, 2).join(".")) : null;
        const pack = byFullId ?? game.packs.find(p => p.metadata?.name === parts[0]);
        if (!pack) {
            return null;
        }
        const deckName = parts.slice(byFullId ? 2 : 1).join(".");
        const documents = await pack.getDocuments();
        const decks = deckName ? documents.filter(doc => doc.name === deckName) : documents;
        return decks.length ? {pack, decks} : null;
    }

    /**
     * Tire au hasard des références de cartes d'un compendium, filtrées par
     * niveau : les candidates sont les cartes des decks résolus par `from` dont
     * le niveau (`system.fq.level`) appartient à `levels` (liste vide ou absente
     * = tous les niveaux), moins celles déjà présentes (par nom) dans le deck
     * `exclude` éventuel, dédupliquées par référence ; `count` références
     * distinctes sont tirées (mélange de Fisher-Yates partiel — moins si le
     * vivier est plus petit). Les références renvoyées se donnent telles quelles
     * à {@link CardSelection.chooseCards}.
     *
     * @param {object}       options            - Les options de tirage.
     * @param {string}       options.from       - La source (`compendium` ou `compendium.deck`).
     * @param {number[]}     [options.levels]   - Les niveaux de carte acceptés (vide = tous).
     * @param {number}       [options.count=1]  - Le nombre de références à tirer (0 = toutes, mélangées).
     * @param {Cards|string} [options.exclude]  - Un deck (document ou id `game.cards`) dont les
     *                                          cartes sont écartées des candidates (par nom).
     *
     * @returns {Promise<string[]>} Les références `compendium.deck.carte` tirées.
     *
     * @example
     * const refs = await FqCardEngineModule.pickRandomCardRefs({
     *     from: "fq-card-engine.decks-pattern-fq8.Elementalist Base",
     *     levels: [1, 2],
     *     count: 3,
     *     exclude: playerDeck
     * });
     */
    static async pickRandomCardRefs({from, levels = [], count = 1, exclude} = {}) {
        if (!Number.isInteger(count) || count < 0) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgRandomCardsInvalidArgs"));
            return [];
        }
        const source = await CardSelection.resolveCardSource(from);
        if (!source) {
            ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningMsgRandomCardsSourceNotFound", {name: from ?? ""}));
            return [];
        }
        let excludedNames = new Set();
        if (exclude) {
            const excludeDeck = typeof exclude === "string" ? game.cards.get(exclude) : exclude;
            if (!excludeDeck?.cards) {
                // L'appelant veut éviter des doublons : mieux vaut ne rien tirer
                // que de tirer sans l'exclusion demandée.
                ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningMsgRandomCardsExcludeNotFound",
                    {name: typeof exclude === "string" ? exclude : ""}));
                return [];
            }
            excludedNames = new Set([...excludeDeck.cards].map(card => card.name));
        }
        const wantedLevels = (levels ?? []).map(Number);
        const pool = [];
        const seen = new Set();
        for (const deck of source.decks) {
            for (const card of deck.cards ?? []) {
                if (wantedLevels.length && !wantedLevels.includes(Number(card.system?.fq?.level))) {
                    continue;
                }
                if (excludedNames.has(card.name)) {
                    continue;
                }
                const reference = `${source.pack.collection}.${deck.name}.${card.name}`;
                if (!seen.has(reference)) {
                    seen.add(reference);
                    pool.push(reference);
                }
            }
        }
        return CardSelection.sampleDistinct(pool, count);
    }

    /**
     * Tire au hasard `count` éléments distincts (mélange de Fisher-Yates
     * partiel) ; `count` nul ou supérieur au vivier renvoie tout le vivier
     * mélangé.
     *
     * @param {*[]}    items - Le vivier.
     * @param {number} count - Le nombre d'éléments souhaité (0 = tous).
     *
     * @returns {*[]} Les éléments tirés.
     */
    static sampleDistinct(items, count) {
        const pool = [...items];
        const n = count > 0 ? Math.min(count, pool.length) : pool.length;
        for (let i = 0; i < n; i++) {
            const j = i + Math.floor(Math.random() * (pool.length - i));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, n);
    }

    /**
     * Analyse une liste de niveaux saisie sur la carte (`"1,2,3"`) en nombres,
     * en ignorant les segments vides ou non numériques.
     *
     * @param {string} spec - La liste de niveaux séparés par des virgules.
     *
     * @returns {number[]} Les niveaux retenus (vide = tous les niveaux).
     */
    static parseLevels(spec) {
        return (spec ?? "").split(",")
            .map(part => part.trim())
            .filter(Boolean)
            .map(Number)
            .filter(level => !Number.isNaN(level));
    }

    /**
     * Résout les piles de destination d'une sélection pour un utilisateur :
     * `discard` → sa défausse (PILE) ; `deck` → son deck ET son spellbook.
     * `getFirstDeck` publie l'avertissement localisé si une pile manque.
     *
     * @param {string} destination - `discard` ou `deck`.
     * @param {string} userId      - L'id de l'utilisateur cible.
     *
     * @returns {Cards[]|null} Les piles de destination, ou null si l'une manque.
     */
    static resolveDestinationStacks(destination, userId) {
        if (destination === "discard") {
            const pile = TradingCards.getFirstDeck(userId, PILE_TYPE);
            return pile ? [pile] : null;
        }
        const deck = TradingCards.getFirstDeck(userId, DECK_TYPE);
        const spellBook = TradingCards.getFirstDeck(userId, SPELLBOOK_TYPE);
        return (deck && spellBook) ? [deck, spellBook] : null;
    }

    /**
     * Applique la sélection validée : `discard` → copies « générées » (sans deck
     * d'origine, donc supprimées par le nettoyage de combat des cartes
     * orphelines) créées dans la défausse ; `deck` → copie de chaque carte dans
     * le deck ET le spellbook (la carte appartient alors aux deux ; le spellbook
     * étant reconstruit au changement de niveau, l'ajout n'y survit pas — limite
     * assumée tant que la montée de niveau n'est pas outillée).
     *
     * @param {Card[]}  chosen      - Les cartes de compendium choisies.
     * @param {string}  destination - `discard` ou `deck`.
     * @param {Cards[]} stacks      - Les piles résolues par {@link CardSelection.resolveDestinationStacks}.
     *
     * @returns {Promise<Card[]>} Les cartes créées dans la première pile de destination.
     */
    static async applySelection(chosen, destination, stacks) {
        if (destination === "discard") {
            const data = chosen.map(card => CardGenerated.buildGeneratedCardData(card));
            return await stacks[0].createEmbeddedDocuments("Card", data);
        }
        const [deck, spellBook] = stacks;
        const created = await TradingCards.createCardsForDeck(deck, chosen);
        await TradingCards.createCardsForDeck(spellBook, chosen);
        return created;
    }

    /**
     * Construit les données de rendu `card.hbs` d'une carte de compendium hors
     * de toute pile (pendant de `HandBoard.buildCardRenderData`, sans les états
     * propres à la main : pas de pile porteuse, pas d'états joué/généré).
     *
     * @param {Card} c - La carte de compendium à rendre.
     *
     * @returns {object} Les données consommables par le template `card.hbs`.
     */
    static buildCardRenderData(c) {
        const faceIndex = c.face ?? 0;
        const img = DisplayCard.getImgFromCard(c, faceIndex);
        const name = DisplayCard.getNameFromCard(c, faceIndex);
        const cardContent = c.system.fq?.choices?.length ? c.system.fq.choices[0] : {};
        const description = DisplayCard.getDescriptionFromCard(c, faceIndex);
        return {
            id: c._id ?? c.id,
            description: description,
            descriptionSize: DisplayCard.getDescriptionSizeForCardSvg(description),
            titleSize: DisplayCard.getTitleSizeForCardSvg(name),
            ...DisplayCard.buildBubbleData(cardContent, c),
            isFQBase: c.system?.fq?.isBase,
            cardsid: "",
            uuid: c.uuid,
            back: false,
            img: img,
            name: name,
        };
    }

    /**
     * Ouvre le voile de sélection plein écran : les cartes candidates sont
     * rendues face visible sur fond noir, un clic sélectionne/désélectionne
     * (dans la limite de `count`), le compteur et le bouton « Valider » suivent
     * l'état, « Annuler » ou Échap ferment sans effet. En mode non annulable
     * (sélection déclenchée par une carte jouée, coûts déjà payés), ni bouton
     * Annuler ni Échap : le joueur doit valider une sélection.
     *
     * @param {Card[]}  cards                       - Les cartes candidates.
     * @param {number}  count                       - Le nombre exact de cartes à sélectionner.
     * @param {object}  [options]                   - Options du voile.
     * @param {boolean} [options.cancellable=true]  - Si false, l'annulation est impossible.
     *
     * @returns {Promise<Card[]|null>} Les cartes choisies, ou null si annulé.
     */
    static async openSelectionVeil(cards, count, {cancellable = true} = {}) {
        const overlay = document.createElement("div");
        overlay.className = "fq-card-selection-overlay";

        const banner = document.createElement("div");
        banner.className = "fq-card-selection-banner";
        banner.textContent = game.i18n.format("FQCARDENGINE.CardSelectionTitle", {count});
        overlay.appendChild(banner);

        const stage = document.createElement("div");
        stage.className = "fq-card-selection-stage";
        overlay.appendChild(stage);

        // Taille responsive : jusqu'à 5 cartes par rangée à pleine taille, le
        // stage replie au-delà (budget hauteur réduit dès 2 rangées pour
        // limiter le défilement) ; bandeau et boutons gardent leur place.
        const perRow = Math.min(cards.length, 5);
        const rows = Math.ceil(cards.length / perRow);
        const scaleByHeight = (window.innerHeight * (rows > 1 ? 0.38 : 0.55)) / 130;
        const scaleByWidth = (window.innerWidth * 0.9) / (perRow * 94 * 1.15);
        const scale = Math.max(1.4, Math.min(scaleByHeight, scaleByWidth, 4.5));
        stage.style.setProperty("--fq-scale", scale);

        const selected = new Set();

        const footer = document.createElement("div");
        footer.className = "fq-card-selection-footer";
        const counter = document.createElement("span");
        counter.className = "fq-card-selection-counter";
        const validate = document.createElement("button");
        validate.type = "button";
        validate.className = "fq-card-selection-validate";
        validate.textContent = game.i18n.localize("FQCARDENGINE.CardSelectionValidate");
        footer.append(counter, validate);
        let cancel = null;
        if (cancellable) {
            cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "fq-card-selection-cancel";
            cancel.textContent = game.i18n.localize("FQCARDENGINE.CardSelectionCancel");
            footer.append(cancel);
        }
        overlay.appendChild(footer);

        const refreshFooter = () => {
            counter.textContent = `${selected.size} / ${count}`;
            validate.disabled = selected.size !== count;
        };
        refreshFooter();

        const elements = await Promise.all(cards.map(async (c, i) => {
            const html = await foundry.applications.handlebars.renderTemplate(
                "modules/fq-card-engine/src/templates/board/card.hbs", CardSelection.buildCardRenderData(c));
            const el = $(html)[0];
            el.classList.add("fq-card-selection-card");
            el.setAttribute("draggable", "false");
            el.style.setProperty("--fq-selection-delay", (i * 60) + "ms");
            el.addEventListener("click", () => {
                if (selected.has(i)) {
                    selected.delete(i);
                } else if (selected.size < count) {
                    selected.add(i);
                } else {
                    return;
                }
                el.classList.toggle("fq-card-selection-card--selected", selected.has(i));
                refreshFooter();
            });
            return el;
        }));
        elements.forEach(el => stage.appendChild(el));

        document.body.appendChild(overlay);
        // Force un reflow avant de déclencher l'entrée (sinon la transition est ignorée).
        void overlay.offsetWidth;
        overlay.classList.add("fq-card-selection-in");

        return new Promise(resolve => {
            const close = (result) => {
                window.removeEventListener("keydown", onKeyDown);
                overlay.classList.remove("fq-card-selection-in");
                setTimeout(() => overlay.remove(), 300);
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    close(null);
                }
            };
            if (cancellable) {
                window.addEventListener("keydown", onKeyDown);
                cancel.addEventListener("click", () => close(null));
            }
            validate.addEventListener("click", () => {
                if (selected.size !== count) {
                    return;
                }
                close([...selected].sort((a, b) => a - b).map(i => cards[i]));
            });
        });
    }

    /**
     * Propose une liste de cartes au joueur et ajoute sa sélection à la
     * destination demandée. Entrée macro (via `FqCardEngineModule.chooseCards`) ;
     * servira ensuite de brique aux cartes « deck builder » et au choix de
     * cartes à la montée de niveau.
     *
     * @param {object}   options               - Les options de sélection.
     * @param {string[]} options.cards         - Les références `compendium.deck.carte` proposées.
     * @param {number}   [options.count=1]     - Le nombre exact de cartes à choisir.
     * @param {string}   options.destination   - `discard` (copies générées dans la défausse,
     *                                          détruites au nettoyage de combat) ou `deck`
     *                                          (copie dans le deck ET le spellbook).
     *
     * @returns {Promise<Card[]|null>} Les cartes créées, ou null si annulé/irréalisable.
     *
     * @example
     * FqCardEngineModule.chooseCards({
     *     cards: ["fq-card-engine.decks-pattern-fq8.Elementalist Base.FQCARDTITLE.Fireball"],
     *     count: 1,
     *     destination: "discard"
     * });
     */
    static async chooseCards({cards = [], count = 1, destination} = {}) {
        if (!SELECTION_DESTINATIONS.includes(destination) || !Number.isInteger(count) || count < 1) {
            ui.notifications.warn(game.i18n.localize("FQCARDENGINE.WarningMsgChooseCardsInvalidArgs"));
            return null;
        }
        const pool = await CardSelection.resolveCardPool(cards);
        if (pool.missing.length) {
            ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningMsgChooseCardsNotFound",
                {names: pool.missing.join(", ")}));
        }
        if (pool.cards.length < count) {
            ui.notifications.warn(game.i18n.format("FQCARDENGINE.WarningMsgChooseCardsPoolTooSmall",
                {available: pool.cards.length, count}));
            return null;
        }
        // Piles vérifiées AVANT d'ouvrir le voile : inutile de faire choisir le
        // joueur si la destination manque (getFirstDeck a déjà averti).
        const stacks = CardSelection.resolveDestinationStacks(destination, game.user.id);
        if (!stacks) {
            return null;
        }
        const chosen = await CardSelection.openSelectionVeil(pool.cards, count);
        if (!chosen) {
            return null;
        }
        return CardSelection.applySelection(chosen, destination, stacks);
    }

    /**
     * Indique si un choix de carte porte l'encart « proposer des cartes » :
     * actif dès qu'une source (liste de références ou deck de compendium) est
     * renseignée.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte.
     *
     * @returns {boolean} True si le choix déclenche une proposition de cartes.
     */
    static hasCardSelection(cardContent) {
        return Boolean(cardContent?.chooseCardsList?.trim() || cardContent?.chooseCardsFrom?.trim());
    }

    /**
     * Applique l'encart « proposer des cartes » d'un choix joué : construit le
     * vivier (liste de références prioritaire, sinon deck source filtré par
     * niveaux), écarte les cartes déjà présentes (par nom) dans le deck du
     * joueur si demandé, tire au hasard le nombre proposé (vide = toutes),
     * réduit le nombre à choisir au vivier réellement disponible (vivier vide →
     * avertissement de chat, l'effet est passé), puis ouvre le voile SANS
     * annulation possible (les coûts de la carte sont déjà payés) et crée les
     * copies générées dans la MAIN du joueur (comme `generateCard`) — sans deck
     * d'origine, elles se défaussent normalement puis sont détruites au
     * nettoyage de combat.
     *
     * @param {object} cardContent - Le contenu (choix) de la carte jouée.
     * @param {Cards}  hand        - La main du joueur ayant joué la carte.
     *
     * @returns {Promise<Card[]|null>} Les cartes créées, ou null si rien à proposer.
     */
    static async playCardSelection(cardContent, hand) {
        const list = cardContent.chooseCardsList?.trim();
        const proposed = Number(cardContent.chooseCardsProposed) || 0;
        const wanted = Number(cardContent.chooseCardsCount) || 1;

        let excludedNames = null;
        if (cardContent.chooseCardsExcludeDeck) {
            const deck = TradingCards.getFirstDeck(game.user.id, DECK_TYPE);
            if (!deck) {
                return null;
            }
            excludedNames = new Set([...deck.cards].map(card => card.name));
        }

        let references;
        if (list) {
            references = list.split(",").map(part => part.trim()).filter(Boolean);
        } else {
            references = await CardSelection.pickRandomCardRefs({
                from: cardContent.chooseCardsFrom,
                levels: CardSelection.parseLevels(cardContent.chooseCardsLevels),
                count: 0
            });
        }
        const pool = await CardSelection.resolveCardPool(references);
        if (list && pool.missing.length) {
            createWarning(game.i18n.format("FQCARDENGINE.WarningMsgChooseCardsNotFound",
                {names: pool.missing.join(", ")}), {actor: game.user.character});
        }
        const candidates = CardSelection.sampleDistinct(
            pool.cards.filter(card => !excludedNames?.has(card.name)), proposed);

        const count = Math.min(wanted, candidates.length);
        if (!count) {
            createWarning(game.i18n.localize("FQCARDENGINE.WarningMsgChooseCardsNoCandidates"),
                {actor: game.user.character});
            return null;
        }
        const chosen = await CardSelection.openSelectionVeil(candidates, count, {cancellable: false});
        if (!chosen) {
            return null;
        }
        const data = chosen.map(card => CardGenerated.buildGeneratedCardData(card));
        const created = await hand.createEmbeddedDocuments("Card", data);
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: game.user.character}),
            content: `<div style='font-style: italic'>${game.i18n.format("FQCARDENGINE.InfoMsgCardsAddedToHand",
                {names: chosen.map(card => game.i18n.localize(card.name)).join(", ")})}</div>`
        });
        return created;
    }
}
