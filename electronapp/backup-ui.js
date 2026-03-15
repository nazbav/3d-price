module.exports = `
(() => {
  if (window.__electronBackupUiInjected) return;
  window.__electronBackupUiInjected = true;

  const STYLE_ID = 'electron-backup-style';
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      .backup-toast-container {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 11000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
      }
      .backup-toast {
        min-width: 260px;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        color: #fff;
        box-shadow: 0 0.75rem 2rem rgba(0,0,0,0.2);
        opacity: 0;
        transform: translateX(20px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .backup-toast.show {
        opacity: 1;
        transform: translateX(0);
      }
      .backup-toast.success { background: #198754; }
      .backup-toast.error { background: #dc3545; }
      .backup-toast.warning { background: #ffc107; color: #212529; }
    \`;
    document.head.appendChild(style);
  }

  function ensureToastContainer() {
    if (document.getElementById('backupToastContainer')) return;
    const div = document.createElement('div');
    div.id = 'backupToastContainer';
    div.className = 'backup-toast-container';
    document.body.appendChild(div);
  }

  function createBackupSection() {
    if (document.getElementById('electronBackupSettings')) return null;
    const host = document.getElementById('cloudSet');
    if (!host) return null;
    const block = document.createElement('div');
    block.id = 'electronBackupSettings';
    block.style.display = 'none';
    block.className = 'mt-4';
    block.innerHTML = \`
      <h3>Резервные копии (Electron)</h3>
      <div class="form-check form-switch mb-3">
        <input class="form-check-input" type="checkbox" id="electronBackupEnabled">
        <label class="form-check-label" for="electronBackupEnabled">Автобэкап при первом запуске за день</label>
      </div>
      <div class="row g-2 align-items-end">
        <div class="col-md-6">
          <label for="electronBackupFolder" class="form-label">Папка для копий</label>
          <div class="input-group">
            <input type="text" class="form-control" id="electronBackupFolder" readonly>
            <button class="btn btn-outline-secondary" type="button" id="electronBackupPickBtn">Выбрать</button>
          </div>
        </div>
        <div class="col-md-3">
          <label for="electronBackupRetention" class="form-label">Дней хранения</label>
          <input type="number" class="form-control" id="electronBackupRetention" min="1" max="365" step="1">
        </div>
        <div class="col-md-3">
          <label for="electronBackupMaxFiles" class="form-label">Макс. файлов</label>
          <input type="number" class="form-control" id="electronBackupMaxFiles" min="5" max="999" step="1">
        </div>
      </div>
      <div class="mt-3 d-flex flex-wrap gap-2">
        <button class="btn btn-outline-primary btn-sm" type="button" id="electronBackupRunBtn">Сделать копию сейчас</button>
        <button class="btn btn-outline-secondary btn-sm" type="button" id="electronBackupOpenBtn">Открыть папку</button>
      </div>
      <div class="small text-muted mt-2" id="electronBackupStatus"></div>
      <div class="small text-muted" id="electronVersionInfo"></div>
    \`;
    host.appendChild(block);
    return block;
  }

  let electronBackupStatusUnsub = null;

  function extractFileNameFromPath(p) {
    if (!p) return '';
    return String(p).split(/[/\\\\]+/).pop() || '';
  }

  function formatBackupStatusText(settings) {
    if (!settings) return 'Бэкапы ещё не выполнялись';
    if (settings.lastSuccessAt) {
      try {
        const dt = new Date(settings.lastSuccessAt);
        const name = extractFileNameFromPath(settings.lastFile) || 'файл';
        return \`Последний бэкап \${dt.toLocaleString('ru-RU')} (\${name})\`;
      } catch {}
    }
    return 'Бэкапы ещё не выполнялись';
  }

  function showBackupToast(payload) {
    if (!payload) return;
    const container = document.getElementById('backupToastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const type = payload.type || (payload.ok === false ? 'error' : 'success');
    toast.className = ['backup-toast', type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'success')].join(' ');
    let message = payload.message || '';
    if (!message) {
      if (type === 'error') {
        message = 'Ошибка бэкапа: ' + (payload.error || 'неизвестно');
      } else if (type === 'warning') {
        message = payload.warning || 'Бэкап пропущен';
      } else if (type === 'progress') {
        message = 'Создаём резервную копию...';
      } else {
        const fn = extractFileNameFromPath(payload.fileName || payload.filePath);
        message = fn ? \`Резервная копия сохранена: \${fn}\` : 'Резервная копия сохранена';
      }
    }
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  function initElectronBackupUi() {
    if (!window.backupBridge) return;
    const wrap = document.getElementById('electronBackupSettings');
    if (!wrap) return;
    wrap.style.display = '';
    const enabledEl = document.getElementById('electronBackupEnabled');
    const folderEl = document.getElementById('electronBackupFolder');
    const pickBtn = document.getElementById('electronBackupPickBtn');
    const retentionEl = document.getElementById('electronBackupRetention');
    const maxFilesEl = document.getElementById('electronBackupMaxFiles');
    const runBtn = document.getElementById('electronBackupRunBtn');
    const openBtn = document.getElementById('electronBackupOpenBtn');
    const statusEl = document.getElementById('electronBackupStatus');
    const versionEl = document.getElementById('electronVersionInfo');

    const applySettings = (payload) => {
      if (!payload) return;
      const settings = payload.settings || payload;
      const version = payload.version || payload.appVersion || null;
      enabledEl.checked = settings.enabled !== false;
      folderEl.value = settings.targetDir || '';
      retentionEl.value = settings.retentionDays || 30;
      maxFilesEl.value = settings.maxFiles || 60;
      statusEl.textContent = formatBackupStatusText(settings);
      if (versionEl) versionEl.textContent = version ? \`Версия приложения: v\${version}\` : '';
    };

    const refreshSettings = async () => {
      try {
        const data = await window.backupBridge.getSettings();
        applySettings(data);
      } catch (e) {
        console.warn('backup settings load failed', e);
      }
    };

    enabledEl.addEventListener('change', async () => {
      try { await window.backupBridge.updateSettings({ enabled: enabledEl.checked }); }
      catch (e) { console.warn('backup toggle failed', e); }
      refreshSettings();
    });

    retentionEl.addEventListener('change', async () => {
      const value = Math.max(1, parseInt(retentionEl.value || '1', 10));
      try { await window.backupBridge.updateSettings({ retentionDays: value }); }
      catch (e) { console.warn('retention update failed', e); }
      refreshSettings();
    });

    maxFilesEl.addEventListener('change', async () => {
      const value = Math.max(5, parseInt(maxFilesEl.value || '5', 10));
      try { await window.backupBridge.updateSettings({ maxFiles: value }); }
      catch (e) { console.warn('maxFiles update failed', e); }
      refreshSettings();
    });

    pickBtn.addEventListener('click', async () => {
      try {
        const picked = await window.backupBridge.pickDirectory(folderEl.value || '');
        if (picked) {
          await window.backupBridge.updateSettings({ targetDir: picked });
          refreshSettings();
        }
      } catch (e) {
        console.warn('backup folder pick failed', e);
      }
    });

    runBtn.addEventListener('click', async () => {
      if (runBtn.disabled) return;
      runBtn.disabled = true;
      const original = runBtn.textContent;
      runBtn.textContent = 'Создаём...';
      try {
        await window.backupBridge.runNow('manual');
      } catch (e) {
        showBackupToast({ type: 'error', error: e && e.message ? e.message : String(e) });
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = original;
        refreshSettings();
      }
    });

    openBtn.addEventListener('click', async () => {
      try {
        await window.backupBridge.openFolder();
      } catch (e) {
        showBackupToast({ type: 'error', error: e && e.message ? e.message : String(e) });
      }
    });

    if (typeof window.backupBridge.onStatus === 'function') {
      if (electronBackupStatusUnsub) electronBackupStatusUnsub();
      electronBackupStatusUnsub = window.backupBridge.onStatus((payload) => {
        if (payload && payload.settings) {
          applySettings(payload.settings);
        } else {
          refreshSettings();
        }
        showBackupToast(payload);
      });
    }

    refreshSettings();
  }

  function setup() {
    ensureStyles();
    ensureToastContainer();
    const block = createBackupSection();
    if (!block) return;
    if (typeof window.backupBridge === 'object') {
      initElectronBackupUi();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setTimeout(setup, 0);
  }
})();
`;
