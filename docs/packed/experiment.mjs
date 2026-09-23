// Research experiment only: packed-model layout of the split graph (README.md §3–§5), chevron tests 1–4 of §7.
// Imports the parser, simulator, examples, and the elastic model for its seed (README §4.1); nothing in the app changes.
// Run from the repository root:
//   node --experimental-strip-types docs/packed/experiment.mjs [chevron|eyes] [key=value ...]
//   node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8                                  # test 1: pitch and width
//   node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 pull=0 tag=free                  # test 2: free mode
//   node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 pull=0.386,0.562,0.672,0.770 tag=pull   # test 3: calibration
//   node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 rmin=0.5,0.75,1 tag=rmin         # test 4: selvedge
// Keys: source (a .scot file for a custom sample name), tag (output filename infix), blocks, theta (degrees; sets the pull),
//       pull (f/T, overrides theta's; comma list sweeps), rmin (comma list sweeps), h, phiMin (degrees), selfExempt, kw, kb, wCross, wOrient, orientMin,
//       seedTheta (degrees; the elastic seed's angle, for path-dependence tests), ramp, dt, gamma, steps, tolerance, settle, settleAngle, settleWidth, cap, redistribute, tail, release, log.
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePattern } from '../../src/domain/parser.ts';
import { simulatePattern } from '../../src/domain/simulate.ts';
import { buildElasticNetwork } from '../../src/domain/elasticNetwork.ts';
import { wayuuFajon20Pattern } from '../../src/examples/wayuuFajon20.ts';
import { chevronPattern } from '../../src/examples/chevron.ts';

// ---------------------------------------------------------------- CLI and profile
const argv = process.argv.slice(2);
const sampleName = argv.find(a => !a.includes('=')) ?? 'chevron';
const args = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const num = (key, fallback) => { const v = key in args ? Number(args[key]) : fallback; if (!Number.isFinite(v)) throw new Error(`${key}=${args[key]} is not a number`); return v; };
const list = (key, fallback) => (key in args ? args[key].split(',').map(Number) : [fallback]);
const sources = { eyes: wayuuFajon20Pattern, chevron: chevronPattern };
if (args.source) sources[sampleName] = readFileSync(args.source, 'utf8');
if (!sources[sampleName]) throw new Error(`Unknown sample ${sampleName}. Use chevron, eyes, or <name> source=<file>.`);

const pullFor = theta => Math.cos(2 * theta) / Math.cos(theta) ** 3;             // README §2.4: f/T that holds half-angle θ
const thetaFor = pull => {                                                        // its inverse, by bisection on (0, 45°]
  let lo = 1e-6, hi = Math.PI / 4;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pullFor(mid) > pull) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
const theta = num('theta', Math.atan(1 / 1.35) * 180 / Math.PI) * Math.PI / 180; // the app's default elongation 1.35 → 36.5°
const seedTheta = num('seedTheta', theta * 180 / Math.PI) * Math.PI / 180;         // the elastic seed's half-angle; differs from theta only for path-dependence tests
const base = {
  theta, T: 1,
  pull: pullFor(theta),                    // working pull per cord end, f/T
  h: num('h', 1 / 3),                       // sample spacing along a cord, d
  rmin: 0.5,                                // minimum bend radius, d
  phiMin: num('phiMin', 30) * Math.PI / 180,  // most glancing split allowed; two cords that share a junction may come as close as straight tubes crossing at this angle
  selfExempt: num('selfExempt', 1.6),       // same-cord pairs closer than this along the cord are not walled
  kw: num('kw', 50), kb: num('kb', 5),      // wall and bend-limit stiffness
  ramp: num('ramp', 200),                   // steps over which kw and kb rise from 10 % to full, so tension straightens the seed's kinks first
  wCross: num('wCross', 0),                 // choice B: split-angle term at each junction (off by default)
  wOrient: num('wOrient', 1), orientMin: num('orientMin', 0.05),
  dt: num('dt', 0.1), gamma: num('gamma', 3), steps: num('steps', 3000), tolerance: num('tolerance', 0.5),
  settle: num('settle', 300), settleAngle: num('settleAngle', 0.1), settleWidth: num('settleWidth', 0.002),   // settled: angle and width stationary over this many steps, with the residual below tolerance
  cap: num('cap', 0.1),                     // largest move of one sample per step, d
  redistribute: num('redistribute', 1),     // resample each segment to equal spacing every this many steps
  tail: num('tail', 1.5),                   // drawn tail length beyond a cord's first and last junction
  release: num('release', 0),               // after the main solve, continue this many steps with the pull off (README §7 test 10)
  log: num('log', 100),
  blocks: num('blocks', sampleName === 'chevron' ? 8 : 1),
};
const sweeps = { pull: list('pull', base.pull), rmin: list('rmin', base.rmin) };
const runsToDo = [];
for (const pull of sweeps.pull) for (const rmin of sweeps.rmin) {
  const name = [sweeps.pull.length > 1 ? `pull${pull}` : '', sweeps.rmin.length > 1 ? `rmin${rmin}` : ''].filter(Boolean).join('-');
  runsToDo.push({ name, profile: { ...base, pull, rmin } });
}

// ---------------------------------------------------------------- simulate and seed
const parsed = parsePattern(sources[sampleName]);
if (!parsed.pattern || parsed.diagnostics.length) throw new Error(`Parse failed: ${JSON.stringify(parsed.diagnostics)}`);
const simulation = simulatePattern(parsed.pattern, base.blocks);
if (simulation.diagnostics.length) throw new Error(`Simulation failed: ${JSON.stringify(simulation.diagnostics)}`);
const seedStarted = Date.now();
const seedLayout = buildElasticNetwork(simulation, { elongation: 1 / Math.tan(seedTheta) });
const seedMs = Date.now() - seedStarted;
if (seedLayout.diagnostics.length) console.log('elastic seed diagnostics:', seedLayout.diagnostics.join(' | '));

// ---------------------------------------------------------------- graph: junctions, samples, drawn tails
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function cubicPoint(p, t) {
  const a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), c = mix(p[2], p[3], t), d = mix(a, b, t), e = mix(b, c, t);
  return mix(d, e, t);
}
/** `m` points at equal arc length along a cubic, excluding its ends. */
function sampleCubic(p, m) {
  const pts = [], cum = [0];
  for (let k = 0; k <= 64; k++) pts.push(cubicPoint(p, k / 64));
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const total = cum[cum.length - 1], out = [];
  for (let i = 1; i <= m; i++) {
    const target = total * i / (m + 1);
    let k = 1; while (k < cum.length - 1 && cum[k] < target) k++;
    const t = (target - cum[k - 1]) / Math.max(1e-12, cum[k] - cum[k - 1]);
    out.push(mix(pts[k - 1], pts[k], t));
  }
  return { points: out, length: total };
}

