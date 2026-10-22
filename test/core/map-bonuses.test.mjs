import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapBonuses } from '../../scripts/core/map-bonuses.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/lss/character-example.json', import.meta.url), 'utf8'));

const formulaCtx = { abilities: { str: 1, dex: 0, con: 2, int: 0, wis: 3, cha: 1 }, prof: 2, level: 3 };
const stats = { abilities: {}, prof: 2, level: 3, formulaCtx };

/** Deterministic ids: `rid1`, `rid2`, … */
function makeCtx() {
    let counter = 0;
    return { randomID: () => `rid${++counter}` };
}

const emptyData = {
    bonuses: [],
    effects: [],
    attunementsList: [],
    weaponsList: [],
    vitality: { shield: { value: false } },
    stats: {},
};

let bonusCounter = 0;

/** A bonus with defaults: `add`, value 1, source `item`. */
function bonus(target, extra = {}) {
    bonusCounter += 1;
    return {
        id: `b${bonusCounter}`,
        label: `bonus ${bonusCounter}`,
        target,
        mode: 'add',
        value: 1,
        source: { kind: 'item', label: 'item' },
        ...extra,
    };
}

/** Map a character made of `emptyData` plus `data`. */
function run(data = {}) {
    return mapBonuses({ data: { ...emptyData, ...data } }, stats, makeCtx());
}

/** Map one bonus and return its changes, all groups together. */
function changesFor(target, extra = {}, value = 1) {
    const result = run({ bonuses: [bonus(target, { value, ...extra })] });
    return result.effects.flatMap((effect) => effect.changes);
}

/** The single change a bonus produces. */
function oneChange(target, extra = {}, value = 1) {
    const changes = changesFor(target, extra, value);
    expect(changes).toHaveLength(1);
    return changes[0];
}

const ADD = 2;
const OVERRIDE = 5;
const UPGRADE = 4;
const DOWNGRADE = 3;
const MULTIPLY = 1;

describe('mapBonuses: fixture', () => {
    const result = mapBonuses({ data: fixture }, stats, makeCtx());

    it('sums the hp.max bonus of the fixture into hpMax', () => {
        expect(result.hpMax).toBe(3);
    });

    it('puts the enabled ring bonus into an enabled group, not transferred', () => {
        expect(result.effects).toHaveLength(1);
        const [effect] = result.effects;
        expect(effect.name).toBe('LSS: бонусы');
        expect(effect.disabled).toBe(false);
        expect(effect.transfer).toBe(false);
        expect(effect.type).toBe('base');
        expect(effect.img).toBe('icons/svg/aura.svg');
        expect(effect._id).toEqual(expect.any(String));
        expect(effect.changes).toEqual([{ key: 'system.attributes.ac.bonus', mode: ADD, value: '1' }]);
        expect(effect.flags).toEqual({ 'lss-to-foundry': { imported: true } });
    });

    it('has no skipped entries and no warnings for the fixture', () => {
        expect(result.skipped).toEqual([]);
        expect(result.warnings).toEqual([]);
    });
});

