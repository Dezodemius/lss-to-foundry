# Дизайн модуля LSS to Foundry

Состояние на 22.10.2026. Цель и окружение — в [`CONTEXT.md`](CONTEXT.md), исследования — в
[`research/`](research/). Этот документ — договорённости, по которым пишется код: решения,
контракты между частями и разбивка на файлы. Если код расходится с документом, сначала
поправьте документ.

## 1. Принципы

1. **Числа берём из LSS, механику — из компендиумов dnd5e.** Характеристики, владения,
   HP, КД, ячейки и бонусы переносятся так, чтобы лист в Foundry показывал те же итоговые
   числа, что и LSS. Классы, подклассы, виды, предыстории, их особенности и SRD-заклинания
   берутся из компендиумов dnd5e: так у предметов есть описания, активности и кнопки бросков.
2. **Компендиум ищется по `system.identifier`, не по имени.** Babele переводит `name`
   в индексе, а `identifier` остаётся английским слагом (`research/foundry-module-dev.md` §1).
3. **Тексты LSS в модуль не кладём.** Ни переводов заклинаний, ни описаний. Русский текст
   SRD-заклинаний даёт Babele-перевод у пользователя (сейчас `ru-ru`: для 2014 работает,
   для 2024 — только в свежей версии upstream, где есть `ag/dnd5e.spells24.json`).
4. **Ничего не теряем молча.** Всё, что не удалось перенести, попадает в отчёт импорта.
5. **Чистое ядро.** `scripts/core/**` не трогает глобалы Foundry (`game`, `foundry`, `CONFIG`,
   `Actor`…) и покрывается тестами Vitest. Всё, что требует Foundry, живёт в `scripts/foundry/**`
   и `scripts/ui/**`. Случайные id ядро получает через `ctx.randomID`.
6. **Терпимость к входу.** Файлы `elfrey-lss-converter` и старые экспорты LSS расходятся со
   схемой (числа вместо строк, `isProf: 0.5`, лишние ключи, `text.*.value.id`). Импортёр
   нормализует, а не падает (`research/lss-character-format.md` §7).

## 2. Версии

- Foundry **13** (проверено на 13.348). Система **dnd5e 5.1.x** (проверено на 5.1.8).
- Правила мира: настройка `dnd5e.rulesVersion` (`modern` = 2024, `legacy` = 2014). Редакция
  персонажа — из `edition` файла LSS (по умолчанию 2024). При расхождении — предупреждение
  в окне импорта, импорт не блокируется.
- Поддержку других версий Foundry/dnd5e добавляем позже, по списку изменений.

## 3. Поток импорта

```
файлы .json ──parseLssFile──► LssCharacter[] + GrimoireSpell[]      (core/parse, core/grimoire)
   окно импорта: список с чекбоксами, предупреждения                  (ui/import-app)
   importCharacters(selected, grimoire, options, onProgress)          (foundry/importer)
     для каждого персонажа:
       computeStats → mapActor                 (core/map-actor)
       mapWeapons, mapResources                (core/map-items)
       mapBonuses                              (core/map-bonuses)
       buildOriginItems: класс, подкласс, вид, предыстория, особенности   (foundry/class-builder)
       buildSpellItems: SRD из компендиума, свои — из Гримуара без дублей (foundry/spells)
       writeActor: Actor.create(...), затем сверка HP, ячеек, состояний   (foundry/actor-writer)
   отчёт: по каждому персонажу — ссылка на актёра, предупреждения, ненайденные заклинания
```

Публичный API для расширения (второй шаг): `game.modules.get("lss-to-foundry").api =
{ parseLssFile, importCharacters, openImportApp }`.

## 4. Решения

### 4.1 Заклинания

Цепочка поиска для каждой ссылки из `spells.prepared`, `spells.book`, `spells.granted`, `spells.pending`:

1. Ссылка → `SpellRef` (`core/spell-refs`): 24-hex id ищется в таблице SRD-id обеих редакций
   (`data/srd-spell-index-{2014,2024}.json`), слаг и английское имя (`Cure Wounds`,
   `Исцеление ран [Cure Wounds]`) приводятся к слагу.
2. SRD-заклинание: кандидаты `identifier` по порядку — псевдоним для редакции
   (`blindness-or-deafness` → `blindness-deafness`), сам слаг. Паки по порядку:
   паки из настройки `extraSpellPacks`, пак редакции (`dnd5e.spells24` / `dnd5e.spells`),
   пак другой редакции (запасной путь: `ice-knife` нет в 5.1.8 `spells24`). Запасной путь
   пишет предупреждение.
