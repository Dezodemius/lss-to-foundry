/**
 * Mapping of an LSS character onto the dnd5e 5.1.8 actor (docs/DESIGN.md §5.3 and §6.1).
 *
 * computeStats() resolves ability scores with LSS stat bonuses. mapActor() builds the actor `system`
 * and the `targets` that the actor writer checks after creation (HP, spell slots, conditions).
 *
 * dnd5e computes proficiency from the character level itself and cannot be written. When LSS uses
 * another proficiency bonus (a custom one, for example), proficient saves and skills get a correction
 * bonus, so that the totals shown in Foundry match LSS (docs/DESIGN.md §1, principle 1).
 *
 * Pure: no Foundry globals.
 */

import {
    ABILITIES, AIME_ONLY_SKILLS, ARMOR_PROFS, COINS, CONDITIONS, SIZES, SKILLS, WEAPON_PROFS,
} from './lss-keys.mjs';
import { abilityMod, evaluateNumeric, toFoundryFormula, toFoundryNumeric } from './formula.mjs';
import { docToHtml, escapeHtml } from './rich-text.mjs';
import {
    isPlainObject, normalizeProficiency, toNumber, toText, unwrapValue,
} from './parse.mjs';

/** dnd5e ability of a skill when the LSS character has no `baseStat` (SRD values). */
const DEFAULT_SKILL_ABILITY = {
    acrobatics: 'dex',
    'animal handling': 'wis',
    arcana: 'int',
    athletics: 'str',
    deception: 'cha',
    history: 'int',
    insight: 'wis',
    intimidation: 'cha',
    investigation: 'int',
    medicine: 'wis',
    nature: 'int',
    perception: 'wis',
    performance: 'cha',
    persuasion: 'cha',
    religion: 'int',
    'sleight of hand': 'dex',
    stealth: 'dex',
    survival: 'wis',
};

/** Skills that have a custom passive value in LSS (`customPassive`). */
const PASSIVE_SKILLS = new Set(['perception', 'insight', 'investigation']);

/** Text blocks that fill single detail fields instead of the biography. */
const DETAIL_BLOCKS = {
    personality: 'trait',
    ideals: 'ideal',
    bonds: 'bond',
    flaws: 'flaw',
    appearance: 'appearance',
};

const SUBINFO_FIELDS = ['age', 'height', 'weight', 'eyes', 'skin', 'hair'];

/** Russian headings of biography sections for known LSS text blocks. */
const BLOCK_TITLES = {
    features: 'Особенности класса',
    traits: 'Особенности',
    feats: 'Черты',
    weapons: 'Оружие',
    attacks: 'Атаки',
    equipment: 'Снаряжение',
    items: 'Предметы',
    attunement: 'Настройка',
    prof: 'Владения',
    quests: 'Задания',
    allies: 'Союзники',
};

/**
 * Character stats after LSS bonuses.
 * @typedef {object} CharacterStats
 * @property {Record<string, { score: number, mod: number }>} abilities
 * @property {number} prof     LSS proficiency bonus: proficiencyCustom || proficiency || by level
 * @property {number} level    1..20
 * @property {{ abilities: Record<string, number>, prof: number, level: number }} formulaCtx
 *   context for LSS numeric formulas (ability modifiers, proficiency, level)
 * @property {string[]} warnings
 */

/**
 * Actor mapping result.
 * @typedef {object} ActorMapping
 * @property {string} name
 * @property {string|null} img  avatar URL (webp, then jpeg); null when unused or absent
 * @property {object} system    `system` part of the actor source: only fields the module writes
 * @property {object} targets
 * @property {number} targets.hpMax        LSS maximum: hp-max + hp-max-bonus (`hp.max` bonuses are added by map-bonuses)
 * @property {number} targets.hpCurrent
 * @property {number} targets.hpTemp
 * @property {Record<number, { total: number, filled: number }>} targets.slots  levels 1..9, without `spellSlot` bonuses
 * @property {{ level: number, total: number, filled: number }|null} targets.pact
 * @property {string[]} targets.conditions  dnd5e condition ids
 * @property {number} targets.exhaustion
 * @property {string[]} warnings
 */

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

