import type { Cord, Simulation, SplitEvent } from './types';
import { findCurveCrossings, junctionPatch, portConflicts, validate } from './cordNetwork.ts';
import type { CordCurve, CordNetworkLayout, NetworkCord, NetworkJunction, NetworkPoint } from './cordNetwork.ts';

/**
 * Spring-network layout of the split graph (docs/spring/README.md).
 *
 * Every cord segment is a spring at its pitch length, second-neighbour springs keep cords straight through a
 * split, port-pair springs set the crossing angle, a short-range repulsion keeps cords a diameter apart, and
 * weak all-pairs springs at graph distance (CrochetPARADE's scaffold) unfold the network before they are
 * annealed away. The shape is then a minimum of the physical energy, reached by under-damped dynamics.
 * Geometry is in cord diameters. Colours, faces, and row numbers never enter it.
 */
export type SpringNetworkOptions = {
  /** Axial/lateral ratio of a mesh cell, cot θ; cords cross at 2θ. */
  elongation?: number;
  /** Rendered thickness in cord diameters. The geometry is always packed at one diameter. */
  diameter?: number;
  pitch?: number;
  dMin?: number;
  turnLength?: number;
  terminalLength?: number;
  terminalWeight?: number;
  wBend?: number;
  wCross?: number;
  wRep?: number;
  wOrient?: number;
  orientMin?: number;
  iterations?: number;
  learningRate?: number;
  alphaMin?: number;
  /** Graph-distance cutoff for scaffold pairs, in diameters. The wiring seed is already planar, so a
   * local scaffold unfolds it; the full all-pairs form of docs/spring is slower and no more accurate. */
  scaffoldRadius?: number;
  polishSteps?: number;
  polishDt?: number;
  polishDamping?: number;
  /** The physical solve stops once no node feels a force above this. */
  tolerance?: number;
};
/** Called during the solve. `build` produces the current layout on demand so callers can throttle. */
export type SpringProgress = (progress: number, build: () => CordNetworkLayout) => void;

type Profile = Required<SpringNetworkOptions> & { theta: number };
type Spring = { a: number; b: number; rest: number; w: number };
type Graph = {
  n: number; cords: Cord[]; events: SplitEvent[]; count: number;
  kind: Uint8Array;                 // 0 junction, 1 start, 2 end, 3 midpoint
  fixed: Uint8Array;
  chains: { level: number[]; full: number[] }[];
  cordSprings: Spring[]; bends: Spring[]; crosses: Spring[];
  ports: Int32Array;                // per junction: a-in, b-in, a-out, b-out (adjacent nodes)
  excluded: Set<number>;
  scaffoldA: Int32Array; scaffoldB: Int32Array; scaffoldD: Float64Array;
  digons: number;
};

