# Prior art: LSS ↔ Foundry VTT (dnd5e)

Состояние на 22.10.2026. Цель: найти готовые решения и прецеденты, которые модуль «LSS to Foundry» может взять или перенять.

Метки в тексте:
- **[код]** — проверено чтением исходников (репозиторий, ветка/коммит указаны в разделе проекта);
- **[док]** — описание со страницы или из README, код не читался;
- **[схема]** — публичная схема LSS `longstoryshort.app/schema/v1/character.json`;
- **[не проверено]** — только поиск или описание, либо источники расходятся.

Формат персонажа LSS разобран отдельно в `lss-character-format.md` (этот же каталог). Здесь он повторяется только там, где это нужно для сравнения проектов.

---

## 1. Краткий вывод

1. **Готового модуля «LSS → Foundry dnd5e» (полный персонаж) не найдено** ни на foundryvtt.com, ни на GitHub. Есть обратный конвертер Foundry → LSS: `Elfrey/elfrey-lss-converter`. Актуальный релиз 1.8.4 (2025-09-03), лицензии нет. У пользователя установлена 1.7 (Foundry 12, dnd5e 4.x).
2. **Единственный найденный LSS → Foundry конвертер** — внешнее веб-приложение `DariaMishu/lss_foundry_converter` (Python/Streamlit, лицензии нет). Оно создаёт только актёра без предметов, заклинаний и классов и содержит ошибки (раздел 2.2). Как образец не годится, полезно как список ловушек.
3. **Архитектурные образцы** — `MrPrimate/ddb-importer` (MIT) и `MrPrimate/pathmuncher` (MIT, Pathbuilder → PF2e). Их приёмы перечислены в таблице (раздел 3). Код целиком брать не нужно: оба проекта завязаны на свои источники данных и очень большие.
4. **Разбор формата LSS в коде** — `Evolebil/obr-character-hud` (лицензии нет, только идеи). Ценны парсер бонусов и формул без `eval`. Есть две ошибки против схемы (щит, `proficiencyCustom`).
5. **Русский Babele-перевод SRD-заклинаний уже есть и установлен у пользователя**: модуль `ru-ru` 13.348.1 содержит `compendium/dnd5e/ag` (по умолчанию) и `ds`. Покрытие списков LSS: 2014 — 318 из 318 (с тремя алиасами), 2024 — 339 из 339. Переводить заново не нужно. Тексты переводов в модуль не копировать (официальный перевод Hobby World, лицензия не указана).
6. **Dimension Door** — браузерное расширение для Chrome и Firefox. Оно сохраняет заклинания с dnd.su и dndvault в Гримуар LSS. Открытого кода нет, к Foundry отношения не имеет. Подтверждает, что Гримуар LSS наполняют сторонние инструменты.
7. **Вопрос к CONTEXT для второго шага (расширение).** Userscript-расширения LSS (`Lizardeon`, MIT; `fybits`, без лицензии) работают внутри страницы персонажа в сессии самого пользователя. Это не обращение к непубличным API, но граница «не логиниться / не непубличные эндпоинты» требует решения владельца проекта (раздел 5).

---

## 2. Проекты

### 2.1. Elfrey/elfrey-lss-converter — Foundry → LSS (обратное направление)

- Ссылки: https://github.com/Elfrey/elfrey-lss-converter , пакет https://foundryvtt.com/packages/elfrey-lss-converter
- **Лицензия:** в репозитории нет файла LICENSE, GitHub API отдаёт `license: null`. В `package.json` написано `"license": "MIT"`, но автор там `Blackcloud010` (остаток шаблона). Полагаться на это нельзя. Вывод: лицензия не указана.
- **Версии.** Релизы 1.5 … 1.8.4; последний — 2025-09-03. Манифест релиза 1.8.4: Foundry minimum 13, verified 13.347; dnd5e 5.0.0–5.9.9, verified 5.1.2 [код, релиз]. Страница пакета пишет «Foundry 11–13» — расхождение, верить манифесту. Ветка `main` (HEAD 2b118c01): `static/module.json` = 1.8.3. У пользователя установлена 1.7: `F:\Files\Foundry VTT\UserDate\Data\modules\elfrey-lss-converter\module.json` (minimumCoreVersion 12, dnd5e 4.0.0–4.9.9, verified 4.1.2) — прочитано, не изменялось.
- **Активность.** Открытых issues: 1. Issue #1 «Планируется ли обратная конвертация?» (LSS → Foundry), ответ автора 2024-06-03: «В планах есть, но пока нет времени заняться». То есть направления LSS → Foundry в проекте нет. Форк `AsterFerre/elfrey-lss-converter`: `compare main...AsterFerre:main` — identical, отдельной работы нет. Других LSS-проектов у автора среди примерно 60 публичных репозиториев не нашлось.
- **Как устроено** [код, `src/convert.js`, HEAD 2b118c01]:
  - `convertFoundryToLss(actor)` возвращает `{ tags, disabledBlocks, spells: { mode: 'text', prepared: [], book: [] }, data: JSON.stringify(lssData), jsonType: 'character', version: '2' }` (строки 505, 625–627). Это тот же envelope, что описан в CONTEXT.
  - Таблица `fttSkillsKeys` (строки 30–140) с полем `lssSkill`. Значения `'animal handling'` (стр. 41) и `'sleight of hand'` (стр. 125) — ключи с пробелами, как в схеме.
  - Заклинания пишутся текстом в блоки `spells-level-N` (стр. 421), id не пишутся.
  - Классы: уровни суммируются, hit dice собираются по типу кости (стр. 338–343); в `charClass` строка вида «Имя (уровень)».
  - Предметы и черты пишутся текстом. Черты с `activation` и `uses.max` превращаются в интерактивные ресурсы (`src/module/getResource.js`).
  - Оружие: `getWeaponObject.js` / `getWeaponStats.js` (поля `name`, `mod`, `dmg`, `ability`, `isProf`).