/** `data` of a character from parseLssFile; a bare normalized `data` object is accepted too. */
function dataOf(char) {
    if (isPlainObject(char?.data)) return char.data;
    return isPlainObject(char) ? char : {};
}

function formatNumber(value) {
    return Number.isFinite(value) && value !== 0 ? String(value) : '';
}

/** Join Foundry formula terms with `+` and `-`, skipping empty and zero terms. */
function joinTerms(terms) {
    let out = '';
    for (const raw of terms) {
        const term = String(raw ?? '').trim();
        if (!term || term === '0') continue;
        if (!out) out = term.replace(/^\+\s*/, '');
        else if (term.startsWith('-')) out += ` - ${term.slice(1).trim()}`;
        else out += ` + ${term.replace(/^\+\s*/, '')}`;
    }
    return out;
}

/** Remove the Dexterity modifier term from a translated initiative formula (`1+@abilities.dex.mod` → `1`). */
function withoutDexMod(formula) {
    let rest = formula.replace(/^\s*@abilities\.dex\.mod(?![\w.])\s*\+?\s*/, '');
    rest = rest.replace(/\s*\+\s*@abilities\.dex\.mod(?![\w.])/g, '');
    return rest.replace(/@abilities\.dex\.mod(?![\w.])/g, '0').trim();
}

function levelOf(data) {
    const level = toNumber(unwrapValue(data.info?.level), 1);
    return Math.min(20, Math.max(1, Math.floor(level)));
}

function profOf(data, level) {
    const custom = toNumber(data.proficiencyCustom, 0);
    const base = toNumber(data.proficiency, 0);
    return custom || base || 2 + Math.floor((level - 1) / 4);
}

function modsOf(scores) {
    return Object.fromEntries(ABILITIES.map((ab) => [ab, abilityMod(scores[ab])]));
}

function bonusLabel(bonus) {
    return bonus.label || bonus.id || bonus.target || 'бонус';
}

/* -------------------------------------------- */
/*  Stats                                       */
/* -------------------------------------------- */

/**
 * Resolve ability scores and modifiers of an LSS character.
 *
 * Score = `stats.<ab>.score` + enabled bonuses with target `stat.<ab>.score`. `add` values are summed.
 * A `set` value replaces the total, and the last one wins. Bonuses come from `data.bonuses` and from
 * `stats.<ab>.bonuses`. A bonus from an effect counts only when the effect exists and is enabled.
 * An attunement bonus counts only when its item is attuned. Conditional bonuses are not applied and
 * are reported. Expressions are evaluated against the base scores, so there is no circular dependency.
 *
 * @param {object} char  a character from parseLssFile (or its normalized `data`)
 * @returns {CharacterStats}
 */
export function computeStats(char) {
    const data = dataOf(char);
    const warnings = [];
    const level = levelOf(data);
    const prof = profOf(data, level);
    const baseScores = Object.fromEntries(ABILITIES.map((ab) => [ab, toNumber(data.stats?.[ab]?.score, 10)]));
    const baseCtx = { abilities: modsOf(baseScores), prof, level };

    const abilities = {};
    for (const ab of ABILITIES) {
        const score = scoreWithBonuses(data, ab, baseScores[ab], baseCtx, warnings);
        abilities[ab] = { score, mod: abilityMod(score) };
    }
    const finalMods = Object.fromEntries(ABILITIES.map((ab) => [ab, abilities[ab].mod]));
    return {
        abilities,
        prof,
        level,
        formulaCtx: { abilities: finalMods, prof, level },
        warnings,
    };
}

