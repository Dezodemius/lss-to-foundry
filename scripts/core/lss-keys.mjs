/**
 * Key tables between the LSS character format and dnd5e 5.1.8.
 * Sources: LSS schema (test/fixtures/lss/character.schema.json) and
 * docs/research/dnd5e-5.1.8-data-model.md.
 */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** LSS skill key (spaces are part of the persisted key) → dnd5e skill id. */
export const SKILLS = {
    athletics: 'ath',
    acrobatics: 'acr',
    'sleight of hand': 'slt',
    stealth: 'ste',
    arcana: 'arc',
    history: 'his',
    investigation: 'inv',
    nature: 'nat',
    religion: 'rel',
    'animal handling': 'ani',
    insight: 'ins',
    medicine: 'med',
    perception: 'prc',
    survival: 'sur',
    deception: 'dec',
    intimidation: 'itm',
    performance: 'prf',
    persuasion: 'per',
};

/** Skills that exist only in the «Adventures in Middle-earth» templates and have no dnd5e counterpart. */
export const AIME_ONLY_SKILLS = ['riddle', 'shadow-lore'];

/** LSS `info.size.value` → dnd5e `traits.size`. */
export const SIZES = {
    tiny: 'tiny',
    small: 'sm',
    medium: 'med',
    large: 'lg',
    huge: 'huge',
    gargantuan: 'grg',
};

/** LSS `prof.*` checkboxes → dnd5e `traits.armorProf` / `traits.weaponProf` values. */
export const ARMOR_PROFS = {
    'armor-light': 'lgt',
    'armor-medium': 'med',
    'armor-heavy': 'hvy',
    'armor-label': 'shl',
};

export const WEAPON_PROFS = {
    'weapon-simple': 'sim',
    'weapon-martial': 'mar',
};

/** LSS coin keys are the same as dnd5e currency keys. */
export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'];

/**
 * Damage type stems. LSS stores the type as free text in the player's language
 * ("дробящий", "колющий", "огонь"), so we match by stem rather than by exact word.
 * Order matters: the first matching stem wins.
 */
const DAMAGE_TYPE_STEMS = [
    ['bludgeoning', ['дроб', 'bludgeon']],
    ['piercing', ['колющ', 'колю', 'pierc']],
    ['slashing', ['рубящ', 'рубя', 'slash']],
    ['fire', ['огн', 'огон', 'пламен', 'fire']],
    ['cold', ['холод', 'мороз', 'cold']],
    ['acid', ['кисл', 'acid']],
    ['poison', ['яд', 'отрав', 'poison']],
    ['necrotic', ['некрот', 'necrot']],
    ['radiant', ['излуч', 'лучист', 'свет', 'radiant']],
    ['force', ['силов', 'force']],
    ['lightning', ['электр', 'молни', 'lightning']],
    ['thunder', ['гром', 'звук', 'thunder']],
    ['psychic', ['психи', 'psychic']],
    ['healing', ['лечен', 'исцел', 'heal']],
];

/**
 * Damage types mentioned in free text, in order of appearance in the stem table.
 * @param {string} text
 * @returns {string[]} dnd5e damage type ids, without duplicates
 */
export function damageTypesFromText(text) {
    const lower = String(text ?? '').toLowerCase();
    if (!lower.trim()) return [];
    const found = [];
    for (const [type, stems] of DAMAGE_TYPE_STEMS) {
        if (stems.some((stem) => lower.includes(stem)) && !found.includes(type)) found.push(type);
    }
    return found;
}

/** dnd5e 5.1.8 condition ids (`CONFIG.DND5E.conditionTypes`). LSS keys outside this list are reported, not imported. */
export const CONDITIONS = [
    'bleeding', 'blinded', 'burning', 'charmed', 'cursed', 'dehydration', 'deafened', 'diseased',
    'exhaustion', 'falling', 'frightened', 'grappled', 'incapacitated', 'invisible', 'malnutrition',
    'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'silenced', 'stunned', 'suffocation',
    'surprised', 'transformed', 'unconscious',
];
