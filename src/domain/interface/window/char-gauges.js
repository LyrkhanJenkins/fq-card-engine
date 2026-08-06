/**
 * Jauges du personnage dans le HUD (PV / action / mana / zèle) et bascule de leur
 * affichage. Extrait de la façade `FqCardEngineModule` ; réassemblé par spread
 * dans `init-engine.js`. Comportement inchangé.
 */
export default {
    /**
     * Met à jour l'affichage des jauges du personnage (PV, action, mana, zèle) et
     * son avatar dans le HUD, selon le réglage de visibilité et le personnage courant.
     *
     * @returns {void}
     */
    updateCharGauges: function () {
        const character = game.user?.character;
        const gauges = document.getElementById("fq-char-gauges");
        const toggle = document.getElementById("fq-char-gauges-toggle");
        if (!gauges) return;

        const visible = game.settings.get(FqCardEngineModule.moduleName, "ShowCharGauges") ?? true;
        gauges.style.display = (visible && character) ? "flex" : "none";
        if (toggle) toggle.style.opacity = visible ? "1" : "0.35";

        if (!character || !visible) return;

        const avatar = document.getElementById("fq-cg-avatar");
        if (avatar) avatar.src = character.img;

        const set = (id, valId, value, max) => {
            const pct = max > 0 ? Math.round((value / max) * 100) : 0;
            const fill = document.getElementById(id);
            const val = document.getElementById(valId);
            if (fill) fill.style.width = pct + "%";
            if (val) val.textContent = `${value}/${max}`;
        };

        const hp = character.system?.attributes?.hp;
        const action = character.system?.fq?.action;
        const mana = character.system?.fq?.mana;
        const zeal = character.system?.fq?.zeal;

        set("fq-cg-hp", "fq-cg-hp-val", hp?.value ?? 0, hp?.max ?? 1);
        set("fq-cg-action", "fq-cg-action-val", action?.value ?? 0, action?.max ?? 1);
        set("fq-cg-mana", "fq-cg-mana-val", mana?.value ?? 0, mana?.max ?? 1);
        set("fq-cg-zeal", "fq-cg-zeal-val", zeal?.value ?? 0, zeal?.max ?? 1);
    },

    /**
     * Bascule la visibilité des jauges du personnage (réglage `ShowCharGauges`)
     * puis rafraîchit leur affichage.
     *
     * @returns {void}
     */
    toggleCharGauges: function () {
        const current = game.settings.get(FqCardEngineModule.moduleName, "ShowCharGauges") ?? true;
        game.settings.set(FqCardEngineModule.moduleName, "ShowCharGauges", !current).then(() => {
            FqCardEngineModule.updateCharGauges();
        });
    },
};
