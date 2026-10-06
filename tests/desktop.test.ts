import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { Script } from 'node:vm';

const require = createRequire(import.meta.url);
const { GAME_URL, CSP, isGameURL, resolveGameAsset, trustedSender } = require('../electron/assets.cjs');

test('desktop host resolves compiled assets locally without a localhost server', () => {
  const root = path.resolve('dist');
  assert.equal(GAME_URL, 'harborline://app/index.html'); assert.ok(isGameURL(GAME_URL));
  assert.deepEqual(resolveGameAsset(root, GAME_URL), { file: path.join(root, 'index.html'), type: 'text/html' });
  assert.deepEqual(resolveGameAsset(root, 'harborline://app/assets/game.js'), { file: path.join(root, 'assets/game.js'), type: 'text/javascript' });
  assert.equal(resolveGameAsset(root, 'harborline://app/favicon.svg').type, 'image/svg+xml');
});

test('desktop protocol rejects remote content, traversal, unexpected files and malformed URLs', () => {
  const root = path.resolve('dist');
  for (const url of ['https://example.com/index.html', 'http://localhost:5173/', 'harborline://other/index.html', 'harborline://app/assets/%2e%2e%2f%2e%2e%2fsecret.js', 'harborline://app/assets/%5csecret.js', 'harborline://app/package.json', 'harborline://app/assets/secret.cjs', 'harborline://app/assets/%00.js', 'harborline://user@app/index.html', 'not a URL']) assert.equal(resolveGameAsset(root, url), null, url);
  assert.match(CSP, /script-src 'self'/); assert.ok(!CSP.includes('unsafe-eval'));
});

test('desktop controls only trust the local main frame of the game window', () => {
  const mainFrame = { url: GAME_URL }, contents = { mainFrame };
  assert.ok(trustedSender({ sender: contents, senderFrame: mainFrame }, contents));
  assert.equal(trustedSender({ sender: {}, senderFrame: mainFrame }, contents), false);
  assert.equal(trustedSender({ sender: contents, senderFrame: { url: GAME_URL } }, contents), false);
  mainFrame.url = 'https://example.com'; assert.equal(trustedSender({ sender: contents, senderFrame: mainFrame }, contents), false);
});

test('desktop main-process wiring loads local production files, isolates the renderer and waits for save-on-close', async () => {
  const handlers = new Map<string, (event: unknown) => unknown>(), ipc = new EventEmitter();
  const protocols = new Map<string, (request: { url: string; method: string }) => Promise<Response>>();
  const permissions: unknown[] = [];
  let created!: (window: FakeWindow) => void;
  const ready = new Promise<FakeWindow>(resolve => { created = resolve; });
  class FakeContents extends EventEmitter {
    mainFrame = { url: '' }; messages: string[] = []; popup?: () => { action: string };
    setWindowOpenHandler(handler: () => { action: string }) { this.popup = handler; }
    send(channel: string) { this.messages.push(channel); }
  }
  class FakeWindow extends EventEmitter {
    webContents = new FakeContents(); closed = false; fullscreen = false; menu: unknown;
    constructor(readonly options: { webPreferences: Record<string, unknown> }) { super(); created(this); }
    setMenu(menu: unknown) { this.menu = menu; }
    loadURL(url: string) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
    isDestroyed() { return this.closed; }
    isMinimized() { return false; }
    restore() {} focus() {} show() {} reload() {}
    isFullScreen() { return this.fullscreen; }
    setFullScreen(value: boolean) { this.fullscreen = value; }
    close() { let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.closed = true; }
  }
  const app = Object.assign(new EventEmitter(), { setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getAppPath: () => path.resolve('.'), quit() {} });
  const electron = {
    app, BrowserWindow: FakeWindow, dialog: { showErrorBox: (_title: string, message: string) => { throw new Error(message); } },
    ipcMain: Object.assign(ipc, { handle: (channel: string, callback: (event: unknown) => unknown) => handlers.set(channel, callback) }),
    protocol: { registerSchemesAsPrivileged() {}, handle: (scheme: string, handler: (request: { url: string; method: string }) => Promise<Response>) => protocols.set(scheme, handler) },
    session: { defaultSession: { setPermissionRequestHandler: (handler: unknown) => permissions.push(handler), setPermissionCheckHandler: (handler: unknown) => permissions.push(handler) } },
  };
  const source = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  new Script(source).runInNewContext({ require: (name: string) => name === 'electron' ? electron : name === './assets.cjs' ? require('../electron/assets.cjs') : require(name), __dirname: path.resolve('electron'), setTimeout, clearTimeout, Response, URL, console });
  const window = await ready, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  try {
    assert.equal(window.webContents.mainFrame.url, GAME_URL); assert.equal(window.menu, null);
    assert.equal(window.options.webPreferences.nodeIntegration, false); assert.equal(window.options.webPreferences.contextIsolation, true); assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.webContents.popup!().action, 'deny'); assert.equal(permissions.length, 2);
    const response = await protocols.get('harborline')!({ url: GAME_URL, method: 'GET' });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy')!, /script-src 'self'/); assert.match(await response.text(), /HARBORLINE/);
    assert.equal((await protocols.get('harborline')!({ url: 'https://example.com', method: 'GET' })).status, 404);
    assert.equal(handlers.get('harborline:fullscreen')!(event), true); assert.equal(window.fullscreen, true);
    handlers.get('harborline:quit')!(event); assert.equal(window.closed, false); assert.deepEqual(window.webContents.messages, ['harborline:close-request']);
    ipc.emit('harborline:close-ready', { sender: {}, senderFrame: {} }); assert.equal(window.closed, false);
    ipc.emit('harborline:close-ready', event); assert.equal(window.closed, true);
  } finally { handlers.get('harborline:quit')!(event); ipc.emit('harborline:close-ready', event); }
});

test('isolated preload exposes narrow desktop controls and acknowledges close after save callbacks', async () => {
  const ipc = Object.assign(new EventEmitter(), { invoke: (_channel: string) => Promise.resolve(true), send: (channel: string) => sent.push(channel) });
  const sent: string[] = [];
  let exposed!: { platform: string; onClose: (callback: () => void) => () => void; quit: () => Promise<void> };
  const source = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  new Script(source).runInNewContext({ require: () => ({ ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (name: string, bridge: typeof exposed) => { assert.equal(name, 'harborlineDesktop'); exposed = bridge; } } }) });
  assert.equal(exposed.platform, 'desktop'); assert.ok(!('ipcRenderer' in exposed)); assert.ok(!('require' in exposed));
  let saved = 0; const unsubscribe = exposed.onClose(() => saved++);
  ipc.emit('harborline:close-request'); assert.equal(saved, 1); assert.deepEqual(sent, ['harborline:close-ready']);
  unsubscribe(); ipc.emit('harborline:close-request'); assert.equal(saved, 1); assert.equal(sent.length, 2);
  await exposed.quit();
});
