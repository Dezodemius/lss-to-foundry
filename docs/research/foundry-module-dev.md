# Разработка модуля для Foundry VTT v13 (13.348): руководство для LSS to Foundry

Состояние на 22.10.2026. Собрано чтением локальных исходников ядра 13.348, Babele 2.7.5 и ru-ru 13.348.1 и веб-документации. Foundry не запускалась, в каталог данных ничего не записывалось, ничего не коммитилось.

## 0. Обозначения источников

- `CORE` = `F:\Files\Foundry VTT\Foundry Virtual Tabletop\resources\app` (исходники ядра: `client/`, `common/`; сервер лежит в `dist/` и минифицирован, поэтому там ссылка только на метод, без номера строки).
- `BAB` = `F:\Files\Foundry VTT\UserDate\Data\modules\babele` (Babele 2.7.5).
- `RU` = `F:\Files\Foundry VTT\UserDate\Data\modules\ru-ru` (ru-ru 13.348.1).
- `DATA` = `F:\Files\Foundry VTT\UserDate\Data`.
- `[OFF]` = официальная документация Foundry. `[WEB]` = результат веб-поиска или страница, которую не сверяли с исходником.
- «не проверено» = утверждение не подтверждено ни исходником, ни документацией.

Номера строк относятся к файлам на момент проверки.

## 1. Сводка

1. **Babele переводит документы, которые код читает через `pack.getDocument`, `pack.getDocuments`, `pack.getIndex` и `fromUuid`, а не только при перетаскивании.** Сопоставление идёт по английскому `name`, по `_id` и по id источника. Для заклинаний 2014 (`dnd5e.spells`) с ru-ru перевод работает. Для заклинаний 2024 (`dnd5e.spells24`) с ru-ru 13.348.1 перевода нет (раздел 7).
2. `Item.implementation.fromCompendium` **не существует**. Метод `fromCompendium` есть только у коллекции мира: `game.collections.get("Item").fromCompendium(doc, opts)`.
3. Кнопку в сайдбаре «Актёры» вставлять через хук `renderActorDirectory`. Он получает HTMLElement. Хуки `getHeaderControls*` для сайдбара не работают, потому что у сайдбар-вкладок нет рамки окна.
4. Искать заклинания по `system.identifier`, а не по `name`: Babele переписывает `name` в индексе на русский.
5. `Actor.create({..., items: [...]})` создаёт персонажа и предметы одним запросом. Хуки `preCreateItem`/`createItem` для вложенных предметов, по коду, не срабатывают (не проверено практикой).
6. По умолчанию обычный игрок не может создавать акторов, предметов в мире и папок (роль ASSISTANT).
7. Для v14 есть только testing-сборка 14.357 (`[WEB]`). Система dnd5e 5.2.5 с ней несовместима. Поля `flags.core.sourceId` и глобальные алиасы `mergeObject` и др. помечены `until: 14`.

## 2. module.json для v13

### 2.1 Структура каталогов

```
Data/modules/lss-to-foundry/         # имя папки = id в манифесте [OFF]
  module.json                        # обязателен в корне
  scripts/main.mjs                   # esmodules (предпочтительный способ) [OFF]
  scripts/...                        # остальные ES-модули, импорт относительными путями
  styles/lss-to-foundry.css
  templates/import-dialog.hbs
  lang/en.json
  lang/ru.json
  LICENSE
```

Рекомендуемые подпапки `templates/`, `scripts/`, `styles/`, `packs/`, `lang/` приведены в `[OFF]` (статья module-development, раздел 2). Минимум: `module.json`.

### 2.2 Поля манифеста (схема v13)

Схема: `CORE/common/packages/base-package.mjs` (`defineSchema`, строки 328–400), `CORE/common/packages/base-module.mjs` (строки 17–22), `RelatedPackage` (строки 77–89), `PackageCompatibility` (строки 23–35), `PackageRelationships` (строки 42–56).

| Поле | Тип в v13 | Примечание |
|---|---|---|
| `id` | строка | `validateId`. Нижний регистр, дефисы. |
| `title`, `description` | строка, HTML | `description` поддерживает HTML. |
| `version` | строка | `validateVersion`. |
| `authors` | `[{name, email?, url?, discord?}]` | `name` обязателен. |
| `url`, `manifest`, `download` | строка | `manifest` должен быть стабильным URL на `module.json` последнего релиза, `download` — публичный zip (`[OFF]`). |
| `compatibility` | `{minimum, verified, maximum}` | Строки. Логика статуса: `CORE/common/packages/base-package.mjs`, `testAvailability`, строки 411–440. |
| `relationships` | `{systems, requires, recommends, conflicts}` | Элемент: `{id, type, manifest?, compatibility?, reason?}`. Для `systems` тип `system` (строка 79). |
| `esmodules` | `string[]` | Строки 357. |
| `scripts` | `string[]` | Устаревший способ, строка 356. |
| `styles` | `[{src, layer?}]` или `string[]` | Строка 358. Строковые элементы мигрируются в `{src}` (`_migrateStyles`, строки 618–628). |
| `languages` | `[{lang, name?, path, module?, system?}]` | Строки 362–371. `module`/`system` ограничивают язык конкретным пакетом. |
| `flags` | объект | Для hot reload: `flags.hotReload` (раздел 8). |
| `library`, `coreTranslation` | булевы | Только у модулей, `base-module.mjs` 20–21. |
| `socket` | булев | Строка 387. |

