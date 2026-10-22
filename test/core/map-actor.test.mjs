import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLssFile } from '../../scripts/core/parse.mjs';
import { computeStats, mapActor } from '../../scripts/core/map-actor.mjs';

const fixtureText = readFileSync(new URL('../fixtures/lss/character-example.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(fixtureText);

/** Parse a raw character object through the real reader and return its first character. */
function characterOf(raw) {
    const result = parseLssFile(raw, 'test.json');
    expect(result.errors).toEqual([]);
    return result.characters[0];
}

/** Map a raw character object (fresh stats are computed). */
function mapOf(raw, ctx) {
    return mapActor(characterOf(raw), undefined, ctx);
}

const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const block = (...content) => ({ value: { data: { type: 'doc', content } } });

describe('computeStats', () => {
    it('gives the fixture its scores, modifiers and proficiency', () => {
        const stats = computeStats(characterOf(fixture()));

        expect(stats.abilities.str).toEqual({ score: 13, mod: 1 });
        expect(stats.abilities.dex).toEqual({ score: 10, mod: 0 });
        expect(stats.abilities.con).toEqual({ score: 14, mod: 2 });
        expect(stats.abilities.wis).toEqual({ score: 16, mod: 3 });
        expect(stats.abilities.cha).toEqual({ score: 12, mod: 1 });
        expect(stats.prof).toBe(2);
        expect(stats.level).toBe(3);
        expect(stats.formulaCtx).toEqual({ abilities: { str: 1, dex: 0, con: 2, int: 0, wis: 3, cha: 1 }, prof: 2, level: 3 });
        expect(stats.warnings).toEqual([]);
    });

    it('takes proficiency from proficiencyCustom, then proficiency, then the level', () => {
        const byLevel = { jsonType: 'character', info: { level: { value: 5 } } };

        expect(computeStats(characterOf({ ...byLevel, proficiencyCustom: 0 })).prof).toBe(3);
        expect(computeStats(characterOf({ ...byLevel, proficiency: 4 })).prof).toBe(4);
        expect(computeStats(characterOf({ ...byLevel, proficiency: 4, proficiencyCustom: 6 })).prof).toBe(6);
    });

    it('adds an add-bonus to the score of its ability', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'Перчатки', target: 'stat.str.score', mode: 'add', value: 2,
            source: { kind: 'item', label: 'Перчатки' } }];
        const stats = computeStats(characterOf(raw));

        expect(stats.abilities.str).toEqual({ score: 15, mod: 2 });
    });

    it('evaluates an expression bonus against the base scores', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'x', target: 'stat.dex.score', expr: '[WIS]', source: { kind: 'user' } }];

        expect(computeStats(characterOf(raw)).abilities.dex.score).toBe(13);
    });

    it('lets a set-bonus replace the total, and the last set-bonus win', () => {
        const raw = fixture();
        raw.bonuses = [
            { id: 'a', label: 'a', target: 'stat.str.score', mode: 'add', value: 2, source: { kind: 'user' } },
            { id: 'b', label: 'b', target: 'stat.str.score', mode: 'set', value: 14, source: { kind: 'user' } },
            { id: 'c', label: 'c', target: 'stat.str.score', mode: 'set', value: 17, source: { kind: 'user' } },
        ];

        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(17);
    });

    it('ignores a disabled bonus', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'x', target: 'stat.str.score', value: 5, disabled: true, source: { kind: 'user' } }];

        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(13);
    });

    it('does not apply a conditional bonus and reports it', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'Ярость', target: 'stat.str.score', value: 2,
            conditional: { key: 'rage' }, source: { kind: 'user' } }];
        const stats = computeStats(characterOf(raw));

        expect(stats.abilities.str.score).toBe(13);
        expect(stats.warnings.join(' ')).toMatch(/условный бонус "Ярость"/);
    });

    it('counts an effect bonus only while the effect is enabled', () => {
        const raw = fixture();
        raw.effects = [{ id: 'e1', name: 'Камень силы', disabled: true }];
        raw.bonuses = [{ id: 'b', label: 'Камень', target: 'stat.str.score', value: 3,
            source: { kind: 'effect', refId: 'e1' } }];

        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(13);

        raw.effects[0].disabled = false;
        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(16);
    });

    it('reports an effect bonus whose effect does not exist', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'Сирота', target: 'stat.str.score', value: 3,
            source: { kind: 'effect', refId: 'missing' } }];
        const stats = computeStats(characterOf(raw));

        expect(stats.abilities.str.score).toBe(13);
        expect(stats.warnings.join(' ')).toMatch(/несуществующий эффект/);
    });

    it('counts an attunement bonus only for a checked attunement slot', () => {
        const raw = fixture();
        raw.attunementsList = [{ id: 'a1', checked: false, value: 'Кольцо' }];
        raw.bonuses = [{ id: 'b', label: 'Кольцо', target: 'stat.str.score', value: 2,
            source: { kind: 'attunement', refId: 'a1' } }];

        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(13);

        raw.attunementsList[0].checked = true;
        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(15);
    });

    it('reads bonuses stored on the stat itself', () => {
        const raw = fixture();
        raw.stats.str.bonuses = [{ id: 'b', label: 'Пояс', target: 'stat.str.score', value: 1, source: { kind: 'origin' } }];

        expect(computeStats(characterOf(raw)).abilities.str.score).toBe(14);
    });

    it('reports a multiply bonus on a score and does not apply it', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'Умножение', target: 'stat.str.score', mode: 'multiply', value: 2,
            source: { kind: 'user' } }];
        const stats = computeStats(characterOf(raw));

        expect(stats.abilities.str.score).toBe(13);
        expect(stats.warnings.join(' ')).toMatch(/режим "multiply"/);
    });
});