const clamp = (v: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(v) ? Math.max(min, Math.min(max, v!)) : fallback;
const KEY = 1048576;
const pairKey = (i: number, j: number) => i < j ? i * KEY + j : j * KEY + i;

export function resolveSpringProfile(options: SpringNetworkOptions = {}): Profile {
  const elongation = clamp(options.elongation, 1.35, 0.6, 2.4);
  const theta = Math.atan(1 / elongation);
  const pitch = clamp(options.pitch, 1 / Math.sin(2 * theta), 0.5, 3);
  return {
    elongation, theta, pitch,
    diameter: clamp(options.diameter, 1, 0.3, 1.6),
    dMin: clamp(options.dMin, 0.9, 0.3, 1.2),
    turnLength: clamp(options.turnLength, 1.2 * 2 * pitch * Math.cos(theta), 0.5, 5),
    terminalLength: clamp(options.terminalLength, 1.5 * pitch, 0.2, 5),
    terminalWeight: clamp(options.terminalWeight, 0.25, 0.01, 1),
    wBend: clamp(options.wBend, 0.1, 0, 5), wCross: clamp(options.wCross, 0.5, 0, 5),
    wRep: clamp(options.wRep, 1, 0, 5), wOrient: clamp(options.wOrient, 1, 0, 5),
    orientMin: clamp(options.orientMin, 0.05, 0, 0.5),
    iterations: Math.round(clamp(options.iterations, 200, 0, 5000)),
    learningRate: clamp(options.learningRate, 0.1, 1e-4, 1),
    alphaMin: clamp(options.alphaMin, 1e-3, 0, 1),
    scaffoldRadius: clamp(options.scaffoldRadius, 8, 1, 1e6),
    polishSteps: Math.round(clamp(options.polishSteps, 3000, 0, 20000)),
    polishDt: clamp(options.polishDt, 0.1, 0.01, 0.5),
    polishDamping: clamp(options.polishDamping, 0.1, 0, 5),
    tolerance: clamp(options.tolerance, 2e-3, 0, 1),
  };
}

export function buildSpringNetwork(simulation: Simulation, options: SpringNetworkOptions = {}, onProgress?: SpringProgress): CordNetworkLayout {
  const p = resolveSpringProfile(options);
  const cords = simulation.snapshots[0]?.lanes ?? [];
  const n = cords.length;
  const empty = (diagnostics: string[]): CordNetworkLayout => ({
    width: Math.max(4, n + 3), height: 8, diameter: p.diameter, cords: [], junctions: [], points: [], diagnostics,
    quality: { iterations: 0, residual: 0, converged: true, parallelPairs: 0, crossingConflicts: [], portConflicts: [], smoothing: 0, relaxationSteps: 0, bowScale: 1 },
  });
  const error = validate(simulation, cords);
  if (error) return empty([error]);
  if (!n) return empty([]);
  const g = buildGraph(simulation, cords, p);
  const result = solve(g, p, onProgress);
  return toLayout(g, p, result.pos, result);
}

// ---------------------------------------------------------------- graph
function buildGraph(simulation: Simulation, cords: Cord[], p: Profile): Graph {
  const events = simulation.events, n = cords.length;
  const kind: number[] = [];
  const add = (k: number) => kind.push(k) - 1;
  events.forEach(() => add(0));
  const cordPos = new Map(cords.map((c, i) => [c.id, i]));
  const visits: number[][] = cords.map(() => []);
  events.forEach((e, i) => { visits[cordPos.get(e.splitterId)!].push(i); visits[cordPos.get(e.splitteeId)!].push(i); });
  // Lane direction of a cord at an event: the splitter moves from→to, the splittee takes the splitter's old lane.
  const dirAt = (c: number, i: number) => (cordPos.get(events[i].splitterId) === c ? 1 : -1) * Math.sign(events[i].toLane - events[i].fromLane);
  const gapOf = (i: number) => Math.min(events[i].fromLane, events[i].toLane);
  const isTurn = (c: number, a: number, b: number) => dirAt(c, a) !== dirAt(c, b) && gapOf(a) === gapOf(b) && (gapOf(a) === 1 || gapOf(a) === n - 1);

  const cordSprings: Spring[] = [], reversal = new Set<number>(), chains: Graph['chains'] = [], segmentSeen = new Set<number>();
  let digons = 0;
  for (let c = 0; c < n; c++) {
    const start = add(1), end = add(2);
    const level = [start, ...visits[c], end], full = [start];
    for (let k = 1; k < level.length; k++) {
      const a = level[k - 1], b = level[k];
      if (kind[a] === 0 && kind[b] === 0) {
        const rev = dirAt(c, a) !== dirAt(c, b), turn = rev && isTurn(c, a, b);
        const m = add(3), rest = (turn ? p.turnLength : p.pitch) / 2;
        cordSprings.push({ a, b: m, rest, w: 1 }, { a: m, b, rest, w: 1 });
        if (rev) { reversal.add(pairKey(a, m)); reversal.add(pairKey(m, b)); }
        if (segmentSeen.has(pairKey(a, b))) digons++; else segmentSeen.add(pairKey(a, b));
        full.push(m, b);
      } else {
        cordSprings.push({ a, b, rest: p.terminalLength, w: p.terminalWeight });
        full.push(b);
      }
    }
    chains.push({ level, full });
  }
  const count = kind.length;
  const springByKey = new Map(cordSprings.map(s => [pairKey(s.a, s.b), s]));
  const fullIndex = chains.map(ch => new Map(ch.full.map((node, k) => [node, k])));
  const ports = new Int32Array(4 * events.length);
  events.forEach((e, i) => {
    const gap = gapOf(i);
    const port = (id: string) => { const c = cordPos.get(id)!, k = fullIndex[c].get(i)!; return [chains[c].full[k - 1], chains[c].full[k + 1]]; };
    const [ap, an] = port(e.lanesBefore[gap - 1].id), [bp, bn] = port(e.lanesBefore[gap].id);
    ports[4 * i] = ap; ports[4 * i + 1] = bp; ports[4 * i + 2] = an; ports[4 * i + 3] = bn;
  });
  // Straightness across every segment except those where the cord reverses lane direction.
  const bends: Spring[] = [];
  for (const { full } of chains) for (let k = 1; k < full.length - 1; k++) {
    if (reversal.has(pairKey(full[k - 1], full[k])) || reversal.has(pairKey(full[k], full[k + 1]))) continue;
    const e1 = springByKey.get(pairKey(full[k - 1], full[k]))!, e2 = springByKey.get(pairKey(full[k], full[k + 1]))!;
    bends.push({ a: full[k - 1], b: full[k + 1], rest: e1.rest + e2.rest, w: p.wBend * Math.min(e1.w, e2.w) });
  }
  // Crossing angle: the in-pair and out-pair of adjacent nodes at each junction, law of cosines at 2θ.
  const crosses: Spring[] = [];
  for (let i = 0; i < events.length; i++) for (const [q, r] of [[ports[4 * i], ports[4 * i + 1]], [ports[4 * i + 2], ports[4 * i + 3]]]) {
    const e1 = springByKey.get(pairKey(i, q))!, e2 = springByKey.get(pairKey(i, r))!;
    crosses.push({ a: q, b: r, rest: Math.sqrt(e1.rest ** 2 + e2.rest ** 2 - 2 * e1.rest * e2.rest * Math.cos(2 * p.theta)), w: p.wCross * Math.min(e1.w, e2.w) });
  }
  // Repulsion ignores adjacent pairs and the ports of one junction, where two cords physically overlap.
  const excluded = new Set<number>(springByKey.keys());
  for (let i = 0; i < events.length; i++) for (let u = 0; u < 4; u++) for (let v = u + 1; v < 4; v++) excluded.add(pairKey(ports[4 * i + u], ports[4 * i + v]));
  const fixed = new Uint8Array(count);
  chains.forEach((ch, c) => { if (!visits[c].length) { fixed[ch.level[0]] = 1; fixed[ch.level[ch.level.length - 1]] = 1; } });

  // Scaffold: graph distances over the junction-level graph, truncated at the scaffold radius.
  const level: number[] = [], levelIndex = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) if (kind[i] !== 3) { levelIndex[i] = level.length; level.push(i); }
  const adjacency: [number, number][][] = level.map(() => []);
  chains.forEach(({ level: chain }, c) => {
    for (let k = 1; k < chain.length; k++) {
      const a = chain[k - 1], b = chain[k];
      const rest = kind[a] === 0 && kind[b] === 0 ? (isTurn(c, a, b) ? p.turnLength : p.pitch) : p.terminalLength;
      adjacency[levelIndex[a]].push([levelIndex[b], rest]);
      adjacency[levelIndex[b]].push([levelIndex[a], rest]);
    }
  });
  const scaffoldA: number[] = [], scaffoldB: number[] = [], scaffoldD: number[] = [];
  const L = level.length, dist = new Float64Array(L), heapNode = new Int32Array(L * 8 + 8), heapDist = new Float64Array(L * 8 + 8);
  for (let s = 0; s < L; s++) {
    dist.fill(Infinity); dist[s] = 0;
    let size = 0;
    const push = (d: number, v: number) => {                    // binary min-heap on distance
      let i = size++;
      while (i > 0) { const parent = (i - 1) >> 1; if (heapDist[parent] <= d) break; heapDist[i] = heapDist[parent]; heapNode[i] = heapNode[parent]; i = parent; }
      heapDist[i] = d; heapNode[i] = v;
    };
    push(0, s);
    while (size > 0) {
      const d = heapDist[0], u = heapNode[0];
      size--;
      if (size > 0) {                                            // sift the last element down
        const ld = heapDist[size], lv = heapNode[size];
        let i = 0;
        for (;;) {
          let child = 2 * i + 1;
          if (child >= size) break;
          if (child + 1 < size && heapDist[child + 1] < heapDist[child]) child++;
          if (heapDist[child] >= ld) break;
          heapDist[i] = heapDist[child]; heapNode[i] = heapNode[child]; i = child;
        }
        heapDist[i] = ld; heapNode[i] = lv;
      }
      if (d > dist[u]) continue;
      if (u > s) { scaffoldA.push(level[s]); scaffoldB.push(level[u]); scaffoldD.push(d); }
      for (const [v, w] of adjacency[u]) {
        const nd = d + w;
        if (nd < dist[v] && nd <= p.scaffoldRadius) { dist[v] = nd; if (size < heapNode.length) push(nd, v); }
      }
    }
  }
  return { n, cords, events, count, kind: Uint8Array.from(kind), fixed, chains, cordSprings, bends, crosses, ports, excluded,
    scaffoldA: Int32Array.from(scaffoldA), scaffoldB: Int32Array.from(scaffoldB), scaffoldD: Float64Array.from(scaffoldD), digons };
}

