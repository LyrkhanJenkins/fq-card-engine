const {SchemaField, StringField, NumberField, BooleanField, ArrayField, FilePathField} = foundry.data.fields;

/**
 * Data model for system card.
 *
 * @mixin
 */
export default class CardFqSystem extends foundry.abstract.TypeDataModel {
    static DEFAULT_ICON = "icons/consumables/drinks/alcohol-beer-mug-yellow.webp";
    static TARGET_TYPE_SKELETON = "Skeletons";
    static TARGET_TYPE_DEFAULT = "Default";
    static NEUTRAL_CLASS = "neutral";
    static TARGET_TYPE_CHOICE = {
        "Default": this.TARGET_TYPE_DEFAULT,
        "Skeletons": this.TARGET_TYPE_SKELETON
    };
    static CLASS_CHOICE = {
        "neutral": this.NEUTRAL_CLASS,
        "elementalist": "elementalist",
        "fencing-master": "fencing-master",
        "guardian": "guardian",
        "illusionist": "illusionist",
        "monk": "monk",
        "runic-warrior": "runic-warrior",
        "trapper": "trapper",
        "white-mage": "white-mage",
        "witch": "witch"
    };

    static CHANGE_TYPE_CHOICES = Object.fromEntries(
        Object.keys(CONST.ACTIVE_EFFECT_CHANGE_TYPES).map(key => [key, key])
    );

    static DURATION_UNITS_CHOICES = {
        rounds: "FQCARDENGINE.DurationUnitRounds",
        turns: "FQCARDENGINE.DurationUnitTurns"
    };

    static SHOW_ICON_CHOICES = {
        0: "FQCARDENGINE.ShowIconNever",
        1: "FQCARDENGINE.ShowIconConditional",
        2: "FQCARDENGINE.ShowIconAlways"
    };

    /**
     * Définit le schéma de données FQ d'une carte : nombre max d'exemplaires,
     * classe, niveau, indicateur de carte de base, et la liste des choix jouables.
     *
     * @inheritdoc
     * @returns {object} Le schéma de données FQ de la carte.
     */
    static defineSchema() {
        return {
            fq: new SchemaField({
                maxSameCard: new NumberField({required: true, label: "FQCARDENGINE.MaxSameCard"}),
                class: new StringField({
                    required: true, label: "FQCARDENGINE.Class",
                    choices: this.CLASS_CHOICE,
                    initial: () => this.NEUTRAL_CLASS
                }),
                level: new NumberField({required: true, label: "FQCARDENGINE.CardLevel"}),
                isBase: new BooleanField({required: true, label: "FQCARDENGINE.CardFQBase"}),
                choices: new ArrayField(this.getChoiceSchema())
            })
        };
    }

    /**
     * Construit le schéma d'un « choix » de carte : coûts (action, mana, zèle, hp,
     * pioche, défausse), ciblage et portée, dégâts/soins et bonus, variables X/Y,
     * formules d'effets, messages, sbires, rejouabilité, son, visuels, actions
     * personnalisées et données de rejeu.
     *
     * @returns {SchemaField} Le schéma d'un choix de carte.
     */
    static getChoiceSchema() {
        return new SchemaField({
            name: new StringField({required: true, label: "FQCARDENGINE.ChoiceName"}),

            action: new StringField({required: true, label: "FQCARDENGINE.ActionPoints"}),
            mana: new StringField({required: true, label: "FQCARDENGINE.ManaPoints"}),
            zeal: new StringField({required: true, label: "FQCARDENGINE.ZealPoints"}),
            reactive: new BooleanField({required: true, label: "FQCARDENGINE.ReactiveCard"}),

            hp: new StringField({required: true, label: "FQCARDENGINE.HpModifier"}),
            draw: new StringField({required: true, label: "FQCARDENGINE.Draw"}),
            drop: new StringField({required: true, label: "FQCARDENGINE.Drop"}),

            targetType: new StringField({
                required: true,
                label: "FQCARDENGINE.TargetType",
                choices: this.TARGET_TYPE_CHOICE,
                initial: () => this.TARGET_TYPE_DEFAULT,
            }),
            minReach: new StringField({required: true, label: "FQCARDENGINE.MinReach"}),
            maxReach: new StringField({required: true, label: "FQCARDENGINE.MaxReach"}),
            nbTargets: new StringField({required: true, label: "FQCARDENGINE.NbTargets"}),

            damage: new StringField({required: true, label: "FQCARDENGINE.Damage"}),
            heal: new StringField({required: true, label: "FQCARDENGINE.Heal"}),
            bonusCrit: new StringField({required: true, label: "FQCARDENGINE.BonusCrit"}),
            bonusEva: new StringField({required: true, label: "FQCARDENGINE.BonusEva"}),

            // Options avancées
            // Controle les valeurs 'XXX' et 'YYY' placés dans les champs textes
            xmin: new StringField({required: true, label: "FQCARDENGINE.Xmin"}),
            xmax: new StringField({required: true, label: "FQCARDENGINE.Xmax"}),
            ymin: new StringField({required: true, label: "FQCARDENGINE.Ymin"}),
            ymax: new StringField({required: true, label: "FQCARDENGINE.Ymax"}),
            // Si remplie, alors ce n'est plus un champ rempli par l'utilisateur mais prérempli par un attribut
            xvalue: new StringField({required: true, label: "FQCARDENGINE.Xvalue"}),
            yvalue: new StringField({required: true, label: "FQCARDENGINE.Yvalue"}),

            // Formule supplémentaire pour apppliquer des effets
            applyEffectsFormulas: new ArrayField(this.getApplyEffectsFormulaSchema(), {label: "FQCARDENGINE.ApplyEffectsFormulas"}),
            // Messages spéciaux à display aux joueurs après utilisation de la carte (utilise localize)
            messages: new ArrayField(this.getMessageSchema(), {label: "FQCARDENGINE.AddingMessages"}),

            // Minions to invoke after use of cards
            minions: new ArrayField(new SchemaField({
                // test to eval in javascript for custom check/ exec
                name: new StringField({required: true, label: "FQCARDENGINE.MinionName"}),
                // message to display if test false
                data: new SchemaField({
                    hp: new StringField({required: true, label: "FQCARDENGINE.MinionHp"}),
                    damageBonus: new StringField({required: true, label: "FQCARDENGINE.MinionDamageBonus"}),
                    movement: new StringField({required: true, label: "FQCARDENGINE.MinionMovement"}),
                })
            }), {label: "FQCARDENGINE.Minions"}),

            // La carte est rejouable (« passif » = reste en main, ou nombre de charges)
            replayable: new StringField({required: true, label: "FQCARDENGINE.Replayable"}),
            // Specific sound to play after card use
            sound: new StringField({required: true, label: "FQCARDENGINE.CardSound"}),
            // Specific FX with Sequence to display after card use
            visual: new SchemaField({
                path: new StringField({required: true, label: "FQCARDENGINE.CardVisual"}),
                onTarget: new BooleanField({required: true, label: "FQCARDENGINE.CardVisualOnTarget"}),
            }),
            generateCard: new StringField({required: true, label: "FQCARDENGINE.GenerateCard"}),
            retrieveFromDiscard: new StringField({required: true, label: "FQCARDENGINE.RetrieveFromDiscard"}),

            passivePlayedRound: new StringField({required: false}),
            hasBeenPlayed: new BooleanField({required: false}),

            // Custom actions
            customEvals: new ArrayField(new SchemaField({
                // script to eval in javascript for custom check/ exec
                script: new StringField({required: true, label: "FQCARDENGINE.CustomEvalScript"}),
                // message to display if test false
                errorMessages: new ArrayField(this.getMessageSchema(), {label: "FQCARDENGINE.CustomEvalErrorMessages"}),
            }), {label: "FQCARDENGINE.CustomEvals"}),
        });
    }

