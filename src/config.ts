import type { Point } from './math';

export const ROADS = [-240, -120, 0, 120, 240];
export const ROAD_HALF = 9;
export const CITY_EDGE = 286;
export const LANE = 3.8;
export const SPAWN = { x: -3.8, z: -205, heading: 0 };
export const DEPOT: Point = { x: -3.8, z: -184 };
export const FUEL_STATION: Point = { x: 138, z: -37 };
export const GARAGE: Point = { x: -139, z: -39 };
export const STREETS_X = ['Breakwater Drive', 'Juniper Avenue', 'Harbor Boulevard', 'Foundry Street', 'Ocean Drive'];
export const STREETS_Z = ['South Quay', 'Dockside Lane', 'Market Street', 'Orchard Road', 'Northshore Way'];

export interface Destination extends Point { name: string; district: string; description: string; cargo: string; reward: number; time: number; fragile: boolean }
export const DESTINATIONS: Destination[] = [
  { x: -3.8, z: -61, name: 'Sunday Coffee', district: 'OLD TOWN', description: 'The morning rush is waiting. Take fresh coffee beans up Harbor Boulevard.', cargo: 'Roasted coffee · 12 kg', reward: 140, time: 85, fragile: false },
  { x: 182, z: -3.8, name: 'The Foundry', district: 'MARKET DISTRICT', description: 'A small studio. A big opening. Deliver their handmade ceramics in one piece.', cargo: 'Handmade ceramics · fragile', reward: 280, time: 130, fragile: true },
  { x: -123.8, z: 176, name: 'Botanical House', district: 'NORTH GARDENS', description: 'A fresh delivery for the neighborhood florist, on the quieter side of town.', cargo: 'Seasonal flowers · 18 kg', reward: 340, time: 155, fragile: false },
  { x: 236.2, z: 183, name: 'Seabrook Hotel', district: 'OCEANFRONT', description: 'Follow the coast to Seabrook. The concierge is expecting a special arrival.', cargo: 'Guest luggage · 32 kg', reward: 420, time: 185, fragile: false },
  { x: -183, z: 123.8, name: 'Northside Records', district: 'NORTH GARDENS', description: 'A rare collection of vinyl for the listening room. Smooth driving pays off.', cargo: 'Vintage vinyl · fragile', reward: 390, time: 170, fragile: true },
  { x: -236.2, z: -179, name: 'Pier 09 Warehouse', district: 'SOUTH QUAY', description: 'The last boat is in. Run a crate of precision parts over to the working harbor.', cargo: 'Marine parts · 45 kg', reward: 260, time: 120, fragile: false },
];

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  volume: number;
  units: 'kmh' | 'mph';
  timeMode: 'cycle' | 'day' | 'sunset' | 'night';
  camera: 'chase' | 'close' | 'hood';
  sensitivity: number;
  showRoute: boolean;
  cameraShake: boolean;
  frameLimit: 30 | 60 | 120 | 0;
}
export const DEFAULT_SETTINGS: Settings = { quality: 'medium', volume: 0.35, units: 'kmh', timeMode: 'cycle', camera: 'chase', sensitivity: 1, showRoute: true, cameraShake: true, frameLimit: 60 };

export function roadInfo(x: number, z: number) {
  let dx = Infinity, dz = Infinity, xi = 0, zi = 0;
  ROADS.forEach((r, i) => { if (Math.abs(x - r) < dx) { dx = Math.abs(x - r); xi = i; } if (Math.abs(z - r) < dz) { dz = Math.abs(z - r); zi = i; } });
  const within = Math.abs(x) < CITY_EDGE && Math.abs(z) < CITY_EDGE;
  const forecourt = (Math.abs(x + 27) < 15.5 && Math.abs(z + 188) < 31)
    || [FUEL_STATION, GARAGE].some(p => Math.abs(x - p.x - (p === FUEL_STATION ? 2 : -2)) < 16 && Math.abs(z - p.z) < 21);
  return { onRoad: within && (dx < ROAD_HALF || dz < ROAD_HALF || forecourt), onCurb: within && !forecourt && Math.min(dx, dz) >= ROAD_HALF && Math.min(dx, dz) < ROAD_HALF + 3, street: dx < dz ? STREETS_X[xi] : STREETS_Z[zi], dx, dz, xi, zi };
}

export function district(x: number, z: number) { return x > 180 ? 'OCEANFRONT' : z < -130 ? 'SOUTH QUAY' : z > 95 ? 'NORTH GARDENS' : x < -80 ? 'OLD TOWN' : 'MARKET DISTRICT'; }

function simplifyRoute(points: Point[]) {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && Math.hypot(previous.x - point.x, previous.z - point.z) < 0.001) { result[result.length - 1] = point; continue; }
    while (result.length >= 2) {
      const a = result[result.length - 2], b = result[result.length - 1];
      const ax = b.x - a.x, az = b.z - a.z, bx = point.x - b.x, bz = point.z - b.z;
      if (Math.abs(ax * bz - az * bx) > 0.001 || ax * bx + az * bz < 0) break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}

// A small, deterministic road-graph router. Endpoints attach to their nearest street.
export function findRoute(start: Point, end: Point): Point[] {
  const attach = (p: Point) => {
    const info = roadInfo(p.x, p.z);
    const vertical = info.dx < info.dz;
    const nodes: number[] = [];
    for (let i = 0; i < ROADS.length; i++) nodes.push(vertical ? info.xi * 5 + i : i * 5 + info.zi);
    nodes.sort((a, b) => Math.hypot(ROADS[Math.floor(a / 5)] - p.x, ROADS[a % 5] - p.z) - Math.hypot(ROADS[Math.floor(b / 5)] - p.x, ROADS[b % 5] - p.z));
    return { vertical, nodes: nodes.slice(0, 2), projection: vertical ? { x: ROADS[info.xi], z: p.z } : { x: p.x, z: ROADS[info.zi] } };
  };
  const s = attach(start), e = attach(end);
  if ((s.vertical && e.vertical && s.projection.x === e.projection.x) || (!s.vertical && !e.vertical && s.projection.z === e.projection.z)) return simplifyRoute([start, s.projection, e.projection, end]);
  const dist = Array(25).fill(Infinity), prev = Array(25).fill(-1), visited = new Set<number>();
  s.nodes.forEach(n => dist[n] = Math.hypot(ROADS[Math.floor(n / 5)] - start.x, ROADS[n % 5] - start.z));
  for (let it = 0; it < 25; it++) {
    let n = -1; for (let i = 0; i < 25; i++) if (!visited.has(i) && (n < 0 || dist[i] < dist[n])) n = i;
    if (n < 0) break; visited.add(n);
    const x = Math.floor(n / 5), z = n % 5;
    for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
      if (nx < 0 || nx > 4 || nz < 0 || nz > 4) continue;
      const next = nx * 5 + nz; if (dist[n] + 120 < dist[next]) { dist[next] = dist[n] + 120; prev[next] = n; }
    }
  }
  const n = e.nodes.sort((a, b) => dist[a] + Math.hypot(ROADS[Math.floor(a / 5)] - end.x, ROADS[a % 5] - end.z) - dist[b] - Math.hypot(ROADS[Math.floor(b / 5)] - end.x, ROADS[b % 5] - end.z))[0];
  const path: Point[] = []; let cursor = n;
  while (cursor >= 0) { path.unshift({ x: ROADS[Math.floor(cursor / 5)], z: ROADS[cursor % 5] }); cursor = prev[cursor]; }
  return simplifyRoute([start, s.projection, ...path, e.projection, end]);
}
