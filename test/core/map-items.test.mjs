import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapResources, mapWeapons } from '../../scripts/core/map-items.mjs';
import { mapBonuses } from '../../scripts/core/map-bonuses.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/lss/character-example.json', import.meta.url), 'utf8'));

const formulaCtx = { abilities: { str: 1, dex: 0, con: 2, int: 0, wis: 3, cha: 1 }, prof: 2, level: 3 };
const stats = { abilities: {}, prof: 2, level: 3, formulaCtx };

/** Deterministic ids: `rid1`, `rid2`, … */
function makeCtx() {
    let counter = 0;
    return { randomID: () => `rid${++counter}` };
}

/** A weapon with sane defaults; `extra` overrides fields. */
function weapon(extra = {}) {
    return {
        id: 'weapon-test',
        name: { value: 'Тест' },
        dmg: { value: '1к6' },
        ability: 'str',
        isProf: true,
        dmgType: { value: 'колющий' },
        notes: { value: '' },
        ...extra,
    };
}

/** Map one weapon and return its item, activity and base damage. */
function mapOne(weaponData, weaponBonuses = {}) {
    const { items, warnings } = mapWeapons({ data: { weaponsList: [weaponData] } }, stats, weaponBonuses, makeCtx());
    const item = items[0];
    const activity = Object.values(item.system.activities)[0];
    return { item, activity, base: item.system.damage.base, warnings };
}

describe('mapWeapons: fixture', () => {
    const { items, warnings } = mapWeapons(
        { data: fixture },
        stats,
        { 'weapon-1780000000003': { attack: [], damage: [] } },
        makeCtx(),
    );
    const [mace, crossbow] = items;

    it('maps every weapon of the fixture', () => {
        expect(items.map((item) => item.name)).toEqual(['Булава', 'Лёгкий арбалет']);
        expect(items.every((item) => item.type === 'weapon' && item.img === 'icons/svg/sword.svg')).toBe(true);
    });

    it('builds the mace: 1d6 bludgeoning, str attack, no extra bonus', () => {
        expect(mace.system.identifier).toBe('bulava');
        expect(mace.system.type).toEqual({ value: 'simpleM', baseItem: '' });
        expect(mace.system.proficient).toBe(1);
        expect(mace.system.equipped).toBe(true);
        expect(mace.system.quantity).toBe(1);
        expect(mace.system.properties).toEqual([]);
        expect(mace.system.damage.base).toEqual({
            number: 1,
            denomination: 6,
            bonus: '',
            types: ['bludgeoning'],
            custom: { enabled: false, formula: '' },
            scaling: { mode: '', number: 1, formula: '' },
        });
    });

    it('keys the activity by its _id and gives it the minimal attack shape', () => {
        const [id] = Object.keys(mace.system.activities);
        const activity = mace.system.activities[id];
        expect(activity._id).toBe(id);
        expect(activity.type).toBe('attack');
        expect(activity.activation).toEqual({ type: 'action', value: null, condition: '', override: false });
        expect(activity.attack).toEqual({
            ability: 'str',
            bonus: '',
            critical: { threshold: null },
            flat: false,
            type: { value: 'melee', classification: 'weapon' },
        });
        expect(activity.damage).toEqual({ critical: { bonus: '' }, includeBase: true, parts: [] });
    });

    it('marks the mace as imported with its LSS id', () => {
        expect(mace.flags).toEqual({ 'lss-to-foundry': { imported: true, lssId: 'weapon-1780000000002' } });
    });

    it('treats the light crossbow as ranged by name, with dex and no finesse', () => {
        expect(crossbow.system.type.value).toBe('simpleR');
        expect(crossbow.system.activities[Object.keys(crossbow.system.activities)[0]].attack.type.value).toBe('ranged');
        expect(crossbow.system.activities[Object.keys(crossbow.system.activities)[0]].attack.ability).toBe('dex');
        expect(crossbow.system.properties).toEqual([]);
        expect(crossbow.system.description.value).toBe('<p>перезарядка, боеприпасы (80/320 фт.)</p>');
    });

    it('reports the crossbow without a damage type instead of inventing one', () => {
        expect(crossbow.system.damage.base.types).toEqual([]);
        expect(warnings).toEqual(['weapon "Лёгкий арбалет": damage type is not recognised']);
    });
});