function buildGraph(simulation, profile) {
  const cords = simulation.snapshots[0].lanes, events = simulation.events, n = cords.length;
  const nodes = [], pos = [];
  const addNode = (node, at) => { pos.push(at.x, at.y); return nodes.push(node) - 1; };
  events.forEach((event, i) => addNode({ kind: 'junction', event, cords: [] }, seedLayout.points[i]));
  const visits = new Map(cords.map(c => [c.id, []]));
  events.forEach((e, i) => { visits.get(e.splitterId).push(i); visits.get(e.splitteeId).push(i); });
  const dirAt = (cordId, i) => (events[i].splitterId === cordId ? 1 : -1) * Math.sign(events[i].toLane - events[i].fromLane);
  const gapOf = i => Math.min(events[i].fromLane, events[i].toLane);
  const isOuterGap = gap => gap === 1 || gap === n - 1;
  const paths = new Map(), segments = [];
  const E = events.length;
  for (const [c, cord] of cords.entries()) {
    const layoutCord = seedLayout.cords.find(x => x.id === cord.id);
    const chain = visits.get(cord.id);
    const start = addNode({ kind: 'tail', cordId: cord.id }, seedLayout.points[E + 2 * c]);
    const end = addNode({ kind: 'tail', cordId: cord.id }, seedLayout.points[E + 2 * c + 1]);
    const level = [start, ...chain, end], full = [start];
    for (let k = 1; k < level.length; k++) {
      const a = level[k - 1], b = level[k];
      if (nodes[a].kind === 'junction' && nodes[b].kind === 'junction') {
        const reversal = dirAt(cord.id, a) !== dirAt(cord.id, b);
        const turn = reversal && gapOf(a) === gapOf(b) && isOuterGap(gapOf(a));
        const curve = layoutCord.curves[k - 1].points;
        const probe = sampleCubic(curve, 1), m = Math.max(2, Math.round(probe.length / profile.h) - 1);
        const { points } = sampleCubic(curve, m);
        const seg = { index: segments.length, cordId: cord.id, a, b, samples: [], links: [], turn, reversal, outer: turn ? gapOf(a) : 0, arcStart: 0, length: 0 };
        for (const p of points) seg.samples.push(addNode({ kind: 'sample', cordId: cord.id, segment: seg.index }, p));
        segments.push(seg);
        full.push(...seg.samples, b);
      } else full.push(b);                                    // tail link: drawn, not solved
    }
    for (const j of chain) nodes[j].cords.push(cord.id);
    paths.set(cord.id, { cord, level, full, unused: chain.length === 0, first: chain[0], last: chain.at(-1) });
  }
  // Ports at each junction: the adjacent samples (or tails) along each cord, cyclic order a-in, b-in, a-out, b-out.
  const junctions = events.map((e, i) => {
    const gap = gapOf(i), leftId = e.lanesBefore[gap - 1].id, rightId = e.lanesBefore[gap].id;
    const port = cordId => { const p = paths.get(cordId), k = p.full.indexOf(i); return { prev: p.full[k - 1], next: p.full[k + 1] }; };
    const a = port(leftId), b = port(rightId);
    return { node: i, event: e, gap, outer: isOuterGap(gap), a, b, ports: [a.prev, b.prev, a.next, b.next], splittee: port(e.splitteeId) };
  });
  // Per node: the cords it lies on with its arc-length position (filled by `measure`), and the junctions it is adjacent to.
  const onCord = nodes.map(() => []);                       // [{ cordId, arc }]
  for (const { cord, full } of paths.values()) full.forEach(i => { if (nodes[i].kind !== 'tail') onCord[i].push({ cordId: cord.id, arc: 0 }); });
  const near = nodes.map((node, i) => node.kind === 'junction' ? [{ junction: i, dist: 0 }] : []);
  for (const seg of segments) for (const s of seg.samples) near[s].push({ junction: seg.a, dist: 0 }, { junction: seg.b, dist: 0 });
  // Tension links and bend triples over the solved chain (tails excluded).
  const links = [], triples = [], chainPrev = new Int32Array(nodes.length).fill(-1), chainNext = new Int32Array(nodes.length).fill(-1);
  for (const seg of segments) {
    const chain = [seg.a, ...seg.samples, seg.b];
    for (let k = 1; k < chain.length; k++) { seg.links.push(links.length); links.push({ i: chain[k - 1], j: chain[k], seg, d0: 0, d1: 0 }); }   // d0, d1: arc distance from seg.a, set by measure
  }
  for (const { full } of paths.values()) {
    const solved = full.filter(i => nodes[i].kind !== 'tail');
    // Bend triples at free samples only: a cord gripped inside another at a junction may kink there.
    for (let k = 1; k < solved.length - 1; k++) if (nodes[solved[k]].kind === 'sample') { triples.push([solved[k - 1], solved[k], solved[k + 1]]); chainPrev[solved[k]] = solved[k - 1]; chainNext[solved[k]] = solved[k + 1]; }
  }
  const solvedNodes = nodes.map((node, i) => node.kind !== 'tail' ? i : -1).filter(i => i >= 0);
  const labels = nodes.map((node, i) => node.kind === 'junction' ? `e${node.event.eventIndex}` : node.kind === 'tail' ? `tail:${node.cordId}` : `${node.cordId}:s${i}`);
  const rows = [...new Set(events.map(e => e.rowInstance))].sort((a, b) => a - b);
  // Digons: two distinct segments joining the same pair of junctions, so the two cords meet twice in a row.
  const digons = [], bySpan = new Map();
  for (const seg of segments) {
    const key = `${Math.min(seg.a, seg.b)}:${Math.max(seg.a, seg.b)}`;
    if (bySpan.has(key)) digons.push({ a: seg.a, b: seg.b, segments: [bySpan.get(key), seg] }); else bySpan.set(key, seg);
  }
  return { cords, events, n, nodes, pos: Float64Array.from(pos), paths, segments, junctions, onCord, near, links, triples, chainPrev, chainNext, solvedNodes, labels, rows, digons };
}

/** Tail positions (straight continuations), arc-length positions along each cord, and each sample's distance to its segment's junctions. */
function measure(graph, pos, profile) {
  const { nodes, paths, segments, onCord, near } = graph;
  for (const { cord, level, full, first, last, unused } of paths.values()) {
    const start = level[0], end = level.at(-1);
    if (unused) continue;
    const place = (tail, from, toward) => {
      const dx = pos[2 * from] - pos[2 * toward], dy = pos[2 * from + 1] - pos[2 * toward + 1], len = Math.hypot(dx, dy) || 1;
      pos[2 * tail] = pos[2 * from] + profile.tail * dx / len; pos[2 * tail + 1] = pos[2 * from + 1] + profile.tail * dy / len;
    };
    if (first !== last) { place(start, first, full[full.indexOf(first) + 1]); place(end, last, full[full.indexOf(last) - 1]); }
    else {                                                    // visited once: keep the seed's tail directions
      const keep = (tail, j) => { const dx = pos[2 * tail] - pos[2 * j], dy = pos[2 * tail + 1] - pos[2 * j + 1], len = Math.hypot(dx, dy) || 1; pos[2 * tail] = pos[2 * j] + profile.tail * dx / len; pos[2 * tail + 1] = pos[2 * j + 1] + profile.tail * dy / len; };
      keep(start, first); keep(end, last);
    }
    let arc = 0;
    const solved = full.filter(i => nodes[i].kind !== 'tail');
    for (let k = 0; k < solved.length; k++) {
      if (k > 0) arc += Math.hypot(pos[2 * solved[k]] - pos[2 * solved[k - 1]], pos[2 * solved[k] + 1] - pos[2 * solved[k - 1] + 1]);
      onCord[solved[k]].find(c => c.cordId === cord.id).arc = arc;
    }
    for (const seg of segments) if (seg.cordId === cord.id) seg.arcStart = onCord[seg.a].find(c => c.cordId === cord.id).arc;
  }
  for (const seg of segments) {
    const chain = [seg.a, ...seg.samples, seg.b], cum = [0];
    for (let k = 1; k < chain.length; k++) cum.push(cum[k - 1] + Math.hypot(pos[2 * chain[k]] - pos[2 * chain[k - 1]], pos[2 * chain[k] + 1] - pos[2 * chain[k - 1] + 1]));
    seg.length = cum[cum.length - 1];
    seg.samples.forEach((s, i) => { near[s][0].dist = cum[i + 1]; near[s][1].dist = seg.length - cum[i + 1]; });
    seg.links.forEach((l, k) => { graph.links[l].d0 = cum[k]; graph.links[l].d1 = cum[k + 1]; });
  }
}

