/**
 * Builds data/srd-spell-index-{2014,2024}.json from the LSS spell slug datasets.
 *
 * Each record keeps only what the import needs: LSS id, slug, English name, level and classes.
 * The Russian part of the name is an LSS translation and must not be redistributed, so it is dropped.
 *
 * Usage: npm run build:spell-index
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Edition → input dataset (read only) and output index. */
const EDITIONS = {
    2014: {
        source: join(ROOT, 'test', 'fixtures', 'lss', 'srd-spell-slugs-2014.json'),
        target: join(ROOT, 'data', 'srd-spell-index-2014.json'),
    },
    2024: {
        source: join(ROOT, 'test', 'fixtures', 'lss', 'srd-spell-slugs-2024.json'),
        target: join(ROOT, 'data', 'srd-spell-index-2024.json'),
    },
};

/** English name is the last bracketed part: `Кислотная стрела [Acid Arrow]` → `Acid Arrow`. */
const ENGLISH_NAME = /\[([^\[\]]+)\]\s*$/;

/**
 * Convert raw dataset records into index entries. Throws on anything unexpected,
 * so a changed dataset fails the build instead of producing a broken index.
 * @param {object[]} records  `{ slug, id, name, level, classes }` from the LSS dataset
 * @param {string} edition    used in error messages only
 * @returns {{ id: string, slug: string, englishName: string, level: number, classes: string[] }[]}
 */
export function buildIndex(records, edition) {
    if (!Array.isArray(records)) throw new Error(`${edition}: dataset is not an array`);
    const ids = new Set();
    const slugs = new Set();
    return records.map((record) => {
        const where = `${edition}: ${record?.slug ?? '?'}`;
        const { slug, id, name, level, classes } = record ?? {};
        if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${where}: bad slug`);
        if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) throw new Error(`${where}: bad id`);
        if (!Number.isInteger(level) || level < 0 || level > 9) throw new Error(`${where}: bad level`);
        if (!Array.isArray(classes) || !classes.every((c) => typeof c === 'string')) throw new Error(`${where}: bad classes`);
        const match = typeof name === 'string' ? name.match(ENGLISH_NAME) : null;
        if (!match) throw new Error(`${where}: no English name in brackets`);
        if (ids.has(id)) throw new Error(`${where}: duplicate id ${id}`);
        if (slugs.has(slug)) throw new Error(`${where}: duplicate slug`);
        ids.add(id);
        slugs.add(slug);
        return { id, slug, englishName: match[1].trim(), level, classes: [...classes] };
    });
}

/** Read each dataset, build its index and write it to data/. */
function main() {
    for (const [edition, { source, target }] of Object.entries(EDITIONS)) {
        const records = JSON.parse(readFileSync(source, 'utf8'));
        const entries = buildIndex(records, edition);
        writeFileSync(target, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
        console.log(`edition ${edition}: ${entries.length} spells -> ${target}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
