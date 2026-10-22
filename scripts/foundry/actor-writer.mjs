/**
 * Writes one character as a dnd5e actor, then reconciles the numbers that dnd5e computes itself
 * (docs/DESIGN.md §4.4): hit points, spell slots and conditions.
 */

import { FLAG_SCOPE, MODULE_ID } from '../constants.mjs';
import { CONDITIONS } from '../core/lss-keys.mjs';
import { computeStats, mapActor } from '../core/map-actor.mjs';
import { mapBonuses } from '../core/map-bonuses.mjs';
import { mapResources, mapWeapons } from '../core/map-items.mjs';
import { resolveSpellRefs } from '../core/spell-refs.mjs';
import { buildOriginItems } from './class-builder.mjs';
import { buildSpellItems } from './spells.mjs';

/** dnd5e 5.1.8 exhaustion levels (`CONFIG.DND5E.conditionTypes.exhaustion.levels`, config.mjs:4068). */
const EXHAUSTION_LEVELS = 6;

/**
 * Add a line to the import report, if there is a report.
 * @param {{ warnings: string[] }|undefined} report
 * @param {string} message
 */
function note(report, message) {
    if (report?.warnings) report.warnings.push(message);
}

/**
 * Formula for `system.attributes.hp.bonuses.overall` that moves the derived maximum to `target`.
 * `existing` is the formula already on the actor. The result is added to it, so no earlier bonus is lost.
 * Returns `null` when nothing needs to change.
 * @param {{ target: number, derived: number, existing?: string }} args
 * @returns {string|null}
 */
export function hpOverallFormula({ target, derived, existing }) {
    const diff = Math.round(Number(target) - Number(derived));
    if (!Number.isFinite(diff) || diff === 0) return null;
    const base = String(existing ?? '').trim();
    if (!base || base === '0') return String(diff);
    return `(${base}) ${diff < 0 ? '-' : '+'} ${Math.abs(diff)}`;
}

/**
 * Spell slots of one level: maximum, current value and the override needed to reach the maximum.
 * `override` is `null` when dnd5e already computes the same maximum.
 * @param {{ total?: number, filled?: number, derivedMax?: number }} args
 * @returns {{ max: number, value: number, override: number|null }}
 */
export function slotPlan({ total, filled, derivedMax }) {
    const max = Math.max(0, Math.trunc(Number(total) || 0));
    const used = Math.min(max, Math.max(0, Math.trunc(Number(filled) || 0)));
    const derived = Math.max(0, Math.trunc(Number(derivedMax) || 0));
    return { max, value: max - used, override: max === derived ? null : max };
}

/**
 * Target number of slots of one level.
 *
 * On a sheet built by hand, `data.spells` is the final number. On a character built by the LSS wizard
 * (the class has a dataset id), `data.spells` is only the base: LSS lays the class slots and the player's
 * edits on top of it (Guildhall docs/developers/characters.mdx, `spells` row). The class table of dnd5e is
 * the same SRD table, so for such a character the larger of the two numbers is taken: it is right whether
 * an export carries the base or the total.
 * @param {{ lssTotal?: number, bonus?: number, derivedMax?: number, layered?: boolean }} args
 * @returns {number}
 */
export function slotTarget({ lssTotal, bonus, derivedMax, layered }) {
    const lss = Math.max(0, Math.trunc(Number(lssTotal) || 0));
    const derived = Math.max(0, Math.trunc(Number(derivedMax) || 0));
    const base = layered ? Math.max(lss, derived) : lss;
    return base + (Math.trunc(Number(bonus) || 0));
}

/**
 * Split LSS condition keys into the ones dnd5e knows and the rest (reported, not imported).
 * @param {unknown[]} list
 * @returns {{ known: string[], unknown: string[] }}
 */
export function splitConditions(list = []) {
    const known = new Set();
    const unknown = new Set();
    for (const raw of list ?? []) {
        const id = String(raw ?? '').trim().toLowerCase();
        if (!id) continue;
        (CONDITIONS.includes(id) ? known : unknown).add(id);
    }
    return { known: [...known], unknown: [...unknown] };
}

/**
 * Sets the hit points, spell slots, and conditions that dnd5e does not take from the item data.
 * @param {Actor} actor                 Freshly created actor
 * @param {{ targets: object, bonuses: object, layeredSlots: boolean }} args
 *   `layeredSlots`: the character was built by the LSS wizard, see {@link slotTarget}
 * @param {{ warnings: string[] }} report
 */
