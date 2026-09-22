import {defineConfig} from "vitest/config";

const SPEC = "*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}";

/** Réglages communs aux deux projets : seuls le rythme et les délais les séparent. */
const shared = {
    globals: true,           // describe/it/expect sans import
    environment: "jsdom",    // simule le DOM pour les sheets
    exclude: ["**/node_modules/**", "**/.claude/**"],
    setupFiles: ["./tests/setup.js"]
};

export default defineConfig({
    test: {
        // La couverture ne se règle qu'à la racine (elle agrège les projets).
        coverage: {
            provider: "v8", reporter: ["text", "html"], include: ["src/**/*.js"],
        },
        projects: [
            {
                // Tout sauf l'UAT : en mémoire, rapide, largement parallélisable.
                test: {
                    ...shared,
                    name: "unit",
                    include: [`tests/**/${SPEC}`],
                    exclude: [...shared.exclude, "tests/uat/**"],
                    testTimeout: 20000
                }
            },
            {
                // Les tests UAT copient et relisent de vrais dossiers de monde
                // (LevelDB inclus) : ils sont limités par le disque, pas par le CPU.
                // Les faire courir en parallèle les uns des autres ne les accélère
                // pas, ça les met en concurrence sur les mêmes entrées/sorties —
                // d'où des tests tués au bout du délai sans qu'aucune assertion ne
                // soit en cause. Ici : un fichier à la fois, et un délai large.
                // Lancés seuls, les 8 fichiers tiennent en une minute.
                test: {
                    ...shared,
                    name: "uat",
                    include: [`tests/uat/**/${SPEC}`],
                    testTimeout: 120000,
                    fileParallelism: false
                }
            }
        ]
    }
});