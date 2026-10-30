import { BRIDGES, ISLANDS } from '@/engine/world/layout';
import type { WorldPos } from './Coordinates';

export type TravelEdgeType = 'bridge' | 'stair' | 'path' | 'gate' | 'skyway';
export interface TravelEdge {
  id: string; from: string; to: string; type: TravelEdgeType;
  start: WorldPos; end: WorldPos; length: number; status: 'built' | 'planned';
}

function makeEdge(id: string, from: string, to: string, type: TravelEdgeType,
  start: WorldPos, end: WorldPos, status: TravelEdge['status'] = 'built'): TravelEdge {
  return { id, from, to, type, start, end, length: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z), status };
}

const ab = BRIDGES[0]!;
const bc = BRIDGES[1]!;
const sanctuaryStart = { x: ISLANDS.C.center.x, y: ISLANDS.C.topY, z: ISLANDS.C.center.z };
const sanctuaryEnd = { x: ISLANDS.S.center.x, y: ISLANDS.S.topY, z: ISLANDS.S.center.z };

export const TRAVEL_EDGES: readonly TravelEdge[] = [
  { ...makeEdge('bridge-ab', 'dawn-terrace', 'still-garden', 'bridge', ab.points[0]!, ab.points[ab.points.length - 1]!), length: ab.totalLengthXZ },
  { ...makeEdge('bridge-bc', 'still-garden', 'falls-of-light', 'bridge', bc.points[0]!, bc.points[bc.points.length - 1]!), length: bc.totalLengthXZ },
  makeEdge('sanctuary-skyway', 'falls-of-light', 'sanctuary', 'skyway', sanctuaryStart, sanctuaryEnd),
  makeEdge('gate-veiled-peaks', 'dawn-terrace', 'veiled-peaks', 'gate', { x: 8, y: 0, z: -8 }, { x: 2400, y: 20, z: -3600 }, 'planned'),
  makeEdge('gate-capital-valley', 'dawn-terrace', 'capital-valley', 'gate', { x: 8, y: 0, z: -8 }, { x: -5000, y: 40, z: -2400 }, 'planned'),
  makeEdge('gate-primordial-forest', 'falls-of-light', 'primordial-forest', 'gate', { x: 30, y: 1, z: -52 }, { x: -1800, y: 30, z: 4200 }, 'planned'),
  makeEdge('gate-astral-reach', 'sanctuary', 'astral-reach', 'gate', sanctuaryEnd, { x: 0, y: 4000, z: -9000 }, 'planned'),
  makeEdge('gate-deep-sanctuary', 'still-garden', 'deep-sanctuary', 'gate', { x: 60, y: -2, z: -8 }, { x: 4000, y: -300, z: 3000 }, 'planned'),
];

export function walkTime(edge: TravelEdge, speedMetersPerSecond = 2.3): number {
  if (!(speedMetersPerSecond > 0)) throw new RangeError('Walking speed must be positive');
  return edge.length / speedMetersPerSecond / 60;
}

export interface WalkRoute {
  from: string; to: string; distanceMeters: number; minutes: number; edges: readonly TravelEdge[];
}

export function shortestWalk(from: string, to: string): WalkRoute | null {
  if (from === to) return { from, to, distanceMeters: 0, minutes: 0, edges: [] };
  const nodes = new Set<string>([from, to]);
  for (const edge of TRAVEL_EDGES) {
    if (edge.status === 'built' && ['bridge', 'stair', 'path'].includes(edge.type)) {
      nodes.add(edge.from); nodes.add(edge.to);
    }
  }
  const distances = new Map<string, number>();
  const previous = new Map<string, { node: string; edge: TravelEdge }>();
  const remaining = new Set(nodes);
  for (const node of nodes) distances.set(node, Infinity);
  distances.set(from, 0);

  while (remaining.size) {
    let current: string | null = null;
    let best = Infinity;
    for (const node of remaining) {
      const value = distances.get(node) ?? Infinity;
      if (value < best) { best = value; current = node; }
    }
    if (current === null || !Number.isFinite(best)) break;
    remaining.delete(current);
    if (current === to) break;
    for (const edge of TRAVEL_EDGES) {
      if (edge.status !== 'built' || !['bridge', 'stair', 'path'].includes(edge.type)) continue;
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (next === null || !remaining.has(next)) continue;
      const candidate = best + edge.length;
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate);
        previous.set(next, { node: current, edge });
      }
    }
  }

  const distanceMeters = distances.get(to) ?? Infinity;
  if (!Number.isFinite(distanceMeters)) return null;
  const route: TravelEdge[] = [];
  let cursor = to;
  while (cursor !== from) {
    const step = previous.get(cursor);
    if (!step) return null;
    route.push(step.edge);
    cursor = step.node;
  }
  route.reverse();
  return { from, to, distanceMeters, minutes: distanceMeters / 2.3 / 60, edges: route };
}

export function nextWaypoint(position: WorldPos): TravelEdge | null {
  let best: TravelEdge | null = null;
  let bestDistance = Infinity;
  for (const edge of TRAVEL_EDGES) {
    if (edge.status !== 'built' || (edge.type !== 'gate' && edge.type !== 'skyway')) continue;
    const d = Math.hypot(position.x - edge.start.x, position.y - edge.start.y, position.z - edge.start.z);
    if (d < bestDistance) { bestDistance = d; best = edge; }
  }
  return best;
}

export function builtWalkGraphIsConnected(areaIds: readonly string[]): boolean {
  for (let i = 1; i < areaIds.length; i++) if (!shortestWalk(areaIds[0]!, areaIds[i]!)) return false;
  return true;
}

/** Connectivity including built transfer edges such as the Sanctuary skyway. */
export function builtGraphIsConnected(nodeIds: readonly string[]): boolean {
  if (nodeIds.length <= 1) return true;
  const visited = new Set<string>([nodeIds[0]!]);
  const queue = [nodeIds[0]!];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    for (const edge of TRAVEL_EDGES) {
      if (edge.status !== 'built') continue;
      const next = edge.from === node ? edge.to : edge.to === node ? edge.from : null;
      if (next !== null && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return nodeIds.every((id) => visited.has(id));
}
