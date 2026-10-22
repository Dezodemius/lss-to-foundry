/**
 * Spell references of an LSS character → SRD spells or custom spells (docs/DESIGN.md §4.1, §5.6).
 *
 * An LSS character stores spells as references, not as texts. A reference is one of:
 * a 24-hex LSS id, an LSS slug (`cure-wounds`), an English name (`Cure Wounds`) or
 * `Русское [English]`. References found in the SRD index of the character's edition are SRD
 * spells; the others are custom (they live in the player's Grimoire, see grimoire.mjs).
 */

import { ABILITIES } from './lss-keys.mjs';
import { normalizeName } from './ids.mjs';
import { DEFAULT_EDITION } from '../constants.mjs';

/**
 * LSS slug (2014 dataset) → dnd5e 5.1.8 `spells` identifier, for slugs that differ.
 * In the 2024 dataset these spells already use the dnd5e identifier.
 * Source: docs/research/lss-character-format.md §4.3, docs/CONTEXT.md.
 */
export const IDENTIFIER_ALIASES = Object.freeze({
    'antipathy-or-sympathy': 'antipathy-sympathy',
    'blindness-or-deafness': 'blindness-deafness',
    'enlarge-or-reduce': 'enlarge-reduce',
});

/** Reverse of {@link IDENTIFIER_ALIASES}: dnd5e identifier → LSS slug. */
const ALIAS_BY_IDENTIFIER = Object.freeze(
    Object.fromEntries(Object.entries(IDENTIFIER_ALIASES).map(([slug, identifier]) => [identifier, slug])),
);

/**
 * Candidate identifiers in dnd5e 5.1.8 for an SRD slug, in the order they should be tried.
 * For the 2014 edition the alias comes first: `blindness-or-deafness` → [`blindness-deafness`, `blindness-or-deafness`].
 * @param {string|null} slug  LSS slug of an SRD spell
 * @param {string} edition    edition of the SRD dataset the slug comes from ('2014' or '2024')
 * @returns {string[]}
 */
export function identifierCandidates(slug, edition) {
    const key = String(slug ?? '').trim();
    if (!key) return [];
    if (edition === '2014' && Object.hasOwn(IDENTIFIER_ALIASES, key)) {
        const alias = IDENTIFIER_ALIASES[key];
        return alias === key ? [key] : [alias, key];
    }
    return [key];
}

/**
 * Slugify an English name the way LSS does: lower case, every run of non-letters/digits becomes one hyphen.
 * @param {string} text
 * @returns {string} empty string when nothing latin is left
 */
export function slugify(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const HEX_ID = /^[0-9a-f]{24}$/i;
const BRACKETED = /^(.*?)\s*\[([^\[\]]+)\]\s*$/;
const LOWER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;

/**
 * Parse one spell reference. Only the English part of `Русское [English]` is used; the Russian part is kept as `name`.
 * @param {string} text
 * @returns {{ lssId: string|null, slug: string|null, englishName: string|null, name: string|null }|null} null for empty text
 */
export function parseSpellReference(text) {
    const value = String(text ?? '').trim();
    if (!value) return null;
    if (HEX_ID.test(value)) return { lssId: value.toLowerCase(), slug: null, englishName: null, name: null };

    const bracketed = value.match(BRACKETED);
    if (bracketed && LATIN.test(bracketed[2])) {
        const englishName = bracketed[2].trim();
        return {
            lssId: null,
            slug: slugify(englishName) || null,
            englishName,
            name: bracketed[1].trim() || null,
        };
    }
    if (LOWER_SLUG.test(value)) return { lssId: null, slug: value, englishName: null, name: null };
    if (LATIN.test(value) && !CYRILLIC.test(value)) {
        return { lssId: null, slug: slugify(value) || null, englishName: value, name: null };
    }
    return { lssId: null, slug: null, englishName: null, name: value };
}

/**
 * @typedef {object} SpellIndexEdition
 * @property {{ id: string, slug: string, englishName: string, level: number, classes: string[] }[]} entries
 * @property {Map<string, object>} byId     lower-case LSS id → entry
 * @property {Map<string, object>} bySlug   LSS slug → entry
 * @property {Map<string, object>} byName   slugified English name → entry
 */

/**
 * Index one SRD dataset.
 * @param {unknown} entries  records of data/srd-spell-index-<edition>.json
 * @returns {SpellIndexEdition}
 */
function buildEdition(entries) {
    const list = [];
    const byId = new Map();
    const bySlug = new Map();
    const byName = new Map();
    for (const raw of Array.isArray(entries) ? entries : []) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.slug !== 'string') continue;
        const entry = {
            id: raw.id.toLowerCase(),
            slug: raw.slug,
            englishName: typeof raw.englishName === 'string' ? raw.englishName : null,
            level: Number.isInteger(raw.level) ? raw.level : null,
            classes: Array.isArray(raw.classes) ? [...raw.classes] : [],
        };
        list.push(entry);
        if (!byId.has(entry.id)) byId.set(entry.id, entry);
        if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry);
        const nameSlug = slugify(entry.englishName);
        if (nameSlug && !byName.has(nameSlug)) byName.set(nameSlug, entry);
    }
    return { entries: list, byId, bySlug, byName };
}

