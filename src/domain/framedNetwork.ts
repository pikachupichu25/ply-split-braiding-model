import type { Cord, Simulation } from './types';
import { findCurveCrossings, junctionPatch, portConflicts, validate } from './cordNetwork.ts';
import type { CordCurve, CordNetworkLayout, NetworkCord, NetworkJunction, NetworkPoint } from './cordNetwork.ts';

export type FramedNetworkOptions = {
  /** Axial stretch relative to an approximately square oblique mesh. */
  elongation?: number;
  /** Diameter in units of initial lane spacing. */
  diameter?: number;
  smoothing?: number;
  relax?: boolean;
};

type Node = NetworkPoint & { neighbors: number[]; fixed: boolean };
const mix = (a: NetworkPoint, b: NetworkPoint, t: number): NetworkPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: NetworkPoint, b: NetworkPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(v) ? Math.max(min, Math.min(max, v!)) : fallback;

/**
 * Framed model (docs/framed/README.md): ordered continuous cords pinned to a fixed strip
 * frame, every free junction at the average of its neighbours (a harmonic embedding), then
 * a short rest-length spacing pass. No finished-cell rules, reference-image coordinates, or
 * palette values enter the geometry. This is not a material/tension simulation.
 */
export function buildFramedNetwork(simulation: Simulation, options: FramedNetworkOptions = {}): CordNetworkLayout {
  const diameter = clamp(options.diameter, 1.35, 0.35, 1.9);
  const elongation = clamp(options.elongation, 1.35, 0.6, 2.4);
  const smoothing = clamp(options.smoothing, 0.28, 0, 0.4);
  const cords = simulation.snapshots[0]?.lanes ?? [];
  const n = cords.length, events = simulation.events;
  const quality: CordNetworkLayout['quality'] = { iterations: 0, residual: 0, converged: true, parallelPairs: 0, crossingConflicts: [], portConflicts: [], smoothing, relaxationSteps: 0, bowScale: 1 };
  const empty = (diagnostics: string[]): CordNetworkLayout => ({ width: Math.max(4, n + 3), height: 8, diameter, cords: [], junctions: [], points: [], diagnostics, quality });
  const error = validate(simulation, cords);
  if (error) return empty([error]);
  if (!n) return empty([]);

  const span = Math.max(4, 2 * (events.length / Math.max(1, n - 1) + 1)) * elongation;
  // Two units of margin accommodate curved edge returns and round cord ends.
  const nodes: Node[] = events.map((e, i) => ({ x: (e.fromLane + e.toLane) / 2 + 1,
    y: 2 + (i + 0.5) / Math.max(1, events.length) * span, neighbors: [], fixed: false }));
  const visits = new Map(cords.map(c => [c.id, [] as number[]]));
  events.forEach((e, i) => { visits.get(e.splitterId)!.push(i); visits.get(e.splitteeId)!.push(i); });
  // Exchanges at the outer two gaps are boundary contacts. Their construction
  // order gives the side frontier order, not an interior event's finished Y.
  for (const [side, gap] of [[0, 1], [1, n - 1]]) {
    const boundary = events.map((e, i) => ({ e, i })).filter(({ e }) => Math.min(e.fromLane, e.toLane) === gap);
    boundary.forEach(({ i }, k) => Object.assign(nodes[i], { x: 2 + side * (n - 1), y: 2 + (k + 1) / (boundary.length + 1) * span, fixed: true }));
  }
  const finalLanes = events.at(-1)?.lanesAfter ?? cords;
  const networkCords: NetworkCord[] = cords.map((cord, lane) => {
    const start = nodes.length;
    nodes.push({ x: lane + 2, y: 2, fixed: true, neighbors: [] });
    const end = nodes.length;
    nodes.push({ x: finalLanes.findIndex(c => c.id === cord.id) + 2, y: span + 2, fixed: true, neighbors: [] });
    const chain = [start, ...visits.get(cord.id)!, end];
    for (let k = 1; k < chain.length; k++) {
      nodes[chain[k - 1]].neighbors.push(chain[k]);
      nodes[chain[k]].neighbors.push(chain[k - 1]);
    }
    return { ...cord, nodes: chain, curves: [] };
  });
  const solve = harmonicSolve(nodes);
  Object.assign(quality, solve);
  if (options.relax !== false) quality.relaxationSteps = relaxSpacing(nodes, events.length, Math.hypot(1, elongation));
  const points = nodes.map(({ x, y }) => ({ x, y }));
  const pairs = new Map<string, { cord: NetworkCord; offset: number }[]>();
  networkCords.forEach(cord => cord.nodes.slice(1).forEach((to, offset) => {
    const from = cord.nodes[offset], key = `${from}:${to}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key)!.push({ cord, offset });
  }));
  quality.parallelPairs = [...pairs.values()].filter(p => p.length > 1).length;

  const makeCurves = (smooth: number, bowScale: number) => {
    for (const cord of networkCords) {
      cord.curves = cord.nodes.slice(1).map((to, k) => {
        const from = cord.nodes[k], a = points[from], b = points[to];
        const previous = points[cord.nodes[Math.max(0, k - 1)]], next = points[cord.nodes[Math.min(cord.nodes.length - 1, k + 2)]];
        const handle = (p: NetworkPoint, q: NetworkPoint, direction: NetworkPoint, amount: number): NetworkPoint => {
          const length = Math.hypot(direction.x, direction.y);
          return length < 1e-8 ? mix(p, q, 1 / 3) : { x: p.x + direction.x / length * amount, y: p.y + direction.y / length * amount };
        };
        const d = distance(a, b);
        let c1 = mix(mix(a, b, 1 / 3), handle(a, b, { x: b.x - previous.x, y: b.y - previous.y }, d / 3), smooth / 0.4);
        let c2 = mix(mix(b, a, 1 / 3), handle(b, a, { x: a.x - next.x, y: a.y - next.y }, d / 3), smooth / 0.4);
        if (pairs.get(`${from}:${to}`)!.length > 1 && d > 1e-8) {
          const e = events[from];
          const leftBefore = e.lanesBefore[Math.min(e.fromLane, e.toLane) - 1].id;
          const sign = cord.id === leftBefore ? -1 : 1;
          const bow = Math.min(0.62, d * 0.38) * sign * bowScale;
          const normal = { x: -(b.y - a.y) / d * bow, y: (b.x - a.x) / d * bow };
          c1 = { x: a.x + (b.x - a.x) / 3 + normal.x, y: a.y + (b.y - a.y) / 3 + normal.y };
          c2 = { x: a.x + (b.x - a.x) * 2 / 3 + normal.x, y: a.y + (b.y - a.y) * 2 / 3 + normal.y };
        }
        return { id: `${cord.id}:${k}`, cordId: cord.id, from, to, points: [a, c1, c2, b] };
      });
    }
  };
  // Backtrack curve smoothing if it changes the projected contact topology.
  curveSearch: for (const smooth of [smoothing, smoothing / 2, 0]) for (const bowScale of [1, 0.5, 0.25, 0.125]) {
    makeCurves(smooth, bowScale);
    quality.crossingConflicts = findCurveCrossings(networkCords.flatMap(c => c.curves));
    quality.portConflicts = portConflicts(events, networkCords);
    quality.smoothing = smooth;
    quality.bowScale = bowScale;
    if (!quality.crossingConflicts.length && !quality.portConflicts.length) break curveSearch;
  }
  if ((quality.crossingConflicts.length || quality.portConflicts.length) && options.relax !== false) {
    return buildFramedNetwork(simulation, { ...options, relax: false });
  }

  const byId = new Map(networkCords.map(c => [c.id, c]));
  const junctions = events.map((event, i): NetworkJunction => ({
    event, position: points[i], patch: junctionPatch(byId.get(event.splitteeId)!, byId.get(event.splitterId)!, i, diameter),
  }));
  const diagnostics: string[] = [];
  if (!events.length) diagnostics.push('No splits yet: the cords are shown before they are joined.');
  if (!quality.converged) diagnostics.push('The network solve reached its iteration limit.');
  if (quality.crossingConflicts.length) diagnostics.push(`${quality.crossingConflicts.length} unintended sampled curve intersections; geometry is unresolved.`);
  if (quality.portConflicts.length) diagnostics.push(`${quality.portConflicts.length} junctions have unresolved port order.`);
  return { width: n + 3, height: span + 4, diameter, cords: networkCords, junctions, points, diagnostics, quality };
}

/** Sparse Jacobi-preconditioned conjugate gradient, one solve per coordinate. */
function harmonicSolve(nodes: Node[]) {
  const unknown = nodes.flatMap((n, i) => n.fixed ? [] : [i]);
  const index = new Map(unknown.map((v, i) => [v, i]));
  const degree = unknown.map(v => nodes[v].neighbors.length);
  const neighbors = unknown.map(v => nodes[v].neighbors.flatMap(w => index.has(w) ? [index.get(w)!] : []));
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const multiply = (x: number[]) => x.map((v, i) => degree[i] * v - neighbors[i].reduce((s, j) => s + x[j], 0));
  let iterations = 0, residual = 0, converged = true;
  for (const axis of ['x', 'y'] as const) {
    const x = unknown.map(v => nodes[v][axis]);
    const rhs = unknown.map(v => nodes[v].neighbors.reduce((s, w) => s + (nodes[w].fixed ? nodes[w][axis] : 0), 0));
    const ax = multiply(x), r = rhs.map((v, i) => v - ax[i]);
    let z = r.map((v, i) => v / degree[i]), p = [...z], rz = dot(r, z), k = 0;
    const norm = Math.max(1, Math.sqrt(dot(rhs, rhs)));
    for (; k < Math.min(4000, unknown.length * 2 + 50) && Math.sqrt(dot(r, r)) / norm > 1e-9; k++) {
      const ap = multiply(p), denominator = dot(p, ap);
      if (Math.abs(denominator) < 1e-25) break;
      const alpha = rz / denominator;
      for (let i = 0; i < x.length; i++) { x[i] += alpha * p[i]; r[i] -= alpha * ap[i]; }
      z = r.map((v, i) => v / degree[i]);
      const nextRz = dot(r, z), beta = nextRz / rz;
      p = z.map((v, i) => v + beta * p[i]);
      rz = nextRz;
    }
    const error = Math.sqrt(dot(r, r)) / norm;
    residual = Math.max(residual, error);
    converged &&= error < 1e-7;
    iterations = Math.max(iterations, k);
    unknown.forEach((v, i) => { nodes[v][axis] = x[i]; });
  }
  return { iterations, residual, converged };
}

/** Spring rest lengths avoid the harmonic seed's tiny transition cells.
 * Backtracking preserves every nondegenerate angular sector of the seed.
 * Curves receive a separate intersection/port-order audit afterwards.
 */
function relaxSpacing(nodes: Node[], eventCount: number, target: number): number {
  const edges = nodes.flatMap((n, i) => n.neighbors.filter(j => j > i).map(j => ({
    a: i, b: j, rest: i < eventCount && j < eventCount ? target : distance(n, nodes[j]),
    weight: i < eventCount && j < eventCount ? 1 : 0.25,
  })));
  const cross = (o: NetworkPoint, a: NetworkPoint, b: NetworkPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const sectors = nodes.flatMap((n, i) => {
    if (n.neighbors.length < 3) return [];
    const neighbors = [...n.neighbors].sort((a, b) => Math.atan2(nodes[a].y - n.y, nodes[a].x - n.x) - Math.atan2(nodes[b].y - n.y, nodes[b].x - n.x));
    return neighbors.flatMap((a, k) => {
      const b = neighbors[(k + 1) % neighbors.length], area = cross(n, nodes[a], nodes[b]);
      return Math.abs(area) < 1e-7 ? [] : [{ o: i, a, b, sign: Math.sign(area), min: Math.min(Math.abs(area) * 0.2, 0.03) }];
    });
  });
  const incident = nodes.map((_, i) => edges.filter(e => e.a === i || e.b === i));
  const localSectors = nodes.map((_, i) => sectors.filter(s => s.o === i || s.a === i || s.b === i));
  let steps = 0;
  for (; steps < 80; steps++) {
    let maxMove = 0;
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i];
      if (p.fixed) continue;
      let fx = 0, fy = 0;
      const energy = (candidate: NetworkPoint) => incident[i].reduce((sum, e) => {
        const q = nodes[e.a === i ? e.b : e.a];
        return sum + e.weight * (distance(candidate, q) - e.rest) ** 2;
      }, 0);
      const oldEnergy = energy(p);
      for (const e of incident[i]) {
        const q = nodes[e.a === i ? e.b : e.a], len = Math.max(1e-8, distance(p, q));
        const f = e.weight * (len - e.rest) / len;
        fx += (q.x - p.x) * f; fy += (q.y - p.y) * f;
      }
      for (let scale = 0.18; scale > 0.0001; scale /= 2) {
        const candidate = { x: p.x + scale * fx, y: p.y + scale * fy };
        const at = (id: number) => id === i ? candidate : nodes[id];
        if (localSectors[i].some(s => s.sign * cross(at(s.o), at(s.a), at(s.b)) < s.min)) continue;
        if (energy(candidate) >= oldEnergy - 1e-10) continue;
        maxMove = Math.max(maxMove, distance(p, candidate));
        p.x = candidate.x; p.y = candidate.y; break;
      }
    }
    if (maxMove < 1e-5) break;
  }
  return steps;
}
