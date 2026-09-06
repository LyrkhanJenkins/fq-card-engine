import Constants from "../../constants.js";
import {createWarning} from "../../../core/utils/chat.utils.js";

/**
 * Rejoue un choix résolu via le chemin de jeu commun (`playValidatedCard`), appelé
 * via la façade globale pour ne pas fermer le cycle `engine` → `interface`. Une
 * garde du pipeline (ciblage, bornes, sbires…) n'est jamais fatale : elle est
 * journalisée et avertie au joueur, sans rien facturer ni déplacer la carte —
 * l'appelant a déjà retiré tout état transitoire (préparation, etc.) avant l'appel.
 * Factorisé entre `AutoCard.replayCard` et `PreparedCard#triggerCard`, qui ne
 * diffèrent que par la construction de `fd` et de `hasVariables`.
 *
 * @param {Cards}   to          - La pile de défausse cible du rejeu.
 * @param {object}  fd          - Les données de formulaire du rejeu (`to`, `nameContent`…).
 * @param {object}  cardContent - Le choix résolu à jouer.
 * @param {object}  pipelineOptions
 * @param {object[]} pipelineOptions.cardContents    - Les choix résolus de la carte.
 * @param {boolean}  pipelineOptions.hasVariables    - True si la carte porte des variables X/Y libres.
 * @param {object[]} pipelineOptions.initCardContents - Les choix non résolus de la carte.
 * @param {Cards}    pipelineOptions.currentCards    - La main du porteur.
 * @param {Card}     pipelineOptions.card            - La carte rejouée.
 *
 * @returns {Promise<void>}
 */
export async function invokePlayPipeline(to, fd, cardContent,
    {cardContents, hasVariables, initCardContents, currentCards, card}) {
    try {
        await globalThis.FqCardEngineModule.playValidatedCard(to, fd, cardContent, {
            firstChoice: cardContents[0], cardContents, hasVariables, initCardContents, currentCards, card
        });
    } catch (e) {
        console.error(e);
        createWarning(e.message, {actor: Constants.actorCurrent});
    }
}
