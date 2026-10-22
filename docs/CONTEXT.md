# Контекст проекта LSS to Foundry

Общий бриф для всех, кто работает над модулем и расширением. Состояние на 22.10.2026.

## Цель

1. **Модуль Foundry «LSS to Foundry»** (`id: lss-to-foundry`, репозиторий `F:\LongStoryShort\lss-to-foundry`).
   Принимает файл (или несколько) с персонажами в формате Long Story Short (LSS) и создаёт
   в Foundry **полного** персонажа системы dnd5e. Заклинания SRD не создаются заново, а
   берутся из компендиумов системы dnd5e. Если подключён модуль-перевод компендиумов
   (Babele), заклинания придут уже переведёнными.
2. **Браузерное расширение** (репозиторий `F:\LongStoryShort\lss-to-foundry-extension`), второй шаг.
   В Foundry нажимаешь «Импорт из LSS», расширение показывает список персонажей из аккаунта
   LSS с чекбоксами, выбранные персонажи уходят прямо в модуль. LSS при этом в Foundry не
   встраивается.
3. **Свои заклинания** (не SRD, из Гримуара игрока) создаются при импорте как кастомные
   и **без дублей**: если одно и то же заклинание из Гримуара есть у двух персонажей, в
   мире Foundry оно появляется один раз, а у каждого персонажа лежит его копия.

## Окружение пользователя (только чтение!)

- Foundry VTT **13.348**: приложение в `F:\Files\Foundry VTT\Foundry Virtual Tabletop`,
  данные в `F:\Files\Foundry VTT\UserDate\Data`.
- Система **dnd5e 5.1.8** (миры на 5.1.8; несколько старых миров на Foundry 12 / dnd5e 3.3.1).
  Исходники этой версии на GitHub: тег `release-5.1.8` в `foundryvtt/dnd5e`.
- Модули, которые важны для проекта:
  - `babele` 2.7.5 и `ru-ru` 13.348.1 (русский интерфейс Foundry);
  - `elfrey-lss-converter` 1.7 — **обратный** конвертер Foundry → LSS (Foundry 12,
    dnd5e 4.x), исходник `F:\Files\Foundry VTT\UserDate\Data\modules\elfrey-lss-converter\module.js`,
    репозиторий https://github.com/Elfrey/elfrey-lss-converter. По нему видны имена полей LSS;
  - `laaru-dnd5-hw` 3.63.0 — заклинания, классы и монстры в переводе Hobby World для
    dnd5e 3.x (с 5.1.8 не совместим, и это не SRD);
  - `plutonium` 1.84.1, `dae`, `lib-wrapper`, `socketlib`, `item-piles` и др.
- **Foundry не запускать.** В каталог данных Foundry ничего не писать.

## Long Story Short: что известно

- Документация: https://longstoryshort.app/doc/ , исходники доки: `F:\LongStoryShort\Guildhall\docs\`
  (особенно `developers/characters.mdx`, `developers/datasets.mdx`, `character-sheet/*`,
  `text-editor/*`, `spells/*`). Обзор репозитория доки: `F:\LongStoryShort\Guildhall\AGENTS.md`.
- Публичные артефакты (без ключей и авторизации):
  - схема персонажа: https://longstoryshort.app/schema/v1/character.json ;
  - пример персонажа: https://longstoryshort.app/schema/v1/character-example.json ;
  - датасеты SRD: https://longstoryshort.app/datasets/srd-2014.json , `srd-2024.json` ;
  - заклинания SRD: https://longstoryshort.app/datasets/srd-spell-slugs-2014.json (318),
    `srd-spell-slugs-2024.json` (339). Запись: `{ slug, id, name: "Кислотная стрела [Acid Arrow]", level, classes }`.
- Файл персонажа: `{ jsonType: "character", version: "2", edition, sheetEdition, spells: {...}, disabledBlocks, data: "<JSON-строка>" }`.
  Поле `data` — JSON, закодированный строкой.
- **Заклинания в персонаже — это ссылки, а не тексты**: `spells.prepared` и `spells.book` содержат
  id заклинания из базы LSS (или слаг / английское имя). Тексты своих заклинаний в файле
  персонажа отсутствуют. Свои заклинания живут в Гримуаре игрока, у которого есть экспорт
  «Скачать .json»; формат заклинаний LSS «основан на формате Foundry».
- Нельзя: логиниться в LSS, обращаться к непубличным эндпоинтам LSS, публиковать тексты
  переводов LSS (они защищены авторским правом LSS).

## Сопоставление заклинаний LSS ↔ dnd5e (проверено)

У каждого заклинания в компендиумах dnd5e есть `system.identifier` — слаг английского
имени (`cure-wounds`). Он совпадает со слагом LSS. Компендиумы: `dnd5e.spells` (SRD 5.1,
правила 2014) и `dnd5e.spells24` (SRD 5.2, правила 2024).

| Набор LSS | Компендиум dnd5e 5.1.8 | Совпало |
|---|---|---|
| 2014 (318) | `spells` (319) | 315 напрямую + 3 через псевдонимы: `antipathy-or-sympathy`→`antipathy-sympathy`, `blindness-or-deafness`→`blindness-deafness`, `enlarge-or-reduce`→`enlarge-reduce` |
| 2024 (339) | `spells24` (340) | 338; `ice-knife` в 5.1.8 отсутствует (появился в 6.x) — нужен запасной путь |

Цепочка: id из персонажа → (таблица id→слаг из `srd-spell-slugs-*.json`) → слаг →
`system.identifier` в компендиуме нужной редакции.

Компендиумы dnd5e 5.1.8: `actors24 backgrounds classes classes24 classfeatures content24
equipment24 feats24 heroes items monsterfeatures monsterfeatures24 monsters origins24
races rules spells spells24 subclasses tables tables24 tradegoods`.

## Правила работы

- Документы пишем по-русски, код, идентификаторы и комментарии в коде — по-английски.
- Ничего не коммитить. Не трогать файлы вне своей зоны.
- Каждое утверждение о чужом API подтверждать источником (ссылка на файл/строку в исходниках
  нужной версии или на документацию). Если не удалось проверить — так и писать.
