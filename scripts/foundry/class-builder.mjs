/**
 * Origin items of a character: race, background, class, subclass and the features they grant.
 *
 * dnd5e does not run advancement when items are created through the API
 * (docs/research/dnd5e-5.1.8-data-model.md §5.2), so this module writes what the sheet would
 * have written: copies of compendium items with pre-assigned ids, `levels`, HitPoints values,
 * `Subclass.value` and the automatic ItemGrant features.
 */

import { FLAG_SCOPE, PACKS } from '../constants.mjs';
import { CompendiumIndex, packIdsFor } from './compendium-index.mjs';

/** Types an ItemGrant may hand out (dnd5e `ItemGrantAdvancement.VALID_TYPES`, data-model §5.4). Spells are excluded. */
const GRANTABLE_TYPES = new Set(['feat', 'consumable', 'container', 'equipment', 'loot', 'tool', 'weapon']);

const HIT_DICE = new Set(['d4', 'd6', 'd8', 'd10', 'd12']);

/**
 * Clamp a character level into the 1..20 range.
 * @param {unknown} value
 * @returns {number}
 */
export function clampLevel(value) {
    const level = Math.trunc(Number(value));
    if (!Number.isFinite(level)) return 1;
    return Math.min(20, Math.max(1, level));
}

/**
 * HitPoints advancement values for a class: the first level takes the maximum of the die, the rest the average
 * (docs/DESIGN.md §4.2). The total is corrected to the LSS value later, in the actor writer.
 * @param {number} levels  Class levels
 * @returns {Record<string, 'max'|'avg'>}
 */
export function hitPointsValue(levels) {
    const value = {};
    for (let level = 1; level <= levels; level++) value[level] = level === 1 ? 'max' : 'avg';
    return value;
}

/**
 * Hit die from LSS text (`d8`, `D10`). Anything else (`multiclass`, empty) gives `null`.
 * @param {unknown} text
 * @returns {'d4'|'d6'|'d8'|'d10'|'d12'|null}
 */
export function hitDieDenomination(text) {
    const die = String(text ?? '').trim().toLowerCase();
    return HIT_DICE.has(die) ? die : null;
}

/**
 * Hit dice spent on a single-class character: levels minus the dice left in LSS (`hp-dice-current`).
 * @param {number} levels
 * @param {unknown} current  `vitality['hp-dice-current'].value`
 * @returns {number|null}    `null` when LSS has no usable value
 */
export function hitDiceSpent(levels, current) {
    const left = Number(current);
    if (current === null || current === undefined || current === '' || !Number.isFinite(left)) return null;
    return Math.min(levels, Math.max(0, levels - left));
}

/**
 * Whether dnd5e would apply an ItemGrant without asking the player. Mirrors
 * `ItemGrantAdvancement#automaticApplicationValue` (dnd5e 5.1.8, documents/advancement/item-grant.mjs:117-125).
 * @param {{ optional?: boolean, items?: { optional?: boolean }[], spell?: { ability?: unknown } | null }} configuration
 * @returns {boolean}
 */
export function isAutomaticGrant(configuration) {
    if (!configuration || configuration.optional) return false;
    const abilities = configuration.spell?.ability;
    const abilityCount = abilities?.size ?? abilities?.length ?? 0;
    if (abilityCount > 1) return false;
    return !(configuration.items ?? []).some((item) => item.optional);
}

/**
 * Whether a grant at `grantLevel` is due for this character.
 * - `origin` (race, background): only level 0 grants.
 * - `class` and `subclass`: grants up to the class level. A subclass grant stores the class level, not its own.
 * @param {'class'|'subclass'|'origin'} kind
 * @param {number} grantLevel
 * @param {number} classLevel
 * @returns {boolean}
 */
export function grantLevelApplies(kind, grantLevel, classLevel) {
    const level = Number(grantLevel ?? 0);
    if (kind === 'origin') return level === 0;
    return level >= 1 && level <= classLevel;
}

/**
 * `advancementOrigin` as dnd5e writes it: `<parent item id>.<advancement id>`.
 * @param {string} parentId
 * @param {string} advancementId
 * @returns {string}
 */
