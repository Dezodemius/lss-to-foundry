/**
 * Reading Long Story Short (LSS) files: JSON text to characters and Grimoire spells
 * (docs/DESIGN.md §5.1).
 *
 * The reader is tolerant to the output of elfrey-lss-converter and old exports
 * (docs/research/lss-character-format.md §7): numbers instead of strings, isProf 0.5, extra keys,
 * `text.*.value.id`. It never throws on bad input: problems go to `errors` and `warnings`.
 *
 * Pure: no Foundry globals.
 */

import { DEFAULT_EDITION } from '../constants.mjs';
import { ABILITIES, COINS } from './lss-keys.mjs';
import { looksLikeSpell, parseGrimoireEntries } from './grimoire.mjs';

/** `data` keys the importer reads. */
const KNOWN_KEYS = new Set([
    'name', 'info', 'subInfo', 'spellsInfo', 'spells', 'spellsPact', 'bonuses', 'effects',
    'proficiency', 'proficiencyCustom', 'stats', 'saves', 'skills', 'vitality', 'attunementsList',
    'weaponsList', 'text', 'coins', 'resources', 'conditions', 'exhaustion', 'inspiration',
    'avatar', 'prof',
]);

/** Keys that LSS writes but that carry nothing the importer needs. They are not reported. */
const QUIET_KEYS = new Set([
    'jsonType', 'template', 'createdAt', 'living', 'miserable', 'edition', 'sheetEdition',
    'wizardStep', 'choices',
]);

/**
 * One character read from a file.
 * @typedef {object} LssCharacter
 * @property {string} key           `${fileName}#${index}`, unique within one import
 * @property {string} fileName
 * @property {'2014'|'2024'} edition
 * @property {{ sheetEdition: string|null, tags: unknown[], spells: {
 *   mode: string, prepared: string[], book: string[],
 *   pending: { slug: string, list: string }[], granted: { id: string, source?: string }[],
 *   slotless: string[] } }} envelope  list fields are always present (default `[]`)
 * @property {object} data          normalized `data` (see normalizeData)
 * @property {string} name          data.name.value || fileName
 * @property {number} level         data.info.level.value, 1..20, default 1
 * @property {string} className     data.info.charClass.value || ''
 * @property {string[]} warnings
 */

/**
 * @typedef {object} ParseResult
 * @property {LssCharacter[]} characters
 * @property {object[]} grimoire    GrimoireSpell entries (see core/grimoire)
 * @property {string[]} errors      problems that stopped a character or a whole file
 */

/* -------------------------------------------- */
/*  Value helpers (exported for map-actor)      */
/* -------------------------------------------- */

/**
 * @param {unknown} value
 * @returns {boolean} true for a non-array object
 */
export function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * LSS wraps most fields as `{ value }`. Returns the inner value, or the input itself.
 * @param {unknown} field
 * @returns {unknown}
 */
export function unwrapValue(field) {
    return isPlainObject(field) && 'value' in field ? field.value : field;
}

/**
 * Number from a number or a numeric string (`"2,5"` included).
 * @param {unknown} value
 * @param {number|null} fallback  returned for anything that is not a finite number
 * @returns {number|null}
 */
export function toNumber(value, fallback = null) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value.trim().replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

/**
 * Text from a string, or the string form of a number. Anything else is ''.
 * @param {unknown} value
 * @returns {string}
 */