describe('mapActor: fixture', () => {
    it('maps the example character', () => {
        const actor = mapOf(fixture());

        expect(actor.name).toBe('Сестра Иоланда');
        expect(actor.img).toBeNull();
        expect(actor.warnings).toEqual([]);
        expect(actor.system.abilities.str).toEqual({ value: 13, proficient: 0, bonuses: { save: '' } });
        expect(actor.system.abilities.con).toEqual({ value: 14, proficient: 1, bonuses: { save: '' } });
        expect(actor.system.abilities.wis).toEqual({ value: 16, proficient: 1, bonuses: { save: '' } });
    });

    it('maps hit points, armor class, movement and the rest of attributes', () => {
        const { attributes } = mapOf(fixture()).system;

        expect(attributes.hp).toEqual({ value: 24, max: null, temp: 0 });
        expect(attributes.ac).toEqual({ calc: 'custom', formula: '10+@abilities.dex.mod + (2)' });
        expect(attributes.init).toEqual({ bonus: '' });
        expect(attributes.movement).toEqual({ walk: 30 });
        expect(attributes.senses).toEqual({ darkvision: null });
        expect(attributes.death).toEqual({ success: 0, failure: 0 });
        expect(attributes.inspiration).toBe(false);
        expect(attributes.spellcasting).toBe('wis');
    });

    it('maps the identity and the detail fields', () => {
        const { details } = mapOf(fixture()).system;

        expect(details.alignment).toBe('Lawful Good');
        expect(details.xp).toEqual({ value: 900 });
        expect(details).toMatchObject({
            age: '27', height: '168 см', weight: '60 кг', eyes: 'карие', skin: 'смуглая', hair: 'чёрные, коротко острижены',
        });
        expect(details.trait).toBe('Спокойна и внимательна к чужой боли.');
        expect(details).not.toHaveProperty('ideal');
    });

    it('builds the biography from the text blocks and the attunement list', () => {
        const { biography } = mapOf(fixture()).system.details;

        expect(biography.value).toBe([
            '<h3>Особенности</h3>',
            '<p>Channel Divinity: Preserve Life. Восстанавливает HP союзникам.</p>',
            '<p>Channel Divinity (1/1)</p>',
            '<h3>Снаряжение</h3>',
            '<p>Кольчуга, щит, священный символ, набор путешественника.</p>',
            '<h3>Настройка на предметы</h3>',
            '<ul><li>Кольцо защиты</li></ul>',
        ].join('\n'));
    });

    it('maps size, armor and weapon proficiencies, and currency', () => {
        const { traits, currency } = mapOf(fixture()).system;

        expect(traits.size).toBe('med');
        expect(traits.armorProf).toEqual({ value: ['lgt', 'med', 'shl'] });
        expect(traits.weaponProf).toEqual({ value: ['sim'] });
        expect(currency).toEqual({ pp: 0, gp: 15, ep: 0, sp: 8, cp: 0 });
    });

    it('maps skills to dnd5e ids with their abilities and proficiency', () => {
        const { skills } = mapOf(fixture()).system;

        expect(skills.ath).toEqual({ value: 1, ability: 'str', bonuses: { check: '', passive: '' } });
        expect(skills.his.value).toBe(1);
        expect(skills.ins.value).toBe(1);
        expect(skills.per.value).toBe(1);
        expect(skills.slt).toMatchObject({ value: 0, ability: 'dex' });
        expect(skills.ani).toMatchObject({ value: 0, ability: 'wis' });
        expect(Object.keys(skills)).toHaveLength(18);
    });

    it('writes the spell slot values as total minus filled', () => {
        const { spells } = mapOf(fixture()).system;

        expect(spells.spell1).toEqual({ value: 3 });
        expect(spells.spell2).toEqual({ value: 2 });
        expect(spells.spell3).toEqual({ value: 0 });
        expect(spells).not.toHaveProperty('pact');
    });

    it('sets the import targets', () => {
        const { targets } = mapOf(fixture());

        expect(targets.hpMax).toBe(24);
        expect(targets.hpCurrent).toBe(24);
        expect(targets.hpTemp).toBe(0);
        expect(targets.slots[1]).toEqual({ total: 4, filled: 1 });
        expect(targets.slots[2]).toEqual({ total: 2, filled: 0 });
        expect(targets.slots[9]).toEqual({ total: 0, filled: 0 });
        expect(targets.pact).toBeNull();
        expect(targets.conditions).toEqual([]);
        expect(targets.exhaustion).toBe(0);
    });

    it('does not write derived fields', () => {
        const { system } = mapOf(fixture());

        expect(system.details).not.toHaveProperty('level');
        expect(system.attributes).not.toHaveProperty('prof');
        expect(system.attributes).not.toHaveProperty('exhaustion');
        expect(system.attributes.hp.max).toBeNull();
    });

    it('gives the same result with precomputed stats', () => {
        const character = characterOf(fixture());

        expect(mapActor(character, computeStats(character))).toEqual(mapActor(character));
    });
});

