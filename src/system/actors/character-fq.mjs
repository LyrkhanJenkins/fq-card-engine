import CreatureFQTemplate from "./creature-fq.mjs";

const {SchemaField, NumberField} = foundry.data.fields;


/**
 * System data definition for Characters FQ.
 *
 * @property {object} fq.cards
 * @property {number} fq.cards.hand                 Start Hand.
 * @property {number} fq.cards.pick                 Pick card score.
 * @property {number} fq.cards.currentDrop          Current discard card score.
 */
export default class CharacterDataFQ {
    /** @inheritdoc */
    static defineSchema() {
        return {
            fq: new foundry.data.fields.SchemaField({
                ...CreatureFQTemplate.common,
                cards: new SchemaField({
                    hand: new NumberField({
                        nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.Hand"
                    }),
                    pick: new NumberField({
                        nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.Pick"
                    }),
                    currentDrop: new NumberField({
                        nullable: false, integer: true, min: 0, initial: 0, label: "FQCARDENGINE.CurrentDrop"
                    }),
                }, {label: "FQCARDENGINE.Cards"}),
                special: new SchemaField({
                    sacrificedSkeleton: new NumberField({
                        nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.SacrificedSkeleton"
                    })
                }, {label: "FQCARDENGINE.SpecialAttributes"}),
            })
        };
    }
}