- **Что берём:** соответствие полей LSS и dnd5e (блоки `stats`, `saves`, `skills`, `vitality`, `coins`, `text`); структуру текстовых блоков `{ value: { id, data: { type: 'doc', content } } }`; пример режима `text` для заклинаний.
- **Что не берём:** `generateUniqueIds` (`Date.now()` + случайное число — возможны коллизии); код целиком (лицензия не указана).
- **Для CONTEXT:** конвертер пишет только режим `text`. Режим с id (`spells.book` / `spells.prepared`) этим проектом не покрыт.

### 2.2. DariaMishu/lss_foundry_converter — LSS → Foundry JSON (веб-приложение)

- Ссылки: https://github.com/DariaMishu/lss_foundry_converter , приложение https://lssfoundryconverter.streamlit.app/ (из README). HEAD e143e2a3 (2026-01-02). Звёзд: 0.
- **Лицензия:** файла LICENSE нет, API `null`.
- **Версия.** В коде заявлено «v3.0», `_stats.systemVersion: "4.0.0"` (стр. 116). В боковой панели: Foundry v11–13, dnd5e 4.0+.
- **Как устроено** [код, `lss_to_foundry_app.py`, 691 строка]. Один файл на Streamlit. Класс `LSSToFoundryConverterV3`:
  - `parse_lss_json` — разворачивает строку `data`;
  - `create_foundry_actor` — собирает dict актёра: `name`, `type: 'character'`, `system` (`abilities`, `attributes`, `details`, `traits`, `currency`, `skills`), `items: []` (стр. 110), `prototypeToken`;
  - портрет и токен кладутся в JSON как base64;
  - есть ручная настройка «видения» по расе.
- **Что НЕ делает:** предметы, заклинания, классы, особенности, компендиумы не использует. Спасброски не импортирует: `_extract_abilities` пишет `"proficient": 0` (стр. 240), поле `saves` не читается.
- **Ошибки по коду (не повторять):**
  1. Навыки: `SKILLS_MAP` (стр. 47–53) использует ключи `'animalHandling'` и `'sleightOfHand'`. LSS хранит `'animal handling'` и `'sleight of hand'` (схема, `properties.skills.description`). Владение этими двумя навыками теряется.
  2. КД: `_parse_number` (стр. 335) оставляет только цифры и знак «-». Строка `"10+[DEX]"` превращается в 10 (стр. 250). Формулы КД, скорости и щита не вычисляются.
  3. Спасброски не читаются (см. выше).
- **Что берём:** почти ничего. Полезен как список того, что нужно проверить тестами: навыки с пробелами, формулы КД, спасброски.

### 2.3. MrPrimate/ddb-importer — D&D Beyond → Foundry dnd5e (образец архитектуры)

- Ссылки: https://github.com/MrPrimate/ddb-importer , HEAD 44bb451 (2026-10-19). Звёзд: 252, форков: 95.
- **Лицензия:** MIT (`LICENSE.md`, API `spdx_id: MIT`).
- **Версии.** По коду — современная ветка: `AdvancementBuilder.ts` использует классы advancement dnd5e, поле `system.source.rules` (2014/2024). Точная таблица совместимости не сверялась.
- **Важно.** Источник данных — API D&D Beyond (внешний сервис с авторизацией). Берём только приёмы сопоставления и обновления, API не нужен.

Приёмы (пути от корня репозитория, строки на HEAD 44bb451):

