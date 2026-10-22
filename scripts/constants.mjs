/**
 * Shared constants. Kept free of Foundry globals so the pure core can import it in tests.
 */

export const MODULE_ID = 'lss-to-foundry';

/** Flag scope for everything the module writes: `flags["lss-to-foundry"].*`. */
export const FLAG_SCOPE = MODULE_ID;

/** Keys under `flags["lss-to-foundry"]`. */
export const FLAGS = {
    /** `true` on every actor, item and effect created by the importer. */
    imported: 'imported',
    /** LSS id of a weapon, resource, effect or spell the document was built from. */
    lssId: 'lssId',
    /** LSS spell id or slug of a Grimoire spell; world items are deduplicated by it. */
    lssSpellId: 'lssSpellId',
    /** Import metadata on the actor: `{ fileName, edition, importedAt, moduleVersion }`. */
    source: 'source',
};

/** Setting keys registered in `scripts/settings.mjs`. */
export const SETTINGS = {
    actorFolder: 'actorFolder',
    spellFolder: 'spellFolder',
    classFeatures: 'classFeatures',
    useAvatar: 'useAvatar',
    extraSpellPacks: 'extraSpellPacks',
};

/** dnd5e 5.1.8 compendiums per LSS edition (docs/research/dnd5e-5.1.8-data-model.md §6). */
export const PACKS = {
    2014: {
        classes: ['dnd5e.classes'],
        subclasses: ['dnd5e.subclasses'],
        races: ['dnd5e.races'],
        backgrounds: ['dnd5e.backgrounds'],
        feats: [],
        spells: ['dnd5e.spells'],
        items: ['dnd5e.items'],
    },
    2024: {
        classes: ['dnd5e.classes24'],
        subclasses: ['dnd5e.classes24'],
        races: ['dnd5e.origins24'],
        backgrounds: ['dnd5e.origins24'],
        feats: ['dnd5e.feats24'],
        spells: ['dnd5e.spells24'],
        items: ['dnd5e.equipment24'],
    },
};

/** LSS treats a missing `edition` as 2024 (Guildhall docs/developers/characters.mdx). */
export const DEFAULT_EDITION = '2024';
