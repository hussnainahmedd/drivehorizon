const path = require('node:path');

const GAME_URL = 'drivehorizon://app/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function isGameURL(value) {
  try { const url = new URL(value); return url.protocol === 'drivehorizon:' && url.hostname === 'app' && !url.port && !url.username && !url.password; }
  catch { return false; }
}

function resolveGameAsset(root, value) {
  if (!isGameURL(value)) return null;
  const url = new URL(value);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return null;
  if (pathname !== '/index.html' && pathname !== '/favicon.svg' && !pathname.startsWith('/assets/')) return null;
  const type = MIME[path.extname(pathname)];
  if (!type) return null;
  const file = path.resolve(root, '.' + pathname), relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return { file, type };
}

function trustedSender(event, contents) {
  return !!contents && event.sender === contents && event.senderFrame === contents.mainFrame && isGameURL(event.senderFrame?.url);
}

module.exports = { GAME_URL, CSP, isGameURL, resolveGameAsset, trustedSender };
