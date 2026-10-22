/**
 * Custom spells from the player's Grimoire (docs/DESIGN.md §4.1, §5.6).
 *
 * The export format of the Grimoire is not published. The documentation only says it is "based on the
 * Foundry format" (Guildhall docs/spells/addition.mdx), so every field is read defensively: a Foundry item
 * (type 'spell') is used as it is, and any other record becomes a minimal spell built from what it has.
 */

import { FLAG_SCOPE, FLAGS } from '../constants.mjs';
import { normalizeName } from './ids.mjs';
import { parseSpellReference, slugify } from './spell-refs.mjs';

/** @typedef {object} GrimoireSpell
 *  @property {string|null} lssId   24-hex LSS id (lower case) when the record carries one
 *  @property {string|null} slug    LSS slug: system.identifier, slug field or English name
 *  @property {string} name         name as written in the Grimoire
 *  @property {object|null} item    cleaned Foundry item source, or null when the record is not a Foundry item
 *  @property {object} raw          the record as it was read
 */

const HEX_ID = /^[0-9a-f]{24}$/i;
const BRACKETED_ENGLISH = /\[([^\[\]]+)\]\s*$/;
const LATIN = /[A-Za-z]/;
const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether a value looks like a spell record. A typed record must be a spell; an untyped one needs a name
 * and a spell-like field (slug, level or system).
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksLikeSpell(value) {
    if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim()) return false;
    if (typeof value.type === 'string') return value.type === 'spell';
    return typeof value.slug === 'string' || typeof value.level === 'number' || isObject(value.system);
}

/**
 * Find the LSS id of a record: `_id` or `id` if it is 24-hex, then the module flag, then any 24-hex value in `flags`.
 * @param {Record<string, any>} entry
 * @returns {string|null} lower-case id
 */
function extractLssId(entry) {
    for (const candidate of [entry._id, entry.id]) {
        if (typeof candidate === 'string' && HEX_ID.test(candidate)) return candidate.toLowerCase();
    }
    const flags = isObject(entry.flags) ? entry.flags : {};
    const own = isObject(flags[FLAG_SCOPE]) ? flags[FLAG_SCOPE] : {};
    for (const key of [FLAGS.lssSpellId, FLAGS.lssId, 'id']) {
        if (typeof own[key] === 'string' && HEX_ID.test(own[key])) return own[key].toLowerCase();
    }
    const scopes = Object.values(flags).filter(isObject);
    for (const scope of scopes) {
        for (const [key, value] of Object.entries(scope)) {
            if (/id$/i.test(key) && typeof value === 'string' && HEX_ID.test(value)) return value.toLowerCase();
        }
    }
    for (const scope of scopes) {
        for (const value of Object.values(scope)) {
            if (typeof value === 'string' && HEX_ID.test(value)) return value.toLowerCase();
        }
    }
    return null;
}

/**
 * English name of a record: the bracketed part of `Русское [English]`, or the whole name when it is Latin.
 * @param {string} name
 * @returns {string|null}
 */
function englishNameOf(name) {
    const bracketed = name.match(BRACKETED_ENGLISH);
    if (bracketed && LATIN.test(bracketed[1])) return bracketed[1].trim();
    if (LATIN.test(name) && !CYRILLIC.test(name)) return name.trim();
    return null;
}

/**
 * LSS slug of a record: `system.identifier`, then `slug`, then the slugified English name.
 * @param {Record<string, any>} entry
 * @param {string|null} englishName
 * @returns {string|null}
 */
function slugOf(entry, englishName) {
    const identifier = isObject(entry.system) ? entry.system.identifier : undefined;
    for (const candidate of [identifier, entry.slug]) {
        if (typeof candidate === 'string' && slugify(candidate)) return slugify(candidate);
    }
    return englishName ? slugify(englishName) || null : null;
}

/**
 * Copy of a Foundry item prepared for creation: no document ids, folder, ownership, sort or stats,
 * and no `core` flags. Effects keep their content but lose `_id`. `system` (including activities) is not touched.
 * @param {Record<string, any>} entry
 * @returns {Record<string, any>}
 */
function cleanItem(entry) {
    const item = structuredClone(entry);
    for (const key of ['_id', 'folder', 'ownership', 'sort', '_stats']) delete item[key];
    if (isObject(item.flags)) delete item.flags.core;
    if (Array.isArray(item.effects)) {
        item.effects = item.effects.map((effect) => {
            if (!isObject(effect)) return effect;
            const { _id, ...rest } = effect;
            return rest;
        });
    }
    return item;
}

/**
 * Text of a minimal spell: `description` as a string or `{ value }`, `system.description.value`, or `text`.
 * @param {Record<string, any>} raw
 * @returns {string}
 */
