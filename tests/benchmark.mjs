import { chromium, firefox } from 'playwright';
import { skipBlockedRendering } from './rendering-environment.mjs';

skipBlockedRendering('GPU rendering and frame-rate benchmark');

const mode = process.argv[2] || 'gl';
const browser = mode === 'firefox' ? await firefox.launch({ headless: false, firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'gfx.webrender.all': true } }) : await chromium.launch({ headless: mode !== 'headed', args: ['--no-sandbox', '--use-gl=angle', `--use-angle=${mode === 'swiftshader' ? 'swiftshader' : 'gl'}`, '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  if (process.argv[3] === 'low') await page.addInitScript(() => localStorage.setItem('harborline-save-v1', JSON.stringify({ version: 1, money: 350, completed: 0, earnings: 0, distance: 0, mission: null, vehicle: { x: -3.8, z: -205, heading: 0, fuel: 100, health: 100 }, settings: { quality: 'low', volume: 0, units: 'kmh', timeMode: 'cycle', camera: 'chase', sensitivity: 1, showRoute: true } })));
  page.on('pageerror', e => console.error(e));
  page.on('console', m => { if (m.type() === 'error') console.log(m.text()); });
  await page.goto('http://127.0.0.1:5173/?debug=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__harborline, null, { timeout: 120000 });
  console.log('GPU', await page.evaluate(() => { const canvas = document.querySelector('#game'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); }));
  await page.waitForTimeout(12000);
  console.log('BENCHMARK', mode, await page.evaluate(() => { const s = window.__harborline.state(); return { fps: s.fps, drawCalls: s.drawCalls, triangles: s.triangles }; }));
} finally { await browser.close(); }
