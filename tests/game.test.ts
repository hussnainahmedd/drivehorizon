import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Harborline } from '../src/game';
import { DEFAULT_SETTINGS, DEPOT, DESTINATIONS, FUEL_STATION, GARAGE, SPAWN } from '../src/config';
import { type GraphicsInfo } from '../src/graphics';
import { createDOM, FakeAudioContext } from './helpers/dom';
import { GameAudio } from '../src/audio';
import { VehiclePhysics } from '../src/physics';

function fixture() {
  const env = createDOM(); let renders = 0;
  env.dom.window.localStorage.setItem('harborline-save-v1', JSON.stringify({ version: 2, started: false, money: 350, vehicle: { ...SPAWN, fuel: 100, health: 100 }, settings: { ...DEFAULT_SETTINGS, quality: 'low' } }));
  const renderer = { setSize() {}, setPixelRatio() {}, render() { renders++; }, shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap } } as unknown as THREE.WebGLRenderer;
  const game = new Harborline(() => ({ renderer, info: { api: 'WebGL 2', gpu: 'Logic-test adapter', attempts: [] } as GraphicsInfo }));
  const click = (selector: string) => { const button = env.document.querySelector<HTMLButtonElement>(selector); assert.ok(button, selector); assert.equal(button.disabled, false, selector); button.click(); };
  const frames = (seconds: number, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) env.frame(1 / hz); };
  return { ...env, game, click, frames, renders: () => renders };
}

test('real keyboard input completes the first delivery through the game loop, traffic, HUD and receipt', async () => {
  const env = fixture();
  try {
    const { game, click } = env; click('[data-action="start"]'); await Promise.resolve();
    env.key('KeyE'); env.key('KeyE', false); assert.equal(game.screen, 'jobs');
    assert.equal(env.document.querySelectorAll('.contract').length, 6); click('[data-action="accept"][data-value="0"]');
    for (let frame = 0; frame < 5400; frame++) {
      const v = game.vehicle, remaining = DESTINATIONS[0].z - v.z;
      if (Math.abs(remaining) < 9 && v.speed < 1.4) break;
      let desired = Math.min(9, Math.sqrt(Math.max(0, remaining - 4) * 7));
      for (const car of game.traffic.cars) if (Math.abs(car.x - v.x) < 2.5 && car.z > v.z && car.z - v.z < 23) desired = Math.min(desired, Math.max(0, (car.z - v.z - 7) * 0.75));
      env.key('KeyW', v.speed < desired - 0.25 && remaining > 5); env.key('KeyS', v.speed > desired + 0.25 || remaining < 5);
      env.frame();
    }
    env.key('KeyW', false); env.key('KeyS', false);
    assert.ok(Math.abs(game.vehicle.z - DESTINATIONS[0].z) < 9, `arrival z=${game.vehicle.z}`); assert.ok(game.vehicle.speed < 1.5);
    env.key('KeyE'); env.key('KeyE', false); assert.equal(game.screen, 'result'); assert.equal(game.progress.completed, 1); assert.equal(game.progress.mission, null);
    assert.ok(game.progress.money > 490); assert.ok(game.progress.xp >= 90); assert.match(env.document.querySelector('.receipt')!.textContent!, /First good arrival/);
    assert.match(env.document.querySelector('.rank-summary')!.textContent!, /XP/); assert.ok(env.renders() > 10);
  } finally { env.close(); }
});

test('menus freeze physics, cargo, fuel and saved time; settings and frame limits are actually applied', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); env.game.progress.startMission(0);
    env.key('KeyW'); env.frames(1); env.key('Escape'); env.key('Escape', false);
    const { vehicle: v, progress: p } = env.game, before = [v.x, v.z, v.fuel, p.mission!.elapsed, p.worldHour], pausedSpeed = v.speed;
    env.frames(3); assert.deepEqual([v.x, v.z, v.fuel, p.mission!.elapsed, p.worldHour], before);
    env.click('[data-action="settings"]');
    const frameLimit = env.document.querySelector<HTMLSelectElement>('[data-setting="frameLimit"]')!;
    assert.equal(frameLimit.value, '60'); frameLimit.value = '30'; frameLimit.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }));
    const shake = env.document.querySelector<HTMLInputElement>('[data-setting="cameraShake"]')!; shake.checked = false; shake.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }));
    assert.equal(p.settings.frameLimit, 30); assert.equal(p.settings.cameraShake, false);
    const count = env.renders(); env.frames(2); assert.ok(env.renders() - count >= 59 && env.renders() - count <= 61);
    env.click('.primary-button[data-action="back"]'); env.key('Escape'); env.key('Escape', false); env.frames(1);
    assert.equal(env.game.screen, 'drive'); assert.ok(v.speed < pausedSpeed, 'vehicle coasts after menus clear held throttle'); assert.ok(v.throttle < 0.02); assert.ok(p.mission!.elapsed > before[3]);
    assert.ok(Math.abs(env.game.world.hour - p.worldHour) <= (1 / 30) * 24 / 1800 + 1e-8, 'rendered clock follows saved simulation time within one render interval');
  } finally { env.close(); }
});

