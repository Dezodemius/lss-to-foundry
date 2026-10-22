/**
 * Spell items for a character (docs/DESIGN.md §4.1).
 *
 * SRD spells are copies of the dnd5e compendium documents, found by `system.identifier`.
 * Spells that are not in SRD come from the player's Grimoire. One world item is kept per Grimoire
 * spell (`flags["lss-to-foundry"].lssSpellId`), and every character gets its own copy of it, so
 * the same spell is not duplicated when several characters use it.
 */

import { FLAG_SCOPE, FLAGS, PACKS } from '../constants.mjs';
import { ABILITIES } from '../core/lss-keys.mjs';
import { identifierCandidates } from '../core/spell-refs.mjs';
import { findGrimoireSpell, grimoireKey, spellItemFromGrimoire } from '../core/grimoire.mjs';
import { CompendiumIndex } from './compendium-index.mjs';

/** Folder name used when the caller does not pass one (the setting has the same default). */
export const DEFAULT_SPELL_FOLDER = 'LSS: Гримуар';

/**
 * Preparation state of a spell (`system.prepared`, docs/research/dnd5e-5.1.8-data-model.md §2.13):
 * - `2` (always) for spells granted by the edition's rules (`granted`);
 * - `1` (prepared) for cantrips and for spells in `prepared`;
 * - `0` (unprepared) for spells that are only in the spellbook (`book`).
 * @param {{ level?: number, lists?: string[] }} ref  SpellRef from `resolveSpellRefs`
 * @returns {0|1|2}
 */
export function preparedState(ref) {
    const lists = ref.lists ?? [];
    if (lists.includes('granted')) return 2;
    if (Number(ref.level ?? 0) === 0) return 1;
    if (lists.includes('prepared')) return 1;
    return 0;
}

/**
 * Spellcasting method (`system.method`): `innate` for slotless spells, `pact` for the warlock, otherwise `spell`.
 * @param {{ slotless?: boolean }} ref
 * @param {string} classIdentifier  Identifier of the character's class, e.g. `warlock`
 * @returns {'innate'|'pact'|'spell'}
 */
export function spellMethod(ref, classIdentifier) {
    if (ref.slotless) return 'innate';
    if (classIdentifier === 'warlock') return 'pact';
    return 'spell';
}

/**
 * Spellcasting ability override (`system.ability`). Empty string means the class default.
 * @param {{ ability?: string }} ref
 * @returns {string}
 */
export function spellAbility(ref) {
    return ABILITIES.includes(ref.ability) ? ref.ability : '';
}

/**
 * Write method, preparation, source class and ability into an item source (mutates and returns `item`).
 * @param {object} item                 ItemSource of a spell
 * @param {object} ref                  SpellRef
 * @param {string} classIdentifier
 * @returns {object}
 */
export function applySpellState(item, ref, classIdentifier) {
    item.system = item.system ?? {};
    // Custom spells have no SRD level in the reference, so the level of the item is used.
    const level = ref.level ?? item.system.level ?? 0;
    item.system.method = spellMethod(ref, classIdentifier);
    // VERIFY IN FOUNDRY: `prepared` for `innate` spells (0 or 1 for slotless spells, data-model §2.13 ❓).
    item.system.prepared = preparedState({ level, lists: ref.lists });
    item.system.sourceClass = classIdentifier ?? '';
    item.system.ability = spellAbility(ref);
    return item;
}

/**
 * Compendiums to search for SRD spells, in order: the user's extra packs, then the packs of the character's
 * edition, then the other edition as a fallback (`ice-knife` is missing from dnd5e 5.1.8 `spells24`).
 * `edition` is the rules edition of the pack, or `null` for extra packs whose edition is unknown.
 * @param {'2014'|'2024'} edition
 * @param {string[]} [extraPacks]
 * @returns {{ packId: string, fallback: boolean, edition: '2014'|'2024'|null }[]}
 */
export function spellPackPlan(edition, extraPacks = []) {
    const other = edition === '2014' ? '2024' : '2014';
    const plan = [
        ...extraPacks.map((packId) => ({ packId, fallback: false, edition: null })),
        ...(PACKS[edition]?.spells ?? []).map((packId) => ({ packId, fallback: false, edition })),
        ...(PACKS[other]?.spells ?? []).map((packId) => ({ packId, fallback: true, edition: other })),
    ];
    return plan.filter((step, position) => plan.findIndex((earlier) => earlier.packId === step.packId) === position);
}

/**
 * Add a line to the import report, if there is a report.
 * @param {{ warnings?: string[] }|undefined} report
 * @param {string} message
 */
function note(report, message) {
    if (report?.warnings) report.warnings.push(message);
}