// ---------------------------------------------------------------- energy
type NeighbourList = { pairs: Int32Array; reference: Float64Array; skin: number };

/** Candidate repulsion pairs within `dMin + skin`, valid until any node moves more than half the skin. */
function neighbourList(g: Graph, p: Profile, pos: Float64Array, skin: number): NeighbourList {
  const cell = p.dMin + skin, cutoff2 = cell * cell, grid = new Map<number, number[]>();
  const cellKey = (cx: number, cy: number) => (cx + 65536) * 131072 + (cy + 65536);
  for (let i = 0; i < g.count; i++) {
    const k = cellKey(Math.floor(pos[2 * i] / cell), Math.floor(pos[2 * i + 1] / cell));
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  }
  const pairs: number[] = [];
  for (let i = 0; i < g.count; i++) {
    const cx = Math.floor(pos[2 * i] / cell), cy = Math.floor(pos[2 * i + 1] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const list = grid.get(cellKey(cx + ox, cy + oy));
      if (!list) continue;
      for (const j of list) {
        if (j <= i || g.excluded.has(pairKey(i, j))) continue;
        const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1];
        if (dx * dx + dy * dy < cutoff2) pairs.push(i, j);
      }
    }
  }
  return { pairs: Int32Array.from(pairs), reference: Float64Array.from(pos), skin };
}
function neighbourListStale(list: NeighbourList, pos: Float64Array): boolean {
  const limit = (list.skin / 2) ** 2;
  for (let i = 0; i < pos.length; i += 2) {
    const dx = pos[i] - list.reference[i], dy = pos[i + 1] - list.reference[i + 1];
    if (dx * dx + dy * dy > limit) return true;
  }
  return false;
}

