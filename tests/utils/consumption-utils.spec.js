import ConsumptionUtils from '../../scripts/utils/consumption-utils.js';

describe('ConsumptionUtils', () => {

    var resources = {currentDrop: -1, action: -1, mana: -1, zeal: -1, hp: -1, drop: -1};
    var actor = {
        system: {
            fq: {
                cards: {currentDrop: 2},
                action: {value: 2},
                mana: {value: 2},
                zeal: {value: 2}
            },
            attributes: {hp: {value: 2}}
        },
        update: jest.fn().mockResolvedValue(null)
    };

    beforeEach(() => {
        jest.clearAllMocks();
        global.game = {
            i18n: {
                localize: () => ""
            }
        };
        global.ChatMessage = {
            create: jest.fn().mockResolvedValue({id: '1234', content: 'Mocked message'}),
            getSpeaker: jest.fn().mockResolvedValue(null),
        }
    });

    test('checkResourcesNoActor', () => {
        const result = ConsumptionUtils.checkResources(null, null);
        expect(result).toEqual(true);
    });

    test('checkResourcesNotEnoughHp', () => {
        const result = ConsumptionUtils.checkResources(
            {hp: -7},
            {system: {attributes: {hp: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test('checkResourcesNotEnoughAction', () => {
        const result = ConsumptionUtils.checkResources(
            {action: -7},
            {system: {fq: {action: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test('checkResourcesNotEnoughMana', () => {
        const result = ConsumptionUtils.checkResources(
            {mana: -7},
            {system: {fq: {mana: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test('checkResourcesNotEnoughZeal', () => {
        const result = ConsumptionUtils.checkResources(
            {zeal: -7},
            {system: {fq: {zeal: {value: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test('checkResourcesNotEnoughZeal', () => {
        const result = ConsumptionUtils.checkResources(
            {drop: -7},
            {system: {fq: {cards: {currentDrop: 6}}}});
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(result).toEqual(false);
    });

    test('checkResourcesOk', () => {
        const result = ConsumptionUtils.checkResources(
            resources, actor);
        expect(ChatMessage.create).toHaveBeenCalledTimes(0);
        expect(result).toEqual(true);
    });

    test('checkConsumeResources', () => {
        ConsumptionUtils.consumeResources(resources, actor);
        expect(actor.update).toHaveBeenCalledTimes(5);
    });
});