3. Своё заклинание (не SRD): ищется в загруженных файлах Гримуара (по id, затем по слагу).
   В мире создаётся **один** предмет в папке `LSS: Гримуар` (настройка `spellFolder`) с флагом
   `flags.lss-to-foundry.lssSpellId`. Повторный импорт и другие персонажи переиспользуют его.
   Персонажу кладётся копия с `_stats.compendiumSource = <uuid мирового предмета>`.
   Без права `ITEM_CREATE` мировой предмет не создаётся, копия кладётся прямо в персонажа.
4. Не нашлось нигде — в отчёт («не найдено: <id или слаг>»), предмет не создаётся.

Подготовка (`system.method`, `system.prepared`, `system.sourceClass`; поля 5.1.8, см.
`research/dnd5e-5.1.8-data-model.md` §2.13):

| Условие | `prepared` |
|---|---|
| есть в `granted` | 2 (всегда) |
| заговор (круг 0) | 1 |
| есть в `prepared` | 1 |
| только в `book` | 0 |

`method`: `pact`, если класс персонажа — колдун (`warlock`), иначе `spell`. Заклинание из
`slotless` — `innate`. `sourceClass` — identifier класса. Характеристика из
`spellsInfo.abilities[id]` → `system.ability`.

### 4.2 Класс, подкласс, вид, предыстория

- Сопоставление LSS id → identifier dnd5e — по таблице `data/lss-dnd5e-ids.json` (по редакции),
  с запасным поиском по имени (английскому и русскому) из той же таблицы. В LSS id часто
  нет (в примере у подкласса только `value: "Life Domain"`).
- Предметы копируются из компендиума (`doc.toObject()`), им заранее назначается `_id`, чтобы
  в той же операции записать `details.race`, `details.background`, `details.originalClass`
  и `Subclass.value` у класса. Создание: `Actor.create(data, { keepEmbeddedIds: true })`.
- Класс: `levels` = уровень LSS. Advancement `HitPoints`: 1-й уровень `"max"`, остальные `"avg"`
  (итог затем сверяется с HP LSS, §4.4).
- Особенности (настройка `classFeatures`, по умолчанию включена): неопциональные `ItemGrant`
  класса и подкласса до текущего уровня и уровня 0 у вида и предыстории. Копия из компендиума,
  `flags.dnd5e.{sourceId, advancementOrigin, advancementRoot}`, запись `value.added`
  (`research/dnd5e-5.1.8-data-model.md` §5.4). Опциональные гранты и выборы (`ItemChoice`,
  `Trait`, `ASI`) не применяются — в отчёт.
- **Переданные эффекты выданных особенностей выключаются** (`disabled: true`), потому что их
  числа уже есть в бонусах LSS. Иначе бонусы считались бы дважды. В отчёте — список.
- Мультикласс: LSS хранит один класс; импортируется он один, предупреждение, если
  `vitality.hp-dice-multi` содержит больше одной кости.

### 4.3 Бонусы LSS → Active Effects

- `stat.<ab>.score` (режим `add`/`set`, включённые) **вшиваются** в `abilities.<ab>.value`
  (`computeStats`), а не превращаются в эффекты: так LSS хранит прибавки от происхождения и ASI.
- `hp.max` не превращается в эффект: суммируется в цель HP (§4.4).
- `spellSlot.N`, `pactSlot.N` прибавляются к целевому числу ячеек (§4.4).
- `weapon.<id>.attack|damage` уходят в бонусы атаки и урона соответствующего оружия.
- Остальные — изменения Active Effect по таблице §6.3. Эффекты на актёре (`transfer: false`):
  - по одному на каждый `data.effects[]` (имя, описание, `disabled` из LSS);
  - «LSS: бонусы» — включённые бонусы без эффекта;
  - «LSS: отключённые бонусы» — `disabled: true`;
  - «LSS: условные бонусы» (`conditional`) — `disabled: true`.
- Бонус с `source.kind: "attunement"` действует, только если слот `attunementsList` с
  `id === source.refId` отмечен.
- Нерасшифровываемое (`stat.*.attack`, неизвестные таргеты, `advantage` для таргетов без
  режима броска) — в `skipped` с причиной, в отчёт.

### 4.4 Сверка после создания

