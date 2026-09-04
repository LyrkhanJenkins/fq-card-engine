import Constants from "../../constants.js";
import Geometry from "../../engine/shared/geometry.js";
import TargetingPredicates from "../../engine/shared/targeting-predicates.js";

/**
 * Infobulle de distance suivant le curseur pendant le mode ciblage : au survol
 * d'un token de la scène, elle affiche la distance (en cases) qui le sépare du
 * lanceur, cible retenue ou non.
 *
 * Elle n'existe QUE le temps du ciblage manuel : hors de ce mode, le survol d'un
 * token n'a rien à voir avec le jeu d'une carte, et une infobulle permanente
 * parasiterait le canvas.
 *
 * Le suivi du curseur passe par un écouteur `mousemove` sur le document plutôt
 * que par les coordonnées canvas : le hook `hoverToken` ne transporte aucune
 * position de souris, et la conversion scène → écran dépend d'API de canvas dont
 * on n'a pas besoin ici.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class TargetDistanceTooltip {

    /**
     * Décalage (px) de l'infobulle par rapport au curseur, pour ne pas passer
     * sous le pointeur ni sous la main du joueur.
     */
    static CURSOR_OFFSET = Object.freeze({x: 18, y: 20});

    static #element = null;

    static #hoverHookId = null;

    static #moveHandler = null;

    static #lastX = 0;

    static #lastY = 0;

    /**
     * Arme l'infobulle : survol des tokens écouté, position suivie au curseur.
     * Appel idempotent — une double entrée en mode ciblage n'enregistre pas deux
     * hooks.
     *
     * @returns {void}
     */
    static activate() {
        if (TargetDistanceTooltip.#hoverHookId !== null) {
            return;
        }
        TargetDistanceTooltip.#hoverHookId = Hooks.on("hoverToken", (token, hovered) => {
            if (hovered) {
                TargetDistanceTooltip.#show(token);
            } else {
                TargetDistanceTooltip.#hide();
            }
        });
        TargetDistanceTooltip.#moveHandler = event => {
            TargetDistanceTooltip.#lastX = event.clientX;
            TargetDistanceTooltip.#lastY = event.clientY;
            TargetDistanceTooltip.#place();
        };
        document.addEventListener("mousemove", TargetDistanceTooltip.#moveHandler);
    }

    /**
     * Désarme l'infobulle et retire tout ce qu'elle a posé dans le document.
     * Appelée à la sortie du ciblage ET à la fermeture de la dialog : une
     * infobulle survivant à son mode resterait collée au curseur.
     *
     * @returns {void}
     */
    static deactivate() {
        if (TargetDistanceTooltip.#hoverHookId !== null) {
            Hooks.off("hoverToken", TargetDistanceTooltip.#hoverHookId);
            TargetDistanceTooltip.#hoverHookId = null;
        }
        if (TargetDistanceTooltip.#moveHandler) {
            document.removeEventListener("mousemove", TargetDistanceTooltip.#moveHandler);
            TargetDistanceTooltip.#moveHandler = null;
        }
        TargetDistanceTooltip.#element?.remove();
        TargetDistanceTooltip.#element = null;
    }

    /**
     * Affiche la distance lanceur → token survolé. Sans lanceur sur la scène,
     * aucune distance n'est mesurable : l'infobulle reste muette.
     *
     * @param {object} token - Le token survolé (placeable ou document).
     *
     * @returns {void}
     */
    static #show(token) {
        const casterToken = TargetingPredicates.findCasterToken(Constants.actorCurrent);
        if (!casterToken || !token) {
            TargetDistanceTooltip.#hide();
            return;
        }
        const dist = Geometry.distanceBetweenTokens(casterToken, token);
        const unit = game.i18n.localize(dist > 1
            ? "FQCARDENGINE.TargetingPanelSquares"
            : "FQCARDENGINE.TargetingPanelSquare");
        const element = TargetDistanceTooltip.#ensureElement();
        element.textContent = `${dist} ${unit}`;
        element.classList.add("fq-play-distance-tooltip--visible");
        TargetDistanceTooltip.#place();
    }

    /**
     * Masque l'infobulle sans la détruire : le survol suivant la réutilise.
     *
     * @returns {void}
     */
    static #hide() {
        TargetDistanceTooltip.#element?.classList.remove("fq-play-distance-tooltip--visible");
    }

    /**
     * Positionne l'infobulle à la dernière position connue du curseur.
     *
     * @returns {void}
     */
    static #place() {
        const element = TargetDistanceTooltip.#element;
        if (!element) {
            return;
        }
        element.style.left = `${TargetDistanceTooltip.#lastX + TargetDistanceTooltip.CURSOR_OFFSET.x}px`;
        element.style.top = `${TargetDistanceTooltip.#lastY + TargetDistanceTooltip.CURSOR_OFFSET.y}px`;
    }

    /**
     * Rend l'élément d'infobulle, créé à la volée au premier survol.
     *
     * @returns {HTMLElement} L'élément d'infobulle attaché au document.
     */
    static #ensureElement() {
        if (!TargetDistanceTooltip.#element) {
            const element = document.createElement("div");
            element.className = "fq-play-distance-tooltip";
            document.body.appendChild(element);
            TargetDistanceTooltip.#element = element;
        }
        return TargetDistanceTooltip.#element;
    }
}
