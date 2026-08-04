const {SchemaField, StringField, ObjectField} = foundry.data.fields;

/**
 * Data model template for cards.
 *
 * @mixin
 */
export default class CardsFqSystem extends foundry.abstract.TypeDataModel {
    /**
     * Définit le schéma de données FQ d'un jeu de cartes (deck, main, pile,
     * grimoire) : son type FQ, son propriétaire, et, pour le grimoire uniquement,
     * un instantané des niveaux par classe servant au calcul du delta de cartes.
     *
     * @inheritdoc
     * @returns {object} Le schéma de données FQ du jeu de cartes.
     */
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


