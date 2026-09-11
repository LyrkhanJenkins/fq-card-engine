import {beforeEach, describe, expect, it, vi} from "vitest";
import ResultChatLog from "../../src/domain/engine/roll/result-chat-log.js";
import RollReport, {ROLL_ROLE} from "../../src/domain/engine/roll/roll-report.js";

/**
 * Message unique de fin de résolution : le seul que le chat reçoive pour un jet
 * de carte ou d'activité. Il tient lieu d'historique, donc tout ce qui a été jeté
 * doit s'y retrouver — et rien ne doit y être attaché qui ferait rejouer les dés
 * une seconde fois par un module d'animation.
 */

const ACTOR = {name: "Aeliana"};

/**
 * Rapport complet d'une résolution de dégâts à deux cibles, dont une esquive et
 * une autre sans score d'esquive.
 *
 * @returns {RollReport} Le rapport.
 */
function fullReport() {
    const report = new RollReport();
    report.setHeader({actorName: "Aeliana", cardName: "Nova de givre", choiceName: "Explosion glaciale"});
    report.setMainRoll({
        role: ROLL_ROLE.DAMAGE, formula: "2d8",
        dice: [{sides: 8, value: 7}, {sides: 8, value: 2}], total: 9
    });
    report.setCritical({roll: 18, threshold: 17, hit: true});
    report.addEvasion({targetTokenId: "t1", targetName: "Gobelin", roll: 19, threshold: 16, evaded: true});
    report.addEvasion({targetTokenId: "t2", targetName: "Rocher", roll: null, threshold: null, evaded: false});
    report.addResult({targetTokenId: "t1", targetName: "Gobelin", value: 9, type: "damageFQ", critical: true, evasion: true});
    report.addResult({targetTokenId: "t2", targetName: "Rocher", value: 18, type: "damageFQ", critical: true, evasion: false});
    report.addExtraRoll({title: "Gel prolongé", formula: "1d6", dice: [{sides: 6, value: 5}], total: 5, hit: true});
    report.addMessages(["Le terrain devient glissant."]);
    return report;
}

/**
 * Le contenu du dernier message publié.
 *
 * @returns {string} Le HTML du message.
 */
function lastContent() {
    return ChatMessage.create.mock.calls.at(-1)[0].content;
}

