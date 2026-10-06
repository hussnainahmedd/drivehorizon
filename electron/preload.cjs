const { contextBridge, ipcRenderer } = require('electron');

const closeListeners = new Set();
ipcRenderer.on('harborline:close-request', () => {
  try { for (const callback of closeListeners) callback(); }
  finally { ipcRenderer.send('harborline:close-ready'); }
});

contextBridge.exposeInMainWorld('harborlineDesktop', Object.freeze({
  platform: 'desktop',
  toggleFullscreen: () => ipcRenderer.invoke('harborline:fullscreen'),
  quit: () => ipcRenderer.invoke('harborline:quit'),
  onClose: callback => {
    if (typeof callback !== 'function') return () => {};
    closeListeners.add(callback);
    return () => closeListeners.delete(callback);
  },
}));