export function advancementOrigin(parentId, advancementId) {
    return `${parentId}.${advancementId}`;
}

/**
 * Turn off the transferred effects of a granted feature. Their numbers are already in the LSS bonuses,
 * so keeping them active would count them twice (docs/DESIGN.md §4.2). Only `transfer: true` effects are
 * changed; effects that are applied by an activity stay as they are.
 * @param {object[]|undefined} effects  Effect sources of the copied item
 * @returns {{ effects: object[], disabled: number }}
 */
export function disableTransferEffects(effects = []) {
    let disabled = 0;
    const result = (effects ?? []).map((effect) => {
        if (effect?.transfer !== true) return effect;
        disabled++;
        return {
            ...effect,
            disabled: true,
            flags: {
                ...(effect.flags ?? {}),
                [FLAG_SCOPE]: { ...(effect.flags?.[FLAG_SCOPE] ?? {}), imported: true, disabledFeatureEffect: true },
            },
        };
    });
    return { effects: result, disabled };
}

/**
 * Add a line to the import report, if there is a report.
 * @param {{ warnings: string[] }|undefined} report
 * @param {string} message
 */
function note(report, message) {
    if (report?.warnings) report.warnings.push(message);
}

/**
 * Resolve a UUID to a Document. A missing or broken UUID gives `null` instead of an exception.
 * @param {string} uuid
 * @returns {Promise<Document|null>}
 */
async function resolveUuid(uuid) {
    try {
        return (await foundry.utils.fromUuid(uuid)) ?? null;
    } catch (error) {
        console.warn(`lss-to-foundry | Не удалось открыть ${uuid}`, error);
        return null;
    }
}

/**
 * Copy of an origin item from an index reference, with a pre-assigned id.
 * @param {CompendiumIndex} index
 * @param {{ uuid: string }} reference
 * @param {(length: number) => string} randomID
 * @returns {Promise<object|null>}
 */
async function copyOriginItem(index, reference, randomID) {
    const source = await index.getSource(reference);
    if (!source) return null;
    source._id = randomID(16);
    source._stats = { ...(source._stats ?? {}), compendiumSource: reference.uuid };
    return source;
}

/**
 * Copies of the automatic ItemGrant features of one parent item (class, subclass, race or background).
 * Updates `value.added` of each ItemGrant in the parent copy, as dnd5e does in `ItemGrantAdvancement#apply`.
 * @param {object} parent                 Parent item source (a copy, mutated)
 * @param {object} options
 * @param {'class'|'subclass'|'origin'} options.kind
 * @param {number} options.classLevel
 * @param {(length: number) => string} options.randomID
 * @param {{ warnings: string[] }} [options.report]
 * @returns {Promise<object[]>}           Feature item sources
 */
export async function grantFeatures(parent, { kind, classLevel, randomID, report }) {
    const granted = [];
    const parentName = parent.name ?? '';
    const advancement = Array.isArray(parent.system?.advancement) ? parent.system.advancement : [];

    for (const adv of advancement) {
        if (adv?.type !== 'ItemGrant') continue;
        const level = Number(adv.level ?? 0);
        if (!grantLevelApplies(kind, level, classLevel)) continue;

        const configuration = adv.configuration ?? {};
        if (!isAutomaticGrant(configuration)) {
            note(report, `${parentName}: выбор особенностей на уровне ${level} не перенесён. Выберите его вручную на листе.`);
            continue;
        }

        const added = {};
        let disabledEffects = 0;
        for (const { uuid } of configuration.items ?? []) {
            const feature = await resolveUuid(uuid);
            if (!feature) {
                note(report, `${parentName}: особенность ${uuid} не найдена в компендиуме.`);
                continue;
            }
            if (feature.type === 'spell') {
                note(report, `${parentName}: заклинание «${feature.name}» из особенности не перенесено: заклинания берутся из LSS.`);
                continue;
            }
            if (!GRANTABLE_TYPES.has(feature.type)) {
                note(report, `${parentName}: особенность «${feature.name}» типа ${feature.type} не поддерживается.`);
                continue;
            }

            const id = randomID(16);
            const data = feature.toObject();
            delete data.flags?.babele;
            data._id = id;
            data._stats = { ...(data._stats ?? {}), compendiumSource: uuid };
            data.flags = {
                ...(data.flags ?? {}),
                dnd5e: {
                    ...(data.flags?.dnd5e ?? {}),
                    sourceId: uuid,
                    advancementOrigin: advancementOrigin(parent._id, adv._id),
                    // The root is inherited from the parent when the parent is itself a granted feature.
                    advancementRoot: parent.flags?.dnd5e?.advancementRoot ?? advancementOrigin(parent._id, adv._id),
                },
            };
            const effects = disableTransferEffects(data.effects);
            data.effects = effects.effects;
            disabledEffects += effects.disabled;

            added[id] = uuid;
            granted.push(data);
        }

        if (disabledEffects) {
            note(report, `${parentName}: эффекты особенностей (${disabledEffects}) выключены, их бонусы уже учтены из LSS.`);
        }
        if (Object.keys(added).length) {
            adv.value = { ...(adv.value ?? {}), added: { ...(adv.value?.added ?? {}), ...added } };
        }
    }
    return granted;
}

