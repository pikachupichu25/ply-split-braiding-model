import type { Cord, Simulation } from './types';
import { findCurveCrossings, junctionPatch, portConflicts, validate } from './cordNetwork.ts';
import type { CordCurve, CordNetworkLayout, NetworkCord, NetworkJunction, NetworkPoint } from './cordNetwork.ts';
import { buildElasticNetwork } from './elasticNetwork.ts';

/**
 * Packed model: taut, incompressible cords (docs/packed/README.md, results in docs/packed/findings.md).
 *
 * Nothing here has a rest length. Every cord is a tube of one diameter that may not overlap another, and it
 * carries a constant tension along its length, so it is as short and as straight as its neighbours allow.
 * Pressing the fabric compact and pulling each cord tight are the same term in a threaded network, so the
 * pitch, the strip width and the selvedge loops are outputs rather than parameters. A packed lattice still has
 * one free shear mode, which a working pull on the cord ends selects; that pull is the only dial.
 *
 * The solve starts from the elastic layout, which is planar and has the right handedness, and tightens it.
 * Geometry is in cord diameters. Colours, faces and row numbers never enter it.
 */
export type PackedNetworkOptions = {
  /** Axial/lateral ratio of a mesh cell, cot θ. Sets the working pull through `cos 2θ / cos³ θ`. */
  elongation?: number;
  /** Rendered thickness in cord diameters. The geometry is always packed at one diameter. */
  diameter?: number;
  /** Working pull per cord end in units of the tension. Overrides the value `elongation` implies. */
  pull?: number;
  /** Most glancing split allowed, in radians; sets how close two cords may come at a shared junction. */
  phiMin?: number;
  /** Minimum bend radius of a centreline, from incompressibility. */
  rmin?: number;
  /** Sample spacing along a cord. */
  h?: number;
  /** Wall and bend-limit stiffness. Numerical, not physical. */
  kw?: number;
  kb?: number;
  wOrient?: number;
  orientMin?: number;
  dt?: number;
  gamma?: number;
  steps?: number;
  /** Steps over which the wall and bend stiffness rise to full, so tension straightens the seed first. */
  ramp?: number;
  /** The solve is settled once the angle and width have been stationary for this many steps. */
  settle?: number;
  settleAngle?: number;
  settleWidth?: number;
  /** Largest distance one sample may move in a step, so nothing tunnels through a wall. */
  cap?: number;
  /** Drawn length of the loose tails beyond a cord's first and last junction. */
  tail?: number;
  /** Verlet skin for the contact neighbour list. */
  skin?: number;
  /** Wall-clock budget for the tightening solve. Large patterns stop here and report that they did. */
  budgetMs?: number;
};
/** Called during the solve. `build` produces the current layout on demand so callers can throttle. */
export type PackedProgress = (progress: number, build: () => CordNetworkLayout) => void;

type Profile = Required<PackedNetworkOptions> & { theta: number; selfExempt: number };

const JUNCTION = 0, TAIL = 1, SAMPLE = 2;
const TURN = 1, REVERSAL = 2;

const clamp = (v: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(v) ? Math.max(min, Math.min(max, v!)) : fallback;
/** Working pull that holds a half-angle θ in an infinite sheet (README §2.4). A narrow strip needs more. */
export const pullForTheta = (theta: number) => Math.cos(2 * theta) / Math.cos(theta) ** 3;

export function resolvePackedProfile(options: PackedNetworkOptions = {}): Profile {
  const elongation = clamp(options.elongation, 1.35, 0.6, 2.4);
  const theta = Math.atan(1 / elongation);
  return {
    elongation, theta,
    diameter: clamp(options.diameter, 1, 0.3, 1.6),
    pull: clamp(options.pull, Math.max(0, pullForTheta(theta)), 0, 2),
    phiMin: clamp(options.phiMin, 30 * Math.PI / 180, 0, Math.PI / 2),
    rmin: clamp(options.rmin, 0.5, 0.25, 3),
    h: clamp(options.h, 1 / 3, 0.15, 1),
    kw: clamp(options.kw, 50, 1, 500),
    kb: clamp(options.kb, 5, 0, 100),
    wOrient: clamp(options.wOrient, 1, 0, 5),
    orientMin: clamp(options.orientMin, 0.05, 0, 0.5),
    dt: clamp(options.dt, 0.1, 0.01, 0.5),
    gamma: clamp(options.gamma, 3, 0, 20),
    steps: Math.round(clamp(options.steps, 4000, 0, 60000)),
    ramp: Math.round(clamp(options.ramp, 200, 0, 5000)),
    settle: Math.round(clamp(options.settle, 300, 50, 5000)),
    settleAngle: clamp(options.settleAngle, 0.1, 0.001, 5),
    settleWidth: clamp(options.settleWidth, 0.002, 1e-5, 0.1),
    cap: clamp(options.cap, 0.1, 0.01, 0.5),
    tail: clamp(options.tail, 1.5, 0.2, 5),
    skin: clamp(options.skin, 0.25, 0.05, 2),
    budgetMs: clamp(options.budgetMs, 20000, 0, 600000),
    selfExempt: 1.6,
  };
}

type Graph = {
  n: number; cords: Cord[]; events: Simulation['events']; count: number; E: number;
  kind: Uint8Array;
  pos: Float64Array;
  /** Per segment: its two junction nodes, cord, flags, live length and arc start along the cord. */
  segA: Int32Array; segB: Int32Array; segCord: Int32Array; segFlags: Uint8Array; segLen: Float64Array; segArc: Float64Array;
  segSampleStart: Int32Array; segSampleCount: Int32Array; segSamples: Int32Array;
  segLinkStart: Int32Array; segLinkCount: Int32Array; segments: number;
  /** Per link: endpoints, owning segment, and the arc distances of its ends from that segment's `a` junction. */
  linkI: Int32Array; linkJ: Int32Array; linkSeg: Int32Array; linkD0: Float64Array; linkD1: Float64Array; links: number;
  chainPrev: Int32Array; chainNext: Int32Array;
  ports: Int32Array;
  cordFirst: Int32Array; cordLast: Int32Array;
  /** Junction-level and full chains per cord, for rendering. */
  chainStart: Int32Array; chainCount: Int32Array; chains: Int32Array;
  fullStart: Int32Array; fullCount: Int32Array; fulls: Int32Array;
  /** Unit direction each drawn tail leaves its cord's first/last junction in, taken from the seed. */
  tailDir: Float64Array;
  solved: Int32Array;
  digons: number;
  /** Scratch reused every step, so the hot loop allocates nothing. */
  arcOfCord: Float64Array; rx: Float64Array; ry: Float64Array; rc: Float64Array;
};

// ---------------------------------------------------------------- graph
const mix = (a: NetworkPoint, b: NetworkPoint, t: number): NetworkPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function cubicAt(p: CordCurve['points'], t: number): NetworkPoint {
  const a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), c = mix(p[2], p[3], t);
  return mix(mix(a, b, t), mix(b, c, t), t);
}
/** `m` points at equal arc length along a cubic, excluding its ends, plus the cubic's length. */
function sampleCubic(p: CordCurve['points'], m: number) {
  const pts: NetworkPoint[] = [], cum = [0];
  for (let k = 0; k <= 32; k++) pts.push(cubicAt(p, k / 32));
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const total = cum[cum.length - 1], out: NetworkPoint[] = [];
  for (let i = 1; i <= m; i++) {
    const target = total * i / (m + 1);
    let k = 1;
    while (k < cum.length - 1 && cum[k] < target) k++;
    out.push(mix(pts[k - 1], pts[k], (target - cum[k - 1]) / Math.max(1e-12, cum[k] - cum[k - 1])));
  }
  return { points: out, length: total };
}

