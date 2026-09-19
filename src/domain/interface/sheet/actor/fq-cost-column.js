/**
 * Descripteur de la colonne « Coût FQ », au format des colonnes de l'élément
 * d'inventaire dnd5e (`InventoryElement.COLUMNS`). L'ordre la place juste après
 * le nom de l'objet ; la priorité la garde visible quand la feuille rétrécit,
 * les colonnes de plus faible priorité disparaissant en premier.
 */
export const FQ_COST_COLUMN = Object.freeze({
    id: "fqCost",
    width: 90,
    order: 150,
    priority: 900,
    label: "FQCARDENGINE.FqCostColumn",
    template: "modules/fq-card-engine/src/templates/actors/parts/fq-cost-column.hbs"
});

/**
 * Coûts FQ affichables d'un objet, dans l'ordre d'affichage : champ de
 * `item.system.fq`, abréviation, libellé complet (infobulle) et classe CSS.
 */
const COSTS = Object.freeze([
    {field: "action", short: "FQCARDENGINE.ShortActionPoints", label: "FQCARDENGINE.ActionPoints", cssClass: "action-cost"},
    {field: "mana", short: "FQCARDENGINE.ShortManaPoints", label: "FQCARDENGINE.ManaPoints", cssClass: "mana-cost"},
    {field: "zeal", short: "FQCARDENGINE.ShortZealPoints", label: "FQCARDENGINE.ZealPoints", cssClass: "zeal-cost"},
    {field: "hp", short: "FQCARDENGINE.ShortLife", label: "FQCARDENGINE.Life", cssClass: "hp-cost"},
]);

/**
 * Prépare les coûts FQ d'un objet pour la colonne « Coût FQ ».
 *
 * Un coût est stocké en négatif et s'affiche sans signe ; une valeur positive
 * est un gain et s'affiche précédée de « + ». Les valeurs nulles sont omises.
 * Un objet sans activité n'affiche rien : le coût n'est prélevé qu'à l'usage
 * d'une activité, et le coût d'action par défaut du schéma ferait sinon
 * apparaître un coût sur chaque armure ou objet inerte.
 *
 * @param {object} item - L'objet dnd5e (`system.fq`, `system.activities`).
 *
 * @returns {{value: string, short: string, label: string, cssClass: string}[]} Les coûts à afficher.
 */
export function fqCostEntries(item) {
    const fq = item?.system?.fq;
    if (!fq || !item.system.activities?.size) {
        return [];
    }
    return COSTS.filter(({field}) => Number(fq[field])).map(({field, short, label, cssClass}) => {
        const value = Number(fq[field]);
        return {
            value: value < 0 ? `${-value}` : `+${value}`,
            short: game.i18n.localize(short),
            label: game.i18n.localize(label),
            cssClass
        };
    });
}

/**
 * Ajoute la colonne « Coût FQ » à une liste de colonnes de section, sans
 * muter la liste reçue : les sections du grimoire dnd5e partagent le même
 * tableau de colonnes. Sans effet si la colonne est déjà présente.
 *
 * @param {(string|object)[]} columns - Les colonnes de la section (identifiants ou descripteurs).
 *
 * @returns {(string|object)[]} Les colonnes, complétées de la colonne « Coût FQ ».
 */
export function withFqCostColumn(columns = []) {
    if (columns.some(column => (typeof column === "string" ? column : column?.id) === FQ_COST_COLUMN.id)) {
        return columns;
    }
    return [...columns, {...FQ_COST_COLUMN}];
}
