/**
 * Rapport d'équilibrage des classes FQ (aide à la mise à jour de devNotes/CLASSES.md).
 *
 * Lit uniquement les paquets SOURCE (`packs/_source`) et produit, en markdown :
 * - les stats moyennes de chaque classe aux niveaux 1 / 6 / 12 ;
 * - la vue d'ensemble des cartes (niveaux, coûts, réactives, zèle, exemplaires) ;
 * - les caractéristiques citées par les cartes ;
 * - le rendement des cartes (dégâts / soins moyens par PA), base de la grille de coûts.
 *
 * Usage :
 *   npm run report:classes                      → rapport sur la sortie standard
 *   npm run report:classes -- --out rapport.md  → rapport écrit dans un fichier
 *   npm run report:classes -- --check           → contrôle des cibles de la passe (code de sortie 1 si écart)
 *
 * Les moyennes sont des espérances, pas des mesures en partie : voir la section
 * « Hypothèses » du rapport.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "packs", "_source");
const DECKS_DIR = path.join(SOURCE, "decks-pattern-fq8");

/** Classes suivies, dans l'ordre de CLASSES.md, avec leur libellé. */
const CLASSES = [
    ["monk", "Moine"], ["guardian", "Gardien"], ["white-mage", "Mage Blanc"],
    ["elementalist", "Élémentaliste"], ["trapper", "Trapper"], ["witch", "Sorcière"],
    ["illusionist", "Illusionniste"], ["fencing-master", "Maître d'Armes"], ["runic-warrior", "Guerrier Runique"],
];

/** Classes hors périmètre des cibles de la passe (structure particulière). */
const TARGET_EXEMPT = new Set(["runic-warrior"]);

/**
 * Cibles de la passe de rééquilibrage (contrôlées par `--check`).
 * `copies` : fourchette d'exemplaires débloqués par niveau, à renseigner à l'étape 4
 * (null = pas encore de cible).
 */
const TARGETS = {
    distinct: [30, 40],
    maxLevel: 12,
    copies: {1: null, 6: null, 12: null},
};

const LEVELS = [1, 6, 12];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS = {str: "FOR", dex: "DEX", con: "CON", int: "INT", wis: "SAG", cha: "CHA"};
/** Dé moyen retenu pour `@wpnM` / `@wpnR` (arme à d6). */
const WEAPON_AVERAGE = 3.5;

/** Armures de départ connues (uuid dnd5e → [libellé, CA de base, ajoute la DEX, bonus]). */
const ARMORS = {
    "Compendium.dnd5e.equipment24.Item.phbarmLeatherArm": ["cuir", 11, true],
    "Compendium.dnd5e.equipment24.Item.phbarmChainMail0": ["cotte de mailles", 16, false],
    "Compendium.dnd5e.equipment24.Item.phbarmShield0000": ["bouclier", 2, false],
};

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const FR = readJson(path.join(ROOT, "lang", "fr.json"));
const title = card => FR[card.name] ?? card.name;
const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
const signed = value => (value >= 0 ? "+" : "") + value;
const mod = score => Math.floor((score - 10) / 2);

/* ------------------------------------------------------------------ */
/* Stats de classe                                                     */
/* ------------------------------------------------------------------ */

/** Les objets de stats indexés par _id, avec leurs changements agrégés (clé → valeur). */
function loadStatItems() {
    const items = new Map();
    const dir = path.join(SOURCE, "classes-stats-fq8");
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
        const item = readJson(path.join(dir, file));
        const changes = {};
        for (const effect of item.effects ?? []) {
            for (const change of effect.system?.changes ?? effect.changes ?? []) {
                changes[change.key] = (changes[change.key] ?? 0) + Number(change.value);
            }
        }
        items.set(item._id, {name: item.name, file, changes});
    }
    return items;
}

const idFromUuid = uuid => String(uuid).split(".").pop();