describe('mapActor: saves and skills', () => {
    it('turns a custom skill total into the difference to dnd5e', () => {
        const raw = fixture();
        raw.stats.str.score = 16; // modifier +3
        raw.skills.athletics.customModifier = 9; // LSS total: 9; dnd5e calc: 3 + prof 2 = 5
        expect(mapOf(raw).system.skills.ath.bonuses.check).toBe('4');

        raw.skills.athletics.customModifier = 3;
        expect(mapOf(raw).system.skills.ath.bonuses.check).toBe('-2');
    });

    it('turns a custom save total into the difference to dnd5e', () => {
        const raw = fixture();
        raw.saves.con.customModifier = 6; // dnd5e calc: con mod 2 + prof 2 = 4

        expect(mapOf(raw).system.abilities.con.bonuses.save).toBe('2');
    });

    it('writes an expression bonus as a formula', () => {
        const raw = fixture();
        raw.saves.dex.bonus = 1;
        raw.saves.dex.bonusExpr = '[PROF]';

        expect(mapOf(raw).system.abilities.dex.bonuses.save).toBe('1 + @prof');
    });

    it('corrects proficient saves and skills when LSS uses another proficiency bonus', () => {
        const raw = fixture();
        raw.proficiencyCustom = 4; // level 3 gives dnd5e +2

        const { system, warnings } = mapOf(raw);
        expect(system.skills.ath.bonuses.check).toBe('2');
        expect(system.skills.acr.bonuses.check).toBe('');
        expect(system.abilities.con.bonuses.save).toBe('2');
        expect(system.abilities.str.bonuses.save).toBe('');
        expect(warnings).toEqual([]);
    });

    it('corrects a custom passive score with the check bonus and proficiency included', () => {
        const raw = fixture();
        raw.skills.insight.customPassive = 20;
        raw.proficiencyCustom = 4;
        const { system } = mapOf(raw);

        // Insight is proficient: check bonus 2 (correction), proficiency term 2, wisdom 3.
        // dnd5e: passive = 10 + 3 + 2 + 2 + passive bonus, which must bring it to 20.
        expect(system.skills.ins.bonuses.check).toBe('2');
        expect(system.skills.ins.bonuses.passive).toBe('3');
    });

    it('maps a custom passive for perception without a check bonus', () => {
        const raw = fixture();
        raw.skills.perception = { name: 'perception', baseStat: 'wis', customPassive: 15 };

        // Not proficient, wisdom 16 (+3): 10 + 3 = 13, so the passive bonus is 2.
        expect(mapOf(raw).system.skills.prc.bonuses.passive).toBe('2');
    });

    it('does not map a custom passive for skills that have none in LSS', () => {
        const raw = fixture();
        raw.skills.athletics.customPassive = 30;

        expect(mapOf(raw).system.skills.ath.bonuses.passive).toBe('');
    });

    it('writes an expertise save as proficient and reports it', () => {
        const raw = fixture();
        raw.saves.str.isProf = 2;
        const { system, warnings } = mapOf(raw);

        expect(system.abilities.str.proficient).toBe(1);
        expect(warnings.join(' ')).toMatch(/экспертиза/);
    });

    it('writes a half-proficient save as not proficient and reports it', () => {
        const raw = fixture();
        raw.saves.str.isProf = 0.5;
        const { system, warnings } = mapOf(raw);

        expect(system.abilities.str.proficient).toBe(0);
        expect(warnings.join(' ')).toMatch(/половина владения/);
    });

    it('keeps half proficiency for skills', () => {
        const raw = fixture();
        raw.skills.arcana.isProf = 0.5;

        expect(mapOf(raw).system.skills.arc.value).toBe(0.5);
    });

    it('writes a bonus expression that cannot roll as its current value and reports it', () => {
        const raw = fixture();
        raw.skills.arcana.bonusExpr = 'if([INT]>1, 2, 0)';
        const { system, warnings } = mapOf(raw);

        expect(system.skills.arc.bonuses.check).toBe('');
        expect(warnings.join(' ')).toMatch(/записана с заменой/);
    });

    it('reports a skill that exists only in aime and an unknown skill, and skips them', () => {
        const raw = fixture();
        raw.skills.riddle = { name: 'riddle', baseStat: 'int', isProf: 1 };
        raw.skills.juggling = { name: 'juggling', baseStat: 'dex' };
        const { system, warnings } = mapOf(raw);

        expect(warnings.join(' ')).toMatch(/riddle.*aime/);
        expect(warnings.join(' ')).toMatch(/неизвестный навык "juggling"/);
        expect(system.skills).not.toHaveProperty('riddle');
        expect(Object.keys(system.skills)).toHaveLength(18);
    });
});

