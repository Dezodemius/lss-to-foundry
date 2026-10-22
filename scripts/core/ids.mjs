/**
 * Maps LSS classes, subclasses, races, backgrounds and feats to dnd5e 5.1.8 identifiers.
 *
 * The mapping table is data/lss-dnd5e-ids.json (see docs/DESIGN.md §4.2). It is passed to
 * {@link createIdMapper} by the caller, so this module does no I/O and runs both in Foundry
 * (where the table is fetched) and in Vitest (where it is read with node:fs).
 *
 * Lookup order for every category: LSS id within the given rules edition, then the name
 * (English, Russian label or identifier), compared case-insensitively with ё and е equal.
 * Entries with `identifier: null` are real matches that have no dnd5e item; mappers return null
 * for them, and {@link IdMapper.describeRace} explains why.
 */

/**
 * Normalize a name for comparison: lower case, ё → е, collapsed whitespace.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeName(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Find an entry by its id field, then by name. Returns null when nothing matches.
 * @param {object[]} list
 * @param {{ idField: string, id: unknown, names: unknown[], nameFields: string[], filter?: (e: object) => boolean }} query
 * @returns {object|null}
 */
function matchEntry(list, { idField, id, names, nameFields, filter = () => true }) {
    const pool = list.filter(filter);
    const wanted = id == null ? '' : String(id).trim();
    if (wanted) {
        const byId = pool.find((entry) => entry[idField] === wanted);
        if (byId) return byId;
    }
    for (const name of names) {
        const key = normalizeName(name);
        if (!key) continue;
        const byName = pool.find((entry) => nameFields.some((field) => normalizeName(entry[field]) === key));
        if (byName) return byName;
    }
    return null;
}

/**
 * Build the mappers for one mapping table.
 * @param {object} table  Parsed data/lss-dnd5e-ids.json: `{ "2014": { classes, subclasses, races, backgrounds, feats }, "2024": {...} }`.
 * @returns {{
 *   mapClass: (lssClassId: string|null, className?: string|null, edition: string) => string|null,
 *   mapSubclass: (lssSubclassId: string|null, subclassName: string|null, classIdentifier: string|null, edition: string) => string|null,
 *   mapRace: (lssRaceId: string|null, raceName: string|null, lssSubraceId: string|null, subraceName: string|null, edition: string) => string|null,
 *   describeRace: (lssRaceId: string|null, raceName: string|null, lssSubraceId: string|null, subraceName: string|null, edition: string) => { identifier: string|null, warnings: string[] },
 *   mapBackground: (lssBackgroundId: string|null, name: string|null, edition: string) => string|null,
 *   mapFeat: (lssFeatId: string|null, name: string|null, edition: string) => string|null,
 * }}
 */
