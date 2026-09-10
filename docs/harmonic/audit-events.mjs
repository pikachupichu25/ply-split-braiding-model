// Research audit only. No imports from any finished-layout implementation.
// Run from the repository root: node --experimental-strip-types docs/harmonic/audit-events.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePattern } from '../../src/domain/parser.ts';
import { simulatePattern } from '../../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../../src/examples/wayuuFajon20.ts';

const parsed = parsePattern(wayuuFajon20Pattern);
assert.ok(parsed.pattern);
assert.deepEqual(parsed.diagnostics, []);
const simulation = simulatePattern(parsed.pattern, 1);
assert.deepEqual(simulation.diagnostics, []);
const { events } = simulation;
const cords = simulation.snapshots[0].lanes;
const byCord = new Map(cords.map(c => [c.id, []]));
const rows = new Map();
const vertices = new Map();
const edges = [];
const ports = new Map();

for (const cord of cords) {
  for (const kind of ['start', 'end']) {
    const id = `${kind}:${cord.id}`;
    vertices.set(id, { id, kind, cordId: cord.id });
    ports.set(id, []);
  }
}

for (const e of events) {
  assert.equal(e.eventIndex, vertices.size - 2 * cords.length);
  assert.equal(Math.abs(e.toLane - e.fromLane), 1);
  assert.equal(e.lanesBefore[e.fromLane - 1].id, e.splitterId);
  assert.equal(e.lanesBefore[e.toLane - 1].id, e.splitteeId);
  const expected = e.lanesBefore.map(c => c.id);
  [expected[e.fromLane - 1], expected[e.toLane - 1]] =
    [expected[e.toLane - 1], expected[e.fromLane - 1]];
  assert.deepEqual(e.lanesAfter.map(c => c.id), expected);
  if (e.eventIndex) assert.deepEqual(events[e.eventIndex - 1].lanesAfter, e.lanesBefore);
  const id = `e${e.eventIndex}`;
  const left = e.lanesBefore[Math.min(e.fromLane, e.toLane) - 1].id;
  const right = e.lanesBefore[Math.max(e.fromLane, e.toLane) - 1].id;
  vertices.set(id, { id, kind: 'split', eventIndex: e.eventIndex });
  // Clockwise order in a canonical time-down wiring diagram:
  // left input (NW), right input (NE), left output (SE), right output (SW).
  // These are topology ports, NOT fixed directions in the finished fabric.
  ports.set(id, [`${left}:in`, `${right}:in`, `${left}:out`, `${right}:out`]);
  for (const cordId of [e.splitterId, e.splitteeId]) byCord.get(cordId).push(e.eventIndex);
  if (!rows.has(e.rowInstance)) rows.set(e.rowInstance, []);
  rows.get(e.rowInstance).push(e);
}

const darts = new Map();
const rotation = new Map([...vertices.keys()].map(v => [v, new Map()]));
for (const cord of cords) {
  const visits = byCord.get(cord.id);
  const chain = [`start:${cord.id}`, ...visits.map(i => `e${i}`), `end:${cord.id}`];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i], id = `s${edges.length}`;
    const forward = `${id}+`, backward = `${id}-`;
    edges.push({ id, cordId: cord.id, from: a, to: b });
    darts.set(forward, { vertex: a, other: b, twin: backward });
    darts.set(backward, { vertex: b, other: a, twin: forward });
    rotation.get(a).set(a.startsWith('start:') ? 'terminal' : `${cord.id}:out`, forward);
    rotation.get(b).set(b.startsWith('end:') ? 'terminal' : `${cord.id}:in`, backward);
  }
}
const cyclicDarts = new Map([...rotation].map(([v, r]) => [v,
  vertices.get(v).kind === 'split' ? ports.get(v).map(p => r.get(p)) : [...r.values()]
]));
for (const [v, ds] of cyclicDarts) {
  assert.equal(ds.length, vertices.get(v).kind === 'split' ? 4 : 1);
  assert.ok(ds.every(d => darts.has(d)));
}

const visited = new Set(), faces = [];
for (const first of darts.keys()) {
  if (visited.has(first)) continue;
  const boundary = [], faceDarts = [];
  let current = first;
  do {
    assert.ok(!visited.has(current), 'Face walk must return to its starting dart.');
    visited.add(current);
    const dart = darts.get(current);
    boundary.push(dart.vertex);
    faceDarts.push(current);
    const around = cyclicDarts.get(dart.other);
    current = around[(around.indexOf(dart.twin) + 1) % around.length];
  } while (current !== first);
  faces.push({ id: `f${faces.length}`, boundary, darts: faceDarts,
    includesTerminal: boundary.some(v => vertices.get(v).kind !== 'split') });
}

