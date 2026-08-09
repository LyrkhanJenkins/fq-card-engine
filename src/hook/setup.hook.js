import HandBoard from "../domain/interface/window/hand-board.js";
import FqCharacterSheet from "../domain/interface/sheet/actor/fq-character-sheet.js";
import FqNpcSheet from "../domain/interface/sheet/actor/fq-npc-sheet.js";
import FqItemSheet from "../domain/interface/sheet/items/fq-item-sheet.js";
import FqCardsSheet from "../domain/interface/sheet/cards/fq-cards-sheet.js";
import FqCardSheet from "../domain/interface/sheet/cards/fq-card-sheet.js";
import DisplayCard from "../domain/interface/shared/display-card.js";

Hooks.on("setup", function () {
    // Ajoute les jauges FQ (action/mana/zèle) aux attributs suivables du HUD de
    // jeton et du tracker de combat. dnd5e peuple `CONFIG.Actor.trackableAttributes`
    // dans son propre hook `setup`, exécuté avant celui-ci (le système est chargé
    // avant les modules), donc `character.bar` est déjà disponible ici.
    const trackable = CONFIG.Actor.trackableAttributes || {};
    trackable.character.bar.push("fq.action");
    trackable.character.bar.push("fq.mana");
    trackable.character.bar.push("fq.zeal");

    // Pre Load templates.
    const templatePaths = [
        "modules/fq-card-engine/src/templates/partials/card-svg.hbs",
        "modules/fq-card-engine/src/templates/partials/targeting-panel.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-character-sidebar.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-npc-header.hbs",
        "modules/fq-card-engine/src/templates/actors/fq-npc-sidebar.hbs",
        "modules/fq-card-engine/src/templates/items/fq-item-tabs.hbs",
        "modules/fq-card-engine/src/templates/board/card.hbs",
        "modules/fq-card-engine/src/templates/board/hand-container.hbs",
        "modules/fq-card-engine/src/templates/board/hand.hbs",
        "modules/fq-card-engine/src/templates/chat-message.hbs",
        "modules/fq-card-engine/src/templates/dialog-play.hbs"];

    foundry.applications.handlebars.loadTemplates(templatePaths).then(() => {
        console.info("Better Hand templates preloaded");
    });

    foundry.documents.collections.Actors.registerSheet("dnd5e", FqCharacterSheet, {
        label: "FQCARDENGINE.SheetCharacter", types: ["character"], makeDefault: true,
    });

    foundry.documents.collections.Actors.registerSheet("dnd5e", FqNpcSheet, {
        label: "FQCARDENGINE.SheetNPC", types: ["npc"], makeDefault: true,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "dnd5e", FqItemSheet, {
        label: "FQCARDENGINE.SheetItem",
        types: ["weapon", "feat", "equipment", "consumable", "spell"],
        makeDefault: true,
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Cards, "core", FqCardsSheet, {
        label: "FQCARDENGINE.SheetFQCardsConfig", types: ["deck"], makeDefault: true
    });

    foundry.applications.apps.DocumentSheetConfig.registerSheet(Card, "core", FqCardSheet, {
        label: "FQCARDENGINE.FQCardConfig", makeDefault: true
    });

    if (game.settings.get(FqCardEngineModule.moduleName, "PlayerLimitCardsRight")) {
        CONFIG.FqCardEngine.options.playerLimitCardsRight = true;
    }
    const adminRights = CONFIG.FqCardEngine.options.playerLimitCardsRight === false || game.user.isGM;
    foundry.applications.handlebars.renderTemplate("modules/fq-card-engine/src/templates/board/hand-container.hbs", {
        manualActions: adminRights
    }).then(content => {
        content = $(content);
        $("#ui-bottom").append(content);
        CONFIG.FqCardEngine.options.draggable = game.settings.get(FqCardEngineModule.moduleName, "Draggable");
        FqCardEngineModule.setupPosition();
        let count = game.settings.get(FqCardEngineModule.moduleName, "HandCount");
        count = count ? count : 0;
        if (count > FqCardEngineModule.handMax) {
            count = adminRights ? FqCardEngineModule.handMax : 1;
        }
        for (let i = 0; i < count; i++) {
            new HandBoard(i);
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "DisplayHandName")) {
            $("#fq-card-engine-container").addClass("show-names");
        }
        $(".fq-card-engine-hide-show").click(function () {
            $("#fq-card-engine-hands-container").toggleClass("hidden");
        });
        $(".fq-card-engine-add-bar").click(function () {
            let value = game.settings.get(FqCardEngineModule.moduleName, "HandCount") + 1;
            if (value < FqCardEngineModule.handMax + 1) {
                game.settings.set(FqCardEngineModule.moduleName, "HandCount", value);
                FqCardEngineModule.updateHandCount(value);
            }
        });
        $(".fq-card-engine-subtract-bar").click(function () {
            let value = game.settings.get(FqCardEngineModule.moduleName, "HandCount") - 1;
            if (value > 0) {
                game.settings.set(FqCardEngineModule.moduleName, "HandCount", value);
                FqCardEngineModule.updateHandCount(value);
            }
        });
        // Clic sur la carte d'un message de chat : affiche la carte SVG en grand,
        // à l'identique du voile de la feuille de deck. On retrouve la carte via son
        // id (elle a pu être défaussée) ; repli sur l'image simple si introuvable.
        $(document).on("click", ".fq-card-engine-message-card", function (e) {
            const el = e.currentTarget;
            const cardId = el.dataset.cardId;
            let card = null;
            if (cardId) {
                for (const stack of game.cards) {
                    const found = stack.cards.get(cardId);
                    if (found) {
                        card = found;
                        break;
                    }
                }
            }
            if (card) {
                DisplayCard.showCardOverlay(card);
                return;
            }
            // Repli : la carte n'est plus retrouvable (remélangée/supprimée) → image simple.
            const src = el.dataset.img;
            if (src) {
                new ImagePopout(src, {title: el.getAttribute("title"), shareable: true}).render(true);
            }
        });
        //initialize Options from saved settings
        CONFIG.FqCardEngine.options.cardClick = game.settings.get(FqCardEngineModule.moduleName, "CardClick");
        if (game.settings.get(FqCardEngineModule.moduleName, "HideMessages")) {
            CONFIG.FqCardEngine.options.hideMessages = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "GMUsingCards")) {
            CONFIG.FqCardEngine.options.GMUsingCards = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "RollInitiative")) {
            CONFIG.FqCardEngine.options.rollInitiative = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "BetterChatMessages")) {
            CONFIG.FqCardEngine.options.betterChatMessages = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "FaceUpMode")) {
            CONFIG.FqCardEngine.options.faceUpMode = true;
        }
        if (game.settings.get(FqCardEngineModule.moduleName, "ShowPlayedPlayerNames")) {
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = true;
        }
        game.socket.on(FqCardEngineModule.eventName, data => {
            if (data.action === "rerender") {
                FqCardEngineModule.rerender();
            } else if (data.action === "reposition") {
                FqCardEngineModule.setupPosition();
            } else if (data.action === "reload") {
                FqCardEngineModule.restore();
            } else if (data.action === "updatePlayers") {
                FqCardEngineModule.updatePlayerHandsDelayed();
            }
        });
        FqCardEngineModule.restore();

        FqCardEngineModule.updateCharGauges();
        $(document).on("click", "#fq-char-gauges-toggle", () => {
            FqCardEngineModule.toggleCharGauges();
        });

        Hooks.on("updateActor", (actor) => {
            if (game.user?.character?.id === actor.id) {
                FqCardEngineModule.updateCharGauges();
            }
        });
        Hooks.on("controlToken", () => FqCardEngineModule.updateCharGauges());

        FqCardEngineModule.updatePlayerHands();

        const savedScale = game.settings.get(FqCardEngineModule.moduleName, "HandScaleFloat") ?? 1.0;
        const slider = document.getElementById("fq-size-slider");
        if (slider) {
            slider.value = savedScale;
        }
        document.getElementById("fq-card-engine-container")
            ?.style.setProperty("--fq-scale", savedScale);
        FqCardEngineModule.updateSize();
        FqCardEngineModule.applyFan();

        $("#fq-size-slider").on("input", function () {
            const scale = parseFloat(this.value);
            document.getElementById("fq-card-engine-container")
                ?.style.setProperty("--fq-scale", scale);

            // Persiste dans les settings (optionnel — utilise un setting "client")
            game.settings.set(FqCardEngineModule.moduleName, "HandScaleFloat", scale);

            FqCardEngineModule.updateSize();
            FqCardEngineModule.applyFan();
        });
    });
});