describe("ResultChatLog", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("publish", () => {
        it("ne publie rien pour un rapport sans jet, sans résultat et sans message", () => {
            ResultChatLog.publish(ACTOR, new RollReport());

            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("ne publie rien sans rapport du tout", () => {
            ResultChatLog.publish(ACTOR, null);

            expect(ChatMessage.create).not.toHaveBeenCalled();
        });

        it("publie un SEUL message pour toute la résolution", () => {
            ResultChatLog.publish(ACTOR, fullReport());

            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        });

        it("n'attache aucun jet au message : aucun dé à animer une seconde fois", () => {
            ResultChatLog.publish(ACTOR, fullReport());

            expect(ChatMessage.create.mock.calls[0][0].rolls).toBeUndefined();
        });

        it("publie un rapport qui n'a que des messages de carte", () => {
            const report = new RollReport();
            report.addMessages(["Pioche une carte."]);

            ResultChatLog.publish(ACTOR, report);

            expect(ChatMessage.create).toHaveBeenCalledTimes(1);
            expect(lastContent()).toContain("Pioche une carte.");
        });
    });

    describe("jet pour toucher", () => {

        /**
         * Rapport minimal portant un seul jet pour toucher.
         *
         * @param {object} hit - Le jet à consigner (voir `RollReport.addHit`).
         *
         * @returns {RollReport} Le rapport.
         */
        function reportWithHit(hit) {
            const report = new RollReport();
            report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});
            report.addHit(hit);
            report.addResult({
                targetTokenId: "t1", targetName: "Gobelin", value: 2,
                type: "damageFQ", critical: false, evasion: false, defended: true
            });
            return report;
        }

        it("porte l'attaque avec la classe d'armure visée", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 4, modifier: 5, total: 9, threshold: 15, defended: true
            }));

            const content = lastContent();
            expect(content).toContain("fq-roll-line--hit");
            expect(content).toContain("FQCARDENGINE.RollLabelAttackOn");
            expect(content).toContain("FQCARDENGINE.RollAgainstAc");
            // La cible s'est protégée : pour le lanceur, c'est un raté.
            expect(content).toContain("FQCARDENGINE.RollAttackBlocked");
        });

        it("porte la sauvegarde avec son DD, et sa polarité propre", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Gobelin", kind: "save",
                roll: 11, modifier: 3, total: 14, threshold: 13, defended: true
            }));

            const content = lastContent();
            // Modificateur distinct de l'attaque : une sauvegarde réussie sert la
            // cible, la feuille de style doit pouvoir le dire.
            expect(content).toContain("fq-roll-line--save");
            expect(content).toContain("FQCARDENGINE.RollLabelSaveOf");
            expect(content).toContain("FQCARDENGINE.RollAgainstDc");
            expect(content).toContain("FQCARDENGINE.RollSaveSuccess");
        });

        it("avantage : le mode et les deux dés dans le détail, la raison en infobulle", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 17, modifier: 5, total: 22, threshold: 15, defended: false,
                dice: [4, 17], mode: 1, advantages: [{side: "target", cause: "restrained"}]
            }));

            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.RollModeAdvantage (4 | 17)");
            expect(content).toMatch(/fq-roll-line--hit" data-tooltip="[^"]*FQCARDENGINE\.TooltipAdvantage/);
            expect(content).toContain("<span class=\"fq-roll-total\">22</span>");
        });

        it("désavantage : même chose, avec le mot du désavantage", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Ombre", kind: "ac",
                roll: 4, modifier: 5, total: 9, threshold: 15, defended: true,
                dice: [17, 4], mode: -1, disadvantages: [{side: "caster", cause: "poisoned"}]
            }));

            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.RollModeDisadvantage (17 | 4)");
            expect(content).toContain("FQCARDENGINE.TooltipDisadvantage");
        });

        it("cible visée normalement face à deux dés communs : ni mode ni dés, rien à expliquer", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Troll", kind: "ac",
                roll: 4, modifier: 5, total: 9, threshold: 15, defended: true, dice: [4, 17], mode: 0
            }));

            const content = lastContent();
            expect(content).not.toContain("FQCARDENGINE.RollModeAdvantage");
            expect(content).not.toContain("(4 | 17)");
            expect(content).not.toMatch(/fq-roll-line--hit" data-tooltip/);
        });

        it("sauvegarde ratée d'office : pas de total, verdict « ratée », cause en infobulle", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Étourdi", kind: "save",
                roll: null, modifier: 20, total: null, threshold: 13, defended: false,
                dice: [], mode: 0, auto: "fail", autoCauses: [{side: "target", cause: "stunned"}]
            }));

            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.RollAutoFail");
            expect(content).toContain("<span class=\"fq-roll-total\">—</span>");
            expect(content).toContain("FQCARDENGINE.RollSaveFailure");
            expect(content).toContain("FQCARDENGINE.TooltipAutoFail");
            expect(content).not.toContain("null");
        });

        it("cible sans défense : sa ligne d'esquive est dite, sans dé", () => {
            const report = reportWithHit({
                targetTokenId: "t1", targetName: "Paralysé", kind: "ac",
                roll: 2, modifier: 5, total: 7, threshold: 30, defended: false,
                dice: [2], mode: 0, auto: "defenseless", autoCauses: [{side: "target", cause: "paralyzed"}]
            });
            report.addEvasion({
                targetTokenId: "t1", targetName: "Paralysé", roll: null, threshold: null, evaded: false,
                defenseless: true, autoCauses: [{side: "target", cause: "paralyzed"}]
            });

            ResultChatLog.publish(ACTOR, report);

            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.RollLabelEvasionOf");
            expect(content).toContain("FQCARDENGINE.RollDefenseless");
            expect(content).toContain("FQCARDENGINE.TooltipDefenseless");
            // L'attaque touche : pour le lanceur, c'est « touché ».
            expect(content).toContain("FQCARDENGINE.RollAttackTouched");
        });

        it("l'infobulle d'une ligne est échappée", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 17, modifier: 5, total: 22, threshold: 15, defended: false,
                dice: [4, 17], mode: 1, advantages: [{side: "target", cause: "<i>piège</i>"}]
            }));

            const content = lastContent();
            expect(content).toContain("&lt;i&gt;piège&lt;/i&gt;");
            expect(content).not.toContain("<i>piège</i>");
        });

        it("marque la cible protégée d'un badge, comme l'esquive", () => {
            ResultChatLog.publish(ACTOR, reportWithHit({
                targetTokenId: "t1", targetName: "Gobelin", kind: "ac",
                roll: 4, modifier: 5, total: 9, threshold: 15, defended: true
            }));

            const content = lastContent();
            expect(content).toContain("fq-result-badge--protected");
            expect(content).toContain("FQCARDENGINE.ChatMessagePartProtected");
        });

        it("ne porte aucune ligne de toucher quand la carte n'en demande pas", () => {
            ResultChatLog.publish(ACTOR, fullReport());

            const content = lastContent();
            expect(content).not.toContain("fq-roll-line--hit");
            expect(content).not.toContain("fq-roll-line--save");
        });
    });

    describe("effets posés", () => {
        it("ajoute les effets à la ligne de la cible, et nomme la cible qui n'a subi que des effets", () => {
            const report = new RollReport();
            report.addResult({targetTokenId: "t1", targetName: "Gobelin", value: 9, type: "damageFQ",
                critical: false, evasion: false});
            report.addEffects([{targetTokenId: "t1", targetName: "Gobelin"}], [{label: "Brûlure", count: 3}]);
            report.addEffects([{targetTokenId: "t2", targetName: "Orc"}], [{label: "Entravé", count: 1}]);

            const doc = new DOMParser().parseFromString(ResultChatLog.buildContent(report), "text/html");
            const lines = [...doc.querySelectorAll(".fq-card-engine-result-line")];

            expect(lines).toHaveLength(2);
            expect(lines[0].querySelector(".fq-result-badge--effect").textContent).toBe("Brûlure ×3");
            expect(lines[1].textContent).toContain("Orc");
            expect(lines[1].querySelector(".fq-result-badge--effect").textContent).toBe("Entravé");
        });
    });

    describe("contenu", () => {
        beforeEach(() => {
            ResultChatLog.publish(ACTOR, fullReport());
        });

        it("porte le détail des dés du jet principal, pas seulement son total", () => {
            const content = lastContent();
            expect(content).toContain("7 + 2");
            expect(content).toContain("2d8");
            expect(content).toContain(">9<");
        });

        it("porte le critique avec son seuil et son verdict", () => {
            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.RollThreshold");
            expect(content).toContain("FQCARDENGINE.RollOutcomeSuccess");
            expect(content).toContain("fq-roll-line--crit");
        });

        it("porte une ligne d'esquive pour la cible qui a lancé, et aucune pour l'autre", () => {
            const content = lastContent();
            expect(content).toContain("Gobelin");
            // Une seule ligne d'esquive : « Rocher » n'a pas de score, donc pas de dé.
            expect(content.match(/fq-roll-line--eva/g)).toHaveLength(1);
        });

        it("dit l'esquive avec les mots de la fenêtre, jamais « réussite » ni « échec »", () => {
            // « Gobelin » a esquivé : le message doit le dire comme la fenêtre, sous
            // peine de nommer « réussite » un jet qui dessert le lanceur.
            const content = lastContent();
            expect(content).toContain("FQCARDENGINE.ChatMessagePartEvasion");
            const evaLine = content.match(/<li class="fq-roll-line fq-roll-line--eva">.*?<\/li>/)[0];
            expect(evaLine).not.toContain("FQCARDENGINE.RollOutcomeSuccess");
        });

        it("porte les jets supplémentaires de la carte", () => {
            expect(lastContent()).toContain("fq-roll-line--other");
        });

        it("porte la valeur appliquée à chaque cible avec ses mentions", () => {
            const content = lastContent();
            expect(content).toContain("fq-result-badge--crit");
            expect(content).toContain("fq-result-badge--eva");
            expect(content).toContain("<b>18</b>");
        });

        it("porte les messages de la carte", () => {
            expect(lastContent()).toContain("Le terrain devient glissant.");
        });

        it("ne porte aucune mention quand la résolution est ordinaire", () => {
            expect(lastContent()).not.toContain("fq-result-tag");
        });

        it("se suffit à lui-même dans le fil : il nomme l'acteur et la carte", () => {
            const content = lastContent();
            expect(content).toContain("Aeliana");
            expect(content).toContain("Nova de givre");
            expect(content).toContain("Explosion glaciale");
        });
    });

    it("porte la mention distinguant la résolution, une attaque d'opportunité par exemple", () => {
        const report = fullReport();
        report.setHeader({tag: "Attaque d'opportunité"});

        ResultChatLog.publish(ACTOR, report);

        expect(lastContent()).toContain("Attaque d'opportunité");
        expect(lastContent()).toContain("fq-result-tag");
    });

    it("dit « touché » pour une esquive manquée, comme la fenêtre", () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.DAMAGE, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});
        report.addEvasion({targetTokenId: "t1", targetName: "Orque", roll: 2, threshold: 18, evaded: false});

        ResultChatLog.publish(ACTOR, report);

        expect(lastContent()).toContain("FQCARDENGINE.RollEvasionTouched");
        expect(lastContent()).not.toContain("FQCARDENGINE.RollOutcomeFail");
    });

    it("un soin prend le libellé des soins, pas celui des dégâts", () => {
        const report = new RollReport();
        report.setMainRoll({role: ROLL_ROLE.HEAL, formula: "1d6", dice: [{sides: 6, value: 4}], total: 4});

        ResultChatLog.publish(ACTOR, report);

        const content = lastContent();
        expect(content).toContain("FQCARDENGINE.RollLabelHeal");
        expect(content).not.toContain("FQCARDENGINE.RollLabelDamage");
    });

    it("mentionne le bonus d'acteur quand il ne figure pas déjà dans la formule", () => {
        const report = new RollReport();
        report.setMainRoll({
            role: ROLL_ROLE.DAMAGE, formula: "1d8",
            dice: [{sides: 8, value: 3}], total: 5, bonus: "+2"
        });

        ResultChatLog.publish(ACTOR, report);

        expect(lastContent()).toContain("FQCARDENGINE.RollBonusApplied");
    });
});