describe('mapWeapons: damage formula and the automatic @mod', () => {
    it('cancels the attack ability when the formula has no ability variable', () => {
        const { base } = mapOne(weapon({ dmg: { value: '1к4' }, ability: 'str' }));
        // dnd5e adds `@mod` (str) to the base die part; the bonus takes it back out.
        expect(base.bonus).toBe('-@abilities.str.mod');
        expect(base.bonus).not.toContain('@mod');
    });

    it('keeps the attack ability when the formula already has it', () => {
        const { base } = mapOne(weapon({ dmg: { value: '1к6+[STR]' }, ability: 'str' }));
        expect(base.bonus).toBe('');
        expect(base.number).toBe(1);
        expect(base.denomination).toBe(6);
    });

    it('adds another ability of the formula and cancels the attack ability', () => {
        const { base } = mapOne(weapon({ dmg: { value: '1к6+[DEX]' }, ability: 'str' }));
        expect(base.bonus).toBe('@abilities.dex.mod - @abilities.str.mod');
    });

    it('adds every ability of the formula explicitly when the attack has none', () => {
        const { base, activity } = mapOne(weapon({ dmg: { value: '1к6+[STR]' }, ability: 'none' }));
        expect(activity.attack.ability).toBe('none');
        expect(base.bonus).toBe('@abilities.str.mod');
    });

    it('adds nothing for a formula without ability when the attack has none', () => {
        const { base } = mapOne(weapon({ dmg: { value: '1к6' }, ability: 'none' }));
        expect(base.bonus).toBe('');
    });

    it('wraps a formula with an unsupported term as a custom formula', () => {
        const { base, warnings } = mapOne(weapon({ dmg: { value: '1к6 + [STR] * 2' }, ability: 'str' }));
        expect(base.custom).toEqual({ enabled: true, formula: '1d6 + @abilities.str.mod * 2 - @abilities.str.mod' });
        expect(base.number).toBe(0);
        expect(base.denomination).toBe(0);
        expect(warnings.some((text) => text.includes('kept as a custom formula'))).toBe(true);
    });

    it('does not cancel anything in a custom formula without dice', () => {
        const { base } = mapOne(weapon({ dmg: { value: '[STR]' }, ability: 'str' }));
        expect(base.custom.enabled).toBe(true);
        expect(base.custom.formula).toBe('@abilities.str.mod');
    });

    it('turns extra dice into parts with their own damage type and no automatic modifier', () => {
        const { base, activity } = mapOne(weapon({ dmg: { value: '1к6 колющий + 1к4 яд' }, ability: 'str' }));
        expect(base.types).toEqual(['piercing']);
        expect(activity.damage.parts).toEqual([
            {
                number: 1,
                denomination: 4,
                bonus: '',
                types: ['poison'],
                custom: { enabled: false, formula: '' },
                scaling: { mode: '', number: 1, formula: '' },
            },
        ]);
    });

    it('reads the damage type from dmgType when the formula has no type word', () => {
        const { base } = mapOne(weapon({ dmg: { value: '1к6+[STR]' }, dmgType: { value: 'огонь' } }));
        expect(base.types).toEqual(['fire']);
    });

    it('warns and produces no base damage for an empty formula', () => {
        const { base, warnings } = mapOne(weapon({ dmg: { value: '' } }));
        expect(base.number).toBe(0);
        expect(base.custom.enabled).toBe(false);
        expect(warnings).toEqual(['weapon "Тест": no damage formula']);
    });
});

