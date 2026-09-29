/**
 * Préfixe des assets de la bibliothèque JB2A (module gratuit `JB2A_DnD5e`).
 *
 * Les effets visuels ne sont pas redistribués avec ce module : ils sont lus
 * directement dans JB2A, que le joueur installe de son côté. En son absence,
 * {@link Fx} n'a plus de fichier à jouer et se limite au son et au clignotement.
 *
 * @type {string}
 */
export const JB2A_PATH = "modules/JB2A_DnD5e/Library/";

/**
 * Table de correspondance entre types d'effets et chemins de fichiers vidéo (.webm)
 * de la bibliothèque JB2A, utilisés pour jouer les effets visuels lors du jeu des
 * cartes. Organisée par catégorie : effets génériques (mêlée / distance / autres,
 * indexés par type de dégâts) et effets spécifiques à une classe (ex. « elementalist »).
 *
 * Les effets de mêlée sont joués à l'emplacement de la cible : ce sont des impacts
 * ou des passes d'armes, cadrés carré. Les effets à distance sont étirés du lanceur
 * vers la cible : ce sont les variantes `60ft` (2800x400) des projectiles JB2A, les
 * seules qui gardent une bonne définition une fois étirées sur toute la portée.
 *
 * @type {object}
 */
export const visualEffectData = {
    generics: {
        melee: {
            default: JB2A_PATH + "Generic/Impact/Impact_08_Regular_Orange_400x400.webm",
            acid: JB2A_PATH + "Generic/Explosion/TopFractureFlask01_01_400x400.webm",
            bludgeoning: JB2A_PATH + "Generic/Weapon_Attacks/Melee/Club01_01_Regular_White_800x600.webm",
            cold: JB2A_PATH + "Generic/Impact/ImpactIceShard01_01_Regular_Blue_400x400.webm",
            fire: JB2A_PATH + "Generic/Impact/ImpactFire01_01_Regular_Orange_600x600.webm",
            force: JB2A_PATH + "Generic/Impact/Impact_11_Regular_Blue_400x400.webm",
            lightning: JB2A_PATH + "Generic/Lightning/StaticElectricity_01_Regular_Blue_400x400.webm",
            necrotic: JB2A_PATH + "Cantrip/Toll_The_Dead/TollTheDeadSkullSmoke_01_Regular_Green_400x400.webm",
            piercing: JB2A_PATH + "Generic/Weapon_Attacks/Melee/Dagger02_01_Regular_White_800x600.webm",
            poison: JB2A_PATH + "Cantrip/Toll_The_Dead/TollTheDeadShockwave_01_Regular_Green_400x400.webm",
            psychic: JB2A_PATH + "Generic/Energy/SwirlingSparkles_01_Regular_Blue_400x400.webm",
            radiant: JB2A_PATH + "2nd_Level/Divine_Smite/DivineSmite_01_Regular_BlueYellow_Target_400x400.webm",
            slashing: JB2A_PATH + "Generic/Weapon_Attacks/Melee/GenericSlash01_01_Regular_Orange_800x600.webm",
            thunder: JB2A_PATH + "2nd_Level/Shatter/Shatter_01_Blue_400x400.webm"
        },
        range: {
            default: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/Arrow01_01_Regular_White_60ft_2800x400.webm",
            acid: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/ThrowFlask01_01_Regular_Orange_60ft_2800x400.webm",
            bludgeoning: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/BoulderToss02_01_Regular_Brown_60ft_2800x400.webm",
            cold: JB2A_PATH + "Cantrip/Ray_Of_Frost/RayOfFrost_01_Regular_Blue_60ft_2800x400.webm",
            fire: JB2A_PATH + "Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_60ft_2800x400.webm",
            force: JB2A_PATH + "1st_Level/Magic_Missile/MagicMissile_01_Regular_Purple_60ft_01_2800x400.webm",
            lightning: JB2A_PATH + "1st_Level/Witch_Bolt/WitchBolt_01_Regular_Blue_60ft_2800x400.webm",
            necrotic: JB2A_PATH + "Generic/RangedSpell/OverchargedSphere01_01_Dark_Purple_60ft_2800x400.webm",
            piercing: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/Bolt01_01_Regular_Orange_Physical_60ft_2800x400.webm",
            poison: JB2A_PATH + "Generic/RangedSpell/04/RangedProjectile04_01_Regular_Green_60ft_2800x400.webm",
            psychic: JB2A_PATH + "Generic/Energy/EnergyStrand_Multiple02_Regular_BluePink_60ft_2800x400.webm",
            radiant: JB2A_PATH + "Generic/RangedSpell/02/RangedProjectile02_01_Regular_Yellow_60ft_2800x400.webm",
            slashing: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/Dagger01_01_Regular_White_60ft_2800x400.webm",
            thunder: JB2A_PATH + "Generic/Weapon_Attacks/Ranged/LaunchCannonBall01_01_Regular_Black_60ft_2800x400.webm"
        },
        other: {
            buff: JB2A_PATH + "1st_Level/Bardic_Inspiration/BardicInspiration_01_Regular_GreenOrange_400x400.webm",
            critical: JB2A_PATH + "2nd_Level/Divine_Smite/DivineSmite_01_Regular_BlueYellow_Caster_400x400.webm",
            evasion: JB2A_PATH + "Generic/Smoke/SmokePuff01_01_Regular_Grey_400x400.webm",
            heal: JB2A_PATH + "Generic/Healing/HealingAbility_01_Green_400x400.webm",
        }
    },
    elementalist: {
        earthFracture: JB2A_PATH + "Generic/Impact/GroundCrackImpact_01_Regular_Orange_600x600.webm",
        tornado: JB2A_PATH + "Generic/Nature/SwirlingLeaves01_01_Regular_GreenOrange_60ft_2800x400.webm"
    }
};
