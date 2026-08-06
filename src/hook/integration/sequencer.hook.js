import {visualEffectData} from "../../domain/system/fx/visualEffectData.js";

/**
 * Hooks d'intégration avec le module Sequencer.
 * Enregistre la base d'effets visuels FQ dès que Sequencer est prêt.
 */
Hooks.on("sequencer.ready", () => {
    Sequencer.Database.registerEntries("fq", visualEffectData);
    console.info("FQ | Sequencer database registered under 'fq'");
});
