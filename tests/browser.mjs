import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import { recordRenderingStatus, skipBlockedRendering } from './rendering-environment.mjs';

skipBlockedRendering('browser gameplay, screenshots and GPU context restoration');

// Use the actual graphics environment by default; software emulation is explicitly opt-in.
const useChromium = process.env.BROWSER === 'chromium';
const browser = useChromium
  ? await chromium.launch({ headless: process.env.HEADED !== '1', args: process.env.SOFTWARE_RENDERING === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] })
  : await firefox.launch({ headless: !process.env.DISPLAY, firefoxUserPrefs: { 'webgl.disabled': false } });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.__harborline.state());
const action = (name, value) => page.evaluate(([n, v]) => window.__harborline.action(n, v), [name, value]);
const screenshot = name => page.screenshot({ path: `test-results/${name}.png`, timeout: 60000 });

try {
  await page.goto(`${process.env.GAME_URL || 'http://127.0.0.1:5173'}/?debug=1`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => (window.__harborline && !document.querySelector('#loading')) || document.querySelector('.fatal-message'));
  if (await page.locator('.fatal-message').count()) {
    const title = await page.locator('.fatal-message h1').textContent();
    const detail = await page.locator('#error-detail').textContent();
    if (title === 'Graphics support is unavailable.') {
      recordRenderingStatus('environment-blocked', detail); console.log(`ENVIRONMENT-BLOCKED: ${detail}\nRendering did not run.`); await browser.close(); process.exit(0);
    }
    throw new Error(`Game initialization failed: ${detail}`);
  }
  await page.waitForTimeout(1500);
  assert.equal((await state()).screen, 'menu');
  await screenshot('01-title');
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => window.__harborline.state().screen === 'drive');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__harborline.state().screen === 'jobs');
  assert.equal(await page.locator('.contract').count(), 6);
  await screenshot('02-dispatch');
  await page.locator('[data-action="accept"][data-value="0"]').click();
  assert.equal((await state()).mission.index, 0);
  assert.equal((await state()).money, 350);

  // Complete the first delivery using genuine keyboard events, road physics and traffic.
  // No teleport or direct mission completion is used for this test.
  let throttle = false, brake = false, frames = 0;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const s = await state();
    const remaining = -61 - s.z;
    if (remaining < 8 && Math.abs(remaining) < 9 && s.speed < 1.4) break;
    let desired = Math.min(9, Math.sqrt(Math.max(0, remaining - 4) * 7));
    for (const car of s.traffic) {
      const gap = car.z - s.z;
      if (Math.abs(car.x - s.x) < 2.5 && gap > 0 && gap < 23) desired = Math.min(desired, Math.max(0, (gap - 7) * 0.75));
    }
    const nextThrottle = s.speed < desired - 0.25 && remaining > 5;
    const nextBrake = s.speed > desired + 0.25 || remaining < 5;
    if (nextThrottle !== throttle) { await page.keyboard[nextThrottle ? 'down' : 'up']('KeyW'); throttle = nextThrottle; }
    if (nextBrake !== brake) { await page.keyboard[nextBrake ? 'down' : 'up']('KeyS'); brake = nextBrake; }
    if (++frames === 30) await screenshot('03-on-the-road');
    await page.waitForTimeout(90);
  }
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyS');
  const arrived = await state();
  console.log('ARRIVAL', { x: arrived.x, z: arrived.z, speed: arrived.speed, health: arrived.health, fps: arrived.fps });
  assert.ok(Math.abs(arrived.z + 61) < 9, 'keyboard-driven vehicle reaches Sunday Coffee');
  assert.ok(arrived.speed < 1.5, 'vehicle is parked');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__harborline.state().screen === 'result');
  let s = await state();
  assert.equal(s.completed, 1); assert.ok(s.money > 490); assert.equal(s.mission, null);
  assert.ok((await page.locator('.reward-total').textContent()).includes('$'));
  await screenshot('04-delivery-complete');
  console.log('PASS: real keyboard driving → delivery → reward', s.money);

  await page.locator('[data-action="next-job"]').click();
  await page.keyboard.press('Escape');
  const paused = await state(); await page.waitForTimeout(800); const stillPaused = await state();
  assert.equal(stillPaused.screen, 'pause'); assert.equal(stillPaused.z, paused.z); assert.equal(stillPaused.fuel, paused.fuel);
  console.log('PASS: pause freezes simulation and fuel');
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="units"]').selectOption('mph');
  await page.locator('[data-setting="timeMode"]').selectOption('night');
  await page.locator('[data-setting="camera"]').selectOption('close');
  await page.locator('[data-setting="volume"]').focus();
  await page.keyboard.press('Home');
  await page.locator('.primary-button[data-action="back"]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  s = await state(); assert.equal(s.settings.units, 'mph'); assert.equal(s.hour, 22);
  await screenshot('05-after-dark');
  await page.keyboard.press('KeyC'); s = await state(); assert.equal(s.settings.camera, 'hood');
  await page.keyboard.press('KeyC'); assert.equal((await state()).settings.camera, 'chase');
  await page.keyboard.press('KeyH');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(500); await screenshot('06-city-map');
  assert.equal((await state()).screen, 'map');
  await page.locator('[data-action="waypoint"][data-value="fuel"]').click();
  assert.equal((await state()).target.x, 138);
  console.log('PASS: settings, day/night, camera, headlights, map and navigation');

  // Isolated service cases use the opt-in debug positioning harness.
  await page.evaluate(() => { window.__harborline.teleport(138, -37); window.__harborline.resources(50, 60, 1000); });
  await page.keyboard.press('KeyE');
  s = await state(); assert.ok(s.fuel > 99.9); assert.ok(s.money >= 908 && s.money <= 910);
  await page.evaluate(() => window.__harborline.teleport(-139, -39));
  await page.keyboard.press('KeyE'); assert.equal((await state()).screen, 'garage');
  await page.locator('[data-action="repair"]').click(); s = await state(); assert.equal(s.health, 100); assert.ok(s.money >= 780 && s.money <= 782);
  await page.locator('[data-action="upgrade"][data-value="tires"]').click(); s = await state(); assert.equal(s.upgrades.tires, 1); assert.ok(s.money >= 505 && s.money <= 507);
  await page.locator('.primary-button[data-action="resume"]').click();
  console.log('PASS: fuel, workshop repair, upgrade triggers and payments');

  // Drive at a known solid building: checks browser world colliders, not just unit-test fixtures.
  await page.evaluate(() => { window.__harborline.teleport(-3.8, -61, Math.PI / 2); window.__harborline.advance(4, { throttle: 1 }); });
  s = await state(); assert.ok(s.health < 100, 'building collision causes real vehicle damage');
  await page.keyboard.press('KeyR'); s = await state(); assert.ok(s.speed < 0.1); assert.ok(s.health < 100, 'reset does not repair damage');
  console.log('PASS: building collision, damage and road reset');

  await page.evaluate(() => { window.__harborline.resources(0, 0, 0); });
  await page.keyboard.press('Escape'); await page.locator('[data-action="rescue"]').click();
  s = await state(); assert.ok(s.fuel > 24.9); assert.equal(s.health, 45); assert.equal(s.money, 0); assert.ok(Math.abs(s.z + 205) < 33, 'tow placement remains near dispatch and avoids traffic');
  console.log('PASS: out-of-fuel / disabled vehicle recovery with no money');

  await page.keyboard.press('KeyE'); await page.locator('[data-action="accept"][data-value="1"]').click();
  await page.evaluate(() => window.__harborline.save());
  const saved = await state(); await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__harborline && !document.querySelector('#loading'));
  s = await state(); assert.equal(s.completed, 1); assert.equal(s.mission.index, 1); assert.equal(s.settings.units, 'mph'); assert.ok(Math.abs(s.fuel - saved.fuel) < 0.02); assert.equal(s.health, 45);
  await page.locator('[data-action="start"]').click();
  assert.equal((await state()).screen, 'drive');
  console.log('PASS: save/reload restores career, active contract, car and settings');

  await page.keyboard.press('Escape'); await page.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="timeMode"]').selectOption('day');
  await page.locator('[data-setting="units"]').selectOption('kmh');
  await page.locator('.primary-button[data-action="back"]').click(); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(500); await screenshot('07-compact-layout');
  assert.ok(await page.locator('#speed').isVisible());
  await page.evaluate(() => {
    const canvas = document.querySelector('#game'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is unavailable for the restoration check');
    extension.loseContext(); window.setTimeout(() => extension.restoreContext(), 900);
  });
  await page.waitForFunction(() => window.__harborline.state().screen === 'graphics');
  await page.waitForFunction(() => window.__harborline.state().screen === 'pause');
  await page.locator('[data-action="resume"]').click(); assert.equal((await state()).screen, 'drive');
  console.log('PASS: GPU context loss saves/pauses and restores the renderer');
  assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
  console.log('PASS: compact UI, no uncaught errors or render errors');
  console.log('ALL BROWSER CHECKS PASSED');
  recordRenderingStatus('passed', 'Real-browser driving, rendering and screenshots completed.');
} catch (error) { recordRenderingStatus('failed', error.message); throw error; }
finally { await browser.close(); }
