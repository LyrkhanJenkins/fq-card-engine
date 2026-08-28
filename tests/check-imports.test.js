import {beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import path from "path";

function getJsFilesRecursive(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    return entries.flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory()
            ? getJsFilesRecursive(fullPath)
            : entry.name.endsWith(".js") ? [fullPath] : [];
    });
}

function checkImportsInFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
    let hasError = false;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (
            !importPath.endsWith(".js") &&
            !importPath.endsWith(".mjs") &&
            !importPath.startsWith("http") &&
            !importPath.startsWith("./node_modules")
        ) {
            console.error(`L'import '${importPath}' dans '${filePath}' n'a pas l'extension .js`);
            hasError = true;
        }
    }

    return hasError;
}

function checkAllImports(baseDir = "./src") {
    const files = getJsFilesRecursive(baseDir);
    return files.some(file => checkImportsInFile(file));
}

describe("Check Imports", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("checkImports", () => {
        test("should warn if imports without suffix .js", () => {
            const hasImportErrors = checkAllImports();
            console.error(`Has Import Errors: ${hasImportErrors}`);
            expect(hasImportErrors).toBe(false);
        });
    });
});
