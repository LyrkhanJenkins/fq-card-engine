import {describe, expect, test} from "vitest";
import fs from "fs";
import path from "path";
import {FORMULA_FIELDS} from "../../src/domain/interface/card-svg/formula-display.js";

/**
 * Garde de non-régression sur l'arithmétique en dur dans les descriptions
 * (`lang/fr.json`/`lang/en.json`, clés `FQCARDDESCRIPTION.*`, T-20-06).
 *
 * POURQUOI cette garde existe : une formule écrite littéralement dans le
 * texte d'une description ne passe JAMAIS par `FormulaDisplay` (le moteur de
 * repli local posé par le plan 20-01) — seuls les champs de carte
 * (`system.fq.choices[i][champ]`), interpolés via `{i_champ}` dans
 * `DisplayCard.getDescriptionFromCard`, en bénéficient. Une formule textuelle
 * n'est donc ni repliée ni pastillée : `transformForDescription` se contente
 * de remplacer chaque jeton `@ability` par son modificateur numérique, sans
 * jamais recalculer l'expression autour. Dès qu'un modificateur vaut 0, le
 * résultat affiché à l'écran est une arithmétique brute et absurde
 * (`10 + 0`, `0/3`, `1d(2*0)`) — exactement le défaut que le plan 20-06
 * supprime en migrant ces formules vers des interpolations `{i_champ}` (qui
 * héritent du repli gratuitement) ou vers une reformulation en français qui
 * nomme la grandeur sans la calculer.
 *
 * ⚠️ AUCUNE sélection par nom de carte hors des deux cas explicitement
 * prévus par le PLAN (une modification temporaire, annulée ensuite, pour
 * prouver que la garde détecte une régression) : le corpus est balayé par
 * clé (toutes les `FQCARDDESCRIPTION.*` de `lang/fr.json`/`lang/en.json`) et
 * par glob de répertoire (`packs/_source/decks-pattern-fq8`).
 *
 * Les decks d'ARCHIVE (`decks-historique-fq8`) sont hors garde : leurs cartes sont
 * figées dans un format antérieur et ne seront pas corrigées. Une clé que seules
 * les archives portent est donc ignorée plutôt que signalée — le cas s'est
 * généralisé depuis que les classes étendues vivent dans un autre module, leurs
 * cartes actives étant parties en laissant l'archive derrière elles.
 */

const LANG_DIR = path.join(process.cwd(), "lang");
const SOURCE_DIR = path.join(process.cwd(), "packs", "_source");
const DECKS_DIR = path.join(SOURCE_DIR, "decks-pattern-fq8");
const ARCHIVE_DIR = path.join(SOURCE_DIR, "decks-historique-fq8");

const fr = JSON.parse(fs.readFileSync(path.join(LANG_DIR, "fr.json"), "utf-8"));
const en = JSON.parse(fs.readFileSync(path.join(LANG_DIR, "en.json"), "utf-8"));

/**
 * Repère une formule arithmétique APRÈS retrait des placeholders `{n_champ}`
 * d'une description : un jeton `@ability` adjacent (espaces tolérées) à un
 * opérateur `+`/`-`/`*`/`/`, ou une notation de dé fonctionnelle `d(` (taille
 * de dé calculée, ex. `1d(2*@wis)`) précédée d'un caractère non alphanumérique
 * (ou du début de chaîne) — ce qui exclut volontairement `1d(` collé à un
 * chiffre (`1d(@dex)`), forme que `RootedShot`/`Concealment` montraient avant
 * migration et qui a été traitée par réécriture plutôt que par ce garde-fou
 * automatique (cf. PLAN, décision documentée dans le SUMMARY).
 */
