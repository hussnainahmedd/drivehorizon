export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, speed: number, dt: number) => lerp(a, b, 1 - Math.exp(-speed * dt));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const dampAngle = (a: number, b: number, speed: number, dt: number) => a + angleDelta(a, b) * (1 - Math.exp(-speed * dt));
export const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const formatDistance = (m: number) => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 5) * 5 + ' m';
export function seededRandom(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export interface Point { x: number; z: number }
export interface Collider { x: number; z: number; halfX: number; halfZ: number; kind: 'building' | 'tree' | 'barrier' | 'car'; vx?: number; vz?: number }

export class SpatialHash {
  private cells = new Map<string, Collider[]>();
  constructor(private cellSize = 32) {}
  add(c: Collider) {
    for (let x = Math.floor((c.x - c.halfX) / this.cellSize); x <= Math.floor((c.x + c.halfX) / this.cellSize); x++) {
      for (let z = Math.floor((c.z - c.halfZ) / this.cellSize); z <= Math.floor((c.z + c.halfZ) / this.cellSize); z++) {
        const key = `${x},${z}`; const cell = this.cells.get(key) || []; cell.push(c); this.cells.set(key, cell);
      }
    }
  }
  query(x: number, z: number, radius: number) {
    const found = new Set<Collider>();
    for (let cx = Math.floor((x - radius) / this.cellSize); cx <= Math.floor((x + radius) / this.cellSize); cx++)
      for (let cz = Math.floor((z - radius) / this.cellSize); cz <= Math.floor((z + radius) / this.cellSize); cz++)
        for (const c of this.cells.get(`${cx},${cz}`) || []) found.add(c);
    return found;
  }
}