Верхнеуровневое поле `system` из статьи `[OFF]` в схеме v13 не найдено. В схеме есть `system` только внутри `packs[]` и `languages[]`. Для привязки к системе используем `relationships.systems`.

### 2.3 Пример module.json

```json
{
  "id": "lss-to-foundry",
  "title": "LSS to Foundry",
  "description": "Импорт персонажей Long Story Short в систему dnd5e.",
  "version": "0.1.0",
  "authors": [{ "name": "<автор>" }],
  "compatibility": { "minimum": "13", "verified": "13.348" },
  "relationships": {
    "systems": [
      { "id": "dnd5e", "type": "system", "compatibility": { "minimum": "5.1.0", "verified": "5.1.8" } }
    ],
    "recommends": [
      { "id": "babele", "type": "module" }
    ]
  },
  "esmodules": ["scripts/main.mjs"],
  "styles": ["styles/lss-to-foundry.css"],
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" },
    { "lang": "ru", "name": "Русский", "path": "lang/ru.json" }
  ],
  "flags": {
    "hotReload": {
      "extensions": ["mjs", "css", "hbs", "json"],
      "paths": ["scripts", "styles", "templates", "lang"]
    }
  },
  "url": "https://github.com/<owner>/lss-to-foundry",
  "manifest": "https://github.com/<owner>/lss-to-foundry/releases/latest/download/module.json",
  "download": "https://github.com/<owner>/lss-to-foundry/releases/download/v0.1.0/module.zip"
}
```

Замечания:
- `compatibility.verified: "13.348"`: при установке 13.349 статус станет `UNVERIFIED_BUILD` (`base-package.mjs` 428–434). Это предупреждение, модуль при этом работает.
- Значения `5.1.0` в `relationships.systems` — предложение. Минимальную версию dnd5e, на которой код работает, не проверяли.
- `babele` в `recommends`, а не в `requires`: без Babele модуль работает, перевод заклинаний просто не появится.
- `manifest` на `releases/latest/download/module.json` — практика GitHub, не проверено по документации. Страница `[OFF]/article/manifest/` вернула 404.

## 3. Жизненный цикл, настройки, i18n

### 3.1 Порядок хуков

`init` → `i18nInit` → `setup` → `ready`:
- `init`: `CORE/client/game.mjs:661`. Здесь регистрируют настройки, `CONFIG`, листы (`CORE/client/hooks.mjs`, документация строки 95–103).
- `i18nInit`: `CORE/client/helpers/localization.mjs:80`, строки 107–113 документации.
- `setup`: `CORE/client/game.mjs:746`. Документация (`hooks.mjs` 117–125): «you cannot read settings prior to this hook». То есть настройки читают в `setup` или `ready`.
- `ready`: `CORE/client/game.mjs:787` (`hooks.mjs` 129–134).

Примеры:

```js
const MODULE_ID = "lss-to-foundry";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultFolder", {
    name: "LSS_TO_FOUNDRY.Settings.DefaultFolder.Name",
    hint: "LSS_TO_FOUNDRY.Settings.DefaultFolder.Hint",
    scope: "world",          // "world" | "client" | "user" (CONST.SETTING_SCOPES, CORE/common/constants.mjs:2124)
    config: true,
    type: String,
    default: "LSS"
  });

  game.settings.register(MODULE_ID, "ruleset", {
    name: "LSS_TO_FOUNDRY.Settings.Ruleset.Name",
    scope: "world",
    config: true,
    type: String,
    default: "2014",
    choices: { 2014: "2014", 2024: "2024" }   // choices — для строковых типов
  });
});

Hooks.once("ready", () => {
  const folderName = game.settings.get(MODULE_ID, "defaultFolder");
});
```

Допустимые типы `type` (`CORE/client/helpers/client-settings.mjs`, `register`, строки 125–150): конструктор поля, `DataModel` или вызываемая функция, в том числе `Boolean`, `String`, `Number`. `SettingConfig` (`CORE/client/_types.mjs:469–483`) описывает `choices` (строки) и `range` (числа).

### 3.2 i18n

- Файлы переводов указываются в `languages` манифеста. Путь относительно корня модуля.
- Загрузка переводов модуля: `CORE/client/helpers/localization.mjs`, блок «Module translations» (≈строки 262–268) и `#filterLanguagePaths` (строка 295). Загружаются только переводы активных модулей.
- Язык `en` подгружается как fallback (`localization.mjs:198–200`, поле `_fallback`).
- Методы: `game.i18n.localize(key)` (строка 383), `game.i18n.format(key, data)` (415), `game.i18n.has(key)` (354).

