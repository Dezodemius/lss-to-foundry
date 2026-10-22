import { describe, expect, it } from 'vitest';
import {
    findGrimoireSpell,
    grimoireKey,
    looksLikeSpell,
    parseGrimoireEntries,
    spellItemFromGrimoire,
} from '../../scripts/core/grimoire.mjs';
import { parseSpellReference } from '../../scripts/core/spell-refs.mjs';

const HEX_A = 'abcdef0123456789abcdef01';
const HEX_B = '0123456789abcdef01234568';

/** A Foundry item as a Grimoire export could carry it: document ids, folder, ownership, stats and core flags included. */
function foundryFireball() {
    return {
        _id: HEX_A,
        type: 'spell',
        name: 'Огненный шар [Fireball]',
        img: 'icons/magic/fire/explosion.webp',
        folder: 'folder-1',
        sort: 300000,
        ownership: { default: 0 },
        _stats: { coreVersion: '13.348', compendiumSource: 'Compendium.x.y.Item.z' },
        flags: {
            core: { sourceId: 'Compendium.dnd5e.spells24.Item.abc' },
            'lss-to-foundry': { lssId: 'ffffffffffffffffffffffff' },
            other: { keep: true },
        },
        effects: [{ _id: 'effect0000000001', name: 'Glow', changes: [] }],
        system: {
            level: 3,
            school: 'evo',
            identifier: 'fireball',
            description: { value: '<p>Огненный взрыв</p>' },
            activities: {
                act1234567890123: { _id: 'act1234567890123', type: 'save', sort: 0 },
            },
            method: 'spell',
            prepared: 0,
        },
    };
}

describe('looksLikeSpell', () => {
    it('accepts a Foundry spell item and an untyped LSS-style record', () => {
        expect(looksLikeSpell(foundryFireball())).toBe(true);
        expect(looksLikeSpell({ id: HEX_B, slug: 'my-spell', name: 'Моё заклинание', level: 1, classes: ['wizard'] })).toBe(true);
        expect(looksLikeSpell({ name: 'Без слага', level: 2 })).toBe(true);
    });

    it('rejects other item types, characters and junk', () => {
        expect(looksLikeSpell({ name: 'Особенность', type: 'feat', system: {} })).toBe(false);
        expect(looksLikeSpell({ name: { value: 'Персонаж' }, info: {} })).toBe(false);
        expect(looksLikeSpell({ name: '', type: 'spell' })).toBe(false);
        expect(looksLikeSpell({ type: 'spell' })).toBe(false);
        expect(looksLikeSpell({ name: 'Только имя' })).toBe(false);
        expect(looksLikeSpell(null)).toBe(false);
        expect(looksLikeSpell(42)).toBe(false);
        expect(looksLikeSpell('spell')).toBe(false);
        expect(looksLikeSpell([{ name: 'x', level: 1 }])).toBe(false);
    });
});

