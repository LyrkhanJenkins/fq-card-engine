# FQ Card Engine for FoundryVTT

The FQ Card Engine is a combat system for Final Quest 8 combined with DnD5e rules.

Requires Foundry VTT **v14** and the **dnd5e** system **6.x**.


![img.png](images/doc/summary.png)

## Mandatory modules
- socketlib https://foundryvtt.com/packages/socketlib
- lib-wrapper https://foundryvtt.com/packages/lib-wrapper
- DAE https://foundryvtt.com/packages/dae — runs the effect macros used by the cards

## Recommended modules
- Sequencer https://foundryvtt.com/packages/sequencer — plays the visual effects of the cards
- JB2A https://foundryvtt.com/packages/JB2A_DnD5e — the asset library those effects are read from; without it the cards keep their sounds but play no animation
- FQ Enhanced Combat https://github.com/final-quest/fq-enhanced-combat — death saving throws at the start of a turn, initiative rolled on joining combat
- FQ Restrain Movement https://github.com/final-quest/fq-restrain-movement — restricts the movement of players' tokens

## Extended content

Six classes are not shipped with this module: **Fencing Master, Guardian, Illusionist,
Runic Warrior, White Mage and Witch**. They live in a separate module, along with their
cards, illustrations and summons.

This module is fully playable on its own. **Elementalist, Monk and Trapper** are complete,
every level included, as are the neutral cards that all classes share.

The starter heroes of the six extended classes are still listed in the Starter Heroes
compendium, but without their class item: they are there as a preview.

Want the extended content? Send me a message:

- Discord: `lyrkhan_jenkins`
- Email: <lyrkhanjenkins@gmail.com>

## Get Started

- Start by selecting your preferred language in "Configure Settings". This will determine the language of the cards generated later.

![img.png](images/doc/settings.png)

- Next, create your players in "User Management".*

![img_1.png](images/doc/user-management.png)

- To create characters for your players, you have two options:
    - 1) Use the **Starter heroes** in FQ Compendium
    - 2) Drag and drop **Classes** to your own personal character

![img.png](images/doc/choose-class.png)

- Don't forget to associate each character with a player.
  
![img_4.png](images/doc/associate-character-player.png)

- As a GM, you can create decks, hands and piles for all of your players.

![img_2.png](images/doc/macros-gm.png)

- This will generate and open all decks for your players.

![img_3.png](images/doc/create-decks.png)

(Note: Decks are generated up to level 5. After that, decks are customizable and cannot be destroyed by the macros.)

![img_5.png](images/doc/assign-hand-toolbar.png)

- Everything is now set up to play. Start combat with your characters, and cards will automatically be drawn, with picks and hand scores applied. _(See more details in the rulebook.)_
  **_(Make sure your players are connected!)_**

![img_6.png](images/doc/lets-play.png)


## Final Quest 8

### Compendium
Final Quest 8 is a Board game with trading card for a dynamic combat system.
The 8th Version is an adaptation to combine the trading card battle system with DND5e System

The module provides several resources for start playing Final Quest 8 :
- Cards for the first 5 level
- Classes (three in this module, six more in the extended content)
- Items
- Passive Spells
- Monsters
- Macros

![img.png](images/doc/assets.png)

### Character new resources
Specials resources are used for using cards or spells for FQ battle system.

FQ resource values are found in a custom character sheet for characters and NPCs.
![img.png](images/doc/character-sheet.png)
### Using Card

In combat, cards are picked each turn with your hand and pick score.
![img.png](images/doc/hand-card.png)

Card are clickable, a dialog opens, displaying the card and its description.
You can choose to play the card or discard it to use other cards.
![img.png](images/doc/card-play-dialog.png)

For using cards that affects other target than you, you must target at least one character
![img.png](images/doc/target-ennemy.png)

All actions are displayed on a result dialog.
After playing a card, automatic roll, effect, damage, heal are applied, also critical, save, evasion and attack rolls.
![img.png](images/doc/result-dialog.png)

The module provides also a special ui for creating your own deck with your Spellbook
![img.png](images/doc/spellbook.png)