```json
// lang/en.json
{
  "LSS_TO_FOUNDRY": {
    "Import": {
      "Button": "Import from LSS",
      "Title": "Import from Long Story Short",
      "Done": "Imported: {ok}, errors: {failed}"
    },
    "Settings": {
      "DefaultFolder": { "Name": "Default folder", "Hint": "Folder for imported characters" }
    }
  }
}
```

```js
ui.notifications.info(game.i18n.format("LSS_TO_FOUNDRY.Import.Done", { ok: 3, failed: 0 }));
```

## 4. Кнопка «Импорт из LSS» в сайдбаре «Актёры»

### 4.1 Классы и рендер

- `ActorDirectory` → `DocumentDirectory` → `AbstractSidebarTab` → `ApplicationV2`:
  - `CORE/client/applications/sidebar/tabs/actor-directory.mjs:11`;
  - `CORE/client/applications/sidebar/document-directory.mjs:36` (`HandlebarsApplicationMixin(AbstractSidebarTab)`);
  - `CORE/client/applications/sidebar/sidebar-tab.mjs:13`.
- Рендер: `CORE/client/applications/api/application.mjs:522–524`. Вызов `_doEvent(this._onRender, {eventName: "render", hookName: "render", hookArgs: [this.#element, ...handlerArgs]})`.
- `#callHooks` (строки 1226–1233) вызывает `Hooks.callAll(hookName.replace("{}", cls.name), this, ...hookArgs)` для каждого класса цепочки. Итоговые хуки: `renderActorDirectory(app, element, context, options)` и хуки родительских классов.
- `element` — это `this.#element`, HTMLElement, а не jQuery. Документация `CORE/client/hooks.mjs` строки 285–300 (`renderApplicationV2`, HTMLElement). Для ApplicationV1 (строка 313) аргумент — `JQuery`.

### 4.2 Куда вставлять кнопку

- `templates/sidebar/directory/header.hbs` (`CORE/templates/`): контейнер `.header-actions` с кнопками `createEntry` и `createFolder`. Туда и добавляем свою кнопку.
- `templates/sidebar/directory/footer.hbs`: контейнер `.directory-footer`, кнопки из `_prepareFooterContext`. Удобно для нижней кнопки.
- Header перерисовывается отдельно: `render({ parts: ["header"] })` (`document-directory.mjs:651`). Вставка должна быть идемпотентной.

### 4.3 Почему не `getHeaderControlsActorDirectory`

Кнопки заголовка окна рисуются в `_updateFrame` (`application.mjs` ≈764–771) через `_headerControlButtons()`. `_updateFrame` выполняется только при `hasFrame` (`application.mjs:350–352`). `AbstractSidebarTab` задаёт `window.frame: false`. В результате `getHeaderControlsApplicationV2`/`getHeaderControlsActorDirectory` (`hooks.mjs:320–327`) на сайдбаре не покажут кнопку. Имя `getHeaderControlsActorDirectory` предложил `[WEB]`, в исходнике оно не подтверждено и не работает для сайдбара.

### 4.4 Код

```js
const MODULE_ID = "lss-to-foundry";

Hooks.on("renderActorDirectory", (app, element, context, options) => {
  // ACTOR_CREATE по умолчанию у ASSISTANT и выше, обычный игрок кнопку не увидит.
  if (!game.user.can("ACTOR_CREATE")) return;

  const bar = element.querySelector(".header-actions");
  if (!bar || bar.querySelector(`.${MODULE_ID}-import`)) return; // идемпотентно

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-import`;
  button.innerHTML = `<i class="fa-solid fa-file-import" inert></i>
    <span>${game.i18n.localize("LSS_TO_FOUNDRY.Import.Button")}</span>`;
  button.addEventListener("click", ev => {
    ev.preventDefault();
    new LssImportApp().render({ force: true });
  });
  bar.append(button);
});
```

`game.user.can(action)` (`CORE/common/documents/user.mjs:138–141`) для имён из `USER_PERMISSIONS` возвращает `hasPermission`, иначе проверяет роль.

## 5. Диалоги и UI

### 5.1 Простой диалог: DialogV2

`DialogV2.wait` (`CORE/client/applications/api/dialog.mjs:374–395`). Значение, которое вернул `callback` кнопки, попадает в результат `wait`. Если диалог закрыт крестиком, результат `null` (если не задано `rejectClose`).

```js
const { DialogV2 } = foundry.applications.api;

const choice = await DialogV2.wait({
  window: { title: "LSS to Foundry" },
  position: { width: 480 },
  content: `<input type="file" name="files" accept=".json,application/json" multiple>`,
  buttons: [
    {
      action: "import",
      label: "Импортировать",
      default: true,
      // button.form — форма диалога (dialog.mjs, пример в комментарии строк 110–135)
      callback: (event, button) => [...button.form.elements.namedItem("files").files]
    },
    { action: "cancel", label: "Отмена" }
  ]
});

