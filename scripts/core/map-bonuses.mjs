/**
 * LSS bonuses → Active Effects, extra HP, extra spell slots and weapon bonuses
 * (docs/DESIGN.md §4.3 and §6.3; keys checked in docs/research/dnd5e-5.1.8-data-model.md §8.2).
 *
 * Pure core: no Foundry globals.
 */

import { FLAG_SCOPE, FLAGS } from '../constants.mjs';
import { ABILITIES, AIME_ONLY_SKILLS, ARMOR_PROFS, SKILLS, WEAPON_PROFS } from './lss-keys.mjs';
import { evaluateNumeric, toFoundryNumeric } from './formula.mjs';

const AE_ICON = 'icons/svg/aura.svg';
const EMPTY_FORMULA_CTX = { abilities: {}, prof: 0, level: 0 };
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** dnd5e CONST.ACTIVE_EFFECT_MODES (research §8.1). `set` is OVERRIDE. */
const MODE = { multiply: 1, add: 2, downgrade: 3, upgrade: 4, set: 5 };
const ADD = 2;
const UPGRADE = 4;

/** Targets whose value is a formula and that map to fixed keys. `shield` is handled separately. */
const FORMULA_KEYS = {
    ac: ['system.attributes.ac.bonus'],
    initiative: ['system.attributes.init.bonus'],
    'save.all': ['system.bonuses.abilities.save'],
    'check.all': ['system.bonuses.abilities.check'],
    'attack.all': ['system.bonuses.mwak.attack', 'system.bonuses.rwak.attack'],
    'damage.weapon': ['system.bonuses.mwak.damage', 'system.bonuses.rwak.damage'],
    spellAttack: ['system.bonuses.msak.attack', 'system.bonuses.rsak.attack'],
    spellDC: ['system.bonuses.spell.dc'],
};

/** Group keys in `groups` that are not an effect. */
const GENERIC_GROUPS = [
    { key: 'enabled', name: 'LSS: бонусы', disabled: false },
    { key: 'disabled', name: 'LSS: отключённые бонусы', disabled: true },
    { key: 'conditional', name: 'LSS: условные бонусы', disabled: true },
];

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** @param {unknown} value @returns {boolean} */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {unknown[]} the value if it is an array, otherwise []. */
function list(value) {
    return Array.isArray(value) ? value : [];
}

/** @param {unknown} value @returns {boolean} true for a non-empty string. */
function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

/** @param {object} object @param {string} key @returns {boolean} */
function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * The input of a bonus: `expr` when it is a non-empty string, otherwise `value`.
 * @param {object} bonus
 * @returns {string|number|null}
 */
function rawValueOf(bonus) {
    if (hasText(bonus.expr)) return bonus.expr;
    if (bonus.value !== undefined && bonus.value !== null && bonus.value !== '') return bonus.value;
    return null;
}

/**
 * Skill id for an LSS skill key (`animal handling` → `ani`), or the reason it has none.
 * @param {string} key
 * @returns {{ id: string } | { reason: string }}
 */
function skillOf(key) {
    if (AIME_ONLY_SKILLS.includes(key)) return { reason: 'AIME-only skill has no dnd5e counterpart' };
    if (hasOwn(SKILLS, key)) return { id: SKILLS[key] };
    return { reason: `unknown skill "${key}"` };
}

/**
 * dnd5e key of the advantage/disadvantage roll mode for a target, or null when the target has none.
 * @param {string} target
 * @returns {string|null}
 */
function rollModeKeyOf(target) {
    let match = target.match(/^save\.([a-z]+)$/);
    if (match && ABILITIES.includes(match[1])) return `system.abilities.${match[1]}.save.roll.mode`;
    match = target.match(/^stat\.([a-z]+)\.check$/);
    if (match && ABILITIES.includes(match[1])) return `system.abilities.${match[1]}.check.roll.mode`;
    match = target.match(/^skill\.(.+)$/);
    if (match) {
        const skill = skillOf(match[1]);
        if (skill.id) return `system.skills.${skill.id}.roll.mode`;
    }
    return null;
}

/**
 * Escape text for HTML. Line breaks become `<br>`.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\r?\n/g, '<br>');
}

/**
 * A list of bonus labels as HTML, for the description of a generic group.
 * @param {string[]} labels
 * @returns {string}
 */
function htmlList(labels) {
    if (!labels.length) return '';
    return `<ul>${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`;
}

/**
 * An ActiveEffect source for an actor (docs/DESIGN.md §4.3). It is never transferred to items.
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.description  HTML
 * @param {boolean} options.disabled
 * @param {object[]} options.changes
 * @param {string} [options.lssId]  present for effects from `data.effects`, absent for generic groups
 * @param {{ randomID: (n?: number) => string }} ctx
 * @returns {object}
 */