test('workshop actions purchase repairs and upgrades only at the garage, with meaningful rank locks', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); const { game } = env;
    game.vehicle.reset(GARAGE.x, GARAGE.z); game.vehicle.health = 60; game.progress.money = 1000;
    env.key('KeyE'); env.key('KeyE', false); assert.equal(game.screen, 'garage');
    env.click('[data-action="repair"]'); assert.equal(game.vehicle.health, 100); assert.equal(game.progress.money, 872);
    env.click('[data-action="upgrade"][data-value="tires"]'); assert.equal(game.progress.upgrades.tires, 1); assert.equal(game.progress.money, 597);
    assert.equal(env.document.querySelector<HTMLButtonElement>('[data-action="upgrade"][data-value="tires"]')!.disabled, true);
    env.click('.primary-button[data-action="resume"]'); const balance = game.progress.money; game.ui.onAction('upgrade', 'engine'); assert.equal(game.progress.money, balance);
    game.vehicle.reset(FUEL_STATION.x, FUEL_STATION.z); game.vehicle.fuel = 0; game.progress.money = 9;
    env.key('KeyE'); env.key('KeyE', false); assert.equal(game.vehicle.fuel, 5); assert.equal(game.progress.money, 0); assert.match(env.document.querySelector('#toast')!.textContent!, /Partial/);
  } finally { env.close(); }
});

test('career journal, mission cancellation, GPS services and new-career confirmation are reachable', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); env.game.progress.startMission(1);
    env.key('Escape'); env.key('Escape', false); env.click('[data-action="career"]'); assert.equal(env.document.querySelectorAll('.milestone').length, 5);
    env.click('.primary-button[data-action="back"]'); assert.equal(env.game.screen, 'pause');
    env.click('[data-action="cancel-mission"]'); assert.equal(env.game.progress.mission, null);
    env.click('[data-action="map"]'); env.click('[data-action="waypoint"][data-value="fuel"]'); assert.equal(env.game.target, FUEL_STATION);
    env.key('Escape'); env.key('Escape', false); env.click('[data-action="menu"]');
    env.game.progress.money = 777; env.click('[data-action="new-game"]'); assert.equal(env.game.screen, 'new-career'); assert.equal(env.game.progress.money, 777);
    env.click('[data-action="back"]'); assert.equal(env.game.screen, 'menu'); assert.equal(env.game.progress.money, 777);
    env.click('[data-action="new-game"]'); env.click('[data-action="confirm-new-game"]'); assert.equal(env.game.screen, 'drive'); assert.equal(env.game.progress.money, 350); assert.equal(env.game.target, DEPOT);
  } finally { env.close(); }
});

test('context loss pauses and saves the journey, blocks resuming, and restoration returns to pause', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); env.key('KeyW'); env.frames(0.5);
    const canvas = env.document.querySelector('#game')!, event = new env.dom.window.Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event); assert.ok(event.defaultPrevented); assert.equal(env.game.screen, 'graphics');
    const before = [env.game.vehicle.z, env.game.vehicle.fuel, env.renders()]; env.game.ui.onAction('resume'); env.frames(2);
    assert.deepEqual([env.game.vehicle.z, env.game.vehicle.fuel, env.renders()], before);
    const saved = JSON.parse(env.dom.window.localStorage.getItem('harborline-save-v1')!); assert.equal(saved.vehicle.z, before[0]);
    canvas.dispatchEvent(new env.dom.window.Event('webglcontextrestored')); assert.equal(env.game.screen, 'pause'); env.frames(0.1); assert.ok(env.renders() > before[2]);
    env.click('[data-action="resume"]'); assert.equal(env.game.screen, 'drive');
  } finally { env.close(); }
});