function scoreWithBonuses(data, ab, base, ctx, warnings) {
    const target = `stat.${ab}.score`;
    const candidates = [
        ...(Array.isArray(data.bonuses) ? data.bonuses : []),
        ...(Array.isArray(data.stats?.[ab]?.bonuses) ? data.stats[ab].bonuses : []),
    ];
    let add = 0;
    let override = null;
    for (const bonus of candidates) {
        if (!isPlainObject(bonus) || bonus.target !== target) continue;
        if (!isBonusActive(bonus, data, warnings)) continue;
        const label = bonusLabel(bonus);
        const mode = bonus.mode || 'add';
        if (mode !== 'add' && mode !== 'set') {
            warnings.push(`бонус "${label}" к ${ab}: режим "${mode}" для характеристики не поддерживается`);
            continue;
        }
        if (bonus.conditional) {
            warnings.push(`условный бонус "${label}" к ${ab} не учтён`);
            continue;
        }
        const amount = bonusAmount(bonus, ctx, warnings);
        if (amount === null) continue;
        if (mode === 'add') add += amount;
        else override = amount;
    }
    return override ?? base + add;
}

/** Whether a bonus applies: not disabled, and its effect or attuned item is active. */
function isBonusActive(bonus, data, warnings) {
    if (bonus.disabled === true) return false;
    const source = isPlainObject(bonus.source) ? bonus.source : {};
    if (source.kind === 'effect') {
        const effect = (Array.isArray(data.effects) ? data.effects : []).find((item) => isPlainObject(item) && item.id === source.refId);
        if (!effect) {
            warnings.push(`бонус "${bonusLabel(bonus)}" ссылается на несуществующий эффект и не учтён`);
            return false;
        }
        return effect.disabled !== true;
    }
    if (source.kind === 'attunement') {
        const slot = (Array.isArray(data.attunementsList) ? data.attunementsList : [])
            .find((item) => isPlainObject(item) && item.id === source.refId);
        return slot?.checked === true;
    }
    return true;
}

function bonusAmount(bonus, ctx, warnings) {
    const value = toNumber(bonus.value, null);
    if (value !== null) return value;
    if (bonus.expr) {
        const evaluated = evaluateNumeric(bonus.expr, ctx);
        if (evaluated.value !== null) return evaluated.value;
        warnings.push(`бонус "${bonusLabel(bonus)}": формула "${bonus.expr}" не вычислена`);
        return null;
    }
    warnings.push(`бонус "${bonusLabel(bonus)}" без значения пропущен`);
    return null;
}

/* -------------------------------------------- */
/*  Saves, skills                               */
/* -------------------------------------------- */

/** `customModifier` of a save or a skill as a number, or null when absent or not evaluable. */
function customTotal(modifier, label, ctx, warnings) {
    if (modifier === null || modifier === undefined || modifier === '') return null;
    const evaluated = evaluateNumeric(modifier, ctx);
    if (evaluated.value !== null) return evaluated.value;
    warnings.push(`${label}: итог "${modifier}" не вычислен, использован обычный расчёт`);
    return null;
}

/**
 * Bonus of one save or skill check (docs/DESIGN.md §6.1).
 *
 * dnd5e adds `floor(profDnd5e * multiplier)` by its own rules. The difference to the LSS proficiency
 * bonus is added as a number. With `customModifier` (the full LSS total) the bonus is the difference to
 * dnd5e's own total, and the LSS `bonus` and `bonusExpr` are not added.
 *
 * @returns {{ formula: string, value: number }} `formula` for `bonuses.save|check`, and the numeric
 *   part `value` (used for passive scores)
 */
function checkBonus(field, label, { mod, multiplier, prof, profDnd5e, ctx, warnings }) {
    const dnd5eTerm = Math.floor(profDnd5e * multiplier);
    const custom = customTotal(field.customModifier, label, ctx, warnings);
    if (custom !== null) {
        const difference = custom - (mod + dnd5eTerm);
        return { formula: formatNumber(difference), value: difference };
    }

    const correction = Math.floor(prof * multiplier) - dnd5eTerm;
    const terms = [];
    let value = correction;
    const flat = toNumber(field.bonus, 0);
    if (flat) {
        terms.push(String(flat));
        value += flat;
    }
    if (field.bonusExpr) {
        const translated = toFoundryNumeric(field.bonusExpr, ctx);
        if (translated.ok) terms.push(translated.formula);
        if (!translated.ok) warnings.push(`${label}: формула "${field.bonusExpr}" не перенесена`);
        else if (translated.warnings.length > 0) {
            warnings.push(`${label}: формула "${field.bonusExpr}" записана с заменой: ${translated.warnings.join('; ')}`);
        }
        const evaluated = evaluateNumeric(field.bonusExpr, ctx);
        if (evaluated.value !== null) value += evaluated.value;
    }
    terms.push(formatNumber(correction));
    return { formula: joinTerms(terms), value };
}