const INLINE_ARITHMETIC_PATTERN = /@\w+\s*[-+*/]|[-+*/]\s*@\w+|\bd\(/;

const PLACEHOLDER_PATTERN = /\{(\d+)_(\w+)\}/g;

/**
 * Clés `FQCARDDESCRIPTION.*` dont le jeton de caractéristique SEUL (sans
 * opérateur, sans redite de champ de carte) est volontairement conservé tel
 * quel dans le texte (seau « laisser » du triage, plan 20-06). Chaque entrée
 * porte la raison de sa présence pour qu'un ajout futur soit un acte
 * conscient plutôt qu'un fourre-tout silencieux.
 */
const SIMPLE_TOKEN_ALLOWLIST = {
    "FQCARDDESCRIPTION.AdjustedShot": "bonus de critique — jeton seul",
    "FQCARDDESCRIPTION.AgilityInflux": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.Ambush": "bonus de dégâts — jeton seul",
    "FQCARDDESCRIPTION.ArmorReinforcement": "durée — jeton seul",
    "FQCARDDESCRIPTION.BackflipStrike": "distance de recul, distincte des dégâts déjà interpolés ({0_damage}) — jeton seul",
    "FQCARDDESCRIPTION.Backstab": "taille de dé symbolique (1d@dex) sans parenthèses — hors portée de l’INLINE_ARITHMETIC_PATTERN, laissé tel quel par le PLAN",
    "FQCARDDESCRIPTION.BerzerkerStance": "durée — jeton seul",
    "FQCARDDESCRIPTION.BlackPlague": "nombre de réutilisations — jeton seul",
    "FQCARDDESCRIPTION.BurningHand": "probabilité de brûlure (1d8 de chance) sans jeton de caractéristique adjacent à un opérateur — jeton seul",
    "FQCARDDESCRIPTION.CommunicatingVessels": "nombre de réutilisations — jeton seul",
    "FQCARDDESCRIPTION.Curse": "dégâts par tour — jeton seul",
    "FQCARDDESCRIPTION.DaggerCloud": "durée — jeton seul (le X+1d8 de dégâts n’est pas un jeton de caractéristique)",
    "FQCARDDESCRIPTION.DamagePropagation": "dégâts par tour — jeton seul",
    "FQCARDDESCRIPTION.ElementalMagic": "probabilité d’effet (1d3 de chance) sans jeton de caractéristique adjacent — jeton seul",
    "FQCARDDESCRIPTION.Exorcism": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.Fog": "perte de critique/esquive — jetons seuls",
    "FQCARDDESCRIPTION.FrenziedInspiration": "bonus de dégâts — jeton seul",
    "FQCARDDESCRIPTION.GoodAndEvil": "transfert de points de vie — jetons seuls (@con/@int, choix OU, sans opérateur)",
    "FQCARDDESCRIPTION.GreenShadowBolt": "dégâts déjà interpolés ({0_damage}) + dé nu 1d6 sans jeton de caractéristique — jeton seul",
    "FQCARDDESCRIPTION.Hemorrhage": "dégâts de saignement — jeton seul",
    "FQCARDDESCRIPTION.InstantCurse": "dégâts par tour — jeton seul",
    "FQCARDDESCRIPTION.ManaDrain": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.ManaInflux": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.ManaInfusion": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.ManaShield": "points de vie récupérés — jeton seul (redite bare d’un champ, sans opérateur)",
    "FQCARDDESCRIPTION.ManaSurge": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.MirrorImages": "bonus d’esquive — jeton seul",
    "FQCARDDESCRIPTION.Necromancy": "bonus de portée — jeton seul",
    "FQCARDDESCRIPTION.PhantomBlade": "bonus de critique — jeton seul",
    "FQCARDDESCRIPTION.PoisonedShot": "dégâts par tour / bonus de portée — jetons seuls",
    "FQCARDDESCRIPTION.PreciseShot": "bonus de portée — jeton seul",
    "FQCARDDESCRIPTION.ShadowChanneling": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.ShadowExplosion": "taille de zone — jeton seul",
    "FQCARDDESCRIPTION.SkeletonSorcerer": "points de vie/dégâts/déplacement — jetons seuls",
    "FQCARDDESCRIPTION.SteelRain": "rayon de la zone — jeton seul",
    "FQCARDDESCRIPTION.Uppercut": "coût en points d’action — jeton seul",
    "FQCARDDESCRIPTION.Vortex": "portée — jeton seul",
    "FQCARDDESCRIPTION.WeakPointStudy": "bonus de dégâts — jeton seul",
};

/**
/**
 * Les fichiers de deck d'un paquet source, triés. Rend une liste vide si le
 * paquet n'existe pas : un module peut ne pas embarquer d'archives.
 *
 * @param {string} dir - Le dossier du paquet.
 *
 * @returns {string[]} Les chemins des fichiers de deck.
 */
function deckFilesIn(dir) {
    return fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => path.join(dir, f))
        : [];
}