**a) Сопоставление с компендиумом по имени и редакции**
- `src/lib/DDBItemImporter.ts:772–802`, `getCompendiumItems`: индекс берёт поля `name`, `flags.ddbimporter.dndbeyond.alternativeNames`, `system.source.rules`; `matchFields: ["system.source.rules"]` (стр. 788). Совпадение редакции 2014/2024 обязательно.
- `:655–675`, `#indexEntryMatchesOriginal`: точное совпадение имени или `alternativeNames`; опции `looseMatch` (`NameMatcher.getLooseNames`) и `monsterMatch`.
- `:699–718`, `loadPassedItemsFromCompendium`: два прохода. Строгий, затем `rulesFallback`, который ослабляет фильтр редакции и применяется только к тем, кого не нашли. Сделано, чтобы не плодить дубли.
- `src/lib/CompendiumHelper.ts:392–470`, `queryCompendiumEntries`: имя нормализуется (`utils.normalizeString`, стр. 427). Текст в скобках («Заклинание (ограничение)») отделяется regex-ом (стр. 419) и возвращается как суффикс.
- Сверка по собственному id DDB (`flags.ddbimporter.id`), а не по имени: `keepNonDDBItems` (`src/muncher/DDBCharacterImporter.ts:490–505`), `overrideId` (`DDBItemImporter.ts:326–345`).

**b) Что делать, если не нашли**
- `DDBCharacterImporter.ts:730–736`: непарные предметы создаёт сам импортёр из данных DDB («Adding DDB generated items»).
- `DDBCharacterImporter.ts:935`: `useExistingCompendiumItems: false`. Поиск по компендиуму для персонажа выключен по умолчанию (соответствующая настройка закомментирована).
- Override-компендиум («custom», пользовательские предметы): `DDBCharacterImporter.ts:697–700` и `:510–540`, `getIndividualOverrideItems`. Подмена по `flags.ddbimporter.overrideId` (`DDBItemImporter.ts:326–345`).

**c) Дубли между персонажами**
- Общего предмета нет: каждый актёр получает свою embedded-копию (`DDBCharacterImporter.ts:730–736`).
- Единственный механизм «один предмет на многих персонажей» — override-компендиум со стабильным id (пункт b).

**d) Повторный импорт**
- Сохранение полей, которые меняет игрок: `DDBItemImporter.ts:282–306`, `updateCharacterItemFlags` (quantity, attuned, equipped, attunement, prepared, proficient, uses, ability, `system.sourceItem`).
- Retain-флаги использования: `DDBCharacterImporter.ts:548–610`, `restoreDDBMatchedFlags` (`retainResourceConsumption`, `retainUseSpent`, `retainActivityUseSpent`). Решение принимается по флагам на предмете, а не сравнением полей.
- Ручные предметы: `keepNonDDBItems` (`:490–505`) при `ignoreNonDDBItems` не трогает предметы без своего `importId`; сверка по name, type и `flags.ddbimporter.id`.
- Политики обновления полей актёра: `DDBCharacterImporter.ts:1197–1212` (имя, HP, XP, hit die). Если политика выключена, поле берётся из `actorOriginal`. HP: `resetHitPoints` (`:945–963`), `totalHP - removedHitPoints`.

**e) Классы и уровни**
- `DDBCharacterImporter.ts:454–473`: класс и подкласс создаются первыми, затем остальные items.
- `src/parser/advancements/AdvancementBuilder.ts`: advancement строится через класс dnd5e (`game.dnd5e.documents.advancement.ScaleValueAdvancement`), функции `buildNumberScale` и `buildDiceScale`. JSON вручную не пишется.

**f) Что берём:** сопоставление по имени с фильтром редакции (для нас по `identifier` и `system.source.rules`, а не по имени: имена LSS русские); двухпроходный поиск; override-компендиум как «свой предмет один раз»; сохранение пользовательских полей при повторном импорте; флаг `importId`.
**Что не берём:** код целиком (около 4300 файлов), API DDB.

### 2.4. MrPrimate/pathmuncher — Pathbuilder 2e → Foundry PF2e (образец сценария)

- Ссылки: https://github.com/MrPrimate/pathmuncher , HEAD 16554638 (v2.0.1, 2026-10-15). Звёзд: 36.
- **Лицензия:** MIT (`LICENSE.md`).
- **Сценарий** очень похож на наш: внешний JSON («Export JSON» из Pathbuilder) → актёр PF2e, компендиумы, отчёт о непопавших. Тот же автор, что и DDB Importer. Совместимость не сверялась (системы: PF2e, Starfinder 2e).

