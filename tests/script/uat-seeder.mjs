/**
 * Exécuté dans le contexte navigateur de Foundry (chargé dynamiquement par la
 * macro « Seed UAT » du template `uat-base`). Lit le plan `uat-seed.json`
 * écrit par `tests/script/generate-world.mjs` et l'exécute fidèlement : aucun
 * tirage ici (D-03, le hasard est déjà résolu côté Node), uniquement des
 * appels aux vraies API du moteur et du système dnd5e (D-05).
 *
 * Non testable hors Foundry (game, compendiums, hooks du module) : la
 * validation de ce fichier est l'UAT elle-même (checkpoint de la Task 3).
 */

// Clé du drapeau anti-double-seed (portée monde, posé sur la scène active).
// Sa valeur est la graine du plan déjà appliqué (D-03 : anti-double-seed).
const SEED_FLAG_KEY = "uatSeedApplied";

/**
 * Point d'entrée de la macro « Seed UAT ». Orchestrateur court : chaque étape
 * est une fonction nommée, ce qui permet à la trace `step` de désigner
 * précisément où un seed échoue. Ne tire RIEN : lit le plan et l'applique.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false] - Contourne la garde d'idempotence
 *   (usage console uniquement ; la macro de la hotbar appelle sans argument).
 *
 * @returns {Promise<void>}
 */
export async function seedUatWorld({force = false} = {}) {
    const scene = game.scenes.active;
    if (!scene) {
        ui.notifications.error("Seed UAT : aucune scène active dans ce monde.");
        return;
    }

    const existingSeed = scene.getFlag(FqCardEngineModule.moduleName, SEED_FLAG_KEY);
    if (existingSeed !== undefined && !force) {
        const message = `Ce monde a déjà été seedé (graine ${existingSeed}). Relancez `
            + "seedUatWorld({force: true}) depuis la console du navigateur pour passer outre.";
        ui.notifications.warn(message);
        console.warn(`fq-card-engine | uat-seeder: ${message}`);
        return;
    }

    let step = "lecture du plan";
    try {
        const plan = await foundry.utils.fetchJsonWithTimeout(`/worlds/${game.world.id}/uat-seed.json`);

        step = "résolution du user joueur";
        const playerUser = game.users.find(user => !user.isGM);
        if (!playerUser) {
            throw new Error("Aucun user joueur trouvé dans ce monde (attendu : UAT Player).");
        }

        step = "import du héros";
        const heroActor = await importHeroActor(plan.hero, playerUser);

        step = "picks et caractéristiques du héros";
        const pickNames = await applyHeroPicksAndAttributes(heroActor, plan.hero);

        step = "assignation du héros au joueur";
        await assignHeroToPlayer(heroActor, playerUser);

        step = "import de l'opposition";
        const enemyActors = await importOpponents(plan.enemies, "dnd5e.monsters");

        step = "import des alliés";
        const allyActors = await importOpponents(plan.allies, `${FqCardEngineModule.moduleName}.minions-fq8`);

        step = "scène (regions, tokens)";
        const refs = await setupScene(scene, plan, heroActor, enemyActors, allyActors);

        step = "combat";
        await startSeedCombat(scene, plan, refs);

        step = "journal récapitulatif";
        const journalEntry = await createRecapJournal(plan, pickNames);

        step = "notification finale";
        ui.notifications.info(
            `Seed UAT #${plan.seed} : ${plan.hero.name} niv.${plan.overrides.level}, `
            + `${plan.enemies.length} ennemi(s), ${plan.allies.length} allié(s), `
            + `motif « ${plan.overrides.placement} ». Récapitulatif : Journal « ${journalEntry.name} ».`
        );

        // Posée en tout dernier, après combat et Journal : un seed interrompu en
        // cours de route laisse donc le drapeau absent, et reste rejouable.
        await scene.setFlag(FqCardEngineModule.moduleName, SEED_FLAG_KEY, plan.seed);
    } catch (err) {
        ui.notifications.error(`Seed UAT interrompu à l'étape « ${step} » : ${err.message}`);
        console.error(`fq-card-engine | uat-seeder (étape: ${step})`, err);
    }
}

/**
 * Importe le héros depuis `starter-heroes` et porte son item de classe
 * principale au niveau du plan. Les classes secondaires (multi-classe) sont
 * ajoutées SANS jamais toucher à `system.details.originalClass` : la classe
 * principale reste celle de l'acteur importé, condition dont dépend
 * `isOriginalClass` (dnd5e) puis `updateDeckForUser` (D-05).
 *
 * @param {object} heroPlan          - La section `hero` du plan.
 * @param {string} heroPlan.sourceUuid - L'UUID de l'acteur starter à importer.
 * @param {Array<{slug: string, className: string, classUuid: string, level: number}>} heroPlan.classes
 * @param {object} playerUser        - Le user joueur qui doit posséder le héros.
 *
 * @returns {Promise<object>} L'acteur héros créé dans le monde.
 */
