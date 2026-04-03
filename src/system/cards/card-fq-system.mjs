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
    // TODO A localisé?
    static TARGET_TYPE_CHOICE = {
        "Default": this.TARGET_TYPE_DEFAULT,
        "Skeletons": this.TARGET_TYPE_SKELETON
    };

    /** @inheritdoc */
    static defineSchema() {
        return {
            fq: new SchemaField({
                maxSameCard: new NumberField({required: true, label: "FQCARDENGINE.MaxSameCard"}),
                level: new NumberField({required: true, label: "FQCARDENGINE.CardLevel"}),
                isBase: new BooleanField({required: true, label: "FQCARDENGINE.CardFQBase"}),
                choices: new ArrayField(this.getChoiceSchema())
            })
        };
    }

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

            // La carte est rejouable (A mettre avec afterFirstPlay si réécriture après utilisation)
            replayable: new StringField({required: true, label: "FQCARDENGINE.Replayable"}),
            // Specific sound to play after card use
            sound: new StringField({required: true, label: "FQCARDENGINE.CardSound"}),
            // Specific FX with Sequence to display after card use
            visual: new SchemaField({
                path: new StringField({required: true, label: "FQCARDENGINE.CardVisual"}),
                onTarget: new BooleanField({required: true, label: "FQCARDENGINE.CardVisualOnTarget"}),
                impactPath: new StringField({required: true, label: "FQCARDENGINE.CardVisualImpactPath"}),// TODO
                impactOnMiddle: new BooleanField({required: true, label: "FQCARDENGINE.CardVisualImpactMiddle"}),// TODO
                impactSize: new StringField({required: true, label: "FQCARDENGINE.CardVisualImpactSize"}),// TODO
            }),
            // Json qui va redéfinir dans la main le system.fq de la carte
            afterFirstPlay: new StringField({required: true, label: "FQCARDENGINE.NewFQSystemAfterFirstPlay"}),

            // Not in form, calculated Value for second use of cards
            playedRound: new StringField({required: false}),
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
                    label: new StringField({required: true, label: "FQCARDENGINE.EffectLabel"}),
                    icon: new FilePathField({
                        categories: ["IMAGE"],
                        initial: () => this.DEFAULT_ICON,
                        required: true,
                        label: "FQCARDENGINE.EffectIcon"
                    }),
                    expireOnDamage: new BooleanField({required: true, label: "FQCARDENGINE.EffectExpireOnDamage"}),
                    // Les changements d'état de l'effet
                    changes: new ArrayField(new SchemaField({
                        key: new StringField({required: true, label: "FQCARDENGINE.EffectChangeKey"}),
                        value: new StringField({required: true, label: "FQCARDENGINE.EffectChangeValue"}),
                        mode: new StringField({required: true, label: "FQCARDENGINE.EffectChangeMode"}),
                    }), {label: "FQCARDENGINE.EffectChanges"}),
                    duration: new SchemaField({
                        startTime: new StringField({required: true, label: "FQCARDENGINE.EffectStartTime"}),
                        rounds: new StringField({required: true, label: "FQCARDENGINE.EffectRounds"}),
                        turns: new StringField({required: true, label: "FQCARDENGINE.EffectTurns"}),
                    }),
                }), {label: "FQCARDENGINE.EffectDatas"}),
                messages: new ArrayField(this.getMessageSchema(), {label: "FQCARDENGINE.EffectMessages"}),
            }), {label: "FQCARDENGINE.FormulaEffects"}),
        });
    }

    static getMessageSchema() {
        return new SchemaField({
            key: new StringField({required: true, label: "FQCARDENGINE.MessageKey"}),
            arg: new StringField({required: true, label: "FQCARDENGINE.MessageArg"}),
        });
    }
}