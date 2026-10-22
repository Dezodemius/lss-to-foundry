import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIdMapper, normalizeName } from '../../scripts/core/ids.mjs';

const table = JSON.parse(readFileSync(new URL('../../data/lss-dnd5e-ids.json', import.meta.url), 'utf8'));
const compendium = JSON.parse(readFileSync(new URL('../../docs/research/dnd5e-5.1.8-compendium-ids.json', import.meta.url), 'utf8'));
const m = createIdMapper(table);

/** Subclass pairs: [LSS id, LSS class id, dnd5e identifier, English name]. */
const SUBCLASSES_2014 = [
    ['berserker', 'barbarian', 'path-of-the-berserker', 'Path of the Berserker'],
    ['lore', 'bard', 'college-of-lore', 'College of Lore'],
    ['life-domain', 'cleric', 'life-domain', 'Life Domain'],
    ['land', 'druid', 'circle-of-the-land', 'Circle of the Land'],
    ['champion', 'fighter', 'champion', 'Champion'],
    ['open-hand', 'monk', 'way-of-the-open-hand', 'Way of the Open Hand'],
    ['devotion', 'paladin', 'oath-of-devotion', 'Oath of Devotion'],
    ['hunter', 'ranger', 'hunter', 'Hunter'],
    ['thief', 'rogue', 'thief', 'Thief'],
    ['draconic-bloodline', 'sorcerer', 'draconic-bloodline', 'Draconic Bloodline'],
    ['fiend', 'warlock', 'the-fiend', 'The Fiend'],
    ['evocation', 'wizard', 'school-of-evocation', 'School of Evocation'],
];

const SUBCLASSES_2024 = [
    ['berserker', 'barbarian', 'berserker', 'Path of the Berserker'],
    ['lore', 'bard', 'lore', 'College of Lore'],
    ['life-domain', 'cleric', 'life', 'Life Domain'],
    ['land', 'druid', 'land', 'Circle of the Land'],
    ['champion', 'fighter', 'champion', 'Champion'],
    ['open-hand', 'monk', 'hand', 'Warrior of the Open Hand'],
    ['devotion', 'paladin', 'devotion', 'Oath of Devotion'],
    ['hunter', 'ranger', 'hunter', 'Hunter'],
    ['thief', 'rogue', 'thief', 'Thief'],
    ['draconic-sorcery', 'sorcerer', 'draconic', 'Draconic Sorcery'],
    ['fiend', 'warlock', 'fiend', 'Fiend Patron'],
    ['evoker', 'wizard', 'evoker', 'Evoker'],
];

/** Race pairs: [LSS race, LSS subrace or null, expected identifier]. */
const RACES_2014 = [
    ['human', null, 'human'],
    ['human', 'human-standard', 'human'],
    ['elf', null, 'high-elf'],
    ['elf', 'elf-high', 'high-elf'],
    ['dwarf', null, 'hill-dwarf'],
    ['dwarf', 'dwarf-hill', 'hill-dwarf'],
    ['halfling', null, 'lightfoot-halfling'],
    ['halfling', 'halfling-lightfoot', 'lightfoot-halfling'],
    ['gnome', null, 'rock-gnome'],
    ['gnome', 'gnome-rock', 'rock-gnome'],
    ['half-elf', null, 'half-elf'],
    ['half-orc', null, 'half-orc'],
    ['dragonborn', null, 'dragonborn'],
    ['tiefling', null, 'tiefling'],
];

const DRAGON_COLORS = ['gold', 'red', 'silver', 'blue', 'bronze', 'green', 'copper', 'black', 'brass', 'white'];

const RACES_2024 = [
    ['dragonborn', null, 'dragonborn'],
    ['dwarf', null, 'dwarf'],
    ['elf', 'elf-drow', 'elf-drow'],
    ['elf', 'elf-high', 'elf-high'],
    ['elf', 'elf-wood', 'elf-wood'],
    ['gnome', 'gnome-forest', 'gnome-forest'],
    ['gnome', 'gnome-rock', 'gnome-rock'],
    ['goliath', null, 'goliath'],
    ['halfling', null, 'halfling'],
    ['human', null, 'human'],
    ['orc', null, 'orc'],
    ['tiefling', 'tiefling-abyssal', 'tiefling-abyssal'],
    ['tiefling', 'tiefling-chthonic', 'tiefling-chthonic'],
    ['tiefling', 'tiefling-infernal', 'tiefling-infernal'],
];

describe('normalizeName', () => {
    it('lower-cases, folds ё into е and collapses spaces', () => {
        expect(normalizeName('  Ёлка   Высший ')).toBe('елка высший');
        expect(normalizeName('Драконорождённый')).toBe(normalizeName('Драконорожденный'));
        expect(normalizeName(null)).toBe('');
    });
});

