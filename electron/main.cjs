const { app, BrowserWindow, dialog, ipcMain, protocol, session } = require('electron');
const { readFile, access } = require('node:fs/promises');
const path = require('node:path');
const { GAME_URL, CSP, isGameURL, resolveGameAsset, trustedSender } = require('./assets.cjs');

app.setName('Harborline');
app.setAppUserModelId('com.harborline.coastalcourier');
protocol.registerSchemesAsPrivileged([{ scheme: 'harborline', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let window;
let closing = false;
let allowClose = false;
let closeTimeout;

function finishClose() {
  clearTimeout(closeTimeout); allowClose = true;
  if (window && !window.isDestroyed()) window.close();
}

function requestClose() {
  if (closing || !window || window.isDestroyed()) return;
  closing = true;
  // The isolated renderer synchronously saves localStorage before acknowledging.
  window.webContents.send('harborline:close-request');
  closeTimeout = setTimeout(finishClose, 1500);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 600,
    title: 'HARBORLINE — Coastal Courier', backgroundColor: '#132528', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isGameURL(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => { if (!allowClose) { event.preventDefault(); requestClose(); } });
  window.once('ready-to-show', () => window.show());
  window.webContents.on('render-process-gone', async (_event, details) => {
    if (closing) return;
    const { response } = await dialog.showMessageBox(window, { type: 'error', title: 'Harborline interrupted', message: 'The game process stopped.', detail: `${details.reason}. Your last autosave is retained.`, buttons: ['Reload game', 'Quit'] });
    if (response === 0) window.reload(); else requestClose();
  });
  window.loadURL(GAME_URL).catch(error => { dialog.showErrorBox('Harborline could not load', error.message); requestClose(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const root = path.join(app.getAppPath(), 'dist');
    try { await access(path.join(root, 'index.html')); }
    catch { dialog.showErrorBox('Game build missing', 'The compiled game is missing. For this development checkout, run npm run build before launching the desktop host.'); app.quit(); return; }
    protocol.handle('harborline', async request => {
      const asset = resolveGameAsset(root, request.url);
      if (!asset || request.method !== 'GET') return new Response('Not found', { status: 404 });
      try {
        const data = await readFile(asset.file);
        return new Response(data, { headers: { 'Content-Type': asset.type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    ipcMain.handle('harborline:fullscreen', event => {
      if (!trustedSender(event, window?.webContents)) return false;
      const fullscreen = !window.isFullScreen(); window.setFullScreen(fullscreen); return fullscreen;
    });
    ipcMain.handle('harborline:quit', event => { if (trustedSender(event, window?.webContents)) requestClose(); });
    ipcMain.on('harborline:close-ready', event => { if (closing && trustedSender(event, window?.webContents)) finishClose(); });
    createWindow();
  }).catch(error => { dialog.showErrorBox('Harborline could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
