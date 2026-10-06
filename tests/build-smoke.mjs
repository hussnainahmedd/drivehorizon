import assert from 'node:assert/strict';
import { preview } from 'vite';

// A real production HTTP smoke check. No browser or graphics context is created.
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
try {
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(base); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /HARBORLINE/); assert.match(html, /id="game"/);
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 3, 'compiled JavaScript, Three.js and CSS use portable relative paths');
  for (const asset of new Set(assets)) {
    const result = await fetch(new URL(asset, base + '/')); assert.equal(result.status, 200, asset); assert.ok(Buffer.byteLength(await result.text()) > 0, asset);
    assert.match(result.headers.get('content-type'), asset.endsWith('.css') ? /css/ : /javascript/);
  }
  assert.equal((await fetch(`${base}/favicon.svg`)).status, 200);
  assert.ok(!/https?:\/\//.test(html), 'entry page has no external runtime dependencies');
  console.log(`PASS: production entry, ${new Set(assets).size} compiled assets, portable paths and local icon (no browser/WebGL).`);
} finally { await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); }