describe('parseGrimoireEntries', () => {
    it('reads an array, an { items } object and a single record', () => {
        expect(parseGrimoireEntries([foundryFireball()])).toHaveLength(1);
        expect(parseGrimoireEntries({ items: [foundryFireball(), { name: 'Два', level: 1 }] })).toHaveLength(2);
        expect(parseGrimoireEntries(foundryFireball())).toHaveLength(1);
        expect(parseGrimoireEntries({ spells: [{ name: 'Три', level: 0 }] })).toHaveLength(1);
    });

    it('skips garbage without throwing', () => {
        const junk = [null, undefined, 0, 'строка', [], {}, { name: 42 }, { type: 'feat', name: 'x' }, { name: '   ' }];
        expect(parseGrimoireEntries([...junk, { name: 'Годное', level: 1 }])).toHaveLength(1);
        expect(parseGrimoireEntries(null)).toEqual([]);
        expect(parseGrimoireEntries('nope')).toEqual([]);
    });

    it('takes the LSS id from _id when it is 24-hex', () => {
        const [spell] = parseGrimoireEntries([foundryFireball()]);
        expect(spell.lssId).toBe(HEX_A);
    });

    it('takes the LSS id from an id field or from a module flag when _id is a Foundry id', () => {
        const fromId = parseGrimoireEntries([{ _id: 'Ab12Cd34Ef56Gh78', id: HEX_B.toUpperCase(), name: 'Один', level: 1 }])[0];
        expect(fromId.lssId).toBe(HEX_B);
        const fromFlag = parseGrimoireEntries([{
            _id: 'Ab12Cd34Ef56Gh78',
            name: 'Два',
            level: 1,
            flags: { 'lss-to-foundry': { lssSpellId: HEX_B } },
        }])[0];
        expect(fromFlag.lssId).toBe(HEX_B);
        const fromOtherScope = parseGrimoireEntries([{ name: 'Три', level: 0, flags: { lss: { spellId: HEX_A } } }])[0];
        expect(fromOtherScope.lssId).toBe(HEX_A);
    });

    it('has no LSS id when none is 24-hex', () => {
        expect(parseGrimoireEntries([{ _id: 'Ab12Cd34Ef56Gh78', name: 'Ноль', level: 0 }])[0].lssId).toBeNull();
    });

    it('takes the slug from system.identifier, then from the English name', () => {
        expect(parseGrimoireEntries([foundryFireball()])[0].slug).toBe('fireball');
        expect(parseGrimoireEntries([{ name: 'Кислота [Acid Splash, Big]', level: 0 }])[0].slug).toBe('acid-splash-big');
        expect(parseGrimoireEntries([{ name: 'Fire Shield', level: 4 }])[0].slug).toBe('fire-shield');
        expect(parseGrimoireEntries([{ slug: 'my-spell', name: 'Моё', level: 1 }])[0].slug).toBe('my-spell');
    });

    it('has no slug for a Russian-only name', () => {
        expect(parseGrimoireEntries([{ name: 'Моё заклинание', level: 1 }])[0].slug).toBeNull();
    });

    it('keeps a Foundry item as a cleaned item and an LSS-style record without one', () => {
        const [foundry, lss] = parseGrimoireEntries([foundryFireball(), { id: HEX_B, slug: 'my-spell', name: 'Моё', level: 1 }]);
        expect(foundry.item).not.toBeNull();
        expect(foundry.item._id).toBeUndefined();
        expect(foundry.item.folder).toBeUndefined();
        expect(lss.item).toBeNull();
        expect(lss.raw).toMatchObject({ slug: 'my-spell' });
    });

    it('does not modify the input record', () => {
        const input = foundryFireball();
        const snapshot = structuredClone(input);
        parseGrimoireEntries([input]);
        spellItemFromGrimoire(parseGrimoireEntries([input])[0]);
        expect(input).toEqual(snapshot);
    });
});

describe('grimoireKey', () => {
    it('prefers the LSS id, then the slug, then the name', () => {
        expect(grimoireKey({ lssId: HEX_A, slug: 'fireball', name: 'x' })).toBe(`id:${HEX_A}`);
        expect(grimoireKey({ lssId: null, slug: 'fireball', name: 'x' })).toBe('slug:fireball');
        expect(grimoireKey({ lssId: null, slug: null, name: '  Моё  Заклинание ' })).toBe('name:мое заклинание');
    });
});

