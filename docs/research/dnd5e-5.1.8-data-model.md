# dnd5e 5.1.8: модель данных для программного создания персонажа

Состояние на 22.10.2026. Foundry не запускалась, в каталог данных Foundry ничего не писалось.

## 0. Источники и легенда

- **Исходники.** Тег `release-5.1.8` репозитория `foundryvtt/dnd5e`, архив `https://codeload.github.com/foundryvtt/dnd5e/tar.gz/refs/tags/release-5.1.8`. Распакован в scratchpad: `C:\Users\gladk\AppData\Local\Temp\claude\F--\95661564-12af-4309-96e1-17d00d964db2\scratchpad\dnd5e-511\dnd5e-release-5.1.8\`. В ссылках ниже `module/...:N` — путь относительно этого каталога.
- **Сверка версии.** `F:\Files\Foundry VTT\UserDate\Data\systems\dnd5e\system.json`: `"version": "5.1.8"`. Скомпилированный `dnd5e.mjs` не сверялся побайтно.
- **Ядро Foundry 13.348** (только чтение): `F:\Files\Foundry VTT\Foundry Virtual Tabletop\resources\app\client\data\client-backend.mjs` (порядок создания документов, строки 76–120) и `...\resources\app\common\abstract\data.mjs` (`_initializeSource`, строки 255–265).
- **Компендиумы.** Читались YAML из `packs/_source/**` через `js-yaml` (библиотека чужого проекта `C:\Users\gladk\Videos\dragon-eye-remotion\node_modules\js-yaml`, использована только для чтения). Скомпилированные LevelDB-паки в `F:\Files\Foundry VTT\UserDate\Data\systems\dnd5e\packs\` не разбирались: значения Snappy-сжаты.

Метки:
- ✅ проверено по исходнику (путь и строка указаны);
- ⚠️ выведено из кода, в живой Foundry не проверено;
- ❓ не проверено.

## 0.1 Главное для модуля

1. **Программное создание не запускает advancement.** `AdvancementManager` вызывается только из листов (`module/applications/actor/api/base-actor-sheet.mjs:1215, 1856`, `character-sheet.mjs:1262`). Класс с `levels: 5` даёт уровень, бонус мастерства и ячейки, но **не** даёт HP, особенности, ASI, подкласс и владения. Всё это модуль должен записать сам (раздел 5). ✅
2. **Заклинания.** Способ подготовки в 5.1.8 — это `system.method` (ключ из `CONFIG.DND5E.spellcasting`) плюс `system.prepared` (0/1/2) плюс `system.sourceClass`. Поля `preparation.mode`/`preparation.prepared` устарели (раздел 2.13). ✅
3. **Активности не создаются автоматически.** У оружия и заклинаний без явного `system.activities` атаки и каста не будет. Миграция, которая создаёт активности, срабатывает только на исходных данных с `_id` и legacy-полями (раздел 3.1). ✅
4. **Ссылки на предметы — это `_id`.** `details.race`, `details.background`, `details.originalClass` хранят `_id` предметов, а не `identifier`. ✅
5. **HP.** Если `attributes.hp.max` = `null`, максимум считается из `HitPoints`-advancement классов. Если число — это override. `attributes.hp.value` хранится в исходных данных и при создании должен быть выставлен явно. ✅
6. **Правила мира.** Настройка `game.settings` `dnd5e.rulesVersion`: `"modern"` (2024, по умолчанию) или `"legacy"` (2014). ✅

---

## 1. Актёр `character`

Тип: `"character"`. Схема: `module/data/actor/character.mjs:100` (`defineSchema`), `CharacterData extends CreatureTemplate` (`templates/creature.mjs`) → `CommonTemplate` (`templates/common.mjs`) → `CurrencyTemplate`. Поля `system` — ниже. Все не указанные поля заполняются `initial` схемы.

### 1.1 Скелет

```json
{
  "name": "Имя персонажа",
  "type": "character",
  "system": {
    "abilities": {
      "str": { "value": 16, "proficient": 1 },
      "dex": { "value": 14, "proficient": 0 },
      "con": { "value": 15, "proficient": 1 },
      "int": { "value": 8, "proficient": 0 },
      "wis": { "value": 12, "proficient": 0 },
      "cha": { "value": 10, "proficient": 0 }
    },
    "attributes": {
      "ac": { "calc": "default" },
      "hp": { "value": 12, "max": null, "temp": 0, "tempmax": 0, "bonuses": { "level": "", "overall": "" } },
      "death": { "success": 0, "failure": 0, "bonuses": { "save": "" } },
      "inspiration": false,
      "init": { "ability": "", "bonus": "" },
      "movement": { "walk": null },
      "senses": { "darkvision": null },
      "spellcasting": "cha",
      "exhaustion": 0,
      "concentration": { "ability": "", "bonuses": { "save": "" }, "limit": 1 },
      "attunement": { "max": 3 }
    },
    "bastion": { "name": "", "description": "" },
    "details": {
      "alignment": "ng",
      "background": "<_id предыстории>",
      "race": "<_id расы>",
      "originalClass": "<_id первого класса>",
      "xp": { "value": 0 },
      "biography": { "value": "", "public": "" },
      "appearance": "",
      "trait": "",
      "ideal": "",
      "bond": "",
      "flaw": "",
      "gender": "", "eyes": "", "height": "", "faith": "", "hair": "", "skin": "", "age": "", "weight": ""
    },
    "skills": { "acr": { "value": 0 }, "ath": { "value": 1 } },
    "tools": { "smith": { "value": 1 } },
    "traits": {
      "size": "med",
      "di": { "value": [], "custom": "", "bypasses": [] },
      "dr": { "value": [], "custom": "", "bypasses": [] },
      "dv": { "value": [], "custom": "", "bypasses": [] },
      "ci": { "value": [], "custom": "" },
      "languages": { "value": ["common"], "custom": "", "communication": {} },
      "weaponProf": { "value": ["sim", "mar"], "custom": "", "mastery": { "value": [], "bonus": [] } },
      "armorProf": { "value": ["lgt", "med", "shl"], "custom": "" }
    },
    "currency": { "pp": 0, "gp": 15, "ep": 0, "sp": 0, "cp": 0 },
    "spells": { "spell1": { "value": 4 }, "spell2": { "value": 3 }, "pact": { "value": 0 } },
    "resources": {
      "primary": { "value": 0, "max": 0, "sr": false, "lr": false, "label": "" }
    },
    "bonuses": {
      "mwak": { "attack": "", "damage": "" }, "rwak": { "attack": "", "damage": "" },
      "msak": { "attack": "", "damage": "" }, "rsak": { "attack": "", "damage": "" },
      "abilities": { "check": "", "save": "", "skill": "" },
      "spell": { "dc": "" }
    },
    "favorites": []
  }
}
```

Замечания к скелету:
- `attributes.hp.max: null` — HP считается из advancement (раздел 5.3). Если нужен фиксированный максимум, пишется число.
- `attributes.spellcasting` — ключ способности (`"cha"`, `"int"` …). Если пусто, его заполнит `_onCreate` класса с заклинаниями (`module/data/item/class.mjs:275-290`).
- `spells.spellN.value` — **текущие** ячейки, а не максимум (раздел 1.8).
- `movement.walk: null` и `senses.darkvision: null` — не трогать, если есть раса: раса подставляет скорость и чувства только когда значение актёра `null` (раздел 1.3, `attributes.mjs:456-470`).

### 1.2 `abilities` ✅

- Ключи: `str, dex, con, int, wis, cha` (+ `hon, san` — только для NPC/техники; для персонажа не нужны). Конфиг: `module/config.mjs:46-123`.
- `value` — базовое значение, **хранится** в исходных данных (`common.mjs:35-55`). ASI и расы пишут сюда же (раздел 5.7).
- `proficient` — 0 или 1 (владение спасброском). `max` — `null` → 20 при подготовке (`common.mjs`, `prepareAbilities`, `common.mjs:168`).
- `bonuses.check`, `bonuses.save` — формулы (строки).
- Производные (не писать): `mod`, `save`, `dc`, `attack`, `checkProf`, `saveProf`.

### 1.3 `attributes` ✅

| Поле | Тип / значения | Источник |
|---|---|---|
| `ac.calc` | `"flat"`, `"natural"`, `"default"` (по умолчанию), `"mage"`, `"draconic"`, `"unarmoredMonk"`, `"unarmoredBarb"`, `"unarmoredBard"`, `"custom"` | `config.mjs:1754-1800`; `attributes.mjs:34-45` |
| `ac.flat` | число ≥0; используется для `flat` и `natural` | `attributes.mjs:34-45` |
| `ac.formula` | формула; используется для `custom` | `attributes.mjs:34-45`, `prepareArmorClass` 159-250 |
| `hp.value` | текущие HP (хранятся) | `character.mjs:105-112` |
| `hp.max` | `null` = считать из advancement; число = override | `character.mjs:113-117`; `attributes.mjs:357-368` |
| `hp.temp`, `hp.tempmax` | число | `character.mjs:118-121` |
| `hp.bonuses.level`, `hp.bonuses.overall` | формулы | `character.mjs:120-124` |
| `death.success`, `death.failure` | целые ≥0 | `character.mjs:122-133` |
| `death.bonuses.save` | формула | `character.mjs:130` |
| `inspiration` | boolean | `character.mjs:134` |
| `init.ability`, `init.bonus` | ключ способности (`""` = `dex`), формула | `attributes.mjs:54-75` |
| `movement.{walk,burrow,climb,fly,swim}` | число или `null` (по умолчанию) | `shared/movement-field.mjs:27-34` |
| `movement.units`, `movement.hover` | `"ft"`/`"m"` (зависит от настроек), boolean | `movement-field.mjs:35-38`; `utils.mjs:687-690` |
| `senses.{darkvision,blindsight,tremorsense,truesight}` | число или `null`; `special`, `units` | `shared/senses-field.mjs:18-28` |
| `spellcasting` | ключ способности заклинаний | `attributes.mjs:84-110` |
| `exhaustion` | **производное** (см. раздел 9) | `attributes.mjs:340-346` |
| `concentration.{ability,bonuses.save,limit}` | `limit` по умолчанию 1 | `attributes.mjs:84-110` |
| `attunement.max` | по умолчанию 3; `value` — производное | `attributes.mjs:84-110`; `character.mjs:205` |
| `bastion` | `{ name, description }` — объект верхнего уровня `system.bastion` | `character.mjs:136-139` |

Производные значения (не писать): `prof`, `details.level`, `hp.effectiveMax`, `hp.damage`, `hp.pct`, `ac.value`, `ac.base`, `encumbrance.*`, `spell.{dc,attack,mod}`, `hd.*`, `xp.{max,min,pct}`.

**Максимум HP.** Раздел 5.3.

### 1.4 `details` ✅

- `alignment` — строка. Ключи: `lg, ng, cg, ln, tn, cn, le, ne, ce` (`config.mjs:310-319`). В схеме — произвольная `StringField` (`details.mjs:36`).
- `biography.value`, `biography.public` — HTML (`details.mjs:20-30`).
- `background` — `_id` предмета-предыстории (`LocalDocumentField`, `character.mjs:143`). Заполняется `_onCreate` предыстории (`background.mjs:83-89`).
- `race` — `_id` предмета-расы (`details.mjs:38-41`). Заполняется `_onCreate` расы (`race.mjs:185-190`).
- `originalClass` — `_id` предмета первого класса, **не** `identifier` (`character.mjs:146`; `class.mjs:275-290`).
- `xp.value` — целое ≥0 (`character.mjs:147`).
- Текстовые поля: `appearance`, `trait` (личностные черты — **поле называется `trait`**, не `traits`), `ideal`, `bond`, `flaw`, `gender`, `eyes`, `height`, `faith`, `hair`, `skin`, `age`, `weight` (`character.mjs:140-170`).
- Производное: `details.level` (сумма `levels` классов, `character.mjs:208`), `details.type` (тип существа из расы, `character.mjs:240-255`).

### 1.5 `skills` и `tools` ✅

**`skills`** — ключи `acr ani arc ath dec his ins itm inv med nat prc prf per rel slt ste sur` (`config.mjs:151-297`). Значения по умолчанию у `ability` (способность) задаются в конфиге.

```json
{ "skills": { "ath": { "value": 1, "ability": "str", "bonuses": { "check": "", "passive": "" } } } }
```

- `value` — 0, 0.5, 1 или 2 (`creature.mjs:45-56`). Trait-advancement пишет 1 (владение) или 2 (компетентность) (раздел 5.6).
- `ability`, `bonuses.check`, `bonuses.passive`, `roll.{min,max,mode}`. Производные: `mod`, `bonus`, `total`, `passive`, `prof`, `proficient`, `effectValue`.

**`tools`** — ключи id инструментов из `DND5E.tools` (`config.mjs:724-875`, например `smith`, `thief`, `alchemist`, `pois`, `forg`). Структура: `{ value, ability, bonuses: { check } }` (`creature.mjs:58-66`). Значение по умолчанию `ability` — `"int"`.

### 1.6 `traits` ✅

- `size` — `tiny, sm, med, lg, huge, grg`, по умолчанию `"med"` (`config.mjs:1261-1316`; `traits.mjs:51-60`).
- `di`, `dr`, `dv` — `{ value: Set<string>, custom: string, bypasses: Set }` (`traits.mjs:51-60`). Типы урона: `acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder` (`config.mjs:2413`).
- `ci` — `{ value: Set, custom }` (состояния; `config.mjs:4019`).
- `dm` — `{ amount: { <type>: formula }, bypasses: Set }`.
- `languages` — `{ value: Set, custom, communication: { <type>: { value, units } } }` (`traits.mjs:75-86`). В `value` хранится **последний сегмент** ключа: `"common"`, `"dwarvish"`, `"primordial"`… (`actor/trait.mjs`, `Trait.changeKeyPath`, `documents/advancement/trait.mjs:111-134`). Полный список ключей: `config.mjs:4302-4356` (стандартные: common, draconic, dwarvish, elvish, giant, gnomish, goblin, halfling, orc, sign; экзотические: aarakocra, abyssal, cant, celestial, deep, druidic, gith, gnoll, infernal, sylvan, undercommon; примордиальные: aquan, auran, ignan, terran).
- `weaponProf` — `{ value: Set, custom, mastery: { value: Set, bonus: Set } }` (`character.mjs:166-172`). Значения: `sim`, `mar`, либо id конкретного оружия (`config.mjs:372-375`, `470-508`). Мастерства: `cleave, graze, nick, push, sap, slow, topple, vex` (`config.mjs:391-419`).
- `armorProf` — `{ value: Set, custom }`. Значения: `lgt, med, hvy, shl` (`config.mjs:1700-1704`).
- Производное: `languages.labels`, `ci`-удаление статусов при петрификации (`traits.mjs:136`).

### 1.7 `currency` ✅

`{ pp, gp, ep, sp, cp }` — целые ≥0 (`shared/currency.mjs:14-17`). Курсы относительно gp: pp 0.1, gp 1, ep 2, sp 10, cp 100 (`config.mjs:2225-2255`).

### 1.8 `spells` — ячейки заклинаний ✅

- Ключи: `spell1 … spell9`, `pact` (`creature.mjs:67-80`; `_spellLevels` `creature.mjs:99-104`).
- Поля: `value` (текущие доступные ячейки), `override` (переопределение максимума).
- Максимум `max` и `level` вычисляются: `spellcasting-model.mjs:331-344` (`SingleLevelSpellcasting.prepareSlots`, для `pact`); `353-…` (`MultiLevelSpellcasting`, для `spellN`). Значение клампится к максимуму (`slot.value = Math.clamp(slot.value, 0, slot.max)`).
- **Для нового персонажа** `value` ставить равным вычисленному максимуму. Таблицы — `SPELL_SLOT_TABLE` и `pactCastingProgression` в `config.mjs` (не выписаны, ❓). Альтернатива — длинный отдых: `actor.mjs:2531` / `3138` ставят `value = max`.

### 1.9 `resources`, `bonuses`, `favorites` ✅

- `resources.{primary,secondary,tertiary}` — `{ value, max, sr: bool, lr: bool, label }` (`character.mjs:174-180`; `makeResourceField`, конец файла).
- `bonuses.{mwak,rwak,msak,rsak}` — `{ attack, damage }` (формулы; `creature.mjs:31-50`). `bonuses.abilities` — `{ check, save, skill }`. `bonuses.spell.dc`.
- `favorites` — массив `{ type, id, sort }`; `type` ∈ `activity | effect | item | skill | slots | tool` (`character.mjs:25-35`).

### 1.10 Производные поля — не писать

`details.level`, `attributes.prof`, `attributes.hd`, `attributes.attunement.value`, `attributes.exhaustion` (производное от эффекта, раздел 9), `hp.effectiveMax`, `hp.damage`, `hp.pct`, `attributes.ac.value/base/armor/shield/cover/dex` (`attributes.mjs:159-250`), `attributes.encumbrance` (`attributes.mjs:272`), `attributes.spell.*`, `spells.spellN.max/level`.

---

## 2. Предметы

### 2.1 Общие поля (все типы) ✅

- `identifier` — slug, обязательный у class/subclass/race/background/feat/spell/weapon/equipment/consumable/tool/loot/container (`templates/item-description.mjs:25`). Если не задан, `Item._preCreate` выставит его из имени (`documents/item.mjs:1064-1078`, геттер `identifier` в `item.mjs:223-227`).
- `description.value`, `description.chat` — HTML (`item-description.mjs:14-22`).
- `source` — `{ book, page, custom, license, revision, rules }`. `rules` — `"2014"` или `"2024"`. По умолчанию берётся из `rulesVersion` (`shared/source-field.mjs:24-26`).
- `identified` (boolean, по умолчанию true), `unidentified.{name,description}` (`identifiable.mjs:19-27`).
- Физические (`templates/physical-item.mjs:27-60`): `quantity` (целое ≥0, по умолчанию 1), `weight: { value, units }`, `price: { value, denomination }` (по умолчанию `gp`), `rarity` ∈ `"" | common | uncommon | rare | veryRare | legendary | artifact` (`config.mjs:1532-1538`), `container` — `_id` контейнера.
- Экипируемые (`templates/equippable-item.mjs:19-22`): `equipped` (boolean; `required: true`), `attuned` (boolean), `attunement` (`""` или `"required"`).
  - По умолчанию для `character` `equipped = false` (`equippable-item.mjs:131-137`; вызов `equipment.mjs:339` и `weapon.mjs:573`). Для вещей персонажа ставить `equipped: true` явно.
- `activities` — объект `{ "<_id>": { ... } }` (раздел 3).
- `uses` — раздел 4.
- `advancement` — массив, только у `class, subclass, race, background, feat` (раздел 5).

**Подавление эффектов предмета** ✅ `documents/item.mjs:463-468`: эффекты предмета не применяются, если `type !== "consumable"` (кроме rod/trinket/wand) и `equipped === false`, либо `attunement === "required"` и `attuned` не `true`. Для `class`, `race`, `background`, `subclass`, `feat`, `spell` поля `equipped` нет — эффекты действуют.

### 2.2 `class` ✅

`module/data/item/class.mjs`.

| Поле | Значение |
|---|---|
| `identifier` | `"barbarian"` и т.п. (`class.mjs` наследует `identifier`) |
| `levels` | целое ≥1 (по умолчанию 1; `class.mjs:53`). при обновлении `levels` < 1 приводится к 1, > 20 — к 20 (`class.mjs:293-310`, `_preUpdate`) |
| `hd` | `{ denomination: "d12", spent: 0, additional: "" }` (`class.mjs:45-52`). `denomination` ∈ `d4 d6 d8 d10 d12` (`config.mjs:3049`) |
| `primaryAbility` | `{ value: Set<str>, all: bool }` |
| `properties` | `Set` |
| `spellcasting` | `{ progression, ability, preparation: { formula } }` (раздел 2.2.1) |
| `advancement` | массив (раздел 5) |
| `startingEquipment`, `wealth` | `StartingEquipmentTemplate` (`templates/starting-equipment.mjs:18`) |

**Дефолтный advancement при создании** ✅. `ClassData._preCreate` → `preCreateAdvancement` (`templates/advancement.mjs:30-37`) добавляет `HitPoints`, `Subclass@3`, `AbilityScoreImprovement@4,8,12,16,19` (`class.mjs:252-263`), **если в данных нет `_id` и нет `system.advancement`**. Клиент передаёт в `_preCreate` исходные данные до присвоения `_id` (`client-backend.mjs:98`). Поэтому:
- если копируешь класс из компендиума или задаёшь `_id` — дефолтный advancement не добавляется (см. раздел 5.2);
- `HitPoints` без значений (`value: {}`) даёт 0 HP за уровень (раздел 5.3).

#### 2.2.1 Спеллкастинг класса ✅

- `spellcasting.progression`: `none | full | half | third | artificer` (тип метода `spell`) и `pact` (тип `pact`). Регистрация: `module/data/spellcasting/spellcasting-model.mjs:79-95`.
- `spellcasting.ability`: ключ способности.
- `spellcasting.preparation.formula`: формула максимума подготовленных, например `"@abilities.wis.mod + @classes.cleric.levels"` (компендиум `classes/cleric.yml`), либо `"@scale.bard.max-prepared"` (2024).
- `spellcasting.type` — производное (`SpellcastingField.prepareData`, `module/data/item/fields/spellcasting-field.mjs:44-50`).

Поведение при создании ✅: `ClassData._onCreate` (`class.mjs:275-290`) назначает `details.originalClass`, если он не указывает на существующий предмет (`_assignPrimaryClass`, `actor.mjs:658-661`), и `attributes.spellcasting`, если он пуст.

Уровень персонажа: `details.level = Σ levels` (`character.mjs:208`).

### 2.3 `subclass` ✅

`module/data/item/subclass.mjs:28-35`.

- `identifier` — slug подкласса.
- `classIdentifier` — **identifier класса** (не `_id`), к которому относится подкласс (`subclass.mjs:28`). Связь: `Item.subclass` (`documents/item.mjs:346-351`) и `Item.class` (`documents/item.mjs:334-338`) сравнивают `system.classIdentifier` с `identifier` класса.
- `spellcasting` — `SpellcastingField`. Подкласс с progression ≠ `none` перекрывает класс (`documents/item.mjs:398-410`).

### 2.4 `race` (вид / species) ✅

`module/data/item/race.mjs`.

- `movement` (`MovementField`, `race.mjs:31`), `senses` (`SensesField`), `type` (тип существа, `CreatureTypeField`, `race.mjs:33`).
- Singleton — правило листа, а не модели (`base-actor-sheet.mjs:1843-1846`). API не проверяет.
- Advancement по умолчанию при создании (`race.mjs:164-172`): modern → `[Size]`; legacy → `[AbilityScoreImprovement, Size, Trait(languages:standard:common)]`.
- `_onCreate` (`race.mjs:185-190`) пишет `actor.system.details.race = race.id` (только клиентом, создавшим документ).
- Особенности вида: ItemGrant на уровне 0 (см. 5.9).

### 2.5 `background` (предыстория) ✅

`module/data/item/background.mjs`.

- Singleton — правило листа (`background.mjs:26-28`).
- Advancement по умолчанию (`background.mjs:54-70`): modern → `[AbilityScoreImprovement(points 3), Trait(владения), Trait(languages:standard:common), ItemGrant(feat)]`; legacy → `[Trait, ItemGrant]`.
- `_onCreate` (`background.mjs:83-89`) пишет `details.background = id`.

### 2.6 `feat` ✅

`module/data/item/feat.mjs:36-65`.

- `type: { value, subtype }`. Значения `value`: `background, class, monster, race, enchantment, feat, supernaturalGift, vehicle` (`config.mjs:1928-2010`). Для general feats: `value: "feat"`, `subtype` ∈ `general | origin | fightingStyle | epicBoon`.
- `prerequisites: { items: Set<identifier>, level, repeatable }`.
- `requirements` — строка.
- `properties` — Set.
- `enchant: { max, period }`.
- `activities`, `advancement`, `uses`.

### 2.7 `weapon` ✅

`module/data/item/weapon.mjs:48-87`.

- `type: { value, baseItem }`. `value` ∈ `simpleM, simpleR, martialM, martialR, natural, improv, siege` (`config.mjs:356-362`). `baseItem` — ключ оружия (`battleaxe, longsword, dagger …`, `config.mjs:470-508`).
- `proficient` — `null` (по умолчанию) или 0/1. При `null` владение считается по `actor.traits.weaponProf` (`weapon.mjs:537-549`). NPC всегда 1.
- `damage.base` и `damage.versatile` — `DamageData` (раздел 3.2). В `base` не добавлять `@mod`: модификатор добавляется при броске (`activity/attack-data.mjs:386-…`).
- `range: { value, long, reach, units }`; `reach` по умолчанию 5 ft (`weapon.mjs`, `prepareDerivedData`).
- `mastery` — ключ из `config.mjs:391-419`.
- `properties` — Set: `ada amm concentration fin fir foc hvy lgt lod material mgc rch rel ret ritual sidekick sil somatic spc stealthDisadvantage thr trait two ver vocal weightlessContents` (`config.mjs:2011-2184`). Для оружия допустимы подмножества из `validProperties.weapon`.
- `magicalBonus` (целое ≥0), `ammunition.type`, `armor.value` (для осадного).
- Доступные способности (`weapon.mjs:408-416`): finesse или natural → `[str, dex]`; иначе по типу атаки.

### 2.8 `equipment` (броня, щит, прочее) ✅

`module/data/item/equipment.mjs:36-63`.

- `type: { value, baseItem }`. Броня: `light | medium | heavy | natural | shield` (`config.mjs:1642-1656`). Прочее: `clothing | ring | rod | trinket | vehicle | wand | wondrous` (`config.mjs:1657-1673`).
- `armor: { value, dex, magicalBonus }`:
  - `value` — базовый КД брони или бонус щита (целое ≥0, обязательно).
  - `dex` — предел бонуса Ловкости (`null` = без ограничения; `equipment.mjs` миграция строк).
  - Щит (`type.value: "shield"`) добавляет `armor.value` к КД (`attributes.mjs:173, 235`).
- `strength` — минимальная Сила (целое ≥0, обязательно; `null` через миграцию).
- `proficient` — 0/1 или `null`. Расчёт владения для брони по аналогии с оружием (`item.mjs:576-584` вызывает `proficiencyMultiplier`; для `equipment` геттер не читался — ❓).
- `properties` — Set (`stealthDisadvantage` и др.).
- Расчёт КД: `attributes.mjs:159-250` (берётся первая экипированная броня и первый экипированный щит; `default` = `armor + min(dexLimit, dexMod)`).

### 2.9 `consumable` ✅

`module/data/item/consumable.mjs:38-65`.

- `type: { value, subtype }`. Значения `value`: `ammo, potion, poison, food, scroll, wand, rod, trinket` (`config.mjs:1807-1856`).
- `damage: { base, replace }` (для боеприпасов, `replace` — замена базового урона).
- `uses` — с `autoDestroy` (boolean). Раздел 4.
- `magicalBonus`, `properties`.

### 2.10 `tool` ✅

`module/data/item/tool.mjs:33-46`.

- `type: { value }`. Значения `value`: `art, game, music, vehicle` (`config.mjs:696-707`).
- `ability` — ключ способности (строка, допускается `""`).
- `proficient` — `null` или 0/0.5/1/2 (`min 0, max 2, step 0.5`).
- `bonus` — формула; `chatFlavor` — строка (обязательная).
- `properties` — Set.

### 2.11 `loot` ✅

`module/data/item/loot.mjs:24-40`.

- `type: { value }`. Значения `value`: `art, gear, gem, junk, material, resource, treasure` (`config.mjs:2185-2204`).
- `properties` — Set. Физические поля (`quantity`, `weight`, `price`, `rarity`).

### 2.12 `container` ✅

`module/data/item/container.mjs:29-50`.

- `capacity: { count, volume: { value, units }, weight: { value, units } }`.
- `quantity` — всегда 1 (`max: 1`).
- `currency` (контейнер хранит монеты, `CurrencyTemplate`).
- `properties` — Set.
- Вложенность: `system.container` = `_id` контейнера (`physical-item.mjs:27-30`). Максимальная глубина `MAX_DEPTH = 5` (`physical-item.mjs:56`).

### 2.13 `spell` — способ подготовки в 5.1.8 ✅

Схема: `module/data/item/spell.mjs:50-70`. Класс: `SpellData extends ItemDataModel.mixin(ActivitiesTemplate, ItemDescriptionTemplate)`.

**Поля подготовки:**

| Поле | Тип | Значения | Источник |
|---|---|---|---|
| `method` | string | ключ `CONFIG.DND5E.spellcasting`: `spell` (классовая ячейка `spellN`), `pact` (ячейка колдуна), `innate` (врождённое), `atwill` (без ограничений), `ritual` (ритуал из книги) | `spell.mjs:60`; `config.mjs:3292-3365` |
| `prepared` | integer ≥0 | `0` = `unprepared`, `1` = `prepared`, `2` = `always` | `spell.mjs:61`; `config.mjs:3366-3386` |
| `sourceClass` | string | `identifier` класса, которому принадлежит ячейка | `spell.mjs:65` |
| `ability` | string | переопределение способности заклинаний (`""` = по умолчанию) | `spell.mjs:50` |
| `level` | integer 0–9 | уровень заклинания | `spell.mjs:53` |
| `school` | string | `abj, con, div, enc, evo, ill, nec, trs` | `spell.mjs:64`; `config.mjs:3517-3573` |
| `properties` | Set | компоненты: `vocal, somatic, material, concentration, ritual` | `spell.mjs:62`; `config.mjs:2044-2100` |
| `materials` | `{ value, consumed, cost, supply }` | материальные компоненты | `spell.mjs:54-58` |
| `activation`, `duration`, `range`, `target` | `ActivationField`, `DurationField`, `RangeField`, `TargetField` | см. раздел 3 | `spell.mjs:50-70` |

**Что является «подготовленностью»:** `prepared` ∈ {0,1,2} вместе с `method`.
- `countsPrepared` (`spell.mjs:469-472`): истинно, если `method.prepares` (есть у `spell` и `pact`), `level > 0` и `prepared === 1`. Заклинания с `prepared === 2` в лимит не входят.
- `canPrepare` (`spell.mjs:430`): `method.prepares`.
- Лимит подготовленных: `class.spellcasting.preparation.formula` (`spellcasting.preparation.max` в `SpellcastingField.prepareData`).

**Значения по умолчанию при создании на персонаже** (`spell.mjs:571-…`, `_preCreate`):
- если в данных нет `prepared`: `prepared = Number(npc || level < 1)`. Для персонажа заговор получает 1, заклинание уровня ≥1 получает 0.
- если нет `sourceClass` и метод не `atwill/innate` и есть классы с заклинаниями:
  - один класс с заклинаниями → `sourceClass` = его `identifier`, `method` = его `spellcasting.type` (`spell` или `pact`);
  - указан `method` ∈ `CONFIG.DND5E.spellcasting` и подходит ровно один класс с этим типом → этот класс;
  - иначе пересечение классов персонажа со списками заклинаний (`dnd5e.registry.spellLists`) — если один класс, то он.

**Миграция legacy-формы** ✅ `spell.mjs:215-236` (`#migratePreparation`): вход `preparation: { mode, prepared }`:
- `mode: "always"` → `method: "spell"`, `prepared: 2`;
- `mode: "prepared"` → `method: "spell"`, `prepared: Number(prepared)`;
- иной `mode` (`innate`, `atwill`, `ritual`, `pact`) → `method: mode`, `prepared: Number(prepared)`;
- ключ `preparation` удаляется.

Геттер `SpellData#preparation` (`spell.mjs:139-146`) — устаревший, работает до 5.4.

**Важно про компендиумы.** В `packs/_source/spells24/**` (339 заклинаний) у каждого заклинания legacy-форма: `preparation: { mode: prepared|always, prepared: false }` — 312 и 27. Миграция выполняется при загрузке документа (`common/abstract/data.mjs:255-265`), поэтому `fromUuid(...)` отдаёт уже `method/prepared`. Для `packs/_source/spells/**` (2014) ❓ не проверено, но предполагается та же форма. ⚠️

**Примеры** (⚠️ значения по коду, не проверено в Foundry):

```json
{
  "name": "Лечение ран",
  "type": "spell",
  "system": {
    "identifier": "cure-wounds",
    "level": 1,
    "school": "evo",
    "method": "spell",
    "prepared": 1,
    "sourceClass": "cleric",
    "properties": ["vocal", "somatic"]
  }
}
```

```json
{ "system": { "method": "spell", "prepared": 2, "sourceClass": "cleric" } }
```
(`prepared: 2` — всегда подготовлено; в лимит не входит.)

```json
{ "system": { "method": "pact", "prepared": 1, "sourceClass": "warlock" } }
```

```json
{ "system": { "method": "innate", "prepared": 1, "sourceClass": "" } }
```
(Для `innate` и `atwill` `sourceClass` не ставится, см. условие в `_preCreate`. Что означает `prepared: 0` для них — ❓ не проверено.)

**Заклинания, выданные advancement.** `SpellConfigurationData.applySpellChanges` (`module/data/advancement/spell-config.mjs`) ставит `system.method`, `system.prepared` и `system.sourceClass` (для класса/подкласса — `identifier` класса), а также `system.ability` и `uses` (раздел 5.4).

### 2.14 Классы, подклассы, виды, предыстории — сводка

- Классы: `class` с `levels`, `hd`, `spellcasting`, `advancement`.
- Подклассы: `subclass` с `classIdentifier`.
- Виды: `race`, предыстории: `background`, черты: `feat`.

---

## 3. Активности (`system.activities`)

### 3.1 Хранение и типы ✅

- `system.activities` — `ActivitiesField` (`module/data/fields/activities-field.mjs:9-27`): объект `{ "<_id>": { ... } }`. Ключ объекта и `_id` внутри должны совпадать.
- Класс активности выбирается по `type` (`ActivityField.getModel`, `activities-field.mjs:39-44`, `CONFIG.DND5E.activityTypes`, `config.mjs:4844-4899`).
- Типы: `attack, cast, check, damage, enchant, forward, heal, order, save, summon, transform, utility`.
- `_id` — 16 символов (`foundry.utils.randomID()`), для технических id используется `staticID` (`utils.mjs:375-378`).

**Базовые поля** (`module/data/activity/base-activity.mjs:66-130`):
- `_id`, `type`, `name` (строка), `img` (путь), `sort` (целое).
- `activation: { type, value, condition, override }`. `type` ∈ `action, bonus, reaction, minute, hour, day, longRest, shortRest, encounter, turnStart, turnEnd, legendary, mythic, lair, crew, special`, либо `""` (`config.mjs:1048-1140`).
- `consumption: { targets: [], scaling: { allowed, max }, spellSlot: true }`. Цели расхода: `ammo, attribute, hitDice, material, charges` (`config.mjs:1143-1200`), плюс `activityUses`, `itemUses`, `spellSlots` (`config.mjs:1200-1260`).
- `description: { chatFlavor }`.
- `duration: { concentration, override, units, value, special }`. Единицы: `inst, spec, perm, disp, dstr`, `turn, round, second, minute, hour, day, week, month, year` (`config.mjs:901-996`).
- `effects: [{ _id }]` — ссылки на эффекты предмета.
- `range: { override, units, value, special }`. Единицы: `self, touch, spec, any`, `ft, mi, m, km` (`config.mjs:2671-2727`).
- `target: { override, prompt, template: {count, contiguous, type, size, width, height, units}, affects: {count, type, choice, special} }`. Индивидуальные: `self, ally, enemy, creature, object, space, creatureOrObject, any, willing`. Области: `circle, cone, cube, cylinder, line, radius, sphere, square, wall` (`config.mjs:2891-3036`).
- `uses` — раздел 4.

**Attack** (`module/data/activity/attack-data.mjs:30-60`):

```
attack: {
  ability: "",                      // "" = автоматически (str/dex по типу, или max из доступных)
  bonus: "",                        // формула
  critical: { threshold: null },    // null = 20
  flat: false,                      // true = bonus вместо владения и модификатора
  type: { value: "melee" | "ranged", classification: "weapon" | "spell" | "unarmed" }
},
damage: {
  critical: { bonus: "" },
  includeBase: true,                // добавить базовый урон предмета (weapon.damage.base)
  parts: [ DamageData, ... ]        // дополнительные части урона
}
```
Тип `classification` задаёт `CONFIG.DND5E.attackClassifications` (`config.mjs:3130-3140`).

**Damage** (`module/data/activity/damage-data.mjs:17-30`): `damage: { critical: { allow, bonus }, parts: [DamageData, ...] }`.

**Save, check, utility, heal, cast, summon, transform, enchant, forward, order** — отдельные модели в `module/data/activity/*-data.mjs`. Подробно не описывались (❓).

### 3.2 `DamageData` ✅

Файл: `module/data/shared/damage-field.mjs:34-100`.

```json
{
  "number": 1,
  "denomination": 8,
  "bonus": "",
  "types": ["slashing"],
  "custom": { "enabled": false, "formula": "" },
  "scaling": { "mode": "", "number": 1, "formula": "" }
}
```

- `number` — число костей (целое ≥0). `denomination` — грань (`dieSteps`: 4, 6, 8, 10, 12, 20, 100; `config.mjs:2376`).
- `bonus` — формула (без `@mod`: модификатор добавляется при броске, `attack-data.mjs:386-…`).
- `types` — Set строк: `acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder` (`config.mjs:2413-2503`). Для лечения — `healing, temphp` (`config.mjs:2511-2530`).
- `custom.enabled` и `custom.formula` — произвольная формула вместо `NdM + bonus`.
- `scaling.mode` — `""` (нет), `whole` (целиком), `half` (половина); `scaling.number` — кость на шаг; `scaling.formula` — дополнительная формула.
- `formula` (геттер) = `NdM + bonus` или `custom.formula` (`damage-field.mjs:82-95`).

### 3.3 Автоматически ли создаются активности ✅

**Нет**, при обычном создании через API. Цепочка:
- `Item.migrateData` (`documents/item.mjs:1605-1609`) → `ActivitiesTemplate.initializeActivities` (`templates/activities.mjs:221-230`).
- Создание активностей из legacy-полей срабатывает только если одновременно:
  - в исходных данных есть `_id`, `type`, `system`, `effects` (`activities.mjs:239`);
  - нет `system.activities` (`activities.mjs:249`);
  - есть `system.actionType` или `system.activation.type`, либо `type === "tool"` (`activities.mjs:242-243`);
  - `_stats.systemVersion` старше 4.0.1 или отсутствует (`activities.mjs:246`).
- `migrateData` вызывается на **входных** данных при создании (`client-backend.mjs:85`) и в `DataModel._initializeSource` (`common/abstract/data.mjs:255-263`). Если `_id` не передан, миграция не срабатывает.

Итог:
- **Оружие** без `system.activities` не получит атаку: `hasAttack === false`, нет `labels.toHit` и кнопки броска.
- **Заклинание** без `system.activities` не получит `cast` и урон/спасбросок.
- Модуль должен явно писать `system.activities` для всех предметов с действиями.
- Риск: если передать `_id` у предмета с `system.activation.type`, создастся активность `utility` (`createInitialActivity`, `activities.mjs:260-290`, `base-activity.mjs:250-265`). ⚠️

### 3.4 Минимальная атакующая активность оружия ✅

Оружие (`longsword`) с базовым уроном и активностью:

```json
{
  "name": "Длинный меч",
  "type": "weapon",
  "system": {
    "identifier": "longsword",
    "type": { "value": "martialM", "baseItem": "longsword" },
    "proficient": null,
    "properties": ["ver"],
    "mastery": "sap",
    "damage": {
      "base": {
        "number": 1, "denomination": 8, "bonus": "",
        "types": ["slashing"],
        "custom": { "enabled": false, "formula": "" },
        "scaling": { "mode": "", "number": 1, "formula": "" }
      },
      "versatile": {
        "number": 1, "denomination": 10, "bonus": "",
        "types": ["slashing"],
        "custom": { "enabled": false, "formula": "" },
        "scaling": { "mode": "", "number": 1, "formula": "" }
      }
    },
    "range": { "value": null, "long": null, "reach": null, "units": "ft" },
    "equipped": true,
    "attunement": "",
    "attuned": false,
    "identified": true,
    "quantity": 1,
    "weight": { "value": 3, "units": "lb" },
    "price": { "value": 15, "denomination": "gp" },
    "rarity": "",
    "activities": {
      "a1b2c3d4e5f6g7h8": {
        "_id": "a1b2c3d4e5f6g7h8",
        "type": "attack",
        "sort": 0,
        "activation": { "type": "action", "value": null, "condition": "", "override": false },
        "attack": {
          "ability": "",
          "bonus": "",
          "critical": { "threshold": null },
          "flat": false,
          "type": { "value": "melee", "classification": "weapon" }
        },
        "damage": { "critical": { "bonus": "" }, "includeBase": true, "parts": [] }
      }
    }
  }
}
```

Замечания:
- `_id` активности (`a1b2c3d4e5f6g7h8`) — пример; в модуле генерировать `randomID()` (16 символов).
- Единицы веса `lb` — для imperial. В metric — `kg` (`utils.mjs:687-690`).
- Структура сверена с реальным предметом компендиума `packs/_source/equipment24/weapons/martial-melee/longsword.yml` (2024): там тоже `null` у `proficient`, `container`, `range.reach`, `magicalBonus`; у атаки в паке `activation.value: 1`, `range.value: "5"`, `target.prompt: false`. Для модуля значения активности брать из копии компендиума, а не из этого примера.
- `attack.ability: ""` даёт `str` для melee и `dex` для ranged. Для finesse — лучший из `str/dex` (`weapon.mjs:408-416`).
- Владение: `proficient: null` + `traits.weaponProf.value` (`sim`, `mar` или `baseItem`) дают 1 (`weapon.mjs:537-549`). Явное `proficient: 1` тоже работает.
- Пример урона в активности (дополнительная часть урона, `parts`):

```json
{ "number": 1, "denomination": 6, "bonus": "", "types": ["force"],
  "custom": { "enabled": false, "formula": "" },
  "scaling": { "mode": "", "number": 1, "formula": "" } }
```

---

## 4. Ограниченные применения (`uses`) и восстановление ✅

### 4.1 Структура

`module/data/shared/uses-field.mjs:30-40`.

```json
{ "uses": {
  "spent": 0,
  "max": "@prof",
  "recovery": [
    { "period": "lr", "type": "recoverAll", "formula": "" }
  ]
} }
```

- `spent` — целое ≥0 (израсходовано). Доступно: `value = clamp(max - spent, 0, max)` (`uses-field.mjs:58-64`, производное).
- `max` — формула (`FormulaField`, `deterministic: true`; строка `""` = без ограничения). Пример: `"@prof"`, `"@abilities.cha.mod"`, `"3"`.
- `recovery[]` — профили восстановления: `{ period, type, formula }`.

**`period`** (`config.mjs:1558-1599`): `lr` (длинный отдых), `sr` (короткий), `day`, `dawn` (формула), `dusk` (формула), `initiative` (особый), `turnStart`, `turnEnd`, `turn` (бой). Также `recharge` — перезарядка d6 (`uses-field.mjs:58-75`; `formula` — порог, например `"5"`, `type: "recoverAll"`).

**`type`** (`item-sheet.mjs:339-341`, `uses-field.mjs:162-166`):
- `recoverAll` — `spent = 0`;
- `loseAll` — `spent = max`;
- `formula` — бросок `formula`, `spent = clamp(spent - total, 0, max)`.

**Восстановление.** `UsesField.recoverUses(periods, rollData)` (`uses-field.mjs:140-200`) ищет первый профиль, совпадающий с периодами отдыха, и применяет его. Для предметов вызывается `ActivitiesTemplate.recoverUses` (`templates/activities.mjs:323`), которая обходит предмет и его активности. Отдых на уровне актёра ❓ не проверено.

**Пример: расходник, 1 использование, восстанавливается на отдыхе**
```json
{ "uses": { "spent": 0, "max": "1", "recovery": [{ "period": "lr", "type": "recoverAll", "formula": "" }] } }
```

**Пример: особенность 2024 «x/день»**
```json
{ "uses": { "spent": 0, "max": "@prof", "recovery": [{ "period": "lr", "type": "recoverAll", "formula": "" }] } }
```

Для активности `uses` задаётся внутри активности (`base-activity.mjs`, поле `uses`, схема тех же `UsesField`).

---

## 5. Advancement (продвижение)

### 5.1 Типы и их значения

Типы: `module/data/item/templates/advancement.mjs`, `config.mjs:4901-4940`.

| `type` | Где | `configuration` | `value` (после применения) | Источник |
|---|---|---|---|---|
| `AbilityScoreImprovement` | `class, background, race, feat` | `{ points, fixed: {key: n}, locked: [], max, cap, recommendation }` | `{ type: "asi", assignments: {str: 1} }` или `{ type: "feat", feat: {…} }` | `data/advancement/ability-score-improvement.mjs:16-52` |
| `HitPoints` | `class` | `{}` | `{ "1": "max", "2": "avg", "3": 5 }` — ключи уровни | `documents/advancement/hit-points.mjs:107-139` |
| `ItemChoice` | любой | … | выбранные предметы | `documents/advancement/item-choice.mjs` (❓ детали не читались) |
| `ItemGrant` | любой | `{ items: [{uuid, optional}], optional, spell }` | `{ added: { "<новый _id>": "<uuid>" }, ability? }` | `data/advancement/item-grant.mjs:34-39` |
| `ScaleValue` | любой | ❓ | производное: `system.scale[identifier]` | `documents/advancement/scale-value.mjs` (❓) |
| `Size` | `race` | `{ sizes: Set }` | `{ size: "med" }` | `data/advancement/size.mjs:6-22` |
| `Subclass` | `class` | `{}` | `{ document: "<_id подкласса>", uuid: "<uuid>" }` | `data/advancement/subclass.mjs:14-15` |
| `Trait` | любой | `{ grants: Set, choices: [{count, pool: Set}], mode, allowReplacements }` | `{ chosen: Set<"skills:acr", ...> }` | `data/advancement/trait.mjs:46-77` |

Поля базы (`data/advancement/base-advancement.mjs:34-54`): `_id`, `type`, `configuration`, `value`, `level` (уровень; 0 для вида и предыстории), `title`, `hint`, `icon`, `classRestriction` (`"primary" | "secondary"`).

Пример `HitPoints` и `Subclass` в классе (2024, Barbarian, ✅ по схеме):

```json
{ "advancement": [
  { "_id": "hp0000000000000a", "type": "HitPoints", "configuration": {}, "value": { "1": "max", "2": "avg", "3": "avg" }, "title": "" },
  { "_id": "sc0000000000000b", "type": "Subclass", "level": 3, "configuration": {},
    "value": { "document": "<_id подкласса>", "uuid": "Compendium.dnd5e.classes24.Item.phbbrbBerserker0" }, "title": "" }
] }
```

### 5.2 Что делает создание через API ✅

- `Actor.createEmbeddedDocuments("Item", …)`, `Item.create` и `Actor.create` **не запускают** `AdvancementManager`. Менеджер вызывается только из листов:
  - `forNewItem` — перетаскивание предмета на лист (`base-actor-sheet.mjs:1856`; класс создаётся с `levels = 0` и затем повышается шагами: `advancement-manager.mjs:246-258`);
  - `forLevelChange` — изменение уровня класса (`base-actor-sheet.mjs:1215`, `character-sheet.mjs:1262`);
  - `forDeletedItem` — удаление через `Item.deleteDialog` (`item.mjs:1117-1125`). Прямой `item.delete()` менеджер не вызывает.
- Что **не** происходит при создании класса с `levels: N`: HP, ItemGrant-особенности, ASI, подкласс, владения, размер, языки.
- `Item._onCreate` для класса (`class.mjs:275-290`) назначает `originalClass` и `attributes.spellcasting`.

Вывод: рабочий путь для модуля — записать всё вручную в одном проходе (раздел 5.10).

### 5.3 HP ✅

- `attributes.hp.max` = `null` (по умолчанию). Тогда в `prepareDerivedData` (`character.mjs:275-285`) собирается:
  - `advancement` = первые `HitPoints`-advancement каждого класса;
  - `mod` = модификатор CON;
  - `bonus` = `hp.bonuses.level × details.level + simplify(hp.bonuses.overall)`.
- `hp.max = Σ_классов Σ_уровней max(valueForLevel(уровень) + modCON, 1) + bonus` (`hit-points.mjs:133-139`, `attributes.mjs:357-368`).
- `valueForLevel`: `"max"` → число граней кости (`d12` → 12); `"avg"` → `граней/2 + 1` (для d12 = 7); число → как есть (`hit-points.mjs:107-115`).
- `hp.max` = число → **override**: advancement и бонусы игнорируются (`character.mjs:275-285`; при override `hpOptions` пустой).
- `hp.value` — хранится в исходных данных. После подготовки `value = min(value, effectiveMax)` (`attributes.mjs:357-368`). Модуль должен записать текущее значение явно (= максимум при создании).
- **Пустой `value: {}`** у `HitPoints` (как в компендиумах `classes/*.yml`, `value: {}`): вклад 0 за уровень. Поэтому значения надо записать явно.
- **Без advancement:** `hp.max = N` (override).
- `HitPoints.apply(level, data)` (`hit-points.mjs:167-176`) меняет `hp.value` при повышении уровня через менеджер. Программно не вызывается.

### 5.4 ItemGrant (особенности класса, вида, предыстории) ✅

- `configuration.items` — `[{ uuid, optional }]`. Подсчёт uuid по `packs/_source`: `classfeatures` 249, `classes24` 246, `spells24` 72, `origins24` 45, `feats24` 30, `races` 26, `spells` 3, `backgrounds` 1, `actors24` 12.
- `automaticApplicationValue(level)` (`item-grant.mjs:117-125`): возвращает `{ [uuid]: true }` для всех предметов, если `configuration.optional` = false, `spell.ability.size ≤ 1` и ни один `items[].optional` не равен true. Иначе — выбор игрока.
- `apply(level, data)` (`item-grant.mjs:88-115`):
  1. для каждого uuid `createItemData(uuid)` (`advancement.mjs:322-334`): копия из компендиума с новым `_id`, `flags.dnd5e.sourceId = uuid`, `flags.dnd5e.advancementOrigin = "<itemId>.<advancementId>"`, `flags.dnd5e.advancementRoot`;
  2. `actor.updateSource({ items })`;
  3. `updateSource({ "value.added": { "<новый _id>": uuid } })`.
- `storagePath(level)` = `"value.added"` (`item-grant.mjs:74-76`).
- Допустимые типы выданного предмета (`item-grant.mjs:37`): `feat, spell, consumable, container, equipment, loot, tool, weapon`.

**Программный рецепт** (⚠️ повторяет `createItemData` и `apply`, в Foundry не проверено):
1. `const src = await fromUuid(uuid); const data = src.toObject();`
2. `data._id = randomID(16)`, `data.flags.dnd5e = { ...data.flags.dnd5e, sourceId: uuid, advancementOrigin: "<classItemId>.<grantAdvId>", advancementRoot: "<classItemId>.<grantAdvId>" }`.
3. Добавить `data` в массив `items` при создании персонажа (или `createEmbeddedDocuments`).
4. В advancement ItemGrant записать `value.added[data._id] = uuid`.
5. Для предметов-заклинаний вызвать `configuration.spell.applySpellChanges(data, { ability })` (раздел 2.13) либо выставить `method`, `prepared`, `sourceClass` вручную.

Пример:
```json
{
  "type": "ItemGrant",
  "level": 1,
  "configuration": {
    "items": [{ "uuid": "Compendium.dnd5e.classes24.Item.phbbrbRage000000", "optional": false }],
    "optional": false,
    "spell": null
  },
  "value": { "added": { "<новый _id>": "Compendium.dnd5e.classes24.Item.phbbrbRage000000" } }
}
```

### 5.5 Subclass ✅

- Advancement `Subclass` класса (`level` = 3 для 2024, `level` = 1–3 для 2014 по данным `packs/_source`) с `value: { document, uuid }`.
- `apply` (`subclass.mjs:60-80`): копия подкласса из компендиума, `system.classIdentifier` = `identifier` класса (`this.item.identifier`), `value = { document: _id, uuid }`.
- Особенности подкласса — `ItemGrant` на предмете подкласса с `level` (например, `path-of-the-berserker` 2014: уровни 3, 6, 10, 14).

Подкласс 2024 (`classes24`) и подкласс 2014 (`subclasses`) — разные предметы с разными identifier (раздел 6.3).

### 5.6 Trait (спасброски, навыки, языки, владения) ✅

- Конфиг `DND5E.traits` (`config.mjs:4552-4666`):
  - `saves` → `system.abilities.<k>.proficient` (ключ `saves:str`);
  - `skills` → `system.skills.<id>.value` (ключ `skills:acr`);
  - `tool` → `system.tools.<id>.value` + `ability` (ключ `tool:alchemist`);
  - `languages` → `system.traits.languages.value` (ключ `languages:standard:common`);
  - `armor` → `system.traits.armorProf.value` (ключ `armor:lgt`);
  - `weapon` → `system.traits.weaponProf.value` (ключ `weapon:sim`, `weapon:<baseItem>`);
  - `di`, `dr`, `dv`, `ci` — Set-поля.
- `changeKeyPath` (`documents/actor/trait.mjs:95-111`) и `actorKeyPath` (`:46-50`).
- `apply` (`documents/advancement/trait.mjs:111-134`): для навыков значение 1 (владение), либо 2 при `expertise`/`upgrade`; для `saves` — `proficient = 1`; для Set — добавление элемента.
- Режимы (`config.mjs:4667-4690`): `default`, `expertise`, `forcedExpertise`, `upgrade`, `mastery`.

Пример (класс 2014, Barbarian):
```json
{ "type": "Trait", "level": 1, "title": "",
  "configuration": { "grants": ["saves:str", "saves:con"],
    "choices": [{ "count": 2, "pool": ["skills:ani", "skills:ath", "skills:itm", "skills:prc", "skills:sur", "skills:ins"] }],
    "mode": "default", "allowReplacements": false },
  "value": { "chosen": ["saves:str", "saves:con", "skills:ani", "skills:prc"] } }
```

### 5.7 AbilityScoreImprovement (ASI) ✅

- `apply` (`ability-score-improvement.mjs:172-200`): добавляет очки к `system.abilities.<k>.value` (**хранится в исходных данных**, не через эффект), с ограничением `max` (по умолчанию 20 или `configuration.max`) и `configuration.fixed` (фиксированные бонусы).
- `value`: `{ type: "asi", assignments: { str: 2 } }` или `{ type: "feat", feat: {…} }` (`ability-score-improvement.mjs:43-52`).
- Программно: увеличить `system.abilities.<k>.value` на сумму назначений и записать `value`.

### 5.8 Size ✅

`size.mjs:81-87`: `apply` пишет `system.traits.size`. По умолчанию из `configuration.sizes.first()` или `"med"`.

### 5.9 Advancement уровня 0 (вид, предыстория) ❓

У `race` и `background` есть advancement с `level: 0` (`packs/_source/races/**`, `origins24/**`, `backgrounds/**`): `ItemGrant@0`, `Trait@0`, `Size@0`, `AbilityScoreImprovement@0`. Применяются ли они при создании персонажа в UI автоматически — да по смыслу листа (`forNewItem`, раздел 5.2). Программно модуль должен выполнить их сам (как в разделе 5.4 и 5.6). Полный перебор `level 0` не проверялся. ❓

### 5.10 Рекомендуемая последовательность (для модуля)

1. Создать предмет расы: копия из компендиума (`fromUuid`), `_id` сохранить; `details.race = _id`. Выполнить advancement `level 0` (ItemGrant, Trait, Size, ASI).
2. Создать предмет предыстории: то же; `details.background = _id`; выполнить `level 0`.
3. Для каждого класса: копия из компендиума; задать `levels`; `HitPoints.value` — по уровням (`max` или `avg`, либо бросок); `Subclass.value` — когда подкласс выбран; для уровней 1…N выполнить `ItemGrant` и `Trait` (неопциональные — автоматически, опциональные — по выбору); `ASI` — по выбору.
4. Установить `details.originalClass` = `_id` первого класса.
5. Подкласс: копия из компендиума, `classIdentifier` = identifier класса; записать `Subclass.value` у класса; выполнить подкласс-ItemGrant по уровням.
6. Заклинания: копия из компендиума (или собственное), выставить `method`, `prepared`, `sourceClass` (раздел 2.13).
7. Оружие и броня: `equipped: true` для экипированных; `activities` уже есть в копии из компендиума.
8. HP: `attributes.hp.max = null` и `value = max` (через advancement) либо override числом; `hp.value = max`.
9. Ячейки: `spellN.value = max` (раздел 1.8).
10. Характеристики: базовые значения + ASI.

---

## 6. Компендиумы dnd5e 5.1.8 ✅

### 6.1 Паки (`system.json`, `packs[]`)

Пак называется `dnd5e.<name>`. Все пакы из `system.json`, относящиеся к персонажу:

| Пак | Тип | Редакция | `sourceBook` | Содержимое (`packs/_source`) |
|---|---|---|---|---|
| `classes` | Item | 2014 | SRD 5.1 | классы (`class`, 12) |
| `subclasses` | Item | 2014 | SRD 5.1 | подклассы (`subclass`, 12) |
| `races` | Item | 2014 | SRD 5.1 | виды (`race`, 9) и черты (`feat`, 25) |
| `backgrounds` | Item | 2014 | SRD 5.1 | предыстория `background` (1: Acolyte) + вспомогательные `container`/`feat` |
| `classes24` | Item | 2024 | SRD 5.2 | классы (`class`, 12), подклассы (`subclass`, 12), черты классов (`feat`, 255), оружие (`weapon`, 3) |
| `origins24` | Item | 2024 | SRD 5.2 | виды (`race`, 14), предыстории (`background`, 4), черты (`feat`, 36) |
| `feats24` | Item | 2024 | SRD 5.2 | черты (`feat`, 17) |
| `spells` | Item | 2014 | SRD 5.1 | заклинания (не сопоставлялись здесь) |
| `spells24` | Item | 2024 | SRD 5.2 | заклинания (не сопоставлялись здесь) |
| `classfeatures` | Item | 2014 | SRD 5.1 | особенности классов 2014 (типы `feat`, `weapon` по `system.json`; на них ссылаются ItemGrant из `classes`) |
| `equipment24` | Item | 2024 | SRD 5.2 | снаряжение 2024 (по `system.json`: weapon, equipment, consumable, tool, loot, feat, container) |
| `items` | Item | 2014 | SRD 5.1 | снаряжение 2014 (по `system.json`: те же типы, что у `equipment24`) |

Пакы `classes24`, `origins24`, `feats24` — 2024. Пакы `classes`, `subclasses`, `races`, `backgrounds` — 2014. Признак: поле `system.source.rules` в данных и `sourceBook` в `system.json` совпадают.

### 6.2 Legacy (2014) и modern (2024)

- Мир: настройка `game.settings` `dnd5e.rulesVersion` (`settings.mjs:65-77`; `scope: "world"`, `default: "modern"`, значения `"modern"` и `"legacy"`, `requiresReload: true`).
  - `"modern"` — 2024 (по умолчанию). `"legacy"` — 2014.
- Новые предметы получают `system.source.rules` от этой настройки (`shared/source-field.mjs:24-26`): `"2024"` для modern, `"2014"` для legacy.
- Влияет на поведение: `hasConditionEffect` (`actor.mjs:422-433`), инициатива (`attributes.mjs:375`), exhaustion (раздел 9), пункты `race/background` advancement (`race.mjs:164-172`, `background.mjs:54-70`).
- Для персонажа 2014 брать предметы из паков `classes`, `subclasses`, `races`, `backgrounds`, `classfeatures`, `items`, `spells`. Для 2024 — `classes24`, `origins24`, `feats24`, `equipment24`, `spells24`.

### 6.3 Identifier (сводка по паку)

- **Классы**: одинаковые в `classes` и `classes24`: `barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard`. `_id` разные (2014: `pvEzGSv71zBhaolc` у Barbarian; 2024: `phbbrbBarbarian0`).
- **Подклассы 2014** (`subclasses`): `champion, circle-of-the-land, college-of-lore, draconic-bloodline, hunter, life-domain, oath-of-devotion, path-of-the-berserker, school-of-evocation, the-fiend, thief, way-of-the-open-hand`. `classIdentifier`: fighter, druid, bard, sorcerer, ranger, cleric, paladin, barbarian, wizard, warlock, rogue, monk.
- **Подклассы 2024** (`classes24`, `type: subclass`): `champion (fighter), land (druid), lore (bard), life (cleric), berserker (barbarian), hand (monk), devotion (paladin), hunter (ranger), thief (rogue), draconic (sorcerer), fiend (warlock), evoker (wizard)`. В скобках — `classIdentifier`.
- **Виды 2014** (`races`, `type: race`): `dragonborn, hill-dwarf, half-elf, high-elf, rock-gnome, lightfoot-halfling, human, half-orc, tiefling`.
- **Виды 2024** (`origins24`, `type: race`): `dragonborn, dwarf, elf-drow, elf-high, elf-wood, gnome-forest, gnome-rock, goliath, halfling, human, orc, tiefling-abyssal, tiefling-chthonic, tiefling-infernal`.
- **Предыстории 2014** (`backgrounds`): `acolyte` (только одна в SRD 5.1).
- **Предыстории 2024** (`origins24`, `type: background`): `acolyte, criminal, sage, soldier`.
- **Черты 2024** (`feats24`): 17 шт.; полный список в JSON.
- **Повторы identifier внутри `classes24`**: `channel-divinity, epic-boon, evasion, expertise, extra-attack, fighting-style, spellcasting, unarmored-defense, weapon-mastery, unarmed-strike`. Это особенности разных классов с одинаковыми слагами. Искать такие предметы по `identifier` нельзя — по `_id` или uuid.

Полный список (`name`, `identifier`, `type`, `_id`) — в файле `F:\LongStoryShort\lss-to-foundry\docs\research\dnd5e-5.1.8-compendium-ids.json`.

### 6.4 Формат JSON-файла

`{ "<pack>": [ { "name", "identifier", "type", "_id" } ] }`. Ключи: `classes, classes24, subclasses, races, origins24, backgrounds, feats24`. Списки включают все документы пака с полем `system` (включая особенности, у которых `type` = `feat` или `weapon`), кроме папок (`_folder.yml`). Количество: classes 12, classes24 282, subclasses 12, races 34, origins24 54, backgrounds 3, feats24 17.

### 6.5 Важные отличия между редакциями

- Идентификаторы подклассов и видов отличаются между 2014 и 2024 (разделы 6.3). Для сопоставления LSS использовать таблицу соответствий, а не слаг.
- Подклассы 2024 лежат в `classes24`, а не в `subclasses`.

---

## 7. Roll data и формулы ✅

### 7.1 Откуда берутся данные

- Актёр: `ActorDataModel.getRollData` (`module/data/abstract/actor-data-model.mjs:79-85`) → `{ ...this }` + `prof` (объект `Proficiency`, `deterministic`).
- Персонаж: `CreatureTemplate.getRollData` (`module/data/actor/templates/creature.mjs:302-316`) добавляет `classes` и `subclasses`.
- Документ актёра: `Actor.getRollData` (`module/documents/actor/actor.mjs:400-413`) добавляет `flags`, `name`, `statuses`.
- Предмет: `Item.getRollData` (`module/documents/item.mjs:832-842`) добавляет `item` (системные данные предмета), `scaling`.
- `system.scale` — `ActorDataModel._prepareScaleValues` (`abstract/actor-data-model.mjs:58-66`): ключ — `identifier` предмета, значение — `ScaleValue`-значения.

### 7.2 Пути (проверено по `getRollData`)

| Путь в формуле | Значение |
|---|---|
| `@abilities.<k>.value` / `.mod` / `.save` / `.dc` | характеристика, модификатор, спасбросок, СЛ |
| `@prof` | бонус мастерства (строка `term`: число, либо `1d…` при настройке `dice`) — `proficiency.mjs:125-128` |
| `@attributes.prof` | то же число |
| `@details.level` | уровень персонажа (сумма `levels`) |
| `@classes.<identifier>.levels` | уровни класса по `identifier` класса |
| `@classes.<identifier>.hd.denomination`, `@classes.<identifier>.hitDice` | кость хитов (`hitDice` — совместимость) |
| `@classes.<identifier>.spellcasting.*` | спеллкастинг класса |
| `@subclasses.<subclassIdentifier>.levels` | уровни подкласса (`creature.mjs:305-311`) |
| `@scale.<identifier>.<key>` | значения `ScaleValue` (`system.scale`) |
| `@attributes.spell.mod` / `.dc` / `.attack` | спеллкастинг персонажа |
| `@attributes.hp.value`, `@attributes.hp.max` | HP |
| `@mod` | модификатор способности активности (только в атаке и уроне) |
| `@item.level` | уровень заклинания (для предмета) |
| `@flags.dnd5e.<flag>` | флаги, см. раздел 8.4 |
| `@name` | имя актёра |
| `@statuses.<status>` | `1`, либо значение `exhaustion` |

### 7.3 Маппинг маркеров LSS → Foundry

| Маркер | Формула Foundry | Замечание |
|---|---|---|
| `[STR]` | `@abilities.str.mod` | то же для `[DEX]`, `[CON]`, `[INT]`, `[WIS]`, `[CHA]` |
| `[PROF]` | `@prof` | |
| `[LVL]` | `@details.level` | |
| `[HALF_PROF]` | `floor(@prof / 2)` | ❓ округление: Джек-оф-всех-трейдов округляет вниз (`proficiency.mjs:47-53`) |
| (маркеров `[CLASS_LVL:…]` и `[SCALE:…]` в брифе нет; их синтаксис в LSS не сверялся — ❓) | `@classes.<identifier>.levels`, `@scale.<identifier>.<key>` | пути Foundry из раздела 7.2 |

Проверка по `getRollData`: все пути выше есть в данных персонажа. `@prof` в строке — это `term` (`proficiency.mjs:70-131`).

---

## 8. Active Effects (бонусы)

### 8.1 Механика ✅

- `ActiveEffect5e.apply(doc, change)` (`module/documents/active-effect.mjs:151`): флаги `flags.dnd5e.*` обрабатываются `_prepareFlagChange`; ключи `FORMULA_FIELDS` (`:29-47`) — формульные поля, которые не описаны в модели.
- Ключ `activities[<type>].<key>` (`active-effect.mjs:186`) — изменение активностей предмета заданного типа.
- Режимы — `CONST.ACTIVE_EFFECT_MODES` (`common/constants.mjs:44`): `CUSTOM 0, MULTIPLY 1, ADD 2, DOWNGRADE 3, UPGRADE 4, OVERRIDE 5`.
- `FormulaField` в ADD: `value + delta` (через `" + "`, `formula-field.mjs:43-47`). Строка пустая → берётся `delta`.
- `FormulaField` в MULTIPLY/UPGRADE/DOWNGRADE — `(value) * delta`, `max(value, delta)`, `min(value, delta)` (`formula-field.mjs:49-63`).
- `SetField` в ADD: добавление; значение с `-` перед ним удаляет (`active-effect.mjs:195-238`, `_applyAdd` 244-256).
- `AdvantageModeField` (roll.mode, `data/fields/advantage-mode-field.mjs:40-…`): ADD с `1` — источник преимущества, с `-1` — помехи; OVERRIDE — принудительный режим (`-1|0|1`).
- Порядок: базовые данные → эффекты → производные (`prepareBaseData` → `applyActiveEffects` → `prepareDerivedData`), поэтому `ac.bonus`, `movement.*`, `init.bonus` в `prepareBaseArmorClass`/`prepareMovement`/`prepareInitiative` учитываются (`attributes.mjs:159-250, 416-447`; `:375-400`).
- Передача эффектов: `transfer: true` у эффекта предмета (стандарт Foundry). ❓ специфика dnd5e 5.1.8 не проверялась.

### 8.2 Ключи (проверено по `prepareX` и схемам) ✅

| Назначение | Ключ | Тип | Режим | Источник |
|---|---|---|---|---|
| КД: бонус | `system.attributes.ac.bonus` | формула | ADD | `attributes.mjs:159-250`; `FORMULA_FIELDS` `active-effect.mjs:29-47` |
| КД: минимум | `system.attributes.ac.min` | формула | ADD/OVERRIDE | то же |
| КД: плоское значение | `system.attributes.ac.flat` | число | OVERRIDE | `calc: "flat"`/`"natural"` |
| Инициатива: бонус | `system.attributes.init.bonus` | формула | ADD | `attributes.mjs:375-400` |
| Скорость | `system.attributes.movement.<walk\|fly\|swim\|climb\|burrow>` | число | ADD/OVERRIDE | `attributes.mjs:416-447` |
| Чувства | `system.attributes.senses.<darkvision\|blindsight\|tremorsense\|truesight>` | число | ADD/OVERRIDE | `senses-field.mjs:18-28` |
| Характеристика | `system.abilities.<k>.value` | число | ADD | `common.mjs:35-55` (базовое значение; `prepareAbilities` ниже) |
| Бонус проверки | `system.abilities.<k>.bonuses.check` | формула | ADD | `common.mjs:35-55` |
| Бонус спасброска | `system.abilities.<k>.bonuses.save` | формула | ADD | то же |
| Владение спасброском | `system.abilities.<k>.proficient` | 0–1 | OVERRIDE/ADD | `common.mjs:35-55` (`max: 1`) |
| Преимущество проверки | `system.abilities.<k>.check.roll.mode` | AdvantageMode | ADD ±1 | `roll-config-field.mjs:26-32` |
| Преимущество спасброска | `system.abilities.<k>.save.roll.mode` | AdvantageMode | ADD ±1 | то же |
| Навык: уровень | `system.skills.<id>.value` | 0/0.5/1/2 | OVERRIDE/ADD | `creature.mjs:45-56` |
| Навык: бонус | `system.skills.<id>.bonuses.check` | формула | ADD | то же |
| Навык: пассивный | `system.skills.<id>.bonuses.passive` | формула | ADD | то же |
| Навык: преимущество | `system.skills.<id>.roll.mode` | AdvantageMode | ADD ±1 | то же |
| Инструмент: уровень | `system.tools.<id>.value` | 0/0.5/1/2 | OVERRIDE/ADD | `creature.mjs:58-66` |
| Инструмент: бонус | `system.tools.<id>.bonuses.check` | формула | ADD | то же |
| Общий бонус проверок | `system.bonuses.abilities.check` | формула | ADD | `creature.mjs:31-50` |
| Общий бонус спасбросков | `system.bonuses.abilities.save` | формула | ADD | то же |
| Общий бонус навыков | `system.bonuses.abilities.skill` | формула | ADD | то же |
| Бонус атаки оружием | `system.bonuses.mwak.attack` (также `rwak`, `msak`, `rsak`) | формула | ADD | то же |
| Бонус урона | `system.bonuses.mwak.damage` (аналогично) | формула | ADD | то же |
| СЛ заклинаний | `system.bonuses.spell.dc` | формула | ADD | `creature.mjs:31-50` |
| HP: за уровень | `system.attributes.hp.bonuses.level` | формула | ADD | `character.mjs:120-124` |
| HP: общий | `system.attributes.hp.bonuses.overall` | формула | ADD | то же |
| HP: временный максимум | `system.attributes.hp.tempmax` | число | ADD | `character.mjs:118-121` |
| Спасброски смерти | `system.attributes.death.bonuses.save` | формула | ADD | `character.mjs:122-133` |
| Концентрация | `system.attributes.concentration.bonuses.save` | формула | ADD | `attributes.mjs:84-110` |
| Сопротивления | `system.traits.dr.value` (аналогично `di`, `dv`, `ci`) | Set | ADD | `traits.mjs:51-69` |
| Языки | `system.traits.languages.value` | Set | ADD | `traits.mjs:75-86` |
| Модификатор урона по типу | `system.traits.dm.amount.<type>` | формула | ADD | `traits.mjs:51-69` |
| Ячейки: переопределение | `system.spells.spellN.override` | число | OVERRIDE | `creature.mjs:67-80` |
| Прочие флаги | `flags.dnd5e.<флаг>` (раздел 8.4) | по типу | по типу | `config.mjs:4710-4818` |

Замечание к `abilities.<k>.value`: это базовое значение. ADD здесь меняет то же число, что и ASI.

### 8.3 Подавление ✅

Эффекты предмета не применяются, если:
- предмет не `consumable` (кроме `rod, trinket, wand`) и `equipped === false`;
- `attunement === "required"` и `attuned` не `true` (`item.mjs:463-468`).

Эффекты класса, вида, предыстории и заклинаний не подавляются этими условиями.

### 8.4 Флаги `flags.dnd5e.*` ✅

Булевы флаги (`config.mjs:4710-4818`):
- `diamondSoul` (владение всеми спасбросками, `common.mjs:144`), `enhancedDualWielding`, `elvenAccuracy`, `halflingLucky`, `halflingNimbleness`, `initiativeAlert`, `jackOfAllTrades`, `observantFeat`, `tavernBrawlerFeat`, `powerfulBuild`, `reliableTalent`, `remarkableAthlete`, `toolExpertise`.
- Числовые: `weaponCriticalThreshold`, `spellCriticalThreshold`, `meleeCriticalDamageDice`.

### 8.5 Пример эффекта ⚠️

```json
{
  "name": "Щит веры (пример)",
  "transfer": true,
  "changes": [
    { "key": "system.attributes.ac.bonus", "mode": 2, "value": "1" },
    { "key": "system.abilities.dex.check.roll.mode", "mode": 2, "value": "1" },
    { "key": "flags.dnd5e.jackOfAllTrades", "mode": 5, "value": "true" }
  ]
}
```
(`value` для флагов — строка, `_prepareFlagChange` приводит тип; `mode: 5` — OVERRIDE. Поведение `_prepareFlagChange` ❓ не читалось.)

---

## 9. Состояния, истощение, вдохновение, спасброски смерти

### 9.1 Состояния (conditions) ✅

- Состояние — это **ActiveEffect** с `statuses: [<id>]` (core Foundry). В `system` его нет. Актёр получает `actor.statuses` (`actor.mjs:407-411`).
- Список (`config.mjs:4019-4174`): `bleeding, blinded, burning, charmed, cursed, dehydration, deafened, diseased, exhaustion, falling, frightened, grappled, incapacitated, invisible, malnutrition, paralyzed, petrified, poisoned, prone, restrained, silenced, stunned, suffocation, surprised, transformed, unconscious`.
- Что каждое состояние делает (ключи `conditionEffects`, `config.mjs:4175-4196`): `noMovement`, `halfMovement`, `crawl`, `petrification`, `halfHealth`, `abilityCheckDisadvantage`, `abilitySaveDisadvantage`, `attackDisadvantage`, `dexteritySaveDisadvantage`, `initiativeAdvantage`, `initiativeDisadvantage`. Проверка: `actor.hasConditionEffect` (`actor.mjs:422-433`).
- Дополнительные статусы (`statusEffects`, `config.mjs:4198-4280`): `burrowing`, `concentrating`, `coverHalf`, `coverThreeQuarters`, `dodging`, `ethereal`, `flying`, `hiding`, `hovering`, `marked`, `dead` и др.

Как создать состояние программно: ActiveEffect с `statuses: ["blinded"]` и `name`/`img` из `CONFIG.DND5E.conditionTypes` (`config.mjs:4019`). ❓ точный набор полей `toggleStatusEffect` в dnd5e не читался.

### 9.2 Истощение ✅

- Уровень хранится в **ActiveEffect** с фиксированным `_id` = `staticID("dnd5eexhaustion")` = `"dnd5eexhaustion0"` (`active-effect.mjs:17-21`, `utils.mjs:375-378`). Уровень в `flags.dnd5e.exhaustionLevel` (`active-effect.mjs:334-350`).
- `system.attributes.exhaustion` — производное: `Number.isFinite(level) ? level : 0` (`attributes.mjs:340-346`). Запись в `system.attributes.exhaustion` не сохраняется.
- На уровне 6 добавляется статус `dead` (`active-effect.mjs:341-342`).
- Эффекты истощения по уровням: скорость −5 на уровень (в modern, `attributes.mjs:416-420`, `config.mjs:4064-4070` `reduction: { rolls: 2, speed: 5 }`). В legacy истощение дает condition-эффекты через `hasConditionEffect` (`actor.mjs:422-433`).
- `statuses` у эффекта истощения ❓ не проверено (возможно, `["exhaustion"]`).

### 9.3 Вдохновение ✅

`system.attributes.inspiration` — boolean, `required: true` (`character.mjs:134`). Хранится в исходных данных.

### 9.4 Спасброски смерти ✅

- `system.attributes.death.success`, `system.attributes.death.failure` — целые ≥0 (`character.mjs:122-133`). Верхний предел в схеме не задан (`max` не указан).
- `system.attributes.death.bonuses.save` — формула.
- Сброс при лечении (`actor.mjs:619-630`): если `hp.value` был ≤0 и становится >0, `success` и `failure` обнуляются.
- Логика перехода в смерть и стабилизацию ❓ не читалась.

---

## 10. Что не проверено и ограничения

1. Foundry не запускалась. Все утверждения о рантайме — по исходникам dnd5e 5.1.8 и ядру Foundry 13.348 (чтение). Помечены ⚠️ те, что выведены из кода без проверки в клиенте.
2. Скомпилированные LevelDB-паки (`F:\Files\Foundry VTT\UserDate\Data\systems\dnd5e\packs\*\*.ldb`) не разбирались: значения сжаты Snappy. Данные компендиумов взяты из `packs/_source/**.yml` (до миграции). Для продовых данных использовать `fromUuid` внутри Foundry.
3. Таблица слотов заклинаний (`SPELL_SLOT_TABLE`, `pactCastingProgression`) в `config.mjs` не выписана (❓).
4. Advancement уровня 0 у вида и предыстории: программное применение не проверено end-to-end (раздел 5.9).
5. `ItemChoice` и `ScaleValue`: модели и `apply` не читались (❓); ключи `ScaleValue` для 2024 не выписаны.
6. Поведение `innate`/`atwill` с `prepared = 0` и `prepared = 1` (что означает значение для этих методов) ❓.
7. `_source` spells 2014 (`packs/_source/spells/**`) по форме `preparation` ❓ не проверено (предполагается та же легаси-форма).
8. Общие флаги `transfer` и `statuses` у эффекта истощения — ❓.
9. Скелет персонажа (раздел 1.1) проверен по схемам и `getRollData`, но не запущен; валидация Foundry (`DataModel.validate`) не выполнялась.
10. Настройка `rulesVersion` влияет на инициативу, `hasConditionEffect` и источник `rules` новых предметов. Полный перебор всех мест использования не делался.
11. Пакеты `packs/_source` — из тега `release-5.1.8`. Локальная установка соответствует версии `5.1.8` по `system.json`, но побайтно не сверялась.
12. Выводы о `classes24`-подклассах (identifier `land`, `hand` и т. д.) сделаны по `_source` YAML, значение `system.identifier` взято как есть.

---

## Приложение A. Ссылки на файлы (сводка)

- Схемы актёра: `module/data/actor/character.mjs`, `module/data/actor/templates/{common,creature,details,attributes,traits}.mjs`, `module/data/shared/{currency,movement-field,senses-field,roll-config-field}.mjs`.
- Предметы: `module/data/item/{class,subclass,race,background,feat,weapon,equipment,consumable,tool,loot,container,spell}.mjs`, `module/data/item/templates/*.mjs`.
- Активности: `module/data/activity/{base-activity,attack-data,damage-data}.mjs`, `module/data/fields/activities-field.mjs`, `module/data/shared/damage-field.mjs`, `module/data/shared/uses-field.mjs`.
- Advancement: `module/documents/advancement/*.mjs`, `module/data/advancement/*.mjs`, `module/applications/advancement/advancement-manager.mjs`.
- Документы: `module/documents/item.mjs`, `module/documents/actor/actor.mjs`, `module/documents/active-effect.mjs`, `module/documents/actor/{trait,proficiency,hit-dice}.mjs`.
- Конфиг: `module/config.mjs` (номера строк указаны в тексте).
- Компендиумы: `packs/_source/**`; `system.json` (`packs`).
- Ядро Foundry (только чтение): `F:\Files\Foundry VTT\Foundry Virtual Tabletop\resources\app\client\data\client-backend.mjs`, `...\resources\app\common\abstract\data.mjs`, `...\resources\app\common\constants.mjs`.
- Сопоставленные идентификаторы: `F:\LongStoryShort\lss-to-foundry\docs\research\dnd5e-5.1.8-compendium-ids.json`.
