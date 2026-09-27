/**
 * Point de contact unique avec le module fq-enhanced-combat.
 *
 * Les jets de mort et l'initiative automatique ont quitté ce module : ce sont des
 * règles de combat dnd5e, qui n'ont rien du système de cartes. Elles vivent
 * désormais dans fq-enhanced-combat, qui les expose par son API publique.
 *
 * Le moteur de cartes a toutefois besoin de SAVOIR qu'un début de tour est pris en
 * charge là-bas : un porteur à terre ne pioche pas, ne reçoit pas de main et ne
 * rejoue pas ses cartes automatiques. D'où cette interrogation, et elle seule.
 *
 * La dépendance est OPTIONNELLE : sans fq-enhanced-combat, personne ne résout les
 * débuts de tour à 0 point de vie, et le tour se déroule normalement — le
 * comportement d'avant l'extraction, réglage désactivé.
 */

/**
 * L'identifiant du module de règles de combat, tel que déclaré dans son
 * `module.json`.
 * @type {string}
 */
const ENHANCED_COMBAT_ID = "fq-enhanced-combat";

/**
 * L'API publique de fq-enhanced-combat, si le module est actif et prêt.
 *
 * @returns {object|undefined} L'API, ou undefined si le module est absent.
 */
function enhancedCombat() {
    return game.modules?.get(ENHANCED_COMBAT_ID)?.api;
}

/**
 * Le début de tour de cet acteur est-il pris en charge par fq-enhanced-combat —
 * autrement dit, son tour ne doit-il pas se dérouler normalement ?
 *
 * Question PRÉDICTIVE et non constat d'exécution : elle ne dépend pas de l'ordre
 * dans lequel Foundry appelle les hooks des deux modules. Elle rend vrai dès que
 * le réglage est actif et l'acteur à terre, que le jet ait déjà été lancé ou non.
 *
 * @param {Actor} [actor] - L'acteur du combattant dont le tour commence.
 *
 * @returns {boolean} True si le tour est pris en charge ailleurs.
 */
export function deathSaveSkipsTurn(actor) {
    return enhancedCombat()?.deathSave?.skipsTurn(actor) === true;
}
