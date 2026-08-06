/**
 * Enregistrement des réglages du module (`game.settings.register`).
 *
 * Extrait du hook `init` de `init-engine.js` : le comportement est inchangé,
 * seule la localisation change. Appelé par `src/hook/init.hook.js`.
 *
 * @returns {void}
 */
export function registerSettings() {
    game.settings.register(FqCardEngineModule.moduleName, "HandCount", {
        name: game.i18n.localize("FQCARDENGINE.HandCountSetting"),
        hint: game.i18n.localize("FQCARDENGINE.HandCountSettingHint"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 1,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 10, step: 1
        },
        onChange: FqCardEngineModule.updateHandCount,
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "DisplayHandName", {
        name: game.i18n.localize("FQCARDENGINE.DisplayHandNameSetting"),
        hint: game.i18n.localize("FQCARDENGINE.DisplayHandNameSettingHint"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            (value == true) ? $("#fq-card-engine-container").addClass("show-names") : $("#fq-card-engine-container").removeClass("show-names");
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PlayerLimitCardsRight", {
        name: game.i18n.localize("FQCARDENGINE.PlayerLimitCardsRightSetting"),
        hint: game.i18n.localize("FQCARDENGINE.PlayerLimitCardsRightSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.playerLimitCardsRight = value;
            window.location.reload();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "RollInitiative", {
        name: game.i18n.localize("FQCARDENGINE.RollInitiativeNameSetting"),
        hint: game.i18n.localize("FQCARDENGINE.RollInitiativeNameSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.rollInitiative = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "BetterChatMessages", {
        name: game.i18n.localize("FQCARDENGINE.BetterChatMessagesSetting"),
        hint: game.i18n.localize("FQCARDENGINE.BetterChatMessagesSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.betterChatMessages = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "HideMessages", {
        name: game.i18n.localize("FQCARDENGINE.HideMessagesSetting"),
        hint: game.i18n.localize("FQCARDENGINE.HideMessagesSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.hideMessages = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "GMUsingCards", {
        name: game.i18n.localize("FQCARDENGINE.GMUsingCardsSetting"),
        hint: game.i18n.localize("FQCARDENGINE.GMUsingCardsSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: true,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.GMUsingCards = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "FaceUpMode", {
        name: game.i18n.localize("FQCARDENGINE.FaceUpModeSetting"),
        hint: game.i18n.localize("FQCARDENGINE.FaceUpModeSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.faceUpMode = value;
            game.socket.emit(FqCardEngineModule.eventName, {"action": "rerender"});
            FqCardEngineModule.rerender();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "ShowPlayedPlayerNames", {
        name: game.i18n.localize("FQCARDENGINE.ShowPlayedPlayerNames"),
        hint: game.i18n.localize("FQCARDENGINE.ShowPlayedPlayerNamesHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.showPlayedPlayerNames = value;
            game.socket.emit(FqCardEngineModule.eventName, {"action": "rerender"});
            FqCardEngineModule.rerender();
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "ShowCharGauges", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });
    game.settings.register(FqCardEngineModule.moduleName, "Draggable", {
        name: game.i18n.localize("FQCARDENGINE.DraggableSetting"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableSettingHint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: function () {
            window.location.reload();
        },
    });
    game.settings.register(FqCardEngineModule.moduleName, "CardClick", {
        name: game.i18n.localize("FQCARDENGINE.CardClickBehavior"),
        hint: game.i18n.localize("FQCARDENGINE.CardClickBehaviorHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: String,       // Number, Boolean, String,
        choices: {
            "play_card": game.i18n.localize("FQCARDENGINE.CardClickPlayCard"),
            "open_hand": game.i18n.localize("FQCARDENGINE.CardClickOpenHand"),
            "card_image": game.i18n.localize("FQCARDENGINE.CardClickCardImage")
        },
        default: "play_card",
        onChange: value => { // value is the new value of the setting
            CONFIG.FqCardEngine.options.cardClick = value;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PositionX", {
        name: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingX"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingHintX"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 110,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 4096, step: 1
        },
        onChange: function (value) {
            document.getElementById("fq-card-engine-container").style.left = `${value}px`;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "PositionY", {
        name: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingY"),
        hint: game.i18n.localize("FQCARDENGINE.DraggableBarPositionSettingHintY"),
        scope: "client",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String,
        default: 50,
        range: {             // If range is specified, the resulting setting will be a range slider
            min: 0, max: 2160, step: 1
        },
        onChange: function (value) {
            document.getElementById("fq-card-engine-container").style.top = `${value}px`;
        },
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, "HandScaleFloat", {
        scope: "client",
        config: false,   // pas visible dans l'UI des settings
        type: Number,
        default: 1.0,
    });
}