describe('mapActor: armor class and initiative', () => {
    it('writes no shield bonus when the shield is off', () => {
        const raw = fixture();
        raw.vitality.shield = { value: false, mod: '2' };

        expect(mapOf(raw).system.attributes.ac).toEqual({ calc: 'custom', formula: '10+@abilities.dex.mod' });
    });

    it('uses 2 for the shield when no modifier is given, and the given one otherwise', () => {
        const raw = fixture();
        raw.vitality.shield = { value: true };
        expect(mapOf(raw).system.attributes.ac.formula).toBe('10+@abilities.dex.mod + (2)');

        raw.vitality.shield = { value: true, mod: '3' };
        expect(mapOf(raw).system.attributes.ac.formula).toBe('10+@abilities.dex.mod + (3)');
    });

    it('writes a flat armor class when the formula cannot roll in Foundry', () => {
        const raw = fixture();
        raw.vitality.ac = { value: 'if([STR] >= 1, 12, 10)' }; // STR modifier +1 gives 12
        raw.vitality.shield = { value: true, mod: '2' };
        const { system, warnings } = mapOf(raw);

        expect(system.attributes.ac).toEqual({ calc: 'flat', flat: 14 });
        expect(warnings.join(' ')).toMatch(/записан числом 14/);
    });

    it('keeps the default armor class when there is no formula', () => {
        const raw = fixture();
        raw.vitality.ac = { value: '' };
        raw.vitality.shield = { value: false, mod: '2' };
        const { system, warnings } = mapOf(raw);

        expect(system.attributes).not.toHaveProperty('ac');
        expect(warnings).toEqual([]);
    });

    it('reports a shield without an armor class', () => {
        const raw = fixture();
        raw.vitality.ac = { value: '' };
        raw.vitality.shield = { value: true, mod: '2' };

        expect(mapOf(raw).warnings.join(' ')).toMatch(/щит включён/);
    });

    it('reports an armor class that cannot be evaluated and keeps the default', () => {
        const raw = fixture();
        raw.vitality.ac = { value: '[FOO]+1' };
        const { system, warnings } = mapOf(raw);

        expect(system.attributes).not.toHaveProperty('ac');
        expect(warnings.join(' ')).toMatch(/КД "\[FOO\]\+1" не переносится/);
    });

    it('removes the Dexterity modifier from the initiative formula', () => {
        const cases = [
            ['[DEX]+2', '2'],
            ['[DEX]', ''],
            ['1+[DEX]', '1'],
            [null, ''],
            [3, '3'],
        ];
        for (const [value, expected] of cases) {
            const raw = fixture();
            raw.vitality.initiative = { value };
            expect(mapOf(raw).system.attributes.init.bonus).toBe(expected);
        }
    });

    it('takes an initiative that cannot roll in Foundry as its current value minus Dexterity', () => {
        const raw = fixture();
        raw.stats.dex.score = 16; // modifier +3
        raw.vitality.initiative = { value: 'if([DEX] > 2, 5, 0)' }; // LSS total 5

        expect(mapOf(raw).system.attributes.init.bonus).toBe('2');
    });
});

