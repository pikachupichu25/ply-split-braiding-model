// Measures the chronological v2 layout (R1 + R2 + R3 + fallback R4) against the
// placement rules, and against v1, for every sample at several angles.
// Run: node --experimental-strip-types scripts/compare-finished-v2.mjs
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { buildFinishedLayout } from '../src/domain/finishedLayout.ts';
import { buildFinishedLayoutV2 } from '../src/domain/finishedLayoutV2.ts';
import { braid16Pattern } from '../src/examples/braid16.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';

const samplePatterns = [
  { id: 'chevron-8', source: chevronPattern },
  { id: 'color-block-8', source: colorBlock8Pattern },
  { id: 'double-chevron-24', source: doubleChevron24Pattern },
  { id: 'braid-16', source: braid16Pattern },
  { id: 'wayuu-fajon-20', source: wayuuFajon20Pattern },
];

const eps = 1e-6;
const columnOf = e => Math.min(e.fromLane, e.toLane);
const leansRight = c => c.event.toLane > c.event.fromLane;
const edgeAt = (cell, x) => cell.points.filter(p => Math.abs(p.x - x) < 0.001).map(p => p.y);
const topAt = (cell, x) => Math.min(...edgeAt(cell, x));
const bottomAt = (cell, x) => Math.max(...edgeAt(cell, x));

/** Independent geometric audit of the rules, from the polygons alone. */
function audit(cells, cellSide, crossGapDrop) {
  const score = {
    R1: { total: 0, met: 0, worst: 0 },
    R2: { total: 0, met: 0, worst: 0 },
    R4return: { total: 0, met: 0, worst: 0 },
    R4departure: { total: 0, met: 0, worst: 0 },
    R3nonOverlap: { total: 0, met: 0, worst: 0 },
  };
  const check = (key, residual) => {
    score[key].total += 1;
    if (Math.abs(residual) < 1e-4) score[key].met += 1;
    score[key].worst = Math.max(score[key].worst, Math.abs(residual));
  };
  const lastVisible = new Map(), lastSplit = new Map();
  const lastInColumn = new Map(), lastByLean = new Map();

  for (const [index, cell] of cells.entries()) {
    const e = cell.event;
    const previous = cells[index - 1];
    if (previous && previous.event.rowInstance === e.rowInstance
      && previous.event.splitterId === e.splitterId) {
      check('R1', Math.hypot(cell.points[0].x - previous.points[2].x,
        cell.points[0].y - previous.points[2].y));
    }

    const continuing = lastVisible.get(e.splitteeId);
    if (continuing && continuing.event.fromLane === e.toLane
      && Math.abs(continuing.column - cell.column) === 1) {
      const x = (e.toLane - 1) * 100;
      check('R2', Math.max(Math.abs(topAt(cell, x) - topAt(continuing, x)),
        Math.abs(bottomAt(cell, x) - bottomAt(continuing, x))));
    } else {
      const host = lastSplit.get(e.splitteeId);
      if (host && host.event.toLane === e.toLane
        && Math.abs(host.column - cell.column) === 1) {
        const x = (e.toLane - 1) * 100;
        check('R4return', topAt(cell, x) - topAt(host, x) - cellSide / 2);
      }
    }
    const leaving = lastVisible.get(e.splitterId);
    if (leaving && leaving.event.fromLane === e.fromLane
      && Math.abs(leaving.column - cell.column) === 1) {
      const x = (e.fromLane - 1) * 100;
      check('R4departure', topAt(cell, x) - topAt(leaving, x) - cellSide / 2);
    }

    // R3 is a minimum separation from the previous cell of the same lean,
    // including when opposite-lean events intervene. Positive gaps are valid.
    const above = lastInColumn.get(cell.column);
    const key = `${cell.column}:${leansRight(cell)}`;
    const sameLean = lastByLean.get(key);
    if (sameLean) {
      const xs = [...new Set(cell.points.map(p => p.x))];
      const overlap = Math.min(...xs.map(x => topAt(cell, x) - bottomAt(sameLean, x)));
      score.R3nonOverlap.total += 1;
      if (overlap > -1e-4) score.R3nonOverlap.met += 1;
      score.R3nonOverlap.worst = Math.max(score.R3nonOverlap.worst, Math.max(0, -overlap));
    }
    lastByLean.set(key, cell);
    lastInColumn.set(cell.column, cell);
    lastVisible.set(e.splitteeId, cell);
    lastVisible.delete(e.splitterId);
    lastSplit.set(e.splitterId, cell);
    lastSplit.delete(e.splitteeId);
  }
  return score;
}

const rows = [];
for (const sample of samplePatterns) {
  const parsed = parsePattern(sample.source);
  const simulation = simulatePattern(parsed.pattern, 4);
  for (const [theta, tip] of [[30, 30], [30, 60], [10, 10], [60, 90], [75, 10]]) {
    const options = { theta, tipAngle: tip, columnWidth: 100, padding: 0 };
    const v2 = buildFinishedLayoutV2(simulation, options);
    let v1;
    try { v1 = buildFinishedLayout(simulation, options); } catch (error) { v1 = { error: String(error.message) }; }
    const drop = 100 * Math.tan(theta * Math.PI / 180);
    const side = drop + 100 / Math.tan(tip * Math.PI / 180);
    const byRule = {};
    for (const link of v2.links) {
      const key = `${link.rule}${link.kind === 'return' || link.kind === 'departure' ? ':' + link.kind : ''}`;
      byRule[key] ??= { anchored: 0, implied: 0, conflicted: 0, worst: 0 };
      byRule[key][link.status] += 1;
      byRule[key].worst = Math.max(byRule[key].worst, Math.abs(link.residual));
    }
    rows.push({
      sample: sample.id, theta, tip, events: simulation.events.length,
      runs: v2.runs,
      links: byRule,
      geometry: audit(v2.cells, side, drop),
      v1geometry: v1.cells ? audit(v1.cells, side, drop) : v1.error,
      height: { v1: v1.height ? Math.round(v1.height) : v1.error, v2: Math.round(v2.height) },
    });
  }
}
console.log(JSON.stringify(rows, null, 1));
