const {SchemaField, NumberField, StringField} = foundry.data.fields;

/**
 * Champs de schéma FQ communs aux personnages et aux PNJ.
 *
 * @property {object} fq.action
 * @property {number} fq.action.value               Current action points.
 * @property {number} fq.action.max                 Maximum action points.
 * @property {object} fq.mana
 * @property {number} fq.mana.value                 Current mana points.
 * @property {number} fq.mana.max                   Maximum mana points.
 * @property {object} fq.zeal
 * @property {number} fq.zeal.value                 Current zeal points.
 * @property {number} fq.zeal.max                   Maximum zeal points.
 * @property {number} fq.zeal.init                  Init zeal points.
 * @property {object} fq.attributes
 * @property {number} fq.attributes.critical        Critical Score.
 * @property {number} fq.attributes.evasion         Evasion Score.
 * @property {object} fq.bonus
 * @property {number} fq.bonus.range                Bonus of range.
 * @property {string} fq.bonus.damage               Damage bonus formula.
 * @property {string} fq.bonus.heal                 Heal bonus formula.
 * @property {number} fq.bonus.dot                  DOT or HOT.
 */
export default class CreatureFQTemplate {

    /**
     * Retourne les champs de schéma FQ communs aux personnages et aux PNJ :
     * points d'action, mana, zèle (avec valeur initiale), attributs (critique,
     * esquive) et bonus (portée, dégâts, soin, DOT/HOT).
     *
     * @returns {object} Les champs de schéma communs (SchemaField/NumberField/StringField).
     */
    static get common() {
        return {
            action: new SchemaField({
                value: new NumberField({
                    nullable: false, integer: true, min: 0, initial: 10, label: "FQCARDENGINE.ActionPointsCurrent"
                }),
                max: new NumberField({
                    nullable: true, integer: true, min: 0, initial: 10, label: "FQCARDENGINE.ActionPointsMax"
                }),
            }, {label: "FQCARDENGINE.ActionPoints"}),
            mana: new SchemaField({
                value: new NumberField({
                    nullable: false, integer: true, min: 0, initial: 5, label: "FQCARDENGINE.ManaPointsCurrent"
                }),
                max: new NumberField({
                    nullable: true, integer: true, min: 0, initial: 5, label: "FQCARDENGINE.ManaPointsMax"
                }),
            }, {label: "FQCARDENGINE.ManaPoints"}),
            zeal: new SchemaField({
                value: new NumberField({
                    nullable: false, integer: true, min: 0, initial: 0, label: "FQCARDENGINE.ZealPointsCurrent"
                }),
                max: new NumberField({
                    nullable: true, integer: true, min: 0, initial: 8, label: "FQCARDENGINE.ZealPointsMax"
                }),
                init: new NumberField({
                    nullable: true, integer: true, min: 0, initial: 0, label: "FQCARDENGINE.ZealPointsInit"
                }),
            }, {label: "FQCARDENGINE.ZealPoints"}),
            attributes: new SchemaField({
                critical: new NumberField({
                    nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.CriticalScore"
                }),
                evasion: new NumberField({
                    nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.EvasionScore"
                }),
            }, {label: "FQCARDENGINE.Attributes"}),
            bonus: new SchemaField({
                range: new NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.RangeBonus"
                }),
                damage: new StringField({required: true, label: "FQCARDENGINE.DamageBonus"}),
                heal: new StringField({required: true, label: "FQCARDENGINE.HealBonus"}),
                dot: new NumberField({
                    nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.HitPointsOnTime"
                }),
            }, {label: "FQCARDENGINE.Bonuses"}),
        };
    }
}
