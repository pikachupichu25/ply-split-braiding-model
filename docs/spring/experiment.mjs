// Research experiment only: spring-network layout of the split graph (README.md §4–§5).
// No imports from any finished-layout implementation; nothing in the app changes.
// Run from the repository root:
//   node --experimental-strip-types docs/spring/experiment.mjs [eyes|chevron] [key=value ...]
// Keys: source (a .scot file for a custom sample name), tag (output filename infix), blocks, seeds, iterations, theta (degrees), pitch, dMin, wBend, wCross, wRep, wOrient,
//       learningRate, alphaMin, polishSteps, polishDt, polishDamping, terminalLength, terminalWeight, turnLength, orientMin, tailRepulsion.
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePattern } from '../../src/domain/parser.ts';
import { simulatePattern } from '../../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../../src/examples/wayuuFajon20.ts';
import { chevronPattern } from '../../src/examples/chevron.ts';

// ---------------------------------------------------------------- CLI and profile
const argv = process.argv.slice(2);
const sampleName = argv.find(a => !a.includes('=')) ?? 'eyes';
const args = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const num = (key, fallback) => (key in args ? Number(args[key]) : fallback);
const sources = { eyes: wayuuFajon20Pattern, chevron: chevronPattern };
if (args.source) sources[sampleName] = readFileSync(args.source, 'utf8');   // source=<file.scot> names a custom sample
if (!sources[sampleName]) throw new Error(`Unknown sample ${sampleName}. Use eyes, chevron, or <name> source=<file>.`);

const theta = num('theta', 36) * Math.PI / 180;               // half crossing angle
const pitch = num('pitch', 1 / Math.sin(2 * theta));           // ℓ, in cord diameters
const profile = {
  theta, pitch,
  dMin: num('dMin', 0.9),
  terminalLength: num('terminalLength', 1.5 * pitch),
  turnLength: num('turnLength', 2 * pitch * Math.cos(theta) * 1.2),   // selvedge U-turn: lattice chord 2ℓcosθ plus bulge
  terminalWeight: num('terminalWeight', 0.25),
  wBend: num('wBend', 0.1), wCross: num('wCross', 0.5), wRep: num('wRep', 1), wOrient: num('wOrient', 1),
  orientMin: num('orientMin', 0.05),                           // minimum signed sector area, d²
  tailRepulsion: num('tailRepulsion', 1),                       // 0 excludes start/end terminals from repulsion
  iterations: num('iterations', 500), learningRate: num('learningRate', 0.1), alphaMin: num('alphaMin', 1e-3),
  polishSteps: num('polishSteps', 3000), polishDt: num('polishDt', 0.1), polishDamping: num('polishDamping', 0.1),
  blocks: num('blocks', 1), randomSeeds: num('seeds', 6),
};

// ---------------------------------------------------------------- simulate
const parsed = parsePattern(sources[sampleName]);
if (!parsed.pattern || parsed.diagnostics.length) throw new Error(`Parse failed: ${JSON.stringify(parsed.diagnostics)}`);
const simulation = simulatePattern(parsed.pattern, profile.blocks);
if (simulation.diagnostics.length) throw new Error(`Simulation failed: ${JSON.stringify(simulation.diagnostics)}`);

