const assert = require('node:assert/strict');
const { GAME_URL, isGameURL } = require('./assets.cjs');

async function checkAssets(fetchAsset) {
  const response = await fetchAsset(GAME_URL);
  assert.equal(response.status, 200, 'Packaged entry page is available');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  const html = await response.text();
  assert.match(html, /DriveHorizon — 3D Driving Simulator/);
  assert.ok(!/https?:\/\//.test(html), 'No hosted entry-page dependencies');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map(match => new URL(match[1], GAME_URL).href);
  assert.ok(assets.length >= 4, 'Game, Three.js, stylesheet and icon are referenced');
  for (const url of new Set(assets)) {
    assert.ok(isGameURL(url), url);
    const asset = await fetchAsset(url);
    assert.equal(asset.status, 200, url);
    assert.ok((await asset.arrayBuffer()).byteLength > 0, url);
  }
}

module.exports = { checkAssets };
