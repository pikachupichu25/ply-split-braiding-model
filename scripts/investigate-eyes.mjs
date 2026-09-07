// Equation audit with the user-clarified R3: contact only between consecutive
// events in the same column, when they have the same lean.
// Run: node --experimental-strip-types scripts/investigate-eyes.mjs
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { buildFinishedLayout } from '../src/domain/finishedLayout.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';

const parsed = parsePattern(wayuuFajon20Pattern);
if (!parsed.pattern || parsed.diagnostics.length) throw new Error(JSON.stringify(parsed.diagnostics));
const simulation = simulatePattern(parsed.pattern, 4);
if (simulation.diagnostics.length) throw new Error(JSON.stringify(simulation.diagnostics));
const events = simulation.events;
const column = e => Math.min(e.fromLane, e.toLane);
const lean = e => Math.sign(e.toLane - e.fromLane);
const links = [];
const lastRole = new Map(), lastColumn = new Map(), lastLean = new Map();
for (const e of events) {
  const from = e.eventIndex;
  const add = (p, rule, s, d, extra = {}) => links.push({ from: p.eventIndex, to: from, rule, s, d, ...extra });
  const previous = events[from - 1];
  if (previous?.rowInstance === e.rowInstance) add(previous, 'R1', 0, 1);
  const visible = lastRole.get(e.splitteeId);
  if (visible && Math.abs(column(visible) - column(e)) === 1) {
    if (visible.splitteeId === e.splitteeId) add(visible, 'R2', 1, -1, { cord: e.splitteeId });
    else add(visible, 'R4', 0.5, 0, { cord: e.splitteeId, kind: 'return' });
  }
  const departure = lastRole.get(e.splitterId);
  if (departure?.splitteeId === e.splitterId && Math.abs(column(departure) - column(e)) === 1)
    add(departure, 'R4', 0.5, 0, { cord: e.splitterId, kind: 'departure' });
  const key = `${column(e)}:${lean(e)}`;
  if (lastLean.has(key)) {
    const interrupted = lastColumn.get(column(e)) !== lastLean.get(key);
    add(lastLean.get(key), interrupted ? 'sameLeanClearance' : 'R3', 1, 0,
      { relation: interrupted ? '>=' : '=' });
  }
  lastRole.set(e.splitteeId, e); lastRole.set(e.splitterId, e);
  lastColumn.set(column(e), e); lastLean.set(key, e);
}
const eps = 1e-6;
const value = (edge, S, D) => edge.s * S + edge.d * D;
function pathBetween(graph, from, to) {
  const queue = [from], seen = new Set(queue), parents = new Map();
  for (let k = 0; k < queue.length; k++) {
    const u = queue[k];
    if (u === to) {
      const path = []; let v = to;
      while (v !== from) { const edge = parents.get(v); path.unshift(edge); v = edge.from; }
      return path;
    }
    for (const edge of graph[u]) if (!seen.has(edge.to)) {
      seen.add(edge.to); parents.set(edge.to, edge); queue.push(edge.to);
    }
  }
}
function equationAudit(selected, S, D) {
  const graph = events.map(() => []), conflicts = [];
  for (const edge of selected) {
    const path = pathBetween(graph, edge.from, edge.to);
    if (path && Math.abs(path.reduce((sum, p) => sum + value(p, S, D), 0) - value(edge, S, D)) > eps) {
      conflicts.push({ edge, path, implied: path.reduce((sum, p) => sum + value(p, S, D), 0), requested: value(edge, S, D) });
      continue;
    }
    graph[edge.from].push(edge);
    graph[edge.to].push({ ...edge, from: edge.to, to: edge.from, s: -edge.s, d: -edge.d });
  }
  return { graph, conflicts };
}
function audit(theta, tipAngle) {
  const W = 100, D = W * Math.tan(theta * Math.PI / 180), S = D + W / Math.tan(tipAngle * Math.PI / 180);
  const layout = buildFinishedLayout(simulation, { theta, tipAngle, columnWidth: W, padding: 0 });
  const failures = links.filter(e => {
    const residual = layout.cells[e.to].points[0].y - layout.cells[e.from].points[0].y - value(e, S, D);
    return e.relation === '>=' ? residual < -eps : Math.abs(residual) > eps;
  });
  const combos = {};
  for (const rules of [['R2', 'R3'], ['R2', 'R4'], ['R3', 'R4'], ['R2', 'R3', 'R4'], ['R1', 'R2'], ['R1', 'R3']]) {
    const ordered = rules.flatMap(rule => links.filter(e => e.rule === rule));
    const result = equationAudit(ordered, S, D);
    combos[rules.join('+')] = { feasible: result.conflicts.length === 0, rejected: result.conflicts.length, firstConflict: result.conflicts[0], shortestConflict: [...result.conflicts].sort((a,b) => a.path.length-b.path.length)[0] };
  }
  return { theta, tipAngle, S, D, actualFailures: Object.fromEntries(['R1','R2','R3','R4','sameLeanClearance'].map(r => [r, failures.filter(e => e.rule === r).length])),
    r3Gaps: failures.filter(e => e.rule === 'R3').map(e => ({...e, gap:layout.cells[e.to].points[0].y-layout.cells[e.from].points[0].y-S})),
    r4: Object.fromEntries(['return','departure'].map(kind=>[kind,{total:links.filter(e=>e.kind===kind).length, failed:failures.filter(e=>e.kind===kind).length}])),
    combos };
}
const defaults = audit(30, 30);
const detail = process.argv.includes('--detail');
console.log(JSON.stringify({ rows: simulation.totalRows, events: events.length,
  linkCounts: Object.fromEntries(['R1','R2','R3','R4','sameLeanClearance'].map(r=>[r,links.filter(e=>e.rule===r).length])),
  r3Clarification: {
    rule: 'Exact contact only for consecutive events in a column with the same lean.',
    column9Between70And187: events.filter(e => column(e) === 9 && e.eventIndex > 70 && e.eventIndex < 187).map(e => ({eventIndex:e.eventIndex,fromLane:e.fromLane,toLane:e.toLane})),
    contact70To187: links.some(e => e.rule === 'R3' && e.from === 70 && e.to === 187),
  },
  defaults,
  angleGrid: [10,30,60,75].flatMap(theta => [10,30,90].map(tip => { const a=audit(theta,tip); return {theta,tip,actualFailures:a.actualFailures,feasible:Object.fromEntries(Object.entries(a.combos).map(([key,v])=>[key,v.feasible]))}; })),
  ...(detail ? {events,links} : {}) }, null, 2));