**a) Сопоставление по slug, а не по имени** [код, `src/app/CompendiumMatcher.js`]
- `entrySlug` (`system.slug` или slug имени), `findBySlugs` (стр. 65–78), `findCandidates` (стр. 98–107). Пакеты перебираются в порядке конфигурации. Для каждого пакета кандидаты проверяются по очереди: сначала имя Foundry, потом имя Pathbuilder. `getNameMatch` (стр. 80) — запасной путь по имени.
- Фильтры `checkForFilters`, например `system.ritual` для ритуалов (`src/app/SpellBuilder.js:362`).
- Список пакетов по типам: `src/constants.js:54`, `CORE_COMPENDIUM_MAPPINGS`. Переопределяется настройкой `CUSTOM_COMPENDIUM_MAPPINGS` (`constants.js:11–12`, `:211`). Для нас это хороший приём: список пакетов как настройка.
- Переименования заклинаний: `spellRename` (`src/data/spells.js`, вызов в `SpellBuilder.js:186–189`).

**b) Что делать, если не нашли**
- Заклинание НЕ создаётся автоматически. `src/app/SpellBuilder.js:223–231`: запись `this.bad.push({ pbName, type: "spell", details })` и `logger.error`. Итог попадает в отчёт импорта.
- Для «обязательных» core-предметов (класс, предок, происхождение, предыстория), которых нет ни в одном пакете, есть диалог `resolveMissingCore`: пользователь выбирает замену (`src/app/Pathmuncher.js:335–360`, `:2195–2200`; `src/app/PathmuncherImporter.js:364`).
- Для «своих» заклинаний LSS это важно: вместо тихого создания — отчёт и явный шаг пользователя.

**c) Дубли**
- Копия на персонажа: `doc.toObject()` и новый `_id` (`SpellBuilder.js:233–238`). Общего предмета нет.

**d) Повторный импорт** [код, `src/app/ActorWriter.js`]
- Свои предметы помечаются `flags.pathmuncher.imported = true` (стр. 216).
- Удаляются только свои (`#removeDocumentsToBeUpdated`, стр. 200–207). Ручные добавления сохраняются: `findHandAddedItems` (стр. 137–160) защищает и предметы, выданные ручными (через `grantedBy`). Импорты без флага (legacy) обрабатываются отдельно (стр. 138–143).
- Отметки, которые нельзя вычислить из экспорта (сигнатурные заклинания), сохраняются до удаления и переносятся на новые копии по slug и rank (`#signatureSpells`, `#keepSignatureSpells`, стр. 180–200).
- Ответы пользователя («выборы», замены) хранятся во флагах актёра: `src/app/ImportMemory.js` (`flags.pathmuncher.lastImport`, стр. 1–30; сброс — стр. 151) и переиспользуются при следующем импорте.
- README: при сбое импорта сохраняется копия персонажа.

**e) Что берём:** slug-сопоставление с конфигом пакетов; отчёт о непопавших вместо тихого пропуска; флаг `imported` и удаление только своих предметов; `ImportMemory` в флагах актёра; диалог замены для обязательных предметов.
**Что не берём:** код целиком (`Pathmuncher.js` около 100 КБ); PF2e-механику `rules` / `ChoiceSet` (для dnd5e не нужна).

### 2.5. Evolebil/obr-character-hud — LSS JSON → Owlbear Rodeo (разбор формата)

- Ссылки: https://github.com/Evolebil/obr-character-hud , HEAD 72d6ff5f (2026-10-22). Версия по README — 0.8.1.
- **Лицензия:** нет (`/repos/.../license` → 404). Только идеи; код не копировать без разрешения автора.
- Foundry не касается. Но это самый полный открытый код, который читает экспорт LSS (по README — тесты на 18 реальных экспортах автора).

Что полезно [код, `src/lss/parse.js`, `src/lss/expr.js`, `src/lss/rules.js`]:
- `parse.js:18` `readExport` — разворачивает строку `data`, проверяет `jsonType`.
- `parse.js:33` `parseLss`:
  - бонусы: `bonuses.filter(b => !b.disabled)` (стр. 36); `expr` приоритетнее `value` (стр. 61–66); режимы `set` и `add` (стр. 68–88); `upgrade` — ступень владения;
  - характеристики: база `stats[x].score` плюс бонусы `stat.X.score` (стр. 44–60);
  - спасброски: владение из `saves[x].isProf` или бонуса `prof.save.X` (стр. 90–99);
  - навыки: `skills[k].isProf` (1 — владение, 2 — экспертиза) плюс `prof.skill.X` (стр. 101–120);
  - КД: формула из `vitality.ac.value` своим парсером (стр. 122–131), бонусы `ac`;
  - HP: `hp-max` плюс бонусы `hp.max` (стр. 140–149);
  - оружие: `weaponsList` и `weapon.<id>.attack` (стр. 158–185);
  - ресурсы: `resources` с `maxExpr` (стр. 186–212), отдых из `isShortRest` / `isLongRest`;
  - ячейки: `spells.slots-N` плюс бонусы `spellSlot.N` (стр. 213–220);
  - заклинания-тексты: блоки `text['spells-level-N']` (стр. 237–);
  - особенности: узлы `spoiler` в `traits`, `features`, `feats` (стр. 254–), группировка по `attrs.source` (`trait:class`, `trait:subclass`, `trait:race`, `trait:subrace`, `trait:background`).
