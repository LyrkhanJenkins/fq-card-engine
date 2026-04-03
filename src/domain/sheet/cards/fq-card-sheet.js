import CardFqSystem from "../../system/cards/card-fq-system.mjs";

export default class FqCardSheet extends foundry.applications.sheets.CardConfig {

    /** @inheritDoc */
    constructor(options, ...args) {
        super(options, ...args);
    }

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        classes: ["card-config"],
        position: {width: 800},
        window: {
            contentClasses: ["standard-form"],
            icon: "fa-solid fa-card-diamond"
        },
        form: {
            closeOnSubmit: true
        },
        actions: {
            addFace: FqCardSheet.#onAddFace, // Duplicate from Foundry base
            deleteFace: FqCardSheet.#onDeleteFace, // Duplicate from Foundry base
            addChoice: FqCardSheet.#onAddChoice,
            removeChoice: FqCardSheet.#onRemoveChoice,
            addAdditionalMessage: FqCardSheet.#onAddAdditionalMessage,
            removeAdditionalMessage: FqCardSheet.#onRemoveAdditionalMessage,
            addEffectsFormula: FqCardSheet.#onAddEffectsFormula,
            removeEffectsFormula: FqCardSheet.#onRemoveEffectsFormula,
            addFormulaEffect: FqCardSheet.#onAddFormulaEffect,
            removeFormulaEffect: FqCardSheet.#onRemoveFormulaEffect,
            addDataEffect: FqCardSheet.#onAddDataEffect,
            removeDataEffect: FqCardSheet.#onRemoveDataEffect,
            addEffectMessage: FqCardSheet.#onAddEffectMessage,
            removeEffectMessage: FqCardSheet.#onRemoveEffectMessage,
            addChangeData: FqCardSheet.#onAddChangeData,
            removeChangeData: FqCardSheet.#onRemoveChangeData,
            addMinion: FqCardSheet.#onAddMinion,
            removeMinion: FqCardSheet.#onRemoveMinion,
            addCustomEval: FqCardSheet.#onAddCustomEval,
            removeCustomEval: FqCardSheet.#onRemoveCustomEval,
            addCustomEvalErrorMessage: FqCardSheet.#onAddCustomEvalErrorMessage,
            removeCustomEvalErrorMessage: FqCardSheet.#onRemoveCustomEvalErrorMessage
        }
    };

    /** @override */
    static PARTS = {
        header: {template: "templates/cards/card/header.hbs"},
        tabs: {template: "templates/generic/tab-navigation.hbs"},
        attributes: {template: `modules/fq-card-engine/src/templates/cards/card/attributes.hbs`},
        details: {template: "templates/cards/card/details.hbs"},
        faces: {template: "templates/cards/card/faces.hbs", scrollable: [""]},
        back: {template: "templates/cards/card/back.hbs"},
        footer: {template: "templates/generic/form-footer.hbs"}
    };

    /** @override */
    static TABS = {
        sheet: {
            tabs: [
                {id: "attributes", icon: "fa-solid fa-memo"},
                {id: "details", icon: "fa-solid fa-memo"},
                {id: "faces", icon: "fa-solid fa-image-portrait"},
                {id: "back", icon: "fa-solid fa-card-heart"}
            ],
            initial: "attributes",
            labelPrefix: "FQCARDENGINE.TABS"
        }
    };

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        const partContext = await super._preparePartContext(partId, context, options);
        if (partId === "attributes") {
            partContext.fields.fq = CardFqSystem.defineSchema().fq;
        }
        return partContext;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */

    /* -------------------------------------------- */

    /**
     * Add a new face.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddFace() {
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const faces = Object.values(submitData.faces ?? {});
        faces.push({});
        return this.submit({updateData: {faces}});
    }

    /* -------------------------------------------- */

    /**
     * Delete an existing face.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onDeleteFace(event) {
        const question = game.i18n.localize("AreYouSure");
        const warning = game.i18n.localize("CARD.ACTIONS.DeleteFace.Warning");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const faceEl = event.target.closest("[data-face]");
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "CARD.ACTIONS.DeleteFace.Title"},
            content: `<p><strong>${question}</strong> ${warning}</p>`,
            yes: {
                callback: () => {
                    const faces = Object.values(submitData.faces ?? {});
                    const index = Number(faceEl?.dataset.index) || 0;
                    faces.splice(index, 1);
                    return this.submit({updateData: {faces}});
                }
            }
        });
    }

    /**
     * Add a new choice.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddChoice() {
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const choices = Object.values(submitData.system.fq.choices ?? {});
        choices.push({});
        return this.submit({updateData: {"system.fq.choices": choices}});
    }

    /* -------------------------------------------- */

    /**
     * Delete an existing choice.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveChoice(event, button) {
        const index = button.dataset.index;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteChoice"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const choices = Object.values(submitData.system.fq.choices ?? {});
                    choices.splice(index, 1);
                    return this.submit({updateData: {"system.fq.choices": choices}});
                }
            }
        });
    }

    /**
     * Add a new adding message.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddAdditionalMessage(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const messages = Object.values(submitData.system.fq.choices[index].messages ?? {});
        messages.push({});
        this.submit({updateData: {[`system.fq.choices.${index}.messages`]: messages}});
    }

    /**
     * Remove an existing adding message.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveAdditionalMessage(event, button) {
        const index = button.dataset.index;
        const messageIndex = button.dataset.messageIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteAdditionalMessage"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const messages = Object.values(submitData.system.fq.choices[index].messages ?? {});
                    messages.splice(messageIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.messages`]: messages}});
                }
            }
        });
    }


    /**
     * Add a new effects formula.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddEffectsFormula(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const applyEffectsFormulas = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas ?? {});
        applyEffectsFormulas.push(FqCardSheet.addEffectsFormula());
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas`]: applyEffectsFormulas}});
    }

    static addEffectsFormula() {
        return {
            title: "",
            formula: "",
            effects: [FqCardSheet.addFormulaEffect()]
        };
    }

    /**
     * Remove an existing effects formula.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveEffectsFormula(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteEffectsFormula"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const applyEffectsFormulas = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas ?? {});
                    applyEffectsFormulas.splice(formulaIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas`]: applyEffectsFormulas}});
                }
            }
        });
    }


    /**
     * Add a new effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddFormulaEffect(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const effects = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects ?? {});
        effects.push(FqCardSheet.addFormulaEffect());
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects`]: effects}});
    }

    static addFormulaEffect() {
        return {
            result: "",
            data: [FqCardSheet.addDataEffect()],
            messages: [{}]
        };
    }

    /**
     * Remove an existing effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveFormulaEffect(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteFormulaEffect"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const effects = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects ?? {});
                    effects.splice(effectIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects`]: effects}});
                }
            }
        });
    }

    /**
     * Add a new data effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddDataEffect(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const data = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].data ?? {});
        data.push(FqCardSheet.addDataEffect());
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data`]: data}});
    }

    static addDataEffect() {
        return {
            label: "",
            icon: "",
            expireOnDamage: false,
            changes: [{}],
            duration: {
                startTime: "",
                rounds: "",
                turns: ""
            }
        };
    }

    /**
     * Remove an existing data effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveDataEffect(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        const dataIndex = button.dataset.dataIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));

        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteDataEffect"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const data = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].data ?? {});
                    data.splice(dataIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data`]: data}});
                }
            }
        });
    }
    /**
     * Add a new message effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddEffectMessage(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const messages = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].messages ?? {});
        messages.push({});
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.messages`]: messages}});
    }

    /**
     * Remove an existing message effect.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveEffectMessage(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        const effectMessageIndex = button.dataset.effectMessageIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));

        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteAdditionalMessage"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const messages = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].messages ?? {});
                    messages.splice(effectMessageIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.messages`]: messages}});
                }
            }
        });
    }

    /**
     * Add a new change data.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddChangeData(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        const dataIndex = button.dataset.dataIndex;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const changes = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].data[dataIndex].changes ?? {});
        changes.push({});
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data.${dataIndex}.changes`]: changes}});
    }

    /**
     * Remove an existing change data.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveChangeData(event, button) {
        const index = button.dataset.index;
        const formulaIndex = button.dataset.formulaIndex;
        const effectIndex = button.dataset.effectIndex;
        const dataIndex = button.dataset.dataIndex;
        const changeIndex = button.dataset.changeIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteChangeData"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const changes = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas[formulaIndex].effects[effectIndex].data[dataIndex].changes ?? {});
                    changes.splice(changeIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data.${dataIndex}.changes`]: changes}});
                }
            }
        });
    }


    /**
     * Add a new minion.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddMinion(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const minions = Object.values(submitData.system.fq.choices[index].minions ?? {});
        minions.push({});
        this.submit({updateData: {[`system.fq.choices.${index}.minions`]: minions}});
    }

    /**
     * Remove an existing minion.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveMinion(event, button) {
        const index = button.dataset.index;
        const minionIndex = button.dataset.minionIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteMinion"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const minions = Object.values(submitData.system.fq.choices[index].minions ?? {});
                    minions.splice(minionIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.minions`]: minions}});
                }
            }
        });
    }



    /**
     * Add a new custom evaluator.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddCustomEval(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const customEvals = Object.values(submitData.system.fq.choices[index].customEvals ?? {});
        customEvals.push(FqCardSheet.addCustomEval());
        this.submit({updateData: {[`system.fq.choices.${index}.customEvals`]: customEvals}});
    }


    static addCustomEval() {
        return {
            script: "",
            errorMessages: [{}]
        };
    }

    /**
     * Remove an existing  custom evaluator.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveCustomEval(event, button) {
        const index = button.dataset.index;
        const customEvalIndex = button.dataset.customEvalIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteCustomEval"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const customEvals = Object.values(submitData.system.fq.choices[index].customEvals ?? {});
                    customEvals.splice(customEvalIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.customEvals`]: customEvals}});
                }
            }
        });
    }



    /**
     * Add a new custom evaluator message.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddCustomEvalErrorMessage(event, button) {
        const index = button.dataset.index;
        const customEvalIndex = button.dataset.customEvalIndex;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const errorMessages = Object.values(submitData.system.fq.choices[index].customEvals[customEvalIndex].errorMessages ?? {});
        errorMessages.push({});
        this.submit({updateData: {[`system.fq.choices.${index}.customEvals.${customEvalIndex}.errorMessages`]: errorMessages}});
    }

    /**
     * Remove an existing custom evaluator message.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onRemoveCustomEvalErrorMessage(event, button) {
        const index = button.dataset.index;
        const customEvalIndex = button.dataset.customEvalIndex;
        const errorMessageIndex = button.dataset.errorMessageIndex;
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: "FQCARDENGINE.DeleteAdditionalMessage"},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const errorMessages = Object.values(submitData.system.fq.choices[index].customEvals[customEvalIndex].errorMessages ?? {});
                    errorMessages.splice(errorMessageIndex, 1);
                    this.submit({updateData: {[`system.fq.choices.${index}.customEvals.${customEvalIndex}.errorMessages`]: errorMessages}});
                }
            }
        });
    }


}
