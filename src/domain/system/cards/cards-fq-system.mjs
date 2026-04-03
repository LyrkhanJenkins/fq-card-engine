const {SchemaField, StringField} = foundry.data.fields;

/**
 * Data model template for cards.
 *
 * @mixin
 */
export default class CardsFqSystem extends foundry.abstract.TypeDataModel {
    /** @inheritdoc */
    static defineSchema() {
        return {
            fq: new SchemaField({
                type: new StringField({required: true, label: "FQCARDENGINE.DeckType"}),
                owner: new StringField({required: true, label: "FQCARDENGINE.DeckOwner"}),
            })
        };
    }
}


