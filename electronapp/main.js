const { app, BrowserWindow, BrowserView, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { URL, pathToFileURL, fileURLToPath } = require('node:url');

const { buildOfflineSite, DEFAULT_SOURCE_URL, atomicSwapDir } = require('./offlineBuilder');
const { scanOrcaProfiles, buildPreview, applyAssignments } = require('./orcaSync');

const APP_ID = 'com.n4v.nprintcalc';

function resolveWindowIconPath() {
  // Prefer Windows ICO, fallback to PNGs (useful for Linux/titlebar).
  // В packaged-сборке ресурсы лежат в process.resourcesPath, а не рядом с __dirname.
  const relCandidates = [];
  if (process.platform === 'win32') relCandidates.push(path.join('build', 'win', 'icon.ico'));
  relCandidates.push(path.join('build', 'png', '512x512.png'));
  relCandidates.push(path.join('build', 'png', '256x256.png'));

  const roots = [];
  try { roots.push(__dirname); } catch {}
  try { if (process.resourcesPath) roots.push(process.resourcesPath); } catch {}
  try { if (process.resourcesPath) roots.push(path.join(process.resourcesPath, 'app')); } catch {}
  try { if (typeof app?.getAppPath === 'function') roots.push(app.getAppPath()); } catch {}
  try { if (process.execPath) roots.push(path.dirname(process.execPath)); } catch {}

  const uniq = Array.from(new Set(roots.filter(Boolean)));
  const rootCandidates = [];
  for (const r of uniq) {
    rootCandidates.push(r);
    rootCandidates.push(path.join(r, '..'));
  }

  for (const rel of relCandidates) {
    for (const root of rootCandidates) {
      const p = path.join(root, rel);
      try { if (p && fs.existsSync(p)) return p; } catch {}
    }
  }
  return undefined;
}

const WINDOW_ICON = resolveWindowIconPath();

// Ensures Windows taskbar uses the correct identity/icon grouping.
if (process.platform === 'win32') {
  try { app.setAppUserModelId(APP_ID); } catch {}
}


let win = null;
let toolbarView = null;
let contentView = null;
const TOOLBAR_BASE_HEIGHT = 46;
let toolbarHeight = TOOLBAR_BASE_HEIGHT;
let syncWin = null;
let paramsWin = null;

let pendingPayload = null;

let mode = 'offline'; // online | offline | stub
let offlineAvailable = false;
let preferredMode = 'offline';
let autoSyncEnabled = false;

// Settings
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const STORAGE_KEY = 'ThreeDPrintCalc_Extended_v5';

// Remote source (online UI)
const DEFAULT_REMOTE_SOURCE = process.env.GCODECALC_REMOTE_URL || DEFAULT_SOURCE_URL;
let remoteSourceSetting = DEFAULT_REMOTE_SOURCE;
let remoteUrl = DEFAULT_REMOTE_SOURCE;

// Offline storage (outside asar)
const DEFAULT_OFFLINE_ROOT = path.join(app.getPath('userData'), 'offline');
let offlineRootSetting = DEFAULT_OFFLINE_ROOT;
let offlineRootPath = DEFAULT_OFFLINE_ROOT;
let offlineSiteDir = path.join(offlineRootPath, 'site');
let offlineIndexPath = path.join(offlineSiteDir, 'index.html');
const OFFLINE_STUB = path.join(__dirname, 'offline_stub.html');

const SYNC_DIR = path.join(app.getPath('userData'), 'orca-sync');
const SYNC_BACKUP_DIR = path.join(SYNC_DIR, 'backups');
const CALC_STORE_PATH = path.join(SYNC_DIR, 'calc_data_master.json');
const ORCA_DEFAULT_PATH = path.join(app.getPath('appData'), 'OrcaSlicer', 'user', 'default');

// ---------- Logging ----------
// По умолчанию логи отключены (не блокируем UI синхронными fs.appendFileSync на каждое событие).
// Включить можно, если нужно отладить: запуск с флагом --logs или переменной окружения GCODECALC_LOGS=1.
const LOGS_ENABLED = (process.env.GCODECALC_LOGS === '1') || process.argv.includes('--logs');

function ts() { return new Date().toISOString(); }

let LOG_FILE = null;
if (LOGS_ENABLED) {
  const LOG_DIR = path.join(os.tmpdir(), 'GCodeCalc-logs');
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  LOG_FILE = path.join(LOG_DIR, `gcodecalc_${new Date().toISOString().replace(/[:.]/g,'-')}_pid${process.pid}.log`);
  try { fs.writeFileSync(path.join(LOG_DIR, 'latest.txt'), LOG_FILE, 'utf-8'); } catch {}
}

function log(...parts) {
  if (!LOGS_ENABLED || !LOG_FILE) return;
  const line = `[${ts()}] ` + parts.map(p => {
    try { return (typeof p === 'string') ? p : JSON.stringify(p); }
    catch { return String(p); }
  }).join(' ') + '\n';
  try { fs.appendFileSync(LOG_FILE, line, 'utf-8'); } catch {}
  try { process.stdout.write(line); } catch {}
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on('uncaughtException', (err) => log('uncaughtException', { message: err?.message, stack: err?.stack }));
process.on('unhandledRejection', (reason) => log('unhandledRejection', reason));

applyPathOverridesFromSettings();
hydrateOfflineMetaFromDisk();

log('=== GCodeCalc start ===');
log('REMOTE_URL', remoteUrl);
log('offlineRoot', offlineRootPath);
log('userData', app.getPath('userData'));
log('argv', process.argv);

// ---------- Settings helpers ----------
function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveSettings(obj) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    log('saveSettings.failed', { error: e?.message });
  }
}

