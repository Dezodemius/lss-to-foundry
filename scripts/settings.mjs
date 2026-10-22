/**
 * Module settings: registration (from the `init` hook) and the option object that is
 * passed to `importCharacters`.
 */

import { MODULE_ID, SETTINGS } from './constants.mjs';

/**
 * Options for `importCharacters`, read from the module settings.
 * @typedef {object} ImportOptions
 * @property {string} actorFolder        World folder for imported actors (empty means the root)
 * @property {string} spellFolder        World folder for custom spells from the Grimoire
 * @property {boolean} classFeatures     Grant class, subclass, race and background features
 * @property {boolean} useAvatar         Use the LSS avatar as the actor image and token texture
 * @property {string[]} extraSpellPacks  Extra spell compendium ids, searched before the dnd5e packs
 */

/**
 * Register all module settings. Call once from the `init` hook: Foundry does not allow
 * reading settings before `setup`, so the values are read later, at import time.
 * @returns {void}
 */
export function registerSettings() {
    const register = (key, data) => game.settings.register(MODULE_ID, key, {
        scope: 'world',
        config: true,
        ...data,
    });

    register(SETTINGS.actorFolder, {
        name: 'LSS_TO_FOUNDRY.Settings.ActorFolder.Name',
        hint: 'LSS_TO_FOUNDRY.Settings.ActorFolder.Hint',
        type: String,
        default: 'LSS',
    });

    register(SETTINGS.spellFolder, {
        name: 'LSS_TO_FOUNDRY.Settings.SpellFolder.Name',
        hint: 'LSS_TO_FOUNDRY.Settings.SpellFolder.Hint',
        type: String,
        default: 'LSS: Гримуар',
    });

    register(SETTINGS.classFeatures, {
        name: 'LSS_TO_FOUNDRY.Settings.ClassFeatures.Name',
        hint: 'LSS_TO_FOUNDRY.Settings.ClassFeatures.Hint',
        type: Boolean,
        default: true,
    });

    register(SETTINGS.useAvatar, {
        name: 'LSS_TO_FOUNDRY.Settings.UseAvatar.Name',
        hint: 'LSS_TO_FOUNDRY.Settings.UseAvatar.Hint',
        type: Boolean,
        default: true,
    });

    register(SETTINGS.extraSpellPacks, {
        name: 'LSS_TO_FOUNDRY.Settings.ExtraSpellPacks.Name',
        hint: 'LSS_TO_FOUNDRY.Settings.ExtraSpellPacks.Hint',
        type: String,
        default: '',
    });
}

/**
 * Read the module settings and build the options object for `importCharacters`.
 * Call it at import time, not at registration time.
 * @returns {ImportOptions}
 */
export function getImportOptions() {
    return {
        actorFolder: String(game.settings.get(MODULE_ID, SETTINGS.actorFolder) ?? '').trim(),
        spellFolder: String(game.settings.get(MODULE_ID, SETTINGS.spellFolder) ?? '').trim(),
        classFeatures: Boolean(game.settings.get(MODULE_ID, SETTINGS.classFeatures)),
        useAvatar: Boolean(game.settings.get(MODULE_ID, SETTINGS.useAvatar)),
        extraSpellPacks: parsePackIds(game.settings.get(MODULE_ID, SETTINGS.extraSpellPacks)),
    };
}

/**
 * Split a comma-separated list of compendium ids, dropping blanks and duplicates.
 * @param {unknown} value  Raw setting value
 * @returns {string[]}     Compendium ids in their original order
 */
function parsePackIds(value) {
    const ids = String(value ?? '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    return [...new Set(ids)];
}