async function importHeroActor(heroPlan, playerUser) {
    const source = await fromUuid(heroPlan.sourceUuid);
    if (!source) {
        throw new Error(`Héros introuvable: ${heroPlan.sourceUuid}`);
    }

    const actorData = source.toObject();
    delete actorData._id;
    // Sans ownership explicite, Foundry ne rend propriétaire que le créateur (le MJ) :
    // le joueur ne contrôlerait pas son propre token et son conteneur de main resterait vide.
    actorData.ownership = {
        ...actorData.ownership,
        [playerUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    };

    const actor = await Actor.create(actorData);

    const [mainClassEntry, ...secondaryClassEntries] = heroPlan.classes;
    const mainClassItem = actor.items.find(item => item.type === "class");
    if (!mainClassItem) {
        throw new Error(`Item de classe introuvable sur le héros importé (${heroPlan.name}).`);
    }
    if (Number(mainClassItem.system.levels) !== Number(mainClassEntry.level)) {
        await mainClassItem.update({"system.levels": mainClassEntry.level});
    }

    for (const secondaryEntry of secondaryClassEntries) {
        const classSource = await fromUuid(secondaryEntry.classUuid);
        if (!classSource) {
            throw new Error(`Classe secondaire introuvable: ${secondaryEntry.classUuid}`);
        }
        const classData = classSource.toObject();
        delete classData._id;
        classData.system.levels = secondaryEntry.level;
        await actor.createEmbeddedDocuments("Item", [classData]);
    }

    return actor;
}

/**
 * Ajoute les items de stats tirés (`hero.picks`) en un seul appel, puis
 * applique les améliorations de caractéristiques et les points de vie du plan
 * en un unique `update` (caractéristiques et PV ensemble).
 *
 * @param {object} actor    - L'acteur héros (rendu par `importHeroActor`).
 * @param {object} heroPlan - La section `hero` du plan.
 *
 * @returns {Promise<Array<{name: string, level: number, slug: string}>>} Les picks,
 *   noms résolus, pour le Journal récapitulatif (aucun recalcul : juste une lecture).
 */
async function applyHeroPicksAndAttributes(actor, heroPlan) {
    const pickSources = await Promise.all(heroPlan.picks.map(pick => fromUuid(pick.uuid)));
    const pickItemsData = [];
    const pickNames = [];
    heroPlan.picks.forEach((pick, index) => {
        const pickSource = pickSources[index];
        if (!pickSource) {
            throw new Error(`Pick de stats introuvable: ${pick.uuid}`);
        }
        const data = pickSource.toObject();
        delete data._id;
        pickItemsData.push(data);
        pickNames.push({name: pickSource.name, level: pick.level, slug: pick.slug});
    });
    // Un seul appel : ajouter les picks un par un déclencherait une recalculation
    // du personnage (dnd5e) à chaque item créé.
    if (pickItemsData.length > 0) {
        await actor.createEmbeddedDocuments("Item", pickItemsData);
    }

    const abilityDelta = {};
    for (const asi of heroPlan.abilityScoreImprovements) {
        for (const [key, value] of Object.entries(asi.abilities)) {
            abilityDelta[key] = (abilityDelta[key] ?? 0) + value;
        }
    }

    const update = {
        "system.attributes.hp.max": heroPlan.hitPoints.max,
        "system.attributes.hp.value": heroPlan.hitPoints.max
    };
    for (const [key, delta] of Object.entries(abilityDelta)) {
        const current = Number(actor.system.abilities[key]?.value ?? 0);
        update[`system.abilities.${key}.value`] = Math.min(20, current + delta);
    }
    // Un unique update par acteur.
    await actor.update(update);

    return pickNames;
}

/**
 * Assigne le héros au user joueur puis construit ses piles de cartes. C'est le
 * SEUL geste du seeder concernant Deck/Hand/Pile/Spellbook (D-05) — le
 * précédent exact est la macro MJ `create-deck-hand-pile-for-all-players-gm`.
 *
 * @param {object} actor      - L'acteur héros.
 * @param {object} playerUser - Le user joueur du monde UAT.
 *
 * @returns {Promise<void>}
 */
async function assignHeroToPlayer(actor, playerUser) {
    await playerUser.update({character: actor.id});
    await FqCardEngineModule.updateDeckForUser(playerUser.id);
}


/**
 * Résout un acteur source par `uuid`, avec repli sur une recherche par nom
 * dans l'index du pack donné si l'`uuid` est absent (D-06).
 *
 * @param {?string} uuid  - L'UUID exact de l'acteur, si déjà résolu par le plan.
 * @param {string} name   - Le nom de l'acteur (repli).
 * @param {string} packId - L'identifiant du compendium (`<module>.<pack>`).
 *
 * @returns {Promise<object>} Le document acteur source (jamais créé dans le monde).
 */
async function resolveActorSource(uuid, name, packId) {
    let source = uuid ? await fromUuid(uuid) : null;

    if (!source) {
        const pack = game.packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find(e => e.name === name);
        if (!entry) {
            throw new Error(`Acteur introuvable dans ${packId}: ${name}`);
        }
        source = await pack.getDocument(entry._id);
    }

    return source;
}

/**
 * Importe une liste d'ennemis ou d'alliés depuis un pack SRD/FQ. Les monstres
 * SRD sont importés tels quels : aucune valeur FQ n'est ajustée (D-07, ils
 * héritent des valeurs initiales du schéma via `registerDataModels`).
 *
 * @param {Array<{name: string, uuid: ?string}>} entries - `plan.enemies` ou `plan.allies`.
 * @param {string} packId - L'identifiant du compendium source.
 *
 * @returns {Promise<object[]>} Les acteurs créés dans le monde, dans l'ordre de `entries`.
 */
async function importOpponents(entries, packId) {
    const actors = [];
    for (const entry of entries) {
        const source = await resolveActorSource(entry.uuid, entry.name, packId);
        const actorData = source.toObject();
        delete actorData._id;
        actors.push(await Actor.create(actorData));
    }
    return actors;
}

/**
 * Construit la donnée d'un token à créer, en convertissant les coordonnées de
 * grille du plan (cases) en pixels via les dimensions réelles de la scène —
 * la scène a un `padding`, donc la case (0,0) n'est PAS au pixel (0,0).
 *
 * @param {object} scene      - La scène Foundry active.
 * @param {object} actor      - L'acteur pour lequel construire le token.
 * @param {object} placement  - La section du plan portant `col`/`row` (et `width`/`height`).
 * @param {object} options
 * @param {number} options.disposition - La disposition du token (1 allié, -1 hostile).
 * @param {boolean} options.actorLink  - Vrai pour le héros seul (D-06 : ennemis/alliés non liés).
 *
 * @returns {object} La donnée de token, prête pour `scene.createEmbeddedDocuments`.
 */
function buildTokenData(scene, actor, placement, {disposition, actorLink}) {
    const {sceneX, sceneY} = scene.dimensions;
    const gridSize = scene.grid.size;

    const data = {
        ...actor.prototypeToken.toObject(),
        actorId: actor.id,
        actorLink,
        disposition,
        width: placement.width ?? 1,
        height: placement.height ?? 1,
        x: sceneX + (placement.col * gridSize),
        y: sceneY + (placement.row * gridSize)
    };
    delete data._id;
    return data;
}

/**
 * Construit la donnée d'une region rectangulaire à créer, même conversion
 * cases -> pixels que `buildTokenData`.
 *
 * @param {object} scene  - La scène Foundry active.
 * @param {object} region - Une entrée de `plan.regions`.
 *
 * @returns {object} La donnée de region, prête pour `scene.createEmbeddedDocuments`.
 */
function buildRegionData(scene, region) {
    const {sceneX, sceneY} = scene.dimensions;
    const gridSize = scene.grid.size;

    return {
        name: region.name,
        color: region.color,
        shapes: [{
            type: "rectangle",
            x: sceneX + (region.col * gridSize),
            y: sceneY + (region.row * gridSize),
            width: region.cols * gridSize,
            height: region.rows * gridSize
        }]
    };
}


/**
 * Pose les regions puis TOUS les tokens (héros, ennemis, alliés) en un seul appel
 * de `createEmbeddedDocuments`. La scène est déjà partagée en observation par le
 * template, le joueur n'a donc aucune permission à recevoir ici.
 *
 * @param {object} scene        - La scène Foundry active.
 * @param {object} plan         - Le plan complet.
 * @param {object} heroActor    - L'acteur héros créé.
 * @param {object[]} enemyActors - Les acteurs ennemis créés, dans l'ordre de `plan.enemies`.
 * @param {object[]} allyActors  - Les acteurs alliés créés, dans l'ordre de `plan.allies`.
 *
 * @returns {Promise<{heroToken: object, enemyTokens: object[], allyTokens: object[]}>}
 */
async function setupScene(scene, plan, heroActor, enemyActors, allyActors) {
    if (plan.regions.length > 0) {
        await scene.createEmbeddedDocuments("Region", plan.regions.map(region => buildRegionData(scene, region)));
    }

    const tokenDataList = [
        buildTokenData(scene, heroActor, plan.hero, {disposition: 1, actorLink: true}),
        ...enemyActors.map((actor, index) => buildTokenData(scene, actor, plan.enemies[index], {disposition: -1, actorLink: false})),
        ...allyActors.map((actor, index) => buildTokenData(scene, actor, plan.allies[index], {disposition: 1, actorLink: false}))
    ];
    const tokens = await scene.createEmbeddedDocuments("Token", tokenDataList);

    return {
        heroToken: tokens[0],
        enemyTokens: tokens.slice(1, 1 + enemyActors.length),
        allyTokens: tokens.slice(1 + enemyActors.length),
        heroActor,
        enemyActors,
        allyActors
    };
}

/**
 * Résout une référence de `combat.order` (`"hero"`, `"enemy:<i>"`, `"ally:<i>"`)
 * vers le couple token/acteur à passer à `createEmbeddedDocuments("Combatant")`.
 *
 * @param {string} ref  - La référence du plan.
 * @param {object} refs - Le résultat de `setupScene`.
 *
 * @returns {{tokenId: string, actorId: string}}
 */
function resolveCombatantRef(ref, refs) {
    if (ref === "hero") {
        return {tokenId: refs.heroToken.id, actorId: refs.heroActor.id};
    }
    const [kind, indexStr] = ref.split(":");
    const index = Number(indexStr);
    if (kind === "enemy") {
        return {tokenId: refs.enemyTokens[index].id, actorId: refs.enemyActors[index].id};
    }
    if (kind === "ally") {
        return {tokenId: refs.allyTokens[index].id, actorId: refs.allyActors[index].id};
    }
    throw new Error(`Référence de combattant inconnue dans le plan: "${ref}".`);
}

/**
 * Crée le combat sur la scène active, ses combattants avec l'initiative
 * explicite du plan (`combat.order`), puis démarre le combat au round 1 tour 0
 * (D-08 : aucun geste de milieu de combat — les hooks du module gèrent
 * cartes et ressources).
 *
 * @param {object} scene - La scène Foundry active.
 * @param {object} plan  - Le plan complet.
 * @param {object} refs  - Le résultat de `setupScene`.
 *
 * @returns {Promise<object>} Le combat créé.
 */
async function startSeedCombat(scene, plan, refs) {
    const combat = await Combat.create({scene: scene.id, active: true});

    const combatantsData = plan.combat.order.map(entry => ({
        ...resolveCombatantRef(entry.ref, refs),
        initiative: entry.initiative
    }));
    // Une initiative déjà renseignée n'est pas rejetée par le rollAll du hook
    // createCombatant (src/hook/combat.hook.js) : l'ordre déterministe du plan est conservé.
    await combat.createEmbeddedDocuments("Combatant", combatantsData);
    await combat.startCombat();
    await combat.update({round: plan.combat.round, turn: plan.combat.turn});

    return combat;
}


/**
 * Décrit une référence de `combat.order` par un nom lisible, pour le Journal.
 *
 * @param {string} ref            - La référence (`"hero"`, `"enemy:<i>"`, `"ally:<i>"`).
 * @param {object} plan           - Le plan complet.
 *
 * @returns {string} Le nom à afficher.
 */
function describeCombatantRef(ref, plan) {
    if (ref === "hero") return plan.hero.name;
    const [kind, indexStr] = ref.split(":");
    const index = Number(indexStr);
    return kind === "enemy" ? plan.enemies[index].name : plan.allies[index].name;
}

/**
 * Construit le contenu HTML de la page « Héros » : classes et niveaux, picks
 * de stats (noms résolus), améliorations de caractéristiques, points de vie,
 * variantes de decks. Aucune valeur n'est recalculée : tout vient du plan.
 *
 * @param {object} hero              - `plan.hero`.
 * @param {Array<{name: string, level: number, slug: string}>} pickNames - Rendu par
 *   `applyHeroPicksAndAttributes`.
 *
 * @returns {string} Le HTML de la page.
 */
function buildHeroPageHtml(hero, pickNames) {
    const classesHtml = hero.classes.map(c => `<li>${c.className} niveau ${c.level}</li>`).join("");
    const picksHtml = pickNames.length > 0
        ? pickNames.map(p => `<li>Niveau ${p.level} (${p.slug}) — ${p.name}</li>`).join("")
        : "<li>Aucun</li>";
    const asiHtml = hero.abilityScoreImprovements.length > 0
        ? hero.abilityScoreImprovements.map(asi => {
            const abilities = Object.entries(asi.abilities).map(([key, value]) => `${key.toUpperCase()} +${value}`).join(", ");
            return `<li>Niveau ${asi.level} (${asi.slug}) : ${abilities}</li>`;
        }).join("")
        : "<li>Aucune</li>";
    const variants = hero.deckVariants.patternVariants.join(", ") || "aucune";
    const suggested = hero.deckVariants.suggested ?? "aucune";

    return `<h2>Classes</h2><ul>${classesHtml}</ul>`
        + `<h2>Picks de stats</h2><ul>${picksHtml}</ul>`
        + `<h2>Améliorations de caractéristiques</h2><ul>${asiHtml}</ul>`
        + `<h2>Points de vie</h2><p>${hero.hitPoints.max} PV (base ${hero.hitPoints.base}, `
        + `${hero.hitPoints.rolls.length} jet(s) de dé de vie).</p>`
        + `<h2>Variantes de decks</h2><p>Disponibles : ${variants}. Suggérée : ${suggested}.</p>`;
}

/**
 * Construit le contenu HTML de la page « Opposition » : ennemis puis alliés,
 * nom, CR (le cas échéant), taille et case.
 *
 * @param {object[]} enemies - `plan.enemies`.
 * @param {object[]} allies  - `plan.allies`.
 *
 * @returns {string} Le HTML de la page.
 */
function buildOppositionPageHtml(enemies, allies) {
    const enemiesHtml = enemies.length > 0
        ? enemies.map(e => `<li>${e.name} (CR ${e.cr}, taille ${e.size}) — case (${e.col}, ${e.row})</li>`).join("")
        : "<li>Aucun</li>";
    const alliesHtml = allies.length > 0
        ? allies.map(a => `<li>${a.name} — case (${a.col}, ${a.row})</li>`).join("")
        : "<li>Aucun</li>";

    return `<h2>Ennemis</h2><ul>${enemiesHtml}</ul><h2>Alliés</h2><ul>${alliesHtml}</ul>`;
}

/**
 * Construit le contenu HTML de la page « Placement et initiative » : motif,
 * aire jouable et ordre d'initiative (`combat.order`, déjà trié par le plan).
 *
 * @param {object} plan - Le plan complet.
 *
 * @returns {string} Le HTML de la page.
 */
function buildPlacementAndInitiativePageHtml(plan) {
    const {placement, combat} = plan;
    const area = placement.area;
    const orderHtml = combat.order
        .map(entry => `<li>${describeCombatantRef(entry.ref, plan)} — initiative ${entry.initiative}</li>`)
        .join("");

    return `<h2>Placement</h2><p>Motif : ${placement.pattern}. `
        + `Aire jouable : colonnes ${area.col} à ${area.col + area.cols - 1}, `
        + `lignes ${area.row} à ${area.row + area.rows - 1}.</p>`
        + `<h2>Ordre d'initiative</h2><ol>${orderHtml}</ol>`;
}

/**
 * Crée le Journal récapitulatif du scénario, visible du MJ et du joueur.
 * Toutes les valeurs viennent du plan (résumé, régénération) ou d'une simple
 * lecture des picks déjà résolus (`pickNames`) — aucun recalcul (D-03).
 *
 * @param {object} plan - Le plan complet.
 * @param {Array<{name: string, level: number, slug: string}>} pickNames - Rendu par
 *   `applyHeroPicksAndAttributes`.
 *
 * @returns {Promise<object>} L'entrée de Journal créée.
 */
async function createRecapJournal(plan, pickNames) {
    const html = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;

    return JournalEntry.create({
        name: plan.journal.title,
        ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER},
        pages: [
            {name: "Résumé", type: "text", text: {format: html, content: `<p>${plan.journal.summary}</p>`}},
            {name: "Héros", type: "text", text: {format: html, content: buildHeroPageHtml(plan.hero, pickNames)}},
            {name: "Opposition", type: "text", text: {format: html, content: buildOppositionPageHtml(plan.enemies, plan.allies)}},
            {name: "Placement et initiative", type: "text", text: {format: html, content: buildPlacementAndInitiativePageHtml(plan)}},
            {name: "Régénération", type: "text", text: {format: html, content: `<pre>${plan.journal.regenerateCommand}</pre>`}}
        ]
    });
}