// ---------------------------------------------------------------- energy and gradient (README §3)
/** Signed angle from u to v and its gradient with respect to both vectors. */
function angleOf(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy, cross = ux * vy - uy * vx, den = dot * dot + cross * cross;
  if (den < 1e-18) return null;
  return { alpha: Math.atan2(cross, dot), dux: (dot * vy - cross * vx) / den, duy: (-dot * vx - cross * vy) / den, dvx: (-dot * uy - cross * ux) / den, dvy: (dot * ux - cross * uy) / den };
}
/** Closest points of two segments (Ericson, Real-Time Collision Detection §5.1.9), in 2D. */
function closestPoints(pos, i1, j1, i2, j2) {
  const p1x = pos[2 * i1], p1y = pos[2 * i1 + 1], p2x = pos[2 * i2], p2y = pos[2 * i2 + 1];
  const d1x = pos[2 * j1] - p1x, d1y = pos[2 * j1 + 1] - p1y, d2x = pos[2 * j2] - p2x, d2y = pos[2 * j2 + 1] - p2y, rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry, clamp = v => Math.max(0, Math.min(1, v));
  let s = 0, t = 0;
  if (a > 1e-12 || e > 1e-12) {
    if (a <= 1e-12) t = clamp(f / e);
    else {
      const c = d1x * rx + d1y * ry;
      if (e <= 1e-12) s = clamp(-c / a);
      else {
        const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
        s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
      }
    }
  }
  const px = p1x + s * d1x, py = p1y + s * d1y, qx = p2x + t * d2x, qy = p2y + t * d2y, dx = px - qx, dy = py - qy;
  return { s, t, px, py, qx, qy, dx, dy, r: Math.hypot(dx, dy) };
}
/** Clearance between two links at their closest points: d; or, near a junction their cords share, the distance two straight
 * tubes crossing there at φ_min would have (README §3.3). That is tight for a straight crossing at any angle in [φ_min, 90°],
 * lets a cord kink at the junction by up to 180° − φ_min, and only stops it bending *toward* its partner beyond that.
 * −1 when the pair is exempt (the same cord, close along it). */
