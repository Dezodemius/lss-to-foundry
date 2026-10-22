/**
 * Module entry point: settings, the public API, and the "Import from LSS" button
 * in the Actors sidebar.
 */

import { MODULE_ID } from './constants.mjs';
import { registerSettings, getImportOptions } from './settings.mjs';
import { parseLssFile } from './core/parse.mjs';
import { openImportApp } from './ui/import-app.mjs';

/** Class of the sidebar button. Also used to keep the insertion idempotent. */
const BUTTON_CLASS = `${MODULE_ID}-import`;

Hooks.once('init', () => {
    registerSettings();
});

Hooks.once('ready', () => {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = { parseLssFile, importCharacters, openImportApp };
});

Hooks.on('renderActorDirectory', (app, element) => {
    addImportButton(element);
});

/**
 * Public API for other modules and the browser extension: import parsed characters.
 * The importer is loaded on first use, so an error in the Foundry layer does not
 * stop the rest of the module (and the import window) from working.
 * @param {object[]} characters                       LssCharacter objects from `parseLssFile`
 * @param {object[]} [grimoire=[]]                    GrimoireSpell objects from `parseLssFile`
 * @param {import('./settings.mjs').ImportOptions} [options]  Defaults to the module settings
 * @param {(progress: object) => void} [onProgress]   Called with `{ index, total, name, stage }`
 * @returns {Promise<object>}                         ImportReport
 */
async function importCharacters(characters, grimoire = [], options = getImportOptions(), onProgress) {
    const { importCharacters: run } = await import('./foundry/importer.mjs');
    return run(characters, grimoire, options, onProgress);
}

/**
 * Add the "Import from LSS" button to the Actors sidebar header, if the user may create actors.
 * The sidebar re-renders its header on its own, so the function checks for an existing button first.
 * @param {HTMLElement|undefined} element  Root element of the Actors sidebar tab
 * @returns {void}
 */
function addImportButton(element) {
    // Players without ACTOR_CREATE cannot import, so they do not see the button.
    if (!game.user?.can('ACTOR_CREATE')) return;

    const bar = element?.querySelector('.header-actions');
    if (!bar || bar.querySelector(`.${BUTTON_CLASS}`)) return;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-file-import';
    icon.setAttribute('inert', '');

    const label = document.createElement('span');
    label.textContent = game.i18n.localize('LSS_TO_FOUNDRY.Import.Button');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.append(icon, label);
    button.addEventListener('click', event => {
        event.preventDefault();
        openImportApp();
    });

    bar.append(button);
}
