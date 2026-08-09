import CardFqSystem from "../../../system/cards/card-fq-system.mjs";

/**
 * Feuille de configuration d'une carte FQ. Étend `CardConfig` en ajoutant un
 * onglet « attributes » (schéma FQ de la carte) et une multitude d'actions
 * d'édition des données FQ : choix, messages, formules d'effets, effets, données
 * d'effet, changements, sbires (minions) et évaluateurs personnalisés.
 *
 * @extends foundry.applications.sheets.CardConfig
 */
export default class FqCardSheet extends foundry.applications.sheets.CardConfig {

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
        attributes: {template: `modules/fq-card-engine/src/templates/fq-form/card/attributes.hbs`},
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

    /**
     * Enrichit le contexte de la partie « attributes » en y injectant le schéma
     * du champ `fq` de la carte, nécessaire au rendu des champs FQ.
     *
     * @inheritDoc
     * @param {string} partId  - L'identifiant de la partie de gabarit en cours de rendu.
     * @param {object} context - Le contexte de rendu partagé.
     * @param {object} options - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte de la partie, enrichi pour « attributes ».
     */
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
     * Ajoute une nouvelle face à la carte (dupliqué de la base Foundry).
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
     * Supprime une face existante après confirmation (dupliqué de la base Foundry).
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event - L'événement de clic (repère la face via `data-face`).
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
     * Ajoute un nouveau choix (effet jouable) à la carte.
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
     * Supprime un choix existant après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant l'index du choix (`data-index`).
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
     * Ajoute un message additionnel à un choix.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant l'index du choix (`data-index`).
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
     * Supprime un message additionnel d'un choix après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-message-index`).
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
     * Ajoute une nouvelle formule d'effets à un choix.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant l'index du choix (`data-index`).
     */
    static async #onAddEffectsFormula(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const applyEffectsFormulas = Object.values(submitData.system.fq.choices[index].applyEffectsFormulas ?? {});
        applyEffectsFormulas.push(FqCardSheet.addEffectsFormula());
        this.submit({updateData: {[`system.fq.choices.${index}.applyEffectsFormulas`]: applyEffectsFormulas}});
    }

    /**
     * Fabrique un objet « formule d'effets » vierge, avec un effet initial.
     *
     * @returns {{title: string, formula: string, effects: object[]}} La formule d'effets par défaut.
     */
    static addEffectsFormula() {
        return {
            title: "",
            formula: "",
            effects: [FqCardSheet.addFormulaEffect()]
        };
    }

    /**
     * Supprime une formule d'effets d'un choix après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`).
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
     * Ajoute un effet à une formule d'effets.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`).
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

    /**
     * Fabrique un objet « effet » vierge, avec une donnée d'effet et un message initiaux.
     *
     * @returns {{result: string, data: object[], messages: object[]}} L'effet par défaut.
     */
    static addFormulaEffect() {
        return {
            result: "",
            data: [FqCardSheet.addDataEffect()],
            messages: [{}]
        };
    }

    /**
     * Supprime un effet d'une formule d'effets après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`).
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
     * Ajoute une donnée d'effet (active effect) à un effet.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`).
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

    /**
     * Fabrique un objet « donnée d'effet » (active effect) vierge, avec un
     * changement initial et une durée non renseignée.
     *
     * @returns {object} La donnée d'effet par défaut (label, icon, changes, duration…).
     */
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
     * Supprime une donnée d'effet d'un effet après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`, `data-data-index`).
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
     * Ajoute un message à un effet.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`).
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
     * Supprime un message d'un effet après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`, `data-effect-message-index`).
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
     * Ajoute un changement (change) à une donnée d'effet.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`, `data-data-index`).
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
     * Supprime un changement d'une donnée d'effet après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-formula-index`, `data-effect-index`, `data-data-index`, `data-change-index`).
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
     * Ajoute un sbire (minion) à un choix.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant l'index du choix (`data-index`).
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
     * Supprime un sbire (minion) d'un choix après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-minion-index`).
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
     * Ajoute un évaluateur personnalisé (script) à un choix.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant l'index du choix (`data-index`).
     */
    static async #onAddCustomEval(event, button) {
        const index = button.dataset.index;
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const customEvals = Object.values(submitData.system.fq.choices[index].customEvals ?? {});
        customEvals.push(FqCardSheet.addCustomEval());
        this.submit({updateData: {[`system.fq.choices.${index}.customEvals`]: customEvals}});
    }


    /**
     * Fabrique un objet « évaluateur personnalisé » vierge, avec un message d'erreur initial.
     *
     * @returns {{script: string, errorMessages: object[]}} L'évaluateur personnalisé par défaut.
     */
    static addCustomEval() {
        return {
            script: "",
            errorMessages: [{}]
        };
    }

    /**
     * Supprime un évaluateur personnalisé d'un choix après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-custom-eval-index`).
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
     * Ajoute un message d'erreur à un évaluateur personnalisé.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-custom-eval-index`).
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
     * Supprime un message d'erreur d'un évaluateur personnalisé après confirmation.
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     * @param {PointerEvent} event  - L'événement de clic déclencheur.
     * @param {HTMLElement}  button - Le bouton portant les index (`data-index`, `data-custom-eval-index`, `data-error-message-index`).
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
