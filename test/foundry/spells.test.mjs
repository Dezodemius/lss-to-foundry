import { beforeEach, describe, expect, it } from 'vitest';
import {
    applySpellState,
    buildSpellItems,
    findSrdSpell,
    preparedState,
    spellAbility,
    spellMethod,
    spellPackPlan,
} from '../../scripts/foundry/spells.mjs';

const SPELLS = [
    { packId: 'dnd5e.spells', _id: 'fireball0000000a1', identifier: 'fireball', name: 'Fireball', level: 3 },
    { packId: 'dnd5e.spells', _id: 'blindness0000000b', identifier: 'blindness-deafness', name: 'Blindness/Deafness', level: 2 },
    { packId: 'dnd5e.spells', _id: 'antipathy0000000c', identifier: 'antipathy-sympathy', name: 'Antipathy/Sympathy', level: 6 },
    { packId: 'dnd5e.spells24', _id: 'iceknife00000000d', identifier: 'ice-knife', name: 'Ice Knife', level: 1 },
];

/** Index stand-in: `findByIdentifier` and `getDocument` like CompendiumIndex, with fake documents. */
function fakeSpellIndex(rows = SPELLS) {
    return {
        findByIdentifier(identifier, { types = null, packIds = null } = {}) {
            const hit = rows.find((row) => row.identifier === identifier
                && (!types || types.includes('spell'))
                && (!packIds || packIds.includes(row.packId)));
            if (!hit) return null;
            return { uuid: `Compendium.${hit.packId}.Item.${hit._id}`, packId: hit.packId, _id: hit._id, name: hit.name, type: 'spell', identifier };
        },
        async getDocument(reference) {
            const row = rows.find((item) => item._id === reference._id && item.packId === reference.packId);
            if (!row) return null;
            const source = {
                _id: row._id,
                name: row.name,
                type: 'spell',
                system: { identifier: row.identifier, level: row.level, activities: { act1: { _id: 'act1' } } },
                flags: { babele: { translated: true } },
                _stats: { compendiumSource: null },
            };
            return { uuid: `Compendium.${row.packId}.Item.${row._id}`, toObject: () => structuredClone(source) };
        },
    };
}

/** Minimal Foundry globals: world items, folders, and the collection helper used for SRD copies. */
function installFoundry({ canCreate = true, worldItems = [] } = {}) {
    const items = [...worldItems];
    const folders = [];
    const created = { items: 0, folders: 0 };
    let counter = 0;

    function makeWorldItem(id, data) {
        return {
            id,
            uuid: `Item.${id}`,
            type: data.type,
            name: data.name,
            folder: data.folder ?? null,
            flags: structuredClone(data.flags ?? {}),
            getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
            toObject() { return structuredClone({ ...data, _id: id }); },
        };
    }

    globalThis.foundry = {
        utils: {
            randomID: (length = 16) => 'w'.repeat(length),
            deepClone: (value) => structuredClone(value),
        },
        documents: {
            Folder: {
                implementation: {
                    create: async (data) => {
                        created.folders++;
                        const folder = { id: `folder${folders.length + 1}`, ...data };
                        folders.push(folder);
                        return folder;
                    },
                },
            },
            Item: {
                implementation: {
                    create: async (data) => {
                        created.items++;
                        const doc = makeWorldItem(`world${++counter}`, data);
                        items.push(doc);
                        return doc;
                    },
                },
            },
        },
    };
    globalThis.game = {
        user: { can: (permission) => permission !== 'ITEM_CREATE' || canCreate },
        items: { contents: items },
        folders: { contents: folders },
        collections: new Map([['Item', {
            fromCompendium: (doc, { clearFolder = false } = {}) => {
                const data = structuredClone(doc.toObject());
                delete data._id;
                if (clearFolder) delete data.folder;
                data._stats = { ...(data._stats ?? {}), compendiumSource: doc.uuid };
                return data;
            },
        }]]),
    };
    return { items, folders, created };
}

/** GrimoireSpell-like record (the shape of `parseGrimoireEntries`), with a Foundry item source. */
const MY_STRIKE = {
    lssId: null,
    slug: 'my-strike',
    name: 'Мой удар [My Strike]',
    item: { name: 'Мой удар', type: 'spell', system: { level: 1, school: 'evo', activities: {} }, flags: {} },
    raw: { type: 'spell' },
};

function srdRef(overrides) {
    return {
        ref: 'x', kind: 'srd', lssId: null, slug: 'fireball', englishName: 'Fireball', name: null,
        level: 3, edition: '2024', lists: ['prepared'], slotless: false, ability: null, chargeResourceId: null,
        ...overrides,
    };
}

