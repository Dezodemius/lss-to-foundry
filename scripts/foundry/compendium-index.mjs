/**
 * Identifier index over dnd5e compendiums, built once per import.
 *
 * Lookups go by `system.identifier` (the English slug), never by name: Babele translates `name`
 * in indexes, but `identifier` stays as it is (docs/research/foundry-module-dev.md §8.3).
 * Identifiers repeat inside `dnd5e.classes24` (features of different classes share slugs),
 * so every lookup can be narrowed by document type and by a list of packs in priority order.
 */

import { PACKS } from '../constants.mjs';

/**
 * @typedef {object} IndexEntry
 * @property {string} packId      Compendium id, e.g. `dnd5e.spells24`
 * @property {string} _id         Document id inside the pack
 * @property {string} uuid        `Compendium.<pack>.Item.<id>`
 * @property {string} name        Name as the index has it (translated by Babele when active)
 * @property {string} type        Document type: `class`, `subclass`, `race`, `spell`, …
 * @property {string} identifier  `system.identifier`, the English slug
 */

/**
 * Pick the first entry that matches the optional type filter.
 * Without `packIds`, the entries keep the order they were indexed in (pack order).
 * With `packIds`, packs are tried in that order and the first match wins.
 * Pure helper: no Foundry globals.
 * @param {IndexEntry[]} entries          Entries that share one identifier
 * @param {object} [options]
 * @param {string[]|null} [options.types]     Allowed document types, `null` for any
 * @param {string[]|null} [options.packIds]   Packs to search, in priority order
 * @returns {IndexEntry|null}
 */
export function pickEntry(entries, { types = null, packIds = null } = {}) {
    const typeMatches = (entry) => !types || types.includes(entry.type);
    if (!packIds) return entries.find(typeMatches) ?? null;
    for (const packId of packIds) {
        const hit = entries.find((entry) => entry.packId === packId && typeMatches(entry));
        if (hit) return hit;
    }
    return null;
}

/**
 * Group raw index rows by identifier. Rows without an identifier are dropped.
 * Pure helper: no Foundry globals.
 * @param {{ packId: string, rows: object[] }[]} packs  Index rows per pack, in pack order
 * @returns {Map<string, IndexEntry[]>}
 */
export function groupByIdentifier(packs) {
    const grouped = new Map();
    for (const { packId, rows } of packs) {
        for (const row of rows) {
            const identifier = row?.system?.identifier ?? row?.['system.identifier'] ?? '';
            if (!identifier) continue;
            const entry = {
                packId,
                _id: row._id,
                uuid: row.uuid,
                name: row.name ?? '',
                type: row.type ?? '',
                identifier,
            };
            if (!grouped.has(identifier)) grouped.set(identifier, []);
            grouped.get(identifier).push(entry);
        }
    }
    return grouped;
}

/**
 * Every pack id that dnd5e 5.1.8 uses for a character of the given edition (`PACKS` in constants).
 * @param {'2014'|'2024'} edition
 * @returns {string[]}
 */
export function packIdsFor(edition) {
    const byType = PACKS[edition] ?? {};
    return [...new Set(Object.values(byType).flat())];
}

/**
 * Every pack id needed by the importer: both editions plus the user's extra spell packs.
 * @param {string[]} [extraSpellPacks]
 * @returns {string[]}
 */
export function allPackIds(extraSpellPacks = []) {
    return [...new Set([...packIdsFor('2014'), ...packIdsFor('2024'), ...extraSpellPacks])];
}

/**
 * Plain reference returned to callers. It carries no Document, so it is cheap to pass around.
 * @param {IndexEntry} entry
 * @returns {IndexEntry}
 */
function toReference(entry) {
    return {
        uuid: entry.uuid,
        packId: entry.packId,
        _id: entry._id,
        name: entry.name,
        type: entry.type,
        identifier: entry.identifier,
    };
}

/**
 * Identifier index with a per-import cache of source data.
 * Create it once per import (`CompendiumIndex.build`) and pass it to every character.
 */
