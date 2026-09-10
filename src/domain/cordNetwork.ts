import type { Cord, Simulation, SplitEvent } from './types';

export type NetworkPoint = { x: number; y: number };
export type CordCurve = {
  id: string;
  cordId: string;
  from: number;
  to: number;
  points: [NetworkPoint, NetworkPoint, NetworkPoint, NetworkPoint];
};
export type NetworkCord = Cord & { nodes: number[]; curves: CordCurve[] };
export type NetworkJunction = {
  event: SplitEvent;
  position: NetworkPoint;
  /** Exact subcurves of the splittee, so the patch joins its continuous cord. */
  patch: [CordCurve['points'], CordCurve['points']];
};
export type CordNetworkLayout = {
  width: number;
  height: number;
  diameter: number;
  cords: NetworkCord[];
  junctions: NetworkJunction[];
  points: NetworkPoint[];
  diagnostics: string[];
  quality: {
    iterations: number;
    residual: number;
    converged: boolean;
    parallelPairs: number;
    crossingConflicts: NetworkPoint[];
    portConflicts: number[];
    smoothing: number;
    relaxationSteps: number;
    bowScale: number;
  };
};
export type CordNetworkOptions = {
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
 * Independent experimental model: ordered continuous cords + harmonic strip
 * embedding. No finished-cell rules, reference-image coordinates, or palette
 * values enter the geometry. This is not a material/tension simulation.
 */
export function buildCordNetwork(simulation: Simulation, options: CordNetworkOptions = {}): CordNetworkLayout {
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
    return buildCordNetwork(simulation, { ...options, relax: false });
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

export function validate(simulation: Simulation, cords: Cord[]): string | undefined {
  if (simulation.diagnostics.some(d => d.severity === 'error')) return 'Resolve the pattern errors before generating the cord network.';
  const ids = new Set(cords.map(c => c.id));
  if (ids.size !== cords.length) return 'Initial cord identities must be unique.';
  let previous = cords;
  const eventIds = new Set<number>();
  for (const e of simulation.events) {
    if (!Number.isSafeInteger(e.eventIndex) || e.eventIndex < 0) return 'Split event indices must be nonnegative integers.';
    if (eventIds.has(e.eventIndex)) return 'Split event indices must be unique.';
    eventIds.add(e.eventIndex);
    if (!ids.has(e.splitterId) || !ids.has(e.splitteeId) || e.splitterId === e.splitteeId ||
      !Number.isInteger(e.fromLane) || !Number.isInteger(e.toLane) || Math.abs(e.fromLane - e.toLane) !== 1 ||
      e.lanesBefore.length !== cords.length || e.lanesAfter.length !== cords.length ||
      e.lanesBefore.some((c, i) => c.id !== previous[i]?.id) ||
      e.lanesBefore[e.fromLane - 1]?.id !== e.splitterId || e.lanesBefore[e.toLane - 1]?.id !== e.splitteeId) return `Invalid or discontinuous split event ${e.eventIndex}.`;
    const expected = e.lanesBefore.map(c => c.id);
    [expected[e.fromLane - 1], expected[e.toLane - 1]] = [expected[e.toLane - 1], expected[e.fromLane - 1]];
    if (e.lanesAfter.some((c, i) => c.id !== expected[i])) return `Invalid exchange at split event ${e.eventIndex}.`;
    previous = e.lanesAfter;
  }
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

/** The splittee owns its crossings, so its cap has to hide the splitter's full
 * width: half a diameter where the two meet square, and more as the crossing
 * turns oblique. The reach stays inside the two incident segments, and exact
 * Bézier subdivision avoids the detached capsules a straight bridge leaves.
 */
export function junctionPatch(splittee: NetworkCord, splitter: NetworkCord, node: number, diameter: number): NetworkJunction['patch'] {
  const k = splittee.nodes.indexOf(node);
  const before = splittee.curves[k - 1].points, after = splittee.curves[k].points;
  const along = leaving(after), across = leaving(splitter.curves[splitter.nodes.indexOf(node)].points);
  // Sine of the crossing angle; the floor caps the reach for near-parallel pairs.
  const reach = diameter * 0.62 / Math.max(0.5, Math.abs(along.x * across.y - along.y * across.x));
  const at = (p: CordCurve['points']) => Math.min(0.49, reach / Math.max(1e-8, curveLength(p)));
  return [splitCurve(before, 1 - at(before))[1], splitCurve(after, at(after))[0]];
}
/** Unit direction a curve leaves its first endpoint in, robust to flat handles. */
function leaving(p: CordCurve['points']): NetworkPoint {
  const q = curvePoint(p, 0.25), length = Math.hypot(q.x - p[0].x, q.y - p[0].y);
  return length < 1e-8 ? { x: 0, y: 0 } : { x: (q.x - p[0].x) / length, y: (q.y - p[0].y) / length };
}

export function splitCurve(p: CordCurve['points'], t: number): [CordCurve['points'], CordCurve['points']] {
  const a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), c = mix(p[2], p[3], t);
  const d = mix(a, b, t), e = mix(b, c, t), f = mix(d, e, t);
  return [[p[0], a, d, f], [f, e, c, p[3]]];
}
export const curvePoint = (p: CordCurve['points'], t: number) => splitCurve(p, t)[0][3];
export function curveLength(p: CordCurve['points']) {
  let length = 0, previous = p[0];
  for (let i = 1; i <= 8; i++) { const next = curvePoint(p, i / 8); length += distance(previous, next); previous = next; }
  return length;
}
const xy = (p: NetworkPoint) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
export const curvePath = (p: CordCurve['points'], move = true) => `${move ? `M${xy(p[0])}` : ''}C${xy(p[1])} ${xy(p[2])} ${xy(p[3])}`;

/** Sampled diagnostic, not a proof of finite-width physical clearance. */
export function findCurveCrossings(curves: CordCurve[]): NetworkPoint[] {
  const pieces: { a: NetworkPoint; b: NetworkPoint; curve: number; step: number }[] = [];
  const bins = new Map<string, number[]>(), reported = new Set<string>(), checked = new Set<string>();
  const conflicts: NetworkPoint[] = [];
  curves.forEach((curve, c) => {
    let a = curve.points[0];
    for (let k = 1; k <= 12; k++) {
      const b = curvePoint(curve.points, k / 12), i = pieces.length;
      pieces.push({ a, b, curve: c, step: k });
      for (let x = Math.floor(Math.min(a.x, b.x)); x <= Math.floor(Math.max(a.x, b.x)); x++) {
        for (let y = Math.floor(Math.min(a.y, b.y)); y <= Math.floor(Math.max(a.y, b.y)); y++) {
          const key = `${x}:${y}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key)!.push(i);
        }
      }
      a = b;
    }
  });
  for (const items of bins.values()) for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const i = items[a], j = items[b], p = pieces[i], q = pieces[j];
    if (p.curve === q.curve && Math.abs(p.step - q.step) <= 1) continue;
    const pair = `${Math.min(p.curve, q.curve)}:${Math.max(p.curve, q.curve)}`, key = `${i}:${j}`;
    if (reported.has(pair) || checked.has(key)) continue;
    checked.add(key);
    const ux = p.b.x - p.a.x, uy = p.b.y - p.a.y, vx = q.b.x - q.a.x, vy = q.b.y - q.a.y;
    const denominator = ux * vy - uy * vx;
    if (Math.abs(denominator) < 1e-10) continue;
    const dx = q.a.x - p.a.x, dy = q.a.y - p.a.y;
    const t = (dx * vy - dy * vx) / denominator, s = (dx * uy - dy * ux) / denominator;
    if (t >= -1e-7 && t <= 1 + 1e-7 && s >= -1e-7 && s <= 1 + 1e-7) {
      const point = mix(p.a, p.b, t), ca = curves[p.curve], cb = curves[q.curve];
      const legalJunction = [ca.from, ca.to].some(node => (node === cb.from || node === cb.to) && distance(point, ca.points[node === ca.from ? 0 : 3]) < 1e-6);
      if (legalJunction && p.curve !== q.curve) continue;
      reported.add(pair); conflicts.push(point);
    }
  }
  return conflicts;
}

export function portConflicts(events: SplitEvent[], cords: NetworkCord[]) {
  const ports = new Map<string, NetworkPoint>();
  for (const c of cords) for (const curve of c.curves) {
    ports.set(`${curve.from}:${c.id}:out`, { x: curve.points[1].x - curve.points[0].x, y: curve.points[1].y - curve.points[0].y });
    ports.set(`${curve.to}:${c.id}:in`, { x: curve.points[2].x - curve.points[3].x, y: curve.points[2].y - curve.points[3].y });
  }
  return events.flatMap((e, i) => {
    const a = e.lanesBefore[Math.min(e.fromLane, e.toLane) - 1].id;
    const b = e.lanesBefore[Math.max(e.fromLane, e.toLane) - 1].id;
    const directions = [`${a}:in`, `${b}:in`, `${a}:out`, `${b}:out`].map(key => ports.get(`${i}:${key}`)!);
    const angles = directions.map(p => Math.atan2(p.y, p.x));
    const turns = angles.map((a, k) => (angles[(k + 1) % 4] - a + 2 * Math.PI) % (2 * Math.PI));
    return directions.some(p => Math.hypot(p.x, p.y) < 1e-7) || turns.some(t => t < 1e-5) || Math.abs(turns.reduce((s, t) => s + t, 0) - 2 * Math.PI) > 1e-5 ? [e.eventIndex] : [];
  });
}

export type NetworkRenderOptions = {
  colors: Record<string, string>;
  face?: 'front' | 'back';
  showEventIds?: boolean;
  centerlines?: boolean;
  surface?: boolean;
};
const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Shared by the live preview and the reproducible photo-comparison exporter. */
export function renderCordNetworkSvg(layout: CordNetworkLayout, options: NetworkRenderOptions): string {
  const { width, height, diameter: d } = layout;
  const color = new Map(layout.cords.map(c => [c.id, escapeXml(options.colors[c.colorSymbol] ?? '#a89b84')]));
  const stroke = (path: string, fill: string, cap = 'round') => `<path d="${path}" stroke="${fill}" stroke-width="${d}" stroke-linecap="${cap}"/>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Experimental continuous cord network, ${layout.junctions.length} split events" style="display:block;width:100%;height:auto"><g transform="${options.face === 'back' ? `translate(${width} 0) scale(-1 1)` : ''}" fill="none" stroke-linejoin="round">`;
  for (const c of layout.cords) {
    const path = c.curves.map((s, i) => curvePath(s.points, i === 0)).join('');
    svg += `<g data-cord-id="${escapeXml(c.id)}"><title>${escapeXml(c.id)} · ${escapeXml(c.colorSymbol)}</title>${stroke(path, color.get(c.id)!)}</g>`;
  }
  if (options.surface) for (const patch of networkSurfacePatches(layout)) {
    const j = layout.junctions[patch.node];
    svg += `<path d="${patch.path}" fill="${color.get(j.event.splitteeId)}" stroke="${color.get(j.event.splitteeId)}" stroke-width=".015" data-event-index="${j.event.eventIndex}"/>`;
  }
  for (const j of layout.junctions) {
    const e = j.event, path = j.patch.map((p, i) => curvePath(p, i === 0)).join('');
    const title = `Split ${e.eventIndex} · row ${e.rowInstance} (source ${e.sourceRow}) · ${e.splitterId} through ${e.splitteeId}`;
    svg += `<g data-event-index="${e.eventIndex}"><title>${escapeXml(title)}</title>${options.surface ? `<path d="${path}" stroke="${color.get(e.splitteeId)}" stroke-width="${d}" stroke-linecap="butt"/>` : stroke(path, color.get(e.splitteeId)!, 'butt')}`;
    svg += '</g>';
  }
  if (options.centerlines) {
    for (const c of layout.cords) svg += `<path d="${c.curves.map((s, i) => curvePath(s.points, i === 0)).join('')}" stroke="#161c21" stroke-width=".035" stroke-opacity=".7" pointer-events="none"/>`;
    for (const j of layout.junctions) svg += `<circle cx="${j.position.x}" cy="${j.position.y}" r=".09" fill="#161c21" pointer-events="none"/>`;
  }
  if (options.showEventIds) for (const j of layout.junctions) {
    svg += `<text transform="translate(${j.position.x} ${j.position.y})${options.face === 'back' ? ' scale(-1 1)' : ''}" fill="#211b22" stroke="#fff9ec" stroke-width=".055" paint-order="stroke" font-family="monospace" font-size=".28" text-anchor="middle" dominant-baseline="central" pointer-events="none">${j.event.eventIndex}</text>`;
  }
  for (const p of layout.quality.crossingConflicts) svg += `<circle cx="${p.x}" cy="${p.y}" r=".3" stroke="#e02d25" stroke-width=".08" pointer-events="none"/>`;
  return `${svg}</g></svg>`;
}

/** Median dual of the embedded contact graph: a dense surface approximation.
 * Its cells follow actual cord curves and transition faces, not a lane grid.
 * All graph regions are partitioned among their incident splittee surfaces.
 */
export function networkSurfacePatches(layout: CordNetworkLayout): { node: number; path: string }[] {
  type Dart = { from: number; to: number; twin: number; points: CordCurve['points'] };
  const darts: Dart[] = [], around = new Map<number, number[]>();
  const add = (d: Dart) => {
    if (!around.has(d.from)) around.set(d.from, []);
    around.get(d.from)!.push(darts.length); darts.push(d);
  };
  for (const cord of layout.cords) for (const c of cord.curves) {
    const i = darts.length;
    add({ from: c.from, to: c.to, twin: i + 1, points: c.points });
    add({ from: c.to, to: c.from, twin: i, points: [...c.points].reverse() as CordCurve['points'] });
  }
  for (const ids of around.values()) ids.sort((a, b) => {
    const angle = (i: number) => Math.atan2(darts[i].points[1].y - darts[i].points[0].y, darts[i].points[1].x - darts[i].points[0].x);
    return angle(a) - angle(b);
  });
  const seen = new Set<number>(), patches: { node: number; path: string }[] = [];
  for (let first = 0; first < darts.length; first++) {
    if (seen.has(first)) continue;
    const face: Dart[] = []; let current = first;
    do {
      if (seen.has(current)) break;
      seen.add(current);
      const d = darts[current]; face.push(d);
      const ids = around.get(d.to)!;
      current = ids[(ids.indexOf(d.twin) + 1) % ids.length];
    } while (current !== first);
    if (current !== first || face.some(d => d.from >= layout.junctions.length)) continue;
    const samples = face.flatMap(d => Array.from({ length: 8 }, (_, k) => curvePoint(d.points, k / 8)));
    const center = { x: samples.reduce((s, p) => s + p.x, 0) / samples.length, y: samples.reduce((s, p) => s + p.y, 0) / samples.length };
    face.forEach((d, i) => {
      const outgoing = splitCurve(d.points, 0.5)[0];
      const incoming = splitCurve(face[(i + face.length - 1) % face.length].points, 0.5)[1];
      patches.push({ node: d.from, path: `${curvePath(outgoing)}L${xy(center)}L${xy(incoming[0])}${curvePath(incoming, false)}Z` });
    });
  }
  return patches;
}
