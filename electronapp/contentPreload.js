const { contextBridge, ipcRenderer } = require('electron');

let handler = null;
const pending = [];

ipcRenderer.on('gcode:file', (_e, payload) => {
  pending.push(payload);
  if (handler) {
    try { handler(payload); } catch (e) {}
  }
});

contextBridge.exposeInMainWorld('gcodeBridge', {
  onGcodeFile: (cb) => {
    handler = cb;
    while (pending.length) {
      const p = pending.shift();
      try { handler(p); } catch (e) {}
    }
  },
  debug: (msg, extra) => ipcRenderer.send('debug:log', { msg, extra }),
});

contextBridge.exposeInMainWorld('backupBridge', {
  getSettings: () => ipcRenderer.invoke('backups:getSettings'),
  updateSettings: (payload) => ipcRenderer.invoke('backups:updateSettings', payload || {}),
  pickDirectory: (initialPath) => ipcRenderer.invoke('backups:pickDir', initialPath || ''),
  runNow: (reason) => ipcRenderer.invoke('backups:runNow', { reason }),
  openFolder: () => ipcRenderer.invoke('backups:openFolder'),
  list: () => ipcRenderer.invoke('backups:list'),
  notify: (payload) => ipcRenderer.send('backups:notify', payload || {}),
  onStatus: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const listener = (_event, data) => {
      try { cb(data); } catch (e) {}
    };
    ipcRenderer.on('backups:status', listener);
    return () => ipcRenderer.removeListener('backups:status', listener);
  }
});

contextBridge.exposeInMainWorld('exportBridge', {
  saveHtml: (payload) => ipcRenderer.invoke('exports:saveHtml', payload || {})
});