function getOrcaPathSetting() {
  const s = loadSettings();
  return (typeof s.orcaPath === 'string' && s.orcaPath.trim()) ? s.orcaPath : null;
}

function setOrcaPathSetting(p) {
  const s = loadSettings();
  if (typeof p === 'string' && p.trim()) s.orcaPath = p.trim();
  else delete s.orcaPath;
  saveSettings(s);
}

function initPreferredMode() {
  preferredMode = 'offline';
  autoSyncEnabled = false;
  const s = loadSettings();
  if (s.preferredMode !== 'offline') {
    s.preferredMode = 'offline';
    saveSettings(s);
  }
  log('settings.preferredMode', preferredMode);
}

function normalizeRemoteSource(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    return { url: raw };
  }
  if (/^file:\/\//i.test(raw)) {
    try { return { url: new URL(raw).toString() }; }
    catch { return null; }
  }
  try {
    if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
      return { url: pathToFileURL(raw).toString() };
    }
  } catch {
    return null;
  }
  return null;
}

function applyRemoteSourceOverride(raw, skipSave = false) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    const fallback = normalizeRemoteSource(DEFAULT_REMOTE_SOURCE) || { url: DEFAULT_SOURCE_URL };
    remoteUrl = fallback.url;
    remoteSourceSetting = DEFAULT_REMOTE_SOURCE;
    if (!skipSave) {
      const s = loadSettings();
      delete s.remoteSource;
      saveSettings(s);
    }
    return remoteUrl;
  }
  const normalized = normalizeRemoteSource(trimmed);
  if (!normalized) throw new Error('Некорректный URL или путь до HTML файла');
  remoteUrl = normalized.url;
  remoteSourceSetting = trimmed;
  if (!skipSave) {
    const s = loadSettings();
    s.remoteSource = trimmed;
    saveSettings(s);
  }
  return remoteUrl;
}

function applyOfflineRootOverride(raw, skipSave = false) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const target = trimmed || DEFAULT_OFFLINE_ROOT;
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (e) {
    throw new Error('Не удалось создать/использовать папку офлайна: ' + (e?.message || e));
  }
  offlineRootPath = target;
  offlineRootSetting = target;
  offlineSiteDir = path.join(offlineRootPath, 'site');
  offlineIndexPath = path.join(offlineSiteDir, 'index.html');
  if (!skipSave) {
    const s = loadSettings();
    if (trimmed) s.offlineRoot = target;
    else delete s.offlineRoot;
    saveSettings(s);
  }
  return offlineRootPath;
}

function applyPathOverridesFromSettings() {
  try {
    const settings = loadSettings();
    if (settings && typeof settings.remoteSource === 'string' && settings.remoteSource.trim()) {
      try { applyRemoteSourceOverride(settings.remoteSource, true); }
      catch { applyRemoteSourceOverride(DEFAULT_REMOTE_SOURCE, true); }
    } else {
      applyRemoteSourceOverride(DEFAULT_REMOTE_SOURCE, true);
    }
    if (settings && typeof settings.offlineRoot === 'string' && settings.offlineRoot.trim()) {
      try { applyOfflineRootOverride(settings.offlineRoot, true); }
      catch { applyOfflineRootOverride(DEFAULT_OFFLINE_ROOT, true); }
    } else {
      applyOfflineRootOverride(DEFAULT_OFFLINE_ROOT, true);
    }
  } catch {
    applyRemoteSourceOverride(DEFAULT_REMOTE_SOURCE, true);
    applyOfflineRootOverride(DEFAULT_OFFLINE_ROOT, true);
  }
}

function hydrateOfflineMetaFromDisk() {
  try {
    const metaPath = path.join(offlineSiteDir, 'meta.json');
    if (!fs.existsSync(metaPath)) return;
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(raw);
    if (!meta || typeof meta !== 'object') return;
    const hash = typeof meta.htmlHash === 'string' ? meta.htmlHash : null;
    const builtAt = typeof meta.builtAt === 'string' ? meta.builtAt : null;
    if (!hash && !builtAt) return;
    const settings = loadSettings();
    let dirty = false;
    if (hash && settings.currentOfflineHash !== hash) {
      settings.currentOfflineHash = hash;
      dirty = true;
    }
    if (builtAt && settings.lastOfflineBuiltAt !== builtAt) {
      settings.lastOfflineBuiltAt = builtAt;
      dirty = true;
    }
    if (dirty) saveSettings(settings);
  } catch (e) {
    log('hydrateOfflineMeta.failed', { error: e?.message });
  }
}

function getPathsPayload() {
  return {
    remoteUrl,
    remoteSource: remoteSourceSetting,
    offlinePath: offlineRootPath,
    orcaPath: getOrcaPathSetting() || ORCA_DEFAULT_PATH
  };
}

function refocusMainViews() {
  const attempts = [0, 150, 400, 800, 1500, 2500, 4000];
  attempts.forEach((delay) => {
    setTimeout(() => {
      try {
        if (win && !win.isDestroyed()) {
          if (toolbarView?.webContents && !toolbarView.webContents.isDestroyed()) {
            toolbarView.webContents.focus();
          }
          if (contentView?.webContents && !contentView.webContents.isDestroyed()) {
            contentView.webContents.focus();
          }
          win.focus();
        }
      } catch (e) {
        log('focus.restore.error', { error: e?.message });
      }
    }, delay);
  });
}

async function readCalcStoreRaw() {
  try {
    return await fsp.readFile(CALC_STORE_PATH, 'utf-8');
  } catch {
    return null;
  }
}