function customRef(overrides) {
    return {
        ref: 'Мой удар [My Strike]', kind: 'custom', lssId: null, slug: 'my-strike', englishName: 'My Strike',
        name: 'Мой удар', level: null, edition: '2024', lists: ['prepared'], slotless: false, ability: null,
        chargeResourceId: null, ...overrides,
    };
}

function options(extra = {}) {
    return {
        edition: '2024',
        classIdentifier: 'wizard',
        grimoire: [],
        extraPacks: [],
        spellFolderName: 'LSS: Гримуар',
        index: fakeSpellIndex(),
        randomID: () => 'r'.repeat(16),
        ...extra,
    };
}

describe('preparation rules (DESIGN §4.1)', () => {
    it('granted spells are always prepared (2)', () => {
        expect(preparedState({ level: 2, lists: ['granted'] })).toBe(2);
        expect(preparedState({ level: 0, lists: ['granted'] })).toBe(2);
    });

    it('cantrips and prepared spells are prepared (1), book-only spells are not (0)', () => {
        expect(preparedState({ level: 0, lists: ['book'] })).toBe(1);
        expect(preparedState({ level: 1, lists: ['prepared'] })).toBe(1);
        expect(preparedState({ level: 1, lists: ['book'] })).toBe(0);
    });

    it('method is innate for slotless spells, pact for the warlock, spell otherwise', () => {
        expect(spellMethod({ slotless: true }, 'wizard')).toBe('innate');
        expect(spellMethod({ slotless: false }, 'warlock')).toBe('pact');
        expect(spellMethod({ slotless: false }, 'cleric')).toBe('spell');
    });

    it('ability is kept only when it is a dnd5e ability key', () => {
        expect(spellAbility({ ability: 'wis' })).toBe('wis');
        expect(spellAbility({ ability: 'luck' })).toBe('');
        expect(spellAbility({ ability: null })).toBe('');
    });

    it('applySpellState takes the level from the item when the reference has none (custom spells)', () => {
        const item = { name: 'Мой удар', type: 'spell', system: { level: 2 } };
        applySpellState(item, customRef({ lists: ['book'] }), 'wizard');
        expect(item.system).toMatchObject({ method: 'spell', prepared: 0, sourceClass: 'wizard', ability: '' });
        applySpellState(item, customRef({ lists: ['prepared'] }), 'wizard');
        expect(item.system.prepared).toBe(1);
    });
});

describe('pack plan and candidates', () => {
    it('extra packs first, then the edition, then the other edition as fallback', () => {
        expect(spellPackPlan('2024', ['homebrew.spells'])).toEqual([
            { packId: 'homebrew.spells', fallback: false, edition: null },
            { packId: 'dnd5e.spells24', fallback: false, edition: '2024' },
            { packId: 'dnd5e.spells', fallback: true, edition: '2014' },
        ]);
    });

    it('does not repeat a pack that is listed twice', () => {
        const plan = spellPackPlan('2014', ['dnd5e.spells']);
        expect(plan.filter((step) => step.packId === 'dnd5e.spells')).toHaveLength(1);
    });

    it('finds a 2014 slug through its alias (blindness-or-deafness)', () => {
        const hit = findSrdSpell({ slug: 'blindness-or-deafness' }, fakeSpellIndex(), spellPackPlan('2014'));
        expect(hit.reference.identifier).toBe('blindness-deafness');
        expect(hit.fallback).toBe(false);
    });

    it('a 2024 character finds a 2014-only slug through the fallback pack and its alias', () => {
        const hit = findSrdSpell({ slug: 'antipathy-or-sympathy' }, fakeSpellIndex(), spellPackPlan('2024'));
        expect(hit.reference.identifier).toBe('antipathy-sympathy');
        expect(hit.fallback).toBe(true);
    });

    it('ice-knife is only in spells24 (dnd5e 5.1.8), so a 2014 character gets it from the fallback', () => {
        const hit = findSrdSpell({ slug: 'ice-knife' }, fakeSpellIndex(), spellPackPlan('2014'));
        expect(hit.reference.packId).toBe('dnd5e.spells24');
        expect(hit.fallback).toBe(true);
    });

    it('returns null for an unknown slug', () => {
        expect(findSrdSpell({ slug: 'no-such-spell' }, fakeSpellIndex(), spellPackPlan('2024'))).toBeNull();
    });
});

