import CreatureFQTemplate from "./creature-fq.mjs";

const {SchemaField, NumberField, ObjectField} = foundry.data.fields;


/**
 * System data definition for Characters FQ.
 *
 * @property {object} fq.cards
 * @property {number} fq.cards.hand                 Start Hand.
 * @property {number} fq.cards.pick                 Pick card score.
 * @property {number} fq.cards.currentDrop          Current discard card score.
 * @property {object} fq.cardBonus                  Named card bonuses.
 * @property {object} fq.minions                    Minion caps and summoning bonuses, by type.
 * @property {number} fq.minions.sacrificedMinion Sacrificed skeletons count.
 */
export default class CharacterDataFQ {

    /**
     * Les champs d'un type de sbire : son plafond d'invocations simultanées et
     * les bonus de caractéristiques accordés à l'invocation. Réservé aux
     * personnages : seuls eux invoquent des sbires par carte.
     *
     * @param {number} maxInitial - Le plafond de base du type.
     *
     * @returns {object} Les champs `max`, `hp`, `damage` et `movement`.
     */
    static minionType(maxInitial) {
        return {
            max: new NumberField({
                nullable: false, integer: true, min: 0, initial: maxInitial, label: "FQCARDENGINE.MinionMax"
            }),
            hp: new NumberField({
                nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.MinionHp"
            }),
            damage: new NumberField({
                nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.MinionDamageBonus"
            }),
            movement: new NumberField({
                nullable: false, integer: true, initial: 0, label: "FQCARDENGINE.MinionMovement"
            }),
        };
    }

    /**
     * Définit le schéma de données FQ greffé sur les personnages : les attributs
     * communs aux créatures (action, mana, zèle, bonus…), les données de cartes
     * (main, pioche, défausse) et les attributs spéciaux (squelettes sacrifiés).
     *
     * @inheritdoc
     * @returns {object} Le schéma de données FQ des personnages.
     */
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
                cardBonus: new ObjectField({label: "FQCARDENGINE.CardDamageBonus"}),
                minions: new SchemaField({
                    beast: new SchemaField(CharacterDataFQ.minionType(1), {label: "FQCARDENGINE.MinionTypeBeast"}),
                    skeleton: new SchemaField(CharacterDataFQ.minionType(6), {label: "FQCARDENGINE.MinionTypeSkeleton"}),
                    skeletonKing: new SchemaField(CharacterDataFQ.minionType(1), {label: "FQCARDENGINE.MinionTypeSkeletonKing"}),
                    sacrificedMinion: new NumberField({
                        nullable: false, integer: true, min: 0, initial: 1, label: "FQCARDENGINE.SacrificedMinion"
                    }),
                }, {label: "FQCARDENGINE.Minions"}),
            })
        };
    }
}