/** Accumulates −∇E into `grad` and returns the largest force on a free node. */
function evaluate(g: Graph, p: Profile, pos: Float64Array, grad: Float64Array, alpha: number, wOrient: number, withScaffold: boolean, neighbours: NeighbourList): number {
  grad.fill(0);
  const spring = (i: number, j: number, rest: number, w: number) => {       // E = ½ w (r − rest)²
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1], r = Math.sqrt(dx * dx + dy * dy);
    if (r < 1e-12) return;
    const f = w * (r - rest) / r;
    grad[2 * i] += f * dx; grad[2 * i + 1] += f * dy; grad[2 * j] -= f * dx; grad[2 * j + 1] -= f * dy;
  };
  for (const s of g.cordSprings) spring(s.a, s.b, s.rest, s.w);
  for (const s of g.bends) spring(s.a, s.b, s.rest, s.w);
  for (const s of g.crosses) spring(s.a, s.b, s.rest, s.w);
  if (p.wRep > 0) {                                                       // excluded volume over the neighbour list
    const pairs = neighbours.pairs, limit = p.dMin * p.dMin;
    for (let k = 0; k < pairs.length; k += 2) {
      const i = pairs[k], j = pairs[k + 1], dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1];
      if (dx * dx + dy * dy < limit) spring(i, j, p.dMin, p.wRep);
    }
  }
  if (withScaffold && alpha > 0) {
    for (let k = 0; k < g.scaffoldA.length; k++) { const d = g.scaffoldD[k]; spring(g.scaffoldA[k], g.scaffoldB[k], d, alpha / (d * d)); }
  }
  if (wOrient > 0) {                                                      // signed sector areas at each junction
    for (let i = 0; i < g.events.length; i++) for (let k = 0; k < 4; k++) {
      const a = g.ports[4 * i + k], b = g.ports[4 * i + (k + 1) % 4];
      const ux = pos[2 * a] - pos[2 * i], uy = pos[2 * a + 1] - pos[2 * i + 1], vx = pos[2 * b] - pos[2 * i], vy = pos[2 * b + 1] - pos[2 * i + 1];
      const area = ux * vy - uy * vx;
      if (area >= p.orientMin) continue;
      const dEdA = -wOrient * (p.orientMin - area);
      grad[2 * a] += dEdA * vy; grad[2 * a + 1] -= dEdA * vx;
      grad[2 * b] -= dEdA * uy; grad[2 * b + 1] += dEdA * ux;
      grad[2 * i] += dEdA * (uy - vy); grad[2 * i + 1] += dEdA * (vx - ux);
    }
  }
  let max = 0;
  for (let i = 0; i < g.count; i++) if (!g.fixed[i]) max = Math.max(max, Math.abs(grad[2 * i]), Math.abs(grad[2 * i + 1]));
  return max;
}