/**
 * Les clés de description que portent les cartes d'ARCHIVE. Servent à distinguer
 * une clé orpheline (à signaler) d'une clé dont seule l'archive témoigne (à
 * ignorer).
 *
 * @returns {Set<string>} Les clés portées par les archives.
 */
function archivedDescriptionKeys() {
    const keys = new Set();
    for (const file of deckFilesIn(ARCHIVE_DIR)) {
        const deck = JSON.parse(fs.readFileSync(file, "utf-8"));
        for (const card of deck.cards ?? []) {
            const text = card.faces?.[0]?.text;
            if (text?.startsWith("FQCARDDESCRIPTION.")) {
                keys.add(text);
            }
        }
    }
    return keys;
}

/**
 * Charge toutes les cartes de `packs/_source/decks-pattern-fq8` et construit
 * une table clé de description (`faces[0].text`, ex. `FQCARDDESCRIPTION.Foo`)
 * → liste des choix (`system.fq.choices[]`) de chaque carte qui la porte
 * (plusieurs cartes/exemplaires peuvent partager la même clé de texte).
 *
 * @returns {Map<string, Array<object>>} description → tableau de `choices[]`.
 */
function collectDescriptionChoices() {
    const map = new Map();
    const files = deckFilesIn(DECKS_DIR);
    for (const file of files) {
        const deck = JSON.parse(fs.readFileSync(file, "utf-8"));
        for (const card of deck.cards ?? []) {
            const text = card.faces?.[0]?.text;
            if (!text || !text.startsWith("FQCARDDESCRIPTION.")) continue;
            const choices = card.system?.fq?.choices ?? [];
            if (!map.has(text)) map.set(text, []);
            map.get(text).push(choices);
        }
    }
    return map;
}