if (Array.isArray(choice)) {
  // choice — массив File
}
```

Методы `DialogV2.confirm`, `prompt`, `input` (строки 315–365) построены поверх `wait`.

### 5.2 Окно с чекбоксами и прогрессом: ApplicationV2 + HandlebarsApplicationMixin

Для списка персонажей с чекбоксами и отчёта нужен ApplicationV2.

- `HandlebarsApplicationMixin` (`CORE/client/applications/api/handlebars-application.mjs`):
  - `static PARTS` (строка 51);
  - `_preRender` загружает шаблоны всех частей (строки 89–105);
  - `_renderHTML` компилирует каждую часть через `renderTemplate` (строки 118–135).
- Экспорт: `foundry.applications.api.{ApplicationV2, HandlebarsApplicationMixin, DialogV2}` (`CORE/client/applications/api/_module.mjs`).
- Шаблоны модуля: `modules/lss-to-foundry/templates/*.hbs`. Регистрация отдельно не нужна, части `PARTS` загружаются сами. Для partial (`{{> name}}`) используют `foundry.applications.handlebars.loadTemplates({name: path})` (`CORE/client/applications/handlebars.mjs:66–77`). `renderTemplate(path, data)` — строка 88.
- Форма: `tag: "form"` делает `this.form` равным корневому элементу (`application.mjs:303`). Обработчик `form.handler` вызывается как `handler.call(app, event, form, formData, submitOptions)` (`application.mjs:1147–1152`). Настройки `form.closeOnSubmit` и `form.submitOnChange` — строки 75–78.

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "lss-to-foundry";

class LssImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-import`,
    tag: "form",
    window: { title: "LSS_TO_FOUNDRY.Import.Title", resizable: true },
    position: { width: 520 },
    form: {
      handler: LssImportApp.#onSubmit,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/import-dialog.hbs` }
  };

  /** @type {{file: File, name: string}[]} */
  characters = [];
  report = null;

  async _prepareContext(options) {
    return { characters: this.characters, report: this.report };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Часть перерисовывается целиком, слушатель вешаем на каждый рендер.
    this.element.querySelector('input[name="files"]')?.addEventListener("change", async ev => {
      const files = [...ev.currentTarget.files];
      this.characters = await Promise.all(files.map(async file => {
        const lss = JSON.parse(await file.text());   // File.text() — стандартный Web API
        return { file, name: JSON.parse(lss.data)?.name ?? file.name };   // поля LSS не проверялись
      }));
      this.render({ parts: ["body"] });
    });
  }

  static async #onSubmit(event, form, formData) {
    const picked = [...form.querySelectorAll('input[name="pick"]:checked')]
      .map(input => this.characters[Number(input.value)]);
    // импорт picked (раздел 5 и 6); прогресс — через this.report и this.render({ parts: ["body"] })
    this.report = `Выбрано: ${picked.length}`;
    await this.render({ parts: ["body"] });
  }
}
```

Шаблон `templates/import-dialog.hbs`:

```hbs
<fieldset>
  <label>{{localize "LSS_TO_FOUNDRY.Import.Button"}}
    <input type="file" name="files" accept=".json,application/json" multiple>
  </label>