/**
 * Build the SRD index used by {@link resolveSpellRefs}.
 * @param {object[]} entries2014  records of data/srd-spell-index-2014.json
 * @param {object[]} entries2024  records of data/srd-spell-index-2024.json
 * @returns {{ 2014: SpellIndexEdition, 2024: SpellIndexEdition }}
 */
export function createSpellIndex(entries2014, entries2024) {
    return { 2014: buildEdition(entries2014), 2024: buildEdition(entries2024) };
}

/**
 * Find an SRD entry by parsed reference inside one edition of the index.
 * @param {{ 2014: SpellIndexEdition, 2024: SpellIndexEdition }} index
 * @param {string} side  edition whose index is searched
 * @param {{ lssId: string|null, slug: string|null, englishName: string|null }} parsed
 * @returns {object|null}
 */
function lookupSrd(index, side, parsed) {
    const edition = index?.[side];
    if (!edition) return null;
    if (parsed.lssId) {
        const hit = edition.byId.get(parsed.lssId);
        if (hit) return hit;
    }
    if (!parsed.slug) return null;
    for (const slug of slugCandidates(parsed.slug, side)) {
        const hit = edition.bySlug.get(slug) ?? edition.byName.get(slug);
        if (hit) return hit;
    }
    return null;
}

/**
 * Slugs under which a reference may be stored in one SRD dataset.
 * The 2014 dataset uses `antipathy-or-sympathy`; 2024 and dnd5e use `antipathy-sympathy`. Both are tried.
 * @param {string} slug
 * @param {string} side  '2014' or '2024'
 * @returns {string[]}
 */
function slugCandidates(slug, side) {
    if (side === '2014' && Object.hasOwn(ALIAS_BY_IDENTIFIER, slug)) return [slug, ALIAS_BY_IDENTIFIER[slug]];
    if (side === '2024' && Object.hasOwn(IDENTIFIER_ALIASES, slug)) return [slug, IDENTIFIER_ALIASES[slug]];
    return [slug];
}

/**
 * Resolve a parsed reference: the character's edition first, then the other edition with a warning.
 * @returns {{ kind: 'srd'|'custom', lssId: string|null, slug: string|null, englishName: string|null,
 *   name: string|null, level: number|null, edition: string, crossEdition: boolean }}
 */
function resolveOne(parsed, edition, index) {
    const other = edition === '2014' ? '2024' : '2014';
    for (const side of [edition, other]) {
        const hit = lookupSrd(index, side, parsed);
        if (hit) {
            return {
                kind: 'srd',
                lssId: hit.id,
                slug: hit.slug,
                englishName: hit.englishName,
                name: null,
                level: hit.level,
                edition: side,
                crossEdition: side !== edition,
            };
        }
    }
    return {
        kind: 'custom',
        lssId: parsed.lssId,
        slug: parsed.slug,
        englishName: parsed.englishName,
        name: parsed.name,
        level: null,
        edition,
        crossEdition: false,
    };
}

/** Keys that make two references the same spell. SRD spells are compared by dnd5e identifier, so aliases merge. */
function identityKeys(resolved) {
    const keys = [];
    if (resolved.slug) {
        const identifier = Object.hasOwn(IDENTIFIER_ALIASES, resolved.slug) ? IDENTIFIER_ALIASES[resolved.slug] : resolved.slug;
        keys.push(`slug:${identifier}`);
    }
    if (resolved.lssId) keys.push(`id:${resolved.lssId}`);
    if (resolved.kind === 'custom' && resolved.name) keys.push(`name:${normalizeName(resolved.name)}`);
    return keys;
}

/**
 * @typedef {object} SpellRef
 * @property {string} ref                      first form of the reference as written in the file
 * @property {'srd'|'custom'} kind
 * @property {string|null} lssId               24-hex LSS id (lower case) when known
 * @property {string|null} slug                LSS slug when known
 * @property {string|null} englishName         English name when known
 * @property {string|null} name                Russian (or other) name of a custom spell
 * @property {number|null} level               SRD level; null for custom spells
 * @property {'2014'|'2024'} edition           SRD edition for srd; the character's edition for custom
 * @property {('prepared'|'book'|'granted')[]} lists
 * @property {boolean} slotless                spell cannot be paid with a slot
 * @property {string|null} ability             spellcasting ability key (`str`…`cha`) from spellsInfo.abilities
 * @property {string|null} chargeResourceId    resource that pays for the spell, from spellsInfo.charges
 */

