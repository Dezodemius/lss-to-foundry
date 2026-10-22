import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createIdMapper } from '../../scripts/core/ids.mjs';
import {
    advancementOrigin,
    buildOriginItems,
    clampLevel,
    disableTransferEffects,
    grantLevelApplies,
    hitDiceSpent,
    hitDieDenomination,
    hitPointsValue,
    isAutomaticGrant,
} from '../../scripts/foundry/class-builder.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ids = createIdMapper(JSON.parse(readFileSync(join(root, 'data', 'lss-dnd5e-ids.json'), 'utf8')));

describe('pure helpers', () => {
    it('hitPointsValue gives max for the first level and avg for the rest', () => {
        expect(hitPointsValue(3)).toEqual({ 1: 'max', 2: 'avg', 3: 'avg' });
        expect(hitPointsValue(1)).toEqual({ 1: 'max' });
        expect(hitPointsValue(0)).toEqual({});
    });

    it('hitDieDenomination accepts only dnd5e dice', () => {
        expect(hitDieDenomination('d8')).toBe('d8');
        expect(hitDieDenomination(' D10 ')).toBe('d10');
        expect(hitDieDenomination('multiclass')).toBeNull();
        expect(hitDieDenomination('d20')).toBeNull();
        expect(hitDieDenomination(undefined)).toBeNull();
    });

    it('hitDiceSpent is levels minus the dice left, clamped to 0..levels', () => {
        expect(hitDiceSpent(3, 1)).toBe(2);
        expect(hitDiceSpent(3, 3)).toBe(0);
        expect(hitDiceSpent(3, 9)).toBe(0);
        expect(hitDiceSpent(3, '')).toBeNull();
        expect(hitDiceSpent(3, undefined)).toBeNull();
    });

    it('isAutomaticGrant follows dnd5e automaticApplicationValue', () => {
        expect(isAutomaticGrant({ items: [{ uuid: 'a', optional: false }], optional: false, spell: null })).toBe(true);
        expect(isAutomaticGrant({ items: [{ uuid: 'a' }], optional: true, spell: null })).toBe(false);
        expect(isAutomaticGrant({ items: [{ uuid: 'a', optional: true }], optional: false })).toBe(false);
        expect(isAutomaticGrant({ items: [{ uuid: 'a' }], optional: false, spell: { ability: ['int', 'wis'] } })).toBe(false);
    });

    it('grantLevelApplies: origin grants at level 0 only, class and subclass up to the class level', () => {
        expect(grantLevelApplies('origin', 0, 5)).toBe(true);
        expect(grantLevelApplies('origin', 1, 5)).toBe(false);
        expect(grantLevelApplies('class', 1, 3)).toBe(true);
        expect(grantLevelApplies('class', 4, 3)).toBe(false);
        expect(grantLevelApplies('class', 0, 3)).toBe(false);
        expect(grantLevelApplies('subclass', 3, 3)).toBe(true);
    });

    it('disableTransferEffects changes only transferred effects and marks them', () => {
        const { effects, disabled } = disableTransferEffects([
            { name: 'passive', transfer: true, disabled: false },
            { name: 'on use', transfer: false },
        ]);
        expect(disabled).toBe(1);
        expect(effects[0].disabled).toBe(true);
        expect(effects[0].flags['lss-to-foundry']).toMatchObject({ imported: true, disabledFeatureEffect: true });
        expect(effects[1]).toEqual({ name: 'on use', transfer: false });
    });

    it('advancementOrigin and clampLevel', () => {
        expect(advancementOrigin('abc', 'def')).toBe('abc.def');
        expect(clampLevel(25)).toBe(20);
        expect(clampLevel('x')).toBe(1);
        expect(clampLevel(0)).toBe(1);
    });
});

/**
 * In-memory stand-in for CompendiumIndex: `docs` are plain compendium sources with uuid and pack.
 */