/** Valeurs de base d'un personnage, lues sur le starter hero de la classe. */
function starterBase(classKey) {
    const hero = readJson(path.join(SOURCE, "starter-heroes", `${classKey}.json`));
    const fq = hero.system.fq;
    return {
        "system.fq.action.max": Number(fq.action?.max ?? 0),
        "system.fq.mana.max": Number(fq.mana?.max ?? 0),
        "system.fq.zeal.init": Number(fq.zeal?.init ?? 0),
        "system.fq.attributes.critical": Number(fq.attributes?.critical ?? 0),
        "system.fq.attributes.evasion": Number(fq.attributes?.evasion ?? 0),
        "system.fq.cards.hand": Number(fq.cards?.hand ?? 0),
        "system.fq.cards.pick": Number(fq.cards?.pick ?? 0),
        "system.attributes.movement.speeds.walk": Number(hero.system.attributes.movement?.walk ?? 0),
        hpBonus: Number(hero.system.attributes.hp?.bonuses?.overall ?? 0),
        abilities: Object.fromEntries(ABILITIES.map(a => [a, Number(hero.system.abilities[a]?.value ?? 10)])),
    };
}

/** Lignes FQ du tableau de stats : [libellé, clé de changement, diviseur]. */
const FQ_ROWS = [
    ["Points d'action", "system.fq.action.max", 1],
    ["Mana", "system.fq.mana.max", 1],
    ["Zèle initial", "system.fq.zeal.init", 1],
    ["Critique", "system.fq.attributes.critical", 1],
    ["Esquive", "system.fq.attributes.evasion", 1],
    ["Main (début de combat)", "system.fq.cards.hand", 1],
    ["Pioche (par tour)", "system.fq.cards.pick", 1],
    ["Déplacement (cases)", "system.attributes.movement.speeds.walk", 5],
];

/** Calcule les stats moyennes d'une classe pour chaque niveau de 1 à 12. */
function classProfile(classKey, statItems) {
    const cls = readJson(path.join(SOURCE, "classes-fq8", `${classKey}.json`));
    const advancement = cls.system.advancement ?? [];
    const hd = Number(String(cls.system.hd?.denomination ?? "d0").slice(1));
    const primary = cls.system.primaryAbility?.value ?? [];
    const base = starterBase(classKey);

    const grants = advancement.filter(a => a.type === "ItemGrant" && Number(a.level) === 1)
        .flatMap(a => a.configuration?.items ?? []).map(i => i.uuid);
    const start = {};
    for (const uuid of grants) {
        const item = statItems.get(idFromUuid(uuid));
        for (const [key, value] of Object.entries(item?.changes ?? {})) {
            start[key] = (start[key] ?? 0) + value;
        }
    }
    const pools = advancement.filter(a => a.type === "ItemChoice").map(a => ({
        choices: a.configuration?.choices ?? {},
        items: (a.configuration?.pool ?? []).map(p => statItems.get(idFromUuid(p.uuid))).filter(Boolean),
    }));
    const asiLevels = advancement.filter(a => a.type === "AbilityScoreImprovement")
        .map(a => Number(a.level)).sort((a, b) => a - b);
    const armors = grants.map(uuid => ARMORS[uuid]).filter(Boolean);

    const budgetKeys = FQ_ROWS.map(([, key]) => key);
    const budget = budgetKeys.reduce((sum, key) => sum + (start[key] ?? 0) / (key.includes("walk") ? 5 : 1), 0);

    const byLevel = {};
    for (let level = 1; level <= 12; level++) {
        const fq = {};
        let choices = 0;
        for (const key of budgetKeys) {
            fq[key] = base[key] + (start[key] ?? 0);
        }
        for (const pool of pools) {
            const count = Object.entries(pool.choices)
                .filter(([lvl]) => Number(lvl) <= level)
                .reduce((sum, [, value]) => sum + Number(value.count ?? 0), 0);
            choices += count;
            if (!pool.items.length) continue;
            for (const item of pool.items) {
                for (const [key, value] of Object.entries(item.changes)) {
                    fq[key] = (fq[key] ?? 0) + value * count / pool.items.length;
                }
            }
        }

        const abilities = {};
        for (const a of ABILITIES) {
            abilities[a] = base.abilities[a] + (start[`system.abilities.${a}.value`] ?? 0);
        }
        let turn = 0;
        for (let i = asiLevels.filter(l => l <= level).length; i > 0; i--) {
            for (let point = 0; point < 2; point++) {
                const order = [primary[turn % 2], primary[(turn + 1) % 2], "con", "dex", ...ABILITIES].filter(Boolean);
                turn++;
                const target = order.find(a => abilities[a] < 20);
                if (target) abilities[target]++;
            }
        }

        const conMod = mod(abilities.con);
        const hp = base.hpBonus + hd + (level - 1) * (hd / 2 + 1) + level * conMod;
        const proficiency = level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
        let ac = armors.length ? 0 : 10 + mod(abilities.dex);
        for (const [, value, addDex] of armors) {
            ac += value + (addDex ? mod(abilities.dex) : 0);
        }
        const attack = proficiency + Math.max(...primary.map(a => mod(abilities[a])));
        byLevel[level] = {fq, choices, abilities, hp, proficiency, ac, attack};
    }
    return {cls, hd, primary, start, budget, byLevel, armors};
}