- `expr.js` — парсер формул без `eval`: `tokenize` (стр. 18), `parseFormula` (стр. 129), `evalNumber` (стр. 188). Переменные `[STR]`…`[CHA]`, `[PROF]`, `[LVL]`; функции `min`, `max`, `floor`, `ceil`, `round`, `abs`; кубики `NdM`, `(expr)dM`, `1к6`.
- `rules.js:6–30` — `SKILL_NAMES` с ключами `'sleight of hand'` (стр. 15) и `'animal handling'` (стр. 24).

**Расхождения с официальной схемой [схема]:**
- Щит: `if (val(data.vitality?.shield) === true) acValue += 2` (стр. 132–135) — жёстко +2. Схема задаёт `vitality.shield.mod` как формулу (в примере `"2"`). Брать нужно `mod`.
- Владение: `num(data.proficiencyCustom, null) ?? …` (стр. 38) принимает 0 как переопределение. Схема: `proficiencyCustom || proficiency`, то есть 0 означает «не задано».
- Сам автор отмечает в README, что сверка с листом LSS не сделана («❓ сверить с листом LSS»). Это не эталон.

**Что берём (идеи):** разбивку итогового значения на `parts` (объяснимость результата); парсер формул без `eval`; модель бонусов `target / mode / value / expr / source` как прообраз эффектов dnd5e; особенности из спойлер-блоков с атрибутом `source`.

### 2.6. Русский перевод dnd5e: Babele, модуль ru-ru (уже установлен у пользователя)

- Upstream: https://github.com/phenomen/foundry-vtt-ru (звёзд 47, HEAD d0a33fcc, push 2026-10-19). Копия-форк: https://github.com/Elfrey/foundry-vtt-ru (`fork: true`, push 2026-10-18). Лицензия не указана (`license: null`, файла LICENSE нет).
- **Локально:** `F:\Files\Foundry VTT\UserDate\Data\modules\ru-ru`, версия 13.348.1, compatibility 13. Папки `compendium/dnd5e/{ag, ds, chris, gambit}` есть (проверено наличие папок). Содержимое сверено с upstream, а не с локальной копией.
- **Выбор набора** [код, upstream `src/systems/dnd5e.js`, `src/systems/dnd5e/alt.js`]: по умолчанию `dnd5e/ag` — официальный перевод Hobby World и Adventure Guys (так написано в тексте настройки). При включении `altTranslation` — `dnd5e/ds`, альтернативный перевод Dungeons.ru. Подключается через Babele.
- **Состав** [проверено скриптом по upstream, тексты не переносились]:
  - `ag/dnd5e.spells.json`: label «Заклинания (Legacy)», 319 записей; ключи — английские имена (например, `Polymorph`, `Hunter's Mark`).
  - `ag/dnd5e.spells24.json`: label «Заклинания (Modern)», 341 запись; ключи — английские имена.
  - `ds/dnd5e.spells.json`: label «Заклинания (SRD)», 319 записей; ключи те же, что у `ag` для 2014.
  - `ds/dnd5e.spells24.json`: 340 записей; ключи — русские названия, не английские. Механизм сопоставления не проверен.
- **Покрытие LSS-списков** (публичные датасеты LSS; у каждого заклинания английское название в скобках, например «Кислотная стрела [Acid Arrow]»):
  - 2014, 318 записей: 318 из 318 с учётом трёх имён вида «X or Y» (в `ag` и `ds` они записаны «X/Y»: `Antipathy/Sympathy`, `Blindness/Deafness`, `Enlarge/Reduce`) и `Meld Into Stone` ↔ `Meld into Stone` (регистр).
  - 2024, 339 записей: 339 из 339 при сравнении без учёта регистра. Ключ `Ice Knife` присутствует (см. раздел 5).
- **Вывод:** для модуля перевод SRD-заклинаний не нужен. Достаточно сопоставлять по `identifier` (слаг), а перевод отдаст Babele у пользователя. Тексты переводов в модуль не копировать.
- **Прочие переводы в установке** (не для нашей версии): `laaru-dnd5-hw` 3.63.0 (dnd5e 3.1.0–3.3.999, verified 3.3.1); `kikimor-dnd5e-hmb` 1.1.4 (Foundry 11–12, dnd5e 3.2+). Для dnd5e 5.1.8 не подходят.
- **Не проверено:** German «Ninjo» dnd5e 5.x (Babele 2.7.5+, SRD и заклинания, неполный) — упомянут в поиске, репозиторий не открывался.

