import type { Collider, Point } from './math';

/** Exact XZ segment / building bounds test, so thin walls cannot be skipped. */
export function cameraClearFraction(focus: Point, desired: Point, colliders: Iterable<Collider>, margin = 0.45) {
  let fraction = 1;
  const dx = desired.x - focus.x, dz = desired.z - focus.z;
  for (const collider of colliders) {
    if (collider.kind !== 'building') continue;
    let near = 0, far = 1, intersects = true;
    for (const [origin, delta, center, half] of [[focus.x, dx, collider.x, collider.halfX], [focus.z, dz, collider.z, collider.halfZ]]) {
      const min = center - half - margin, max = center + half + margin;
      if (Math.abs(delta) < 1e-8) { if (origin < min || origin > max) intersects = false; continue; }
      const a = (min - origin) / delta, b = (max - origin) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) intersects = false;
    }
    if (intersects && far >= 0 && near <= 1) fraction = Math.min(fraction, Math.max(0.02, near - 0.03));
  }
  return fraction;
}
