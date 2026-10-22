import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    IDENTIFIER_ALIASES,
    createSpellIndex,
    identifierCandidates,
    parseSpellReference,
    resolveSpellRefs,
    slugify,
} from '../../scripts/core/spell-refs.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const index2014 = JSON.parse(read('../../data/srd-spell-index-2014.json'));
const index2024 = JSON.parse(read('../../data/srd-spell-index-2024.json'));
const index = createSpellIndex(index2014, index2024);

const byIndex = (list, slug) => list.find((entry) => entry.slug === slug);
const CURE_2024 = byIndex(index2024, 'cure-wounds');
const ACID_ARROW_2014 = byIndex(index2014, 'acid-arrow');
const ACID_ARROW_2024 = byIndex(index2024, 'acid-arrow');

/** Build a minimal LssCharacter with the given spell lists. */
function character({ edition = '2024', spells = {}, spellsInfo = {} } = {}) {
    return {
        edition,
        envelope: { spells: { prepared: [], book: [], granted: [], pending: [], slotless: [], ...spells } },
        data: { spellsInfo },
    };
}

describe('data files', () => {
    it('contain every SRD spell of each dataset and no Russian text', () => {
        expect(index2014.length).toBe(318);
        expect(index2024.length).toBe(339);
        for (const text of [read('../../data/srd-spell-index-2014.json'), read('../../data/srd-spell-index-2024.json')]) {
            expect(text).not.toMatch(/[А-Яа-яЁё]/);
        }
    });

    it('every entry has a 24-hex id, a slug, an English name and a level', () => {
        for (const entry of [...index2014, ...index2024]) {
            expect(entry.id).toMatch(/^[0-9a-f]{24}$/);
            expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
            expect(entry.englishName.length).toBeGreaterThan(0);
            expect(entry.level).toBeGreaterThanOrEqual(0);
            expect(entry.level).toBeLessThanOrEqual(9);
        }
    });
});

describe('slugify and parseSpellReference', () => {
    it('slugifies English names the way LSS does', () => {
        expect(slugify('Antipathy/Sympathy')).toBe('antipathy-sympathy');
        expect(slugify('  Acid   Arrow! ')).toBe('acid-arrow');
        expect(slugify('Кислота')).toBe('');
    });

    it('reads a 24-hex id in any case as lower case', () => {
        expect(parseSpellReference('698197C2A5DC6923C7028C8C')).toEqual({
            lssId: '698197c2a5dc6923c7028c8c', slug: null, englishName: null, name: null,
        });
    });

    it('reads a slug, an English name and the form «Русское [English]»', () => {
        expect(parseSpellReference('cure-wounds')).toEqual({ lssId: null, slug: 'cure-wounds', englishName: null, name: null });
        expect(parseSpellReference('Cure Wounds')).toEqual({ lssId: null, slug: 'cure-wounds', englishName: 'Cure Wounds', name: null });
        expect(parseSpellReference('Исцеление ран [Cure Wounds]')).toEqual({
            lssId: null, slug: 'cure-wounds', englishName: 'Cure Wounds', name: 'Исцеление ран',
        });
        expect(parseSpellReference('Антипатия/симпатия [Antipathy/Sympathy]')).toMatchObject({
            slug: 'antipathy-sympathy', englishName: 'Antipathy/Sympathy',
        });
    });

    it('keeps a Russian-only name as the name and returns null for empty text', () => {
        expect(parseSpellReference('Моё заклинание')).toEqual({ lssId: null, slug: null, englishName: null, name: 'Моё заклинание' });
        expect(parseSpellReference('   ')).toBeNull();
        expect(parseSpellReference(null)).toBeNull();
    });
});

describe('identifierCandidates and IDENTIFIER_ALIASES', () => {
    it('lists the alias before the slug for 2014 spells', () => {
        expect(identifierCandidates('blindness-or-deafness', '2014')).toEqual(['blindness-deafness', 'blindness-or-deafness']);
        expect(identifierCandidates('antipathy-or-sympathy', '2014')).toEqual(['antipathy-sympathy', 'antipathy-or-sympathy']);
        expect(identifierCandidates('enlarge-or-reduce', '2014')).toEqual(['enlarge-reduce', 'enlarge-or-reduce']);
    });

    it('uses the slug as it is when there is no alias or for 2024', () => {
        expect(identifierCandidates('cure-wounds', '2014')).toEqual(['cure-wounds']);
        expect(identifierCandidates('blindness-deafness', '2024')).toEqual(['blindness-deafness']);
        expect(identifierCandidates('blindness-or-deafness', '2024')).toEqual(['blindness-or-deafness']);
        expect(identifierCandidates('constructor', '2014')).toEqual(['constructor']);
        expect(identifierCandidates(null, '2014')).toEqual([]);
    });

    it('has exactly the three 2014 aliases from the research', () => {
        expect(IDENTIFIER_ALIASES).toEqual({
            'antipathy-or-sympathy': 'antipathy-sympathy',
            'blindness-or-deafness': 'blindness-deafness',
            'enlarge-or-reduce': 'enlarge-reduce',
        });
        expect(Object.isFrozen(IDENTIFIER_ALIASES)).toBe(true);
    });
});