dnd5e считает часть чисел сам (HP из advancement, ячейки из таблицы класса). После
`Actor.create` писатель читает подготовленные значения и подгоняет их под LSS:

- HP: цель = `hp-max` + `hp-max-bonus` + Σ включённых бонусов `hp.max`. Разница с
  `system.attributes.hp.max` записывается в `system.attributes.hp.bonuses.overall`. Текущие HP
  = `hp-current` (не больше цели), временные = `hp-temp`.
- Ячейки: цель круга N = `slots-N.value` + Σ `spellSlot.N`. Если отличается от
  `system.spells.spellN.max` — записывается `override`. Текущие = цель − `filled`. Договор
  колдуна — так же через `spells.pact`.
- Состояния: `actor.toggleStatusEffect(id, { active: true })` для известных ключей;
  истощение — через API dnd5e 5.1.8 (проверить по исходнику, см. задачу I4b).

### 4.5 Что из LSS идёт в текст

- `details.biography.value` (HTML): блок `background`, затем разделы с заголовками для
  остальных непустых текстовых блоков (`features`, `traits`, `feats`, `equipment`, `items`,
  `attacks`, `prof`, `attunement`, `quests`, `allies`, `notes-1…6`, `spells-level-N` и
  неизвестные ключи; заголовок — `customLabel` или русское имя блока), затем список
  предметов настройки (`attunementsList`, отмеченные).
- `details.trait`, `ideal`, `bond`, `flaw`, `appearance` — из блоков `personality`, `ideals`,
  `bonds`, `flaws`, `appearance`.
- Документ редактора LSS → HTML (`core/rich-text`): белый список узлов, экранирование,
  `roller`/`formula` → инлайн-бросок `[[/r <формула>]]`, `resource` → имя ресурса со
  счётчиком, `spoiler` → `<details><summary>`, `taskItem` → ☐/☑, `divider` → `<hr>`.
  Неизвестный узел → его текст, без падения.

### 4.6 Повторный импорт (этап 2)

Своего id у персонажа LSS в файле нет. На этапе 1 импорт всегда создаёт нового актёра.
На этапе 2: поиск актёра с тем же `flags.lss-to-foundry.source.name` и выбор «обновить /
создать нового»; при обновлении удаляются только предметы с `flags.lss-to-foundry.imported`,
ручные остаются (как в pathmuncher, `research/prior-art.md` §2.4).

## 5. Контракты ядра

Типы — JSDoc в коде. Здесь — то, на что опираются соседние части.

### 5.1 `scripts/core/parse.mjs`

```js
/**
 * @typedef {object} LssCharacter
 * @property {string} key        `${fileName}#${index}` — уникален в рамках одного импорта
 * @property {string} fileName
 * @property {'2014'|'2024'} edition
 * @property {{ sheetEdition: string|null, tags: unknown[], spells: {
 *   mode: string, prepared: string[], book: string[],
 *   pending: { slug: string, list: string }[], granted: { id: string, source?: string }[],
 *   slotless: string[] } }} envelope    массивы всегда есть (по умолчанию [])
 * @property {object} data       разобранный и нормализованный `data`
 * @property {string} name       data.name.value || fileName
 * @property {number} level      data.info.level.value, по умолчанию 1
 * @property {string} className  data.info.charClass.value || ''
 * @property {string[]} warnings
 */
export function parseLssFile(text, fileName)
  // → { characters: LssCharacter[], grimoire: GrimoireSpell[], errors: string[] }
  // Принимает: объект персонажа; массив персонажей; { characters: [...] };
  // массив/объект заклинаний Гримуара (определяется через looksLikeSpell из core/grimoire).
  // `data` может быть строкой JSON или уже объектом.
export function normalizeData(data)   // → новый объект; гарантирует info, stats, saves, skills,
  // vitality, text, coins, resources {}, bonuses [], effects [], weaponsList [],
  // attunementsList [], conditions []; убирает text.*.value.id; isProf → 0 | 0.5 | 1 | 2
```

### 5.2 `scripts/core/formula.mjs` (готово)

`toFoundryFormula`, `toFoundryNumeric`, `evaluateNumeric`, `parseDamage`, `splitLabel`,
`abilityMod`, `VARIABLES`. Тесты: `test/core/formula.test.mjs`.

### 5.3 `scripts/core/map-actor.mjs`

```js
export function computeStats(char)
  // → { abilities: { [ab]: { score: number, mod: number } }, prof: number, level: number,
  //     formulaCtx: { abilities: { [ab]: mod }, prof, level } }
  // score = stats.<ab>.score + включённые бонусы stat.<ab>.score (add; set — последним);
  // prof = proficiencyCustom || proficiency || 2 + floor((level - 1) / 4)
