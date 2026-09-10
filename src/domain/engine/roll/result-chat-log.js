import RollReport from "./roll-report.js";
import AdvantageLabels from "./advantage-labels.js";
import {escapeHtml} from "../../../core/utils/html.utils.js";

/**
 * Publication dans le chat d'une résolution de carte ou d'activité : un message
 * unique, construit depuis le rapport de jet, qui tient lieu d'historique.
 *
 * Un seul message et non un par dé : le fil de discussion garde une trace
 * lisible et complète de ce qui s'est passé, sans noyer la conversation sous les
 * étapes de calcul. Aucun `Roll` n'y est attaché — le détail des dés est écrit
 * en toutes lettres depuis le rapport — de sorte qu'aucun module d'animation de
 * dés n'a de jet à intercepter : les dés du moteur s'affichent dans sa propre
 * fenêtre de résultat, jamais deux fois.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ResultChatLog {

    /**
     * Publie le message de résolution, s'il y a quelque chose à dire. Un rapport
     * sans jet, sans résultat et sans message ne produit rien : une carte purement
     * utilitaire (pioche, défausse) n'a pas de résultat à annoncer.
     *
     * @param {object}     actor  - L'acteur à qui attribuer le message.
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {void}
     */
    static publish(actor, report) {
        if (!RollReport.hasContent(report)) {
            return;
        }
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor}),
            content: ResultChatLog.buildContent(report)
        });
    }

    /**
     * Assemble le contenu HTML du message depuis le rapport.
     *
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {string} Le contenu du message.
     */
    static buildContent(report) {
        return `<div class="fq-card-engine-result">`
            + `<div class="fq-card-engine-result-title">${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardResult")}</div>`
            + ResultChatLog.#sourceLine(report)
            + ResultChatLog.#rollLines(report)
            + ResultChatLog.#resultLines(report)
            + ResultChatLog.#messageLines(report)
            + `</div>`;
    }

    /**
     * La ligne d'origine : qui a joué quoi. Elle permet au message de se suffire
     * à lui-même dans le fil, à distance du message de la carte.
     *
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {string} La ligne, ou une chaîne vide si l'origine est inconnue.
     */
    static #sourceLine({header}) {
        const parts = [header.actorName, header.cardName].filter(Boolean);
        const tag = header.tag
            ? `<div class="fq-result-tag">${header.tag}</div>` : "";
        if (parts.length === 0) {
            return tag;
        }
        const choice = header.choiceName ? ` <em>(${header.choiceName})</em>` : "";
        return `<div class="fq-result-source">${parts.join(" — ")}${choice}</div>${tag}`;
    }

    /**
     * Le détail des jets : jet principal, critique, jet pour toucher et esquive
     * par cible, puis les jets des formules d'effets de la carte.
     *
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {string} La liste des jets, ou une chaîne vide s'il n'y en a aucun.
     */
    static #rollLines(report) {
        const lines = [];

        if (report.mainRoll) {
            const isHeal = report.kind === "heal";
            lines.push(ResultChatLog.#rollLine({
                modifier: isHeal ? "heal" : "damage",
                label: game.i18n.localize(isHeal ? "FQCARDENGINE.RollLabelHeal" : "FQCARDENGINE.RollLabelDamage"),
                detail: ResultChatLog.#diceDetail(report.mainRoll),
                total: report.mainRoll.total
            }));
        }

        if (report.critical) {
            const isHeal = report.kind === "heal";
            lines.push(ResultChatLog.#rollLine({
                modifier: "crit",
                label: game.i18n.localize(isHeal
                    ? "FQCARDENGINE.RollLabelCriticalHeal" : "FQCARDENGINE.ChatMessagePartCritical"),
                detail: game.i18n.format("FQCARDENGINE.RollThreshold", {threshold: report.critical.threshold}),
                total: report.critical.roll,
                outcome: report.critical.hit
            }));
        }

        // Le jet POUR TOUCHER, quand la carte en demande un. Les deux natures
        // n'ont pas la même polarité : une attaque se lit du côté du lanceur
        // (« touché » quand la cible n'est PAS protégée), une sauvegarde du côté
        // de la cible (« réussie » quand elle l'est).
        (report.hits ?? []).forEach(hit => {
            const attack = hit.kind === "ac";
            lines.push(ResultChatLog.#rollLine({
                // Deux modificateurs et non un seul : la feuille de style doit
                // pouvoir donner à la sauvegarde la polarité de l'esquive (une
                // réussite y sert la cible, pas le lanceur).
                modifier: attack ? "hit" : "save",
                label: game.i18n.format(attack
                    ? "FQCARDENGINE.RollLabelAttackOn" : "FQCARDENGINE.RollLabelSaveOf",
                {target: hit.targetName}),
                detail: [
                    game.i18n.format(attack ? "FQCARDENGINE.RollAgainstAc" : "FQCARDENGINE.RollAgainstDc",
                        {threshold: hit.threshold}),
                    ResultChatLog.#hitMode(hit)
                ].filter(Boolean).join(" · "),
                // Une sauvegarde ratée d'office n'a jeté aucun dé : pas de total.
                total: hit.total ?? "—",
                outcome: attack ? !hit.defended : hit.defended,
                outcomeKeys: attack
                    ? {hit: "FQCARDENGINE.RollAttackTouched", miss: "FQCARDENGINE.RollAttackBlocked"}
                    : {hit: "FQCARDENGINE.RollSaveSuccess", miss: "FQCARDENGINE.RollSaveFailure"},
                tooltip: AdvantageLabels.why(hit)
            }));
        });

        // Une cible sans score d'esquive n'a pas lancé de dé : rien à montrer ici,
        // son sort se lit à la valeur qui lui est appliquée plus bas. Une cible
        // SANS DÉFENSE n'en a pas lancé non plus, mais c'est une information :
        // elle est dite.
        report.evasions.filter(evasion => evasion.roll !== null || evasion.defenseless).forEach(evasion => {
            lines.push(ResultChatLog.#rollLine({
                modifier: "eva",
                label: game.i18n.format("FQCARDENGINE.RollLabelEvasionOf", {target: evasion.targetName}),
                detail: evasion.defenseless
                    ? AdvantageLabels.auto("defenseless")
                    : game.i18n.format("FQCARDENGINE.RollThreshold", {threshold: evasion.threshold}),
                total: evasion.roll ?? "—",
                outcome: evasion.evaded,
                tooltip: evasion.defenseless ? AdvantageLabels.why(evasion) : "",
                // Le même événement doit porter le même mot que dans la fenêtre.
                // « Échec » y désignerait un jet manqué par le lanceur, alors qu'une
                // esquive ratée le sert : ce sont deux polarités opposées.
                outcomeKeys: {
                    hit: "FQCARDENGINE.ChatMessagePartEvasion",
                    miss: "FQCARDENGINE.RollEvasionTouched"
                }
            }));
        });

        report.extraRolls.forEach(extra => {
            lines.push(ResultChatLog.#rollLine({
                modifier: "other",
                label: game.i18n.format("FQCARDENGINE.CardMsgApplyEffectsFormulas",
                    {applyEffectsFormulasTitle: extra.title}),
                detail: ResultChatLog.#diceDetail(extra),
                total: extra.total,
                outcome: extra.hit
            }));
        });

        return lines.length === 0 ? "" : `<ul class="fq-roll-lines">${lines.join("")}</ul>`;
    }

    /**
     * Une ligne de jet : libellé, détail (dés jetés ou seuil), total et, le cas
     * échéant, verdict de réussite.
     *
     * @param {object}   line          - La ligne à écrire.
     * @param {string}   line.modifier - Le suffixe de classe (« damage », « crit »…).
     * @param {string}   line.label    - Le libellé du jet.
     * @param {string}   line.detail   - Le détail affiché sous le libellé.
     * @param {number}   line.total    - Le total du jet.
     * @param {?boolean} [line.outcome] - La réussite du jet, ou undefined si la notion n'a pas de sens.
     * @param {{hit: string, miss: string}} [line.outcomeKeys] - Les clés du verdict, quand
     *        « réussite / échec » ne dit pas juste ce que le jet a produit.
     * @param {string}   [line.tooltip] - Ce qui a décidé du jet, en infobulle de la ligne.
     *
     * @returns {string} La ligne HTML.
     */
    static #rollLine({modifier, label, detail, total, outcome, outcomeKeys, tooltip = ""}) {
        let verdict = "";
        if (outcome !== undefined) {
            const keys = outcomeKeys ?? {
                hit: "FQCARDENGINE.RollOutcomeSuccess",
                miss: "FQCARDENGINE.RollOutcomeFail"
            };
            verdict = `<span class="fq-roll-outcome fq-roll-outcome--${outcome ? "hit" : "miss"}">`
                + game.i18n.localize(outcome ? keys.hit : keys.miss)
                + `</span>`;
        }
        const hint = tooltip ? ` data-tooltip="${escapeHtml(tooltip)}"` : "";
        return `<li class="fq-roll-line fq-roll-line--${modifier}"${hint}>`
            + `<span class="fq-roll-label">${label}</span>`
            + (detail ? `<span class="fq-roll-detail">${detail}</span>` : "")
            + `<span class="fq-roll-total">${total}</span>`
            + verdict
            + `</li>`;
    }

    /**
     * Comment le jet pour toucher s'est fait contre cette cible : « avantage
     * (17 | 4) », « échec automatique », « sans défense », ou rien pour un jet
     * ordinaire. Les deux dés ne sont montrés que quand le mode de LA cible les
     * a départagés : une cible visée normalement garde le premier, sans histoire.
     *
     * @param {object} hit - Le jet pour toucher du rapport.
     *
     * @returns {string} Le mode, déjà localisé, ou une chaîne vide.
     */
    static #hitMode(hit) {
        if (hit.auto) {
            return AdvantageLabels.auto(hit.auto);
        }
        const mode = AdvantageLabels.mode(hit.mode);
        return mode && (hit.dice ?? []).length > 1 ? `${mode} (${hit.dice.join(" | ")})` : mode;
    }

    /**
     * Le détail d'un jet : les faces obtenues, puis la formule. Une formule sans
     * dé (valeur fixe) ne montre que sa formule.
     *
     * @param {{formula: string, dice: object[], bonus: ?string}} roll - Le jet consigné.
     *
     * @returns {string} Le détail affiché.
     */
    static #diceDetail(roll) {
        const faces = (roll.dice ?? []).map(die => die.value).join(" + ");
        const parts = [faces, roll.formula].filter(Boolean);
        if (roll.bonus) {
            parts.push(game.i18n.format("FQCARDENGINE.RollBonusApplied", {bonus: roll.bonus}));
        }
        return parts.join(" · ");
    }

    /**
     * Les valeurs appliquées, une ligne par cible, avec les mentions de critique
     * et d'esquive.
     *
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {string} La liste des résultats, ou une chaîne vide s'il n'y en a aucun.
     */
    static #resultLines(report) {
        if (report.results.length === 0) {
            return "";
        }
        const lines = report.results.map(result => {
            const modifier = result.type === "healFQ" ? "fq-result--heal"
                : result.type === "damageFQ" ? "fq-result--damage" : "";
            let badges = "";
            if (result.critical) {
                badges += `<span class="fq-result-badge fq-result-badge--crit">`
                    + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartCritical")}</span>`;
            }
            if (result.evasion) {
                badges += `<span class="fq-result-badge fq-result-badge--eva">`
                    + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartEvasion")}</span>`;
            }
            if (result.defended) {
                badges += `<span class="fq-result-badge fq-result-badge--protected">`
                    + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartProtected")}</span>`;
            }
            return `<li class="fq-card-engine-result-line ${modifier}">`
                + `<span class="fq-result-key">${result.targetName}</span>`
                + `<span class="fq-result-value"><b>${result.value}</b>${badges}</span>`
                + `</li>`;
        });
        return `<ul class="fq-card-engine-result-list">${lines.join("")}</ul>`;
    }

    /**
     * Les messages configurés dans la carte, sous leur intitulé.
     *
     * @param {RollReport} report - Le rapport de la résolution.
     *
     * @returns {string} La liste des messages, ou une chaîne vide s'il n'y en a aucun.
     */
    static #messageLines(report) {
        if (report.messages.length === 0) {
            return "";
        }
        return `<div class="fq-card-engine-result-subtitle">`
            + `${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardOtherEffect")}</div>`
            + `<ul class="fq-card-engine-result-manual">`
            + report.messages.map(message => `<li>${message}</li>`).join("")
            + `</ul>`;
    }
}
