import { describe, expect, it } from 'vitest';
import {
    abilityMod,
    evaluateNumeric,
    parseDamage,
    splitLabel,
    toFoundryFormula,
    toFoundryNumeric,
} from '../../scripts/core/formula.mjs';

const ctx = { abilities: { str: 1, dex: 3, con: 2, int: 0, wis: -1, cha: 4 }, prof: 3, level: 5 };

describe('abilityMod', () => {
    it('follows the SRD table', () => {
        expect(abilityMod(10)).toBe(0);
        expect(abilityMod(15)).toBe(2);
        expect(abilityMod(8)).toBe(-1);
        expect(abilityMod(1)).toBe(-5);
    });
});

describe('splitLabel', () => {
    it('reads a label in trailing parentheses', () => {
        expect(splitLabel('1d20+5 (Атака)')).toEqual({ formula: '1d20+5', label: 'Атака' });
    });

    it('reads a label after #', () => {
        expect(splitLabel('1d100cs<=25 # Слишком медленный жест')).toEqual({
            formula: '1d100cs<=25',
            label: 'Слишком медленный жест',
        });
    });

    it('reads leading words', () => {
        expect(splitLabel('Вдохновение барда 1d6')).toEqual({ formula: '1d6', label: 'Вдохновение барда' });
    });

    it('keeps maths in parentheses and function calls', () => {
        expect(splitLabel('1d20 + (1d6)').formula).toBe('1d20 + (1d6)');
        expect(splitLabel('max(1, [WIS])d8').formula).toBe('max(1, [WIS])d8');
    });
});

describe('toFoundryFormula', () => {
    it('maps LSS variables to roll data', () => {
        expect(toFoundryFormula('1d20 + [STR]').formula).toBe('1d20 + @abilities.str.mod');
        expect(toFoundryFormula('[PROF]*2').formula).toBe('@prof*2');
        expect(toFoundryFormula('floor([LVL]/2)').formula).toBe('floor(@details.level/2)');
        expect(toFoundryFormula('[HALF_PROF]').formula).toBe('floor(@prof / 2)');
    });

    it('is case-insensitive for variables', () => {
        expect(toFoundryFormula('[dex]+1').formula).toBe('@abilities.dex.mod+1');
    });

    it('turns Cyrillic and capital dice letters into d', () => {
        expect(toFoundryFormula('2к6+3К4').formula).toBe('2d6+3d4');
        expect(toFoundryFormula('1D20').formula).toBe('1d20');
        expect(toFoundryFormula('d%').formula).toBe('d100');
    });

    it('evaluates nested brackets as parentheses', () => {
        expect(toFoundryFormula('[[STR]+1]d6').formula).toBe('(@abilities.str.mod+1)d6');
    });

    it('translates explosions and success counting', () => {
        expect(toFoundryFormula('3d6!').formula).toBe('3d6x');
        expect(toFoundryFormula('10d10>=8').formula).toBe('10d10cs>=8');
        expect(toFoundryFormula('1d20cs=20cf=1').formula).toBe('1d20cs=20cf=1');
    });

    it('does not touch function names that contain d', () => {
        expect(toFoundryFormula('round([DEX]/2)').formula).toBe('round(@abilities.dex.mod/2)');
    });

    it('flags what Foundry cannot roll', () => {
        expect(toFoundryFormula('if([STR] >= 3, 2d6, 1d6)').ok).toBe(false);
        expect(toFoundryFormula('2^[LVL]').ok).toBe(false);
        expect(toFoundryFormula('2d6!!').ok).toBe(false);
        const unknown = toFoundryFormula('1d6 + [FOO]');
        expect(unknown.ok).toBe(false);
        expect(unknown.warnings[0]).toMatch(/\[FOO\]/);
    });

    it('accepts numbers', () => {
        expect(toFoundryFormula(16)).toMatchObject({ formula: '16', ok: true });
    });
});

