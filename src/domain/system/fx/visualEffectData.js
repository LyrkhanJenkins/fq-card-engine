/**
 * Table de correspondance entre types d'effets et chemins de fichiers vidéo (.webm)
 * utilisés pour jouer les effets visuels lors du jeu des cartes.
 * Organisée par catégorie : effets génériques (mêlée / distance / autres, indexés
 * par type de dégâts) et effets spécifiques à une classe (ex. « elementalist »).
 *
 * @type {object}
 */
export const visualEffectData = {
    generics: {
        melee: {
            default: "modules/fq-card-engine/visuals/generics/melee/default.webm",
            acid: "modules/fq-card-engine/visuals/generics/melee/acid.webm",
            bludgeoning: "modules/fq-card-engine/visuals/generics/melee/bludgeoning.webm",
            cold: "modules/fq-card-engine/visuals/generics/melee/cold.webm",
            fire: "modules/fq-card-engine/visuals/generics/melee/fire.webm",
            force: "modules/fq-card-engine/visuals/generics/melee/force.webm",
            lightning: "modules/fq-card-engine/visuals/generics/melee/lightning.webm",
            necrotic: "modules/fq-card-engine/visuals/generics/melee/necrotic.webm",
            piercing: "modules/fq-card-engine/visuals/generics/melee/piercing.webm",
            poison: "modules/fq-card-engine/visuals/generics/melee/poison.webm",
            psychic: "modules/fq-card-engine/visuals/generics/melee/psychic.webm",
            radiant: "modules/fq-card-engine/visuals/generics/melee/radiant.webm",
            slashing: "modules/fq-card-engine/visuals/generics/melee/slashing.webm",
            thunder: "modules/fq-card-engine/visuals/generics/melee/thunder.webm"
        },
        range: {
            default: "modules/fq-card-engine/visuals/generics/range/default.webm",
            acid: "modules/fq-card-engine/visuals/generics/range/acid.webm",
            bludgeoning: "modules/fq-card-engine/visuals/generics/range/bludgeoning.webm",
            cold: "modules/fq-card-engine/visuals/generics/range/cold.webm",
            fire: "modules/fq-card-engine/visuals/generics/range/fire.webm",
            force: "modules/fq-card-engine/visuals/generics/range/force.webm",
            lightning: "modules/fq-card-engine/visuals/generics/range/lightning.webm",
            necrotic: "modules/fq-card-engine/visuals/generics/range/necrotic.webm",
            piercing: "modules/fq-card-engine/visuals/generics/range/piercing.webm",
            poison: "modules/fq-card-engine/visuals/generics/range/poison.webm",
            psychic: "modules/fq-card-engine/visuals/generics/range/psychic.webm",
            radiant: "modules/fq-card-engine/visuals/generics/range/radiant.webm",
            slashing: "modules/fq-card-engine/visuals/generics/range/slashing.webm",
            thunder: "modules/fq-card-engine/visuals/generics/range/thunder.webm"
        },
        other: {
            buff: "modules/fq-card-engine/visuals/generics/other/buff.webm",
            critical: "modules/fq-card-engine/visuals/generics/other/critical.webm",
            evasion: "modules/fq-card-engine/visuals/generics/other/evasion.webm",
            heal: "modules/fq-card-engine/visuals/generics/other/heal.webm",
        }
    },
    elementalist: {
        earthFracture: "modules/fq-card-engine/visuals/elementalist/earth-fracture.webm",
        tornado: "modules/fq-card-engine/visuals/elementalist/tornado.webm"
    }
};