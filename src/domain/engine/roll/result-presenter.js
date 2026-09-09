import RollReport from "./roll-report.js";

/**
 * Fonction d'affichage du résultat enregistrée par la couche interface, ou null
 * tant qu'aucune ne l'est (tests, ou moteur chargé sans interface).
 *
 * @type {?function(RollReport): Promise<void>}
 */
let presenter = null;

/**
 * Fonction de diffusion du rapport aux autres clients, ou null tant qu'aucune
 * n'est enregistrée (tests, ou session sans socket).
 *
 * @type {?function(object): void}
 */
let broadcaster = null;

/**
 * Enregistre la fonction chargée de diffuser un rapport aux autres joueurs.
 *
 * Séparée du présentateur parce qu'elle relève d'une autre couche : c'est le
 * hook qui possède le socket qui vient s'annoncer ici, et le moteur continue de
 * n'en rien savoir.
 *
 * @param {function(object): void} fn - La fonction de diffusion.
 *
 * @returns {void}
 */
export function registerResultBroadcaster(fn) {
    broadcaster = fn;
}

/**
 * Enregistre la fonction chargée de présenter un rapport de jet.
 *
 * Ce point d'entrée existe pour que le moteur n'importe jamais l'interface : la
 * résolution d'une carte doit attendre la fin de l'affichage sans rien connaître
 * de la fenêtre qui l'assure. C'est l'interface qui vient s'annoncer au `setup`.
 *
 * @param {function(RollReport): Promise<void>} fn - La fonction d'affichage.
 *
 * @returns {void}
 */
export function registerResultPresenter(fn) {
    presenter = fn;
}

/**
 * Présente un rapport de jet et attend la fin de son affichage. Sans présentateur
 * enregistré, rend la main immédiatement.
 *
 * Ne lève JAMAIS : les dégâts, les effets et les points de vie sont appliqués
 * juste après cet appel, et une animation défaillante ne doit pas les retenir.
 * Une carte jouée doit produire ses effets même si l'écran refuse de les montrer.
 *
 * @param {RollReport} report - Le rapport de la résolution.
 *
 * @returns {Promise<void>}
 */
export async function presentResult(report) {
    // Une résolution sans jet ni résultat — une carte de pioche, par exemple —
    // n'a rien à montrer : ni fenêtre à ouvrir chez les autres, ni socket à
    // occuper pour un rapport que personne n'affichera.
    if (!RollReport.hasContent(report)) {
        return;
    }
    // Diffusé AVANT de jouer l'animation locale : les autres clients absorbent
    // ainsi la latence du réseau et regardent à peu près le même rythme que le
    // lanceur, dont l'horloge fait foi puisque c'est lui qui appliquera les
    // dégâts à la fin. Le rapport part sous sa forme nue : un document Foundry y
    // rendrait le message intransmissible.
    if (broadcaster) {
        try {
            broadcaster(report?.toObject ? report.toObject() : report);
        } catch (error) {
            console.error(error);
        }
    }
    if (!presenter) {
        return;
    }
    try {
        await presenter(report);
    } catch (error) {
        console.error(error);
    }
}
