/**
 * Helpers génériques sur les objets et le système de fichiers, sans logique
 * métier FQ (copie profonde, identifiant aléatoire, tirage de fichier).
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class ObjectUtils {

    /**
     * Génère un identifiant aléatoire alphanumérique en majuscules.
     *
     * @param {number} length - La longueur de l'identifiant à générer.
     *
     * @returns {string} L'identifiant aléatoire.
     */
    static generateRandomId(length) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters.charAt(randomIndex);
        }

        return result;
    }

    /**
     * Effectue une copie profonde d'une valeur (objets et tableaux inclus). Les
     * primitives sont retournées telles quelles.
     *
     * @param {*} obj - La valeur à copier.
     *
     * @returns {*} Une copie profonde de la valeur.
     */
    static deepCopy(obj) {
        if (obj === null || typeof obj !== "object") return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => ObjectUtils.deepCopy(item));
        }

        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, ObjectUtils.deepCopy(value)])
        );
    }

    /**
     * MUST BE EXECUTE AS A GM
     * Retourne un chemin de fichier aléatoire depuis un dossier virtuel de Foundry
     * @param {string} folderPath - Le chemin virtuel (ex: "modules/mon-module/images")
     * @returns {Promise<string|null>}
     */
    static async getRandomFileFromFolder(folderPath) {
        try {
            const response = await foundry.applications.apps.FilePicker.implementation.browse("data", folderPath);

            if (!response.files.length) return null;

            const randomIndex = Math.floor(Math.random() * response.files.length);
            return response.files[randomIndex];
        } catch (err) {
            console.error("Erreur lors du browse :", err);
            return null;
        }
    }
}
