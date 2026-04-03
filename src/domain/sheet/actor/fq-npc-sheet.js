import FqCharacterSheet from "./fq-character-sheet.js";

export default class FqNpcSheet extends dnd5e.applications.actor.NPCActorSheet {


    /** @override */
    static PARTS = {
        ... dnd5e.applications.actor.NPCActorSheet.PARTS,
        ... {
            header: {
                template: `modules/fq-card-engine/src/templates/actors/fq-npc-header.hbs`
            },
            sidebar: {
                container: {classes: ["main-content"], id: "main"},
                template: `modules/fq-card-engine/src/templates/actors/fq-npc-sidebar.hbs`
            }
        }
    };
    /** @override */
    async _prepareHeaderContext(_context, options) {
        let context = await super._prepareHeaderContext(_context, options);
        context = FqCharacterSheet.calculPercentageFqAttributes(context);
        const contextEffects = await super._prepareEffectsContext(options);
        context.canModifyFQ = FqCharacterSheet.getCanModifyFQ(context.editable, contextEffects.effects);
        return context;
    }

    /** @override */
    async _prepareSidebarContext(_context, options) {
        let context = await super._prepareSidebarContext(_context, options);
        context = FqCharacterSheet.calculPercentageFqAttributes(context);
        const contextEffects = await super._prepareEffectsContext(_context, options);
        context.canModifyFQ = FqCharacterSheet.getCanModifyFQ(context.editable, contextEffects.effects);
        return context;
    }
}