export function createIdMapper(table) {
    const data = table && typeof table === 'object' ? table : {};

    /** @returns {Record<string, object[]>|null} the category lists of one edition */
    const section = (edition) => {
        const found = data[String(edition)];
        return found && typeof found === 'object' ? found : null;
    };

    /**
     * Shared lookup for classes, subclasses, backgrounds and feats.
     * @param {string} category
     * @param {unknown} lssId
     * @param {unknown[]} names
     * @param {string} edition
     * @param {(e: object) => boolean} [filter]
     * @returns {object|null}
     */
    const lookup = (category, lssId, names, edition, filter) => {
        const list = section(edition)?.[category] ?? [];
        return matchEntry(list, { idField: 'lssId', id: lssId, names, nameFields: ['en', 'ru', 'identifier'], filter });
    };

    /**
     * @param {string|null} lssClassId
     * @param {string|null} className
     * @param {string} edition  '2014' or '2024'
     * @returns {string|null} dnd5e class identifier, e.g. 'cleric'
     */
    function mapClass(lssClassId, className, edition) {
        return lookup('classes', lssClassId, [className], edition)?.identifier ?? null;
    }

    /**
     * @param {string|null} lssSubclassId
     * @param {string|null} subclassName
     * @param {string|null} classIdentifier  dnd5e class identifier; restricts the search when given
     * @param {string} edition
     * @returns {string|null} dnd5e subclass identifier, e.g. 'the-fiend'
     */
    function mapSubclass(lssSubclassId, subclassName, classIdentifier, edition) {
        const filter = classIdentifier
            ? (entry) => entry.classIdentifier === classIdentifier
            : undefined;
        return lookup('subclasses', lssSubclassId, [subclassName], edition, filter)?.identifier ?? null;
    }

    /**
     * Resolve race and subrace together and explain every fallback.
     * @param {string|null} lssRaceId
     * @param {string|null} raceName
     * @param {string|null} lssSubraceId
     * @param {string|null} subraceName
     * @param {string} edition
     * @returns {{ identifier: string|null, warnings: string[] }}
     */
    function describeRace(lssRaceId, raceName, lssSubraceId, subraceName, edition) {
        const warnings = [];
        const races = section(edition)?.races ?? [];
        const names = { race: raceName ?? lssRaceId ?? '', subrace: subraceName ?? lssSubraceId ?? '' };
        const isBase = (entry) => entry.subraceId == null;

        const base = matchEntry(races, {
            idField: 'lssId', id: lssRaceId, names: [raceName], nameFields: ['en', 'ru', 'identifier'], filter: isBase,
        });

        let sub = null;
        if (lssSubraceId || subraceName) {
            // Subraces are searched under the matched race when there is one, otherwise everywhere.
            const pool = (entry) => !isBase(entry) && (!base || entry.lssId === base.lssId);
            sub = matchEntry(races, {
                idField: 'subraceId', id: lssSubraceId, names: [subraceName], nameFields: ['en', 'ru'], filter: pool,
            });
            if (!sub) warnings.push(`unknown subrace "${names.subrace}" of race "${names.race}"`);
        }

        if (sub?.identifier) return { identifier: sub.identifier, warnings };

        const owner = base ?? (sub ? races.find((entry) => isBase(entry) && entry.lssId === sub.lssId) : null);
        if (sub && !sub.identifier) {
            warnings.push(`subrace "${sub.subraceId}" has no separate dnd5e item; used race "${owner?.lssId ?? names.race}"`);
        }
        if (!owner) {
            warnings.push(`unknown race "${names.race}"`);
            return { identifier: null, warnings };
        }
        if (!owner.identifier) {
            warnings.push(`race "${owner.lssId}" needs a lineage: no dnd5e item without one`);
        }
        return { identifier: owner.identifier ?? null, warnings };
    }

    /**
     * @param {string|null} lssRaceId
     * @param {string|null} raceName
     * @param {string|null} lssSubraceId
     * @param {string|null} subraceName
     * @param {string} edition
     * @returns {string|null} dnd5e race identifier, e.g. 'hill-dwarf'
     */
    function mapRace(lssRaceId, raceName, lssSubraceId, subraceName, edition) {
        return describeRace(lssRaceId, raceName, lssSubraceId, subraceName, edition).identifier;
    }

    /**
     * @param {string|null} lssBackgroundId
     * @param {string|null} name
     * @param {string} edition
     * @returns {string|null} dnd5e background identifier, e.g. 'acolyte'
     */
    function mapBackground(lssBackgroundId, name, edition) {
        return lookup('backgrounds', lssBackgroundId, [name], edition)?.identifier ?? null;
    }

    /**
     * @param {string|null} lssFeatId
     * @param {string|null} name
     * @param {string} edition
     * @returns {string|null} dnd5e feat identifier, e.g. 'alert'
     */
    function mapFeat(lssFeatId, name, edition) {
        return lookup('feats', lssFeatId, [name], edition)?.identifier ?? null;
    }

    return { mapClass, mapSubclass, mapRace, describeRace, mapBackground, mapFeat };
}
