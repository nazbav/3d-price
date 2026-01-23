const { app, BrowserWindow, BrowserView, ipcMain, shell, dialog, clipboard, session, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const { URL, pathToFileURL, fileURLToPath } = require('node:url');

const { buildOfflineSite, DEFAULT_SOURCE_URL, atomicSwapDir } = require('./offlineBuilder');
const { scanOrcaProfiles, buildPreview, applyAssignments } = require('./orcaSync');
const backupUiScript = require('./backup-ui.js');

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
const STORAGE_HISTORY_KEY = `${STORAGE_KEY}_history`;
const BACKUP_FILE_PREFIX = 'gcodecalc_backup_';
const DEFAULT_BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const BACKUP_STATUS_CHANNEL = 'backups:status';

// Proxy settings
// settings.json: { proxy: { enabled, timeoutMs, rawList, proxies: [...] } }

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

const DEFAULT_EXPORT_ROOT = path.join(app.getPath('documents'), '3d-price');
let exportRootSetting = DEFAULT_EXPORT_ROOT;
let exportRootPath = DEFAULT_EXPORT_ROOT;
let exportAutoOpen = true;
const EXPORT_CLIENTS_DIR = 'clients';
const EXPORT_MATERIALS_DIR = 'materials';

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

const BACKUP_DEFAULTS = {
  enabled: true,
  targetDir: DEFAULT_BACKUP_DIR,
  retentionDays: 30,
  maxFiles: 80,
  lastSuccessAt: null,
  lastFile: null,
  lastReason: null,
  lastDailyRun: null
};

function clampInt(value, min, max, fallback) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function normalizeBackupSettings(rawSettings) {
  const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const normalized = {
    enabled: src.enabled !== false,
    targetDir: (typeof src.targetDir === 'string' && src.targetDir.trim()) ? src.targetDir.trim() : DEFAULT_BACKUP_DIR,
    retentionDays: clampInt(src.retentionDays, 1, 365, BACKUP_DEFAULTS.retentionDays),
    maxFiles: clampInt(src.maxFiles, 5, 1000, BACKUP_DEFAULTS.maxFiles),
    lastSuccessAt: src.lastSuccessAt || null,
    lastFile: src.lastFile || null,
    lastReason: src.lastReason || null,
    lastDailyRun: src.lastDailyRun || null
  };
  return normalized;
}

function getBackupSettings() {
  const settings = loadSettings();
  const normalized = normalizeBackupSettings(settings.backups);
  const current = settings.backups && typeof settings.backups === 'object' ? settings.backups : {};
  if (JSON.stringify(current) !== JSON.stringify(normalized)) {
    settings.backups = normalized;
    saveSettings(settings);
  }
  return normalized;
}

function updateBackupSettings(patch = {}) {
  const current = getBackupSettings();
  const merged = Object.assign({}, current, patch || {});
  const normalized = normalizeBackupSettings(merged);
  if (JSON.stringify(current) !== JSON.stringify(normalized)) {
    const settings = loadSettings();
    settings.backups = normalized;
    saveSettings(settings);
  }
  return normalized;
}

function sendBackupStatus(payload = {}) {
  try {
    const normalized = Object.assign({}, payload);
    if (!normalized.settings) normalized.settings = getBackupSettings();
    if (!normalized.version && typeof app?.getVersion === 'function') {
      normalized.version = app.getVersion();
    }
    if (contentView && contentView.webContents && !contentView.webContents.isDestroyed()) {
      contentView.webContents.send(BACKUP_STATUS_CHANNEL, normalized);
    }
  } catch (e) {
    log('backup.status.failed', { error: e?.message });
  }
}

async function ensureBackupDir(dirPath) {
  const dir = (typeof dirPath === 'string' && dirPath.trim()) ? dirPath.trim() : DEFAULT_BACKUP_DIR;
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function listBackupFiles(targetDir) {
  const dir = await ensureBackupDir(targetDir);
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      const full = path.join(dir, entry.name);
      try {
        const stat = await fsp.stat(full);
        files.push({ name: entry.name, path: full, size: stat.size, modified: stat.mtime.toISOString() });
      } catch {}
    }
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    return { ok: true, dir, files };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), dir };
  }
}

async function enforceBackupRetention(dir, settings) {
  const removed = [];
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const stats = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(BACKUP_FILE_PREFIX) || !entry.name.endsWith('.json')) continue;
      const full = path.join(dir, entry.name);
      try {
        const st = await fsp.stat(full);
        stats.push({ path: full, mtime: st.mtimeMs });
      } catch {}
    }
    stats.sort((a, b) => a.mtime - b.mtime);
    const expireBefore = settings.retentionDays > 0 ? Date.now() - (settings.retentionDays * 86400000) : null;
    const bucket = [];
    for (const item of stats) {
      if (expireBefore && item.mtime < expireBefore) {
        try { await fsp.unlink(item.path); removed.push(item.path); } catch {}
      } else {
        bucket.push(item);
      }
    }
    while (bucket.length > settings.maxFiles) {
      const oldest = bucket.shift();
      if (!oldest) break;
      try { await fsp.unlink(oldest.path); removed.push(oldest.path); } catch {}
    }
  } catch (e) {
    log('backup.retention.failed', { error: e?.message });
  }
  return { removed };
}