## Quick Rule Books:
### New resources for actors:
  - Action Points (yellow): Reset to maximum at the start of each turn. It represents a character's ability to use spells during their turn.
  - Mana (blue): A limited resource used to cast spells.
  - Zeal (red): A resource that increases when using weaker spells and is spent to cast more powerful spells.
  - Hand: The number of cards drawn at the beginning of combat.
  - Pick: The number of cards drawn each turn.
  - Critical: The chance, on a 1d20 roll, to double the damage dealt.
  - Evasion: The chance, on a 1d20 roll, to negate damage.
    - Critical and Evasion can cancel each other out.

### Other
- The cards are design to be used with rectilinear grids
![img.png](images/doc/rectilinear-grid.png)

## Dev

The compiled compendiums in `packs/` are not versioned, only their JSON sources in
`packs/_source/`. After cloning, compile them before opening the module in Foundry,
otherwise every compendium shows up empty:

```bash
npm ci
npm run build
```

| Command                    | What it does                                                       |
|----------------------------|--------------------------------------------------------------------|
| `npm run build`            | Compiles `packs/_source/` into the LevelDB packs Foundry reads     |
| `npm run build:json`       | Unpacks the LevelDB packs back into `packs/_source/`               |
| `npm test`                 | Runs the unit test suite (vitest)                                  |
| `npm run test:coverage`    | Same, with a coverage report                                       |
| `npm run lint`             | ESLint over `src/` and `tests/`                                    |
| `npm run report:classes`   | Prints the class balance report                                    |

### Releases

Pushing a tag equal to the `version` field of `module.json` triggers the `Release`
workflow: it lints, tests, compiles the packs and publishes the GitHub release, with
the notes taken from the matching `Update x.y.z:` block of [RELEASE](RELEASE).

### Generate a random test world

`npm run testWorld:random` creates a UAT world in the Foundry `worlds` folder. It only
writes files (no LevelDB access), so it can run while Foundry is open. Options go after `--`:

```bash
npm run testWorld:random -- --seed=12345 --class=elementalist:3,trapper:2 --level=5 --enemies="Goblin x3, Ogre" --difficulty=hard --placement=scattered --allies=1 --regions=2 --combat --name=uat-test
```

| Option         | Values                                                                                               |
|----------------|------------------------------------------------------------------------------------------------------|
| `--seed`       | A number. When omitted, a seed is drawn and printed so the world can be replayed                     |
| `--class`      | `slug[:level][,slug2[:level2]...]`, slugs taken from `packs/_source/classes-fq8` (e.g. `trapper`)     |
| `--level`      | Total hero level (1-20)                                                                              |
| `--enemies`    | A count (`4`) or an explicit list of monster names from the index (`"Goblin x3, Ogre"`)              |
| `--difficulty` | `easy` \| `normal` \| `hard` \| `deadly`                                                             |
| `--placement`  | `packed` \| `scattered` \| `line` \| `melee`                                                         |
| `--allies`     | Number of allies (default 0)                                                                         |
| `--regions`    | Number of regions                                                                                    |
| `--combat`     | Sets up and starts the combat when seeding (default: off)                                            |
| `--name`       | World name: lowercase letters, digits and dashes only (default `uat-<seed>`)                         |
| `--worlds-dir` | Target `worlds` folder (default: the Foundry data path)                                              |
| `--dry-run`    | Builds and prints the plan without writing anything                                                  |

`npm run testWorld:random -- --help` prints the same list.

## License

- **Source code** (`src/`, `styles/`, `utils/`, `tests/`): MIT — see [LICENSE](LICENSE).
- **Final Quest 8 game content** (compendiums, card illustrations, sounds, card
  titles and descriptions): all rights reserved — see
  [LICENSE-CONTENT](LICENSE-CONTENT).

You are free to use the Final Quest 8 content to play at your own table, and to
modify it for your own games. Redistributing it, repackaging it or selling it is
not permitted.

See [CREDITS](CREDITS) for the systems and modules this one builds on.