function clearance(graph, profile, A, B, s, t) {
  const SA = A.seg, SB = B.seg, xA = A.d0 + s * (A.d1 - A.d0), xB = B.d0 + t * (B.d1 - B.d0);
  if (SA.cordId === SB.cordId) return Math.abs(SA.arcStart + xA - (SB.arcStart + xB)) < profile.selfExempt ? -1 : 1;
  let c = 1;
  const cosPhi = Math.cos(profile.phiMin);
  // Each segment end: the junction and the closest point's arc distance from it.
  for (const [ja, da] of [[SA.a, xA], [SA.b, SA.length - xA]]) for (const [jb, db] of [[SB.a, xB], [SB.b, SB.length - xB]]) {
    if (ja === jb) c = Math.min(c, Math.sqrt(Math.max(0, da * da + db * db - 2 * da * db * cosPhi)));
  }
  return c;
}
function evaluate(graph, pos, profile, { contacts = false, ramp = 1 } = {}) {
  const { nodes, links, triples, junctions, paths, solvedNodes } = graph;
  const kw = profile.kw * ramp, kb = profile.kb * ramp;
  measure(graph, pos, profile);
  const grad = new Float64Array(pos.length), energy = { tension: 0, wall: 0, bend: 0, pull: 0, orient: 0, cross: 0 };
  const active = [];
  const psiMax = 2 * Math.asin(Math.min(1, profile.h / (2 * profile.rmin)));
  // Tension: constant force along every link.
  for (const { i, j } of links) {
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1], r = Math.hypot(dx, dy);
    if (r < 1e-12) continue;
    energy.tension += profile.T * r;
    const f = profile.T / r;
    grad[2 * i] += f * dx; grad[2 * i + 1] += f * dy; grad[2 * j] -= f * dx; grad[2 * j + 1] -= f * dy;
  }
  // Walls: one-sided penalty when two links (capsules) come closer than their clearance, over a grid hash of link midpoints.
  const cell = 1 + profile.h, bins = new Map(), key = (cx, cy) => `${cx}:${cy}`;
  const mid = new Float64Array(2 * links.length);
  links.forEach(({ i, j }, l) => {
    mid[2 * l] = (pos[2 * i] + pos[2 * j]) / 2; mid[2 * l + 1] = (pos[2 * i + 1] + pos[2 * j + 1]) / 2;
    const k = key(Math.floor(mid[2 * l] / cell), Math.floor(mid[2 * l + 1] / cell));
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(l);
  });
  for (let l1 = 0; l1 < links.length; l1++) {
    const cx = Math.floor(mid[2 * l1] / cell), cy = Math.floor(mid[2 * l1 + 1] / cell), A = links[l1];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const l2 of bins.get(key(cx + ox, cy + oy)) ?? []) {
      if (l2 <= l1) continue;
      const B = links[l2];
      if (A.seg === B.seg && Math.abs(A.d0 - B.d0) < profile.selfExempt) continue;
      const cp = closestPoints(pos, A.i, A.j, B.i, B.j);
      if (cp.r >= 1) continue;
      const c = clearance(graph, profile, A, B, cp.s, cp.t);
      if (c <= 0 || cp.r >= c) continue;
      const over = c - cp.r, f = -kw * over / Math.max(cp.r, 1e-9), fx = f * cp.dx, fy = f * cp.dy;
      energy.wall += 0.5 * kw * over * over;
      grad[2 * A.i] += (1 - cp.s) * fx; grad[2 * A.i + 1] += (1 - cp.s) * fy; grad[2 * A.j] += cp.s * fx; grad[2 * A.j + 1] += cp.s * fy;
      grad[2 * B.i] -= (1 - cp.t) * fx; grad[2 * B.i + 1] -= (1 - cp.t) * fy; grad[2 * B.j] -= cp.t * fx; grad[2 * B.j + 1] -= cp.t * fy;
      if (contacts) active.push({ l1, l2, c, r: cp.r, overlap: over, px: cp.px, py: cp.py, qx: cp.qx, qy: cp.qy });
    }
  }
  // Bend limit: turning angle at each solved sample with two solved neighbours.
  let maxTurn = 0, overBent = 0;
  for (const [p, k, q] of triples) {
    const g = angleOf(pos[2 * p] - pos[2 * k], pos[2 * p + 1] - pos[2 * k + 1], pos[2 * q] - pos[2 * k], pos[2 * q + 1] - pos[2 * k + 1]);
    if (!g) continue;
    const psi = Math.PI - Math.abs(g.alpha);
    maxTurn = Math.max(maxTurn, psi);
    if (psi <= psiMax) continue;
    overBent++;
    const dEdPsi = kb * (psi - psiMax), dEdAlpha = -Math.sign(g.alpha) * dEdPsi;
    energy.bend += 0.5 * kb * (psi - psiMax) ** 2;
    grad[2 * p] += dEdAlpha * g.dux; grad[2 * p + 1] += dEdAlpha * g.duy;
    grad[2 * q] += dEdAlpha * g.dvx; grad[2 * q + 1] += dEdAlpha * g.dvy;
    grad[2 * k] -= dEdAlpha * (g.dux + g.dvx); grad[2 * k + 1] -= dEdAlpha * (g.duy + g.dvy);
  }
  // Working pull: ±f along the axis from the first-junction centroid to the last-junction centroid.
  let ax = 0, ay = 0, bx = 0, by = 0, m = 0;
  for (const p of paths.values()) if (!p.unused) { ax += pos[2 * p.first]; ay += pos[2 * p.first + 1]; bx += pos[2 * p.last]; by += pos[2 * p.last + 1]; m++; }
  const axisLen = Math.hypot(bx - ax, by - ay) || 1, axis = [(bx - ax) / axisLen, (by - ay) / axisLen];
  if (profile.pull > 0) for (const p of paths.values()) {
    if (p.unused || p.first === p.last) continue;
    const f = profile.pull * profile.T;
    energy.pull -= f * (axis[0] * (pos[2 * p.last] - pos[2 * p.first]) + axis[1] * (pos[2 * p.last + 1] - pos[2 * p.first + 1]));
    grad[2 * p.last] -= f * axis[0]; grad[2 * p.last + 1] -= f * axis[1];
    grad[2 * p.first] += f * axis[0]; grad[2 * p.first + 1] += f * axis[1];
  }
  // Orientation safety net: signed sector areas at each junction, as in the elastic model.
  if (profile.wOrient > 0) for (const j of junctions) {
    const c = j.node;
    for (let k = 0; k < 4; k++) {
      const p = j.ports[k], q = j.ports[(k + 1) % 4];
      const ux = pos[2 * p] - pos[2 * c], uy = pos[2 * p + 1] - pos[2 * c + 1], vx = pos[2 * q] - pos[2 * c], vy = pos[2 * q + 1] - pos[2 * c + 1];
      const area = ux * vy - uy * vx;
      if (area >= profile.orientMin) continue;
      const g = -profile.wOrient * (profile.orientMin - area);
      energy.orient += 0.5 * profile.wOrient * (profile.orientMin - area) ** 2;
      grad[2 * p] += g * vy; grad[2 * p + 1] -= g * vx; grad[2 * q] -= g * uy; grad[2 * q + 1] += g * ux;
      grad[2 * c] += g * (uy - vy); grad[2 * c + 1] += g * (vx - ux);
    }
  }
  // Choice B: split-angle term between the two out-ports (README §2.5), off by default.
  if (profile.wCross > 0) for (const j of junctions) {
    const c = j.node, g = angleOf(pos[2 * j.a.next] - pos[2 * c], pos[2 * j.a.next + 1] - pos[2 * c + 1], pos[2 * j.b.next] - pos[2 * c], pos[2 * j.b.next + 1] - pos[2 * c + 1]);
    if (!g) continue;
    const dev = Math.abs(g.alpha) - 2 * profile.theta, dEdAlpha = Math.sign(g.alpha) * profile.wCross * dev;
    energy.cross += 0.5 * profile.wCross * dev * dev;
    grad[2 * j.a.next] += dEdAlpha * g.dux; grad[2 * j.a.next + 1] += dEdAlpha * g.duy;
    grad[2 * j.b.next] += dEdAlpha * g.dvx; grad[2 * j.b.next + 1] += dEdAlpha * g.dvy;
    grad[2 * c] -= dEdAlpha * (g.dux + g.dvx); grad[2 * c + 1] -= dEdAlpha * (g.duy + g.dvy);
  }
  for (let i = 0; i < nodes.length; i++) if (nodes[i].kind === 'tail') { grad[2 * i] = 0; grad[2 * i + 1] = 0; }   // tails are drawn, not solved
  energy.total = Object.values(energy).reduce((s, v) => s + v, 0);
  // Residual: the force a node can respond to. A sample only moves normal to its cord, so its tangential force is not a residual.
  let maxGrad = 0;
  for (const i of solvedNodes) {
    let gx = grad[2 * i], gy = grad[2 * i + 1];
    if (graph.chainPrev[i] >= 0) {
      const p = graph.chainPrev[i], q = graph.chainNext[i], tx = pos[2 * q] - pos[2 * p], ty = pos[2 * q + 1] - pos[2 * p + 1], tl = Math.hypot(tx, ty) || 1;
      const along = (gx * tx + gy * ty) / (tl * tl);
      gx -= along * tx; gy -= along * ty;
    }
    maxGrad = Math.max(maxGrad, Math.hypot(gx, gy));
  }
  return { grad, energy, maxGrad, active, maxTurn, overBent, psiMax, axis };
}

// ---------------------------------------------------------------- solver (README §4)
function redistribute(graph, pos) {
  for (const seg of graph.segments) {
    const chain = [seg.a, ...seg.samples, seg.b], pts = chain.map(i => [pos[2 * i], pos[2 * i + 1]]), cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = cum[cum.length - 1], m = seg.samples.length;
    for (let i = 1; i <= m; i++) {
      const target = total * i / (m + 1);
      let k = 1; while (k < cum.length - 1 && cum[k] < target) k++;
      const t = (target - cum[k - 1]) / Math.max(1e-12, cum[k] - cum[k - 1]), s = seg.samples[i - 1];
      pos[2 * s] = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t; pos[2 * s + 1] = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t;
    }
  }
}
/** `startPos` continues from an existing layout (the release test); the default starts from the seed. */
function solve(graph, profile, startPos) {
  const pos = Float64Array.from(startPos ?? graph.pos), velocity = new Float64Array(pos.length), { dt, gamma } = profile, log = [];
  let steps = 0, converged = false, maxGrad = Infinity;
  const history = [];                                                       // (angle, width) every 50 steps, for the settled test
  for (; steps < profile.steps; steps++) {
    const ev = evaluate(graph, pos, profile, { ramp: profile.ramp > 0 ? Math.min(1, 0.1 + 0.9 * steps / profile.ramp) : 1 });
    maxGrad = ev.maxGrad;
    if (steps % 50 === 0) {
      const angle = crossingAngles(graph, pos), width = envelope(graph, pos).width;
      history.push({ angle: angle.interior.length ? mean(angle.interior) : angle.mean, width });
      if (steps % profile.log === 0) log.push({ step: steps, maxGrad: +maxGrad.toFixed(4), angle: +angle.mean.toFixed(2), width: +width.toFixed(3), energy: Object.fromEntries(Object.entries(ev.energy).map(([k, v]) => [k, +v.toFixed(4)])) });
      const window = history.slice(-Math.round(profile.settle / 50) - 1);
      if (steps >= profile.ramp + profile.settle && maxGrad < profile.tolerance && window.length > 1
        && Math.max(...window.map(w => w.angle)) - Math.min(...window.map(w => w.angle)) < profile.settleAngle
        && (Math.max(...window.map(w => w.width)) - Math.min(...window.map(w => w.width))) / width < profile.settleWidth) { converged = true; break; }
    }
    for (const i of graph.solvedNodes) {
      let vx = (dt * -ev.grad[2 * i] + 2 * velocity[2 * i]) / (2 + dt * gamma), vy = (dt * -ev.grad[2 * i + 1] + 2 * velocity[2 * i + 1]) / (2 + dt * gamma);
      if (graph.chainPrev[i] >= 0) {                                              // a sample's motion along its cord is reparametrisation, not physics
        const p = graph.chainPrev[i], q = graph.chainNext[i], tx = pos[2 * q] - pos[2 * p], ty = pos[2 * q + 1] - pos[2 * p + 1], tl = Math.hypot(tx, ty) || 1;
        const along = (vx * tx + vy * ty) / (tl * tl);
        vx -= along * tx; vy -= along * ty;
      }
      const move = Math.hypot(vx, vy) * dt;
      if (move > profile.cap) { vx *= profile.cap / move; vy *= profile.cap / move; }   // no tunnelling through a wall
      velocity[2 * i] = vx; velocity[2 * i + 1] = vy;
      pos[2 * i] += vx * dt; pos[2 * i + 1] += vy * dt;
    }
    if (profile.redistribute > 0 && steps % profile.redistribute === profile.redistribute - 1) redistribute(graph, pos);
  }
  measure(graph, pos, profile);
  return { pos, steps, converged, maxGrad, log };
}