describe('mapBonuses: formula table (DESIGN §6.3)', () => {
    it('maps ac and initiative to their bonuses', () => {
        expect(oneChange('ac')).toEqual({ key: 'system.attributes.ac.bonus', mode: ADD, value: '1' });
        expect(oneChange('initiative')).toEqual({ key: 'system.attributes.init.bonus', mode: ADD, value: '1' });
    });

    it('maps save.all, save.<ab>, check.all and stat.<ab>.check', () => {
        expect(oneChange('save.all')).toEqual({ key: 'system.bonuses.abilities.save', mode: ADD, value: '1' });
        expect(oneChange('save.str')).toEqual({ key: 'system.abilities.str.bonuses.save', mode: ADD, value: '1' });
        expect(oneChange('check.all')).toEqual({ key: 'system.bonuses.abilities.check', mode: ADD, value: '1' });
        expect(oneChange('stat.dex.check')).toEqual({ key: 'system.abilities.dex.bonuses.check', mode: ADD, value: '1' });
    });

    it('maps skill.<k> and passive.<k> with the dnd5e skill ids', () => {
        expect(oneChange('skill.athletics')).toEqual({ key: 'system.skills.ath.bonuses.check', mode: ADD, value: '1' });
        expect(oneChange('passive.perception')).toEqual({ key: 'system.skills.prc.bonuses.passive', mode: ADD, value: '1' });
    });

    it('maps attack.all, damage.weapon, spellAttack and spellDC', () => {
        expect(changesFor('attack.all').map((change) => change.key)).toEqual([
            'system.bonuses.mwak.attack',
            'system.bonuses.rwak.attack',
        ]);
        expect(changesFor('damage.weapon').map((change) => change.key)).toEqual([
            'system.bonuses.mwak.damage',
            'system.bonuses.rwak.damage',
        ]);
        expect(changesFor('spellAttack').map((change) => change.key)).toEqual([
            'system.bonuses.msak.attack',
            'system.bonuses.rsak.attack',
        ]);
        expect(oneChange('spellDC')).toEqual({ key: 'system.bonuses.spell.dc', mode: ADD, value: '1' });
    });

    it('maps shield to the AC bonus only when the shield is equipped', () => {
        const on = run({ bonuses: [bonus('shield', { value: 2 })], vitality: { shield: { value: true } } });
        expect(on.effects).toHaveLength(1);
        expect(on.effects[0].name).toBe('LSS: бонусы');
        expect(on.effects[0].changes).toEqual([{ key: 'system.attributes.ac.bonus', mode: ADD, value: '2' }]);

        const off = run({ bonuses: [bonus('shield', { value: 2 })] });
        expect(off.effects).toHaveLength(1);
        expect(off.effects[0].name).toBe('LSS: отключённые бонусы');
        expect(off.effects[0].disabled).toBe(true);
    });

    it('maps speed.walk as a number', () => {
        expect(oneChange('speed.walk', { value: 10 })).toEqual({
            key: 'system.attributes.movement.walk',
            mode: ADD,
            value: '10',
        });
        expect(oneChange('speed.walk', { value: null, expr: 'floor([LVL]/2)' })).toEqual({
            key: 'system.attributes.movement.walk',
            mode: ADD,
            value: '1',
        });
    });

    it('maps proficiency of saves and skills with UPGRADE', () => {
        expect(oneChange('prof.save.str', { value: 1 })).toEqual({
            key: 'system.abilities.str.proficient',
            mode: UPGRADE,
            value: '1',
        });
        expect(oneChange('prof.skill.athletics', { value: 2 })).toEqual({
            key: 'system.skills.ath.value',
            mode: UPGRADE,
            value: '2',
        });
        expect(oneChange('prof.skill.athletics', { value: undefined, expr: null })).toEqual({
            key: 'system.skills.ath.value',
            mode: UPGRADE,
            value: '1',
        });
    });

    it('adds armour and weapon proficiency values with ADD', () => {
        expect(oneChange('prof.armor-light')).toEqual({ key: 'system.traits.armorProf.value', mode: ADD, value: 'lgt' });
        expect(oneChange('prof.armor-label')).toEqual({ key: 'system.traits.armorProf.value', mode: ADD, value: 'shl' });
        expect(oneChange('prof.weapon-martial')).toEqual({ key: 'system.traits.weaponProf.value', mode: ADD, value: 'mar' });
    });

    it('maps the extra HP, spell slots and pact slots to sums, not to effects', () => {
        const result = run({
            bonuses: [
                bonus('hp.max', { value: 3 }),
                bonus('hp.max', { value: null, expr: '[LVL]' }),
                bonus('spellSlot.3', { value: 1 }),
                bonus('spellSlot.3', { value: 1 }),
                bonus('pactSlot.2', { value: 2 }),
            ],
        });
        expect(result.hpMax).toBe(6);
        expect(result.slots.spell[3]).toBe(2);
        expect(result.slots.spell[1]).toBe(0);
        expect(result.slots.pact).toBe(2);
        expect(result.effects).toEqual([]);
    });

    it('collects weapon bonuses per weapon id and field', () => {
        const result = run({
            weaponsList: [{ id: 'w1', name: { value: 'Меч' } }],
            bonuses: [
                bonus('weapon.w1.attack', { value: 1 }),
                bonus('weapon.w1.damage', { value: null, expr: '[PROF]' }),
            ],
        });
        expect(result.weapon).toEqual({ w1: { attack: ['1'], damage: ['@prof'] } });
        expect(result.effects).toEqual([]);
    });
});