/**
 * Resolve every spell reference of a character. One SpellRef per spell: lists are merged.
 * @param {object} char   LssCharacter (docs/DESIGN.md §5.1)
 * @param {{ 2014: SpellIndexEdition, 2024: SpellIndexEdition }} index  from {@link createSpellIndex}
 * @returns {{ refs: SpellRef[], warnings: string[] }}
 */
export function resolveSpellRefs(char, index) {
    const warnings = [];
    const source = char && typeof char === 'object' ? char : {};
    const edition = normalizeEdition(source.edition, warnings);
    const spells = source.envelope?.spells ?? {};
    const info = source.data?.spellsInfo ?? {};
    const abilities = info.abilities && typeof info.abilities === 'object' ? info.abilities : {};
    const charges = info.charges && typeof info.charges === 'object' ? info.charges : {};
    const slotless = new Set(toArray(spells.slotless).map((id) => String(id).trim().toLowerCase()));

    // Order: the lists as the file has them, then the references the server could not resolve.
    const entries = [
        ...toArray(spells.prepared).map((raw) => ({ raw, list: 'prepared' })),
        ...toArray(spells.book).map((raw) => ({ raw, list: 'book' })),
        ...toArray(spells.granted).map((item) => ({ raw: typeof item === 'string' ? item : item?.id, list: 'granted' })),
        ...toArray(spells.pending).map((item) => ({
            raw: typeof item === 'string' ? item : item?.slug,
            list: item?.list === 'book' ? 'book' : 'prepared',
        })),
    ];

    const groups = [];
    for (const { raw, list } of entries) {
        const text = typeof raw === 'string' ? raw.trim() : '';
        const parsed = parseSpellReference(text);
        if (!parsed) {
            warnings.push(`empty or invalid spell reference: ${JSON.stringify(raw ?? null)}`);
            continue;
        }
        const resolved = resolveOne(parsed, edition, index);
        if (resolved.crossEdition) {
            warnings.push(`spell "${text}" is in the SRD ${resolved.edition} dataset, but the character is ${edition}`);
        }
        const keys = identityKeys(resolved);
        let group = groups.find((g) => keys.some((key) => g.keys.has(key)));
        if (!group) {
            group = { ref: text, identity: resolved, keys: new Set(), lists: [], ids: new Set(), raws: new Set() };
            groups.push(group);
        } else if (group.identity.kind === 'srd' && resolved.kind === 'srd'
            && group.identity.edition !== edition && resolved.edition === edition) {
            // Prefer the character's own edition when the same spell was referenced from both.
            group.identity = resolved;
        }
        keys.forEach((key) => group.keys.add(key));
        if (!group.lists.includes(list)) group.lists.push(list);
        if (resolved.lssId) group.ids.add(resolved.lssId);
        if (HEX_ID.test(text)) group.ids.add(text.toLowerCase());
        if (resolved.slug) group.raws.add(resolved.slug);
        group.raws.add(text.toLowerCase());
    }

    const refs = groups.map((group) => finalizeRef(group, { abilities, charges, slotless, warnings }));
    return { refs, warnings };
}

/**
 * Turn a merged group into a SpellRef.
 * @param {object} group
 * @param {{ abilities: object, charges: object, slotless: Set<string>, warnings: string[] }} context
 * @returns {SpellRef}
 */
function finalizeRef(group, { abilities, charges, slotless, warnings }) {
    const { identity } = group;
    let ability = null;
    let chargeResourceId = null;
    for (const id of group.ids) {
        if (ability === null && Object.hasOwn(abilities, id)) {
            const key = String(abilities[id] ?? '').trim().toLowerCase();
            if (ABILITIES.includes(key)) ability = key;
            else warnings.push(`unknown spellcasting ability "${abilities[id]}" for spell ${id}`);
        }
        if (chargeResourceId === null && Object.hasOwn(charges, id)) {
            const resource = String(charges[id] ?? '').trim();
            if (resource) chargeResourceId = resource;
        }
    }
    const isSlotless = [...group.ids, ...group.raws].some((key) => slotless.has(key));
    return {
        ref: group.ref,
        kind: identity.kind,
        lssId: identity.lssId,
        slug: identity.slug,
        englishName: identity.englishName,
        name: identity.name,
        level: identity.level,
        edition: identity.edition,
        lists: [...group.lists],
        slotless: isSlotless,
        ability,
        chargeResourceId,
    };
}

/** @returns {unknown[]} */
function toArray(value) {
    return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @param {string[]} warnings
 * @returns {'2014'|'2024'}
 */
function normalizeEdition(value, warnings) {
    const text = String(value ?? '').trim();
    if (text === '2014' || text === '2024') return text;
    if (text) warnings.push(`unknown edition "${text}", using ${DEFAULT_EDITION}`);
    return DEFAULT_EDITION;
}