function buildGraph(simulation: Simulation, cords: Cord[], seed: CordNetworkLayout, p: Profile): Graph {
  const events = simulation.events, n = cords.length, E = events.length;
  const cordPos = new Map(cords.map((c, i) => [c.id, i]));
  const visits: number[][] = cords.map(() => []);
  events.forEach((e, i) => { visits[cordPos.get(e.splitterId)!].push(i); visits[cordPos.get(e.splitteeId)!].push(i); });
  const dirAt = (c: number, i: number) => (cordPos.get(events[i].splitterId) === c ? 1 : -1) * Math.sign(events[i].toLane - events[i].fromLane);
  const gapOf = (i: number) => Math.min(events[i].fromLane, events[i].toLane);

  const kind: number[] = [], px: number[] = [];
  const add = (k: number, at: NetworkPoint) => { px.push(at.x, at.y); return kind.push(k) - 1; };
  for (let i = 0; i < E; i++) add(JUNCTION, seed.points[i]);
  const segA: number[] = [], segB: number[] = [], segCord: number[] = [], segFlags: number[] = [];
  const segSamples: number[] = [], segSampleStart: number[] = [], segSampleCount: number[] = [];
  const chainsFlat: number[] = [], chainStart: number[] = [], chainCount: number[] = [];
  const fullsFlat: number[] = [], fullStart: number[] = [], fullCount: number[] = [];
  const cordFirst = new Int32Array(n).fill(-1), cordLast = new Int32Array(n).fill(-1);

  for (let c = 0; c < n; c++) {
    const seedCord = seed.cords.find(x => x.id === cords[c].id)!;
    const chain = visits[c];
    const start = add(TAIL, seed.points[E + 2 * c]), end = add(TAIL, seed.points[E + 2 * c + 1]);
    const level = [start, ...chain, end];
    const full = [start];
    for (let k = 1; k < level.length; k++) {
      const a = level[k - 1], b = level[k];
      if (kind[a] === JUNCTION && kind[b] === JUNCTION) {
        const reversal = dirAt(c, a) !== dirAt(c, b);
        const turn = reversal && gapOf(a) === gapOf(b) && (gapOf(a) === 1 || gapOf(a) === n - 1);
        const probe = sampleCubic(seedCord.curves[k - 1].points, 1);
        const m = Math.max(2, Math.round(probe.length / p.h) - 1);
        const { points } = sampleCubic(seedCord.curves[k - 1].points, m);
        const s = segA.length;
        segA.push(a); segB.push(b); segCord.push(c); segFlags.push((turn ? TURN : 0) | (reversal ? REVERSAL : 0));
        segSampleStart.push(segSamples.length); segSampleCount.push(m);
        for (const q of points) { const node = add(SAMPLE, q); segSamples.push(node); full.push(node); }
        full.push(b);
        void s;
      } else full.push(b);
    }
    if (chain.length) { cordFirst[c] = chain[0]; cordLast[c] = chain[chain.length - 1]; }
    chainStart.push(chainsFlat.length); chainCount.push(level.length); chainsFlat.push(...level);
    fullStart.push(fullsFlat.length); fullCount.push(full.length); fullsFlat.push(...full);
  }
  const count = kind.length, segments = segA.length;
  let maxSeg = 0;
  for (const m of segSampleCount) if (m > maxSeg) maxSeg = m;

  // Links along every segment, and the chain neighbours of each sample.
  const linkI: number[] = [], linkJ: number[] = [], linkSeg: number[] = [];
  const segLinkStart = new Int32Array(segments), segLinkCount = new Int32Array(segments);
  const chainPrev = new Int32Array(count).fill(-1), chainNext = new Int32Array(count).fill(-1);
  for (let s = 0; s < segments; s++) {
    segLinkStart[s] = linkI.length;
    const first = segSampleStart[s], countS = segSampleCount[s];
    let previous = segA[s];
    for (let k = 0; k < countS; k++) {
      const node = segSamples[first + k];
      linkI.push(previous); linkJ.push(node); linkSeg.push(s);
      chainPrev[node] = previous;
      previous = node;
    }
    linkI.push(previous); linkJ.push(segB[s]); linkSeg.push(s);
    for (let k = 0; k < countS; k++) {
      const node = segSamples[first + k];
      chainNext[node] = k + 1 < countS ? segSamples[first + k + 1] : segB[s];
    }
    segLinkCount[s] = linkI.length - segLinkStart[s];
  }

  // Ports: the adjacent nodes along each cord at a junction, in cyclic order a-in, b-in, a-out, b-out.
  const fullIndex = cords.map((_, c) => {
    const map = new Map<number, number>();
    for (let k = 0; k < fullCount[c]; k++) map.set(fullsFlat[fullStart[c] + k], k);
    return map;
  });
  const ports = new Int32Array(4 * E);
  events.forEach((e, i) => {
    const gap = gapOf(i);
    const port = (id: string) => {
      const c = cordPos.get(id)!, k = fullIndex[c].get(i)!;
      return [fullsFlat[fullStart[c] + k - 1], fullsFlat[fullStart[c] + k + 1]];
    };
    const [ap, an] = port(e.lanesBefore[gap - 1].id), [bp, bn] = port(e.lanesBefore[gap].id);
    ports[4 * i] = ap; ports[4 * i + 1] = bp; ports[4 * i + 2] = an; ports[4 * i + 3] = bn;
  });

  // The tails are drawn, not solved. Their directions come from the elastic seed, which does solve them with
  // repulsion, so neighbouring tails keep the fan they had there instead of colliding as straight extensions.
  const tailDir = new Float64Array(4 * n);
  for (let c = 0; c < n; c++) {
    const base = fullStart[c], countF = fullCount[c];
    const startTail = fullsFlat[base], endTail = fullsFlat[base + countF - 1];
    const first = cordFirst[c], last = cordLast[c];
    const set = (slot: number, tail: number, anchor: number) => {
      const dx = px[2 * tail] - px[2 * anchor], dy = px[2 * tail + 1] - px[2 * anchor + 1];
      const len = Math.hypot(dx, dy) || 1;
      tailDir[slot] = dx / len; tailDir[slot + 1] = dy / len;
    };
    if (first >= 0) { set(4 * c, startTail, first); set(4 * c + 2, endTail, last); }
  }
  const solved: number[] = [];
  for (let i = 0; i < count; i++) if (kind[i] !== TAIL) solved.push(i);
  // Digons: two segments joining the same pair of junctions.
  const span = new Set<number>();
  let digons = 0;
  for (let s = 0; s < segments; s++) {
    const key = Math.min(segA[s], segB[s]) * 1048576 + Math.max(segA[s], segB[s]);
    if (span.has(key)) digons++; else span.add(key);
  }
  return {
    n, cords, events, count, E,
    kind: Uint8Array.from(kind), pos: Float64Array.from(px),
    segA: Int32Array.from(segA), segB: Int32Array.from(segB), segCord: Int32Array.from(segCord), segFlags: Uint8Array.from(segFlags),
    segLen: new Float64Array(segments), segArc: new Float64Array(segments),
    segSampleStart: Int32Array.from(segSampleStart), segSampleCount: Int32Array.from(segSampleCount), segSamples: Int32Array.from(segSamples),
    segLinkStart, segLinkCount, segments,
    linkI: Int32Array.from(linkI), linkJ: Int32Array.from(linkJ), linkSeg: Int32Array.from(linkSeg),
    linkD0: new Float64Array(linkI.length), linkD1: new Float64Array(linkI.length), links: linkI.length,
    chainPrev, chainNext, ports, cordFirst, cordLast,
    chainStart: Int32Array.from(chainStart), chainCount: Int32Array.from(chainCount), chains: Int32Array.from(chainsFlat),
    fullStart: Int32Array.from(fullStart), fullCount: Int32Array.from(fullCount), fulls: Int32Array.from(fullsFlat), tailDir,
    solved: Int32Array.from(solved), digons,
    arcOfCord: new Float64Array(n), rx: new Float64Array(maxSeg + 2), ry: new Float64Array(maxSeg + 2), rc: new Float64Array(maxSeg + 2),
  };
}