async function writeCalcStoreRaw(raw) {
  try {
    await fsp.mkdir(path.dirname(CALC_STORE_PATH), { recursive: true });
    await fsp.writeFile(CALC_STORE_PATH, raw, 'utf-8');
  } catch (e) {
    log('calcStore.write.error', { error: e?.message });
  }
}

async function hasCalcDataInRenderer() {
  if (!contentView?.webContents || contentView.webContents.isDestroyed()) return false;
  try {
    await ensureContentReady();
    const ok = await contentView.webContents.executeJavaScript(`
      (() => {
        try {
          const key = ${JSON.stringify(STORAGE_KEY)};
          const v = localStorage.getItem(key);
          return !!(v && v.length > 2);
        } catch (e) {
          return false;
        }
      })()
    `, true);
    return !!ok;
  } catch {
    return false;
  }
}

async function hydrateCalcFromStoreIfNeeded(storeRaw) {
  if (!storeRaw) return false;
  try {
    const already = await hasCalcDataInRenderer();
    if (already) return false;

    await importCalcData(storeRaw, { skipResnapshot: true });
    return true;
  } catch (e) {
    log('calcStore.hydrate.error', { error: e?.message });
    return false;
  }
}



async function getCalcDataForSync() {
  // Стараемся брать самый свежий слепок из живого UI (localStorage/appData),
  // а файл master-store используем как запасной вариант (когда UI ещё не поднялся).
  if (contentView?.webContents && !contentView.webContents.isDestroyed()) {
    try {
      const snap = await exportCalcSnapshot();
      return {
        raw: snap.raw,
        data: snap.data,
        source: 'snapshot',
        exportPath: snap.exportPath,
        exportedAt: snap.exportedAt || null
      };
    } catch (e) {
      log('calcSnapshot.capture.error', { error: e?.message });
    }
  }

  const raw = await readCalcStoreRaw();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      return { raw, data, source: 'store' };
    } catch (e) {
      log('calcStore.parse.error', { error: e?.message });
    }
  }

  const snap = await exportCalcSnapshot();
  return {
    raw: snap.raw,
    data: snap.data,
    source: 'snapshot',
    exportPath: snap.exportPath,
    exportedAt: snap.exportedAt || null
  };
}

function rememberOfflineBuild(meta = {}) {
  const settings = loadSettings();
  if (meta.htmlHash) settings.currentOfflineHash = meta.htmlHash;
  if (meta.builtAt) settings.lastOfflineBuiltAt = meta.builtAt;
  saveSettings(settings);
}

async function fetchRemoteHtmlHash() {
  try {
    const target = new URL(remoteUrl);
    if (target.protocol === 'file:') {
      const buf = await fsp.readFile(fileURLToPath(target));
      return crypto.createHash('sha1').update(buf).digest('hex');
    }
    if (target.protocol === 'http:' || target.protocol === 'https:') {
      if (typeof fetch === 'function') {
        const res = await fetch(remoteUrl, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return crypto.createHash('sha1').update(buf).digest('hex');
      }
      const mod = target.protocol === 'https:' ? https : http;
      const buf = await new Promise((resolve, reject) => {
        const req = mod.get(remoteUrl, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
      });
      return crypto.createHash('sha1').update(buf).digest('hex');
    }
  } catch (e) {
    log('update.hash.error', { error: e?.message });
  }
  return null;
}

async function maybeCheckForUpdates() {
  try {
    const today = new Date();
    if (today.getDay() !== 1) return; // Monday
    const dateKey = today.toISOString().slice(0, 10);
    const settings = loadSettings();
    if (settings.lastUpdateCheck === dateKey) return;
    const remoteHash = await fetchRemoteHtmlHash();
    if (!remoteHash) return;
    settings.lastUpdateCheck = dateKey;
    settings.lastRemoteHash = remoteHash;
    saveSettings(settings);
    if (!offlineAvailable) return;
    const currentHash = settings.currentOfflineHash || null;
    if (!currentHash || currentHash === remoteHash) return;
    const ignored = Array.isArray(settings.dismissedHashes) ? settings.dismissedHashes : [];
    if (ignored.includes(remoteHash)) return;
    if (!win) return;

    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Доступно обновление интерфейса',
      message: 'Найдена новая версия страницы калькулятора.',
      detail: 'Можно обновить офлайн интерфейс прямо сейчас. После обновления приложение перезапускать не нужно.\n\nЕсли нажмёшь «Позже», то напомним об этой версии в следующий понедельник. Галочка отключит напоминание только для текущего хеша.',
      buttons: ['Обновить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      checkboxLabel: 'Не напоминать про эту версию',
      checkboxChecked: false,
      noLink: true
    });
    refocusMainViews();

    if (response === 0) {
      log('update.user-accepted', { remoteHash });
      await buildOffline({ silent: false, reason: 'auto-update' });
      const s2 = loadSettings();
      if (Array.isArray(s2.dismissedHashes)) {
        s2.dismissedHashes = s2.dismissedHashes.filter((h) => h !== remoteHash);
        saveSettings(s2);
      }
    } else if (checkboxChecked) {
      const s3 = loadSettings();
      const set = new Set(Array.isArray(s3.dismissedHashes) ? s3.dismissedHashes : []);
      set.add(remoteHash);
      s3.dismissedHashes = Array.from(set);
      saveSettings(s3);
      log('update.dismissed', { remoteHash });
    }
  } catch (e) {
    log('update.check.error', { error: e?.message });
  }
}

// ---------- Utilities ----------
function cleanArg(a) {
  if (typeof a !== 'string') return '';
  return a.trim().replace(/^"(.*)"$/, '$1').replace(/;+$/, '');
}
function getArgs(argv) { return (argv || []).map(cleanArg).filter(Boolean); }
function hasFlag(argv, flag) { return getArgs(argv).includes(flag); }
function isGcodePath(p) { return /\.(gcode|gco)(\.pp)?$/i.test(p); }

function extractGcodePath(argv) {
  const args = getArgs(argv);
  let lastCandidate = null;
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (isGcodePath(a)) {
      lastCandidate = a;
      if (fs.existsSync(a)) return a;
    }
  }
  return lastCandidate;
}