describe('mapClass', () => {
    const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];

    it.each(['2014', '2024'])('maps all 12 classes by id in edition %s', (edition) => {
        for (const id of CLASSES) expect(m.mapClass(id, null, edition)).toBe(id);
    });

    it('falls back to the English and Russian names, case-insensitively', () => {
        expect(m.mapClass(null, 'Cleric', '2024')).toBe('cleric');
        expect(m.mapClass(null, 'WIZARD', '2014')).toBe('wizard');
        expect(m.mapClass(null, 'Жрец', '2014')).toBe('cleric');
        expect(m.mapClass(null, 'Волшебник', '2024')).toBe('wizard');
    });

    it('prefers the id over a conflicting name', () => {
        expect(m.mapClass('cleric', 'Wizard', '2024')).toBe('cleric');
    });

    it('returns null for classes without a dnd5e counterpart and for unknown editions', () => {
        expect(m.mapClass('artificer', 'Artificer', '2014')).toBeNull();
        expect(m.mapClass('cleric', 'Cleric', '2099')).toBeNull();
        expect(m.mapClass(null, null, '2024')).toBeNull();
    });
});

describe('mapSubclass', () => {
    it.each(SUBCLASSES_2014)('2014: %s (%s) → %s', (id, classId, identifier, en) => {
        expect(m.mapSubclass(id, null, classId, '2014')).toBe(identifier);
        expect(m.mapSubclass(null, en, classId, '2014')).toBe(identifier);
    });

    it.each(SUBCLASSES_2024)('2024: %s (%s) → %s', (id, classId, identifier, en) => {
        expect(m.mapSubclass(id, null, classId, '2024')).toBe(identifier);
        expect(m.mapSubclass(null, en, classId, '2024')).toBe(identifier);
    });

    it('finds subclasses by Russian name', () => {
        expect(m.mapSubclass(null, 'Домен жизни', 'cleric', '2014')).toBe('life-domain');
        expect(m.mapSubclass(null, 'Воин открытой ладони', 'monk', '2024')).toBe('hand');
        expect(m.mapSubclass(null, 'Школа воплощения', 'wizard', '2014')).toBe('school-of-evocation');
    });

    it('respects the class filter for name matches', () => {
        expect(m.mapSubclass(null, 'Life Domain', 'cleric', '2024')).toBe('life');
        expect(m.mapSubclass(null, 'Life Domain', 'wizard', '2024')).toBeNull();
    });

    it('does not take a 2014 id in the 2024 edition', () => {
        expect(m.mapSubclass('evocation', null, 'wizard', '2024')).toBeNull();
        expect(m.mapSubclass('evoker', null, 'wizard', '2014')).toBeNull();
    });
});

describe('mapRace and describeRace', () => {
    it.each(RACES_2014)('2014: %s / %s → %s', (race, subrace, identifier) => {
        expect(m.mapRace(race, null, subrace, null, '2014')).toBe(identifier);
    });

    it.each(RACES_2024)('2024: %s / %s → %s', (race, subrace, identifier) => {
        expect(m.mapRace(race, null, subrace, null, '2024')).toBe(identifier);
    });

    it.each(DRAGON_COLORS)('dragonborn-%s has no own item in either edition and falls back to dragonborn', (color) => {
        const sub = `dragonborn-${color}`;
        for (const edition of ['2014', '2024']) {
            const result = m.describeRace('dragonborn', null, sub, null, edition);
            expect(result.identifier).toBe('dragonborn');
            expect(result.warnings.join(' ')).toContain(sub);
        }
    });

    it('2014 human-alternative falls back to human with a warning', () => {
        const result = m.describeRace('human', null, 'human-alternative', null, '2014');
        expect(result.identifier).toBe('human');
        expect(result.warnings.length).toBe(1);
    });

    it('2024 goliath lineages fall back to goliath', () => {
        const result = m.describeRace('goliath', null, 'goliath-frost', null, '2024');
        expect(result.identifier).toBe('goliath');
        expect(result.warnings.join(' ')).toContain('goliath-frost');
    });

    it('2024 base races that need a lineage map to null with a warning', () => {
        for (const race of ['elf', 'gnome', 'tiefling']) {
            const result = m.describeRace(race, null, null, null, '2024');
            expect(result.identifier).toBeNull();
            expect(result.warnings.join(' ')).toContain('lineage');
        }
    });

    it('a 2014 dwarf with an unknown subrace keeps the race and warns', () => {
        const result = m.describeRace('dwarf', 'Dwarf', 'dwarf-mountain', null, '2014');
        expect(result.identifier).toBe('hill-dwarf');
        expect(result.warnings.join(' ')).toContain('unknown subrace');
    });

    it('finds races and subraces by Russian and English names', () => {
        expect(m.mapRace(null, 'Дварф', null, 'Холмовой дварф', '2014')).toBe('hill-dwarf');
        expect(m.mapRace(null, 'Dwarf', null, 'Hill Dwarf', '2014')).toBe('hill-dwarf');
        expect(m.mapRace(null, 'Эльф', null, 'Высший эльф', '2024')).toBe('elf-high');
        expect(m.mapRace(null, null, null, 'Лесной гном', '2024')).toBe('gnome-forest');
        expect(m.mapRace(null, 'Human', null, null, '2014')).toBe('human');
    });

    it('matches a race name with ё written as е', () => {
        expect(m.mapRace(null, 'Драконорожденный', null, null, '2014')).toBe('dragonborn');
        expect(m.mapRace(null, 'Драконорождённый', null, null, '2024')).toBe('dragonborn');
    });

    it('reports an unknown race with a null identifier', () => {
        const result = m.describeRace('gnoll', 'Gnoll', null, null, '2014');
        expect(result.identifier).toBeNull();
        expect(result.warnings.join(' ')).toContain('unknown race');
    });
});

