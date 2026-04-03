import CreatureFQTemplate from "./creature-fq.mjs";


/**
 * System data definition for NPC FQ.
 *
 */
export default class NPCDataFQ {
    /* -------------------------------------------- */

    /** @inheritdoc */
    static defineSchema() {
        return {
            fq: new foundry.data.fields.SchemaField({
                ...CreatureFQTemplate.common,
            })
        };
    }
}