describe('buildSpellItems', () => {
    beforeEach(() => installFoundry());

    it('copies an SRD spell from the compendium and sets its preparation', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const items = await buildSpellItems({}, [srdRef({ lssId: 'fireball0000000a1', ability: 'int' })], options(), report);
        expect(items).toHaveLength(1);
        const [item] = items;
        expect(item).toMatchObject({ name: 'Fireball', type: 'spell' });
        expect(item._id).toBeUndefined();
        expect(item._stats.compendiumSource).toBe('Compendium.dnd5e.spells.Item.fireball0000000a1');
        expect(item.flags.babele).toBeUndefined();
        expect(item.flags['lss-to-foundry']).toEqual({ imported: true, lssId: 'fireball0000000a1' });
        expect(item.system).toMatchObject({ method: 'spell', prepared: 1, sourceClass: 'wizard', ability: 'int' });
        expect(report.missingSpells).toEqual([]);
    });

    it('reports an SRD spell that is not in any pack', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const items = await buildSpellItems({}, [srdRef({ slug: 'no-such-spell', englishName: 'No Such Spell' })], options(), report);
        expect(items).toEqual([]);
        expect(report.missingSpells).toEqual(['No Such Spell']);
    });

    it('warns when a spell comes from the other edition pack', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const items = await buildSpellItems({}, [srdRef({ slug: 'ice-knife', englishName: 'Ice Knife', level: 1 })], options({ edition: '2014' }), report);
        expect(items).toHaveLength(1);
        expect(report.warnings.some((message) => message.includes('dnd5e.spells24'))).toBe(true);
    });

    it('creates one world spell for a Grimoire spell and copies it to every character', async () => {
        const { items: world, folders, created } = installFoundry();
        const cache = new Map();
        const grimoire = [MY_STRIKE];
        const first = { warnings: [], missingSpells: [], customSpells: [] };
        const second = { warnings: [], missingSpells: [], customSpells: [] };

        const [copyOne] = await buildSpellItems({}, [customRef()], options({ grimoire, cache }), first);
        const [copyTwo] = await buildSpellItems({}, [customRef()], options({ grimoire, cache }), second);

        expect(created.items).toBe(1);
        expect(created.folders).toBe(1);
        expect(folders[0]).toMatchObject({ name: 'LSS: Гримуар', type: 'Item' });
        expect(world).toHaveLength(1);
        expect(world[0].folder).toBe(folders[0].id);
        for (const copy of [copyOne, copyTwo]) {
            expect(copy._stats.compendiumSource).toBe('Item.world1');
            expect(copy.flags['lss-to-foundry']).toEqual({ imported: true, lssSpellId: 'my-strike' });
            expect(copy._id).toBeUndefined();
            expect(copy.folder).toBeUndefined();
        }
        expect(first.customSpells).toEqual(['Мой удар [My Strike]']);
        expect(second.customSpells).toEqual(['Мой удар [My Strike]']);
    });

    it('reuses a world spell that an earlier import already created', async () => {
        const existing = {
            id: 'old1', uuid: 'Item.old1', type: 'spell', name: 'Мой удар', folder: null,
            flags: { 'lss-to-foundry': { imported: true, lssSpellId: 'my-strike' } },
            getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
            toObject() { return { name: 'Мой удар', type: 'spell', system: { level: 1 }, flags: structuredClone(this.flags) }; },
        };
        const { created } = installFoundry({ worldItems: [existing] });
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const [copy] = await buildSpellItems({}, [customRef()], options({ grimoire: [MY_STRIKE] }), report);
        expect(created.items).toBe(0);
        expect(copy._stats.compendiumSource).toBe('Item.old1');
    });

    it('without ITEM_CREATE the spell is copied to the character only, with a warning', async () => {
        const { created } = installFoundry({ canCreate: false });
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const [copy] = await buildSpellItems({}, [customRef()], options({ grimoire: [MY_STRIKE] }), report);
        expect(created.items).toBe(0);
        expect(copy._stats?.compendiumSource).toBeUndefined();
        expect(copy.flags['lss-to-foundry']).toEqual({ imported: true, lssSpellId: 'my-strike' });
        expect(report.warnings.some((message) => message.includes('ITEM_CREATE'))).toBe(true);
    });

    it('reports a custom spell that is missing from the Grimoire', async () => {
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        const items = await buildSpellItems({}, [customRef({ slug: 'unknown-own', englishName: 'Unknown Own', name: 'Неизвестное' })], options({ grimoire: [] }), report);
        expect(items).toEqual([]);
        expect(report.missingSpells).toEqual(['Unknown Own']);
    });
});
