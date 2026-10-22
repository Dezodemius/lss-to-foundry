import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseLssFile } from '../../scripts/core/parse.mjs';
import { createIdMapper } from '../../scripts/core/ids.mjs';
import { createSpellIndex } from '../../scripts/core/spell-refs.mjs';
import {
    hpOverallFormula,
    slotPlan,
    slotTarget,
    splitConditions,
    writeActor,
} from '../../scripts/foundry/actor-writer.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts), 'utf8'));

describe('hpOverallFormula', () => {
    it('adds the difference to an empty overall bonus', () => {
        expect(hpOverallFormula({ target: 24, derived: 20, existing: '' })).toBe('4');
        expect(hpOverallFormula({ target: 18, derived: 20 })).toBe('-2');
    });

    it('keeps an existing formula and adds the difference to it', () => {
        expect(hpOverallFormula({ target: 24, derived: 20, existing: '2' })).toBe('(2) + 4');
        expect(hpOverallFormula({ target: 18, derived: 20, existing: '2' })).toBe('(2) - 2');
    });

    it('returns null when nothing has to change', () => {
        expect(hpOverallFormula({ target: 20, derived: 20, existing: '' })).toBeNull();
    });
});

describe('slotPlan', () => {
    it('value is the maximum minus what is filled, no override when dnd5e agrees', () => {
        expect(slotPlan({ total: 4, filled: 1, derivedMax: 4 })).toEqual({ max: 4, value: 3, override: null });
    });

    it('override is the target maximum when dnd5e computes another number', () => {
        expect(slotPlan({ total: 3, filled: 5, derivedMax: 0 })).toEqual({ max: 3, value: 0, override: 3 });
    });

    it('nothing to write for a level without slots', () => {
        expect(slotPlan({ total: 0, filled: 0, derivedMax: 0 })).toEqual({ max: 0, value: 0, override: null });
    });
});

describe('slotTarget', () => {
    it('takes the LSS number as the total on a sheet built by hand', () => {
        expect(slotTarget({ lssTotal: 2, bonus: 1, derivedMax: 4, layered: false })).toBe(3);
        expect(slotTarget({ lssTotal: undefined, derivedMax: 4, layered: false })).toBe(0);
    });

    it('keeps the class slots for a character built by the LSS wizard', () => {
        // `data.spells` holds only the base: the class table is laid on top of it in LSS.
        expect(slotTarget({ lssTotal: undefined, derivedMax: 4, layered: true })).toBe(4);
        expect(slotTarget({ lssTotal: 0, bonus: 1, derivedMax: 4, layered: true })).toBe(5);
        // An export that already carries the total gives the same number.
        expect(slotTarget({ lssTotal: 4, derivedMax: 4, layered: true })).toBe(4);
        expect(slotTarget({ lssTotal: 5, derivedMax: 4, layered: true })).toBe(5);
    });
});

describe('splitConditions', () => {
    it('keeps dnd5e condition ids and reports the rest', () => {
        expect(splitConditions(['Blinded', 'exhaustion', 'weird'])).toEqual({
            known: ['blinded', 'exhaustion'],
            unknown: ['weird'],
        });
        expect(splitConditions(undefined)).toEqual({ known: [], unknown: [] });
    });
});

