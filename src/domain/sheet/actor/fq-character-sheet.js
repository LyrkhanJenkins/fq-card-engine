export default class FqCharacterSheet extends dnd5e.applications.actor.CharacterActorSheet {

    /** @override */
    static PARTS = {
        ...dnd5e.applications.actor.CharacterActorSheet.PARTS,
        ...{
            sidebar: {
                container: {classes: ["main-content"], id: "main"},
                template: `modules/fq-card-engine/templates/actors/fq-character-sidebar.hbs`
            }
        }
    };

    /** @override */
    async _prepareSidebarContext(_context, options) {
        let context = await super._prepareSidebarContext(_context, options);
        context = FqCharacterSheet.calculPercentageFqAttributes(context);
        const contextEffects = await super._prepareEffectsContext(_context, options);
        context.canModifyFQ = FqCharacterSheet.getCanModifyFQ(context.editable, contextEffects.effects);
        return context;
    }

    static calculPercentageFqAttributes(context) {
        // Action Points Percentage
        context.system.fq.action.pct = Math.clamp(context.system.fq.action.max ? (context.system.fq.action.value / context.system.fq.action.max) * 100 : 0, 0, 100);
        // Mana Points Percentage
        context.system.fq.mana.pct = Math.clamp(context.system.fq.mana.max ? (context.system.fq.mana.value / context.system.fq.mana.max) * 100 : 0, 0, 100);
        // Zeal Points Percentage
        context.system.fq.zeal.pct = Math.clamp(context.system.fq.zeal.max ? (context.system.fq.zeal.value / context.system.fq.zeal.max) * 88.5 : 0, 0, 88.5);
        // Movement Value by Squares
        if (context.speed) {
            context.speed.squareValue = Math.trunc((context.speed?.value ? context.speed.value : 0) / game.system.grid.distance);
        }
        return context;
    }

    static getCanModifyFQ(editable, effects) {
        let allEffectChanges = [...Object.values(effects).map(e => e.effects).reduce((a, b) => a.concat(b), [])]
            .map(e => e.source?.effects ? [...e.source.effects] : []).reduce((a, b) => a.concat(b), [])
            .filter(e => !e.disabled && !e.isSuppressed).map(e => e.changes).reduce((a, b) => a.concat(b), []);
        // Avoid modification if effects modifying system.fq
        return (editable === true) && game.user.isGM && (allEffectChanges.filter(e => e.key.includes("system.fq")).length === 0);
    }
}
