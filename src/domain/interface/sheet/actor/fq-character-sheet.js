import {lockPlayMode, removeModeToggle} from "../sheet-play-mode.js";

/**
 * Feuille de personnage FQ. Étend la feuille de personnage dnd5e en ajoutant
 * une barre latérale (« sidebar ») dédiée aux jauges FQ (action, mana, zeal) et
 * en calculant les pourcentages d'affichage de ces jauges.
 *
 * @extends dnd5e.applications.actor.CharacterActorSheet
 */
export default class FqCharacterSheet extends dnd5e.applications.actor.CharacterActorSheet {

    /** @override */
    static PARTS = {
        ...dnd5e.applications.actor.CharacterActorSheet.PARTS,
        ...{
            sidebar: {
                container: {classes: ["main-content"], id: "main"},
                template: `modules/fq-card-engine/src/templates/actors/fq-character-sidebar.hbs`
            }
        }
    };

    /**
     * Force le mode « jeu » avant la préparation du contexte lorsque les droits
     * du joueur sont limités : le contexte des parties est bâti depuis le mode
     * courant, c'est donc ici — et non au rendu — qu'il faut le verrouiller pour
     * que les champs restent en lecture seule.
     *
     * @override
     * @param {object} options - Les options de rendu Foundry.
     */
    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        lockPlayMode(this);
    }

    /**
     * Retire la bascule d'édition de l'en-tête de la fenêtre lorsque les droits
     * du joueur sont limités.
     *
     * @override
     */
    _renderModeToggle() {
        if (removeModeToggle(this)) return;
        super._renderModeToggle();
    }

    /**
     * Prépare le contexte de rendu de la barre latérale : ajoute les pourcentages
     * des jauges FQ et le drapeau `canModifyFQ` (droit d'édition des valeurs FQ).
     *
     * @override
     * @param {object} _context - Le contexte de base fourni par la classe parente.
     * @param {object} options  - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte enrichi des données FQ.
     */
    async _prepareSidebarContext(_context, options) {
        const context = await super._prepareSidebarContext(_context, options);
        return FqCharacterSheet.enrichFqContext(this, context, _context, options);
    }

    /**
     * Enrichissement FQ commun aux parties de feuille (personnage et PNJ) :
     * pourcentages des jauges FQ puis drapeau `canModifyFQ` calculé depuis les
     * effets actifs de la feuille.
     *
     * @param {object} sheet       - La feuille en cours de rendu (expose `_prepareEffectsContext`).
     * @param {object} context     - Le contexte de la partie, déjà préparé par la classe parente.
     * @param {object} baseContext - Le contexte de base transmis par Foundry.
     * @param {object} options     - Les options de rendu Foundry.
     *
     * @returns {Promise<object>} Le contexte enrichi des données FQ.
     */
    static async enrichFqContext(sheet, context, baseContext, options) {
        context = FqCharacterSheet.calculPercentageFqAttributes(context);
        const contextEffects = await sheet._prepareEffectsContext(baseContext, options);
        context.canModifyFQ = FqCharacterSheet.getCanModifyFQ(context.editable, contextEffects.effects);
        return context;
    }

    /**
     * Calcule et injecte dans le contexte les pourcentages de remplissage des
     * jauges FQ (action, mana, zeal) ainsi que la valeur de déplacement en cases.
     *
     * @param {object} context - Le contexte de rendu à enrichir (muté sur place).
     *
     * @returns {object} Le contexte enrichi des pourcentages (`.pct`) et de `speed.squareValue`.
     */
    static calculPercentageFqAttributes(context) {
        // Action Points Percentage
        context.system.fq.action.pct = Math.clamp(context.system.fq.action.max ? (context.system.fq.action.value / context.system.fq.action.max) * 100 : 0, 0, 100);
        // Mana Points Percentage
        context.system.fq.mana.pct = Math.clamp(context.system.fq.mana.max ? (context.system.fq.mana.value / context.system.fq.mana.max) * 100 : 0, 0, 100);
        // Zeal Points Percentage
        context.system.fq.zeal.pct = Math.clamp(context.system.fq.zeal.max ? (context.system.fq.zeal.value / context.system.fq.zeal.max) * 88.5 : 0, 0, 88.5);
        // Movement Value by Squares
        if (context.speed) {
            context.speed.squareValue = Math.trunc((context.speed?.value ? context.speed.value : 0) / game.system.grid.distance);
        }
        return context;
    }

    /**
     * Détermine si l'utilisateur peut modifier manuellement les valeurs FQ.
     * L'édition n'est autorisée que pour le MJ, sur une feuille éditable, et
     * uniquement si aucun effet actif ne modifie déjà `system.fq` (pour éviter
     * les conflits entre saisie manuelle et effets).
     *
     * @param {boolean} editable - True si la feuille est en mode édition.
     * @param {object}  effects  - Le contexte des effets actifs (issu de `_prepareEffectsContext`).
     *
     * @returns {boolean} True si les valeurs FQ peuvent être éditées manuellement.
     */
    static getCanModifyFQ(editable, effects) {
        let allEffectChanges = [...Object.values(effects).map(e => e.effects).reduce((a, b) => a.concat(b), [])]
            .map(e => e.source?.effects ? [...e.source.effects] : []).reduce((a, b) => a.concat(b), [])
            .filter(e => !e.disabled && !e.isSuppressed).map(e => e.changes).reduce((a, b) => a.concat(b), []);
        // Avoid modification if effects modifying system.fq
        return (editable === true) && game.user.isGM && (allEffectChanges.filter(e => e.key.includes("system.fq")).length === 0);
    }
}