/** Default id generator, used when the caller does not pass `randomID`. */
function defaultRandomID(length) {
    return foundry.utils.randomID(length);
}

/**
 * Run `factory` once per cache key. The cache stores promises, so concurrent callers share one result.
 * @template T
 * @param {Map<string, Promise<T>>} cache
 * @param {string} key
 * @param {() => T|Promise<T>} factory
 * @returns {Promise<T>}
 */
function memo(cache, key, factory) {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(factory));
    return cache.get(key);
}

/**
 * Find or create a top-level folder of the given document type. Used for the Grimoire spell folder and
 * for the actor folder (the importer calls it too).
 * @param {string} name
 * @param {'Actor'|'Item'} type
 * @returns {Promise<Folder>}   Throws when the user may not create folders
 */
export async function ensureFolder(name, type) {
    const existing = game.folders.contents.find((folder) => folder.type === type && folder.name === name && !folder.folder);
    if (existing) return existing;
    return foundry.documents.Folder.implementation.create({ name, type, folder: null });
}

/**
 * The world spell item that stores this Grimoire spell, if one exists.
 * @param {string} lssSpellId
 * @returns {Item|null}
 */
function findWorldSpell(lssSpellId) {
    return game.items.contents.find(
        (item) => item.type === 'spell' && item.getFlag(FLAG_SCOPE, FLAGS.lssSpellId) === lssSpellId,
    ) ?? null;
}

/**
 * Find the first SRD document for a reference. Packs are tried in plan order; inside a pack, the candidate
 * identifiers for that pack's edition are tried in order (the alias of a 2014 slug comes first).
 * @param {{ slug?: string }} ref
 * @param {CompendiumIndex} index
 * @param {{ packId: string, fallback: boolean, edition: '2014'|'2024'|null }[]} plan
 * @returns {{ reference: object, fallback: boolean }|null}
 */
export function findSrdSpell(ref, index, plan) {
    if (!ref.slug) return null;
    for (const step of plan) {
        const editions = step.edition ? [step.edition] : ['2014', '2024'];
        const candidates = [...new Set(editions.flatMap((edition) => identifierCandidates(ref.slug, edition)))];
        for (const identifier of candidates) {
            const reference = index.findByIdentifier(identifier, { types: ['spell'], packIds: [step.packId] });
            if (reference) return { reference, fallback: step.fallback };
        }
    }
    return null;
}

/**
 * Copy of an SRD spell for the character. Uses `fromCompendium`, so `_stats.compendiumSource` is set.
 * @param {CompendiumIndex} index
 * @param {object} reference    Index reference of the spell
 * @param {object} ref          SpellRef
 * @returns {Promise<object|null>}
 */
async function copySrdSpell(index, reference, ref) {
    const doc = await index.getDocument(reference);
    if (!doc) return null;
    const data = game.collections.get('Item').fromCompendium(doc, { clearFolder: true });
    if (data.flags) delete data.flags.babele;
    data.flags = data.flags ?? {};
    data.flags[FLAG_SCOPE] = {
        ...(data.flags[FLAG_SCOPE] ?? {}),
        imported: true,
        [FLAGS.lssId]: ref.lssId ?? ref.slug ?? '',
    };
    return data;
}

/**
 * Item source for a character from a world spell or, without one, from the Grimoire data.
 * @param {object} source        Source data (world item or ItemSource from the Grimoire)
 * @param {string} lssSpellId
 * @param {string} [worldUuid]   UUID of the world item, to fill `_stats.compendiumSource`
 * @returns {object}
 */
function characterCopy(source, lssSpellId, worldUuid = '') {
    const data = foundry.utils.deepClone(source);
    delete data._id;
    delete data.folder;
    delete data.sort;
    delete data.ownership;
    if (worldUuid) data._stats = { ...(data._stats ?? {}), compendiumSource: worldUuid };
    data.flags = data.flags ?? {};
    data.flags[FLAG_SCOPE] = { ...(data.flags[FLAG_SCOPE] ?? {}), imported: true, [FLAGS.lssSpellId]: lssSpellId };
    return data;
}

/**
 * Build the character's copy of a Grimoire spell. Creates the world item once per spell, when the user may.
 * @param {object} spell        GrimoireSpell from `findGrimoireSpell`
 * @param {object} ctx
 * @param {Map<string, Promise<unknown>>} ctx.cache
 * @param {string} ctx.edition
 * @param {string} ctx.spellFolderName
 * @param {(length: number) => string} ctx.randomID
 * @param {{ warnings?: string[], customSpells?: string[] }} ctx.report
 * @returns {Promise<object>}   ItemSource for the character
 */
