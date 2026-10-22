/**
 * LSS weapons and limited-use resources → dnd5e 5.1.8 items (docs/DESIGN.md §5.4, §6.2).
 *
 * Pure core: no Foundry globals. Shapes follow docs/research/dnd5e-5.1.8-data-model.md:
 * weapon and DamageData in §2.7 and §3.2, attack activity in §3.4, uses in §4.
 */

import { FLAG_SCOPE, FLAGS } from '../constants.mjs';
import { ABILITIES, damageTypesFromText } from './lss-keys.mjs';
import { evaluateNumeric, parseDamage, toFoundryNumeric } from './formula.mjs';

const WEAPON_ICON = 'icons/svg/sword.svg';
const RESOURCE_ICON = 'icons/svg/upgrade.svg';
const EMPTY_FORMULA_CTX = { abilities: {}, prof: 0, level: 0 };

/**
 * Words that make a weapon ranged (dnd5e simpleR). Matched against the name and the notes.
 * Cyrillic stems are matched as substrings, since `\b` does not work for Cyrillic in JS.
 */
const RANGED_PATTERN = /лук|арбалет|праща|дротик|bow|sling|dart/i;

/** A die term such as `1d6` or `d8`, used to tell whether dnd5e's automatic `@mod` will apply. */
const DICE_PATTERN = /(?:^|[^a-z@.])\d*d\d+/i;

const TRANSLIT = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** @param {unknown} value @returns {boolean} */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {boolean} true for a non-empty string. */
function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

/**
 * Plain text of an LSS field: a bare string, or the `value` of `{ value }`.
 * @param {unknown} field
 * @returns {string}
 */
function textOf(field) {
    if (typeof field === 'string') return field.trim();
    if (isObject(field) && field.value !== null && field.value !== undefined) return String(field.value).trim();
    return '';
}

/**
 * A finite number from a number or a numeric string, otherwise null.
 * @param {unknown} value
 * @returns {number|null}
 */
function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (hasText(value) && Number.isFinite(Number(value))) return Number(value);
    return null;
}

/**
 * Escape text for an HTML description. Line breaks become `<br>`.
 * @param {string} text
 * @returns {string} a `<p>` element, or an empty string
 */