// Independent connectivity check before applying the connected planar Euler rule.
const reachable = new Set([vertices.keys().next().value]);
const queue = [...reachable];
for (let i = 0; i < queue.length; i++) {
  for (const d of cyclicDarts.get(queue[i])) {
    const v = darts.get(d).other;
    if (!reachable.has(v)) { reachable.add(v); queue.push(v); }
  }
}
assert.equal(reachable.size, vertices.size);
assert.equal(vertices.size - edges.length + faces.length, 2);
assert.equal(visited.size, 2 * edges.length);
assert.equal(faces.filter(f => f.includesTerminal).length, 1);
assert.equal(faces.find(f => f.includesTerminal).boundary
  .filter(v => vertices.get(v).kind !== 'split').length, 2 * cords.length);
const boundedFaces = faces.filter(f => !f.includesTerminal);
const histogram = list => Object.fromEntries([...new Set(list)].sort((a,b) => a-b)
  .map(value => [value, list.filter(x => x === value).length]));
const switches = [...byCord].flatMap(([cordId, visits]) => visits.slice(1).flatMap((index, i) => {
  const previous = events[visits[i]], next = events[index];
  const role = e => e.splitterId === cordId ? 'splitter' : 'splittee';
  return role(previous) === role(next) ? [] : [{ cordId, from: previous.eventIndex,
    to: index, fromRole: role(previous), toRole: role(next) }];
}));
const rowSummary = [...rows.values()].map(es => ({
  rowInstance: es[0].rowInstance, sourceRow: es[0].sourceRow, face: es[0].face,
  splitterId: es[0].splitterId, eventRange: [es[0].eventIndex, es.at(-1).eventIndex],
  gapRange: [Math.min(es[0].fromLane, es[0].toLane), Math.min(es.at(-1).fromLane, es.at(-1).toLane)],
  splitteeIds: es.map(e => e.splitteeId),
  splitteeSymbols: es.map(e => e.lanesBefore[e.toLane - 1].colorSymbol).join(''),
}));
const closures = [];
for (let n = 1; n <= 10; n++) {
  const s = simulatePattern(parsed.pattern, n);
  const last = s.snapshots.at(-1).lanes;
  const identity = cords.every((c, i) => c.id === last[i].id);
  const color = cords.every((c, i) => c.colorSymbol === last[i].colorSymbol);
  if (identity || color) closures.push({ writtenBlocks: n, rows: s.totalRows,
    identity, color, sameWorkingFace: s.totalRows % 2 === 0 });
}
function indexByInstruction(s) {
  const occurrences = new Map(), result = new Map();
  for (const e of s.events) {
    if (e.splitIndex === 1) occurrences.set(e.sourceRow, (occurrences.get(e.sourceRow) ?? 0) + 1);
    result.set(`${e.sourceRow}:${occurrences.get(e.sourceRow)}:${e.splitIndex}`, e);
  }
  return result;
}
const originalByInstruction = indexByInstruction(simulation);
const ablations = [[5], [6], [15], [5, 6, 15]].map(removedSourceRows => {
  const s = simulatePattern({ ...parsed.pattern,
    rows: parsed.pattern.rows.filter(r => !removedSourceRows.includes(r.number)) }, 1);
  assert.deepEqual(s.diagnostics, []);
  let changedPairs = 0, changedSplitteeSymbols = 0, changedFaceFlags = 0;
  for (const [key, e] of indexByInstruction(s)) {
    const original = originalByInstruction.get(key);
    assert.ok(original);
    if (e.splitterId !== original.splitterId || e.splitteeId !== original.splitteeId) changedPairs++;
    if (e.lanesBefore[e.toLane - 1].colorSymbol !== original.lanesBefore[original.toLane - 1].colorSymbol) changedSplitteeSymbols++;
    if (e.face !== original.face) changedFaceFlags++;
  }
  return { removedSourceRows, remainingEvents: s.events.length, changedPairs,
    changedSplitteeSymbols, changedFaceFlags,
    changedFinalLanes: s.snapshots.at(-1).lanes.filter((c,i) => c.id !== simulation.snapshots.at(-1).lanes[i].id).length };
});
const summary = {
  cords: cords.length, expandedRows: simulation.totalRows, events: events.length,
  graphVertices: vertices.size, graphEdges: edges.length, graphFaces: faces.length,
  boundedFaces: boundedFaces.length, boundedFaceDegreeHistogram: histogram(boundedFaces.map(f => f.boundary.length)),
  roleSwitches: switches.length, colorCounts: Object.fromEntries(['A','B','C'].map(s => [s, cords.filter(c => c.colorSymbol === s).length])),
  closures, ablations,
};
const report = {
  description: 'Topology audit of current 20-cord Eyes source; no finished-layout inputs. Face walks assume current simulator fixed-frame lane convention.',
  sourcePattern: wayuuFajon20Pattern,
  sourceSha256: createHash('sha256').update(wayuuFajon20Pattern).digest('hex'),
  referenceSha256: createHash('sha256').update(readFileSync(new URL('../../public/expected-layouts/eyes.png', import.meta.url))).digest('hex'),
  summary, rows: rowSummary,
  cords: cords.map(c => ({ ...c, visits: byCord.get(c.id) })),
  segments: edges, faces, roleSwitches: switches,
};
writeFileSync(new URL('event-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