describe('evaluateNumeric', () => {
    it('computes AC-like formulas', () => {
        expect(evaluateNumeric('10+[DEX]', ctx).value).toBe(13);
        expect(evaluateNumeric('13 + min([DEX], 2)', ctx).value).toBe(15);
        expect(evaluateNumeric('floor([LVL]/2)+[PROF]', ctx).value).toBe(5);
        expect(evaluateNumeric('[HALF_PROF]', ctx).value).toBe(1);
    });

    it('treats dice as 0 in the numeric context', () => {
        expect(evaluateNumeric('1d6+2', ctx).value).toBe(2);
    });

    it('supports if() and comparisons', () => {
        expect(evaluateNumeric('if([STR] >= 1, 5, 2)', ctx).value).toBe(5);
        expect(evaluateNumeric('if([WIS] > 0 and [CHA] > 0, 1, 0)', ctx).value).toBe(0);
    });

    it('supports ^ and nested brackets', () => {
        expect(evaluateNumeric('2^[PROF]', ctx).value).toBe(8);
        expect(evaluateNumeric('[[DEX]+1]', ctx).value).toBe(4);
    });

    it('accepts plain numbers and numeric strings', () => {
        expect(evaluateNumeric(30, ctx).value).toBe(30);
        expect(evaluateNumeric('16', ctx).value).toBe(16);
    });

    it('returns null for empty input and errors for garbage', () => {
        expect(evaluateNumeric('', ctx)).toEqual({ value: null, error: null });
        const bad = evaluateNumeric('10 + сила', ctx);
        expect(bad.value).toBeNull();
        expect(bad.error).toBeTruthy();
    });
});

describe('toFoundryNumeric', () => {
    it('keeps translatable formulas as formulas', () => {
        expect(toFoundryNumeric('10+[DEX]', ctx)).toMatchObject({ formula: '10+@abilities.dex.mod', ok: true });
    });

    it('falls back to the current value when Foundry cannot express it', () => {
        const result = toFoundryNumeric('if([STR] >= 1, 5, 2)', ctx);
        expect(result.formula).toBe('5');
        expect(result.ok).toBe(true);
        expect(result.warnings.join(' ')).toMatch(/current value/);
    });

    it('returns an empty formula for empty input', () => {
        expect(toFoundryNumeric(null, ctx)).toEqual({ formula: '', ok: true, warnings: [] });
    });
});

describe('parseDamage', () => {
    it('splits base dice and the ability variable', () => {
        const result = parseDamage('1к6+[STR]');
        expect(result.base).toMatchObject({ number: 1, denomination: 6, bonus: '', custom: { enabled: false } });
        expect(result.abilities).toEqual(['str']);
        expect(result.extra).toEqual([]);
    });

    it('keeps flat bonuses and the damage type words', () => {
        const result = parseDamage('2d6 + 3 рубящий');
        expect(result.base).toMatchObject({ number: 2, denomination: 6, bonus: '3', typeText: 'рубящий' });
    });

    it('reads several typed parts', () => {
        const result = parseDamage('1к4 колющий + 1к6 яд');
        expect(result.base).toMatchObject({ number: 1, denomination: 4, typeText: 'колющий' });
        expect(result.extra).toHaveLength(1);
        expect(result.extra[0]).toMatchObject({ number: 1, denomination: 6, typeText: 'яд' });
    });

    it('accepts a slash before the type', () => {
        expect(parseDamage('1к4/колющий').base).toMatchObject({ number: 1, denomination: 4, typeText: 'колющий' });
    });

    it('falls back to a custom formula for complex expressions', () => {
        const result = parseDamage('(ceil([LVL]/2))d6');
        expect(result.base.custom).toEqual({ enabled: true, formula: '(ceil(@details.level/2))d6' });
    });

    it('does not accept words in place of numbers', () => {
        const result = parseDamage('1к6 + сила');
        expect(result.base.custom.enabled).toBe(true);
        expect(result.warnings.join(' ')).toMatch(/unrecognized/);
    });

    it('returns no base for an empty formula', () => {
        expect(parseDamage('').base).toBeNull();
    });
});