async function reconcileActor(actor, { targets, bonuses, layeredSlots }, report) {
    const system = actor.system;
    const update = {
        'system.attributes.hp.temp': Math.max(0, Number(targets.hpTemp) || 0),
    };

    // Hit points: the total is corrected through the overall bonus (dnd5e adds it to the derived maximum).
    // Without a maximum in LSS the derived one is kept.
    const lssHpMax = Number(targets.hpMax) || 0;
    const hpTarget = lssHpMax > 0 ? lssHpMax + (Number(bonuses.hpMax) || 0) : null;
    if (hpTarget !== null) {
        const hpOverall = hpOverallFormula({
            target: hpTarget,
            derived: system.attributes.hp.max ?? 0,
            existing: system.attributes.hp.bonuses?.overall,
        });
        if (hpOverall !== null) update['system.attributes.hp.bonuses.overall'] = hpOverall;
        update['system.attributes.hp.value'] = Math.min(Math.max(0, Number(targets.hpCurrent ?? hpTarget) || 0), hpTarget);
    } else {
        note(report, 'В LSS нет максимума HP: оставлен расчёт dnd5e по классу.');
    }

    // Spell slots: the target maximum goes into `override` when dnd5e computes a different number.
    if (layeredSlots) note(report, 'Персонаж собран визардом LSS: ячейки заклинаний взяты по таблице класса dnd5e. Проверьте их на листе.');
    const slotMax = {};
    for (let level = 1; level <= 9; level++) {
        const lss = targets.slots?.[level] ?? {};
        const derivedMax = system.spells?.[`spell${level}`]?.max;
        const plan = slotPlan({
            total: slotTarget({
                lssTotal: lss.total,
                bonus: bonuses.slots?.spell?.[level],
                derivedMax,
                layered: layeredSlots,
            }),
            filled: lss.filled,
            derivedMax,
        });
        update[`system.spells.spell${level}.value`] = plan.value;
        if (plan.override !== null) update[`system.spells.spell${level}.override`] = plan.override;
        slotMax[level] = plan.max;
    }

    // Pact magic: the slot count can be overridden, the slot level comes from the warlock progression.
    const pactLss = targets.pact ?? null;
    const pactTotal = slotTarget({
        lssTotal: pactLss?.total,
        bonus: bonuses.slots?.pact,
        derivedMax: system.spells?.pact?.max,
        layered: layeredSlots,
    });
    let pactMax = null;
    if (pactLss || pactTotal) {
        const plan = slotPlan({ total: pactTotal, filled: pactLss?.filled, derivedMax: system.spells?.pact?.max });
        pactMax = plan.max;
        update['system.spells.pact.value'] = plan.value;
        if (plan.override !== null) update['system.spells.pact.override'] = plan.override;
        const derivedLevel = system.spells?.pact?.level;
        if (pactLss?.level && derivedLevel && Number(pactLss.level) !== Number(derivedLevel)) {
            note(report, `Уровень ячеек договора: LSS ${pactLss.level}, dnd5e ${derivedLevel}. Уровень задаёт класс и не переносится.`);
        }
    }

    // VERIFY IN FOUNDRY: derived data (`system.attributes.hp.max`, `system.spells.*.max`) is already
    // recalculated when `await actor.update()` resolves. The checks below rely on it.
    await actor.update(update);

    // Exhaustion: dnd5e keeps the level in its own effect; updating the actor field makes it sync the effect
    // (dnd5e 5.1.8 documents/actor/actor.mjs:3480-3491). Conditions are plain status toggles.
    // VERIFY IN FOUNDRY: the exhaustion effect (`dnd5eexhaustion0`) appears with `flags.dnd5e.exhaustionLevel`,
    // because dnd5e syncs it in `_onUpdate` without awaiting.
    const { known, unknown } = splitConditions(targets.conditions);
    for (const id of unknown) note(report, `Состояние «${id}» не поддерживается dnd5e и не перенесено.`);

    let exhaustion = Math.max(0, Math.trunc(Number(targets.exhaustion) || 0));
    if (known.includes('exhaustion') && exhaustion === 0) exhaustion = 1;
    if (exhaustion > EXHAUSTION_LEVELS) {
        note(report, `Истощение ${exhaustion} больше максимума dnd5e (${EXHAUSTION_LEVELS}).`);
        exhaustion = EXHAUSTION_LEVELS;
    }
    if (exhaustion > 0) await actor.update({ 'system.attributes.exhaustion': exhaustion });

    for (const id of known) {
        if (id === 'exhaustion') continue;
        await actor.toggleStatusEffect(id, { active: true });
    }

    // Verification: compare what dnd5e now reports with the LSS targets.
    const check = (label, actual, expected) => {
        if (Number(actual) !== Number(expected)) {
            note(report, `Сверка: ${label} в dnd5e ${actual}, в LSS ${expected}. Проверьте лист.`);
        }
    };
    if (hpTarget !== null) check('максимум HP', actor.system.attributes.hp.max, hpTarget);
    for (let level = 1; level <= 9; level++) {
        check(`ячейки ${level} круга (максимум)`, actor.system.spells?.[`spell${level}`]?.max ?? 0, slotMax[level]);
    }
    if (pactMax !== null) check('ячейки договора (максимум)', actor.system.spells?.pact?.max ?? 0, pactMax);
}