describe('mapWeapons: type, ability and identifier', () => {
    it('detects ranged weapons by name in Russian and English', () => {
        expect(mapOne(weapon({ name: { value: 'Длинный лук' } })).item.system.type.value).toBe('simpleR');
        expect(mapOne(weapon({ name: { value: 'Метательные дротики' } })).item.system.type.value).toBe('simpleR');
        expect(mapOne(weapon({ name: { value: 'Shortbow' } })).item.system.type.value).toBe('simpleR');
        expect(mapOne(weapon({ name: { value: 'Короткий меч' } })).item.system.type.value).toBe('simpleM');
    });

    it('detects ranged weapons by notes', () => {
        const { item } = mapOne(weapon({ name: { value: 'Копьё' }, notes: { value: 'можно метать, как праща' } }));
        expect(item.system.type.value).toBe('simpleR');
    });

    it('gives finesse to a melee weapon that uses dex', () => {
        const { item, activity } = mapOne(weapon({ name: { value: 'Кинжал' }, dmg: { value: '1к4' }, ability: 'dex' }));
        expect(item.system.properties).toEqual(['fin']);
        expect(activity.attack.type.value).toBe('melee');
        expect(activity.attack.ability).toBe('dex');
    });

    it('defaults a missing ability to str for melee and dex for ranged', () => {
        expect(mapOne(weapon({ ability: undefined })).activity.attack.ability).toBe('str');
        expect(mapOne(weapon({ ability: undefined, name: { value: 'Лук' } })).activity.attack.ability).toBe('dex');
    });

    it('transliterates a Cyrillic name into the identifier', () => {
        expect(mapOne(weapon({ name: { value: 'Лёгкий арбалет' } })).item.system.identifier).toBe('legkiy-arbalet');
    });

    it('falls back to weapon-<n> when no Latin letters are left', () => {
        const { items } = mapWeapons({ data: { weaponsList: [weapon({ name: { value: '★★' } })] } }, stats, {}, makeCtx());
        expect(items[0].system.identifier).toBe('weapon-1');
    });

    it('sets proficiency from isProf', () => {
        expect(mapOne(weapon({ isProf: false })).item.system.proficient).toBe(0);
        expect(mapOne(weapon({ isProf: true })).item.system.proficient).toBe(1);
    });
});

describe('mapWeapons: attack bonus and weapon bonuses', () => {
    it('uses modBonus, falls back to the legacy modCustom', () => {
        expect(mapOne(weapon({ modBonus: { value: 1 }, modCustom: { value: 5 } })).activity.attack.bonus).toBe('1');
        expect(mapOne(weapon({ modBonus: { value: null }, modCustom: { value: 2 } })).activity.attack.bonus).toBe('2');
    });

    it('adds the weapon attack and damage bonuses from mapBonuses', () => {
        const { activity, item } = mapOne(
            weapon({ modBonus: { value: 1 } }),
            { 'weapon-test': { attack: ['@prof', '-1'], damage: ['2'] } },
        );
        expect(activity.attack.bonus).toBe('1 + @prof - 1');
        expect(activity.damage.parts).toHaveLength(1);
        expect(activity.damage.parts[0]).toMatchObject({
            custom: { enabled: true, formula: '2' },
            types: ['piercing'],
        });
        expect(item.system.damage.base.number).toBe(1);
    });

    it('gives a negative flat bonus a minus sign', () => {
        expect(mapOne(weapon({ modBonus: { value: -2 } })).activity.attack.bonus).toBe('-2');
    });
});

