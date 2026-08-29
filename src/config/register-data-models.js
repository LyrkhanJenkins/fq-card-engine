import {mergeSchema} from "../core/utils/schema.utils.js";
import CharacterDataFQ from "../domain/system/actors/character-fq.mjs";
import NPCDataFQ from "../domain/system/actors/npc-fq.mjs";
import ActionFQTemplate from "../domain/system/items/item-action-fq.mjs";
import CardsFqSystem from "../domain/system/cards/cards-fq-system.mjs";
import CardFqSystem from "../domain/system/cards/card-fq-system.mjs";

/**
 * Schémas natifs dnd5e/Foundry enrichis par libWrapper, appariés au modèle FQ
 * dont les champs y sont greffés.
 * @type {ReadonlyArray<[string, {defineSchema: function(): object}]>}
 */
const SCHEMA_EXTENSIONS = Object.freeze([
    ["game.system.dataModels.actor.CharacterData.defineSchema", CharacterDataFQ],
    ["game.system.dataModels.actor.NPCData.defineSchema", NPCDataFQ],
    ["game.system.dataModels.item.ActivitiesTemplate.defineSchema", ActionFQTemplate],
]);

/**
 * Enregistrement des modèles de données (libWrapper sur les schémas dnd5e/Foundry
 * et affectation des `dataModels` de `Cards`/`Card`).
 *
 * Extrait du hook `init` de `init-engine.js` : comportement inchangé. Appelé par
 * `src/hook/init.hook.js`.
 *
 * @returns {void}
 */
export function registerDataModels() {
    for (const [target, model] of SCHEMA_EXTENSIONS) {
        libWrapper.register(FqCardEngineModule.moduleName, target, function (wrapper, ...args) {
            const schema = wrapper(...args);
            return mergeSchema(schema, model.defineSchema());
        }, "WRAPPER");
    }

    CONFIG.Cards.dataModels = {
        deck: CardsFqSystem, hand: CardsFqSystem, pile: CardsFqSystem
    };

    CONFIG.Card.dataModels = {
        base: CardFqSystem
    };
}
