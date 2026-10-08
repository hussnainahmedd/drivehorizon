const { contextBridge, ipcRenderer } = require('electron');

const closeListeners = new Set();
ipcRenderer.on('drivehorizon:close-request', () => {
  try { for (const callback of closeListeners) callback(); }
  finally { ipcRenderer.send('drivehorizon:close-ready'); }
});

contextBridge.exposeInMainWorld('driveHorizonDesktop', Object.freeze({
  platform: 'desktop',
  toggleFullscreen: () => ipcRenderer.invoke('drivehorizon:fullscreen'),
  quit: () => ipcRenderer.invoke('drivehorizon:quit'),
  onClose: callback => {
    if (typeof callback !== 'function') return () => {};
    closeListeners.add(callback);
    return () => closeListeners.delete(callback);
  },
}));