/**
 * Proficiency written to dnd5e for a save: 1 for a proficient save. Expertise and half proficiency
 * have no dnd5e counterpart for saves, so they are written as the nearest value and reported.
 */
function saveProficiency(value, ab, warnings) {
    if (value >= 2) {
        warnings.push(`спасбросок ${ab}: экспертиза не поддерживается dnd5e, записано владение`);
        return 1;
    }
    if (value >= 1) return 1;
    if (value > 0) {
        warnings.push(`спасбросок ${ab}: половина владения не поддерживается dnd5e, записано без владения`);
    }
    return 0;
}

/* -------------------------------------------- */
/*  Armor class, initiative                     */
/* -------------------------------------------- */

/**
 * Armor class: a custom formula with the shield bonus, or a flat number when the formula cannot be
 * rolled in Foundry. Returns null to keep the dnd5e default.
 */
function armorClass(vitality, ctx, warnings) {
    const acText = toText(unwrapValue(vitality.ac));
    const shield = isPlainObject(vitality.shield) ? vitality.shield : {};
    const shieldOn = unwrapValue(shield.value) === true;
    const shieldText = toText(unwrapValue(shield.mod)) || '2';
    if (!acText) {
        if (shieldOn) warnings.push('щит включён, но КД не задан: КД оставлен по умолчанию');
        return null;
    }

    const ac = toFoundryFormula(acText);
    const shieldFormula = toFoundryNumeric(shieldText, ctx);
    if (ac.ok && (!shieldOn || shieldFormula.ok)) {
        const formula = shieldOn ? `${ac.formula} + (${shieldFormula.formula})` : ac.formula;
        return { calc: 'custom', formula };
    }

    const evaluated = evaluateNumeric(acText, ctx);
    if (evaluated.value === null) {
        warnings.push(`КД "${acText}" не переносится, оставлен расчёт по умолчанию`);
        return null;
    }
    let total = evaluated.value;
    if (shieldOn) {
        const bonus = evaluateNumeric(shieldText, ctx);
        if (bonus.value === null) warnings.push(`бонус щита "${shieldText}" не вычислен`);
        else total += bonus.value;
    }
    warnings.push(`КД "${acText}" записан числом ${total}: формула не переносится в Foundry`);
    return { calc: 'flat', flat: total };
}

/**
 * Initiative bonus: the LSS formula without the Dexterity modifier, which dnd5e adds itself.
 * A formula that does not roll in Foundry is taken as its current value.
 */
function initiativeBonus(value, ctx, warnings) {
    const text = toText(value);
    if (!text) return '';
    const translated = toFoundryFormula(text);
    if (translated.ok) return withoutDexMod(translated.formula);
    const evaluated = evaluateNumeric(text, ctx);
    if (evaluated.value === null) {
        warnings.push(`инициатива "${text}" не вычислена`);
        return '';
    }
    const usesDex = /\[\s*DEX\s*\]/i.test(text);
    return formatNumber(usesDex ? evaluated.value - ctx.abilities.dex : evaluated.value);
}

/* -------------------------------------------- */
/*  Text                                        */
/* -------------------------------------------- */

function docOf(block) {
    return isPlainObject(block?.value) ? block.value.data : undefined;
}

/**
 * Plain text of a document: its rich-text rendering with the tags removed. dnd5e stores the trait,
 * ideal, bond, flaw and appearance fields as plain strings (not HTML), so markup would show as text.
 */
function plainTextOf(doc, richCtx) {
    const html = docToHtml(doc, richCtx).replace(/<[^>]*>/g, ' ');
    const decoded = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
    return decoded.replace(/\s+/g, ' ').trim();
}

