/**
 * Mise en page de la barre de mains : échelle, effet d'éventail, ancrage/position,
 * défilement horizontal et déplacement à la souris. Extrait de la façade
 * `FqCardEngineModule` ; réassemblé par spread dans `init-engine.js`.
 */
export default {
    /**
     * Recalcule l'échelle du conteneur des mains à partir du curseur de taille
     * (variables CSS de hauteur/échelle) puis réapplique l'effet d'éventail.
     *
     * @returns {void}
     */
    updateSize: function () {
        const slider = document.getElementById("fq-size-slider");
        const scale = slider ? parseFloat(slider.value) : 1.0;
        const container = document.getElementById("fq-card-engine-container");
        if (!container) return;

        container.style.setProperty("--fq-scale", scale);

        const cardH = 130 * scale; // hauteur réelle de la carte
        const overflow = 15;
        const panelH = cardH + overflow;
        container.style.setProperty("--fq-panel-h", panelH + "px");

        FqCardEngineModule.applyFan();
    },
    /**
     * Dispose les cartes de chaque zone en éventail : chaque carte reçoit une
     * rotation et un décalage vertical calculés selon sa position, ainsi qu'un
     * rang d'empilement strictement croissant de gauche à droite (chaque carte
     * recouvre sa voisine de gauche).
     *
     * @returns {void}
     */
    applyFan: function () {
        const TILT_MAX = 10;   // degrés max (courbure 67)
        const LIFT_MAX = 19;   // px lift latéral (courbure 67)
        const Z_BASE = 10;     // socle de l'empilement gauche → droite

        document.querySelectorAll(".fq-card-zone, .fq-card-engine-card-container").forEach(function (zone) {
            const cards = Array.from(zone.querySelectorAll(".fq-card, .fq-card-engine-card"));
            const n = cards.length;
            if (n === 0) return;

            cards.forEach(function (card, i) {
                const pct = n > 1 ? (i / (n - 1)) - 0.5 : 0;
                const tilt = pct * TILT_MAX * 2;
                const lift = -Math.abs(pct) * LIFT_MAX;
                card.style.setProperty("--fan-transform", `rotate(${tilt.toFixed(2)}deg) translateY(${lift.toFixed(1)}px)`);
                card.style.transform = card.style.getPropertyValue("--fan-transform");
                // Empilement passé par variable CSS et non par style inline :
                // la règle de survol peut ainsi remonter la carte pointée au
                // premier plan, ce qu'un z-index inline empêcherait.
                card.style.removeProperty("z-index");
                card.style.setProperty("--fan-z", String(Z_BASE + i));
            });
        });
    },
    /**
     * Positionne le conteneur des mains dans l'interface selon le réglage
     * « Draggable » : mode déplaçable (position absolue avant `#players`) ou ancré
     * dans `#interface`.
     *
     * @returns {void}
     */
    setupPosition: function () {
        const content = document.getElementById("fq-card-engine-container");
        if (!content) return;

        const isDraggable = game.settings.get(FqCardEngineModule.moduleName, "Draggable") ?? false;

        if (isDraggable) {
            // Mode draggable : place avant #players, position absolue
            document.getElementById("players")?.before(content);
            content.classList.add("fq-card-engine-draggable");
            FqCardEngineModule.initializeDraggable();
        } else {
            // Ancre dans #interface pour que left:0 = bord gauche réel de l'écran
            const interfaceEl = document.getElementById("interface");
            if (interfaceEl) interfaceEl.appendChild(content);
            content.classList.remove("fq-card-engine-draggable");
        }
    },
    /**
     * Active le défilement horizontal fluide des cartes d'une main : la position
     * de la souris entre le bord gauche du panel et le bord droit de l'écran
     * pilote un décalage animé de la zone de cartes, borné au débordement réel
     * hors écran. Nettoie les écouteurs précédents et stocke une fonction de
     * nettoyage sur l'élément (`_fqScrollCleanup`).
     *
     * @param {HTMLElement} handEl - L'élément racine de la main.
     *
     * @returns {void}
     */
    setupHorizontalScroll: function (handEl) {
        const panel = handEl.querySelector(".fq-hand-panel, .fq-card-engine-hand-inner");
        const zone = handEl.querySelector(".fq-card-zone, .fq-card-engine-card-container");
        if (!panel || !zone) return;

        // Nettoie les anciens listeners si on rappelle la fonction
        if (handEl._fqScrollCleanup) handEl._fqScrollCleanup();

        // Marge gardée à droite : la dernière carte reste entièrement visible,
        // agrandissement au survol compris.
        const RIGHT_MARGIN = 44;
        // Part de la largeur visible parcourue avant que le glissement démarre.
        const SLIDE_START = 0.35;

        let targetX = 0;
        let currentX = 0;
        let rafId = null;

        const tick = () => {
            currentX += (targetX - currentX) * 0.14;
            if (Math.abs(targetX - currentX) > 0.2) {
                zone.style.transform = `translateX(${currentX.toFixed(1)}px)`;
                rafId = requestAnimationFrame(tick);
            } else {
                currentX = targetX;
                zone.style.transform = `translateX(${targetX.toFixed(1)}px)`;
                rafId = null;
            }
        };

        /**
         * Largeur des cartes qui dépassent réellement du bord droit de l'écran,
         * mesurée décalage courant déduit : c'est la borne du glissement, si bien
         * que la main ne peut jamais glisser plus loin que nécessaire.
         *
         * @returns {number} Débordement en pixels (0 si toute la main tient à l'écran).
         */
        const overflowWidth = () => {
            const right = zone.getBoundingClientRect().right - currentX;
            return Math.max(0, right - (window.innerWidth - RIGHT_MARGIN));
        };

        const onMove = (e) => {
            // Le panel ne bouge pas (seule la zone est translatée) : son bord
            // gauche sert d'origine stable, y compris en mode déplaçable.
            const left = panel.getBoundingClientRect().left;
            const span = (window.innerWidth - RIGHT_MARGIN) - left;
            const overflow = overflowWidth();

            if (overflow <= 0 || span <= 0) {
                targetX = 0;
            } else {
                const pos = (e.clientX - left) / span;
                const raw = (pos - SLIDE_START) / (1 - SLIDE_START);
                const pct = Math.min(1, Math.max(0, raw));
                const eased = pct * pct * (3 - 2 * pct); // smoothstep : départ et arrivée sans à-coup
                targetX = -(eased * overflow);
            }
            if (!rafId) rafId = requestAnimationFrame(tick);
        };

        const onLeave = () => {
            targetX = 0;
            if (!rafId) rafId = requestAnimationFrame(tick);
        };

        panel.addEventListener("mousemove", onMove);
        panel.addEventListener("mouseleave", onLeave);

        handEl._fqScrollCleanup = () => {
            panel.removeEventListener("mousemove", onMove);
            panel.removeEventListener("mouseleave", onLeave);
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
    },
    /**
     * Rend le conteneur des mains déplaçable à la souris via sa poignée, en
     * restaurant sa position depuis les réglages et en la persistant à la fin du
     * déplacement.
     *
     * @returns {void}
     */
    initializeDraggable: function () {
        let isDragging = false;
        const draggableElement = document.getElementById("fq-card-engine-container");
        let storedX = game.settings.get(FqCardEngineModule.moduleName, "PositionX");
        let storedY = game.settings.get(FqCardEngineModule.moduleName, "PositionY");
        draggableElement.style.left = `${storedX}px`;
        draggableElement.style.top = `${storedY}px`;


        $(".fq-card-engine-move-handle").on("mousedown", (e) => {
            isDragging = true;

            const offsetX = e.clientX - draggableElement.offsetLeft;
            const offsetY = e.clientY - draggableElement.offsetTop;

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);

            function onMouseMove(e) {
                if (isDragging) {
                    const x = e.clientX - offsetX;
                    const y = e.clientY - offsetY;
                    if (x > 0) {
                        draggableElement.style.left = `${x}px`;
                    }
                    if (y > 0) {
                        draggableElement.style.top = `${y}px`;
                    }
                }
            }

            function onMouseUp() {
                isDragging = false;
                game.settings.set(FqCardEngineModule.moduleName, "PositionX", draggableElement.offsetLeft);
                game.settings.set(FqCardEngineModule.moduleName, "PositionY", draggableElement.offsetTop);
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
            }
        });
    },
};