describe('mapResources', () => {
    it('maps the fixture resource with max 1, nothing spent and a long-rest recovery', () => {
        const { items, warnings } = mapResources({ data: fixture }, stats, makeCtx());
        expect(warnings).toEqual([]);
        expect(items).toHaveLength(1);
        const [channel] = items;
        expect(channel.name).toBe('Channel Divinity');
        expect(channel.type).toBe('feat');
        expect(channel.img).toBe('icons/svg/upgrade.svg');
        expect(channel.system.identifier).toBe('channel-divinity');
        expect(channel.system.uses).toEqual({
            max: '1',
            spent: 0,
            recovery: [{ period: 'lr', type: 'recoverAll', formula: '' }],
        });
        expect(channel.system.description.value).toBe('');
        expect(channel.flags).toEqual({ 'lss-to-foundry': { imported: true, lssId: 'resource-1780000000010' } });
    });

    it('evaluates maxExpr for spent and translates it for max', () => {
        const data = {
            resources: {
                r1: {
                    id: 'r1', name: 'Искусство', current: 1, maxExpr: 'max(1, [WIS])',
                    isLongRest: true, isShortRest: true, shortRestRegain: '1к6',
                },
            },
        };
        const { items } = mapResources({ data }, stats, makeCtx());
        expect(items[0].system.uses.max).toBe('max(1, @abilities.wis.mod)');
        expect(items[0].system.uses.spent).toBe(2); // max is max(1, wis mod 3) = 3, current 1
    });

    it('orders the long rest before the short rest and uses the short-rest formula', () => {
        const data = {
            resources: {
                r1: {
                    id: 'r1', name: 'Волна', current: 0, max: 2,
                    isLongRest: true, isShortRest: true, shortRestRegain: '[PROF]',
                },
            },
        };
        const { items } = mapResources({ data }, stats, makeCtx());
        expect(items[0].system.uses.recovery).toEqual([
            { period: 'lr', type: 'recoverAll', formula: '' },
            { period: 'sr', type: 'formula', formula: '@prof' },
        ]);
        expect(items[0].system.uses.spent).toBe(2);
    });

    it('recovers fully on a short rest when shortRestRegain is null', () => {
        const data = {
            resources: { r1: { id: 'r1', name: 'Очки', current: 1, max: 4, isShortRest: true, shortRestRegain: null } },
        };
        const { items } = mapResources({ data }, stats, makeCtx());
        expect(items[0].system.uses.recovery).toEqual([{ period: 'sr', type: 'recoverAll', formula: '' }]);
    });

    it('keeps spent at 0 when current is above max', () => {
        const data = { resources: { r1: { id: 'r1', name: 'Очки', current: 5, max: 2 } } };
        expect(mapResources({ data }, stats, makeCtx()).items[0].system.uses.spent).toBe(0);
    });

    it('skips deleted resources and keeps notes as a description', () => {
        const data = {
            resources: {
                r1: { id: 'r1', name: 'Старый', current: 1, max: 1, isDeleted: true },
                r2: { id: 'r2', name: 'Новый', current: 1, max: 1, notes: 'первая строка\nвторая <b>' },
            },
        };
        const { items } = mapResources({ data }, stats, makeCtx());
        expect(items.map((item) => item.name)).toEqual(['Новый']);
        expect(items[0].system.description.value).toBe('<p>первая строка<br>вторая &lt;b&gt;</p>');
    });

    it('warns when maxExpr cannot be translated', () => {
        const data = { resources: { r1: { id: 'r1', name: 'Х', current: 1, maxExpr: 'max(' } } };
        const { items, warnings } = mapResources({ data }, stats, makeCtx());
        expect(items[0].system.uses.spent).toBe(0);
        expect(warnings.some((text) => text.includes('cannot translate maxExpr'))).toBe(true);
    });
});

describe('weapon bonuses come from mapBonuses', () => {
    it('reads weapon.<id>.attack and damage through mapBonuses().weapon', () => {
        const data = {
            weaponsList: [weapon()],
            bonuses: [
                { id: 'b1', label: 'Благословение', target: 'weapon.weapon-test.attack', mode: 'add', value: 1, source: { kind: 'spell' } },
                { id: 'b2', label: 'Сила', target: 'weapon.weapon-test.damage', mode: 'add', value: 2, source: { kind: 'feat' } },
            ],
        };
        const bonuses = mapBonuses({ data }, stats, makeCtx());
        const { items } = mapWeapons({ data }, stats, bonuses.weapon, makeCtx());
        expect(items[0].system.activities[Object.keys(items[0].system.activities)[0]].attack.bonus).toBe('1');
        expect(items[0].system.activities[Object.keys(items[0].system.activities)[0]].damage.parts[0].custom.formula).toBe('2');
    });
});
