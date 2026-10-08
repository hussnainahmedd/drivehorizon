import { chromium } from 'playwright';
import { skipBlockedRendering } from './rendering-environment.mjs';

skipBlockedRendering('Chromium visual inspection');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.error('PAGE ERROR', e));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await page.goto('http://127.0.0.1:5173/?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('INITIAL', await page.evaluate(() => window.__driveHorizon?.state()));
await page.screenshot({ path: 'test-results/menu.png' });
console.log(await page.evaluate(() => window.__driveHorizon?.state()));
await page.locator('[data-action="start"]').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'test-results/driving.png' });
await page.keyboard.press('KeyE');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'test-results/dispatch.png' });
console.log(await page.evaluate(() => window.__driveHorizon?.state()));
await browser.close();
