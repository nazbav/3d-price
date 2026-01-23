const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbarApi', {
  // Status / layout
  getStatus: () => ipcRenderer.invoke('toolbar:getStatus'),
  setToolbarHeight: (height) => ipcRenderer.send('toolbar:setHeight', height),

  // Settings & paths
  updatePaths: (payload) => ipcRenderer.invoke('settings:updatePaths', payload),
  pickFolder: (initialPath) => ipcRenderer.invoke('settings:pickFolder', initialPath),

  // Windows
  openParams: () => ipcRenderer.invoke('params:openWindow'),
  openSync: () => ipcRenderer.invoke('sync:openWindow'),

  // Helpers
  copyAppPath: () => ipcRenderer.invoke('app:copyExecutablePath'),
  copyOrcaCommand: () => ipcRenderer.invoke('app:copyOrcaCommand'),

  // Offline snapshot builder
  buildOffline: () => ipcRenderer.invoke('offline:build'),
  openOfflineFolder: () => ipcRenderer.invoke('offline:openFolder'),
  openExportFolder: () => ipcRenderer.invoke('exports:openFolder'),

  // Proxy (settings + ops)
  getProxySettings: () => ipcRenderer.invoke('proxy:getSettings'),
  setProxySettings: (payload) => ipcRenderer.invoke('proxy:setSettings', payload),
  pingAllProxies: () => ipcRenderer.invoke('proxy:pingAll'),
  importProxyText: (text) => ipcRenderer.invoke('proxy:importText', String(text ?? '')),
  exportProxyText: () => ipcRenderer.invoke('proxy:exportText'),
  removeProxy: (raw) => ipcRenderer.invoke('proxy:remove', String(raw ?? '')),

  // Clipboard helpers (for proxy import/export)
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', String(text ?? '')),

  // Streams from main
  onProgress: (cb) => ipcRenderer.on('offline:progress', (_e, p) => cb(p)),
  onStatus: (cb) => ipcRenderer.on('toolbar:status', (_e, s) => cb(s)),
});
