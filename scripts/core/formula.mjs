/**
 * Long Story Short formulas → Foundry roll formulas, plus a safe numeric evaluator.
 *
 * LSS has two evaluation contexts (docs/research/lss-character-format.md §3):
 * - numeric: AC, speed, initiative, bonus `expr`, resource maximums. Dice count as 0.
 * - dice: weapon damage and formulas in text blocks.
 * Variables are `[STR]`…`[CHA]` (ability modifiers), `[PROF]`, `[HALF_PROF]`, `[LVL]`.
 * Square brackets nest and evaluate inside out: `[[STR]+1]d6`.
 */

import { ABILITIES } from './lss-keys.mjs';

const ABILITY_VARS = Object.fromEntries(ABILITIES.map((key) => [key.toUpperCase(), `@abilities.${key}.mod`]));

/** LSS variable → Foundry roll data path. */
export const VARIABLES = {
    ...ABILITY_VARS,
    PROF: '@prof',
    HALF_PROF: 'floor(@prof / 2)',
    LVL: '@details.level',
};

const FUNCTIONS = {
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    sqrt: Math.sqrt,
    sign: Math.sign,
    exp: Math.exp,
    log: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
};

const LETTER = /[A-Za-zА-Яа-яЁё]/;

/** Ability modifier for a score, as in the SRD. */
export function abilityMod(score) {
    return Math.floor((Number(score) - 10) / 2);
}

