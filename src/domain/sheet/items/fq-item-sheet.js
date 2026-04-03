

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
