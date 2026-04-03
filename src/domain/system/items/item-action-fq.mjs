/**
 * Data model template for item actions.
 *
 * @property {number} fq.action          Action cost for using item.
 * @property {number} fq.mana            Mana cost for using item.
 * @property {number} fq.zeal            Zeal cost for using item.
 * @property {number} fq.drop            CurrentDrop cost for using item.
 * @property {number} fq.hp              Life cost for using item.
 * @mixin
 */
export default class ActionFQTemplate {
    /** @inheritdoc */
    static defineSchema() {
        return {
            fq: new foundry.data.fields.SchemaField({
                action: new foundry.data.fields.NumberField({
                    nullable: false, integer: true, initial: -10, label: "FQCARDENGINE.ActionPoints"
                }),
                mana: new foundry.data.fields.NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.ManaPoints"
                }),
                zeal: new foundry.data.fields.NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.ZealPoints"
                }),
                drop: new foundry.data.fields.NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.Drop"
                }),
                hp: new foundry.data.fields.NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.Life"
                }),
            })
        };
    }
}


