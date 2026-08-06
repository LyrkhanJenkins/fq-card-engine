import {mergeSchema} from "../core/utils/schema.utils.js";
import CharacterDataFQ from "../domain/system/actors/character-fq.mjs";
import NPCDataFQ from "../domain/system/actors/npc-fq.mjs";
import ActionFQTemplate from "../domain/system/items/item-action-fq.mjs";
import CardsFqSystem from "../domain/system/cards/cards-fq-system.mjs";
import CardFqSystem from "../domain/system/cards/card-fq-system.mjs";

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
    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.actor.CharacterData.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, CharacterDataFQ.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.actor.NPCData.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, NPCDataFQ.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `game.system.dataModels.item.ActivitiesTemplate.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, ActionFQTemplate.defineSchema());
    }, "WRAPPER");

    libWrapper.register(FqCardEngineModule.moduleName, `foundry.documents.Cards.defineSchema`, function (wrapper, ...args) {
        const schema = wrapper(...args);
        return mergeSchema(schema, ActionFQTemplate.defineSchema());
    }, "WRAPPER");

    CONFIG.Cards.dataModels = {
        deck: CardsFqSystem, hand: CardsFqSystem, pile: CardsFqSystem
    };

    CONFIG.Card.dataModels = {
        base: CardFqSystem
    };
}