describe('mapActor: hit points, spells, conditions', () => {
    it('adds the maximum bonus to the target and keeps current and temporary HP', () => {
        const raw = fixture();
        raw.vitality['hp-max'] = { value: 20 };
        raw.vitality['hp-max-bonus'] = { value: 2 };
        raw.vitality['hp-current'] = { value: 12 };
        raw.vitality['hp-temp'] = { value: 3 };
        const { system, targets } = mapOf(raw);

        expect(targets).toMatchObject({ hpMax: 22, hpCurrent: 12, hpTemp: 3 });
        expect(system.attributes.hp).toEqual({ value: 12, max: null, temp: 3 });
    });

    it('writes spell slots as total minus filled, never below zero', () => {
        const raw = fixture();
        raw.spells = {
            'slots-1': { value: 4, filled: 4 },
            'slots-3': { value: 2, filled: 3 },
            'slots-9': { value: 1, filled: 0 },
        };
        const { system, targets } = mapOf(raw);

        expect(system.spells.spell1.value).toBe(0);
        expect(system.spells.spell3.value).toBe(0);
        expect(targets.slots[3]).toEqual({ total: 2, filled: 3 });
        expect(system.spells.spell9.value).toBe(1);
    });

    it('maps pact magic from spellsPact', () => {
        const raw = fixture();
        raw.spellsPact = { 'slots-3': { value: 2, filled: 1 } };
        const { system, targets } = mapOf(raw);

        expect(targets.pact).toEqual({ level: 3, total: 2, filled: 1 });
        expect(system.spells.pact).toEqual({ value: 1 });
    });

    it('takes the highest pact level and reports several', () => {
        const raw = fixture();
        raw.spellsPact = { 'slots-2': { value: 2, filled: 0 }, 'slots-4': { value: 1, filled: 0 } };
        const { targets, warnings } = mapOf(raw);

        expect(targets.pact.level).toBe(4);
        expect(warnings.join(' ')).toMatch(/несколько кругов/);
    });

    it('keeps only known conditions and reports the others', () => {
        const raw = fixture();
        raw.conditions = ['blinded', 'Stunned', 'bogus'];
        const { targets, warnings } = mapOf(raw);

        expect(targets.conditions).toEqual(['blinded', 'stunned']);
        expect(warnings.join(' ')).toMatch(/состояние "bogus"/);
    });

    it('maps exhaustion, death saves and darkvision', () => {
        const raw = fixture();
        raw.exhaustion = 2;
        raw.vitality.deathSuccesses = 2;
        raw.vitality.deathFails = 1;
        raw.vitality.darkvision = { value: 60 };
        const { system, targets } = mapOf(raw);

        expect(targets.exhaustion).toBe(2);
        expect(system.attributes.death).toEqual({ success: 2, failure: 1 });
        expect(system.attributes.senses).toEqual({ darkvision: 60 });
    });

    it('maps the speed as a number', () => {
        const raw = fixture();
        raw.vitality.speed = { value: '25' };

        expect(mapOf(raw).system.attributes.movement).toEqual({ walk: 25 });
    });

    it('maps the spellcasting ability and reports an unknown one', () => {
        const raw = fixture();
        raw.spellsInfo.base.code = 'cha';
        expect(mapOf(raw).system.attributes.spellcasting).toBe('cha');

        raw.spellsInfo.base.code = 'xyz';
        const { system, warnings } = mapOf(raw);
        expect(system.attributes).not.toHaveProperty('spellcasting');
        expect(warnings.join(' ')).toMatch(/"xyz" не распознана/);
    });

    it('reports a dying flag and a spell custom modifier, which are not mapped', () => {
        const raw = fixture();
        raw.vitality.isDying = true;
        raw.spellsInfo.save.customModifier = 15;
        const { warnings } = mapOf(raw);

        expect(warnings.join(' ')).toMatch(/умирает/);
        expect(warnings.join(' ')).toMatch(/customModifier/);
    });

    it('maps inspiration', () => {
        const raw = fixture();
        raw.inspiration = true;

        expect(mapOf(raw).system.attributes.inspiration).toBe(true);
    });
});