</fieldset>
<ul>
  {{#each characters}}
  <li><label><input type="checkbox" name="pick" value="{{@index}}" checked> {{name}}</label></li>
  {{/each}}
</ul>
{{#if report}}<p>{{report}}</p>{{/if}}
<footer class="form-footer">
  <button type="submit">{{localize "LSS_TO_FOUNDRY.Import.Button"}}</button>
</footer>
```

Формат LSS (`jsonType`, `data` как строка JSON) взят из `CONTEXT.md`. Поля персонажа LSS в этом документе не проверялись.

### 5.3 Уведомления

`ui.notifications.info|warn|error(message, options)` (`CORE/client/applications/ui/notifications.mjs:178–204`). Для итогового отчёта: короткое уведомление плюс подробности в окне (через `report`).

## 6. Документы, флаги, права, утилиты

### 6.1 Актёр с предметами: один вызов или отдельные вызовы

- `Actor.create(data)` → `createDocuments` → `this.database.create(this.implementation, operation)` (`CORE/common/abstract/document.mjs:684–690`, `538–545`). Поэтому `Actor.create` работает для кастомного класса.
- Клиент: `#preCreateDocumentArray` (`CORE/client/data/client-backend.mjs:76–118`) вызывает `preCreate<Type>` только для документов верхнего уровня. Вложенные предметы этим путём не идут.
- Сервер: `_createDocuments` вызывает `fromSource` для родителя и пишет его вместе со вложенными коллекциями через `batchWrite` (`dist/database/backend/server-backend.mjs`, метод `_createDocuments`, минифицированный файл). Вывод: вложенные `items` сохраняются той же операцией.
- `createEmbeddedDocuments` (`CORE/common/abstract/document.mjs:816–822`) идёт через `Item.createDocuments`, поэтому `preCreateItem` и `createItem` срабатывают.

Рекомендация: импорт через `Actor.create({..., items})` даёт один сетевой запрос. Если нужны хуки на каждом предмете, используйте `createEmbeddedDocuments`. Срабатывание `createItem` для вложенных предметов по коду не выполняется, но на практике не проверено.

```js
async function createActor(name, folderId, itemSources, lssId) {
  return Actor.create({
    name,
    type: "character",            // тип dnd5e; не проверено здесь
    folder: folderId,
    items: itemSources,           // предметы из game.collections.get("Item").fromCompendium(...)
    flags: { [MODULE_ID]: { lssId } }   // флаги в той же операции, отдельный setFlag не нужен
  });
}
```

### 6.2 Папка мира

Тот же путь, что использует ядро в `importAll` (`CORE/client/documents/collections/compendium-collection.mjs`, строки ≈550–566):

```js
async function ensureFolder(name, type = "Actor") {
  const existing = game.folders.contents.find(f => f.type === type && f.name === name && !f.folder);
  if (existing) return existing;
  return foundry.documents.Folder.implementation.create({ name, type, folder: null });
}
```

Права на создание папок: базовое `metadata.permissions.create = "ASSISTANT"` (`CORE/common/abstract/document.mjs:138–142`).

### 6.3 Флаги

- `doc.setFlag(scope, key, value)` → `update({flags: {[scope]: {[key]: value}}})` (`document.mjs:941–951`).
- `doc.getFlag(scope, key)` (`document.mjs:906–919`).
- Допустимые scope: `core`, `world`, id системы и id всех активных модулей (`CORE/client/data/client-backend.mjs:478–486`). Пока модуль не активен, `setFlag` с его id выбросит ошибку.
- `flags.core.sourceId` устарел с v12. `getFlag("core", "sourceId")` выдаёт предупреждение и возвращает `_stats.compendiumSource` (`document.mjs:910–915`). Используйте `_stats.compendiumSource`.

### 6.4 foundry.utils

Экспорт: `CORE/common/utils/_module.mjs` (`export * from "./helpers.mjs"`).

| Функция | Где | Строка |
|---|---|---|
| `mergeObject` | `CORE/common/utils/helpers.mjs` | 916 |
| `setProperty` | там же | 725 |
| `getProperty` | там же | 701 |
| `randomID(length=16)` | там же | 1032 |
| `deepClone` | там же | 202 |
| `expandObject` | там же | 495 |
| `buildUuid` | там же | 1234 |
| `fromUuid`, `fromUuidSync` | `CORE/client/utils/helpers.mjs` | 161, 188 |

Глобальные алиасы (`mergeObject` без `foundry.utils.`) выдают предупреждение `since: 12, until: 14` (`CORE/client/client.mjs:181–186`). Везде пишем `foundry.utils.*`.

### 6.5 Права

| Действие | Проверка | По умолчанию | Источник |
|---|---|---|---|
| создать Actor | `ACTOR_CREATE` (+ `FILES_BROWSE`, если `randomImg`) | ASSISTANT | `CORE/common/documents/actor.mjs:121–125`, `CORE/common/constants.mjs:1230` |
| создать Item без родителя (в мире) | `ITEM_CREATE` | ASSISTANT | `CORE/common/documents/item.mjs:113–116`, `constants.mjs:1260` |
| создать Item в актёре | OWNER актёра | — | `item.mjs:113–115` |
| создать Folder | `create: "ASSISTANT"` | ASSISTANT | `document.mjs:138–142` |
| update документа | OWNER | — | `document.mjs:138–142` |

Вывод: обычный игрок по умолчанию не может импортировать персонажей и предметы в мир. ГМ может выдать `ACTOR_CREATE` и `ITEM_CREATE` в настройках, путь в UI не проверен. Если импорт делает игрок, нужна делегация через ГМ. Механизм не проверяли.

## 7. Компендиумы

### 7.1 API

```js
const pack = game.packs.get("dnd5e.spells");
const index = await pack.getIndex({ fields: ["system.identifier"] });
```

- `getIndex({fields})`: `CORE/client/documents/collections/compendium-collection.mjs:332–364`. Если поля уже проиндексированы, возвращается кэш (строка 337).
- Сервер строит проекцию по путям через `setProperty` (`dist/database/backend/server-backend.mjs`, метод `#a`). Поэтому запись индекса вложенная: `entry.system?.identifier`, а не `entry["system.identifier"]`. На живом пакете не проверено.
- `getDocument(id)` (строки 375–381): сначала кэш `this.get(id)`, затем `getDocuments({_id: id})`.
- `getDocuments(query)` (строки 411–425): результаты кладутся в кэш коллекции (`this.set`). Запросы `_id__in`, `type__in` описаны в JSDoc (строки 393–408).
- `fromUuid(uuid)` (`CORE/client/utils/helpers.mjs:161–175`): для UUID компендиума вызывает `collection.getDocument(id)`.
- Формат UUID: `Compendium.<pack>.<DocumentName>.<id>` (`buildUuid`, `helpers.mjs:1234–1255`; `CompendiumCollection.getUuid`, `compendium-collection.mjs:777–784`).

```js
async function findSpellDocs(packId, slugs) {
  const pack = game.packs.get(packId);
  if (!pack) throw new Error(`Нет компендиума ${packId}`);
  const index = await pack.getIndex({ fields: ["system.identifier"] });

  const idBySlug = new Map();
  for (const entry of index.contents) idBySlug.set(entry.system?.identifier, entry._id);

  const ids = slugs.map(s => idBySlug.get(s)).filter(Boolean);
  const missing = slugs.filter(s => !idBySlug.has(s));
  const docs = await pack.getDocuments({ _id__in: ids });
  return { docs, missing };
}
```

Геттер `contents` есть в `CORE/common/utils/collection.mjs:24`, метод `find` — строка 42.

### 7.2 Предмет из компендиума

Правильно:

```js
const itemSources = docs.map(doc => game.collections.get("Item").fromCompendium(doc, { clearFolder: true }));
```

`fromCompendium` — метод `WorldCollection` (`CORE/client/documents/abstract/world-collection.mjs:106–137`). У класса `Item` (и `Item.implementation`) такого статического метода нет.

Что делает `fromCompendium`:
- `_stats.compendiumSource = document.uuid`, если у документа задан `pack` (строки 116–119);
- `_id` удаляется, если не задан `keepId` (строка 122);
- `sort` удаляется, `ownership` сбрасывается на NONE + OWNER текущего пользователя, `active` удаляется (строки 124–135);
- `flags` не очищаются, поэтому `flags.babele` из переведённого документа попадёт в копию (см. 7.5).

`importFromCompendium(pack, id, updateData, options)` (строки 80–96) делает то же самое плюс `create`.

`_stats.compendiumSource` — текущее поле (`CORE/common/data/fields.mjs:3147`). Миграция из `flags.core.sourceId` (строка 3188).

### 7.3 Факты по данным dnd5e 5.1.8

- Имена в `DATA\systems\dnd5e\packs\spells24` английские. Подтверждение: в `000005.ldb` встречается `"Aid"` и ключ `HellishReb1`. Файл LevelDB сжат, полное сравнение имён не выполнено.
- Pack id: `dnd5e.spells`, `dnd5e.spells24` (`CONTEXT.md`, раздел «Сопоставление»).

## 8. Babele 2.7.5: переводит ли он документы, полученные кодом

### 8.1 Механизм

- `BAB/script/wrapper.js`: `libWrapper.register('babele', 'CONFIG.DatabaseBackend._getDocuments', ...)`. После `wrapped(...args)` для операции, у которой есть `pack` и `game.babele.isTranslated(pack)`:
  - если это запрос индекса (`index ?? options?.index`), вызывается `translateIndex(result, pack)`;
  - иначе результат преобразуется: `new documentClass(game.babele.translate(pack, data.toObject()), {pack})`.
- Ядро передаёт `pack` во всех путях чтения:
  - `getIndex`: `compendium-collection.mjs:340–345` (`index: true, pack`);
  - `getDocuments`: строки 411–413 (`{query, pack}`);
  - `getDocument`: строки 375–381 вызывает `getDocuments`;
  - `fromUuid`: `CORE/client/utils/helpers.mjs:30–32` вызывает `collection.getDocument`;
  - сам бэкенд: `CORE/client/data/client-backend.mjs:36–41` (`_getDocuments` возвращает `fromSource(data, {pack})`).
- При `ready` Babele переводит индексы всех паков: `BAB/script/babele.js`, хук `ready` (`game.packs.forEach(... translateIndex(pack.index, ...))`).

Вывод: **да**, Babele переводит документы, которые код получает через `pack.getDocument`, `pack.getDocuments`, `pack.getIndex` и `fromUuid`.

### 8.2 Когда перевод не применяется

- Не загружен файл перевода для текущего языка мира. Babele берёт файлы из модулей с `module.lang === game.settings.get('core', 'language')`, которые зарегистрированы через `game.babele.register({module, lang, dir})` (`BAB/script/babele.js`, `#getTranslationsFiles`; `RU/esm/shared.js`, `setupBabele`). Язык мира должен быть `ru`.
- Запись не сопоставилась (8.3).
- `RU/esm/dnd5e.js` (строки 4–11) регистрирует переводы в `init` только при `if (game.babele)`. Если Babele инициализируется позже ru-ru, перевод не регистрируется. Порядок загрузки модулей не проверен.

### 8.3 Как сопоставляются записи

`BAB/script/translated-compendium.js`, методы `hasTranslation` и `translationsFor`:

```js
const itemId = foundry.utils.parseUuid(data.flags?.core?.sourceId || data._stats?.compendiumSource)?.id;
// совпадение: translations[data._id] || translations[data.name] || translations[itemId]
```

- `_id`: ключи переводов ru-ru не id, поэтому не совпадает.
- `name`: ключ — английское имя из компендиума.
- `itemId`: для документов, скопированных из компендиума (у них есть `_stats.compendiumSource`). Для самих компендиумных документов обычно не задан.
- `system.identifier` Babele не переводит и не использует для сопоставления.

Маппинг полей: `BAB/script/default-mappings.js`, строки 65–67, для `Item`: `name` и `system.description.value`. Для файлов ru-ru свои `mapping` (`ag/dnd5e.spells.json`: `materials`, `source`, `condition`, `description`).

### 8.4 Файлы ru-ru для заклинаний

Настройки ru-ru: `compendiumTranslation` по умолчанию `true` (`RU/esm/dnd5e.js`, `registerSettings`). `altTranslation` по умолчанию `false` (`RU/esm/index.js:2–12`).

| Файл | Записей | Тип ключей | Совпадение с компендиумом |
|---|---|---|---|
| `RU/compendium/dnd5e/ag/dnd5e.spells.json` (по умолчанию) | 319 | английские имена (`"Acid Arrow"`) | да, для `dnd5e.spells` (2014) |
| `RU/compendium/dnd5e/ds/dnd5e.spells.json` (`altTranslation`) | 319 | английские | да, для `dnd5e.spells` |
| `RU/compendium/dnd5e/ag/dnd5e.spells24.json` | файла нет | — | перевода нет |
| `RU/compendium/dnd5e/ds/dnd5e.spells24.json` (`altTranslation`) | 340 | все ключи русские (`"Адское возмездие"`), английских 0 | нет: ключи не совпадают с `name` (EN) и `_id` |

Проверка выполнена разбором JSON через node. Построчного сравнения 319 ключей с именами пака `dnd5e.spells` не делали.

### 8.5 Ответ на вопрос

- **Заклинания 2014 (`dnd5e.spells`)**: да. Нужны: язык мира `ru`, активны `babele` (и его `lib-wrapper`) и `ru-ru`, `compendiumTranslation` включён. Код читает через `pack.*`, получает русские `name` и `description`, ищет по `system.identifier`.
- **Заклинания 2024 (`dnd5e.spells24`)**: нет. Ни `ag`, ни `ds` не дают совпадений. Нужен свой маппинг slug → русское название и описание. Тексты переводов ru-ru и LSS не копировать: это чужие материалы под авторским правом (см. `CONTEXT.md`).

### 8.6 Побочные эффекты для нашего кода

- После перевода `entry.name` в индексе русский. Поиск по английскому имени сломается, поиск по `system.identifier` работает.
- Babele кладёт в переведённый документ `flags.babele` (`translated`, `originalName`, `hasTranslation`; `translated-compendium.js`, `translate`). `fromCompendium` копирует флаги, поэтому в мировых предметах окажется `flags.babele`. Перед `create` стоит удалить `flags.babele` из `itemSources`. Влияние на dnd5e не проверено.
- `originalName` сохраняется для переведённых записей и годится для дедупликации. Надёжнее `system.identifier`.
- `getDocuments` кладёт результат в кэш коллекции, повторный `getDocument` вернёт тот же объект.

## 9. Разработка и выпуск

### 9.1 Подключение рабочей папки (только описание, ничего не делать)

- Foundry ищет модуль в `DATA\modules\<id>\module.json` (`[OFF]`).
- Вариант для Windows: junction `mklink /J "F:\Files\Foundry VTT\UserDate\Data\modules\lss-to-foundry" "<путь к собранной папке модуля>"`. Команда пишет в каталог данных Foundry, поэтому выполняет пользователь, а не агент.
- В корне репозитория `F:\LongStoryShort\lss-to-foundry` сейчас нет `module.json` (есть `.git`, `docs`, `test`). Junction на корень репозитория выставит туда и `docs`, и `.git`. Удобнее собирать модуль в отдельную папку (например, `dist/lss-to-foundry`) и линковать её. Поведение Foundry с лишними файлами не проверено.

### 9.2 Hot reload

- Манифест: `flags.hotReload = {extensions: [...], paths: [...]}` (`CORE/common/packages/_types.mjs:23–25`). Пути относительны папке модуля.
- Сервер смотрит файлы только при опции `hotReload` (`CORE/common/config.mjs:44`; `dist/packages/hot-reload.mjs`, метод `watchForHotReload`).
- Клиент (`CORE/client/game.mjs:1870–1882`, `#handleHotReload`) обрабатывает только `css`, `html`/`hbs`, `json`. Для `mjs`/`js` встроенной обработки нет, нужна перезагрузка страницы либо свой `Hooks.on("hotReload", data => ...)` (`Hooks.call` может вернуть `false` и отменить обработку). Вывод по коду, на практике не проверено.

### 9.3 Сборка

Чистый ESM без бандлера работает. Сборка нужна только для zip-архива релиза.

### 9.4 Тесты

- Чистая логика (разбор LSS JSON, маппинг в структуру dnd5e, дедупликация по `system.identifier`) тестируется вне Foundry: Node + Vitest. Модули логики не должны импортировать `game`, `Hooks`, `foundry.*`. Vitest — внешний инструмент, по источникам не проверено.
- Внутри Foundry: Quench (сторонний модуль). Из поиска `[WEB]`: `https://github.com/schultzcole/FVTT-Quench`; `quench.registerBatch(key, fn)`, хуки `quenchReady` и `quenchReports`. Не проверено по исходникам Quench. Запуск тестов в Foundry — по команде пользователя.

### 9.5 Выпуск через GitHub Releases

- Ассеты релиза: `module.json` и `module.zip`.
- `manifest`: стабильный URL на `module.json` последнего релиза. Формат `releases/latest/download/module.json` — практика GitHub, не проверено по `[OFF]` (статья manifest вернула 404).
- `download`: `.../releases/download/v<версия>/module.zip` (`[OFF]`: публичный URL на zip).
- Каждый релиз увеличивает `version` (`[OFF]`, module-development).

Пример GitHub Actions (не проверено на репозитории):

```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Проверка JSON
        run: node -e "JSON.parse(require('fs').readFileSync('module.json','utf8'))"
      - name: Сборка module.zip
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('module.json','utf8'));m.version='$VERSION';m.download='https://github.com/${GITHUB_REPOSITORY}/releases/download/${GITHUB_REF_NAME}/module.zip';fs.writeFileSync('module.json',JSON.stringify(m,null,2))"
          zip -r module.zip module.json scripts styles templates lang LICENSE
      - name: GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            module.json
            module.zip
```

## 10. Отличия v13 от v12, что сломается в v14

### 10.1 v12 → v13 (то, что касается нашего модуля)

- Хуки ApplicationV2 получают HTMLElement (`CORE/client/hooks.mjs:285–300`). Хуки ApplicationV1 получают jQuery (строка 313).
- `ActorDirectory` в v13 — ApplicationV2 (`AbstractSidebarTab`), рамки окна нет. Заголовочные кнопки не работают, нужна вставка в DOM (раздел 4).
- `DialogV2`, `HandlebarsApplicationMixin`, `ApplicationV2` — API v13 (`CORE/client/applications/api/_module.mjs`).
- `_stats.compendiumSource` вместо `flags.core.sourceId` (устарел с v12, `until: 14`).
- `styles` в манифесте приводится к `[{src}]` (`base-package.mjs:618–628`).
- Настройки читаются только после `setup` (`hooks.mjs:117–124`).
- Версия v12 по коду не проверялась. Что именно v12 передавал в `renderActorDirectory` (jQuery), известно по опыту, не проверено локально.

### 10.2 v14 (по `[WEB]`, не по коду)

- `https://foundryvtt.com/releases/14.357` — **User Testing 2, не Stable** (`[WEB]`). Статус Stable на 22.10.2026 не проверен.
- Система dnd5e 5.2.5 несовместима с v14, для тестов нужна 5.3 (`[WEB]`, 14.357). Наш dnd5e 5.1.8 на v14 — не проверено, вероятно не совместим.
- v14 требует Node.js 24 (`[WEB]`, 14.357).
- ApplicationV2 получил pop-out окна (`[WEB]`). Может повлиять на сайдбар.
- TinyMCE заменён на ProseMirror (`[WEB]`). Актуально, если модуль использует редактор.
- Помечено `until: 14` в коде (поэтому ожидаем изменения, но не проверено): `flags.core.sourceId` (`document.mjs:910–914`), глобальные алиасы `utils` (`client.mjs:181–186`).
- Babele 2.7.5 и ru-ru 13.348.1 объявлены как проверенные на 13.348 (`BAB/module.json`, `RU/module.json`). Совместимость с v14 не проверена.

## 11. Не проверено и открытые вопросы

- Quench, Vitest, GitHub Actions: только практика и поиск, без источников.
- Порядок инициализации Babele относительно ru-ru (раздел 8.2): не проверено.
- Вложенная проекция индекса `entry.system.identifier` на живом пакете: не проверено.
- Построчное совпадение 319 ключей `ag/dnd5e.spells.json` с именами `dnd5e.spells`: не сверяли.
- Права игрока на чтение системных компендиумов: не проверено.
- Вызов `createItem` для вложенных предметов в `Actor.create` (по коду нет, практически не проверено).
- Код dnd5e 5.1.8 (`DATA\systems\dnd5e\dnd5e.mjs`) не читался: обработка предметов и флагов системой не проверена.
- Пути и поля LSS (имя персонажа, структура `data`): не проверялись, берём из `CONTEXT.md`.
