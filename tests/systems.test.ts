import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FixedStepper, RenderCadence } from '../src/timing';
import { signalState, signalSpeedLimit, followingSpeedLimit } from '../src/signals';
import { Traffic } from '../src/traffic';
import { DEFAULT_SETTINGS, DEPOT, DESTINATIONS, FUEL_STATION, GARAGE, findRoute, roadInfo } from '../src/config';
import { navigationGuidance, mapProjection, routeLength } from '../src/navigation';
import { cameraClearFraction } from '../src/camera';
import { roadResetPosition } from '../src/recovery';
import { VehiclePhysics } from '../src/physics';
import { SpatialHash, distance } from '../src/math';
import { MaterialQuality } from '../src/render-quality';

test('fixed-step simulation has identical outcomes across 30, 60 and 144 Hz display rates', () => {
  const outcomes = [30, 60, 144].map(rate => {
    const stepper = new FixedStepper(), v = new VehiclePhysics(), world = new SpatialHash(); let steps = 0;
    for (let frame = 0; frame < rate * 4; frame++) steps += stepper.advance(1 / rate, dt => v.step(dt, { throttle: 1, steer: 0, brake: 0, handbrake: false }, world));
    assert.equal(steps, 480); return [v.x, v.z, v.speed, v.fuel];
  });
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});

test('long stalls have bounded catch-up; pausing removes accumulated input time', () => {
  const clock = new FixedStepper(); let count = 0;
  assert.equal(clock.advance(30, () => count++), 30); assert.equal(count, 30);
  clock.advance(0.004, () => count++); clock.reset(); assert.equal(clock.advance(0.004, () => count++), 0);
  assert.equal(clock.advance(NaN, () => count++), 0);
});

test('render limits skip rendering without changing the fixed-step clock', () => {
  for (const limit of [30, 60, 120, 0]) {
    const cadence = new RenderCadence(); let rendered = 0;
    for (let i = 0; i < 1440; i++) if (cadence.due(i / 144, limit)) rendered++;
    assert.ok(Math.abs(rendered - (limit || 144) * 10) <= 1, `${limit} limit: ${rendered}`);
    cadence.reset(); assert.ok(cadence.due(100, limit));
  }
});

test('signals have matched amber and all-red phases and never give conflicting greens', () => {
  for (let t = 0; t < 56; t += 0.1) assert.ok(!(signalState(t, true) === 'green' && signalState(t, false) === 'green'));
  assert.equal(signalState(11, true), 'amber'); assert.equal(signalState(12, true), 'red'); assert.equal(signalState(12, false), 'red');
  assert.equal(signalState(14, false), 'green'); assert.equal(signalState(25, false), 'amber'); assert.equal(signalState(27, false), 'red');
  assert.equal(signalState(28, true), 'green');
});

test('traffic stops before red signals, clears committed junctions and follows stopped vehicles', () => {
  assert.equal(signalSpeedLimit({ x: -3.8, z: -17 }, 0, 0, 20), 0);
  assert.equal(signalSpeedLimit({ x: -3.8, z: -10 }, 0, 5, 20), Infinity);
  assert.equal(signalSpeedLimit({ x: -3.8, z: -30 }, 0, 5, 5), Infinity);
  assert.ok(signalSpeedLimit({ x: -3.8, z: -30 }, 0, 5, 20) < 9);
  assert.equal(followingSpeedLimit(5, 0), 0); assert.ok(followingSpeedLimit(20, 8) > followingSpeedLimit(10, 0));
});

test('all fourteen AI vehicles run for three minutes with finite, bounded routes and synchronized colliders', () => {
  const traffic = new Traffic(new THREE.Scene(), () => ({ group: new THREE.Group(), updateTraffic() {} }));
  const starts = traffic.cars.map(car => car.travel);
  for (let i = 0; i < 5400; i++) traffic.update(1 / 30, { x: 1000, z: 1000 }, 0, i / 30, 0);
  assert.equal(traffic.cars.length, 14);
  for (const [i, car] of traffic.cars.entries()) {
    assert.ok(Number.isFinite(car.x + car.z + car.heading + car.speed)); assert.ok(car.speed >= 0 && car.speed <= car.cruise);
    assert.ok(Math.abs(car.x) < 255 && Math.abs(car.z) < 255); assert.ok(Math.abs(car.travel - starts[i]) > 1, `traffic ${i} is not permanently stuck`);
    assert.equal(car.collider.x, car.x); assert.equal(car.collider.z, car.z); assert.ok(Number.isFinite(car.collider.vx));
  }
});