function orientationBalance(g: Graph, pos: Float64Array): { positive: number; negative: number } {
  let positive = 0, negative = 0;
  for (let i = 0; i < g.events.length; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const a = g.ports[4 * i + k], b = g.ports[4 * i + (k + 1) % 4];
      sum += (pos[2 * a] - pos[2 * i]) * (pos[2 * b + 1] - pos[2 * i + 1]) - (pos[2 * a + 1] - pos[2 * i + 1]) * (pos[2 * b] - pos[2 * i]);
    }
    if (sum > 0) positive++; else negative++;
  }
  return { positive, negative };
}

// ---------------------------------------------------------------- solver
/** Wiring-diagram seed: gap position across, event order along, in diameter units. A valid planar start. */
function wiringSeed(g: Graph, p: Profile): Float64Array {
  const pos = new Float64Array(2 * g.count), lateral = p.pitch * Math.sin(p.theta);
  const laneX = (lane: number) => (lane - (g.n + 1) / 2) * lateral;
  const rowPitch = 2 * p.pitch * Math.cos(p.theta) / Math.max(1, g.n - 1);
  g.events.forEach((e, i) => { pos[2 * i] = laneX((e.fromLane + e.toLane) / 2); pos[2 * i + 1] = (i + 0.5) * rowPitch; });
  const yEnd = g.events.length * rowPitch, finalLanes = g.events[g.events.length - 1]?.lanesAfter ?? g.cords;
  g.chains.forEach(({ level, full }, c) => {
    const start = level[0], end = level[level.length - 1];
    pos[2 * start] = laneX(c + 1); pos[2 * start + 1] = -p.terminalLength;
    pos[2 * end] = laneX(finalLanes.findIndex(cord => cord.id === g.cords[c].id) + 1); pos[2 * end + 1] = yEnd + p.terminalLength;
    for (let k = 1; k < full.length - 1; k++) if (g.kind[full[k]] === 3) {
      pos[2 * full[k]] = (pos[2 * full[k - 1]] + pos[2 * full[k + 1]]) / 2;
      pos[2 * full[k] + 1] = (pos[2 * full[k - 1] + 1] + pos[2 * full[k + 1] + 1]) / 2;
    }
  });
  return pos;
}

type SolveResult = { pos: Float64Array; iterations: number; steps: number; converged: boolean; residual: number; learningRate: number };

