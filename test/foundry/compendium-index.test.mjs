import { describe, expect, it } from 'vitest';
import {
    allPackIds,
    groupByIdentifier,
    packIdsFor,
    pickEntry,
} from '../../scripts/foundry/compendium-index.mjs';

const row = (packId, _id, type, identifier, name = identifier) => ({
    packId,
    _id,
    uuid: `Compendium.${packId}.Item.${_id}`,
    name,
    type,
    identifier,
});

describe('groupByIdentifier', () => {
    it('groups index rows by system.identifier and keeps pack order', () => {
        const grouped = groupByIdentifier([
            { packId: 'dnd5e.classes24', rows: [
                { _id: 'a1', name: 'Expertise', type: 'feat', system: { identifier: 'expertise' } },
                { _id: 'a2', name: 'Berserker', type: 'subclass', system: { identifier: 'berserker' } },
            ] },
            { packId: 'dnd5e.feats24', rows: [
                { _id: 'b1', name: 'Alert', type: 'feat', system: { identifier: 'expertise' } },
            ] },
        ]);
        expect(grouped.get('expertise').map((e) => e.packId)).toEqual(['dnd5e.classes24', 'dnd5e.feats24']);
        expect(grouped.get('berserker')[0]).toMatchObject({ _id: 'a2', type: 'subclass', packId: 'dnd5e.classes24' });
    });

    it('reads the flat key too and drops rows without an identifier', () => {
        const grouped = groupByIdentifier([
            { packId: 'p', rows: [
                { _id: 'x', name: 'Flat', type: 'spell', 'system.identifier': 'flat-one' },
                { _id: 'y', name: 'Folder-like', type: 'spell' },
            ] },
        ]);
        expect([...grouped.keys()]).toEqual(['flat-one']);
    });
});

describe('pickEntry', () => {
    const entries = [
        row('dnd5e.classes24', 'f1', 'feat', 'expertise'),
        row('dnd5e.classes24', 's1', 'subclass', 'expertise'),
        row('dnd5e.feats24', 'g1', 'feat', 'expertise'),
    ];

    it('returns the first entry when no filter is given', () => {
        expect(pickEntry(entries)?._id).toBe('f1');
    });

    it('filters by document type', () => {
        expect(pickEntry(entries, { types: ['feat'], packIds: ['dnd5e.feats24'] })?._id).toBe('g1');
        expect(pickEntry(entries, { types: ['subclass'] })?._id).toBe('s1');
    });

    it('tries packs in the order given, not in the order of the entries', () => {
        const hit = pickEntry(entries, { types: ['feat'], packIds: ['dnd5e.feats24', 'dnd5e.classes24'] });
        expect(hit?._id).toBe('g1');
    });

    it('ignores packs that are not in the list', () => {
        expect(pickEntry(entries, { packIds: ['dnd5e.spells24'] })).toBeNull();
    });

    it('returns null when the type filter matches nothing', () => {
        expect(pickEntry(entries, { types: ['race'] })).toBeNull();
    });
});

describe('pack lists', () => {
    it('packIdsFor lists only the packs of one edition', () => {
        const ids2024 = packIdsFor('2024');
        expect(ids2024).toContain('dnd5e.classes24');
        expect(ids2024).toContain('dnd5e.spells24');
        expect(ids2024.some((id) => id === 'dnd5e.spells')).toBe(false);
        expect(packIdsFor('2014')).toContain('dnd5e.spells');
    });

    it('allPackIds adds the extra spell packs once', () => {
        const all = allPackIds(['dnd5e.spells', 'homebrew.spells']);
        expect(all.filter((id) => id === 'dnd5e.spells')).toHaveLength(1);
        expect(all).toContain('homebrew.spells');
        expect(all).toContain('dnd5e.spells24');
    });
});
