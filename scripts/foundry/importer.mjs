/**
 * Import orchestration: loads the data tables, then writes the selected characters one by one.
 * An error in one character does not stop the others; it goes into that character's result.
 */

import { MODULE_ID } from '../constants.mjs';
import { createIdMapper } from '../core/ids.mjs';
import { createSpellIndex } from '../core/spell-refs.mjs';
import { CompendiumIndex, allPackIds } from './compendium-index.mjs';
import { writeActor } from './actor-writer.mjs';
import { ensureFolder } from './spells.mjs';

/**
 * Load one JSON table shipped with the module (`data/`).
 * @param {string} name  File name, e.g. `lss-dnd5e-ids.json`
 * @returns {Promise<any>}
 */
async function loadTable(name) {
    // VERIFY IN FOUNDRY: the module path resolves on the installed module (junction or copy in Data/modules).
    const url = `modules/${MODULE_ID}/data/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`);
    return response.json();
}

/**
 * Unique strings, order kept.
 * @param {string[]} values
 * @returns {string[]}
 */
function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

/**
 * Find or create the actor folder. A failure is a warning, and the actors go to the root.
 * @param {string} name
 * @param {string[]} warnings
 * @returns {Promise<string|null>}
 */
async function actorFolderId(name, warnings) {
    if (!name) return null;
    try {
        return (await ensureFolder(name, 'Actor'))?.id ?? null;
    } catch (error) {
        warnings.push(`Папка «${name}» для персонажей не создана: ${error.message}. Персонажи созданы в корне каталога.`);
        return null;
    }
}

/**
 * Import the selected characters.
 *
 * @param {object[]} characters        LssCharacter[] chosen in the import window
 * @param {object[]} grimoire          GrimoireSpell[] from the files the user loaded
 * @param {object} options
 * @param {string} [options.actorFolder]       Folder for the characters, default `LSS`
 * @param {string} [options.spellFolder]       Folder for world spells, default `LSS: Гримуар`
 * @param {boolean} [options.classFeatures=true]  Copy the automatic class, subclass, race and background features
 * @param {boolean} [options.useAvatar=false]  Use the LSS avatar as the actor image
 * @param {string[]} [options.extraSpellPacks] Extra compendiums to search for SRD spells, searched first
 * @param {(progress: { index: number, total: number, name: string, stage: 'writing'|'done'|'error' }) => void} [onProgress]
 * @returns {Promise<{ results: object[], warnings: string[], startedAt: string, finishedAt: string }>}
 */
export async function importCharacters(characters, grimoire, options = {}, onProgress = () => {}) {
    const startedAt = new Date().toISOString();
    if (!game.user?.can('ACTOR_CREATE')) {
        throw new Error('Нет права создавать персонажей (ACTOR_CREATE). Попросите ГМ выдать право или импортируйте от его имени.');
    }

    const warnings = [];
    // Tables are needed for every character, so a failure here stops the whole import.
    const ids = createIdMapper(await loadTable('lss-dnd5e-ids.json'));
    const spellIndex = createSpellIndex(
        await loadTable('srd-spell-index-2014.json'),
        await loadTable('srd-spell-index-2024.json'),
    );

    // One compendium index for the whole run. Missing packs are reported once, here.
    const index = await CompendiumIndex.build(unique(allPackIds(options.extraSpellPacks ?? [])));
    warnings.push(...index.warnings);

    const folderId = await actorFolderId(options.actorFolder ?? 'LSS', warnings);
    const spellCache = new Map();
    const total = characters.length;
    const results = [];

    for (let position = 0; position < total; position++) {
        const char = characters[position];
        const report = { warnings: [], missingSpells: [], customSpells: [] };
        onProgress({ index: position, total, name: char.name, stage: 'writing' });
        try {
            const actor = await writeActor(char, {
                folderId,
                options,
                ids,
                spellIndex,
                grimoire,
                spellCache,
                index,
                randomID: (length) => foundry.utils.randomID(length),
            }, report);
            results.push({
                key: char.key,
                name: char.name,
                ok: true,
                actorId: actor.id,
                actorUuid: actor.uuid,
                warnings: report.warnings,
                missingSpells: unique(report.missingSpells),
                customSpells: unique(report.customSpells),
                error: null,
            });
            onProgress({ index: position, total, name: char.name, stage: 'done' });
        } catch (error) {
            console.error(`lss-to-foundry | Ошибка импорта «${char.name}»`, error);
            results.push({
                key: char.key,
                name: char.name,
                ok: false,
                actorId: null,
                actorUuid: null,
                warnings: report.warnings,
                missingSpells: unique(report.missingSpells),
                customSpells: unique(report.customSpells),
                error: error?.message ?? String(error),
            });
            onProgress({ index: position, total, name: char.name, stage: 'error' });
        }
    }

    return { results, warnings, startedAt, finishedAt: new Date().toISOString() };
}
