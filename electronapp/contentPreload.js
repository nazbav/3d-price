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