export function mapActor(char, stats, ctx)
  // ctx = { randomID, options: { useAvatar } }
  // → { name, img: string|null, system: object, targets: {
  //       hpMax: number, hpCurrent: number, hpTemp: number,
  //       slots: { [1..9]: { total: number, filled: number } },
  //       pact: { level: number, total: number, filled: number } | null,
  //       conditions: string[], exhaustion: number },
  //     warnings: string[] }
```

### 5.4 `scripts/core/map-items.mjs`

```js
export function mapWeapons(char, stats, weaponBonuses, ctx)  // → { items: ItemSource[], warnings }
export function mapResources(char, stats, ctx)               // → { items: ItemSource[], warnings }
```
`weaponBonuses` — из `mapBonuses().weapon`. Каждый предмет: `flags["lss-to-foundry"] =
{ imported: true, lssId }`.

### 5.5 `scripts/core/map-bonuses.mjs`

```js
export function mapBonuses(char, stats, ctx)
  // → { effects: ActiveEffectSource[],
  //     weapon: { [weaponId]: { attack: string[], damage: string[] } },
  //     hpMax: number,                         // Σ включённых hp.max
  //     slots: { spell: { [1..9]: number }, pact: number },
  //     skipped: { id, label, target, reason }[], warnings: string[] }
```

### 5.6 `scripts/core/spell-refs.mjs`, `scripts/core/grimoire.mjs`, `scripts/core/ids.mjs`

```js
export function createSpellIndex(entries2014, entries2024)   // записи data/srd-spell-index-*.json
export function resolveSpellRefs(char, index)
  // → SpellRef[]: { ref, kind: 'srd'|'custom', lssId, slug, englishName, level, edition,
  //                lists: ('prepared'|'book'|'granted')[], slotless, ability, chargeResourceId }
  //   одна запись на заклинание (списки объединены)
export function identifierCandidates(slug, edition)          // → string[]
export const IDENTIFIER_ALIASES                               // слаг LSS → identifier dnd5e

export function looksLikeSpell(value)                         // → boolean
export function parseGrimoireEntries(list)                    // → GrimoireSpell[]
  // GrimoireSpell: { lssId, slug, name, item: ItemSource|null, raw }
export function grimoireKey(spell)                            // 'id:<lssId>' | 'slug:<slug>'
export function findGrimoireSpell(ref, grimoire)              // → GrimoireSpell|null
export function spellItemFromGrimoire(spell, ctx)             // → ItemSource (type 'spell')

