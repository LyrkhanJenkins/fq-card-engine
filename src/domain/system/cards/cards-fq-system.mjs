const {SchemaField, StringField, ObjectField} = foundry.data.fields;

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
                // Uniquement renseigné pour le SPELLBOOK : snapshot { className: level }
                // utilisé pour calculer le delta de cartes à ajouter/retirer.
                classLevels: new ObjectField({
                    required: false,
                    nullable: true,
                    initial: {},
                    label: "FQCARDENGINE.ClassLevels"
                }),
            })
        };
    }
}