// ---------------------------------------------------------------- graph (astra construction + midpoints)
function buildGraph(simulation, profile) {
  const cords = simulation.snapshots[0].lanes, events = simulation.events, n = cords.length;
  const nodes = [], edges = [];
  const addNode = node => nodes.push(node) - 1;
  events.forEach(event => addNode({ kind: 'junction', event }));
  const visits = new Map(cords.map(c => [c.id, []]));
  events.forEach((e, i) => { visits.get(e.splitterId).push(i); visits.get(e.splitteeId).push(i); });
  // Lane direction of a cord at an event: the splitter moves from→to, the splittee takes the splitter's old lane.
  const dirAt = (cordId, i) => (events[i].splitterId === cordId ? 1 : -1) * Math.sign(events[i].toLane - events[i].fromLane);
  const gapOf = i => Math.min(events[i].fromLane, events[i].toLane);
  const isOuterGap = gap => gap === 1 || gap === n - 1;
  const reversals = new Set();                              // pair keys of segments where a cord reverses direction
  const paths = new Map();
  for (const cord of cords) {
    const start = addNode({ kind: 'start', cordId: cord.id });
    const end = addNode({ kind: 'end', cordId: cord.id });
    const level = [start, ...visits.get(cord.id), end];     // junction-level chain
    const full = [start];                                    // chain including midpoints
    for (let k = 1; k < level.length; k++) {
      const a = level[k - 1], b = level[k];
      if (nodes[a].kind === 'junction' && nodes[b].kind === 'junction') {
        const reversal = dirAt(cord.id, a) !== dirAt(cord.id, b);
        const turn = reversal && gapOf(a) === gapOf(b) && isOuterGap(gapOf(a));   // selvedge U-turn
        const m = addNode({ kind: 'mid', cordId: cord.id, turn });
        const rest = (turn ? profile.turnLength : profile.pitch) / 2;
        edges.push({ a, b: m, rest, weight: 1, cordId: cord.id, turn });
        edges.push({ a: m, b, rest, weight: 1, cordId: cord.id, turn });
        if (reversal) { reversals.add(`${Math.min(a, m)}:${Math.max(a, m)}`); reversals.add(`${Math.min(m, b)}:${Math.max(m, b)}`); }
        full.push(m, b);
      } else {
        edges.push({ a, b, rest: profile.terminalLength, weight: profile.terminalWeight, cordId: cord.id });
        full.push(b);
      }
    }
    paths.set(cord.id, { cord, level, full, unused: visits.get(cord.id).length === 0 });
  }
  const edgeByPair = new Map(edges.map(e => [`${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`, e]));
  const restOf = (i, j) => edgeByPair.get(`${Math.min(i, j)}:${Math.max(i, j)}`);
  const junctions = events.map((e, i) => {
    const gap = Math.min(e.fromLane, e.toLane);
    const leftId = e.lanesBefore[gap - 1].id, rightId = e.lanesBefore[gap].id;
    const port = cordId => { const p = paths.get(cordId), k = p.full.indexOf(i); return { prev: p.full[k - 1], next: p.full[k + 1] }; };
    const a = port(leftId), b = port(rightId);
    // Cyclic port order a-in, b-in, a-out, b-out (astra). Positive sector areas in the wiring frame.
    return { node: i, event: e, gap, outer: gap === 1 || gap === n - 1, a, b, ports: [a.prev, b.prev, a.next, b.next], splittee: port(e.splitteeId) };
  });
  // Straightness triples over the full chain, skipped across any segment where the cord reverses direction.
  const bends = [];
  const pairKey = (i, j) => `${Math.min(i, j)}:${Math.max(i, j)}`;
  for (const { full } of paths.values()) for (let k = 1; k < full.length - 1; k++) {
    if (reversals.has(pairKey(full[k - 1], full[k])) || reversals.has(pairKey(full[k], full[k + 1]))) continue;
    const e1 = restOf(full[k - 1], full[k]), e2 = restOf(full[k], full[k + 1]);
    bends.push({ i: full[k - 1], j: full[k + 1], rest: e1.rest + e2.rest, weight: profile.wBend * Math.min(e1.weight, e2.weight) });
  }
  // Crossing-angle springs between port neighbours (in-pair and out-pair), law of cosines at 2θ.
  const crosses = [];
  for (const j of junctions) for (const [p, q] of [[j.a.prev, j.b.prev], [j.a.next, j.b.next]]) {
    const e1 = restOf(j.node, p), e2 = restOf(j.node, q);
    const rest = Math.sqrt(e1.rest ** 2 + e2.rest ** 2 - 2 * e1.rest * e2.rest * Math.cos(2 * profile.theta));
    crosses.push({ i: p, j: q, rest, weight: profile.wCross * Math.min(e1.weight, e2.weight) });
  }
  // Repulsion exclusions: adjacent pairs and pairs around one junction (cords overlap at a crossing).
  const excluded = new Set(edgeByPair.keys());
  for (const j of junctions) for (const p of j.ports) for (const q of j.ports) if (p < q) excluded.add(`${p}:${q}`);
  // Level graph for scaffold distances.
  const level = nodes.map((node, i) => node.kind !== 'mid' ? i : -1).filter(i => i >= 0);
  const levelIndex = new Map(level.map((node, k) => [node, k]));
  const levelAdjacency = level.map(() => []);
  for (const { cord, level: chain } of paths.values()) for (let k = 1; k < chain.length; k++) {
    const a = chain[k - 1], b = chain[k];
    const rest = nodes[a].kind === 'junction' && nodes[b].kind === 'junction'
      ? (dirAt(cord.id, a) !== dirAt(cord.id, b) && gapOf(a) === gapOf(b) && isOuterGap(gapOf(a)) ? profile.turnLength : profile.pitch)
      : profile.terminalLength;
    levelAdjacency[levelIndex.get(a)].push([levelIndex.get(b), rest]);
    levelAdjacency[levelIndex.get(b)].push([levelIndex.get(a), rest]);
  }
  const L = level.length, delta = new Float64Array(L * L).fill(Infinity);
  for (let s = 0; s < L; s++) {                             // Dijkstra, O(L²) per source
    const dist = new Float64Array(L).fill(Infinity), done = new Uint8Array(L);
    dist[s] = 0;
    for (let round = 0; round < L; round++) {
      let u = -1;
      for (let v = 0; v < L; v++) if (!done[v] && (u < 0 || dist[v] < dist[u])) u = v;
      if (u < 0 || dist[u] === Infinity) break;
      done[u] = 1;
      for (const [v, w] of levelAdjacency[u]) if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
    delta.set(dist, s * L);
  }
  const fixed = new Uint8Array(nodes.length);
  for (const p of paths.values()) if (p.unused) { fixed[p.level[0]] = 1; fixed[p.level.at(-1)] = 1; }
  const parallel = [];                                       // digons: distinct edges between the same junctions
  const seen = new Map();
  for (const { full } of paths.values()) for (let k = 2; k < full.length; k += 1) {
    if (nodes[full[k]].kind !== 'junction' || nodes[full[k - 2]].kind !== 'junction' || nodes[full[k - 1]].kind !== 'mid') continue;
    const key = `${Math.min(full[k - 2], full[k])}:${Math.max(full[k - 2], full[k])}`;
    if (seen.has(key)) parallel.push({ junctions: [full[k - 2], full[k]], mids: [seen.get(key), full[k - 1]] }); else seen.set(key, full[k - 1]);
  }
  const labels = nodes.map((node, i) => node.kind === 'junction' ? `e${node.event.eventIndex}` : node.kind === 'mid' ? '' : `${node.kind}:${node.cordId}`);
  for (const { cord, full } of paths.values()) for (let k = 1; k < full.length - 1; k++) if (nodes[full[k]].kind === 'mid') labels[full[k]] = `${cord.id}:e${full[k - 1]}-e${full[k + 1]}`;
  const tail = new Uint8Array(nodes.length);
  nodes.forEach((node, i) => { if (node.kind === 'start' || node.kind === 'end') tail[i] = 1; });
  return { cords, events, n, nodes, edges, paths, junctions, bends, crosses, excluded, level, levelIndex, delta, fixed, parallel, tail, labels, reversals };
}

// ---------------------------------------------------------------- energy and gradient
function evaluate(graph, pos, alpha, wOrient, withScaffold = true) {
  const { nodes, edges, bends, crosses, junctions, excluded, level, delta } = graph;
  const grad = new Float64Array(pos.length), energy = { cord: 0, bend: 0, cross: 0, rep: 0, scaffold: 0, orient: 0 };
  const spring = (i, j, rest, w) => {                       // E = ½ w (r − rest)², force w (r − rest)/r
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1], r = Math.hypot(dx, dy);
    if (r < 1e-12) return 0;
    const s = r - rest, f = w * s / r;
    grad[2 * i] += f * dx; grad[2 * i + 1] += f * dy; grad[2 * j] -= f * dx; grad[2 * j + 1] -= f * dy;
    return 0.5 * w * s * s;
  };
  for (const e of edges) energy.cord += spring(e.a, e.b, e.rest, e.weight);
  for (const b of bends) energy.bend += spring(b.i, b.j, b.rest, b.weight);
  for (const c of crosses) energy.cross += spring(c.i, c.j, c.rest, c.weight);
  // Excluded volume via a grid hash.
  const cell = profile.dMin, bins = new Map();
  const key = (cx, cy) => `${cx}:${cy}`;
  for (let i = 0; i < nodes.length; i++) {
    const k = key(Math.floor(pos[2 * i] / cell), Math.floor(pos[2 * i + 1] / cell));
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(i);
  }
  for (let i = 0; i < nodes.length; i++) {
    const cx = Math.floor(pos[2 * i] / cell), cy = Math.floor(pos[2 * i + 1] / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (const j of bins.get(key(cx + ox, cy + oy)) ?? []) {
      if (j <= i || excluded.has(`${i}:${j}`)) continue;
      if (!profile.tailRepulsion && (graph.tail[i] || graph.tail[j])) continue;
      if (Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]) < profile.dMin) energy.rep += spring(i, j, profile.dMin, profile.wRep);
    }
  }
  // Scaffold: every level pair at its graph distance, weight α/δ².
  if (withScaffold && alpha > 0) {
    const L = level.length;
    for (let a = 0; a < L - 1; a++) for (let b = a + 1; b < L; b++) {
      const d = delta[a * L + b];
      if (!Number.isFinite(d) || d <= 0) continue;
      energy.scaffold += spring(level[a], level[b], d, alpha / (d * d));
    }
  }
  // Orientation: signed sector areas at each junction must exceed orientMin.
  if (wOrient > 0) for (const j of junctions) {
    const c = j.node;
    for (let k = 0; k < 4; k++) {
      const p = j.ports[k], q = j.ports[(k + 1) % 4];
      const ux = pos[2 * p] - pos[2 * c], uy = pos[2 * p + 1] - pos[2 * c + 1];
      const vx = pos[2 * q] - pos[2 * c], vy = pos[2 * q + 1] - pos[2 * c + 1];
      const area = ux * vy - uy * vx;
      if (area >= profile.orientMin) continue;
      const g = -wOrient * (profile.orientMin - area);         // dE/dA
      energy.orient += 0.5 * wOrient * (profile.orientMin - area) ** 2;
      grad[2 * p] += g * vy; grad[2 * p + 1] += g * -vx;
      grad[2 * q] += g * -uy; grad[2 * q + 1] += g * ux;
      grad[2 * c] += g * (uy - vy); grad[2 * c + 1] += g * (vx - ux);
    }
  }
  energy.total = Object.values(energy).reduce((s, v) => s + v, 0);
  return { grad, energy };
}