describe('mapBonuses: modes', () => {
    it('maps add, set, upgrade, downgrade and multiply to the dnd5e modes', () => {
        const modes = { add: ADD, set: OVERRIDE, upgrade: UPGRADE, downgrade: DOWNGRADE, multiply: MULTIPLY };
        for (const [mode, code] of Object.entries(modes)) {
            expect(oneChange('ac', { mode }).mode).toBe(code);
        }
    });

    it('treats a missing mode as add', () => {
        const { mode, ...withoutMode } = bonus('ac');
        const result = run({ bonuses: [withoutMode] });
        expect(result.effects[0].changes[0].mode).toBe(ADD);
    });

    it('copies a numeric priority into the change', () => {
        expect(oneChange('ac', { priority: 5 })).toEqual({ key: 'system.attributes.ac.bonus', mode: ADD, value: '1', priority: 5 });
    });

    it('evaluates an expr through the formula context', () => {
        expect(oneChange('save.str', { value: null, expr: '[WIS]+[PROF]' }).value).toBe('@abilities.wis.mod+@prof');
    });
});

describe('mapBonuses: advantage and disadvantage', () => {
    it('sets the roll mode on a save, an ability check and a skill', () => {
        expect(oneChange('save.str', { mode: 'advantage', value: null })).toEqual({
            key: 'system.abilities.str.save.roll.mode',
            mode: ADD,
            value: '1',
        });
        expect(oneChange('stat.dex.check', { mode: 'disadvantage', value: null })).toEqual({
            key: 'system.abilities.dex.check.roll.mode',
            mode: ADD,
            value: '-1',
        });
        expect(oneChange('skill.stealth', { mode: 'disadvantage', value: null })).toEqual({
            key: 'system.skills.ste.roll.mode',
            mode: ADD,
            value: '-1',
        });
    });

    it('skips advantage on targets without a roll mode', () => {
        const result = run({ bonuses: [bonus('hp.max', { mode: 'advantage', value: null })] });
        expect(result.skipped).toEqual([
            expect.objectContaining({ target: 'hp.max', reason: 'advantage is not supported for this target' }),
        ]);
    });
});

describe('mapBonuses: groups and activity', () => {
    it('creates no effect when there are no changes', () => {
        expect(run().effects).toEqual([]);
    });

    it('puts a disabled bonus into the disabled group', () => {
        const result = run({ bonuses: [bonus('ac', { disabled: true, label: 'Отключено' })] });
        expect(result.effects).toHaveLength(1);
        expect(result.effects[0]).toMatchObject({ name: 'LSS: отключённые бонусы', disabled: true });
        expect(result.effects[0].description).toBe('<ul><li>Отключено</li></ul>');
    });

    it('puts a conditional bonus into the conditional group, disabled', () => {
        const result = run({ bonuses: [bonus('ac', { conditional: { key: 'rage' }, label: 'Ярость' })] });
        expect(result.effects).toHaveLength(1);
        expect(result.effects[0]).toMatchObject({ name: 'LSS: условные бонусы', disabled: true });
    });

    it('keeps the enabled, disabled and conditional groups apart', () => {
        const result = run({
            bonuses: [
                bonus('ac'),
                bonus('initiative', { disabled: true }),
                bonus('spellDC', { conditional: { key: 'x' } }),
            ],
        });
        expect(result.effects.map((effect) => [effect.name, effect.disabled])).toEqual([
            ['LSS: бонусы', false],
            ['LSS: отключённые бонусы', true],
            ['LSS: условные бонусы', true],
        ]);
    });

    it('creates one effect per data.effects entry that carries the effect bonuses', () => {
        const result = run({
            effects: [{ id: 'e1', name: 'Камень удачи', description: 'Плюс', disabled: false }],
            bonuses: [bonus('ac', { source: { kind: 'effect', refId: 'e1', label: 'Камень удачи' } })],
        });
        expect(result.effects).toHaveLength(1);
        expect(result.effects[0]).toMatchObject({
            name: 'Камень удачи',
            disabled: false,
            description: 'Плюс',
            transfer: false,
            flags: { 'lss-to-foundry': { imported: true, lssId: 'e1' } },
        });
        expect(result.effects[0].changes).toEqual([{ key: 'system.attributes.ac.bonus', mode: ADD, value: '1' }]);
    });

    it('disables the effect and its bonuses when the effect is disabled, and does not count hp', () => {
        const result = run({
            effects: [{ id: 'e1', name: 'Заклинание', disabled: true }],
            bonuses: [
                bonus('ac', { source: { kind: 'effect', refId: 'e1' } }),
                bonus('hp.max', { value: 5, source: { kind: 'effect', refId: 'e1' } }),
            ],
        });
        expect(result.effects).toHaveLength(1);
        expect(result.effects[0]).toMatchObject({ name: 'Заклинание', disabled: true });
        expect(result.hpMax).toBe(0);
        expect(result.skipped).toEqual([
            expect.objectContaining({ target: 'hp.max', reason: 'not applied: effect "Заклинание" is disabled' }),
        ]);
    });

    it('keeps a disabled bonus of an enabled effect out of that effect', () => {
        const result = run({
            effects: [{ id: 'e1', name: 'Эффект', disabled: false }],
            bonuses: [bonus('ac', { disabled: true, source: { kind: 'effect', refId: 'e1' } })],
        });
        expect(result.effects.map((effect) => effect.name)).toEqual(['LSS: отключённые бонусы']);
    });

    it('treats an effect reference that does not exist as a plain bonus, with a warning', () => {
        const result = run({
            bonuses: [bonus('ac', { label: 'Плюс', source: { kind: 'effect', refId: 'nope' } })],
        });
        expect(result.effects[0].name).toBe('LSS: бонусы');
        expect(result.warnings).toEqual(['"Плюс": effect "nope" not found, the bonus is kept as a plain one']);
    });
});