describe('findGrimoireSpell', () => {
    const grimoire = parseGrimoireEntries([
        foundryFireball(),
        { id: HEX_B, slug: 'my-spell', name: 'Моё заклинание', level: 1, classes: ['wizard'] },
        { name: 'Ледяная стрела [Frost Arrow]', level: 2 },
    ]);

    it('finds a spell by LSS id even when the slug differs', () => {
        const ref = parseSpellReference(HEX_B);
        expect(findGrimoireSpell({ ...ref, slug: 'other-slug' }, grimoire)?.slug).toBe('my-spell');
    });

    it('finds a spell by slug and by English name', () => {
        expect(findGrimoireSpell(parseSpellReference('fireball'), grimoire)?.name).toBe('Огненный шар [Fireball]');
        expect(findGrimoireSpell(parseSpellReference('Fireball'), grimoire)?.name).toBe('Огненный шар [Fireball]');
        expect(findGrimoireSpell(parseSpellReference('Frost Arrow'), grimoire)?.name).toBe('Ледяная стрела [Frost Arrow]');
    });

    it('finds a Russian-only name, ignoring case and ё', () => {
        expect(findGrimoireSpell(parseSpellReference('МОЁ заклинание'), grimoire)?.slug).toBe('my-spell');
        expect(findGrimoireSpell(parseSpellReference('Ледяная стрела'), grimoire)?.slug).toBe('frost-arrow');
    });

    it('accepts a raw string as the reference', () => {
        expect(findGrimoireSpell('Fireball', grimoire)?.slug).toBe('fireball');
    });

    it('returns null when nothing matches or the input is unusable', () => {
        expect(findGrimoireSpell(parseSpellReference('Нет такого'), grimoire)).toBeNull();
        expect(findGrimoireSpell(null, grimoire)).toBeNull();
        expect(findGrimoireSpell(parseSpellReference('fireball'), null)).toBeNull();
        expect(findGrimoireSpell(parseSpellReference('fireball'), [])).toBeNull();
    });
});

describe('spellItemFromGrimoire', () => {
    it('cleans a Foundry item: no document ids, folder, ownership, sort, stats or core flags', () => {
        const spell = parseGrimoireEntries([foundryFireball()])[0];
        const item = spellItemFromGrimoire(spell, { randomID: () => 'unused' });
        for (const key of ['_id', 'folder', 'ownership', 'sort', '_stats']) expect(item[key]).toBeUndefined();
        expect(item.flags.core).toBeUndefined();
        expect(item.flags.other).toEqual({ keep: true });
        expect(item.effects).toEqual([{ name: 'Glow', changes: [] }]);
        expect(item.type).toBe('spell');
        expect(item.name).toBe('Огненный шар [Fireball]');
        expect(item.img).toBe('icons/magic/fire/explosion.webp');
    });

    it('keeps system and its activities exactly as they were', () => {
        const source = foundryFireball();
        const spell = parseGrimoireEntries([source])[0];
        const item = spellItemFromGrimoire(spell);
        expect(item.system).toEqual(source.system);
    });

    it('sets the module flags: imported and the LSS spell id', () => {
        const [spell] = parseGrimoireEntries([foundryFireball()]);
        const item = spellItemFromGrimoire(spell);
        expect(item.flags['lss-to-foundry']).toMatchObject({ imported: true, lssSpellId: HEX_A });
    });

    it('uses the slug as the spell id when the record has no LSS id', () => {
        const [spell] = parseGrimoireEntries([{ name: 'Свой [My Spell]', level: 1 }]);
        expect(spellItemFromGrimoire(spell).flags['lss-to-foundry']).toMatchObject({ imported: true, lssSpellId: 'my-spell' });
    });

    it('builds a minimal spell from an LSS-style record', () => {
        const [spell] = parseGrimoireEntries([{ id: HEX_B, slug: 'my-spell', name: 'Моё заклинание', level: 2, description: 'Текст' }]);
        const item = spellItemFromGrimoire(spell);
        expect(item).toEqual({
            name: 'Моё заклинание',
            type: 'spell',
            system: { level: 2, description: { value: 'Текст' } },
            flags: { 'lss-to-foundry': { imported: true, lssSpellId: HEX_B } },
        });
    });

    it('builds a minimal spell with level 0 and empty text when nothing is given', () => {
        const [spell] = parseGrimoireEntries([{ name: 'Голое имя', slug: 'bare' }]);
        const item = spellItemFromGrimoire(spell);
        expect(item.system).toEqual({ level: 0, description: { value: '' } });
    });

    it('reads the description from { value } or system.description.value', () => {
        const [a] = parseGrimoireEntries([{ name: 'Один', level: 1, description: { value: 'A' } }]);
        const [b] = parseGrimoireEntries([{ name: 'Два', level: 1, system: { description: { value: 'B' } } }]);
        expect(spellItemFromGrimoire(a).system.description.value).toBe('A');
        expect(spellItemFromGrimoire(b).system.description.value).toBe('B');
    });
});