function activeEffect({ name, description, disabled, changes, lssId }, ctx) {
    const flags = { [FLAGS.imported]: true };
    if (lssId !== undefined) flags[FLAGS.lssId] = lssId;
    return {
        _id: ctx.randomID(),
        name,
        img: AE_ICON,
        type: 'base',
        transfer: false,
        disabled,
        description,
        changes,
        flags: { [FLAG_SCOPE]: flags },
    };
}

/* -------------------------------------------- */
/*  Targets                                     */
/* -------------------------------------------- */

/**
 * Translate the target and the value of one bonus. It does not decide whether the bonus is active.
 *
 * Results:
 * - `changes`: Active Effect changes; `needsShield` marks `shield` bonuses;
 * - `hp`, `slot` (spell circle), `pact`: summed into the HP target and the slot targets;
 * - `weapon`: a formula for the attack or damage bonus of one weapon;
 * - `skip`: nothing to translate, with the reason.
 *
 * @param {object} bonus  LSS CharacterBonus
 * @param {{ formulaCtx: object, weaponIds: Set<string> }} env
 * @returns {object}
 */
function planBonus(bonus, env) {
    const target = String(bonus.target ?? '');
    const mode = bonus.mode ?? 'add';
    const raw = rawValueOf(bonus);
    const warnings = [];
    const skip = (reason) => ({ kind: 'skip', reason, warnings });
    const changes = (keys, code, value, needsShield = false) => ({
        kind: 'changes',
        changes: keys.map((key) => ({ key, mode: code, value })),
        needsShield,
        warnings,
    });

    /**
     * Formula value for a formula field (dice allowed). The numeric evaluator runs first, because
     * toFoundryFormula does not catch syntax errors such as an unclosed parenthesis.
     */
    const formulaValue = () => {
        if (raw === null) return { error: 'no value' };
        const syntax = evaluateNumeric(raw, env.formulaCtx);
        if (syntax.error) return { error: `cannot translate value "${raw}": ${syntax.error}` };
        const translated = toFoundryNumeric(raw, env.formulaCtx);
        if (!translated.ok || !translated.formula) return { error: `cannot translate value "${raw}"` };
        warnings.push(...translated.warnings);
        return { formula: translated.formula };
    };

    /** Evaluated number for a numeric field. Dice count as 0 here. */
    const numericValue = () => {
        if (raw === null) return { error: 'no value' };
        const { value, error } = evaluateNumeric(raw, env.formulaCtx);
        if (value === null) return { error: error ?? 'cannot evaluate value' };
        return { value };
    };

    // Ability scores are baked into computeStats, not into Active Effects (DESIGN §4.3).
    if (/^stat\.[a-z]+\.score$/.test(target)) return skip('baked into ability score');

    // Advantage and disadvantage: ADD 1 / -1 on a roll mode (research §8.2).
    if (mode === 'advantage' || mode === 'disadvantage') {
        const key = rollModeKeyOf(target);
        if (!key) return skip(`${mode} is not supported for this target`);
        return changes([key], ADD, mode === 'advantage' ? '1' : '-1');
    }

    if (!hasOwn(MODE, mode)) return skip(`unknown mode "${mode}"`);
    const code = MODE[mode];

    let match;

    // Hit points and spell slots are summed by the caller (DESIGN §4.4).
    if (target === 'hp.max') {
        if (mode !== 'add') return skip('only "add" is supported for hp.max');
        const number = numericValue();
        return number.error ? skip(number.error) : { kind: 'hp', value: number.value, warnings };
    }
    if ((match = target.match(/^spellSlot\.([1-9])$/))) {
        if (mode !== 'add') return skip(`only "add" is supported for ${target}`);
        const number = numericValue();
        return number.error ? skip(number.error) : { kind: 'slot', level: Number(match[1]), value: number.value, warnings };
    }
    if ((match = target.match(/^pactSlot\.([1-9])$/))) {
        if (mode !== 'add') return skip(`only "add" is supported for ${target}`);
        const number = numericValue();
        return number.error ? skip(number.error) : { kind: 'pact', value: number.value, warnings };
    }
    if ((match = target.match(/^weapon\.(.+)\.(attack|damage)$/))) {
        if (!env.weaponIds.has(match[1])) return skip('no weapon with this id in weaponsList');
        if (mode !== 'add') return skip(`only "add" is supported for ${target}`);
        const formula = formulaValue();
        return formula.error
            ? skip(formula.error)
            : { kind: 'weapon', weaponId: match[1], field: match[2], formula: formula.formula, warnings };
    }

    // Targets with a fixed key list.
    if (target === 'speed.walk') {
        const number = numericValue();
        return number.error ? skip(number.error) : changes(['system.attributes.movement.walk'], code, String(number.value));
    }
    if (target === 'shield') {
        const formula = formulaValue();
        return formula.error ? skip(formula.error) : changes(['system.attributes.ac.bonus'], code, formula.formula, true);
    }
    if (hasOwn(FORMULA_KEYS, target)) {
        const formula = formulaValue();
        return formula.error ? skip(formula.error) : changes(FORMULA_KEYS[target], code, formula.formula);
    }

    // Saving throws, checks and skills.
    if ((match = target.match(/^save\.([a-z]+)$/))) {
        if (!ABILITIES.includes(match[1])) return skip(`no dnd5e saving throw for "${match[1]}"`);
        const formula = formulaValue();
        return formula.error
            ? skip(formula.error)
            : changes([`system.abilities.${match[1]}.bonuses.save`], code, formula.formula);
    }
    if ((match = target.match(/^stat\.([a-z]+)\.(check|attack|damage)$/))) {
        if (match[2] !== 'check') return skip('per-ability attack and damage bonuses are not translated');
        if (!ABILITIES.includes(match[1])) return skip('AIME-only ability has no dnd5e counterpart');
        const formula = formulaValue();
        return formula.error
            ? skip(formula.error)
            : changes([`system.abilities.${match[1]}.bonuses.check`], code, formula.formula);
    }
    if ((match = target.match(/^(skill|passive)\.(.+)$/))) {
        const skill = skillOf(match[2]);
        if (skill.reason) return skip(skill.reason);
        const field = match[1] === 'skill' ? 'check' : 'passive';
        const formula = formulaValue();
        return formula.error
            ? skip(formula.error)
            : changes([`system.skills.${skill.id}.bonuses.${field}`], code, formula.formula);
    }

    // Proficiencies: UPGRADE for saves and skills, ADD for the value sets.
    if ((match = target.match(/^prof\.save\.([a-z]+)$/))) {
        if (!ABILITIES.includes(match[1])) return skip(`no dnd5e saving throw for "${match[1]}"`);
        return changes([`system.abilities.${match[1]}.proficient`], UPGRADE, '1');
    }
    if ((match = target.match(/^prof\.skill\.(.+)$/))) {
        const skill = skillOf(match[1]);
        if (skill.reason) return skip(skill.reason);
        if (raw === null) return changes([`system.skills.${skill.id}.value`], UPGRADE, '1');
        const number = numericValue();
        return number.error ? skip(number.error) : changes([`system.skills.${skill.id}.value`], UPGRADE, String(number.value));
    }
    if (target.startsWith('prof.')) {
        const name = target.slice('prof.'.length);
        if (hasOwn(ARMOR_PROFS, name)) return changes(['system.traits.armorProf.value'], ADD, ARMOR_PROFS[name]);
        if (hasOwn(WEAPON_PROFS, name)) return changes(['system.traits.weaponProf.value'], ADD, WEAPON_PROFS[name]);
        // `weapon-other` is free text (DESIGN §6.1: traits.weaponProf.custom), not a value key of the set.
        if (name === 'weapon-other') return skip('weapon-other is free text, not a value key; set it by hand');
    }

    return skip(`target "${target}" is not translated`);
}