async function customSpellItem(spell, ctx) {
    const lssSpellId = spell.lssId || spell.slug || grimoireKey(spell);
    const { cache, report } = ctx;

    const world = await memo(cache, `world-spell:${lssSpellId}`, async () => {
        const existing = findWorldSpell(lssSpellId);
        if (existing) return existing;
        if (!game.user?.can('ITEM_CREATE')) {
            note(report, `«${spell.name}»: мировой предмет не создан, нет права ITEM_CREATE. Заклинание скопировано в персонажа.`);
            return null;
        }
        try {
            const folderId = await memo(cache, `folder:Item:${ctx.spellFolderName}`, async () => {
                try {
                    return (await ensureFolder(ctx.spellFolderName, 'Item'))?.id ?? null;
                } catch (error) {
                    note(report, `Папка «${ctx.spellFolderName}» для заклинаний не создана: ${error.message}`);
                    return null;
                }
            });
            const data = spellItemFromGrimoire(spell, { edition: ctx.edition, randomID: ctx.randomID });
            delete data._id;
            data.folder = folderId;
            data.flags = data.flags ?? {};
            data.flags[FLAG_SCOPE] = { ...(data.flags[FLAG_SCOPE] ?? {}), imported: true, [FLAGS.lssSpellId]: lssSpellId };
            return await foundry.documents.Item.implementation.create(data);
        } catch (error) {
            note(report, `«${spell.name}»: мировой предмет не создан: ${error.message}`);
            return null;
        }
    });

    if (report?.customSpells) report.customSpells.push(spell.name);
    if (world) return characterCopy(world.toObject(), lssSpellId, world.uuid);
    return characterCopy(spellItemFromGrimoire(spell, { edition: ctx.edition, randomID: ctx.randomID }), lssSpellId);
}

/**
 * Build the spell items of one character.
 *
 * Each SpellRef is resolved in this order: SRD compendium (by identifier, through the pack plan), then the
 * Grimoire. A spell that is found nowhere is listed in `report.missingSpells` and gets no item.
 *
 * @param {object} char                          LssCharacter (used for edition and class context)
 * @param {object[]} refs                        SpellRefs from `resolveSpellRefs`
 * @param {object} options
 * @param {'2014'|'2024'} options.edition
 * @param {string} options.classIdentifier       Class of the character, e.g. `cleric` (`sourceClass`)
 * @param {object[]} [options.grimoire]          GrimoireSpell[] loaded from the user's files
 * @param {string[]} [options.extraPacks]        User's extra spell packs, searched first
 * @param {string} [options.spellFolderName]     Folder for world spells, default `LSS: Гримуар`
 * @param {Map<string, unknown>} [options.cache] Import-wide cache (world items, folder, index)
 * @param {CompendiumIndex} [options.index]      Shared compendium index; built from the plan when missing
 * @param {(length: number) => string} [options.randomID]
 * @param {{ warnings: string[], missingSpells: string[], customSpells: string[] }} [report]
 * @returns {Promise<object[]>}                  ItemSources of type `spell`
 */
export async function buildSpellItems(char, refs, options, report) {
    const edition = options.edition === '2014' ? '2014' : '2024';
    const classIdentifier = options.classIdentifier ?? '';
    const grimoire = options.grimoire ?? [];
    const cache = options.cache ?? new Map();
    const randomID = options.randomID ?? defaultRandomID;
    const spellFolderName = options.spellFolderName || DEFAULT_SPELL_FOLDER;
    const plan = spellPackPlan(edition, options.extraPacks ?? []);
    const index = options.index
        ?? await memo(cache, `index:${plan.map((step) => step.packId).join('|')}`,
            () => CompendiumIndex.build(plan.map((step) => step.packId)));

    const items = [];
    for (const ref of refs ?? []) {
        const label = ref.englishName || ref.slug || ref.lssId || ref.ref;
        if (ref.chargeResourceId) {
            note(report, `«${label}» оплачивается счётчиком LSS: связь со счётчиком не перенесена, проверьте ячейки на листе.`);
        }

        if (ref.kind === 'srd') {
            const found = findSrdSpell(ref, index, plan);
            if (found) {
                const data = await copySrdSpell(index, found.reference, ref);
                if (data) {
                    if (found.fallback) {
                        note(report, `«${label}» взято из пакета другой редакции (${found.reference.packId}): проверьте текст и перевод.`);
                    }
                    items.push(applySpellState(data, ref, classIdentifier));
                    continue;
                }
            }
            // Not in dnd5e: the Grimoire may still have it, so fall through.
        }

        const spell = findGrimoireSpell(ref, grimoire);
        if (!spell) {
            if (report?.missingSpells) report.missingSpells.push(label);
            continue;
        }
        const item = await customSpellItem(spell, { cache, report, edition, spellFolderName, randomID });
        items.push(applySpellState(item, ref, classIdentifier));
    }
    return items;
}
