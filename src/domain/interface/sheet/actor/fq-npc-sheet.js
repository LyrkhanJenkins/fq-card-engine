import FqCharacterSheet from "./fq-character-sheet.js";

/**
 * Feuille de PNJ FQ. Étend la feuille de PNJ dnd5e en ajoutant un en-tête et une
 * barre latérale FQ, et réutilise les calculs de jauges de {@link FqCharacterSheet}.
 *
 * @extends dnd5e.applications.actor.NPCActorSheet
 */
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
    /**
     * Prépare le contexte de rendu de l'en-tête : ajoute les pourcentages des
     * jauges FQ et le drapeau `canModifyFQ`.
     *
     * @override
     * @param {object} _context - Le contexte de base fourni par la classe parente.
     * @param {object} options  - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte enrichi des données FQ.
     */
    async _prepareHeaderContext(_context, options) {
        const context = await super._prepareHeaderContext(_context, options);
        return FqCharacterSheet.enrichFqContext(this, context, _context, options);
    }

    /**
     * Prépare le contexte de rendu de la barre latérale : ajoute les pourcentages
     * des jauges FQ et le drapeau `canModifyFQ`.
     *
     * @override
     * @param {object} _context - Le contexte de base fourni par la classe parente.
     * @param {object} options  - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte enrichi des données FQ.
     */
    async _prepareSidebarContext(_context, options) {
        const context = await super._prepareSidebarContext(_context, options);
        return FqCharacterSheet.enrichFqContext(this, context, _context, options);
    }
}