### 2.7. Dimension Door — расширение для LSS (pumpkin.quest/lss/dimension-door/)

- **Что делает** [док, страница через WebFetch]: браузерное расширение для Chrome и Firefox. На странице заклинания dnd.su (или dndvault.ru) нажимаем иконку, затем «Импортировать». Карточка уходит в библиотеку LSS; при первом запуске нужен вход в LSS. Если заклинание уже в Гримуаре, оно помечается.
- Установка: Chrome Web Store (`akabajjhfjmooihjpppjgialacocghkp`), Firefox AMO (`dimension-door`). Ссылок на репозиторий и лицензии нет, версия не указана. **Открытый код не найден**, файлы не открывались.
- Foundry и dnd5e на странице не упоминаются.
- **Значение для нас:** подтверждает, что Гримуар LSS наполняется сторонними инструментами. Формат записи Гримуара — отдельный вопрос (см. `lss-character-format.md`, раздел 4.4). Та же страница перечисляет «Заклинания JSON» и «Датасеты JSON» для LSS. Возможно, там формат заклинаний. **Не проверено**: ссылок на файлы WebFetch не вернул.

### 2.8. Пользовательские расширения LSS (userscripts): Lizardeon, fybits

- **Lizardeon/LongStoryShort_extensions** — https://github.com/Lizardeon/LongStoryShort_extensions. Лицензия MIT (файл LICENSE). Два userscript: Weight Tracker (вкладка «Снаряжение») и Concentration Tracker. Звёзд: 0; последний коммит 2026-08-09. [док, README; код не читался построчно]
- **fybits/longstoryshortenhancer** — https://github.com/fybits/longstoryshortenhancer. Лицензии нет. Userscript v0.3.0: `@match` на `longstoryshort.app/characters/digital/*` и `aternia.games`. Подгружает `spells.js` (около 1.8 МБ HTML-карточек заклинаний). Содержит тексты заклинаний, в проект не брать. [код, `longstoryshort.user.js`, заголовок и структура]
- **Значение для второго шага:** это работа внутри страницы персонажа в сессии самого пользователя. Это не обращение к непубличным API. Но в CONTEXT записано «не логиниться / не обращаться к непубличным эндпоинтам», а расширение должно показывать список персонажей из аккаунта. Решение за владельцем проекта (раздел 5).

### 2.9. Не проверено по коду (только поиск и описания)

- `Doctor-Unspeakable/foundry-pathbuilder2e-import` — Pathbuilder 2e для Foundry, звёзд 15, последний push 2021-07-01, лицензии нет. Предшественник Pathmuncher. Не проверено.
- `denDAY04/foundryvtt-pathbuilder2e-importer` — TypeScript, GPL-3.0, push 2022-06-05. Не проверено. Копирование кода накладывает обязательства GPL.
- `kobseryqum/foundry-pathbuilder2e-import-10-compat` — MIT, форк под Foundry v10 (2022). Не проверено.
- `ooshhub/r20Importer` — Roll20 → Foundry, JavaScript, лицензии нет (2021). Не проверено.
- `neepster/dnd5echar_fndyVTT` — Python, генератор персонажей с экспортом файлов для Foundry v13, лицензии нет. Может показать форму актёра dnd5e v13. Не проверено.
- Plutonium (в установке пользователя `plutonium` 1.84.1) — код закрыт, документация через поиск не найдена. Не проверено.
- Hero Lab → Foundry — ничего не найдено.

### 2.10. Публичная схема LSS

- Схема и пример разобраны в `lss-character-format.md` (этот же каталог), разделы 2–3. Здесь важны два факта для сравнения проектов:
  - формулы `vitality.ac.value`, `vitality.speed.value`, `vitality.shield.mod`, `vitality.initiative.value` и `resources.*.maxExpr` вычисляются в числовом контексте, переменные — только в верхнем регистре [схема];
  - `bonuses[]` — единственный канал числовых бонусов. У него закрытый enum `target` (плюс семейство `weapon.<id>.attack`) и `source.kind`. Это естественная модель для Active Effects dnd5e [схема, `properties.bonuses`].

---

## 3. Таблица «приём → где подсмотрели → файл»

Пути для DDB и Pathmuncher — от корня репозитория. Номера строк — по HEAD, указанным в разделах 2.3–2.5.