let backupQueue = Promise.resolve();
async function runBackupTask(reason = 'manual', options = {}) {
  const settings = getBackupSettings();
  if (!options.force && settings.enabled === false) {
    sendBackupStatus({ type: 'warning', reason, warning: 'Автобэкап отключён пользователем', settings });
    return { ok: false, skipped: 'disabled', settings };
  }
  if (options.skipIfNotNeeded) {
    const today = new Date().toISOString().slice(0, 10);
    if (settings.lastDailyRun === today) {
      return { ok: false, skipped: 'already-run', settings };
    }
  }
  if (!contentView || !contentView.webContents || contentView.webContents.isDestroyed()) {
    throw new Error('Интерфейс ещё не готов для резервной копии');
  }
  sendBackupStatus({ type: 'progress', reason });
  const snapshot = await exportCalcSnapshot();
  const dir = await ensureBackupDir(settings.targetDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${BACKUP_FILE_PREFIX}${stamp}.json`;
  const filePath = path.join(dir, fileName);
  await fsp.writeFile(filePath, snapshot.raw, 'utf-8');
  const retention = await enforceBackupRetention(dir, settings);
  const timestamp = new Date().toISOString();
  const patch = {
    targetDir: dir,
    lastSuccessAt: timestamp,
    lastFile: filePath,
    lastReason: reason
  };
  if (options.markDaily) {
    patch.lastDailyRun = timestamp.slice(0, 10);
  }
  const updatedSettings = updateBackupSettings(patch);
  const payload = {
    type: 'success',
    reason,
    filePath,
    fileName,
    timestamp,
    removed: retention.removed || [],
    settings: updatedSettings
  };
  sendBackupStatus(payload);
  return Object.assign({ ok: true }, payload);
}

function enqueueBackup(reason, options = {}) {
  const run = backupQueue.then(() => runBackupTask(reason, options));
  backupQueue = run.catch(() => {});
  return run;
}

async function maybeRunDailyBackup() {
  try {
    const settings = getBackupSettings();
    if (settings.enabled === false) return;
    const today = new Date().toISOString().slice(0, 10);
    if (settings.lastDailyRun === today) return;
    await enqueueBackup('daily', { markDaily: true });
  } catch (e) {
    log('backup.daily.error', { error: e?.message });
  }
}

let dailyBackupScheduled = false;
function scheduleDailyBackup() {
  if (dailyBackupScheduled) return;
  dailyBackupScheduled = true;
  setTimeout(async () => {
    try {
      await ensureContentReady();
      await waitForAppDataReady();
      await maybeRunDailyBackup();
    } catch (e) {
      log('backup.schedule.failed', { error: e?.message });
      dailyBackupScheduled = false;
    }
  }, 3000);
}

async function injectBackupUi() {
  if (!contentView || !contentView.webContents) return;
  try {
    await ensureContentReady();
    await waitForAppDataReady();
    await contentView.webContents.executeJavaScript(backupUiScript, true);
  } catch (e) {
    log('backupUi.inject.failed', { error: e?.message });
  }
}

// ---------- Proxy settings ----------
function getProxySettingsRaw() {
  const s = loadSettings();
  const p = (s && typeof s === 'object') ? (s.proxy || {}) : {};
  const enabled = (typeof p.enabled === 'boolean') ? p.enabled : false;
  const timeoutMs = (typeof p.timeoutMs === 'number' && isFinite(p.timeoutMs)) ? p.timeoutMs : 7000;
  const rawList = (typeof p.rawList === 'string') ? p.rawList : '';
  const proxies = Array.isArray(p.proxies) ? p.proxies : [];
  return { enabled, timeoutMs, rawList, proxies };
}

function setProxySettingsRaw({ enabled, timeoutMs, rawList } = {}) {
  const s = loadSettings();
  if (!s || typeof s !== 'object') return getProxySettingsRaw();
  const next = s.proxy && typeof s.proxy === 'object' ? s.proxy : {};
  if (typeof enabled === 'boolean') next.enabled = enabled;
  if (typeof timeoutMs === 'number' && isFinite(timeoutMs)) next.timeoutMs = Math.max(3000, Math.min(60000, Math.round(timeoutMs)));
  if (typeof rawList === 'string') next.rawList = rawList;
  next.proxies = normalizeProxyList(next.rawList);
  s.proxy = next;
  saveSettings(s);
  return getProxySettingsRaw();
}

function normalizeProxyList(rawList) {
  const lines = String(rawList || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const out = [];
  for (const line of lines) {
    const parsed = parseProxyLine(line);
    if (parsed) out.push(parsed);
  }

  // Дедуп по raw
  const seen = new Set();
  return out.filter((p) => {
    if (!p.raw) return false;
    const key = p.raw;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseProxyLine(line) {
  const s = String(line || '').trim();
  if (!s) return null;

  // Telegram format
  // https://t.me/socks?server=IP&port=80&user=USER&pass=PASS
  if (/^https?:\/\/t\.me\/socks\?/i.test(s)) {
    try {
      const u = new URL(s);
      const server = u.searchParams.get('server') || '';
      const port = Number(u.searchParams.get('port') || '0');
      const user = u.searchParams.get('user') || '';
      const pass = u.searchParams.get('pass') || '';
      if (!server || !port) return null;
      const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}` : '';
      const raw = `socks5://${auth ? auth + '@' : ''}${server}:${port}`;
      return { type: 'socks5', host: server, port, username: user || null, password: pass || null, raw, display: raw, bad: false, pingMs: null, lastError: '' };
    } catch {
      return null;
    }
  }

  // ip:port => socks5
  if (/^[^\s:]+:\d{2,5}$/.test(s) && !/^[a-z]+:\/\//i.test(s)) {
    const [host, portStr] = s.split(':');
    const port = Number(portStr);
    if (!host || !port) return null;
    const raw = `socks5://${host}:${port}`;
    return { type: 'socks5', host, port, username: null, password: null, raw, display: raw, bad: false, pingMs: null, lastError: '' };
  }

  // URL form
  if (/^[a-z]+:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const type = (u.protocol || '').replace(':', '').toLowerCase();
      if (type !== 'socks5' && type !== 'http') return null;
      const host = u.hostname;
      const port = Number(u.port || (type === 'http' ? 3128 : 1080));
      if (!host || !port) return null;
      const username = u.username ? decodeURIComponent(u.username) : null;
      const password = u.password ? decodeURIComponent(u.password) : null;
      const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@` : '';
      const raw = `${type}://${auth}${host}:${port}`;
      return { type, host, port, username, password, raw, display: raw, bad: false, pingMs: null, lastError: '' };
    } catch {
      return null;
    }
  }

  return null;
}

