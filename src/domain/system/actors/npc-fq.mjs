import CreatureFQTemplate from "./creature-fq.mjs";


/**
 * System data definition for NPC FQ.
 *
 */
export default class NPCDataFQ {
    /* -------------------------------------------- */

    /**
     * Définit le schéma de données FQ greffé sur les PNJ, réduit aux attributs
     * communs aux créatures (sans les données de cartes propres aux personnages).
     *
     * @inheritdoc
     * @returns {object} Le schéma de données FQ des PNJ.
     */
    static defineSchema() {
        return {
            fq: new foundry.data.fields.SchemaField({
                ...CreatureFQTemplate.common,
            })
        };
    }
}
