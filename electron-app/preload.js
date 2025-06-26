const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: key => ipcRenderer.invoke('get-data', key),
  setData: (key, value) => ipcRenderer.invoke('set-data', key, value),
  removeData: key => ipcRenderer.invoke('remove-data', key),
  clearAll: () => ipcRenderer.invoke('clear-all'),
  getAll: () => ipcRenderer.invoke('get-all'),
  syncOrca: () => ipcRenderer.invoke('sync-orca')
});
