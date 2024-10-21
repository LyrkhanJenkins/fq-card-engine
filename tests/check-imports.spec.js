const glob = require("glob");
const fs = require("fs-extra");

// Fonction pour vérifier les imports dans un fichier
function checkImportsInFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
    let hasError = false;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath.endsWith(".js") && !importPath.endsWith(".mjs") && !importPath.startsWith("http") && !importPath.startsWith("./node_modules")) {
            console.error(`L'import '${importPath}' dans le fichier '${filePath}' n'a pas l'extension .js`);
            hasError = true;
        }
    }

    return hasError;
}

// Fonction pour vérifier tous les fichiers source
async function checkAllImports(baseDir = "./scripts") {
    return new Promise((resolve, reject) => {
        glob(`${baseDir}/**/*.js`, async (err, files) => {
            if (err) {
                return reject("Erreur lors de la recherche des fichiers:", err);
            }

            let overallError = false;

            for (const file of files) {
                if (await checkImportsInFile(file)) {
                    overallError = true;
                }
            }

            return resolve(overallError);
        });
    });
}

describe("Check Imports", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("checkImports", () => {
        test("should warn if imports without suffix .js", async () => {

            let hasImportErrors = await checkAllImports();
            console.log(`Has Import Errors: ${hasImportErrors}`);
            expect(hasImportErrors).toBe(false); // Le test échoue si des erreurs d'importation sont trouvées
        });
    });
});
