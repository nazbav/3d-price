const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syncApi', {
  openWindow: () => ipcRenderer.invoke('sync:openWindow'),
  loadInitial: (options) => ipcRenderer.invoke('sync:loadInitial', options),
  applyChanges: (payload) => ipcRenderer.invoke('sync:apply', payload),
  pickOrcaPath: () => ipcRenderer.invoke('sync:pickOrcaPath'),
  rescan: (options) => ipcRenderer.invoke('sync:loadInitial', options)
});