function htmlParagraph(text) {
    if (!text) return '';
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`;
}

/**
 * `system.identifier`: the name transliterated to Latin, lowercased, words joined by `-`.
 * @param {string} name
 * @param {string} fallback  used when nothing Latin is left, e.g. `weapon-3`
 * @returns {string}
 */
function identifierFor(name, fallback) {
    const latin = [...name].map((ch) => TRANSLIT[ch.toLowerCase()] ?? ch).join('');
    const slug = latin.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || fallback;
}

/**
 * Split a formula into its leading sign and the rest. A formula without a sign is a plus term.
 * @param {string} formula
 * @returns {{ sign: '+'|'-', text: string }}
 */
function splitSign(formula) {
    const text = String(formula).trim();
    if (text.startsWith('-')) return { sign: '-', text: text.slice(1).trim() };
    if (text.startsWith('+')) return { sign: '+', text: text.slice(1).trim() };
    return { sign: '+', text };
}

/**
 * Join signed terms into one additive formula. A leading minus stays a unary minus
 * (`-@abilities.str.mod`). A later minus is written as `- x`. dnd5e merges the `+ -` pairs that
 * this can produce (dice/simplify-roll-formula.mjs), so such formulas are valid.
 * @param {{ sign: '+'|'-', text: string }[]} terms
 * @returns {string}
 */
function joinTerms(terms) {
    return terms
        .filter((term) => term.text !== '')
        .map((term, index) => {
            if (index === 0) return term.sign === '-' ? `-${term.text}` : term.text;
            return `${term.sign} ${term.text}`;
        })
        .join(' ');
}

/**
 * @param {string[]} formulas  additive formulas, each may start with a sign
 * @returns {string}
 */
function joinFormulas(formulas) {
    return joinTerms(formulas.map(splitSign));
}

/**
 * A dnd5e DamageData object (docs/research/dnd5e-5.1.8-data-model.md §3.2).
 * `number` and `denomination` are 0 for custom formulas: dnd5e's DamageField does not accept null.
 * @param {object} [options]
 * @param {number} [options.number]
 * @param {number} [options.denomination]
 * @param {string} [options.bonus]
 * @param {string[]} [options.types]
 * @param {string|null} [options.customFormula]  when set, replaces `NdM + bonus`
 * @returns {object}
 */
function damageData({ number = 0, denomination = 0, bonus = '', types = [], customFormula = null } = {}) {
    return {
        number,
        denomination,
        bonus,
        types,
        custom: { enabled: customFormula !== null, formula: customFormula ?? '' },
        scaling: { mode: '', number: 1, formula: '' },
    };
}

/**
 * Damage types from the words after the dice, falling back to the weapon's damage type field.
 * @param {string} partText
 * @param {string} fallbackText
 * @returns {string[]}
 */
function typesOf(partText, fallbackText) {
    const fromPart = damageTypesFromText(partText);
    return fromPart.length ? fromPart : damageTypesFromText(fallbackText);
}

/**
 * Attack ability of a weapon. `none` stays `none` (no ability modifier). A missing or unknown value
 * takes the usual default for the weapon type: `str` for melee, `dex` for ranged.
 * @param {unknown} raw
 * @param {boolean} ranged
 * @param {string} where  label for warnings
 * @param {string[]} warnings
 * @returns {string} an ability key, or `none`
 */
function attackAbilityOf(raw, ranged, where, warnings) {
    const key = String(raw ?? '').trim().toLowerCase();
    if (key === 'none') return 'none';
    if (ABILITIES.includes(key)) return key;
    if (key) warnings.push(`${where}: unknown attack ability "${raw}", the default for the weapon type is used`);
    return ranged ? 'dex' : 'str';
}

/**
 * Base damage part of a weapon.
 *
 * dnd5e adds the attack ability modifier to the base die part by itself, as `@mod`, unless the part
 * already contains the text `@mod` or has no dice (dnd5e 5.1.8, module/data/activity/attack-data.mjs,
 * `_processDamagePart`). So the formula is built around that automatic term:
 * - an ability of the attack that LSS does not put into the formula is cancelled with
 *   `- @abilities.<attack>.mod` (the text `@mod` is not used, so the automatic term still applies);
 * - an ability that LSS puts into the formula but differs from the attack ability is added explicitly;
 * - the attack ability written in the formula is left to the automatic term.
 * With attack ability `none` nothing is automatic, so every ability of the formula is explicit.
 *
 * Known limit: in an off-hand attack with a non-negative modifier dnd5e does not add `@mod`, so a
 * cancelled ability would be subtracted there. This is dnd5e's rule for off-hand attacks; not handled.
 *
 * @param {object} parsed  result of parseDamage
 * @param {string[]} types  damage types of the weapon
 * @param {string|null} attackAbility  `str`…`cha`, or null for `none`
 * @param {string} where
 * @param {string[]} warnings
 * @returns {object} DamageData
 */
function baseDamage(parsed, types, attackAbility, where, warnings) {
    const base = parsed.base;
    if (!base) {
        warnings.push(`${where}: no damage formula`);
        return damageData({ types });
    }

    if (base.custom.enabled) {
        const formula = base.custom.formula;
        if (!formula) {
            warnings.push(`${where}: no damage formula`);
            return damageData({ types });
        }
        // A custom formula already holds every ability term that LSS wrote, so the automatic one is
        // always cancelled, but only when the formula has dice (otherwise dnd5e adds nothing).
        const hasDice = DICE_PATTERN.test(formula);
        const custom = attackAbility && hasDice ? `${formula} - @abilities.${attackAbility}.mod` : formula;
        return damageData({ types, customFormula: custom });
    }

    const abilities = [...new Set(parsed.abilities)];
    const terms = [{ sign: '+', text: base.bonus }];
    for (const ability of abilities) {
        if (ability === attackAbility) continue; // dnd5e adds the attack ability itself
        terms.push({ sign: '+', text: `@abilities.${ability}.mod` });
    }
    if (attackAbility && !abilities.includes(attackAbility)) {
        terms.push({ sign: '-', text: `@abilities.${attackAbility}.mod` });
    }

    return damageData({
        number: base.number,
        denomination: base.denomination,
        bonus: joinTerms(terms),
        types,
    });
}

/* -------------------------------------------- */
/*  Weapons                                     */
/* -------------------------------------------- */

/**
 * Weapons of the character as dnd5e `weapon` items with one attack activity each.
 * Bonuses from `mapBonuses().weapon` go to the attack bonus and to extra damage parts.
 * @param {object} char  LssCharacter (uses `char.data.weaponsList`)
 * @param {object} stats  result of computeStats (uses `stats.formulaCtx`)
 * @param {Record<string, { attack: string[], damage: string[] }>} weaponBonuses  `mapBonuses().weapon`
 * @param {{ randomID: (n?: number) => string }} ctx
 * @returns {{ items: object[], warnings: string[] }} ItemSource[] with flags `{ imported, lssId }`
 */
export function mapWeapons(char, stats, weaponBonuses, ctx) {
    const warnings = [];
    const items = [];
    const formulaCtx = stats?.formulaCtx ?? EMPTY_FORMULA_CTX;
    const list = Array.isArray(char?.data?.weaponsList) ? char.data.weaponsList : [];

    list.forEach((weapon, index) => {
        if (!isObject(weapon) || weapon.isDeleted === true) return;

        const name = textOf(weapon.name) || 'Оружие';
        const where = `weapon "${name}"`;
        const notes = textOf(weapon.notes);
        const ranged = RANGED_PATTERN.test(`${name} ${notes}`);
        const ability = attackAbilityOf(weapon.ability, ranged, where, warnings);
        const attackAbility = ability === 'none' ? null : ability;
        const bonuses = weaponBonuses?.[weapon.id] ?? { attack: [], damage: [] };

        const parsed = parseDamage(textOf(weapon.dmg));
        warnings.push(...parsed.warnings.map((text) => `${where}: ${text}`));

        const types = typesOf(parsed.base?.typeText ?? '', textOf(weapon.dmgType));
        if (!types.length && (parsed.base || parsed.extra.length)) warnings.push(`${where}: damage type is not recognised`);
        const base = baseDamage(parsed, types, attackAbility, where, warnings);

        // Extra dice (`1к6 колющий + 1к4 яд`) are plain parts, so dnd5e adds no automatic modifier to them.
        const parts = [
            ...parsed.extra.map((part) => {
                const partTypes = damageTypesFromText(part.typeText);
                return damageData({
                    number: part.number,
                    denomination: part.denomination,
                    types: partTypes.length ? partTypes : types,
                });
            }),
            ...bonuses.damage.map((formula) => damageData({ types, customFormula: formula })),
        ];

        // Attack bonus: LSS flat bonus (modBonus, else the legacy modCustom) plus the weapon's attack bonuses.
        const flat = flatAttackBonus(weapon, formulaCtx, where, warnings);
        const attackBonus = joinFormulas([...(flat ? [flat] : []), ...bonuses.attack]);

        const activityId = ctx.randomID();
        const activity = {
            _id: activityId,
            type: 'attack',
            sort: 0,
            activation: { type: 'action', value: null, condition: '', override: false },
            attack: {
                ability,
                bonus: attackBonus,
                critical: { threshold: null },
                flat: false,
                type: { value: ranged ? 'ranged' : 'melee', classification: 'weapon' },
            },
            damage: { critical: { bonus: '' }, includeBase: true, parts },
        };

        items.push({
            name,
            type: 'weapon',
            img: WEAPON_ICON,
            system: {
                identifier: identifierFor(name, `weapon-${index + 1}`),
                type: { value: ranged ? 'simpleR' : 'simpleM', baseItem: '' },
                proficient: Number(weapon.isProf) > 0 ? 1 : 0,
                equipped: true,
                quantity: 1,
                // Finesse is only offered for melee weapons that use Dexterity, as in LSS.
                properties: !ranged && ability === 'dex' ? ['fin'] : [],
                damage: { base },
                description: { value: htmlParagraph(notes) },
                activities: { [activityId]: activity },
            },
            flags: { [FLAG_SCOPE]: { [FLAGS.imported]: true, [FLAGS.lssId]: weapon.id ?? null } },
        });
    });

    return { items, warnings };
}

/**
 * A numeric LSS formula as a Foundry formula. The numeric evaluator runs first, because
 * toFoundryFormula does not catch syntax errors such as an unclosed parenthesis.
 * @param {string|number} raw
 * @param {object} formulaCtx
 * @returns {{ formula: string, warnings: string[] } | { error: string }}
 */
function translateNumeric(raw, formulaCtx) {
    const syntax = evaluateNumeric(raw, formulaCtx);
    if (syntax.error) return { error: syntax.error };
    const translated = toFoundryNumeric(raw, formulaCtx);
    if (!translated.ok) return { error: 'cannot be expressed in Foundry' };
    return { formula: translated.formula, warnings: translated.warnings };
}

/**
 * The flat attack bonus of a weapon as a formula, or null.
 * `modBonus` is the current field. `modCustom` is the legacy one, read when `modBonus` is empty.
 * @param {object} weapon
 * @param {object} formulaCtx
 * @param {string} where
 * @param {string[]} warnings
 * @returns {string|null}
 */
function flatAttackBonus(weapon, formulaCtx, where, warnings) {
    for (const field of [weapon.modBonus, weapon.modCustom]) {
        const raw = isObject(field) ? field.value : field;
        if (raw === null || raw === undefined || raw === '') continue;
        const number = toNumber(raw);
        if (number !== null) return String(number);
        const translated = translateNumeric(String(raw), formulaCtx);
        if (!('error' in translated)) return translated.formula;
        warnings.push(`${where}: cannot translate attack modifier "${raw}": ${translated.error}`);
        return null;
    }
    return null;
}

/* -------------------------------------------- */
/*  Resources                                   */
/* -------------------------------------------- */

/**
 * Limited-use resources as dnd5e `feat` items with `uses`. Deleted resources are skipped.
 * @param {object} char  LssCharacter (uses `char.data.resources`)
 * @param {object} stats  result of computeStats (uses `stats.formulaCtx`)
 * @param {{ randomID: (n?: number) => string }} ctx
 * @returns {{ items: object[], warnings: string[] }} ItemSource[] with flags `{ imported, lssId }`
 */
export function mapResources(char, stats, ctx) {
    const warnings = [];
    const items = [];
    const formulaCtx = stats?.formulaCtx ?? EMPTY_FORMULA_CTX;
    const entries = Object.entries(char?.data?.resources ?? {});

    entries.forEach(([key, resource], index) => {
        if (!isObject(resource) || resource.isDeleted === true) return;

        const name = textOf(resource.name) || 'Ресурс';
        const where = `resource "${name}"`;
        const notes = textOf(resource.notes);
        const current = toNumber(resource.current);

        // Maximum: the formula from `maxExpr`, or the plain number from `max`.
        let maxFormula;
        let maxValue;
        if (hasText(resource.maxExpr)) {
            const translated = translateNumeric(resource.maxExpr, formulaCtx);
            maxValue = evaluateNumeric(resource.maxExpr, formulaCtx).value;
            if (!('error' in translated)) maxFormula = translated.formula;
            else {
                warnings.push(`${where}: cannot translate maxExpr "${resource.maxExpr}": ${translated.error}`);
                maxFormula = maxValue === null ? '' : String(maxValue);
            }
        } else if (toNumber(resource.max) !== null) {
            maxValue = toNumber(resource.max);
            maxFormula = String(maxValue);
        } else {
            maxValue = current;
            maxFormula = current === null ? '' : String(current);
            warnings.push(`${where}: no max, the current value is used`);
        }

        // spent = max - current, never negative. The LSS current value is a count of what is left.
        let spent = 0;
        if (maxValue !== null && maxValue !== undefined) {
            spent = Math.max(0, Math.floor(maxValue) - Math.floor(current ?? maxValue));
        } else {
            warnings.push(`${where}: maximum is unknown, no uses spent`);
        }

        // Recovery: the long rest comes first, then the short rest.
        const recovery = [];
        if (resource.isLongRest === true) recovery.push({ period: 'lr', type: 'recoverAll', formula: '' });
        if (resource.isShortRest === true) {
            const regain = hasText(resource.shortRestRegain)
                ? translateNumeric(resource.shortRestRegain, formulaCtx)
                : null;
            if (regain && !('error' in regain) && regain.formula) {
                recovery.push({ period: 'sr', type: 'formula', formula: regain.formula });
            } else {
                if (regain) warnings.push(`${where}: cannot translate shortRestRegain, full recovery is used`);
                recovery.push({ period: 'sr', type: 'recoverAll', formula: '' });
            }
        }

        items.push({
            name,
            type: 'feat',
            img: RESOURCE_ICON,
            system: {
                identifier: identifierFor(name, `resource-${index + 1}`),
                type: { value: '', subtype: '' },
                description: { value: htmlParagraph(notes) },
                uses: { max: maxFormula, spent, recovery },
            },
            flags: { [FLAG_SCOPE]: { [FLAGS.imported]: true, [FLAGS.lssId]: resource.id ?? key } },
        });
    });

    return { items, warnings };
}
