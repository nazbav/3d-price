# GCodeCalc Electron — Remote UI + офлайн сборка CDN

## URL сайта (онлайн)

```
https://c.n4v.ru/test.html
```

Можно переопределить через переменную окружения: `GCODECALC_REMOTE_URL=...`

---

## Офлайн-сборка CDN

Панель сверху (Electron) — кнопка **"Создать офлайн версию"**:
- Скачивает HTML
- Скачивает ресурсы CDN (`<script src>`, `<link rel=stylesheet/icon/manifest href>`, `<img src>`, srcset, `url()` в `<style>`)
- Переписывает ссылки на локальные assets
- Сохраняет в `userData\offline\site\` (см. кнопку "Открыть папку")

Если интернет недоступен:
- Если есть офлайн-копия → открывается офлайн `index.html`
- Если нет → заглушка `offline_stub.html`

---

## Импорт из OrcaSlicer

```
"...\GCodeCalc.exe" --pp --silent
```

---

## Development Setup

```bash
cd electronapp
npm install
npm run start
```

---

## Build Commands

```bash
npm install
npm run dist        # package for current platform
npm run dist:win    # Windows installer (NSIS)
npm run dist:linux  # Linux AppImage
npm run dist:mac    # macOS DMG
```

Алиас `npm run make` эквивалентен `npm run dist`.

---

## Безопасность

- Remote content загружается в `BrowserView` с `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`.
- Навигации и новые окна наружу блокируются; внешние ссылки открываются в системном браузере.

---

## Логи

```
%TEMP%\GCodeCalc-logs\latest.txt
```

---

## Electron Compatibility Notes (test.html)

### Environment Detection

`isElectronEnv()` (line ~9984) checks `!!(window && window.backupBridge)`.
The preload script injects `window.backupBridge`; its presence is the **sole** signal that the app is running inside Electron.

```js
// Preload injects window.backupBridge
function isElectronEnv() {
    return !!(window && window.backupBridge);
}
```

### Toasts / Notifications

- **Browser**: `showToastAuto()` delegates to the Bootstrap 5 toast component.
- **Electron**: `showToastAuto()` calls `showElectronToast()`, which creates a pure-DOM overlay (CSS classes `.electron-toast-container` / `.electron-toast`) injected into `<body>`. No Bootstrap dependency — works reliably even before Bootstrap JS initialises.
- After schema migration `window.backupBridge.notify({type: 'migrationComplete'})` is called so the main process can react (e.g. reload the window or update the tray).

### History Storage (IndexedDB)

Order history is stored in IndexedDB (`indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION)`).
Electron's renderer process exposes the full Web Storage API — **fully compatible**, no changes needed.

### Settings Storage (localStorage)

The following keys are persisted to `localStorage` and are **fully compatible** in Electron:

| Key / area | What is stored |
|---|---|
| `THEME_STORAGE_KEY` | UI theme (light / dark) |
| `I18N_OVERRIDE_STORAGE_KEY` | Language override (auto / ru / en) |
| `CURRENCY_OVERRIDE_STORAGE_KEY` | Currency (RUB / USD / EUR …) |
| `STORAGE_KEY` | Full calculator config snapshot (printers, materials, etc.) |
| `my_nalog_token`, `my_nalog_refresh`, `my_nalog_device_id`, `my_nalog_inn` | Мой налог (Russian self-employment tax) credentials |

### File Downloads

`downloadBlob(blob, filename)` creates a temporary `<a>` with `URL.createObjectURL(blob)` and `.click()`s it.
Electron's renderer supports both `Blob` and `URL.createObjectURL` — **fully compatible**.
Affected operations: config export, history export, filament profile export, HTML invoice export.

### Drag-and-Drop (G-code / JSON)

Three `window`-level listeners (`dragenter`, `dragover`, `drop`) handle file drops.
Electron does not restrict these DOM events — **fully compatible**.

### `window.location` / `window.history`

`resolveSyncBaseUrl()` checks `window.location.protocol`.
In Electron the protocol is `file:`, so the function falls through to meta.json URL resolution — **handled correctly**, no changes needed.
`window.history.replaceState()` (used to strip `?sync_id=…` from the URL after import) works in Electron.

### Known Caveats

| Area | Detail |
|---|---|
| `window.open` | No calls found in `test.html`; nalog receipt links use `target="_blank"` which the main process redirects to the system browser via `will-navigate` / `new-window` handlers. |
| `window.print` | No calls found in `test.html`. If added in the future, Electron supports `webContents.print()` natively. |
| Sync over `file:` | Cloud sync (`resolveSyncBaseUrl`) is disabled when running from a local `file:` URL without a server — falls back to no-op gracefully. |
| Offline CDN assets | Bootstrap, icons, and other CDN resources must be bundled via the "Создать офлайн версию" button before going offline. |