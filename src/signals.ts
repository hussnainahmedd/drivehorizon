import { ROADS } from './config';
import type { Point } from './math';

export type SignalState = 'green' | 'amber' | 'red';

/** Shared by the visible lamps and AI. Two all-red clearance periods per cycle. */
export function signalState(elapsed: number, vertical: boolean): SignalState {
  const phase = ((elapsed % 28) + 28) % 28;
  if (vertical) return phase < 11 ? 'green' : phase < 12 ? 'amber' : 'red';
  return phase >= 14 && phase < 25 ? 'green' : phase >= 25 && phase < 26 ? 'amber' : 'red';
}

export function signalSpeedLimit(position: Point, heading: number, speed: number, elapsed: number) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const vertical = Math.abs(fz) > 0.85;
  if (!vertical && Math.abs(fx) <= 0.85) return Infinity;
  const signal = signalState(elapsed, vertical);
  if (signal === 'green') return Infinity;
  let limit = Infinity;
  for (const road of ROADS) {
    const gap = vertical ? (road - position.z) * Math.sign(fz) : (road - position.x) * Math.sign(fx);
    // Once past the stop line, clear the junction rather than stopping inside it.
    if (gap < 16.8 || gap > 45) continue;
    const remaining = Math.max(0, gap - 17);
    if (signal === 'amber' && remaining < speed * speed / 9 + 1) continue;
    limit = Math.min(limit, Math.sqrt(2 * 3 * remaining));
  }
  return limit;
}

export function followingSpeedLimit(gap: number, leadSpeed: number) {
  return Math.max(0, Math.min((gap - 6) * 0.9, leadSpeed + (gap - 9) * 0.65));
}
