import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics, type DriveInput } from '../src/physics';
import { SpatialHash, distance } from '../src/math';
import { Progression } from '../src/progression';
import { DESTINATIONS, findRoute, DEPOT, FUEL_STATION } from '../src/config';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), clear: () => store.clear() }, configurable: true });
beforeEach(() => store.clear());
const neutral: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
function step(v: VehiclePhysics, seconds: number, input: Partial<DriveInput> = {}, world = new SpatialHash()) {
  for (let i = 0; i < Math.round(seconds * 120); i++) v.step(1 / 120, { ...neutral, ...input }, world);
}

test('car accelerates progressively, shifts gears, and consumes fuel', () => {
  const v = new VehiclePhysics();
  step(v, 2, { throttle: 1 }); const early = v.speed;
  step(v, 6, { throttle: 1 });
  assert.ok(early > 5 && early < 10, `2-second speed ${early}`);
  assert.ok(v.speed > 22 && v.speed < 34, `8-second speed ${v.speed}`);
  assert.ok(v.gear >= 3); assert.ok(v.fuel < 100); assert.ok(v.z > -110);
  assert.ok(Number.isFinite(v.pitch) && Number.isFinite(v.roll));
});

test('braking decelerates substantially faster than coasting and can engage reverse', () => {
  const braking = new VehiclePhysics(), coasting = new VehiclePhysics();
  step(braking, 5, { throttle: 1 }); step(coasting, 5, { throttle: 1 });
  const start = braking.speed; step(braking, 1, { brake: 1 }); step(coasting, 1);
  assert.ok(braking.speed < start - 7); assert.ok(coasting.speed > braking.speed + 5);
  step(braking, 3, { brake: 1 }); assert.ok(braking.forwardSpeed < -1);
});

test('vehicle remains stationary without input; steering turns a moving vehicle', () => {
  const v = new VehiclePhysics(); step(v, 5, { steer: 1 });
  assert.ok(v.speed < 0.001); assert.ok(distance(v.x, v.z, -3.8, -205) < 0.001);
  step(v, 3, { throttle: 1 }); const z = v.z;
  step(v, 1, { throttle: 0.3, steer: 0.65 });
  assert.ok(v.x > -3); assert.ok(v.heading > 0.15); assert.ok(v.z > z); assert.ok(Math.abs(v.roll) > 0.005);
});

test('handbrake removes speed and reduces rear grip', () => {
  const normal = new VehiclePhysics(), handbrake = new VehiclePhysics();
  step(normal, 4, { throttle: 1 }); step(handbrake, 4, { throttle: 1 });
  step(normal, 0.8, { steer: 0.7 }); step(handbrake, 0.8, { steer: 0.7, handbrake: true });
  assert.ok(handbrake.speed < normal.speed - 1); assert.ok(handbrake.slip > normal.slip);
});

test('solid collision prevents penetration and damages a fast vehicle', () => {
  const v = new VehiclePhysics(), world = new SpatialHash();
  world.add({ x: -3.8, z: -155, halfX: 8, halfZ: 2, kind: 'barrier' });
  let impacts = 0; v.onImpact = () => impacts++;
  step(v, 6, { throttle: 1 }, world);
  assert.ok(v.z < -157, `car stopped before obstacle: ${v.z}`); assert.ok(v.health < 90); assert.ok(impacts > 0); assert.ok(Number.isFinite(v.vx));
});

test('no fuel and a disabled engine cannot accelerate; resetting preserves resources', () => {
  const v = new VehiclePhysics(); v.fuel = 0; step(v, 3, { throttle: 1 }); assert.ok(v.speed < 0.01);
  v.fuel = 20; v.health = 0; step(v, 3, { throttle: 1 }); assert.ok(v.speed < 0.01);
  v.reset(); assert.equal(v.health, 0); assert.equal(v.fuel, 20); assert.equal(v.speed, 0);
});

test('contracts produce money, bonuses, and repeatable progression', () => {
  const p = new Progression(new VehiclePhysics());
  assert.equal(p.startMission(0), true); assert.equal(p.startMission(1), false);
  p.update(30); const result = p.finish()!;
  assert.ok(result.total > DESTINATIONS[0].reward); assert.equal(p.money, 350 + result.total); assert.equal(p.completed, 1); assert.equal(p.mission, null);
  assert.equal(p.startMission(1), true); p.impact(15); assert.ok(p.mission!.cargo < 70);
  p.update(500); const damaged = p.finish()!; assert.equal(damaged.bonus, 0); assert.ok(damaged.total > 0);
});

test('services charge for the amount restored; rescue cannot soft-lock a broke player', () => {
  const v = new VehiclePhysics(), p = new Progression(v); v.fuel = 50; v.health = 60;
  assert.equal(p.refuel(), 90); assert.equal(v.fuel, 100); assert.equal(p.money, 260);
  assert.equal(p.repair(), 128); assert.equal(v.health, 100); assert.equal(p.money, 132);
  p.money = 0; v.fuel = 0; v.health = 0; assert.equal(p.rescue(), 0); assert.equal(v.fuel, 25); assert.equal(v.health, 45); assert.equal(v.z, -205);
});

test('progress persists active delivery, vehicle, money, and settings', () => {
  const v = new VehiclePhysics(), p = new Progression(v);
  p.startMission(3); p.update(42); p.money = 817; v.fuel = 67; v.health = 84; v.reset(120, 88, 1); p.settings.timeMode = 'night'; p.save();
  const restored = new Progression(new VehiclePhysics());
  assert.equal(restored.money, 817); assert.equal(restored.vehicle.x, 120); assert.equal(restored.vehicle.fuel, 67); assert.equal(restored.vehicle.health, 84); assert.equal(restored.mission!.index, 3); assert.equal(restored.mission!.elapsed, 42); assert.equal(restored.settings.timeMode, 'night');
});

test('route connects the depot, destinations, and services via axis-aligned streets', () => {
  for (const end of [...DESTINATIONS, FUEL_STATION]) {
    const route = findRoute(DEPOT, end); assert.deepEqual(route[0], DEPOT); assert.deepEqual(route.at(-1), end);
    for (let i = 2; i < route.length - 1; i++) assert.ok(route[i].x === route[i - 1].x || route[i].z === route[i - 1].z, `non-road route segment: ${JSON.stringify(route)}`);
  }
});