function solve(g: Graph, p: Profile, onProgress?: SpringProgress): SolveResult {
  const T = p.iterations, grad = new Float64Array(2 * g.count), skin = 0.5;
  let eta = p.learningRate, attempts = 0, pos = wiringSeed(g, p), neighbours = neighbourList(g, p, pos, skin);
  const forces = (alpha: number, wOrient: number, withScaffold: boolean) => {
    if (neighbourListStale(neighbours, pos)) neighbours = neighbourList(g, p, pos, skin);
    return evaluate(g, p, pos, grad, alpha, wOrient, withScaffold, neighbours);
  };
  const partial = (progress: number, steps: number) => onProgress?.(progress, () => toLayout(g, p, pos, { pos, iterations: T, steps, converged: false, residual: NaN, learningRate: eta }, false));
  attempt: while (attempts < 11) {
    attempts++;
    pos = wiringSeed(g, p);
    neighbours = neighbourList(g, p, pos, skin);
    for (let t = 0; t < T; t++) {
      const alpha = Math.sqrt(1 - t / T) + p.alphaMin, second = t >= T / 2;
      if (t === Math.floor(T / 2)) {                                       // majority vote picks the global mirror
        const balance = orientationBalance(g, pos);
        if (balance.negative > balance.positive) for (let i = 0; i < g.count; i++) pos[2 * i] = -pos[2 * i];
      }
      forces(alpha, second ? p.wOrient : 0, true);
      let blowUp = false;
      for (let i = 0; i < g.count && !blowUp; i++) {
        if (g.fixed[i]) continue;
        pos[2 * i] -= eta * grad[2 * i]; pos[2 * i + 1] -= eta * grad[2 * i + 1];
        if (!Number.isFinite(pos[2 * i]) || !Number.isFinite(pos[2 * i + 1]) || Math.abs(pos[2 * i]) > 1e5 || Math.abs(pos[2 * i + 1]) > 1e5) blowUp = true;
      }
      if (blowUp) { eta /= 3; continue attempt; }
      if (t % 50 === 49) partial(0.4 * t / T, 0);
    }
    break;
  }
  // Physical solve: rescale to the mean rest length, then under-damped dynamics on every term but the scaffold.
  let current = 0, target = 0;
  for (const s of g.cordSprings) { current += Math.hypot(pos[2 * s.a] - pos[2 * s.b], pos[2 * s.a + 1] - pos[2 * s.b + 1]); target += s.rest; }
  const scale = current > 1e-9 ? target / current : 1;
  for (let i = 0; i < g.count; i++) if (!g.fixed[i]) { pos[2 * i] *= scale; pos[2 * i + 1] *= scale; }
  const velocity = new Float64Array(2 * g.count), dt = p.polishDt, gamma = p.polishDamping;
  let steps = 0, residual = Infinity, converged = false;
  for (; steps < p.polishSteps; steps++) {
    residual = forces(0, p.wOrient, false);
    if (residual < p.tolerance) { converged = true; break; }
    for (let i = 0; i < 2 * g.count; i++) {
      if (g.fixed[i >> 1]) continue;
      velocity[i] = (-dt * grad[i] + 2 * velocity[i]) / (2 + dt * gamma);
      pos[i] += velocity[i] * dt;
    }
    if (steps % 100 === 99) partial(0.4 + 0.6 * steps / p.polishSteps, steps);
  }
  if (!converged && p.polishSteps > 0) residual = forces(0, p.wOrient, false);
  if (p.polishSteps === 0) { residual = 0; converged = true; }
  return { pos, iterations: T, steps, converged, residual, learningRate: eta };
}

// ---------------------------------------------------------------- layout
function align(g: Graph, source: Float64Array): Float64Array {
  const pos = Float64Array.from(source), J = g.events.length;
  if (!J) return pos;
  let cx = 0, cy = 0;
  for (let i = 0; i < J; i++) { cx += pos[2 * i]; cy += pos[2 * i + 1]; }
  cx /= J; cy /= J;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < J; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
  const rotate = (phi: number) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let i = 0; i < g.count; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; pos[2 * i] = c * x - s * y; pos[2 * i + 1] = s * x + c * y; }
    cx = 0; cy = 0;
  };
  rotate(Math.PI / 2 - 0.5 * Math.atan2(2 * sxy, sxx - syy));           // principal axis → vertical
  const meanY = (end: boolean) => g.chains.reduce((s, ch) => s + pos[2 * (end ? ch.level[ch.level.length - 1] : ch.level[0]) + 1], 0) / g.chains.length;
  if (meanY(false) > meanY(true)) rotate(Math.PI);                        // starts at the top
  const balance = orientationBalance(g, pos);
  if (balance.negative > balance.positive) for (let i = 0; i < g.count; i++) pos[2 * i] = -pos[2 * i];
  return pos;
}