/* ------------------------------------------------------------------ */
/* Cartes                                                              */
/* ------------------------------------------------------------------ */

/** Nombre si la valeur est un littéral numérique, sinon null (formule, X…). */
function literal(value) {
    const text = String(value ?? "").replace(/\s/g, "");
    return /^[+-]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/**
 * Valeur moyenne d'une formule de dégâts/soins, ou null si elle dépend d'une
 * variable de jeu (X, Y, SCRIPT…).
 *
 * @param {string} formula   - La formule de la carte.
 * @param {object} abilities - Les scores de caractéristique à utiliser.
 *
 * @returns {number|null} La moyenne.
 */
export function averageFormula(formula, abilities) {
    let expr = String(formula ?? "").trim();
    if (!expr || /XXX|YYY|SCRIPT/.test(expr)) return null;
    expr = expr.replace(/\[[^\]]*]/g, "")
        .replace(/@wpn[MR]/g, String(WEAPON_AVERAGE))
        .replace(/@bonus\.\w+/g, "0");
    for (const a of ABILITIES) {
        expr = expr.replace(new RegExp(`@${a}\\b`, "g"), `(${mod(abilities[a])})`);
    }
    if (/@/.test(expr)) return null;
    const fns = ["ceil", "floor", "max", "min", "round", "abs"];
    const evaluate = text => Function(...fns, `return (${text});`)(...fns.map(f => Math[f]));
    try {
        for (let guard = 0; guard < 10 && /(?<![a-z])\d*d\(/.test(expr); guard++) {
            expr = expr.replace(/(?<![a-z])(\d*)d\(([^()]+)\)/g,
                (_, n, size) => `(${n || 1}*(${Math.max(1, evaluate(size))}+1)/2)`);
        }
        expr = expr.replace(/(?<![a-z])(\d*)d(\d+)/g, (_, n, size) => `(${n || 1}*(${size}+1)/2)`);
        const value = evaluate(expr);
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

/** Les cartes du deck de base d'une classe (vide si le deck n'existe pas). */
function baseCards(classKey) {
    const file = path.join(DECKS_DIR, `${classKey}-base.json`);
    return fs.existsSync(file) ? readJson(file).cards ?? [] : [];
}

/** Les cartes générées d'une classe (vide si le deck n'existe pas). */
function generatedCards(classKey) {
    const file = path.join(DECKS_DIR, `${classKey}-generated.json`);
    return fs.existsSync(file) ? readJson(file).cards ?? [] : [];
}

const levelOf = card => Number(card.system?.fq?.level ?? NaN);
const copiesOf = card => Number(card.system?.fq?.maxSameCard) || 0;

/** Indicateurs de cartes d'une classe. */
function cardProfile(classKey, profile) {
    const cards = baseCards(classKey);
    const perLevel = {};
    const tags = {reactive: 0, zealGain: 0, zealCost: 0, innate: 0};
    const costs = [];
    const abilityUse = {};
    const hitUse = {};
    const yields = [];
    const outOfRange = [];

    for (const card of cards) {
        const level = levelOf(card);
        const fq = card.system?.fq ?? {};
        const choices = fq.choices ?? [];
        // Le niveau 0 n'existe plus : une carte qui en porterait un est hors
        // campagne au même titre qu'une N13 oubliée, et doit se voir.
        const bucket = level >= 1 && level <= 12 ? level : "hors";
        perLevel[bucket] ??= {distinct: 0, copies: 0};
        perLevel[bucket].distinct++;
        perLevel[bucket].copies += copiesOf(card);
        if (bucket === "hors") outOfRange.push(`${title(card)} (N${level})`);

        if (fq.isInnate) tags.innate++;
        if (choices.some(c => c.reactive)) tags.reactive++;
        const zeal = choices.map(c => String(c.zeal ?? "").replace(/\s/g, ""));
        if (zeal.some(z => z && !z.startsWith("-") && z !== "0")) tags.zealGain++;
        if (zeal.some(z => z.startsWith("-"))) tags.zealCost++;

        const text = JSON.stringify(choices);
        for (const a of ABILITIES) {
            if (text.includes(`@${a}`)) abilityUse[a] = (abilityUse[a] ?? 0) + 1;
        }
        if (/@wpn[MR]/.test(text)) abilityUse.wpn = (abilityUse.wpn ?? 0) + 1;
        for (const choice of choices) {
            if (!choice.hitType || choice.hitType === "none") continue;
            const source = choice.hitSource === "ability"
                ? ABILITY_LABELS[choice.hitAbility || choice.saveAbility] ?? "?"
                : "arme";
            hitUse[source] = (hitUse[source] ?? 0) + 1;
        }

        if (bucket === "hors") continue;
        const cost = literal(choices[0]?.action);
        if (cost !== null) costs.push(-cost);
        const abilities = profile.byLevel[Math.max(1, level)].abilities;
        for (const choice of choices) {
            const pa = literal(choice.action);
            if (pa === null || pa >= 0) continue;
            const damage = averageFormula(choice.damage, abilities);
            const heal = averageFormula(choice.heal, abilities);
            if (damage === null && heal === null) continue;
            yields.push({level, pa: -pa, damage, heal, name: card.name});
        }
    }

    const unlocked = limit => Object.entries(perLevel)
        .filter(([lvl]) => lvl !== "hors" && Number(lvl) <= limit)
        .reduce((acc, [, v]) => ({distinct: acc.distinct + v.distinct, copies: acc.copies + v.copies}),
            {distinct: 0, copies: 0});
    const generated = generatedCards(classKey);

    return {
        cards, perLevel, tags, costs, abilityUse, hitUse, yields, outOfRange, unlocked,
        generated: {distinct: generated.length, copies: generated.reduce((s, c) => s + copiesOf(c), 0)},
        costAverage: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
        cheap: costs.filter(c => c > 0 && c <= 4).length,
    };
}

const median = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

function table(headers, rows) {
    return [
        `| ${headers.join(" | ")} |`,
        `|${headers.map(() => "---").join("|")}|`,
        ...rows.map(row => `| ${row.join(" | ")} |`),
    ].join("\n");
}

function render(data) {
    const labels = data.map(d => d.label);
    const out = [];
    const perLevel = fn => data.map(d => LEVELS.map(level => fn(d, level)).join(" / "));

    out.push(`# Rapport des classes FQ (${new Date().toISOString().slice(0, 10)})`);

    out.push("\n## Stats moyennes par classe (N1 / N6 / N12)\n");
    const rows = [];
    rows.push(["Budget Start stats", ...data.map(d => fmt(d.profile.budget))]);
    rows.push(["Choix de stats cumulés", ...perLevel((d, l) => d.profile.byLevel[l].choices)]);
    for (const [label, key, divisor] of FQ_ROWS) {
        rows.push([label, ...perLevel((d, l) => fmt((d.profile.byLevel[l].fq[key] ?? 0) / divisor))]);
    }
    rows.push(["Dé de vie", ...data.map(d => `d${d.profile.hd}`)]);
    rows.push(["PV moyens", ...perLevel((d, l) => fmt(d.profile.byLevel[l].hp))]);
    rows.push(["Caracs primaires", ...data.map(d => d.profile.primary.map(a => ABILITY_LABELS[a]).join(" + "))]);
    for (const a of ABILITIES) {
        rows.push([ABILITY_LABELS[a], ...perLevel((d, l) => {
            const score = d.profile.byLevel[l].abilities[a];
            return `${score}(${signed(mod(score))})`;
        })]);
    }
    rows.push(["Maîtrise", ...perLevel((d, l) => signed(d.profile.byLevel[l].proficiency))]);
    rows.push(["Bonus d'attaque (meilleure carac primaire)", ...perLevel((d, l) => signed(d.profile.byLevel[l].attack))]);
    rows.push(["CA (équipement de départ)", ...perLevel((d, l) => d.profile.byLevel[l].ac)]);
    rows.push(["Cartes débloquées (distinctes/exemplaires)",
        ...perLevel((d, l) => `${d.cards.unlocked(l).distinct}/${d.cards.unlocked(l).copies}`)]);
    out.push(table(["Stat", ...labels], rows));
    out.push(`
**Hypothèses** : base lue sur le starter hero de la classe, plus ses Start stats ; choix de stats
tirés proportionnellement à la composition de chaque pool de la classe (espérance) ; ASI répartis
alternativement sur les deux caracs primaires (plafond 20) ; PV = dé max au N1 puis moyenne dnd5e
(d/2 + 1) + mod. CON par niveau + bonus fixe du starter hero ; CA avec l'équipement de départ.`);

    out.push("\n## Vue d'ensemble des cartes (decks de base)\n");
    const levelHeaders = Array.from({length: 12}, (_, i) => `N${i + 1}`);
    out.push(table(
        ["Classe", ...levelHeaders, "Hors N1‑12", "Plancher deck", "Total distinctes / exemplaires", "Générées (dist./ex.)",
            "Coût moyen PA", "Cartes 1‑4 PA", "Réactives", "Zèle + / −", "Innées"],
        data.map(d => {
            const c = d.cards;
            const cell = key => c.perLevel[key]?.distinct ?? 0;
            return [d.label, ...levelHeaders.map((_, i) => cell(i + 1)), cell("hors"),
                `${c.perLevel[1]?.copies ?? 0}`,
                `${c.cards.length} / ${c.cards.reduce((s, x) => s + copiesOf(x), 0)}`,
                `${c.generated.distinct} / ${c.generated.copies}`,
                c.costAverage === null ? "–" : fmt(c.costAverage), c.cheap, c.tags.reactive,
                `${c.tags.zealGain} / ${c.tags.zealCost}`, c.tags.innate];
        })));

    out.push("\n## Exemplaires débloqués (N1 / N6 / N12, cartes générées exclues)\n");
    out.push(table(labels, [perLevel((d, l) => d.cards.unlocked(l).copies)]));

    out.push("\n## Caracs utilisées par les cartes\n");
    out.push(table(["Classe", "Primaires", ...ABILITIES.map(a => ABILITY_LABELS[a]), "Arme", "Jets (toucher/sauvegarde)"],
        data.map(d => [d.label, d.profile.primary.map(a => ABILITY_LABELS[a]).join(" + "),
            ...ABILITIES.map(a => d.cards.abilityUse[a] ?? "–"), d.cards.abilityUse.wpn ?? "–",
            Object.entries(d.cards.hitUse).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "–"])));

    out.push("\n## Rendement des cartes (médiane par PA, cartes N1‑N12 à coût et formule fixes)\n");
    const bands = [["N1‑3", 1, 3], ["N4‑7", 4, 7], ["N8‑12", 8, 12]];
    const bandCell = (yields, field, min, max) => {
        const values = yields.filter(y => y.level >= min && y.level <= max && y[field] !== null)
            .map(y => y[field] / y.pa);
        return values.length ? `${fmt(median(values))} (${values.length})` : "–";
    };
    const all = data.flatMap(d => d.cards.yields);
    out.push(table(["Classe", ...bands.map(([b]) => `Dégâts/PA ${b}`), ...bands.map(([b]) => `Soins/PA ${b}`)],
        [...data.map(d => [d.label,
            ...bands.map(([, min, max]) => bandCell(d.cards.yields, "damage", min, max)),
            ...bands.map(([, min, max]) => bandCell(d.cards.yields, "heal", min, max))]),
        ["**Toutes classes**",
            ...bands.map(([, min, max]) => bandCell(all, "damage", min, max)),
            ...bands.map(([, min, max]) => bandCell(all, "heal", min, max))]]));
    out.push(`
Entre parenthèses : nombre de choix de cartes mesurés. Caracs = moyenne de la classe au niveau de la carte,
arme = ${fmt(WEAPON_AVERAGE)} (d6). Critique, esquive, cibles multiples et effets (DoT, états) ne sont pas comptés.`);

    return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Contrôle des cibles                                                 */
/* ------------------------------------------------------------------ */

function check(data) {
    const problems = [];
    for (const d of data) {
        if (TARGET_EXEMPT.has(d.key)) continue;
        const unlocked = d.cards.unlocked(TARGETS.maxLevel);
        const [min, max] = TARGETS.distinct;
        if (unlocked.distinct < min || unlocked.distinct > max) {
            problems.push(`${d.label} : ${unlocked.distinct} cartes distinctes N1‑N12 (cible ${min}‑${max})`);
        }
        if (d.cards.outOfRange.length) {
            problems.push(`${d.label} : ${d.cards.outOfRange.length} carte(s) hors N1‑N12 → ${d.cards.outOfRange.join(", ")}`);
        }
        for (const level of LEVELS) {
            const target = TARGETS.copies[level];
            if (!target) continue;
            const copies = d.cards.unlocked(level).copies;
            if (copies < target[0] || copies > target[1]) {
                problems.push(`${d.label} : ${copies} exemplaires au N${level} (cible ${target[0]}‑${target[1]})`);
            }
        }
    }
    return problems;
}

/* ------------------------------------------------------------------ */

function main() {
    const args = process.argv.slice(2);
    const statItems = loadStatItems();
    const data = CLASSES.map(([key, label]) => {
        const profile = classProfile(key, statItems);
        return {key, label, profile, cards: cardProfile(key, profile)};
    });

    if (args.includes("--check")) {
        const problems = check(data);
        if (problems.length) {
            console.log(`Écarts aux cibles de la passe (${problems.length}) :\n- ${problems.join("\n- ")}`);
            process.exitCode = 1;
        } else {
            console.log("Toutes les classes respectent les cibles de la passe.");
        }
        return;
    }

    const report = render(data);
    const outIndex = args.indexOf("--out");
    if (outIndex >= 0 && args[outIndex + 1]) {
        fs.writeFileSync(path.resolve(args[outIndex + 1]), report + "\n");
        console.log(`Rapport écrit dans ${args[outIndex + 1]}`);
    } else {
        console.log(report);
    }
}

main();
