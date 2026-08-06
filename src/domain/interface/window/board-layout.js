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
     * rotation, un décalage vertical et un z-index calculés selon sa position.
     *
     * @returns {void}
     */
    applyFan: function () {
        const TILT_MAX = 10;   // degrés max (courbure 67)
        const LIFT_MAX = 19;   // px lift latéral (courbure 67)

        document.querySelectorAll(".fq-card-zone, .fq-card-engine-card-container").forEach(function (zone) {
            const cards = Array.from(zone.querySelectorAll(".fq-card, .fq-card-engine-card"));
            const n = cards.length;
            if (n === 0) return;

            cards.forEach(function (card, i) {
                const pct = n > 1 ? (i / (n - 1)) - 0.5 : 0;
                const tilt = pct * TILT_MAX * 2;
                const lift = -Math.abs(pct) * LIFT_MAX;
                const z = Math.round(20 - Math.abs(pct) * 12);
                card.style.setProperty("--fan-transform", `rotate(${tilt.toFixed(2)}deg) translateY(${lift.toFixed(1)}px)`);
                card.style.transform = card.style.getPropertyValue("--fan-transform");
                card.style.zIndex = z;
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
     * de la souris pilote un décalage animé (easing) de la zone de cartes, avec
     * nettoyage des écouteurs précédents. Stocke une fonction de nettoyage sur
     * l'élément (`_fqScrollCleanup`).
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

        let targetX = 0;
        let currentX = 0;
        let rafId = null;

        const tick = () => {
            currentX += (targetX - currentX) * 0.1;
            zone.style.transform = `translateX(${currentX.toFixed(1)}px)`;
            if (Math.abs(targetX - currentX) > 0.2) {
                rafId = requestAnimationFrame(tick);
            } else {
                currentX = targetX;
                zone.style.transform = `translateX(${targetX}px)`;
                rafId = null;
            }
        };

        const onMove = (e) => {
            const sidebarW = 56 + 16;                         // 2×28px + 2×8px padding zone
            const availableW = panel.getBoundingClientRect().width - sidebarW;
            const activateScrollPct = 0.5;
            const maxOffset = availableW - (e.clientX * activateScrollPct);

            if (maxOffset <= 0) {
                targetX = 0;
            } else {
                const pct = e.clientX / window.innerWidth;

                if (pct <= activateScrollPct) {
                    targetX = 0;
                } else {
                    const rightPct = (pct - activateScrollPct) / (1 - activateScrollPct);
                    const eased = (1 - Math.cos(rightPct * Math.PI)) / 2; // ease-in-out, pic à 0.5
                    targetX = -(eased * maxOffset);
                }
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