export function toText(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

/** Boolean from `true`, `1` or `'true'`. */
function isTrue(value) {
    return value === true || value === 1 || value === 'true';
}

/**
 * Proficiency of a save or a skill (LSS `isProf`): boolean, 0, 0.5, 1 or 2.
 * @param {unknown} value
 * @returns {0|0.5|1|2}
 */
export function normalizeProficiency(value) {
    if (value === true || value === 'true') return 1;
    if (value === false || value === null || value === undefined || value === '' || value === 'false') return 0;
    const number = toNumber(value, 0);
    if (number >= 2) return 2;
    if (number >= 1) return 1;
    if (number >= 0.5) return 0.5;
    return 0;
}

/** Custom modifier: a number, a formula string, or null. */
function normalizeModifier(value) {
    const number = toNumber(value, null);
    if (number !== null) return number;
    return toText(value) || null;
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Parse the text of an LSS file. Accepts one character, an array of characters, `{ characters: [...] }`,
 * a character envelope (`{ jsonType, edition, spells, data }`), and Grimoire spells (an array, or an
 * object with `spells` / `items`). `data` may be a JSON string or an object.
 * @param {string|object|unknown[]} text  file content (a JSON string) or already parsed JSON
 * @param {string} [fileName]
 * @returns {ParseResult}
 */
export function parseLssFile(text, fileName = '') {
    const name = String(fileName ?? '');
    const characters = [];
    const spells = [];
    const errors = [];

    let root = text;
    if (typeof text === 'string') {
        try {
            root = JSON.parse(text.replace(/^﻿/, ''));
        } catch (error) {
            return { characters, grimoire: [], errors: [`${name}: файл не является JSON (${error.message})`] };
        }
    }

    const entries = listEntries(root);
    if (entries === null) {
        return { characters, grimoire: [], errors: [`${name}: неизвестный формат файла`] };
    }
    if (entries.length === 0) errors.push(`${name}: в файле нет персонажей и заклинаний`);

    entries.forEach((entry, index) => {
        if (looksLikeSpell(entry)) {
            spells.push(entry);
            return;
        }
        if (!isCharacterLike(entry)) {
            errors.push(`${name}: элемент #${index + 1} не похож на персонажа или заклинание`);
            return;
        }
        const character = readCharacter(entry, name, `${name}#${index}`, errors);
        if (character) characters.push(character);
    });

    return { characters, grimoire: parseGrimoireEntries(spells), errors };
}

/**
 * Normalize `data` of a character. Returns a new object (the input is not changed) with the
 * guaranteed groups `info`, `stats`, `saves`, `skills`, `vitality`, `text`, `coins`, `resources`,
 * `bonuses`, `effects`, `weaponsList`, `attunementsList`, `conditions`. Unknown keys are dropped.
 * Never throws: a string is parsed as JSON, and anything unusable becomes an empty skeleton.
 * @param {object|string} data
 * @returns {object}
 */
export function normalizeData(data) {
    let raw = data;
    if (typeof data === 'string') {
        try {
            raw = JSON.parse(data);
        } catch {
            raw = null;
        }
    }
    return normalizeCharacter(raw).data;
}

/* -------------------------------------------- */
/*  File structure                              */
/* -------------------------------------------- */

/** The list of entries in a file: an array, an object wrapper, or the root itself. */
function listEntries(root) {
    if (Array.isArray(root)) return root;
    if (!isPlainObject(root)) return null;
    if (Array.isArray(root.characters)) return root.characters;
    if (!isCharacterLike(root)) {
        if (Array.isArray(root.spells)) return root.spells;
        if (Array.isArray(root.items)) return root.items;
    }
    return [root];
}

function isCharacterLike(entry) {
    return isPlainObject(entry)
        && (entry.jsonType === 'character' || 'data' in entry || 'info' in entry || 'stats' in entry);
}

/** A character read from one entry. Returns null (and pushes an error) when `data` is unusable. */
function readCharacter(entry, fileName, key, errors) {
    const envelope = 'data' in entry && !('info' in entry) ? entry : null;
    let raw = envelope ? entry.data : entry;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch (error) {
            errors.push(`${key}: поле data не является JSON (${error.message})`);
            return null;
        }
    }
    if (!isPlainObject(raw)) {
        errors.push(`${key}: нет данных персонажа`);
        return null;
    }

    const { data, warnings } = normalizeCharacter(raw);
    const edition = resolveEdition(envelope?.edition ?? raw.edition, warnings);
    const spells = isPlainObject(envelope?.spells) ? envelope.spells : {};

    return {
        key,
        fileName,
        edition,
        envelope: {
            sheetEdition: envelope?.sheetEdition ? toText(envelope.sheetEdition) : null,
            tags: Array.isArray(envelope?.tags) ? envelope.tags : [],
            spells: {
                mode: toText(spells.mode) || 'cards',
                prepared: stringList(spells.prepared),
                book: stringList(spells.book),
                pending: objectList(spells.pending).map((item) => ({ slug: toText(item.slug), list: toText(item.list) })),
                granted: objectList(spells.granted).map((item) => ({
                    id: toText(item.id),
                    ...(toText(item.source) ? { source: toText(item.source) } : {}),
                })),
                slotless: stringList(spells.slotless),
            },
        },
        data,
        name: toText(data.name.value) || fileName,
        level: data.info.level.value,
        className: toText(data.info.charClass?.value),
        warnings,
    };
}

function resolveEdition(declared, warnings) {
    const value = declared === undefined || declared === null ? '' : String(declared).trim();
    if (value === '2014' || value === '2024') return value;
    warnings.push(value
        ? `неизвестная редакция "${value}", принята ${DEFAULT_EDITION}`
        : `редакция не указана, принята ${DEFAULT_EDITION}`);
    return DEFAULT_EDITION;
}

function stringList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => (isPlainObject(item) ? toText(item.id) : toText(item))).filter(Boolean);
}