describe('mapActor: biography and text', () => {
    function biographyRaw() {
        const raw = fixture();
        raw.text = {
            background: block(p('Предыстория героя.')),
            'notes-2': block(p('Заметка')),
            'spells-level-0': block(p('Свет')),
            'spells-level-2': block(p('Тьма')),
            features: { ...block(p('Особенность')), customLabel: 'Мои умения' },
            unknownBlock: block(p('Неизвестный')),
            empty: block(),
            personality: block(p('Характер <b>жирный</b>')),
            appearance: block(p('Внешность')),
        };
        raw.attunementsList = [
            { id: 'a1', checked: true, value: 'Амулет <script>' },
            { id: 'a2', checked: false, value: 'Не надет' },
        ];
        return raw;
    }

    it('starts the biography with the background block and titles the other sections', () => {
        const { biography } = mapOf(biographyRaw()).system.details;

        expect(biography.value.startsWith('<p>Предыстория героя.</p>')).toBe(true);
        expect(biography.value).toContain('<h3>Заметки 2</h3>\n<p>Заметка</p>');
        expect(biography.value).toContain('<h3>Заговоры</h3>\n<p>Свет</p>');
        expect(biography.value).toContain('<h3>Заклинания 2-го круга</h3>\n<p>Тьма</p>');
        expect(biography.value).toContain('<h3>Мои умения</h3>\n<p>Особенность</p>');
        expect(biography.value).toContain('<h3>unknownBlock</h3>\n<p>Неизвестный</p>');
    });

    it('skips empty sections and blocks that fill detail fields', () => {
        const { biography } = mapOf(biographyRaw()).system.details;

        expect(biography.value).not.toContain('empty');
        expect(biography.value).not.toContain('Характер');
        expect(biography.value).not.toContain('Внешность');
    });

    it('lists only checked attunement items, escaped', () => {
        const { biography } = mapOf(biographyRaw()).system.details;

        expect(biography.value).toContain('<h3>Настройка на предметы</h3>\n<ul><li>Амулет &lt;script&gt;</li></ul>');
        expect(biography.value).not.toContain('Не надет');
    });

    it('fills the trait and appearance fields with plain text, not markup', () => {
        const { details } = mapOf(biographyRaw()).system;

        expect(details.trait).toBe('Характер <b>жирный</b>');
        expect(details.appearance).toBe('Внешность');
    });

    it('joins paragraphs of a detail field with a space', () => {
        const raw = fixture();
        raw.text = { bonds: block(p('Первая'), p('Вторая &amp; <i>третья</i>')) };

        expect(mapOf(raw).system.details.bond).toBe('Первая Вторая &amp; <i>третья</i>');
    });

    it('escapes script markup in the biography', () => {
        const raw = fixture();
        raw.text = { features: block(p('<script>alert(1)</script>')) };
        const { biography } = mapOf(raw).system.details;

        expect(biography.value).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(biography.value).not.toContain('<script>');
    });
});

