import Constants from "../../constants.js";
import DisplayCard from "../shared/display-card.js";

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
        const character = Constants.actorCurrent;
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

        // Pastilles secondaires : critique / esquive / défausse (toujours) ; sacrifice,
        // bonus de portée, de dégâts et de soin (seulement si supérieurs à 0).
        const attributes = character.system?.fq?.attributes;
        const bonus = character.system?.fq?.bonus;

        // Renseigne la valeur d'une pastille, et affiche/masque son conteneur pour les
        // pastilles conditionnelles. `visible === null` ⇒ toujours affichée.
        const setChip = (valId, chipId, value, visible = null) => {
            const val = document.getElementById(valId);
            if (val) val.textContent = value;
            if (chipId !== null) {
                const chip = document.getElementById(chipId);
                if (chip) chip.style.display = visible ? "inline-flex" : "none";
            }
        };

        setChip("fq-cg-critical", null, attributes?.critical ?? 0);
        setChip("fq-cg-evasion", null, attributes?.evasion ?? 0);
        setChip("fq-cg-drop", null, character.system?.fq?.cards?.currentDrop ?? 0);

        const sacrifice = character.system?.fq?.special?.sacrificedSkeleton ?? 0;
        setChip("fq-cg-sacrifice", "fq-cg-sacrifice-chip", sacrifice, sacrifice > 0);

        const range = bonus?.range ?? 0;
        setChip("fq-cg-range", "fq-cg-range-chip", range, range > 0);

        setChip("fq-cg-damage", "fq-cg-damage-chip", bonus?.damage, DisplayCard.hasBonusStr(bonus?.damage));
        setChip("fq-cg-heal", "fq-cg-heal-chip", bonus?.heal, DisplayCard.hasBonusStr(bonus?.heal));
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