// ---------------------------------------------------------------- seeds
const laneX = lane => (lane - (graphOf.n + 1) / 2) * profile.pitch * Math.sin(profile.theta);
function wiringSeed(graph) {
  const { nodes, events, n, paths } = graph, pos = new Float64Array(nodes.length * 2);
  const rowPitch = 2 * profile.pitch * Math.cos(profile.theta) / Math.max(1, n - 1);
  const finalLanes = events.at(-1)?.lanesAfter ?? graph.cords;
  events.forEach((e, i) => { pos[2 * i] = laneX((e.fromLane + e.toLane) / 2); pos[2 * i + 1] = (i + 0.5) * rowPitch; });
  const yEnd = events.length * rowPitch;
  for (const { cord, level, full } of paths.values()) {
    const start = level[0], end = level.at(-1);
    pos[2 * start] = laneX(graph.cords.findIndex(c => c.id === cord.id) + 1); pos[2 * start + 1] = -profile.terminalLength;
    pos[2 * end] = laneX(finalLanes.findIndex(c => c.id === cord.id) + 1); pos[2 * end + 1] = yEnd + profile.terminalLength;
    for (let k = 1; k < full.length - 1; k++) if (nodes[full[k]].kind === 'mid') {
      pos[2 * full[k]] = (pos[2 * full[k - 1]] + pos[2 * full[k + 1]]) / 2;
      pos[2 * full[k] + 1] = (pos[2 * full[k - 1] + 1] + pos[2 * full[k + 1] + 1]) / 2;
    }
  }
  return pos;
}
function mulberry32(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randomSeed(graph, seed) {
  const random = mulberry32(seed), wiring = wiringSeed(graph), pos = new Float64Array(graph.nodes.length * 2);
  for (let i = 0; i < graph.nodes.length; i++) {
    if (graph.fixed[i]) { pos[2 * i] = wiring[2 * i]; pos[2 * i + 1] = wiring[2 * i + 1]; continue; }
    pos[2 * i] = (random() - 0.5) * 10 * profile.pitch; pos[2 * i + 1] = (random() - 0.5) * 10 * profile.pitch;
  }
  return pos;
}

// ---------------------------------------------------------------- solver (README §5)
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
function solve(graph, seedKind, seedValue) {
  const T = profile.iterations, log = [];
  let eta = profile.learningRate, attempts = 0, pos, mirroredAtHalf = false;
  attempt: while (attempts < 11) {
    attempts++;
    pos = seedKind === 'wiring' ? wiringSeed(graph) : randomSeed(graph, seedValue);
    for (let t = 0; t < T; t++) {
      const alpha = Math.sqrt(1 - t / T) + profile.alphaMin;
      const second = t >= T / 2;
      if (t === Math.floor(T / 2)) {                            // pick the global mirror by majority vote
        const signs = orientationSigns(graph, pos);
        if (signs.negative > signs.positive) { for (let i = 0; i < graph.nodes.length; i++) pos[2 * i] = -pos[2 * i]; mirroredAtHalf = true; }
      }
      const { grad, energy } = evaluate(graph, pos, alpha, second ? profile.wOrient : 0);
      let blowUp = !Number.isFinite(energy.total);
      for (let i = 0; i < graph.nodes.length && !blowUp; i++) {
        if (graph.fixed[i]) continue;
        pos[2 * i] -= eta * grad[2 * i]; pos[2 * i + 1] -= eta * grad[2 * i + 1];
        if (!Number.isFinite(pos[2 * i]) || Math.abs(pos[2 * i]) > 1e5 || Math.abs(pos[2 * i + 1]) > 1e5) blowUp = true;
      }
      if (t % 50 === 0 || t === T - 1) log.push({ t, alpha: +alpha.toFixed(4), energy: Object.fromEntries(Object.entries(energy).map(([k, v]) => [k, +v.toFixed(4)])) });
      if (blowUp) { eta /= 3; log.push({ t, blowUp: true, eta }); continue attempt; }
    }
    break;
  }
  // Physical solve: rescale to the mean rest length, then under-damped kick–drift–kick dynamics on every
  // term except the scaffold. Momentum is what relaxes the global shear mode; gradient descent stalls on it.
  let current = 0, target = 0;
  for (const e of graph.edges) { current += Math.hypot(pos[2 * e.a] - pos[2 * e.b], pos[2 * e.a + 1] - pos[2 * e.b + 1]); target += e.rest; }
  const scale = current > 1e-9 ? target / current : 1;
  for (let i = 0; i < graph.nodes.length; i++) if (!graph.fixed[i]) { pos[2 * i] *= scale; pos[2 * i + 1] *= scale; }
  const velocity = new Float64Array(pos.length), dt = profile.polishDt, gamma = profile.polishDamping;
  for (let step = 0; step < profile.polishSteps; step++) {
    const { grad } = evaluate(graph, pos, 0, profile.wOrient, false);
    for (let i = 0; i < pos.length; i++) {
      if (graph.fixed[i >> 1]) continue;
      velocity[i] = (dt * -grad[i] + 2 * velocity[i]) / (2 + dt * gamma);
      pos[i] += velocity[i] * dt;
    }
  }
  return { pos, eta, attempts, mirroredAtHalf, rescale: scale, log };
}

// ---------------------------------------------------------------- alignment and metrics
function align(graph, pos) {
  const J = graph.events.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < J; i++) { cx += pos[2 * i]; cy += pos[2 * i + 1]; }
  cx /= J; cy /= J;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < J; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);          // principal axis direction
  const rotate = phi => { const c = Math.cos(phi), s = Math.sin(phi); for (let i = 0; i < graph.nodes.length; i++) { const x = pos[2 * i] - cx, y = pos[2 * i + 1] - cy; pos[2 * i] = c * x - s * y; pos[2 * i + 1] = s * x + c * y; } cx = 0; cy = 0; };
  rotate(Math.PI / 2 - angle);                                   // principal axis → vertical
  const meanY = kind => { let s = 0, k = 0; for (const p of graph.paths.values()) { const node = kind === 'start' ? p.level[0] : p.level.at(-1); s += pos[2 * node + 1]; k++; } return s / k; };
  if (meanY('start') > meanY('end')) rotate(Math.PI);           // starts at the top
  const signs = orientationSigns(graph, pos);
  if (signs.negative > signs.positive) for (let i = 0; i < graph.nodes.length; i++) pos[2 * i] = -pos[2 * i];
  return pos;
}
function procrustes(a, b, count) {                              // rigid, reflection allowed; returns RMS in d
  const centre = p => { let x = 0, y = 0; for (let i = 0; i < count; i++) { x += p[2 * i]; y += p[2 * i + 1]; } return [x / count, y / count]; };
  const [ax, ay] = centre(a), [bx, by] = centre(b);
  const fit = reflect => {
    let dot = 0, crossSum = 0;
    for (let i = 0; i < count; i++) {
      const px = (a[2 * i] - ax) * (reflect ? -1 : 1), py = a[2 * i + 1] - ay, qx = b[2 * i] - bx, qy = b[2 * i + 1] - by;
      dot += px * qx + py * qy; crossSum += px * qy - py * qx;
    }
    const phi = Math.atan2(crossSum, dot), c = Math.cos(phi), s = Math.sin(phi);
    let err = 0;
    for (let i = 0; i < count; i++) {
      const px = (a[2 * i] - ax) * (reflect ? -1 : 1), py = a[2 * i + 1] - ay;
      err += (c * px - s * py - (b[2 * i] - bx)) ** 2 + (s * px + c * py - (b[2 * i + 1] - by)) ** 2;
    }
    return Math.sqrt(err / count);
  };
  const plain = fit(false), mirrored = fit(true);
  return { rms: Math.min(plain, mirrored), reflected: mirrored < plain };
}
function segmentCrossings(graph, pos) {
  const segments = graph.edges.map(e => ({ a: e.a, b: e.b }));
  const cell = 2 * profile.pitch, bins = new Map(), conflicts = [];
  const at = i => [pos[2 * i], pos[2 * i + 1]];
  segments.forEach((s, k) => {
    const [x0, y0] = at(s.a), [x1, y1] = at(s.b);
    for (let cx = Math.floor(Math.min(x0, x1) / cell); cx <= Math.floor(Math.max(x0, x1) / cell); cx++)
      for (let cy = Math.floor(Math.min(y0, y1) / cell); cy <= Math.floor(Math.max(y0, y1) / cell); cy++) {
        const key = `${cx}:${cy}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(k);
      }
  });
  const checked = new Set();
  for (const items of bins.values()) for (let u = 0; u < items.length; u++) for (let v = u + 1; v < items.length; v++) {
    const p = segments[items[u]], q = segments[items[v]], key = `${Math.min(items[u], items[v])}:${Math.max(items[u], items[v])}`;
    if (checked.has(key) || p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
    checked.add(key);
    const [ax, ay] = at(p.a), [bx, by] = at(p.b), [cx, cy] = at(q.a), [dx, dy] = at(q.b);
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-12) continue;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, s = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && s > 1e-9 && s < 1 - 1e-9) conflicts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay), edges: [items[u], items[v]] });
  }
  return conflicts;
}
function metrics(graph, pos, solveResult) {
  const { grad, energy } = evaluate(graph, pos, 0, profile.wOrient, false);
  let maxGrad = 0;
  for (let i = 0; i < graph.nodes.length; i++) if (!graph.fixed[i]) maxGrad = Math.max(maxGrad, Math.hypot(grad[2 * i], grad[2 * i + 1]));
  const strains = [];
  for (const { full } of graph.paths.values()) for (let k = 2; k < full.length; k++) {
    if (graph.nodes[full[k - 1]].kind !== 'mid') continue;
    const len = Math.hypot(pos[2 * full[k]] - pos[2 * full[k - 1]], pos[2 * full[k] + 1] - pos[2 * full[k - 1] + 1]) + Math.hypot(pos[2 * full[k - 1]] - pos[2 * full[k - 2]], pos[2 * full[k - 1] + 1] - pos[2 * full[k - 2] + 1]);
    const rest = 2 * graph.edges.find(e => (e.a === full[k - 1] && e.b === full[k]) || (e.b === full[k - 1] && e.a === full[k])).rest;
    strains.push((len - rest) / rest);
  }
  const rms = xs => Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / Math.max(1, xs.length));
  const mean = xs => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  // Active repulsion pairs by node kind, for diagnosing inflation.
  const active = {}, closest = [];
  for (let i = 0; i < graph.nodes.length; i++) for (let j = i + 1; j < graph.nodes.length; j++) {
    if (graph.excluded.has(`${i}:${j}`) || (!profile.tailRepulsion && (graph.tail[i] || graph.tail[j]))) continue;
    const r = Math.hypot(pos[2 * i] - pos[2 * j], pos[2 * i + 1] - pos[2 * j + 1]);
    if (r >= profile.dMin) continue;
    const kind = [graph.nodes[i].kind, graph.nodes[j].kind].map(k => k === 'start' || k === 'end' ? 'tail' : k).sort().join('-');
    active[kind] = (active[kind] ?? 0) + 1;
    closest.push({ a: graph.labels[i], b: graph.labels[j], kind, r: +r.toFixed(3) });
  }
  closest.sort((a, b) => a.r - b.r);
  const angles = graph.junctions.map(j => {
    const c = j.node, ux = pos[2 * j.a.next] - pos[2 * c], uy = pos[2 * j.a.next + 1] - pos[2 * c + 1], vx = pos[2 * j.b.next] - pos[2 * c], vy = pos[2 * j.b.next + 1] - pos[2 * c + 1];
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)))) * 180 / Math.PI;
  });
  const angleMean = mean(angles), angleStd = Math.sqrt(mean(angles.map(a => (a - angleMean) ** 2)));
  const sorted = [...angles].sort((a, b) => a - b), pct = q => +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
  const interior = angles.filter((_, k) => !graph.junctions[k].outer), outer = angles.filter((_, k) => graph.junctions[k].outer);
  const stats = xs => { const m = mean(xs); return { count: xs.length, mean: +m.toFixed(1), std: +Math.sqrt(mean(xs.map(a => (a - m) ** 2))).toFixed(1) }; };
  const xs = [], ys = [];
  for (let i = 0; i < graph.events.length; i++) { xs.push(pos[2 * i]); ys.push(pos[2 * i + 1]); }
  const signs = orientationSigns(graph, pos), crossings = segmentCrossings(graph, pos);
  const digons = graph.parallel.map(p => ({ junctions: p.junctions, lensWidth: +Math.hypot(pos[2 * p.mids[0]] - pos[2 * p.mids[1]], pos[2 * p.mids[0] + 1] - pos[2 * p.mids[1] + 1]).toFixed(3) }));
  return {
    energy: Object.fromEntries(Object.entries(energy).map(([k, v]) => [k, +v.toFixed(4)])),
    maxGradient: +maxGrad.toFixed(4), meanEdgeStrain: +mean(strains).toFixed(4), rmsEdgeStrain: +rms(strains).toFixed(4), maxEdgeStrain: +Math.max(...strains.map(Math.abs)).toFixed(4),
    repulsion: { activePairs: closest.length, byKind: active, closest: closest.slice(0, 8) },
    crossingAngleMeanDeg: +angleMean.toFixed(2), crossingAngleStdDeg: +angleStd.toFixed(2), expectedCrossingAngleDeg: +(2 * profile.theta * 180 / Math.PI).toFixed(2),
    wideJunctions: angles.map((a, k) => ({ event: graph.junctions[k].event.eventIndex, angle: +a.toFixed(1) })).filter(x => x.angle > 100).map(x => `e${x.event}:${x.angle}`),
    crossingAngle: { percentiles: { p10: pct(0.1), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) }, interior: stats(interior), outer: stats(outer) },
    junctionExtent: { width: +(Math.max(...xs) - Math.min(...xs)).toFixed(3), length: +(Math.max(...ys) - Math.min(...ys)).toFixed(3), idealWidth: +((graph.n - 2) * profile.pitch * Math.sin(profile.theta)).toFixed(3) },
    orientation: { positive: signs.positive, negative: signs.negative, violated: signs.violated },
    crossings: crossings.length, digons,
    learningRateUsed: solveResult.eta, attempts: solveResult.attempts, mirroredAtHalf: solveResult.mirroredAtHalf, polishRescale: +solveResult.rescale.toFixed(4),
    unresolved: signs.violated.length > 0 || crossings.length > 0,
  };
}

// ---------------------------------------------------------------- SVG
const palette = { ...{ A: '#655069', B: '#d9f2e8', C: '#1da9d2', D: '#d3a448', E: '#d76b52' }, ...(parsed.pattern.colorAssignments ?? {}) };
const colorOf = cordId => palette[graphOf.cords.find(c => c.id === cordId).colorSymbol] ?? '#a89b84';
function svg(graph, pos, { structure = false, conflicts = [], violated = [] } = {}) {
  const xs = [], ys = [];
  for (let i = 0; i < graph.nodes.length; i++) { xs.push(pos[2 * i]); ys.push(pos[2 * i + 1]); }
  const pad = 2, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad, px = 24;
  const P = i => `${(pos[2 * i] - minX).toFixed(3)},${(pos[2 * i + 1] - minY).toFixed(3)}`;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${(w * px).toFixed(0)}" height="${(h * px).toFixed(0)}"><rect width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="#f5f0e5"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">`;
  for (const { cord, full } of graph.paths.values()) {
    out += `<path d="M${full.map(P).join('L')}" stroke="${colorOf(cord.id)}" stroke-width="${structure ? 0.08 : 1}"${structure ? ' stroke-opacity=".6"' : ''}><title>${cord.id} · ${cord.colorSymbol}</title></path>`;
  }
  if (!structure) for (const j of graph.junctions) {                  // splittee surface at the crossing
    const c = j.node, near = i => { const dx = pos[2 * i] - pos[2 * c], dy = pos[2 * i + 1] - pos[2 * c + 1], len = Math.hypot(dx, dy) || 1, t = Math.min(0.9, 0.36 / len); return `${(pos[2 * c] + dx * t - minX).toFixed(3)},${(pos[2 * c + 1] + dy * t - minY).toFixed(3)}`; };
    const d = `M${near(j.splittee.prev)}L${P(c)}L${near(j.splittee.next)}`;
    out += `<g><title>Split ${j.event.eventIndex} · ${j.event.splitterId} through ${j.event.splitteeId} · row ${j.event.rowInstance}</title><path d="${d}" stroke="#302c34" stroke-width="1.06"/><path d="${d}" stroke="${colorOf(j.event.splitteeId)}" stroke-width="1"/></g>`;
  }
  if (structure) {
    for (const j of graph.junctions) out += `<circle cx="${(pos[2 * j.node] - minX).toFixed(3)}" cy="${(pos[2 * j.node + 1] - minY).toFixed(3)}" r=".09" fill="#161c21"/><text x="${(pos[2 * j.node] - minX).toFixed(3)}" y="${(pos[2 * j.node + 1] - minY - 0.14).toFixed(3)}" font-family="monospace" font-size=".26" text-anchor="middle" fill="#211b22" stroke="none">${j.event.eventIndex}</text>`;
    for (const c of conflicts) out += `<circle cx="${(c.x - minX).toFixed(3)}" cy="${(c.y - minY).toFixed(3)}" r=".3" stroke="#e02d25" stroke-width=".08"/>`;
    for (const id of violated) out += `<rect x="${(pos[2 * id] - minX - 0.3).toFixed(3)}" y="${(pos[2 * id + 1] - minY - 0.3).toFixed(3)}" width=".6" height=".6" stroke="#e08a25" stroke-width=".08"/>`;
    for (const p of graph.parallel) for (const m of p.mids) out += `<circle cx="${(pos[2 * m] - minX).toFixed(3)}" cy="${(pos[2 * m + 1] - minY).toFixed(3)}" r=".14" stroke="#1b7f3b" stroke-width=".06"/>`;
  }
  return `${out}</g></svg>`;
}

// ---------------------------------------------------------------- main
const graphOf = buildGraph(simulation, profile);
const tag = args.tag ? `${args.tag}-` : '';
const out = name => new URL(`${sampleName}-${tag}${name}`, import.meta.url);
const started = Date.now();
const runs = [];
const wiring = solve(graphOf, 'wiring');
align(graphOf, wiring.pos);
const wiringMetrics = metrics(graphOf, wiring.pos, wiring);
runs.push({ seed: 'wiring', ms: Date.now() - started, ...wiringMetrics, log: wiring.log });
for (let s = 1; s <= profile.randomSeeds; s++) {
  const t0 = Date.now(), result = solve(graphOf, 'random', s);
  align(graphOf, result.pos);
  const m = metrics(graphOf, result.pos, result), fit = procrustes(result.pos, wiring.pos, graphOf.events.length);
  runs.push({ seed: s, ms: Date.now() - t0, ...m, procrustesToWiring: { rms: +fit.rms.toFixed(3), reflected: fit.reflected }, log: result.log });
  writeFileSync(out(`random-${s}.svg`), svg(graphOf, result.pos, { structure: true, conflicts: segmentCrossings(graphOf, result.pos), violated: m.orientation.violated }));
}
writeFileSync(out('surface.svg'), svg(graphOf, wiring.pos));
writeFileSync(out('structure.svg'), svg(graphOf, wiring.pos, { structure: true, conflicts: segmentCrossings(graphOf, wiring.pos), violated: wiringMetrics.orientation.violated }));
const report = {
  description: 'Spring-network layout experiment (docs/spring/README.md). Graph from the astra construction plus one midpoint per junction–junction edge. Not a photo-validated result.',
  sample: sampleName, profile: { ...profile, thetaDeg: +(profile.theta * 180 / Math.PI).toFixed(2) },
  graph: { cords: graphOf.n, events: graphOf.events.length, nodes: graphOf.nodes.length, edges: graphOf.edges.length, selvedgeTurns: graphOf.edges.filter(e => e.turn).length / 2, reversalSegments: graphOf.reversals.size / 2, levelNodes: graphOf.level.length, scaffoldPairs: graphOf.level.length * (graphOf.level.length - 1) / 2, bends: graphOf.bends.length, crosses: graphOf.crosses.length, digons: graphOf.parallel.length, unusedCords: [...graphOf.paths.values()].filter(p => p.unused).map(p => p.cord.id) },
  runs,
};
writeFileSync(out('metrics.json'), JSON.stringify(report, null, 2) + '\n');
const row = r => `${String(r.seed).padStart(6)} | ${String(r.ms).padStart(5)} ms | eta ${r.learningRateUsed.toFixed(4)} | strain mean ${r.meanEdgeStrain.toFixed(3)} rms ${r.rmsEdgeStrain.toFixed(3)} | rep pairs ${r.repulsion.activePairs} ${JSON.stringify(r.repulsion.byKind)} | angle ${r.crossingAngleMeanDeg.toFixed(1)}±${r.crossingAngleStdDeg.toFixed(1)}° | width ${r.junctionExtent.width.toFixed(2)}/${r.junctionExtent.idealWidth.toFixed(2)} | orient ${r.orientation.positive}/${r.orientation.negative} viol ${r.orientation.violated.length} | cross ${r.crossings} | grad ${r.maxGradient.toFixed(3)} | ${r.procrustesToWiring ? `procrustes ${r.procrustesToWiring.rms.toFixed(2)}${r.procrustesToWiring.reflected ? ' (mirror)' : ''}` : 'reference'}`;
console.log(`${sampleName}: ${graphOf.n} cords, ${graphOf.events.length} events, ${graphOf.nodes.length} nodes, ${graphOf.edges.length} edges, ${report.graph.scaffoldPairs} scaffold pairs, ${graphOf.parallel.length} digons`);
console.log(`profile: theta ${report.profile.thetaDeg}°, pitch ${profile.pitch.toFixed(3)}, dMin ${profile.dMin}, T ${profile.iterations}, eta ${profile.learningRate}`);
for (const r of runs) console.log(row(r));
console.log('digons (wiring run):', JSON.stringify(wiringMetrics.digons));
console.log('angles (wiring run):', JSON.stringify(wiringMetrics.crossingAngle));
console.log('junctions over 100° (wiring run):', wiringMetrics.wideJunctions.join(' '));
console.log('closest repulsion pairs (wiring run):', JSON.stringify(wiringMetrics.repulsion.closest));
console.log('energy (wiring run):', JSON.stringify(wiringMetrics.energy));
