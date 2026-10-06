import { angleDelta, distance, type Point } from './math';

export function routeLength(route: Point[]) {
  let length = 0;
  for (let i = 1; i < route.length; i++) length += distance(route[i - 1].x, route[i - 1].z, route[i].x, route[i].z);
  return length;
}

export function navigationGuidance(route: Point[], position: Point, heading: number, destination: string) {
  const total = routeLength(route);
  if (total < 12) return { instruction: 'Destination on arrival · park safely', distance: total };
  let travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], length = distance(a.x, a.z, b.x, b.z);
    if (length < 0.1) continue;
    if (travelled < 10 && length > 12) {
      const bearing = Math.atan2(b.x - a.x, b.z - a.z);
      if (Math.abs(angleDelta(heading, bearing)) > 2.25) return { instruction: 'Turn around when safe', distance: total };
    }
    travelled += length;
    const next = route[i + 1];
    if (!next || length < 10 || distance(b.x, b.z, next.x, next.z) < 10) continue;
    const turn = angleDelta(Math.atan2(b.x - a.x, b.z - a.z), Math.atan2(next.x - b.x, next.z - b.z));
    if (Math.abs(turn) > 0.6) return { instruction: turn > 0 ? 'Turn left at the junction' : 'Turn right at the junction', distance: travelled };
  }
  return { instruction: destination, distance: total || distance(position.x, position.z, route.at(-1)?.x ?? position.x, route.at(-1)?.z ?? position.z) };
}

/** +Z is city north; +yaw is left. Keep maps consistent with the driving view. */
export function mapProjection(center: Point, width: number, height: number, scale: number) {
  return { x: (x: number) => width / 2 - (x - center.x) * scale, z: (z: number) => height / 2 - (z - center.z) * scale };
}
