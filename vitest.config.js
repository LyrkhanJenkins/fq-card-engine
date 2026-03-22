import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        globals: true,           // describe/it/expect sans import
        environment: "jsdom",    // simule le DOM pour les sheets
        setupFiles: ["./tests/setup.js"], coverage: {
            provider: "v8", reporter: ["text", "html"], include: ["src/**/*.js"],
        },
    },
});