| Приём | Где подсмотрели | Файл и строки |
|---|---|---|
| Сопоставление по имени с фильтром редакции `system.source.rules` | DDB Importer | `src/lib/DDBItemImporter.ts:772–802` (44bb451) |
| Два прохода поиска: строгий, затем ослабленный только для не найденных | DDB Importer | `src/lib/DDBItemImporter.ts:699–718` |
| Текст в скобках отделяется от имени | DDB Importer | `src/lib/CompendiumHelper.ts:419–427` |
| Сопоставление по slug, список пакетов по типу, фильтры | Pathmuncher | `src/app/CompendiumMatcher.js:65–107`; `src/constants.js:54` (16554638) |
| Список пакетов задаётся настройкой | Pathmuncher | `src/constants.js:11–12`, `:211` |
| Непопавшее заклинание → отчёт `bad`, без авто-создания | Pathmuncher | `src/app/SpellBuilder.js:223–231` |
| Диалог замены для обязательных предметов | Pathmuncher | `src/app/Pathmuncher.js:335–360`, `:2195–2200`; `src/app/PathmuncherImporter.js:364` |
| Override-компендиум: свой предмет по стабильному id | DDB Importer | `src/muncher/DDBCharacterImporter.ts:697–700`, `:510–540`; `src/lib/DDBItemImporter.ts:326–345` |
| Предметы персонажа — копии, общего предмета нет | DDB и Pathmuncher | `DDBCharacterImporter.ts:730–736`; `SpellBuilder.js:233–238` |
| Поиск по компендиуму персонажа выключен по умолчанию | DDB Importer | `src/muncher/DDBCharacterImporter.ts:935` |
| Сохранение полей, которые меняет игрок (quantity, equipped, prepared, uses) | DDB Importer | `src/lib/DDBItemImporter.ts:282–306` |
| Retain-флаги использования ресурсов | DDB Importer | `src/muncher/DDBCharacterImporter.ts:548–610` |
| Ручные предметы не трогаются при повторном импорте | DDB и Pathmuncher | `DDBCharacterImporter.ts:490–505`; `src/app/ActorWriter.js:137–160` |
| Свои предметы помечаются флагом, удаляются только они | Pathmuncher | `src/app/ActorWriter.js:200–216` |
| Отметки, которых нет в экспорте, переносятся на новые копии | Pathmuncher | `src/app/ActorWriter.js:180–200` |
| Ответы пользователя хранятся во флагах актёра | Pathmuncher | `src/app/ImportMemory.js:1–30`, `:151` |
| Политики обновления полей актёра (имя, HP, XP) | DDB Importer | `DDBCharacterImporter.ts:1197–1212`; `resetHitPoints` `:945–963` |
| Класс и подкласс создаются первыми; advancement через классы dnd5e | DDB Importer | `DDBCharacterImporter.ts:454–473`; `src/parser/advancements/AdvancementBuilder.ts` |
| Формулы без `eval`, переменные `[STR]` и т.д. | Evolebil | `src/lss/expr.js:18`, `:129`, `:188` (72d6ff5f) |
| Разбивка итогового значения на `parts` | Evolebil | `src/lss/parse.js:44–60`, `:68–88` |
| Бонусы LSS: `expr` приоритетнее `value`, `disabled` не учитывается | Evolebil | `src/lss/parse.js:36`, `:61–66` |
| Особенности из спойлер-блоков с атрибутом `source` | Evolebil | `src/lss/parse.js:254–260` |
| Ресурсы с `maxExpr` и отдыхами | Evolebil | `src/lss/parse.js:186–212` |
| Ключи навыков с пробелами | Схема LSS; Elfrey; Evolebil | схема `properties.skills.description`; `src/convert.js:41`, `:125` (2b118c01); `src/lss/rules.js:15`, `:24` |
| Выход Foundry → LSS: строка `data`, `spells.mode: 'text'`, `jsonType` / `version` | Elfrey | `src/convert.js:505`, `:625–627` (2b118c01) |
| Заклинания текстом в блоках `spells-level-N` | Elfrey; Evolebil | `src/convert.js:421`; `src/lss/parse.js:237` |
| Babele: ключи — английские имена; наборы `ag` / `ds` | ru-ru (phenomen) | `compendium/dnd5e/ag/dnd5e.spells.json` (upstream d0a33fcc); `src/systems/dnd5e.js` |
| Анти-пример: +2 за щит вместо `shield.mod` | Evolebil | `src/lss/parse.js:132–135` (расходится со схемой) |
| Анти-пример: 0 как переопределение `proficiencyCustom` | Evolebil | `src/lss/parse.js:38` (расходится со схемой) |
| Анти-пример: ключи навыков в camelCase | DariaMishu | `lss_to_foundry_app.py:47–53` |
| Анти-пример: формула КД очищается до цифр | DariaMishu | `lss_to_foundry_app.py:250`, `:335` |