// ---------------------------------------------------------------- geometry bookkeeping
/** Live segment lengths, per-link arc positions, per-segment arc start along its cord, and the drawn tails. */
function measure(g: Graph, pos: Float64Array, p: Profile) {
  for (let s = 0; s < g.segments; s++) {
    const start = g.segLinkStart[s], countL = g.segLinkCount[s];
    let arc = 0;
    for (let k = 0; k < countL; k++) {
      const l = start + k, i = g.linkI[l], j = g.linkJ[l];
      g.linkD0[l] = arc;
      const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1];
      arc += Math.sqrt(dx * dx + dy * dy);
      g.linkD1[l] = arc;
    }
    g.segLen[s] = arc;
  }
  // Arc of each segment's start along its cord, in the order the cord visits them.
  const arcOfCord = g.arcOfCord;
  arcOfCord.fill(0);
  for (let s = 0; s < g.segments; s++) {
    const c = g.segCord[s];
    g.segArc[s] = arcOfCord[c];
    arcOfCord[c] += g.segLen[s];
  }
  for (let c = 0; c < g.n; c++) {
    const first = g.cordFirst[c], last = g.cordLast[c];
    if (first < 0) continue;
    const base = g.fullStart[c], countF = g.fullCount[c];
    const startTail = g.fulls[base], endTail = g.fulls[base + countF - 1];
    pos[2 * startTail] = pos[2 * first] + p.tail * g.tailDir[4 * c];
    pos[2 * startTail + 1] = pos[2 * first + 1] + p.tail * g.tailDir[4 * c + 1];
    pos[2 * endTail] = pos[2 * last] + p.tail * g.tailDir[4 * c + 2];
    pos[2 * endTail + 1] = pos[2 * last + 1] + p.tail * g.tailDir[4 * c + 3];
  }
}

