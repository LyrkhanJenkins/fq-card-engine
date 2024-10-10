// DamageUtils.spec.js

import DamageUtils from "../../scripts/utils/damage-utils.js";
import {DAMAGES_COLOR} from "../../scripts/utils/fq-constants";

describe('DamageUtils', () => {
    let actor;

    beforeEach(() => {
        jest.clearAllMocks();
        actor = {
            system: {
                fq: {
                    bonus: {
                        damage: 5,
                        heal: 10
                    },
                    attributes: {
                        critical: 1,
                        evasion: 2
                    }
                }
            }
        };

        // Mock necessary Foundry VTT objects/functions
        global.ChatMessage = {
            getSpeaker: jest.fn(() => ({})),
            create: jest.fn()
        };
        global.Roll = jest.fn(function (formula) {
            this.formula = formula;
            this.total = Math.floor(Math.random() * 20) + 1; // Mock a random total
            this.evaluate = async () => this;
            this.toMessage = jest.fn(async () => ({id: 'messageId'}));
        });
        global.game = {
            i18n: {
                localize: () => ""
            },
            user: {
                targets: new Set([{document: {name: "Target1", actorId: "actor1"}}]),
                character: {_id: "userCharacterId"}
            },
            actors: {
                get: jest.fn((id) => ({system: {fq: {attributes: {evasion: 3}}}}))
            },
            dice3d: {
                waitFor3DAnimationByMessageID: jest.fn(async () => {
                })
            }
        };
        global.foundry = {
            audio: {
                AudioHelper: {
                    play: jest.fn()
                }
            }
        };
    });

    it('should build damage dice launcher with bonus', async () => {
        const result = await DamageUtils.buildDamageDiceLauncher(actor, '1d8', 1, -9999);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it('should build heal dice launcher with bonus', async () => {
        const result = await DamageUtils.buildHealDiceLauncher(actor, '1d8', 1);
        expect(result).toBeDefined();
        expect(result[0].value).toBeGreaterThan(0);
    });

    it('should add bonuses to heal', async () => {
        const result = await DamageUtils.addBonusesToHeal(actor, 10, 1);
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true); // Either 10 or 20, depending on crit
    });

    it('should add bonuses to damage', async () => {
        const result = await DamageUtils.addBonusesToDamage(actor, 10, 1, -999); // No eva
        expect(result).toBeDefined();
        expect(result.length).toBe(1);
        expect(result[0].value >= 10).toBe(true); // Either 0, 10 or 20, depending on evasion and crit
    });

    it('should roll with success value result', async () => {
        const result = await DamageUtils.rollWithSuccessValueResultAsync(actor, '1d20', {
            color: DAMAGES_COLOR,
            title: 'Test'
        });
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    it('should display roll result', () => {
        DamageUtils.displayResult(actor, [{key: 'Test', value: 10}], ['Manual Action']);
        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
    });

    it('should handle sound effect', () => {
        DamageUtils.handleSoundEffect('[fire]', null, [{evasion: false}], 'custom-sound.mp3');
        expect(foundry.audio.AudioHelper.play).toHaveBeenCalledTimes(1);
    });
});