describe('writeActor', () => {
    const DERIVED_HP = 20;
    let created;
    let fixtureChar;

    /** Actor stand-in. `update` applies paths to itself; the derived HP maximum follows the overall bonus. */
    function fakeActor() {
        const slot = (max) => ({ max, value: 0 });
        const actor = {
            id: 'actor1',
            uuid: 'Actor.actor1',
            updates: [],
            toggles: [],
            system: {
                attributes: { hp: { max: DERIVED_HP, value: 0, temp: 0, bonuses: { overall: '' } }, exhaustion: 0 },
                spells: {
                    spell1: slot(4), spell2: slot(0), spell3: slot(0), spell4: slot(0), spell5: slot(0),
                    spell6: slot(0), spell7: slot(0), spell8: slot(0), spell9: slot(0),
                    pact: { max: 0, level: 0, value: 0 },
                },
            },
            async update(changes) {
                this.updates.push(changes);
                for (const [path, value] of Object.entries(changes)) {
                    const keys = path.split('.');
                    let target = this;
                    for (const key of keys.slice(0, -1)) target = target[key];
                    target[keys.at(-1)] = value;
                }
                const overall = Number(this.system.attributes.hp.bonuses.overall) || 0;
                this.system.attributes.hp.max = DERIVED_HP + overall;
                // dnd5e takes the slot maximum from `override` when it is set (spellcasting-model.mjs:341).
                for (const slotData of Object.values(this.system.spells)) {
                    if (typeof slotData.override === 'number') slotData.max = slotData.override;
                }
            },
            async toggleStatusEffect(id, options) {
                this.toggles.push([id, options]);
            },
        };
        return actor;
    }

    function installFoundry() {
        created = { data: null, options: null, actor: null };
        globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
        globalThis.game = { user: { can: () => true }, modules: new Map(), items: { contents: [] }, folders: { contents: [] } };
        globalThis.foundry = {
            utils: {
                randomID: (length = 16) => 'a'.repeat(length),
                deepClone: (value) => structuredClone(value),
            },
            documents: {
                Actor: {
                    implementation: {
                        create: async (data, options) => {
                            created.data = data;
                            created.options = options;
                            created.actor = fakeActor();
                            return created.actor;
                        },
                    },
                },
            },
        };
    }

    const emptyIndex = {
        findByIdentifier: () => null,
        getSource: async () => null,
        getDocument: async () => null,
    };

    function context(extraOptions = {}) {
        return {
            folderId: null,
            options: { classFeatures: true, useAvatar: false, extraSpellPacks: [], ...extraOptions },
            ids: createIdMapper(readJson('data', 'lss-dnd5e-ids.json')),
            spellIndex: createSpellIndex(
                readJson('data', 'srd-spell-index-2014.json'),
                readJson('data', 'srd-spell-index-2024.json'),
            ),
            grimoire: [],
            spellCache: new Map(),
            index: emptyIndex,
        };
    }

    beforeEach(() => {
        installFoundry();
        const text = readFileSync(join(root, 'test', 'fixtures', 'lss', 'character-example.json'), 'utf8');
        fixtureChar = parseLssFile(text, 'character-example.json').characters[0];
    });

    it('creates the actor with embedded ids kept and the import flags', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        await writeActor(fixtureChar, context(), report);
        expect(created.options).toEqual({ keepEmbeddedIds: true });
        expect(created.data.type).toBe('character');
        expect(created.data.name).toBe('Сестра Иоланда');
        expect(created.data.flags['lss-to-foundry'].imported).toBe(true);
        expect(created.data.flags['lss-to-foundry'].source).toMatchObject({ fileName: 'character-example.json', edition: '2024' });
    });

    it('moves hit points to the LSS maximum through the overall bonus and sets the current value', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const actor = await writeActor(fixtureChar, context(), report);
        // LSS: hp-max 24 + Disciple of Life (hp.max +3) = 27; dnd5e derives 20 before the correction.
        expect(actor.system.attributes.hp.max).toBe(27);
        expect(actor.system.attributes.hp.bonuses.overall).toBe('7');
        expect(actor.system.attributes.hp.value).toBe(24);
        expect(report.warnings.filter((message) => message.startsWith('Сверка'))).toEqual([]);
    });

    it('writes spell slots: current value from filled, override only where dnd5e differs', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const actor = await writeActor(fixtureChar, context(), report);
        // LSS: 1st level 4 slots, 1 filled; 2nd level 2 slots, none filled. dnd5e derives 4 and 0.
        expect(actor.system.spells.spell1.value).toBe(3);
        expect(actor.updates.at(-1)['system.spells.spell1.override']).toBeUndefined();
        expect(actor.system.spells.spell2.override).toBe(2);
        expect(actor.system.spells.spell2.value).toBe(2);
    });

    it('applies known conditions as status toggles and reports the unknown ones', async () => {
        fixtureChar.data.conditions = ['Blinded', 'weird-state'];
        fixtureChar.data.exhaustion = 2;
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const actor = await writeActor(fixtureChar, context(), report);
        expect(actor.toggles).toEqual([['blinded', { active: true }]]);
        expect(actor.updates.some((changes) => changes['system.attributes.exhaustion'] === 2)).toBe(true);
        expect(report.warnings.some((message) => message.includes('weird-state'))).toBe(true);
    });

    it('keeps going when the class is not in the compendium: it is reported, the actor is still created', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        await writeActor(fixtureChar, context(), report);
        const originTypes = ['class', 'subclass', 'race', 'background'];
        expect(created.data.items.filter((item) => originTypes.includes(item.type))).toEqual([]);
        // The fixture weapon and resource are still written.
        expect(created.data.items.map((item) => item.name)).toEqual(expect.arrayContaining(['Булава', 'Channel Divinity']));
        expect(report.warnings.some((message) => message.includes('Класс'))).toBe(true);
    });
});