function normalizeTypography(text) {
    return String(text ?? '')
        .replace(/−/g, '-')
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Separate a roll label from the formula.
 * Supported forms: `1d20+5 (Атака)`, `1d100cs<=25 # Медленный жест`, `Вдохновение барда 1d6`.
 * Words right after a formula (`1к6 колющий`) are handled by {@link parseDamage}.
 * @param {string} input
 * @returns {{ formula: string, label: string }}
 */
export function splitLabel(input) {
    let formula = normalizeTypography(input);
    const labels = [];

    const hash = formula.indexOf('#');
    if (hash >= 0) {
        labels.push(formula.slice(hash + 1).trim());
        formula = formula.slice(0, hash).trim();
    }

    // Trailing parentheses are a label only when they hold words, not maths.
    const trailing = formula.match(/\(([^()]*)\)\s*$/);
    if (trailing && LETTER.test(trailing[1]) && !/[\d[\]+\-*/^%]/.test(trailing[1])) {
        const before = formula.slice(0, trailing.index).trim();
        // `max(1, 2)` and the like: a function call is not a label.
        if (before && !/[A-Za-z]$/.test(before)) {
            labels.unshift(trailing[1].trim());
            formula = before;
        }
    }

    // Leading words before the first formula token.
    const leading = formula.match(/^((?:[A-Za-zА-Яа-яЁё][^\s\d([{]*\s+)+)(?=[\d([{+-]|[dDкК]\d)/);
    if (leading) {
        const words = leading[1].trim();
        const firstWord = words.split(' ')[0].toLowerCase();
        if (!(firstWord in FUNCTIONS) && firstWord !== 'if') {
            labels.unshift(words);
            formula = formula.slice(leading[1].length).trim();
        }
    }

    return { formula, label: labels.filter(Boolean).join(', ') };
}

/**
 * Translate an LSS formula into a Foundry roll formula.
 * @param {string|number} input
 * @returns {{ formula: string, label: string, ok: boolean, warnings: string[] }}
 *   `ok` is false when the result would not roll in Foundry (unknown variable, `if()`, `^`).
 */
export function toFoundryFormula(input) {
    const warnings = [];
    const { formula: raw, label } = splitLabel(input);
    let formula = raw;

    formula = formula.replace(/\[\s*([A-Za-z_]+)\s*\]/g, (match, name) => {
        const path = VARIABLES[name.toUpperCase()];
        if (path) return path;
        warnings.push(`unknown variable ${match}`);
        return match;
    });
    const unknownVariables = warnings.length > 0;

    // Bracket groups left after variable substitution are maths: `[@abilities.str.mod+1]d6`.
    if (!unknownVariables) formula = formula.replace(/\[/g, '(').replace(/\]/g, ')');

    // Die letter: d, D, к, К — only where a die can start.
    formula = formula.replace(/(?<=^|[\d)\s+\-*/(,{])[dDкК](?=[\d(%F])/g, 'd');
    formula = formula.replace(/d%/g, 'd100');

    // Success counting right after a die: `10d10>=8` → `10d10cs>=8`.
    formula = formula.replace(/(d\d+)(>=|<=|>|<|=)(\d+)/g, '$1cs$2$3');

    if (/!!|!p/.test(formula)) warnings.push('compounding/penetrating explosions are not supported');
    formula = formula.replace(/(?<!!)!(?![!p=])/g, 'x');
    if (/(?<=d\d+)(?:u|uo)\b/.test(formula)) warnings.push('unique rerolls (u, uo) are not supported');
    formula = formula.replace(/(?<=d\d+(?:[a-z]+\d*)*)(?:sa|sd)\b/g, '');

    const hasIf = /\bif\s*\(/i.test(formula);
    if (hasIf) warnings.push('if() is not supported in Foundry roll formulas');
    const hasPow = formula.includes('^');
    if (hasPow) warnings.push('^ is not supported in Foundry roll formulas');

    formula = formula.replace(/\s+/g, ' ').trim();
    const ok = Boolean(formula) && !unknownVariables && !hasIf && !hasPow && !/!!|!p/.test(formula);
    return { formula, label, ok, warnings };
}

/* -------------------------------------------- */
/*  Numeric evaluation                          */
/* -------------------------------------------- */

/**
 * Character values used by the numeric evaluator.
 * @typedef {object} FormulaContext
 * @property {Record<string, number>} abilities  ability key → modifier (`{ str: 1, dex: 3 }`)
 * @property {number} prof
 * @property {number} level
 */

function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const rest = text.slice(i);
        const ch = text[i];
        if (/\s/.test(ch)) {
            i += 1;
            continue;
        }
        let m;
        if ((m = rest.match(/^(\d*)\s*[dDкК]\s*(\d+|%|F)/)) && (m[1] !== '' || !/^[dDкК][a-zA-Z]/.test(rest))) {
            tokens.push({ type: 'dice', value: m[0] });
            i += m[0].length;
            continue;
        }
        if ((m = rest.match(/^\d+(?:\.\d+)?/))) {
            tokens.push({ type: 'number', value: Number(m[0]) });
            i += m[0].length;
            continue;
        }
        if ((m = rest.match(/^\[\s*([A-Za-z_]+)\s*\]/)) && VARIABLES[m[1].toUpperCase()]) {
            tokens.push({ type: 'var', value: m[1].toUpperCase() });
            i += m[0].length;
            continue;
        }
        if ((m = rest.match(/^(>=|<=|==|!=|<>|>|<|=)/))) {
            tokens.push({ type: 'cmp', value: m[0] });
            i += m[0].length;
            continue;
        }
        if ((m = rest.match(/^[A-Za-z_]+/))) {
            tokens.push({ type: 'word', value: m[0].toLowerCase() });
            i += m[0].length;
            continue;
        }
        if ('+-*/%^(),[]'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i += 1;
            continue;
        }
        throw new Error(`unexpected "${ch}"`);
    }
    return tokens;
}

class Parser {
    constructor(tokens, ctx) {
        this.tokens = tokens;
        this.pos = 0;
        this.ctx = ctx;
    }

    peek() {
        return this.tokens[this.pos];
    }

    take(type, value) {
        const token = this.peek();
        if (token && token.type === type && (value === undefined || token.value === value)) {
            this.pos += 1;
            return token;
        }
        return null;
    }

    expect(type, value) {
        const token = this.take(type, value);
        if (!token) throw new Error(`expected ${value ?? type}`);
        return token;
    }

    parse() {
        const value = this.or();
        if (this.pos < this.tokens.length) throw new Error(`unexpected "${this.peek().value}"`);
        return value;
    }

    or() {
        let value = this.and();
        while (this.take('word', 'or')) {
            const right = this.and();
            value = value || right ? 1 : 0;
        }
        return value;
    }

    and() {
        let value = this.not();
        while (this.take('word', 'and')) {
            const right = this.not();
            value = value && right ? 1 : 0;
        }
        return value;
    }

    not() {
        if (this.take('word', 'not')) return this.not() ? 0 : 1;
        return this.comparison();
    }

    comparison() {
        const left = this.additive();
        const cmp = this.take('cmp');
        if (!cmp) return left;
        const right = this.additive();
        switch (cmp.value) {
            case '>': return left > right ? 1 : 0;
            case '<': return left < right ? 1 : 0;
            case '>=': return left >= right ? 1 : 0;
            case '<=': return left <= right ? 1 : 0;
            case '!=':
            case '<>': return left !== right ? 1 : 0;
            default: return left === right ? 1 : 0;
        }
    }

    additive() {
        let value = this.multiplicative();
        for (;;) {
            if (this.take('op', '+')) value += this.multiplicative();
            else if (this.take('op', '-')) value -= this.multiplicative();
            else return value;
        }
    }

    multiplicative() {
        let value = this.power();
        for (;;) {
            if (this.take('op', '*')) value *= this.power();
            else if (this.take('op', '/')) value /= this.power();
            else if (this.take('op', '%')) value %= this.power();
            else return value;
        }
    }

    power() {
        const base = this.unary();
        if (this.take('op', '^')) return base ** this.power();
        return base;
    }

    unary() {
        if (this.take('op', '-')) return -this.unary();
        if (this.take('op', '+')) return this.unary();
        return this.primary();
    }

    primary() {
        const token = this.peek();
        if (!token) throw new Error('unexpected end');
        if (this.take('number')) return token.value;
        // Numeric context: dice are not rolled and count as 0.
        if (this.take('dice')) return 0;
        if (this.take('var')) return this.variable(token.value);
        if (this.take('op', '(')) {
            const value = this.or();
            this.expect('op', ')');
            return value;
        }
        if (this.take('op', '[')) {
            const value = this.or();
            this.expect('op', ']');
            return value;
        }
        if (token.type === 'word') {
            this.pos += 1;
            return this.call(token.value);
        }
        throw new Error(`unexpected "${token.value}"`);
    }

    call(name) {
        this.expect('op', '(');
        const args = [];
        if (!this.take('op', ')')) {
            do args.push(this.or());
            while (this.take('op', ','));
            this.expect('op', ')');
        }
        if (name === 'if') {
            if (args.length !== 3) throw new Error('if() takes 3 arguments');
            return args[0] ? args[1] : args[2];
        }
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`unknown function ${name}`);
        return fn(...args);
    }

    variable(name) {
        const { abilities = {}, prof = 0, level = 0 } = this.ctx ?? {};
        if (name === 'PROF') return prof;
        if (name === 'HALF_PROF') return Math.floor(prof / 2);
        if (name === 'LVL') return level;
        return abilities[name.toLowerCase()] ?? 0;
    }
}

/**
 * Evaluate an LSS formula in the numeric context.
 * @param {string|number|null|undefined} input
 * @param {FormulaContext} ctx
 * @returns {{ value: number|null, error: string|null }} `value` is null on a syntax error or an empty input.
 */
export function evaluateNumeric(input, ctx) {
    if (typeof input === 'number') return { value: Number.isFinite(input) ? input : null, error: null };
    const { formula } = splitLabel(input);
    if (!formula) return { value: null, error: null };
    try {
        const value = new Parser(tokenize(formula), ctx).parse();
        if (!Number.isFinite(value)) return { value: null, error: 'not a finite number' };
        return { value, error: null };
    } catch (error) {
        return { value: null, error: error.message };
    }
}

/**
 * Translate a numeric-context LSS formula for a Foundry formula field.
 * Falls back to the evaluated number when the formula cannot be expressed in Foundry (`if()`, `^`).
 * @param {string|number|null|undefined} input
 * @param {FormulaContext} ctx
 * @returns {{ formula: string, ok: boolean, warnings: string[] }}
 */
export function toFoundryNumeric(input, ctx) {
    if (input === null || input === undefined || String(input).trim() === '') {
        return { formula: '', ok: true, warnings: [] };
    }
    if (typeof input === 'number') return { formula: String(input), ok: Number.isFinite(input), warnings: [] };
    const translated = toFoundryFormula(input);
    if (translated.ok) return { formula: translated.formula, ok: true, warnings: translated.warnings };
    const { value, error } = evaluateNumeric(input, ctx);
    if (value === null) return { formula: '', ok: false, warnings: [...translated.warnings, error ?? 'empty'] };
    return { formula: String(value), ok: true, warnings: [...translated.warnings, `replaced by its current value ${value}`] };
}

/* -------------------------------------------- */
/*  Damage                                      */
/* -------------------------------------------- */

/** Split on top-level + and -, keeping the sign with each part. */
function splitTerms(text) {
    const terms = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
        const isSign = (ch === '+' || ch === '-') && depth === 0 && current.trim() !== '';
        if (isSign) {
            terms.push(current.trim());
            current = ch;
        } else {
            current += ch;
        }
    }
    if (current.trim()) terms.push(current.trim());
    return terms;
}

/**
 * A damage part in the shape of dnd5e `DamageData` (docs/research/dnd5e-5.1.8-data-model.md §3.2),
 * minus `types` which the caller resolves.
 * @typedef {object} DamagePart
 * @property {number|null} number
 * @property {number|null} denomination
 * @property {string} bonus          Foundry formula, may be empty
 * @property {{ enabled: boolean, formula: string }} custom
 * @property {string} typeText       words that followed the dice in LSS (`колющий`)
 */

/**
 * Parse a weapon damage formula: `1к6+[STR]`, `2d6 + 3 рубящий`, `1к4 колющий + 1к6 яд`.
 * Ability variables become `abilities` (dnd5e adds the attack ability modifier itself);
 * the first dice term is the base damage, further dice terms are extra parts.
 * @param {string} input
 * @returns {{ base: DamagePart|null, extra: DamagePart[], abilities: string[], warnings: string[] }}
 */
export function parseDamage(input) {
    const warnings = [];
    const text = normalizeTypography(input).replace(/#.*$/, '').trim();
    const result = { base: null, extra: [], abilities: [], warnings };
    if (!text) return result;

    const bonus = [];
    let simple = true;
    let pendingType = '';

    for (const rawTerm of splitTerms(text)) {
        const sign = rawTerm.startsWith('-') ? '-' : '+';
        let term = rawTerm.replace(/^[+-]\s*/, '');

        // Words after the dice are the damage type of this part: `1к6 колющий`, `1к4/колющий`.
        let typeText = '';
        const words = term.match(/^(.*?[\d\])])[\s/]+([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s]*)$/);
        if (words) {
            term = words[1].trim();
            typeText = words[2].trim();
        }

        const dice = term.match(/^(\d*)\s*[dDкК]\s*(\d+)$/);
        const ability = term.match(/^\[\s*(STR|DEX|CON|INT|WIS|CHA)\s*\]$/i);

        if (dice && sign === '+') {
            const part = {
                number: dice[1] === '' ? 1 : Number(dice[1]),
                denomination: Number(dice[2]),
                bonus: '',
                custom: { enabled: false, formula: '' },
                typeText,
            };
            if (!result.base) result.base = part;
            else result.extra.push(part);
            continue;
        }
        if (ability && sign === '+') {
            result.abilities.push(ability[1].toLowerCase());
            if (typeText) pendingType = typeText;
            continue;
        }
        if (/^[\d.]+$/.test(term) || /^\[\s*[A-Za-z_]+\s*\]$/.test(term) || /^\(.*\)$/.test(term)) {
            const translated = toFoundryFormula(term);
            if (!translated.ok) {
                simple = false;
                warnings.push(...translated.warnings);
            }
            bonus.push(`${sign} ${translated.formula}`);
            if (typeText) pendingType = typeText;
            continue;
        }
        warnings.push(`unrecognized damage term "${rawTerm}"`);
        simple = false;
    }

    if (!simple || !result.base) {
        const translated = toFoundryFormula(text);
        warnings.push(...translated.warnings);
        if (!simple) warnings.push('damage formula kept as a custom formula');
        return {
            base: {
                number: null,
                denomination: null,
                bonus: '',
                custom: { enabled: true, formula: translated.formula },
                typeText: result.base?.typeText ?? '',
            },
            extra: [],
            abilities: [],
            warnings,
        };
    }

    // A type written after a flat bonus belongs to the whole damage: `1к6 + 2 колющий`.
    if (!result.base.typeText && pendingType) result.base.typeText = pendingType;
    result.base.bonus = bonus.join(' ').replace(/^\+\s*/, '').trim();
    return result;
}
