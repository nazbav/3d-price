const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbarApi', {
  getStatus: () => ipcRenderer.invoke('toolbar:getStatus'),
  setToolbarHeight: (height) => ipcRenderer.send('toolbar:setHeight', height),
  updatePaths: (payload) => ipcRenderer.invoke('settings:updatePaths', payload),
  pickFolder: (initialPath) => ipcRenderer.invoke('settings:pickFolder', initialPath),
  openSync: () => ipcRenderer.invoke('sync:openWindow'),
  copyAppPath: () => ipcRenderer.invoke('app:copyExecutablePath'),
  copyOrcaCommand: () => ipcRenderer.invoke('app:copyOrcaCommand'),

  // Offline snapshot builder
  buildOffline: () => ipcRenderer.invoke('offline:build'),
  openOfflineFolder: () => ipcRenderer.invoke('offline:openFolder'),

  // Streams from main
  onProgress: (cb) => ipcRenderer.on('offline:progress', (_e, p) => cb(p)),
  onStatus: (cb) => ipcRenderer.on('toolbar:status', (_e, s) => cb(s))
});
