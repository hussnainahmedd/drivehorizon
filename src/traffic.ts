import * as THREE from 'three';
import { CarModel } from './vehicle';
import { LANE, ROADS } from './config';
import { angleDelta, clamp, seededRandom, type Collider, type Point } from './math';
import { followingSpeedLimit, signalSpeedLimit } from './signals';

type TrafficModel = Pick<CarModel, 'group' | 'updateTraffic'>;

interface TrafficCar {
  model: TrafficModel; curve: THREE.CatmullRomCurve3; length: number; travel: number; speed: number; cruise: number; heading: number; x: number; z: number; wheel: number; collider: Collider;
}

export class Traffic {
  readonly cars: TrafficCar[] = [];
  readonly colliders: Collider[] = [];
  drawDistance = 220;
  private v = new THREE.Vector3();
  private tangent = new THREE.Vector3();
  constructor(scene: THREE.Scene, createModel: (color: number) => TrafficModel = color => new CarModel(color)) {
    const rand = seededRandom(173);
    const colors = [0xc3bdab, 0x59666a, 0x9b7464, 0xa6afa6, 0x3c5e69, 0xc4af85, 0x637867, 0xb2b3a9];
    // Closed multi-block routes use actual lane centerlines, with rounded turns.
    for (let i = 0; i < 14; i++) {
      const a = i % 3, b = Math.floor(i / 3) % 3, width = i % 2 === 0 ? 1 : 2;
      const x0 = ROADS[a], x1 = ROADS[Math.min(4, a + width)], z0 = ROADS[b], z1 = ROADS[Math.min(4, b + 1 + i % 2)];
      const reverse = i % 3 === 0, l = reverse ? -LANE : LANE;
      const points = [
        new THREE.Vector3(x0 - l, 0, z0 + 17), new THREE.Vector3(x0 - l, 0, z1 - 17),
        new THREE.Vector3(x0 - l + 2, 0, z1 + l - 2), new THREE.Vector3(x0 + 17, 0, z1 + l),
        new THREE.Vector3(x1 - 17, 0, z1 + l), new THREE.Vector3(x1 + l - 2, 0, z1 + l - 2),
        new THREE.Vector3(x1 + l, 0, z1 - 17), new THREE.Vector3(x1 + l, 0, z0 + 17),
        new THREE.Vector3(x1 + l - 2, 0, z0 - l + 2), new THREE.Vector3(x1 - 17, 0, z0 - l),
        new THREE.Vector3(x0 + 17, 0, z0 - l), new THREE.Vector3(x0 - l + 2, 0, z0 - l + 2),
      ];
      if (reverse) points.reverse();
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.15); curve.arcLengthDivisions = 600;
      const length = curve.getLength(), travel = rand() * length;
      const p = curve.getPointAt(travel / length), t = curve.getTangentAt(travel / length);
      const model = createModel(colors[i % colors.length]); scene.add(model.group);
      const collider: Collider = { x: p.x, z: p.z, halfX: 1, halfZ: 2.2, kind: 'car' };
      const car = { model, curve, length, travel, speed: 0, cruise: 8 + rand() * 4, heading: Math.atan2(t.x, t.z), x: p.x, z: p.z, wheel: 0, collider };
      this.cars.push(car); this.colliders.push(collider);
    }
  }

  update(dt: number, player: Point, playerSpeed: number, elapsed: number, night: number, playerHeading?: number) {
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.25) return;
    const speeds = this.cars.map(car => {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let desired = car.cruise;
      const ahead = (x: number, z: number) => { const dx = x - car.x, dz = z - car.z; return { along: dx * fx + dz * fz, side: Math.abs(dx * fz - dz * fx) }; };
      const p = ahead(player.x, player.z);
      const leadSpeed = playerHeading === undefined ? 0 : Math.max(0, playerSpeed * Math.cos(angleDelta(car.heading, playerHeading)));
      if (p.along > -2 && p.along < 13 + car.speed && p.side < 2.8) desired = Math.min(desired, followingSpeedLimit(p.along, leadSpeed));
      for (const other of this.cars) {
        if (other === car || Math.abs(angleDelta(car.heading, other.heading)) > 1) continue;
        const a = ahead(other.x, other.z);
        if (a.along > 0 && a.along < 25 && a.side < 2.6) desired = Math.min(desired, followingSpeedLimit(a.along, other.speed));
      }
      desired = Math.min(desired, signalSpeedLimit(car, car.heading, car.speed, elapsed));
      // Brake into turns, avoiding arcade-speed cornering.
      const future = car.curve.getTangentAt(((car.travel + 10) % car.length) / car.length, this.tangent);
      if (Math.abs(angleDelta(car.heading, Math.atan2(future.x, future.z))) > 0.4) desired = Math.min(desired, 5.2);
      return desired;
    });
    this.cars.forEach((car, index) => {
      const desired = speeds[index];
      car.speed += clamp(desired - car.speed, -5 * dt, 2.2 * dt);
      if (desired === 0 && car.speed < 0.04) car.speed = 0;
      car.travel = (car.travel + car.speed * dt) % car.length;
      car.curve.getPointAt(car.travel / car.length, this.v); car.curve.getTangentAt(car.travel / car.length, this.tangent);
      car.x = this.v.x; car.z = this.v.z; car.heading = Math.atan2(this.tangent.x, this.tangent.z); car.wheel += car.speed * dt / 0.345;
      car.collider.x = car.x; car.collider.z = car.z;
      car.collider.vx = Math.sin(car.heading) * car.speed; car.collider.vz = Math.cos(car.heading) * car.speed;
      car.collider.halfX = Math.abs(Math.sin(car.heading)) * 1.7 + 0.75;
      car.collider.halfZ = Math.abs(Math.cos(car.heading)) * 1.7 + 0.75;
      car.model.updateTraffic(car.x, car.z, car.heading, car.wheel, desired < car.speed - 0.5 || car.speed < 0.5, night);
      car.model.group.visible = Math.hypot(car.x - player.x, car.z - player.z) < this.drawDistance;
    });
  }
}