test('navigation routes connect every customer and service without crossing buildings diagonally', () => {
  const points = [DEPOT, ...DESTINATIONS, FUEL_STATION, GARAGE, { x: 0, z: 0 }];
  for (const start of points) for (const end of points) {
    const route = findRoute(start, end); assert.deepEqual(route[0], start); assert.deepEqual(route.at(-1), end); assert.ok(Number.isFinite(routeLength(route)));
    for (let i = 1; i < route.length; i++) assert.ok(route[i].x === route[i - 1].x || route[i].z === route[i - 1].z);
  }
  assert.ok(routeLength(findRoute(DEPOT, DESTINATIONS[0])) < 135);
});

test('GPS handles real turns, reversal and arrival; map orientation agrees with left steering', () => {
  const route = [{ x: 0, z: 0 }, { x: 0, z: 120 }, { x: 120, z: 120 }];
  assert.deepEqual(navigationGuidance(route, route[0], 0, 'Customer'), { instruction: 'Turn left at the junction', distance: 120 });
  assert.match(navigationGuidance(route, route[0], Math.PI, 'Customer').instruction, /around/);
  assert.match(navigationGuidance([{ x: 0, z: 0 }, { x: 0, z: 5 }], route[0], 0, 'Customer').instruction, /park/);
  const map = mapProjection({ x: 0, z: 0 }, 400, 300, 1); assert.equal(map.z(100), 50); assert.equal(map.x(100), 100);
});

test('camera occlusion clips against thin buildings and ignores non-building obstacles', () => {
  const wall = { x: 0, z: -5, halfX: 10, halfZ: 0.01, kind: 'building' as const };
  const fraction = cameraClearFraction({ x: 0, z: 0 }, { x: 0, z: -15 }, [wall]);
  assert.ok(fraction > 0.2 && fraction < 0.31); assert.ok(-15 * fraction > -4.54);
  assert.equal(cameraClearFraction({ x: 20, z: 0 }, { x: 20, z: -15 }, [wall]), 1);
  assert.equal(cameraClearFraction({ x: 0, z: 0 }, { x: 0, z: -15 }, [{ ...wall, kind: 'tree' }]), 1);
});

test('road resets avoid a traffic queue, and service forecourts have paved-road grip', () => {
  const occupied = Array.from({ length: 14 }, (_, i) => ({ x: -3.8, z: -205 + (i - 7) * 8 }));
  const reset = roadResetPosition({ x: 5, z: -205 }, 0, occupied);
  assert.ok(roadInfo(reset.x, reset.z).onRoad); assert.ok(occupied.every(car => distance(car.x, car.z, reset.x, reset.z) >= 8));
  assert.ok(roadInfo(FUEL_STATION.x, FUEL_STATION.z).onRoad); assert.ok(roadInfo(GARAGE.x, GARAGE.z).onRoad);
  assert.ok(roadInfo(-25, -185).onRoad); assert.equal(roadInfo(60, 60).onRoad, false);
});

test('simultaneous pedals hold the car; reset clears stale input, and moving traffic can damage a stationary player', () => {
  const v = new VehiclePhysics(), world = new SpatialHash();
  for (let i = 0; i < 120; i++) v.step(1 / 120, { throttle: 1, brake: 1, steer: 0, handbrake: false }, world);
  assert.ok(v.speed < 0.001);
  v.braking = 1; v.throttle = 1; v.handbraking = true; v.reset(); assert.equal(v.braking, 0); assert.equal(v.throttle, 0); assert.equal(v.handbraking, false);
  v.step(1 / 120, { throttle: 0, brake: 0, steer: 0, handbrake: false }, world, [{ x: v.x, z: v.z - 3, halfX: 1, halfZ: 1, kind: 'car', vx: 0, vz: 10 }]);
  assert.ok(v.health < 95); assert.ok(v.vz > 0);
});

test('graphics material switching preserves original arrays and synchronizes animated lamps', () => {
  const scene = new THREE.Scene(), original = new THREE.MeshStandardMaterial({ color: 0x789d92, emissive: 0xff0000 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [original, original]); scene.add(mesh);
  const quality = new MaterialQuality(); quality.set(scene, true); original.emissiveIntensity = 3.5; quality.update();
  assert.ok(Array.isArray(mesh.material)); assert.ok(mesh.material[0] instanceof THREE.MeshLambertMaterial); assert.equal(mesh.material[0], mesh.material[1]);
  assert.equal((mesh.material[0] as THREE.MeshLambertMaterial).emissiveIntensity, 3.5);
  quality.set(scene, false); assert.equal(mesh.material[0], original);
  assert.equal(DEFAULT_SETTINGS.frameLimit, 60);
});
