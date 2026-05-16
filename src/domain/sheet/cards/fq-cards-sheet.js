export default class FqCardsSheet extends foundry.applications.sheets.CardDeckConfig {
    constructor(object, options) {
        super(object, options);
    }

    /** @override */
    static PARTS = {
        header: {template: "templates/cards/deck/header.hbs"},
        tabs: {template: "templates/generic/tab-navigation.hbs"},
        details: {template: "templates/cards/deck/details.hbs"},
        cards: {template: `modules/fq-card-engine/src/templates/fq-form/cards/cards.hbs`, scrollable: ["ol[data-cards]"]},
        footer: {template: "templates/generic/form-footer.hbs"}
    };

    /** @inheritDoc */
    _prepareButtons() {
        if (game.user.isGM) {
            return super._prepareButtons();
        } else {
            return super._prepareButtons().filter((button) => button.type !== "submit");
        }
    }

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        const partContext = await super._preparePartContext(partId, context, options);
        if (partId === "cards") {
            partContext.isYourDeck = (partContext?.document.system?.fq?.type === "DECK" && partContext?.document.system?.fq?.owner === game.user.id);
        }
        return partContext;
    }
}