/** Closest points of two links (Ericson, Real-Time Collision Detection §5.1.9), in 2D. */
type Closest = { s: number; t: number; dx: number; dy: number; r: number };
const closest: Closest = { s: 0, t: 0, dx: 0, dy: 0, r: 0 };
function closestPoints(pos: Float64Array, i1: number, j1: number, i2: number, j2: number): Closest {
  const p1x = pos[2 * i1], p1y = pos[2 * i1 + 1], p2x = pos[2 * i2], p2y = pos[2 * i2 + 1];
  const d1x = pos[2 * j1] - p1x, d1y = pos[2 * j1 + 1] - p1y;
  const d2x = pos[2 * j2] - p2x, d2y = pos[2 * j2 + 1] - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  const clampU = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
  let s = 0, t = 0;
  if (a > 1e-12 || e > 1e-12) {
    if (a <= 1e-12) t = clampU(f / e);
    else {
      const c = d1x * rx + d1y * ry;
      if (e <= 1e-12) s = clampU(-c / a);
      else {
        const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
        s = den > 1e-12 ? clampU((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clampU(-c / a); } else if (t > 1) { t = 1; s = clampU((b - c) / a); }
      }
    }
  }
  const dx = p1x + s * d1x - (p2x + t * d2x), dy = p1y + s * d1y - (p2y + t * d2y);
  closest.s = s; closest.t = t; closest.dx = dx; closest.dy = dy; closest.r = Math.sqrt(dx * dx + dy * dy);
  return closest;
}

/** Clearance between two links at their closest points: one diameter, or, near a junction their cords share,
 * what two straight tubes crossing there at `φ_min` would have. −1 marks an exempt pair. */
function clearanceOf(g: Graph, p: Profile, l1: number, l2: number, s: number, t: number, cosPhi: number): number {
  const sa = g.linkSeg[l1], sb = g.linkSeg[l2];
  const xA = g.linkD0[l1] + s * (g.linkD1[l1] - g.linkD0[l1]);
  const xB = g.linkD0[l2] + t * (g.linkD1[l2] - g.linkD0[l2]);
  if (g.segCord[sa] === g.segCord[sb]) return Math.abs(g.segArc[sa] + xA - (g.segArc[sb] + xB)) < p.selfExempt ? -1 : 1;
  let c = 1;
  const aJ = g.segA[sa], bJ = g.segB[sa], aK = g.segA[sb], bK = g.segB[sb];
  const da0 = xA, da1 = g.segLen[sa] - xA, db0 = xB, db1 = g.segLen[sb] - xB;
  const test = (da: number, db: number) => {
    const v = Math.sqrt(Math.max(0, da * da + db * db - 2 * da * db * cosPhi));
    if (v < c) c = v;
  };
  if (aJ === aK) test(da0, db0);
  if (aJ === bK) test(da0, db1);
  if (bJ === aK) test(da1, db0);
  if (bJ === bK) test(da1, db1);
  return c;
}

// ---------------------------------------------------------------- contacts
type Neighbours = { pairs: Int32Array; length: number; reference: Float64Array; skin: number };
/** Candidate link pairs whose tubes could touch, valid until some node moves half the skin. */
function neighbourList(g: Graph, p: Profile, pos: Float64Array): Neighbours {
  const mx = new Float64Array(g.links), my = new Float64Array(g.links), half = new Float64Array(g.links);
  let longest = 0;
  for (let l = 0; l < g.links; l++) {
    const i = g.linkI[l], j = g.linkJ[l];
    mx[l] = (pos[2 * i] + pos[2 * j]) / 2; my[l] = (pos[2 * i + 1] + pos[2 * j + 1]) / 2;
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1];
    half[l] = Math.sqrt(dx * dx + dy * dy) / 2;
    if (half[l] > longest) longest = half[l];
  }
  // A cell wide enough that any pair able to touch within the skin lies in the 3x3 neighbourhood. Segments
  // stretch during the solve, so this follows the longest live link rather than the nominal sample spacing.
  const cell = 1 + 2 * longest + p.skin, grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => (cx + 65536) * 131072 + (cy + 65536);
  for (let l = 0; l < g.links; l++) {
    const k = key(Math.floor(mx[l] / cell), Math.floor(my[l] / cell));
    const list = grid.get(k);
    if (list) list.push(l); else grid.set(k, [l]);
  }
  const pairs: number[] = [];
  for (let l1 = 0; l1 < g.links; l1++) {
    const cx = Math.floor(mx[l1] / cell), cy = Math.floor(my[l1] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const list = grid.get(key(cx + ox, cy + oy));
      if (!list) continue;
      for (const l2 of list) {
        if (l2 <= l1) continue;
        // Exact bound: the tubes can only meet if their midpoints are within a diameter plus both half lengths.
        const reach = 1 + half[l1] + half[l2] + p.skin;
        const dx = mx[l1] - mx[l2], dy = my[l1] - my[l2];
        if (dx * dx + dy * dy > reach * reach) continue;
        if (g.linkSeg[l1] === g.linkSeg[l2] && Math.abs(g.linkD0[l1] - g.linkD0[l2]) < p.selfExempt) continue;
        pairs.push(l1, l2);
      }
    }
  }
  return { pairs: Int32Array.from(pairs), length: pairs.length / 2, reference: Float64Array.from(pos), skin: p.skin };
}
function neighboursStale(list: Neighbours, pos: Float64Array): boolean {
  const limit = (list.skin / 2) ** 2;
  for (let i = 0; i < pos.length; i += 2) {
    const dx = pos[i] - list.reference[i], dy = pos[i + 1] - list.reference[i + 1];
    if (dx * dx + dy * dy > limit) return true;
  }
  return false;
}

