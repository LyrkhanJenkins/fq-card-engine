import {DND5E_CONDITIONS} from "../../conditions.js";
import Advantage from "./advantage.js";

/**
 * La mise en mots des verdicts d'avantage, partagée par la fenêtre de résultat
 * et le message de chat : les deux doivent dire la même chose avec les mêmes
 * mots, sans quoi une infobulle et une ligne de chat se contrediraient.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class AdvantageLabels {

    /** Les causes qui ne sont pas des conditions. */
    static #CAUSES = Object.freeze({
        armor: "FQCARDENGINE.ReasonArmor",
        sheet: "FQCARDENGINE.ReasonSheet"
    });

    /**
     * Le mot du mode d'un jet : « avantage », « désavantage », ou rien.
     *
     * @param {number} mode - Le mode du jet.
     *
     * @returns {string} Le mot, déjà localisé, ou une chaîne vide en jet normal.
     */
    static mode(mode) {
        if (mode === Advantage.ADVANTAGE) {
            return game.i18n.localize("FQCARDENGINE.RollModeAdvantage");
        }
        if (mode === Advantage.DISADVANTAGE) {
            return game.i18n.localize("FQCARDENGINE.RollModeDisadvantage");
        }
        return "";
    }

    /**
     * Le mot d'une issue forcée : « échec automatique », « sans défense ».
     *
     * @param {?string} auto - L'issue forcée (« fail », « defenseless ») ou null.
     *
     * @returns {string} Le mot, déjà localisé, ou une chaîne vide.
     */
    static auto(auto) {
        if (auto === "fail") {
            return game.i18n.localize("FQCARDENGINE.RollAutoFail");
        }
        if (auto === "defenseless") {
            return game.i18n.localize("FQCARDENGINE.RollDefenseless");
        }
        return "";
    }

    /**
     * Une raison, avec le camp qui la porte : « À terre (cible) ».
     *
     * @param {{side: string, cause: string}} reason - La raison.
     *
     * @returns {string} La raison, déjà localisée.
     */
    static reason({side, cause}) {
        const key = DND5E_CONDITIONS[cause] ?? AdvantageLabels.#CAUSES[cause];
        const label = key ? game.i18n.localize(key) : cause;
        return game.i18n.format(side === "caster" ? "FQCARDENGINE.ReasonOnCaster" : "FQCARDENGINE.ReasonOnTarget",
            {reason: label});
    }

    /**
     * Pourquoi un jet s'est déroulé ainsi, en une phrase par fait : les raisons
     * d'avantage, puis de désavantage, et leur annulation quand les deux
     * coexistent ; ou la cause d'une issue forcée.
     *
     * @param {object} roll - Un jet pour toucher ou une esquive du rapport.
     *
     * @returns {string} Le texte, vide quand rien de particulier ne s'est passé.
     */
    static why(roll) {
        if (roll.auto === "fail" || roll.auto === "defenseless" || roll.defenseless) {
            const key = roll.auto === "fail" ? "FQCARDENGINE.TooltipAutoFail" : "FQCARDENGINE.TooltipDefenseless";
            return game.i18n.format(key, {reasons: AdvantageLabels.#list(roll.autoCauses)});
        }
        const advantages = roll.advantages ?? [];
        const disadvantages = roll.disadvantages ?? [];
        const lines = [];
        if (advantages.length) {
            lines.push(game.i18n.format("FQCARDENGINE.TooltipAdvantage", {reasons: AdvantageLabels.#list(advantages)}));
        }
        if (disadvantages.length) {
            lines.push(game.i18n.format("FQCARDENGINE.TooltipDisadvantage",
                {reasons: AdvantageLabels.#list(disadvantages)}));
        }
        if (advantages.length && disadvantages.length) {
            lines.push(game.i18n.localize("FQCARDENGINE.TooltipCancelled"));
        }
        return lines.join(" · ");
    }

    /**
     * @param {object[]} [reasons] - Des raisons.
     *
     * @returns {string} Les raisons localisées, séparées par des virgules.
     */
    static #list(reasons) {
        return (reasons ?? []).map(reason => AdvantageLabels.reason(reason)).join(", ");
    }
}