function objectList(value) {
    return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

/* -------------------------------------------- */
/*  Normalization                               */
/* -------------------------------------------- */

/**
 * @returns {{ data: object, warnings: string[] }}
 */
function normalizeCharacter(input) {
    // Work on a copy: the normalized object must not share nested objects with the input.
    const src = isPlainObject(input) ? structuredClone(input) : {};
    const warnings = [];

    const unknown = Object.keys(src).filter((key) => !KNOWN_KEYS.has(key) && !QUIET_KEYS.has(key));
    if (unknown.length > 0) warnings.push(`игнорируются неизвестные поля: ${unknown.join(', ')}`);

    const data = {
        jsonType: 'character',
        name: { value: toText(unwrapValue(src.name)) },
        info: normalizeInfo(src.info, warnings),
        subInfo: normalizeSubInfo(src.subInfo),
        spellsInfo: normalizeSpellsInfo(src.spellsInfo),
        spells: normalizeSlots(src.spells, 'spells', warnings),
        spellsPact: normalizeSlots(src.spellsPact, 'spellsPact', warnings),
        bonuses: normalizeBonusList(src.bonuses),
        effects: normalizeEffects(src.effects),
        stats: normalizeStats(src.stats, warnings),
        saves: normalizeSaves(src.saves),
        skills: normalizeSkills(src.skills),
        vitality: normalizeVitality(src.vitality),
        attunementsList: normalizeAttunements(src.attunementsList),
        weaponsList: normalizeWeapons(src.weaponsList, warnings),
        text: normalizeText(src.text, warnings),
        coins: normalizeCoins(src.coins),
        resources: normalizeResources(src.resources),
        conditions: Array.isArray(src.conditions) ? src.conditions.map(toText).filter(Boolean) : [],
        exhaustion: toNumber(unwrapValue(src.exhaustion), 0),
        inspiration: isTrue(unwrapValue(src.inspiration)),
        avatar: normalizeAvatar(src.avatar),
        prof: normalizeProfFlags(src.prof),
    };

    const proficiency = toNumber(unwrapValue(src.proficiency), null);
    if (proficiency !== null) data.proficiency = proficiency;
    const proficiencyCustom = toNumber(unwrapValue(src.proficiencyCustom), null);
    if (proficiencyCustom !== null) data.proficiencyCustom = proficiencyCustom;

    return { data, warnings };
}

function clampLevel(level, warnings) {
    const rounded = Math.floor(level);
    if (rounded >= 1 && rounded <= 20) return rounded;
    const fixed = Math.min(20, Math.max(1, rounded));
    warnings.push(`уровень ${level} вне диапазона 1–20, принят ${fixed}`);
    return fixed;
}

function normalizeInfo(raw, warnings) {
    const info = {};
    for (const [key, field] of Object.entries(isPlainObject(raw) ? raw : {})) {
        const value = unwrapValue(field);
        const base = isPlainObject(field) ? field : {};
        if (key === 'level') {
            info.level = { ...base, name: 'level', value: clampLevel(toNumber(value, 1), warnings) };
        } else if (key === 'experience') {
            info.experience = { ...base, name: 'experience', value: toNumber(value, 0) };
        } else {
            info[key] = { ...base, value: toText(value) };
        }
    }
    if (!info.level) info.level = { name: 'level', value: 1 };
    return info;
}

function normalizeSubInfo(raw) {
    const out = {};
    for (const [key, field] of Object.entries(isPlainObject(raw) ? raw : {})) {
        out[key] = { ...(isPlainObject(field) ? field : {}), value: toText(unwrapValue(field)) };
    }
    return out;
}

function normalizeSpellsInfo(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const out = { ...src };
    if (isPlainObject(src.base)) out.base = { ...src.base, code: toText(src.base.code).toLowerCase() };
    for (const key of ['save', 'mod']) {
        if (!isPlainObject(src[key])) continue;
        out[key] = {
            ...src[key],
            value: toText(src[key].value),
            customModifier: normalizeModifier(src[key].customModifier),
        };
    }
    return out;
}

/** `spells` and `spellsPact`: only `slots-N` keys, with numeric `value` and `filled`. */
function normalizeSlots(raw, label, warnings) {
    const out = {};
    for (const [key, field] of Object.entries(isPlainObject(raw) ? raw : {})) {
        if (!/^slots-[0-9]$/.test(key)) {
            warnings.push(`${label}: ключ "${key}" не похож на круг ячеек и пропущен`);
            continue;
        }
        const slot = isPlainObject(field) ? field : {};
        out[key] = { ...slot, value: toNumber(slot.value, 0), filled: toNumber(slot.filled, 0) };
    }
    return out;
}

function normalizeBonus(bonus) {
    return {
        ...bonus,
        id: toText(bonus.id),
        label: toText(bonus.label),
        target: toText(bonus.target),
        mode: toText(bonus.mode).toLowerCase()
            || (toText(bonus.kind).toLowerCase() === 'override' ? 'set' : 'add'),
        value: toNumber(bonus.value, null),
        expr: toText(bonus.expr) || null,
        disabled: isTrue(bonus.disabled),
        source: {
            ...(isPlainObject(bonus.source) ? bonus.source : {}),
            kind: toText(bonus.source?.kind),
            refId: toText(bonus.source?.refId),
            label: toText(bonus.source?.label),
        },
    };
}

function normalizeBonusList(raw) {
    return (Array.isArray(raw) ? raw : []).filter(isPlainObject).map(normalizeBonus);
}

function normalizeEffects(raw) {
    return (Array.isArray(raw) ? raw : []).filter(isPlainObject).map((effect) => ({
        ...effect,
        id: toText(effect.id),
        name: toText(unwrapValue(effect.name)),
        description: toText(effect.description),
        disabled: isTrue(effect.disabled),
    }));
}

function normalizeStats(raw, warnings) {
    const src = isPlainObject(raw) ? raw : {};
    const keys = [...new Set([...ABILITIES, ...Object.keys(src)])]
        .filter((key) => ABILITIES.includes(key) || isPlainObject(src[key]));
    const out = {};
    const missing = [];
    for (const key of keys) {
        const field = isPlainObject(src[key]) ? src[key] : {};
        const score = toNumber(field.score, null);
        if (score === null) missing.push(key);
        out[key] = {
            ...field,
            name: key,
            score: score ?? 10,
            bonuses: normalizeBonusList(field.bonuses),
        };
    }
    if (missing.length > 0) warnings.push(`нет значения характеристики: ${missing.join(', ')} (взято 10)`);
    return out;
}

function normalizeSaves(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const out = {};
    for (const key of [...new Set([...ABILITIES, ...Object.keys(src)])]) {
        if (!ABILITIES.includes(key) && !isPlainObject(src[key])) continue;
        const field = isPlainObject(src[key]) ? src[key] : {};
        out[key] = {
            ...field,
            name: key,
            isProf: normalizeProficiency(field.isProf),
            bonus: toNumber(field.bonus, 0),
            bonusExpr: toText(field.bonusExpr) || null,
            customModifier: normalizeModifier(field.customModifier),
        };
    }
    return out;
}

function normalizeSkills(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const out = {};
    for (const key of Object.keys(src)) {
        const field = src[key];
        if (!isPlainObject(field)) continue;
        out[key] = {
            ...field,
            name: key,
            baseStat: toText(field.baseStat).toLowerCase(),
            isProf: normalizeProficiency(field.isProf),
            bonus: toNumber(field.bonus, 0),
            bonusExpr: toText(field.bonusExpr) || null,
            customModifier: normalizeModifier(field.customModifier),
            customPassive: toNumber(field.customPassive, null),
        };
    }
    return out;
}

function normalizeVitality(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const out = {};
    for (const key of ['hp-current', 'hp-temp', 'hp-max', 'hp-max-bonus', 'hp-dice-current', 'darkvision']) {
        const number = toNumber(unwrapValue(src[key]), null);
        if (number !== null) out[key] = { value: number };
    }
    if (src['hit-die'] !== undefined) out['hit-die'] = { value: toText(unwrapValue(src['hit-die'])) };
    if (isPlainObject(src['hp-dice-multi'])) out['hp-dice-multi'] = src['hp-dice-multi'];
    if (src.speed !== undefined) out.speed = { value: toText(unwrapValue(src.speed)) };
    if (src.ac !== undefined) out.ac = { value: toText(unwrapValue(src.ac)) };
    if (src.shield !== undefined) {
        const shield = isPlainObject(src.shield) ? src.shield : { value: src.shield };
        out.shield = { ...shield, value: isTrue(shield.value), mod: toText(shield.mod) };
    }
    if (src.initiative !== undefined) {
        const value = unwrapValue(src.initiative);
        out.initiative = { value: value === null ? null : toText(value) || null };
    }
    if (src.isDying !== undefined) out.isDying = isTrue(src.isDying);
    for (const key of ['deathFails', 'deathSuccesses']) {
        const number = toNumber(unwrapValue(src[key]), null);
        if (number !== null) out[key] = number;
    }
    return out;
}

function normalizeAttunements(raw) {
    return (Array.isArray(raw) ? raw : []).filter(isPlainObject).map((slot) => ({
        ...slot,
        id: toText(slot.id),
        checked: isTrue(slot.checked),
        value: toText(unwrapValue(slot.value)),
    }));
}

/** Weapons; `modCustom` is migrated into `modBonus` (docs/research/lss-character-format.md §2.13). */
function normalizeWeapons(raw, warnings) {
    return (Array.isArray(raw) ? raw : []).filter(isPlainObject).map((weapon, index) => {
        const id = toText(weapon.id);
        if (!id) warnings.push(`оружие #${index + 1} без id, id сгенерирован`);
        const modBonus = toNumber(unwrapValue(weapon.modBonus), null);
        const modCustom = toNumber(unwrapValue(weapon.modCustom), null);
        return {
            id: id || `weapon-${index + 1}`,
            name: { value: toText(unwrapValue(weapon.name)) },
            dmg: { value: toText(unwrapValue(weapon.dmg)) },
            ability: toText(weapon.ability).toLowerCase() || 'none',
            isProf: normalizeProficiency(weapon.isProf) > 0,
            dmgType: { value: toText(unwrapValue(weapon.dmgType)) },
            notes: { value: toText(unwrapValue(weapon.notes)) },
            notesVisibility: isTrue(weapon.notesVisibility),
            modBonus: { value: modBonus ?? modCustom },
        };
    });
}

/**
 * Text blocks. The `value.id` leak of elfrey-lss-converter is dropped: only `value.data` is kept.
 */
function normalizeText(raw, warnings) {
    const out = {};
    for (const [key, block] of Object.entries(isPlainObject(raw) ? raw : {})) {
        if (!isPlainObject(block)) {
            warnings.push(`блок текста "${key}" пропущен: неверная форма`);
            continue;
        }
        const value = isPlainObject(block.value) ? block.value : {};
        let doc = value.data ?? (value.type === 'doc' ? value : undefined);
        if (typeof doc === 'string') {
            try {
                doc = JSON.parse(doc);
            } catch {
                doc = undefined;
            }
        }
        out[key] = {
            ...block,
            value: { data: isPlainObject(doc) ? doc : { type: 'doc', content: [] } },
        };
    }
    return out;
}

function normalizeCoins(raw) {
    const out = {};
    const src = isPlainObject(raw) ? raw : {};
    for (const key of COINS) {
        if (src[key] === undefined) continue;
        const number = toNumber(unwrapValue(src[key]), null);
        if (number !== null) out[key] = { value: number };
    }
    return out;
}

function normalizeResources(raw) {
    const out = {};
    for (const [key, field] of Object.entries(isPlainObject(raw) ? raw : {})) {
        if (!isPlainObject(field)) continue;
        out[key] = {
            ...field,
            id: toText(field.id) || key,
            name: toText(unwrapValue(field.name)),
            current: toNumber(field.current, 0),
            max: toNumber(field.max, null),
            maxExpr: toText(field.maxExpr) || null,
            shortRestRegain: toText(field.shortRestRegain) || null,
            isShortRest: isTrue(field.isShortRest),
            isLongRest: isTrue(field.isLongRest),
        };
    }
    return out;
}

function normalizeAvatar(raw) {
    if (typeof raw === 'string') return raw ? { jpeg: raw, webp: raw } : null;
    if (!isPlainObject(raw)) return null;
    const avatar = { jpeg: toText(raw.jpeg), webp: toText(raw.webp) };
    return avatar.jpeg || avatar.webp ? avatar : null;
}

function normalizeProfFlags(raw) {
    const out = {};
    for (const [key, field] of Object.entries(isPlainObject(raw) ? raw : {})) {
        out[key] = { value: isTrue(unwrapValue(field)) };
    }
    return out;
}
