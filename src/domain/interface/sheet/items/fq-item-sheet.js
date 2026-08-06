/**
 * Feuille d'objet FQ. Étend la feuille d'objet dnd5e en remplaçant la barre
 * d'onglets par un gabarit FQ afin d'exposer les onglets propres au module.
 *
 * @extends dnd5e.applications.item.ItemSheet5e
 */
export default class FqItemSheet extends dnd5e.applications.item.ItemSheet5e {

    /** @override */
    static PARTS = {
        ... dnd5e.applications.item.ItemSheet5e.PARTS,
        ... {
            tabs: {
                template: `modules/fq-card-engine/src/templates/items/fq-item-tabs.hbs`,
                templates: ["templates/generic/tab-navigation.hbs"]
            },
        }
    };
}