describe('resolveSpellRefs: forms of a reference', () => {
    it('resolves a 2024 id, a slug, an English name and «Русское [English]» to the same spell', () => {
        const { refs, warnings } = resolveSpellRefs(
            character({ spells: { prepared: [CURE_2024.id, 'cure-wounds', 'Cure Wounds', 'Исцеление ран [Cure Wounds]'] } }),
            index,
        );
        expect(warnings).toEqual([]);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({
            ref: CURE_2024.id,
            kind: 'srd',
            lssId: CURE_2024.id,
            slug: 'cure-wounds',
            englishName: 'Cure Wounds',
            name: null,
            level: 1,
            edition: '2024',
            lists: ['prepared'],
            slotless: false,
            ability: null,
            chargeResourceId: null,
        });
    });

    it('keeps the Russian name out of SRD refs', () => {
        const { refs } = resolveSpellRefs(character({ spells: { prepared: ['Исцеление ран [Cure Wounds]'] } }), index);
        expect(refs[0].name).toBeNull();
        // `ref` keeps the form as written in the character file; everything resolved from the SRD index is Latin.
        const { ref, ...resolved } = refs[0];
        expect(ref).toBe('Исцеление ран [Cure Wounds]');
        expect(JSON.stringify(resolved)).not.toMatch(/[А-Яа-яЁё]/);
    });
});

describe('resolveSpellRefs: merging lists', () => {
    it('makes one SpellRef per spell and joins the lists', () => {
        const { refs } = resolveSpellRefs(
            character({
                spells: {
                    prepared: [CURE_2024.id],
                    book: ['Cure Wounds'],
                    granted: [{ id: 'cure-wounds', source: 'wizard' }],
                    pending: [{ slug: 'cure-wounds', list: 'book' }],
                },
            }),
            index,
        );
        expect(refs).toHaveLength(1);
        expect(refs[0].lists).toEqual(['prepared', 'book', 'granted']);
    });

    it('keeps different spells apart', () => {
        const { refs } = resolveSpellRefs(
            character({ spells: { prepared: ['cure-wounds', 'acid-arrow'], book: ['acid-arrow'] } }),
            index,
        );
        expect(refs.map((r) => r.slug)).toEqual(['cure-wounds', 'acid-arrow']);
        expect(refs[1].lists).toEqual(['prepared', 'book']);
    });

    it('takes pending entries with their own list, the server cannot resolve them', () => {
        const { refs } = resolveSpellRefs(character({ spells: { pending: [{ slug: 'fireball', list: 'book' }] } }), index);
        expect(refs[0]).toMatchObject({ kind: 'srd', slug: 'fireball', lists: ['book'] });
    });
});

describe('resolveSpellRefs: slots, abilities and charges', () => {
    it('reads granted, slotless, per-spell ability and charge resource', () => {
        const { refs, warnings } = resolveSpellRefs(
            character({
                spells: {
                    prepared: [CURE_2024.id],
                    granted: [{ id: CURE_2024.id, source: 'class' }],
                    slotless: [CURE_2024.id],
                },
                spellsInfo: {
                    abilities: { [CURE_2024.id]: 'cha' },
                    charges: { [CURE_2024.id]: 'resource-1780000000010' },
                },
            }),
            index,
        );
        expect(warnings).toEqual([]);
        expect(refs[0]).toMatchObject({
            lists: ['prepared', 'granted'],
            slotless: true,
            ability: 'cha',
            chargeResourceId: 'resource-1780000000010',
        });
    });

    it('finds abilities by the id of a spell referenced by name', () => {
        const { refs } = resolveSpellRefs(
            character({ spells: { prepared: ['Cure Wounds'] }, spellsInfo: { abilities: { [CURE_2024.id]: 'wis' } } }),
            index,
        );
        expect(refs[0].ability).toBe('wis');
    });

    it('reports an unknown ability instead of using it', () => {
        const { refs, warnings } = resolveSpellRefs(
            character({ spells: { prepared: [CURE_2024.id] }, spellsInfo: { abilities: { [CURE_2024.id]: 'luck' } } }),
            index,
        );
        expect(refs[0].ability).toBeNull();
        expect(warnings.join(' ')).toContain('luck');
    });
});

