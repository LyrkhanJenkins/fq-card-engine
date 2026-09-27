import fs from "fs";
import path from "path";
import {expect} from "vitest";

/**
 * Cartes FABRIQUÉES pour exercer le moteur sans dépendre d'une carte précise du
 * corpus.
 *
 * POURQUOI ce module existe : les tests de conditions jouaient des cartes
 * nommées par identifiant (`gdIronChain00001`, …). Depuis que les classes
 * étendues vivent dans `fq-card-engine-extended`, ces cartes ne sont plus
 * livrées ici, et six conditions dnd5e — `charmed`, `frightened`, `grappled`,
 * `invisible`, `stunned`, `unconscious` — ne sont plus posées par AUCUNE carte
 * publique. Or poser une condition est le travail du MOTEUR : le contenu n'est
 * que le déclencheur. La couverture appartient donc ici, indépendante de quelles
 * cartes sont installées.
 *
 * Le pipeline exercé reste le vrai (`playChoice`) : seule la carte est fabriquée.
 * Elle l'est en COPIANT une carte réelle du corpus prise pour gabarit, puis en
 * n'y laissant que l'effet voulu — ainsi la structure suit le schéma FQ sans
 * qu'il faille la réécrire ici à chaque évolution du modèle de données.
 *
 * Les tests d'intégration d'une carte PRÉCISE (ses prérequis, ses messages, ses
 * valeurs de `changes`) restent du ressort du module qui livre cette carte.
 */

const DECKS_DIR = path.join(process.cwd(), "packs", "_source", "decks-pattern-fq8");

/**
 * Toutes les cartes des paquets pattern livrés par CE module.
 *
 * @returns {object[]} Les cartes brutes.
 */
function packCards() {
    return fs.readdirSync(DECKS_DIR)
        .filter(file => file.endsWith(".json"))
        .flatMap(file => JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), "utf8")).cards ?? []);
}

/**
 * Une carte du corpus qui pose une condition dnd5e, prise pour gabarit. Elle est
 * DÉCOUVERTE et non nommée : un identifiant en dur rouvrirait la faille que ce
 * module comble.
 *
 * @returns {object} La carte gabarit, en copie.
 */
function conditionTemplate() {
    const template = packCards().find(card => (card.system?.fq?.choices ?? []).some(
        choice => (choice.applyEffectsFormulas ?? []).some(
            formula => (formula.effects ?? []).some(
                effect => (effect.data ?? []).some(entry => entry.status)))));
    expect(template, "aucune carte du corpus ne pose de condition : gabarit introuvable").toBeDefined();
    return JSON.parse(JSON.stringify(template));
}

/**
 * Une carte qui pose UNE condition dnd5e sur sa cible, et rien d'autre : aucun
 * dégât, aucun jet d'attaque, aucun prérequis d'arme ou d'effet, une portée large
 * et un coût d'un seul point d'action. Tout ce qui pourrait faire refuser la
 * carte — et donc faire passer pour « rien n'est posé » un refus en amont — est
 * retiré.
 *
 * @param {string} status - L'identifiant de condition dnd5e (`"grappled"`, …).
 * @param {object} [options] - Options.
 * @param {number} [options.rounds] - La durée en rounds (défaut : 1).
 * @param {boolean} [options.onSelf] - Poser la condition sur le lanceur plutôt que sur la cible.
 *
 * @returns {object} La carte fabriquée, prête pour `playChoice`.
 */
export function conditionCard(status, {rounds = 1, onSelf = false} = {}) {
    const card = basicCard({}, {id: `FIXTURE${status}`, name: `FIXTURE.${status}`});
    const [choice] = card.system.fq.choices;
    choice.applyEffectsFormulas = [{
        title: status,
        formula: "1",
        effects: [{
            result: "1",
            self: onSelf,
            removeEffectName: "",
            data: [{
                status,
                duration: {value: String(rounds), units: "rounds"},
                expireOnDamage: false
            }],
            messages: []
        }]
    }];
    return card;
}

/**
 * Une carte neutre : aucun dégât, aucun jet, aucun prérequis d'arme ou d'effet,
 * une portée large et un coût d'un seul point d'action. Tout ce qui pourrait
 * faire REFUSER la carte est retiré — sans quoi un refus en amont passerait pour
 * « le moteur n'a rien fait ».
 *
 * Les surcharges s'appliquent au choix 0, après neutralisation.
 *
 * @param {object} [choiceOverrides] - Les champs du choix à poser (`damage`, `heal`, `xvalue`, …).
 * @param {object} [options] - Options.
 * @param {string} [options.id] - Un identifiant lisible (complété à 16 caractères).
 * @param {string} [options.name] - Le nom de la carte.
 *
 * @returns {object} La carte fabriquée, prête pour `playChoice`.
 */
export function basicCard(choiceOverrides = {}, {id = "FIXTUREbasic", name = "FIXTURE.Basic"} = {}) {
    const card = conditionTemplate();
    card._id = id.slice(0, 16).padEnd(16, "0");
    card.name = name;

    const [choice] = card.system.fq.choices;
    Object.assign(choice, {
        action: "-1", mana: "", zeal: "", hp: "", draw: "", drop: "",
        damage: "", heal: "", magical: false,
        hitType: "", hitSource: "", hitAbility: "",
        minReach: "0", maxReach: "99", nbTargets: "",
        targetType: "Default",
        xvalue: "", yvalue: "", xmin: "", xmax: "", ymin: "", ymax: "",
        // Types respectés : le moteur fait `(minions ?? []).filter(...)`, et une
        // chaîne vide n'étant pas nullish, elle passerait le `??` pour casser après.
        minions: [], customEvals: [], messages: [],
        sound: "", visual: {}, replayable: "",
        chooseCardsList: "", chooseCardsFrom: "",
        applyEffectsFormulas: []
    }, choiceOverrides);
    card.system.fq.choices = [choice];
    return card;
}