describe('mapBackground and mapFeat', () => {
    it('2014: the only background and the Grappler feat', () => {
        expect(m.mapBackground('acolyte', null, '2014')).toBe('acolyte');
        expect(m.mapBackground(null, 'Прислужник', '2014')).toBe('acolyte');
        expect(m.mapFeat('grappler', 'Борец', '2014')).toBeNull();
        expect(m.mapFeat(null, 'Борец', '2014')).toBeNull();
    });

    it.each(['acolyte', 'criminal', 'sage', 'soldier'])('2024 background %s', (id) => {
        expect(m.mapBackground(id, null, '2024')).toBe(id);
    });

    it('2024 backgrounds by Russian name', () => {
        expect(m.mapBackground(null, 'Преступник', '2024')).toBe('criminal');
        expect(m.mapBackground(null, 'Мудрец', '2024')).toBe('sage');
        expect(m.mapBackground(null, 'Солдат', '2024')).toBe('soldier');
    });

    it.each([
        ['alert', 'alert'],
        ['savage-attacker', 'savage-attacker'],
        ['skilled', 'skilled'],
        ['magic-initiate-cleric', 'magic-initiate'],
        ['magic-initiate-wizard', 'magic-initiate'],
        ['magic-initiate-druid', 'magic-initiate'],
    ])('2024 feat %s → %s', (id, identifier) => {
        expect(m.mapFeat(id, null, '2024')).toBe(identifier);
    });

    it('2024 feat by name', () => {
        expect(m.mapFeat(null, 'Бдительный', '2024')).toBe('alert');
        expect(m.mapFeat(null, 'Одарённый', '2024')).toBe('skilled');
    });
});

describe('table integrity', () => {
    const PACKS = {
        2014: { classes: ['classes', 'class'], subclasses: ['subclasses', 'subclass'], races: ['races', 'race'], backgrounds: ['backgrounds', 'background'] },
        2024: {
            classes: ['classes24', 'class'],
            subclasses: ['classes24', 'subclass'],
            races: ['origins24', 'race'],
            backgrounds: ['origins24', 'background'],
            feats: ['feats24', 'feat'],
        },
    };

    it('has the expected number of rows per edition', () => {
        expect(Object.fromEntries(Object.entries(table['2014']).map(([k, v]) => [k, v.length]))).toEqual({
            classes: 12, subclasses: 12, races: 25, backgrounds: 1, feats: 1,
        });
        expect(Object.fromEntries(Object.entries(table['2024']).map(([k, v]) => [k, v.length]))).toEqual({
            classes: 12, subclasses: 12, races: 32, backgrounds: 4, feats: 6,
        });
    });

    it.each(['2014', '2024'])('every identifier in %s exists in the dnd5e compendium of the same pack and type', (edition) => {
        const missing = [];
        for (const [category, rows] of Object.entries(table[edition])) {
            const pack = PACKS[edition][category];
            for (const row of rows) {
                if (row.identifier === null) {
                    expect(row._comment, `${category} ${row.lssId} needs a comment`).toBeTruthy();
                    continue;
                }
                if (!pack) {
                    missing.push(`${category} ${row.lssId}: no pack`);
                    continue;
                }
                const [packName, type] = pack;
                const found = (compendium[packName] ?? []).some((e) => e.identifier === row.identifier && e.type === type);
                if (!found) missing.push(`${category} ${row.lssId} → ${row.identifier} not in ${packName}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('subclasses point to a class of the same edition', () => {
        for (const edition of ['2014', '2024']) {
            const classIds = new Set(table[edition].classes.map((r) => r.identifier));
            for (const row of table[edition].subclasses) {
                expect(classIds.has(row.classIdentifier), `${edition} ${row.lssId}`).toBe(true);
            }
        }
    });

    it('subraces point to a base race of the same LSS id', () => {
        for (const edition of ['2014', '2024']) {
            const bases = new Set(table[edition].races.filter((r) => r.subraceId === null).map((r) => r.lssId));
            for (const row of table[edition].races.filter((r) => r.subraceId !== null)) {
                expect(bases.has(row.lssId), `${edition} ${row.subraceId}`).toBe(true);
            }
        }
    });
});