function tryReadText(fp) {
  try { return fs.readFileSync(fp, 'utf-8'); }
  catch (e) { log('tryReadText.failed', { fp, error: e?.message }); return null; }
}

function ensureModelCodeInText(text) {
  try {
    const lines = text.split(/\r?\n/);
    if (lines[0] && lines[0].startsWith('; MODEL_CODE: ')) return text;
    const rnd = () => Math.random().toString(36).slice(2);
    const code = (rnd() + rnd()).replace(/[^a-z0-9]/g, '').slice(0, 16);
    lines.unshift(`; MODEL_CODE: ${code}`);
    return lines.join('\n');
  } catch {
    return text;
  }
}

// ---------- Stash (Orca temp files can disappear) ----------
const STASH_DIR = path.join(os.tmpdir(), 'GCodeCalc-stash');
fs.mkdirSync(STASH_DIR, { recursive: true });

function stashGcodeFile(srcPath) {
  try {
    if (!srcPath) return null;
    if (!fs.existsSync(srcPath)) return null;

    const base = path.basename(srcPath)
      .replace(/[\s<>:"/\\|?*]+/g, '_')
      .replace(/\.pp$/i, '');
    const dst = path.join(STASH_DIR, `${Date.now()}_${process.pid}_${base}`);

    fs.copyFileSync(srcPath, dst);
    log('stash.ok', { srcPath, dst, size: fs.statSync(dst).size });
    return dst;
  } catch (e) {
    log('stash.failed', { srcPath, error: e?.message });
    return null;
  }
}

// ---------- Status + title ----------
function updateWindowTitle() {
  if (!win) return;
  const title = (mode === 'offline' || mode === 'stub')
    ? 'Калькулятор 3D-печати (оффлайн)'
    : 'Калькулятор 3D-печати';
  try { win.setTitle(title); } catch {}
}

function buildStatusPayload(message) {
  const settings = loadSettings();
  return {
    mode,
    offlineAvailable,
    preferredMode,
    autoSyncEnabled,
    appPath: app.getPath('exe'),
    paths: getPathsPayload(),
    offlineHash: settings.currentOfflineHash || null,
    lastOfflineBuiltAt: settings.lastOfflineBuiltAt || null,
    message: message || ''
  };
}

function broadcastToUi(channel, payload) {
  // Toolbar is a BrowserView; params is a modal BrowserWindow.
  try {
    if (toolbarView && toolbarView.webContents) toolbarView.webContents.send(channel, payload);
  } catch {}
  try {
    if (paramsWin && !paramsWin.isDestroyed?.() && paramsWin.webContents) paramsWin.webContents.send(channel, payload);
  } catch {}
}

function broadcastStatus(message) {
  const s = buildStatusPayload(message);
  broadcastToUi('toolbar:status', s);
}

function setMode(newMode, message) {
  mode = newMode;
  updateWindowTitle();
  broadcastStatus(message);
}

// ---------- Views layout ----------
function layoutViews(targetWin) {
  try {
    const hostWindow = targetWin && typeof targetWin.getContentBounds === 'function' ? targetWin : win;
    if (!hostWindow || typeof hostWindow.getContentBounds !== 'function' || hostWindow.isDestroyed?.()) return;
    if (!toolbarView || toolbarView.isDestroyed?.() || !contentView || contentView.isDestroyed?.()) return;

    const bounds = hostWindow.getContentBounds?.() || {};
    const fallback = typeof hostWindow.getBounds === 'function' ? hostWindow.getBounds() : {};
    const rawWidth = Number.isFinite(bounds.width) ? bounds.width : Number(fallback.width);
    const rawHeight = Number.isFinite(bounds.height) ? bounds.height : Number(fallback.height);
    if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
      log('layoutViews.bounds.invalid', { bounds, fallback });
      return;
    }
    const width = Math.max(1, Math.round(rawWidth));
    const height = Math.max(1, Math.round(rawHeight));
    const barH = Math.max(1, Math.round(toolbarHeight || TOOLBAR_BASE_HEIGHT));

    toolbarView.setBounds({ x: 0, y: 0, width, height: barH });
    toolbarView.setAutoResize({ width: true });

    contentView.setBounds({ x: 0, y: barH, width, height: Math.max(1, height - barH) });
    contentView.setAutoResize({ width: true, height: true });
  } catch (e) {
    log('layoutViews.error', { error: e?.message, stack: e?.stack });
  }
}

function setToolbarHeightPx(newHeight) {
  const minH = TOOLBAR_BASE_HEIGHT;
  const maxH = 400;
  const n = typeof newHeight === 'number' ? newHeight : parseFloat(newHeight);
  if (!Number.isFinite(n)) {
    log('toolbar.height.invalid', { newHeight });
    return;
  }
  const clamped = Math.max(minH, Math.min(n, maxH));
  if (clamped === toolbarHeight) return;
  toolbarHeight = clamped;
  try {
    layoutViews();
  } catch (e) {
    log('layoutViews.error', { error: e?.message });
  }
}

function resolveOrcaPath(requestedPath) {
  const trimmed = typeof requestedPath === 'string' ? requestedPath.trim() : '';
  if (trimmed) return trimmed;
  const stored = getOrcaPathSetting();
  if (stored) return stored;
  return ORCA_DEFAULT_PATH;
}

async function waitForAppDataReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (!contentView || !contentView.webContents) break;
      const ready = await contentView.webContents.executeJavaScript(
        'typeof appData !== "undefined" && typeof saveToLocalStorage === "function"',
        true
      );
      if (ready) return true;
    } catch {}
    await sleep(300);
  }
  throw new Error('Данные калькулятора ещё не готовы. Открой калькулятор и попробуй снова.');
}