function updateProxyRuntimeState(mutator) {
  const s = loadSettings();
  const p = (s && typeof s === 'object') ? (s.proxy || {}) : {};
  const proxies = Array.isArray(p.proxies) ? p.proxies : [];
  const next = proxies.map((x) => ({ ...x }));
  mutator(next);
  p.proxies = next;
  s.proxy = p;
  saveSettings(s);
  return getProxySettingsRaw();
}

function isHttpLikeUrl(urlStr) {
  try {
    const u = new URL(String(urlStr || ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function requestProbe(urlStr, { timeoutMs = 7000, proxy = null, maxRedirects = 3 } = {}) {
  const doProbe = async (currentUrl, redirectsLeft) => {
    const uu = new URL(currentUrl);
    if (uu.protocol !== 'http:' && uu.protocol !== 'https:') throw new Error('Unsupported protocol');

    const isHttps = uu.protocol === 'https:';
    const port = Number(uu.port || (isHttps ? 443 : 80));
    const hostname = uu.hostname;

    const headers = {
      'User-Agent': 'NPrintCalc',
      'Accept': '*/*'
    };

    let createConnection = null;
    let hostForHttpModule = hostname;
    let portForHttpModule = port;
    let pathForRequest = uu.pathname + (uu.search || '');

    if (proxy) {
      if (proxy.type === 'http') {
        if (isHttps) {
          createConnection = async () => {
            const tunnel = await httpProxyConnectTunnel({ proxy, host: hostname, port, timeoutMs });
            return tls.connect({ socket: tunnel, servername: hostname, rejectUnauthorized: true });
          };
        } else {
          // Plain HTTP over HTTP proxy: absolute-form request
          hostForHttpModule = proxy.host;
          portForHttpModule = proxy.port;
          pathForRequest = currentUrl;
          headers['Host'] = hostname;
          const auth = proxyAuthHeader(proxy);
          if (auth) headers['Proxy-Authorization'] = auth;
        }
      } else if (proxy.type === 'socks5') {
        createConnection = async () => {
          const sock = await socks5Connect({ proxy, host: hostname, port, timeoutMs });
          if (isHttps) return tls.connect({ socket: sock, servername: hostname, rejectUnauthorized: true });
          return sock;
        };
      }
    }

    const mod = isHttps ? https : http;

    const started = Date.now();
    const res = await new Promise((resolve, reject) => {
      const opts = {
        method: 'HEAD',
        host: hostForHttpModule,
        port: portForHttpModule,
        path: pathForRequest,
        headers,
        agent: false
      };

      if (createConnection) {
        opts.createConnection = (o, cb) => {
          Promise.resolve()
            .then(createConnection)
            .then((sock) => cb(null, sock))
            .catch((e) => cb(e));
        };
      }

      const req = mod.request(opts, (r) => resolve(r));
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
      req.end();
    });

    const ttfbMs = Date.now() - started;
    const status = res.statusCode || 0;
    const loc = res.headers?.location || res.headers?.Location;

    // Drain & close quickly (we only need headers/status for probe).
    try { res.resume(); } catch {}

    if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
      const nextUrl = new URL(String(loc), uu).toString();
      return doProbe(nextUrl, redirectsLeft - 1);
    }

    return { status, headers: res.headers || {}, elapsedMs: ttfbMs };
  };

  return doProbe(urlStr, maxRedirects);
}

async function pingProxyTcp(proxy, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const sock = net.connect({ host: proxy.host, port: proxy.port });
    const done = (ok, err) => {
      try { sock.destroy(); } catch {}
      const ms = Date.now() - started;
      resolve({ ok, ms, error: err ? String(err.message || err) : '' });
    };
    sock.setTimeout(timeoutMs, () => done(false, new Error('timeout')));
    sock.once('error', (e) => done(false, e));
    sock.once('connect', () => done(true, null));
  });
}

async function pingProxyToTarget(proxy, targetUrl, timeoutMs) {
  // Пингуем ДО источника интерфейса по его протоколу (http/https) через прокси.
  // Любой HTTP-статус (в т.ч. 404) считаем признаком доступности, если дошли до ответа.
  try {
    const r = await requestProbe(targetUrl, { timeoutMs, proxy, maxRedirects: 3 });
    const status = r.status || 0;
    const ok = status > 0 && status !== 407; // 407 = прокси требует/не принял авторизацию
    return { ok, ms: r.elapsedMs, status };
  } catch (e) {
    return { ok: false, ms: null, status: 0, error: String(e?.message || e) };
  }
}

async function pingAllProxies() {
  const { proxies, timeoutMs } = getProxySettingsRaw();
  const results = [];

  const target = isHttpLikeUrl(remoteUrl) ? remoteUrl : null;

  for (const p of proxies) {
    if (target) {
      const r = await pingProxyToTarget(p, target, timeoutMs);
      results.push({ raw: p.raw, ok: r.ok, pingMs: r.ok ? r.ms : null, status: r.status, err: r.error || '' });
    } else {
      // Если источник не HTTP(S), прокси для него не используются — делаем базовый TCP-пинг до прокси.
      const r = await pingProxyTcp(p, Math.min(3000, timeoutMs));
      results.push({ raw: p.raw, ok: r.ok, pingMs: r.ok ? r.ms : null, status: 0, err: r.error || '' });
    }
  }

  return updateProxyRuntimeState((list) => {
    for (const p of list) {
      const r = results.find((x) => x.raw === p.raw);
      if (!r) continue;
      p.pingMs = r.pingMs;
      if (r.ok) {
        p.bad = false;
        // 404 и любые коды считаем ОК, но код оставляем как подсказку.
        p.lastError = r.status && r.status !== 200 ? `HTTP ${r.status}` : '';
      } else {
        p.bad = true;
        p.lastError = r.err || 'ping failed';
      }
    }
  });
}

function importProxyRawText(text) {
  const current = getProxySettingsRaw();
  const merged = [String(current.rawList || '').trim(), String(text || '').trim()]
    .filter(Boolean)
    .join('\n');
  return setProxySettingsRaw({ rawList: merged });
}

function removeProxyByRaw(raw) {
  const p = getProxySettingsRaw();
  const list = Array.isArray(p.proxies) ? p.proxies : [];
  const next = list.filter((x) => x.raw !== raw);
  const rawList = next.map((x) => x.raw).filter(Boolean).join('\n');
  return setProxySettingsRaw({ rawList });
}

async function applyElectronProxyFromSettings() {
  try {
    if (!app?.isReady?.() || !session?.defaultSession) return;
    const { enabled, proxies } = getProxySettingsRaw();
    const list = pickProxyRotationOrder(Array.isArray(proxies) ? proxies : []);
    if (!list.length) {
      await session.defaultSession.setProxy({ mode: 'direct' });
      return;
    }
    const chain = list.map((p) => {
      if (p.type === 'socks5') return `SOCKS5 ${p.host}:${p.port}`;
      return `PROXY ${p.host}:${p.port}`;
    });
    chain.push('DIRECT');
    const pac = `function FindProxyForURL(url, host) { return "${chain.join('; ')}"; }`;
    const pacUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(pac);
    await session.defaultSession.setProxy({ pacScript: pacUrl });
  } catch (e) {
    log('proxy.applySession.failed', { error: e?.message || String(e) });
  }
}

function pickProxyRotationOrder(proxies) {
  const good = proxies.filter((p) => !p.bad);
  const bad = proxies.filter((p) => !!p.bad);
  return [...good, ...bad];
}

function proxyAuthHeader(proxy) {
  if (!proxy?.username) return null;
  const token = Buffer.from(`${proxy.username}:${proxy.password || ''}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function socks5Connect({ proxy, host, port, timeoutMs }) {
  const socket = net.connect({ host: proxy.host, port: proxy.port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('timeout')));

  const readBytes = (n) => new Promise((resolve, reject) => {
    let bufs = [];
    let len = 0;
    const onData = (d) => {
      bufs.push(d);
      len += d.length;
      if (len >= n) {
        socket.off('data', onData);
        const all = Buffer.concat(bufs, len);
        const head = all.subarray(0, n);
        const tail = all.subarray(n);
        if (tail.length) socket.unshift(tail);
        resolve(head);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  const hasAuth = !!proxy.username;
  // greeting: VER, NMETHODS, METHODS...
  socket.write(Buffer.from([0x05, hasAuth ? 0x02 : 0x01, 0x00, ...(hasAuth ? [0x02] : [])]));
  const resp = await readBytes(2);
  if (resp[0] !== 0x05) throw new Error('SOCKS5: bad version');
  if (resp[1] === 0xFF) throw new Error('SOCKS5: no acceptable auth');

  if (resp[1] === 0x02) {
    const u = Buffer.from(String(proxy.username || ''), 'utf8');
    const p = Buffer.from(String(proxy.password || ''), 'utf8');
    if (u.length > 255 || p.length > 255) throw new Error('SOCKS5: credentials too long');
    socket.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
    const a = await readBytes(2);
    if (a[1] !== 0x00) throw new Error('SOCKS5: auth failed');
  }

  const hostBuf = Buffer.from(String(host), 'utf8');
  if (hostBuf.length > 255) throw new Error('SOCKS5: host too long');
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port, 0);
  // CONNECT
  socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]));

  const head = await readBytes(4);
  if (head[0] !== 0x05) throw new Error('SOCKS5: bad version');
  if (head[1] !== 0x00) throw new Error(`SOCKS5: connect failed (${head[1]})`);

  const atyp = head[3];
  if (atyp === 0x01) {
    await readBytes(4 + 2);
  } else if (atyp === 0x03) {
    const l = (await readBytes(1))[0];
    await readBytes(l + 2);
  } else if (atyp === 0x04) {
    await readBytes(16 + 2);
  }

  socket.setTimeout(0);
  return socket;
}

async function httpProxyConnectTunnel({ proxy, host, port, timeoutMs }) {
  const auth = proxyAuthHeader(proxy);
  const socket = net.connect({ host: proxy.host, port: proxy.port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('timeout')));
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const lines = [
    `CONNECT ${host}:${port} HTTP/1.1`,
    `Host: ${host}:${port}`,
    'Connection: close'
  ];
  if (auth) lines.push(`Proxy-Authorization: ${auth}`);
  const req = lines.join('\r\n') + '\r\n\r\n';
  socket.write(req);

  const data = await new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.includes(Buffer.from('\r\n\r\n'))) {
        socket.off('data', onData);
        resolve(buf);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
  const head = data.toString('latin1');
  const statusLine = head.split('\r\n')[0] || '';
  const m = statusLine.match(/\s(\d{3})\s/);
  const code = m ? Number(m[1]) : 0;
  if (code !== 200) throw new Error(`HTTP proxy CONNECT failed (${code || 'unknown'})`);

  socket.setTimeout(0);
  return socket;
}

async function requestBuffer(urlStr, { timeoutMs = 7000, proxy = null, maxRedirects = 5 } = {}) {
  const u = new URL(urlStr);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Unsupported protocol');

  const doRequest = async (currentUrl, redirectsLeft) => {
    const uu = new URL(currentUrl);
    const isHttps = uu.protocol === 'https:';
    const port = Number(uu.port || (isHttps ? 443 : 80));
    const hostname = uu.hostname;

    const headers = {
      'User-Agent': 'NPrintCalc',
      'Accept': '*/*'
    };

    let createConnection = null;
    let hostForHttpModule = hostname;
    let portForHttpModule = port;
    let pathForRequest = uu.pathname + (uu.search || '');

    if (proxy) {
      if (proxy.type === 'http') {
        if (isHttps) {
          createConnection = async () => {
            const tunnel = await httpProxyConnectTunnel({ proxy, host: hostname, port, timeoutMs });
            return tls.connect({ socket: tunnel, servername: hostname, rejectUnauthorized: true });
          };
        } else {
          // Plain HTTP over HTTP proxy: absolute-form request
          hostForHttpModule = proxy.host;
          portForHttpModule = proxy.port;
          pathForRequest = currentUrl;
          headers['Host'] = hostname;
          const auth = proxyAuthHeader(proxy);
          if (auth) headers['Proxy-Authorization'] = auth;
        }
      } else if (proxy.type === 'socks5') {
        createConnection = async () => {
          const sock = await socks5Connect({ proxy, host: hostname, port, timeoutMs });
          if (isHttps) return tls.connect({ socket: sock, servername: hostname, rejectUnauthorized: true });
          return sock;
        };
      }
    }

    const mod = isHttps ? https : http;
    const started = Date.now();

    const res = await new Promise((resolve, reject) => {
      const opts = {
        method: 'GET',
        host: hostForHttpModule,
        port: portForHttpModule,
        path: pathForRequest,
        headers,
        agent: false
      };

      if (createConnection) {
        opts.createConnection = (o, cb) => {
          Promise.resolve()
            .then(createConnection)
            .then((sock) => cb(null, sock))
            .catch((e) => cb(e));
        };
      }

      const req = mod.request(opts, (r) => resolve(r));
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
      req.end();
    });

    const status = res.statusCode || 0;
    const loc = res.headers?.location || res.headers?.Location;
    if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
      res.resume();
      const nextUrl = new URL(String(loc), uu).toString();
      return doRequest(nextUrl, redirectsLeft - 1);
    }

    const chunks = [];
    const buf = await new Promise((resolve, reject) => {
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: res.headers || {},
      buf,
      elapsedMs: Date.now() - started
    };
  };

  return doRequest(urlStr, maxRedirects);
}

async function requestBufferWithProxyFailover(urlStr, { timeoutMs } = {}) {
  const { timeoutMs: configuredTimeoutMs, proxies } = getProxySettingsRaw();
  const perAttempt = (typeof timeoutMs === 'number' && isFinite(timeoutMs)) ? timeoutMs : configuredTimeoutMs;
  const list = Array.isArray(proxies) ? proxies : [];
  if (!list.length) {
    return requestBuffer(urlStr, { timeoutMs: perAttempt, proxy: null });
  }

  let lastErr = null;
  const order = pickProxyRotationOrder(list);
  for (const p of order) {
    try {
      const r = await requestBuffer(urlStr, { timeoutMs: perAttempt, proxy: p });
      if (r.ok) {
        // Прокси реабилитируем
        updateProxyRuntimeState((items) => {
          const it = items.find((x) => x.raw === p.raw);
          if (it) { it.bad = false; it.lastError = ''; }
        });
        return r;
      }
      lastErr = new Error(`HTTP ${r.status}`);
      updateProxyRuntimeState((items) => {
        const it = items.find((x) => x.raw === p.raw);
        if (it) { it.bad = true; it.lastError = `HTTP ${r.status}`; }
      });
    } catch (e) {
      lastErr = e;
      updateProxyRuntimeState((items) => {
        const it = items.find((x) => x.raw === p.raw);
        if (it) { it.bad = true; it.lastError = String(e?.message || e); }
      });
    }
  }

  throw lastErr || new Error('proxy failover: all failed');
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

function applyExportRootOverride(raw, skipSave = false) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const target = trimmed || DEFAULT_EXPORT_ROOT;
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (e) {
    throw new Error('Не удалось создать/использовать папку экспорта: ' + (e?.message || e));
  }
  exportRootPath = target;
  exportRootSetting = target;
  if (!skipSave) {
    const s = loadSettings();
    if (trimmed) s.exportRoot = target;
    else delete s.exportRoot;
    saveSettings(s);
  }
  return exportRootPath;
}

function applyExportAutoOpenOverride(raw, skipSave = false) {
  const next = raw !== false;
  exportAutoOpen = !!next;
  if (!skipSave) {
    const s = loadSettings();
    s.exportAutoOpen = exportAutoOpen;
    saveSettings(s);
  }
  return exportAutoOpen;
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
    if (settings && typeof settings.exportRoot === 'string' && settings.exportRoot.trim()) {
      try { applyExportRootOverride(settings.exportRoot, true); }
      catch { applyExportRootOverride(DEFAULT_EXPORT_ROOT, true); }
    } else {
      applyExportRootOverride(DEFAULT_EXPORT_ROOT, true);
    }
    if (typeof settings.exportAutoOpen === 'boolean') {
      exportAutoOpen = settings.exportAutoOpen;
    } else {
      exportAutoOpen = true;
    }
  } catch {
    applyRemoteSourceOverride(DEFAULT_REMOTE_SOURCE, true);
    applyOfflineRootOverride(DEFAULT_OFFLINE_ROOT, true);
    applyExportRootOverride(DEFAULT_EXPORT_ROOT, true);
    exportAutoOpen = true;
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

const RESERVED_WINDOWS_NAMES = new Set([
  'CON','PRN','AUX','NUL',
  'COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9',
  'LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9'
]);

function sanitizePathSegment(value, fallback = 'item') {
  let str = String(value ?? '').trim();
  if (!str) return fallback;
  str = str.replace(/[\\/:*?"<>|]/g, '_');
  str = str.replace(/[\x00-\x1F]/g, '_');
  str = str.replace(/\s+/g, ' ');
  str = str.replace(/[. ]+$/g, '');
  if (!str) return fallback;
  if (str.length > 80) str = str.slice(0, 80);
  const upper = str.toUpperCase();
  if (RESERVED_WINDOWS_NAMES.has(upper)) str = '_' + str;
  return str;
}

function ensureUniqueFilePath(dir, baseName, ext) {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  let candidate = path.join(dir, `${baseName}${safeExt}`);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i < 1000; i++) {
    candidate = path.join(dir, `${baseName}_${i}${safeExt}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${baseName}_${Date.now()}${safeExt}`);
}

async function ensureExportRootReady() {
  try {
    fs.mkdirSync(exportRootPath, { recursive: true });
  } catch (e) {
    throw new Error('Не удалось создать папку экспорта: ' + (e?.message || e));
  }
  return exportRootPath;
}

async function saveHtmlExport(payload = {}) {
  const kind = typeof payload.kind === 'string' ? payload.kind : '';
  const html = typeof payload.html === 'string' ? payload.html : '';
  if (!html) throw new Error('Пустой документ');

  const root = await ensureExportRootReady();
  let targetPath = '';

  if (kind === 'material-label') {
    const matName = sanitizePathSegment(payload.materialName, 'material');
    const matId = sanitizePathSegment(payload.materialId, 'id');
    const dir = path.join(root, EXPORT_MATERIALS_DIR);
    await fsp.mkdir(dir, { recursive: true });
    targetPath = path.join(dir, `${matName}_${matId}.html`);
  } else if (kind === 'estimate' || kind === 'model-label') {
    const clientId = sanitizePathSegment(payload.clientId, '0');
    const clientName = sanitizePathSegment(payload.clientName, 'client');
    const orderId = sanitizePathSegment(payload.orderId, '0');
    const orderName = sanitizePathSegment(payload.orderName, 'order');
    const clientDir = path.join(root, EXPORT_CLIENTS_DIR, `${clientId}_${clientName}`);
    const orderDir = path.join(clientDir, `${orderId}_${orderName}`);
    await fsp.mkdir(orderDir, { recursive: true });

    if (kind === 'estimate') {
      targetPath = path.join(orderDir, 'estimate.html');
    } else {
      const modelName = sanitizePathSegment(payload.modelName, 'model');
      targetPath = ensureUniqueFilePath(orderDir, modelName, '.html');
    }
  } else {
    throw new Error('Неизвестный тип экспорта');
  }

  await fsp.writeFile(targetPath, html, 'utf-8');

  let opened = false;
  if (exportAutoOpen) {
    try {
      await shell.openPath(targetPath);
      opened = true;
    } catch (e) {
      log('export.open.failed', { error: e?.message, targetPath });
    }
  }

  return { path: targetPath, opened };
}

function getPathsPayload() {
  return {
    remoteUrl,
    remoteSource: remoteSourceSetting,
    offlinePath: offlineRootPath,
    orcaPath: getOrcaPathSetting() || ORCA_DEFAULT_PATH,
    exportPath: exportRootPath,
    exportAutoOpen
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
      const r = await requestBufferWithProxyFailover(remoteUrl, { timeoutMs: 10000 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return crypto.createHash('sha1').update(r.buf).digest('hex');
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
function isGcodePath(p) { return /\.(gcode|gco|bgcode)(\.pp)?$/i.test(String(p || '')); }

function extractGcodePath(argv) {
  const args = getArgs(argv);
  const execPath = process.execPath ? path.resolve(process.execPath).toLowerCase() : '';
  let lastCandidate = null;

  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (!a) continue;
    if (a.startsWith('--')) continue;

    // не импортируем сами себя
    try {
      if (execPath && path.resolve(a).toLowerCase() === execPath) continue;
    } catch {}

    const low = String(a).toLowerCase();
    // не пытаемся импортировать exe
    if (low.endsWith('.exe') && !isGcodePath(a)) continue;

    if (isGcodePath(a)) {
      lastCandidate = a;
      try { if (fs.existsSync(a)) return a; } catch {}
      continue;
    }

    // Orca print-temp (может быть файл ИЛИ папка, и может появиться чуть позже)
    if (low.includes('.orcaslicer.upload.')) {
      lastCandidate = a;
      try { if (fs.existsSync(a)) return a; } catch {}
      continue;
    }

    // любой существующий путь (файл/папка) как fallback
    try {
      if (fs.existsSync(a)) { lastCandidate = a; return a; }
    } catch {}

    // как минимум помним последнюю "похожую на путь" строку
    if (a.includes('\\') || a.includes('/') || /^[a-zA-Z]:\\/.test(a)) lastCandidate = a;
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

    // stash only files
    const st = fs.statSync(srcPath);
    if (!st.isFile()) return null;

    let base = path.basename(srcPath)
      .replace(/[\s<>:"/\\|?*]+/g, '_')
      .replace(/\.pp$/i, '');

    // Orca "На печать" может отдавать файл без расширения (.OrcaSlicer.upload.*)
    // UI импортирует по расширению, поэтому форсим .gcode
    if (!/\.(gcode|gco|bgcode)$/i.test(base)) base = (base || 'import') + '.gcode';

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
    appVersion: (typeof app?.getVersion === 'function') ? app.getVersion() : null,
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
        const historyKey = ${JSON.stringify(STORAGE_HISTORY_KEY)};
        const readHistory = () => {
          try {
            const rawHistory = localStorage.getItem(historyKey);
            if (!rawHistory) return [];
            const parsedHistory = JSON.parse(rawHistory);
            if (Array.isArray(parsedHistory)) return parsedHistory;
            if (parsedHistory && Array.isArray(parsedHistory.calcHistory)) return parsedHistory.calcHistory;
          } catch {}
          return [];
        };
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored && stored.length > 2) {
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed.calcHistory) || parsed.calcHistory.length === 0) {
              parsed.calcHistory = readHistory();
            }
            return { raw: JSON.stringify(parsed), source: 'storage' };
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

        if (typeof saveToLocalStorage === 'function') {
          try { saveToLocalStorage(); } catch {}
        } else {
          try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
        }

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
    width: 980,
    height: 820,
    minWidth: 780,
    minHeight: 720,
    resizable: true,
    minimizable: false,
    maximizable: true,
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
    onProgress,
    fetchBufferImpl: async (urlStr, timeoutMs) => {
      try {
        const r = await requestBufferWithProxyFailover(urlStr, { timeoutMs });
        return { ok: r.ok, status: r.status, headers: r.headers, buf: r.buf };
      } catch (e) {
        return { ok: false, status: 0, headers: {}, buf: Buffer.from(''), error: String(e?.message || e) };
      }
    }
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

  try {
    const wa = screen && screen.getPrimaryDisplay ? screen.getPrimaryDisplay().workAreaSize : null;
    if (wa && wa.width && wa.height) {
      winOpts.width = Math.max(900, Math.round(wa.width * 0.7));
      winOpts.height = Math.max(650, Math.round(wa.height * 0.7));
      winOpts.center = true;
    }
  } catch {}

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
  contentView.webContents.on('did-finish-load', () => {
    injectBackupUi().catch((e) => log('backupUi.inject.error', { error: e?.message }));
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
    // win.maximize();
    if (startSilent && typeof win.showInactive === 'function') win.showInactive();
    else win.show();

    updateWindowTitle();

    try {
      await startContentByPreference();
      await injectBackupUi();
      maybeCheckForUpdates().catch((err) => log('update.check.promise', { error: err?.message }));
    } catch (e) {
      log('startContent.failed', { error: e?.message });
      await refreshOfflineAvailability();
      if (offlineAvailable) await loadOffline();
      else await loadStub();
      await injectBackupUi();
    }

    broadcastStatus('');
    scheduleDailyBackup();
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
    if (Object.prototype.hasOwnProperty.call(payload, 'exportPath')) {
      applyExportRootOverride(payload.exportPath || '', false);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'exportAutoOpen')) {
      applyExportAutoOpenOverride(payload.exportAutoOpen, false);
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

ipcMain.handle('backups:getSettings', async () => ({
  settings: getBackupSettings(),
  version: (typeof app?.getVersion === 'function') ? app.getVersion() : null
}));

ipcMain.handle('backups:updateSettings', async (_event, payload = {}) => {
  try {
    const settings = updateBackupSettings(payload || {});
    sendBackupStatus({ type: 'settings', settings });
    return {
      ok: true,
      settings,
      version: (typeof app?.getVersion === 'function') ? app.getVersion() : null
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('backups:pickDir', async (event, initialPath) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || win || undefined;
  if (!owner) return null;
  const options = { properties: ['openDirectory'] };
  if (typeof initialPath === 'string' && initialPath.trim()) options.defaultPath = initialPath.trim();
  const res = await dialog.showOpenDialog(owner, options);
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('backups:runNow', async (_event, payload = {}) => {
  try {
    const result = await enqueueBackup(payload.reason || 'manual', { force: true });
    return result;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('backups:openFolder', async () => {
  try {
    const settings = getBackupSettings();
    const dir = await ensureBackupDir(settings.targetDir);
    await shell.openPath(dir);
    return { ok: true, dir };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('backups:list', async () => {
  try {
    const settings = getBackupSettings();
    return await listBackupFiles(settings.targetDir);
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.on('backups:notify', (_event, payload = {}) => {
  if (!payload || typeof payload !== 'object') return;
  if (payload.type === 'migrationComplete') {
    enqueueBackup('post-migration', {});
  }
});

ipcMain.handle('offline:openFolder', async () => {
  await fsp.mkdir(offlineRootPath, { recursive: true });
  shell.openPath(offlineRootPath);
  return true;
});

ipcMain.handle('exports:openFolder', async () => {
  await ensureExportRootReady();
  shell.openPath(exportRootPath);
  return true;
});

ipcMain.handle('exports:saveHtml', async (_event, payload = {}) => {
  try {
    const result = await saveHtmlExport(payload);
    return { ok: true, path: result.path, opened: result.opened };
  } catch (e) {
    log('export.save.failed', { error: e?.message });
    return { ok: false, error: e?.message || String(e) };
  }
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

ipcMain.handle('proxy:getSettings', async () => {
  const p = getProxySettingsRaw();
  return { enabled: p.enabled, timeoutMs: p.timeoutMs, rawList: p.rawList, proxies: p.proxies };
});

ipcMain.handle('proxy:setSettings', async (_event, payload = {}) => {
  // payload может содержать только часть полей.
  const current = getProxySettingsRaw();
  const enabled = (typeof payload.enabled === 'boolean') ? payload.enabled : current.enabled;
  const timeoutMs = (payload.timeoutMs != null) ? Number(payload.timeoutMs) : current.timeoutMs;
  const rawList = (typeof payload.rawList === 'string') ? payload.rawList : undefined;
  const updated = setProxySettingsRaw({ enabled, timeoutMs, rawList });
  await applyElectronProxyFromSettings();
  return { enabled: updated.enabled, timeoutMs: updated.timeoutMs, rawList: updated.rawList, proxies: updated.proxies };
});

ipcMain.handle('proxy:importText', async (_event, text) => {
  const updated = importProxyRawText(String(text ?? ''));
  await applyElectronProxyFromSettings();
  return { enabled: updated.enabled, timeoutMs: updated.timeoutMs, rawList: updated.rawList, proxies: updated.proxies };
});

ipcMain.handle('proxy:exportText', async () => {
  const { enabled, proxies } = getProxySettingsRaw();
  return (Array.isArray(proxies) ? proxies : []).map((p) => p.raw).filter(Boolean).join('\n');
});

ipcMain.handle('proxy:remove', async (_event, raw) => {
  const updated = removeProxyByRaw(String(raw ?? ''));
  await applyElectronProxyFromSettings();
  return { enabled: updated.enabled, timeoutMs: updated.timeoutMs, rawList: updated.rawList, proxies: updated.proxies };
});

ipcMain.handle('proxy:pingAll', async () => {
  const updated = await pingAllProxies();
  return { enabled: updated.enabled, timeoutMs: updated.timeoutMs, rawList: updated.rawList, proxies: updated.proxies };
});

ipcMain.handle('clipboard:readText', async () => {
  try { return clipboard.readText() || ''; } catch { return ''; }
});

ipcMain.handle('clipboard:writeText', async (_event, text) => {
  try { clipboard.writeText(String(text ?? '')); return true; } catch { return false; }
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
async function waitForStableFile(fp, opts = {}) {
  const timeoutMs = Math.max(1000, Math.min(60000, Number(opts.timeoutMs ?? 12000)));
  const pollMs = Math.max(50, Math.min(1000, Number(opts.pollMs ?? 150)));
  const stableMs = Math.max(100, Math.min(2000, Number(opts.stableMs ?? 400)));

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (!fs.existsSync(fp)) { await sleep(pollMs); continue; }
      const s1 = fs.statSync(fp);
      if (!s1.isFile()) return false;
      const size1 = s1.size || 0;
      await sleep(stableMs);
      if (!fs.existsSync(fp)) { await sleep(pollMs); continue; }
      const s2 = fs.statSync(fp);
      if (!s2.isFile()) return false;
      const size2 = s2.size || 0;
      if (size1 > 0 && size1 === size2) return true;
    } catch {}
    await sleep(pollMs);
  }
  return false;
}

async function findNewestFileInDir(dir, exts, opts = {}) {
  const timeoutMs = Math.max(1000, Math.min(60000, Number(opts.timeoutMs ?? 12000)));
  const pollMs = Math.max(50, Math.min(1000, Number(opts.pollMs ?? 200)));
  const depthMax = Math.max(1, Math.min(8, Number(opts.depthMax ?? 4)));

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (!fs.existsSync(dir)) { await sleep(pollMs); continue; }
      const st = fs.statSync(dir);
      if (!st.isDirectory()) return null;

      const candidates = [];
      const q = [{ d: dir, depth: 0 }];

      while (q.length) {
        const { d, depth } = q.shift();
        let entries = [];
        try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }

        for (const e of entries) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) {
            if (depth < depthMax) q.push({ d: p, depth: depth + 1 });
            continue;
          }
          if (!e.isFile()) continue;

          const low = e.name.toLowerCase();
          const ok = exts.some((x) => low.endsWith(x));
          if (!ok) continue;

          try {
            const stf = await fsp.stat(p);
            candidates.push({ p, m: stf.mtimeMs || 0, s: stf.size || 0 });
          } catch {}
        }
      }

      candidates.sort((a, b) => (b.m - a.m) || (b.s - a.s));
      if (candidates.length) return candidates[0].p;
    } catch {}
    await sleep(pollMs);
  }
  return null;
}

async function resolveIncomingForPP(fpHint) {
  if (!fpHint) return null;
  const p = String(fpHint);

  const start = Date.now();
  const timeoutMs = 12000;
  const pollMs = 150;

  while (Date.now() - start < timeoutMs) {
    try {
      if (!fs.existsSync(p)) { await sleep(pollMs); continue; }
      const st = fs.statSync(p);

      if (st.isFile()) {
        const ok = await waitForStableFile(p, { timeoutMs: timeoutMs - (Date.now() - start) });
        return ok ? p : p;
      }

      if (st.isDirectory()) {
        const candidate = await findNewestFileInDir(
          p,
          ['.gcode', '.gco', '.bgcode', '.gcode.pp', '.gco.pp', '.bgcode.pp'],
          { timeoutMs: timeoutMs - (Date.now() - start) }
        );
        if (candidate) {
          const ok = await waitForStableFile(candidate, { timeoutMs: timeoutMs - (Date.now() - start) });
          return ok ? candidate : candidate;
        }
      }
    } catch {}
    await sleep(pollMs);
  }

  return null;
}

function maybeDetachLauncher() {
  const isPP = hasFlag(process.argv, '--pp');
  if (!isPP) return false;

  const silent = hasFlag(process.argv, '--silent');
  const fpHint = extractGcodePath(process.argv);
  log('launcher.mode', { isPP, silent, fp: fpHint });

  app.whenReady().then(async () => {
    let resolved = null;
    try { resolved = await resolveIncomingForPP(fpHint); } catch {}
    const srcForStash = resolved || fpHint;

    let stashPath = null;
    if (srcForStash) {
      stashPath = stashGcodeFile(srcForStash) || null;
      if (!stashPath && isGcodePath(srcForStash)) stashPath = srcForStash;
    }

    const additionalData = { deliverPath: stashPath, fromPP: true, silent };
    const gotLock = app.requestSingleInstanceLock(additionalData);
    log('launcher.requestSingleInstanceLock', { gotLock, additionalData });

    if (!gotLock) {
      app.quit();
      return;
    }

    try { app.releaseSingleInstanceLock(); } catch {}

    const args = [];
    if (silent) args.push('--silent');
    if (stashPath) args.push(stashPath);

    log('launcher.spawnUI', { args });
    try {
      const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
      child.unref();
      log('launcher.spawnedUI', { childPid: child.pid });
    } catch (e) {
      log('launcher.spawn.failed', { error: e?.message });
    }

    app.quit();
  }).catch((e) => {
    log('launcher.whenReady.failed', { error: e?.message });
    app.quit();
  });

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

    app.whenReady().then(async () => {
      const startSilent = hasFlag(process.argv, '--silent');
      // Прокси должны примениться до загрузки любого контента.
      await applyElectronProxyFromSettings();
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