// ---------------------------------------------------------------- energy
type Forces = { maxGrad: number; contacts: number; overlap: number };
const forcesOut: Forces = { maxGrad: 0, contacts: 0, overlap: 0 };

function evaluate(g: Graph, p: Profile, pos: Float64Array, grad: Float64Array, neighbours: Neighbours, ramp: number): Forces {
  grad.fill(0);
  measure(g, pos, p);
  const kw = p.kw * ramp, kb = p.kb * ramp;
  // Tension: a constant pull along every link, so a cord is straight unless something touches it.
  for (let l = 0; l < g.links; l++) {
    const i = g.linkI[l], j = g.linkJ[l];
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1], r2 = dx * dx + dy * dy;
    if (r2 < 1e-24) continue;
    const f = 1 / Math.sqrt(r2);
    grad[2 * i] += f * dx; grad[2 * i + 1] += f * dy;
    grad[2 * j] -= f * dx; grad[2 * j + 1] -= f * dy;
  }
  // Walls: one-sided penalty wherever two tubes are closer than their clearance.
  const cosPhi = Math.cos(p.phiMin), pairs = neighbours.pairs;
  let contacts = 0, overlap = 0;
  for (let k = 0; k < pairs.length; k += 2) {
    const l1 = pairs[k], l2 = pairs[k + 1];
    const a1 = g.linkI[l1], b1 = g.linkJ[l1], a2 = g.linkI[l2], b2 = g.linkJ[l2];
    const cp = closestPoints(pos, a1, b1, a2, b2);
    if (cp.r >= 1) continue;
    const c = clearanceOf(g, p, l1, l2, cp.s, cp.t, cosPhi);
    if (c <= 0 || cp.r >= c) continue;
    const over = c - cp.r;
    contacts++;
    if (over > overlap) overlap = over;
    const f = -kw * over / Math.max(cp.r, 1e-9), fx = f * cp.dx, fy = f * cp.dy, s = cp.s, t = cp.t;
    grad[2 * a1] += (1 - s) * fx; grad[2 * a1 + 1] += (1 - s) * fy;
    grad[2 * b1] += s * fx; grad[2 * b1 + 1] += s * fy;
    grad[2 * a2] -= (1 - t) * fx; grad[2 * a2 + 1] -= (1 - t) * fy;
    grad[2 * b2] -= t * fx; grad[2 * b2 + 1] -= t * fy;
  }
  // Bend limit, at free samples only: a cord gripped inside another may kink, elsewhere it cannot.
  if (kb > 0) {
    const psiMax = 2 * Math.asin(Math.min(1, p.h / (2 * p.rmin)));
    for (let idx = 0; idx < g.solved.length; idx++) {
      const node = g.solved[idx];
      const prev = g.chainPrev[node];
      if (prev < 0) continue;
      const next = g.chainNext[node];
      const ux = pos[2 * prev] - pos[2 * node], uy = pos[2 * prev + 1] - pos[2 * node + 1];
      const vx = pos[2 * next] - pos[2 * node], vy = pos[2 * next + 1] - pos[2 * node + 1];
      const dot = ux * vx + uy * vy, cross = ux * vy - uy * vx, den = dot * dot + cross * cross;
      if (den < 1e-18) continue;
      const alpha = Math.atan2(cross, dot), psi = Math.PI - Math.abs(alpha);
      if (psi <= psiMax) continue;
      const dEdAlpha = -Math.sign(alpha) * kb * (psi - psiMax);
      const dux = (dot * vy - cross * vx) / den, duy = (-dot * vx - cross * vy) / den;
      const dvx = (-dot * uy - cross * ux) / den, dvy = (dot * ux - cross * uy) / den;
      grad[2 * prev] += dEdAlpha * dux; grad[2 * prev + 1] += dEdAlpha * duy;
      grad[2 * next] += dEdAlpha * dvx; grad[2 * next + 1] += dEdAlpha * dvy;
      grad[2 * node] -= dEdAlpha * (dux + dvx); grad[2 * node + 1] -= dEdAlpha * (duy + dvy);
    }
  }
  // Working pull along the braid axis, at each cord's first and last junction.
  if (p.pull > 0) {
    let ax = 0, ay = 0, bx = 0, by = 0, m = 0;
    for (let c = 0; c < g.n; c++) {
      const first = g.cordFirst[c], last = g.cordLast[c];
      if (first < 0) continue;
      ax += pos[2 * first]; ay += pos[2 * first + 1]; bx += pos[2 * last]; by += pos[2 * last + 1]; m++;
    }
    if (m) {
      const len = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / len, uy = (by - ay) / len;
      for (let c = 0; c < g.n; c++) {
        const first = g.cordFirst[c], last = g.cordLast[c];
        if (first < 0 || first === last) continue;
        grad[2 * last] -= p.pull * ux; grad[2 * last + 1] -= p.pull * uy;
        grad[2 * first] += p.pull * ux; grad[2 * first + 1] += p.pull * uy;
      }
    }
  }
  // Orientation safety net: a fold would mirror one junction inside unmirrored neighbours.
  if (p.wOrient > 0) {
    for (let i = 0; i < g.E; i++) for (let k = 0; k < 4; k++) {
      const a = g.ports[4 * i + k], b = g.ports[4 * i + (k + 1) % 4];
      const ux = pos[2 * a] - pos[2 * i], uy = pos[2 * a + 1] - pos[2 * i + 1];
      const vx = pos[2 * b] - pos[2 * i], vy = pos[2 * b + 1] - pos[2 * i + 1];
      const area = ux * vy - uy * vx;
      if (area >= p.orientMin) continue;
      const dEdA = -p.wOrient * (p.orientMin - area);
      grad[2 * a] += dEdA * vy; grad[2 * a + 1] -= dEdA * vx;
      grad[2 * b] -= dEdA * uy; grad[2 * b + 1] += dEdA * ux;
      grad[2 * i] += dEdA * (uy - vy); grad[2 * i + 1] += dEdA * (vx - ux);
    }
  }
  for (let i = 0; i < g.count; i++) if (g.kind[i] === TAIL) { grad[2 * i] = 0; grad[2 * i + 1] = 0; }
  // Residual: a sample can only move normal to its cord, so its tangential force is not something it can answer.
  let maxGrad = 0;
  for (let idx = 0; idx < g.solved.length; idx++) {
    const i = g.solved[idx];
    let gx = grad[2 * i], gy = grad[2 * i + 1];
    const prev = g.chainPrev[i];
    if (prev >= 0) {
      const next = g.chainNext[i];
      const tx = pos[2 * next] - pos[2 * prev], ty = pos[2 * next + 1] - pos[2 * prev + 1];
      const tl2 = tx * tx + ty * ty || 1, along = (gx * tx + gy * ty) / tl2;
      gx -= along * tx; gy -= along * ty;
    }
    const mag = gx * gx + gy * gy;
    if (mag > maxGrad) maxGrad = mag;
  }
  forcesOut.maxGrad = Math.sqrt(maxGrad); forcesOut.contacts = contacts; forcesOut.overlap = overlap;
  return forcesOut;
}