/**
 * Create the actor of one character, with its items and effects, and reconcile it.
 *
 * `context` carries the import-wide objects: `ids` (from `createIdMapper`), `spellIndex` (from `createSpellIndex`),
 * `grimoire`, `spellCache`, `index` (shared CompendiumIndex), `randomID`, `folderId`, and `options`
 * (`actorFolder`, `spellFolder`, `classFeatures`, `useAvatar`, `extraSpellPacks`).
 *
 * @param {object} char                  LssCharacter from `core/parse`
 * @param {object} context
 * @param {string|null} [context.folderId]
 * @param {object} context.options
 * @param {object} context.ids
 * @param {object} context.spellIndex
 * @param {object[]} [context.grimoire]
 * @param {Map<string, unknown>} [context.spellCache]
 * @param {import('./compendium-index.mjs').CompendiumIndex} [context.index]
 * @param {(length: number) => string} [context.randomID]
 * @param {{ warnings: string[], missingSpells: string[], customSpells: string[] }} report
 * @returns {Promise<Actor>}
 */
export async function writeActor(char, context, report) {
    const { folderId = null, options = {}, ids, spellIndex, grimoire = [], spellCache, index } = context;
    const randomID = context.randomID ?? ((length) => foundry.utils.randomID(length));
    const edition = char.edition === '2014' ? '2014' : '2024';

    const stats = computeStats(char);
    const mapped = mapActor(char, stats, { randomID, options: { useAvatar: Boolean(options.useAvatar) } });
    const bonuses = mapBonuses(char, stats, { randomID });
    const weapons = mapWeapons(char, stats, bonuses.weapon, { randomID });
    const resources = mapResources(char, stats, { randomID });
    for (const message of [...mapped.warnings, ...bonuses.warnings, ...weapons.warnings, ...resources.warnings]) {
        note(report, message);
    }
    for (const skipped of bonuses.skipped) {
        note(report, `Бонус «${skipped.label}» (${skipped.target}) не перенесён: ${skipped.reason}.`);
    }

    const origin = await buildOriginItems(char, {
        edition,
        includeFeatures: options.classFeatures !== false,
        ids,
        randomID,
        index,
    }, report);

    const resolved = resolveSpellRefs(char, spellIndex);
    for (const message of resolved.warnings) note(report, message);
    const spellItems = await buildSpellItems(char, resolved.refs, {
        edition,
        classIdentifier: origin.classIdentifier,
        grimoire,
        extraPacks: options.extraSpellPacks ?? [],
        spellFolderName: options.spellFolder,
        cache: spellCache,
        index,
        randomID,
    }, report);

    const system = foundry.utils.deepClone(mapped.system);
    system.details = {
        ...(system.details ?? {}),
        race: origin.details.race,
        background: origin.details.background,
        originalClass: origin.details.originalClass,
    };

    const data = {
        name: mapped.name,
        type: 'character',
        folder: folderId,
        system,
        items: [...origin.items, ...weapons.items, ...resources.items, ...spellItems],
        effects: bonuses.effects,
        prototypeToken: {
            name: mapped.name,
            actorLink: true,
            disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        },
        flags: {
            [FLAG_SCOPE]: {
                imported: true,
                source: {
                    fileName: char.fileName ?? '',
                    edition,
                    playerName: char.data?.info?.playerName?.value ?? '',
                    importedAt: new Date().toISOString(),
                    // VERIFY IN FOUNDRY: `game.modules.get(id).version` is the installed module version.
                    moduleVersion: game.modules?.get(MODULE_ID)?.version ?? '',
                },
            },
        },
    };
    if (mapped.img) {
        data.img = mapped.img;
        data.prototypeToken.texture = { src: mapped.img };
    }

    // keepEmbeddedIds: items keep the ids they got above, so `details.*` and `value.added` stay valid.
    // Server side (dist/database/backend/server-document.mjs, _generateEmbeddedDocumentIds) keeps ids unless false.
    // VERIFY IN FOUNDRY: the ids of the created items and effects match the ones written in `data`.
    const actor = await foundry.documents.Actor.implementation.create(data, { keepEmbeddedIds: true });
    await reconcileActor(actor, {
        targets: mapped.targets,
        bonuses,
        layeredSlots: Boolean(char.data?.info?.charClass?.id) && Boolean(origin.classItem),
    }, report);
    return actor;
}
