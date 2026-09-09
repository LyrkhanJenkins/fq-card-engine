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
