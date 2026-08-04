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
    /**
     * Définit le schéma de données FQ greffé sur les actions d'objet : les coûts
     * d'utilisation en points d'action, mana, zèle, défausse et points de vie.
     *
     * @inheritdoc
     * @returns {object} Le schéma de données FQ des actions d'objet.
     */
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