// ---------------------------------------------------------------- alignment and metrics
function orientationSigns(graph, pos) {
  let positive = 0, negative = 0, violated = [];
  for (const j of graph.junctions) {
    let bad = false, sum = 0;
    for (let k = 0; k < 4; k++) {
      const p = j.ports[k], q = j.ports[(k + 1) % 4], c = j.node;
      const area = (pos[2 * p] - pos[2 * c]) * (pos[2 * q + 1] - pos[2 * c + 1]) - (pos[2 * p + 1] - pos[2 * c + 1]) * (pos[2 * q] - pos[2 * c]);
      sum += area; if (area <= 0) bad = true;
    }
    if (sum > 0) positive++; else negative++;
    if (bad) violated.push(j.event.eventIndex);
  }
  return { positive, negative, violated };
}
function align(graph, pos, profile) {
  const J = graph.events.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < J; i++) { cx += pos[2 * i]; cy += pos[2 * i + 1]; }
  cx /= J; cy /= J;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < J; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
  const rotate = phi => { const c = Math.cos(phi), s = Math.sin(phi); for (let i = 0; i < graph.nodes.length; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; pos[2 * i] = c * x - s * y; pos[2 * i + 1] = s * x + c * y; } cx = 0; cy = 0; };
  rotate(Math.PI / 2 - 0.5 * Math.atan2(2 * sxy, sxx - syy));
  const meanY = which => { let s = 0, k = 0; for (const p of graph.paths.values()) { s += pos[2 * (which === 'first' ? p.first : p.last) + 1]; k++; } return s / k; };
  if (meanY('first') > meanY('last')) rotate(Math.PI);
  const signs = orientationSigns(graph, pos);
  if (signs.negative > signs.positive) for (let i = 0; i < graph.nodes.length; i++) pos[2 * i] = -pos[2 * i];
  measure(graph, pos, profile);
  return pos;
}
const mean = xs => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
const stats = xs => { const m = mean(xs); return { count: xs.length, mean: +m.toFixed(3), std: +Math.sqrt(mean(xs.map(a => (a - m) ** 2))).toFixed(3), min: +Math.min(...xs).toFixed(3), max: +Math.max(...xs).toFixed(3) }; };
/** Crossing angle at each junction: between the two out-port directions, as the elastic metrics define it. */
function crossingAngles(graph, pos) {
  const angles = graph.junctions.map(j => {
    const c = j.node, ux = pos[2 * j.a.next] - pos[2 * c], uy = pos[2 * j.a.next + 1] - pos[2 * c + 1], vx = pos[2 * j.b.next] - pos[2 * c], vy = pos[2 * j.b.next + 1] - pos[2 * c + 1];
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)))) * 180 / Math.PI;
  });
  const rows = graph.rows, interiorRow = r => rows.indexOf(r) >= 2 && rows.indexOf(r) < rows.length - 2;
  const interior = angles.filter((_, k) => !graph.junctions[k].outer && interiorRow(graph.junctions[k].event.rowInstance));
  return { all: angles, mean: mean(angles), interior, outer: angles.filter((_, k) => graph.junctions[k].outer) };
}
/** Fabric envelope: the tubes' extent (samples and junctions, no tails) plus one diameter. */
function envelope(graph, pos) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, jx = [], jy = [];
  for (const i of graph.solvedNodes) { minX = Math.min(minX, pos[2 * i]); maxX = Math.max(maxX, pos[2 * i]); minY = Math.min(minY, pos[2 * i + 1]); maxY = Math.max(maxY, pos[2 * i + 1]); }
  for (let i = 0; i < graph.events.length; i++) { jx.push(pos[2 * i]); jy.push(pos[2 * i + 1]); }
  return { width: maxX - minX + 1, length: maxY - minY + 1, junctionWidth: Math.max(...jx) - Math.min(...jx), junctionLength: Math.max(...jy) - Math.min(...jy) };
}
function linkCrossings(graph, pos) {
  const links = graph.links, cell = 1, bins = new Map(), conflicts = [], checked = new Set();
  links.forEach(({ i: a, j: b }, k) => {
    for (let cx = Math.floor(Math.min(pos[2 * a], pos[2 * b]) / cell); cx <= Math.floor(Math.max(pos[2 * a], pos[2 * b]) / cell); cx++)
      for (let cy = Math.floor(Math.min(pos[2 * a + 1], pos[2 * b + 1]) / cell); cy <= Math.floor(Math.max(pos[2 * a + 1], pos[2 * b + 1]) / cell); cy++) {
        const key = `${cx}:${cy}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(k);
      }
  });
  for (const items of bins.values()) for (let u = 0; u < items.length; u++) for (let v = u + 1; v < items.length; v++) {
    const { i: a, j: b } = links[items[u]], { i: c, j: d } = links[items[v]], key = `${Math.min(items[u], items[v])}:${Math.max(items[u], items[v])}`;
    if (checked.has(key) || a === c || a === d || b === c || b === d) continue;
    checked.add(key);
    const ax = pos[2 * a], ay = pos[2 * a + 1], bx = pos[2 * b], by = pos[2 * b + 1], cx = pos[2 * c], cy = pos[2 * c + 1], dx = pos[2 * d], dy = pos[2 * d + 1];
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-12) continue;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, s = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && s > 1e-9 && s < 1 - 1e-9) conflicts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay) });
  }
  return conflicts;
}
/** A digon's lens: the gap between its two sides, sampled at equal arc fractions. */
function lensOf(graph, pos, digon) {
  const chainOf = seg => {
    const nodes = seg.a === digon.a ? [seg.a, ...seg.samples, seg.b] : [seg.b, ...[...seg.samples].reverse(), seg.a];
    const pts = nodes.map(i => [pos[2 * i], pos[2 * i + 1]]), cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return { pts, cum, total: cum[cum.length - 1] };
  };
  const at = (c, f) => {
    const target = c.total * f;
    let k = 1; while (k < c.cum.length - 1 && c.cum[k] < target) k++;
    const t = (target - c.cum[k - 1]) / Math.max(1e-12, c.cum[k] - c.cum[k - 1]);
    return [c.pts[k - 1][0] + (c.pts[k][0] - c.pts[k - 1][0]) * t, c.pts[k - 1][1] + (c.pts[k][1] - c.pts[k - 1][1]) * t];
  };
  const [A, B] = digon.segments.map(chainOf);
  let max = 0, mid = 0;
  for (let i = 1; i < 20; i++) {
    const f = i / 20, a = at(A, f), b = at(B, f), r = Math.hypot(a[0] - b[0], a[1] - b[1]);
    max = Math.max(max, r);
    if (i === 10) mid = r;
  }
  return { events: [graph.nodes[digon.a].event.eventIndex, graph.nodes[digon.b].event.eventIndex],
    span: +Math.hypot(pos[2 * digon.a] - pos[2 * digon.b], pos[2 * digon.a + 1] - pos[2 * digon.b + 1]).toFixed(3),
    lensMax: +max.toFixed(3), lensMid: +mid.toFixed(3), lengths: digon.segments.map(g => +g.length.toFixed(3)) };
}

function metrics(graph, pos, profile, result, ms) {
  const ev = evaluate(graph, pos, profile, { contacts: true });
  const thetaEff = profile.pull > 0 ? thetaFor(profile.pull) : Math.PI / 4;        // README §2.4: the angle this pull should hold
  const expected = { crossingAngleDeg: +(2 * thetaEff * 180 / Math.PI).toFixed(2), pitch: +(1 / Math.sin(2 * thetaEff)).toFixed(4), widthPerCord: +(1 / (2 * Math.cos(thetaEff))).toFixed(4) };
  const angles = crossingAngles(graph, pos);
  const sorted = [...angles.all].sort((a, b) => a - b), pct = q => +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
  const regular = graph.segments.filter(s => !s.turn && !s.reversal).map(s => s.length);
  const reversals = graph.segments.filter(s => s.reversal && !s.turn).map(s => s.length);
  const env = envelope(graph, pos), centreX = mean(graph.junctions.map(j => pos[2 * j.node]));
  const turns = graph.segments.filter(s => s.turn).map(s => {
    const jx = (pos[2 * s.a] + pos[2 * s.b]) / 2, outward = Math.sign(jx - centreX) || 1;
    const bulge = Math.max(...s.samples.map(i => (pos[2 * i] - jx) * outward)), chord = Math.hypot(pos[2 * s.a] - pos[2 * s.b], pos[2 * s.a + 1] - pos[2 * s.b + 1]);
    return { events: [graph.nodes[s.a].event.eventIndex, graph.nodes[s.b].event.eventIndex], length: +s.length.toFixed(3), chord: +chord.toFixed(3), bulge: +bulge.toFixed(3) };
  });
  const byTier = {};                                                        // contacts at full clearance versus reduced (near a shared junction)
  for (const a of ev.active) { const k = a.c >= 1 ? 'full' : 'junction'; byTier[k] = byTier[k] ?? { pairs: 0, maxOverlap: 0 }; byTier[k].pairs++; byTier[k].maxOverlap = Math.max(byTier[k].maxOverlap, a.overlap); }
  for (const k of Object.keys(byTier)) byTier[k].maxOverlap = +byTier[k].maxOverlap.toFixed(4);
  const takeUp = [...graph.paths.values()].filter(p => !p.unused).map(p => {
    let len = 0; const solved = p.full.filter(i => graph.nodes[i].kind !== 'tail');
    for (let k = 1; k < solved.length; k++) len += Math.hypot(pos[2 * solved[k]] - pos[2 * solved[k - 1]], pos[2 * solved[k] + 1] - pos[2 * solved[k - 1] + 1]);
    return { cord: p.cord.id, junctions: solved.filter(i => graph.nodes[i].kind === 'junction').length, lengthPerBlock: +(len / profile.blocks).toFixed(3) };
  });
  // Where the strain sits: per source row, and the regular segments furthest above the packed length.
  const angleByJunction = angles.all;
  const rowOf = j => graph.junctions[j].event.sourceRow;
  const byRow = {};
  graph.junctions.forEach((j, k) => {
    const row = rowOf(k), e = byRow[row] ??= { junctions: 0, angles: [], wide: 0, segments: [] };
    e.junctions++; e.angles.push(angleByJunction[k]);
    if (angleByJunction[k] > 100) e.wide++;
  });
  for (const seg of graph.segments) {
    if (seg.turn || seg.reversal) continue;
    byRow[graph.nodes[seg.a].event.sourceRow]?.segments.push(seg.length);
  }
  const packedLength = 1 / Math.sin(Math.max(1e-6, angles.interior.length ? mean(angles.interior) : angles.mean) * Math.PI / 180);
  const rowSummary = Object.fromEntries(Object.entries(byRow).map(([row, e]) => [row, {
    junctions: e.junctions, angle: +mean(e.angles).toFixed(1), angleMin: +Math.min(...e.angles).toFixed(1), angleMax: +Math.max(...e.angles).toFixed(1), wide: e.wide,
    segment: e.segments.length ? +mean(e.segments).toFixed(3) : null,
  }]));
  const stretched = graph.segments.filter(g => !g.turn && !g.reversal)
    .map(g => ({ events: [graph.nodes[g.a].event.eventIndex, graph.nodes[g.b].event.eventIndex], row: graph.nodes[g.a].event.sourceRow, length: +g.length.toFixed(3) }))
    .sort((a, b) => b.length - a.length).slice(0, 10);
  const signs = orientationSigns(graph, pos), crossings = linkCrossings(graph, pos);
  return {
    ms, steps: result.steps, converged: result.converged, maxGradient: +ev.maxGrad.toFixed(4),
    energy: Object.fromEntries(Object.entries(ev.energy).map(([k, v]) => [k, +v.toFixed(4)])),
    expected,
    crossingAngle: { all: stats(angles.all), interior: stats(angles.interior), outer: stats(angles.outer), percentiles: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
      wide: angles.all.map((a, k) => ({ event: graph.junctions[k].event.eventIndex, angle: +a.toFixed(1) })).filter(x => x.angle > 100).map(x => `e${x.event}:${x.angle}`),
      narrow: angles.all.map((a, k) => ({ event: graph.junctions[k].event.eventIndex, row: graph.junctions[k].event.sourceRow, angle: +a.toFixed(1) })).filter(x => x.angle < 45).map(x => `e${x.event}(r${x.row}):${x.angle}`) },
    segments: { regular: stats(regular), interiorReversal: reversals.length ? stats(reversals) : null, turns: turns.length ? { ...stats(turns.map(t => t.length)), bulge: stats(turns.map(t => t.bulge)), chord: stats(turns.map(t => t.chord)) } : null, turnDetail: turns.slice(0, 6) },
    envelope: { width: +env.width.toFixed(3), widthPerCord: +(env.width / graph.n).toFixed(4), length: +env.length.toFixed(3), junctionWidth: +env.junctionWidth.toFixed(3), junctionLength: +env.junctionLength.toFixed(3) },
    walls: { activePairs: ev.active.length, byTier, closest: ev.active.sort((a, b) => b.overlap - a.overlap).slice(0, 6).map(a => ({ a: `${graph.labels[graph.links[a.l1].i]}-${graph.labels[graph.links[a.l1].j]}`, b: `${graph.labels[graph.links[a.l2].i]}-${graph.labels[graph.links[a.l2].j]}`, c: a.c, r: +a.r.toFixed(3) })) },
    bend: { psiMaxDeg: +(ev.psiMax * 180 / Math.PI).toFixed(1), maxTurnDeg: +(ev.maxTurn * 180 / Math.PI).toFixed(1), overLimit: ev.overBent },
    takeUp: { meanPerCordPerBlock: +mean(takeUp.map(t => t.lengthPerBlock)).toFixed(3), cords: takeUp },
    orientation: { positive: signs.positive, negative: signs.negative, violated: signs.violated },
    digons: graph.digons.map(d => lensOf(graph, pos, d)),
    packedLength: +packedLength.toFixed(4), byRow: rowSummary, stretched,
    crossings: crossings.length,
    unresolved: signs.violated.length > 0 || crossings.length > 0,
    log: result.log,
  };
}

// ---------------------------------------------------------------- SVG
const palette = { ...{ A: '#655069', B: '#d9f2e8', C: '#1da9d2', D: '#d3a448', E: '#d76b52' }, ...(parsed.pattern.colorAssignments ?? {}) };
function svg(graph, pos, { structure = false, conflicts = [], violated = [], contacts = [] } = {}) {
  const colorOf = cordId => palette[graph.cords.find(c => c.id === cordId).colorSymbol] ?? '#a89b84';
  const xs = [], ys = [];
  for (let i = 0; i < graph.nodes.length; i++) { xs.push(pos[2 * i]); ys.push(pos[2 * i + 1]); }
  const pad = 2, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad, px = 24;
  const P = i => `${(pos[2 * i] - minX).toFixed(3)},${(pos[2 * i + 1] - minY).toFixed(3)}`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${(w * px).toFixed(0)}" height="${(h * px).toFixed(0)}"><rect width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="#f5f0e5"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">`;
  for (const { cord, full } of graph.paths.values()) {
    const solved = full.filter(i => graph.nodes[i].kind !== 'tail');
    out += `<path d="M${P(full[0])}L${P(solved[0])}M${P(solved.at(-1))}L${P(full.at(-1))}" stroke="${colorOf(cord.id)}" stroke-width="${structure ? 0.05 : 0.5}" stroke-dasharray=".2 .15" stroke-opacity=".5"/>`;
    out += `<path d="M${solved.map(P).join('L')}" stroke="${colorOf(cord.id)}" stroke-width="${structure ? 0.08 : 1}"${structure ? ' stroke-opacity=".6"' : ''}><title>${cord.id} · ${cord.colorSymbol}</title></path>`;
  }
  if (!structure) for (const j of graph.junctions) {                  // splittee surface at the crossing, as in the elastic figures
    const c = j.node, near = i => { const dx = pos[2 * i] - pos[2 * c], dy = pos[2 * i + 1] - pos[2 * c + 1], len = Math.hypot(dx, dy) || 1, t = Math.min(0.9, 0.36 / len); return `${(pos[2 * c] + dx * t - minX).toFixed(3)},${(pos[2 * c + 1] + dy * t - minY).toFixed(3)}`; };
    const d = `M${near(j.splittee.prev)}L${P(c)}L${near(j.splittee.next)}`;
    out += `<g><title>Split ${j.event.eventIndex} · ${j.event.splitterId} through ${j.event.splitteeId} · row ${j.event.rowInstance}</title><path d="${d}" stroke="#302c34" stroke-width="1.06"/><path d="${d}" stroke="${colorOf(j.event.splitteeId)}" stroke-width="1"/></g>`;
  }
  if (structure) {
    for (const i of graph.solvedNodes) if (graph.nodes[i].kind === 'sample') out += `<circle cx="${(pos[2 * i] - minX).toFixed(3)}" cy="${(pos[2 * i + 1] - minY).toFixed(3)}" r=".04" fill="#7a7370"/>`;
    for (const a of contacts) out += `<path d="M${(a.px - minX).toFixed(3)},${(a.py - minY).toFixed(3)}L${(a.qx - minX).toFixed(3)},${(a.qy - minY).toFixed(3)}" stroke="${a.c === 1 ? '#e02d25' : '#e08a25'}" stroke-width=".05"/>`;
    for (const j of graph.junctions) out += `<circle cx="${(pos[2 * j.node] - minX).toFixed(3)}" cy="${(pos[2 * j.node + 1] - minY).toFixed(3)}" r=".09" fill="#161c21"/><text x="${(pos[2 * j.node] - minX).toFixed(3)}" y="${(pos[2 * j.node + 1] - minY - 0.14).toFixed(3)}" font-family="monospace" font-size=".26" text-anchor="middle" fill="#211b22" stroke="none">${j.event.eventIndex}</text>`;
    for (const c of conflicts) out += `<circle cx="${(c.x - minX).toFixed(3)}" cy="${(c.y - minY).toFixed(3)}" r=".3" stroke="#e02d25" stroke-width=".08"/>`;
    for (const id of violated) out += `<rect x="${(pos[2 * id] - minX - 0.3).toFixed(3)}" y="${(pos[2 * id + 1] - minY - 0.3).toFixed(3)}" width=".6" height=".6" stroke="#e08a25" stroke-width=".08"/>`;
  }
  return `${out}</g></svg>`;
}

// ---------------------------------------------------------------- main
const tag = args.tag ? `${args.tag}-` : '';
const out = (run, name) => new URL(`${sampleName}-${tag}${run ? `${run}-` : ''}${name}`, import.meta.url);
const runs = [];
let graphInfo;
for (const { name, profile } of runsToDo) {
  const graph = buildGraph(simulation, profile);
  measure(graph, graph.pos, profile);
  graphInfo ??= { cords: graph.n, events: graph.events.length, nodes: graph.nodes.length, samples: graph.nodes.filter(x => x.kind === 'sample').length, segments: graph.segments.length, selvedgeTurns: graph.segments.filter(s => s.turn).length, interiorReversals: graph.segments.filter(s => s.reversal && !s.turn).length, links: graph.links.length, triples: graph.triples.length, digons: graph.digons.length, unusedCords: [...graph.paths.values()].filter(p => p.unused).map(p => p.cord.id) };
  const seedPos = align(graph, Float64Array.from(graph.pos), profile);
  const seedMetrics = metrics(graph, seedPos, profile, { steps: 0, converged: false, log: [] }, seedMs);
  const t0 = Date.now(), result = solve(graph, profile);
  align(graph, result.pos, profile);
  const m = metrics(graph, result.pos, profile, result, Date.now() - t0);
  // Test 10: let the pull go from the settled state and report what the fabric does.
  let release = null;
  if (profile.release > 0) {
    const relProfile = { ...profile, pull: 0, ramp: 0, steps: profile.release };
    const t1 = Date.now(), rel = solve(graph, relProfile, result.pos);
    align(graph, rel.pos, relProfile);
    const rm = metrics(graph, rel.pos, relProfile, rel, Date.now() - t1);
    release = { steps: rm.steps, converged: rm.converged, maxGradient: rm.maxGradient, crossingAngle: rm.crossingAngle.interior,
      segments: rm.segments.regular, envelope: rm.envelope, digons: rm.digons, orientation: rm.orientation, crossings: rm.crossings,
      takeUp: rm.takeUp.meanPerCordPerBlock, wide: rm.crossingAngle.wide.length };
    writeFileSync(out(name, 'release-structure.svg'), svg(graph, rel.pos, { structure: true, conflicts: linkCrossings(graph, rel.pos), violated: rm.orientation.violated }));
  }
  runs.push({ run: name || 'default', profile: { pull: +profile.pull.toFixed(4), rmin: profile.rmin, thetaDeg: +(profile.theta * 180 / Math.PI).toFixed(2) }, release, seed: { crossingAngle: seedMetrics.crossingAngle, segments: seedMetrics.segments.regular, envelope: seedMetrics.envelope, walls: { activePairs: seedMetrics.walls.activePairs, byTier: seedMetrics.walls.byTier }, orientation: seedMetrics.orientation, crossings: seedMetrics.crossings, digons: seedMetrics.digons, bend: seedMetrics.bend }, ...m });
  const ev = evaluate(graph, result.pos, profile, { contacts: true });
  writeFileSync(out(name, 'surface.svg'), svg(graph, result.pos));
  writeFileSync(out(name, 'structure.svg'), svg(graph, result.pos, { structure: true, conflicts: linkCrossings(graph, result.pos), violated: m.orientation.violated, contacts: ev.active }));
}
const report = {
  description: 'Packed-model layout experiment (docs/packed/README.md §7, tests 1–4). Seeded from the elastic layout; tension, walls, bend limit and working pull only. Not a photo-validated result.',
  sample: sampleName, blocks: base.blocks, seedElasticMs: seedMs,
  profile: { ...base, thetaDeg: +(base.theta * 180 / Math.PI).toFixed(2), phiMinDeg: +(base.phiMin * 180 / Math.PI).toFixed(1), pull: +base.pull.toFixed(4) },
  graph: graphInfo, runs,
};
writeFileSync(out('', 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${sampleName}: ${graphInfo.cords} cords, ${graphInfo.events} events, ${graphInfo.nodes} nodes (${graphInfo.samples} samples), ${graphInfo.segments} segments, ${graphInfo.selvedgeTurns} selvedge turns, ${graphInfo.digons} digons, ${graphInfo.links} links; elastic seed ${seedMs} ms`);
console.log(`profile: theta ${report.profile.thetaDeg}°, h ${base.h.toFixed(3)}, phiMin ${(base.phiMin * 180 / Math.PI).toFixed(0)}°, rmin ${base.rmin}, kw ${base.kw}, kb ${base.kb}, dt ${base.dt}, gamma ${base.gamma}, steps ${base.steps}, cap ${base.cap}`);
console.log('run          | pull  rmin | ms    steps conv | angle interior (expect)     | segment (expect)     | W/(n d) (expect)  | turns len/bulge | walls pairs maxOverlap | bends>max | orient viol | cross | grad');
for (const r of runs) {
  const w = Object.values(r.walls.byTier).reduce((s, t) => Math.max(s, t.maxOverlap), 0);
  console.log(`${r.run.padEnd(12)} | ${r.profile.pull.toFixed(3)} ${String(r.profile.rmin).padEnd(4)} | ${String(r.ms).padStart(5)} ${String(r.steps).padStart(5)} ${r.converged ? 'yes ' : 'no  '} | ${r.crossingAngle.interior.mean.toFixed(1)} ± ${r.crossingAngle.interior.std.toFixed(1)}° (${r.expected.crossingAngleDeg}°)`.padEnd(93)
    + ` | ${r.segments.regular.mean.toFixed(3)} ± ${r.segments.regular.std.toFixed(3)} (${r.expected.pitch})`.padEnd(24)
    + ` | ${r.envelope.widthPerCord.toFixed(3)} (${r.expected.widthPerCord})`.padEnd(20)
    + ` | ${r.segments.turns ? `${r.segments.turns.mean.toFixed(2)} / ${r.segments.turns.bulge.mean.toFixed(2)}` : '—'}`.padEnd(18)
    + ` | ${String(r.walls.activePairs).padStart(5)} ${w.toFixed(3)}`.padEnd(25)
    + ` | ${String(r.bend.overLimit).padStart(9)} | ${String(r.orientation.violated.length).padStart(11)} | ${String(r.crossings).padStart(5)} | ${r.maxGradient.toFixed(4)}`);
}
for (const r of runs) {
  console.log(`\n[${r.run}] seed (elastic): angle ${r.seed.crossingAngle.mean}±${r.seed.crossingAngle.std}°, segment ${r.seed.segments.mean}±${r.seed.segments.std}, W/(n d) ${r.seed.envelope.widthPerCord}, wall pairs ${r.seed.walls.activePairs} ${JSON.stringify(r.seed.walls.byTier)}`);
  console.log(`[${r.run}] energy ${JSON.stringify(r.energy)}`);
  console.log(`[${r.run}] angles ${JSON.stringify({ all: r.crossingAngle.all, outer: r.crossingAngle.outer, percentiles: r.crossingAngle.percentiles })}`);
  console.log(`[${r.run}] walls ${JSON.stringify(r.walls.byTier)} closest ${JSON.stringify(r.walls.closest.slice(0, 3))}`);
  console.log(`[${r.run}] bend max ${r.bend.maxTurnDeg}° of ${r.bend.psiMaxDeg}°; turns ${JSON.stringify(r.segments.turnDetail.slice(0, 3))}`);
  console.log(`[${r.run}] take-up per cord per block: mean ${r.takeUp.meanPerCordPerBlock} d; wide junctions: ${r.crossingAngle.wide.join(' ') || 'none'}`);
  console.log(`[${r.run}] narrow junctions (<45°): ${r.crossingAngle.narrow.join(' ') || 'none'}`);
  if (r.release) console.log(`[${r.run}] release (pull off): angle ${r.crossingAngle.interior.mean}° -> ${r.release.crossingAngle.mean}°, width ${r.envelope.widthPerCord} -> ${r.release.envelope.widthPerCord}, length ${r.envelope.length} -> ${r.release.envelope.length}, segment ${r.segments.regular.mean} -> ${r.release.segments.mean}, take-up ${r.takeUp.meanPerCordPerBlock} -> ${r.release.takeUp}, wide ${r.crossingAngle.wide.length} -> ${r.release.wide}, conflicts ${r.release.orientation.violated.length + r.release.crossings}`);
  console.log(`[${r.run}] by source row (junctions, mean angle, wide, mean regular segment; packed length ${r.packedLength}):`);
  for (const [row, e] of Object.entries(r.byRow)) console.log(`   row ${row.padStart(3)}: n=${String(e.junctions).padStart(3)} angle ${String(e.angle).padStart(5)}° min ${String(e.angleMin).padStart(5)}° max ${String(e.angleMax).padStart(5)}° wide ${String(e.wide).padStart(2)} seg ${e.segment ?? '—'}`);
  console.log(`[${r.run}] most stretched regular segments: ${r.stretched.map(x => `e${x.events[0]}-e${x.events[1]}(r${x.row}):${x.length}`).join(' ')}`);
  console.log(`[${r.run}] digons packed ${JSON.stringify(r.digons)}`);
  console.log(`[${r.run}] digons seed   ${JSON.stringify(r.seed.digons)}`);
  console.log(`[${r.run}] seed conflicts: orient ${r.seed.orientation.violated.length} ${JSON.stringify(r.seed.orientation.violated)}, crossings ${r.seed.crossings}, wide ${r.seed.crossingAngle.wide.length}`);
  console.log(`[${r.run}] log: ${r.log.map(l => `${l.step}:${l.angle}°/${l.width}/${l.maxGrad}`).join(' ')}`);
}