    /**
     * Construit le schéma d'une « formule d'effets » : un titre, une formule de
     * jet, et une liste d'effets déclenchés selon le résultat (données d'effet
     * actif, changements, durée, messages, application sur soi ou sur la cible).
     *
     * @returns {SchemaField} Le schéma d'une formule d'effets.
     */
    static getApplyEffectsFormulaSchema() {
        return new SchemaField({
            title: new StringField({required: true, label: "FQCARDENGINE.FormulaTitle"}),
            formula: new StringField({required: true, label: "FQCARDENGINE.Formula"}),
            effects: new ArrayField(new SchemaField({
                // Le resultat pour appliquer l'effet sur la formule du applyEffectsFormulas
                result: new StringField({required: true, label: "FQCARDENGINE.FormulaResultToApplyEffect"}),
                self: new BooleanField({required: true, label: "FQCARDENGINE.SelfApplyEffect"}),
                // Le données de l'effets
                data: new ArrayField(new SchemaField({
                    name: new StringField({required: true, label: "FQCARDENGINE.EffectLabel"}),
                    img: new FilePathField({
                        categories: ["IMAGE"],
                        initial: () => this.DEFAULT_ICON,
                        required: true,
                        label: "FQCARDENGINE.EffectIcon"
                    }),
                    expireOnDamage: new BooleanField({required: true, label: "FQCARDENGINE.EffectExpireOnDamage"}),
                    showIcon: new NumberField({
                        required: true,
                        initial: 1,
                        choices: this.SHOW_ICON_CHOICES,
                        localize: true,
                        label: "FQCARDENGINE.EffectShowIcon"
                    }),
                    // Les changements d'état de l'effet
                    changes: new ArrayField(new SchemaField({
                        key: new StringField({required: true, label: "FQCARDENGINE.EffectChangeKey"}),
                        value: new StringField({required: true, label: "FQCARDENGINE.EffectChangeValue"}),
                        type: new StringField({
                            required: true,
                            label: "FQCARDENGINE.EffectChangeType",
                            choices: this.CHANGE_TYPE_CHOICES,
                            initial: () => "add"
                        }),
                        priority: new NumberField({
                            required: false,
                            nullable: true,
                            integer: true,
                            label: "FQCARDENGINE.EffectChangePriority",
                            initial: null
                        }),
                    }), {label: "FQCARDENGINE.EffectChanges"}),
                    duration: new SchemaField({
                        value: new StringField({required: true, label: "FQCARDENGINE.EffectDurationValue"}),
                        units: new StringField({
                            required: true,
                            choices: this.DURATION_UNITS_CHOICES,
                            initial: () => "rounds",
                            localize: true,
                            label: "FQCARDENGINE.EffectDurationUnits"
                        }),
                    }),
                }), {label: "FQCARDENGINE.EffectDatas"}),
                removeEffectName: new StringField({required: true, label: "FQCARDENGINE.RemoveEffectName"}),
                messages: new ArrayField(this.getMessageSchema(), {label: "FQCARDENGINE.EffectMessages"}),
            }), {label: "FQCARDENGINE.FormulaEffects"}),
        });
    }

    /**
     * Construit le schéma d'un message localisable : une clé de traduction et un
     * argument de formatage optionnel.
     *
     * @returns {SchemaField} Le schéma d'un message.
     */
    static getMessageSchema() {
        return new SchemaField({
            key: new StringField({required: true, label: "FQCARDENGINE.MessageKey"}),
            arg: new StringField({required: true, label: "FQCARDENGINE.MessageArg"}),
        });
    }
}
