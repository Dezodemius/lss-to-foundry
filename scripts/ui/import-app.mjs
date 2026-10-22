/**
 * Import window: pick LSS files, choose characters, run the import and show the report.
 * One template serves three states: select, running and report.
 */

import { MODULE_ID } from '../constants.mjs';
import { parseLssFile } from '../core/parse.mjs';
import { grimoireKey } from '../core/grimoire.mjs';
import { getImportOptions } from '../settings.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Window states. */
const STAGE = Object.freeze({
    SELECT: 'select',
    RUNNING: 'running',
    REPORT: 'report',
});

/**
 * A character loaded from a file, with its selection state.
 * @typedef {object} ImportEntry
 * @property {object} char      LssCharacter from `parseLssFile`; `char.key` is unique within the window
 * @property {boolean} selected Whether the character is included in the import
 */

/**
 * Edition of the world rules, taken from the dnd5e `rulesVersion` setting.
 * @returns {'2014'|'2024'|null}  `null` if the setting is missing or has an unknown value
 */
function worldEdition() {
    let rules;
    try {
        rules = game.settings.get('dnd5e', 'rulesVersion');
    } catch {
        return null; // Not a dnd5e world: the setting is not registered.
    }
    if (rules === 'modern') return '2024';
    if (rules === 'legacy') return '2014';
    return null;
}

/**
 * Coerce a value to an array of strings for the template.
 * @param {unknown} value
 * @returns {string[]}
 */