/* -------------------------------------------- */
/*  Mapping                                     */
/* -------------------------------------------- */

/**
 * Bonuses of the character as Active Effects and as plain sums (docs/DESIGN.md §4.3).
 *
 * Grouping: one effect per `data.effects[]` entry, which holds its enabled bonuses and carries
 * the effect's `disabled`. Other bonuses go to «LSS: бонусы» (enabled), «LSS: отключённые бонусы»
 * (disabled or unchecked attunement slot) and «LSS: условные бонусы» (conditional). All are
 * `transfer: false`. Groups without changes are not created.
 *
 * Attunement: a bonus with `source.kind: "attunement"` applies only when its slot is checked.
 * Shield: a `shield` bonus applies only when `vitality.shield.value` is true.
 *
 * @param {object} char  LssCharacter (uses `char.data`)
 * @param {object} stats  result of computeStats (uses `stats.formulaCtx`)
 * @param {{ randomID: (n?: number) => string }} ctx
 * @returns {{
 *   effects: object[],
 *   weapon: Record<string, { attack: string[], damage: string[] }>,
 *   hpMax: number,
 *   slots: { spell: Record<number, number>, pact: number },
 *   skipped: { id: string|null, label: string, target: string, reason: string }[],
 *   warnings: string[],
 * }}
 */