/** Interior samples back to equal arc spacing: reparametrisation, with no physical content. */
function redistribute(g: Graph, pos: Float64Array) {
  for (let s = 0; s < g.segments; s++) {
    const m = g.segSampleCount[s];
    if (m < 1) continue;
    const first = g.segSampleStart[s];
    const xs = g.rx, ys = g.ry, cum = g.rc;
    xs[0] = pos[2 * g.segA[s]]; ys[0] = pos[2 * g.segA[s] + 1];
    for (let k = 0; k < m; k++) { const node = g.segSamples[first + k]; xs[k + 1] = pos[2 * node]; ys[k + 1] = pos[2 * node + 1]; }
    xs[m + 1] = pos[2 * g.segB[s]]; ys[m + 1] = pos[2 * g.segB[s] + 1];
    cum[0] = 0;
    for (let k = 1; k < m + 2; k++) { const dx = xs[k] - xs[k - 1], dy = ys[k] - ys[k - 1]; cum[k] = cum[k - 1] + Math.sqrt(dx * dx + dy * dy); }
    const total = cum[m + 1];
    for (let i = 1; i <= m; i++) {
      const target = total * i / (m + 1);
      let k = 1;
      while (k < m + 1 && cum[k] < target) k++;
      const t = (target - cum[k - 1]) / Math.max(1e-12, cum[k] - cum[k - 1]), node = g.segSamples[first + i - 1];
      pos[2 * node] = xs[k - 1] + (xs[k] - xs[k - 1]) * t;
      pos[2 * node + 1] = ys[k - 1] + (ys[k] - ys[k - 1]) * t;
    }
  }
}

