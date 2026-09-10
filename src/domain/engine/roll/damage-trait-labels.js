import {DAMAGE_TYPE_LABELS} from "../../damage-types.js";

/**
 * La mise en mots des résistances, immunités et vulnérabilités d'une cible,
 * partagée par la fenêtre de résultat et le message de chat : une puce par
 * trait et par élément, le calcul au survol.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DamageTraitLabels {

    /** Le libellé de chaque trait. */
    static #TRAITS = Object.freeze({
        resist: "FQCARDENGINE.ChatMessagePartResist",
        immune: "FQCARDENGINE.ChatMessagePartImmune",
        vulnerable: "FQCARDENGINE.ChatMessagePartVulnerable"
    });

    /**
     * Le nom d'un élément, dans la langue de la table.
     *
     * @param {?string} type - Le type de dégâts.
     *
     * @returns {string} Le nom localisé.
     */
    static element(type) {
        return game.i18n.localize(DAMAGE_TYPE_LABELS[type] ?? "FQCARDENGINE.DamageTypeNone");
    }

    /**
     * Les puces d'une cible : une par trait et par élément.
     *
     * @param {object[]} [traits] - Le détail des traits d'un résultat (`{type, kinds, factor}`).
     *
     * @returns {Array<{kind: string, text: string, tooltip: string}>} Les puces, le
     *          coefficient de l'élément au survol.
     */
    static chips(traits = []) {
        return traits.flatMap(trait => trait.kinds.map(kind => {
            const element = DamageTraitLabels.element(trait.type);
            return {
                kind,
                text: game.i18n.format("FQCARDENGINE.TraitChip",
                    {trait: game.i18n.localize(DamageTraitLabels.#TRAITS[kind]), element}),
                tooltip: game.i18n.format("FQCARDENGINE.TraitDetail", {element, factor: String(trait.factor)})
            };
        }));
    }
}