---

## 4. Что искал и не нашёл

- **Прямой LSS → Foundry dnd5e** (модуль или импортёр): не найден. Запросы на русском и английском: LSS, Long Story Short, longstoryshort, «лонг стори шорт» вместе с Foundry / фаундри, импорт / экспорт, конвертер, dnd5e, VTT. В выдаче — Elfrey (обратный) и DariaMishu (веб-приложение).
- **GitHub, поиск по репозиториям:** `q=longstoryshort` — 24 результата, релевантные: DariaMishu, Evolebil, Lizardeon, fybits. `q=lss foundry dnd5e` и `q=foundry vtt importer dnd5e character` — ничего относящегося. Поиск по коду GitHub без авторизации недоступен, не использовался.
- **Каталог пакетов foundryvtt.com:** через поисковик нашёлся только `elfrey-lss-converter`. Сам каталог напрямую не перебирался.
- **Русскоязычные площадки** (VK, Pikabu, DTF, Habr, Boosty, Telegram): поиск через поисковик не дал публикаций об импорте LSS в Foundry. Сами площадки не открывались. Найденные DTF-материалы про Foundry и «Российскую чуму VTT» к LSS не относятся.
- **Pathbuilder:** найдено несколько импортёров (раздел 2.9), по коду проверен только Pathmuncher.
- **Hero Lab:** ничего. **Roll20 → dnd5e:** целенаправленно не искал, только r20Importer по запросу.
- **Plutonium:** код закрыт, документация не найдена.
- **DDB Importer:** не проверял таблицу совместимости, разбор HP (`DDBCharacter.ts`) и мультикласс подробно.
- **Pathmuncher:** PF2e-правила (`ChoiceSet`, `GrantItem`) не разбирал, для dnd5e неактуально.
- **Babele:** исходники babele 2.7.5 не читал. Порядок ключей и механизм сопоставления выведены из данных переводов, не из кода Babele.
- **Лицензии:** у большинства проектов лицензии нет (Elfrey, DariaMishu, Evolebil, fybits, phenomen/foundry-vtt-ru, Doctor-Unspeakable, r20Importer, neepster). Dimension Door — закрытое расширение. MIT: DDB Importer, Pathmuncher, Lizardeon. GPL-3.0: denDAY04.

---

## 5. Открытые вопросы и расхождения

1. **Ice Knife.** CONTEXT утверждает, что `ice-knife` отсутствует в `dnd5e.spells24` версии 5.1.8. Ключ «Ice Knife» есть в `ag/dnd5e.spells24.json` (341 запись, в CONTEXT — 340). Либо перевод шире компендиума, либо CONTEXT устарел. Проверить по пакам 5.1.8.
2. **Граница «не логиниться / не непубличные эндпоинты».** CONTEXT требует для расширения список персонажей из аккаунта LSS. Userscript-подход (раздел 2.8) работает внутри страницы, которую пользователь открыл сам. Нужно решение владельца проекта: допустимо ли это и где проходит граница.
3. **Версия Elfrey.** У пользователя 1.7 (Foundry 12, dnd5e 4.x). Актуальный релиз 1.8.4 — Foundry 13, dnd5e 5.0–5.9 (verified 5.1.2). Если нужно сравнивать форматы, сравнивать с 1.8.4, а не с 1.7.
4. **Режим `text` для заклинаний.** Подтверждён кодом Elfrey (`spells.mode: 'text'`) и чтением Evolebil (`outer.spells.mode`). Описания envelope `spells` в публичной схеме нет (`lss-character-format.md`, раздел 4.1, отмечено как неизвестное). Модуль должен либо поддерживать оба режима, либо явно отказаться от `text`.
5. **Лицензии при переиспользовании.** Для кода MIT (DDB Importer, Pathmuncher, Lizardeon) достаточно сохранить уведомление об авторстве. GPL-3.0 (denDAY04) с MIT-кодом не смешивать. Без лицензии — только идеи, без копирования выражения. Лицензия самого модуля в CONTEXT не указана.
6. **Тексты переводов.** Тексты `ag` и `ds` принадлежат другим авторам и издательствам. В модуль их не включать. Сопоставление по `identifier` не требует текстов.

---

## Файлы, сохранённые при исследовании

Сырые ответы GitHub API, исходники разобранных проектов, публичная схема LSS и upstream-переводы лежат во временной папке сессии:
`C:\Users\gladk\AppData\Local\Temp\claude\F--\95661564-12af-4309-96e1-17d00d964db2\scratchpad\prior-art\`
(подпапки `ddb`, `pb\pm`, `dariamishu`, `evolebil`, `lizard`, `fybits`, `lssschema`, `ruloc`). В проект не копировались.