function asArray(value) {
    return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Count successful and failed results of an ImportReport.
 * @param {object|null|undefined} report
 * @returns {{ok: number, failed: number}}
 */
function countResults(report) {
    const results = Array.isArray(report?.results) ? report.results : [];
    const ok = results.filter(result => result?.ok).length;
    return { ok, failed: results.length - ok };
}

/**
 * Human-readable name of an importer stage. Known stages can be translated with
 * `LSS_TO_FOUNDRY.Stage.<stage>`; anything else is shown as sent.
 * @param {unknown} stage
 * @returns {string}
 */
function stageLabel(stage) {
    const text = String(stage ?? '');
    const key = `LSS_TO_FOUNDRY.Stage.${text}`;
    return text && game.i18n.has(key) ? game.i18n.localize(key) : text;
}

/**
 * Application window for importing LSS characters.
 * @extends {ApplicationV2}
 */
export class LssImportApp extends HandlebarsApplicationMixin(ApplicationV2) {

    /** @inheritDoc */
    static DEFAULT_OPTIONS = {
        id: `${MODULE_ID}-import`,
        classes: [MODULE_ID],
        tag: 'form',
        window: {
            title: 'LSS_TO_FOUNDRY.Import.Title',
            icon: 'fa-solid fa-file-import',
            resizable: true,
        },
        position: { width: 620 },
        form: {
            handler: LssImportApp.#onSubmit,
            closeOnSubmit: false,
        },
        actions: {
            openSheet: LssImportApp.#onOpenSheet,
            reset: LssImportApp.#onReset,
        },
    };

    /** @inheritDoc */
    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/import-app.hbs` },
    };

    /** @type {string} */
    #stage = STAGE.SELECT;

    /** @type {ImportEntry[]} */
    #entries = [];

    /** @type {string[]} */
    #fileNames = [];

    /** @type {string[]} */
    #fileErrors = [];

    /** @type {object[]} */
    #grimoire = [];

    /** @type {{index: number, total: number, name: string, stage: string}|null} */
    #progress = null;

    /** @type {object|null} ImportReport of the last finished import */
    #report = null;

    /** @type {number} Counter of file selections, used to drop stale reads */
    #loadCount = 0;

    /** @type {string|null} Message about an import that failed as a whole */
    #importError = null;

    /* -------------------------------------------- */

    /** @inheritDoc */
    async close(options = {}) {
        // Closing during an import would hide its report, and progress updates would reopen the window.
        if (this.#stage === STAGE.RUNNING) {
            ui.notifications.warn(game.i18n.localize('LSS_TO_FOUNDRY.Import.BusyClose'));
            return this;
        }
        return super.close(options);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const world = worldEdition();

        const entries = this.#entries.map(({ char, selected }) => {
            const notes = asArray(char.warnings);
            if (world && char.edition && char.edition !== world) {
                notes.push(game.i18n.format('LSS_TO_FOUNDRY.Import.EditionMismatch', {
                    character: char.edition,
                    world,
                }));
            }
            return {
                key: char.key,
                name: char.name || char.fileName || char.key,
                className: char.className ?? '',
                level: char.level,
                edition: char.edition,
                fileName: char.fileName ?? '',
                selected,
                notes,
                noteCount: notes.length,
            };
        });

        const selectedCount = entries.filter(entry => entry.selected).length;

        let progressLabel = game.i18n.localize('LSS_TO_FOUNDRY.Import.Preparing');
        let progress = null;
        if (this.#progress) {
            // The importer reports a zero-based position; the window shows a 1-based number.
            const position = Number(this.#progress.index);
            progress = {
                index: Number.isFinite(position) ? position + 1 : 0,
                total: Number(this.#progress.total) || 0,
            };
            progressLabel = game.i18n.format('LSS_TO_FOUNDRY.Import.Progress', {
                index: progress.index,
                total: progress.total,
                name: this.#progress.name,
                stage: stageLabel(this.#progress.stage),
            });
        }

        let report = null;
        let reportSummary = '';
        if (this.#report) {
            const results = (Array.isArray(this.#report.results) ? this.#report.results : []).map(result => ({
                key: result?.key,
                name: result?.name || result?.key || '',
                ok: Boolean(result?.ok),
                error: result?.error || null,
                actorUuid: result?.actorUuid || null,
                warnings: asArray(result?.warnings),
                missingSpells: asArray(result?.missingSpells),
                customSpells: asArray(result?.customSpells),
            }));
            report = { results, warnings: asArray(this.#report.warnings) };
            const { ok, failed } = countResults(this.#report);
            reportSummary = game.i18n.format('LSS_TO_FOUNDRY.Import.Done', { ok, failed });
        }

        return {
            stage: this.#stage,
            isSelect: this.#stage === STAGE.SELECT,
            isRunning: this.#stage === STAGE.RUNNING,
            isReport: this.#stage === STAGE.REPORT,
            importError: this.#importError,
            fileList: this.#fileNames.join(', '),
            fileErrors: this.#fileErrors,
            entries,
            hasEntries: entries.length > 0,
            totalCount: entries.length,
            selectedCount,
            canImport: selectedCount > 0,
            grimoireCount: this.#grimoire.length,
            progressLabel,
            progress,
            report,
            reportSummary,
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onChangeForm(formConfig, event) {
        super._onChangeForm(formConfig, event);
        const input = event.target;
        if (input.name === 'files') {
            this.#loadFiles([...input.files]);
        } else if (input.name === 'pick') {
            this.#setSelected(input.value, input.checked);
        }
    }

    /* -------------------------------------------- */

    /**
     * Read and parse the chosen files, then merge the characters and Grimoire spells.
     * A file that cannot be read or parsed is reported and skipped; the others still load.
     * @param {File[]} files
     * @returns {Promise<void>}
     */
    async #loadFiles(files) {
        this.#importError = null;
        const loadId = ++this.#loadCount;
        const entries = [];
        const fileErrors = [];
        const grimoire = [];
        const characterKeys = new Set();
        const spellKeys = new Set();

        for (const file of files) {
            try {
                const parsed = parseLssFile(await file.text(), file.name);

                for (const char of parsed.characters ?? []) {
                    // Two files may share a name, so make the key unique within the window.
                    let key = char.key;
                    for (let n = 2; characterKeys.has(key); n++) key = `${char.key}~${n}`;
                    characterKeys.add(key);
                    entries.push({ char: { ...char, key }, selected: true });
                }

                for (const spell of parsed.grimoire ?? []) {
                    const key = grimoireKey(spell);
                    if (spellKeys.has(key)) continue;
                    spellKeys.add(key);
                    grimoire.push(spell);
                }

                // parseLssFile already prefixes its messages with the file name.
                fileErrors.push(...asArray(parsed.errors));
            } catch (err) {
                const error = err?.message ?? String(err);
                fileErrors.push(game.i18n.format('LSS_TO_FOUNDRY.Import.FileError', { file: file.name, error }));
            }
        }

        // A newer selection may have started while this one was being read; keep only the latest.
        if (loadId !== this.#loadCount) return;
        this.#entries = entries;
        this.#fileNames = files.map(file => file.name);
        this.#fileErrors = fileErrors;
        this.#grimoire = grimoire;
        this.#stage = STAGE.SELECT;
        await this.render();
    }

    /* -------------------------------------------- */

    /**
     * Store a checkbox change and refresh the counter and the Import button.
     * The body is not re-rendered here, so the file input and open details stay as they are.
     * @param {string} key       Character key
     * @param {boolean} selected Checkbox state
     */
    #setSelected(key, selected) {
        const entry = this.#entries.find(item => item.char.key === key);
        if (entry) entry.selected = selected;

        const selectedCount = this.#entries.filter(item => item.selected).length;
        const counter = this.element?.querySelector('[data-role="selected-count"]');
        if (counter) {
            counter.textContent = game.i18n.format('LSS_TO_FOUNDRY.Import.Selected', {
                selected: selectedCount,
                total: this.#entries.length,
            });
        }
        const start = this.element?.querySelector('[data-role="start"]');
        if (start) start.disabled = selectedCount === 0;
    }

    /* -------------------------------------------- */

    /**
     * Form submit: run the import for the selected characters.
     * @this {LssImportApp}
     * @param {Event} event
     * @returns {Promise<void>}
     */
    static async #onSubmit(event) {
        if (this.#stage !== STAGE.SELECT) return;

        const selected = this.#entries.filter(entry => entry.selected).map(entry => entry.char);
        if (!selected.length) {
            ui.notifications.warn(game.i18n.localize('LSS_TO_FOUNDRY.Import.NothingSelected'));
            return;
        }
        await this.#runImport(selected);
    }

    /* -------------------------------------------- */

    /**
     * Run `importCharacters` and show its progress and report.
     * @param {object[]} selected  LssCharacter objects to import
     * @returns {Promise<void>}
     */
    async #runImport(selected) {
        this.#stage = STAGE.RUNNING;
        this.#importError = null;
        this.#progress = null;
        this.#report = null;
        await this.render();

        try {
            // Loaded on demand, so a failure in the Foundry layer does not stop the window from opening.
            const { importCharacters } = await import('../foundry/importer.mjs');
            const report = await importCharacters(
                selected,
                this.#grimoire,
                getImportOptions(),
                progress => this.#onProgress(progress),
            );
            this.#report = report;
            this.#stage = STAGE.REPORT;
            const { ok, failed } = countResults(report);
            ui.notifications.info(game.i18n.format('LSS_TO_FOUNDRY.Import.Done', { ok, failed }));
        } catch (err) {
            console.error(`${MODULE_ID} | import failed`, err);
            const error = err?.message ?? String(err);
            this.#importError = game.i18n.format('LSS_TO_FOUNDRY.Import.Failed', { error });
            ui.notifications.error(this.#importError);
            this.#stage = STAGE.SELECT;
        } finally {
            this.#progress = null;
        }
        await this.render();
    }

    /* -------------------------------------------- */

    /**
     * Progress callback of `importCharacters`. `index` is zero-based. The render queue of ApplicationV2
     * keeps the updates in order.
     * @param {{index: number, total: number, name: string, stage: string}} progress
     */
    #onProgress(progress) {
        this.#progress = {
            index: progress?.index,
            total: progress?.total,
            name: progress?.name ?? '',
            stage: progress?.stage ?? '',
        };
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Open the actor sheet of an imported character.
     * @this {LssImportApp}
     * @param {PointerEvent} event
     * @param {HTMLElement} target  The button with `data-uuid`
     * @returns {Promise<void>}
     */
    static async #onOpenSheet(event, target) {
        const uuid = target.dataset.uuid;
        const doc = uuid ? await foundry.utils.fromUuid(uuid) : null;
        if (!doc?.sheet) {
            ui.notifications.warn(game.i18n.localize('LSS_TO_FOUNDRY.Import.ActorNotFound'));
            return;
        }
        doc.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Return to the empty select state for the next import.
     * @this {LssImportApp}
     * @returns {Promise<void>}
     */
    static async #onReset() {
        this.#entries = [];
        this.#fileNames = [];
        this.#fileErrors = [];
        this.#grimoire = [];
        this.#report = null;
        this.#importError = null;
        this.#stage = STAGE.SELECT;
        await this.render();
    }
}

/** The import window. Only one exists at a time. */
let instance = null;

/**
 * Open the import window, or bring the open one to the front.
 * @returns {LssImportApp}  The window instance
 */
export function openImportApp() {
    instance ??= new LssImportApp();
    instance.render({ force: true });
    return instance;
}