describe('resolveSpellRefs: editions', () => {
    it('a 2014 id in a 2024 character is an SRD 2014 spell with a warning', () => {
        const { refs, warnings } = resolveSpellRefs(character({ edition: '2024', spells: { prepared: [ACID_ARROW_2014.id] } }), index);
        expect(refs[0]).toMatchObject({ kind: 'srd', edition: '2014', slug: 'acid-arrow', lssId: ACID_ARROW_2014.id });
        expect(warnings.join(' ')).toContain('2014');
    });

    it('a 2024 id in a 2014 character is an SRD 2024 spell with a warning', () => {
        const { refs, warnings } = resolveSpellRefs(character({ edition: '2014', spells: { prepared: [ACID_ARROW_2024.id] } }), index);
        expect(refs[0]).toMatchObject({ kind: 'srd', edition: '2024', lssId: ACID_ARROW_2024.id });
        expect(warnings.join(' ')).toContain('2024');
    });

    it('uses the character edition first when the same slug exists in both', () => {
        const { refs } = resolveSpellRefs(character({ edition: '2014', spells: { prepared: ['Acid Arrow', ACID_ARROW_2024.id] } }), index);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({ edition: '2014', lssId: ACID_ARROW_2014.id });
    });

    it('a missing edition is 2024', () => {
        const { refs } = resolveSpellRefs({ envelope: { spells: { prepared: ['cure-wounds'] } }, data: {} }, index);
        expect(refs[0].edition).toBe('2024');
    });

    it('an unknown edition gives a warning and falls back to 2024', () => {
        const { refs, warnings } = resolveSpellRefs(character({ edition: '2099', spells: { prepared: ['cure-wounds'] } }), index);
        expect(refs[0].edition).toBe('2024');
        expect(warnings.join(' ')).toContain('2099');
    });
});

describe('resolveSpellRefs: aliases', () => {
    it('2014 names with «or» resolve in the 2014 dataset', () => {
        const { refs } = resolveSpellRefs(
            character({ edition: '2014', spells: { prepared: ['Blindness/Deafness', 'enlarge-reduce'], book: ['antipathy-sympathy'] } }),
            index,
        );
        expect(refs.map((r) => [r.slug, r.edition])).toEqual([
            ['blindness-or-deafness', '2014'],
            ['enlarge-or-reduce', '2014'],
            ['antipathy-or-sympathy', '2014'],
        ]);
    });

    it('the 2014 spelling in a 2024 character resolves to the 2024 spell and merges with it', () => {
        const { refs, warnings } = resolveSpellRefs(
            character({ edition: '2024', spells: { prepared: ['Blindness or Deafness'], book: ['Blindness/Deafness'] } }),
            index,
        );
        expect(warnings).toEqual([]);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({ slug: 'blindness-deafness', edition: '2024', lists: ['prepared', 'book'] });
    });

    it('merges an «or» slug from 2014 with the 2024 spelling of the same spell', () => {
        const { refs } = resolveSpellRefs(
            character({ edition: '2024', spells: { prepared: ['antipathy-or-sympathy', 'Antipathy/Sympathy'] } }),
            index,
        );
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({ slug: 'antipathy-sympathy', edition: '2024', lists: ['prepared'] });
    });
});

describe('resolveSpellRefs: custom spells and bad input', () => {
    it('an unknown id is a custom spell with that id', () => {
        const id = '0123456789abcdef01234567';
        const { refs, warnings } = resolveSpellRefs(character({ spells: { prepared: [id] } }), index);
        expect(warnings).toEqual([]);
        expect(refs[0]).toMatchObject({
            ref: id, kind: 'custom', lssId: id, slug: null, englishName: null, level: null, edition: '2024', lists: ['prepared'],
        });
    });

    it('an unknown slug or English name is a custom spell', () => {
        const { refs } = resolveSpellRefs(character({ spells: { prepared: ['my-spell', 'Моё заклинание', 'Мой другой [My Other]'] } }), index);
        expect(refs).toHaveLength(3);
        expect(refs[0]).toMatchObject({ kind: 'custom', slug: 'my-spell', name: null });
        expect(refs[1]).toMatchObject({ kind: 'custom', slug: null, name: 'Моё заклинание' });
        expect(refs[2]).toMatchObject({ kind: 'custom', slug: 'my-other', englishName: 'My Other', name: 'Мой другой' });
    });

    it('custom spells with the same name merge', () => {
        const { refs } = resolveSpellRefs(character({ spells: { prepared: ['Моё заклинание'], book: ['моё  заклинание'] } }), index);
        expect(refs).toHaveLength(1);
        expect(refs[0].lists).toEqual(['prepared', 'book']);
    });

    it('empty and non-string references are skipped with a warning', () => {
        const { refs, warnings } = resolveSpellRefs(character({ spells: { prepared: ['', 42, null, 'cure-wounds'] } }), index);
        expect(refs).toHaveLength(1);
        expect(warnings).toHaveLength(3);
    });

    it('a character without spells gives no refs and does not throw', () => {
        expect(resolveSpellRefs({ edition: '2024', envelope: {}, data: {} }, index)).toEqual({ refs: [], warnings: [] });
        expect(resolveSpellRefs(null, index)).toEqual({ refs: [], warnings: [] });
    });

    it('ice-knife is an SRD 2024 spell in the index', () => {
        const { refs } = resolveSpellRefs(character({ spells: { prepared: ['Ледяной нож [Ice Knife]'] } }), index);
        expect(refs[0]).toMatchObject({ kind: 'srd', slug: 'ice-knife', edition: '2024' });
    });
});
