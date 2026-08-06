import {registerSettings} from "../config/register-settings.js";
import {registerDataModels} from "../config/register-data-models.js";

Hooks.on("init", function () {
    registerSettings();
    registerDataModels();
});
