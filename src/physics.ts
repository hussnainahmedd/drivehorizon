import { clamp, damp, SpatialHash, type Collider } from './math';
import { CITY_EDGE, SPAWN, roadInfo } from './config';
import { DEFAULT_UPGRADES, type VehicleUpgrades } from './career';

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }
export interface Impact { speed: number; x: number; z: number }

/** Fixed-step dynamic bicycle model, SI units. The render body has separate spring dynamics. */
export class VehiclePhysics {
  x = SPAWN.x; z = SPAWN.z; heading = SPAWN.heading;
  vx = 0; vz = 0; yawRate = 0;
  steering = 0; speed = 0; forwardSpeed = 0;
  throttle = 0; braking = 0; rpm = 850; gear = 1;
  fuel = 100; health = 100;
  pitch = 0; roll = 0; heave = 0;
  private pitchV = 0; private rollV = 0; private heaveV = 0;
  private impactCooldown = 0;
  totalDistance = 0; wheelAngle = 0; slip = 0;
  onRoad = true; handbraking = false;
  acceleration = 0;
  onImpact: ((impact: Impact) => void) | null = null;
  upgrades: VehicleUpgrades = { ...DEFAULT_UPGRADES };

  get position() { return { x: this.x, z: this.z }; }

  step(dt: number, input: DriveInput, world: SpatialHash, traffic: Collider[] = []) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) return;
    input = { throttle: Number.isFinite(input.throttle) ? clamp(input.throttle, 0, 1) : 0, brake: Number.isFinite(input.brake) ? clamp(input.brake, 0, 1) : 0, steer: Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0, handbrake: !!input.handbrake };
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    let longitudinal = this.vx * sin + this.vz * cos;
    const lateral = this.vx * cos - this.vz * sin;
    const info = roadInfo(this.x, this.z);
    this.onRoad = info.onRoad;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const speedAbs = Math.abs(longitudinal);
    const maxSteer = 0.57 / (1 + speedAbs * 0.035);
    this.steering = damp(this.steering, input.steer * maxSteer, input.steer === 0 ? 8 : 5.2, dt);
    this.handbraking = input.handbrake;
    let drive = 0, brake = 0;
    if (input.throttle > 0) { if (longitudinal < -0.7) brake = input.throttle; else drive = input.throttle; }
    if (input.brake > 0) { if (longitudinal > 0.7) brake = input.brake; else drive = -input.brake * 0.55; }
    if (input.throttle > 0 && input.brake > 0) { drive = 0; brake = Math.max(input.throttle, input.brake); }
    if (this.fuel <= 0 || this.health <= 0) drive = 0;
    this.throttle = damp(this.throttle, Math.abs(drive), 7, dt);
    this.braking = brake;

    const mass = 1480, gravity = 9.81;
    const mu = (info.onRoad ? 1.06 : info.onCurb ? 0.82 : 0.58) * (1 + this.upgrades.tires * 0.06);
    const frontLoad = mass * gravity * 0.55 - clamp(this.acceleration * mass * 0.2, -2200, 1800);
    const rearLoad = mass * gravity - frontLoad;
    const frontSlip = Math.atan2(lateral + this.yawRate * 1.2 - longitudinal * Math.tan(this.steering), Math.max(speedAbs, 2.5));
    const rearSlip = Math.atan2(lateral - this.yawRate * 1.48, Math.max(speedAbs, 2.5));
    const frontForce = clamp(-frontSlip * 69000, -frontLoad * mu, frontLoad * mu);
    const rearGrip = mu * (input.handbrake ? 0.32 : 1);
    const rearForce = clamp(-rearSlip * 74000, -rearLoad * rearGrip, rearLoad * rearGrip);
    const healthPower = 0.4 + this.health / 100 * 0.6;
    const engineForce = drive * Math.min(6600, 108000 / Math.max(12, speedAbs)) * healthPower * (1 + this.upgrades.engine * 0.07);
    const reverseLimit = longitudinal < -9 && drive < 0 ? 0 : engineForce;
    const rolling = (info.onRoad ? 170 : 660) * Math.tanh(longitudinal * 2);
    const aero = 0.43 * longitudinal * Math.abs(longitudinal);
    let brakingForce = (brake * 13700 + (input.handbrake ? 5300 : 0)) * Math.sign(longitudinal);
    brakingForce = clamp(brakingForce, -speedAbs * mass / dt, speedAbs * mass / dt);
    const driveForce = reverseLimit - rolling - aero - brakingForce;
    const sideForce = frontForce + rearForce;
    this.vx += (sin * driveForce + cos * sideForce) / mass * dt;
    this.vz += (cos * driveForce - sin * sideForce) / mass * dt;
    this.yawRate += (frontForce * 1.2 - rearForce * 1.48) / 2450 * dt;
    this.yawRate *= Math.exp(-0.45 * dt);
    if (speedAbs < 0.6 && !drive) {
      this.vx *= Math.exp(-6 * dt); this.vz *= Math.exp(-6 * dt); this.yawRate *= Math.exp(-8 * dt);
    }
    this.yawRate = clamp(this.yawRate, -2.5, 2.5);
    this.heading += this.yawRate * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;

    for (const collider of world.query(this.x, this.z, 4)) this.collide(collider);
    for (const collider of traffic) if (Math.abs(collider.x - this.x) + Math.abs(collider.z - this.z) < 10) this.collide(collider);
    // Continuous shoreline boundary prevents tunnelling into the water at high speed.
    if (Math.abs(this.x) > CITY_EDGE - 1.4) { const old = Math.abs(this.vx); this.x = clamp(this.x, -CITY_EDGE + 1.4, CITY_EDGE - 1.4); this.vx *= -0.18; this.impact(old); }
    if (Math.abs(this.z) > CITY_EDGE - 1.4) { const old = Math.abs(this.vz); this.z = clamp(this.z, -CITY_EDGE + 1.4, CITY_EDGE - 1.4); this.vz *= -0.18; this.impact(old); }

    this.speed = Math.hypot(this.vx, this.vz);
    this.forwardSpeed = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    this.acceleration = damp(this.acceleration, driveForce / mass, 5, dt);
    this.slip = Math.max(Math.abs(frontSlip), Math.abs(rearSlip)) * Math.min(1, this.speed / 6);
    this.totalDistance += this.speed * dt;
    this.wheelAngle += this.forwardSpeed / 0.345 * dt;
    if (this.health > 0 && this.fuel > 0) this.fuel = Math.max(0, this.fuel - dt * (0.003 + this.throttle * 0.025 + this.speed * 0.0008) * (1 - this.upgrades.efficiency * 0.1));
    this.gear = longitudinal < -0.5 ? -1 : clamp(Math.floor(speedAbs / 10.5) + 1, 1, 6);
    const ratio = [0, 3.2, 2.1, 1.5, 1.16, 0.92, 0.75][Math.max(1, this.gear)];
    this.rpm = damp(this.rpm, clamp(850 + speedAbs * ratio * 125 + this.throttle * 850, 850, 6800), 8, dt);

    // Damped chassis springs: longitudinal load transfer, lateral roll, and road roughness.
    const targetPitch = clamp(-this.acceleration * 0.006, -0.055, 0.05);
    const targetRoll = clamp(-sideForce / mass * 0.011, -0.09, 0.09);
    this.pitchV += ((targetPitch - this.pitch) * 75 - this.pitchV * 11) * dt;
    this.rollV += ((targetRoll - this.roll) * 62 - this.rollV * 9) * dt;
    this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
    const rough = info.onRoad ? 0.002 : info.onCurb ? 0.045 : 0.035;
    const targetHeave = Math.sin(this.totalDistance * 1.7) * rough * Math.min(this.speed / 8, 1) + (info.onCurb ? 0.12 : 0);
    this.heaveV += ((targetHeave - this.heave) * 130 - this.heaveV * 12) * dt;
    this.heave += this.heaveV * dt;
  }

  private collide(c: Collider) {
    // Two circular chassis probes approximate the vehicle capsule, including its front/rear overhang.
    for (const offset of [-1.28, 1.28]) {
      const px = this.x + Math.sin(this.heading) * offset, pz = this.z + Math.cos(this.heading) * offset;
      const cx = clamp(px, c.x - c.halfX, c.x + c.halfX), cz = clamp(pz, c.z - c.halfZ, c.z + c.halfZ);
      let dx = px - cx, dz = pz - cz, dist = Math.hypot(dx, dz);
      const radius = 0.92;
      if (dist >= radius) continue;
      if (dist < 0.0001) {
        const nearX = c.halfX - Math.abs(px - c.x), nearZ = c.halfZ - Math.abs(pz - c.z);
        if (nearX < nearZ) { dx = Math.sign(px - c.x) || 1; dz = 0; dist = -nearX; }
        else { dx = 0; dz = Math.sign(pz - c.z) || 1; dist = -nearZ; }
      } else { dx /= dist; dz /= dist; }
      const penetration = radius - dist;
      this.x += dx * penetration; this.z += dz * penetration;
      const normalSpeed = (this.vx - (c.vx ?? 0)) * dx + (this.vz - (c.vz ?? 0)) * dz;
      if (normalSpeed < 0) {
        this.vx -= dx * normalSpeed * 1.14; this.vz -= dz * normalSpeed * 1.14;
        this.vx *= 0.87; this.vz *= 0.87;
        this.yawRate += clamp(offset * (dx * Math.cos(this.heading) - dz * Math.sin(this.heading)) * -normalSpeed * 0.018, -0.7, 0.7);
        this.impact(-normalSpeed);
      }
    }
  }

  private impact(speed: number) {
    if (speed < 1.2 || this.impactCooldown > 0) return;
    this.impactCooldown = 0.5;
    this.health = clamp(this.health - Math.max(0, speed - 1.5) * 1.7, 0, 100);
    this.pitchV += speed * 0.014;
    this.onImpact?.({ speed, x: this.x, z: this.z });
  }

  reset(x = SPAWN.x, z = SPAWN.z, heading = SPAWN.heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = 0; this.vz = 0; this.yawRate = 0; this.speed = 0; this.forwardSpeed = 0;
    this.steering = 0; this.pitch = 0; this.roll = 0; this.heave = 0;
    this.pitchV = this.rollV = this.heaveV = 0;
    this.throttle = this.braking = this.acceleration = this.slip = this.impactCooldown = 0;
    this.handbraking = false; this.gear = 1; this.rpm = 850; this.onRoad = roadInfo(x, z).onRoad;
  }
}