// ---------------------------------------------------------------- measures used by the settle test
function interiorAngle(g: Graph, pos: Float64Array): number {
  let sum = 0, m = 0;
  for (let i = 0; i < g.E; i++) {
    const a = g.ports[4 * i + 2], b = g.ports[4 * i + 3];
    const ux = pos[2 * a] - pos[2 * i], uy = pos[2 * a + 1] - pos[2 * i + 1];
    const vx = pos[2 * b] - pos[2 * i], vy = pos[2 * b + 1] - pos[2 * i + 1];
    const den = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    sum += Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / den))) * 180 / Math.PI;
    m++;
  }
  return m ? sum / m : 0;
}
function envelopeWidth(g: Graph, pos: Float64Array): number {
  let min = Infinity, max = -Infinity;
  for (let idx = 0; idx < g.solved.length; idx++) { const x = pos[2 * g.solved[idx]]; if (x < min) min = x; if (x > max) max = x; }
  return max - min + 1;
}
function orientationBalance(g: Graph, pos: Float64Array) {
  let positive = 0, negative = 0;
  for (let i = 0; i < g.E; i++) {
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
type SolveResult = { pos: Float64Array; steps: number; converged: boolean; residual: number; contacts: number; overlap: number; ranOutOfTime: boolean };

function solve(g: Graph, p: Profile, onProgress?: PackedProgress): SolveResult {
  const pos = Float64Array.from(g.pos), velocity = new Float64Array(2 * g.count), grad = new Float64Array(2 * g.count);
  let neighbours = neighbourList(g, p, pos);
  let steps = 0, converged = false, residual = Infinity, contacts = 0, overlap = 0, ranOutOfTime = false;
  const started = Date.now();
  const history: { angle: number; width: number }[] = [];
  const window = Math.max(1, Math.round(p.settle / 50));
  for (; steps < p.steps; steps++) {
    if (neighboursStale(neighbours, pos)) neighbours = neighbourList(g, p, pos);
    const ramp = p.ramp > 0 ? Math.min(1, 0.1 + 0.9 * steps / p.ramp) : 1;
    const f = evaluate(g, p, pos, grad, neighbours, ramp);
    residual = f.maxGrad; contacts = f.contacts; overlap = f.overlap;
    if (steps % 50 === 0) {
      const width = envelopeWidth(g, pos);
      history.push({ angle: interiorAngle(g, pos), width });
      // Settled means the shape has stopped moving. A penalty contact set keeps a small residual for ever,
      // and its size grows with the number of contacts, so the residual cannot be the test (findings §7.1).
      if (steps >= p.ramp + p.settle && history.length > window) {
        const recent = history.slice(-window - 1);
        let lowA = Infinity, highA = -Infinity, lowW = Infinity, highW = -Infinity;
        for (const h of recent) {
          if (h.angle < lowA) lowA = h.angle;
          if (h.angle > highA) highA = h.angle;
          if (h.width < lowW) lowW = h.width;
          if (h.width > highW) highW = h.width;
        }
        if (highA - lowA < p.settleAngle && (highW - lowW) / Math.max(1e-9, width) < p.settleWidth) { converged = true; break; }
      }
      const elapsed = Date.now() - started;
      if (p.budgetMs > 0 && elapsed > p.budgetMs) { ranOutOfTime = true; break; }
      if (steps % 200 === 0) {
        const done = Math.max(steps / p.steps, p.budgetMs > 0 ? elapsed / p.budgetMs : 0);
        onProgress?.(0.15 + 0.85 * Math.min(0.99, done), () => toLayout(g, p, pos, { pos, steps, converged: false, residual, contacts, overlap, ranOutOfTime: false }, false));
      }
    }
    for (let idx = 0; idx < g.solved.length; idx++) {
      const i = g.solved[idx];
      let vx = (-p.dt * grad[2 * i] + 2 * velocity[2 * i]) / (2 + p.dt * p.gamma);
      let vy = (-p.dt * grad[2 * i + 1] + 2 * velocity[2 * i + 1]) / (2 + p.dt * p.gamma);
      const prev = g.chainPrev[i];
      if (prev >= 0) {                                        // samples move normal to their cord only
        const next = g.chainNext[i];
        const tx = pos[2 * next] - pos[2 * prev], ty = pos[2 * next + 1] - pos[2 * prev + 1];
        const tl2 = tx * tx + ty * ty || 1, along = (vx * tx + vy * ty) / tl2;
        vx -= along * tx; vy -= along * ty;
      }
      const move2 = (vx * vx + vy * vy) * p.dt * p.dt;
      if (move2 > p.cap * p.cap) { const k = p.cap / Math.sqrt(move2); vx *= k; vy *= k; }
      velocity[2 * i] = vx; velocity[2 * i + 1] = vy;
      pos[2 * i] += vx * p.dt; pos[2 * i + 1] += vy * p.dt;
    }
    redistribute(g, pos);
  }
  measure(g, pos, p);
  return { pos, steps, converged, residual, contacts, overlap, ranOutOfTime };
}

// ---------------------------------------------------------------- layout
function align(g: Graph, source: Float64Array): Float64Array {
  const pos = Float64Array.from(source), J = g.E;
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
  rotate(Math.PI / 2 - 0.5 * Math.atan2(2 * sxy, sxx - syy));
  let firstY = 0, lastY = 0, m = 0;
  for (let c = 0; c < g.n; c++) {
    if (g.cordFirst[c] < 0) continue;
    firstY += pos[2 * g.cordFirst[c] + 1]; lastY += pos[2 * g.cordLast[c] + 1]; m++;
  }
  if (m && firstY / m > lastY / m) rotate(Math.PI);
  const balance = orientationBalance(g, pos);
  if (balance.negative > balance.positive) for (let i = 0; i < g.count; i++) pos[2 * i] = -pos[2 * i];
  return pos;
}

/** One cubic per segment, least squares through its samples with the junction endpoints fixed. */
function fitCubic(a: NetworkPoint, b: NetworkPoint, via: NetworkPoint[]): CordCurve['points'] {
  const third = (from: NetworkPoint, to: NetworkPoint, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  if (!via.length) return [a, third(a, b, 1 / 3), third(a, b, 2 / 3), b];
  const ts: number[] = [];
  let total = 0;
  const all = [a, ...via, b];
  const cum = [0];
  for (let k = 1; k < all.length; k++) { total += Math.hypot(all[k].x - all[k - 1].x, all[k].y - all[k - 1].y); cum.push(total); }
  for (let k = 1; k < all.length - 1; k++) ts.push(total > 1e-12 ? cum[k] / total : k / (all.length - 1));
  let aa = 0, ab = 0, bb = 0, arx = 0, ary = 0, brx = 0, bry = 0;
  for (let k = 0; k < via.length; k++) {
    const t = ts[k], u = 1 - t, A = 3 * u * u * t, B = 3 * u * t * t;
    const rx = via[k].x - u * u * u * a.x - t * t * t * b.x, ry = via[k].y - u * u * u * a.y - t * t * t * b.y;
    aa += A * A; ab += A * B; bb += B * B;
    arx += A * rx; ary += A * ry; brx += B * rx; bry += B * ry;
  }
  const den = aa * bb - ab * ab;
  if (Math.abs(den) < 1e-12) return [a, third(a, b, 1 / 3), third(a, b, 2 / 3), b];
  return [a,
    { x: (bb * arx - ab * brx) / den, y: (bb * ary - ab * bry) / den },
    { x: (aa * brx - ab * arx) / den, y: (aa * bry - ab * ary) / den },
    b];
}

function toLayout(g: Graph, p: Profile, raw: Float64Array, result: SolveResult, audit = true): CordNetworkLayout {
  const pos = align(g, raw), margin = 1.5 + p.diameter;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < g.count; i++) {
    const x = pos[2 * i], y = pos[2 * i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const at = (i: number): NetworkPoint => ({ x: pos[2 * i] - minX + margin, y: pos[2 * i + 1] - minY + margin });
  const E = g.E, exportIndex = new Int32Array(g.count).fill(-1);
  const points: NetworkPoint[] = [];
  for (let i = 0; i < E; i++) { exportIndex[i] = i; points.push(at(i)); }
  for (let c = 0; c < g.n; c++) {
    const base = g.chainStart[c], countC = g.chainCount[c];
    const start = g.chains[base], end = g.chains[base + countC - 1];
    exportIndex[start] = E + 2 * c; exportIndex[end] = E + 2 * c + 1;
    points[E + 2 * c] = at(start); points[E + 2 * c + 1] = at(end);
  }
  // Segments in the order each cord visits them, so a cord's curves follow its chain.
  const segmentsByCord: number[][] = g.cords.map(() => []);
  for (let s = 0; s < g.segments; s++) segmentsByCord[g.segCord[s]].push(s);
  const cords: NetworkCord[] = g.cords.map((cord, c) => {
    const base = g.chainStart[c], countC = g.chainCount[c];
    const nodes: number[] = [];
    for (let k = 0; k < countC; k++) nodes.push(exportIndex[g.chains[base + k]]);
    const curves: CordCurve[] = [];
    let seen = 0;
    for (let k = 1; k < countC; k++) {
      const from = g.chains[base + k - 1], to = g.chains[base + k];
      const a = points[exportIndex[from]], b = points[exportIndex[to]];
      if (g.kind[from] === JUNCTION && g.kind[to] === JUNCTION) {
        const s = segmentsByCord[c][seen++];
        const via: NetworkPoint[] = [];
        for (let m = 0; m < g.segSampleCount[s]; m++) via.push(at(g.segSamples[g.segSampleStart[s] + m]));
        curves.push({ id: `${cord.id}:${k - 1}`, cordId: cord.id, from: exportIndex[from], to: exportIndex[to], points: fitCubic(a, b, via) });
      } else {
        curves.push({ id: `${cord.id}:${k - 1}`, cordId: cord.id, from: exportIndex[from], to: exportIndex[to],
          points: [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 }, b] });
      }
    }
    return { ...cord, nodes, curves };
  });
  const byId = new Map(cords.map(c => [c.id, c]));
  const junctions = g.events.map((event, i): NetworkJunction => ({
    event, position: points[i], patch: junctionPatch(byId.get(event.splitteeId)!, byId.get(event.splitterId)!, i, p.diameter),
  }));
  const crossingConflicts = audit ? findCurveCrossings(cords.flatMap(c => c.curves)) : [];
  const ports = audit && E ? portConflicts(g.events, cords) : [];
  const diagnostics: string[] = [];
  if (!E) diagnostics.push('No splits yet: the cords are shown before they are joined.');
  if (audit && result.ranOutOfTime) diagnostics.push('The packed solve stopped at its time budget before the shape settled; this pattern is large for this model.');
  else if (audit && !result.converged) diagnostics.push('The packed solve reached its step limit before the shape stopped moving.');
  if (audit && result.overlap > 0.1) diagnostics.push(`Cords overlap by up to ${result.overlap.toFixed(2)} diameters; the contact walls did not fully separate them.`);
  if (crossingConflicts.length) diagnostics.push(`${crossingConflicts.length} unintended sampled curve intersections; geometry is unresolved.`);
  if (ports.length) diagnostics.push(`${ports.length} junctions have unresolved port order.`);
  return {
    width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin, diameter: p.diameter, cords, junctions, points, diagnostics,
    quality: {
      iterations: result.steps, residual: Number.isFinite(result.residual) ? result.residual : 0, converged: result.converged,
      parallelPairs: g.digons, crossingConflicts, portConflicts: ports, smoothing: 0, relaxationSteps: result.steps, bowScale: 1,
    },
  };
}

export function buildPackedNetwork(simulation: Simulation, options: PackedNetworkOptions = {}, onProgress?: PackedProgress): CordNetworkLayout {
  const p = resolvePackedProfile(options);
  const cords = simulation.snapshots[0]?.lanes ?? [];
  const n = cords.length;
  const empty = (diagnostics: string[]): CordNetworkLayout => ({
    width: Math.max(4, n + 3), height: 8, diameter: p.diameter, cords: [], junctions: [], points: [], diagnostics,
    quality: { iterations: 0, residual: 0, converged: true, parallelPairs: 0, crossingConflicts: [], portConflicts: [], smoothing: 0, relaxationSteps: 0, bowScale: 1 },
  });
  const error = validate(simulation, cords);
  if (error) return empty([error]);
  if (!n) return empty([]);
  // The seed is the elastic layout: planar, correctly handed, and already close in the regular sections.
  const seed = buildElasticNetwork(simulation, { elongation: p.elongation, diameter: p.diameter });
  if (!simulation.events.length) return seed;
  onProgress?.(0.15, () => seed);
  const g = buildGraph(simulation, cords, seed, p);
  const result = solve(g, p, onProgress);
  return toLayout(g, p, result.pos, result);
}
