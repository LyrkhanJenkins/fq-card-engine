import {OPPORTUNITY_ATTACK_SETTING} from "../domain/engine/reaction/opportunity-attack.js";
import {DEATH_SAVE_SETTING} from "../domain/engine/death-save.js";

/**
 * Multiplicateurs de vitesse proposés pour la fenêtre de résultat. Une liste de
 * choix plutôt qu'un curseur : ce sont des paliers que l'on compare entre séances,
 * pas une valeur à ajuster au centième.
 *
 * @type {Readonly<object>}
 */
const RESULT_WINDOW_SPEEDS = Object.freeze({
    0.1: "0,1×",
    0.3: "0,3×",
    0.6: "0,6×",
    1: "1×",
    1.6: "1,6×",
    2.5: "2,5×"
});

/**
 * Durées d'affichage de la fenêtre de résultat une fois l'animation terminée, en
 * secondes. Le zéro vaut « jusqu'au clic » : la fenêtre attend alors indéfiniment,
 * ce qui n'immobilise rien puisque plus personne ne l'attend à ce stade.
 *
 * Construites à l'appel et non au chargement du module : le libellé du zéro passe
 * par `game.i18n`, qui n'existe pas encore à l'import.
 *
 * @returns {object} Les choix de durée d'affichage.
 */
function resultWindowLingers() {
    return {
        2: "2 s",
        4: "4 s",
        6: "6 s",
        10: "10 s",
        15: "15 s",
        0: game.i18n.localize("FQCARDENGINE.ResultWindowLingerUntilClick")
    };
}

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
    game.settings.register(FqCardEngineModule.moduleName, DEATH_SAVE_SETTING, {
        name: game.i18n.localize("FQCARDENGINE.DeathSaveSetting"),
        hint: game.i18n.localize("FQCARDENGINE.DeathSaveSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        // Désactivée par défaut : elle confie au moteur la mort des personnages et
        // la disparition des sbires, ce doit être un choix explicite du MJ.
        default: false,
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
    game.settings.register(FqCardEngineModule.moduleName, "BypassWeaponAttackRoll", {
        name: game.i18n.localize("FQCARDENGINE.BypassWeaponAttackRollSetting"),
        hint: game.i18n.localize("FQCARDENGINE.BypassWeaponAttackRollSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        default: false,
        filePicker: false,  // set true with a String `type` to use a file picker input
    });
    game.settings.register(FqCardEngineModule.moduleName, OPPORTUNITY_ATTACK_SETTING, {
        name: game.i18n.localize("FQCARDENGINE.OpportunityAttackSetting"),
        hint: game.i18n.localize("FQCARDENGINE.OpportunityAttackSettingHint"),
        scope: "world",     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,
        // Désactivée par défaut : la fonctionnalité change les règles de combat
        // d'un monde existant, elle doit être un choix explicite du MJ. Les mondes
        // UAT l'activent via `FORCED_SETTINGS` (`tests/script/build-uat-base.mjs`).
        default: false,
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
    game.settings.register(FqCardEngineModule.moduleName, "ShowCharGauges", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });
    // Réglages client : chacun règle le rythme auquel il regarde SES propres jets.
    // La résolution attend la fin de cette animation avant d'appliquer quoi que
    // ce soit, donc ces valeurs pèsent sur la durée du tour et non sur le seul décor.
    //
    // Deux réglages et non un : le temps que les dés mettent à se poser et le temps
    // d'attente entre deux étapes ne se règlent pas pour les mêmes raisons. On peut
    // vouloir des dés qui roulent longtemps mais s'enchaînent vite, ou l'inverse.
    game.settings.register(FqCardEngineModule.moduleName, "ResultWindowSpeed", {
        name: game.i18n.localize("FQCARDENGINE.ResultWindowSpeedSetting"),
        hint: game.i18n.localize("FQCARDENGINE.ResultWindowSpeedSettingHint"),
        scope: "client",
        config: true,
        type: Number,
        choices: RESULT_WINDOW_SPEEDS,
        default: 1,
    });
    game.settings.register(FqCardEngineModule.moduleName, "ResultWindowPauseSpeed", {
        name: game.i18n.localize("FQCARDENGINE.ResultWindowPauseSpeedSetting"),
        hint: game.i18n.localize("FQCARDENGINE.ResultWindowPauseSpeedSettingHint"),
        scope: "client",
        config: true,
        type: Number,
        choices: RESULT_WINDOW_SPEEDS,
        default: 1,
    });
    // En secondes et non en multiplicateur : c'est un temps de lecture, que l'on
    // choisit pour lui-même et non par rapport au rythme de l'animation. Il n'est
    // pas transmis aux autres joueurs — plus personne n'attend la fenêtre à ce
    // stade, chacun peut donc la garder à l'écran aussi longtemps qu'il veut.
    game.settings.register(FqCardEngineModule.moduleName, "ResultWindowLinger", {
        name: game.i18n.localize("FQCARDENGINE.ResultWindowLingerSetting"),
        hint: game.i18n.localize("FQCARDENGINE.ResultWindowLingerSettingHint"),
        scope: "client",
        config: true,
        type: Number,
        choices: resultWindowLingers(),
        default: 6,
    });
    // Actif par défaut : le moteur n'anime plus de dés en 3D, ce son est le seul
    // retour sonore qu'un jet ait encore.
    game.settings.register(FqCardEngineModule.moduleName, "ResultWindowDiceSound", {
        name: game.i18n.localize("FQCARDENGINE.ResultWindowDiceSoundSetting"),
        hint: game.i18n.localize("FQCARDENGINE.ResultWindowDiceSoundSettingHint"),
        scope: "client",
        config: true,
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
