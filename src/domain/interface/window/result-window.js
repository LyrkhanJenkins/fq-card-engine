import RollReport from "../../engine/roll/roll-report.js";
import AdvantageLabels from "../../engine/roll/advantage-labels.js";
import {escapeHtml} from "../../../core/utils/html.utils.js";

/** Durée de roulement d'un dé du jet principal, en millisecondes. */
const MAIN_DIE_DURATION = 520;

/** Décalage entre deux dés du jet principal, pour qu'ils ne tombent pas d'un bloc. */
const MAIN_DIE_STAGGER = 80;

/** Durée de roulement d'un d20 (critique, toucher, esquive) et d'un dé de formule d'effets. */
const D20_DURATION = 440;

/** Durée du décompte du total au centre. */
const TOTAL_COUNT_DURATION = 320;

/** Intervalle de défilement des faces pendant qu'un dé roule. */
const FACE_TICK = 55;

/** Temps d'affichage du panneau, en secondes, à défaut de réglage lisible. */
const DEFAULT_LINGER_SECONDS = 6;

/** Volume du son de dés à défaut de réglage d'interface lisible. */
const DEFAULT_DICE_VOLUME = 0.5;

/**
 * Types de dé dont la fenêtre sait dessiner la silhouette. Un dé hors de cette
 * liste (d3, d100, dé exotique d'une formule de carte) garde le carré arrondi par
 * défaut : mieux vaut une forme neutre qu'une forme fausse.
 *
 * @type {ReadonlySet<number>}
 */
const SHAPED_DICE = Object.freeze(new Set([4, 6, 8, 10, 12, 20]));

