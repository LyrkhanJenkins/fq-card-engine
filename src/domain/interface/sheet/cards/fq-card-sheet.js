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
     * Ajoute un élément vierge à un tableau du formulaire courant et resoumet.
     * Protocole commun à tous les handlers `#onAddX` : persiste l'état courant
     * du formulaire (`render: false`), lit le tableau ciblé par `path` (chemin
     * en points dans les données soumises), y ajoute `defaultItem`, puis
     * resoumet.
     *
     * @this {CardConfig}
     * @param {string} path        - Le chemin en points du tableau dans les données soumises.
     * @param {object} defaultItem - L'élément vierge à ajouter.
     *
     * @returns {Promise<Document>} Le document mis à jour (retour de `submit`).
     */
    async #addArrayItem(path, defaultItem) {
        await this.submit({operation: {render: false}});
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        const items = Object.values(foundry.utils.getProperty(submitData, path) ?? {});
        items.push(defaultItem);
        return this.submit({updateData: {[path]: items}});
    }

    /**
     * Supprime, après confirmation, un élément d'un tableau du formulaire
     * courant. Protocole commun à tous les handlers `#onRemoveX` : lit le
     * tableau ciblé par `path` dans les données soumises, en retire l'élément
     * à `index` après confirmation de l'utilisateur, puis resoumet.
     *
     * @this {CardConfig}
     * @param {string} path     - Le chemin en points du tableau dans les données soumises.
     * @param {number} index    - L'indice de l'élément à retirer.
     * @param {string} titleKey - La clé i18n du titre de la boîte de confirmation.
     *
     * @returns {Promise<Document|null>} Le document mis à jour, ou null si annulé.
     */
    #removeArrayItem(path, index, titleKey) {
        const question = game.i18n.localize("AreYouSure");
        const submitData = this._processFormData(null, this.form, new foundry.applications.ux.FormDataExtended(this.form));
        return foundry.applications.api.DialogV2.confirm({
            window: {title: titleKey},
            content: `<p><strong>${question}</strong></p>`,
            yes: {
                callback: () => {
                    const items = Object.values(foundry.utils.getProperty(submitData, path) ?? {});
                    items.splice(index, 1);
                    return this.submit({updateData: {[path]: items}});
                }
            }
        });
    }

    /**
     * Ajoute une nouvelle face à la carte (dupliqué de la base Foundry).
     * @this {CardConfig}
     * @type {ApplicationClickAction}
     */
    static async #onAddFace() {
        return this.#addArrayItem("faces", {});
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
        return this.#addArrayItem("system.fq.choices", {});
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
        return this.#removeArrayItem("system.fq.choices", button.dataset.index, "FQCARDENGINE.DeleteChoice");
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
        return this.#addArrayItem(`system.fq.choices.${index}.messages`, {});
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
        return this.#removeArrayItem(`system.fq.choices.${index}.messages`, messageIndex, "FQCARDENGINE.DeleteAdditionalMessage");
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
        return this.#addArrayItem(`system.fq.choices.${index}.applyEffectsFormulas`, FqCardSheet.addEffectsFormula());
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
        return this.#removeArrayItem(`system.fq.choices.${index}.applyEffectsFormulas`, formulaIndex, "FQCARDENGINE.DeleteEffectsFormula");
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
        return this.#addArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects`, FqCardSheet.addFormulaEffect());
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
        return this.#removeArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects`, effectIndex, "FQCARDENGINE.DeleteFormulaEffect");
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
        return this.#addArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data`, FqCardSheet.addDataEffect());
    }

    /**
     * Fabrique un objet « donnée d'effet » (active effect) vierge, avec un
     * changement initial et une durée non renseignée.
     *
     * @returns {object} La donnée d'effet par défaut (name, img, showIcon, changes, duration…).
     */
    static addDataEffect() {
        return {
            name: "",
            img: "",
            expireOnDamage: false,
            showIcon: 1,
            changes: [{}],
            duration: {
                value: "",
                units: "rounds"
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
        return this.#removeArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data`, dataIndex, "FQCARDENGINE.DeleteDataEffect");
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
        return this.#addArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.messages`, {});
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
        return this.#removeArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.messages`,
            effectMessageIndex, "FQCARDENGINE.DeleteAdditionalMessage");
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
        return this.#addArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data.${dataIndex}.changes`, {});
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
        return this.#removeArrayItem(
            `system.fq.choices.${index}.applyEffectsFormulas.${formulaIndex}.effects.${effectIndex}.data.${dataIndex}.changes`,
            changeIndex, "FQCARDENGINE.DeleteChangeData");
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
        return this.#addArrayItem(`system.fq.choices.${index}.minions`, {});
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
        return this.#removeArrayItem(`system.fq.choices.${index}.minions`, minionIndex, "FQCARDENGINE.DeleteMinion");
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
        return this.#addArrayItem(`system.fq.choices.${index}.customEvals`, FqCardSheet.addCustomEval());
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
        return this.#removeArrayItem(`system.fq.choices.${index}.customEvals`, customEvalIndex, "FQCARDENGINE.DeleteCustomEval");
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
        return this.#addArrayItem(`system.fq.choices.${index}.customEvals.${customEvalIndex}.errorMessages`, {});
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
        return this.#removeArrayItem(
            `system.fq.choices.${index}.customEvals.${customEvalIndex}.errorMessages`, errorMessageIndex, "FQCARDENGINE.DeleteAdditionalMessage");
    }


}
