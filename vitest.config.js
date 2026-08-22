import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        globals: true,           // describe/it/expect sans import
        environment: "jsdom",    // simule le DOM pour les sheets
        include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        exclude: ["**/node_modules/**", "**/.claude/**"],
        // Les tests UAT copient/lisent de vrais dossiers de monde (LevelDB inclus) :
        // sous charge (exécution parallèle de tous les fichiers de tests), le défaut
        // de 5000 ms est parfois dépassé sans qu'aucune assertion ne soit en cause.
        testTimeout: 20000,
        setupFiles: ["./tests/setup.js"], coverage: {
            provider: "v8", reporter: ["text", "html"], include: ["src/**/*.js"],
        },
    },
});