function fakeIndex(docs) {
    const refOf = (doc) => ({
        uuid: doc.uuid, packId: doc.packId, _id: doc._id, name: doc.name, type: doc.type, identifier: doc.system.identifier,
    });
    return {
        findByIdentifier(identifier, { types = null, packIds = null } = {}) {
            const hit = docs.find((doc) => doc.system.identifier === identifier
                && (!types || types.includes(doc.type))
                && (!packIds || packIds.includes(doc.packId)));
            return hit ? refOf(hit) : null;
        },
        async getSource(ref) {
            const doc = docs.find((item) => item.uuid === ref.uuid);
            return doc ? structuredClone(doc.source) : null;
        },
    };
}

const CLASS_UUID = 'Compendium.dnd5e.classes24.Item.clericsrc000000a';
const SUBCLASS_UUID = 'Compendium.dnd5e.classes24.Item.lifesrc0000000b';
const RACE_UUID = 'Compendium.dnd5e.origins24.Item.humansrc000000c';
const BACKGROUND_UUID = 'Compendium.dnd5e.origins24.Item.acolytesrc0000d';
const GRANT_CLASS = 'Compendium.dnd5e.classfeatures.Item.spellcastingcls1';
const GRANT_CLASS_OPTIONAL = 'Compendium.dnd5e.classfeatures.Item.optionalcls2';
const GRANT_SUBCLASS = 'Compendium.dnd5e.classfeatures.Item.discipleoflife3';
const GRANT_RACE = 'Compendium.dnd5e.origins24.Item.humanfeat00000e';
const GRANT_BACKGROUND_SPELL = 'Compendium.dnd5e.spells24.Item.guidance000000f';

/**
 * Document-like feature: `toObject()` returns its source, the way a compendium Document does.
 * The source keeps a `babele` flag, which the builder must remove.
 */
function feature(uuid, name, _id, effects = [{ name: `${name} effect`, transfer: true, disabled: false }], type = 'feat') {
    const source = {
        _id,
        name,
        type,
        system: { identifier: name.toLowerCase().replace(/\s+/g, '-'), description: { value: '' } },
        effects,
        flags: { babele: { translated: true } },
        _stats: { compendiumSource: null },
    };
    return { uuid, _id, name, type, toObject: () => structuredClone(source) };
}

const docs = [
    {
        uuid: CLASS_UUID, _id: 'clericsrc000000a', name: 'Cleric', type: 'class', packId: 'dnd5e.classes24',
        system: { identifier: 'cleric' },
        source: {
            _id: 'clericsrc000000a', name: 'Cleric', type: 'class',
            system: {
                identifier: 'cleric', levels: 1, hd: { denomination: 'd8', spent: 0, additional: '' },
                advancement: [
                    { _id: 'hpadvancement001', type: 'HitPoints', level: 1, configuration: {}, value: {} },
                    { _id: 'subadvancement01', type: 'Subclass', level: 3, configuration: {}, value: {} },
                    {
                        _id: 'grantclassadv001', type: 'ItemGrant', level: 1, value: {},
                        configuration: { items: [{ uuid: GRANT_CLASS, optional: false }], optional: false, spell: null },
                    },
                    {
                        _id: 'grantclassadv002', type: 'ItemGrant', level: 2, value: {},
                        configuration: { items: [{ uuid: GRANT_CLASS_OPTIONAL, optional: false }], optional: true, spell: null },
                    },
                ],
            },
        },
    },
    {
        uuid: SUBCLASS_UUID, _id: 'lifesrc0000000b', name: 'Life Domain', type: 'subclass', packId: 'dnd5e.classes24',
        system: { identifier: 'life' },
        source: {
            _id: 'lifesrc0000000b', name: 'Life Domain', type: 'subclass',
            system: {
                identifier: 'life', classIdentifier: 'cleric',
                advancement: [
                    {
                        _id: 'grantsubadv0001', type: 'ItemGrant', level: 3, value: {},
                        configuration: { items: [{ uuid: GRANT_SUBCLASS, optional: false }], optional: false, spell: null },
                    },
                ],
            },
        },
    },
    {
        uuid: RACE_UUID, _id: 'humansrc000000c', name: 'Human', type: 'race', packId: 'dnd5e.origins24',
        system: { identifier: 'human' },
        source: {
            _id: 'humansrc000000c', name: 'Human', type: 'race',
            system: {
                identifier: 'human',
                advancement: [
                    {
                        _id: 'grantraceadv001', type: 'ItemGrant', level: 0, value: {},
                        configuration: { items: [{ uuid: GRANT_RACE, optional: false }], optional: false, spell: null },
                    },
                ],
            },
        },
    },
    {
        uuid: BACKGROUND_UUID, _id: 'acolytesrc0000d', name: 'Acolyte', type: 'background', packId: 'dnd5e.origins24',
        system: { identifier: 'acolyte' },
        source: {
            _id: 'acolytesrc0000d', name: 'Acolyte', type: 'background',
            system: {
                identifier: 'acolyte',
                advancement: [
                    {
                        _id: 'grantbgadv0001', type: 'ItemGrant', level: 0, value: {},
                        configuration: { items: [{ uuid: GRANT_BACKGROUND_SPELL, optional: false }], optional: false, spell: null },
                    },
                ],
            },
        },
    },
];