function sectionTitle(key, block) {
    const custom = toText(block?.customLabel);
    if (custom) return custom;
    if (Object.hasOwn(BLOCK_TITLES, key)) return BLOCK_TITLES[key];
    const notes = /^notes-([1-6])$/.exec(key);
    if (notes) return `Заметки ${notes[1]}`;
    const spells = /^spells-level-([0-9])$/.exec(key);
    if (spells) return Number(spells[1]) === 0 ? 'Заговоры' : `Заклинания ${spells[1]}-го круга`;
    return key;
}

/**
 * Biography: the background block first, then one section per other text block (in LSS order),
 * then the checked attunement items.
 */
function biographyHtml(data, texts, richCtx) {
    const parts = [];
    const background = docToHtml(docOf(texts.background), richCtx);
    if (background) parts.push(background);

    for (const [key, block] of Object.entries(texts)) {
        if (key === 'background' || Object.hasOwn(DETAIL_BLOCKS, key)) continue;
        const html = docToHtml(docOf(block), richCtx);
        if (!html) continue;
        parts.push(`<h3>${escapeHtml(sectionTitle(key, block))}</h3>`, html);
    }

    const attuned = (Array.isArray(data.attunementsList) ? data.attunementsList : [])
        .filter((slot) => isPlainObject(slot) && slot.checked === true && toText(slot.value));
    if (attuned.length > 0) {
        const items = attuned.map((slot) => `<li>${escapeHtml(toText(slot.value))}</li>`).join('');
        parts.push('<h3>Настройка на предметы</h3>', `<ul>${items}</ul>`);
    }
    return parts.join('\n');
}

/* -------------------------------------------- */
/*  Actor mapping                               */
/* -------------------------------------------- */

/**
 * Actor fields and import targets of an LSS character.
 *
 * Spell slots are written as `value = total - filled`. Pact magic is written for the highest pact
 * level present. Biography and detail fields are HTML (rich-text). Warnings describe everything that
 * was skipped or approximated.
 *
 * @param {object} char          a character from parseLssFile (or its normalized `data`)
 * @param {CharacterStats} [stats]  result of computeStats(char); computed when omitted
 * @param {{ randomID?: Function, options?: { useAvatar?: boolean } }} [ctx]
 * @returns {ActorMapping}
 */
