import { LANE, ROADS, roadInfo } from './config';
import { clamp, distance, type Point } from './math';

/** Choose a nearby lane position rather than stacking the player onto traffic. */
export function roadResetPosition(position: Point, oldHeading: number, traffic: Point[]) {
  const info = roadInfo(position.x, position.z), vertical = info.dx < info.dz;
  const forward = vertical ? Math.cos(oldHeading) >= 0 : Math.sin(oldHeading) >= 0;
  const heading = vertical ? forward ? 0 : Math.PI : forward ? Math.PI / 2 : -Math.PI / 2;
  const origin = vertical
    ? { x: ROADS[info.xi] + (forward ? -LANE : LANE), z: clamp(position.z, -270, 270) }
    : { x: clamp(position.x, -270, 270), z: ROADS[info.zi] + (forward ? LANE : -LANE) };
  const clear = (p: Point) => traffic.every(car => distance(p.x, p.z, car.x, car.z) >= 8);
  for (let step = 0; step <= 70; step++) {
    const offset = Math.ceil(step / 2) * 8 * (step % 2 ? -1 : 1);
    const candidate = { x: origin.x + Math.sin(heading) * offset, z: origin.z + Math.cos(heading) * offset, heading };
    if (Math.abs(candidate.x) <= 277 && Math.abs(candidate.z) <= 277 && clear(candidate)) return candidate;
  }
  // At most fourteen AI vehicles; this deterministic grid always has a free lane.
  for (const road of ROADS) for (let z = -265; z <= 265; z += 20) {
    const candidate = { x: road - LANE, z, heading: 0 };
    if (clear(candidate)) return candidate;
  }
  return { ...origin, heading };
}