const features = new Map([
    [GRANT_CLASS, feature(GRANT_CLASS, 'Spellcasting', 'featureclass0001')],
    [GRANT_CLASS_OPTIONAL, feature(GRANT_CLASS_OPTIONAL, 'Optional', 'featureclass0002')],
    [GRANT_SUBCLASS, feature(GRANT_SUBCLASS, 'Disciple of Life', 'featuresub00001')],
    [GRANT_RACE, feature(GRANT_RACE, 'Human Feat', 'featurerace0001', [])],
    [GRANT_BACKGROUND_SPELL, feature(GRANT_BACKGROUND_SPELL, 'Guidance', 'spellguidance0001', [], 'spell')],
]);

const char = {
    edition: '2024',
    level: 3,
    data: {
        info: {
            charClass: { value: 'Cleric', id: 'cleric' },
            charSubclass: { value: 'Life Domain', id: 'life-domain' },
            race: { value: 'Human', id: 'human' },
            background: { value: 'Acolyte', id: 'acolyte' },
            level: { value: 3 },
        },
        vitality: { 'hit-die': { value: 'd8' }, 'hp-dice-current': { value: 2 }, 'hp-dice-multi': {} },
    },
};

describe('buildOriginItems', () => {
    let result;
    let report;
    let counter;

    beforeAll(async () => {
        globalThis.foundry = {
            utils: {
                fromUuid: async (uuid) => features.get(uuid) ?? null,
                randomID: (length = 16) => 'r'.repeat(length),
                deepClone: (value) => structuredClone(value),
            },
        };
        counter = 0;
        report = { warnings: [] };
        result = await buildOriginItems(char, {
            edition: '2024',
            includeFeatures: true,
            ids,
            randomID: () => `gen${String(++counter).padStart(13, '0')}`,
            index: fakeIndex(docs),
        }, report);
    });

    it('creates race, background, class and subclass, and records them in details', () => {
        const types = result.items.map((item) => item.type);
        expect(result.items.find((item) => item.type === 'race')?.name).toBe('Human');
        expect(result.items.find((item) => item.type === 'background')?.name).toBe('Acolyte');
        expect(result.classIdentifier).toBe('cleric');
        expect(types).toContain('subclass');
        expect(result.details.race).toBe(result.items.find((item) => item.type === 'race')._id);
        expect(result.details.background).toBe(result.items.find((item) => item.type === 'background')._id);
        expect(result.details.originalClass).toBe(result.classItem._id);
    });

    it('sets levels, hit dice, HitPoints and the Subclass value on the class', () => {
        const cls = result.classItem;
        expect(cls.system.levels).toBe(3);
        expect(cls.system.hd).toMatchObject({ denomination: 'd8', spent: 1 });
        const hp = cls.system.advancement.find((adv) => adv.type === 'HitPoints');
        expect(hp.value).toEqual({ 1: 'max', 2: 'avg', 3: 'avg' });
        const sub = result.items.find((item) => item.type === 'subclass');
        const subAdv = cls.system.advancement.find((adv) => adv.type === 'Subclass');
        expect(subAdv.value).toEqual({ document: sub._id, uuid: SUBCLASS_UUID });
        expect(sub.system.classIdentifier).toBe('cleric');
    });

    it('gives every item a fresh id and removes babele flags', () => {
        const ids = result.items.map((item) => item._id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const item of result.items) expect(item.flags?.babele).toBeUndefined();
    });

    it('copies automatic class, subclass, race and background features with origin flags', () => {
        const cls = result.classItem;
        const sub = result.items.find((item) => item.type === 'subclass');
        const race = result.items.find((item) => item.type === 'race');
        const bg = result.items.find((item) => item.type === 'background');

        const spellcasting = result.items.find((item) => item.name === 'Spellcasting');
        expect(spellcasting.flags.dnd5e).toMatchObject({
            sourceId: GRANT_CLASS,
            advancementOrigin: `${cls._id}.grantclassadv001`,
            advancementRoot: `${cls._id}.grantclassadv001`,
        });
        expect(spellcasting._stats.compendiumSource).toBe(GRANT_CLASS);

        const disciple = result.items.find((item) => item.name === 'Disciple of Life');
        expect(disciple.flags.dnd5e.advancementOrigin).toBe(`${sub._id}.grantsubadv0001`);

        const humanFeat = result.items.find((item) => item.name === 'Human Feat');
        expect(humanFeat.flags.dnd5e.advancementOrigin).toBe(`${race._id}.grantraceadv001`);

        expect(bg).toBeDefined();
    });

    it('records value.added on the granting advancement', () => {
        const cls = result.classItem;
        const spellcasting = result.items.find((item) => item.name === 'Spellcasting');
        const grant = cls.system.advancement.find((adv) => adv._id === 'grantclassadv001');
        expect(grant.value.added).toEqual({ [spellcasting._id]: GRANT_CLASS });
    });

    it('does not apply optional grants and says so in the report', () => {
        const cls = result.classItem;
        expect(result.items.some((item) => item.name === 'Optional')).toBe(false);
        expect(cls.system.advancement.find((adv) => adv._id === 'grantclassadv002').value.added).toBeUndefined();
    });

    it('turns off transferred effects of granted features', () => {
        const spellcasting = result.items.find((item) => item.name === 'Spellcasting');
        expect(spellcasting.effects[0].disabled).toBe(true);
        expect(spellcasting.effects[0].flags['lss-to-foundry'].disabledFeatureEffect).toBe(true);
    });

    it('skips a spell granted by a background and reports it', () => {
        expect(result.items.some((item) => item.type === 'spell')).toBe(false);
        expect(report.warnings.some((message) => message.includes('Guidance') && message.includes('LSS'))).toBe(true);
    });

    it('warns about multiclass only when the hit-dice pool has more than one die type', async () => {
        const build = async (pool) => {
            const warnings = [];
            const variant = structuredClone(char);
            variant.data.vitality['hp-dice-multi'] = pool;
            await buildOriginItems(variant, {
                edition: '2024', includeFeatures: false, ids, randomID: () => 'm'.repeat(16), index: fakeIndex(docs),
            }, { warnings });
            return warnings.some((message) => message.startsWith('Мультикласс'));
        };
        expect(await build({ d8: { max: 3, current: 2 } })).toBe(false);
        expect(await build({ d8: { max: 3, current: 2 }, d10: { max: 2, current: 2 } })).toBe(true);
    });

    it('does not copy features when includeFeatures is false', async () => {
        const plain = await buildOriginItems(char, {
            edition: '2024', includeFeatures: false, ids, randomID: () => 'p'.repeat(16), index: fakeIndex(docs),
        }, { warnings: [] });
        expect(plain.items.map((item) => item.type).sort()).toEqual(['background', 'class', 'race', 'subclass']);
    });
});