/**
 * Fenêtre de résultat : le calque qui met en scène une résolution de carte ou
 * d'activité — les dés du jet principal au centre, ce que fait le lanceur à
 * gauche (colonne ATTAQUE : le toucher puis le critique), ce que chaque ennemi
 * oppose à droite (colonne DÉFENSE : armure ou sauvegarde, puis esquive), et
 * enfin les valeurs appliquées, les jets de formules d'effets et les messages.
 *
 * Le panneau est ancré en bas à droite et ne réserve aucune hauteur : chaque
 * section apparaît quand son tour vient et fait grandir le panneau vers le haut.
 *
 * `present` ne rend la main qu'à la FIN de l'animation : c'est ce qui garantit
 * que les effets, les points de vie et les FX ne partent pas avant que le joueur
 * ait vu ce qui les produit. Le panneau reste ensuite affiché un moment, mais
 * plus personne ne l'attend.
 *
 * Le calque est construit en JavaScript et non par un gabarit, comme la
 * révélation de pioche (`HandBoard#playDrawReveal`) : c'est une mise en scène
 * impérative, dont chaque étape manipule le DOM qu'elle vient de révéler.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ResultWindow {

    /** @type {?HTMLElement} Le calque actuellement affiché, ou null. */
    static #current = null;

    /** @type {number} Jeton de la mise en scène en cours : toute étape d'une autre est abandonnée. */
    static #token = 0;

    /** @type {boolean} Passé à true par un clic : le reste de l'animation se joue sans attente. */
    static #skipping = false;

    /** @type {number} Diviseur des durées de roulement des dés, lu au réglage du joueur. */
    static #diceSpeed = 1;

    /** @type {number} Diviseur des attentes entre deux étapes, lu au réglage du joueur. */
    static #pauseSpeed = 1;

    /** @type {boolean} Le son de dés est-il joué, d'après le réglage du joueur. */
    static #diceSound = true;

    /**
     * Lit un réglage de vitesse. Une valeur absente ou aberrante retombe sur 1 :
     * un réglage illisible ne doit pas figer la résolution en attendant des dés
     * qui roulent à l'infini.
     *
     * @param {string} key - La clé du réglage.
     *
     * @returns {number} Le diviseur de durée.
     */
    static #readSpeed(key) {
        let value;
        try {
            value = Number(game.settings.get(FqCardEngineModule.moduleName, key));
        } catch {
            value = NaN;
        }
        return Number.isFinite(value) && value > 0 ? value : 1;
    }

    /**
     * La vitesse de roulement des dés choisie par le joueur.
     *
     * @returns {number} Le diviseur de durée.
     */
    static get speed() {
        return ResultWindow.#readSpeed("ResultWindowSpeed");
    }

    /**
     * La vitesse des attentes entre deux étapes choisie par le joueur.
     *
     * @returns {number} Le diviseur de durée.
     */
    static get pauseSpeed() {
        return ResultWindow.#readSpeed("ResultWindowPauseSpeed");
    }

    /**
     * Le son de dés est-il activé chez ce joueur ? Actif par défaut : le moteur
     * n'anime plus de dés 3D, ce son est donc le seul retour sonore d'un jet.
     *
     * @returns {boolean} True si le son doit être joué.
     */
    static get diceSoundEnabled() {
        try {
            return game.settings.get(FqCardEngineModule.moduleName, "ResultWindowDiceSound") !== false;
        } catch {
            return true;
        }
    }

    /**
     * Joue le son de dés de Foundry, en local uniquement : la fenêtre est déjà
     * diffusée et animée chez chaque client, une diffusion du son le ferait
     * entendre autant de fois qu'il y a de joueurs.
     *
     * Le volume suit celui de l'interface choisi dans Foundry — un son de dés qui
     * ignorerait ce réglage serait le seul du jeu à le faire.
     *
     * @returns {void}
     */
    static #playDiceSound() {
        if (!ResultWindow.#diceSound) {
            return;
        }
        const src = CONFIG?.sounds?.dice;
        if (!src) {
            return;
        }
        let volume = DEFAULT_DICE_VOLUME;
        try {
            const setting = Number(game.settings.get("core", "globalInterfaceVolume"));
            if (Number.isFinite(setting)) {
                volume = setting;
            }
        } catch {
            volume = DEFAULT_DICE_VOLUME;
        }
        try {
            foundry.audio.AudioHelper.play({src, volume, autoplay: true, loop: false}, false);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * La durée d'affichage du panneau après l'animation, en millisecondes. Zéro
     * signifie « jusqu'au clic » : aucune fermeture n'est alors programmée.
     *
     * @returns {number} La durée en millisecondes, ou 0 pour une fermeture au clic.
     */
    static get linger() {
        let seconds;
        try {
            seconds = Number(game.settings.get(FqCardEngineModule.moduleName, "ResultWindowLinger"));
        } catch {
            seconds = NaN;
        }
        if (seconds === 0) {
            return 0;
        }
        return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_LINGER_SECONDS) * 1000;
    }

    /**
     * Affiche le rapport et attend la fin de la mise en scène.
     *
     * @param {RollReport|object} report - Le rapport de la résolution (objet nu accepté).
     *
     * @returns {Promise<void>} Résolue quand tout est affiché.
     */
    static async present(report) {
        if (!RollReport.hasContent(report)) {
            return;
        }
        const mine = ++ResultWindow.#token;
        ResultWindow.#skipping = false;
        // Un rapport venu d'un autre client porte les vitesses de son lanceur :
        // c'est son horloge qui fait foi, puisque c'est lui qui appliquera les
        // dégâts à la fin. Le réglage local ne vaut que pour ses propres jets.
        ResultWindow.#diceSpeed = Number.isFinite(report.speed) && report.speed > 0
            ? report.speed : ResultWindow.speed;
        ResultWindow.#pauseSpeed = Number.isFinite(report.pauseSpeed) && report.pauseSpeed > 0
            ? report.pauseSpeed : ResultWindow.pauseSpeed;
        // Le son, lui, ne voyage pas : c'est une préférence d'écoute, pas un
        // élément de synchronisation. Chacun l'entend ou non chez soi.
        ResultWindow.#diceSound = ResultWindow.diceSoundEnabled;
        ResultWindow.#close();

        const win = ResultWindow.#build(report);
        document.body.appendChild(win);
        ResultWindow.#current = win;
        // Un seul geste, deux sens selon le moment : tant que l'animation court, le
        // clic la précipite ; une fois qu'elle est finie, il referme le panneau —
        // seule façon de le congédier quand le joueur a choisi « jusqu'au clic ».
        win.addEventListener("click", () => {
            if (win.dataset.done === "1") {
                if (mine === ResultWindow.#token) {
                    ResultWindow.#close();
                }
                return;
            }
            ResultWindow.#skipping = true;
        });

        try {
            await ResultWindow.#run(win, report, mine);
        } finally {
            ResultWindow.#scheduleClose(win, mine);
        }
    }

    /**
     * Déroule la mise en scène, étape par étape.
     *
     * @param {HTMLElement} win    - Le calque.
     * @param {object}      report - Le rapport de la résolution.
     * @param {number}      mine   - Le jeton de cette mise en scène.
     *
     * @returns {Promise<void>}
     */
    static async #run(win, report, mine) {
        const q = (selector) => win.querySelector(selector);
        const alive = () => mine === ResultWindow.#token;

        await ResultWindow.#wait(30, mine);
        win.classList.add("is-in");
        await ResultWindow.#wait(160, mine);

        // 1. Les dés du jet principal, décalés pour qu'ils ne tombent pas d'un bloc.
        if (report.mainRoll) {
            await Promise.all((report.mainRoll.dice ?? []).map((die, index) =>
                ResultWindow.#wait(index * MAIN_DIE_STAGGER, mine).then(() =>
                    ResultWindow.#rollDie(q(`[data-die="${index}"]`), die.sides, die.value,
                        MAIN_DIE_DURATION, mine))));

            // 2. Le total.
            await ResultWindow.#wait(120, mine);
            await ResultWindow.#countUp(q("[data-total]"), report.mainRoll.total, TOTAL_COUNT_DURATION, mine);
        }

        // 3. Le jet pour toucher. Une attaque ne roule qu'une fois pour toute la
        // carte, avant le critique, comme dans la résolution : un dé, ou deux
        // quand une cible au moins est visée avec avantage ou désavantage.
        const attack = (report.hits ?? []).find(hit => hit.kind === "ac");
        if (attack) {
            await ResultWindow.#wait(160, mine);
            q(".fq-result-col--attack")?.classList.add("is-active");
            const pair = (attack.dice ?? []).length > 1;
            if (pair) {
                // Chaque dé montre sa face : aucun total n'est commun, chaque
                // cible ajoutant le modificateur au dé que son mode retient.
                await Promise.all(attack.dice.map((value, index) =>
                    ResultWindow.#rollDie(q(`[data-hit-die="${index}"]`), 20, value, D20_DURATION, mine)));
            } else {
                await ResultWindow.#rollDie(q("[data-hit-die]"), 20, attack.total, D20_DURATION, mine);
            }
            if (!alive()) return;
            const formula = q("[data-hit-formula]");
            if (formula) {
                formula.textContent = pair ? ResultWindow.#signed(attack.modifier) : ResultWindow.#hitFormula(attack);
            }
            await ResultWindow.#wait(90, mine);
        }

        // 4. Le critique tranche.
        if (report.critical) {
            await ResultWindow.#wait(160, mine);
            q(".fq-result-col--attack")?.classList.add("is-active");
            await ResultWindow.#rollDie(q("[data-crit]"), 20, report.critical.roll, D20_DURATION, mine);
            await ResultWindow.#wait(90, mine);
            if (!alive()) return;
            ResultWindow.#revealCrit(win, report);
        }

        // 5. Les défenses, ennemi par ennemi. Chaque ligne révèle ses symboles :
        // la classe d'armure est déjà écrite — elle n'est pas jetée — alors qu'une
        // sauvegarde et une esquive roulent leur dé.
        const evasions = report.evasions ?? [];
        if (evasions.length > 0) {
            await ResultWindow.#wait(160, mine);
            q(".fq-result-col--defense")?.classList.add("is-active");
            const hits = new Map((report.hits ?? []).map(hit => [hit.targetTokenId, hit]));
            for (let index = 0; index < evasions.length; index++) {
                const evasion = evasions[index];
                q(`[data-def-line="${index}"]`)?.classList.add("is-live");
                const hit = hits.get(evasion.targetTokenId);
                if (hit) {
                    // La classe d'armure est déjà écrite (elle n'est pas jetée) ;
                    // une sauvegarde fait rouler son total. Dans les deux cas, la
                    // défense a tenu quand la cible s'est protégée.
                    await ResultWindow.#revealDefenseMark(q(`[data-def-mark="${index}-0"]`),
                        hit.kind === "ac" ? null : hit.total, hit.defended, mine);
                }
                if (!alive()) return;
                await ResultWindow.#revealDefenseMark(q(`[data-def-mark="${index}-1"]`),
                    evasion.roll === null ? null : evasion.roll, evasion.evaded, mine);
                if (!alive()) return;
                await ResultWindow.#wait(100, mine);
            }
        }

        // 6. Les valeurs appliquées.
        if ((report.results?.length ?? 0) > 0) {
            await ResultWindow.#wait(160, mine);
            q("[data-targets]")?.classList.add("is-on");
            for (let index = 0; index < report.results.length; index++) {
                if (!alive()) return;
                q(`[data-result="${index}"]`)?.classList.add("is-on");
                await ResultWindow.#wait(90, mine);
            }
        }

        // 7. Les jets de formules d'effets de la carte.
        if ((report.extraRolls?.length ?? 0) > 0) {
            await ResultWindow.#wait(160, mine);
            q("[data-extra]")?.classList.add("is-on");
            for (let index = 0; index < report.extraRolls.length; index++) {
                const extra = report.extraRolls[index];
                q(`[data-extra-row="${index}"]`)?.classList.add("is-live");
                if (extra.dice?.length) {
                    await ResultWindow.#rollDie(q(`[data-extra-die="${index}"]`),
                        extra.dice[0].sides, extra.total, D20_DURATION, mine);
                }
                if (!alive()) return;
                ResultWindow.#revealExtra(win, index, extra);
                await ResultWindow.#wait(100, mine);
            }
        }

        // 8. Les messages de la carte.
        if ((report.messages?.length ?? 0) > 0) {
            await ResultWindow.#wait(120, mine);
            if (!alive()) return;
            q("[data-messages]")?.classList.add("is-on");
        }
    }

    /**
     * Attend, à la vitesse du joueur. Un clic en cours d'animation rend la main
     * immédiatement, et une mise en scène remplacée ne se réveille jamais.
     *
     * @param {number} ms   - La durée nominale, en millisecondes.
     * @param {number} mine - Le jeton de la mise en scène appelante.
     *
     * @returns {Promise<void>}
     */
    static #wait(ms, mine) {
        if (ResultWindow.#skipping || mine !== ResultWindow.#token) {
            return Promise.resolve();
        }
        return new Promise(resolve => setTimeout(resolve, ms / ResultWindow.#pauseSpeed));
    }

    /**
     * Fait rouler un dé : ses faces défilent, puis il se pose sur sa valeur.
     *
     * @param {?HTMLElement} el       - L'élément du dé (absent : rien à animer).
     * @param {number}       sides    - Le nombre de faces.
     * @param {number}       value    - La valeur finale.
     * @param {number}       duration - La durée nominale du roulement.
     * @param {number}       mine     - Le jeton de la mise en scène appelante.
     *
     * @returns {Promise<void>}
     */
    static #rollDie(el, sides, value, duration, mine) {
        if (!el) {
            return Promise.resolve();
        }
        el.classList.remove("is-blank");
        el.classList.add("is-rolling");
        const settle = () => {
            el.textContent = value;
            el.classList.remove("is-rolling");
            el.classList.add("is-landed");
            if (value === sides) {
                el.classList.add("is-max");
            }
        };
        if (ResultWindow.#skipping || mine !== ResultWindow.#token) {
            settle();
            return Promise.resolve();
        }
        // Après la sortie anticipée ci-dessus : un dé posé d'emblée (clic pour
        // passer) ne roule pas, il n'a donc aucun bruit à faire.
        ResultWindow.#playDiceSound();
        const started = Date.now();
        const total = duration / ResultWindow.#diceSpeed;
        return new Promise(resolve => {
            const tick = () => {
                if (mine !== ResultWindow.#token) {
                    return resolve();
                }
                if (ResultWindow.#skipping || Date.now() - started >= total) {
                    settle();
                    return resolve();
                }
                el.textContent = 1 + Math.floor(Math.random() * sides);
                setTimeout(tick, FACE_TICK);
            };
            tick();
        });
    }

    /**
     * Fait monter le total du centre jusqu'à sa valeur.
     *
     * @param {?HTMLElement} el       - L'élément du total.
     * @param {number}       value    - La valeur finale.
     * @param {number}       duration - La durée nominale du décompte.
     * @param {number}       mine     - Le jeton de la mise en scène appelante.
     *
     * @returns {Promise<void>}
     */
    static #countUp(el, value, duration, mine) {
        if (!el) {
            return Promise.resolve();
        }
        el.classList.add("is-pop");
        if (ResultWindow.#skipping || mine !== ResultWindow.#token) {
            el.textContent = value;
            return Promise.resolve();
        }
        const started = Date.now();
        const total = duration / ResultWindow.#diceSpeed;
        return new Promise(resolve => {
            const tick = () => {
                if (mine !== ResultWindow.#token) {
                    return resolve();
                }
                const ratio = (Date.now() - started) / (total || 1);
                if (ResultWindow.#skipping || ratio >= 1) {
                    el.textContent = value;
                    return resolve();
                }
                el.textContent = Math.round(value * (1 - Math.pow(1 - ratio, 3)));
                setTimeout(tick, 16);
            };
            tick();
        });
    }

    /**
     * Marque le critique quand il tombe : le total du centre s'embrase et la
     * mention de critique s'y allume.
     *
     * Aucun verdict écrit sous le dé — « réussite » et « échec » se lisaient deux
     * fois, ici et sur la ligne de résultat.
     *
     * @param {HTMLElement} win    - Le calque.
     * @param {object}      report - Le rapport de la résolution.
     *
     * @returns {void}
     */
    static #revealCrit(win, report) {
        if (report.critical.hit) {
            win.querySelector("[data-total]")?.classList.add("is-crit");
            win.querySelector("[data-crit-mark]")?.classList.add("is-on");
        }
    }

    /**
     * Révèle un symbole de défense : pose sa valeur si elle vient d'un dé, puis
     * sa couleur — verte quand la défense a tenu, rouge quand elle a cédé.
     *
     * Un symbole sans valeur (une cible sans score d'esquive) reste vide et muet :
     * son emplacement demeure pour garder les lignes alignées, mais rien n'y est
     * arrivé, et lui donner une couleur laisserait croire le contraire.
     *
     * @param {?HTMLElement} element - Le symbole.
     * @param {?number}      value   - La valeur à faire rouler, ou null si déjà écrite.
     * @param {boolean}      held    - True si la défense a tenu.
     * @param {number}       mine    - Le jeton de la mise en scène appelante.
     *
     * @returns {Promise<void>}
     */
    static async #revealDefenseMark(element, value, held, mine) {
        if (!element) {
            return;
        }
        if (value === null && !element.textContent.trim()) {
            return;
        }
        if (value !== null) {
            await ResultWindow.#rollDie(element, 20, value, D20_DURATION, mine);
        }
        element.classList.add(held ? "is-success" : "is-failure");
    }

    /**
     * La formule d'un jet pour toucher : le dé, puis son modificateur signé.
     * Elle se lit sous le total, qui est ce que le joueur regarde d'abord.
     *
     * @param {object} hit - Le jet pour toucher.
     *
     * @returns {string} La formule, par exemple « 14 + 5 ».
     */
    static #hitFormula(hit) {
        return hit.modifier ? `${hit.roll} ${ResultWindow.#signed(hit.modifier)}` : `${hit.roll}`;
    }

    /**
     * Un modificateur signé, tel qu'il s'écrit après un dé : « + 5 », « − 2 ».
     *
     * @param {number} modifier - Le modificateur.
     *
     * @returns {string} Le modificateur signé, ou une chaîne vide s'il est nul.
     */
    static #signed(modifier) {
        if (!modifier) {
            return "";
        }
        return modifier > 0 ? `+ ${modifier}` : `− ${-modifier}`;
    }

    /**
     * Affiche le verdict d'un jet de formule d'effets.
     *
     * @param {HTMLElement} win   - Le calque.
     * @param {number}      index - L'indice du jet dans le rapport.
     * @param {object}      extra - Le jet supplémentaire.
     *
     * @returns {void}
     */
    static #revealExtra(win, index, extra) {
        const out = win.querySelector(`[data-extra-out="${index}"]`);
        if (!out) {
            return;
        }
        out.textContent = game.i18n.localize(extra.hit
            ? "FQCARDENGINE.RollOutcomeSuccess" : "FQCARDENGINE.RollOutcomeFail");
        out.classList.add("is-on", extra.hit ? "is-hit" : "is-miss");
    }

    /**
     * Programme la fermeture du calque après son temps d'affichage, et le marque
     * comme terminé pour que le clic le referme au lieu de précipiter l'animation.
     * Une durée nulle laisse le panneau à l'écran jusqu'à ce clic. Un calque déjà
     * remplacé par une résolution suivante n'est pas refermé ici : il l'a été à
     * l'ouverture de celle-ci.
     *
     * @param {HTMLElement} win  - Le calque.
     * @param {number}      mine - Le jeton de la mise en scène.
     *
     * @returns {void}
     */
    static #scheduleClose(win, mine) {
        win.dataset.done = "1";
        const linger = ResultWindow.linger;
        if (linger === 0) {
            return;
        }
        const bar = win.querySelector("[data-bar]");
        if (bar) {
            bar.style.animationDuration = `${linger}ms`;
            bar.classList.add("is-draining");
        }
        setTimeout(() => {
            if (mine === ResultWindow.#token) {
                ResultWindow.#close();
            }
        }, linger);
    }

    /**
     * Retire le calque affiché, s'il y en a un.
     *
     * @returns {void}
     */
    static #close() {
        const win = ResultWindow.#current;
        ResultWindow.#current = null;
        if (!win) {
            return;
        }
        win.classList.remove("is-in");
        win.classList.add("is-out");
        setTimeout(() => win.remove(), 340);
    }

    /**
     * Construit le calque complet, toutes sections présentes mais masquées : la
     * mise en scène les révèle une à une.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {HTMLElement} Le calque prêt à être inséré.
     */
    static #build(report) {
        const isHeal = report.kind === "heal";
        const win = document.createElement("div");
        win.className = `fq-result-window fq-result-window--${isHeal ? "heal" : "damage"}`;
        win.innerHTML = `<div class="fq-result-frame">`
            + ResultWindow.#header(report)
            + `<div class="fq-result-body">`
            + ResultWindow.#attackColumn(report)
            + ResultWindow.#centerColumn(report, isHeal)
            + ResultWindow.#defenseColumn(report)
            + `</div>`
            + ResultWindow.#targets(report)
            + ResultWindow.#extraRolls(report)
            + ResultWindow.#messages(report)
            + `<div class="fq-result-foot"><i class="fq-result-bar" data-bar></i></div>`
            + `</div>`;
        return win;
    }

    /**
     * La classe de silhouette d'un dé, d'après son nombre de faces.
     *
     * @param {number} sides - Le nombre de faces.
     *
     * @returns {string} La classe de forme, ou une chaîne vide pour un dé non dessiné.
     */
    static #dieShape(sides) {
        return SHAPED_DICE.has(sides) ? ` fq-result-die--d${sides}` : "";
    }

    /**
     * L'entête : la carte, son deck, l'effet retenu et les variables.
     *
     * Les CIBLES n'y figurent pas : la colonne de défense les nomme déjà une à
     * une, et la ligne de résultat les reprend une troisième fois.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de l'entête.
     */
    static #header({header}) {
        const chips = [];
        if (header.tag) {
            chips.push(`<span class="fq-result-chip is-tag">${header.tag}</span>`);
        }
        if (header.choiceName) {
            chips.push(`<span class="fq-result-chip is-choice">${header.choiceName}</span>`);
        }
        if (header.xValue !== null && header.xValue !== undefined && header.xValue !== "") {
            chips.push(`<span class="fq-result-chip">X = ${header.xValue}</span>`);
        }
        if (header.yValue !== null && header.yValue !== undefined && header.yValue !== "") {
            chips.push(`<span class="fq-result-chip">Y = ${header.yValue}</span>`);
        }
        return `<div class="fq-result-header">`
            + (header.cardImg ? `<div class="fq-result-thumb"><img src="${header.cardImg}" alt=""></div>` : "")
            + `<div class="fq-result-meta">`
            + (header.actorName ? `<div class="fq-result-actor">${header.actorName}</div>` : "")
            + (header.cardName ? `<div class="fq-result-card">${header.cardName}</div>` : "")
            + (header.deckName ? `<div class="fq-result-deck">${header.deckName}</div>` : "")
            + (chips.length ? `<div class="fq-result-chips">${chips.join("")}</div>` : "")
            + `</div></div>`;
    }

    /**
     * La colonne d'ATTAQUE : ce que fait le lanceur, en deux encarts centrés —
     * le jet pour toucher, puis le critique.
     *
     * Le dé porte le TOTAL et la ligne du dessous la formule qui l'a produit :
     * on lit le résultat d'abord, son calcul ensuite. Aucun verdict écrit, il se
     * lit déjà sur la ligne de résultat, en bas de la fenêtre.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de la colonne.
     */
    static #attackColumn(report) {
        return `<div class="fq-result-col fq-result-col--attack">`
            + `<div class="fq-result-col-label">${game.i18n.localize("FQCARDENGINE.ColumnAttack")}</div>`
            + ResultWindow.#hitBox(report)
            + ResultWindow.#critBox(report)
            + `</div>`;
    }

    /**
     * L'encart du jet pour toucher. Une ATTAQUE ne roule qu'une fois pour toute
     * la carte, quel que soit le nombre de cibles : un seul dé, ou deux dès
     * qu'une cible est visée avec avantage ou désavantage — chacune retient
     * alors celui que son mode lui vaut. Une SAUVEGARDE appartient aux cibles —
     * l'encart le dit et reste vide, ses dés roulant dans la colonne de défense.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de l'encart.
     */
    static #hitBox(report) {
        const label = game.i18n.localize("FQCARDENGINE.RollLabelAttack");
        const attack = (report.hits ?? []).find(hit => hit.kind === "ac");
        if (!attack) {
            const note = game.i18n.localize((report.hits ?? []).length
                ? "FQCARDENGINE.HitBoxSaveNote" : "FQCARDENGINE.HitBoxNoneNote");
            return `<div class="fq-result-box is-empty">`
                + `<div class="fq-result-box-label">${label}</div>`
                + `<div class="fq-result-empty-note">${note}</div></div>`;
        }
        if ((attack.dice ?? []).length > 1) {
            const dice = attack.dice.map((_, index) =>
                `<div class="fq-result-die fq-result-die--d20 fq-result-die--hit is-blank" data-hit-die="${index}"></div>`)
                .join("");
            return `<div class="fq-result-box">`
                + `<div class="fq-result-box-label">${label}</div>`
                + `<div class="fq-result-dice-pair">${dice}</div>`
                + `<div class="fq-result-threshold" data-hit-formula></div>`
                + `<div class="fq-result-empty-note">${game.i18n.localize("FQCARDENGINE.HitBoxTwoDiceNote")}</div>`
                + `</div>`;
        }
        return `<div class="fq-result-box">`
            + `<div class="fq-result-box-label">${label}</div>`
            + `<div class="fq-result-die fq-result-die--d20 fq-result-die--hit is-blank" data-hit-die></div>`
            + `<div class="fq-result-threshold" data-hit-formula></div>`
            + `</div>`;
    }

    /**
     * L'encart du critique. Son dé EST son résultat : il n'a pas de total à part,
     * seulement un seuil à atteindre.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de l'encart.
     */
    static #critBox(report) {
        const label = game.i18n.localize(report.kind === "heal"
            ? "FQCARDENGINE.RollLabelCriticalHeal" : "FQCARDENGINE.ChatMessagePartCritical");
        if (!report.critical) {
            return `<div class="fq-result-box is-empty">`
                + `<div class="fq-result-box-label">${label}</div>`
                + `<div class="fq-result-empty-note">`
                + `${game.i18n.localize("FQCARDENGINE.CritBoxNoneNote")}</div></div>`;
        }
        return `<div class="fq-result-box">`
            + `<div class="fq-result-box-label">${label}</div>`
            + `<div class="fq-result-die fq-result-die--d20 fq-result-die--crit is-blank" data-crit></div>`
            + `<div class="fq-result-threshold">`
            + `${game.i18n.format("FQCARDENGINE.RollThreshold", {threshold: report.critical.threshold})}</div>`
            + `</div>`;
    }

    /**
     * La colonne centrale : les dés du jet, le total, la formule et le bonus.
     *
     * @param {object}  report - Le rapport de la résolution.
     * @param {boolean} isHeal - True pour un soin.
     *
     * @returns {string} Le HTML de la colonne.
     */
    static #centerColumn(report, isHeal) {
        if (!report.mainRoll) {
            return `<div class="fq-result-col fq-result-col--center"></div>`;
        }
        const dice = (report.mainRoll.dice ?? []).map((die, index) =>
            `<div class="fq-result-die${ResultWindow.#dieShape(die.sides)} is-blank" data-die="${index}"></div>`)
            .join("");
        const critMark = game.i18n.localize(isHeal
            ? "FQCARDENGINE.RollLabelCriticalHeal" : "FQCARDENGINE.ChatMessagePartCritical");
        return `<div class="fq-result-col fq-result-col--center">`
            + `<div class="fq-result-pool">${dice}</div>`
            + `<div class="fq-result-total" data-total>0</div>`
            + `<div class="fq-result-formula">${report.mainRoll.formula}</div>`
            + (report.mainRoll.bonus
                ? `<div class="fq-result-bonus">`
                + `${game.i18n.format("FQCARDENGINE.RollBonusApplied", {bonus: report.mainRoll.bonus})}</div>`
                : "")
            + `<div class="fq-result-crit-mark" data-crit-mark>${critMark}</div>`
            + `</div>`;
    }

    /**
     * La colonne de DÉFENSE : ce que chaque ennemi oppose, une ligne par cible
     * réduite à ses symboles.
     *
     * Trois colonnes possibles, coiffées d'un libellé : la classe d'armure face
     * au jet d'attaque, la sauvegarde de la cible, et son esquive. Aucun texte de
     * verdict — la couleur du symbole suffit, verte quand la défense a tenu,
     * rouge quand elle a cédé — et le détail chiffré vit dans le tooltip.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de la colonne.
     */
    static #defenseColumn(report) {
        const lines = ResultWindow.#defenseLines(report);
        const label = game.i18n.localize("FQCARDENGINE.ColumnDefense");
        return `<div class="fq-result-col fq-result-col--defense${lines ? "" : " is-empty"}">`
            + `<div class="fq-result-col-label">${label}</div>`
            + (lines ? ResultWindow.#defenseHead(report) + lines : "")
            + `</div>`;
    }

    /**
     * L'entête de la colonne de défense : un libellé par colonne de symboles,
     * dans l'ordre où ils apparaissent.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de l'entête.
     */
    static #defenseHead(report) {
        const kind = (report.hits ?? [])[0]?.kind;
        const keys = [];
        if (kind === "ac") {
            keys.push(["armor", "FQCARDENGINE.ColumnKeyArmor", "FQCARDENGINE.TooltipColumnArmor"]);
        } else if (kind === "save") {
            keys.push(["save", "FQCARDENGINE.ColumnKeySave", "FQCARDENGINE.TooltipColumnSave"]);
        }
        keys.push(["eva", "FQCARDENGINE.ColumnKeyEvasion", "FQCARDENGINE.TooltipColumnEvasion"]);
        const cells = keys.map(([modifier, key, tooltip]) =>
            `<span class="fq-result-key fq-result-key--${modifier}" data-tooltip="${tooltip}">`
            + `${game.i18n.localize(key)}</span>`).join("");
        return `<div class="fq-result-def-head"><span class="fq-result-foe-name"></span>`
            + `<span class="fq-result-marks">${cells}</span></div>`;
    }

    /**
     * Une ligne par ennemi : son nom, puis ses symboles de défense.
     *
     * Les cibles sont prises dans l'ordre des esquives, qui les porte toutes —
     * y compris celles qui n'ont aucun score d'esquive et n'ont donc pas lancé de
     * dé. Leur emplacement reste alors vide plutôt que de disparaître, sans quoi
     * les symboles d'une ligne à l'autre cesseraient d'être alignés.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML des lignes, ou une chaîne vide s'il n'y a rien à montrer.
     */
    static #defenseLines(report) {
        const evasions = report.evasions ?? [];
        if (evasions.length === 0) {
            return "";
        }
        const hits = new Map((report.hits ?? []).map(hit => [hit.targetTokenId, hit]));
        return evasions.map((evasion, index) => {
            const marks = [];
            const hit = hits.get(evasion.targetTokenId);
            if (hit) {
                const armour = hit.kind === "ac";
                // La classe d'armure est connue d'avance ; une sauvegarde ratée
                // d'office l'est aussi — aucun dé ne sera jeté, la croix s'écrit.
                marks.push(ResultWindow.#defenseMark(index, 0, armour ? "shield" : "d20",
                    armour ? hit.threshold : (hit.auto ? ResultWindow.#FORCED_MARK : null),
                    armour ? "" : ResultWindow.#thresholdLabel(hit.threshold),
                    {mode: hit.mode, why: ResultWindow.#hitWhy(hit)}));
            }
            // Une cible sans défense n'esquive pas : même croix, dite d'avance.
            marks.push(ResultWindow.#defenseMark(index, 1, "d20",
                evasion.defenseless ? ResultWindow.#FORCED_MARK : null,
                evasion.roll === null ? "" : ResultWindow.#thresholdLabel(evasion.threshold),
                {why: evasion.defenseless ? AdvantageLabels.why(evasion) : ""}));
            return `<div class="fq-result-foe-line" data-def-line="${index}">`
                + `<span class="fq-result-foe-name">${evasion.targetName}</span>`
                + `<span class="fq-result-marks">${marks.join("")}</span></div>`;
        }).join("");
    }

    /**
     * Un emplacement de symbole, vide jusqu'à ce que la mise en scène le révèle.
     * La classe d'armure est connue d'avance — elle n'est pas jetée — et s'écrit
     * donc tout de suite ; un dé attend son tour.
     *
     * Une flèche au coin dit un jet fait avec avantage (▲) ou désavantage (▼) ;
     * l'infobulle dit pourquoi.
     *
     * @param {number}  line      - L'indice de la ligne d'ennemi.
     * @param {number}  slot      - L'emplacement dans la ligne (0 défense de toucher, 1 esquive).
     * @param {string}  shape     - La silhouette (« shield » ou « d20 »).
     * @param {?(number|string)} value - La valeur déjà connue, ou null si elle sera jetée.
     * @param {string}  threshold - Le seuil affiché sous le symbole, ou une chaîne vide.
     * @param {object}  [options]      - Ce qui a décidé du jet.
     * @param {number}  [options.mode] - Le mode du jet (1 avantage, -1 désavantage).
     * @param {string}  [options.why]  - L'explication, en infobulle.
     *
     * @returns {string} Le HTML de l'emplacement.
     */
    static #defenseMark(line, slot, shape, value, threshold, {mode = 0, why = ""} = {}) {
        const modeClass = mode > 0 ? " has-advantage" : (mode < 0 ? " has-disadvantage" : "");
        const tooltip = why ? ` data-tooltip="${escapeHtml(why)}"` : "";
        return `<span class="fq-result-mark-wrap${modeClass}"${tooltip}>`
            + `<span class="fq-result-mark fq-result-mark--${shape}" data-def-mark="${line}-${slot}">`
            + `${value ?? ""}</span>`
            + `<span class="fq-result-mark-seuil">${threshold}</span></span>`;
    }

    /** Le symbole d'une défense tombée d'office : aucun dé ne l'a décidée. */
    static #FORCED_MARK = "✕";

    /**
     * L'infobulle d'un jet pour toucher : les deux dés quand un mode les a
     * départagés, puis ce qui a décidé du jet.
     *
     * @param {object} hit - Le jet pour toucher du rapport.
     *
     * @returns {string} L'explication, vide pour un jet ordinaire.
     */
    static #hitWhy(hit) {
        const dice = !hit.auto && hit.mode !== 0 && (hit.dice ?? []).length > 1
            ? `d20 ${hit.dice.join(" | ")} → ${hit.roll}` : "";
        return [dice, AdvantageLabels.why(hit)].filter(Boolean).join(" · ");
    }

    /**
     * Le seuil affiché sous un symbole : le DD d'une sauvegarde comme le score à
     * atteindre d'une esquive s'écrivent de la même façon.
     *
     * @param {number} threshold - Le seuil.
     *
     * @returns {string} Le libellé, déjà localisé.
     */
    static #thresholdLabel(threshold) {
        return game.i18n.format("FQCARDENGINE.ColumnSeuil", {threshold});
    }

    /**
     * La bande des valeurs appliquées, une ligne par cible.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de la bande, ou une chaîne vide s'il n'y a aucun résultat.
     */
    static #targets(report) {
        if ((report.results?.length ?? 0) === 0) {
            return "";
        }
        const rows = report.results.map((result, index) => {
            const badges = (result.critical
                ? `<span class="fq-result-badge is-crit">`
                + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartCritical")}</span>` : "")
                + (result.evasion
                    ? `<span class="fq-result-badge is-eva">`
                    + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartEvasion")}</span>` : "")
                + (result.defended
                    ? `<span class="fq-result-badge is-protected">`
                    + `${game.i18n.localize("FQCARDENGINE.ChatMessagePartProtected")}</span>` : "");
            return `<div class="fq-result-row" data-result="${index}">`
                + `<span class="fq-result-name">${result.targetName}</span>`
                + `<span class="fq-result-badges">${badges}</span>`
                + `<span class="fq-result-value">${result.value}</span>`
                + `</div>`;
        }).join("");
        return `<div class="fq-result-targets" data-targets>${rows}</div>`;
    }

    /**
     * La section des jets de formules d'effets.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de la section, ou une chaîne vide s'il n'y en a aucun.
     */
    static #extraRolls(report) {
        if ((report.extraRolls?.length ?? 0) === 0) {
            return "";
        }
        const rows = report.extraRolls.map((extra, index) => {
            // Silhouette réservée au cas d'un dé unique : la valeur affichée est le
            // TOTAL de la formule, et lui donner la forme d'un d6 quand elle en a
            // jeté deux annoncerait une face que ce dé ne peut pas montrer.
            const shape = extra.dice?.length === 1 ? ResultWindow.#dieShape(extra.dice[0].sides) : "";
            const die = extra.dice?.length
                ? `<div class="fq-result-die fq-result-die--other${shape} is-blank" data-extra-die="${index}"></div>`
                : `<div class="fq-result-die fq-result-die--other is-fixed">${extra.total}</div>`;
            return `<div class="fq-result-extra-row" data-extra-row="${index}">${die}`
                + `<div class="fq-result-extra-name">${extra.title}<span>${extra.formula}</span></div>`
                + `<div class="fq-result-extra-out" data-extra-out="${index}"></div></div>`;
        }).join("");
        return `<div class="fq-result-extra" data-extra>${rows}</div>`;
    }

    /**
     * La section des messages de la carte.
     *
     * @param {object} report - Le rapport de la résolution.
     *
     * @returns {string} Le HTML de la section, ou une chaîne vide s'il n'y en a aucun.
     */
    static #messages(report) {
        if ((report.messages?.length ?? 0) === 0) {
            return "";
        }
        return `<div class="fq-result-messages" data-messages>`
            + `<div class="fq-result-messages-label">`
            + `${game.i18n.localize("FQCARDENGINE.InfoMsgPartCardOtherEffect")}</div><ul>`
            + report.messages.map(message => `<li>${message}</li>`).join("")
            + `</ul></div>`;
    }
}