export function mapActor(char, stats, ctx = {}) {
    const data = dataOf(char);
    const computed = stats ?? computeStats(char);
    const warnings = [...(computed.warnings ?? [])];
    const formulaCtx = computed.formulaCtx;
    const mods = Object.fromEntries(ABILITIES.map((ab) => [ab, computed.abilities[ab].mod]));
    // Proficiency that dnd5e computes from the level on its own.
    const profDnd5e = 2 + Math.floor((computed.level - 1) / 4);
    const vitality = isPlainObject(data.vitality) ? data.vitality : {};
    const info = isPlainObject(data.info) ? data.info : {};
    const texts = isPlainObject(data.text) ? data.text : {};
    const richCtx = { resources: isPlainObject(data.resources) ? data.resources : {} };

    // Abilities and saving throws
    const abilities = {};
    for (const ab of ABILITIES) {
        const field = isPlainObject(data.saves?.[ab]) ? data.saves[ab] : {};
        const proficient = saveProficiency(normalizeProficiency(field.isProf), ab, warnings);
        const bonus = checkBonus(field, `спасбросок ${ab}`, {
            mod: mods[ab], multiplier: proficient, prof: computed.prof, profDnd5e, ctx: formulaCtx, warnings,
        });
        abilities[ab] = { value: computed.abilities[ab].score, proficient, bonuses: { save: bonus.formula } };
    }
    for (const key of Object.keys(data.saves ?? {})) {
        if (!ABILITIES.includes(key)) warnings.push(`спасбросок "${key}" не переносится (только шаблоны aime)`);
    }

    // Skills
    const skills = {};
    const skillsData = isPlainObject(data.skills) ? data.skills : {};
    for (const [key, id] of Object.entries(SKILLS)) {
        const field = isPlainObject(skillsData[key]) ? skillsData[key] : {};
        const ability = ABILITIES.includes(field.baseStat) ? field.baseStat : DEFAULT_SKILL_ABILITY[key];
        const value = normalizeProficiency(field.isProf);
        const bonus = checkBonus(field, `навык ${key}`, {
            mod: mods[ability], multiplier: value, prof: computed.prof, profDnd5e, ctx: formulaCtx, warnings,
        });
        const bonuses = { check: bonus.formula, passive: '' };
        const customPassive = toNumber(field.customPassive, null);
        if (customPassive !== null && PASSIVE_SKILLS.has(key)) {
            // dnd5e: passive = 10 + mod + check bonus + proficiency term (+ its own passive bonus).
            const profTerm = Math.floor(profDnd5e * value);
            bonuses.passive = formatNumber(customPassive - (10 + mods[ability] + bonus.value + profTerm));
        }
        skills[id] = { value, ability, bonuses };
    }
    for (const key of Object.keys(skillsData)) {
        if (Object.hasOwn(SKILLS, key)) continue;
        warnings.push(AIME_ONLY_SKILLS.includes(key)
            ? `навык "${key}" есть только в шаблонах aime и не переносится`
            : `неизвестный навык "${key}" не переносится`);
    }

    // Hit points, armor class, movement, senses, death saves
    const hpMax = toNumber(unwrapValue(vitality['hp-max']), 0) + toNumber(unwrapValue(vitality['hp-max-bonus']), 0);
    const hpCurrent = toNumber(unwrapValue(vitality['hp-current']), hpMax);
    const hpTemp = toNumber(unwrapValue(vitality['hp-temp']), 0);
    const attributes = { hp: { value: hpCurrent, max: null, temp: hpTemp } };

    const ac = armorClass(vitality, formulaCtx, warnings);
    if (ac) attributes.ac = ac;
    if (vitality.initiative !== undefined) {
        attributes.init = { bonus: initiativeBonus(unwrapValue(vitality.initiative), formulaCtx, warnings) };
    }
    const speedText = toText(unwrapValue(vitality.speed));
    if (speedText) {
        const speed = evaluateNumeric(speedText, formulaCtx);
        if (speed.value !== null) attributes.movement = { walk: speed.value };
        else warnings.push(`скорость "${speedText}" не вычислена`);
    }
    const darkvision = toNumber(unwrapValue(vitality.darkvision), null);
    if (darkvision !== null) attributes.senses = { darkvision: darkvision > 0 ? darkvision : null };
    if (vitality.deathSuccesses !== undefined || vitality.deathFails !== undefined) {
        attributes.death = {
            success: toNumber(unwrapValue(vitality.deathSuccesses), 0),
            failure: toNumber(unwrapValue(vitality.deathFails), 0),
        };
    }
    if (vitality.isDying === true) {
        warnings.push('признак «умирает» (isDying) не переносится: в dnd5e он вычисляется из HP');
    }
    if (data.inspiration !== undefined) attributes.inspiration = data.inspiration === true;

    // Spellcasting ability and the parts of spell settings that are not mapped
    const spellAbility = toText(data.spellsInfo?.base?.code).toLowerCase();
    if (ABILITIES.includes(spellAbility)) attributes.spellcasting = spellAbility;
    else if (spellAbility) warnings.push(`характеристика заклинаний "${spellAbility}" не распознана`);
    for (const key of ['save', 'mod']) {
        const modifier = data.spellsInfo?.[key]?.customModifier;
        if (modifier !== null && modifier !== undefined && modifier !== '') {
            warnings.push(`итог ${key === 'save' ? 'сложности заклинаний' : 'бонуса атаки заклинаниями'} (customModifier) не переносится`);
        }
    }

    // Details: identity, biography and text fields
    const details = {};
    if (info.alignment !== undefined) details.alignment = toText(unwrapValue(info.alignment));
    if (info.experience !== undefined) details.xp = { value: toNumber(unwrapValue(info.experience), 0) };
    for (const key of SUBINFO_FIELDS) {
        if (data.subInfo?.[key] !== undefined) details[key] = toText(unwrapValue(data.subInfo[key]));
    }
    details.biography = { value: biographyHtml(data, texts, richCtx) };
    for (const [block, field] of Object.entries(DETAIL_BLOCKS)) {
        if (Object.hasOwn(texts, block)) details[field] = plainTextOf(docOf(texts[block]), richCtx);
    }

    // Size and proficiencies
    const traits = {};
    const sizeCode = toText(unwrapValue(info.size));
    if (sizeCode) {
        if (Object.hasOwn(SIZES, sizeCode)) traits.size = SIZES[sizeCode];
        else warnings.push(`размер "${sizeCode}" не распознан`);
    }
    if (isPlainObject(data.prof) && Object.keys(data.prof).length > 0) {
        const flag = (key) => unwrapValue(data.prof[key]) === true;
        traits.armorProf = {
            value: Object.entries(ARMOR_PROFS).filter(([key]) => flag(key)).map(([, code]) => code),
        };
        traits.weaponProf = {
            value: Object.entries(WEAPON_PROFS).filter(([key]) => flag(key)).map(([, code]) => code),
        };
        if (flag('weapon-other')) traits.weaponProf.custom = 'Прочее оружие';
    }

    // Currency
    const currency = {};
    const coins = isPlainObject(data.coins) ? data.coins : {};
    for (const key of COINS) {
        if (coins[key] !== undefined) currency[key] = toNumber(unwrapValue(coins[key]), 0);
    }

    // Spell slots and pact magic
    const spells = {};
    const slots = {};
    for (let level = 1; level <= 9; level += 1) {
        const field = isPlainObject(data.spells?.[`slots-${level}`]) ? data.spells[`slots-${level}`] : {};
        const total = toNumber(field.value, 0);
        const filled = toNumber(field.filled, 0);
        spells[`spell${level}`] = { value: Math.max(0, total - filled) };
        slots[level] = { total, filled };
    }
    let pact = null;
    const pactSlots = Object.entries(isPlainObject(data.spellsPact) ? data.spellsPact : {})
        .map(([key, field]) => ({
            level: Number(/^slots-([1-9])$/.exec(key)?.[1]),
            total: toNumber(field?.value, 0),
            filled: toNumber(field?.filled, 0),
        }))
        .filter((entry) => entry.level > 0 && entry.total > 0);
    if (pactSlots.length > 0) {
        pact = pactSlots.reduce((highest, entry) => (entry.level > highest.level ? entry : highest));
        if (pactSlots.length > 1) warnings.push(`в договоре колдуна несколько кругов, взят ${pact.level}-й`);
        spells.pact = { value: Math.max(0, pact.total - pact.filled) };
    }

    // Conditions and exhaustion
    const conditions = [];
    for (const raw of Array.isArray(data.conditions) ? data.conditions : []) {
        const key = toText(raw).toLowerCase();
        if (!key) continue;
        if (CONDITIONS.includes(key)) conditions.push(key);
        else warnings.push(`состояние "${key}" не переносится: нет такого в dnd5e`);
    }

    const system = {
        abilities,
        attributes,
        details,
        traits,
        skills,
        currency,
        spells,
    };

    return {
        name: toText(unwrapValue(data.name)) || toText(char?.name) || 'Персонаж',
        img: avatarOf(data, ctx),
        system,
        targets: {
            hpMax,
            hpCurrent,
            hpTemp,
            slots,
            pact: pact ? { level: pact.level, total: pact.total, filled: pact.filled } : null,
            conditions,
            exhaustion: toNumber(data.exhaustion, 0),
        },
        warnings,
    };
}

/** Portrait URL: webp first, then jpeg. Not used when `ctx.options.useAvatar` is false. */
function avatarOf(data, ctx) {
    if (ctx?.options?.useAvatar === false) return null;
    const avatar = data.avatar;
    if (typeof avatar === 'string') return avatar || null;
    if (!isPlainObject(avatar)) return null;
    return toText(avatar.webp) || toText(avatar.jpeg) || null;
}