function toLayout(g: Graph, p: Profile, raw: Float64Array, result: SolveResult, audit = true): CordNetworkLayout {
  const pos = align(g, raw), margin = 1.5 + p.diameter;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < g.count; i++) { minX = Math.min(minX, pos[2 * i]); maxX = Math.max(maxX, pos[2 * i]); minY = Math.min(minY, pos[2 * i + 1]); maxY = Math.max(maxY, pos[2 * i + 1]); }
  const at = (i: number): NetworkPoint => ({ x: pos[2 * i] - minX + margin, y: pos[2 * i + 1] - minY + margin });
  const E = g.events.length, exportIndex = new Int32Array(g.count).fill(-1);
  const points: NetworkPoint[] = [];
  for (let i = 0; i < E; i++) { exportIndex[i] = i; points.push(at(i)); }
  g.chains.forEach(({ level }, c) => {
    exportIndex[level[0]] = E + 2 * c; exportIndex[level[level.length - 1]] = E + 2 * c + 1;
  });
  g.chains.forEach(({ level }) => { points[exportIndex[level[0]]] = at(level[0]); points[exportIndex[level[level.length - 1]]] = at(level[level.length - 1]); });
  const cords: NetworkCord[] = g.chains.map(({ level, full }, c) => {
    const nodes = level.map(i => exportIndex[i]), curves: CordCurve[] = [];
    let k = 0;
    for (let f = 1; f < full.length; f++) {
      const from = full[f - 1], node = full[f];
      if (g.kind[node] === 3) {                                            // cubic through the midpoint at t = ½
        const to = full[f + 1], a = points[exportIndex[from]], b = points[exportIndex[to]], m = at(node);
        // Passes through the midpoint node at t = ½ with end tangents along the solved polyline directions.
        const c1 = { x: a.x + 4 / 3 * (m.x - a.x), y: a.y + 4 / 3 * (m.y - a.y) }, c2 = { x: b.x + 4 / 3 * (m.x - b.x), y: b.y + 4 / 3 * (m.y - b.y) };
        curves.push({ id: `${g.cords[c].id}:${k}`, cordId: g.cords[c].id, from: exportIndex[from], to: exportIndex[to], points: [a, c1, c2, b] });
        f++; k++;
      } else {
        const a = points[exportIndex[from]], b = points[exportIndex[node]];
        curves.push({ id: `${g.cords[c].id}:${k}`, cordId: g.cords[c].id, from: exportIndex[from], to: exportIndex[node],
          points: [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 }, b] });
        k++;
      }
    }
    return { ...g.cords[c], nodes, curves };
  });
  const byId = new Map(cords.map(c => [c.id, c]));
  const junctions = g.events.map((event, i): NetworkJunction => ({
    event, position: points[i], patch: junctionPatch(byId.get(event.splitteeId)!, byId.get(event.splitterId)!, i, p.diameter),
  }));
  // The topology audit is for finished geometry; intermediate frames skip it so previews stay cheap.
  const crossingConflicts = audit ? findCurveCrossings(cords.flatMap(c => c.curves)) : [];
  const ports = audit && E ? portConflicts(g.events, cords) : [];
  const diagnostics: string[] = [];
  if (!E) diagnostics.push('No splits yet: the cords are shown before they are joined.');
  if (!result.converged && Number.isFinite(result.residual)) diagnostics.push('The physical solve reached its step limit before every force settled.');
  if (crossingConflicts.length) diagnostics.push(`${crossingConflicts.length} unintended sampled curve intersections; geometry is unresolved.`);
  if (ports.length) diagnostics.push(`${ports.length} junctions have unresolved port order.`);
  return {
    width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin, diameter: p.diameter, cords, junctions, points, diagnostics,
    quality: { iterations: result.iterations, residual: Number.isFinite(result.residual) ? result.residual : 0, converged: result.converged, parallelPairs: g.digons,
      crossingConflicts, portConflicts: ports, smoothing: 0, relaxationSteps: result.steps, bowScale: 1 },
  };
}