export function mapBonuses(char, stats, ctx) {
    const data = isObject(char?.data) ? char.data : {};
    const formulaCtx = stats?.formulaCtx ?? EMPTY_FORMULA_CTX;
    const warnings = [];
    const skipped = [];

    const effectById = new Map(list(data.effects).filter(isObject).map((effect) => [String(effect.id), effect]));
    const attunementChecked = new Map(
        list(data.attunementsList).filter(isObject).map((slot) => [String(slot.id), slot.checked === true]),
    );
    const weaponIds = new Set(list(data.weaponsList).filter(isObject).map((weapon) => String(weapon.id)));
    const env = { formulaCtx, weaponIds };
    const shieldOn = data.vitality?.shield?.value === true;

    for (const key of ['bonusesSkills', 'bonusesStats']) {
        const value = data[key];
        const hasContent = Array.isArray(value) ? value.length > 0 : isObject(value) && Object.keys(value).length > 0;
        if (hasContent) warnings.push(`data.${key} is not imported: its format is not documented`);
    }

    const bonuses = [
        ...list(data.bonuses),
        ...ABILITIES.flatMap((ability) => list(data.stats?.[ability]?.bonuses)),
    ].filter(isObject);

    const result = {
        hpMax: 0,
        slots: { spell: Object.fromEntries(LEVELS.map((level) => [level, 0])), pact: 0 },
        weapon: {},
    };
    /** @type {Map<string, { changes: object[], labels: string[] }>} */
    const groups = new Map();
    const addToGroup = (groupKey, label, changeList) => {
        if (!groups.has(groupKey)) groups.set(groupKey, { changes: [], labels: [] });
        const group = groups.get(groupKey);
        group.changes.push(...changeList);
        group.labels.push(label);
    };

    for (const bonus of bonuses) {
        const label = String(bonus.label || bonus.target || bonus.id || 'bonus');
        const target = String(bonus.target ?? '');
        const id = bonus.id ?? null;
        const source = isObject(bonus.source) ? bonus.source : {};
        const warn = (text) => warnings.push(`"${label}": ${text}`);

        const effect = source.kind === 'effect' ? effectById.get(String(source.refId)) : undefined;
        if (source.kind === 'effect' && !effect) warn(`effect "${source.refId}" not found, the bonus is kept as a plain one`);

        const plan = planBonus(bonus, env);
        plan.warnings.forEach(warn);
        if (plan.kind === 'skip') {
            skipped.push({ id, label, target, reason: plan.reason });
            continue;
        }

        // Why the bonus itself does not apply. An effect's own `disabled` is checked below.
        const ownReasons = [];
        if (bonus.disabled === true) ownReasons.push('disabled');
        if (source.kind === 'attunement' && attunementChecked.get(String(source.refId)) !== true) {
            ownReasons.push('attunement slot is not checked');
        }
        if (plan.kind === 'changes' && plan.needsShield && !shieldOn) ownReasons.push('shield is not equipped');
        if (bonus.conditional) ownReasons.push('conditional');
        const ownActive = ownReasons.length === 0;

        if (plan.kind === 'changes') {
            const changeList = plan.changes.map((change) => (
                Number.isFinite(bonus.priority) ? { ...change, priority: bonus.priority } : change
            ));
            let groupKey;
            if (effect && ownActive) groupKey = `effect:${effect.id}`;
            else if (ownReasons.length === 0) groupKey = 'enabled';
            else if (ownReasons.length === 1 && ownReasons[0] === 'conditional') groupKey = 'conditional';
            else groupKey = 'disabled';
            addToGroup(groupKey, label, changeList);
            continue;
        }

        // Hit points, spell slots and weapon bonuses have no effect: they are summed here.
        const effectOff = effect && effect.disabled === true;
        if (!ownActive || effectOff) {
            const reasons = [...ownReasons];
            if (effectOff) reasons.push(`effect "${effect.name}" is disabled`);
            skipped.push({ id, label, target, reason: `not applied: ${reasons.join(', ')}` });
            continue;
        }
        if (plan.kind === 'hp') result.hpMax += plan.value;
        else if (plan.kind === 'slot') result.slots.spell[plan.level] += plan.value;
        else if (plan.kind === 'pact') result.slots.pact += plan.value;
        else if (plan.kind === 'weapon') {
            result.weapon[plan.weaponId] ??= { attack: [], damage: [] };
            result.weapon[plan.weaponId][plan.field].push(plan.formula);
        }
    }

    const effects = [];
    for (const effect of effectById.values()) {
        const group = groups.get(`effect:${effect.id}`);
        if (!group) continue;
        effects.push(activeEffect({
            name: String(effect.name || 'LSS effect'),
            description: effect.description ? escapeHtml(String(effect.description)) : '',
            disabled: effect.disabled === true,
            changes: group.changes,
            lssId: String(effect.id),
        }, ctx));
    }
    for (const { key, name, disabled } of GENERIC_GROUPS) {
        const group = groups.get(key);
        if (!group) continue;
        effects.push(activeEffect({
            name,
            description: htmlList(group.labels),
            disabled,
            changes: group.changes,
        }, ctx));
    }

    return {
        effects,
        weapon: result.weapon,
        hpMax: result.hpMax,
        slots: result.slots,
        skipped,
        warnings,
    };
}
