import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeData, parseLssFile } from '../../scripts/core/parse.mjs';

const fixtureText = readFileSync(new URL('../fixtures/lss/character-example.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(fixtureText);

const SPELL = { type: 'spell', name: 'Огненный шар [Fireball]', system: { level: 3 } };

describe('parseLssFile: fixture', () => {
    it('reads the example character as a bare character object', () => {
        const result = parseLssFile(fixtureText, 'character-example.json');

        expect(result.errors).toEqual([]);
        expect(result.grimoire).toEqual([]);
        expect(result.characters).toHaveLength(1);
        const [character] = result.characters;
        expect(character).toMatchObject({
            key: 'character-example.json#0',
            fileName: 'character-example.json',
            edition: '2024',
            name: 'Сестра Иоланда',
            className: 'Cleric',
            level: 3,
        });
        expect(character.warnings).toContain('редакция не указана, принята 2024');
    });

    it('fills the envelope with empty lists when there is no envelope', () => {
        const [character] = parseLssFile(fixtureText, 'character-example.json').characters;

        expect(character.envelope).toEqual({
            sheetEdition: null,
            tags: [],
            spells: {
                mode: 'cards',
                prepared: [],
                book: [],
                pending: [],
                granted: [],
                slotless: [],
            },
        });
    });

    it('keeps the example values in the normalized data', () => {
        const { data } = parseLssFile(fixtureText, 'character-example.json').characters[0];

        expect(data.stats.str.score).toBe(13);
        expect(data.stats.wis.score).toBe(16);
        expect(data.saves.con.isProf).toBe(1);
        expect(data.saves.str.isProf).toBe(0);
        expect(data.skills.athletics).toMatchObject({ baseStat: 'str', isProf: 1 });
        expect(data.skills['sleight of hand']).toMatchObject({ baseStat: 'dex', isProf: 0 });
        expect(data.skills['animal handling'].baseStat).toBe('wis');
        expect(data.vitality['hp-current']).toEqual({ value: 24 });
        expect(data.vitality.ac).toEqual({ value: '10+[DEX]' });
        expect(data.vitality.shield).toEqual({ value: true, mod: '2' });
        expect(data.vitality.initiative).toEqual({ value: null });
        expect(data.weaponsList.map((weapon) => weapon.id)).toEqual(['weapon-1780000000002', 'weapon-1780000000003']);
        expect(data.attunementsList).toEqual([{ id: 'attunement-1780000000001', checked: true, value: 'Кольцо защиты' }]);
        expect(data.resources['resource-1780000000010'].max).toBe(1);
        expect(data.text.traits.value.data.type).toBe('doc');
        expect(data.coins.gp).toEqual({ value: 15 });
        expect(data.prof['armor-label']).toEqual({ value: true });
    });

    it('gives the same result for the text and for the parsed object', () => {
        const fromText = parseLssFile(fixtureText, 'a.json').characters[0];
        const fromObject = parseLssFile(fixture(), 'a.json').characters[0];

        expect(fromObject).toEqual(fromText);
    });

    it('strips a byte order mark before parsing', () => {
        const result = parseLssFile(`﻿${fixtureText}`, 'bom.json');

        expect(result.errors).toEqual([]);
        expect(result.characters).toHaveLength(1);
    });
});

describe('parseLssFile: shapes', () => {
    it('reads an array of characters and keys them by position', () => {
        const result = parseLssFile([fixture(), fixture()], 'party.json');

        expect(result.characters.map((character) => character.key)).toEqual(['party.json#0', 'party.json#1']);
    });

    it('reads { characters: [...] }', () => {
        const result = parseLssFile({ characters: [fixture(), fixture()] }, 'party.json');

        expect(result.errors).toEqual([]);
        expect(result.characters.map((character) => character.key)).toEqual(['party.json#0', 'party.json#1']);
    });

    it('reads a character envelope whose data is a JSON string', () => {
        const envelope = {
            jsonType: 'character',
            version: '2',
            edition: '2014',
            sheetEdition: '2024',
            spells: { mode: 'text', prepared: ['cure-wounds', 'AAAAAAAAAAAAAAAAAAAAAAAA'], book: ['Magic Missile'] },
            data: JSON.stringify(fixture()),
        };
        const [character] = parseLssFile(JSON.stringify(envelope), 'env.json').characters;

        expect(character.edition).toBe('2014');
        expect(character.envelope.sheetEdition).toBe('2024');
        expect(character.envelope.spells).toMatchObject({
            mode: 'text',
            prepared: ['cure-wounds', 'AAAAAAAAAAAAAAAAAAAAAAAA'],
            book: ['Magic Missile'],
            pending: [],
            granted: [],
            slotless: [],
        });
        expect(character.name).toBe('Сестра Иоланда');
    });

    it('reads a character envelope whose data is an object', () => {
        const envelope = { jsonType: 'character', edition: 2014, data: fixture() };
        const [character] = parseLssFile(envelope, 'obj.json').characters;

        expect(character.edition).toBe('2014');
        expect(character.name).toBe('Сестра Иоланда');
    });

    it('uses the default edition for an unknown edition value', () => {
        const [character] = parseLssFile({ jsonType: 'character', edition: '2099', data: fixture() }, 'x.json').characters;

        expect(character.edition).toBe('2024');
        expect(character.warnings.join(' ')).toMatch(/2099/);
    });

    it('names the character after the file when it has no name', () => {
        const raw = fixture();
        raw.name = { value: '' };
        const [character] = parseLssFile(raw, 'nameless.json').characters;

        expect(character.name).toBe('nameless.json');
    });

    it('reads grimoire spells from an array, from { spells } and from { items }', () => {
        const fromArray = parseLssFile([SPELL], 'grimoire.json');
        const fromSpells = parseLssFile({ spells: [SPELL] }, 'grimoire.json');
        const fromItems = parseLssFile({ items: [SPELL] }, 'grimoire.json');

        for (const result of [fromArray, fromSpells, fromItems]) {
            expect(result.errors).toEqual([]);
            expect(result.characters).toEqual([]);
            expect(result.grimoire).toHaveLength(1);
            expect(result.grimoire[0]).toMatchObject({ name: 'Огненный шар [Fireball]' });
        }
    });

    it('reads a single spell object', () => {
        const result = parseLssFile(SPELL, 'one.json');

        expect(result.grimoire).toHaveLength(1);
        expect(result.characters).toEqual([]);
    });

    it('reads a mixed array of characters and spells', () => {
        const result = parseLssFile([fixture(), SPELL], 'mixed.json');

        expect(result.characters).toHaveLength(1);
        expect(result.grimoire).toHaveLength(1);
        expect(result.errors).toEqual([]);
    });
});

describe('parseLssFile: errors', () => {
    it('returns an error for broken JSON and does not throw', () => {
        const result = parseLssFile('{ "jsonType": "character", ', 'broken.json');

        expect(result.characters).toEqual([]);
        expect(result.grimoire).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/broken\.json/);
    });

    it('returns an error for a file of an unknown shape', () => {
        expect(parseLssFile('42', 'number.json').errors).toEqual(['number.json: неизвестный формат файла']);
        expect(parseLssFile({ foo: 1 }, 'foo.json').errors).toHaveLength(1);
        expect(parseLssFile({ foo: 1 }, 'foo.json').characters).toEqual([]);
    });

    it('reports an empty array', () => {
        expect(parseLssFile([], 'empty.json').errors).toEqual(['empty.json: в файле нет персонажей и заклинаний']);
    });

    it('reports a data string that is not JSON and keeps the other characters', () => {
        const bad = { jsonType: 'character', data: '{ not json' };
        const result = parseLssFile({ characters: [bad, fixture()] }, 'mix.json');

        expect(result.characters).toHaveLength(1);
        expect(result.characters[0].key).toBe('mix.json#1');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatch(/mix\.json#0/);
    });
});

describe('parseLssFile: tolerance to elfrey-lss-converter output', () => {
    function elfreyLike() {
        const raw = fixture();
        raw.isDefault = true;
        raw.traits = { value: 'x' };
        raw.size = 9;
        raw.info.charClass.label = 'Класс';
        raw.vitality.speed = { value: 30 };
        raw.vitality.ac = { value: 15 };
        raw.vitality.initiative = { value: 2 };
        raw.vitality.shield = { value: true, mod: 2 };
        raw.spellsInfo.save = { name: 'save', value: 13 };
        raw.saves.str = { name: 'str', isProf: 0.5 };
        raw.skills.athletics.isProf = 0.5;
        raw.skills.athletics.bonus = '1';
        raw.weaponsList[0].mod = { value: '+3' };
        raw.weaponsList[0].modCustom = { value: 2 };
        raw.text.traits.value.id = 'leaked-id';
        raw.stats.str.score = '13';
        return raw;
    }

    it('turns numbers into the types of the schema', () => {
        const { data } = parseLssFile(elfreyLike(), 'elfrey.json').characters[0];

        expect(data.vitality.speed).toEqual({ value: '30' });
        expect(data.vitality.ac).toEqual({ value: '15' });
        expect(data.vitality.initiative).toEqual({ value: '2' });
        expect(data.vitality.shield).toEqual({ value: true, mod: '2' });
        expect(data.spellsInfo.save.value).toBe('13');
        expect(data.stats.str.score).toBe(13);
    });

    it('keeps half proficiency and converts boolean proficiency', () => {
        const { data } = parseLssFile(elfreyLike(), 'elfrey.json').characters[0];

        expect(data.saves.str.isProf).toBe(0.5);
        expect(data.skills.athletics.isProf).toBe(0.5);
        expect(data.skills.athletics.bonus).toBe(1);
        expect(data.saves.con.isProf).toBe(1);
        expect(data.skills.history.isProf).toBe(1);
    });

    it('reports unknown root keys once and drops them', () => {
        const { data, warnings } = parseLssFile(elfreyLike(), 'elfrey.json').characters[0];

        expect(warnings.join(' ')).toMatch(/isDefault, traits, size/);
        expect(data).not.toHaveProperty('isDefault');
        expect(data).not.toHaveProperty('size');
    });

    it('removes text.*.value.id', () => {
        const { data } = parseLssFile(elfreyLike(), 'elfrey.json').characters[0];

        expect(data.text.traits.value).toEqual({ data: fixture().text.traits.value.data });
        expect(data.text.traits.value).not.toHaveProperty('id');
    });

    it('moves modCustom into modBonus and drops the derived mod', () => {
        const { data } = parseLssFile(elfreyLike(), 'elfrey.json').characters[0];

        expect(data.weaponsList[0].modBonus).toEqual({ value: 2 });
        expect(data.weaponsList[0]).not.toHaveProperty('mod');
        expect(data.weaponsList[0]).not.toHaveProperty('modCustom');
    });
});

describe('normalizeData', () => {
    it('returns a new object and does not change the input', () => {
        const input = fixture();
        const before = JSON.stringify(input);
        const output = normalizeData(input);

        expect(output).not.toBe(input);
        expect(JSON.stringify(input)).toBe(before);
    });

    it('accepts data as a JSON string', () => {
        expect(normalizeData(JSON.stringify(fixture()))).toEqual(normalizeData(fixture()));
    });

    it('guarantees the groups of the data on an empty input', () => {
        const data = normalizeData({});

        expect(Object.keys(data.stats).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
        for (const ability of Object.values(data.stats)) expect(ability.score).toBe(10);
        expect(Object.keys(data.saves).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
        for (const save of Object.values(data.saves)) expect(save.isProf).toBe(0);
        expect(data.info.level).toEqual({ name: 'level', value: 1 });
        expect(data).toMatchObject({
            skills: {},
            vitality: {},
            text: {},
            coins: {},
            resources: {},
            bonuses: [],
            effects: [],
            weaponsList: [],
            attunementsList: [],
            conditions: [],
            exhaustion: 0,
            inspiration: false,
            avatar: null,
        });
    });

    it('does not fail on unusable input', () => {
        expect(() => normalizeData(null)).not.toThrow();
        expect(() => normalizeData('{ broken')).not.toThrow();
        expect(normalizeData('{ broken').stats.str.score).toBe(10);
    });

    it('keeps proficiencyCustom 0 as a value (the caller decides what it means)', () => {
        const data = normalizeData({ proficiency: 3, proficiencyCustom: 0 });

        expect(data.proficiencyCustom).toBe(0);
        expect(data.proficiency).toBe(3);
    });

    it('clamps the level to 1..20 with a warning', () => {
        const high = parseLssFile({ jsonType: 'character', info: { level: { value: 25 } } }, 'h.json').characters[0];
        const low = parseLssFile({ jsonType: 'character', info: { level: { value: 0 } } }, 'l.json').characters[0];

        expect(high.level).toBe(20);
        expect(high.warnings.join(' ')).toMatch(/25/);
        expect(low.level).toBe(1);
    });

    it('keeps only slots-N keys in spells and reports the others', () => {
        const data = normalizeData({ spells: { 'slots-1': { value: '4', filled: 1 }, 'slots-10': { value: 1 } } });

        expect(data.spells['slots-1']).toEqual({ value: 4, filled: 1 });
        expect(data.spells).not.toHaveProperty('slots-10');
    });

    it('converts a legacy kind "override" into mode "set" and defaults mode to "add"', () => {
        const data = normalizeData({
            bonuses: [
                { id: 'a', target: 'ac', kind: 'override', value: '15' },
                { id: 'b', target: 'ac', value: 1 },
            ],
        });

        expect(data.bonuses[0]).toMatchObject({ mode: 'set', value: 15 });
        expect(data.bonuses[1].mode).toBe('add');
    });

    it('gives a missing weapon id a generated one', () => {
        const { data, warnings } = parseLssFile({
            jsonType: 'character',
            weaponsList: [{ name: { value: 'Кинжал' }, dmg: { value: '1к4+[DEX]' } }],
        }, 'w.json').characters[0];

        expect(data.weaponsList[0].id).toBe('weapon-1');
        expect(warnings.join(' ')).toMatch(/без id/);
    });
});