describe('mapActor: other fields', () => {
    it('takes the portrait from webp, then jpeg, and respects useAvatar', () => {
        const raw = fixture();
        raw.avatar = { webp: 'a.webp', jpeg: 'a.jpg' };
        expect(mapOf(raw).img).toBe('a.webp');
        expect(mapOf(raw, { options: { useAvatar: false } }).img).toBeNull();

        raw.avatar = { webp: '', jpeg: 'a.jpg' };
        expect(mapOf(raw).img).toBe('a.jpg');

        raw.avatar = null;
        expect(mapOf(raw).img).toBeNull();
    });

    it('maps the size and reports an unknown size', () => {
        const raw = fixture();
        raw.info.size = { value: 'huge' };
        expect(mapOf(raw).system.traits.size).toBe('huge');

        raw.info.size = { value: 'gargantuan' };
        expect(mapOf(raw).system.traits.size).toBe('grg');

        raw.info.size = { value: 'colossal' };
        const { system, warnings } = mapOf(raw);
        expect(system.traits).not.toHaveProperty('size');
        expect(warnings.join(' ')).toMatch(/"colossal" не распознан/);
    });

    it('maps other weapons to a custom proficiency text', () => {
        const raw = fixture();
        raw.prof['weapon-other'] = { value: true };

        expect(mapOf(raw).system.traits.weaponProf).toEqual({ value: ['sim'], custom: 'Прочее оружие' });
    });

    it('does not touch proficiencies when the character has no prof block', () => {
        const raw = fixture();
        delete raw.prof;
        const { traits } = mapOf(raw).system;

        expect(traits).not.toHaveProperty('armorProf');
        expect(traits).not.toHaveProperty('weaponProf');
    });

    it('writes only the coins the character has', () => {
        const raw = fixture();
        raw.coins = { gp: { value: 5 } };

        expect(mapOf(raw).system.currency).toEqual({ gp: 5 });
    });

    it('uses the file name when the character has no name', () => {
        const raw = fixture();
        raw.name = { value: '' };

        expect(mapOf(raw).name).toBe('test.json');
    });

    it('reports a warning from computeStats', () => {
        const raw = fixture();
        raw.bonuses = [{ id: 'b', label: 'Сирота', target: 'stat.str.score', value: 3,
            source: { kind: 'effect', refId: 'missing' } }];

        expect(mapOf(raw).warnings.join(' ')).toMatch(/несуществующий эффект/);
    });
});