async function ensureContentReady() {
  if (!contentView || !contentView.webContents) throw new Error('Интерфейс ещё не инициализирован');
  if (!contentView.webContents.isLoading()) return;
  await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      contentView.webContents.removeListener('did-finish-load', onFinish);
      contentView.webContents.removeListener('did-fail-load', onFail);
    };
    const onFinish = () => {
      cleanup();
      resolve();
    };
    const onFail = (_event, code, desc) => {
      cleanup();
      reject(new Error(`Ошибка загрузки UI: ${code} ${desc}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Интерфейс загружается слишком долго'));
    }, 20000);
    contentView.webContents.once('did-finish-load', onFinish);
    contentView.webContents.once('did-fail-load', onFail);
  });
}

async function exportCalcSnapshot() {
  let attempts = 0;
  let raw = null;
  while (attempts < 5 && !raw) {
    await ensureContentReady();
    await waitForAppDataReady();
    const result = await contentView.webContents.executeJavaScript(`
      (() => {
        const storageKey = ${JSON.stringify(STORAGE_KEY)};
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored && stored.length > 2) {
            return { raw: stored, source: 'storage' };
          }
        } catch {}
        try {
          if (typeof appData !== 'undefined') {
            return { raw: JSON.stringify(appData), source: 'appData' };
          }
        } catch (error) {
          return { raw: null, error: error.message };
        }
        return { raw: null };
      })()
    `, true);
    raw = result?.raw || null;
    if (raw) break;
    attempts++;
    await sleep(200);
  }
  if (!raw) throw new Error('Не удалось получить данные калькулятора. Открой калькулятор и попробуй снова.');
  await fsp.mkdir(SYNC_DIR, { recursive: true });
  const exportPath = path.join(SYNC_DIR, 'calc_data.json');
  await fsp.writeFile(exportPath, raw, 'utf-8');
  await writeCalcStoreRaw(raw);
  const data = JSON.parse(raw);
  return { data, raw, exportPath, exportedAt: new Date().toISOString() };
}

async function importCalcData(updatedJson, options = {}) {
  await ensureContentReady();
  const rawString = typeof updatedJson === 'string' ? updatedJson : JSON.stringify(updatedJson);

  const script = `
    (() => {
      try {
        const storageKey = ${JSON.stringify(STORAGE_KEY)};
        const raw = ${JSON.stringify(rawString)};
        const dataObj = JSON.parse(raw);

        let next = dataObj;
        if (typeof migrateOldData === 'function') {
          next = migrateOldData(next);
        }
        if (typeof normalizeIds === 'function') {
          normalizeIds(next);
        }

        window.appData = next;

        // Persist once, without calling saveToLocalStorage() (it can be heavy).
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}

        // Defer re-init to idle time to reduce UI stalls after native dialogs.
        const runInit = () => {
          try { if (typeof initAll === 'function') initAll(); } catch {}
        };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(runInit, { timeout: 500 });
        } else {
          setTimeout(runInit, 0);
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    })()
  `;

  const result = await contentView.webContents.executeJavaScript(script, true);
  if (!result?.ok) {
    throw new Error(result?.error || 'Не удалось применить новые данные калькулятора');
  }

  await ensureContentReady();
  await waitForAppDataReady();

  await writeCalcStoreRaw(rawString);
  if (!options.skipResnapshot) {
    try {
      await exportCalcSnapshot();
    } catch (e) {
      log('import.exportAfter.error', { error: e?.message });
    }
  }
}

const syncManager = {

  setAuto() {},
  isAuto() { return false; },
  getSnapshot() { return null; },
  async capture() { return null; },
  async applySnapshot() { return false; },
  async beforeSwitch() {},
  async afterSwitch() {}
};

function openSyncWindow() {
  if (syncWin && !syncWin.isDestroyed()) {
    syncWin.focus();
    return syncWin;
  }

  const syncOpts = {
    width: 1100,
    height: 720,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    parent: win || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'syncPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  };

  if (WINDOW_ICON) syncOpts.icon = WINDOW_ICON;

  syncWin = new BrowserWindow(syncOpts);
  syncWin.loadFile(path.join(__dirname, 'sync.html'));
  syncWin.on('closed', () => { syncWin = null; });
  return syncWin;
}

function openParamsWindow() {
  if (paramsWin && !paramsWin.isDestroyed()) {
    paramsWin.focus();
    return paramsWin;
  }

  const opts = {
    width: 620,
    height: 620,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    parent: win || undefined,
    modal: !!win,
    webPreferences: {
      preload: path.join(__dirname, 'toolbarPreload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  };

  if (WINDOW_ICON) opts.icon = WINDOW_ICON;

  paramsWin = new BrowserWindow(opts);
  paramsWin.loadFile(path.join(__dirname, 'params.html'));
  paramsWin.once('ready-to-show', () => {
    try { paramsWin.show(); } catch {}
  });
  paramsWin.on('closed', () => { paramsWin = null; });
  return paramsWin;
}


// ---------- Content load ----------
async function refreshOfflineAvailability() {
  try { offlineAvailable = fs.existsSync(offlineIndexPath); }
  catch { offlineAvailable = false; }
}

async function loadOnline() {
  const previousMode = mode;
  setMode('online', 'Открываю онлайн…');
  await contentView.webContents.loadURL(remoteUrl);

  // Не затираем уже существующее localStorage (иначе "не сохраняется при перезагрузке").
  // Подтягиваем master-store только если UI пустой.
  const storeRaw = await readCalcStoreRaw();
  if (storeRaw) {
    await hydrateCalcFromStoreIfNeeded(storeRaw);
  }
}

async function loadOffline(message) {
  await refreshOfflineAvailability();
  if (!offlineAvailable) {
    await loadStub();
    return;
  }
  setMode('offline', message || 'Открываю офлайн…');
  await contentView.webContents.loadFile(offlineIndexPath);

  // Важно: НЕ перетираем данные калькулятора при каждом "обновить/перезагрузить".
  // Если localStorage уже содержит данные — оставляем их. Если пусто — подтягиваем из master-store.
  const storeRaw = await readCalcStoreRaw();
  if (storeRaw) {
    await hydrateCalcFromStoreIfNeeded(storeRaw);
  }
}

async function loadStub() {
  setMode('stub', 'Нет интернета и нет офлайн копии');
  await contentView.webContents.loadFile(OFFLINE_STUB);
}

async function startContentByPreference() {
  await refreshOfflineAvailability();
  initPreferredMode();
  await ensureOfflineReady({ silent: true, reason: 'startup' });
  await loadOffline();
}

function attachContentGuards() {
  contentView.webContents.setWindowOpenHandler(({ url }) => {
    log('content.windowOpen', { url });
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contentView.webContents.on('will-navigate', (event, url) => {
    try {
      const u = new URL(url);
      const allowedOrigin = new URL(remoteUrl).origin;
      const isAllowed = (u.origin === allowedOrigin) || (u.protocol === 'file:');
      if (!isAllowed) {
        event.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    } catch {}
  });

  contentView.webContents.on('did-fail-load', async (_e, code, desc, validatedURL, isMainFrame) => {
    log('content.did-fail-load', { code, desc, validatedURL, isMainFrame });
    if (!isMainFrame) return;

    await refreshOfflineAvailability();
    if (preferredMode === 'offline' && offlineAvailable) {
      await loadOffline();
    } else {
      broadcastStatus('Не удалось открыть онлайн. Проверь подключение или вручную переключись на офлайн.');
      await loadStub();
    }
  });

  contentView.webContents.on('did-finish-load', () => {
    log('content.did-finish-load', { url: contentView.webContents.getURL() });
    broadcastStatus('');
    if (pendingPayload) {
      const p = pendingPayload;
      pendingPayload = null;
      deliverToContent(p);
    }
  });

  if (LOGS_ENABLED) {
  contentView.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    log('content.console', { level, message, line, sourceId });
  });
}
}

// ---------- Import delivery ----------
function deliverToContent(payload) {
  if (!contentView) { pendingPayload = payload; return; }
  if (contentView.webContents.isLoading()) { pendingPayload = payload; return; }
  contentView.webContents.send('gcode:file', payload);
  log('deliverToContent.sent', { fileName: payload.fileName, textLength: payload.text?.length });
}

function handleIncomingGcode(fp) {
  if (!fp) return;
  const text0 = tryReadText(fp);
  if (!text0) return;
  const text = ensureModelCodeInText(text0);
  deliverToContent({ filePath: fp, fileName: path.basename(fp).replace(/\.pp$/i, ''), text });
}

// Renderer debug logs
ipcMain.on('debug:log', (_e, payload) => log('renderer.debug', payload));

// ---------- Offline builder ----------
async function copyDirRecursive(srcDir, dstDir) {
  await fsp.mkdir(dstDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(srcDir, e.name);
    const dst = path.join(dstDir, e.name);
    if (e.isDirectory()) {
      await copyDirRecursive(src, dst);
    } else if (e.isFile()) {
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(src, dst);
    }
  }
}

function resolvePackagedOfflineSeedSiteDir() {
  const relCandidates = [
    path.join('build', 'offline', 'site'),
    path.join('offline', 'site'),
  ];
  const roots = [];
  try { roots.push(__dirname); } catch {}
  try { if (process.resourcesPath) roots.push(process.resourcesPath); } catch {}
  try { if (process.resourcesPath) roots.push(path.join(process.resourcesPath, 'app')); } catch {}
  try { if (typeof app?.getAppPath === 'function') roots.push(app.getAppPath()); } catch {}
  try { if (process.execPath) roots.push(path.dirname(process.execPath)); } catch {}

  const uniq = Array.from(new Set(roots.filter(Boolean)));
  const rootCandidates = [];
  for (const r of uniq) {
    rootCandidates.push(r);
    rootCandidates.push(path.join(r, '..'));
  }

  for (const rel of relCandidates) {
    for (const root of rootCandidates) {
      const p = path.join(root, rel);
      try {
        if (fs.existsSync(path.join(p, 'index.html'))) return p;
      } catch {}
    }
  }
  return null;
}

async function seedOfflineFromPackagedAssets() {
  // Задача: если в сборке лежит готовая офлайн-копия (например build/offline/site),
  // копируем её в userData/offline/site, чтобы приложение стартовало офлайн сразу.
  try {
    await refreshOfflineAvailability();
    if (offlineAvailable) return false;

    const seedSiteDir = resolvePackagedOfflineSeedSiteDir();
    if (!seedSiteDir) return false;

    await fsp.mkdir(offlineRootPath, { recursive: true });
    await fsp.rm(offlineSiteDir, { recursive: true, force: true }).catch(() => {});
    await copyDirRecursive(seedSiteDir, offlineSiteDir);

    await refreshOfflineAvailability();
    if (offlineAvailable) {
      log('offline.seededFromResources', { seedSiteDir, offlineSiteDir });
      hydrateOfflineMetaFromDisk();
      return true;
    }
  } catch (e) {
    log('offline.seed.failed', { error: e?.message || String(e) });
  }
  return false;
}

async function buildOffline(options = {}) {
  const { silent = false, reason = 'manual', skipConfirm = false, reload = true } = options;
  await refreshOfflineAvailability();
  await fsp.mkdir(offlineRootPath, { recursive: true });

  const onProgress = (p) => {
    log('offline.progress', { ...p, reason });
    if (!silent) {
      broadcastToUi('offline:progress', p);
    }
    if (!silent) broadcastStatus(p.message || '');
  };

  onProgress({ message: 'Собираю офлайн версию…', step: 'start' });

  const { tmpDir, meta } = await buildOfflineSite({
    sourceUrl: remoteUrl,
    offlineRootDir: offlineRootPath,
    offlineTitle: 'Калькулятор 3D-печати (оффлайн)',
    onProgress
  });

  await atomicSwapDir(tmpDir, offlineSiteDir);
  offlineAvailable = true;
  rememberOfflineBuild(meta);

  if (reload) {
    if (!silent) broadcastStatus('Офлайн версия обновлена. Перезагружаю интерфейс…');
    await loadOffline();
  } else if (!silent) {
    broadcastStatus('Офлайн версия обновлена.');
  }

  onProgress({ message: 'Офлайн версия готова ✅', step: 'done', meta });
  return { summary: `скачано ${meta.downloadedCount} ресурсов`, meta };
}

// ---------- Window / Views ----------
function createWindow(startSilent) {
  toolbarHeight = TOOLBAR_BASE_HEIGHT;
  const winOpts = {
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: { contextIsolation: true }
  };

  if (WINDOW_ICON) winOpts.icon = WINDOW_ICON;

  win = new BrowserWindow(winOpts);

  toolbarView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'toolbarPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  contentView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'contentPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setBrowserView(toolbarView);
  win.addBrowserView(contentView);
  log('views.created', { toolbarId: toolbarView.webContents.id, contentId: contentView.webContents.id });

  toolbarView.webContents.loadFile(path.join(__dirname, 'toolbar.html'));
  attachContentGuards();

  win.on('resize', () => layoutViews(win));
  win.on('move', () => layoutViews(win));

  const startWindowFlow = async () => {
    layoutViews();
    win.maximize();
    if (startSilent && typeof win.showInactive === 'function') win.showInactive();
    else win.show();

    updateWindowTitle();

    try {
      await startContentByPreference();
      maybeCheckForUpdates().catch((err) => log('update.check.promise', { error: err?.message }));
    } catch (e) {
      log('startContent.failed', { error: e?.message });
      await refreshOfflineAvailability();
      if (offlineAvailable) await loadOffline();
      else await loadStub();
    }

    broadcastStatus('');
  };

  startWindowFlow().catch((e) => {
    log('window.start.failed', { error: e?.message });
  });

  win.on('closed', () => { win = null; });
  return win;
}

// ---------- IPC ----------
ipcMain.on('toolbar:setHeight', (_event, height) => { setToolbarHeightPx(height); });

ipcMain.handle('toolbar:getStatus', async () => {
  await refreshOfflineAvailability();
  initPreferredMode();
  return buildStatusPayload('');
});

ipcMain.handle('settings:getPaths', async () => getPathsPayload());

ipcMain.handle('settings:updatePaths', async (_event, payload = {}) => {
  try {
    if (Object.prototype.hasOwnProperty.call(payload, 'remoteSource')) {
      applyRemoteSourceOverride(payload.remoteSource || '', false);
      if (mode === 'online') {
        await loadOnline();
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'offlinePath')) {
      applyOfflineRootOverride(payload.offlinePath || '', false);
      await refreshOfflineAvailability();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'orcaPath')) {
      const raw = typeof payload.orcaPath === 'string' ? payload.orcaPath.trim() : '';
      if (raw) {
        setOrcaPathSetting(raw);
      } else {
        const s = loadSettings();
        delete s.orcaPath;
        saveSettings(s);
      }
    }
    broadcastStatus('Настройки путей обновлены');
    return { ok: true, paths: getPathsPayload() };
  } catch (e) {
    log('settings.updatePaths.error', { error: e?.message });
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('settings:pickFolder', async (event, initialPath) => {
  // Важно: привязываем нативный диалог к окну, которое его открыло (модалка параметров),
  // иначе Windows может оставить blur на активном инпуте и выделение становится "серым".
  const owner = BrowserWindow.fromWebContents(event.sender) || win || undefined;
  if (!owner) return null;

  const options = { properties: ['openDirectory'] };
  if (typeof initialPath === 'string' && initialPath.trim()) options.defaultPath = initialPath.trim();

  const res = await dialog.showOpenDialog(owner, options);

  // Возвращаем фокус обратно в то же окно (без refocusMainViews(), чтобы не ломать модалку).
  setTimeout(() => {
    try {
      if (owner.isDestroyed()) return;
      owner.focus();
      if (owner.webContents && !owner.webContents.isDestroyed()) owner.webContents.focus();
    } catch {}
  }, 0);

  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('app:copyExecutablePath', async () => {
  try {
    const exe = app.getPath('exe');
    if (exe) clipboard.writeText(exe);
    return { ok: true, path: exe };
  } catch (e) {
    log('app.copyPath.error', { error: e?.message });
    throw e;
  }
});

ipcMain.handle('app:copyOrcaCommand', async () => {
  try {
    const exe = app.getPath('exe');
    const command = exe ? `"${exe}" --pp --silent;` : '';
    if (command) clipboard.writeText(command);
    return { ok: true, command };
  } catch (e) {
    log('app.copyOrcaCmd.error', { error: e?.message });
    throw e;
  }
});

ipcMain.handle('offline:openFolder', async () => {
  await fsp.mkdir(offlineRootPath, { recursive: true });
  shell.openPath(offlineRootPath);
  return true;
});

ipcMain.handle('offline:build', async () => {
  try { return await buildOffline(); }
  catch (e) {
    const msg = 'Ошибка сборки офлайн: ' + (e?.message || e);
    broadcastStatus(msg);
    log('offline.build.failed', { error: e?.message || String(e) });
    throw e;
  }
});

ipcMain.handle('params:openWindow', async (event) => {
  log('params.openWindow', { senderId: event?.sender?.id });
  openParamsWindow();
  return true;
});

ipcMain.handle('sync:openWindow', async (event) => {
  log('sync.openWindow', { senderId: event?.sender?.id });
  openSyncWindow();
  return true;
});

ipcMain.handle('sync:loadInitial', async (_event, payload = {}) => {
  try {
    const requestedPath = resolveOrcaPath(payload.orcaPath);
    setOrcaPathSetting(requestedPath);
    const snapshot = await getCalcDataForSync();
    const orcaInfo = await scanOrcaProfiles(requestedPath);
    const preview = buildPreview(snapshot.data, orcaInfo);
    return {
      ok: true,
      calc: { exportPath: snapshot.source === 'store' ? CALC_STORE_PATH : snapshot.exportPath, exportedAt: snapshot.exportedAt || null },
      orca: { path: orcaInfo.basePath, exists: orcaInfo.exists, filamentCount: orcaInfo.filaments.length, machineCount: orcaInfo.machines.length },
      preview
    };
  } catch (e) {
    log('sync.load.error', { error: e?.message });
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('sync:apply', async (_event, payload = {}) => {
  try {
    const requestedPath = resolveOrcaPath(payload.orcaPath);
    setOrcaPathSetting(requestedPath);
    const snapshot = await getCalcDataForSync();
    const orcaInfo = await scanOrcaProfiles(requestedPath);
    const assignments = {
      materials: Array.isArray(payload.materials) ? payload.materials : [],
      printers: Array.isArray(payload.printers) ? payload.printers : []
    };
    const { updatedData, summary } = applyAssignments(snapshot.data, assignments, orcaInfo);
    await fsp.mkdir(SYNC_DIR, { recursive: true });
    const syncedPath = path.join(SYNC_DIR, 'calc_data_synced.json');
    const json = JSON.stringify(updatedData);
    await fsp.writeFile(syncedPath, json, 'utf-8');
    await writeCalcStoreRaw(json);
    await fsp.writeFile(path.join(SYNC_DIR, 'calc_data.json'), json, 'utf-8');
    await importCalcData(json, { skipResnapshot: true });
    log('sync.apply.success', { summary, syncedPath });
    return { ok: true, summary, syncedPath };
  } catch (e) {
    log('sync.apply.error', { error: e?.message });
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('sync:pickOrcaPath', async () => {
  const owner = syncWin || win;
  if (!owner) return null;
  const res = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] });
  refocusMainViews();
  if (res.canceled || !res.filePaths.length) return null;
  const selected = res.filePaths[0];
  setOrcaPathSetting(selected);
  return selected;
});

// ---------- Orca post-process launcher mode ----------
function maybeDetachLauncher() {
  const isPP = hasFlag(process.argv, '--pp');
  if (!isPP) return false;

  const silent = hasFlag(process.argv, '--silent');
  const fp = extractGcodePath(process.argv);
  log('launcher.mode', { isPP, silent, fp });

  const stashPath = fp ? (stashGcodeFile(fp) || fp) : null;
  const additionalData = { deliverPath: stashPath, fromPP: true, silent };

  const gotLock = app.requestSingleInstanceLock(additionalData);
  log('launcher.requestSingleInstanceLock', { gotLock, additionalData });

  if (!gotLock) { app.quit(); return true; }

  try { app.releaseSingleInstanceLock(); } catch {}

  const args = [];
  if (silent) args.push('--silent');
  if (stashPath) args.push(stashPath);

  log('launcher.spawnUI', { args });
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  log('launcher.spawnedUI', { childPid: child.pid });

  app.quit();
  return true;
}

// ---------- App lifecycle ----------
if (maybeDetachLauncher()) {
  // launcher exits
} else {
  const gotLock = app.requestSingleInstanceLock();
  log('ui.requestSingleInstanceLock', { gotLock });

  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
      log('ui.second-instance', { argv, workingDirectory, additionalData });

      const fp = additionalData && additionalData.deliverPath
        ? String(additionalData.deliverPath)
        : extractGcodePath(argv);

      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
      if (fp) handleIncomingGcode(fp);
    });

    app.whenReady().then(() => {
      const startSilent = hasFlag(process.argv, '--silent');
      createWindow(startSilent);

      if (!hasFlag(process.argv, '--pp')) {
        const fp = extractGcodePath(process.argv);
        if (fp) handleIncomingGcode(fp);
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(startSilent);
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
async function ensureOfflineReady(options = {}) {
  await refreshOfflineAvailability();
  if (offlineAvailable) return false;

  // 1) Пробуем поднять офлайн из ресурсов сборки (build/offline/site), если оно туда уложено.
  const seeded = await seedOfflineFromPackagedAssets();
  await refreshOfflineAvailability();
  if (offlineAvailable) return seeded;

  const { silent = false, reason = 'auto-init' } = options;
  await buildOffline({ silent, reason, skipConfirm: true, reload: false });
  await refreshOfflineAvailability();
  return true;
}