export class CompendiumIndex {
    /** @type {Map<string, IndexEntry[]>} */
    #byIdentifier = new Map();

    /** @type {string[]} Pack ids that were indexed, in the order they were requested */
    #order = [];

    /** @type {Map<string, CompendiumCollection>} */
    #packs = new Map();

    /** @type {Map<string, object>} Source data by uuid, `toObject()` without `flags.babele` */
    #sources = new Map();

    /** @type {string[]} Messages for the import report (missing packs) */
    #warnings = [];

    /** Messages collected while building the index, e.g. packs that are not installed. */
    get warnings() {
        return [...this.#warnings];
    }

    /** Pack ids that were indexed successfully, in request order. */
    get packIds() {
        return [...this.#order];
    }

    /**
     * Index the given compendiums. Missing packs are skipped with a warning, never an error.
     * @param {string[]} packIds  Pack ids in priority order
     * @returns {Promise<CompendiumIndex>}
     */
    static async build(packIds) {
        const index = new CompendiumIndex();
        const unique = [...new Set((packIds ?? []).filter(Boolean))];
        const packs = [];

        for (const packId of unique) {
            const pack = game.packs?.get(packId);
            if (!pack) {
                const message = `Компендиум ${packId} не найден и пропущен.`;
                index.#warnings.push(message);
                console.warn(`lss-to-foundry | ${message}`);
                continue;
            }
            // `fields` makes the server project `system.identifier` into every index row (nested form).
            // VERIFY IN FOUNDRY: the nested projection `row.system.identifier` on a live pack (not checked, see research §7.1).
            const collection = await pack.getIndex({ fields: ['system.identifier', 'type'] });
            index.#packs.set(packId, pack);
            index.#order.push(packId);
            const rows = [...collection.values()].map((row) => ({
                ...row,
                uuid: row.uuid ?? pack.getUuid(row._id),
            }));
            packs.push({ packId, rows });
        }

        index.#byIdentifier = groupByIdentifier(packs);
        return index;
    }

    /**
     * Find the first document with this identifier.
     * @param {string} identifier  `system.identifier`, e.g. `cure-wounds`
     * @param {object} [options]
     * @param {string[]|null} [options.types]     Allowed document types, e.g. `['spell']`
     * @param {string[]|null} [options.packIds]   Packs to search, in priority order (default: build order)
     * @returns {{ uuid: string, packId: string, _id: string, name: string, type: string, identifier: string }|null}
     */
    findByIdentifier(identifier, { types = null, packIds = null } = {}) {
        const entries = this.#byIdentifier.get(identifier) ?? [];
        const hit = pickEntry(entries, { types, packIds });
        return hit ? toReference(hit) : null;
    }

    /**
     * The Document behind an index reference. Babele translation applies here, as in any `pack.getDocument`.
     * @param {{ packId: string, _id: string }} reference
     * @returns {Promise<Document|null>}
     */
    async getDocument(reference) {
        const pack = this.#packs.get(reference.packId);
        if (!pack) return null;
        return (await pack.getDocument(reference._id)) ?? null;
    }

    /**
     * Source data of the document (`toObject()`), without `flags.babele`.
     * The result is cached for the whole import; every call returns a fresh deep copy.
     * @param {{ uuid: string, packId: string, _id: string }} reference
     * @returns {Promise<object|null>}
     */
    async getSource(reference) {
        if (!this.#sources.has(reference.uuid)) {
            const doc = await this.getDocument(reference);
            if (!doc) return null;
            const source = doc.toObject();
            // Babele adds `flags.babele` to translated documents; it must not reach the actor (research §8.6).
            // VERIFY IN FOUNDRY: that the translated name and description arrive through getDocument on a live world.
            if (source.flags) delete source.flags.babele;
            this.#sources.set(reference.uuid, source);
        }
        return foundry.utils.deepClone(this.#sources.get(reference.uuid));
    }
}