/**
 * Build the origin items of a character.
 *
 * Identifiers come from `ids` (the mapper from `core/ids.mjs`); the compendium lookup is done by
 * `system.identifier` with the packs of the edition. The returned items are not yet written to the actor:
 * `writeActor` puts them into `Actor.create`.
 *
 * @param {object} char                         LssCharacter from `core/parse`
 * @param {object} options
 * @param {'2014'|'2024'} options.edition
 * @param {boolean} [options.includeFeatures=true]  Copy the automatic ItemGrant features
 * @param {object} options.ids                  Mapper from `createIdMapper` (`mapClass`, `mapSubclass`, `describeRace`, `mapBackground`)
 * @param {(length: number) => string} [options.randomID]  Id generator; defaults to `foundry.utils.randomID`
 * @param {CompendiumIndex} [options.index]     Shared index for the import; built here when missing
 * @param {{ warnings: string[] }} [report]     Import report for the current character
 * @returns {Promise<{ items: object[], classItem: object|null, classIdentifier: string,
 *   details: { race: string, background: string, originalClass: string } }>}
 */
export async function buildOriginItems(char, options, report) {
    const edition = options.edition === '2014' ? '2014' : '2024';
    const includeFeatures = options.includeFeatures !== false;
    const randomID = options.randomID ?? ((length) => foundry.utils.randomID(length));
    const { ids } = options;
    const index = options.index ?? (await CompendiumIndex.build(packIdsFor(edition)));
    const packs = PACKS[edition];
    const data = char.data ?? {};
    const info = data.info ?? {};
    const classLevel = clampLevel(char.level ?? info.level?.value);

    const items = [];
    const details = { race: '', background: '', originalClass: '' };

    // Race. Level 0 features are granted below, as the sheet does on creation.
    const raceName = info.race?.value ?? '';
    let raceIdentifier = null;
    if (raceName || info.race?.id) {
        // describeRace explains each fallback (unknown subrace, race without its own item, ...).
        const described = ids.describeRace(
            info.race?.id ?? null, raceName, info.subrace?.id ?? null, info.subrace?.value ?? '', edition,
        );
        raceIdentifier = described.identifier;
        for (const message of described.warnings) note(report, `Вид «${raceName}»: ${message}.`);
    }
    let race = null;
    if (raceIdentifier) {
        const ref = index.findByIdentifier(raceIdentifier, { types: ['race'], packIds: packs.races });
        if (ref) race = await copyOriginItem(index, ref, randomID);
        if (!race) note(report, `Вид «${raceName}» (${raceIdentifier}) не найден в компендиумах dnd5e.`);
    }

    // Background.
    const backgroundName = info.background?.value ?? '';
    const backgroundIdentifier = ids.mapBackground(info.background?.id ?? null, backgroundName, edition);
    let background = null;
    if (backgroundIdentifier) {
        const ref = index.findByIdentifier(backgroundIdentifier, { types: ['background'], packIds: packs.backgrounds });
        if (ref) background = await copyOriginItem(index, ref, randomID);
        if (!background) note(report, `Предыстория «${backgroundName}» (${backgroundIdentifier}) не найдена в компендиумах dnd5e.`);
    } else if (backgroundName) {
        note(report, `Предыстория «${backgroundName}» не сопоставлена с dnd5e.`);
    }

    // Class. LSS keeps one class; a multiclass character imports its main class only.
    const className = info.charClass?.value ?? '';
    const classIdentifier = className ? ids.mapClass(info.charClass?.id ?? null, className, edition) : null;
    let classItem = null;
    let subclass = null;
    // LSS keeps a hit-dice pool per die type; more than one die type means more than one class.
    if (Object.keys(data.vitality?.['hp-dice-multi'] ?? {}).length > 1) {
        note(report, 'Мультикласс не поддерживается: импортирован только основной класс из LSS.');
    }
    if (classIdentifier) {
        const ref = index.findByIdentifier(classIdentifier, { types: ['class'], packIds: packs.classes });
        classItem = ref ? await copyOriginItem(index, ref, randomID) : null;
        if (!classItem) note(report, `Класс «${className}» (${classIdentifier}) не найден в компендиумах dnd5e.`);
    } else if (className) {
        note(report, `Класс «${className}» не сопоставлен с dnd5e. Классовые особенности и ячейки не перенесены.`);
    }

    if (classItem) {
        const hitDie = hitDieDenomination(data.vitality?.['hit-die']?.value);
        classItem.system.levels = classLevel;
        if (hitDie) classItem.system.hd = { ...(classItem.system.hd ?? {}), denomination: hitDie };
        // VERIFY IN FOUNDRY: `hd.spent` is the number of dice used (levels minus `hp-dice-current`), data-model §2.2.
        const spent = hitDiceSpent(classLevel, data.vitality?.['hp-dice-current']?.value);
        if (spent !== null) classItem.system.hd = { ...(classItem.system.hd ?? {}), spent };

        // Subclass: found by its identifier, then recorded in the class advancement.
        const subclassName = info.charSubclass?.value ?? '';
        if (subclassName) {
            const subclassIdentifier = ids.mapSubclass(info.charSubclass?.id ?? null, subclassName, classIdentifier, edition);
            const ref = subclassIdentifier
                ? index.findByIdentifier(subclassIdentifier, { types: ['subclass'], packIds: packs.subclasses })
                : null;
            if (ref) {
                subclass = await copyOriginItem(index, ref, randomID);
                subclass.system.classIdentifier = classIdentifier;
            } else {
                note(report, `Подкласс «${subclassName}» не найден в компендиумах dnd5e.`);
            }
        }

        for (const adv of classItem.system.advancement ?? []) {
            if (adv?.type === 'HitPoints') adv.value = hitPointsValue(classLevel);
            if (adv?.type === 'Subclass' && subclass) {
                adv.value = { document: subclass._id, uuid: subclass._stats.compendiumSource };
            }
        }
        details.originalClass = classItem._id;
    }

    // Items in the order the sheet would show them. Grants go after their parent.
    if (race) {
        details.race = race._id;
        items.push(race);
    }
    if (background) {
        details.background = background._id;
        items.push(background);
    }
    if (classItem) items.push(classItem);
    if (subclass) items.push(subclass);

    if (includeFeatures) {
        if (race) items.push(...await grantFeatures(race, { kind: 'origin', classLevel, randomID, report }));
        if (background) items.push(...await grantFeatures(background, { kind: 'origin', classLevel, randomID, report }));
        if (classItem) items.push(...await grantFeatures(classItem, { kind: 'class', classLevel, randomID, report }));
        if (subclass) items.push(...await grantFeatures(subclass, { kind: 'subclass', classLevel, randomID, report }));
    }

    return {
        items,
        classItem,
        classIdentifier: classItem ? classIdentifier : '',
        details,
    };
}