export function mapClass(lssClassId, className, edition)      // → identifier|null
export function mapSubclass(lssSubclassId, subclassName, classIdentifier, edition)
export function mapRace(lssRaceId, raceName, lssSubraceId, subraceName, edition)
export function mapBackground(lssBackgroundId, name, edition)
```

## 6. Сопоставление полей

### 6.1 Актёр

| LSS | dnd5e 5.1.8 | Примечание |
|---|---|---|
| `name.value` | `name`, токен | |
| `avatar.webp` / `avatar.jpeg` | `img`, `prototypeToken.texture.src` | настройка `useAvatar` |
| `stats.<ab>.score` (+ `stat.<ab>.score`) | `system.abilities.<ab>.value` | §4.3 |
| `saves.<ab>.isProf` | `system.abilities.<ab>.proficient` | 2 → 1 + предупреждение |
| `saves.<ab>.bonus`, `bonusExpr` | `system.abilities.<ab>.bonuses.save` | формула |
| `saves.<ab>.customModifier` | разница с расчётом → `bonuses.save` | |
| `skills.<k>.isProf` | `system.skills.<id>.value` (0, 0.5, 1, 2) | ключи `core/lss-keys` |
| `skills.<k>.baseStat` | `system.skills.<id>.ability` | |
| `skills.<k>.bonus`, `bonusExpr` | `system.skills.<id>.bonuses.check` | |
| `skills.<k>.customModifier` | разница с расчётом → `bonuses.check` | |
| `skills.<k>.customPassive` | разница с расчётом → `bonuses.passive` | |
| `vitality.hp-*` | `system.attributes.hp.value/temp`, цель для §4.4 | `hp.max` = null |
| `vitality.ac` (+ `shield`) | `system.attributes.ac`: `calc: "custom"`, `formula` | не переводится → `flat` с числом |
| `vitality.initiative` | `system.attributes.init.bonus` | формула минус `@abilities.dex.mod` |
| `vitality.speed` | `system.attributes.movement.walk` | число |
| `vitality.darkvision` | `system.attributes.senses.darkvision` | 0 → null |
| `vitality.deathSuccesses/deathFails` | `system.attributes.death.success/failure` | |
| `inspiration` | `system.attributes.inspiration` | |
| `spellsInfo.base.code` | `system.attributes.spellcasting` | |
| `info.alignment.value` | `system.details.alignment` | текст как есть |
| `info.experience.value` | `system.details.xp.value` | `""` → 0 |
| `subInfo.*` | `system.details.{age,height,weight,eyes,skin,hair}` | |
| `info.size.value` | `system.traits.size` | `core/lss-keys` SIZES |
| `prof.armor-*`, `prof.weapon-*` | `system.traits.armorProf/weaponProf.value` | `weapon-other` → `custom` |
| `coins.*` | `system.currency.*` | |
| `spells.slots-N`, `spellsPact` | `system.spells.spellN/pact` | §4.4 |
| `conditions`, `exhaustion` | статусы | §4.4 |
| текстовые блоки | `system.details.*` | §4.5 |
| `info.playerName.value` | в `flags.lss-to-foundry.source.playerName` | |

### 6.2 Предметы

| LSS | dnd5e 5.1.8 |
|---|---|
| `weaponsList[]` | `weapon`: `damage.base` из `parseDamage` (типы — из слов после кости или `dmgType`), `proficient` из `isProf`, `equipped: true`, `description` из `notes`, активность `attack` (`ability` из `ability`, `bonus` = `modBonus`/`modCustom` + `weapon.<id>.attack`, доп. части урона + `weapon.<id>.damage`). Тип оружия: `simpleR`, если в имени/заметках дальнобойное (лук, арбалет, праща, дротик, bow, crossbow, sling, dart), иначе `simpleM`. Если в формуле урона нет переменной характеристики, а атака с характеристикой — к бонусу урона дописывается `- @mod`. |
| `resources{}` | `feat` с `uses`: `max` (`max` или формула `maxExpr`), `spent = max − current`, `recovery`: сначала `lr` (`recoverAll`), затем `sr` (`recoverAll` или `formula` из `shortRestRegain`); `description` из `notes` |
| `spells.*` | §4.1 |
| `info.charClass/charSubclass/race/subrace/background` | §4.2 |

### 6.3 Таргеты бонусов → ключи Active Effect

Режимы: `add` → ADD (2), `set` → OVERRIDE (5), `upgrade` → UPGRADE (4), `downgrade` → DOWNGRADE (3),
`multiply` → MULTIPLY (1). Значение: `value` или `expr` через `toFoundryNumeric`; для числовых
полей — вычисленное число.

| Таргет LSS | Ключ | Примечание |
|---|---|---|
| `ac`, `shield` | `system.attributes.ac.bonus` | `shield` — только если щит включён |
| `initiative` | `system.attributes.init.bonus` | |
| `speed.walk` | `system.attributes.movement.walk` | число |
| `save.all` | `system.bonuses.abilities.save` | |
| `save.<ab>` | `system.abilities.<ab>.bonuses.save` | `save.cor` → skipped |
| `check.all` | `system.bonuses.abilities.check` | |
| `stat.<ab>.check` | `system.abilities.<ab>.bonuses.check` | |
| `skill.<k>` | `system.skills.<id>.bonuses.check` | aime-навыки → skipped |
| `passive.<k>` | `system.skills.<id>.bonuses.passive` | |
| `attack.all` | `system.bonuses.mwak.attack`, `system.bonuses.rwak.attack` | два изменения |
| `damage.weapon` | `system.bonuses.mwak.damage`, `system.bonuses.rwak.damage` | |
| `spellAttack` | `system.bonuses.msak.attack`, `system.bonuses.rsak.attack` | |
| `spellDC` | `system.bonuses.spell.dc` | |
| `prof.save.<ab>` | `system.abilities.<ab>.proficient` | UPGRADE 1 |
| `prof.skill.<k>` | `system.skills.<id>.value` | UPGRADE 1 или 2 |
| `prof.armor-*`, `prof.weapon-*` | `system.traits.armorProf.value` / `weaponProf.value` | ADD значения набора |
| `advantage`/`disadvantage` на `save.<ab>`, `stat.<ab>.check`, `skill.<k>` | `...save.roll.mode`, `...check.roll.mode`, `system.skills.<id>.roll.mode` | ADD `1` / `-1` |
| `stat.<ab>.score` | — | вшито (§4.3) |
| `hp.max`, `spellSlot.N`, `pactSlot.N`, `weapon.<id>.*` | — | §4.3 |
| остальное | — | skipped |

## 7. Разбивка на файлы и исполнителей

| Задача | Файлы (только свои) |
|---|---|
| готово | `scripts/constants.mjs`, `scripts/core/lss-keys.mjs`, `scripts/core/formula.mjs`, `test/core/formula.test.mjs`, `package.json`, `vitest.config.mjs` |
| I1 — разбор и актёр | `scripts/core/parse.mjs`, `scripts/core/rich-text.mjs`, `scripts/core/map-actor.mjs`, `test/core/{parse,rich-text,map-actor}.test.mjs` |
| I2 — заклинания и идентификаторы | `tools/build-spell-index.mjs`, `data/srd-spell-index-{2014,2024}.json`, `data/lss-dnd5e-ids.json`, `scripts/core/{spell-refs,grimoire,ids}.mjs`, `test/core/{spell-refs,grimoire,ids}.test.mjs` |
| I3 — предметы и бонусы | `scripts/core/{map-items,map-bonuses}.mjs`, `test/core/{map-items,map-bonuses}.test.mjs` |
| I4a — оболочка модуля и окно | `module.json`, `scripts/main.mjs`, `scripts/settings.mjs`, `scripts/ui/import-app.mjs`, `templates/import-app.hbs`, `styles/lss-to-foundry.css`, `lang/{ru,en}.json`, `README.md` |
| I4b — слой Foundry | `scripts/foundry/{compendium-index,class-builder,spells,actor-writer,importer}.mjs`, `docs/QA.md` |

Правила для всех: JS-модули ESM (`.mjs`), 4 пробела, одинарные кавычки, комментарии по-английски,
JSDoc у экспортов. В ядре — никаких глобалов Foundry. Тесты Vitest на фикстуре
`test/fixtures/lss/character-example.json` и на синтетических крайних случаях. Ничего не коммитить.

## 8. Уточнения при реализации (этап 1)

Код 0.1.0 местами отступает от разделов выше. Здесь — что и почему; при расхождении верен этот раздел.

- `resolveSpellRefs` возвращает `{ refs, warnings }`, а не массив.
- `mapClass` и др. — методы объекта из `createIdMapper(table)`; таблица грузится слоем Foundry через `fetch`.
  Есть `describeRace` — `mapRace` с предупреждениями о подвидах.
- Урон оружия без переменной характеристики получает в бонус `-@abilities.<хар>.mod`, а не `- @mod`:
  dnd5e 5.1.8 не добавляет `@mod` к части, где он уже встречается (`activity/attack-data.mjs`).
- `ability: "none"` у оружия остаётся `"none"` (dnd5e понимает его как «без характеристики»).
- `details.trait/ideal/bond/flaw/appearance` — простой текст: в dnd5e 5.1.8 это `StringField`.
- Если бонус мастерства в LSS отличается от расчёта dnd5e по уровню, каждому владеющему навыку и
  спасброску добавляется поправка в `bonuses`.
- **Ячейки у персонажа из визарда LSS** (у класса есть `id` датасета): `data.spells` — только база,
  LSS кладёт поверх таблицу класса. Цель = max(число LSS, расчёт dnd5e) + бонусы `spellSlot.N`.
  У листа, собранного руками, число LSS — итог (`slotTarget` в `foundry/actor-writer.mjs`).
- Без максимума HP в LSS сверка HP не делается, остаётся расчёт dnd5e.
- Мультикласс определяется по числу типов костей в `vitality.hp-dice-multi` (больше одного).

## 9. Открытые вопросы

1. **Формат экспорта Гримуара** неизвестен (публичного примера нет). `core/grimoire` написан
   защитно; нужен реальный файл «Скачать .json» от пользователя.
2. **Реальные экспорты персонажей** для тестов (пример LSS — синтетический).
3. Мультикласс в LSS: формат строки `charClass.value` у мультикласса.
4. Ключи `conditions` в LSS (английские id или что-то иное).
5. Истощение в dnd5e 5.1.8: точный способ выставить уровень программно.
6. Лицензия репозиториев (для публикации на GitHub).