describe("Garde de non-régression : arithmétique en dur dans les descriptions (T-20-06)", () => {
    const descriptionKeys = Object.keys(fr).filter(k => k.startsWith("FQCARDDESCRIPTION."));

    test("le balayage du corpus inspecte au moins 200 clés de description (garde-fou anti-glob-vide)", () => {
        expect(descriptionKeys.length).toBeGreaterThanOrEqual(200);
    });

    test("aucune valeur FQCARDDESCRIPTION.* de fr.json ne contient d'arithmétique hors placeholder", () => {
        const offenders = descriptionKeys
            .filter(k => INLINE_ARITHMETIC_PATTERN.test(fr[k].replace(PLACEHOLDER_PATTERN, "")))
            .map(k => `${k} = "${fr[k]}"`);
        expect(offenders).toEqual([]);
    });

    test("aucune valeur FQCARDDESCRIPTION.* de en.json ne contient d'arithmétique hors placeholder", () => {
        const offenders = descriptionKeys
            .filter(k => typeof en[k] === "string" && INLINE_ARITHMETIC_PATTERN.test(en[k].replace(PLACEHOLDER_PATTERN, "")))
            .map(k => `${k} = "${en[k]}"`);
        expect(offenders).toEqual([]);
    });

    test("réintroduire une formule en dur (TamedWolf) fait échouer la garde", () => {
        const regressed = "Summons a wolf... 10 + @cha PV";
        expect(INLINE_ARITHMETIC_PATTERN.test(regressed.replace(PLACEHOLDER_PATTERN, ""))).toBe(true);
    });

    describe("chaque placeholder {i_champ} désigne un champ de carte existant", () => {
        const descriptionChoices = collectDescriptionChoices();
        const archivedOnly = archivedDescriptionKeys();

        test("le corpus des choix par description couvre au moins 90 clés (garde-fou anti-glob-vide)", () => {
            expect(descriptionChoices.size).toBeGreaterThanOrEqual(90);
        });

        for (const key of descriptionKeys) {
            const value = fr[key];
            const placeholders = [...value.matchAll(PLACEHOLDER_PATTERN)];
            if (placeholders.length === 0) continue;
            // Clé dont seule une archive témoigne : contenu figé, hors garde.
            if (!descriptionChoices.has(key) && archivedOnly.has(key)) continue;

            test(`${key} : chaque placeholder désigne un choix existant`, () => {
                const choicesList = descriptionChoices.get(key);
                expect(choicesList, `aucune carte de packs/_source/decks-pattern-fq8 ne porte la clé ${key}`).toBeDefined();

                for (const [, indexStr, field] of placeholders) {
                    const index = Number(indexStr);
                    // Le choix d'index `index` doit exister sur AU MOINS une des
                    // cartes qui partagent cette clé de description — une même
                    // clé de texte peut être portée à la fois par une carte de
                    // base et par sa variante éphémère générée
                    // (`chooseCardsList`, ex. LightStrike : base = damage,
                    // générée = heal), qui n'exposent pas les mêmes champs sur
                    // le même choix.
                    const hasMatchingChoice = choicesList.some(choices => choices[index] !== undefined);
                    expect(
                        hasMatchingChoice,
                        `${key} : choix d'index ${index} inexistant sur toutes les cartes pour le placeholder {${indexStr}_${field}}`
                    ).toBe(true);

                    // Pour les champs de formule (damage/heal/hp), au moins une
                    // des cartes partageant la clé doit renseigner une valeur
                    // non vide — sinon le placeholder afficherait une chaîne
                    // vide sur TOUTES ses occurrences (régression réelle,
                    // ex. un `{9_damage}` qui ne pointe vers aucun choix rempli).
                    if (FORMULA_FIELDS.includes(field)) {
                        const hasFilledField = choicesList.some(choices => {
                            const v = choices[index]?.[field];
                            return v !== undefined && v !== null && v !== "";
                        });
                        expect(
                            hasFilledField,
                            `${key} : le champ de formule "${field}" du choix ${index} est vide sur toutes les cartes pour le placeholder {${indexStr}_${field}}`
                        ).toBe(true);
                    }
                }
            });
        }

        test("un placeholder pointant vers un index de choix inexistant (ex. {9_damage}) fait échouer la vérification", () => {
            // Carte témoin prise dans le deck NEUTRE : partagé par toutes les
            // classes, il survit à tout découpage du contenu par classe — la
            // précédente (BalmRune) a suivi le Guerrier runique dans un autre module.
            const choicesList = descriptionChoices.get("FQCARDDESCRIPTION.ManaRecoveryI");
            expect(choicesList).toBeDefined();
            const bogusIndex = 9;
            const hasMatchingChoice = choicesList.some(choices => choices[bogusIndex] !== undefined);
            expect(hasMatchingChoice).toBe(false);
        });
    });

    test("fr.json et en.json déclarent exactement le même ensemble de clés FQCARDDESCRIPTION.*", () => {
        const enKeys = Object.keys(en).filter(k => k.startsWith("FQCARDDESCRIPTION."));
        const missingInEn = descriptionKeys.filter(k => !enKeys.includes(k));
        const missingInFr = enKeys.filter(k => !descriptionKeys.includes(k));
        expect({missingInEn, missingInFr}).toEqual({missingInEn: [], missingInFr: []});
    });

    test("fr.json et en.json portent les mêmes placeholders pour chaque clé FQCARDDESCRIPTION.*", () => {
        const mismatches = [];
        for (const key of descriptionKeys) {
            if (typeof en[key] !== "string") continue;
            const frPlaceholders = [...fr[key].matchAll(PLACEHOLDER_PATTERN)].map(m => m[0]).sort();
            const enPlaceholders = [...en[key].matchAll(PLACEHOLDER_PATTERN)].map(m => m[0]).sort();
            if (frPlaceholders.join(",") !== enPlaceholders.join(",")) {
                mismatches.push(`${key} : fr=[${frPlaceholders}] en=[${enPlaceholders}]`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    describe("SIMPLE_TOKEN_ALLOWLIST : jetons de caractéristique seuls, volontairement conservés", () => {
        test("chaque clé de la liste blanche existe toujours dans fr.json", () => {
            const missing = Object.keys(SIMPLE_TOKEN_ALLOWLIST).filter(k => fr[k] === undefined);
            expect(missing).toEqual([]);
        });

        test("chaque clé de la liste blanche porte une raison documentée non vide", () => {
            const undocumented = Object.entries(SIMPLE_TOKEN_ALLOWLIST)
                .filter(([, reason]) => !reason || reason.trim() === "")
                .map(([k]) => k);
            expect(undocumented).toEqual([]);
        });

        test("la liste blanche contient exactement 38 clés (seau « laisser » du triage, plan 20-06)", () => {
            expect(Object.keys(SIMPLE_TOKEN_ALLOWLIST).length).toBe(38);
        });
    });
});