describe('mapBonuses: attunement', () => {
    const slot = { id: 'a1', checked: true, value: 'Кольцо' };

    it('applies an attunement bonus when the slot is checked', () => {
        const result = run({
            attunementsList: [slot],
            bonuses: [bonus('ac', { source: { kind: 'attunement', refId: 'a1' } })],
        });
        expect(result.effects[0].name).toBe('LSS: бонусы');
    });

    it('does not apply an attunement bonus when the slot is unchecked', () => {
        const result = run({
            attunementsList: [{ ...slot, checked: false }],
            bonuses: [bonus('ac', { source: { kind: 'attunement', refId: 'a1' } })],
        });
        expect(result.effects[0]).toMatchObject({ name: 'LSS: отключённые бонусы', disabled: true });
    });

    it('does not apply an attunement bonus whose slot does not exist', () => {
        const result = run({ bonuses: [bonus('ac', { source: { kind: 'attunement', refId: 'missing' } })] });
        expect(result.effects[0].name).toBe('LSS: отключённые бонусы');
    });

    it('does not apply an attunement hp bonus when the slot is unchecked, and reports it', () => {
        const result = run({
            attunementsList: [{ ...slot, checked: false }],
            bonuses: [bonus('hp.max', { value: 4, source: { kind: 'attunement', refId: 'a1' } })],
        });
        expect(result.hpMax).toBe(0);
        expect(result.skipped).toEqual([
            expect.objectContaining({ reason: 'not applied: attunement slot is not checked' }),
        ]);
    });
});

describe('mapBonuses: stat scores and skipped bonuses', () => {
    it('does not map ability scores, they are baked into computeStats', () => {
        const result = run({ bonuses: [bonus('stat.str.score', { value: 2 })] });
        expect(result.effects).toEqual([]);
        expect(result.skipped).toEqual([
            expect.objectContaining({ target: 'stat.str.score', reason: 'baked into ability score' }),
        ]);
    });

    it('lists every bonus it cannot translate, with a reason', () => {
        const result = run({
            bonuses: [
                bonus('stat.str.attack'),
                bonus('skill.riddle'),
                bonus('save.cor'),
                bonus('prof.save.cor', { value: 1 }),
                bonus('prof.weapon-other'),
                bonus('hp.temp'),
                bonus('hp.max', { mode: 'set' }),
                bonus('weapon.nope.attack'),
                bonus('ac', { value: null, expr: 'max(' }),
            ],
        });
        expect(result.skipped.map((entry) => entry.target)).toEqual([
            'stat.str.attack',
            'skill.riddle',
            'save.cor',
            'prof.save.cor',
            'prof.weapon-other',
            'hp.temp',
            'hp.max',
            'weapon.nope.attack',
            'ac',
        ]);
        for (const entry of result.skipped) {
            expect(entry).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String), reason: expect.any(String) }));
        }
        expect(result.skipped[1].reason).toBe('AIME-only skill has no dnd5e counterpart');
        expect(result.skipped[5].reason).toBe('target "hp.temp" is not translated');
    });

    it('reports legacy bonusesSkills and bonusesStats when they have content', () => {
        const result = run({ bonusesSkills: { x: 1 }, bonusesStats: [] });
        expect(result.warnings).toEqual(['data.bonusesSkills is not imported: its format is not documented']);
    });
});

describe('mapBonuses: skills with spaces in their keys', () => {
    it('maps animal handling and sleight of hand', () => {
        expect(oneChange('skill.animal handling').key).toBe('system.skills.ani.bonuses.check');
        expect(oneChange('skill.sleight of hand').key).toBe('system.skills.slt.bonuses.check');
        expect(oneChange('passive.investigation').key).toBe('system.skills.inv.bonuses.passive');
    });
});
