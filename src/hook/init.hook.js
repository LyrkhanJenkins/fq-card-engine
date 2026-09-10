import {registerSettings} from "../config/register-settings.js";
import {registerDataModels} from "../config/register-data-models.js";
import {registerConditionEffects} from "../config/register-condition-effects.js";

Hooks.on("init", function () {
    registerSettings();
    registerDataModels();
    registerConditionEffects();
});