function textOf(raw) {
    const candidates = [
        raw.description,
        raw.description?.value,
        raw.system?.description?.value,
        raw.text,
    ];
    const found = candidates.find((value) => typeof value === 'string');
    return found ?? '';
}

/**
 * Accept an array, an object with `items` / `spells` / `entries`, or a single record.
 * @param {unknown} list
 * @returns {unknown[]}
 */
function unwrapList(list) {
    if (Array.isArray(list)) return list;
    if (isObject(list)) {
        for (const key of ['items', 'spells', 'entries']) {
            if (Array.isArray(list[key])) return list[key];
        }
        return [list];
    }
    return [];
}

/**
 * Read the Grimoire export. Records that do not look like spells are skipped without an error.
 * @param {unknown} list  array, `{ items }` object or single record
 * @returns {GrimoireSpell[]}
 */
export function parseGrimoireEntries(list) {
    const spells = [];
    for (const raw of unwrapList(list)) {
        if (!looksLikeSpell(raw)) continue;
        const name = raw.name.trim();
        const englishName = englishNameOf(name);
        spells.push({
            lssId: extractLssId(raw),
            slug: slugOf(raw, englishName),
            name,
            item: raw.type === 'spell' ? cleanItem(raw) : null,
            raw,
        });
    }
    return spells;
}

/**
 * Key that identifies a Grimoire spell, used for the world-item deduplication.
 * @param {Pick<GrimoireSpell, 'lssId'|'slug'|'name'>} spell
 * @returns {string} `id:<lssId>`, `slug:<slug>`, or `name:<normalized name>` when neither is known
 */
export function grimoireKey(spell) {
    if (spell?.lssId) return `id:${spell.lssId}`;
    if (spell?.slug) return `slug:${spell.slug}`;
    return `name:${normalizeName(spell?.name)}`;
}

/** Russian part of a Grimoire name: `Кислотная стрела [Acid Arrow]` → `Кислотная стрела`. */
function russianPart(name) {
    return normalizeName(String(name ?? '').replace(BRACKETED_ENGLISH, ''));
}

/**
 * Find the Grimoire spell for a reference: by LSS id, then by slug (or English name), then by name.
 * @param {import('./spell-refs.mjs').SpellRef|string|null} ref  a SpellRef, or a raw reference string
 * @param {GrimoireSpell[]} grimoire  result of {@link parseGrimoireEntries}
 * @returns {GrimoireSpell|null}
 */
export function findGrimoireSpell(ref, grimoire) {
    if (!ref || !Array.isArray(grimoire)) return null;
    const target = typeof ref === 'string' ? parseSpellReference(ref) : ref;
    if (!target) return null;

    const lssId = typeof target.lssId === 'string' ? target.lssId.toLowerCase() : null;
    if (lssId) {
        const hit = grimoire.find((spell) => spell.lssId === lssId);
        if (hit) return hit;
    }
    const slugs = [target.slug, target.englishName ? slugify(target.englishName) : null].filter(Boolean);
    for (const slug of slugs) {
        const hit = grimoire.find((spell) => spell.slug === slug);
        if (hit) return hit;
    }
    const name = normalizeName(target.name);
    if (name) {
        return grimoire.find((spell) => normalizeName(spell.name) === name || russianPart(spell.name) === name) ?? null;
    }
    return null;
}

/**
 * Item source for a Grimoire spell, ready to be created in the world or on an actor.
 * Foundry items are copied and cleaned; other records become a minimal spell from what they have.
 * The module flags (`imported`, `lssSpellId`) are set. `ctx` is accepted for the agreed signature and is not
 * needed: activities of a Foundry item are copied as they are.
 * @param {GrimoireSpell} spell
 * @param {object} [ctx]
 * @returns {Record<string, any>} ItemSource with `type: 'spell'`
 */
export function spellItemFromGrimoire(spell, ctx = {}) {
    const item = spell.item
        ? cleanItem(spell.item)
        : {
            name: spell.name,
            type: 'spell',
            system: {
                level: Number.isInteger(spell.raw?.level) ? spell.raw.level : (spell.raw?.system?.level ?? 0),
                description: { value: textOf(spell.raw ?? {}) },
            },
        };
    item.name = spell.name;
    item.type = 'spell';
    const lssSpellId = spell.lssId ?? spell.slug ?? null;
    const flags = isObject(item.flags) ? item.flags : {};
    const scope = isObject(flags[FLAG_SCOPE]) ? flags[FLAG_SCOPE] : {};
    item.flags = {
        ...flags,
        [FLAG_SCOPE]: {
            ...scope,
            [FLAGS.imported]: true,
            ...(lssSpellId ? { [FLAGS.lssSpellId]: lssSpellId } : {}),
        },
    };
    return item;
}