test('roadside assistance at zero balance avoids traffic and preserves the active delivery with its time penalty', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); const { game } = env;
    game.progress.startMission(1); game.progress.update(12); game.progress.money = 0; game.vehicle.fuel = game.vehicle.health = 0;
    game.traffic.cars[0].x = SPAWN.x; game.traffic.cars[0].z = SPAWN.z;
    env.key('Escape'); env.key('Escape', false); env.click('[data-action="rescue"]');
    assert.equal(game.screen, 'drive'); assert.equal(game.progress.money, 0); assert.equal(game.vehicle.fuel, 25); assert.equal(game.vehicle.health, 45); assert.equal(game.progress.mission!.elapsed, 52);
    assert.ok(game.traffic.cars.every(car => Math.hypot(car.x - game.vehicle.x, car.z - game.vehicle.z) >= 8));
    assert.ok(Math.hypot(game.vehicle.x - DEPOT.x, game.vehicle.z - DEPOT.z) < 33);
    const saved = JSON.parse(env.dom.window.localStorage.getItem('harborline-save-v1')!); assert.equal(saved.vehicle.z, game.vehicle.z);
  } finally { env.close(); }
});

test('window focus loss clears held input, pauses, and reports session-only saving honestly', async () => {
  const env = fixture();
  try {
    env.click('[data-action="start"]'); await Promise.resolve(); env.key('KeyW'); env.frames(0.3);
    env.dom.window.dispatchEvent(new env.dom.window.Event('blur')); assert.equal(env.game.screen, 'pause');
    const z = env.game.vehicle.z; env.frames(1); assert.equal(env.game.vehicle.z, z);
    env.game.progress.saveAvailable = false; env.game.ui.show('pause', env.game.progress);
    assert.match(env.document.querySelector('.modal-copy')!.textContent!, /session-only/);
    assert.match(env.document.querySelector('.modal-footnote')!.textContent!, /UNAVAILABLE/);
  } finally { env.close(); }
});

test('procedural world creates real colliders and clear loading/service centers without a renderer', () => {
  const env = fixture();
  try {
    assert.ok(env.game.world.buildingFootprints.length > 100);
    for (const point of [DEPOT, ...DESTINATIONS, FUEL_STATION, GARAGE]) {
      const overlaps = [...env.game.world.colliders.query(point.x, point.z, 2)].filter(c => Math.abs(c.x - point.x) < c.halfX + 0.92 && Math.abs(c.z - point.z) < c.halfZ + 0.92);
      assert.equal(overlaps.length, 0, JSON.stringify(point));
    }
    let batches = 0; env.game.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) batches++; }); assert.ok(batches > 20);
    env.game.world.update(0, SPAWN, { ...DEFAULT_SETTINGS, timeMode: 'cycle' }, 11, 19.5); assert.equal(env.game.world.hour, 19.5);
    env.game.world.update(0, SPAWN, { ...DEFAULT_SETTINGS, timeMode: 'night' }, 20, 19.5); assert.equal(env.game.world.hour, 22); assert.ok(env.game.world.night > 0.9);
  } finally { env.close(); }
});

test('audio graph pauses engine/road sound while allowing receipts and service chimes', async () => {
  const env = createDOM();
  try {
    const audio = new GameAudio(); await Promise.all([audio.start(), audio.start()]); assert.equal(FakeAudioContext.instances.length, 1);
    const context = FakeAudioContext.instances[0], car = new VehiclePhysics(); audio.update(car, 0.35, false);
    assert.equal(context.gains[0].gain.value, 0.35); assert.equal(context.gains[1].gain.value, 1);
    audio.update(car, 0.35, true); assert.equal(context.gains[0].gain.value, 0.35); assert.equal(context.gains[1].gain.value, 0);
    const before = context.oscillators.length; audio.chime(true); assert.equal(context.oscillators.length - before, 3);
    audio.mute(); assert.equal(context.gains[0].gain.value, 0);
  } finally { env.close(); }
});

test('partial audio initialization failures cannot break driving and can recover on the next start', async () => {
  const env = createDOM();
  try {
    class BrokenAudioContext extends FakeAudioContext { createOscillator(): never { throw new Error('Audio device unavailable'); } }
    Object.defineProperty(globalThis, 'AudioContext', { value: BrokenAudioContext, configurable: true });
    const audio = new GameAudio(); await assert.rejects(audio.start(), /unavailable/);
    assert.doesNotThrow(() => { audio.update(new VehiclePhysics(), 0.35, false); audio.chime(); audio.horn(); audio.impact(10); });
    assert.equal(FakeAudioContext.instances[0].state, 'closed');
    Object.defineProperty(globalThis, 'AudioContext', { value: FakeAudioContext, configurable: true });
    await audio.start(); audio.update(new VehiclePhysics(), 0.35, false); assert.equal(FakeAudioContext.instances[1].gains[0].gain.value, 0.35);
  } finally { env.close(); }
});
